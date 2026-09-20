"use client";

let removeBgModule: typeof import("@imgly/background-removal") | null = null;
let loading = false;

export const REMOVE_BG_LABEL = "Retirer le fond";
export const REMOVING_BG_LABEL = "Suppression du fond…";

/** JPEG / remote photos still have a studio or room behind the person. PNG cutouts do not. */
export function photoNeedsBackgroundRemoval(src: string): boolean {
  return !src.startsWith("data:image/png");
}

export async function srcToDataUrl(src: string): Promise<string> {
  if (src.startsWith("data:")) return src;
  const res = await fetch(src, { cache: "no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Lecture impossible"));
    reader.readAsDataURL(blob);
  });
}

export async function removeBackgroundFromSrc(src: string): Promise<string> {
  return removeBackground(await srcToDataUrl(src));
}

export async function stripPhotoBackgrounds<K extends string>(
  photos: Partial<Record<K, string>>,
  keys: readonly K[],
): Promise<Partial<Record<K, string>>> {
  const next = { ...photos };
  for (const key of keys) {
    const src = photos[key];
    if (!src || !photoNeedsBackgroundRemoval(src)) continue;
    next[key] = await removeBackgroundFromSrc(src);
  }
  return next;
}

export async function removeBackground(imageDataUrl: string): Promise<string> {
  // Lazy load the module
  if (!removeBgModule && !loading) {
    loading = true;
    removeBgModule = await import("@imgly/background-removal");
    loading = false;
  }

  // Wait if another call is loading the module
  while (loading) {
    await new Promise((r) => setTimeout(r, 100));
  }

  if (!removeBgModule) throw new Error("Failed to load background removal module");

  // Convert data URL to blob
  const res = await fetch(imageDataUrl);
  const inputBlob = await res.blob();

  // Run in a non-blocking way by yielding to the browser between steps
  // The library uses ONNX Runtime Web which runs on WebGL/WASM,
  // so it shouldn't fully block but the initial model load can be heavy
  const resultBlob = await removeBgModule.removeBackground(inputBlob, {
    output: {
      format: "image/png",
    },
  });

  const dataUrl = await readBlobAsDataUrl(resultBlob);
  return ensurePngDataUrl(dataUrl);
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Lecture impossible"));
    reader.readAsDataURL(blob);
  });
}

/** OpenAI rejects AVIF; some browsers tag cutouts as image/avif even when we asked for PNG. */
export async function ensurePngDataUrl(
  dataUrl: string,
  encodePng: (src: string) => Promise<string> = redrawDataUrlAsPng,
): Promise<string> {
  if (dataUrl.startsWith("data:image/png")) return dataUrl;
  return encodePng(dataUrl);
}

async function redrawDataUrlAsPng(dataUrl: string): Promise<string> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponible");
    ctx.drawImage(bitmap, 0, 0);
    return canvas.toDataURL("image/png");
  } finally {
    bitmap.close?.();
  }
}
