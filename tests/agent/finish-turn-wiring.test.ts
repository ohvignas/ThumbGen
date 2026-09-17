import { describe, it, expect, vi, beforeEach } from "vitest";
import type { UIMessage } from "ai";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

vi.mock("@/lib/agent/conversation/store", () => ({
  appendMessage: vi.fn(),
  listMessages: vi.fn(() => []),
}));

vi.mock("@/lib/agent/v2/persist-turn", () => ({
  persistAssistantTurn: vi.fn(),
}));

vi.mock("@/lib/agent/conversation/auto-title", () => ({
  generateAndPersistTitle: vi.fn(async () => {}),
}));

// Never call a real model: streamText is replaced, everything else in "ai" stays real.
const streamTextMock = vi.fn();
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, streamText: (opts: unknown) => streamTextMock(opts) };
});

import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import { getTool } from "@/lib/agent/tools";
import { buildAiSdkTools } from "@/lib/agent/v2/tool-adapter";
import { lastAssistantMessageIsCompleteWithClientToolCalls } from "@/components/panels/chat/should-auto-continue";

type Content = Array<{ type: string; text?: string }>;
type StopCondition = (options: { steps: Array<{ toolCalls: Array<{ toolName: string }> }> }) => boolean | PromiseLike<boolean>;

describe("AI SDK tools", () => {
  it("expose finish_turn to the chat model", () => {
    expect(Object.keys(buildAiSdkTools())).toContain("finish_turn");
  });

  it("end a visual tool's successful output with its result_id", async () => {
    const def = getTool("generate_sketch")!;
    const spy = vi.spyOn(def, "handler").mockResolvedValue({
      content: [
        { type: "text", text: "Sketch generated. Reference: generated:sk_abc (cost: $0.040)" },
        { type: "image", mimeType: "image/png", data: "AAA=" },
      ],
    });
    try {
      const tools = buildAiSdkTools();
      const out = (await tools.generate_sketch.execute!({}, { toolCallId: "call_42" } as never)) as { content: Content };
      expect(out.content).toHaveLength(3);
      expect(out.content[0].text).toContain("generated:sk_abc");
      expect(out.content.at(-1)).toEqual({ type: "text", text: "result_id: call_42" });
    } finally {
      spy.mockRestore();
    }
  });

  it("leave failed visual outputs and other tools untouched", async () => {
    const def = getTool("generate_sketch")!;
    const spy = vi.spyOn(def, "handler").mockResolvedValue({ isError: true, content: [{ type: "text", text: "OpenRouter API error 500" }] });
    try {
      const tools = buildAiSdkTools();
      const failed = (await tools.generate_sketch.execute!({}, { toolCallId: "call_1" } as never)) as { content: Content };
      expect(failed.content).toEqual([{ type: "text", text: "OpenRouter API error 500" }]);
      const logos = (await tools.list_logos.execute!({}, { toolCallId: "call_2" } as never)) as { content: Content };
      expect(logos.content.some((c) => c.text?.startsWith("result_id:"))).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("chat route", () => {
  beforeEach(() => {
    getDb().exec("DELETE FROM settings");
    setSetting("openrouterApiKey", "test-key");
    streamTextMock.mockReset();
    streamTextMock.mockReturnValue({
      toUIMessageStreamResponse: () => new Response("ok", { headers: { "content-type": "text/event-stream" } }),
      consumeStream: vi.fn(async () => {}),
    });
  });

  it("stops the tool loop right after a finish_turn step, and only then", async () => {
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    await postV2(
      new Request("http://localhost/api/agent/chat", {
        method: "POST",
        body: JSON.stringify({
          conversation_id: `c-${Math.random().toString(36).slice(2)}`,
          project_id: "p1",
          messages: [{ role: "user", parts: [{ type: "text", text: "Salut" }] }],
          canvas_snapshot: { nodes: [], edges: [] },
        }),
      }) as never,
    );
    const args = streamTextMock.mock.calls[0][0] as { tools: Record<string, unknown>; stopWhen: StopCondition[] };
    expect(Object.keys(args.tools)).toContain("finish_turn");
    expect(Array.isArray(args.stopWhen)).toBe(true);
    const stops = async (toolNames: string[]) => {
      const steps = [{ toolCalls: toolNames.map((toolName) => ({ toolName })) }];
      for (const condition of args.stopWhen) if (await condition({ steps })) return true;
      return false;
    };
    expect(await stops(["finish_turn"])).toBe(true);
    expect(await stops(["generate_sketch", "finish_turn"])).toBe(true);
    expect(await stops(["generate_sketch"])).toBe(false);
  });
});

describe("auto-continuation", () => {
  const assistant = (parts: unknown[]) => [{ id: "m1", role: "assistant", parts } as unknown as UIMessage];

  it("never resumes a turn that ended with finish_turn", () => {
    const messages = assistant([
      { type: "step-start" },
      { type: "tool-generate_sketch", state: "output-available", toolCallId: "c1" },
      { type: "step-start" },
      { type: "tool-finish_turn", state: "output-available", toolCallId: "c2" },
    ]);
    expect(lastAssistantMessageIsCompleteWithClientToolCalls({ messages })).toBe(false);
  });

  it("still resumes when the last step resolved a client request next to finish_turn", () => {
    const messages = assistant([
      { type: "step-start" },
      { type: "tool-request_user_image", state: "output-available", toolCallId: "c1" },
      { type: "tool-finish_turn", state: "output-available", toolCallId: "c2" },
    ]);
    expect(lastAssistantMessageIsCompleteWithClientToolCalls({ messages })).toBe(true);
  });
});
