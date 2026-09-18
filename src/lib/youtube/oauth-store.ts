import { getDb } from "@/lib/db";
import { OAUTH_STATE_TTL_MS } from "./oauth";
import type { IngestStatus, IngestStep } from "./knowledge-schema";

export const YOUTUBE_OAUTH_ROW_ID = "default";
export const API_KEY_INGEST_SCOPE = "youtube-api-key";

export type YoutubeOauthRow = {
  id: string;
  channel_youtube_id: string | null;
  channel_title: string | null;
  channel_handle: string | null;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: number | null;
  scopes: string;
  connected_at: string;
  last_ingest_at: string | null;
  ingest_status: IngestStatus;
  ingest_error: string | null;
  ingest_step: IngestStep | null;
  videos_total: number;
  videos_done: number;
  transcripts_done: number;
  transcripts_failed: number;
  analysis_done: number;
};

export function saveOauthState(state: string, origin: string, now = new Date()): void {
  const db = getDb();
  db.prepare("DELETE FROM youtube_oauth_state WHERE created_at < ?").run(
    new Date(now.getTime() - OAUTH_STATE_TTL_MS).toISOString(),
  );
  db.prepare("INSERT INTO youtube_oauth_state (state, origin, created_at) VALUES (?, ?, ?)").run(
    state,
    origin,
    now.toISOString(),
  );
}

export function consumeOauthState(state: string, now = new Date()): string | null {
  const row = getDb()
    .prepare("SELECT origin, created_at FROM youtube_oauth_state WHERE state = ?")
    .get(state) as { origin: string; created_at: string } | undefined;
  getDb().prepare("DELETE FROM youtube_oauth_state WHERE state = ?").run(state);
  if (!row) return null;
  if (now.getTime() - Date.parse(row.created_at) > OAUTH_STATE_TTL_MS) return null;
  return row.origin;
}

export function getOauth(): YoutubeOauthRow | null {
  return (getDb().prepare("SELECT * FROM youtube_oauth WHERE id = ?").get(YOUTUBE_OAUTH_ROW_ID) as YoutubeOauthRow | undefined) ?? null;
}

/** Progress row for ingest via the YouTube Data API key (no Google refresh token). */
export function ensureApiKeySession(now = new Date()): void {
  if (getOauth()) return;
  upsertOauth({
    refreshToken: "",
    accessToken: "",
    expiresAtMs: 0,
    scopes: API_KEY_INGEST_SCOPE,
    connectedAt: now.toISOString(),
  });
}

export function upsertOauth(input: {
  refreshToken: string;
  accessToken: string;
  expiresAtMs: number;
  scopes: string;
  connectedAt: string;
  channelYoutubeId?: string | null;
  channelTitle?: string | null;
  channelHandle?: string | null;
}): void {
  getDb()
    .prepare(
      `INSERT INTO youtube_oauth (
         id, channel_youtube_id, channel_title, channel_handle, refresh_token, access_token,
         access_token_expires_at, scopes, connected_at, ingest_status
       ) VALUES (
         @id, @channelYoutubeId, @channelTitle, @channelHandle, @refreshToken, @accessToken,
         @expiresAtMs, @scopes, @connectedAt, 'idle'
       )
       ON CONFLICT(id) DO UPDATE SET
         channel_youtube_id = excluded.channel_youtube_id,
         channel_title = excluded.channel_title,
         channel_handle = excluded.channel_handle,
         refresh_token = excluded.refresh_token,
         access_token = excluded.access_token,
         access_token_expires_at = excluded.access_token_expires_at,
         scopes = excluded.scopes,
         connected_at = excluded.connected_at`,
    )
    .run({
      id: YOUTUBE_OAUTH_ROW_ID,
      channelYoutubeId: input.channelYoutubeId ?? null,
      channelTitle: input.channelTitle ?? null,
      channelHandle: input.channelHandle ?? null,
      refreshToken: input.refreshToken,
      accessToken: input.accessToken,
      expiresAtMs: input.expiresAtMs,
      scopes: input.scopes,
      connectedAt: input.connectedAt,
    });
}

export function updateAccessToken(accessToken: string, expiresAtMs: number): void {
  getDb()
    .prepare("UPDATE youtube_oauth SET access_token = ?, access_token_expires_at = ? WHERE id = ?")
    .run(accessToken, expiresAtMs, YOUTUBE_OAUTH_ROW_ID);
}

export function setOauthChannel(details: {
  youtubeChannelId: string;
  title: string;
  handle: string | null;
}): void {
  getDb()
    .prepare(
      "UPDATE youtube_oauth SET channel_youtube_id = ?, channel_title = ?, channel_handle = ? WHERE id = ?",
    )
    .run(details.youtubeChannelId, details.title, details.handle, YOUTUBE_OAUTH_ROW_ID);
}

export function setIngestProgress(patch: {
  status?: IngestStatus;
  error?: string | null;
  step?: IngestStep | null;
  videosTotal?: number;
  videosDone?: number;
  transcriptsDone?: number;
  transcriptsFailed?: number;
  analysisDone?: boolean;
  lastIngestAt?: string | null;
}): void {
  const current = getOauth();
  if (!current) return;
  getDb()
    .prepare(
      `UPDATE youtube_oauth SET
         ingest_status = @status,
         ingest_error = @error,
         ingest_step = @step,
         videos_total = @videosTotal,
         videos_done = @videosDone,
         transcripts_done = @transcriptsDone,
         transcripts_failed = @transcriptsFailed,
         analysis_done = @analysisDone,
         last_ingest_at = @lastIngestAt
       WHERE id = @id`,
    )
    .run({
      id: YOUTUBE_OAUTH_ROW_ID,
      status: patch.status ?? current.ingest_status,
      error: patch.error === undefined ? current.ingest_error : patch.error,
      step: patch.step === undefined ? current.ingest_step : patch.step,
      videosTotal: patch.videosTotal ?? current.videos_total,
      videosDone: patch.videosDone ?? current.videos_done,
      transcriptsDone: patch.transcriptsDone ?? current.transcripts_done,
      transcriptsFailed: patch.transcriptsFailed ?? current.transcripts_failed,
      analysisDone: patch.analysisDone === undefined ? current.analysis_done : patch.analysisDone ? 1 : 0,
      lastIngestAt: patch.lastIngestAt === undefined ? current.last_ingest_at : patch.lastIngestAt,
    });
}

export function deleteOauth(): void {
  getDb().prepare("DELETE FROM youtube_oauth WHERE id = ?").run(YOUTUBE_OAUTH_ROW_ID);
}
