import { describe, it, expect } from "vitest";
import { v4 as uuid } from "uuid";
import { createConversation, appendMessage, listMessages } from "@/lib/agent/conversation/store";
import { migrateAllMessages } from "../../scripts/migrate-chat-messages-to-uimessage";

describe("migrateAllMessages", () => {
  it("converts a plain user→assistant turn with no tools", () => {
    const conv = createConversation(`test-migrate-${uuid()}`);
    appendMessage({
      conversation_id: conv.id, role: "user",
      content_json: JSON.stringify([{ type: "text", text: "Salut" }]),
      interrupted: 0, total_input_tokens: 0, total_output_tokens: 0, cost_estimate: 0,
    });
    appendMessage({
      conversation_id: conv.id, role: "assistant",
      content_json: JSON.stringify([{ type: "text", text: "Bonjour !" }]),
      interrupted: 0, total_input_tokens: 10, total_output_tokens: 5, cost_estimate: 0.001,
    });

    const result = migrateAllMessages();
    expect(result.errors).toBe(0);

    const rows = listMessages(conv.id);
    expect(JSON.parse(rows[0].content_json)).toEqual([
      { role: "user", content: [{ type: "text", text: "Salut" }] },
    ]);
    expect(JSON.parse(rows[1].content_json)).toEqual([
      { role: "assistant", content: [{ type: "text", text: "Bonjour !" }] },
    ]);
  });

  it("recovers Bug B: reunites a tool_use with its tool_result (image included)", () => {
    const conv = createConversation(`test-migrate-${uuid()}`);
    appendMessage({
      conversation_id: conv.id, role: "user",
      content_json: JSON.stringify([{ type: "text", text: "Cherche des miniatures" }]),
      interrupted: 0, total_input_tokens: 0, total_output_tokens: 0, cost_estimate: 0,
    });
    appendMessage({
      conversation_id: conv.id, role: "assistant",
      content_json: JSON.stringify([
        { type: "text", text: "Je cherche." },
        { type: "tool_use", id: "call_1", name: "search_youtube", input: { query: "test" } },
      ]),
      interrupted: 0, total_input_tokens: 0, total_output_tokens: 0, cost_estimate: 0,
    });
    appendMessage({
      conversation_id: conv.id, role: "user",
      content_json: JSON.stringify([
        {
          type: "tool_result",
          tool_use_id: "call_1",
          content: [
            { type: "text", text: "[1] Titre" },
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAA=" } },
          ],
        },
      ]),
      interrupted: 0, total_input_tokens: 0, total_output_tokens: 0, cost_estimate: 0,
    });

    const result = migrateAllMessages();
    expect(result.errors).toBe(0);

    const rows = listMessages(conv.id);
    expect(rows).toHaveLength(3);

    const assistantMsgs = JSON.parse(rows[1].content_json) as Array<{ role: string; content: unknown[] }>;
    expect(assistantMsgs).toHaveLength(2); // [assistant text+tool-call, tool result]
    expect(assistantMsgs[0].role).toBe("assistant");
    expect(assistantMsgs[1].role).toBe("tool");
    const toolResultPart = assistantMsgs[1].content[0] as {
      toolCallId: string;
      output: { type: string; value: unknown[] };
    };
    expect(toolResultPart.toolCallId).toBe("call_1");
    expect(toolResultPart.output.value).toContainEqual({
      type: "file", mediaType: "image/jpeg", data: "AAA=",
    });

    // The now-redundant tool_result-only row becomes a no-op, not deleted
    // (preserves row IDs/count for anything that might reference them).
    expect(JSON.parse(rows[2].content_json)).toEqual([]);
  });

  it("does not roll back the whole transaction when one row has malformed JSON (finding #12)", () => {
    // Baseline: any rows from earlier tests in this file are already
    // migrated by now, so a fresh run should report zero errors. This also
    // doubles as an idempotency check that doesn't depend on run order.
    const baseline = migrateAllMessages();
    expect(baseline.errors).toBe(0);

    const conv = createConversation(`test-migrate-malformed-${uuid()}`);
    appendMessage({
      conversation_id: conv.id, role: "user",
      content_json: JSON.stringify([{ type: "text", text: "Good row before" }]),
      interrupted: 0, total_input_tokens: 0, total_output_tokens: 0, cost_estimate: 0,
    });
    const badRow = appendMessage({
      conversation_id: conv.id, role: "assistant",
      content_json: "{not valid json at all",
      interrupted: 0, total_input_tokens: 0, total_output_tokens: 0, cost_estimate: 0,
    });
    appendMessage({
      conversation_id: conv.id, role: "user",
      content_json: JSON.stringify([{ type: "text", text: "Good row after" }]),
      interrupted: 0, total_input_tokens: 0, total_output_tokens: 0, cost_estimate: 0,
    });

    const result = migrateAllMessages();

    // Exactly the one malformed row is counted as an error — it does NOT
    // take the other two valid rows in this batch down with it, and it does
    // NOT silently vanish from the error count either (the old bug: the
    // JSON.parse that threw sat outside the try/catch, which rolled back
    // the whole db.transaction() and never incremented `errors` for it).
    expect(result.errors).toBe(1);

    const rows = listMessages(conv.id);
    expect(rows).toHaveLength(3);
    expect(JSON.parse(rows[0].content_json)).toEqual([
      { role: "user", content: [{ type: "text", text: "Good row before" }] },
    ]);
    // The malformed row is left exactly as it was — not rolled back to some
    // earlier state (there is none), not partially written.
    const badAfter = rows.find((r) => r.id === badRow.id)!;
    expect(badAfter.content_json).toBe("{not valid json at all");
    expect(JSON.parse(rows[2].content_json)).toEqual([
      { role: "user", content: [{ type: "text", text: "Good row after" }] },
    ]);
  });

  it("running migrateAllMessages twice does not corrupt already-migrated rows (finding #3)", () => {
    // Baseline error count: the DB may already carry the permanently-broken
    // row from the "malformed JSON" test above (by design, that row is left
    // unfixed forever, so it re-fails on every subsequent run) — don't
    // assume a global 0, compare against this run's own baseline instead.
    const baselineErrors = migrateAllMessages().errors;

    const conv = createConversation(`test-migrate-idempotent-${uuid()}`);
    appendMessage({
      conversation_id: conv.id, role: "user",
      content_json: JSON.stringify([{ type: "text", text: "Salut" }]),
      interrupted: 0, total_input_tokens: 0, total_output_tokens: 0, cost_estimate: 0,
    });
    appendMessage({
      conversation_id: conv.id, role: "assistant",
      content_json: JSON.stringify([{ type: "text", text: "Bonjour !" }]),
      interrupted: 0, total_input_tokens: 0, total_output_tokens: 0, cost_estimate: 0,
    });

    const first = migrateAllMessages();
    expect(first.errors).toBe(baselineErrors);

    const afterFirst = listMessages(conv.id).map((r) => r.content_json);
    expect(JSON.parse(afterFirst[0])).toEqual([
      { role: "user", content: [{ type: "text", text: "Salut" }] },
    ]);
    expect(JSON.parse(afterFirst[1])).toEqual([
      { role: "assistant", content: [{ type: "text", text: "Bonjour !" }] },
    ]);

    const second = migrateAllMessages();
    expect(second.errors).toBe(baselineErrors);
    // The second run must skip these two rows rather than reprocess them —
    // without the idempotency guard, each row gets parsed as
    // AnthropicBlock[], matches no `.type` branch (since it's actually
    // ModelMessage-shaped), and is silently rewritten to empty content.
    expect(second.skipped).toBeGreaterThanOrEqual(2);

    const afterSecond = listMessages(conv.id).map((r) => r.content_json);
    // Byte-for-byte identical to the first pass — not emptied, not altered.
    expect(afterSecond).toEqual(afterFirst);
  });
});
