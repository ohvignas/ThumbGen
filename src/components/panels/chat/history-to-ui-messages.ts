import type { UIMessage } from "ai";

type ModelMessageContent =
  | { type: "text"; text: string }
  | { type: "file"; mediaType: string; data: string }
  | { type: "reasoning"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool-result"; toolCallId: string; toolName: string; output: unknown };

type PersistedModelMessage = {
  role: "user" | "assistant" | "tool";
  content: ModelMessageContent[];
};

type Row = { id: string; role: "user" | "assistant"; content_json: string };

/**
 * Converts persisted ModelMessage[] rows (Plan 1's storage format) into
 * UIMessage[] for useChat's initial state. ai@7.0.99 has no built-in
 * reverse of convertToModelMessages (confirmed absent during Plan 1's
 * final review) — this is a deliberate, hand-rolled inverse limited to
 * exactly the part shapes this app's tools ever produce (text, file,
 * tool-call/tool-result pairs, reasoning).
 */
export function rowsToUIMessages(rows: Row[]): UIMessage[] {
  const out: UIMessage[] = [];
  // Tool results arrive in a SEPARATE role:"tool" ModelMessage from the
  // assistant row that made the call (see Plan 1's persist-turn.ts) — merge
  // each tool-result back onto the matching tool-call by toolCallId so a
  // UIMessage's tool part carries both input AND output together, as
  // ToolCallCard's dispatcher (Task 9) expects from a single part.
  for (const row of rows) {
    const persisted = JSON.parse(row.content_json) as PersistedModelMessage[];
    for (const msg of persisted) {
      if (msg.role === "tool") {
        // Fold onto the immediately-preceding UIMessage's matching tool part.
        const prev = out.at(-1);
        if (!prev) continue;
        for (const c of msg.content) {
          if (c.type !== "tool-result") continue;
          const part = prev.parts.find(
            (p): p is Extract<UIMessage["parts"][number], { type: `tool-${string}` }> =>
              p.type.startsWith("tool-") && "toolCallId" in p && p.toolCallId === c.toolCallId,
          );
          if (part && "state" in part) {
            (part as { state: string }).state = "output-available";
            (part as { output?: unknown }).output = c.output;
          }
        }
        continue;
      }

      const parts: UIMessage["parts"] = [];
      for (const c of msg.content) {
        if (c.type === "text") parts.push({ type: "text", text: c.text });
        else if (c.type === "file")
          // Persisted `data` is always a bare base64 string (route-handler.ts's
          // resolveImageSource() / the migration script's AnthropicBlock ->
          // FilePart conversion both write it that way — never a full data: URI
          // or hosted URL) — but FileUIPart.url must be an actual URL (hosted or
          // Data URL) for <img src> / download links to work, so rebuild the
          // data: URI here rather than passing the bare base64 through as-is.
          parts.push({ type: "file", mediaType: c.mediaType, url: `data:${c.mediaType};base64,${c.data}` });
        else if (c.type === "reasoning") parts.push({ type: "reasoning", text: c.text });
        else if (c.type === "tool-call") {
          parts.push({
            type: `tool-${c.toolName}`,
            toolCallId: c.toolCallId,
            state: "input-available",
            input: c.input,
          } as UIMessage["parts"][number]);
        }
      }
      out.push({ id: row.id, role: msg.role as "user" | "assistant", parts });
    }
  }
  return out;
}
