import { getDb } from "@/lib/db";
import { recentCutoffIso, videoPerformance } from "./performance";
import { UNCLASSIFIED_FILTER, isThumbType, summarizeTypes, type TypeSummaryRow } from "./thumb-types";
import type { VideoListItem, VideoListResponse, VideoPeriod, VideoQuery } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS: Record<Exclude<VideoPeriod, "all">, number> = { "30d": 30, "12m": 365 };

type VideoQueryRow = {
  video_id: string;
  channel_id: string;
  channel_title: string;
  title: string;
  published_at: string;
  duration_seconds: number;
  view_count: number;
  thumbnail_url: string;
  thumb_type: string | null;
  thumb_type_source: "ai" | "manual" | null;
  median_views: number | null;
};

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

const ORDER_BY: Record<VideoQuery["sort"], string> = {
  score: "score DESC NULLS LAST, v.published_at DESC",
  views: "v.view_count DESC, v.published_at DESC",
  date: "v.published_at DESC",
};

export function listVideos(query: VideoQuery, now: Date = new Date()): VideoListResponse {
  const where: string[] = [];
  const params: Record<string, string | number> = { recentCutoff: recentCutoffIso(now) };

  if (query.channelId) {
    where.push("v.channel_id = @channelId");
    params.channelId = query.channelId;
  }
  if (query.period !== "all") {
    where.push("v.published_at >= @periodStart");
    params.periodStart = new Date(now.getTime() - PERIOD_DAYS[query.period] * DAY_MS).toISOString();
  }
  if (query.q) {
    where.push("v.title LIKE @q ESCAPE '\\'");
    params.q = `%${escapeLike(query.q)}%`;
  }
  if (query.types.length > 0) {
    const clauses: string[] = [];
    const named = query.types.filter(isThumbType);
    named.forEach((type, index) => {
      params[`type${index}`] = type;
    });
    if (named.length > 0) clauses.push(`v.thumb_type IN (${named.map((_, index) => `@type${index}`).join(", ")})`);
    if (query.types.includes(UNCLASSIFIED_FILTER)) clauses.push("v.thumb_type IS NULL");
    where.push(`(${clauses.join(" OR ")})`);
  }

  const from = `FROM channel_videos v JOIN followed_channels c ON c.id = v.channel_id ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`;
  const db = getDb();
  const { total } = db.prepare(`SELECT COUNT(*) AS total ${from}`).get(params) as { total: number };
  const rows = db
    .prepare(
      `SELECT v.video_id, v.channel_id, c.title AS channel_title, v.title, v.published_at, v.duration_seconds,
              v.view_count, v.thumbnail_url, v.thumb_type, v.thumb_type_source, c.median_views,
              CASE WHEN c.median_views > 0 AND v.published_at <= @recentCutoff
                   THEN CAST(v.view_count AS REAL) / c.median_views END AS score
       ${from}
       ORDER BY ${ORDER_BY[query.sort]}
       LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit: query.limit, offset: query.offset }) as VideoQueryRow[];

  const items: VideoListItem[] = rows.map((row) => ({
    videoId: row.video_id,
    channelId: row.channel_id,
    channelTitle: row.channel_title,
    title: row.title,
    publishedAt: row.published_at,
    durationSeconds: row.duration_seconds,
    viewCount: row.view_count,
    thumbnailUrl: row.thumbnail_url,
    thumbType: isThumbType(row.thumb_type) ? row.thumb_type : null,
    thumbTypeSource: row.thumb_type_source,
    performance: videoPerformance({ publishedAt: row.published_at, viewCount: row.view_count }, row.median_views, now),
  }));
  return { items, total, offset: query.offset, limit: query.limit };
}

/** « Les types qui marchent » for every channel ("all"), « Ma chaîne » ("mine") or one followed channel id. */
export function typesSummary(scope: string, now: Date = new Date()): TypeSummaryRow[] {
  const where = ["v.thumb_type IS NOT NULL"];
  const params: Record<string, string> = {};
  if (scope === "mine") {
    where.push("c.is_mine = 1");
  } else if (scope !== "all") {
    where.push("c.id = @channelId");
    params.channelId = scope;
  }
  const rows = getDb()
    .prepare(
      `SELECT v.video_id, v.title, v.thumbnail_url, v.thumb_type, v.view_count, v.published_at, c.median_views
       FROM channel_videos v JOIN followed_channels c ON c.id = v.channel_id
       WHERE ${where.join(" AND ")}`,
    )
    .all(params) as Array<Pick<VideoQueryRow, "video_id" | "title" | "thumbnail_url" | "thumb_type" | "view_count" | "published_at" | "median_views">>;

  return summarizeTypes(
    rows.flatMap((row) => {
      if (!isThumbType(row.thumb_type)) return [];
      const performance = videoPerformance({ publishedAt: row.published_at, viewCount: row.view_count }, row.median_views, now);
      return [
        {
          videoId: row.video_id,
          title: row.title,
          thumbnailUrl: row.thumbnail_url,
          thumbType: row.thumb_type,
          score: performance.kind === "scored" ? performance.score : null,
        },
      ];
    }),
  );
}
