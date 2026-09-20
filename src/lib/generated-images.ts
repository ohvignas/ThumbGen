import { v4 as uuid } from "uuid";
import { generatedImageUrl } from "./canvas/image-refs";
import { getDb, parseDataUrl } from "./db";

export type StoredImage = { id: string; mimeType: string; data: Buffer };

export function saveGeneratedImage(dataUrl: string, projectId?: string | null): { id: string; url: string } {
  const { buffer, mimeType } = parseDataUrl(dataUrl);
  const id = uuid();
  getDb()
    .prepare("INSERT INTO generated_images (id, mime_type, data, project_id) VALUES (?, ?, ?, ?)")
    .run(id, mimeType, buffer, projectId ?? null);
  return { id, url: generatedImageUrl(id) };
}

/** How many thumbnails each project has generated, keyed by project id. */
export function countImagesByProject(): Map<string, number> {
  const rows = getDb()
    .prepare("SELECT project_id, COUNT(*) AS n FROM generated_images WHERE project_id IS NOT NULL GROUP BY project_id")
    .all() as Array<{ project_id: string; n: number }>;
  return new Map(rows.map((r) => [r.project_id, r.n]));
}

export function getGeneratedImage(id: string): StoredImage | null {
  const row = getDb().prepare("SELECT id, mime_type, data FROM generated_images WHERE id = ?").get(id) as
    | { id: string; mime_type: string; data: Buffer }
    | undefined;
  if (!row) return null;
  return { id: row.id, mimeType: row.mime_type, data: row.data };
}
