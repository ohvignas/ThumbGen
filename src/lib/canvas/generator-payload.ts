/**
 * Turns a generator variant's resolved inputs into the fields
 * /api/generate/openrouter expects, and describes an input row's preview.
 * Image fetching is injected (`ImageLoader`) so this stays unit-testable.
 */
import type { NodeData } from "@/store/canvas-store";
import { compactGenerationImageRef, isServerResolvableGenerationRef, toImageSourceRef } from "@/lib/canvas/image-refs";
import { PERSONA_ANGLES, personaImageUrl } from "@/lib/personas";
import type { InputSlot, ResolvedVariantInputs } from "./generator-variants";

export type PayloadNode = { id: string; type?: string; data: NodeData };

/** Resolves an image reference (data URL or URL) to a data URL, or null when unreadable. */
export type ImageLoader = (src: string) => Promise<string | null>;

export type GenerationPayload = {
  prompt: string;
  negativePrompt: string;
  /** Already-generated thumbnail to edit — sent first (OpenAI edits / input_references). */
  editImages: string[];
  faceImages: string[];
  referenceImages: string[];
  logos: { image: string; label: string }[];
  sketchImages: string[];
};

/** Stay under Next.js 16's ~10MB body limit (three parallel jobs used to each POST ~10MB of data URLs). */
export const GENERATION_PAYLOAD_MAX_CHARS = 7 * 1024 * 1024;

export function generationPayloadFits(payload: GenerationPayload): boolean {
  return JSON.stringify(payload).length <= GENERATION_PAYLOAD_MAX_CHARS;
}

/** Prefer a stored/API pointer the server already has over inlined pixels. */
export function payloadImageSource(data: NodeData): string | null {
  const generated = data.generatedImages?.[data.selectedImageIndex ?? 0];
  if (typeof generated === "string" && generated) return compactGenerationImageRef(generated);
  if (typeof data.image_source === "string" && data.image_source && !data.image_source.startsWith("data:")) {
    return compactGenerationImageRef(data.image_source);
  }
  if (typeof data.imageUrl === "string" && data.imageUrl && !data.imageUrl.startsWith("data:")) {
    return compactGenerationImageRef(data.imageUrl);
  }
  if (data.imageBase64) return data.imageBase64;
  return data.imageUrl ?? data.image_source ?? null;
}

/** Identity angles: reuse the Personnage URLs when we have an id, never three full-res data URLs. */
export function payloadFaceImageSources(data: NodeData): string[] {
  const angles = data.personaAngles;
  if (angles && (angles.front || angles.left || angles.right)) {
    return PERSONA_ANGLES.map((angle) => {
      if (!angles[angle]) return null;
      if (data.personaId) return personaImageUrl(data.personaId, angle);
      return compactGenerationImageRef(angles[angle]!);
    }).filter((src): src is string => Boolean(src));
  }
  const single = payloadImageSource(data);
  return single ? [single] : [];
}

/** Embedded image, else the selected generated image (Aperçu, Texte overlay), else the URL. */
export function nodeImageSource(data: NodeData): string | null {
  if (data.imageBase64) return data.imageBase64;
  const generated = data.generatedImages?.[data.selectedImageIndex ?? 0];
  if (generated) return generated;
  return data.imageUrl ?? null;
}

/** A Personnage expands into its angles (front, left, right); otherwise its single image. */
export function faceImageSources(data: NodeData): string[] {
  const angles = data.personaAngles;
  if (angles && (angles.front || angles.left || angles.right)) {
    return [angles.front, angles.left, angles.right].filter((src): src is string => Boolean(src));
  }
  const single = nodeImageSource(data);
  return single ? [single] : [];
}

export type InputPreview =
  | { kind: "none" }
  | { kind: "text"; text: string; more: number }
  | { kind: "image"; src: string; more: number };

const PREVIEW_TEXT_MAX = 48;

function firstLine(text: string): string {
  const line = text.trim().split("\n")[0].trim();
  return line.length > PREVIEW_TEXT_MAX ? `${line.slice(0, PREVIEW_TEXT_MAX - 1).trimEnd()}…` : line;
}

