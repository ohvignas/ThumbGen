import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/agent/llm-client", () => ({
  getOpenRouterClient: vi.fn(),
}));
vi.mock("@/lib/agent/conversation/store", () => ({
  appendMessage: vi.fn(),
  listMessages: vi.fn().mockReturnValue([]),
}));
vi.mock("@/lib/agent/conversation/auto-title", () => ({
  generateAndPersistTitle: vi.fn(),
}));
vi.mock("@/lib/agent/mcp/in-memory-client", () => ({
  getInMemoryMcpClient: vi.fn().mockResolvedValue({
    listTools: () => Promise.resolve({ tools: [] }),
    callTool: vi.fn(),
  }),
}));
vi.mock("@/lib/agent/system-prompt", () => ({
  buildSystemMessages: () => [{ type: "text", text: "system" }],
}));
vi.mock("@/lib/settings", () => ({
  getSetting: vi.fn().mockReturnValue(""),
}));
vi.mock("@/lib/agent/gc", () => ({
  startGcLoop: vi.fn(),
}));
vi.mock("@/lib/agent/pending-actions", () => ({
  registerPending: vi.fn(),
  abandonPending: vi.fn(),
}));

import { getOpenRouterClient } from "@/lib/agent/llm-client";
import { runAgentLoop } from "@/lib/agent/loop";

function asyncIterable<T>(items: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const i of items) yield i;
    },
  };
}

describe("runAgentLoop on OpenRouter", () => {
  beforeEach(() => {
    vi.mocked(getOpenRouterClient).mockReset();
  });

  it("emits text_delta and done when the model returns plain text", async () => {
    const create = vi.fn().mockResolvedValue(
      asyncIterable([
        { choices: [{ delta: { content: "hello " } }] },
        { choices: [{ delta: { content: "world" } }] },
        { choices: [{ delta: {} }], usage: { prompt_tokens: 12, completion_tokens: 3 } },
      ]),
    );
    vi.mocked(getOpenRouterClient).mockReturnValue({
      chat: { completions: { create } },
    } as never);

    const events: Array<{ event: string; data: unknown }> = [];
    await runAgentLoop({
      conversation_id: "c1",
      project_id: "p1",
      message: { text: "hi" },
      canvas_snapshot: {},
      abort: new AbortController().signal,
      send: (event, data) => events.push({ event, data }),
    });

    const deltas = events.filter((e) => e.event === "text_delta");
    expect(deltas).toHaveLength(2);
    expect(events.some((e) => e.event === "done")).toBe(true);
  });

  it("emits an error when no OpenRouter key is configured", async () => {
    vi.mocked(getOpenRouterClient).mockReturnValue(null);
    const events: Array<{ event: string; data: unknown }> = [];
    await runAgentLoop({
      conversation_id: "c1",
      project_id: "p1",
      message: { text: "hi" },
      canvas_snapshot: {},
      abort: new AbortController().signal,
      send: (event, data) => events.push({ event, data }),
    });
    const err = events.find((e) => e.event === "error");
    expect(err).toBeDefined();
    expect((err!.data as { message: string }).message).toMatch(/OpenRouter/i);
  });
});
