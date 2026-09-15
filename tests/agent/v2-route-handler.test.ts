import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

const appendMessageMock = vi.fn((..._args: unknown[]) => undefined);
const listMessagesMock = vi.fn((..._args: unknown[]) => [] as unknown[]);
vi.mock("@/lib/agent/conversation/store", () => ({
  appendMessage: (...args: unknown[]) => appendMessageMock(...args),
  listMessages: (...args: unknown[]) => listMessagesMock(...args),
}));

const resolveImageSourceMock = vi.fn(async (..._args: unknown[]) => ({
  mimeType: "image/jpeg",
  bytes: Buffer.from(""),
}));
vi.mock("@/lib/agent/tools/_helpers/image-source", () => ({
  resolveImageSource: (...args: unknown[]) => resolveImageSourceMock(...args),
}));

vi.mock("@/lib/agent/v2/persist-turn", () => ({
  persistAssistantTurn: vi.fn(),
}));

const streamTextMock = vi.fn();
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, streamText: (opts: unknown) => streamTextMock(opts) };
});

import "@/lib/agent/tools/all";
import { setSetting } from "@/lib/settings";

// Matches what a real streamText() call returns, as far as postV2 touches it:
// a UI-stream response factory plus consumeStream() (finding #5's disconnect
// fix — postV2 now calls this unconditionally after streamText()).
function makeStreamResult() {
  return {
    toUIMessageStreamResponse: () =>
      new Response("ok", { headers: { "content-type": "text/event-stream" } }),
    consumeStream: vi.fn(async () => {}),
  };
}

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
    streamTextMock.mockClear();
    appendMessageMock.mockClear();
    listMessagesMock.mockClear();
    listMessagesMock.mockReturnValue([]);
    resolveImageSourceMock.mockClear();
    resolveImageSourceMock.mockImplementation(async () => ({
      mimeType: "image/jpeg",
      bytes: Buffer.from(""),
    }));
  });

  it("returns 400 when conversation_id is missing", async () => {
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    const res = await postV2(
      new Request("http://localhost/api/agent/chat", {
        method: "POST",
        body: JSON.stringify({ project_id: "p" }),
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when no OpenRouter API key is configured", async () => {
    const prevEnv = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    setSetting("openrouterApiKey", "");
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    const res = await postV2(
      new Request("http://localhost/api/agent/chat", {
        method: "POST",
        body: JSON.stringify({ conversation_id: "c1", project_id: "p1", messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }),
      }) as never,
    );
    expect(res.status).toBe(400);
    if (prevEnv !== undefined) process.env.OPENROUTER_API_KEY = prevEnv;
  });

  it("wires registry tools + the client tool into streamText, with stopWhen set", async () => {
    setSetting("openrouterApiKey", "test-key");
    streamTextMock.mockReturnValue(makeStreamResult());
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    const res = await postV2(
      new Request("http://localhost/api/agent/chat", {
        method: "POST",
        body: JSON.stringify({
          conversation_id: `c-${Date.now()}`,
          project_id: "p1",
          messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }],
          canvas_snapshot: { nodes: [], edges: [] },
        }),
      }) as never,
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
    streamTextMock.mockReturnValue(makeStreamResult());
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    await postV2(
      new Request("http://localhost/api/agent/chat", {
        method: "POST",
        body: JSON.stringify({
          conversation_id: `c-${Date.now()}`,
          project_id: "p1",
          messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }],
        }),
      }) as never,
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

  it("calls result.consumeStream() so persistence still happens if the client disconnects mid-stream (finding #5)", async () => {
    setSetting("openrouterApiKey", "test-key");
    const streamResult = makeStreamResult();
    streamTextMock.mockReturnValue(streamResult);
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    await postV2(
      new Request("http://localhost/api/agent/chat", {
        method: "POST",
        body: JSON.stringify({
          conversation_id: `c-${Date.now()}`,
          project_id: "p1",
          messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }],
        }),
      }) as never,
    );
    expect(streamResult.consumeStream).toHaveBeenCalledTimes(1);
  });

  it("returns a clean 400 (not an unhandled exception) when an attachment source doesn't resolve (finding #9)", async () => {
    setSetting("openrouterApiKey", "test-key");
    streamTextMock.mockReturnValue(makeStreamResult());
    resolveImageSourceMock.mockImplementation(async () => {
      throw new Error("Image not found: stored:fr_nonexistent");
    });
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    const res = await postV2(
      new Request("http://localhost/api/agent/chat", {
        method: "POST",
        body: JSON.stringify({
          conversation_id: `c-${Date.now()}`,
          project_id: "p1",
          messages: [{ role: "user", parts: [{ type: "text", text: "look at this" }] }],
          attachments: [{ type: "image", source: "stored:fr_nonexistent" }],
        }),
      }) as never,
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
    streamTextMock.mockReturnValue(makeStreamResult());
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
      new Request("http://localhost/api/agent/chat", {
        method: "POST",
        body: JSON.stringify({
          conversation_id: "c-old-format",
          project_id: "p1",
          messages: [{ role: "user", parts: [{ type: "text", text: "continue" }] }],
        }),
      }) as never,
    );
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text.toLowerCase()).toContain("migrat");
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("proceeds normally when prior history is already ModelMessage-shaped", async () => {
    setSetting("openrouterApiKey", "test-key");
    streamTextMock.mockReturnValue(makeStreamResult());
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
      new Request("http://localhost/api/agent/chat", {
        method: "POST",
        body: JSON.stringify({
          conversation_id: "c-migrated-format",
          project_id: "p1",
          messages: [{ role: "user", parts: [{ type: "text", text: "continue" }] }],
        }),
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(streamTextMock).toHaveBeenCalledTimes(1);
    const callArgs = streamTextMock.mock.calls[0][0] as { messages: Array<{ role: string }> };
    // The two prior (already-migrated) rows plus the new user turn.
    expect(callArgs.messages.length).toBe(3);
  });
});
