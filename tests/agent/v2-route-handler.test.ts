import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

const appendMessageMock = vi.fn((..._args: unknown[]) => undefined);
const listMessagesMock = vi.fn((..._args: unknown[]) => [] as unknown[]);
vi.mock("@/lib/agent/conversation/store", () => ({
  appendMessage: (...args: unknown[]) => appendMessageMock(...args),
  listMessages: (...args: unknown[]) => listMessagesMock(...args),
  getConversation: (id: string) => ({ id, project_id: "p1", title: "t", created_at: "", updated_at: "" }),
}));

const resolveImageSourceMock = vi.fn(async (..._args: unknown[]) => ({
  mimeType: "image/jpeg",
  bytes: Buffer.from(""),
}));
vi.mock("@/lib/agent/tools/_helpers/image-source", () => ({
  resolveImageSource: (...args: unknown[]) => resolveImageSourceMock(...args),
}));

const persistAssistantTurnMock = vi.fn();
vi.mock("@/lib/agent/v2/persist-turn", () => ({
  persistAssistantTurn: (...args: unknown[]) => persistAssistantTurnMock(...args),
}));
vi.mock("@/lib/agent/conversation/auto-title", () => ({ generateAndPersistTitle: vi.fn(async () => {}) }));

const streamTextMock = vi.fn();
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, streamText: (opts: unknown) => streamTextMock(opts) };
});

// Deliberately NOT importing "@/lib/agent/tools/all" here — tool-adapter.ts
// now does that import itself (Task 14's Bug 1 fix), and this suite must
// exercise that real wiring rather than papering over a reverted fix with
// its own copy of the same import. Before the fix, this file (and
// v2-tool-adapter.test.ts) importing "@/lib/agent/tools/all" themselves is
// exactly what kept the suite green while the real chat route's tool
// registry was empty — see task-14-report.md.
import { setSetting } from "@/lib/settings";
import { resetRunRegistry } from "@/lib/agent/v2/run-registry";
import { chatRequest, fakeStreamResult } from "./helpers/chat-route";

