import { describe, it, expect } from "vitest";
import { AGENT_SYSTEM_PROMPT, INTERVIEW_PRICE_TABLE, buildSystemMessages } from "@/lib/agent/system-prompt";
import { MODEL_COSTS } from "@/lib/model-costs";

function section(): string {
  const start = AGENT_SYSTEM_PROMPT.indexOf("THUMBNAIL JOURNEY —");
  expect(start).toBeGreaterThanOrEqual(0);
  return AGENT_SYSTEM_PROMPT.slice(start, AGENT_SYSTEM_PROMPT.indexOf("\nRules:", start));
}

describe("system prompt — thumbnail journey", () => {
  it("has one THUMBNAIL JOURNEY section, after EXISTING WORKFLOW and before the rules", () => {
    expect(AGENT_SYSTEM_PROMPT.split("THUMBNAIL JOURNEY —").length - 1).toBe(1);
    const heading = AGENT_SYSTEM_PROMPT.indexOf("THUMBNAIL JOURNEY —");
    expect(heading).toBeGreaterThan(AGENT_SYSTEM_PROMPT.indexOf("EXISTING WORKFLOW —"));
    expect(heading).toBeLessThan(AGENT_SYSTEM_PROMPT.indexOf("\nRules:"));
    expect(AGENT_SYSTEM_PROMPT.indexOf("MULTI-SELECT FOR A/B TESTING —")).toBeGreaterThan(AGENT_SYSTEM_PROMPT.indexOf("ENDING EVERY TURN"));
  });

  it("replaces the F2 interview, the checklist, the angles flow and the core loop", () => {
    for (const gone of [
      "GUIDED INTERVIEW",
      "Mental checklist",
      "PROPOSING ANGLES",
      "WHEN THE USER PICKS AN ANGLE",
      "This is the core loop",
      "trigger_generation",
      "8 fixed clickable questions",
      "IMMEDIATELY call apply_workflow",
    ]) {
      expect(AGENT_SYSTEM_PROMPT, gone).not.toContain(gone);
    }
    expect(AGENT_SYSTEM_PROMPT).not.toMatch(/ideogram|grok/i);
    expect(AGENT_SYSTEM_PROMPT).not.toContain("200×112");
    expect(AGENT_SYSTEM_PROMPT).not.toContain("~30%");
    const projectBlock = buildSystemMessages({ nodes: [], edges: [] }, "proj_1").find((block) => block.text.includes("<project_id>"))!;
    expect(projectBlock.text).not.toContain("trigger_generation");
  });

  it("starts on the button and on any thumbnail request", () => {
    const text = section();
    expect(text).toContain("Aide-moi à construire la miniature de ma vidéo.");
    expect(text).toMatch(/every request to create or design a thumbnail/);
    expect(text).toMatch(/Never jump to sketches/);
  });

  it("lists the 7 steps in order", () => {
    const text = section();
    const order = [
      "1. Video and promise",
      "2. Research and logos",
      "3. Competitors",
      "4. Strategy and directions",
      "5. Common elements",
      "6. Composition cards",
      "7. Sketches, previews, then workflow",
    ].map((label) => text.indexOf(label));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("writes every decision to the brief and trusts <thumbnail_brief>", () => {
    const text = section();
    expect(text).toContain("update_brief");
    expect(text).toContain("<thumbnail_brief>");
    expect(text).toContain("trust it over the chat history");
    expect(text).toMatch(/ask_user alone in (its|their) step/);
    expect(text).toMatch(/fix what it names and retry once/);
    expect(text).toMatch(/rephrase once/);
  });

  it("states the packaging rules", () => {
    const text = section();
    expect(text).toContain("0 to 4 words and ≤ 20 characters");
    expect(text).toMatch(/complements the title, never repeats it/);
    expect(text).toContain('abStrategy "concepts"');
    expect(text).toContain('"single-variable"');
    expect(text).toMatch(/Never a 4th element/);
    expect(text).toMatch(/never on the hero's cell/);
  });

  it("asks a free first question and never offers old videos", () => {
    const text = section();
    expect(text).toMatch(/ask_user with no options/);
    expect(text).toContain("Never offer old videos");
  });

  it("degrades gracefully: tools of the next sub-projects are named with what to do until then", () => {
    const text = section();
    expect(text).toMatch(/do not exist yet/);
    for (const tool of ["research_topic", "find_logos", "find_competitor_thumbnails", "analyze_thumbnails", "preview_thumbnail"]) {
      expect(text).toContain(tool);
    }
    expect(text.match(/Until then:/g)!.length).toBeGreaterThanOrEqual(3);
    expect(text).toContain("list_logos");
    expect(text).toContain("list_personas");
  });

  it("ends on place_node for one variant or apply_workflow for A/B, with the generate action", () => {
    const text = section();
    expect(text).toContain("place_node iv-prompt");
    expect(text).toContain("MULTI-SELECT FOR A/B TESTING");
    expect(text).toContain('next_actions [{ kind: "generate", node_id: "iv-generator" }]');
    expect(text).toMatch(/Never generate an image yourself/);
    expect(text).toContain('face_source: "stored:persona_<id>"');
    expect(text).toContain("Personnages only");
  });

  it("offers to resume or restart F2 interview nodes only without a brief", () => {
    const text = section();
    expect(text).toContain("iv-* nodes and there is no <thumbnail_brief>");
    expect(text).toContain("Reprendre l'interview");
    expect(text).toContain("Repartir de zéro");
    expect(text).toMatch(/apply_workflow with an empty blueprint and remove_node_ids listing the existing iv-\* nodes/);
  });

  it("prices the step 7 model options from MODEL_COSTS", () => {
    expect(INTERVIEW_PRICE_TABLE).toContain(`nano-banana — Gemini 3.1 Flash — "Nano Banana · ~0,02 $ / image"`);
    expect(INTERVIEW_PRICE_TABLE).toContain(`openai — GPT Image 2.5 Sunburst (précis) — "GPT Image · ~0,05 $ / image"`);
    expect(INTERVIEW_PRICE_TABLE).toContain(`seedream — Seedream 4.5 (ByteDance) — "Seedream · ~0,02 $ / image"`);
    expect(MODEL_COSTS["gemini-3.1-flash-image"]).toBe(0.02);
    expect(section()).toContain(INTERVIEW_PRICE_TABLE);
  });

  it("stays in the cached block: no per-turn block names the journey tools", () => {
    const blocks = buildSystemMessages({ nodes: [], edges: [] }, "proj_1");
    expect(blocks[0].text).toContain("THUMBNAIL JOURNEY");
    expect(blocks.slice(1).some((block) => /update_brief|ask_user|place_node/.test(block.text))).toBe(false);
  });
});
