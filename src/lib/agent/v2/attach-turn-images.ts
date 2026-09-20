import {
  MAX_IMAGES_PER_CALL,
  MAX_IMAGES_PER_GENERATOR,
  resolveCanvasImageToJpeg,
} from "@/lib/agent/tools/_helpers/canvas-image-pixels";
import {
  catalogMentionableImagesFromSnapshot,
  type MentionableImage,
} from "@/lib/canvas/mentionable-images";

export type TurnImageSource = {
  image: string;
  visibleId?: string;
  imageNode?: string;
  label?: string;
};

export type TurnImageFilePart = { type: "file"; mediaType: string; data: string };

const ANALYZE_OR_IMPROVE =
  /\b(?:analys(?:e|er|es|ing|is)|analyz(?:e|ing|es)|regard(?:e|er|es)|look(?:ing)?\s+at|amélior(?:e|er|es|ation)|improv(?:e|ing|ement)s?|itér(?:e|er|ation)|iterat(?:e|ing|ion)s?)\b/iu;

export function messageAsksToAnalyzeOrImprove(text: string): boolean {
  return ANALYZE_OR_IMPROVE.test(text);
}

function generatorNodeIds(snapshot: unknown): Set<string> {
  const ids = new Set<string>();
  if (!snapshot || typeof snapshot !== "object") return ids;
  const nodes = (snapshot as { nodes?: unknown }).nodes;
  if (!Array.isArray(nodes)) return ids;
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const row = node as { id?: unknown; type?: unknown };
    if (row.type === "generator" && typeof row.id === "string") ids.add(row.id);
  }
  return ids;
}

function currentThumbnailSources(snapshot: unknown): TurnImageSource[] {
  if (!snapshot || typeof snapshot !== "object") return [];
  const raw = (snapshot as { currentThumbnails?: unknown }).currentThumbnails;
  if (!Array.isArray(raw)) return [];
  const out: TurnImageSource[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as { image?: unknown; visibleId?: unknown; imageNode?: unknown };
    if (typeof row.image !== "string" || !row.image) continue;
    out.push({
      image: row.image,
      ...(typeof row.visibleId === "string" ? { visibleId: row.visibleId } : {}),
      ...(typeof row.imageNode === "string" ? { imageNode: row.imageNode } : {}),
      label: "current thumbnail",
    });
  }
  return out;
}

function applyCaps(items: readonly TurnImageSource[], snapshot: unknown): TurnImageSource[] {
  const genIds = generatorNodeIds(snapshot);
  const genCount = new Map<string, number>();
  const seen = new Set<string>();
  const out: TurnImageSource[] = [];
  for (const item of items) {
    if (!item.image || seen.has(item.image)) continue;
    if (out.length >= MAX_IMAGES_PER_CALL) break;
    const nodeId = item.imageNode ?? "";
    if (genIds.has(nodeId)) {
      const n = genCount.get(nodeId) ?? 0;
      if (n >= MAX_IMAGES_PER_GENERATOR) continue;
      genCount.set(nodeId, n + 1);
    }
    seen.add(item.image);
    out.push(item);
  }
  return out;
}

/**
 * Which canvas images to attach as FileParts on this user turn.
 * @mentions win. Otherwise analyse / regarder / améliorer / iterate uses
 * visible aperçus, then currentThumbnails — never generator history slots.
 */
export function selectTurnImageSources(opts: {
  userText: string;
  mentionedImages: readonly MentionableImage[];
  canvasSnapshot: unknown;
}): TurnImageSource[] {
  if (opts.mentionedImages.length > 0) {
    return applyCaps(
      opts.mentionedImages.filter((row) => row.image),
      opts.canvasSnapshot,
    );
  }

  if (!messageAsksToAnalyzeOrImprove(opts.userText)) return [];

  const catalog = catalogMentionableImagesFromSnapshot(opts.canvasSnapshot);
  if (catalog.length > 0) return applyCaps(catalog, opts.canvasSnapshot);

  return applyCaps(currentThumbnailSources(opts.canvasSnapshot), opts.canvasSnapshot);
}

export async function buildTurnImageFileParts(
  sources: readonly TurnImageSource[],
): Promise<TurnImageFilePart[]> {
  const parts: TurnImageFilePart[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    if (parts.length >= MAX_IMAGES_PER_CALL) break;
    if (!source.image || seen.has(source.image)) continue;
    seen.add(source.image);
    const jpeg = await resolveCanvasImageToJpeg(source.image);
    if (!jpeg) continue;
    parts.push({ type: "file", mediaType: jpeg.mediaType, data: jpeg.data });
  }
  return parts;
}
