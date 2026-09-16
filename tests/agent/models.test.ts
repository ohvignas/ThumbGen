import { describe, it, expect } from "vitest";
import { AGENT_MODELS, getModelById, DEFAULT_AGENT_MODEL } from "@/lib/agent/models";

describe("AGENT_MODELS", () => {
  it("has claude sonnet 4.6 as the default", () => {
    // Gemini models hit a "corrupted thought signature" failure on
    // multi-image tool results — see the comment above DEFAULT_AGENT_MODEL.
    expect(DEFAULT_AGENT_MODEL).toBe("anthropic/claude-sonnet-4.6");
    expect(getModelById(DEFAULT_AGENT_MODEL)).toBeDefined();
  });

  it("returns the model entry with pricing for a known id", () => {
    const m = getModelById("anthropic/claude-sonnet-4.6");
    expect(m).toBeDefined();
    expect(m!.label).toMatch(/sonnet/i);
    expect(m!.pricing.inputPerM).toBeGreaterThan(0);
    expect(m!.pricing.outputPerM).toBeGreaterThan(0);
  });

  it("returns undefined for an unknown id", () => {
    expect(getModelById("nope/nope")).toBeUndefined();
  });

  it("supportsThinking is set per model", () => {
    expect(getModelById("anthropic/claude-sonnet-4.6")!.supportsThinking).toBe(true);
    expect(getModelById("openai/gpt-5")!.supportsThinking).toBe(false);
  });
});
