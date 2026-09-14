import { describe, it, expect } from "vitest";
import { setSetting } from "@/lib/settings";
import { webSearchProviderOptions } from "@/lib/agent/v2/web-search-tool";

describe("webSearchProviderOptions", () => {
  it("is enabled by default (agentWebSearch unset)", () => {
    setSetting("agentWebSearch", "");
    expect(webSearchProviderOptions()).toEqual({ web_search_options: {} });
  });

  it("is disabled when agentWebSearch is '0'", () => {
    setSetting("agentWebSearch", "0");
    expect(webSearchProviderOptions()).toBeUndefined();
  });
});
