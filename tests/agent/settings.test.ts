import { describe, it, expect } from "vitest";
import { ensureMcpApiKey, getMcpApiKey, regenerateMcpApiKey } from "@/lib/settings";

describe("MCP API key", () => {
  it("auto-generates on first ensureMcpApiKey", () => {
    const key1 = ensureMcpApiKey();
    expect(key1).toMatch(/^tg_[a-f0-9]{64}$/);
    const key2 = ensureMcpApiKey();
    expect(key2).toBe(key1);
  });

  it("regenerates on demand", () => {
    const before = ensureMcpApiKey();
    const after = regenerateMcpApiKey();
    expect(after).not.toBe(before);
    expect(getMcpApiKey()).toBe(after);
  });
});
