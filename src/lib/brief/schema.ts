import { z } from "zod";
import { THUMB_TYPE_IDS } from "@/lib/youtube/thumb-types";

/**
 * The thumbnail brief (« fiche miniature », chantier F3): every decision of the
 * thumbnail journey, one brief per conversation. Pure and client-safe — shared
 * by the store, the update_brief tool, the routes and the « Fiche » panel.
 * Fields filled by later tools (research, logo candidates, competition,
 * references, sketch review) are already defined so stored briefs never need
 * a migration.
 */

export const BRIEF_TOTAL_STEPS = 7;

export const VARIANT_KEYS = ["A", "B", "C"] as const;
export type VariantKey = (typeof VARIANT_KEYS)[number];

export const GRID9 = ["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"] as const;
export type Grid9 = (typeof GRID9)[number];

export const LAYOUTS = [
  "face-left_object-right",
  "face-right_object-left",
  "center-hero_text-top",
  "split-versus",
  "before-after",
  "screen-hero_face-corner",
  "object-hero_no-face",
  "other",
] as const;
export type Layout = (typeof LAYOUTS)[number];

export const EMOTION_LABELS = ["curiosité", "surprise", "satisfaction", "inquiétude", "concentration", "déterminé"] as const;
export const BACKGROUND_KINDS = ["solid", "gradient", "blurred-scene", "scene"] as const;
export const AB_STRATEGIES = ["concepts", "single-variable"] as const;
export const AB_VARIABLES = ["text", "emotion", "background", "hero"] as const;
export type AbVariable = (typeof AB_VARIABLES)[number];
export const BRIEF_MODELS = ["nano-banana", "openai", "seedream"] as const;
export const TEXT_MODES = ["rendered", "overlay"] as const;
export type TextMode = (typeof TEXT_MODES)[number];
export const ENTITY_KINDS = ["company", "tool", "product", "other"] as const;

export const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

const THUMBNAIL_TEXT_MAX_CHARS = 20;
const THUMBNAIL_TEXT_MAX_WORDS = 4;

const max = (limit: number) => z.string().trim().max(limit, `${limit} caractères maximum`);
const required = (limit: number) => max(limit).min(1, "Champ requis");
const hex = z.string().regex(HEX_PATTERN, "Couleur au format #RRGGBB");
const grid9 = z.enum(GRID9);
const oneToThree = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const count = z.number().int().min(0);

/** Why a thumbnail text is refused, or null: at most 4 words and 20 characters ("" = no text). */
export function thumbnailTextIssue(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length > THUMBNAIL_TEXT_MAX_CHARS) return "Texte de miniature : 20 caractères maximum";
  if (trimmed.split(/\s+/).filter(Boolean).length > THUMBNAIL_TEXT_MAX_WORDS) return "Texte de miniature : 4 mots maximum";
  return null;
}

const thumbnailText = z
  .string()
  .trim()
  .superRefine((text, ctx) => {
    const issue = thumbnailTextIssue(text);
    if (issue) ctx.addIssue({ code: "custom", message: issue });
  });

export const emotionSchema = z.object({
  label: z.enum(EMOTION_LABELS),
  intensity: oneToThree.default(2),
  mouth: z.enum(["closed", "open"]).default("closed"),
});

export const compositionElementSchema = z.object({
  what: required(80),
  role: z.enum(["hero", "support"]),
  sizePct: z.number().int("Taille entière en %").min(5, "Taille minimale : 5 %").max(70, "Taille maximale : 70 %"),
  position: grid9,
});

/** The card's shape without its cross-field rules (used by the patch schemas the model sees). */
export const compositionShape = z.object({
  layout: z.enum(LAYOUTS),
  layoutNote: max(120).optional(),
  focal: required(80),
  elements: z.array(compositionElementSchema).min(1, "Au moins un élément").max(3, "3 éléments maximum : retire-en un"),
  textZone: z
    .object({
      position: grid9,
      heightPct: z.number().int().min(12, "Zone de texte : 12 % minimum").max(30, "Zone de texte : 30 % maximum"),
    })
    .nullable(),
  background: z.object({ kind: z.enum(BACKGROUND_KINDS), color: hex.optional(), note: max(120).optional() }),
  emotion: emotionSchema.optional(),
  palette: z.object({ dominant: hex, accent: hex, highlight: hex }),
});

export const compositionSchema = compositionShape.superRefine((card, ctx) => {
  const heroes = card.elements.filter((element) => element.role === "hero");
  if (heroes.length !== 1) ctx.addIssue({ code: "custom", path: ["elements"], message: "Exactement un élément héros" });
  const sum = card.elements.reduce((total, element) => total + element.sizePct, 0);
  if (sum > 110) ctx.addIssue({ code: "custom", path: ["elements"], message: `La somme des tailles (${sum} %) dépasse 110 %` });
  if (heroes.length === 1 && card.textZone && card.textZone.position === heroes[0].position) {
    ctx.addIssue({ code: "custom", path: ["textZone", "position"], message: "La zone de texte ne peut pas être sur la case du héros" });
  }
});
export type Composition = z.output<typeof compositionSchema>;

export const SKETCH_SOURCE_PATTERN = /^generated:sk_[A-Za-z0-9]+$/;

