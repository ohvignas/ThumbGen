import type { ModelMessage, TextPart, FilePart, ToolCallPart, ToolResultPart } from "ai";
import { getDb } from "@/lib/db";

type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: AnthropicBlock[] | string };

type Row = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content_json: string;
  created_at: string;
};

function isToolResultRow(blocks: AnthropicBlock[]): boolean {
  return blocks.length > 0 && blocks.every((b) => b.type === "tool_result");
}

/**
 * True when `parsed` already looks like the TARGET (ModelMessage[]) shape
 * rather than the source (AnthropicBlock[]) shape — i.e. this row has
 * already been migrated. No `AnthropicBlock` variant ever carries a `role`
 * key (they all use `type`), while every `ModelMessage` does, so this is a
 * cheap and reliable discriminator. An empty array trivially counts as
 * "already migrated" (vacuous truth) — that matches the no-op rows this
 * script itself writes for folded-in tool-result carriers.
 *
 * Without this guard, running the migration twice is destructive: an
 * already-migrated row gets parsed, matches no AnthropicBlock.type branch in
 * convertRow, and is silently rewritten to empty content — data loss with no
 * error reported.
 */
function looksAlreadyMigrated(parsed: unknown): boolean {
  return (
    Array.isArray(parsed) &&
    parsed.every((m) => typeof m === "object" && m !== null && "role" in (m as Record<string, unknown>))
  );
}

function convertToolResultOutput(content: AnthropicBlock[] | string) {
  if (typeof content === "string") return { type: "text" as const, value: content };
  return {
    type: "content" as const,
    value: content.map((c) => {
      if (c.type === "text") {
        return { type: "text" as const, text: c.text };
      } else if (c.type === "image") {
        // `data` must be the tagged FileData object ({type:"data", data}),
        // not a bare string — a bare string matches AI SDK's message-level
        // FilePart shorthand (auto-normalized by ai@7.0.99's own
        // standardizePrompt) but NOT the separate schema a tool result's
        // `output.value[]` items are validated against, where `type:"file"`
        // strictly requires `data` to already be tagged. See
        // src/lib/agent/v2/tool-adapter.ts's toModelOutput for the live
        // trace of this exact bug (Task 14's Bug 2) and
        // task-14-report.md's continuation for the full write-up.
        return {
          type: "file" as const,
          mediaType: c.source.media_type,
          data: { type: "data" as const, data: c.source.data },
        };
      } else {
        return { type: "text" as const, text: "" };
      }
    }),
  };
}

/**
 * Converts one row's Anthropic-shaped blocks into ModelMessage(s). For an
 * assistant row, `toolResultBlocks` — the IMMEDIATELY FOLLOWING row's blocks,
 * when that row is a tool-result carrier — recovers Bug B (see file header).
 * Returns [] for a tool-result-only row: its data is folded into the
 * PRECEDING assistant row's output by the caller's lookahead, so the row
 * itself becomes a no-op rather than being converted standalone.
 */
export function convertRow(row: Row, toolResultBlocks: AnthropicBlock[] | undefined): ModelMessage[] {
  const blocks = JSON.parse(row.content_json) as AnthropicBlock[];

  if (row.role === "assistant") {
    const content: (TextPart | ToolCallPart)[] = [];
    for (const b of blocks) {
      if (b.type === "text") content.push({ type: "text", text: b.text });
      else if (b.type === "tool_use") {
        content.push({ type: "tool-call", toolCallId: b.id, toolName: b.name, input: b.input });
      }
    }
    const messages: ModelMessage[] = [{ role: "assistant", content } as ModelMessage];

    if (toolResultBlocks) {
      const toolContent: ToolResultPart[] = toolResultBlocks
        .filter((b): b is AnthropicBlock & { type: "tool_result" } => b.type === "tool_result")
        .map((b) => {
          const matchingCall = blocks.find(
            (x): x is AnthropicBlock & { type: "tool_use" } => x.type === "tool_use" && x.id === b.tool_use_id,
          );
          return {
            type: "tool-result",
            toolCallId: b.tool_use_id,
            toolName: matchingCall?.name ?? "",
            output: convertToolResultOutput(b.content),
          };
        });
      if (toolContent.length) messages.push({ role: "tool", content: toolContent } as ModelMessage);
    }
    return messages;
  }

  if (isToolResultRow(blocks)) return [];

  // Plain user input row (text/image — first turn or a follow-up message).
  const content: (TextPart | FilePart)[] = [];
  for (const b of blocks) {
    if (b.type === "text") content.push({ type: "text", text: b.text });
    else if (b.type === "image") content.push({ type: "file", mediaType: b.source.media_type, data: b.source.data });
  }
  return [{ role: "user", content } as ModelMessage];
}

export function migrateAllMessages(): { converted: number; errors: number; skipped: number } {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, conversation_id, role, content_json, created_at FROM messages ORDER BY conversation_id, created_at ASC",
    )
    .all() as Row[];

  let converted = 0;
  let errors = 0;
  let skipped = 0;
  const update = db.prepare("UPDATE messages SET content_json = ? WHERE id = ?");

  const tx = db.transaction(() => {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Everything for this row — including the initial JSON.parse — lives
      // inside this try/catch. better-sqlite3's db.transaction() wraps the
      // whole callback in BEGIN/COMMIT and rolls back the ENTIRE transaction
      // on any uncaught throw (see node_modules/better-sqlite3/lib/methods/
      // transaction.js: the wrapper's own try/catch calls ROLLBACK then
      // re-throws). Previously the first JSON.parse — used for the
      // isToolResultRow check — sat OUTSIDE this try/catch, so one row with
      // malformed JSON threw out of the whole transaction, undoing every
      // row already converted in this run, and that row was never counted
      // in `errors`. Catching here, before anything can escape to the
      // transaction boundary, fixes both.
      try {
        const parsed: unknown = JSON.parse(row.content_json);

        // Idempotency guard: skip a row that's already ModelMessage-shaped
        // instead of reprocessing it (see looksAlreadyMigrated's doc comment
        // for why re-running this unguarded silently empties already-
        // migrated rows).
        if (looksAlreadyMigrated(parsed)) {
          skipped++;
          continue;
        }

        const blocks = parsed as AnthropicBlock[];

        if (row.role === "user" && isToolResultRow(blocks)) {
          // Data folded into the preceding assistant row — this row becomes a no-op.
          update.run("[]", row.id);
          converted++;
          continue;
        }

        const next = rows[i + 1];
        const nextIsToolResult =
          next &&
          next.conversation_id === row.conversation_id &&
          next.role === "user" &&
          isToolResultRow(JSON.parse(next.content_json) as AnthropicBlock[]);
        const toolResultBlocks = nextIsToolResult
          ? (JSON.parse(next.content_json) as AnthropicBlock[])
          : undefined;
        const messages = convertRow(row, toolResultBlocks);
        update.run(JSON.stringify(messages), row.id);
        converted++;
      } catch (e) {
        console.error(`Failed to convert message ${row.id}:`, e);
        errors++;
      }
    }
  });
  tx();
  return { converted, errors, skipped };
}

if (require.main === module) {
  const result = migrateAllMessages();
  console.log(
    `Migrated ${result.converted} rows, ${result.skipped} already-migrated rows skipped, ${result.errors} errors.`,
  );
}
