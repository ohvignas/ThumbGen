import { getDb } from "@/lib/db";
import { createProject, getProjectCoverUrl } from "@/lib/local-storage";
import { getStudioVideo } from "./store";

export const MAX_STUDIO_THUMBS = 3;

export type LinkedStudioProject = {
  id: string;
  name: string;
  coverImageUrl: string | null;
  slot: "A" | "B" | "C";
};

function assertFiche(videoId: string): void {
  if (!getStudioVideo(videoId)) throw new Error("Fiche vidéo introuvable.");
}

export function listProjectsForStudio(videoId: string): LinkedStudioProject[] {
  const rows = getDb()
    .prepare("SELECT id, name FROM projects_meta WHERE studio_video_id = ? ORDER BY updated_at DESC, id DESC")
    .all(videoId) as Array<{ id: string; name: string }>;
  return rows.slice(0, MAX_STUDIO_THUMBS).map((row, index) => ({
    id: row.id,
    name: row.name,
    coverImageUrl: getProjectCoverUrl(row.id),
    slot: (["A", "B", "C"] as const)[index],
  }));
}

export function linkProjectToStudio(projectId: string, videoId: string): void {
  assertFiche(videoId);
  const existing = listProjectsForStudio(videoId);
  if (existing.some((row) => row.id === projectId)) return;
  if (existing.length >= MAX_STUDIO_THUMBS) {
    throw new Error("Trois miniatures maximum pour le test A/B.");
  }
  const result = getDb()
    .prepare("UPDATE projects_meta SET studio_video_id = ?, updated_at = ? WHERE id = ?")
    .run(videoId, new Date().toISOString(), projectId);
  if (result.changes === 0) throw new Error("Miniature introuvable");
}

export function unlinkProjectFromStudio(projectId: string, videoId: string): void {
  getDb()
    .prepare("UPDATE projects_meta SET studio_video_id = NULL, updated_at = ? WHERE id = ? AND studio_video_id = ?")
    .run(new Date().toISOString(), projectId, videoId);
}

export function createMiniatureForStudio(videoId: string): { id: string; name: string } {
  assertFiche(videoId);
  if (listProjectsForStudio(videoId).length >= MAX_STUDIO_THUMBS) {
    throw new Error("Trois miniatures maximum pour le test A/B.");
  }
  const video = getStudioVideo(videoId)!;
  const created = createProject(video.title.slice(0, 80) || "Miniature");
  linkProjectToStudio(created.id, videoId);
  return created;
}
