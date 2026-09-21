import { getDb } from "@/lib/db";
import { indexStudioCorpus } from "./corpus";
import { emptyStudioDraft } from "./page-template";
import { isEtiquette, newStudioVideoId, UNTITLED_STUDIO_VIDEO, writingProjectId, type Etiquette, type StudioDraft, type StudioVideo } from "./types";
import { youtubeVideoIdFromUrl } from "@/lib/youtube/video-id";

type StudioRow = {
  video_id: string;
  title: string;
  summary: string | null;
  youtube_url: string | null;
  youtube_video_id: string | null;
  etiquette: string | null;
  created_at: string;
  updated_at: string;
  script: string | null;
  description: string | null;
  title_variants: string | null;
};

const SELECT_VIDEO = `
  SELECT
    v.video_id, v.title, v.summary, v.youtube_url, v.youtube_video_id, v.etiquette,
    v.created_at, v.updated_at,
    d.script, d.description, d.title_variants
  FROM studio_videos v
  LEFT JOIN studio_drafts d ON d.video_id = v.video_id
`;

function parseTitleVariants(raw: string | null): StudioDraft["titleVariants"] {
  const fallback = emptyStudioDraft();
  if (!raw) return fallback.titleVariants;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return fallback.titleVariants;
    const variants = fallback.titleVariants;
    for (let i = 0; i < 3; i += 1) {
      const row = parsed[i] as { title?: unknown; thumbText?: unknown; visualConcept?: unknown } | undefined;
      variants[i] = {
        title: typeof row?.title === "string" ? row.title : "",
        thumbText: typeof row?.thumbText === "string" ? row.thumbText : "",
        visualConcept: typeof row?.visualConcept === "string" ? row.visualConcept : "",
      };
    }
    return variants;
  } catch {
    return fallback.titleVariants;
  }
}

function rowToVideo(row: StudioRow): StudioVideo {
  const draft = emptyStudioDraft();
  draft.script = row.script ?? "";
  draft.description = row.description ?? "";
  draft.titleVariants = parseTitleVariants(row.title_variants);
  return {
    videoId: row.video_id,
    title: row.title,
    summary: row.summary ?? "",
    youtubeUrl: row.youtube_url,
    youtubeVideoId: row.youtube_video_id,
    etiquette: row.etiquette && isEtiquette(row.etiquette) ? row.etiquette : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    draft,
  };
}

export function createStudioVideo(input: {
  title: string;
  summary?: string;
  etiquette?: Etiquette | null;
  youtubeUrl?: string | null;
}): StudioVideo {
  const videoId = newStudioVideoId();
  const now = new Date().toISOString();
  const title = input.title.trim() || UNTITLED_STUDIO_VIDEO;
  const summary = input.summary?.trim() ?? "";
  const youtubeUrl = input.youtubeUrl ?? null;
  const youtubeVideoId = youtubeUrl ? youtubeVideoIdFromUrl(youtubeUrl) : null;
  getDb()
    .prepare(
      `INSERT INTO studio_videos (video_id, title, summary, youtube_url, youtube_video_id, etiquette, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(videoId, title, summary, youtubeUrl, youtubeVideoId, input.etiquette ?? null, now, now);
  saveStudioDraft(videoId, emptyStudioDraft());
  const created = getStudioVideo(videoId);
  if (!created) throw new Error(`Studio video ${videoId} missing after insert`);
  return created;
}

export function upsertStudioVideo(video: Omit<StudioVideo, "draft"> & { draft?: StudioDraft }): void {
  getDb()
    .prepare(
      `INSERT INTO studio_videos (video_id, title, summary, youtube_url, youtube_video_id, etiquette, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(video_id) DO UPDATE SET
         title = excluded.title,
         summary = excluded.summary,
         youtube_url = excluded.youtube_url,
         youtube_video_id = excluded.youtube_video_id,
         etiquette = excluded.etiquette,
         updated_at = excluded.updated_at`,
    )
    .run(
      video.videoId,
      video.title,
      video.summary,
      video.youtubeUrl,
      video.youtubeVideoId,
      video.etiquette,
      video.createdAt,
      video.updatedAt,
    );
  if (video.draft) saveStudioDraft(video.videoId, video.draft);
  else indexStudioCorpus(video.videoId);
}

export function getStudioVideo(videoId: string): StudioVideo | null {
  const row = getDb().prepare(`${SELECT_VIDEO} WHERE v.video_id = ?`).get(videoId) as StudioRow | undefined;
  return row ? rowToVideo(row) : null;
}

export function listStudioVideos(): StudioVideo[] {
  const rows = getDb().prepare(`${SELECT_VIDEO} ORDER BY v.updated_at DESC`).all() as StudioRow[];
  return rows.map(rowToVideo);
}

export function saveStudioDraft(videoId: string, draft: StudioDraft): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO studio_drafts (video_id, script, description, title_variants, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(video_id) DO UPDATE SET
         script = excluded.script,
         description = excluded.description,
         title_variants = excluded.title_variants,
         updated_at = excluded.updated_at`,
    )
    .run(videoId, draft.script, draft.description, JSON.stringify(draft.titleVariants), now);
  getDb().prepare("UPDATE studio_videos SET updated_at = ? WHERE video_id = ?").run(now, videoId);
  indexStudioCorpus(videoId);
}

export function updateStudioVideo(
  videoId: string,
  patch: { title?: string; summary?: string; etiquette?: Etiquette | null; youtubeUrl?: string | null },
): StudioVideo | null {
  const existing = getStudioVideo(videoId);
  if (!existing) return null;
  if (patch.etiquette !== undefined && patch.etiquette !== null && !isEtiquette(patch.etiquette)) {
    throw new Error("Étiquette inconnue");
  }
  const title = patch.title ?? existing.title;
  const summary = patch.summary !== undefined ? patch.summary : existing.summary;
  const etiquette = patch.etiquette !== undefined ? patch.etiquette : existing.etiquette;
  const youtubeUrl = patch.youtubeUrl !== undefined ? patch.youtubeUrl : existing.youtubeUrl;
  const youtubeVideoId = youtubeUrl ? youtubeVideoIdFromUrl(youtubeUrl) : null;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE studio_videos
       SET title = ?, summary = ?, etiquette = ?, youtube_url = ?, youtube_video_id = ?, updated_at = ?
       WHERE video_id = ?`,
    )
    .run(title, summary, etiquette, youtubeUrl, youtubeVideoId, now, videoId);
  indexStudioCorpus(videoId);
  return getStudioVideo(videoId);
}

export function deleteStudioVideo(videoId: string): boolean {
  if (!getStudioVideo(videoId)) return false;
  const projectId = writingProjectId(videoId);
  const db = getDb();
  db.transaction(() => {
    db.prepare(
      "DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE project_id = ?)",
    ).run(projectId);
    db.prepare(
      "DELETE FROM competitor_search_results WHERE conversation_id IN (SELECT id FROM conversations WHERE project_id = ?)",
    ).run(projectId);
    db.prepare("DELETE FROM thumbnail_briefs WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM conversations WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM canvas_snapshots WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM generated_images WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM generations_log WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM canvas_tombstones WHERE project_id = ?").run(projectId);
    try {
      db.prepare("DELETE FROM studio_corpus_fts WHERE video_id = ?").run(videoId);
    } catch {
      // FTS5 may be unavailable.
    }
    db.prepare("DELETE FROM studio_drafts WHERE video_id = ?").run(videoId);
    db.prepare("DELETE FROM studio_videos WHERE video_id = ?").run(videoId);
  })();
  return true;
}
