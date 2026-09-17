import { z } from "zod";
import {
  AB_STRATEGIES,
  AB_VARIABLES,
  BRIEF_MODELS,
  BRIEF_TOTAL_STEPS,
  ENTITY_KINDS,
  TEXT_MODES,
  VARIANT_KEYS,
  compositionShape,
  logoSchema,
  referenceSchema,
  sketchSchema,
  thumbnailBriefSchema,
  type AbVariable,
  type BriefIssue,
  type BriefVariant,
  type Composition,
  type ThumbnailBrief,
  type VariantKey,
} from "./schema";

/**
 * Updates of the thumbnail brief (update_brief and PATCH /api/briefs/…): the
 * keyed merge, the final validation and the warnings. Pure and client-safe.
 * Patch schemas only check shapes; the brief schema gives the readable rules.
 */

const optionalText = z.string().nullable().optional();

export const videoPatchSchema = z.object({
  subject: optionalText,
  workingTitle: optionalText,
  script: optionalText,
  promise: optionalText,
  audience: optionalText,
});

export const researchPatchSchema = z.object({
  summary: z.string().optional(),
  keyPoints: z.array(z.string()).optional(),
  entities: z.array(z.object({ name: z.string(), kind: z.enum(ENTITY_KINDS) })).optional(),
});

export const commonPatchSchema = z.object({
  persona: optionalText.describe('stored:persona_<id> or "none"'),
  style: optionalText,
  colors: z.array(z.string()).nullable().optional().describe("Up to 3 #RRGGBB colors"),
  textMode: z.enum(TEXT_MODES).optional(),
  model: z.enum(BRIEF_MODELS).nullable().optional(),
});

export const competitionPatchSchema = z.object({
  patterns: z.array(z.string()).optional(),
  saturation: z.array(z.string()).optional(),
  dominantPalette: z.array(z.string()).optional(),
});

export const variantSetSchema = z.object({
  direction: z.string().optional(),
  title: z.string().optional(),
  thumbnailText: z.string().optional().describe('0 to 4 words, max 20 characters; "" = no text'),
  visualIdea: z.string().optional(),
  titleRole: z.string().optional(),
  thumbRole: z.string().optional(),
  composition: compositionShape.nullable().optional().describe("The whole composition card (replaces the previous one)"),
  sketch: sketchSchema.nullable().optional().describe("The whole sketch record (replaces the previous one)"),
});

export const briefUpdateInputSchema = z.object({
  step: z.number().int().min(1).max(BRIEF_TOTAL_STEPS).optional().describe("The journey step you are moving to (1-7)"),
  video: videoPatchSchema.optional(),
  research: researchPatchSchema.optional(),
  common: commonPatchSchema.optional(),
  competition: competitionPatchSchema.optional(),
  abStrategy: z.enum(AB_STRATEGIES).nullable().optional(),
  abVariable: z.enum(AB_VARIABLES).nullable().optional(),
  logos: z.array(logoSchema).optional().describe("Replaces all the logos (max 3)"),
  references: z.array(referenceSchema).optional().describe("Replaces all the references (max 3)"),
  variant: z.object({ key: z.enum(VARIANT_KEYS), set: variantSetSchema }).optional(),
  removeVariant: z.enum(VARIANT_KEYS).optional(),
});
export type BriefUpdateInput = z.output<typeof briefUpdateInputSchema>;

/** What the « Fiche » panel may change: the same merge, without step nor research. */
export const briefPatchInputSchema = briefUpdateInputSchema.omit({ step: true, research: true });
export type BriefPatchInput = z.output<typeof briefPatchInputSchema>;
export const BRIEF_PATCH_KEYS: string[] = Object.keys(briefPatchInputSchema.shape);

function mergeFields(base: object, patch: object): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}

