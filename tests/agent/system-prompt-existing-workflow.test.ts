import { describe, it, expect } from "vitest";
import { AGENT_SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { readSkillBody } from "@/lib/agent/skills/catalog";

describe("system prompt — existing workflow", () => {
  it("points to the existing-workflow skill instead of inlining a numbered playbook", () => {
    expect(AGENT_SYSTEM_PROMPT).toContain("read_skill existing-workflow");
    expect(AGENT_SYSTEM_PROMPT).toContain("<canvas_state>");
    expect(AGENT_SYSTEM_PROMPT).toMatch(/precise request/i);
    expect(AGENT_SYSTEM_PROMPT).toContain("other nodes are kept automatically");
    expect(AGENT_SYSTEM_PROMPT).toContain("short change-only prompt");
    expect(AGENT_SYSTEM_PROMPT).toContain("FROM SCRATCH only");
    expect(AGENT_SYSTEM_PROMPT).toContain("currentThumbnails");
    expect(AGENT_SYSTEM_PROMPT).toContain("two complete alternative prompts");
    expect(AGENT_SYSTEM_PROMPT).not.toContain("THUMBNAIL JOURNEY —");
    expect(AGENT_SYSTEM_PROMPT).not.toContain("- IMMEDIATELY call apply_workflow with the COMPLETE blueprint (don't ask first):");
  });

  it("puts the playbook in the existing-workflow skill body", () => {
    const text = readSkillBody("existing-workflow") ?? "";
    expect(text).toContain("view_canvas_images");
    expect(text).toContain("remove_node_ids");
    expect(text).toMatch(/stored:gi_/);
    expect(text).toContain("short change-only prompt");
    expect(text).toContain("7-sentence scene recreation");
  });
});