function fakeRow(overrides: Partial<{
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content_json: string;
}>) {
  return {
    id: "m0",
    conversation_id: "c1",
    role: "assistant" as const,
    content_json: "[]",
    interrupted: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    cost_estimate: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("postV2", () => {
  beforeEach(() => {
    resetRunRegistry();
    streamTextMock.mockClear();
    appendMessageMock.mockClear();
    listMessagesMock.mockClear();
    listMessagesMock.mockReturnValue([]);
    resolveImageSourceMock.mockClear();
    resolveImageSourceMock.mockImplementation(async () => ({
      mimeType: "image/jpeg",
      bytes: Buffer.from(""),
    }));
    persistAssistantTurnMock.mockClear();
  });

  it("returns 400 when conversation_id is missing", async () => {
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    const res = await postV2(
      chatRequest({ project_id: "p" }),
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Missing conversation_id");
  });

  const rawChatRequest = (body: string, headers: Record<string, string> = {}) =>
    new Request("http://localhost/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
    }) as never;

  it("returns 400 « Corps JSON invalide » when the body is not valid JSON", async () => {
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    const res = await postV2(rawChatRequest('{"conversation_id":"c1","messages":[{"ro'));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Corps JSON invalide");
  });

  it("returns 413 « Requête trop volumineuse » when an over-10 MB body failed to parse (truncated upstream)", async () => {
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    const res = await postV2(
      rawChatRequest('{"conversation_id":"c1","messages":[{"ro', { "Content-Length": String(12 * 1024 * 1024) }),
    );
    expect(res.status).toBe(413);
    expect(await res.text()).toBe("Requête trop volumineuse");
  });

  it("returns 400 when no OpenRouter API key is configured", async () => {
    const prevEnv = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    setSetting("openrouterApiKey", "");
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    const res = await postV2(
      chatRequest({ conversation_id: "c1", project_id: "p1", messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }),
    );
    expect(res.status).toBe(400);
    if (prevEnv !== undefined) process.env.OPENROUTER_API_KEY = prevEnv;
  });

  it("wires registry tools + the client tool into streamText, with stopWhen set", async () => {
    setSetting("openrouterApiKey", "test-key");
    streamTextMock.mockReturnValue(fakeStreamResult());
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    const res = await postV2(
      chatRequest({
          conversation_id: `c-${Date.now()}`,
          project_id: "p1",
          messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }],
          canvas_snapshot: { nodes: [], edges: [] },
        }),
    );
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    expect(streamTextMock).toHaveBeenCalledTimes(1);
    const callArgs = streamTextMock.mock.calls[0][0] as {
      tools: Record<string, unknown>;
      stopWhen: unknown;
      abortSignal: unknown;
    };
    expect(Object.keys(callArgs.tools)).toContain("list_logos");
    expect(Object.keys(callArgs.tools)).toContain("request_user_image");
    expect(callArgs.stopWhen).toBeDefined();
    expect(callArgs.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("wires onAbort (finding #4) and onEnd — not the deprecated onFinish (finding #5) — into streamText", async () => {
    setSetting("openrouterApiKey", "test-key");
    streamTextMock.mockReturnValue(fakeStreamResult());
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    await postV2(
      chatRequest({
          conversation_id: `c-${Date.now()}`,
          project_id: "p1",
          messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }],
        }),
    );
    expect(streamTextMock).toHaveBeenCalledTimes(1);
    const callArgs = streamTextMock.mock.calls[0][0] as {
      onFinish?: unknown;
      onEnd?: unknown;
      onAbort?: unknown;
    };
    expect(callArgs.onFinish).toBeUndefined();
    expect(typeof callArgs.onEnd).toBe("function");
    expect(typeof callArgs.onAbort).toBe("function");
  });

  it("returns a clean 400 (not an unhandled exception) when an attachment source doesn't resolve (finding #9)", async () => {
    setSetting("openrouterApiKey", "test-key");
    streamTextMock.mockReturnValue(fakeStreamResult());
    resolveImageSourceMock.mockImplementation(async () => {
      throw new Error("Image not found: stored:fr_nonexistent");
    });
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    const res = await postV2(
      chatRequest({
          conversation_id: `c-${Date.now()}`,
          project_id: "p1",
          messages: [{ role: "user", parts: [{ type: "text", text: "look at this" }] }],
          attachments: [{ type: "image", source: "stored:fr_nonexistent" }],
        }),
    );
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("Image not found: stored:fr_nonexistent");
    // Must be a plain message, not a raw stack trace leaked to the client.
    expect(text).not.toMatch(/\n\s*at /);
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("returns a clear 400 when prior history contains an old-format (Anthropic-block-shaped) row (finding #6)", async () => {
    setSetting("openrouterApiKey", "test-key");
    streamTextMock.mockReturnValue(fakeStreamResult());
    // Old v1-shaped row: Anthropic content blocks (`{type:"text",...}`), no
    // `role` key anywhere — exactly what a pre-migration conversation looks
    // like. listMessages() returns it alongside the just-appended user row,
    // which postV2's own `.slice(0, -1)` drops.
    listMessagesMock.mockReturnValue([
      fakeRow({
        id: "old-1",
        role: "assistant",
        content_json: JSON.stringify([{ type: "text", text: "old format reply" }]),
      }),
      fakeRow({ id: "just-appended", role: "user", content_json: JSON.stringify([{ role: "user", content: [] }]) }),
    ]);
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    const res = await postV2(
      chatRequest({
          conversation_id: "c-old-format",
          project_id: "p1",
          messages: [{ role: "user", parts: [{ type: "text", text: "continue" }] }],
        }),
    );
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text.toLowerCase()).toContain("migrat");
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("proceeds normally when prior history is already ModelMessage-shaped", async () => {
    setSetting("openrouterApiKey", "test-key");
    streamTextMock.mockReturnValue(fakeStreamResult());
    listMessagesMock.mockReturnValue([
      fakeRow({
        id: "migrated-1",
        role: "user",
        content_json: JSON.stringify([{ role: "user", content: [{ type: "text", text: "hi" }] }]),
      }),
      fakeRow({
        id: "migrated-2",
        role: "assistant",
        content_json: JSON.stringify([{ role: "assistant", content: [{ type: "text", text: "hello" }] }]),
      }),
      fakeRow({ id: "just-appended", role: "user", content_json: JSON.stringify([{ role: "user", content: [] }]) }),
    ]);
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    const res = await postV2(
      chatRequest({
          conversation_id: "c-migrated-format",
          project_id: "p1",
          messages: [{ role: "user", parts: [{ type: "text", text: "continue" }] }],
        }),
    );
    expect(res.status).toBe(200);
    expect(streamTextMock).toHaveBeenCalledTimes(1);
    const callArgs = streamTextMock.mock.calls[0][0] as { messages: Array<{ role: string }> };
    // The two prior (already-migrated) rows plus the new user turn.
    expect(callArgs.messages.length).toBe(3);
  });

  it("auto-resolves an abandoned pending request_user_image before persisting a new user turn", async () => {
    setSetting("openrouterApiKey", "test-key");
    streamTextMock.mockReturnValue(fakeStreamResult());
    listMessagesMock.mockReturnValue([
      fakeRow({ id: "u1", role: "user", content_json: JSON.stringify([{ role: "user", content: [{ type: "text", text: "fais-moi une image" }] }]) }),
      fakeRow({
        id: "a1",
        role: "assistant",
        content_json: JSON.stringify([
          { role: "assistant", content: [{ type: "tool-call", toolCallId: "abandoned-1", toolName: "request_user_image", input: {} }] },
        ]),
      }),
    ]);
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    const res = await postV2(
      chatRequest({
          conversation_id: "c-abandoned",
          project_id: "p1",
          messages: [{ role: "user", parts: [{ type: "text", text: "en fait fais autre chose" }] }],
        }),
    );
    expect(res.status).toBe(200);
    // First call: the synthetic skip-result, persisted BEFORE the new user
    // row so the conversation's tool-call/tool-result pairing stays valid.
    expect(appendMessageMock).toHaveBeenCalledTimes(2);
    const firstCallArg = appendMessageMock.mock.calls[0][0] as { role: string; content_json: string };
    expect(firstCallArg.role).toBe("assistant");
    const persisted = JSON.parse(firstCallArg.content_json);
    expect(persisted).toEqual([
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "abandoned-1",
            toolName: "request_user_image",
            output: { type: "json", value: { skipped: true, reason: "abandoned" } },
          },
        ],
      },
    ]);
    const secondCallArg = appendMessageMock.mock.calls[1][0] as { role: string };
    expect(secondCallArg.role).toBe("user");
  });

  it("refuses (400) a continuation re-sending an ask_user answer whose result is already stored, without a model call or a write", async () => {
    setSetting("openrouterApiKey", "test-key");
    streamTextMock.mockReturnValue(fakeStreamResult());
    listMessagesMock.mockReturnValue([
      fakeRow({
        id: "a1",
        role: "assistant",
        content_json: JSON.stringify([
          { role: "assistant", content: [{ type: "tool-call", toolCallId: "ask-1", toolName: "ask_user", input: {} }] },
        ]),
      }),
      fakeRow({
        id: "a1-result",
        role: "assistant",
        content_json: JSON.stringify([
          { role: "tool", content: [{ type: "tool-result", toolCallId: "ask-1", toolName: "ask_user", output: { type: "json", value: { answer: "Minimal" } } }] },
        ]),
      }),
    ]);
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    const res = await postV2(
      chatRequest({
        conversation_id: "c-duplicate-answer",
        project_id: "p1",
        messages: [
          {
            role: "assistant",
            parts: [{ type: "tool-ask_user", toolCallId: "ask-1", state: "output-available", output: { answer: "Minimal" } }],
          },
        ],
      }),
    );
    expect(res.status).toBe(400);
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(appendMessageMock).not.toHaveBeenCalled();
  });

  it("does NOT synthesize a skip-result when the last row's client-tool call is already resolved", async () => {
    setSetting("openrouterApiKey", "test-key");
    streamTextMock.mockReturnValue(fakeStreamResult());
    listMessagesMock.mockReturnValue([
      fakeRow({
        id: "a1",
        role: "assistant",
        content_json: JSON.stringify([
          { role: "assistant", content: [{ type: "tool-call", toolCallId: "resolved-1", toolName: "request_user_image", input: {} }] },
        ]),
      }),
      fakeRow({
        id: "a1-result",
        role: "assistant",
        content_json: JSON.stringify([
          { role: "tool", content: [{ type: "tool-result", toolCallId: "resolved-1", toolName: "request_user_image", output: { type: "json", value: { skipped: true } } }] },
        ]),
      }),
    ]);
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    await postV2(
      chatRequest({
          conversation_id: "c-already-resolved",
          project_id: "p1",
          messages: [{ role: "user", parts: [{ type: "text", text: "continue" }] }],
        }),
    );
    // Only the new user row — no synthetic skip-result for an already-resolved call.
    expect(appendMessageMock).toHaveBeenCalledTimes(1);
    expect((appendMessageMock.mock.calls[0][0] as { role: string }).role).toBe("user");
  });

  it("does NOT synthesize a skip-result for a pending SERVER tool call (only request_user_image/sketch qualify)", async () => {
    setSetting("openrouterApiKey", "test-key");
    streamTextMock.mockReturnValue(fakeStreamResult());
    listMessagesMock.mockReturnValue([
      fakeRow({
        id: "a1",
        role: "assistant",
        content_json: JSON.stringify([
          { role: "assistant", content: [{ type: "tool-call", toolCallId: "server-1", toolName: "list_logos", input: {} }] },
        ]),
      }),
    ]);
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    await postV2(
      chatRequest({
          conversation_id: "c-server-tool-pending",
          project_id: "p1",
          messages: [{ role: "user", parts: [{ type: "text", text: "continue" }] }],
        }),
    );
    expect(appendMessageMock).toHaveBeenCalledTimes(1);
    expect((appendMessageMock.mock.calls[0][0] as { role: string }).role).toBe("user");
  });

  // Coverage for the stream-level onError/onEnd persistence path added
  // alongside Task 14's Bug 2 fixes — previously nothing exercised this at
  // all (the mock ignored toUIMessageStream's options argument
  // entirely), which is exactly how the double-persist regression this
  // covers shipped unnoticed in the first place.
  it("persists an interrupted:1 marker via the stream-level onEnd when the request never reached streamText's own onEnd/onAbort", async () => {
    setSetting("openrouterApiKey", "test-key");
    const streamResult = fakeStreamResult();
    streamTextMock.mockReturnValue(streamResult);
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    await postV2(
      chatRequest({
          conversation_id: `c-${Date.now()}`,
          project_id: "p1",
          messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }],
        }),
    );
    // Neither streamText's own onEnd nor onAbort was ever invoked by this
    // mock (it doesn't simulate a real stream) — matches the real-world
    // case a provider/API failure hits, where streamText's own callbacks
    // never fire at all. Simulate the SDK reporting the whole request
    // failed via the stream-level UIMessageStreamOnEndCallback.
    await streamResult.end({ status: "failed" });
    expect(persistAssistantTurnMock).toHaveBeenCalledTimes(1);
    expect(persistAssistantTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({ interrupted: true, finishReason: "error", responseMessages: [] }),
    );
  });

  it("does NOT double-persist when streamText's own onEnd already recorded the turn before the stream-level onEnd fires 'failed' (the exact regression: rows 153+154 for one request in a real conversation)", async () => {
    setSetting("openrouterApiKey", "test-key");
    const streamResult = fakeStreamResult();
    streamTextMock.mockReturnValue(streamResult);
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    await postV2(
      chatRequest({
          conversation_id: `c-${Date.now()}`,
          project_id: "p1",
          messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }],
        }),
    );
    const callArgs = streamTextMock.mock.calls[0][0] as {
      onEnd: (e: { responseMessages: unknown[]; usage: Record<string, number>; finishReason: string }) => Promise<void>;
    };
    // streamText's real behavior for a step that produced output before a
    // later failure: onEnd fires with a real (if partial) response, in
    // addition to a `tool-error` part reaching the client via the per-chunk
    // onError — NOT a stream-level "failed" outcome, since the turn did
    // produce a response. Confirmed this is what actually happened for the
    // real double-persisted rows this test is named after.
    await callArgs.onEnd({ responseMessages: [{ role: "assistant", content: [] }], usage: { inputTokens: 1, outputTokens: 1 }, finishReason: "stop" });
    expect(persistAssistantTurnMock).toHaveBeenCalledTimes(1);
    // Now simulate the stream-level onEnd firing anyway (belt-and-suspenders
    // — even if it somehow reported "failed" after a real onEnd already
    // ran, turnPersisted must suppress the second write).
    await streamResult.end({ status: "failed" });
    expect(persistAssistantTurnMock).toHaveBeenCalledTimes(1);
  });

  it("stream-level onError only logs — does not persist (a routine tool-error part must not create a stray interrupted row alongside the turn's real response)", async () => {
    setSetting("openrouterApiKey", "test-key");
    const streamResult = fakeStreamResult();
    streamTextMock.mockReturnValue(streamResult);
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    await postV2(
      chatRequest({
          conversation_id: `c-${Date.now()}`,
          project_id: "p1",
          messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }],
        }),
    );
    const returned = streamResult.options.onError?.(new Error("some tool-error part"));
    expect(returned).toBe("An error occurred.");
    expect(persistAssistantTurnMock).not.toHaveBeenCalled();
  });

  it("stream-level onEnd is a no-op when the outcome is 'completed'", async () => {
    setSetting("openrouterApiKey", "test-key");
    const streamResult = fakeStreamResult();
    streamTextMock.mockReturnValue(streamResult);
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    await postV2(
      chatRequest({
          conversation_id: `c-${Date.now()}`,
          project_id: "p1",
          messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }],
        }),
    );
    await streamResult.end({ status: "completed" });
    expect(persistAssistantTurnMock).not.toHaveBeenCalled();
  });

  it("returns a clean 400 and never calls streamText when a continuation resolves zero client-tool parts (defense-in-depth for ChatPanel.tsx's sendAutomaticallyWhen scoping)", async () => {
    setSetting("openrouterApiKey", "test-key");
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    // A tool-continuation request (last message is role:"assistant", not
    // "user") whose only tool part is a fully-resolved SERVER tool — exactly
    // what ai's own (unscoped) lastAssistantMessageIsCompleteWithToolCalls
    // would consider "complete" and auto-resubmit for, but which has no
    // client-tool resolution for the tool-continuation branch to act on.
    const res = await postV2(
      chatRequest({
          conversation_id: `c-${Date.now()}`,
          project_id: "p1",
          messages: [
            {
              role: "assistant",
              parts: [{ type: "tool-list_logos", state: "output-available", toolCallId: "c1", output: {} }],
            },
          ],
        }),
    );
    expect(res.status).toBe(400);
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(appendMessageMock).not.toHaveBeenCalled();
  });

  it("proceeds normally (calls streamText) when a continuation resolves a real client-tool part", async () => {
    setSetting("openrouterApiKey", "test-key");
    streamTextMock.mockReturnValue(fakeStreamResult());
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    const res = await postV2(
      chatRequest({
          conversation_id: `c-${Date.now()}`,
          project_id: "p1",
          messages: [
            {
              role: "assistant",
              parts: [{ type: "tool-request_user_image", state: "output-available", toolCallId: "c1", output: { skipped: true } }],
            },
          ],
        }),
    );
    expect(res.status).toBe(200);
    expect(streamTextMock).toHaveBeenCalledTimes(1);
    expect(appendMessageMock).toHaveBeenCalledTimes(1);
  });
});
