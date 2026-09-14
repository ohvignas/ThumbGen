import { describe, it, expect } from "vitest";
import { v4 as uuid } from "uuid";
import { createConversation, listMessages } from "@/lib/agent/conversation/store";
import { persistAssistantTurn, estimateCost } from "@/lib/agent/v2/persist-turn";
import type { AgentModel } from "@/lib/agent/models";

const FAKE_MODEL: AgentModel = {
  id: "test/model",
  label: "Test",
  provider: "openai",
  supportsThinking: false,
  pricing: { inputPerM: 2, outputPerM: 10, cachedInputPerM: 0.5 },
};

describe("estimateCost", () => {
  it("computes input+output cost from per-million pricing", () => {
    expect(estimateCost(FAKE_MODEL, 1_000_000, 1_000_000)).toBeCloseTo(12);
  });

  it("returns 0 for an unknown model", () => {
    expect(estimateCost(undefined, 1000, 1000)).toBe(0);
  });
});

describe("persistAssistantTurn", () => {
  it("writes one assistant row with totalUsage-based cost", () => {
    const conv = createConversation(`test-v2-persist-${uuid()}`);
    persistAssistantTurn({
      conversationId: conv.id,
      responseMessages: [{ role: "assistant", content: "hi" }],
      totalUsage: { inputTokens: 500_000, outputTokens: 100_000 },
      finishReason: "stop",
      modelInfo: FAKE_MODEL,
    });
    const rows = listMessages(conv.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("assistant");
    expect(rows[0].total_input_tokens).toBe(500_000);
    expect(rows[0].total_output_tokens).toBe(100_000);
    expect(rows[0].cost_estimate).toBeCloseTo(0.5 * 2 + 0.1 * 10); // 2.0
    expect(rows[0].interrupted).toBe(0);
  });

  it("marks interrupted=1 when finishReason is 'aborted'", () => {
    const conv = createConversation(`test-v2-persist-${uuid()}`);
    persistAssistantTurn({
      conversationId: conv.id,
      responseMessages: [],
      totalUsage: {},
      finishReason: "aborted",
      modelInfo: undefined,
    });
    expect(listMessages(conv.id)[0].interrupted).toBe(1);
    expect(listMessages(conv.id)[0].cost_estimate).toBe(0);
  });
});
