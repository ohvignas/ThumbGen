import { describe, it, expect } from "vitest";
import { readSkillBody } from "@/lib/agent/skills/catalog";
import { AGENT_SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { SCRATCH_VS_ADJUST } from "@/lib/prompt-engineering";

const SKILLS = [
  "create-prompt",
  "existing-workflow",
  "thumbnail-packaging",
  "apply_workflow",
  "place_node",
  "generate_sketch",
] as const;

const FORBIDDEN = [
  "A/B = two short deltas",
  "A/B adjust = two short",
  "A/B on an adjustment",
  "for an A/B adjust",
  "A/B adjust needs two complete",
];

describe("two intents — A/B is not short prompts", () => {
  it("never tells the agent that A/B means short prompts", () => {
    const bodies = SKILLS.map((name) => readSkillBody(name) ?? "");
    for (const text of [...bodies, AGENT_SYSTEM_PROMPT, SCRATCH_VS_ADJUST]) {
      for (const phrase of FORBIDDEN) {
        expect(text).not.toContain(phrase);
      }
    }
  });

  it("says first-gen A/B uses complete prompts and iterate uses a short delta", () => {
    expect(SCRATCH_VS_ADJUST).toMatch(/COMPLETE alternative prompts/i);
    expect(SCRATCH_VS_ADJUST).toMatch(/Short prompts fire only when ITERATING/i);
    expect(readSkillBody("apply_workflow")).toMatch(/variant slots/i);
    expect(readSkillBody("existing-workflow")).toMatch(/currentThumbnails/);
    expect(readSkillBody("create-prompt")).toMatch(/First-gen A\/B = two complete/);
    expect(readSkillBody("thumbnail-packaging")).toMatch(/two complete 7-sentence prompts/);
    expect(readSkillBody("place_node")).toMatch(/A\/B is variant slots/);
    expect(readSkillBody("generate_sketch")).toMatch(/First-gen A\/B = one full anatomy/);
  });
});
