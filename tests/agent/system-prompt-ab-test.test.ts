import { describe, it, expect } from "vitest";
import { AGENT_SYSTEM_PROMPT } from "@/lib/agent/system-prompt";

describe("system prompt — A/B/C test", () => {
  it("builds one generator with abTest when the user picks 2 or 3 angles", () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('abTest: { variants: ["A","B"] }');
    expect(AGENT_SYSTEM_PROMPT).toContain('abTest: { variants: ["A","B","C"] }');
    expect(AGENT_SYSTEM_PROMPT).not.toContain("SEPARATE prompt + generator pair");
  });

  it("wires shared inputs once and per-variant inputs on the -b / -c handles", () => {
    for (const handle of ["face-in", "logo-in", "prompt-in-b", "prompt-in-c", "sketch-in-b", "ref-in-c"]) {
      expect(AGENT_SYSTEM_PROMPT).toContain(`"${handle}"`);
    }
  });

  it("caps a test at 3 variants, like YouTube Studio", () => {
    expect(AGENT_SYSTEM_PROMPT).toContain("YouTube Studio");
    expect(AGENT_SYSTEM_PROMPT).toContain("up to 3 thumbnails");
    expect(AGENT_SYSTEM_PROMPT).toContain("at most 3 variants");
  });
});
