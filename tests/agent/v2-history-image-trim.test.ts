import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

type Row = { id: string; conversation_id: string; role: "user" | "assistant"; content_json: string; interrupted: number };
let rows: Row[] = [];
vi.mock("@/lib/agent/conversation/store", () => ({
  appendMessage: (input: Omit<Row, "id">) => {
    const row = { ...input, id: `r${rows.length}` } as Row;
    rows.push(row);
    return row;
  },
  listMessages: () => rows.map((row) => ({ ...row })),
}));
vi.mock("@/lib/agent/v2/persist-turn", () => ({ persistAssistantTurn: vi.fn() }));
vi.mock("@/lib/agent/conversation/auto-title", () => ({ generateAndPersistTitle: vi.fn(async () => {}) }));

const streamTextMock = vi.fn();
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, streamText: (opts: unknown) => streamTextMock(opts) };
});

import { setSetting } from "@/lib/settings";
import { rowsToUIMessages } from "@/components/panels/chat/history-to-ui-messages";
import { HISTORY_IMAGE_PLACEHOLDER, trimToolResultImages } from "@/lib/agent/v2/history-images";
// Imported up front: loading the route (and the tool registry) can take seconds on a busy machine.
import { postV2 } from "@/lib/agent/v2/route-handler";

const FILE = { type: "file", mediaType: "image/jpeg", data: { type: "data", data: "SU1BR0U=" } };

const userRow = (text: string): Row => ({
  id: "",
  conversation_id: "c1",
  role: "user",
  content_json: JSON.stringify([{ role: "user", content: [{ type: "text", text }] }]),
  interrupted: 0,
});

/** An assistant row: one tool call and its content result (text + image). */
const toolRow = (toolCallId: string, toolName: string, header: string, extraCalls: unknown[] = []): Row => ({
  id: "",
  conversation_id: "c1",
  role: "assistant",
  content_json: JSON.stringify([
    { role: "assistant", content: [{ type: "tool-call", toolCallId, toolName, input: {} }, ...extraCalls] },
    {
      role: "tool",
      content: [
        { type: "tool-result", toolCallId, toolName, output: { type: "content", value: [{ type: "text", text: header }, FILE] } },
      ],
    },
  ]),
  interrupted: 0,
});

function streamResult() {
  return {
    toUIMessageStreamResponse: () => new Response("ok", { headers: { "content-type": "text/event-stream" } }),
    consumeStream: vi.fn(async () => {}),
  };
}

async function post(messages: unknown[]) {
  return postV2(
    new Request("http://localhost/api/agent/chat", {
      method: "POST",
      body: JSON.stringify({ conversation_id: "c1", project_id: "p1", messages, canvas_snapshot: { nodes: [], edges: [] } }),
    }) as never,
  );
}

type Msg = { role: string; content: Array<{ type: string; toolName?: string; output?: { value: Array<{ type: string; text?: string }> } }> };
const modelMessages = (): Msg[] => (streamTextMock.mock.calls.at(-1)?.[0] as { messages: Msg[] }).messages;

function resultValue(toolName: string): Array<{ type: string; text?: string }> {
  for (const m of modelMessages()) {
    for (const part of m.content) if (part.type === "tool-result" && part.toolName === toolName) return part.output!.value;
  }
  throw new Error(`no result for ${toolName}`);
}

describe("trimToolResultImages", () => {
  it("replaces image parts of view_canvas_images and search_youtube results, keeping text", () => {
    const messages = JSON.parse(toolRow("a", "view_canvas_images", "node x (sketch) — image 1/1").content_json);
    const trimmed = trimToolResultImages(messages) as typeof messages;
    expect(trimmed[1].content[0].output.value).toEqual([
      { type: "text", text: "node x (sketch) — image 1/1" },
      { type: "text", text: HISTORY_IMAGE_PLACEHOLDER },
    ]);
    // Never mutates its input.
    expect(messages[1].content[0].output.value[1]).toEqual(FILE);
    expect(HISTORY_IMAGE_PLACEHOLDER).toBe("[image retirée de l'historique — rappelle l'outil si besoin]");
  });

  it("leaves other tools' images alone", () => {
    const messages = JSON.parse(toolRow("b", "generate_sketch", "sketch").content_json);
    expect(trimToolResultImages(messages)).toEqual(messages);
  });
});

describe("postV2 — images of earlier turns are trimmed from the model input", () => {
  beforeEach(() => {
    rows = [];
    streamTextMock.mockReset();
    streamTextMock.mockReturnValue(streamResult());
    setSetting("openrouterApiKey", "test-key");
  });

  it("trims view_canvas_images and search_youtube images of prior turns, without touching stored rows or the UI history", async () => {
    rows = [
      userRow("Regarde le canvas"),
      toolRow("v1", "view_canvas_images", "node s1 (sketch, S) — image 1/1 — stored:gi_1"),
      toolRow("y1", "search_youtube", "8 vidéos"),
      toolRow("g1", "generate_sketch", "croquis"),
    ];
    const before = rows.map((row) => row.content_json);
    const uiBefore = JSON.stringify(rowsToUIMessages(rows as never));

    expect((await post([{ role: "user", parts: [{ type: "text", text: "Et maintenant ?" }] }])).status).toBe(200);

    expect(resultValue("view_canvas_images")).toEqual([
      { type: "text", text: "node s1 (sketch, S) — image 1/1 — stored:gi_1" },
      { type: "text", text: HISTORY_IMAGE_PLACEHOLDER },
    ]);
    expect(resultValue("search_youtube")).toEqual([
      { type: "text", text: "8 vidéos" },
      { type: "text", text: HISTORY_IMAGE_PLACEHOLDER },
    ]);
    expect(resultValue("generate_sketch").map((p) => p.type)).toEqual(["text", "file"]);

    // Stored rows and what the chat shows are unchanged.
    expect(rows.slice(0, 4).map((row) => row.content_json)).toEqual(before);
    expect(JSON.stringify(rowsToUIMessages(rows.slice(0, 4) as never))).toBe(uiBefore);
    expect(uiBefore).toContain("SU1BR0U=");
  });

  it("keeps the images of the current turn on a tool continuation", async () => {
    rows = [
      userRow("Avant"),
      toolRow("v-old", "view_canvas_images", "old header"),
      userRow("Analyse le workflow"),
      toolRow("v-now", "view_canvas_images", "current header", [
        { type: "tool-call", toolCallId: "img1", toolName: "request_user_image", input: {} },
      ]),
    ];
    const res = await post([
      {
        role: "assistant",
        parts: [{ type: "tool-request_user_image", state: "output-available", toolCallId: "img1", output: { skipped: true } }],
      },
    ]);
    expect(res.status).toBe(200);

    const values = modelMessages().flatMap((m) =>
      m.content.flatMap((part) => (part.type === "tool-result" && part.toolName === "view_canvas_images" ? [part.output!.value] : [])),
    );
    expect(values).toHaveLength(2);
    expect(values[0]).toEqual([
      { type: "text", text: "old header" },
      { type: "text", text: HISTORY_IMAGE_PLACEHOLDER },
    ]);
    expect(values[1].map((p) => p.type)).toEqual(["text", "file"]);
  });
});
