import { describe, it, expect, vi, beforeEach } from "vitest";
import type { UIMessageChunk } from "ai";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

const appendMessageMock = vi.fn<(...args: unknown[]) => undefined>();
const listMessagesMock = vi.fn<(...args: unknown[]) => unknown[]>(() => []);
vi.mock("@/lib/agent/conversation/store", () => ({
  appendMessage: (...args: unknown[]) => appendMessageMock(...args),
  listMessages: (...args: unknown[]) => listMessagesMock(...args),
  getConversation: (id: string) => ({ id, project_id: "proj_interview", title: "t", created_at: "", updated_at: "" }),
}));
vi.mock("@/lib/agent/v2/persist-turn", () => ({ persistAssistantTurn: vi.fn() }));
vi.mock("@/lib/agent/conversation/auto-title", () => ({ generateAndPersistTitle: vi.fn(async () => {}) }));

// place_node's DB work is tested elsewhere: here only its wiring (project id, patch writer).
type WritePatch = (patch: unknown) => void;
const placeNodeBuilds: Array<{ projectId: string; writePatch: WritePatch }> = [];
vi.mock("@/lib/agent/v2/place-node-tool", () => ({
  PLACE_NODE_TOOL_NAME: "place_node",
  buildPlaceNodeTool: (options: { projectId: string; writePatch: WritePatch }) => {
    placeNodeBuilds.push(options);
    return { description: "place_node (test)", inputSchema: {}, execute: async () => ({ content: [] }) };
  },
}));

const streamTextMock = vi.fn();
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, streamText: (opts: unknown) => streamTextMock(opts) };
});

import { setSetting } from "@/lib/settings";
import { getRun, resetRunRegistry, subscribe } from "@/lib/agent/v2/run-registry";
import { chatRequest, fakeStreamResult, waitForRunEnd } from "./helpers/chat-route";

const patch = {
  projectId: "proj_interview",
  updatedAt: "2026-09-17T10:00:00.000Z",
  created: true,
  node: { id: "iv-prompt", type: "prompt", position: { x: 0, y: 0 }, data: { prompt: "x" } },
  removedDataKeys: [],
  edges: [],
};

const question = { question: "Quel angle ?", step: 2, options: [{ id: "a", label: "Choc" }] };

async function post(body: unknown) {
  const { postV2 } = await import("@/lib/agent/v2/route-handler");
  return postV2(chatRequest(body));
}

async function readAll(stream: ReadableStream<UIMessageChunk>): Promise<UIMessageChunk[]> {
  const out: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out.push(value);
  }
}

const streamTools = () => (streamTextMock.mock.calls.at(-1)![0] as { tools: Record<string, unknown> }).tools;

describe("chat route — guided interview wiring", () => {
  let fake: ReturnType<typeof fakeStreamResult>;

  beforeEach(() => {
    resetRunRegistry();
    setSetting("openrouterApiKey", "test-key");
    appendMessageMock.mockClear();
    listMessagesMock.mockReset();
    listMessagesMock.mockReturnValue([]);
    placeNodeBuilds.length = 0;
    fake = fakeStreamResult();
    streamTextMock.mockReset();
    streamTextMock.mockImplementation(() => fake);
  });

  it("gives the model place_node, ask_user, read_skill and F3b research tools, built for the conversation's project", async () => {
    await post({ conversation_id: "c-tools", messages: [{ role: "user", parts: [{ type: "text", text: "Aide-moi" }] }] });
    expect(Object.keys(streamTools())).toEqual(
      expect.arrayContaining([
        "place_node",
        "ask_user",
        "finish_turn",
        "read_skill",
        "research_topic",
        "find_logos",
        "add_logo",
        "find_competitor_thumbnails",
        "analyze_thumbnails",
      ]),
    );
    expect(placeNodeBuilds).toHaveLength(1);
    expect(placeNodeBuilds[0].projectId).toBe("proj_interview");
    await fake.end();
    await waitForRunEnd("c-tools");
  }, 15_000);

  it("writes canvas patches as transient chunks into the run, replayed to a reconnection, without touching the start chunk", async () => {
    await post({ conversation_id: "c-patch", messages: [{ role: "user", parts: [{ type: "text", text: "Aide-moi" }] }] });
    fake.push({ type: "tool-input-available", toolCallId: "p1", toolName: "place_node", input: {} });
    // The real tool writes after its own async work (image resolution, DB): the call chunk is merged by then.
    await new Promise((resolve) => setTimeout(resolve, 0));
    placeNodeBuilds[0].writePatch(patch);
    fake.push({ type: "tool-output-available", toolCallId: "p1", output: { content: [] } });
    await fake.end();
    await waitForRunEnd("c-patch");

    const run = getRun("c-patch")!;
    expect(run.status).toBe("done");
    expect(run.chunks[0]).toEqual({ type: "start" });
    expect(run.chunks).toContainEqual({ type: "data-canvas-patch", id: "iv-prompt", transient: true, data: patch });
    const replay = await readAll(subscribe(run));
    expect(replay.map((chunk) => chunk.type)).toEqual(["start", "tool-input-available", "data-canvas-patch", "tool-output-available"]);
  });

  it("ends the run as error when the model stream breaks, as before the composition", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await post({ conversation_id: "c-break", messages: [{ role: "user", parts: [{ type: "text", text: "Aide-moi" }] }] });
    fake.fail(new Error("socket closed"));
    await waitForRunEnd("c-break");
    errorSpy.mockRestore();
    expect(getRun("c-break")!.status).toBe("error");
  });

  it("resumes after an answered ask_user instead of answering 400", async () => {
    const res = await post({
      conversation_id: "c-resume",
      messages: [
        {
          role: "assistant",
          parts: [{ type: "tool-ask_user", toolCallId: "q1", state: "output-available", input: question, output: { selected: ["a"] } }],
        },
      ],
    });
    expect(res.status).toBe(200);
    expect(streamTextMock).toHaveBeenCalledTimes(1);
    const row = JSON.parse((appendMessageMock.mock.calls[0][0] as { content_json: string }).content_json);
    expect(row).toEqual([
      {
        role: "tool",
        content: [{ type: "tool-result", toolCallId: "q1", toolName: "ask_user", output: { type: "json", value: { selected: ["a"] } } }],
      },
    ]);
    await fake.end();
    await waitForRunEnd("c-resume");
  });

  it("marks a question the user wrote past as abandoned", async () => {
    listMessagesMock.mockReturnValue([
      { role: "user", content_json: JSON.stringify([{ role: "user", content: [{ type: "text", text: "Aide-moi" }] }]) },
      {
        role: "assistant",
        content_json: JSON.stringify([
          { role: "assistant", content: [{ type: "tool-call", toolCallId: "q9", toolName: "ask_user", input: question }] },
        ]),
      },
    ]);
    await post({ conversation_id: "c-abandon", messages: [{ role: "user", parts: [{ type: "text", text: "Reviens au personnage" }] }] });
    const rows = appendMessageMock.mock.calls.map((call) => JSON.parse((call[0] as { content_json: string }).content_json));
    expect(rows[0]).toEqual([
      {
        role: "tool",
        content: [
          { type: "tool-result", toolCallId: "q9", toolName: "ask_user", output: { type: "json", value: { skipped: true, reason: "abandoned" } } },
        ],
      },
    ]);
    await fake.end();
    await waitForRunEnd("c-abandon");
  });
});
