import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import type { ViewSample } from "./performance";
import { insertStatSnapshots, pruneStatSnapshots } from "./stat-snapshots";
import type { ThumbType } from "./thumb-types";
import type { ChannelDetails, ChannelListItem, SyncStatus, VideoDetails } from "./types";

/** Every SQL statement on followed_channels / channel_videos lives here. */

export const MAX_CLASSIFY_ATTEMPTS = 3;

export type ChannelRow = {
  id: string;
  youtube_channel_id: string;
  title: string;
  handle: string | null;
  avatar_url: string | null;
  subscriber_count: number | null;
  is_mine: number;
  median_views: number | null;
  last_synced_at: string | null;
  sync_status: SyncStatus;
  sync_error: string | null;
  playlist_id: string | null;
  backfill_page_token: string | null;
  backfill_done: number;
  /** Where an interrupted newest-first walk (not the first import) resumes. */
  sync_page_token: string | null;
  about: string | null;
  created_at: string;
};

export type VideoRow = {
  video_id: string;
  channel_id: string;
  title: string;
  published_at: string;
  duration_seconds: number;
  view_count: number;
  like_count: number | null;
  thumbnail_url: string;
  stats_updated_at: string;
  description: string | null;
  thumb_type: string | null;
  thumb_type_source: "ai" | "manual" | null;
  classify_attempts: number;
  classify_approved: number;
  swipe_file_id: string | null;
  created_at: string;
};

type ChannelRowWithCount = ChannelRow & { video_count: number };

const PENDING_WHERE = `thumb_type IS NULL AND thumb_type_source IS NULL AND classify_attempts < ${MAX_CLASSIFY_ATTEMPTS}`;

const CHANNEL_WITH_COUNT = `
  SELECT c.*, (SELECT COUNT(*) FROM channel_videos v WHERE v.channel_id = c.id) AS video_count
  FROM followed_channels c
`;

function toChannelListItem(row: ChannelRowWithCount): ChannelListItem {
  return {
    id: row.id,
    youtubeChannelId: row.youtube_channel_id,
    title: row.title,
    handle: row.handle,
    avatarUrl: row.avatar_url,
    subscriberCount: row.subscriber_count,
    isMine: row.is_mine === 1,
    medianViews: row.median_views,
    lastSyncedAt: row.last_synced_at,
    syncStatus: row.sync_status,
    syncError: row.sync_error,
    videoCount: row.video_count,
    createdAt: row.created_at,
  };
}

// ── Channels ────────────────────────────────────────────────────────────────

/** Inserts a followed channel; an already followed YouTube channel is returned untouched. */
export function insertChannel(
  details: ChannelDetails,
  options: { isMine?: boolean; syncStatus?: SyncStatus } = {},
): { channel: ChannelRow; inserted: boolean } {
  const result = getDb()
    .prepare(
      `INSERT INTO followed_channels (id, youtube_channel_id, title, handle, avatar_url, subscriber_count, is_mine, sync_status)
       VALUES (@id, @youtubeChannelId, @title, @handle, @avatarUrl, @subscriberCount, @isMine, @syncStatus)
       ON CONFLICT(youtube_channel_id) DO NOTHING`,
    )
    .run({
      id: uuid(),
      youtubeChannelId: details.youtubeChannelId,
      title: details.title,
      handle: details.handle,
      avatarUrl: details.avatarUrl,
      subscriberCount: details.subscriberCount,
      isMine: options.isMine ? 1 : 0,
      syncStatus: options.syncStatus ?? "idle",
    });
  const channel = getChannelByYoutubeId(details.youtubeChannelId);
  if (!channel) throw new Error(`Followed channel ${details.youtubeChannelId} missing after insert`);
  return { channel, inserted: result.changes > 0 };
}

export function getChannel(id: string): ChannelRow | null {
  return (getDb().prepare("SELECT * FROM followed_channels WHERE id = ?").get(id) as ChannelRow | undefined) ?? null;
}

export function getChannelByYoutubeId(youtubeChannelId: string): ChannelRow | null {
  return (
    (getDb().prepare("SELECT * FROM followed_channels WHERE youtube_channel_id = ?").get(youtubeChannelId) as
      | ChannelRow
      | undefined) ?? null
  );
}

export function channelExists(id: string): boolean {
  return Boolean(getDb().prepare("SELECT 1 FROM followed_channels WHERE id = ?").get(id));
}

export function listChannelItems(): ChannelListItem[] {
  const rows = getDb()
    .prepare(`${CHANNEL_WITH_COUNT} ORDER BY c.is_mine DESC, c.created_at ASC`)
    .all() as ChannelRowWithCount[];
  return rows.map(toChannelListItem);
}

export function getChannelListItem(id: string): ChannelListItem | null {
  const row = getDb().prepare(`${CHANNEL_WITH_COUNT} WHERE c.id = ?`).get(id) as ChannelRowWithCount | undefined;
  return row ? toChannelListItem(row) : null;
}

export function deleteChannel(id: string): boolean {
  return getDb().prepare("DELETE FROM followed_channels WHERE id = ?").run(id).changes > 0;
}

