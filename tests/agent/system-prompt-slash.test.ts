import { describe, it, expect } from "vitest";
import { AGENT_SYSTEM_PROMPT, buildSystemMessages } from "@/lib/agent/system-prompt";

describe("system prompt — slash invoke block", () => {
  it("keeps the catalog in the cached block and appends invoked_skill uncached last", () => {
    const without = buildSystemMessages({ nodes: [], edges: [] }, "proj_1");
    expect(without[0].text).toBe(AGENT_SYSTEM_PROMPT);
    expect(without[0].cache_control).toEqual({ type: "ephemeral" });
    expect(without.some((block) => block.text.startsWith("<invoked_skill"))).toBe(false);

    const block = '<invoked_skill name="generate_sketch" slash="croquis">\nbody\n</invoked_skill>';
    const withInvoke = buildSystemMessages({ nodes: [], edges: [] }, "proj_1", undefined, null, block);
    expect(withInvoke.at(-1)).toEqual({ type: "text", text: block });
    expect(withInvoke.at(-1)!.cache_control).toBeUndefined();
    expect(withInvoke[0].text).toBe(AGENT_SYSTEM_PROMPT);
  });

  it("does not dump tool skill bodies into the static prompt", () => {
    expect(AGENT_SYSTEM_PROMPT).toContain("generate_sketch");
    expect(AGENT_SYSTEM_PROMPT).toContain("create-prompt");
    expect(AGENT_SYSTEM_PROMPT).toContain("If this turn includes an <invoked_skill> block");
    expect(AGENT_SYSTEM_PROMPT).not.toContain("graphite-on-paper");
    expect(AGENT_SYSTEM_PROMPT).not.toContain("Do not add a generator");
  });
});
