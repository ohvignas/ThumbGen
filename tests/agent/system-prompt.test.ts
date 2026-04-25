import { describe, it, expect } from "vitest";
import { AGENT_SYSTEM_PROMPT, buildSystemMessages } from "@/lib/agent/system-prompt";

describe("system prompt", () => {
  it("contains the persona and the canvas_state instruction", () => {
    expect(AGENT_SYSTEM_PROMPT).toContain("ThumbGen Brainstorm");
    expect(AGENT_SYSTEM_PROMPT).toContain("<canvas_state>");
  });

  it("buildSystemMessages returns persona block with ephemeral cache + canvas block without", () => {
    const blocks = buildSystemMessages({ nodes: [], edges: [] });
    expect(blocks).toHaveLength(2);
    expect(blocks[0].cache_control).toEqual({ type: "ephemeral" });
    expect(blocks[1].cache_control).toBeUndefined();
    expect(blocks[1].text).toContain("<canvas_state>");
    expect(blocks[1].text).toContain('"nodes": []');
  });

  it("snapshot serialization preserves node ids", () => {
    const blocks = buildSystemMessages({
      nodes: [{ id: "p-1", type: "prompt", summary: { prompt: "hi" } }],
      edges: [],
    });
    expect(blocks.at(-1)!.text).toContain('"id": "p-1"');
  });

  it("injects project_id as a separate block when provided", () => {
    const blocks = buildSystemMessages({ nodes: [], edges: [] }, "proj-abc");
    expect(blocks).toHaveLength(3);
    expect(blocks[1].text).toContain("<project_id>proj-abc</project_id>");
    expect(blocks[1].text).toMatch(/Pass it as the `project_id` argument/);
    // canvas_state stays last
    expect(blocks[2].text).toContain("<canvas_state>");
  });

  it("omits the project_id block when no projectId given (back-compat)", () => {
    const blocks = buildSystemMessages({ nodes: [], edges: [] });
    expect(blocks).toHaveLength(2);
    expect(blocks.some((b) => b.text.includes("<project_id>"))).toBe(false);
  });
});
