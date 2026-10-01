/**
 * On-screen miniature size. The stored blob (often a 4K–5K PNG) stays on the
 * URL without `w` — downloads and the image model keep using that.
 * One width so the list, the canvas, and the mention picker share one cache file.
 */
export const DISPLAY_THUMB_WIDTH = 1280;

const GENERATED_PATH = "/api/generated-images/image";
const SKETCH_PATH = /^\/api\/generated-sketches\/[\w-]+$/;

export function wantsDisplayThumb(width: string | null): boolean {
  return width === String(DISPLAY_THUMB_WIDTH);
}

/** Same-origin generated image or sketch URL, plus `w` so the route serves a small baseline JPEG. */
export function withDisplayThumb(url: string): string {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return url;
  let parsed: URL;
  try {
    parsed = new URL(url, "http://thumbgen.local");
  } catch {
    return url;
  }
  if (parsed.origin !== "http://thumbgen.local") return url;
  if (parsed.pathname !== GENERATED_PATH && !SKETCH_PATH.test(parsed.pathname)) return url;
  parsed.searchParams.set("w", String(DISPLAY_THUMB_WIDTH));
  return `${parsed.pathname}?${parsed.searchParams.toString()}`;
}
