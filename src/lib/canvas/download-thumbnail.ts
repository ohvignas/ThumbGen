/** Client-side LQ / 4K download of an already-stored thumbnail. Never calls an image model. */

export const LQ_MAX_BYTES = 5_000_000;
/** PNG at 4K is preferred until it gets unreasonably large (photo PNGs often 8–15 Mo). */
export const HQ_PNG_MAX_BYTES = 15_000_000;

export const HQ_WIDTH = 3840;
export const HQ_HEIGHT = 2160;
/** Product 4K square (same as OpenAI native FLEX_SIZE 4K 1×1). */
export const HQ_SQUARE = 2880;
export const HQ_LONG_EDGE = 3840;

export const LQ_DOWNLOAD_LABEL = "Télécharger (léger, < 5 Mo)";
export const HQ_DOWNLOAD_LABEL = "Télécharger (4K)";

export const DOWNLOAD_EMPTY_FR = "Aucune miniature à télécharger";
export const DOWNLOAD_ERROR_FR = "Impossible de télécharger la miniature";

export const LQ_FILENAME_JPEG = "miniature-leger.jpg";
export const LQ_FILENAME_WEBP = "miniature-leger.webp";
export const HQ_FILENAME_PNG = "miniature-4k.png";
export const HQ_FILENAME_JPEG = "miniature-4k.jpg";

export const LQ_JPEG_QUALITIES = [0.88, 0.8, 0.72, 0.64, 0.55, 0.45] as const;
export const LQ_WEBP_QUALITIES = [0.86, 0.74, 0.62, 0.5] as const;
export const HQ_JPEG_QUALITY = 0.95;

export const LQ_MAX_FRAMES = [
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
  { width: 960, height: 540 },
] as const;

export type ThumbnailDownloadQuality = "lq" | "hq";

export type EncodedThumbnail = {
  bytes: Uint8Array;
  mime: "image/jpeg" | "image/webp" | "image/png";
  filename: string;
  width: number;
  height: number;
};

export type FrameEncodeOpts = {
  width: number;
  height: number;
  mime: EncodedThumbnail["mime"];
  quality?: number;
};

export type FrameEncoder = (opts: FrameEncodeOpts) => Promise<Uint8Array>;

const RATIO_EPS = 0.02;

function aspectNear(srcW: number, srcH: number, destW: number, destH: number): boolean {
  if (srcW <= 0 || srcH <= 0 || destW <= 0 || destH <= 0) return false;
  return Math.abs(srcW / srcH - destW / destH) <= RATIO_EPS;
}

/** 4K frame that keeps the source aspect (9:16 → 2160×3840, 16:9 → 3840×2160). */
export function hqFrameSize(srcW: number, srcH: number): { width: number; height: number } {
  if (srcW <= 0 || srcH <= 0) return { width: HQ_WIDTH, height: HQ_HEIGHT };
  if (aspectNear(srcW, srcH, 16, 9)) return { width: HQ_WIDTH, height: HQ_HEIGHT };
  if (aspectNear(srcW, srcH, 9, 16)) return { width: HQ_HEIGHT, height: HQ_WIDTH };
  if (aspectNear(srcW, srcH, 1, 1)) return { width: HQ_SQUARE, height: HQ_SQUARE };
  if (srcW >= srcH) {
    return { width: HQ_LONG_EDGE, height: Math.max(1, Math.round((HQ_LONG_EDGE * srcH) / srcW)) };
  }
  return { width: Math.max(1, Math.round((HQ_LONG_EDGE * srcW) / srcH)), height: HQ_LONG_EDGE };
}

function lqMaxFrames(srcW: number, srcH: number): ReadonlyArray<{ width: number; height: number }> {
  if (srcW <= 0 || srcH <= 0) return LQ_MAX_FRAMES;
  if (aspectNear(srcW, srcH, 1, 1)) {
    return LQ_MAX_FRAMES.map((frame) => {
      const edge = Math.min(frame.width, frame.height);
      return { width: edge, height: edge };
    });
  }
  if (srcH > srcW) {
    return LQ_MAX_FRAMES.map((frame) => ({ width: frame.height, height: frame.width }));
  }
  return LQ_MAX_FRAMES;
}

/** Source rectangle that covers `destW`×`destH` without stretching. */
export function coverCrop(
  srcW: number,
  srcH: number,
  destW: number,
  destH: number,
): { sx: number; sy: number; sw: number; sh: number } {
  if (srcW <= 0 || srcH <= 0 || destW <= 0 || destH <= 0) {
    return { sx: 0, sy: 0, sw: Math.max(0, srcW), sh: Math.max(0, srcH) };
  }
  const srcAspect = srcW / srcH;
  const destAspect = destW / destH;
  if (srcAspect > destAspect) {
    const sw = srcH * destAspect;
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH };
  }
  if (srcAspect < destAspect) {
    const sh = srcW / destAspect;
    return { sx: 0, sy: (srcH - sh) / 2, sw: srcW, sh };
  }
  return { sx: 0, sy: 0, sw: srcW, sh: srcH };
}

