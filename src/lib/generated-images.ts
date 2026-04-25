import { v4 as uuid } from "uuid";
import { getDb, parseDataUrl } from "./db";

export type StoredImage = { id: string; mimeType: string; data: Buffer };

export function saveGeneratedImage(dataUrl: string): { id: string; url: string } {
  const { buffer, mimeType } = parseDataUrl(dataUrl);
  const id = uuid();
  getDb().prepare("INSERT INTO generated_images (id, mime_type, data) VALUES (?, ?, ?)").run(id, mimeType, buffer);
  return { id, url: `/api/generated-images/image?id=${id}` };
}

export function getGeneratedImage(id: string): StoredImage | null {
  const row = getDb().prepare("SELECT id, mime_type, data FROM generated_images WHERE id = ?").get(id) as
    | { id: string; mime_type: string; data: Buffer }
    | undefined;
  if (!row) return null;
  return { id: row.id, mimeType: row.mime_type, data: row.data };
}
