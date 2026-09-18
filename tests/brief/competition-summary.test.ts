import { describe, expect, it } from "vitest";
import { summarizeCompetition, type AnalyzedCompetitor } from "@/lib/brief/competition-summary";
import type { ThumbAnalysis } from "@/lib/brief/schema";

function analysis(overrides: Partial<ThumbAnalysis> = {}): ThumbAnalysis {
  return {
    type: "face_text",
    faceCount: 1,
    textWords: 2,
    elementCount: 2,
    layout: "face-left_object-right",
    background: "solid",
    dominantColors: ["#FF0000"],
    hasLogo: false,
    hasArrowOrCircle: false,
    ...overrides,
  };
}

function hit(partial: Partial<AnalyzedCompetitor> & { analysis: ThumbAnalysis }): AnalyzedCompetitor {
  return { lang: "fr", score: 5, ...partial };
}

describe("summarizeCompetition", () => {
  it("takes the 3 most frequent traits among thumbs scoring at least ×3", () => {
    const summary = summarizeCompetition([
      hit({ analysis: analysis(), score: 5 }),
      hit({ analysis: analysis(), score: 4 }),
      hit({ analysis: analysis({ hasArrowOrCircle: true, type: "reaction", textWords: 0 }), score: 3 }),
      hit({ lang: "en", score: 10, analysis: analysis({ type: "object", layout: "object-hero_no-face", background: "scene", faceCount: 0, textWords: 0, hasLogo: true }) }),
      hit({ score: 1, analysis: analysis({ type: "text_only", layout: "center-hero_text-top" }) }),
      hit({ score: null, analysis: analysis({ type: "text_only", hasLogo: true }) }),
    ]);
    expect(summary.patterns).toEqual(["Fond uni", "Visage", "Visage à gauche, objet à droite"]);
  });

  it("lists saturation traits present on more than 70 % of FR thumbs", () => {
    const fr = analysis();
    const summary = summarizeCompetition([
      hit({ analysis: fr, score: 5 }),
      hit({ analysis: fr, score: 4 }),
      hit({ analysis: fr, score: 2 }),
      hit({ analysis: analysis({ hasArrowOrCircle: true }), score: 1 }),
      hit({ lang: "en", score: 9, analysis: analysis({ type: "object", hasLogo: true, faceCount: 0, textWords: 0, background: "scene" }) }),
    ]);
    expect(summary.saturation).toEqual(["Fond uni", "Texte", "Visage"]);
    expect(summary.saturation).not.toContain("Logo");
    expect(summary.saturation).not.toContain("Flèche ou cercle");
  });

  it("weights the FR palette by score, breaking ties by hex", () => {
    const summary = summarizeCompetition([
      hit({ score: 5, analysis: analysis({ dominantColors: ["#CCCCCC", "#AAAAAA"] }) }),
      hit({ score: 5, analysis: analysis({ dominantColors: ["#BBBBBB", "#AAAAAA"] }) }),
      hit({ score: null, analysis: analysis({ dominantColors: ["#FFFFFF"] }) }),
      hit({ lang: "en", score: 40, analysis: analysis({ dominantColors: ["#0000FF"] }) }),
    ]);
    expect(summary.dominantPalette).toEqual(["#AAAAAA", "#BBBBBB", "#CCCCCC"]);
  });
});
