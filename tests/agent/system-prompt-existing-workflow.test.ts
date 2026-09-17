import { describe, it, expect } from "vitest";
import { AGENT_SYSTEM_PROMPT } from "@/lib/agent/system-prompt";

function section(): string {
  const start = AGENT_SYSTEM_PROMPT.indexOf("EXISTING WORKFLOW");
  expect(start).toBeGreaterThanOrEqual(0);
  const end = AGENT_SYSTEM_PROMPT.indexOf("\n\n", AGENT_SYSTEM_PROMPT.indexOf("\n", start) + 1);
  return AGENT_SYSTEM_PROMPT.slice(start, end === -1 ? undefined : end);
}

describe("system prompt — existing workflow", () => {
  it("has an EXISTING WORKFLOW section that takes priority only for requests about the existing workflow", () => {
    const text = section();
    expect(text).toMatch(/<canvas_state>/);
    expect(text).toMatch(/priority/i);
    expect(text).toMatch(/look at, analyse, complete, improve or modify/);
    expect(text).toMatch(/An angle pick, or any other precise request/);
    expect(text).not.toMatch(/picking an angle\)/);
    expect(AGENT_SYSTEM_PROMPT.indexOf("EXISTING WORKFLOW")).toBeLessThan(AGENT_SYSTEM_PROMPT.indexOf("Mental checklist"));
  });

  it("understands first: view_canvas_images, the prompts, what the user added, the chosen generated image", () => {
    const text = section();
    expect(text).toContain("view_canvas_images");
    expect(text).toMatch(/prompts/);
    expect(text).toMatch(/added/);
    expect(text).toMatch(/selectedImage/);
  });

  it("reformulates and asks 1 to 3 questions through finish_turn, without modifying the canvas", () => {
    const text = section();
    expect(text).toContain("finish_turn");
    expect(text).toMatch(/1 to 3 short questions/);
    expect(text).toContain("ask_agent");
    expect(text).toMatch(/modify NOTHING in this turn/);
    expect(text).toMatch(/precise and unambiguous/);
  });

  it("modifies only the targeted nodes and never removes without an explicit request", () => {
    const text = section();
    expect(text).toMatch(/only the nodes you change or add/);
    expect(text).toContain("remove_node_ids");
    expect(text).toMatch(/explicitly/);
  });

  it("iterates from a generated image by wiring it as a reference", () => {
    const text = section();
    expect(text).toContain('swipeFile kind "reference"');
    expect(text).toContain("stored:gi_<id>");
    expect(text).toContain('"ref-in"');
  });

  it("never claims something is restored without checking", () => {
    expect(section()).toMatch(/restored/);
  });

  it("builds right away on an angle pick, sending only new or changed nodes on a non-empty canvas", () => {
    const line = AGENT_SYSTEM_PROMPT.split("\n").find((l) => l.includes("IMMEDIATELY call apply_workflow"));
    expect(line).toBeDefined();
    expect(line).toContain("precise request");
    expect(line).toContain("COMPLETE blueprint");
    expect(line).toMatch(/only the new or changed nodes/);
    expect(line).toMatch(/remove nothing unless the user explicitly asked/);
    expect(line).not.toMatch(/follow EXISTING WORKFLOW instead/);
  });

  it("no longer asks to rebuild the whole workflow when iterating", () => {
    expect(AGENT_SYSTEM_PROMPT).not.toContain("- IMMEDIATELY call apply_workflow with the COMPLETE blueprint (don't ask first):");
    expect(AGENT_SYSTEM_PROMPT).not.toContain("call apply_workflow with a new blueprint that retains existing node IDs you want to keep");
    expect(AGENT_SYSTEM_PROMPT).toMatch(/other nodes are kept automatically/);
  });
});
