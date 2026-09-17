import { getDb } from "@/lib/db";
import { MODEL_ID_MAP } from "@/lib/agent/blueprint/models";
import { resolveImageSource } from "./image-source";

/**
 * Blueprint node data → canvas node data, shared by apply_workflow and
 * place_node. Images are resolved locally (DB), never over HTTP.
 */

export type CanvasData = Record<string, unknown>;

export type CanvasDataOptions = {
  /**
   * A swipeFile whose image lives in the library (stored:sf_ / stored:lg_)
   * carries its library `imageUrl` instead of inline base64 (place_node: small
   * patches and saves). Any other source is still inlined.
   */
  libraryUrls?: boolean;
};

export async function resolveToDataUrl(imageSource: string): Promise<string> {
  const resolved = await resolveImageSource(imageSource);
  return `data:${resolved.mimeType};base64,${resolved.bytes.toString("base64")}`;
}

/** The library route serving a stored swipe file or logo, or null for any other source. */
export function libraryImageUrlForSource(source: string): string | null {
  const match = source.match(/^stored:(sf|lg)_([\w-]+)$/);
  if (!match) return null;
  const id = encodeURIComponent(match[2]);
  return match[1] === "sf" ? `/api/swipe-files/image?f=${id}` : `/api/logos/image?f=${id}`;
}

/** `{ imageUrl }` or `{ imageBase64 }` for a swipeFile/sketch source. */
async function imageFields(type: string, imageSource: string, options: CanvasDataOptions): Promise<CanvasData> {
  const url = options.libraryUrls && type === "swipeFile" ? libraryImageUrlForSource(imageSource) : null;
  return url ? { imageUrl: url } : { imageBase64: await resolveToDataUrl(imageSource) };
}

export async function blueprintToCanvasData(
  type: string,
  data: Record<string, unknown>,
  options: CanvasDataOptions = {},
): Promise<CanvasData> {
  const imageSource = typeof data.image_source === "string" ? data.image_source : undefined;

  // A Personnage ref resolves to up to 3 angle images (front/left/right),
  // not one — handled separately from the generic single-image resolver
  // below, which only ever returns one image.
  const personaMatch = type === "faceReference" ? imageSource?.match(/^stored:persona_(.+)$/) : null;
  if (personaMatch) {
    const personaId = personaMatch[1];
    const photos = getDb()
      .prepare("SELECT angle, mime_type, data FROM persona_photos WHERE persona_id = ?")
      .all(personaId) as { angle: "front" | "left" | "right"; mime_type: string; data: Buffer }[];
    const personaAngles: Record<string, string> = {};
    for (const p of photos) {
      personaAngles[p.angle] = `data:${p.mime_type};base64,${p.data.toString("base64")}`;
    }
    const personaRow = getDb().prepare("SELECT label FROM personas WHERE id = ?").get(personaId) as
      | { label: string }
      | undefined;
    return {
      personaId,
      personaAngles,
      label: (data.label as string) || personaRow?.label || "Personnage",
    };
  }

  const image = imageSource ? await imageFields(type, imageSource, options) : {};

  switch (type) {
    case "sketch":
      return {
        ...image,
        label: data.label || "Sketch IA",
        // Keep the source ref in case a future tool needs to re-resolve.
        image_source: imageSource,
      };
    case "swipeFile":
      return {
        ...image,
        label: data.label || (data.kind === "logo" ? "Logo" : "Image"),
        kind: data.kind,
        image_source: imageSource,
      };
    case "prompt":
      return {
        prompt: data.prompt,
        negativePrompt: data.negativePrompt,
      };
    case "generator":
      return {
        model: MODEL_ID_MAP[data.model as string] ?? data.model,
        aspectRatio: data.aspectRatio,
        numImages: data.count ?? 1,
        // A/B/C test: count stays per variant.
        ...(data.abTest ? { abTest: data.abTest } : {}),
      };
    default:
      return data;
  }
}

/**
 * Update of a node already on the canvas: only the fields the blueprint
 * gives, mapped to the canvas shape. The caller merges it over the node's
 * data with {@link mergeCanvasData}, so everything else (generated images,
 * imported image, persona angles, generator settings…) is kept.
 */
export async function blueprintUpdateToCanvasData(
  type: string,
  data: Record<string, unknown>,
  options: CanvasDataOptions = {},
): Promise<{ patch: CanvasData; replacesImage: boolean }> {
  const patch: CanvasData = {};
  const imageSource = typeof data.image_source === "string" ? data.image_source : undefined;
  const has = (key: string) => data[key] !== undefined;
  switch (type) {
    case "faceReference":
      if (imageSource) {
        Object.assign(patch, await blueprintToCanvasData(type, data, options));
        // Another Personnage keeps the name the user gave the node, unless a label is given.
        if (!has("label")) delete patch.label;
      } else if (has("label")) patch.label = data.label;
      break;
    case "sketch":
    case "swipeFile":
      if (imageSource) {
        Object.assign(patch, await imageFields(type, imageSource, options));
        patch.image_source = imageSource;
      }
      if (has("label")) patch.label = data.label;
      if (type === "swipeFile" && has("kind")) patch.kind = data.kind;
      break;
    case "prompt":
      if (has("prompt")) patch.prompt = data.prompt;
      if (has("negativePrompt")) patch.negativePrompt = data.negativePrompt;
      break;
    case "generator":
      if (has("model")) patch.model = MODEL_ID_MAP[data.model as string] ?? data.model;
      if (has("aspectRatio")) patch.aspectRatio = data.aspectRatio;
      if (has("count")) patch.numImages = data.count;
      if (has("abTest")) patch.abTest = data.abTest;
      break;
  }
  return { patch, replacesImage: Boolean(imageSource) && type !== "faceReference" };
}

/**
 * `{ ...current, ...patch }`, dropping the image fields a new image makes
 * stale: the canvas shows imageUrl before imageBase64, and a sketch's
 * Excalidraw drawing no longer matches the new image.
 */
export function mergeCanvasData(current: CanvasData, patch: CanvasData, replacesImage: boolean): CanvasData {
  const data = { ...current, ...patch };
  if (replacesImage) {
    if (!("imageUrl" in patch)) delete data.imageUrl;
    if (!("imageBase64" in patch)) delete data.imageBase64;
    delete data.sketchElements;
    delete data.sketchFiles;
  }
  return data;
}
