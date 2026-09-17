import { describe, it, expect } from "vitest";
import { compositionSchema, emptyBrief, repairBrief, thumbnailBriefSchema, thumbnailTextIssue, variantSchema } from "@/lib/brief/schema";
import { card, pkg } from "./fixtures";

const messages = (result: { success: boolean; error?: { issues: Array<{ message: string }> } }) =>
  result.success ? [] : result.error!.issues.map((issue) => issue.message);

describe("thumbnail brief schema", () => {
  it("accepts the empty brief", () => {
    expect(thumbnailBriefSchema.safeParse(emptyBrief()).success).toBe(true);
    expect(emptyBrief()).toMatchObject({ step: 1, common: { textMode: "rendered" }, variants: [], usage: { sketches: 0 } });
  });

  it("enforces the video limits and the 7 steps", () => {
    expect(messages(thumbnailBriefSchema.safeParse({ ...emptyBrief(), video: { promise: "x".repeat(91) } }))).toEqual([
      "90 caractères maximum",
    ]);
    expect(thumbnailBriefSchema.safeParse({ ...emptyBrief(), video: { promise: "x".repeat(90) } }).success).toBe(true);
    expect(thumbnailBriefSchema.safeParse({ ...emptyBrief(), step: 7 }).success).toBe(true);
    expect(thumbnailBriefSchema.safeParse({ ...emptyBrief(), step: 8 }).success).toBe(false);
    expect(thumbnailBriefSchema.safeParse({ ...emptyBrief(), video: { script: "x".repeat(8001) } }).success).toBe(false);
  });

  it("limits the thumbnail text to 4 words and 20 characters, empty allowed", () => {
    expect(thumbnailTextIssue("")).toBeNull();
    expect(thumbnailTextIssue("IL A OSÉ ?")).toBeNull();
    expect(thumbnailTextIssue("a b c d e")).toBe("Texte de miniature : 4 mots maximum");
    expect(thumbnailTextIssue("x".repeat(21))).toBe("Texte de miniature : 20 caractères maximum");
    expect(messages(variantSchema.safeParse({ key: "A", ...pkg({ thumbnailText: "a b c d e" }) }))).toEqual([
      "Texte de miniature : 4 mots maximum",
    ]);
    expect(variantSchema.safeParse({ key: "A", ...pkg({ thumbnailText: "" }) }).success).toBe(true);
  });

  it("requires the whole package and caps its fields", () => {
    expect(variantSchema.safeParse({ key: "A", ...pkg({ title: "x".repeat(61) }) }).success).toBe(false);
    expect(variantSchema.safeParse({ key: "A", ...pkg({ visualIdea: "x".repeat(121) }) }).success).toBe(false);
    const withoutTitle: Record<string, unknown> = pkg();
    delete withoutTitle.title;
    expect(variantSchema.safeParse({ key: "A", ...withoutTitle }).success).toBe(false);
    expect(variantSchema.safeParse({ key: "D", ...pkg() }).success).toBe(false);
  });

  it("validates a composition card", () => {
    expect(compositionSchema.safeParse(card()).success).toBe(true);
    const hero = { what: "Héros", role: "hero", sizePct: 30, position: "left" };
    const support = (position: string) => ({ what: "Soutien", role: "support", sizePct: 10, position });
    expect(messages(compositionSchema.safeParse(card({ elements: [hero, support("right"), support("top"), support("bottom")] })))).toEqual([
      "3 éléments maximum : retire-en un",
    ]);
    expect(messages(compositionSchema.safeParse(card({ elements: [support("right")] })))).toEqual(["Exactement un élément héros"]);
    expect(messages(compositionSchema.safeParse(card({ elements: [hero, { ...hero, position: "right" }] })))).toEqual([
      "Exactement un élément héros",
    ]);
    expect(
      messages(compositionSchema.safeParse(card({ elements: [{ ...hero, sizePct: 70 }, { ...support("right"), sizePct: 45 }] }))),
    ).toEqual(["La somme des tailles (115 %) dépasse 110 %"]);
    expect(messages(compositionSchema.safeParse(card({ textZone: { position: "left", heightPct: 20 } })))).toEqual([
      "La zone de texte ne peut pas être sur la case du héros",
    ]);
    expect(compositionSchema.safeParse(card({ textZone: null })).success).toBe(true);
    expect(compositionSchema.safeParse(card({ textZone: { position: "top", heightPct: 31 } })).success).toBe(false);
    expect(compositionSchema.safeParse(card({ elements: [{ ...hero, sizePct: 71 }] })).success).toBe(false);
  });

  it("defaults the emotion to intensity 2, mouth closed", () => {
    const parsed = compositionSchema.parse(card({ emotion: { label: "curiosité" } }));
    expect(parsed.emotion).toEqual({ label: "curiosité", intensity: 2, mouth: "closed" });
  });

  it("refuses an emotion without a character and duplicated variants", () => {
    const withoutPersona = {
      ...emptyBrief(),
      common: { textMode: "rendered", persona: "none" },
      variants: [{ key: "A", ...pkg(), composition: card() }],
    };
    expect(messages(thumbnailBriefSchema.safeParse(withoutPersona))).toEqual(["Pas d'émotion sans personnage"]);
    const unset = { ...withoutPersona, common: { textMode: "rendered" } };
    expect(thumbnailBriefSchema.safeParse(unset).success).toBe(true);
    const twice = { ...emptyBrief(), variants: [{ key: "A", ...pkg() }, { key: "A", ...pkg() }] };
    expect(messages(thumbnailBriefSchema.safeParse(twice))).toEqual(["Variante A en double"]);
  });

  it("caps logos, references and variants at 3", () => {
    const logo = { name: "Claude", source: "stored:lg_1" };
    expect(thumbnailBriefSchema.safeParse({ ...emptyBrief(), logos: [logo, logo, logo] }).success).toBe(true);
    expect(messages(thumbnailBriefSchema.safeParse({ ...emptyBrief(), logos: [logo, logo, logo, logo] }))).toEqual(["3 logos maximum"]);
    expect(thumbnailBriefSchema.safeParse({ ...emptyBrief(), logos: [{ name: "X", source: "https://x" }] }).success).toBe(false);
    const variants = ["A", "B", "C", "A"].map((key) => ({ key, ...pkg() }));
    expect(thumbnailBriefSchema.safeParse({ ...emptyBrief(), variants }).success).toBe(false);
  });

  it("defaults the counters and the collections, so an older stored brief still validates", () => {
    const parsed = thumbnailBriefSchema.parse({ step: 3, usage: { research: 1 } });
    expect(parsed).toMatchObject({
      step: 3,
      video: {},
      logoCandidates: [],
      logos: [],
      references: [],
      common: { textMode: "rendered" },
      variants: [],
      usage: { research: 1, competitorSearches: 0, analyses: 0, sketches: 0 },
    });
    expect(thumbnailBriefSchema.parse({})).toEqual(emptyBrief());
  });

  it("repairs a stored brief by dropping only what breaks the rules", () => {
    const stored = {
      step: 6,
      video: { promise: "Savoir cliquer" },
      logos: [{ name: "Claude", source: "https://evil.example/logo.svg" }],
      common: { textMode: "rendered", persona: "none" },
      variants: [
        { key: "A", ...pkg(), composition: card() },
        { key: "B", ...pkg({ thumbnailText: "a b c d e f" }) },
        { key: "A", ...pkg({ direction: "Doublon" }) },
      ],
    };
    const { brief, dropped } = repairBrief(stored);
    expect(thumbnailBriefSchema.safeParse(brief).success).toBe(true);
    expect(brief.step).toBe(6);
    expect(brief.video.promise).toBe("Savoir cliquer");
    expect(brief.logos).toEqual([]);
    // The emotion without a character goes, the card stays; a variant missing a required field goes whole; the duplicate goes.
    expect(brief.variants.map((variant) => variant.key)).toEqual(["A"]);
    expect(brief.variants[0].direction).toBe("Promesse chiffrée");
    expect(brief.variants[0].composition?.focal).toBe("Visage surpris");
    expect(brief.variants[0].composition?.emotion).toBeUndefined();
    expect(dropped.length).toBeGreaterThan(0);
    expect(repairBrief("not an object")).toEqual({ brief: emptyBrief(), dropped: ["(fiche illisible)"] });
    expect(repairBrief(emptyBrief()).dropped).toEqual([]);
  });
});
