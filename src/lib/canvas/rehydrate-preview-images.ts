import { generatedImageIdFromUrl, generatedImageUrl, generatorImages, toImageSourceRef } from "@/lib/canvas/image-refs";

export type GenerationImageRow = {
  prompt: string | null;
  imageIds: string[];
  createdAt: string;
};

const SAFE_ID = /^[\w-]+$/;

/** JSON array (`["uuid"]`) or comma list from older `generations_log` rows. */
export function parseGeneratedImageIds(raw: string | null | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  const trimmed = raw.trim();
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.flatMap((item) => (typeof item === "string" ? parseGeneratedImageIds(item) : []));
    }
    if (typeof parsed === "string") return parseGeneratedImageIds(parsed);
  } catch {
    // comma-separated fallback below
  }
  const out: string[] = [];
  for (const part of trimmed.split(",")) {
    const token = part.trim().replace(/^stored:gi_/, "").replace(/^["']|["']$/g, "");
    if (SAFE_ID.test(token) && !out.includes(token)) out.push(token);
  }
  return out;
}

function usedGeneratedIds(nodes: readonly { data?: Record<string, unknown> }[]): Set<string> {
  const used = new Set<string>();
  const add = (value: unknown) => {
    const id = generatedImageIdFromUrl(value) ?? (typeof value === "string" && SAFE_ID.test(value) ? value : null);
    if (id) used.add(id);
  };
  for (const node of nodes) {
    const data = node.data ?? {};
    for (const image of generatorImages(data)) add(image);
    add(data.imageUrl);
    add(data.image_source);
    const ref = typeof data.image_source === "string" ? toImageSourceRef(data.image_source) : null;
    if (ref?.startsWith("stored:gi_")) used.add(ref.slice("stored:gi_".length));
  }
  return used;
}

function promptKey(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Fill empty preview nodes from generation logs when unused ids for that
 * exact prompt match the empty-preview count (no guessing).
 */
export type RehydratePreviewOptions = {
  /** User-deleted preview ids — never assign leftover generation images to them. */
  deletedNodeIds?: readonly string[];
};

export function rehydratePreviewImages<N extends { id: string; type?: string; data?: Record<string, unknown> }>(
  nodes: N[],
  rows: readonly GenerationImageRow[],
  options?: RehydratePreviewOptions,
): { nodes: N[]; restored: number } {
  const deleted = new Set((options?.deletedNodeIds ?? []).filter((id) => id.length > 0));
  const used = usedGeneratedIds(nodes);
  const unusedByPrompt = new Map<string, string[]>();
  for (const row of [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const prompt = promptKey(row.prompt);
    if (!prompt) continue;
    const list = unusedByPrompt.get(prompt) ?? [];
    for (const id of row.imageIds) {
      if (!SAFE_ID.test(id) || used.has(id) || list.includes(id)) continue;
      list.push(id);
    }
    if (list.length > 0) unusedByPrompt.set(prompt, list);
  }

  const emptyByPrompt = new Map<string, N[]>();
  for (const node of nodes) {
    if (deleted.has(node.id)) continue;
    if (node.type !== "preview") continue;
    const images = Array.isArray(node.data?.generatedImages) ? node.data.generatedImages : [];
    if (images.some((item) => typeof item === "string" && item)) continue;
    const prompt = promptKey(node.data?.genPromptUsed);
    if (!prompt) continue;
    const list = emptyByPrompt.get(prompt) ?? [];
    list.push(node);
    emptyByPrompt.set(prompt, list);
  }

  const assign = new Map<string, string>();
  for (const [prompt, empty] of emptyByPrompt) {
    const unused = unusedByPrompt.get(prompt) ?? [];
    if (unused.length === 0 || unused.length !== empty.length) continue;
    const ordered = [...empty].sort((a, b) => a.id.localeCompare(b.id));
    ordered.forEach((node, index) => assign.set(node.id, unused[index]!));
  }

  if (assign.size === 0) return { nodes, restored: 0 };

  const next = nodes.map((node) => {
    const id = assign.get(node.id);
    if (!id) return node;
    return {
      ...node,
      data: {
        ...(node.data ?? {}),
        generatedImages: [generatedImageUrl(id)],
        selectedImageIndex: 0,
        genStatus: node.data?.genStatus === "error" ? "error" : "done",
      },
    };
  });
  return { nodes: next, restored: assign.size };
}
