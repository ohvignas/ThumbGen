import { describe, it, expect } from "vitest";
import {
  BRIEF_PATCH_KEYS,
  applyBriefUpdate,
  briefPatchInputSchema,
  briefUpdateInputSchema,
  normalizeWords,
  titleTextOverlap,
  type BriefUpdateInput,
} from "@/lib/brief/merge";
import { emptyBrief, type ThumbnailBrief } from "@/lib/brief/schema";
import { NOW, card, pkg } from "./fixtures";

const input = (value: unknown): BriefUpdateInput => briefUpdateInputSchema.parse(value);

function apply(current: ThumbnailBrief, value: unknown) {
  const result = applyBriefUpdate(current, input(value), NOW);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result;
}

describe("brief merge", () => {
  it("merges objects field by field; null removes a field", () => {
    let brief = apply(emptyBrief(), { video: { subject: "Les miniatures", promise: "Savoir cliquer" } }).brief;
    brief = apply(brief, { video: { promise: "Savoir créer une miniature" }, step: 4 }).brief;
    expect(brief.video).toEqual({ subject: "Les miniatures", promise: "Savoir créer une miniature" });
    expect(brief.step).toBe(4);
    brief = apply(brief, { video: { promise: null } }).brief;
    expect(brief.video).toEqual({ subject: "Les miniatures" });
    brief = apply(brief, { common: { style: "Aplats" } }).brief;
    expect(brief.common).toEqual({ textMode: "rendered", style: "Aplats" });
  });

  it("replaces logos and references whole", () => {
    let brief = apply(emptyBrief(), { logos: [{ name: "Claude", source: "stored:lg_1" }, { name: "Figma", source: "stored:lg_2" }] }).brief;
    brief = apply(brief, { logos: [{ name: "Notion", source: "stored:lg_3" }] }).brief;
    expect(brief.logos).toEqual([{ name: "Notion", source: "stored:lg_3" }]);
  });

  it("merges a variant by key, replaces its card whole, removes and sorts variants", () => {
    let brief = apply(emptyBrief(), { variant: { key: "B", set: pkg({ direction: "Avant / après" }) } }).brief;
    brief = apply(brief, { variant: { key: "A", set: pkg() } }).brief;
    expect(brief.variants.map((variant) => variant.key)).toEqual(["A", "B"]);

    brief = apply(brief, { variant: { key: "A", set: { title: "Un nouveau titre", composition: card({ layoutNote: "serré" }) } } }).brief;
    expect(brief.variants[0]).toMatchObject({ title: "Un nouveau titre", direction: "Promesse chiffrée", composition: { layoutNote: "serré" } });

    brief = apply(brief, { variant: { key: "A", set: { composition: card() } } }).brief;
    expect(brief.variants[0].composition).not.toHaveProperty("layoutNote");

    brief = apply(brief, { removeVariant: "B" }).brief;
    expect(brief.variants.map((variant) => variant.key)).toEqual(["A"]);
    brief = apply(brief, { variant: { key: "A", set: { composition: null } } }).brief;
    expect(brief.variants[0]).not.toHaveProperty("composition");
  });

  it("keeps research sources from the stored brief", () => {
    const current: ThumbnailBrief = {
      ...emptyBrief(),
      research: { summary: "old", keyPoints: [], entities: [], sources: [{ title: "Doc", url: "https://example.com/doc" }], fetchedAt: NOW },
    };
    const brief = apply(current, { research: { summary: "new", sources: [{ title: "x", url: "https://evil.example" }] } }).brief;
    expect(brief.research).toEqual({ ...current.research, summary: "new" });
  });

  it("refuses an invalid result with paths keyed by variant, and writes nothing", () => {
    const current = apply(emptyBrief(), { variant: { key: "A", set: pkg() } }).brief;
    const result = applyBriefUpdate(current, input({ variant: { key: "A", set: { thumbnailText: "a b c d e" } } }), NOW);
    expect(result).toEqual({ ok: false, issues: [{ path: "variants.A.thumbnailText", message: "Texte de miniature : 4 mots maximum" }] });
    const missing = applyBriefUpdate(emptyBrief(), input({ variant: { key: "B", set: { direction: "Seule" } } }), NOW);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.issues.map((issue) => issue.path)).toContain("variants.B.title");
    expect(current.variants[0].thumbnailText).toBe("10 MIN");
  });

  it("the PATCH input has neither step nor research", () => {
    expect(BRIEF_PATCH_KEYS).not.toContain("step");
    expect(BRIEF_PATCH_KEYS).not.toContain("research");
    expect(BRIEF_PATCH_KEYS).toEqual(expect.arrayContaining(["video", "common", "variant", "removeVariant", "logos", "references"]));
    expect(briefPatchInputSchema.safeParse({ video: { promise: "x" } }).success).toBe(true);
  });
});

describe("brief warnings", () => {
  it("normalizes words: lowercase, no accents, no stop words", () => {
    expect(normalizeWords("J'ai testé LES Miniatures à 10 €")).toEqual(["ai", "teste", "miniatures", "10"]);
  });

  it("warns when the thumbnail text repeats more than one word of the title, entities excluded", () => {
    expect(titleTextOverlap("Claude remplace Figma pour le design", "FIGMA DESIGN", [])).toEqual(["figma", "design"]);
    expect(titleTextOverlap("Claude remplace Figma pour le design", "FIGMA DESIGN", ["Figma"])).toEqual(["design"]);

    const overlapping = pkg({ title: "Claude remplace Figma pour le design", thumbnailText: "FIGMA DESIGN" });
    const warned = apply(emptyBrief(), { variant: { key: "A", set: overlapping } });
    expect(warned.warnings).toEqual([
      "Variante A : le texte « FIGMA DESIGN » répète le titre (figma, design). Reformule-le pour qu'il complète le titre.",
    ]);
    const withLogo = apply({ ...emptyBrief(), logos: [{ name: "Figma", source: "stored:lg_1" }] }, { variant: { key: "A", set: overlapping } });
    expect(withLogo.warnings).toEqual([]);
  });

  it("warns on concept variants with the same layout and focal subject, only for the update that touches them", () => {
    let brief = apply(emptyBrief(), { abStrategy: "concepts", variant: { key: "A", set: { ...pkg(), composition: card() } } }).brief;
    const same = apply(brief, { variant: { key: "B", set: { ...pkg({ direction: "Autre" }), composition: card() } } });
    expect(same.warnings).toEqual([
      "Variantes A et B : même mise en page et même sujet focal. Choisis des concepts vraiment différents.",
    ]);
    brief = same.brief;
    expect(apply(brief, { video: { promise: "Autre promesse" } }).warnings).toEqual([]);
    const different = apply(brief, { variant: { key: "B", set: { composition: card({ layout: "split-versus", focal: "Deux écrans" }) } } });
    expect(different.warnings).toEqual([]);
  });

  it("warns when a single-variable variant differs from A on another field", () => {
    let brief = apply(emptyBrief(), {
      abStrategy: "single-variable",
      abVariable: "text",
      variant: { key: "A", set: { ...pkg(), composition: card() } },
    }).brief;
    const textOnly = apply(brief, { variant: { key: "B", set: { ...pkg({ thumbnailText: "ENFIN" }), composition: card() } } });
    expect(textOnly.warnings).toEqual([]);
    brief = textOnly.brief;
    const background = apply(brief, {
      variant: { key: "B", set: { composition: card({ background: { kind: "gradient", color: "#111111" } }) } },
    });
    expect(background.warnings).toEqual(["Variante B : diffère de A sur le fond, alors que le test ne change que le texte."]);
  });
});
