import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ThumbnailBrief } from "@/lib/brief/schema";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

type Row = { id: string; conversation_id: string; role: "user" | "assistant"; content_json: string; interrupted: number };

const state = vi.hoisted(() => ({
  rows: [] as Row[],
  brief: null as ThumbnailBrief | null,
  reserve: null as null | ((...args: unknown[]) => unknown),
  briefToolBuilds: [] as Array<{ conversationId: string; projectId: string; writeBriefUpdated: (data: unknown) => void }>,
}));

vi.mock("@/lib/agent/conversation/store", () => ({
  appendMessage: (input: Omit<Row, "id">) => {
    const row = { ...input, id: `r${state.rows.length}` } as Row;
    state.rows.push(row);
    return row;
  },
  listMessages: () => state.rows.map((row) => ({ ...row })),
  getConversation: (id: string) => ({ id, project_id: "proj_brief", title: "t", created_at: "", updated_at: "" }),
}));
vi.mock("@/lib/agent/v2/persist-turn", () => ({ persistAssistantTurn: vi.fn() }));
vi.mock("@/lib/agent/conversation/auto-title", () => ({ generateAndPersistTitle: vi.fn(async () => {}) }));
vi.mock("@/lib/brief/store", () => ({
  getBrief: (conversationId: string) =>
    state.brief ? { conversationId, projectId: "proj_brief", brief: state.brief, updatedAt: "2026-09-17T10:00:00.000Z" } : null,
  reserveBriefUsage: (...args: unknown[]) => (state.reserve ? state.reserve(...args) : { status: "no-brief" }),
  releaseBriefUsage: vi.fn(),
  updateBrief: vi.fn(),
}));
vi.mock("@/lib/agent/v2/update-brief-tool", () => ({
  UPDATE_BRIEF_TOOL_NAME: "update_brief",
  buildUpdateBriefTool: (options: { conversationId: string; projectId: string; writeBriefUpdated: (data: unknown) => void }) => {
    state.briefToolBuilds.push(options);
    return { description: "update_brief (test)", inputSchema: {}, execute: async () => ({ content: [] }) };
  },
}));

const streamTextMock = vi.fn();
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, streamText: (opts: unknown) => streamTextMock(opts) };
});

import { setSetting } from "@/lib/settings";
import { emptyBrief } from "@/lib/brief/schema";
import { HISTORY_IMAGE_PLACEHOLDER } from "@/lib/agent/v2/history-images";
import { postV2 } from "@/lib/agent/v2/route-handler";
import { getRun, resetRunRegistry } from "@/lib/agent/v2/run-registry";
import { chatRequest, fakeStreamResult, waitForRunEnd } from "./helpers/chat-route";

const FILE = { type: "file", mediaType: "image/png", data: { type: "data", data: "U0tFVENI" } };
const T = "2026-09-17T10:00:00.000Z";
const question = { question: "Quelle stratégie ?", step: 4, options: [{ id: "a", label: "Concepts" }] };

const userRow = (text: string): Row => ({
  id: "",
  conversation_id: "c",
  role: "user",
  content_json: JSON.stringify([{ role: "user", content: [{ type: "text", text }] }]),
  interrupted: 0,
});
const sketchRow = (): Row => ({
  id: "",
  conversation_id: "c",
  role: "assistant",
  content_json: JSON.stringify([
    { role: "assistant", content: [{ type: "tool-call", toolCallId: "g1", toolName: "generate_sketch", input: {} }] },
    { role: "tool", content: [{ type: "tool-result", toolCallId: "g1", toolName: "generate_sketch", output: { type: "content", value: [{ type: "text", text: "Sketch" }, FILE] } }] },
  ]),
  interrupted: 0,
});
const askCallRow = (id: string): Row => ({
  id: "",
  conversation_id: "c",
  role: "assistant",
  content_json: JSON.stringify([{ role: "assistant", content: [{ type: "tool-call", toolCallId: id, toolName: "ask_user", input: question }] }]),
  interrupted: 0,
});
const askResultRow = (id: string): Row => ({
  id: "",
  conversation_id: "c",
  role: "assistant",
  content_json: JSON.stringify([
    { role: "tool", content: [{ type: "tool-result", toolCallId: id, toolName: "ask_user", output: { type: "json", value: { selected: ["a"] } } }] },
  ]),
  interrupted: 0,
});

const lastCall = () =>
  streamTextMock.mock.calls.at(-1)![0] as {
    system: string;
    tools: Record<string, { execute?: (input: unknown, options: unknown) => Promise<unknown> }>;
    providerOptions: { openrouter: Record<string, unknown> };
    messages: Array<{ role: string; content: Array<{ type: string; toolName?: string; output?: { value: Array<{ type: string }> } }> }>;
  };

const newTurn = (conversationId: string) => ({ conversation_id: conversationId, messages: [{ role: "user", parts: [{ type: "text", text: "Continue" }] }] });