export function fitInside(
  srcW: number,
  srcH: number,
  maxW: number,
  maxH: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxW / srcW, maxH / srcH);
  return {
    width: Math.max(1, Math.round(srcW * scale)),
    height: Math.max(1, Math.round(srcH * scale)),
  };
}

/** LQ frames: never upscale. Same aspect as the source; landscape 1920×1080 / portrait 1080×1920 first. */
export function lqFrameSizes(srcW: number, srcH: number): Array<{ width: number; height: number }> {
  const seen = new Set<string>();
  const out: Array<{ width: number; height: number }> = [];
  for (const frame of lqMaxFrames(srcW, srcH)) {
    const size = fitInside(srcW, srcH, frame.width, frame.height);
    const key = `${size.width}x${size.height}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(size);
  }
  return out;
}

function asEncoded(
  bytes: Uint8Array,
  mime: EncodedThumbnail["mime"],
  filename: string,
  width: number,
  height: number,
): EncodedThumbnail {
  return { bytes, mime, filename, width, height };
}

export async function encodeLightThumbnail(
  srcW: number,
  srcH: number,
  encode: FrameEncoder,
): Promise<EncodedThumbnail> {
  const sizes = lqFrameSizes(srcW, srcH);
  let last: EncodedThumbnail | null = null;

  for (const size of sizes) {
    for (const quality of LQ_JPEG_QUALITIES) {
      const bytes = await encode({ ...size, mime: "image/jpeg", quality });
      last = asEncoded(bytes, "image/jpeg", LQ_FILENAME_JPEG, size.width, size.height);
      if (bytes.byteLength < LQ_MAX_BYTES) return last;
    }
    for (const quality of LQ_WEBP_QUALITIES) {
      const bytes = await encode({ ...size, mime: "image/webp", quality });
      last = asEncoded(bytes, "image/webp", LQ_FILENAME_WEBP, size.width, size.height);
      if (bytes.byteLength < LQ_MAX_BYTES) return last;
    }
  }

  if (!last) throw new Error("Encodage impossible");
  return last;
}

export async function encode4kThumbnail(
  srcW: number,
  srcH: number,
  encode: FrameEncoder,
): Promise<EncodedThumbnail> {
  const { width, height } = hqFrameSize(srcW, srcH);
  const png = await encode({ width, height, mime: "image/png" });
  if (png.byteLength <= HQ_PNG_MAX_BYTES) {
    return asEncoded(png, "image/png", HQ_FILENAME_PNG, width, height);
  }
  const jpg = await encode({ width, height, mime: "image/jpeg", quality: HQ_JPEG_QUALITY });
  return asEncoded(jpg, "image/jpeg", HQ_FILENAME_JPEG, width, height);
}

function rasterize(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  destW: number,
  destH: number,
  mime: string,
  quality?: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = destW;
  canvas.height = destH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas indisponible"));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const crop = coverCrop(srcW, srcH, destW, destH);
  ctx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, destW, destH);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Encodage impossible"))),
      mime,
      quality,
    );
  });
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image illisible"));
    image.src = url;
  });
}

async function sourceFromBlob(blob: Blob): Promise<{
  width: number;
  height: number;
  source: CanvasImageSource;
  close: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() };
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadHtmlImage(url);
    return {
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      source: image,
      close: () => undefined,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function triggerBlobDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function prepareThumbnailDownload(
  src: string,
  quality: ThumbnailDownloadQuality,
): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const sourceBlob = await res.blob();
  const frame = await sourceFromBlob(sourceBlob);
  try {
    const encode: FrameEncoder = async ({ width, height, mime, quality: q }) => {
      const out = await rasterize(frame.source, frame.width, frame.height, width, height, mime, q);
      return new Uint8Array(await out.arrayBuffer());
    };
    const encoded =
      quality === "hq"
        ? await encode4kThumbnail(frame.width, frame.height, encode)
        : await encodeLightThumbnail(frame.width, frame.height, encode);
    const copy = new ArrayBuffer(encoded.bytes.byteLength);
    new Uint8Array(copy).set(encoded.bytes);
    return {
      blob: new Blob([copy], { type: encoded.mime }),
      filename: encoded.filename,
    };
  } finally {
    frame.close();
  }
}

export async function downloadThumbnail(
  src: string | null | undefined,
  quality: ThumbnailDownloadQuality,
): Promise<"ok" | "empty" | "error"> {
  if (!src) return "empty";
  try {
    const prepared = await prepareThumbnailDownload(src, quality);
    if (prepared.blob.size === 0) return "error";
    triggerBlobDownload(prepared.filename, prepared.blob);
    return "ok";
  } catch {
    return "error";
  }
}
