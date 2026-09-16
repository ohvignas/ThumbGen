import { describe, it, expect } from "vitest";
import {
  AGENT_SYSTEM_PROMPT,
  DEFAULT_AGENT_PROMPT_PREFS,
  buildResponseLanguageBlock,
  buildSystemMessages,
} from "@/lib/agent/system-prompt";

describe("system prompt", () => {
  it("contains the persona and the canvas_state instruction", () => {
    expect(AGENT_SYSTEM_PROMPT).toContain("ThumbGen Brainstorm");
    expect(AGENT_SYSTEM_PROMPT).toContain("<canvas_state>");
  });

  it("no longer hard-codes French as the reply language", () => {
    expect(AGENT_SYSTEM_PROMPT).not.toContain("French is the user's preferred language");
  });

  it("returns the cached persona block, the language block, then the canvas block", () => {
    const blocks = buildSystemMessages({ nodes: [], edges: [] });
    expect(blocks).toHaveLength(3);
    expect(blocks[0].cache_control).toEqual({ type: "ephemeral" });
    expect(blocks[1].text.startsWith("<response_language>")).toBe(true);
    expect(blocks[1].cache_control).toBeUndefined();
    expect(blocks[2].cache_control).toBeUndefined();
    expect(blocks[2].text).toContain("<canvas_state>");
    expect(blocks[2].text).toContain('"nodes": []');
  });

  it("snapshot serialization preserves node ids", () => {
    const blocks = buildSystemMessages({
      nodes: [{ id: "p-1", type: "prompt", summary: { prompt: "hi" } }],
      edges: [],
    });
    expect(blocks.at(-1)!.text).toContain('"id": "p-1"');
  });

  it("injects project_id between the language block and canvas_state", () => {
    const blocks = buildSystemMessages({ nodes: [], edges: [] }, "proj-abc");
    expect(blocks).toHaveLength(4);
    expect(blocks[1].text.startsWith("<response_language>")).toBe(true);
    expect(blocks[2].text).toContain("<project_id>proj-abc</project_id>");
    expect(blocks[2].text).toMatch(/Pass it as the `project_id` argument/);
    expect(blocks[3].text).toContain("<canvas_state>");
  });

  it("omits the project_id block when no projectId given", () => {
    const blocks = buildSystemMessages({ nodes: [], edges: [] });
    expect(blocks.some((b) => b.text.includes("<project_id>"))).toBe(false);
  });

  it("defaults both languages to French", () => {
    const text = buildSystemMessages({ nodes: [], edges: [] })[1].text;
    expect(text).toContain("Reply to the user in French");
    expect(text).toContain("on the thumbnails themselves");
  });

  it("names the reply language and the thumbnail text language separately", () => {
    const text = buildResponseLanguageBlock({ ...DEFAULT_AGENT_PROMPT_PREFS, responseLanguage: "en", thumbnailLanguage: "es" });
    expect(text).toContain("Reply to the user in English");
    expect(text).toMatch(/on the thumbnails themselves .* in Spanish\./);
  });
});
