/**
 * Turns a generator variant's resolved inputs into the fields
 * /api/generate/openrouter expects, and describes an input row's preview.
 * Image fetching is injected (`ImageLoader`) so this stays unit-testable.
 */
import type { NodeData } from "@/store/canvas-store";
import type { InputSlot, ResolvedVariantInputs } from "./generator-variants";

export type PayloadNode = { id: string; type?: string; data: NodeData };

/** Resolves an image reference (data URL or URL) to a data URL, or null when unreadable. */
export type ImageLoader = (src: string) => Promise<string | null>;

export type GenerationPayload = {
  prompt: string;
  negativePrompt: string;
  faceImages: string[];
  referenceImages: string[];
  logos: { image: string; label: string }[];
  sketchImages: string[];
};

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

async function loadAll(sources: readonly string[], loadImage: ImageLoader): Promise<string[]> {
  const loaded = await Promise.all(sources.map((src) => loadImage(src)));
  return loaded.filter((image): image is string => Boolean(image));
}

function imageSources(nodes: readonly PayloadNode[]): string[] {
  return nodes.map((n) => nodeImageSource(n.data)).filter((src): src is string => Boolean(src));
}

/** Request fields for one variant. Only Prompt nodes contribute text; unreadable images are skipped. */
export async function buildGenerationPayload(
  inputs: ResolvedVariantInputs<PayloadNode>,
  loadImage: ImageLoader,
): Promise<GenerationPayload> {
  const prompts = inputs.prompt.nodes.filter((n) => n.type === "prompt");
  const [faceGroups, referenceImages, sketchImages, logoEntries] = await Promise.all([
    Promise.all(inputs.face.map((n) => loadAll(faceImageSources(n.data), loadImage))),
    loadAll(imageSources(inputs.ref.nodes), loadImage),
    loadAll(imageSources(inputs.sketch.nodes), loadImage),
    Promise.all(
      inputs.logo.map(async (n) => {
        const src = nodeImageSource(n.data);
        const image = src ? await loadImage(src) : null;
        return image ? { image, label: n.data.label || n.data.prompt || "Logo" } : null;
      }),
    ),
  ]);

  return {
    prompt: prompts.map((n) => n.data.prompt).filter(Boolean).join("\n"),
    negativePrompt: prompts.map((n) => n.data.negativePrompt).filter(Boolean).join("\n"),
    faceImages: faceGroups.flat(),
    referenceImages,
    logos: logoEntries.filter((entry): entry is { image: string; label: string } => entry !== null),
    sketchImages,
  };
}
