import { toImageSourceRef } from "@/lib/canvas/image-refs";

/** Badge / mention token: `#` + last 6 alphanumerics of the stored id (uppercase). */
export const VISIBLE_IMAGE_ID_RE = /^#[A-Z0-9]{2,12}$/;

const REF_ID =
  /^(?:stored:(?:gi|sf|lg|persona)_|generated:|uploaded:)(.+)$/;

/**
 * Short typeable id from a stored image / sketch / upload id (uuid or legacy stem).
 * `aaaa1111-bbbb-cccc-dddd-eeeeeeeeeeee` → `#EEEEEE`; `p1` → `#P1`.
 */
export function formatVisibleImageId(rawId: string, length = 6): string {
  const chars = rawId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (!chars) return "";
  const take = Math.min(12, Math.max(2, length));
  const tail = chars.length <= take ? chars : chars.slice(-take);
  return `#${tail}`;
}

/** `stored:gi_<id>` / generated / uploaded / library URL → the raw stored id. */
export function storedIdFromImageValue(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const ref = toImageSourceRef(value) ?? (/^(stored:|generated:|uploaded:)/.test(value) ? value : null);
  if (!ref) {
    if (/^[\w-]+$/.test(value) && !value.startsWith("/")) return value;
    return null;
  }
  const match = REF_ID.exec(ref);
  return match?.[1] ?? null;
}

/** Same visible id on the badge, in `@#id`, and on canvas_state. */
export function visibleImageIdFromValue(value: unknown, length = 6): string | null {
  const stored = storedIdFromImageValue(value);
  if (!stored) return null;
  const id = formatVisibleImageId(stored, length);
  return id.length >= 3 ? id : null;
}

/** generate_sketch / import_youtube_thumbnail result text → badge id. */
export function visibleImageIdFromToolText(text: string): string | null {
  const generated = text.match(/\bgenerated:(sk_[a-z0-9]+)/i);
  if (generated) return formatVisibleImageId(generated[1]);
  const stored = text.match(/\bstored:(?:gi|sf|lg)_([\w-]+)/i);
  if (stored) return formatVisibleImageId(stored[1]);
  return null;
}

export function normalizeVisibleImageId(token: string): string {
  const trimmed = token.trim();
  const bare = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  return formatVisibleImageId(bare);
}
