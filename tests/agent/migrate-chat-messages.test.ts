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
});
