import { isPromptInputHandle, parseGeneratorHandle } from "@/lib/canvas/generator-variants";
import { visibleImageIdFromValue } from "@/lib/canvas/visible-image-id";

/** Injected on <canvas_state> / get_canvas_state when a generated aperçu exists. */
export const CURRENT_THUMBNAIL_ROLE =
  "This is the current thumbnail; improvements apply to THIS image (same angle). Keep the original prompt + this generation + the requested change. Write a short delta — do not rewrite a new scene.";

export type CanvasViewNode = {
  id: string;
  type?: string;
  selected?: boolean;
  summary: Record<string, unknown>;
};

export type CanvasViewEdge = {
  source: string;
  target: string;
  targetHandle?: string | null;
};

export type CurrentThumbnail = {
  role: string;
  image: string;
  imageNode: string;
  visibleId?: string;
  parentPromptNode?: string;
  parentPrompt?: string;
  selected?: true;
};

function storedGi(value: unknown): string | undefined {
  return typeof value === "string" && value.startsWith("stored:gi_") ? value : undefined;
}

function swipeStoredGi(summary: Record<string, unknown>): string | undefined {
  const source = summary.source;
  if (typeof source !== "string") return undefined;
  const match = source.match(/library:(stored:gi_[\w-]+)/);
  return match?.[1];
}

function parentPrompt(
  generatorId: string,
  nodes: ReadonlyMap<string, CanvasViewNode>,
  edges: readonly CanvasViewEdge[],
): { parentPromptNode: string; parentPrompt: string } | undefined {
  const wired = edges
    .filter((edge) => edge.target === generatorId && isPromptInputHandle(edge.targetHandle))
    .map((edge) => {
      const node = nodes.get(edge.source);
      const prompt = typeof node?.summary.prompt === "string" ? node.summary.prompt : "";
      return { node: edge.source, prompt, handle: edge.targetHandle ?? "" };
    })
    .filter((row) => row.prompt);
  const preferred = wired.find((row) => row.handle === "prompt-in") ?? wired[0];
  if (!preferred) return undefined;
  return { parentPromptNode: preferred.node, parentPrompt: preferred.prompt };
}

function generatorFeedingPreview(
  previewId: string,
  nodes: ReadonlyMap<string, CanvasViewNode>,
  edges: readonly CanvasViewEdge[],
): string | undefined {
  for (const edge of edges) {
    if (edge.target !== previewId) continue;
    if (nodes.get(edge.source)?.type === "generator") return edge.source;
  }
  return undefined;
}

function generatorFedByRef(
  refNodeId: string,
  edges: readonly CanvasViewEdge[],
): string | undefined {
  for (const edge of edges) {
    if (edge.source !== refNodeId) continue;
    const parsed = parseGeneratorHandle(edge.targetHandle);
    if (parsed?.kind === "input" && parsed.slot === "ref") return edge.target;
  }
  return undefined;
}

/**
 * Generated aperçus (preview / generator selected frame / stored:gi_ on ref-in)
 * plus the prompt that produced them — so the agent treats improvements as
 * edits of THIS image, not a new first-gen scene.
 */
export function describeCurrentThumbnails(
  nodes: readonly CanvasViewNode[],
  edges: readonly CanvasViewEdge[],
): CurrentThumbnail[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const seenImages = new Set<string>();
  const out: CurrentThumbnail[] = [];

  const push = (image: string, imageNode: string, generatorId?: string, selected?: boolean) => {
    if (seenImages.has(image)) return;
    seenImages.add(image);
    const parent = generatorId ? parentPrompt(generatorId, byId, edges) : undefined;
    const visibleId = visibleImageIdFromValue(image);
    out.push({
      role: CURRENT_THUMBNAIL_ROLE,
      image,
      imageNode,
      ...(visibleId ? { visibleId } : {}),
      ...parent,
      ...(selected ? { selected: true } : {}),
    });
  };

  const ranked = [...nodes].sort((a, b) => Number(Boolean(b.selected)) - Number(Boolean(a.selected)));

  for (const node of ranked) {
    if (node.type !== "preview") continue;
    const image = storedGi(node.summary.selectedImage);
    if (!image) continue;
    push(image, node.id, generatorFeedingPreview(node.id, byId, edges), node.selected);
  }

  for (const node of ranked) {
    if (node.type !== "generator") continue;
    const image = storedGi(node.summary.selectedImage);
    if (!image) continue;
    push(image, node.id, node.id, node.selected);
  }

  for (const node of ranked) {
    if (node.type !== "swipeFile") continue;
    const image = swipeStoredGi(node.summary);
    if (!image) continue;
    const generatorId = generatorFedByRef(node.id, edges);
    if (!generatorId) continue;
    push(image, node.id, generatorId, node.selected);
  }

  return out;
}
