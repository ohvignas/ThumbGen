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
    expect(blocks[1].text).toContain('"id": "p-1"');
  });
});