/** The merged, NOT yet validated brief. */
export function mergeBrief(current: ThumbnailBrief, input: BriefUpdateInput, now: string): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current };
  if (input.step !== undefined) next.step = input.step;
  if (input.video) next.video = mergeFields(current.video, input.video);
  if (input.research) {
    const base = current.research ?? { summary: "", keyPoints: [], entities: [], sources: [], fetchedAt: now };
    next.research = { ...mergeFields(base, input.research), sources: base.sources, fetchedAt: base.fetchedAt };
  }
  if (input.common) next.common = mergeFields(current.common, input.common);
  if (input.competition) {
    next.competition = mergeFields(current.competition ?? { patterns: [], saturation: [], dominantPalette: [], analyzedAt: now }, input.competition);
  }
  for (const key of ["abStrategy", "abVariable"] as const) {
    const value = input[key];
    if (value === null) delete next[key];
    else if (value !== undefined) next[key] = value;
  }
  if (input.logos) next.logos = input.logos;
  if (input.references) next.references = input.references;

  let variants: Record<string, unknown>[] = current.variants.map((variant) => ({ ...variant }));
  if (input.removeVariant) variants = variants.filter((variant) => variant.key !== input.removeVariant);
  if (input.variant) {
    const { key, set } = input.variant;
    const index = variants.findIndex((variant) => variant.key === key);
    const merged = mergeFields(index >= 0 ? variants[index] : { key }, set);
    if (index >= 0) variants[index] = merged;
    else variants.push(merged);
  }
  next.variants = variants.sort((a, b) => String(a.key).localeCompare(String(b.key)));
  return next;
}

export function validateBrief(candidate: Record<string, unknown>): { ok: true; brief: ThumbnailBrief } | { ok: false; issues: BriefIssue[] } {
  const parsed = thumbnailBriefSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, brief: parsed.data };
  const variants = Array.isArray(candidate.variants) ? (candidate.variants as Array<{ key?: unknown }>) : [];
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path
        .map((segment, index) => {
          const key = typeof segment === "number" && index === 1 && issue.path[0] === "variants" ? variants[segment]?.key : undefined;
          return typeof key === "string" ? key : String(segment);
        })
        .join("."),
      message: issue.message,
    })),
  };
}

const STOP_WORDS = new Set([
  "le", "la", "les", "l", "un", "une", "des", "de", "du", "d", "et", "ou", "a", "au", "aux", "en", "dans", "pour", "par",
  "sur", "avec", "sans", "ce", "cet", "cette", "ces", "mon", "ma", "mes", "ton", "ta", "tes", "son", "sa", "ses", "je",
  "j", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles", "qui", "que", "qu", "quoi", "est", "sont", "pas", "ne",
  "n", "plus", "the", "an", "of", "to", "in", "for", "with", "and", "or", "is", "are", "it", "this", "that", "my",
  "your", "how", "what", "why", "vs",
]);

/** Lowercase words without accents and without FR/EN stop words. */
export function normalizeWords(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0 && !STOP_WORDS.has(word));
}

/** Words of the thumbnail text also in the title, ignoring the words of the given entity names. */
export function titleTextOverlap(title: string, thumbnailText: string, entityNames: string[]): string[] {
  const excluded = new Set(entityNames.flatMap(normalizeWords));
  const titleWords = new Set(normalizeWords(title));
  return [...new Set(normalizeWords(thumbnailText).filter((word) => titleWords.has(word) && !excluded.has(word)))];
}

const COMPARED_FIELDS = ["thumbnailText", "layout", "layoutNote", "focal", "elements", "textZone", "background", "emotion", "palette"] as const;
type ComparedField = (typeof COMPARED_FIELDS)[number];

const FIELD_LABELS: Record<ComparedField, string> = {
  thumbnailText: "le texte",
  layout: "la mise en page",
  layoutNote: "la note de mise en page",
  focal: "le sujet focal",
  elements: "les éléments",
  textZone: "la zone de texte",
  background: "le fond",
  emotion: "l'émotion",
  palette: "la palette",
};

