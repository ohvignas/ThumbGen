import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

vi.mock("@/lib/agent/conversation/store", () => ({
  appendMessage: vi.fn(),
  listMessages: vi.fn(() => []),
}));

vi.mock("@/lib/agent/tools/_helpers/image-source", () => ({
  resolveImageSource: vi.fn(async () => ({
    mimeType: "image/jpeg",
    bytes: Buffer.from(""),
  })),
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

describe("postV2", () => {
  beforeEach(() => streamTextMock.mockClear());

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
        body: JSON.stringify({ conversation_id: "c1", project_id: "p1", message: { text: "hi" } }),
      }) as never,
    );
    expect(res.status).toBe(400);
    if (prevEnv !== undefined) process.env.OPENROUTER_API_KEY = prevEnv;
  });

  it("wires registry tools + the client tool into streamText, with stopWhen set", async () => {
    setSetting("openrouterApiKey", "test-key");
    streamTextMock.mockReturnValue({
      toUIMessageStreamResponse: () =>
        new Response("ok", { headers: { "content-type": "text/event-stream" } }),
    });
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    const res = await postV2(
      new Request("http://localhost/api/agent/chat", {
        method: "POST",
        body: JSON.stringify({
          conversation_id: `c-${Date.now()}`,
          project_id: "p1",
          message: { text: "hi" },
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
});
