import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDb } from "@/lib/db";

const messagesCreateMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: messagesCreateMock };
  },
}));

vi.mock("@/lib/agent/mcp/in-memory-client", () => ({
  getInMemoryMcpClient: async () => ({
    listTools: async () => ({
      tools: [
        {
          name: "list_logos",
          description: "Lists logos",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    }),
    callTool: async ({ name }: { name: string; arguments: unknown }) => {
      if (name === "list_logos") return { content: [{ type: "text", text: "0 logos" }] };
      throw new Error("Unknown tool: " + name);
    },
  }),
}));

beforeEach(() => {
  messagesCreateMock.mockReset();
  // Seed an Anthropic API key so the loop doesn't bail early
  getDb()
    .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
    .run("anthropicApiKey", "sk-test");
  // Seed a conversation for FK integrity
  getDb()
    .prepare(
      "INSERT OR REPLACE INTO conversations (id, project_id, title) VALUES (?, ?, ?)",
    )
    .run("c-loop", "p-loop", "Loop test");
});

function makeSendCollector() {
  const events: Array<{ event: string; data: unknown }> = [];
  const send = (event: string, data: unknown) => events.push({ event, data });
  return { events, send };
}

describe("runAgentLoop", () => {
  it("emits text_delta then done on a single end_turn response", async () => {
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: "text", text: "Bonjour" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const { runAgentLoop } = await import("@/lib/agent/loop");
    const { events, send } = makeSendCollector();
    await runAgentLoop({
      conversation_id: "c-loop",
      project_id: "p-loop",
      message: { text: "Salut" },
      canvas_snapshot: { nodes: [], edges: [] },
      abort: new AbortController().signal,
      send,
    });

    expect(events.find((e) => e.event === "text_delta")).toEqual({
      event: "text_delta",
      data: { content: "Bonjour" },
    });
    expect(events.at(-1)?.event).toBe("done");
  });

  it("dispatches an MCP tool call and feeds tool_result back", async () => {
    messagesCreateMock
      .mockResolvedValueOnce({
        content: [
          { type: "text", text: "Je vais chercher tes logos." },
          { type: "tool_use", id: "tu-1", name: "list_logos", input: {} },
        ],
        stop_reason: "tool_use",
        usage: { input_tokens: 20, output_tokens: 8 },
      })
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "Tu n'as pas de logos." }],
        stop_reason: "end_turn",
        usage: { input_tokens: 25, output_tokens: 6 },
      });

    const { runAgentLoop } = await import("@/lib/agent/loop");
    const { events, send } = makeSendCollector();
    await runAgentLoop({
      conversation_id: "c-loop",
      project_id: "p-loop",
      message: { text: "Liste mes logos" },
      canvas_snapshot: { nodes: [], edges: [] },
      abort: new AbortController().signal,
      send,
    });

    const toolCall = events.find((e) => e.event === "tool_call");
    expect(toolCall).toBeTruthy();
    expect((toolCall!.data as { name: string }).name).toBe("list_logos");

    const toolResult = events.find((e) => e.event === "tool_result");
    expect(toolResult).toBeTruthy();

    expect(events.at(-1)?.event).toBe("done");
    expect(messagesCreateMock).toHaveBeenCalledTimes(2);
  });

  it("emits ui_tool_request and waits for browser response", async () => {
    messagesCreateMock
      .mockResolvedValueOnce({
        content: [
          {
            type: "tool_use",
            id: "ui-1",
            name: "request_user_image",
            input: { reason: "Need a face" },
          },
        ],
        stop_reason: "tool_use",
        usage: { input_tokens: 5, output_tokens: 3 },
      })
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "Merci !" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 4 },
      });

    const { runAgentLoop } = await import("@/lib/agent/loop");
    const { resolvePending, _clearPending } = await import("@/lib/agent/pending-actions");
    _clearPending();

    const { events, send } = makeSendCollector();
    const ac = new AbortController();
    const loopPromise = runAgentLoop({
      conversation_id: "c-loop",
      project_id: "p-loop",
      message: { text: "Ajoute un visage" },
      canvas_snapshot: { nodes: [], edges: [] },
      abort: ac.signal,
      send,
    });

    // Wait for the ui_tool_request to be emitted before resolving
    await new Promise((r) => setTimeout(r, 50));

    const uiReq = events.find((e) => e.event === "ui_tool_request");
    expect(uiReq).toBeTruthy();

    // Simulate the browser responding
    expect(resolvePending("ui-1", { skipped: true })).toBe(true);

    await loopPromise;

    expect(events.find((e) => e.event === "ui_tool_response_ack")).toBeTruthy();
    expect(events.at(-1)?.event).toBe("done");
  });

  it("returns early on missing API key", async () => {
    getDb().prepare("DELETE FROM settings WHERE key = ?").run("anthropicApiKey");
    delete process.env.ANTHROPIC_API_KEY;

    const { runAgentLoop } = await import("@/lib/agent/loop");
    const { events, send } = makeSendCollector();
    await runAgentLoop({
      conversation_id: "c-loop",
      project_id: "p-loop",
      message: { text: "x" },
      canvas_snapshot: {},
      abort: new AbortController().signal,
      send,
    });

    expect(events.find((e) => e.event === "error")).toBeTruthy();
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });
});
