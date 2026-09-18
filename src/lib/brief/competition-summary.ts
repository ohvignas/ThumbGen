import { thumbTypeLabel } from "@/lib/youtube/thumb-types";
import type { BriefCompetition, Layout, ThumbAnalysis } from "./schema";

export type AnalyzedCompetitor = {
  lang: "fr" | "en";
  score: number | null;
  analysis: ThumbAnalysis;
};

const LAYOUT_LABELS: Record<Layout, string> = {
  "face-left_object-right": "Visage à gauche, objet à droite",
  "face-right_object-left": "Visage à droite, objet à gauche",
  "center-hero_text-top": "Héros au centre, texte en haut",
  "split-versus": "Versus / split",
  "before-after": "Avant / après",
  "screen-hero_face-corner": "Écran au centre, visage en coin",
  "object-hero_no-face": "Objet central sans visage",
  other: "Autre composition",
};

const BACKGROUND_LABELS: Record<ThumbAnalysis["background"], string> = {
  solid: "Fond uni",
  gradient: "Dégradé",
  scene: "Scène",
  screenshot: "Capture d'écran",
};

export function traitsOf(analysis: ThumbAnalysis): string[] {
  const traits = [thumbTypeLabel(analysis.type), LAYOUT_LABELS[analysis.layout], BACKGROUND_LABELS[analysis.background]];
  if (analysis.hasLogo) traits.push("Logo");
  if (analysis.hasArrowOrCircle) traits.push("Flèche ou cercle");
  if (analysis.faceCount > 0) traits.push("Visage");
  if (analysis.textWords > 0) traits.push("Texte");
  return traits;
}

function topLabels(counts: Map<string, number>, limit: number): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"))
    .slice(0, limit)
    .map(([label]) => label);
}

/** Server-side summary: no LLM. Patterns among score ≥ 3; saturation on FR; palette weighted by FR score. */
export function summarizeCompetition(items: readonly AnalyzedCompetitor[]): Omit<BriefCompetition, "analyzedAt"> {
  const patternCounts = new Map<string, number>();
  for (const item of items) {
    if (item.score === null || item.score < 3) continue;
    for (const trait of traitsOf(item.analysis)) patternCounts.set(trait, (patternCounts.get(trait) ?? 0) + 1);
  }

  const french = items.filter((item) => item.lang === "fr");
  const saturationCounts = new Map<string, number>();
  for (const item of french) {
    for (const trait of traitsOf(item.analysis)) saturationCounts.set(trait, (saturationCounts.get(trait) ?? 0) + 1);
  }
  const saturationThreshold = french.length * 0.7;
  const saturation = [...saturationCounts.entries()]
    .filter(([, count]) => count > saturationThreshold)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"))
    .slice(0, 3)
    .map(([label]) => label);

  const palette = new Map<string, number>();
  for (const item of french) {
    const weight = item.score ?? 0;
    if (weight <= 0) continue;
    for (const color of item.analysis.dominantColors) {
      palette.set(color, (palette.get(color) ?? 0) + weight);
    }
  }
  const dominantPalette = [...palette.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([color]) => color);

  return { patterns: topLabels(patternCounts, 3), saturation, dominantPalette };
}
