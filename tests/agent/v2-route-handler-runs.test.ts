import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

const appendMessageMock = vi.fn((..._args: unknown[]) => undefined);
const listMessagesMock = vi.fn((..._args: unknown[]) => [] as unknown[]);
const getConversationMock = vi.fn(
  (id: string) => ({ id, project_id: "p1", title: "t", created_at: "", updated_at: "" }) as unknown,
);
vi.mock("@/lib/agent/conversation/store", () => ({
  appendMessage: (...args: unknown[]) => appendMessageMock(...args),
  listMessages: (...args: unknown[]) => listMessagesMock(...args),
  getConversation: (id: string) => getConversationMock(id),
}));

const persistAssistantTurnMock = vi.fn((..._args: unknown[]) => undefined);
vi.mock("@/lib/agent/v2/persist-turn", () => ({
  persistAssistantTurn: (...args: unknown[]) => persistAssistantTurnMock(...args),
}));

const generateAndPersistTitleMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@/lib/agent/conversation/auto-title", () => ({
  generateAndPersistTitle: (...args: unknown[]) => generateAndPersistTitleMock(...args),
}));

vi.mock("@/lib/agent/tools/_helpers/image-source", () => ({
  resolveImageSource: async (..._args: unknown[]) => {
    throw new Error("Image not found: stored:nope");
  },
}));

// Never call a real model: streamText is replaced, everything else in "ai" stays real.
const streamTextMock = vi.fn();
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, streamText: (opts: unknown) => streamTextMock(opts) };
});

import { setSetting } from "@/lib/settings";
import { getRun, listRuns, resetRunRegistry, stopRun } from "@/lib/agent/v2/run-registry";
import { AGENT_BUSY_MESSAGE } from "@/lib/agent/v2/run-types";
import { chatRequest, fakeStreamResult, waitForRunEnd } from "./helpers/chat-route";

type StreamArgs = {
  system: string;
  abortSignal: AbortSignal;
  onEnd: (e: { responseMessages: unknown[]; usage: Record<string, number>; finishReason: string }) => Promise<void>;
};
const streamArgs = () => streamTextMock.mock.calls.at(-1)![0] as StreamArgs;

const userTurn = (conversationId: string, text = "Salut", extra: Record<string, unknown> = {}) => ({
  conversation_id: conversationId,
  project_id: "ignored-by-the-server",
  messages: [{ role: "user", parts: [{ type: "text", text }] }],
  canvas_snapshot: { nodes: [], edges: [] },
  ...extra,
});

async function post(body: unknown, init?: Parameters<typeof chatRequest>[1]) {
  const { postV2 } = await import("@/lib/agent/v2/route-handler");
  return postV2(chatRequest(body, init));
}

