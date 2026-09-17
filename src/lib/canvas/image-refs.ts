/**
 * Maps an image value stored in a canvas node (library URL, agent ref) to the
 * `image_source` ref the agent tools understand. Pure — no DB, safe in the
 * browser (the chat snapshot) and on the server (get_canvas_state,
 * view_canvas_images).
 */

const REF_PREFIX = /^(stored:(lg|sf|gi|persona)_[\w-]+|generated:[\w-]+|uploaded:[\w-]+)$/;

/** The part of a filename before its extension (`abc.png` → `abc`), as the image routes read it. */
function stripExtension(filename: string): string {
  return filename.split(".")[0];
}

function isSafeId(id: string | null | undefined): id is string {
  return typeof id === "string" && /^[\w-]+$/.test(id);
}

/**
 * The `image_source` ref of a stored image, or null when the value is inline
 * bytes (data URL), an external URL or anything unknown. Only same-origin app
 * paths are recognized: images are never fetched over HTTP.
 */
export function toImageSourceRef(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (REF_PREFIX.test(value)) return value;
  if (!value.startsWith("/api/")) return null;

  let url: URL;
  try {
    url = new URL(value, "http://thumbgen.local");
  } catch {
    return null;
  }
  const params = url.searchParams;
  const path = url.pathname;

  if (path === "/api/generated-images/image") {
    const id = params.get("id") ?? (params.get("f") ? stripExtension(params.get("f")!) : null);
    return isSafeId(id) ? `stored:gi_${id}` : null;
  }
  if (path === "/api/swipe-files/image") {
    const f = params.get("f");
    const id = f ? stripExtension(f) : null;
    return isSafeId(id) ? `stored:sf_${id}` : null;
  }
  if (path === "/api/logos/image") {
    const f = params.get("f");
    const id = f ? stripExtension(f) : null;
    return isSafeId(id) ? `stored:lg_${id}` : null;
  }
  if (path === "/api/personas/image") {
    const id = params.get("id");
    return isSafeId(id) ? `stored:persona_${id}` : null;
  }
  const sketch = path.match(/^\/api\/generated-sketches\/([\w-]+)$/);
  if (sketch) return `generated:${sketch[1]}`;
  const upload = path.match(/^\/api\/chat-uploads\/([\w-]+)$/);
  if (upload) return `uploaded:${upload[1]}`;
  return null;
}

/** Every distinct generated image of a generator node: variant A's list, then the other variants'. */
export function generatorImages(data: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const item of list) if (typeof item === "string" && item && !out.includes(item)) out.push(item);
  };
  push(data.generatedImages);
  const byVariant = data.generatedImagesByVariant;
  if (byVariant && typeof byVariant === "object") {
    for (const variant of ["A", "B", "C"]) push((byVariant as Record<string, unknown>)[variant]);
  }
  return out;
}

/** The image the node marks as selected (`generatedImages[selectedImageIndex]`), if any. */
export function selectedGeneratedImage(data: Record<string, unknown>, requireIndex: boolean): string | null {
  const images = Array.isArray(data.generatedImages) ? data.generatedImages : [];
  const index = typeof data.selectedImageIndex === "number" ? data.selectedImageIndex : requireIndex ? null : 0;
  if (index === null) return null;
  const image = images[index];
  return typeof image === "string" && image ? image : null;
}
