/**
 * Stable, view-state-free canvas comparison. Used so a no-op save/load does
 * not bump `updatedAt` or mark the store dirty (ids + positions + data only).
 * Position is durable (controlled React Flow): a drag must change this key
 * so the save POST sticks and a later poll cannot treat old x/y as equal.
 * Image fields are stored refs / same-origin URLs / filenames — never pixels.
 */

import { imageDisplayUrl, isInlineImageBytes, toImageSourceRef } from "@/lib/canvas/image-refs";
import { PERSONA_ANGLES, personaImageUrl, type PersonaAngle } from "@/lib/personas";

/** Stay under the Next.js ~10MB body cap (same idea as generate). */
export const PROJECT_SAVE_MAX_BYTES = 8 * 1024 * 1024;

export type PersistNode = {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  data?: Record<string, unknown>;
};

export type PersistEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
};

export type PersistCanvasInput = {
  nodes: readonly PersistNode[];
  edges: readonly PersistEdge[];
  deletedNodeIds?: readonly string[];
  deletedEdgeIds?: readonly string[];
};

export type PersistGraph = {
  nodes: unknown[];
  edges: unknown[];
};

export type PersistCanvas = PersistGraph & {
  deletedNodeIds: string[];
  deletedEdgeIds: string[];
};

function stableValue(value: unknown): unknown {
  if (value == null || typeof value !== "object") return value === undefined ? undefined : value;
  if (Array.isArray(value)) return value.map((item) => stableValue(item));
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const item = (value as Record<string, unknown>)[key];
    if (item === undefined) continue;
    out[key] = stableValue(item);
  }
  return out;
}

function compactPointer(value: unknown, asDisplayUrl: boolean): string | undefined {
  if (typeof value !== "string" || !value || isInlineImageBytes(value)) return undefined;
  if (asDisplayUrl) return imageDisplayUrl(value) ?? (value.startsWith("/") ? value : undefined);
  const ref = toImageSourceRef(value);
  if (ref) return ref;
  if (value.startsWith("/") || /^(stored:|generated:|uploaded:)/.test(value)) return value;
  return value.length < 240 ? value : undefined;
}

function compactImageList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const compact = compactPointer(item, true) ?? compactPointer(item, false);
    if (compact && !out.includes(compact)) out.push(compact);
  }
  return out;
}

function compactVariantMap(value: unknown): Record<string, string[]> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const out: Record<string, string[]> = {};
  for (const variant of ["A", "B", "C"]) {
    const list = compactImageList((value as Record<string, unknown>)[variant]);
    if (list.length > 0) out[variant] = list;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function compactPersonaAngles(value: unknown, personaId: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const id = typeof personaId === "string" && personaId ? personaId : null;
  const out: Record<string, string> = {};
  for (const angle of PERSONA_ANGLES) {
    const src = (value as Record<string, unknown>)[angle];
    if (!src) continue;
    if (id) {
      out[angle] = personaImageUrl(id, angle as PersonaAngle);
      continue;
    }
    const compact = compactPointer(src, true) ?? compactPointer(src, false);
    if (compact) out[angle] = compact;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function stripInlineDeep(value: unknown): unknown {
  if (typeof value === "string") return isInlineImageBytes(value) ? undefined : value;
  if (Array.isArray(value)) return value.map(stripInlineDeep).filter((item) => item !== undefined);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const next = stripInlineDeep(item);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }
  return value;
}

function persistData(data: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!data) return {};
  const imageSource = compactPointer(data.image_source, false) ?? compactPointer(data.imageUrl, false);
  const imageUrl = compactPointer(data.imageUrl, true) ?? (imageSource ? imageDisplayUrl(imageSource) ?? undefined : undefined);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (key === "isGenerating") continue;
    if (key === "genStatus" && value === "loading") continue;
    if (key === "imageBase64") continue;
    if (key === "sketchFiles") continue;
    if (key === "image_source") {
      if (imageSource) out.image_source = imageSource;
      continue;
    }
    if (key === "imageUrl") {
      if (imageUrl) out.imageUrl = imageUrl;
      continue;
    }
    if (key === "generatedImages") {
      const list = compactImageList(value);
      if (list.length > 0) out.generatedImages = list;
      continue;
    }
    if (key === "generatedImagesByVariant") {
      const variants = compactVariantMap(value);
      if (variants) out.generatedImagesByVariant = variants;
      continue;
    }
    if (key === "personaAngles") {
      const angles = compactPersonaAngles(value, data.personaId);
      if (angles) out.personaAngles = angles;
      continue;
    }
    const stripped = stripInlineDeep(value);
    if (stripped !== undefined) out[key] = stripped;
  }
  if (imageSource && out.image_source === undefined) out.image_source = imageSource;
  if (imageUrl && out.imageUrl === undefined) out.imageUrl = imageUrl;
  return stableValue(out) as Record<string, unknown>;
}

function persistCoord(value: number | undefined): number {
  return Math.round((value ?? 0) * 100) / 100;
}

export function persistNodeForSave(node: PersistNode): PersistNode {
  return {
    id: node.id,
    type: node.type ?? "",
    position: { x: persistCoord(node.position?.x), y: persistCoord(node.position?.y) },
    data: persistData(node.data),
  };
}

export function persistNodesForSave(nodes: readonly PersistNode[]): PersistNode[] {
  return nodes.map(persistNodeForSave);
}

function persistNode(node: PersistNode): unknown {
  return persistNodeForSave(node);
}

function persistEdge(edge: PersistEdge): unknown {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
    type: edge.type ?? "custom",
  };
}

function sortedIds(ids: readonly string[] | undefined): string[] {
  return [...new Set((ids ?? []).filter((id) => id.length > 0))].sort();
}

export function persistGraphSnapshot(input: Pick<PersistCanvasInput, "nodes" | "edges">): PersistGraph {
  return {
    nodes: [...input.nodes].map(persistNode).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    edges: [...input.edges].map(persistEdge).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  };
}

export function persistCanvasSnapshot(input: PersistCanvasInput): PersistCanvas {
  return {
    ...persistGraphSnapshot(input),
    deletedNodeIds: sortedIds(input.deletedNodeIds),
    deletedEdgeIds: sortedIds(input.deletedEdgeIds),
  };
}

export function persistGraphKey(input: Pick<PersistCanvasInput, "nodes" | "edges">): string {
  return JSON.stringify(persistGraphSnapshot(input));
}

export function persistCanvasKey(input: PersistCanvasInput): string {
  return JSON.stringify(persistCanvasSnapshot(input));
}

export function persistGraphEqual(
  a: Pick<PersistCanvasInput, "nodes" | "edges">,
  b: Pick<PersistCanvasInput, "nodes" | "edges">,
): boolean {
  return persistGraphKey(a) === persistGraphKey(b);
}

export function persistCanvasEqual(a: PersistCanvasInput, b: PersistCanvasInput): boolean {
  return persistCanvasKey(a) === persistCanvasKey(b);
}
