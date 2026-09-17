import { describe, it, expect } from "vitest";
import { AGENT_SYSTEM_PROMPT, DEFAULT_AGENT_PROMPT_PREFS, buildSystemMessages } from "@/lib/agent/system-prompt";
import { EMPTY_CHANNEL_PROFILE } from "@/lib/settings-schema";

describe("system prompt — finish_turn", () => {
  it("asks to end every turn with finish_turn and describes its fields", () => {
    for (const expected of [
      "ENDING EVERY TURN — finish_turn (mandatory)",
      "exactly once, as your LAST tool call",
      "max 400 characters",
      '"result_id: <id>"',
      'kind "ask_agent" + message (max 300 characters)',
      'kind "focus_node" + node_id',
      "label max 40 characters",
      "which costs money",
      "don't call finish_turn in the same step",
    ]) {
      expect(AGENT_SYSTEM_PROMPT).toContain(expected);
    }
  });

  it("no longer asks for long markdown answers or sketches embedded in text", () => {
    expect(AGENT_SYSTEM_PROMPT).not.toContain("OUTPUT FORMATTING");
    expect(AGENT_SYSTEM_PROMPT).not.toContain("SKETCH IMAGE EMBEDDED INLINE");
    expect(AGENT_SYSTEM_PROMPT).not.toContain("![Angle A]");
    expect(AGENT_SYSTEM_PROMPT).not.toContain("Always announce what you're about to do");
  });

  it("sends the generator hand-off through finish_turn with a focus_node action", () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('a focus_node next action on the generator\'s node id (label "Voir le générateur")');
    expect(AGENT_SYSTEM_PROMPT).toContain('one ask_agent button per angle (label "Angle A — Choc", message "Je choisis l\'angle A.")');
  });

  it("keeps finish_turn in the cached block and the dynamic blocks in the same order", () => {
    const prefs = { ...DEFAULT_AGENT_PROMPT_PREFS, channelProfile: { ...EMPTY_CHANNEL_PROFILE, name: "Demo" } };
    const blocks = buildSystemMessages({ nodes: [], edges: [] }, "proj-1", prefs);
    expect(blocks[0]).toEqual({ type: "text", text: AGENT_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } });
    expect(blocks.slice(1).map((block) => block.text.split("\n")[0].replace(/>.*$/, ">"))).toEqual([
      "<response_language>",
      "<channel_profile>",
      "<project_id>",
      "<canvas_state>",
    ]);
    expect(blocks.slice(1).some((block) => block.text.includes("finish_turn"))).toBe(false);
  });
});