describe("postV2 runs the turn in the background", () => {
  let fake: ReturnType<typeof fakeStreamResult>;

  beforeEach(() => {
    resetRunRegistry();
    setSetting("openrouterApiKey", "test-key");
    appendMessageMock.mockClear();
    listMessagesMock.mockReset();
    listMessagesMock.mockReturnValue([]);
    getConversationMock.mockClear();
    persistAssistantTurnMock.mockReset();
    generateAndPersistTitleMock.mockClear();
    fake = fakeStreamResult();
    streamTextMock.mockReset();
    streamTextMock.mockImplementation(() => fake);
  });

  it("answers 415 to a non-JSON request before reading anything", async () => {
    const res = await post(userTurn("c-415"), { contentType: null });
    expect(res.status).toBe(415);
    expect(getConversationMock).not.toHaveBeenCalled();
    expect(appendMessageMock).not.toHaveBeenCalled();
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown or deleted conversation", async () => {
    getConversationMock.mockReturnValueOnce(null);
    const res = await post(userTurn("c-404"));
    expect(res.status).toBe(404);
    expect(getRun("c-404")).toBeNull();
    expect(appendMessageMock).not.toHaveBeenCalled();
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("takes the project from the stored conversation, not from the body", async () => {
    getConversationMock.mockReturnValueOnce({ id: "c-proj", project_id: "proj_real", title: "t", created_at: "", updated_at: "" });
    await post(userTurn("c-proj"));
    expect(streamArgs().system).toContain("<project_id>proj_real</project_id>");
    expect(listRuns()[0]).toMatchObject({ conversationId: "c-proj", projectId: "proj_real", status: "running" });
  });

  it("keeps the model call alive when the browser disconnects", async () => {
    const browser = new AbortController();
    const res = await post(userTurn("c-leave"), { signal: browser.signal });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    browser.abort();
    await res.body!.cancel();
    expect(streamArgs().abortSignal.aborted).toBe(false);
    fake.push({ type: "text-delta", id: "t", delta: "toujours là" });
    expect(fake.cancelled).toBe(false);
    await fake.end();
    await waitForRunEnd("c-leave");
    const run = getRun("c-leave")!;
    expect(run.status).toBe("done");
    expect(run.chunks).toContainEqual({ type: "text-delta", id: "t", delta: "toujours là" });
  });

  it("answers 409 while a turn runs, without writing, titling or calling the model", async () => {
    expect((await post(userTurn("c-busy", "Premier"))).status).toBe(200);
    const listCalls = listMessagesMock.mock.calls.length;
    const res = await post(userTurn("c-busy", "Second"));
    expect(res.status).toBe(409);
    expect(await res.text()).toBe(AGENT_BUSY_MESSAGE);
    expect(appendMessageMock).toHaveBeenCalledTimes(1);
    expect(listMessagesMock.mock.calls.length).toBe(listCalls);
    expect(generateAndPersistTitleMock).toHaveBeenCalledTimes(1);
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });

  it("frees the conversation on every 400 before streamText", async () => {
    const attachment = await post(userTurn("c-400", "Regarde", { attachments: [{ type: "image", source: "stored:nope" }] }));
    expect(attachment.status).toBe(400);
    expect(getRun("c-400")).toBeNull();

    const continuation = await post({
      conversation_id: "c-400",
      messages: [{ role: "assistant", parts: [{ type: "tool-list_logos", state: "output-available", toolCallId: "x", output: {} }] }],
    });
    expect(continuation.status).toBe(400);
    expect(getRun("c-400")).toBeNull();

    listMessagesMock.mockReturnValue([{ id: "old", role: "assistant", content_json: JSON.stringify([{ type: "text", text: "v1" }]) }, { id: "new", role: "user", content_json: "[]" }]);
    const oldFormat = await post(userTurn("c-400"));
    expect(oldFormat.status).toBe(400);
    expect(getRun("c-400")).toBeNull();

    listMessagesMock.mockReturnValue([]);
    expect((await post(userTurn("c-400"))).status).toBe(200);
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });

  it("does not end the run on a tool-error the turn recovers from", async () => {
    await post(userTurn("c-tool-error"));
    fake.push({ type: "tool-output-error", toolCallId: "t1", errorText: "YouTube a refusé" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(fake.options.onError?.(new Error("YouTube a refusé"))).toBe("An error occurred.");
    errorSpy.mockRestore();
    await Promise.resolve();
    expect(getRun("c-tool-error")!.status).toBe("running");
    fake.push({ type: "text-delta", id: "t", delta: "J'ai contourné." });
    await fake.end();
    await waitForRunEnd("c-tool-error");
    expect(getRun("c-tool-error")!.status).toBe("done");
    expect(persistAssistantTurnMock).not.toHaveBeenCalled();
  });

  it("ends the run as stopped, error or done, after the turn is saved", async () => {
    const statusAtSave: Array<string | undefined> = [];
    persistAssistantTurnMock.mockImplementation((info) => {
      statusAtSave.push(getRun((info as { conversationId: string }).conversationId)?.status);
    });

    await post(userTurn("c-done"));
    await streamArgs().onEnd({ responseMessages: [{ role: "assistant", content: [] }], usage: { inputTokens: 1, outputTokens: 1 }, finishReason: "stop" });
    await fake.end({ status: "completed" });
    await waitForRunEnd("c-done");
    expect(getRun("c-done")!.status).toBe("done");

    fake = fakeStreamResult();
    await post(userTurn("c-failed"));
    await fake.end({ status: "failed" });
    await waitForRunEnd("c-failed");
    expect(getRun("c-failed")!.status).toBe("error");
    expect(persistAssistantTurnMock).toHaveBeenLastCalledWith(expect.objectContaining({ conversationId: "c-failed", interrupted: true, finishReason: "error" }));

    fake = fakeStreamResult();
    await post(userTurn("c-stopped"));
    expect(stopRun("c-stopped")).toBe(true);
    expect(streamArgs().abortSignal.aborted).toBe(true);
    await fake.end({ status: "aborted" });
    await waitForRunEnd("c-stopped");
    expect(getRun("c-stopped")!.status).toBe("stopped");

    fake = fakeStreamResult();
    await post(userTurn("c-broken"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fake.fail(new Error("socket closed"));
    await waitForRunEnd("c-broken");
    errorSpy.mockRestore();
    expect(getRun("c-broken")!.status).toBe("error");

    expect(statusAtSave).toEqual(["running", "running"]);
  });
});
