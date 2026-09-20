import { getDb } from "@/lib/db";

export const SNAPSHOT_RETENTION_DAYS = 30;
export const SNAPSHOT_YOUNG_DAYS = 7;
export const SNAPSHOT_YOUNG_INTERVAL_MS = 4 * 60 * 60 * 1000;

export type StatSnapshotPoint = { capturedAt: string; viewCount: number; likeCount: number | null };

export type SnapshotPair = { latest: StatSnapshotPoint; previous: StatSnapshotPoint | null };

export type SnapshotRow = {
  videoId: string;
  capturedAt: string;
  viewCount: number;
  likeCount: number | null;
};

export function insertStatSnapshots(rows: readonly SnapshotRow[]): void {
  if (rows.length === 0) return;
  const statement = getDb().prepare(
    `INSERT OR IGNORE INTO video_stat_snapshots (video_id, captured_at, view_count, like_count)
     VALUES (@videoId, @capturedAt, @viewCount, @likeCount)`,
  );
  for (const row of rows) statement.run(row);
}

export function latestSnapshotPairs(videoIds: readonly string[]): Map<string, SnapshotPair> {
  const pairs = new Map<string, SnapshotPair>();
  if (videoIds.length === 0) return pairs;
  const placeholders = videoIds.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT video_id AS videoId, captured_at AS capturedAt, view_count AS viewCount, like_count AS likeCount
       FROM video_stat_snapshots
       WHERE video_id IN (${placeholders})
       ORDER BY captured_at DESC`,
    )
    .all(...videoIds) as Array<{ videoId: string; capturedAt: string; viewCount: number; likeCount: number | null }>;
  for (const row of rows) {
    const point: StatSnapshotPoint = { capturedAt: row.capturedAt, viewCount: row.viewCount, likeCount: row.likeCount };
    const existing = pairs.get(row.videoId);
    if (!existing) pairs.set(row.videoId, { latest: point, previous: null });
    else if (!existing.previous) existing.previous = point;
  }
  return pairs;
}

export function youngVideoIdsDueForSnapshot(now: Date, channelId?: string): string[] {
  const youngStart = new Date(now.getTime() - SNAPSHOT_YOUNG_DAYS * 86_400_000).toISOString();
  const dueBefore = new Date(now.getTime() - SNAPSHOT_YOUNG_INTERVAL_MS).toISOString();
  const params: string[] = [youngStart, dueBefore];
  const channelClause = channelId ? " AND v.channel_id = ?" : "";
  if (channelId) params.push(channelId);
  const rows = getDb()
    .prepare(
      `SELECT v.video_id AS videoId
       FROM channel_videos v
       WHERE v.published_at >= ?
         AND (
           NOT EXISTS (SELECT 1 FROM video_stat_snapshots s WHERE s.video_id = v.video_id)
           OR (SELECT MAX(s.captured_at) FROM video_stat_snapshots s WHERE s.video_id = v.video_id) < ?
         )
         ${channelClause}
       ORDER BY v.published_at DESC`,
    )
    .all(...params) as { videoId: string }[];
  return rows.map((row) => row.videoId);
}

export function pruneStatSnapshots(now: Date): number {
  const cutoff = new Date(now.getTime() - SNAPSHOT_RETENTION_DAYS * 86_400_000).toISOString();
  return getDb().prepare("DELETE FROM video_stat_snapshots WHERE captured_at < ?").run(cutoff).changes;
}
