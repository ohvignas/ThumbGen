import { askUserOptionImage } from "@/lib/agent/browser-tools/ask-user";
import type { BriefPatchInput } from "@/lib/brief/merge";
import { TEXT_MODES, type AbVariable, type Composition, type Grid9, type Layout, type ThumbnailBrief, type VariantKey } from "@/lib/brief/schema";
import type { BriefPatchOutcome } from "@/store/brief-store";

/** Labels, select items and PATCH builders of the « Fiche » panel. Pure. */

export type PatchBrief = (body: BriefPatchInput) => Promise<BriefPatchOutcome>;
/** Saves one field; resolves to the message shown under it, or null once saved. */
export type SaveField = (value: string) => Promise<string | null>;
type Item = { value: string; label: string };

type VideoPatch = NonNullable<BriefPatchInput["video"]>;
type VariantSet = NonNullable<BriefPatchInput["variant"]>["set"];

export function fieldSaver(onPatch: PatchBrief, build: (value: string) => BriefPatchInput | string): SaveField {
  return async (value) => {
    const body = build(value);
    if (typeof body === "string") return body;
    const outcome = await onPatch(body);
    return outcome.ok ? null : (outcome.issues[0]?.message ?? outcome.error);
  };
}

export function videoFieldPatch(field: "promise" | "audience", value: string): BriefPatchInput {
  const video: VideoPatch = {};
  video[field] = value.trim() === "" ? null : value.trim();
  return { video };
}

export function variantFieldPatch(key: VariantKey, field: "title" | "thumbnailText" | "visualIdea", value: string): BriefPatchInput {
  const set: VariantSet = {};
  set[field] = value.trim();
  return { variant: { key, set } };
}

/** The whole card: the merge replaces a composition as a whole. */
export function compositionPatch(key: VariantKey, composition: Composition): BriefPatchInput {
  return { variant: { key, set: { composition } } };
}

export function textModePatch(value: string): BriefPatchInput | string {
  const textMode = TEXT_MODES.find((mode) => mode === value);
  return textMode ? { common: { textMode } } : "Mode de texte inconnu";
}

export function formatScore(score: number | null): string {
  return score === null ? "peu de données" : `×${score.toFixed(1).replace(".", ",")}`;
}

export function imageUrlOf(source: string | undefined): string | null {
  return askUserOptionImage(source)?.src ?? null;
}

const AB_VARIABLE_LABELS: Record<AbVariable, string> = { text: "le texte", emotion: "l'émotion", background: "le fond", hero: "le héros" };

export function strategyLabel(brief: ThumbnailBrief): string {
  if (brief.abStrategy === "concepts") return "Trouver le meilleur concept";
  if (brief.abStrategy === "single-variable") {
    return brief.abVariable ? `Optimiser un détail : ${AB_VARIABLE_LABELS[brief.abVariable]}` : "Optimiser un détail";
  }
  return "Stratégie pas encore choisie.";
}

const GRID_LABELS: Record<Grid9, string> = {
  "top-left": "Haut gauche",
  top: "Haut",
  "top-right": "Haut droite",
  left: "Gauche",
  center: "Centre",
  right: "Droite",
  "bottom-left": "Bas gauche",
  bottom: "Bas",
  "bottom-right": "Bas droite",
};
export const GRID_ITEMS: Item[] = Object.entries(GRID_LABELS).map(([value, label]) => ({ value, label }));

export const LAYOUT_LABELS: Record<Layout, string> = {
  "face-left_object-right": "Visage à gauche, objet à droite",
  "face-right_object-left": "Visage à droite, objet à gauche",
  "center-hero_text-top": "Héros au centre, texte en haut",
  "split-versus": "Duel côte à côte",
  "before-after": "Avant / après",
  "screen-hero_face-corner": "Écran en héros, visage dans un coin",
  "object-hero_no-face": "Objet en héros, sans visage",
  other: "Autre mise en page",
};

export const BACKGROUND_ITEMS: Item[] = [
  { value: "solid", label: "Aplat" },
  { value: "gradient", label: "Dégradé" },
  { value: "blurred-scene", label: "Scène floutée" },
  { value: "scene", label: "Scène" },
];

export const EMOTION_ITEMS: Item[] = ["curiosité", "surprise", "satisfaction", "inquiétude", "concentration", "déterminé"].map((value) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
}));

export const INTENSITY_ITEMS: Item[] = [
  { value: "1", label: "Légère" },
  { value: "2", label: "Moyenne" },
  { value: "3", label: "Forte" },
];

export const MOUTH_ITEMS: Item[] = [
  { value: "closed", label: "Bouche fermée" },
  { value: "open", label: "Bouche ouverte" },
];

export const TEXT_MODE_ITEMS: Item[] = [
  { value: "rendered", label: "Écrit par le modèle" },
  { value: "overlay", label: "Zone vide, texte ajouté ensuite" },
];

export const SKETCH_STATUS_LABELS: Record<"pending" | "validated" | "retouch", string> = {
  pending: "Esquisse à valider",
  validated: "Esquisse validée",
  retouch: "Esquisse à retoucher",
};
