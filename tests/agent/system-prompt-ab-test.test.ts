import { describe, it, expect } from "vitest";
import { AGENT_SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { readSkillBody } from "@/lib/agent/skills/catalog";

describe("A/B/C test wiring", () => {
  it("lives on apply_workflow, not as a 7-step prompt section", () => {
    expect(AGENT_SYSTEM_PROMPT).not.toContain("MULTI-SELECT FOR A/B TESTING");
    const text = readSkillBody("apply_workflow") ?? "";
    expect(text).toMatch(/abTest/);
    expect(text).toContain("prompt-in-b");
    expect(text).toMatch(/3 variants|at most 3/i);
  });
});
