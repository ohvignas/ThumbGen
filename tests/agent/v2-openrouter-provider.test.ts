import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = {
  createOpenRouter: vi.fn(),
};

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: (opts: { apiKey: string }) => mocks.createOpenRouter(opts),
}));

import { setSetting } from "@/lib/settings";
import { getOpenRouterProvider } from "@/lib/agent/v2/openrouter-provider";

describe("getOpenRouterProvider", () => {
  beforeEach(() => {
    mocks.createOpenRouter.mockClear();
    mocks.createOpenRouter.mockImplementation((opts: { apiKey: string }) => ({ __apiKey: opts.apiKey }));
  });

  it("returns null when no API key is configured", () => {
    const prevEnv = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    setSetting("openrouterApiKey", "");
    expect(getOpenRouterProvider()).toBeNull();
    if (prevEnv !== undefined) process.env.OPENROUTER_API_KEY = prevEnv;
  });

  it("creates a fresh provider from the CURRENT setting on every call — no caching", () => {
    setSetting("openrouterApiKey", "key-A");
    getOpenRouterProvider();
    expect(mocks.createOpenRouter).toHaveBeenLastCalledWith(
      expect.objectContaining({ apiKey: "key-A" }),
    );

    setSetting("openrouterApiKey", "key-B");
    getOpenRouterProvider();
    expect(mocks.createOpenRouter).toHaveBeenLastCalledWith(
      expect.objectContaining({ apiKey: "key-B" }),
    );

    expect(mocks.createOpenRouter).toHaveBeenCalledTimes(2);
  });
});
