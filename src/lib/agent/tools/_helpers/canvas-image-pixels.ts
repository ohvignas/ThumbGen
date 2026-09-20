import { getDb } from "@/lib/db";
import { resolveImageSource, type ResolvedImage } from "./image-source";
import { toImageSourceRef } from "@/lib/canvas/image-refs";

/** Images sent to the model per call, all nodes together. */
export const MAX_IMAGES_PER_CALL = 8;
/** A generator contributes its selected image first, then its most recent ones. */
export const MAX_IMAGES_PER_GENERATOR = 2;
/** Longest side of every image sent to the model. */
export const MAX_IMAGE_SIDE = 768;
const JPEG_QUALITY = 80;
/** Refuse to decode images larger than this (width × height), whatever their file size. */
export const MAX_INPUT_PIXELS = 40_000_000;

/** Reads an image value's bytes locally (inline data or the DB) — never over HTTP. */
export async function readCanvasImage(value: string): Promise<ResolvedImage | null> {
  const inline = value.match(/^data:([^;,]+);base64,(.+)$/);
  if (inline) return { mimeType: inline[1], bytes: Buffer.from(inline[2], "base64") };

  // A Personnage URL names its angle; resolveImageSource would pick the front one.
  if (value.startsWith("/api/personas/image")) {
    const params = new URL(value, "http://thumbgen.local").searchParams;
    const row = getDb()
      .prepare("SELECT mime_type, data FROM persona_photos WHERE persona_id = ? AND angle = ?")
      .get(params.get("id"), params.get("angle")) as { mime_type: string; data: Buffer } | undefined;
    return row ? { mimeType: row.mime_type, bytes: row.data } : null;
  }

  const ref = toImageSourceRef(value);
  if (!ref) return null;
  try {
    return await resolveImageSource(ref);
  } catch {
    return null;
  }
}

export async function downscaleCanvasImage(bytes: Buffer): Promise<string | null> {
  try {
    // Loaded on first use: the native module stays out of every tool-registry import.
    const { default: sharp } = await import("sharp");
    const out = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
    return out.toString("base64");
  } catch {
    return null;
  }
}

/** Resolve a canvas/stored ref to a 768px JPEG (local bytes only). */
export async function resolveCanvasImageToJpeg(
  value: string,
): Promise<{ mediaType: "image/jpeg"; data: string } | null> {
  try {
    const image = await readCanvasImage(value);
    if (!image) return null;
    const data = await downscaleCanvasImage(image.bytes);
    return data ? { mediaType: "image/jpeg", data } : null;
  } catch {
    return null;
  }
}
