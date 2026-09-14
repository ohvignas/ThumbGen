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

function convertToolResultOutput(content: AnthropicBlock[] | string) {
  if (typeof content === "string") return { type: "text" as const, value: content };
  return {
    type: "content" as const,
    value: content.map((c) => {
      if (c.type === "text") {
        return { type: "text" as const, text: c.text };
      } else if (c.type === "image") {
        return {
          type: "file" as const,
          data: { type: "data" as const, data: c.source.data },
          mediaType: c.source.media_type,
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

export function migrateAllMessages(): { converted: number; errors: number } {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, conversation_id, role, content_json, created_at FROM messages ORDER BY conversation_id, created_at ASC",
    )
    .all() as Row[];

  let converted = 0;
  let errors = 0;
  const update = db.prepare("UPDATE messages SET content_json = ? WHERE id = ?");

  const tx = db.transaction(() => {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const blocks = JSON.parse(row.content_json) as AnthropicBlock[];

      if (row.role === "user" && isToolResultRow(blocks)) {
        // Data folded into the preceding assistant row — this row becomes a no-op.
        update.run("[]", row.id);
        converted++;
        continue;
      }

      try {
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
  return { converted, errors };
}

if (require.main === module) {
  const result = migrateAllMessages();
  console.log(`Migrated ${result.converted} rows, ${result.errors} errors.`);
}
