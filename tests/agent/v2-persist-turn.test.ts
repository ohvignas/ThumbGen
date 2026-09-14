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

  it("marks interrupted=1 when the explicit `interrupted` flag is set (the onAbort path)", () => {
    // Real ai@7.0.99 has no "aborted" FinishReason — streamText's onAbort
    // callback doesn't even receive a finishReason (see GenerateTextAbortEvent).
    // persistAssistantTurn must rely on the explicit `interrupted` flag, not
    // on any particular finishReason string.
    const conv = createConversation(`test-v2-persist-${uuid()}`);
    persistAssistantTurn({
      conversationId: conv.id,
      responseMessages: [],
      totalUsage: {},
      finishReason: "aborted",
      interrupted: true,
      modelInfo: undefined,
    });
    expect(listMessages(conv.id)[0].interrupted).toBe(1);
    expect(listMessages(conv.id)[0].cost_estimate).toBe(0);
  });

  it("does NOT mark interrupted=1 from finishReason alone", () => {
    // Regression guard: the real ai SDK FinishReason union
    // ('stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other')
    // never contains "aborted", so a finishReason string can never be a
    // reliable signal for "this turn was interrupted" — only the explicit
    // `interrupted` flag may set it.
    const conv = createConversation(`test-v2-persist-${uuid()}`);
    persistAssistantTurn({
      conversationId: conv.id,
      responseMessages: [{ role: "assistant", content: "hi" }],
      totalUsage: { inputTokens: 10, outputTokens: 5 },
      finishReason: "stop",
      modelInfo: undefined,
    });
    expect(listMessages(conv.id)[0].interrupted).toBe(0);
  });
});
