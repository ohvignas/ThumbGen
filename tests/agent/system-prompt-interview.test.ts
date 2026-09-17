import { describe, it, expect } from "vitest";
import { AGENT_SYSTEM_PROMPT, INTERVIEW_PRICE_TABLE, buildSystemMessages } from "@/lib/agent/system-prompt";
import { MODEL_COSTS } from "@/lib/model-costs";

function section(): string {
  const start = AGENT_SYSTEM_PROMPT.indexOf("GUIDED INTERVIEW");
  expect(start).toBeGreaterThanOrEqual(0);
  const end = AGENT_SYSTEM_PROMPT.indexOf("Mental checklist", start);
  return AGENT_SYSTEM_PROMPT.slice(start, end);
}

describe("system prompt — guided interview", () => {
  it("has one GUIDED INTERVIEW section, right after EXISTING WORKFLOW", () => {
    expect(AGENT_SYSTEM_PROMPT.split("GUIDED INTERVIEW").length - 1).toBeGreaterThanOrEqual(1);
    const heading = AGENT_SYSTEM_PROMPT.indexOf("GUIDED INTERVIEW —");
    expect(AGENT_SYSTEM_PROMPT.split("GUIDED INTERVIEW —").length - 1).toBe(1);
    expect(heading).toBeGreaterThan(AGENT_SYSTEM_PROMPT.indexOf("EXISTING WORKFLOW"));
    expect(heading).toBeLessThan(AGENT_SYSTEM_PROMPT.indexOf("Mental checklist"));
  });

  it("starts on the button or an explicit request, and keeps the brainstorm for ideas", () => {
    const text = section();
    expect(text).toContain("Aide-moi à construire la miniature de ma vidéo.");
    expect(text).toMatch(/propose-moi des idées/);
  });

  it("lists the 8 questions in order with their nodes", () => {
    const text = section();
    const order = ["1. Video", "2. Angle", "3. Character", "4. References", "5. Logos", "6. Text", "7. Mood", "8. Model"].map((label) =>
      text.indexOf(label),
    );
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const id of ["iv-prompt", "iv-persona", "iv-ref-1", "iv-logo-1", "iv-generator"]) expect(text).toContain(id);
    for (const tool of ["list_followed_videos", "list_personas", "list_swipe_files", "list_logos", "import_youtube_thumbnail", "extract_youtube_script"]) {
      expect(text).toContain(tool);
    }
    expect(text).toMatch(/max_selected: 3/);
    expect(text).toContain("best_type: true");
  });

  it("pauses on ask_user alone, places nodes with place_node, ends on a generate recap", () => {
    const text = section();
    expect(text).toMatch(/ask_user alone in its step/);
    expect(text).toMatch(/place_node right after/);
    expect(text).toMatch(/no finish_turn before the recap/i);
    expect(text).toContain('{ kind: "generate", node_id: "iv-generator" }');
    expect(text).toMatch(/never generate_sketch/);
    expect(text).toMatch(/never apply_workflow/);
    expect(text).toMatch(/abandoned/);
    expect(text).toMatch(/apologi[sz]e in one sentence/);
    expect(text).toMatch(/skip the question/i);
  });

  it("takes priority over the other flows while it runs and never removes nodes", () => {
    const text = section();
    expect(text).toMatch(/priority over EXISTING WORKFLOW, PROPOSING ANGLES and WHEN THE USER PICKS AN ANGLE/);
    expect(text).toMatch(/never remove/i);
  });

  it("asks to resume or restart when interview nodes are already on the canvas", () => {
    const text = section();
    const check = text.indexOf("iv-* nodes in <canvas_state>");
    expect(check).toBeGreaterThanOrEqual(0);
    expect(check).toBeLessThan(text.indexOf("1. Video"));
    expect(text).toContain("Reprendre l'interview");
    expect(text).toContain("Repartir de zéro");
    expect(text).toMatch(/apply_workflow with an empty blueprint and remove_node_ids listing the existing iv-\* nodes/);
    expect(text).toMatch(/only exception/);
  });

  it("tells the agent removed links stay removed", () => {
    expect(section()).toMatch(/a link the user removed is never added back/);
  });

  it("prices the model options from MODEL_COSTS", () => {
    expect(INTERVIEW_PRICE_TABLE).toContain(`nano-banana — Gemini 3.1 Flash — "Nano Banana · ~0,02 $ / image"`);
    expect(INTERVIEW_PRICE_TABLE).toContain(`openai — GPT Image 2.5 Sunburst (précis) — "GPT Image · ~0,05 $ / image"`);
    expect(INTERVIEW_PRICE_TABLE).toContain(`seedream — Seedream 4.5 (ByteDance) — "Seedream · ~0,02 $ / image"`);
    expect(MODEL_COSTS["gemini-3.1-flash-image"]).toBe(0.02);
    expect(section()).toContain(INTERVIEW_PRICE_TABLE);
    expect(section()).toMatch(/16x9/);
  });

  it("pauses the turn on ask_user without finish_turn in the same step", () => {
    expect(AGENT_SYSTEM_PROMPT).toMatch(/When you call request_user_image or ask_user, don't call finish_turn in the same step/);
  });

  it("stays in the cached block: no per-turn block mentions the interview tools", () => {
    const blocks = buildSystemMessages({ nodes: [], edges: [] }, "proj_1");
    expect(blocks[0].text).toContain("GUIDED INTERVIEW");
    expect(blocks.slice(1).some((block) => block.text.includes("place_node") || block.text.includes("ask_user"))).toBe(false);
  });
});
