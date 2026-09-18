import { getDb } from "@/lib/db";

const DAY_MS = 24 * 60 * 60 * 1000;

type Row = { median_views: number | null; sample_count: number; fetched_at: string };

export function getCachedMedian(youtubeChannelId: string, now: Date): { medianViews: number | null; sampleCount: number } | null {
  const row = getDb()
    .prepare("SELECT median_views, sample_count, fetched_at FROM channel_median_cache WHERE youtube_channel_id = ?")
    .get(youtubeChannelId) as Row | undefined;
  if (!row) return null;
  const fetched = Date.parse(row.fetched_at);
  if (Number.isNaN(fetched) || now.getTime() - fetched >= DAY_MS) return null;
  return { medianViews: row.median_views, sampleCount: row.sample_count };
}

export function setCachedMedian(
  youtubeChannelId: string,
  medianViews: number | null,
  sampleCount: number,
  now: Date,
): void {
  getDb()
    .prepare(
      `INSERT INTO channel_median_cache (youtube_channel_id, median_views, sample_count, fetched_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(youtube_channel_id) DO UPDATE SET
         median_views = excluded.median_views,
         sample_count = excluded.sample_count,
         fetched_at = excluded.fetched_at`,
    )
    .run(youtubeChannelId, medianViews, sampleCount, now.toISOString());
}
