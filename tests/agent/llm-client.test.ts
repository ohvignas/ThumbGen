import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("openai", () => {
  const ctor = vi.fn();
  return { default: ctor };
});

vi.mock("@/lib/settings", () => ({
  getSetting: vi.fn(),
}));

import OpenAI from "openai";
import { getSetting } from "@/lib/settings";
import { getOpenRouterClient } from "@/lib/agent/llm-client";

describe("getOpenRouterClient", () => {
  beforeEach(() => {
    vi.mocked(OpenAI).mockClear();
    vi.mocked(getSetting).mockReset();
  });

  it("constructs an OpenAI client pointing at openrouter with the configured key", () => {
    vi.mocked(getSetting).mockReturnValue("sk-or-v1-test");
    getOpenRouterClient();
    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "sk-or-v1-test",
        baseURL: "https://openrouter.ai/api/v1",
      }),
    );
  });

  it("returns null when no key is configured", () => {
    vi.mocked(getSetting).mockReturnValue("");
    expect(getOpenRouterClient()).toBeNull();
  });

  it("includes ThumbGen attribution headers", () => {
    vi.mocked(getSetting).mockReturnValue("sk-or-v1-test");
    getOpenRouterClient();
    const call = vi.mocked(OpenAI).mock.calls[0][0] as { defaultHeaders?: Record<string, string> };
    expect(call.defaultHeaders?.["HTTP-Referer"]).toMatch(/thumbgen/i);
    expect(call.defaultHeaders?.["X-Title"]).toBe("ThumbGen");
  });
});
