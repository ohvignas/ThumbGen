import { describe, it, expect } from "vitest";
import { AGENT_SYSTEM_PROMPT, buildSystemMessages } from "@/lib/agent/system-prompt";
import { readSkillBody } from "@/lib/agent/skills/catalog";

describe("system prompt — mentioned images", () => {
  it("tells the model @ / analyze / improve pixels are already attached this turn", () => {
    expect(AGENT_SYSTEM_PROMPT).toContain("@#ID");
    expect(AGENT_SYSTEM_PROMPT).toContain("visibleId");
    expect(AGENT_SYSTEM_PROMPT).toMatch(/already attached/i);
    expect(AGENT_SYSTEM_PROMPT).toContain("view_canvas_images");
    expect(readSkillBody("existing-workflow")).toMatch(/already attached/i);
    expect(readSkillBody("view_canvas_images")).toMatch(/already attached/i);

    const without = buildSystemMessages({ nodes: [], edges: [] }, "proj_1");
    expect(without.some((block) => block.text.startsWith("<mentioned_images>"))).toBe(false);

    const blocks = buildSystemMessages({ nodes: [], edges: [] }, "proj_1", undefined, null, [
      { visibleId: "#P1", image: "stored:gi_p1", imageNode: "prev", label: "Nano #1" },
    ]);
    const mentioned = blocks.find((block) => block.text.startsWith("<mentioned_images>"));
    expect(mentioned?.text).toContain("#P1");
    expect(mentioned?.text).toContain("stored:gi_p1");
    expect(mentioned?.text).toMatch(/already attached/i);
    expect(mentioned?.cache_control).toBeUndefined();
    expect(blocks[0].cache_control).toEqual({ type: "ephemeral" });
  });
});
