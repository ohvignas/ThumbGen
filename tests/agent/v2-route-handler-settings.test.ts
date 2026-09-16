import { describe, it, expect, vi, beforeEach } from "vitest";

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

const generateAndPersistTitleMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@/lib/agent/conversation/auto-title", () => ({
  generateAndPersistTitle: (...args: unknown[]) => generateAndPersistTitleMock(...args),
}));

const streamTextMock = vi.fn();
const isStepCountMock = vi.fn();
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    streamText: (opts: unknown) => streamTextMock(opts),
    isStepCount: (count: number) => {
      isStepCountMock(count);
      return actual.isStepCount(count);
    },
  };
});

import { getDb } from "@/lib/db";
import { setSetting, updateSettings } from "@/lib/settings";

type StreamArgs = {
  system: string;
  providerOptions: { openrouter: { reasoning?: { effort: string } } };
};

function streamResult() {
  return {
    toUIMessageStreamResponse: () => new Response("ok", { headers: { "content-type": "text/event-stream" } }),
    consumeStream: vi.fn(async () => {}),
  };
}

async function send(text = "hi") {
  const { postV2 } = await import("@/lib/agent/v2/route-handler");
  return postV2(
    new Request("http://localhost/api/agent/chat", {
      method: "POST",
      body: JSON.stringify({
        conversation_id: `c-${Math.random().toString(36).slice(2)}`,
        project_id: "p1",
        messages: [{ role: "user", parts: [{ type: "text", text }] }],
        canvas_snapshot: { nodes: [], edges: [] },
      }),
    }) as never,
  );
}

function streamArgs(): StreamArgs {
  return streamTextMock.mock.calls[0][0] as StreamArgs;
}

describe("postV2 reads the agent settings", () => {
  beforeEach(() => {
    getDb().exec("DELETE FROM settings");
    setSetting("openrouterApiKey", "test-key");
    streamTextMock.mockReset();
    streamTextMock.mockReturnValue(streamResult());
    isStepCountMock.mockClear();
    generateAndPersistTitleMock.mockClear();
  });

  it("sends the configured reasoning effort to a thinking model", async () => {
    updateSettings({ agentModel: "anthropic/claude-sonnet-4.6", agentReasoningEffort: "high" });
    await send();
    expect(streamArgs().providerOptions.openrouter.reasoning).toEqual({ effort: "high" });
  });

  it("defaults the reasoning effort to medium", async () => {
    await send();
    expect(streamArgs().providerOptions.openrouter.reasoning).toEqual({ effort: "medium" });
  });

  it("sends no reasoning option to a model without thinking support", async () => {
    updateSettings({ agentModel: "openai/gpt-5", agentReasoningEffort: "high" });
    await send();
    expect(streamArgs().providerOptions.openrouter.reasoning).toBeUndefined();
  });

  it("uses agentMaxSteps as the step limit, 25 by default", async () => {
    await send();
    expect(isStepCountMock).toHaveBeenLastCalledWith(25);
    streamTextMock.mockClear();
    updateSettings({ agentMaxSteps: 12 });
    await send();
    expect(isStepCountMock).toHaveBeenLastCalledWith(12);
  });

  it("auto-titles the first turn by default", async () => {
    await send("Une miniature gaming néon");
    expect(generateAndPersistTitleMock).toHaveBeenCalledTimes(1);
  });

  it("skips the auto-title when agentAutoTitle is off", async () => {
    updateSettings({ agentAutoTitle: false });
    await send("Une miniature gaming néon");
    expect(generateAndPersistTitleMock).not.toHaveBeenCalled();
  });

  it("adds the response language block to the system prompt", async () => {
    updateSettings({ agentResponseLanguage: "en" });
    await send();
    expect(streamArgs().system).toContain("<response_language>");
    expect(streamArgs().system).toContain("Reply to the user in English");
  });
});