describe("chat route — thumbnail brief", () => {
  let fake: ReturnType<typeof fakeStreamResult>;
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetRunRegistry();
    state.rows = [];
    state.brief = null;
    state.reserve = null;
    state.briefToolBuilds.length = 0;
    setSetting("openrouterApiKey", "test-key");
    setSetting("agentWebSearch", "");
    fake = fakeStreamResult();
    streamTextMock.mockReset();
    streamTextMock.mockImplementation(() => fake);
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("without a brief: web search stays on and no brief block is sent", async () => {
    await postV2(chatRequest(newTurn("c-none")));
    expect(lastCall().providerOptions.openrouter.web_search_options).toEqual({});
    // The static prompt names <thumbnail_brief>; the per-turn block is the only one that closes it.
    expect(lastCall().system).not.toContain("</thumbnail_brief>");
    await fake.end();
    await waitForRunEnd("c-none");
  });

  it("with a brief: no web search, and the brief block after canvas_state", async () => {
    state.brief = { ...emptyBrief(), step: 4 };
    await postV2(chatRequest({ ...newTurn("c-brief"), canvas_snapshot: { nodes: [], edges: [] } }));
    const { system, providerOptions } = lastCall();
    expect(providerOptions.openrouter).not.toHaveProperty("web_search_options");
    expect(system).toContain("</thumbnail_brief>");
    expect(system.lastIndexOf("<thumbnail_brief>")).toBeGreaterThan(system.lastIndexOf("</canvas_state>"));
    await fake.end();
    await waitForRunEnd("c-brief");
  });

  it("gives the model update_brief for this conversation and streams brief updates as transient chunks", async () => {
    await postV2(chatRequest(newTurn("c-chunk")));
    expect(Object.keys(lastCall().tools)).toEqual(expect.arrayContaining(["update_brief", "ask_user", "place_node", "generate_sketch"]));
    expect(state.briefToolBuilds).toHaveLength(1);
    expect(state.briefToolBuilds[0]).toMatchObject({ conversationId: "c-chunk", projectId: "proj_brief" });
    fake.push({ type: "tool-input-available", toolCallId: "u1", toolName: "update_brief", input: {} });
    await new Promise((resolve) => setTimeout(resolve, 0));
    state.briefToolBuilds[0].writeBriefUpdated({ conversationId: "c-chunk", step: 4, updatedAt: T });
    await fake.end();
    await waitForRunEnd("c-chunk");
    expect(getRun("c-chunk")!.chunks).toContainEqual({
      type: "data-brief-updated",
      id: "c-chunk",
      transient: true,
      data: { conversationId: "c-chunk", step: 4, updatedAt: T },
    });
  });

  it("guards generate_sketch through the brief: a refused sketch never reaches the image API", async () => {
    state.reserve = () => ({ status: "refused", reason: "Esquisse refusée : test" });
    await postV2(chatRequest(newTurn("c-guard")));
    const output = (await lastCall().tools.generate_sketch.execute!({ prompt: "x" }, { toolCallId: "s1", messages: [] })) as {
      isError: boolean;
      content: Array<{ text: string }>;
    };
    expect(output.isError).toBe(true);
    expect(output.content[0].text).toBe("Esquisse refusée : test");
    expect(fetchMock).not.toHaveBeenCalled();
    await fake.end();
    await waitForRunEnd("c-guard");
  });

  it("with a brief, trims images older than the last answered question, even within the turn", async () => {
    const continuation = (conversationId: string) => ({
      conversation_id: conversationId,
      messages: [
        {
          role: "assistant",
          parts: [{ type: "tool-ask_user", toolCallId: "q2", state: "output-available", input: question, output: { selected: ["a"] } }],
        },
      ],
    });
    const sketchParts = () => {
      for (const message of lastCall().messages) {
        for (const part of message.content) if (part.type === "tool-result" && part.toolName === "generate_sketch") return part.output!.value;
      }
      throw new Error("no sketch result");
    };

    state.rows = [userRow("Aide-moi"), sketchRow(), askCallRow("q1"), askResultRow("q1"), askCallRow("q2")];
    await postV2(chatRequest(continuation("c-trim-none")));
    expect(sketchParts().map((part) => part.type)).toEqual(["text", "file"]);
    await fake.end();
    await waitForRunEnd("c-trim-none");

    fake = fakeStreamResult();
    streamTextMock.mockImplementation(() => fake);
    state.brief = { ...emptyBrief(), step: 7 };
    state.rows = [userRow("Aide-moi"), sketchRow(), askCallRow("q1"), askResultRow("q1"), askCallRow("q2")];
    await postV2(chatRequest(continuation("c-trim-brief")));
    expect(sketchParts()).toEqual([
      { type: "text", text: "Sketch" },
      { type: "text", text: HISTORY_IMAGE_PLACEHOLDER },
    ]);
    await fake.end();
    await waitForRunEnd("c-trim-brief");
  });
});
