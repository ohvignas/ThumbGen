import { describe, expect, it } from "vitest";
import {
  CLASSIFY_CONFIRM_THRESHOLD,
  CLASSIFY_MODEL,
  estimateClassificationCostUsd,
  tokenCostUsd,
} from "@/lib/youtube/classification-pricing";
import {
  THUMB_TYPES,
  isThumbType,
  parseClassification,
  summarizeTypes,
  thumbTypeLabel,
  type TypeSummaryInput,
} from "@/lib/youtube/thumb-types";

describe("thumbnail types", () => {
  it("lists the spec's nine types in order", () => {
    expect(THUMB_TYPES.map((type) => [type.id, type.label])).toEqual([
      ["face_text", "Visage + texte"],
      ["reaction", "Réaction sans texte"],
      ["before_after", "Avant / Après"],
      ["versus", "Versus / comparaison"],
      ["screenshot", "Capture d'écran / interface"],
      ["object", "Objet ou produit central"],
      ["text_only", "Texte seul"],
      ["scene", "Scène / illustration"],
      ["other", "Autre"],
    ]);
  });

  it("recognises ids and labels unclassified thumbnails", () => {
    expect(isThumbType("versus")).toBe(true);
    expect(isThumbType("none")).toBe(false);
    expect(isThumbType(42)).toBe(false);
    expect(thumbTypeLabel("scene")).toBe("Scène / illustration");
    expect(thumbTypeLabel(null)).toBe("Non classée");
    expect(thumbTypeLabel("none")).toBe("Non classée");
  });
});

describe("parseClassification", () => {
  it("reads the type from the model's JSON answer", () => {
    expect(parseClassification('{"type":"before_after"}')).toBe("before_after");
    expect(parseClassification('```json\n{"type":"versus"}\n```')).toBe("versus");
  });

  it("files every invalid answer under « other »", () => {
    expect(parseClassification('{"type":"banana"}')).toBe("other");
    expect(parseClassification('{"kind":"versus"}')).toBe("other");
    expect(parseClassification("visage + texte")).toBe("other");
    expect(parseClassification("")).toBe("other");
    expect(parseClassification(null)).toBe("other");
  });
});

describe("summarizeTypes", () => {
  const row = (videoId: string, thumbType: TypeSummaryInput["thumbType"], score: number | null): TypeSummaryInput => ({
    videoId,
    title: `Titre ${videoId}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    thumbType,
    score,
  });

  it("ranks types with at least 3 scored thumbnails by median score", () => {
    const rows = summarizeTypes([
      row("f1", "face_text", 1),
      row("f2", "face_text", 2),
      row("f3", "face_text", 9),
      row("r1", "reaction", 4),
      row("r2", "reaction", 5),
      row("r3", "reaction", 6),
      row("r4", "reaction", null),
      row("v1", "versus", 7),
      row("v2", "versus", 8),
      row("s1", "scene", null),
    ]);

    expect(rows.map((summary) => summary.type)).toEqual(["reaction", "face_text", "versus", "scene"]);
    expect(rows[0]).toEqual({
      type: "reaction",
      label: "Réaction sans texte",
      totalCount: 4,
      scoredCount: 3,
      enoughData: true,
      medianScore: 5,
      best: { videoId: "r3", title: "Titre r3", thumbnailUrl: "https://i.ytimg.com/vi/r3/mqdefault.jpg", score: 6 },
    });
    expect(rows[1]).toMatchObject({ type: "face_text", medianScore: 2, best: { videoId: "f3", score: 9 } });
    expect(rows[2]).toMatchObject({ type: "versus", totalCount: 2, scoredCount: 2, enoughData: false, medianScore: null, best: null });
    expect(rows[3]).toMatchObject({ type: "scene", totalCount: 1, scoredCount: 0, enoughData: false });
  });

  it("returns nothing without classified thumbnails", () => {
    expect(summarizeTypes([])).toEqual([]);
  });

  it("picks the best thumb by swipe rank, not raw ×N", () => {
    const rows = summarizeTypes([
      { ...row("old-viral", "face_text", 30), rank: 0.2 },
      { ...row("current", "face_text", 3), rank: 1.4 },
      { ...row("mid", "face_text", 4), rank: 0.8 },
    ]);
    expect(rows[0]?.best).toMatchObject({ videoId: "current", score: 3 });
    expect(rows[0]?.medianScore).toBe(4);
  });
});

describe("classification pricing", () => {
  it("prices tokens with Gemini 2.5 Flash Lite's OpenRouter rates", () => {
    expect(CLASSIFY_MODEL).toBe("google/gemini-2.5-flash-lite");
    expect(tokenCostUsd(1_000_000, 0)).toBeCloseTo(0.1);
    expect(tokenCostUsd(0, 1_000_000)).toBeCloseTo(0.4);
  });

  it("estimates about 8 cents per 1 000 thumbnails and asks above 200", () => {
    expect(estimateClassificationCostUsd(1000)).toBeCloseTo(0.078, 6);
    expect(estimateClassificationCostUsd(0)).toBe(0);
    expect(CLASSIFY_CONFIRM_THRESHOLD).toBe(200);
  });
});
