import { describe, it, expect } from "vitest";
import {
  AGENT_SYSTEM_PROMPT,
  DEFAULT_AGENT_PROMPT_PREFS,
  buildChannelProfileBlock,
  buildResponseLanguageBlock,
  buildSystemMessages,
  type AgentPromptPrefs,
} from "@/lib/agent/system-prompt";
import { EMPTY_CHANNEL_PROFILE } from "@/lib/settings-schema";

const PROFILE_PREFS: AgentPromptPrefs = {
  ...DEFAULT_AGENT_PROMPT_PREFS,
  youtubeChannel: "https://www.youtube.com/@demo",
  channelProfile: {
    ...EMPTY_CHANNEL_PROFILE,
    name: "Demo Tech",
    niche: "IA générative",
    tone: "Direct, un peu d'humour",
    brandColors: ["#E6007E", "#111111"],
    defaultPersonaId: "p1",
    agentInstructions: "Toujours un visage expressif.",
  },
  defaultPersona: { id: "p1", label: "Antoine" },
};

/** Index of the first per-turn block (never the cached one) starting with the tag. */
function blockIndex(blocks: Array<{ text: string; cache_control?: unknown }>, tag: string): number {
  return blocks.findIndex((block) => block.cache_control === undefined && block.text.startsWith(tag));
}

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

describe("<channel_profile>", () => {
  it("is absent when the profile is empty", () => {
    expect(buildChannelProfileBlock(DEFAULT_AGENT_PROMPT_PREFS)).toBeNull();
    const blocks = buildSystemMessages({ nodes: [], edges: [] }, "proj-abc");
    expect(blocks.some((b) => b.text.includes("<channel_profile>"))).toBe(false);
  });

  it("sits after the cached prompt and the language block, before project_id and canvas_state", () => {
    const blocks = buildSystemMessages({ nodes: [], edges: [] }, "proj-abc", PROFILE_PREFS);
    expect(blocks).toHaveLength(5);
    expect(blocks[0].cache_control).toEqual({ type: "ephemeral" });
    const profile = blockIndex(blocks, "<channel_profile>");
    expect(profile).toBeGreaterThan(blockIndex(blocks, "<response_language>"));
    expect(profile).toBeLessThan(blockIndex(blocks, "<project_id>"));
    expect(blockIndex(blocks, "<project_id>")).toBeLessThan(blockIndex(blocks, "<canvas_state>"));
  });

  it("lists only the filled fields", () => {
    const text = buildChannelProfileBlock(PROFILE_PREFS)!;
    expect(text).toContain("- Channel name: Demo Tech");
    expect(text).toContain("- YouTube channel: https://www.youtube.com/@demo");
    expect(text).toContain("- Niche / topic: IA générative");
    expect(text).toContain("- Tone and style: Direct, un peu d'humour");
    expect(text).toContain("- Brand colors: #E6007E, #111111");
    expect(text).toContain("Toujours un visage expressif.");
    expect(text).not.toContain("Target audience");
  });

  it("tells the agent to use the default persona as faceReference", () => {
    const text = buildChannelProfileBlock(PROFILE_PREFS)!;
    expect(text).toContain('"Antoine"');
    expect(text).toContain("stored:persona_p1");
    expect(text).toContain("faceReference");
  });

  it("omits the persona line when the persona no longer exists", () => {
    const text = buildChannelProfileBlock({ ...PROFILE_PREFS, defaultPersona: null })!;
    expect(text).not.toContain("stored:persona_");
    expect(text).toContain("- Channel name: Demo Tech");
  });

  it("counts the YouTube channel alone as a filled field", () => {
    expect(buildChannelProfileBlock({ ...DEFAULT_AGENT_PROMPT_PREFS, youtubeChannel: "@demo" })).toContain(
      "- YouTube channel: @demo",
    );
  });
});