export const sketchSchema = z.object({
  source: z.string().regex(SKETCH_SOURCE_PATTERN, "Esquisse au format generated:sk_<id>"),
  status: z.enum(["pending", "validated", "retouch"]),
  autoFixed: z.boolean().default(false),
  review: z
    .object({
      focal: z.boolean(),
      elementCount: count,
      textZoneOk: z.boolean(),
      faceOk: z.boolean().nullable(),
      standsOut: z.boolean(),
      matchesCard: z.boolean(),
      contrast: z.number().nullable(),
      note: max(200).optional(),
    })
    .optional(),
});
export type BriefSketch = z.output<typeof sketchSchema>;

export const variantSchema = z.object({
  key: z.enum(VARIANT_KEYS),
  direction: required(60),
  title: required(60),
  thumbnailText,
  visualIdea: required(120),
  titleRole: required(80),
  thumbRole: required(80),
  composition: compositionSchema.optional(),
  sketch: sketchSchema.optional(),
});

export const researchSchema = z.object({
  summary: max(1200),
  keyPoints: z.array(max(200)).max(6, "6 points clés maximum"),
  entities: z.array(z.object({ name: required(80), kind: z.enum(ENTITY_KINDS) })).max(12, "12 entités maximum"),
  sources: z.array(z.object({ title: max(200), url: z.url() })).max(8, "8 sources maximum"),
  fetchedAt: z.string(),
});

export const logoCandidateSchema = z.object({
  id: required(40),
  name: required(80),
  source: z.enum(["simple-icons", "svgl", "wikimedia"]),
  ref: z.string(),
  previewUrl: z.string(),
});

export const logoSchema = z.object({
  name: required(80),
  source: z.string().regex(/^stored:lg_[\w-]+$/, "Logo au format stored:lg_<id>"),
});

export const competitionSchema = z.object({
  patterns: z.array(max(120)).max(3),
  saturation: z.array(max(120)).max(3),
  dominantPalette: z.array(hex).max(3),
  analyzedAt: z.string(),
});

export const thumbAnalysisSchema = z.object({
  type: z.enum(THUMB_TYPE_IDS),
  faceCount: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  emotion: z.enum(EMOTION_LABELS).optional(),
  emotionIntensity: oneToThree.optional(),
  mouthOpen: z.boolean().optional(),
  textWords: count,
  text: max(60).optional(),
  elementCount: count,
  layout: z.enum(LAYOUTS),
  background: z.enum(["solid", "gradient", "scene", "screenshot"]),
  dominantColors: z.array(hex).max(3),
  hasLogo: z.boolean(),
  hasArrowOrCircle: z.boolean(),
});

export const referenceSchema = z.object({
  videoId: z.string().regex(/^[\w-]{6,20}$/, "Identifiant de vidéo invalide"),
  title: max(200),
  channel: max(120),
  lang: z.enum(["fr", "en"]),
  views: count,
  score: z.number().nullable(),
  ageDays: count,
  source: z.string().regex(/^stored:sf_[\w-]+$/, "Référence au format stored:sf_<id>"),
  analysis: thumbAnalysisSchema.optional(),
});

export const commonSchema = z.object({
  persona: z
    .union([z.string().regex(/^stored:persona_[\w-]+$/, "Personnage au format stored:persona_<id>"), z.literal("none")])
    .optional(),
  style: max(300).optional(),
  colors: z.array(hex).max(3, "3 couleurs maximum").optional(),
  textMode: z.enum(TEXT_MODES).default("rendered"),
  model: z.enum(BRIEF_MODELS).optional(),
});

export const usageSchema = z.object({ research: count, competitorSearches: count, analyses: count, sketches: count });

export const thumbnailBriefSchema = z
  .object({
    step: z.number().int().min(1).max(BRIEF_TOTAL_STEPS),
    video: z.object({
      subject: max(300).optional(),
      workingTitle: max(120).optional(),
      script: max(8000).optional(),
      promise: max(90).optional(),
      audience: max(120).optional(),
    }),
    research: researchSchema.optional(),
    logoCandidates: z.array(logoCandidateSchema).max(36),
    logos: z.array(logoSchema).max(3, "3 logos maximum"),
    competition: competitionSchema.optional(),
    references: z.array(referenceSchema).max(3, "3 références maximum"),
    abStrategy: z.enum(AB_STRATEGIES).optional(),
    abVariable: z.enum(AB_VARIABLES).optional(),
    common: commonSchema,
    variants: z.array(variantSchema).max(3, "3 variantes maximum"),
    usage: usageSchema,
  })
  .superRefine((brief, ctx) => {
    const seen = new Set<string>();
    brief.variants.forEach((variant, index) => {
      if (seen.has(variant.key)) {
        ctx.addIssue({ code: "custom", path: ["variants", index, "key"], message: `Variante ${variant.key} en double` });
      }
      seen.add(variant.key);
      if (variant.composition?.emotion && brief.common.persona === "none") {
        ctx.addIssue({ code: "custom", path: ["variants", index, "composition", "emotion"], message: "Pas d'émotion sans personnage" });
      }
    });
  });

export type ThumbnailBrief = z.output<typeof thumbnailBriefSchema>;
export type BriefVariant = ThumbnailBrief["variants"][number];
export type BriefUsage = ThumbnailBrief["usage"];

export function emptyBrief(): ThumbnailBrief {
  return {
    step: 1,
    video: {},
    logoCandidates: [],
    logos: [],
    references: [],
    common: { textMode: "rendered" },
    variants: [],
    usage: { research: 0, competitorSearches: 0, analyses: 0, sketches: 0 },
  };
}

export type BriefIssue = { path: string; message: string };

export function briefIssues(error: z.ZodError): BriefIssue[] {
  return error.issues.map((issue) => ({ path: issue.path.map(String).join("."), message: issue.message }));
}
