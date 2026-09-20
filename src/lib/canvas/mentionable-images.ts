import { imageDisplayUrl, toImageSourceRef } from "@/lib/canvas/image-refs";
import { visibleImageIdFromValue } from "@/lib/canvas/visible-image-id";

export type MentionableImage = {
  visibleId: string;
  image: string;
  imageNode: string;
  label: string;
  previewUrl?: string;
};

export type VisibleImageRef = {
  visibleId: string;
  image: string;
};

export type CatalogNode = {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
  summary?: Record<string, unknown>;
};

const MENTION_TOKEN = /(?:^|\s)@(?:#([a-z0-9]{2,12})|miniature:([\w-]+))/gi;

function nodeTitle(type: string | undefined, data: Record<string, unknown> | undefined, fallback: string): string {
  const label = typeof data?.label === "string" && data.label.trim() ? data.label.trim() : "";
  if (type === "sketch") {
    if (!label || /^(sketch(\s*ia)?|croquis)$/i.test(label)) return "Croquis";
    return `Croquis · ${label}`;
  }
  if (label) return label;
  if (type === "preview") return "Aperçu";
  if (type === "generator") return "Générateur";
  if (type === "textOverlay") return "Texte";
  return fallback;
}

function sketchImageValue(data: Record<string, unknown> | undefined): unknown {
  if (!data) return undefined;
  if (typeof data.image_source === "string" && data.image_source) return data.image_source;
  if (typeof data.imageUrl === "string" && data.imageUrl) return data.imageUrl;
  return undefined;
}

function sketchRefFromSummary(summary: Record<string, unknown> | undefined): string | null {
  const selected = typeof summary?.selectedImage === "string" ? summary.selectedImage : null;
  if (selected) return selected;
  const source = typeof summary?.source === "string" ? summary.source : "";
  if (source.startsWith("library:")) {
    const ref = source.slice("library:".length);
    return ref || null;
  }
  return null;
}

function pushImage(
  out: MentionableImage[],
  seen: Set<string>,
  value: unknown,
  imageNode: string,
  label: string,
): void {
  const image = toImageSourceRef(value);
  const visibleId = visibleImageIdFromValue(value);
  if (!image || !visibleId) return;
  if (seen.has(image) || seen.has(visibleId)) return;
  seen.add(image);
  seen.add(visibleId);
  const previewUrl =
    typeof value === "string" && (value.startsWith("/") || value.startsWith("data:"))
      ? value
      : imageDisplayUrl(image) ?? undefined;
  out.push({ visibleId, image, imageNode, label, ...(previewUrl ? { previewUrl } : {}) });
}

function listFromGenerated(data: Record<string, unknown> | undefined): string[] {
  if (!data) return [];
  return Array.isArray(data.generatedImages) ? data.generatedImages.filter((item): item is string => typeof item === "string" && Boolean(item)) : [];
}

function catalogFromPreviewOrOverlay(node: CatalogNode, seen: Set<string>, out: MentionableImage[]): void {
  const data = node.data ?? {};
  const images = listFromGenerated(data);
  const title = nodeTitle(node.type, data, "Miniature");
  images.forEach((url, index) => {
    const label = images.length > 1 ? `${title} · ${index + 1}/${images.length}` : title;
    pushImage(out, seen, url, node.id, label);
  });
}

const APERCU_TYPES = new Set(["preview", "textOverlay"]);

/**
 * Visible miniatures and live croquis for the composer `@` picker.
 * Generator `images[]` / A1 A2 history is not an aperçu. Logos, faces,
 * and swipe files stay out.
 */
export function catalogMentionableImages(
  nodes: readonly CatalogNode[],
  options?: { coverImageUrl?: string | null },
): MentionableImage[] {
  const out: MentionableImage[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    if (node.type === "preview") catalogFromPreviewOrOverlay(node, seen, out);
  }
  for (const node of nodes) {
    if (node.type === "textOverlay") catalogFromPreviewOrOverlay(node, seen, out);
  }

  const cover = options?.coverImageUrl;
  if (cover) {
    const image = toImageSourceRef(cover);
    const visibleId = visibleImageIdFromValue(cover);
    if (image && visibleId) {
      const existing = out.find((item) => item.image === image || item.visibleId === visibleId);
      if (existing) {
        if (!existing.label.includes("gagnante")) existing.label = `${existing.label} · gagnante`;
      } else {
        pushImage(out, seen, cover, "cover", "Miniature gagnante");
      }
    }
  }

  for (const node of nodes) {
    if (node.type !== "sketch") continue;
    const value = sketchImageValue(node.data);
    if (!value) continue;
    pushImage(out, seen, value, node.id, nodeTitle("sketch", node.data, "Croquis"));
  }

  return out;
}

function summaryImages(summary: Record<string, unknown> | undefined): VisibleImageRef[] {
  const raw = summary?.images;
  if (!Array.isArray(raw)) return [];
  const out: VisibleImageRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.visibleId === "string" && typeof row.image === "string") {
      out.push({ visibleId: row.visibleId, image: row.image });
    }
  }
  return out;
}

