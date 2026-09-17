import type { UIMessage } from "ai";
import type { TurnMetadata } from "./turn-model";

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

/** One row of GET /api/agent/conversations/:id/messages (a `messages` table row). */
export type StoredMessageRow = {
  id: string;
  role: "user" | "assistant";
  content_json: string;
  /** SQLite `datetime('now')`: "YYYY-MM-DD HH:MM:SS", UTC. */
  created_at?: string;
  /** 1 when the turn was stopped or failed before it finished. */
  interrupted?: number;
};

/** A SQLite `datetime('now')` value (UTC, no zone) or an ISO string, in ms; null when absent or invalid. */
export function parseStoredTimestamp(value: string | undefined): number | null {
  if (!value) return null;
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Metadata of the assistant message started by `rows[rowIndex]`. A turn's row
 * is written when the turn ends, and the row before it (the user's message, or
 * the client-tool result that resumed the turn) when it started — so their
 * `created_at` gap is the turn's duration, to the second. Nothing new is stored.
 */
function assistantMetadata(rows: StoredMessageRow[], rowIndex: number): TurnMetadata | undefined {
  const row = rows[rowIndex];
  const metadata: TurnMetadata = {};
  const endedAt = parseStoredTimestamp(row.created_at);
  const startedAt = rowIndex > 0 ? parseStoredTimestamp(rows[rowIndex - 1].created_at) : null;
  if (endedAt !== null && startedAt !== null && endedAt >= startedAt) metadata.durationMs = endedAt - startedAt;
  if (row.interrupted === 1) metadata.interrupted = true;
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

/**
 * Converts persisted ModelMessage[] rows (Plan 1's storage format) into
 * UIMessage[] for useChat's initial state. ai@7.0.99 has no built-in
 * reverse of convertToModelMessages (confirmed absent during Plan 1's
 * final review) — this is a deliberate, hand-rolled inverse limited to
 * exactly the part shapes this app's tools ever produce (text, file,
 * tool-call/tool-result pairs, reasoning).
 */
export function rowsToUIMessages(rows: StoredMessageRow[]): UIMessage[] {
  const out: UIMessage[] = [];
  // Tool results arrive in a SEPARATE role:"tool" ModelMessage from the
  // assistant row that made the call (see Plan 1's persist-turn.ts) — merge
  // each tool-result back onto the matching tool-call by toolCallId so a
  // UIMessage's tool part carries both input AND output together, as
  // ToolCallCard's dispatcher (Task 9) expects from a single part.
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const persisted = JSON.parse(row.content_json) as PersistedModelMessage[];

    // A turn that failed or was stopped before producing anything is stored
    // as an empty, interrupted assistant row: keep it as an empty message so
    // the chat can show « Tour interrompu » where the answer should be.
    if (persisted.length === 0 && row.role === "assistant" && row.interrupted === 1) {
      out.push({ id: row.id, role: "assistant", parts: [], metadata: assistantMetadata(rows, rowIndex) });
      continue;
    }

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

      // A row's content_json can hold MULTIPLE sequential non-tool entries —
      // not just one — because persist-turn.ts's onEnd aggregates
      // responseMessages across every step of a turn, and route-handler.ts
      // runs up to 25 steps (stopWhen: isStepCount(25)). A 2-step turn (call
      // tool A, get result, then call tool B or answer based on it) persists
      // as e.g. [assistant(callA), tool(resultA), assistant(callB-or-text)]
      // — all in ONE row. Pushing a new UIMessage per entry would give two
      // objects both carrying `id: row.id`, a duplicate React key in
      // MessageList (via uiMessageToLegacyDisplayMessage's `key={m.id}`) and
      // the same logical turn rendering as multiple bubbles on reload instead
      // of the single bubble it is live. So: only start a new UIMessage for
      // the FIRST non-tool entry of a row; every subsequent one appends its
      // parts onto that same message instead.
      const prevForRow = out.at(-1);
      if (prevForRow && prevForRow.id === row.id) {
        prevForRow.parts.push(...parts);
      } else {
        const metadata = row.role === "assistant" ? assistantMetadata(rows, rowIndex) : undefined;
        out.push({ id: row.id, role: msg.role as "user" | "assistant", parts, ...(metadata ? { metadata } : {}) });
      }
    }
  }
  return out;
}
