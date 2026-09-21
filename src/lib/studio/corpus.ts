import { getDb } from "@/lib/db";
import type { CorpusHit } from "./types";
import { getTranscript, searchMyChannel, upsertTranscript } from "@/lib/youtube/knowledge-store";
import { youtubeVideoIdFromUrl } from "@/lib/youtube/video-id";

const NO_YOUTUBE_URL = "Pas d’URL YouTube sur cette fiche";

type StudioCorpusRow = {
  video_id: string;
  title: string;
  youtube_url: string | null;
  youtube_video_id: string | null;
  script: string | null;
  description: string | null;
};

type FtsRow = {
  videoId: string;
  title: string;
  youtubeVideoId: string | null;
  script: string;
  description: string;
  transcript: string;
};

function loadStudioRow(videoId: string): StudioCorpusRow | undefined {
  return getDb()
    .prepare(
      `SELECT v.video_id, v.title, v.youtube_url, v.youtube_video_id,
              d.script, d.description
       FROM studio_videos v
       LEFT JOIN studio_drafts d ON d.video_id = v.video_id
       WHERE v.video_id = ?`,
    )
    .get(videoId) as StudioCorpusRow | undefined;
}

function existingTranscript(videoId: string): string {
  try {
    const row = getDb().prepare("SELECT transcript FROM studio_corpus_fts WHERE video_id = ?").get(videoId) as
      | { transcript?: string }
      | undefined;
    return row?.transcript ?? "";
  } catch {
    return "";
  }
}