function pushSnapshotImages(
  out: MentionableImage[],
  seen: Set<string>,
  node: { id: string; type?: string; summary?: Record<string, unknown> },
): void {
  const title = nodeTitle(node.type, node.summary, node.type ?? "Miniature");
  const images = summaryImages(node.summary);
  if (images.length > 0) {
    images.forEach((row, index) => {
      if (seen.has(row.image) || seen.has(row.visibleId)) return;
      seen.add(row.image);
      seen.add(row.visibleId);
      const label = images.length > 1 ? `${title} · ${index + 1}/${images.length}` : title;
      out.push({ visibleId: row.visibleId, image: row.image, imageNode: node.id, label });
    });
    return;
  }
  const selected =
    (typeof node.summary?.selectedImage === "string" && node.summary.selectedImage) ||
    (node.type === "sketch" ? sketchRefFromSummary(node.summary) : null);
  const visibleId =
    (typeof node.summary?.selectedVisibleId === "string" && node.summary.selectedVisibleId) ||
    (selected ? visibleImageIdFromValue(selected) : null);
  if (selected && visibleId && !seen.has(selected) && !seen.has(visibleId)) {
    seen.add(selected);
    seen.add(visibleId);
    out.push({ visibleId, image: selected, imageNode: node.id, label: title });
  }
}

/** Resolve `@#id` against aperçu cards and live croquis in the compact snapshot. */
export function catalogMentionableImagesFromSnapshot(snapshot: unknown): MentionableImage[] {
  if (!snapshot || typeof snapshot !== "object") return [];
  const snap = snapshot as {
    nodes?: Array<{ id: string; type?: string; summary?: Record<string, unknown> }>;
  };
  const out: MentionableImage[] = [];
  const seen = new Set<string>();

  for (const node of snap.nodes ?? []) {
    if (!APERCU_TYPES.has(node.type ?? "")) continue;
    pushSnapshotImages(out, seen, node);
  }
  for (const node of snap.nodes ?? []) {
    if (node.type !== "sketch") continue;
    pushSnapshotImages(out, seen, node);
  }

  return out;
}

/** Compact `{ visibleId, image }` list for node summaries / canvas_state. */
export function describeVisibleImages(values: readonly unknown[]): VisibleImageRef[] {
  const out: VisibleImageRef[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const image = toImageSourceRef(value);
    const visibleId = visibleImageIdFromValue(value);
    if (!image || !visibleId || seen.has(image)) continue;
    seen.add(image);
    out.push({ visibleId, image });
  }
  return out;
}

export type MentionToken = { visibleId?: string; storedId?: string };

export function parseMentionTokens(text: string): MentionToken[] {
  const out: MentionToken[] = [];
  MENTION_TOKEN.lastIndex = 0;
  for (const match of text.matchAll(MENTION_TOKEN)) {
    if (match[1]) out.push({ visibleId: `#${match[1].toUpperCase()}` });
    else if (match[2]) out.push({ storedId: match[2] });
  }
  return out;
}

function asMentionable(item: Partial<MentionableImage> | null | undefined): MentionableImage | null {
  if (!item?.visibleId || !item.image) return null;
  return {
    visibleId: item.visibleId,
    image: item.image,
    imageNode: item.imageNode ?? "",
    label: item.label ?? item.visibleId,
    ...(item.previewUrl ? { previewUrl: item.previewUrl } : {}),
  };
}

/**
 * Mentions from the composer list plus `@#id` / `@miniature:<id>` in the user text.
 * Unresolved tokens are still forwarded so the model sees the id the user typed.
 */
export function resolveMentionedImages(
  text: string,
  catalog: readonly MentionableImage[],
  explicit?: ReadonlyArray<Partial<MentionableImage>> | null,
): MentionableImage[] {
  const out: MentionableImage[] = [];
  const seen = new Set<string>();
  const push = (item: MentionableImage) => {
    const key = item.image || item.visibleId;
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(item);
  };

  for (const raw of explicit ?? []) {
    const item = asMentionable(raw);
    if (item) push(item);
  }

  for (const token of parseMentionTokens(text)) {
    if (token.visibleId) {
      const matches = catalog.filter((row) => row.visibleId.toUpperCase() === token.visibleId!.toUpperCase());
      if (matches.length > 0) {
        for (const match of matches) push(match);
      } else {
        push({ visibleId: token.visibleId, image: "", imageNode: "", label: token.visibleId });
      }
    }
    if (token.storedId) {
      const stored = token.storedId;
      const match = catalog.find(
        (row) => row.image === `stored:gi_${stored}` || row.image.endsWith(stored) || row.image.endsWith(`_${stored}`),
      );
      if (match) push(match);
      else {
        const visibleId = visibleImageIdFromValue(stored) ?? `#${stored.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-6)}`;
        push({ visibleId, image: `stored:gi_${stored}`, imageNode: "", label: stored });
      }
    }
  }

  return out;
}

export function buildMentionedImagesBlock(items: readonly MentionableImage[]): string | null {
  if (items.length === 0) return null;
  const payload = items.map(({ visibleId, image, imageNode, label }) => ({ visibleId, image, imageNode, label }));
  return [
    "<mentioned_images>",
    "The user pointed at these thumbnails with @ in this message. They are the subject of the request. JPEG pixels are already attached on this user turn (same order). Match visibleId on <canvas_state> images / currentThumbnails. Use the stored image ref for wiring — do not invent a new stored id from pixels.",
    JSON.stringify(payload, null, 2),
    "</mentioned_images>",
  ].join("\n");
}
