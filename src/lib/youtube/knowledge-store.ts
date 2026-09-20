import { getDb } from "@/lib/db";
import {
  ChannelKnowledgeJsonSchema,
  EMPTY_CHANNEL_KNOWLEDGE,
  type ChannelKnowledgeJson,
} from "./knowledge-schema";

export type TranscriptSource = "timedtext" | "none";

export type VideoTranscriptRow = {
  video_id: string;
  source: TranscriptSource;
  language: string | null;
  text: string;
  char_count: number;
  summary: string | null;
  topics: string | null;
  hook: string | null;
  fetched_at: string;
  summarized_at: string | null;
};

export type ChannelKnowledgeRow = {
  channel_id: string;
  generated_at: string;
  document_md: string;
  json: string;
  video_count: number;
  transcript_count: number;
};

export type VideoAnalyticsRow = {
  video_id: string;
  period_start: string;
  period_end: string;
  views: number | null;
  engaged_views: number | null;
  estimated_minutes_watched: number | null;
  average_view_duration: number | null;
  average_view_percentage: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  subscribers_gained: number | null;
  fetched_at: string;
};

export type ChannelAnalyticsSummaryRow = {
  channel_id: string;
  period: string;
  period_start: string;
  period_end: string;
  views: number | null;
  estimated_minutes_watched: number | null;
  average_view_duration: number | null;
  average_view_percentage: number | null;
  subscribers_gained: number | null;
  subscribers_lost: number | null;
  fetched_at: string;
};

export function upsertTranscript(row: {
  videoId: string;
  source: TranscriptSource;
  language: string | null;
  text: string;
  fetchedAt: string;
}): void {
  const text = row.text.slice(0, 200_000);
  getDb()
    .prepare(
      `INSERT INTO video_transcripts (video_id, source, language, text, char_count, fetched_at)
       VALUES (@videoId, @source, @language, @text, @charCount, @fetchedAt)
       ON CONFLICT(video_id) DO UPDATE SET
         source = excluded.source,
         language = excluded.language,
         text = excluded.text,
         char_count = excluded.char_count,
         fetched_at = excluded.fetched_at`,
    )
    .run({
      videoId: row.videoId,
      source: row.source,
      language: row.language,
      text,
      charCount: text.length,
      fetchedAt: row.fetchedAt,
    });
  indexTranscript(row.videoId);
}

export function setTranscriptSummary(
  videoId: string,
  summary: { summary: string; topics: string[]; hook: string },
  summarizedAt: string,
): void {
  getDb()
    .prepare(
      "UPDATE video_transcripts SET summary = ?, topics = ?, hook = ?, summarized_at = ? WHERE video_id = ?",
    )
    .run(summary.summary, JSON.stringify(summary.topics), summary.hook, summarizedAt, videoId);
  indexTranscript(videoId);
}

export function getTranscript(videoId: string): VideoTranscriptRow | null {
  return (
    (getDb().prepare("SELECT * FROM video_transcripts WHERE video_id = ?").get(videoId) as VideoTranscriptRow | undefined) ??
    null
  );
}

export function videosMissingTranscript(channelId: string): string[] {
  return (
    getDb()
      .prepare(
        `SELECT v.video_id FROM channel_videos v
         LEFT JOIN video_transcripts t ON t.video_id = v.video_id
         WHERE v.channel_id = ? AND t.video_id IS NULL
         ORDER BY v.view_count DESC, v.published_at DESC`,
      )
      .all(channelId) as { video_id: string }[]
  ).map((row) => row.video_id);
}

