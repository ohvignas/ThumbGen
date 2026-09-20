import { describe, it, expect } from "vitest";
import {
  MODEL_SELECTION_GUIDE,
  PROMPT_ANATOMY,
  SCRATCH_VS_ADJUST,
  WORKED_EXAMPLE,
  YOUTUBE_THUMBNAIL_PATTERNS,
  buildAgentRubric,
  buildEnhanceRubric,
} from "@/lib/prompt-engineering";
import { normalizeWords } from "@/lib/brief/merge";

describe("thumbnail guidance", () => {
  const rubrics = [buildAgentRubric(), buildEnhanceRubric("fr")];

  it("only names the models the app has", () => {
    for (const text of rubrics) expect(text).not.toMatch(/ideogram|grok/i);
    for (const model of ["nano-banana", "openai", "seedream"]) expect(MODEL_SELECTION_GUIDE).toContain(model);
  });

  it("uses the 168×94 mobile size and no unsourced CTR figure", () => {
    for (const text of rubrics) {
      expect(text).not.toContain("200×112");
      expect(text).not.toContain("~30%");
      expect(text).toContain("168×94");
    }
  });

  it("asks for 0 to 4 words complementing the title and at most 3 elements", () => {
    expect(YOUTUBE_THUMBNAIL_PATTERNS).toContain("0 to 4 words");
    expect(YOUTUBE_THUMBNAIL_PATTERNS).toMatch(/complement(s|ing) the (video )?title/);
    expect(PROMPT_ANATOMY).toContain("At most 3 elements in total, the hero included");
    expect(PROMPT_ANATOMY).toContain("medium shot with action");
    expect(PROMPT_ANATOMY).toContain("completely empty");
    expect(buildEnhanceRubric("fr")).toContain("0 à 4 mots");
  });

  it("tells the agent to write a short edit prompt when a generated thumb is the source", () => {
    expect(SCRATCH_VS_ADJUST).toContain("FROM SCRATCH");
    expect(SCRATCH_VS_ADJUST).toContain("ADJUST");
    expect(SCRATCH_VS_ADJUST).toContain("1–3 sentences");
    expect(SCRATCH_VS_ADJUST).toContain("Do NOT rewrite the scene");
    expect(SCRATCH_VS_ADJUST).toContain("A/B is only variant slots");
    expect(SCRATCH_VS_ADJUST).toContain("COMPLETE alternative prompts");
    expect(SCRATCH_VS_ADJUST).not.toContain("A/B on an adjustment: two short deltas");
    expect(PROMPT_ANATOMY).toContain("FROM SCRATCH ONLY");
    expect(buildAgentRubric()).toContain("SCRATCH vs ADJUST");
    expect(buildEnhanceRubric("fr")).toContain("prompt d'édition court");
    expect(buildEnhanceRubric("fr")).toContain("A/B = deux prompts complets");
  });

  it("shows a worked example with 3 elements, a closed mouth and a moderate emotion", () => {
    expect(WORKED_EXAMPLE).toContain("mouth closed");
    expect(WORKED_EXAMPLE).toContain("exactly 3 elements");
    expect(WORKED_EXAMPLE).toMatch(/the person in the identity\/avatar reference photos/i);
    expect(WORKED_EXAMPLE).not.toMatch(/Young man/);
    expect(WORKED_EXAMPLE).not.toMatch(/mouth wide open|extreme shock/);
    // Its own rules: the thumbnail text shares no word with the title, and nothing beyond the 3 named elements.
    const title = WORKED_EXAMPLE.match(/title "([^"]+)"/)![1];
    const text = WORKED_EXAMPLE.match(/thumbnail text "([^"]+)"/)![1];
    expect(normalizeWords(text).filter((word) => normalizeWords(title).includes(word))).toEqual([]);
    expect(WORKED_EXAMPLE).toContain(`"${text}" in white`);
    expect(WORKED_EXAMPLE).not.toMatch(/\b(tablet|laptop|phone|screen|arrow)\b/i);
  });
});
