import { describe, it, expect } from "vitest";
import {
  buildInvokedSkillBlock,
  emptyInvokedUserMessage,
  resolveInvokedSkill,
} from "@/lib/agent/skills/invoked-skill";
import { AGENT_SYSTEM_PROMPT } from "@/lib/agent/system-prompt";

const BODY_MARKER = "graphite-on-paper";

describe("resolveInvokedSkill", () => {
  it("loads generate_sketch body for /croquis and not for unknown slashes", () => {
    const invoked = resolveInvokedSkill("/croquis moi à droite");
    expect(invoked?.slash).toBe("croquis");
    expect(invoked?.skill).toBe("generate_sketch");
    expect(invoked?.body).toContain(BODY_MARKER);
    expect(invoked?.body).not.toMatch(/^---/);
    expect(resolveInvokedSkill("https://youtube.com/watch?v=abc")).toBeNull();
    expect(resolveInvokedSkill("/finish_turn")).toBeNull();
  });

  it("loads create-prompt body for /create-prompt and /create-propt", () => {
    const invoked = resolveInvokedSkill("/create-prompt moi à droite");
    expect(invoked?.slash).toBe("create-prompt");
    expect(invoked?.skill).toBe("create-prompt");
    expect(invoked?.body).toContain("place_node");
    expect(invoked?.body).toContain("iv-prompt");
    expect(invoked?.body).not.toMatch(/^---/);
    expect(invoked?.body).not.toContain("Étape n/7");
    expect(invoked?.body).toContain("no numbered interview");
    expect(invoked?.body).toContain("next_actions: []");
    expect(invoked?.body).toContain("No `ask_user` after placing");
    expect(invoked?.body).not.toContain("Optional `ask_agent`");
    expect(resolveInvokedSkill("/create-propt")?.skill).toBe("create-prompt");
    const block = buildInvokedSkillBlock(invoked!);
    expect(block.startsWith('<invoked_skill name="create-prompt" slash="create-prompt">')).toBe(true);
  });
});

describe("buildInvokedSkillBlock", () => {
  it("wraps one skill body and tells the model not to read_skill it again this turn", () => {
    const invoked = resolveInvokedSkill("/croquis")!;
    const block = buildInvokedSkillBlock(invoked);
    expect(block.startsWith('<invoked_skill name="generate_sketch" slash="croquis">')).toBe(true);
    expect(block).toContain("already loaded");
    expect(block).toContain("do not call read_skill for \"generate_sketch\"");
    expect(block).toContain(BODY_MARKER);
    expect(block).toContain("brainstorm");
    expect(block).not.toContain("Étape n/7");
    expect(block.endsWith("</invoked_skill>")).toBe(true);
  });

  it("when the idea is empty, forbids generate_sketch and finish_turn this step", () => {
    const invoked = resolveInvokedSkill("/croquis")!;
    const block = buildInvokedSkillBlock(invoked, { ideaEmpty: true });
    expect(block).toContain("The idea is EMPTY");
    expect(block).toContain("ask_user");
    expect(block).toContain("Do NOT call generate_sketch this turn");
    expect(block).toContain("Do NOT call finish_turn in the same step as ask_user");
    const prompt = emptyInvokedUserMessage(invoked);
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain("/croquis");
    expect(prompt).toContain("ask_user");
    expect(prompt).not.toMatch(/^\/croquis\s*$/);
  });

  it("does not live in the cached system prompt", () => {
    expect(AGENT_SYSTEM_PROMPT).toContain("<invoked_skill>");
    expect(AGENT_SYSTEM_PROMPT).not.toContain(BODY_MARKER);
    expect(AGENT_SYSTEM_PROMPT).not.toContain("limit = 2 × max(1, variants.length) + 3");
  });
});