/** What an input row shows: a thumbnail, a one-line excerpt, or nothing when unconnected. */
export function inputPreview(slot: InputSlot, nodes: readonly PayloadNode[]): InputPreview {
  const first = nodes[0];
  if (!first) return { kind: "none" };
  const more = nodes.length - 1;
  if (slot === "prompt") {
    const text = first.data.prompt?.trim();
    return { kind: "text", text: text ? firstLine(text) : "Prompt vide", more };
  }
  const src = slot === "face" ? faceImageSources(first.data)[0] : nodeImageSource(first.data);
  if (src) return { kind: "image", src, more };
  return { kind: "text", text: first.data.label || "Sans image", more };
}

async function toPayloadImage(src: string, loadImage: ImageLoader): Promise<string | null> {
  const compact = compactGenerationImageRef(src);
  if (isServerResolvableGenerationRef(compact) && !compact.startsWith("data:")) return compact;
  return loadImage(src);
}

async function loadAll(sources: readonly string[], loadImage: ImageLoader): Promise<string[]> {
  const loaded = await Promise.all(sources.map((src) => toPayloadImage(src, loadImage)));
  return loaded.filter((image): image is string => Boolean(image));
}

function imageSources(nodes: readonly PayloadNode[]): string[] {
  return nodes.map((n) => payloadImageSource(n.data)).filter((src): src is string => Boolean(src));
}

/**
 * A ref is the thumbnail to *edit* (not a competitor/layout swipe) when it is a
 * preview, a generator, or a past paid gen (`stored:gi_` / generated-images URL).
 */
export function isEditSourceNode(node: PayloadNode): boolean {
  if (node.type === "preview" || node.type === "generator") return true;
  const data = node.data;
  if ((data.generatedImages?.length ?? 0) > 0) return true;
  return [data.image_source, data.imageUrl].some((value) => toImageSourceRef(value)?.startsWith("stored:gi_"));
}

/** Request fields for one variant. Only Prompt nodes contribute text; unreadable images are skipped.
 *  First gen: no editImages; prompt is the full 7-sentence anatomy (A/B = two complete prompts).
 *  Iterate: `/api/generate/openrouter` sends `editImages` first (the current generated thumb),
 *  then `faceImages` as IDENTITY / AVATAR, then logos, layout-only `referenceImages`, then one sketch. */
export async function buildGenerationPayload(
  inputs: ResolvedVariantInputs<PayloadNode>,
  loadImage: ImageLoader,
): Promise<GenerationPayload> {
  const prompts = inputs.prompt.nodes.filter((n) => n.type === "prompt");
  const editNodes = inputs.ref.nodes.filter(isEditSourceNode);
  const layoutNodes = inputs.ref.nodes.filter((n) => !isEditSourceNode(n));
  const [faceGroups, editImages, referenceImages, sketchImages, logoEntries] = await Promise.all([
    Promise.all(inputs.face.map((n) => loadAll(payloadFaceImageSources(n.data), loadImage))),
    loadAll(imageSources(editNodes), loadImage),
    loadAll(imageSources(layoutNodes), loadImage),
    loadAll(imageSources(inputs.sketch.nodes), loadImage),
    Promise.all(
      inputs.logo.map(async (n) => {
        const src = payloadImageSource(n.data);
        const image = src ? await toPayloadImage(src, loadImage) : null;
        return image ? { image, label: n.data.label || n.data.prompt || "Logo" } : null;
      }),
    ),
  ]);

  return {
    prompt: prompts.map((n) => n.data.prompt).filter(Boolean).join("\n"),
    negativePrompt: prompts.map((n) => n.data.negativePrompt).filter(Boolean).join("\n"),
    editImages,
    faceImages: faceGroups.flat(),
    referenceImages,
    logos: logoEntries.filter((entry): entry is { image: string; label: string } => entry !== null),
    sketchImages,
  };
}
