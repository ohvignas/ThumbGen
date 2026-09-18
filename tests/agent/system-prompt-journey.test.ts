import { describe, it, expect } from "vitest";
import { AGENT_SYSTEM_PROMPT, INTERVIEW_PRICE_TABLE, buildSystemMessages } from "@/lib/agent/system-prompt";
import { MODEL_COSTS } from "@/lib/model-costs";
import { readSkillBody } from "@/lib/agent/skills/catalog";

describe("system prompt — no thumbnail journey wizard", () => {
  it("does not ship STEPS 1–7 or Until then", () => {
    expect(AGENT_SYSTEM_PROMPT).not.toContain("THUMBNAIL JOURNEY");
    expect(AGENT_SYSTEM_PROMPT).not.toContain("1. Video and promise");
    expect(AGENT_SYSTEM_PROMPT).not.toContain("Until then:");
    expect(AGENT_SYSTEM_PROMPT).not.toContain("trigger_generation");
    expect(AGENT_SYSTEM_PROMPT).toContain("Aide-moi à construire la miniature de ma vidéo.");
    expect(AGENT_SYSTEM_PROMPT).toContain("read_skill thumbnail-packaging");
  });

  it("still prices generator models for skills/tests", () => {
    expect(INTERVIEW_PRICE_TABLE).toContain("nano-banana");
    expect(MODEL_COSTS["gemini-3.1-flash-image"]).toBe(0.02);
  });

  it("keeps packaging rules in the thumbnail-packaging skill, not a numbered interview", () => {
    const body = readSkillBody("thumbnail-packaging") ?? "";
    expect(body).toMatch(/0.?4 words|4 words/i);
    expect(body).not.toMatch(/STEPS\n1\./);
  });

  it("stays in the cached block", () => {
    const blocks = buildSystemMessages({ nodes: [], edges: [] }, "proj_1");
    expect(blocks[0].text).toContain("SKILLS");
    expect(blocks.slice(1).some((block) => /update_brief|ask_user|place_node/.test(block.text))).toBe(false);
  });
});
