/**
 * Maps an image value stored in a canvas node (library URL, agent ref) to the
 * `image_source` ref the agent tools understand. Pure — no DB, safe in the
 * browser (the chat snapshot) and on the server (get_canvas_state,
 * view_canvas_images).
 */

const REF_PREFIX = /^(stored:(lg|sf|gi|persona)_[\w-]+|generated:[\w-]+|uploaded:[\w-]+)$/;
const INLINE_BLOB_MIN = 240;

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

/**
 * Compact form for /api/generate/openrouter: stored/generated/uploaded refs,
 * or the persona URL with its angle (toImageSourceRef drops the angle).
 * Data URLs stay as-is — the caller must not add more of them.
 */
export function compactGenerationImageRef(value: string): string {
  if (!value || value.startsWith("data:") || REF_PREFIX.test(value)) return value;
  if (value.startsWith("/api/personas/image") && toImageSourceRef(value)) return value;
  return toImageSourceRef(value) ?? value;
}

/** True when the generate route can turn this string into pixels without a client data URL. */
export function isServerResolvableGenerationRef(value: string): boolean {
  if (!value) return false;
  if (value.startsWith("data:")) return true;
  if (REF_PREFIX.test(value)) return true;
  return toImageSourceRef(value) !== null;
}

/** True for a data URL or a long raw base64 blob — not JSON, paths, or refs. */
export function isInlineImageBytes(value: unknown): boolean {
  if (typeof value !== "string" || !value) return false;
  if (value.startsWith("data:")) return true;
  if (value.length <= INLINE_BLOB_MIN) return false;
  if (value.startsWith("/") || /^(stored:|generated:|uploaded:)/.test(value)) return false;
  return /^[A-Za-z0-9+/=\s]+$/.test(value);
}

/** Same-origin URL of a row in `generated_images`. */
export function generatedImageUrl(id: string): string {
  return `/api/generated-images/image?id=${id}`;
}

/**
 * Same-origin `/api/…` URL for a stored/generated/uploaded ref, or the value
 * itself when it is already a same-origin path. Null for inline pixels.
 */
export function imageDisplayUrl(value: string): string | null {
  if (!value || isInlineImageBytes(value)) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  const ref = toImageSourceRef(value) ?? (REF_PREFIX.test(value) ? value : null);
  if (!ref) return null;
  if (ref.startsWith("stored:gi_")) return generatedImageUrl(ref.slice("stored:gi_".length));
  if (ref.startsWith("stored:sf_")) return `/api/swipe-files/image?f=${encodeURIComponent(ref.slice("stored:sf_".length))}`;
  if (ref.startsWith("stored:lg_")) return `/api/logos/image?f=${encodeURIComponent(ref.slice("stored:lg_".length))}`;
  if (ref.startsWith("stored:persona_")) return `/api/personas/image?id=${encodeURIComponent(ref.slice("stored:persona_".length))}`;
  if (ref.startsWith("generated:")) return `/api/generated-sketches/${ref.slice("generated:".length)}`;
  if (ref.startsWith("uploaded:")) return `/api/chat-uploads/${ref.slice("uploaded:".length)}`;
  return null;
}

/** UUID (or legacy filename stem) of a generated-image URL, or null. */
export function generatedImageIdFromUrl(value: unknown): string | null {
  const ref = toImageSourceRef(value);
  return ref?.startsWith("stored:gi_") ? ref.slice("stored:gi_".length) : null;
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
