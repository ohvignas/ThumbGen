import { describe, it, expect, vi } from "vitest";

// Stub out the ESM-incompatible youtube-transcript package and the Anthropic SDK
// so this file can import the real chat route (which now pulls in runAgentLoop).
vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: vi.fn(async () => ({ content: [], stop_reason: "end_turn", usage: {} })) };
  },
}));
vi.mock("@/lib/agent/mcp/in-memory-client", () => ({
  getInMemoryMcpClient: async () => ({
    listTools: async () => ({ tools: [] }),
    callTool: async () => ({ content: [] }),
  }),
}));

async function readSseEvents(res: Response): Promise<Array<{ event: string; data: unknown }>> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: Array<{ event: string; data: unknown }> = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const lines = block.split("\n");
      const event = lines.find((l) => l.startsWith("event: "))?.slice(7) ?? "message";
      const dataLine = lines.find((l) => l.startsWith("data: "))?.slice(6) ?? "{}";
      events.push({ event, data: JSON.parse(dataLine) });
    }
  }
  return events;
}

describe("/api/agent/chat (skeleton)", () => {
  it("returns 400 when conversation_id is missing", async () => {
    const { POST } = await import("@/app/api/agent/chat/route");
    const res = await POST(
      new Request("http://localhost/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project_id: "p" }),
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("streams SSE events (error when no API key, but SSE transport works)", async () => {
    const { POST } = await import("@/app/api/agent/chat/route");
    const res = await POST(
      new Request("http://localhost/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversation_id: "c1",
          project_id: "p1",
          message: { text: "hi" },
          canvas_snapshot: { nodes: [], edges: [] },
        }),
      }) as never,
    );
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    // With no API key seeded and no ANTHROPIC_API_KEY env var,
    // the loop emits an "error" event. The SSE pipe itself works correctly.
    const events = await readSseEvents(res);
    expect(events.length).toBeGreaterThan(0);
  });
});

describe("/api/agent/chat/tool-result", () => {
  it("returns accepted=false for unknown tool_use_id", async () => {
    const { POST } = await import("@/app/api/agent/chat/tool-result/route");
    const res = await POST(
      new Request("http://localhost/api/agent/chat/tool-result", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tool_use_id: "nope", result: {} }),
      }) as never,
    );
    const body = await res.json();
    expect(body.accepted).toBe(false);
  });

  it("resolves a pending action end-to-end", async () => {
    const { registerPending } = await import("@/lib/agent/pending-actions");
    const { POST } = await import("@/app/api/agent/chat/tool-result/route");

    const p = registerPending<{ x: number }>("e2e-1");
    const res = await POST(
      new Request("http://localhost/api/agent/chat/tool-result", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tool_use_id: "e2e-1", result: { x: 42 } }),
      }) as never,
    );
    const body = await res.json();
    expect(body.accepted).toBe(true);
    await expect(p).resolves.toEqual({ x: 42 });
  });

  it("returns 400 without tool_use_id", async () => {
    const { POST } = await import("@/app/api/agent/chat/tool-result/route");
    const res = await POST(
      new Request("http://localhost/api/agent/chat/tool-result", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ result: {} }),
      }) as never,
    );
    expect(res.status).toBe(400);
  });
});
