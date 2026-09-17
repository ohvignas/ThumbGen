import { z } from "zod";
import { median } from "./performance";

/** The fixed thumbnail types of chantier D §5 (client-safe). */
export const THUMB_TYPES = [
  { id: "face_text", label: "Visage + texte" },
  { id: "reaction", label: "Réaction sans texte" },
  { id: "before_after", label: "Avant / Après" },
  { id: "versus", label: "Versus / comparaison" },
  { id: "screenshot", label: "Capture d'écran / interface" },
  { id: "object", label: "Objet ou produit central" },
  { id: "text_only", label: "Texte seul" },
  { id: "scene", label: "Scène / illustration" },
  { id: "other", label: "Autre" },
] as const;

export type ThumbType = (typeof THUMB_TYPES)[number]["id"];

export const THUMB_TYPE_IDS = THUMB_TYPES.map((type) => type.id) as [ThumbType, ...ThumbType[]];

/** Filter value for thumbnails without a type. */
export const UNCLASSIFIED_FILTER = "none";
export const UNCLASSIFIED_LABEL = "Non classée";
export type ThumbTypeFilter = ThumbType | typeof UNCLASSIFIED_FILTER;

export function isThumbType(value: unknown): value is ThumbType {
  return typeof value === "string" && (THUMB_TYPE_IDS as readonly string[]).includes(value);
}

export function thumbTypeLabel(type: string | null | undefined): string {
  return THUMB_TYPES.find((entry) => entry.id === type)?.label ?? UNCLASSIFIED_LABEL;
}

const ClassificationSchema = z.object({ type: z.enum(THUMB_TYPE_IDS) });

/** The model must answer {"type": "<id>"}; anything else counts as « other ». */
export function parseClassification(content: string | null | undefined): ThumbType {
  if (!content) return "other";
  const unfenced = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    const parsed = ClassificationSchema.safeParse(JSON.parse(unfenced));
    return parsed.success ? parsed.data.type : "other";
  } catch {
    return "other";
  }
}

export const MIN_SCORED_FOR_RANKING = 3;

export type TypeSummaryInput = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  thumbType: ThumbType;
  score: number | null;
};

export type TypeSummaryRow = {
  type: ThumbType;
  label: string;
  totalCount: number;
  scoredCount: number;
  enoughData: boolean;
  medianScore: number | null;
  best: { videoId: string; title: string; thumbnailUrl: string; score: number } | null;
};

type ScoredInput = TypeSummaryInput & { score: number };

/**
 * « Les types qui marchent »: one row per type that has thumbnails. Types with
 * at least 3 scored thumbnails are ranked by median score; the others follow,
 * flagged as not having enough data.
 */
export function summarizeTypes(videos: readonly TypeSummaryInput[]): TypeSummaryRow[] {
  const byType = new Map<ThumbType, TypeSummaryInput[]>();
  for (const video of videos) {
    const list = byType.get(video.thumbType) ?? [];
    list.push(video);
    byType.set(video.thumbType, list);
  }

  const rows: TypeSummaryRow[] = [];
  for (const { id, label } of THUMB_TYPES) {
    const list = byType.get(id);
    if (!list || list.length === 0) continue;
    const scored = list.filter((video): video is ScoredInput => video.score !== null);
    const enoughData = scored.length >= MIN_SCORED_FOR_RANKING;
    const best = enoughData ? scored.reduce((top, video) => (video.score > top.score ? video : top)) : null;
    const middle = enoughData ? median(scored.map((video) => video.score)) : null;
    rows.push({
      type: id,
      label,
      totalCount: list.length,
      scoredCount: scored.length,
      enoughData,
      medianScore: middle === null ? null : Math.round(middle * 10) / 10,
      best: best ? { videoId: best.videoId, title: best.title, thumbnailUrl: best.thumbnailUrl, score: best.score } : null,
    });
  }

  return rows.sort((a, b) => {
    if (a.enoughData !== b.enoughData) return a.enoughData ? -1 : 1;
    if (a.enoughData) return (b.medianScore ?? 0) - (a.medianScore ?? 0) || b.scoredCount - a.scoredCount;
    return b.totalCount - a.totalCount;
  });
}