export function updateChannelDetails(id: string, details: ChannelDetails): void {
  getDb()
    .prepare(
      "UPDATE followed_channels SET title = @title, handle = @handle, avatar_url = @avatarUrl, subscriber_count = @subscriberCount, about = @about WHERE id = @id",
    )
    .run({
      id,
      title: details.title,
      handle: details.handle,
      avatarUrl: details.avatarUrl,
      subscriberCount: details.subscriberCount,
      about: details.description ?? null,
    });
}

export function setSyncState(id: string, state: { status: SyncStatus; error?: string | null }): void {
  getDb()
    .prepare("UPDATE followed_channels SET sync_status = ?, sync_error = ? WHERE id = ?")
    .run(state.status, state.error ?? null, id);
}

export function setPlaylistId(id: string, playlistId: string): void {
  getDb().prepare("UPDATE followed_channels SET playlist_id = ? WHERE id = ?").run(playlistId, id);
}

export function setBackfill(id: string, state: { pageToken: string | null; done: boolean }): void {
  getDb()
    .prepare("UPDATE followed_channels SET backfill_page_token = ?, backfill_done = ? WHERE id = ?")
    .run(state.pageToken, state.done ? 1 : 0, id);
}

export function setSyncPageToken(id: string, pageToken: string | null): void {
  getDb().prepare("UPDATE followed_channels SET sync_page_token = ? WHERE id = ?").run(pageToken, id);
}

export function finishSync(id: string, result: { medianViews: number | null; syncedAt: string }): void {
  getDb()
    .prepare(
      "UPDATE followed_channels SET median_views = ?, last_synced_at = ?, sync_status = 'idle', sync_error = NULL WHERE id = ?",
    )
    .run(result.medianViews, result.syncedAt, id);
}

/** Makes `channelId` the only « Ma chaîne » (null: none). Returns whether anything changed. */
export function setMineChannel(channelId: string | null): boolean {
  const db = getDb();
  const mineIds = () =>
    (db.prepare("SELECT id FROM followed_channels WHERE is_mine = 1 ORDER BY id").all() as { id: string }[])
      .map((row) => row.id)
      .join(",");
  const before = mineIds();
  db.transaction(() => {
    db.prepare("UPDATE followed_channels SET is_mine = 0 WHERE is_mine = 1 AND id IS NOT ?").run(channelId);
    if (channelId) db.prepare("UPDATE followed_channels SET is_mine = 1 WHERE id = ?").run(channelId);
  })();
  return mineIds() !== before;
}

export function allChannelIds(): string[] {
  return (
    getDb().prepare("SELECT id FROM followed_channels ORDER BY is_mine DESC, created_at ASC").all() as { id: string }[]
  ).map((row) => row.id);
}

export function listFollowedForPoll(): Array<{ id: string; youtubeChannelId: string; playlistId: string | null }> {
  return getDb()
    .prepare(
      `SELECT id, youtube_channel_id AS youtubeChannelId, playlist_id AS playlistId
       FROM followed_channels
       ORDER BY is_mine DESC, created_at ASC`,
    )
    .all() as Array<{ id: string; youtubeChannelId: string; playlistId: string | null }>;
}

/** Never synced first, then the oldest sync; « Ma chaîne » before the others. */
export function staleChannelIds(cutoffIso: string): string[] {
  return (
    getDb()
      .prepare(
        `SELECT id FROM followed_channels
         WHERE last_synced_at IS NULL OR last_synced_at < ?
         ORDER BY is_mine DESC, last_synced_at IS NOT NULL, last_synced_at ASC`,
      )
      .all(cutoffIso) as { id: string }[]
  ).map((row) => row.id);
}

export function syncingChannelIds(): string[] {
  return (
    getDb().prepare("SELECT id FROM followed_channels WHERE sync_status = 'syncing'").all() as { id: string }[]
  ).map((row) => row.id);
}

// ── Videos ──────────────────────────────────────────────────────────────────

export function knownVideoIds(channelId: string): Set<string> {
  const rows = getDb().prepare("SELECT video_id FROM channel_videos WHERE channel_id = ?").all(channelId) as {
    video_id: string;
  }[];
  return new Set(rows.map((row) => row.video_id));
}

/** Inserts new videos; known ones get fresh stats. The thumbnail type is never touched here. */
export function upsertVideos(channelId: string, videos: readonly VideoDetails[], stampIso: string): void {
  const db = getDb();
  const statement = db.prepare(
    `INSERT INTO channel_videos
       (video_id, channel_id, title, published_at, duration_seconds, view_count, like_count, thumbnail_url, description, stats_updated_at)
     VALUES (@videoId, @channelId, @title, @publishedAt, @durationSeconds, @viewCount, @likeCount, @thumbnailUrl, @description, @stamp)
     ON CONFLICT(video_id) DO UPDATE SET
       title = excluded.title,
       duration_seconds = excluded.duration_seconds,
       view_count = excluded.view_count,
       like_count = excluded.like_count,
       thumbnail_url = excluded.thumbnail_url,
       description = excluded.description,
       stats_updated_at = excluded.stats_updated_at`,
  );
  db.transaction(() => {
    for (const video of videos) {
      statement.run({
        videoId: video.videoId,
        channelId,
        title: video.title,
        publishedAt: video.publishedAt,
        durationSeconds: video.durationSeconds,
        viewCount: video.viewCount,
        likeCount: video.likeCount,
        thumbnailUrl: video.thumbnailUrl,
        description: video.description ?? "",
        stamp: stampIso,
      });
      insertStatSnapshots([
        { videoId: video.videoId, capturedAt: stampIso, viewCount: video.viewCount, likeCount: video.likeCount },
      ]);
    }
  })();
  pruneStatSnapshots(new Date(stampIso));
}