function ftsQuery(raw: string): string {
  return raw
    .split(/\s+/)
    .map((token) => token.replace(/["']/g, ""))
    .filter(Boolean)
    .map((token) => `"${token}"`)
    .join(" AND ");
}

function snippetFrom(text: string, query: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  const lower = compact.toLowerCase();
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  let idx = -1;
  for (const token of tokens) {
    idx = lower.indexOf(token);
    if (idx >= 0) break;
  }
  if (idx < 0) return compact.slice(0, 180);
  const start = Math.max(0, idx - 40);
  return compact.slice(start, start + 180);
}

function hitKind(row: { script: string; description: string; transcript: string; title: string }, query: string): CorpusHit["kind"] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const has = (text: string) => tokens.every((token) => text.toLowerCase().includes(token));
  if (has(row.script)) return "script";
  if (has(row.description)) return "description";
  if (has(row.transcript)) return "transcript";
  return "title";
}

function toStudioHit(row: FtsRow, query: string): CorpusHit {
  const kind = hitKind(row, query);
  const field =
    kind === "script" ? row.script : kind === "description" ? row.description : kind === "transcript" ? row.transcript : row.title;
  return {
    source: "studio",
    videoId: row.videoId,
    youtubeVideoId: row.youtubeVideoId ?? undefined,
    title: row.title,
    snippet: snippetFrom(field || row.title, query),
    kind,
  };
}

export function indexStudioCorpus(videoId: string, transcript?: string | null): void {
  const row = loadStudioRow(videoId);
  if (!row) return;
  const transcriptText = transcript == null ? existingTranscript(videoId) : transcript;
  const db = getDb();
  try {
    db.prepare("DELETE FROM studio_corpus_fts WHERE video_id = ?").run(videoId);
    db.prepare("INSERT INTO studio_corpus_fts (video_id, title, script, description, transcript) VALUES (?, ?, ?, ?, ?)").run(
      row.video_id,
      row.title ?? "",
      row.script ?? "",
      row.description ?? "",
      transcriptText,
    );
  } catch {
    // FTS5 unavailable — retrieveOwnCorpus falls back to LIKE.
  }
}

function searchStudioCorpus(query: string, limit: number): CorpusHit[] {
  const db = getDb();
  const match = ftsQuery(query);
  if (match) {
    try {
      const rows = db
        .prepare(
          `SELECT f.video_id AS videoId,
                  COALESCE(v.title, f.title) AS title,
                  v.youtube_video_id AS youtubeVideoId,
                  COALESCE(f.script, '') AS script,
                  COALESCE(f.description, '') AS description,
                  COALESCE(f.transcript, '') AS transcript
           FROM studio_corpus_fts f
           LEFT JOIN studio_videos v ON v.video_id = f.video_id
           WHERE studio_corpus_fts MATCH ?
           LIMIT ?`,
        )
        .all(match, limit) as FtsRow[];
      if (rows.length > 0) return rows.map((row) => toStudioHit(row, query));
    } catch {
      // FTS missing or bad query: LIKE fallback below.
    }
  }
  const like = `%${query.replace(/[%_]/g, "")}%`;
  try {
    const rows = db
      .prepare(
        `SELECT f.video_id AS videoId,
                COALESCE(v.title, f.title) AS title,
                v.youtube_video_id AS youtubeVideoId,
                COALESCE(f.script, '') AS script,
                COALESCE(f.description, '') AS description,
                COALESCE(f.transcript, '') AS transcript
         FROM studio_corpus_fts f
         LEFT JOIN studio_videos v ON v.video_id = f.video_id
         WHERE f.title LIKE ? OR f.script LIKE ? OR f.description LIKE ? OR f.transcript LIKE ?
         LIMIT ?`,
      )
      .all(like, like, like, like, limit) as FtsRow[];
    if (rows.length > 0) return rows.map((row) => toStudioHit(row, query));
  } catch {
    // FTS table missing.
  }
  return (
    db
      .prepare(
        `SELECT v.video_id AS videoId,
                v.title AS title,
                v.youtube_video_id AS youtubeVideoId,
                COALESCE(d.script, '') AS script,
                COALESCE(d.description, '') AS description,
                '' AS transcript
         FROM studio_videos v
         LEFT JOIN studio_drafts d ON d.video_id = v.video_id
         WHERE v.title LIKE ? OR IFNULL(d.script, '') LIKE ? OR IFNULL(d.description, '') LIKE ?
         LIMIT ?`,
      )
      .all(like, like, like, limit) as FtsRow[]
  ).map((row) => toStudioHit(row, query));
}

function channelExists(youtubeVideoId: string): boolean {
  const row = getDb().prepare("SELECT 1 AS ok FROM channel_videos WHERE video_id = ? LIMIT 1").get(youtubeVideoId) as
    | { ok: number }
    | undefined;
  return Boolean(row);
}

export function retrieveOwnCorpus(query: string, limit = 8): CorpusHit[] {
  const trimmed = query.trim().slice(0, 200);
  if (!trimmed) return [];
  const seen = new Set<string>();
  const hits: CorpusHit[] = [];
  for (const hit of searchMyChannel(trimmed, limit)) {
    if (seen.has(hit.videoId)) continue;
    seen.add(hit.videoId);
    hits.push({
      source: "channel",
      youtubeVideoId: hit.videoId,
      title: hit.title,
      snippet: hit.snippet,
      kind: "transcript",
    });
  }
  for (const hit of searchStudioCorpus(trimmed, limit)) {
    if (hit.youtubeVideoId && seen.has(hit.youtubeVideoId)) continue;
    if (hit.youtubeVideoId) seen.add(hit.youtubeVideoId);
    hits.push(hit);
  }
  return hits.slice(0, limit);
}

export async function ingestYoutubeTranscript(videoId: string): Promise<{ ok: boolean; reason?: string }> {
  const row = loadStudioRow(videoId);
  if (!row?.youtube_url) return { ok: false, reason: NO_YOUTUBE_URL };
  const youtubeId = youtubeVideoIdFromUrl(row.youtube_url);
  if (!youtubeId) return { ok: false, reason: NO_YOUTUBE_URL };

  let text = "";
  const cached = getTranscript(youtubeId);
  if (cached?.source === "timedtext" && cached.text) {
    text = cached.text;
  } else {
    try {
      const { YoutubeTranscript } = await import("youtube-transcript");
      const cues = await YoutubeTranscript.fetchTranscript(row.youtube_url);
      text = cues.map((cue) => cue.text ?? "").join(" ").replace(/\s+/g, " ").trim();
    } catch (err) {
      return { ok: false, reason: (err as Error).message };
    }
  }

  if (channelExists(youtubeId)) {
    upsertTranscript({
      videoId: youtubeId,
      source: "timedtext",
      language: null,
      text,
      fetchedAt: new Date().toISOString(),
    });
  }
  indexStudioCorpus(videoId, text);
  return { ok: true };
}