/** What a single-variable test may change between A and B/C. */
export const AB_VARIABLE_FIELDS: Record<AbVariable, readonly ComparedField[]> = {
  text: ["thumbnailText", "textZone"],
  emotion: ["emotion"],
  background: ["background", "palette"],
  hero: ["focal", "elements"],
};

const AB_VARIABLE_LABELS: Record<AbVariable, string> = { text: "le texte", emotion: "l'émotion", background: "le fond", hero: "le héros" };

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

type CardVariant = BriefVariant & { composition: Composition };

function comparable(variant: CardVariant, field: ComparedField): unknown {
  return field === "thumbnailText" ? variant.thumbnailText.trim().toLowerCase() : (variant.composition[field] ?? null);
}

function strategyWarnings(brief: ThumbnailBrief, touched: VariantKey | undefined): string[] {
  const withCard = brief.variants.filter((variant): variant is CardVariant => Boolean(variant.composition));
  const warnings: string[] = [];
  if (brief.abStrategy === "concepts") {
    for (let i = 0; i < withCard.length; i++) {
      for (let j = i + 1; j < withCard.length; j++) {
        const [a, b] = [withCard[i], withCard[j]];
        if (touched && a.key !== touched && b.key !== touched) continue;
        const sameFocal = normalizeWords(a.composition.focal).join(" ") === normalizeWords(b.composition.focal).join(" ");
        if (a.composition.layout === b.composition.layout && sameFocal) {
          warnings.push(`Variantes ${a.key} et ${b.key} : même mise en page et même sujet focal. Choisis des concepts vraiment différents.`);
        }
      }
    }
  }
  const variable = brief.abVariable;
  if (brief.abStrategy === "single-variable" && variable) {
    const base = withCard.find((variant) => variant.key === "A");
    for (const other of base ? withCard : []) {
      if (other.key === "A" || (touched && touched !== "A" && other.key !== touched)) continue;
      const extra = COMPARED_FIELDS.filter(
        (field) => !AB_VARIABLE_FIELDS[variable].includes(field) && stableJson(comparable(base!, field)) !== stableJson(comparable(other, field)),
      );
      if (extra.length > 0) {
        warnings.push(
          `Variante ${other.key} : diffère de A sur ${extra.map((field) => FIELD_LABELS[field]).join(", ")}, alors que le test ne change que ${AB_VARIABLE_LABELS[variable]}.`,
        );
      }
    }
  }
  return warnings;
}

/** Warnings for what this update touched: the text/title overlap of its variant, and the A/B strategy. */
export function briefWarnings(brief: ThumbnailBrief, input: BriefUpdateInput): string[] {
  const touched = input.variant?.key;
  const warnings: string[] = [];
  const variant = touched ? brief.variants.find((candidate) => candidate.key === touched) : undefined;
  if (variant) {
    const entityNames = [...(brief.research?.entities.map((entity) => entity.name) ?? []), ...brief.logos.map((logo) => logo.name)];
    const words = titleTextOverlap(variant.title, variant.thumbnailText, entityNames);
    if (words.length > 1) {
      warnings.push(
        `Variante ${variant.key} : le texte « ${variant.thumbnailText} » répète le titre (${words.join(", ")}). Reformule-le pour qu'il complète le titre.`,
      );
    }
  }
  if (touched || input.abStrategy !== undefined || input.abVariable !== undefined) warnings.push(...strategyWarnings(brief, touched));
  return warnings;
}

export type BriefUpdateResult = { ok: true; brief: ThumbnailBrief; warnings: string[] } | { ok: false; issues: BriefIssue[] };

export function applyBriefUpdate(current: ThumbnailBrief, input: BriefUpdateInput, now: string): BriefUpdateResult {
  const validated = validateBrief(mergeBrief(current, input, now));
  if (!validated.ok) return validated;
  return { ok: true, brief: validated.brief, warnings: briefWarnings(validated.brief, input) };
}
