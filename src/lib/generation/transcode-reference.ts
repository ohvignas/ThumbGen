/**
 * OpenAI /v1/images/edits (and OpenRouter when it routes there) accept PNG,
 * JPEG, or WebP only. Persona cutouts, logos, and sketches may be stored as
 * AVIF/HEIC/GIF. Convert those at the generate boundary so existing library
 * files keep working without a re-upload.
 */
import { parseDataUrl } from "@/lib/db";

const MAX_INPUT_PIXELS = 40_000_000;

export const PROVIDER_SAFE_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

export function unsupportedOpenAIImageFormatError(mime: string): string {
  return `Format d'image non supporté par OpenAI (${mime || "inconnu"}). PNG, JPEG ou WebP.`;
}

export function sniffImageFormat(
  buffer: Buffer,
): "png" | "jpeg" | "webp" | "avif" | "heif" | "gif" | "svg" | null {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "webp";
  }
  if (buffer.length >= 6) {
    const gif = buffer.toString("ascii", 0, 6);
    if (gif === "GIF87a" || gif === "GIF89a") return "gif";
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") {
    const brand = buffer.toString("ascii", 8, 12);
    if (brand === "avif" || brand === "avis") return "avif";
    if (brand === "heic" || brand === "heif" || brand === "mif1" || brand === "msf1") return "heif";
  }
  const head = buffer.subarray(0, 256).toString("utf8").trimStart();
  if (head.startsWith("<svg") || head.startsWith("<?xml")) return "svg";
  return null;
}

function isSafeSniff(format: ReturnType<typeof sniffImageFormat>): boolean {
  return format === "png" || format === "jpeg" || format === "webp" || format === null;
}

async function encodeAsPngDataUrl(buffer: Buffer): Promise<string> {
  const { default: sharp } = await import("sharp");
  const png = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).rotate().png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

export async function transcodeReferenceImage(dataUrl: string): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith("data:")) return dataUrl;
  let parsed: { buffer: Buffer; mimeType: string };
  try {
    parsed = parseDataUrl(dataUrl);
  } catch {
    return dataUrl;
  }
  const mime = parsed.mimeType.split(";")[0].trim().toLowerCase();
  if (PROVIDER_SAFE_IMAGE_MIMES.has(mime) && isSafeSniff(sniffImageFormat(parsed.buffer))) return dataUrl;
  try {
    return await encodeAsPngDataUrl(parsed.buffer);
  } catch {
    throw new Error(unsupportedOpenAIImageFormatError(mime));
  }
}

export async function transcodeReferenceImages(urls: readonly string[]): Promise<string[]> {
  const out: string[] = [];
  for (const url of urls) out.push(await transcodeReferenceImage(url));
  return out;
}
