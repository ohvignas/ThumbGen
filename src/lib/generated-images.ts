import { v4 as uuid } from "uuid";
import { getDb, parseDataUrl } from "./db";

export type StoredImage = { id: string; mimeType: string; data: Buffer };

export function saveGeneratedImage(dataUrl: string, projectId?: string | null): { id: string; url: string } {
  const { buffer, mimeType } = parseDataUrl(dataUrl);
  const id = uuid();
  getDb()
    .prepare("INSERT INTO generated_images (id, mime_type, data, project_id) VALUES (?, ?, ?, ?)")
    .run(id, mimeType, buffer, projectId ?? null);
  return { id, url: `/api/generated-images/image?id=${id}` };
}

export type MiniatureImage = { id: string; url: string; createdAt: string };

/** Generated images for one project, newest first — the gallery's unit. */
export function listProjectImages(projectId: string): MiniatureImage[] {
  const rows = getDb()
    .prepare("SELECT id, created_at FROM generated_images WHERE project_id = ? ORDER BY created_at DESC")
    .all(projectId) as Array<{ id: string; created_at: string }>;
  return rows.map((r) => ({ id: r.id, url: `/api/generated-images/image?id=${r.id}`, createdAt: r.created_at }));
}

/**
 * Images that belong to no project: generated before project_id existed and no
 * longer referenced by any canvas (so the backfill could not attribute them),
 * or produced by a canvas that has since been edited. Shown separately rather
 * than guessed into a project.
 */
export function listUnassignedImages(): MiniatureImage[] {
  const rows = getDb()
    .prepare("SELECT id, created_at FROM generated_images WHERE project_id IS NULL ORDER BY created_at DESC")
    .all() as Array<{ id: string; created_at: string }>;
  return rows.map((r) => ({ id: r.id, url: `/api/generated-images/image?id=${r.id}`, createdAt: r.created_at }));
}

export function getGeneratedImage(id: string): StoredImage | null {
  const row = getDb().prepare("SELECT id, mime_type, data FROM generated_images WHERE id = ?").get(id) as
    | { id: string; mime_type: string; data: Buffer }
    | undefined;
  if (!row) return null;
  return { id: row.id, mimeType: row.mime_type, data: row.data };
}