export function countTranscripts(channelId: string): { done: number; failed: number; total: number } {
  const row = getDb()
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM channel_videos WHERE channel_id = ?) AS total,
         (SELECT COUNT(*) FROM video_transcripts t JOIN channel_videos v ON v.video_id = t.video_id
            WHERE v.channel_id = ? AND t.source = 'timedtext') AS done,
         (SELECT COUNT(*) FROM video_transcripts t JOIN channel_videos v ON v.video_id = t.video_id
            WHERE v.channel_id = ? AND t.source = 'none') AS failed`,
    )
    .get(channelId, channelId, channelId) as { total: number; done: number; failed: number };
  return row;
}

export function transcriptsNeedingSummary(channelId: string, limit: number): VideoTranscriptRow[] {
  return getDb()
    .prepare(
      `SELECT t.* FROM video_transcripts t
       JOIN channel_videos v ON v.video_id = t.video_id
       WHERE v.channel_id = ? AND t.source = 'timedtext' AND t.char_count >= 200 AND t.summarized_at IS NULL
       ORDER BY v.view_count DESC LIMIT ?`,
    )
    .all(channelId, limit) as VideoTranscriptRow[];
}

export function topTranscripts(channelId: string, limit: number): Array<VideoTranscriptRow & { title: string }> {
  return getDb()
    .prepare(
      `SELECT t.*, v.title FROM video_transcripts t
       JOIN channel_videos v ON v.video_id = t.video_id
       WHERE v.channel_id = ? AND t.source = 'timedtext'
       ORDER BY v.view_count DESC LIMIT ?`,
    )
    .all(channelId, limit) as Array<VideoTranscriptRow & { title: string }>;
}

export function upsertVideoAnalytics(row: Omit<VideoAnalyticsRow, "fetched_at"> & { fetchedAt: string }): void {
  getDb()
    .prepare(
      `INSERT INTO channel_video_analytics (
         video_id, period_start, period_end, views, engaged_views, estimated_minutes_watched,
         average_view_duration, average_view_percentage, likes, comments, shares, subscribers_gained, fetched_at
       ) VALUES (
         @video_id, @period_start, @period_end, @views, @engaged_views, @estimated_minutes_watched,
         @average_view_duration, @average_view_percentage, @likes, @comments, @shares, @subscribers_gained, @fetchedAt
       )
       ON CONFLICT(video_id) DO UPDATE SET
         period_start = excluded.period_start,
         period_end = excluded.period_end,
         views = excluded.views,
         engaged_views = excluded.engaged_views,
         estimated_minutes_watched = excluded.estimated_minutes_watched,
         average_view_duration = excluded.average_view_duration,
         average_view_percentage = excluded.average_view_percentage,
         likes = excluded.likes,
         comments = excluded.comments,
         shares = excluded.shares,
         subscribers_gained = excluded.subscribers_gained,
         fetched_at = excluded.fetched_at`,
    )
    .run(row);
}

export function upsertChannelAnalytics(row: Omit<ChannelAnalyticsSummaryRow, "fetched_at"> & { fetchedAt: string }): void {
  getDb()
    .prepare(
      `INSERT INTO channel_analytics_summary (
         channel_id, period, period_start, period_end, views, estimated_minutes_watched,
         average_view_duration, average_view_percentage, subscribers_gained, subscribers_lost, fetched_at
       ) VALUES (
         @channel_id, @period, @period_start, @period_end, @views, @estimated_minutes_watched,
         @average_view_duration, @average_view_percentage, @subscribers_gained, @subscribers_lost, @fetchedAt
       )
       ON CONFLICT(channel_id, period) DO UPDATE SET
         period_start = excluded.period_start,
         period_end = excluded.period_end,
         views = excluded.views,
         estimated_minutes_watched = excluded.estimated_minutes_watched,
         average_view_duration = excluded.average_view_duration,
         average_view_percentage = excluded.average_view_percentage,
         subscribers_gained = excluded.subscribers_gained,
         subscribers_lost = excluded.subscribers_lost,
         fetched_at = excluded.fetched_at`,
    )
    .run(row);
}

export function listChannelAnalytics(channelId: string): ChannelAnalyticsSummaryRow[] {
  return getDb()
    .prepare("SELECT * FROM channel_analytics_summary WHERE channel_id = ? ORDER BY period")
    .all(channelId) as ChannelAnalyticsSummaryRow[];
}

export function getVideoAnalytics(videoId: string): VideoAnalyticsRow | null {
  return (
    (getDb().prepare("SELECT * FROM channel_video_analytics WHERE video_id = ?").get(videoId) as
      | VideoAnalyticsRow
      | undefined) ?? null
  );
}

export function saveKnowledge(row: ChannelKnowledgeRow): void {
  getDb()
    .prepare(
      `INSERT INTO channel_knowledge (channel_id, generated_at, document_md, json, video_count, transcript_count)
       VALUES (@channel_id, @generated_at, @document_md, @json, @video_count, @transcript_count)
       ON CONFLICT(channel_id) DO UPDATE SET
         generated_at = excluded.generated_at,
         document_md = excluded.document_md,
         json = excluded.json,
         video_count = excluded.video_count,
         transcript_count = excluded.transcript_count`,
    )
    .run(row);
}

export function getKnowledge(channelId: string): ChannelKnowledgeRow | null {
  return (
    (getDb().prepare("SELECT * FROM channel_knowledge WHERE channel_id = ?").get(channelId) as
      | ChannelKnowledgeRow
      | undefined) ?? null
  );
}

export function parseKnowledgeJson(raw: string): ChannelKnowledgeJson {
  try {
    return ChannelKnowledgeJsonSchema.parse(JSON.parse(raw));
  } catch {
    return EMPTY_CHANNEL_KNOWLEDGE;
  }
}

export function mineChannelId(): string | null {
  const row = getDb().prepare("SELECT id FROM followed_channels WHERE is_mine = 1 LIMIT 1").get() as
    | { id: string }
    | undefined;
  return row?.id ?? null;
}

export function searchMyChannel(query: string, limit: number): Array<{ videoId: string; title: string; snippet: string }> {
  const trimmed = query.trim().slice(0, 200);
  if (!trimmed) return [];
  const mine = mineChannelId();
  if (!mine) return [];
  try {
    const fts = getDb()
      .prepare(
        `SELECT f.video_id AS videoId, v.title AS title,
                snippet(video_knowledge_fts, 2, '', '', '…', 24) AS snippet
         FROM video_knowledge_fts f
         JOIN channel_videos v ON v.video_id = f.video_id
         WHERE video_knowledge_fts MATCH ? AND v.channel_id = ?
         LIMIT ?`,
      )
      .all(ftsQuery(trimmed), mine, limit) as Array<{ videoId: string; title: string; snippet: string }>;
    if (fts.length > 0) return fts;
  } catch {
    // FTS missing or bad query: LIKE fallback below.
  }
  const like = `%${trimmed.replace(/[%_]/g, "")}%`;
  return getDb()
    .prepare(
      `SELECT v.video_id AS videoId, v.title AS title,
              substr(COALESCE(t.summary, t.text, v.description, ''), 1, 180) AS snippet
       FROM channel_videos v
       LEFT JOIN video_transcripts t ON t.video_id = v.video_id
       WHERE v.channel_id = ? AND (v.title LIKE ? OR IFNULL(v.description,'') LIKE ? OR IFNULL(t.summary,'') LIKE ? OR IFNULL(t.text,'') LIKE ?)
       ORDER BY v.view_count DESC
       LIMIT ?`,
    )
    .all(mine, like, like, like, like, limit) as Array<{ videoId: string; title: string; snippet: string }>;
}

function ftsQuery(raw: string): string {
  return raw
    .split(/\s+/)
    .map((token) => token.replace(/["']/g, ""))
    .filter(Boolean)
    .map((token) => `"${token}"`)
    .join(" AND ");
}

function indexTranscript(videoId: string): void {
  const row = getDb()
    .prepare(
      `SELECT v.video_id, v.title, t.summary, t.text
       FROM channel_videos v LEFT JOIN video_transcripts t ON t.video_id = v.video_id
       WHERE v.video_id = ?`,
    )
    .get(videoId) as { video_id: string; title: string; summary: string | null; text: string | null } | undefined;
  if (!row) return;
  try {
    getDb().prepare("DELETE FROM video_knowledge_fts WHERE video_id = ?").run(videoId);
    getDb()
      .prepare("INSERT INTO video_knowledge_fts (video_id, title, summary, body) VALUES (?, ?, ?, ?)")
      .run(videoId, row.title, row.summary ?? "", (row.text ?? "").slice(0, 50_000));
  } catch {
    // FTS optional.
  }
}
