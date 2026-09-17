import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

// A tiny in-memory conversation: appendMessage really adds a row that the
// following listMessages call returns, like the SQLite store.
type Row = { id: string; conversation_id: string; role: "user" | "assistant"; content_json: string; interrupted: number };
let rows: Row[] = [];
const appendMessageMock = vi.fn((input: Omit<Row, "id">) => {
  const row = { ...input, id: `r${rows.length}` } as Row;
  rows.push(row);
  return row;
});
vi.mock("@/lib/agent/conversation/store", () => ({
  appendMessage: (input: Omit<Row, "id">) => appendMessageMock(input),
  listMessages: () => rows.map((row) => ({ ...row })),
  getConversation: (id: string) => ({ id, project_id: "p1", title: "t", created_at: "", updated_at: "" }),
}));

vi.mock("@/lib/agent/v2/persist-turn", () => ({ persistAssistantTurn: vi.fn() }));
vi.mock("@/lib/agent/conversation/auto-title", () => ({ generateAndPersistTitle: vi.fn(async () => {}) }));

const streamTextMock = vi.fn();
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, streamText: (opts: unknown) => streamTextMock(opts) };
});

import { setSetting } from "@/lib/settings";
import { findRetriedUserRowIndex } from "@/lib/agent/v2/route-handler";
import { resetRunRegistry } from "@/lib/agent/v2/run-registry";
import { chatRequest, fakeStreamResult, waitForRunEnd } from "./helpers/chat-route";

const userRow = (text: string, extra: unknown[] = []): Row => ({
  id: "",
  conversation_id: "c1",
  role: "user",
  content_json: JSON.stringify([{ role: "user", content: [{ type: "text", text }, ...extra] }]),
  interrupted: 0,
});
const assistantRow = (content: unknown[], interrupted = 0): Row => ({
  id: "",
  conversation_id: "c1",
  role: "assistant",
  content_json: JSON.stringify(content),
  interrupted,
});
const answer = (text: string) => [{ role: "assistant", content: [{ type: "text", text }] }];

async function send(text: string) {
  const { postV2 } = await import("@/lib/agent/v2/route-handler");
  const res = await postV2(
    chatRequest({
      conversation_id: "c1",
      project_id: "p1",
      messages: [{ role: "user", parts: [{ type: "text", text }] }],
      canvas_snapshot: { nodes: [], edges: [] },
    }),
  );
  // Each send's turn ends before the next one (one turn per conversation).
  await waitForRunEnd("c1");
  return res;
}

function modelMessages(): Array<{ role: string; content: Array<{ type: string; text?: string }> }> {
  return (streamTextMock.mock.calls.at(-1)?.[0] as { messages: never }).messages;
}

const userTexts = () =>
  modelMessages()
    .filter((m) => m.role === "user")
    .map((m) => m.content.map((c) => c.text ?? `[${c.type}]`).join(""));

const storedUserRows = () => rows.filter((row) => row.role === "user");

describe("postV2 — « Réessayer » never duplicates the user message (I2)", () => {
  beforeEach(() => {
    resetRunRegistry();
    rows = [];
    appendMessageMock.mockClear();
    streamTextMock.mockReset();
    streamTextMock.mockImplementation(() => fakeStreamResult({ autoEnd: true }));
    setSetting("openrouterApiKey", "test-key");
  });

  it("reuses the stored user row after an interrupted turn and sends its text once, without the leftovers", async () => {
    rows = [
      userRow("Bonjour"),
      assistantRow(answer("Salut !")),
      userRow("Fais un croquis"),
      assistantRow([], 1), // the stream failed
      assistantRow([{ role: "assistant", content: [{ type: "text", text: "Je dess" }] }], 1), // a stopped attempt
    ];
    const res = await send("Fais un croquis");
    expect(res.status).toBe(200);
    expect(appendMessageMock).not.toHaveBeenCalled();
    expect(storedUserRows()).toHaveLength(2);
    expect(userTexts()).toEqual(["Bonjour", "Fais un croquis"]);
    expect(modelMessages().map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(JSON.stringify(modelMessages())).not.toContain("Je dess");
  });

  it("reuses a user row written just before a failure that left no assistant row, keeping its image", async () => {
    rows = [userRow("Change le fond", [{ type: "file", mediaType: "image/png", data: "iVBORw0KGgo=" }])];
    await send("Change le fond");
    expect(appendMessageMock).not.toHaveBeenCalled();
    expect(userTexts()).toEqual(["Change le fond[file]"]);
  });

  it("still appends the user row once when the failed attempt returned 400 before writing anything", async () => {
    setSetting("openrouterApiKey", "");
    const previousEnv = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    rows = [userRow("Bonjour"), assistantRow(answer("Salut !"))];
    expect((await send("Fais un croquis")).status).toBe(400);
    expect(rows).toHaveLength(2);
    if (previousEnv !== undefined) process.env.OPENROUTER_API_KEY = previousEnv;

    setSetting("openrouterApiKey", "test-key");
    await send("Fais un croquis");
    expect(appendMessageMock).toHaveBeenCalledTimes(1);
    expect(storedUserRows().map((row) => JSON.parse(row.content_json)[0].content[0].text)).toEqual(["Bonjour", "Fais un croquis"]);
    expect(userTexts()).toEqual(["Bonjour", "Fais un croquis"]);
  });

  it("appends a new message that repeats the text of an older completed turn", async () => {
    rows = [userRow("Encore une idée"), assistantRow(answer("Voici une idée."))];
    await send("Encore une idée");
    expect(appendMessageMock).toHaveBeenCalledTimes(1);
    expect(storedUserRows()).toHaveLength(2);
    expect(userTexts()).toEqual(["Encore une idée", "Encore une idée"]);
  });
});

describe("findRetriedUserRowIndex", () => {
  const skipRow = assistantRow([
    {
      role: "tool",
      content: [{ type: "tool-result", toolCallId: "r1", toolName: "request_user_image", output: { type: "json", value: { skipped: true, reason: "abandoned" } } }],
    },
  ]);

  it("finds the user row followed only by interrupted or abandoned-request rows", () => {
    expect(findRetriedUserRowIndex([userRow("a")], "a")).toBe(0);
    expect(findRetriedUserRowIndex([userRow("a"), assistantRow([], 1), skipRow], "a")).toBe(0);
  });

  it("returns -1 otherwise", () => {
    expect(findRetriedUserRowIndex([], "a")).toBe(-1);
    expect(findRetriedUserRowIndex([userRow("a")], "b")).toBe(-1);
    expect(findRetriedUserRowIndex([userRow("a")], "")).toBe(-1);
    expect(findRetriedUserRowIndex([userRow("a"), assistantRow(answer("ok"))], "a")).toBe(-1);
    // A request the model is still waiting on (not interrupted) is not a failed attempt.
    expect(
      findRetriedUserRowIndex(
        [userRow("a"), assistantRow([{ role: "assistant", content: [{ type: "tool-call", toolCallId: "r1", toolName: "request_user_image", input: {} }] }])],
        "a",
      ),
    ).toBe(-1);
  });
});
