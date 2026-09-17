import { describe, it, expect } from "vitest";
import { parseStoredTimestamp, rowsToUIMessages, type StoredMessageRow } from "@/components/panels/chat/history-to-ui-messages";

const json = (messages: unknown[]) => JSON.stringify(messages);
const userRow = (id: string, text: string, created_at?: string): StoredMessageRow => ({
  id,
  role: "user",
  content_json: json([{ role: "user", content: [{ type: "text", text }] }]),
  interrupted: 0,
  ...(created_at ? { created_at } : {}),
});

describe("parseStoredTimestamp", () => {
  it("reads SQLite datetime('now') values as UTC", () => {
    expect(parseStoredTimestamp("2026-09-16 10:00:12")).toBe(Date.UTC(2026, 8, 16, 10, 0, 12));
  });

  it("reads ISO strings", () => {
    expect(parseStoredTimestamp("2026-09-16T10:00:12.500Z")).toBe(Date.UTC(2026, 8, 16, 10, 0, 12, 500));
  });

  it("returns null when missing or invalid", () => {
    expect(parseStoredTimestamp(undefined)).toBeNull();
    expect(parseStoredTimestamp("")).toBeNull();
    expect(parseStoredTimestamp("hier")).toBeNull();
  });
});

describe("rowsToUIMessages turn metadata", () => {
  it("measures an assistant turn from the row before it", () => {
    const messages = rowsToUIMessages([
      userRow("u1", "Salut", "2026-09-16 10:00:00"),
      {
        id: "a1",
        role: "assistant",
        content_json: json([{ role: "assistant", content: [{ type: "text", text: "Bonjour" }] }]),
        interrupted: 0,
        created_at: "2026-09-16 10:00:12",
      },
    ]);
    expect(messages[0].metadata).toBeUndefined();
    expect(messages[1].metadata).toEqual({ durationMs: 12_000 });
  });

  it("measures a resumed turn from the client request's result row", () => {
    const messages = rowsToUIMessages([
      userRow("u1", "Mets mon logo", "2026-09-16 10:00:00"),
      {
        id: "a1",
        role: "assistant",
        content_json: json([
          {
            role: "assistant",
            content: [
              { type: "text", text: "Il me faut ton logo." },
              { type: "tool-call", toolCallId: "c1", toolName: "request_user_image", input: { reason: "logo" } },
            ],
          },
        ]),
        interrupted: 0,
        created_at: "2026-09-16 10:00:05",
      },
      {
        id: "t1",
        role: "assistant",
        content_json: json([
          { role: "tool", content: [{ type: "tool-result", toolCallId: "c1", toolName: "request_user_image", output: { type: "json", value: { source_ids: ["stored:lg_1"] } } }] },
        ]),
        interrupted: 0,
        created_at: "2026-09-16 10:01:00",
      },
      {
        id: "a2",
        role: "assistant",
        content_json: json([{ role: "assistant", content: [{ type: "text", text: "Merci !" }] }]),
        interrupted: 0,
        created_at: "2026-09-16 10:01:07",
      },
    ]);
    expect(messages.map((m) => m.id)).toEqual(["u1", "a1", "a2"]);
    expect(messages[1].metadata).toEqual({ durationMs: 5_000 });
    expect(messages[1].parts[1]).toMatchObject({ state: "output-available" });
    expect(messages[2].metadata).toEqual({ durationMs: 7_000 });
  });

  it("keeps an interrupted turn without content as an empty assistant message", () => {
    const messages = rowsToUIMessages([
      userRow("u1", "Salut", "2026-09-16 10:00:00"),
      { id: "a1", role: "assistant", content_json: "[]", interrupted: 1, created_at: "2026-09-16 10:00:03" },
    ]);
    expect(messages[1]).toEqual({ id: "a1", role: "assistant", parts: [], metadata: { durationMs: 3_000, interrupted: true } });
  });

  it("flags an interrupted turn that has partial content", () => {
    const messages = rowsToUIMessages([
      userRow("u1", "Salut"),
      {
        id: "a1",
        role: "assistant",
        content_json: json([{ role: "assistant", content: [{ type: "text", text: "Je commence" }] }]),
        interrupted: 1,
      },
    ]);
    expect(messages[1].metadata).toEqual({ interrupted: true });
  });

  it("adds nothing when rows carry no timestamps", () => {
    const messages = rowsToUIMessages([
      { id: "u1", role: "user", content_json: json([{ role: "user", content: [{ type: "text", text: "Salut" }] }]) },
      { id: "a1", role: "assistant", content_json: json([{ role: "assistant", content: [{ type: "text", text: "Bonjour" }] }]) },
    ]);
    expect(messages.every((m) => m.metadata === undefined)).toBe(true);
  });
});