export function videoIdsToRefresh(channelId: string, stampIso: string): string[] {
  return (
    getDb()
      .prepare(
        "SELECT video_id FROM channel_videos WHERE channel_id = ? AND stats_updated_at < ? ORDER BY published_at DESC",
      )
      .all(channelId, stampIso) as { video_id: string }[]
  ).map((row) => row.video_id);
}

export function updateVideoStats(videos: readonly VideoDetails[], stampIso: string): void {
  const db = getDb();
  const statement = db.prepare(
    `UPDATE channel_videos SET
       title = @title, duration_seconds = @durationSeconds, view_count = @viewCount,
       like_count = @likeCount, thumbnail_url = @thumbnailUrl, description = @description, stats_updated_at = @stamp
     WHERE video_id = @videoId`,
  );
  db.transaction(() => {
    for (const video of videos) {
      statement.run({
        videoId: video.videoId,
        title: video.title,
        durationSeconds: video.durationSeconds,
        viewCount: video.viewCount,
        likeCount: video.likeCount,
        thumbnailUrl: video.thumbnailUrl,
        description: video.description ?? "",
        stamp: stampIso,
      });
      insertStatSnapshots([
        { videoId: video.videoId, capturedAt: stampIso, viewCount: video.viewCount, likeCount: video.likeCount },
      ]);
    }
  })();
  pruneStatSnapshots(new Date(stampIso));
}

export function deleteVideos(videoIds: readonly string[]): void {
  const db = getDb();
  const statement = db.prepare("DELETE FROM channel_videos WHERE video_id = ?");
  db.transaction(() => {
    for (const videoId of videoIds) statement.run(videoId);
  })();
}

export function viewSamples(channelId: string): ViewSample[] {
  return getDb()
    .prepare("SELECT published_at AS publishedAt, view_count AS viewCount FROM channel_videos WHERE channel_id = ?")
    .all(channelId) as ViewSample[];
}

export function getVideo(videoId: string): VideoRow | null {
  return (getDb().prepare("SELECT * FROM channel_videos WHERE video_id = ?").get(videoId) as VideoRow | undefined) ?? null;
}

export function setManualThumbType(videoId: string, type: ThumbType): boolean {
  return (
    getDb()
      .prepare("UPDATE channel_videos SET thumb_type = ?, thumb_type_source = 'manual' WHERE video_id = ?")
      .run(type, videoId).changes > 0
  );
}

/** Only writes a thumbnail nobody classified yet — a manual type always wins. */
export function setAiThumbType(videoId: string, type: ThumbType): boolean {
  return (
    getDb()
      .prepare(
        "UPDATE channel_videos SET thumb_type = ?, thumb_type_source = 'ai' WHERE video_id = ? AND thumb_type_source IS NULL",
      )
      .run(type, videoId).changes > 0
  );
}

export function incrementClassifyAttempts(videoId: string): void {
  getDb().prepare("UPDATE channel_videos SET classify_attempts = classify_attempts + 1 WHERE video_id = ?").run(videoId);
}

export function setVideoSwipeFile(videoId: string, swipeFileId: string): void {
  getDb().prepare("UPDATE channel_videos SET swipe_file_id = ? WHERE video_id = ?").run(swipeFileId, videoId);
}

// ── Classification queue ────────────────────────────────────────────────────

export function countPendingClassification(): { pending: number; unapproved: number } {
  return getDb()
    .prepare(
      `SELECT COUNT(*) AS pending, COALESCE(SUM(CASE WHEN classify_approved = 0 THEN 1 ELSE 0 END), 0) AS unapproved
       FROM channel_videos WHERE ${PENDING_WHERE}`,
    )
    .get() as { pending: number; unapproved: number };
}

export function approvePendingClassification(): number {
  return getDb()
    .prepare(`UPDATE channel_videos SET classify_approved = 1 WHERE ${PENDING_WHERE} AND classify_approved = 0`)
    .run().changes;
}

export function nextClassificationBatch(limit: number): string[] {
  return (
    getDb()
      .prepare(
        `SELECT video_id FROM channel_videos WHERE ${PENDING_WHERE} AND classify_approved = 1
         ORDER BY published_at DESC LIMIT ?`,
      )
      .all(limit) as { video_id: string }[]
  ).map((row) => row.video_id);
}
