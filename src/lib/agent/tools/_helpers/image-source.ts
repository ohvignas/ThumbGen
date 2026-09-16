import { getDb } from "@/lib/db";

export type ResolvedImage = { mimeType: string; bytes: Buffer };

const TABLE_BY_PREFIX = {
  lg: "logos",
  sf: "swipe_files",
  fr: "face_reactions",
  gi: "generated_images",
} as const;

type StoredPrefix = keyof typeof TABLE_BY_PREFIX;

export function makeStoredId(prefix: StoredPrefix, id: string): string {
  return `stored:${prefix}_${id}`;
}

export async function resolveImageSource(source: string): Promise<ResolvedImage> {
  // data: URI
  if (source.startsWith("data:image/")) {
    const m = source.match(/^data:(image\/[a-z]+);base64,(.+)$/);
    if (!m) throw new Error(`Malformed data URI: ${source.slice(0, 40)}…`);
    return { mimeType: m[1], bytes: Buffer.from(m[2], "base64") };
  }

  // stored:persona_<id> — a Personnage resolves to up to 3 angle photos, not
  // one. Callers here (generate_sketch's single face_source slot) only need
  // ONE representative image, so return the front angle (falling back to
  // whichever angle exists first) rather than erroring. apply_workflow does
  // NOT go through this path — it has its own persona branch in
  // blueprintToCanvasData that resolves all 3 angles for the real generation.
  if (source.startsWith("stored:persona_")) {
    const personaId = source.slice("stored:persona_".length);
    const photo = getDb()
      .prepare("SELECT angle, mime_type, data FROM persona_photos WHERE persona_id = ? ORDER BY CASE angle WHEN 'front' THEN 0 WHEN 'left' THEN 1 ELSE 2 END LIMIT 1")
      .get(personaId) as { angle: string; mime_type: string; data: Buffer } | undefined;
    if (!photo) throw new Error(`Persona not found or has no photos: ${source}`);
    return { mimeType: photo.mime_type, bytes: photo.data };
  }

  // stored:<prefix>_<id>
  if (source.startsWith("stored:")) {
    const m = source.match(/^stored:(lg|sf|fr|gi)_(.+)$/);
    if (!m) throw new Error(`Invalid stored source: ${source}`);
    const [, prefix, id] = m as [string, StoredPrefix, string];
    const table = TABLE_BY_PREFIX[prefix];
    const row = getDb()
      .prepare(`SELECT mime_type, data FROM ${table} WHERE id = ?`)
      .get(id) as { mime_type: string; data: Buffer } | undefined;
    if (!row) throw new Error(`Image not found: ${source}`);
    return { mimeType: row.mime_type, bytes: row.data };
  }

  // generated:<id>
  if (source.startsWith("generated:")) {
    const id = source.slice("generated:".length);
    const row = getDb()
      .prepare("SELECT mime_type, data FROM generated_sketches WHERE id = ?")
      .get(id) as { mime_type: string; data: Buffer } | undefined;
    if (!row) throw new Error(`Generated sketch not found: ${source}`);
    return { mimeType: row.mime_type, bytes: row.data };
  }

  // uploaded:<id>
  if (source.startsWith("uploaded:")) {
    const id = source.slice("uploaded:".length);
    const row = getDb()
      .prepare("SELECT mime_type, data FROM chat_uploads WHERE id = ?")
      .get(id) as { mime_type: string; data: Buffer } | undefined;
    if (!row) throw new Error(`Upload not found: ${source}`);
    return { mimeType: row.mime_type, bytes: row.data };
  }

  throw new Error(`Unsupported image source scheme: ${source}`);
}

/**
 * Cheap existence check — does NOT load image bytes. Use this in validation
 * paths (apply_workflow) where you only need to know "is this reference valid".
 * Returns true for `data:image/...` (assumed valid since the schema validated).
 */
export function imageExists(source: string): boolean {
  if (source.startsWith("data:image/")) return true;

  if (source.startsWith("stored:persona_")) {
    const id = source.slice("stored:persona_".length);
    return Boolean(getDb().prepare("SELECT 1 FROM personas WHERE id = ?").get(id));
  }

  if (source.startsWith("stored:")) {
    const m = source.match(/^stored:(lg|sf|fr|gi)_(.+)$/);
    if (!m) return false;
    const [, prefix, id] = m as [string, StoredPrefix, string];
    const table = TABLE_BY_PREFIX[prefix];
    const row = getDb().prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id);
    return Boolean(row);
  }

  if (source.startsWith("generated:")) {
    const id = source.slice("generated:".length);
    return Boolean(getDb().prepare("SELECT 1 FROM generated_sketches WHERE id = ?").get(id));
  }

  if (source.startsWith("uploaded:")) {
    const id = source.slice("uploaded:".length);
    return Boolean(getDb().prepare("SELECT 1 FROM chat_uploads WHERE id = ?").get(id));
  }

  return false;
}

export function markAttached(source: string): void {
  if (source.startsWith("generated:")) {
    const id = source.slice("generated:".length);
    getDb().prepare("UPDATE generated_sketches SET attached = 1 WHERE id = ?").run(id);
  } else if (source.startsWith("uploaded:")) {
    const id = source.slice("uploaded:".length);
    getDb().prepare("UPDATE chat_uploads SET attached = 1 WHERE id = ?").run(id);
  }
  // stored:* and data: don't need attaching (permanent / inline)
}
