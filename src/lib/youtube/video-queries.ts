import { getDb } from "@/lib/db";
import { jevClickNouls, jevTrendJudgments, type TrendJudgment } from "@/lib/typesafe/rerank-titles";
import { ageInDays, recentCutoffIso, videoPerformance } from "./performance";
import { latestSnapshotPairs } from "./stat-snapshots";
import { applyJevNudge, compareSwipeRank, swipeRankKey, SWIPE_RERANK_TOP } from "./swipe-rank";
import { UNCLASSIFIED_FILTER, isThumbType } from "./thumb-types";
import { classifyVideoFormat, isVideoFormat } from "./video-formats";
import { summarizeThemes, type ThemeSummaryInput } from "./video-themes";
import {
  TREND_WINDOW_DAYS,
  buildTrendSubject,
  pickTrendVideos,
  scoreTrendVideos,
  type WorkingSubjectVideo,
} from "./working-subject";
import {
  VIDEO_MAX_LIMIT,
  VIDEO_PAGE_SIZE,
  type TypesSummaryResponse,
  type VideoListItem,
  type VideoListResponse,
  type VideoPeriod,
  type VideoQuery,
  type WorkingSubjectResponse,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS: Record<Exclude<VideoPeriod, "all">, number> = { "7d": 7, "30d": 30, "6m": 183, "12m": 365 };

type VideoQueryRow = {
  video_id: string;
  channel_id: string;
  channel_title: string;
  title: string;
  description: string | null;
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

/** Integer in [min, max]; `fallback` when not a finite number. */
function clampNumber(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function listVideos(rawQuery: VideoQuery, now: Date = new Date()): VideoListResponse {
  // The route already parses these; clamping again keeps any other caller from sending LIMIT -1 (no limit).
  const query: VideoQuery = {
    ...rawQuery,
    limit: clampNumber(rawQuery.limit, VIDEO_PAGE_SIZE, 1, VIDEO_MAX_LIMIT),
    offset: clampNumber(rawQuery.offset, 0, 0, Number.MAX_SAFE_INTEGER),
  };
  const where: string[] = [];
  const params: Record<string, string | number> = { recentCutoff: recentCutoffIso(now) };

  if (query.channelId) {
    where.push("v.channel_id = @channelId");
    params.channelId = query.channelId;
  }
  if (query.mine) where.push("c.is_mine = 1");
  if (query.period !== "all") {
    where.push("v.published_at >= @periodStart");
    params.periodStart = new Date(now.getTime() - PERIOD_DAYS[query.period] * DAY_MS).toISOString();
  }
  if (query.q) {
    where.push("(v.title LIKE @q ESCAPE '\\' OR IFNULL(v.description, '') LIKE @q ESCAPE '\\')");
    params.q = `%${escapeLike(query.q)}%`;
  }
  if (query.videoIds && query.videoIds.length > 0) {
    query.videoIds.forEach((videoId, index) => {
      params[`vid${index}`] = videoId;
    });
    where.push(`v.video_id IN (${query.videoIds.map((_, index) => `@vid${index}`).join(", ")})`);
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
  const select = `SELECT v.video_id, v.channel_id, c.title AS channel_title, v.title, v.description, v.published_at, v.duration_seconds,
              v.view_count, v.thumbnail_url, v.thumb_type, v.thumb_type_source, c.median_views
       ${from}`;

  const needsJsPage = query.sort === "score" || Boolean(query.format);
  const rows = needsJsPage
    ? (db.prepare(select).all(params) as VideoQueryRow[])
    : (db
        .prepare(`${select} ORDER BY ${ORDER_BY[query.sort]} LIMIT @limit OFFSET @offset`)
        .all({ ...params, limit: query.limit, offset: query.offset }) as VideoQueryRow[]);

  const toItem = (row: VideoQueryRow): VideoListItem => ({
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
    description: row.description ?? "",
  });

  const matchesFormat = (item: VideoListItem): boolean => {
    if (!query.format) return true;
    return classifyVideoFormat(item.title, item.description, item.durationSeconds) === query.format;
  };

  const recentTraction = (item: VideoListItem): number => (item.performance.kind === "recent" ? item.performance.viewsPerDay : 0);

  const bySwipeThenTraction = (left: VideoListItem, right: VideoListItem): number => {
    const leftKey = swipeRankKey({
      score: left.performance.kind === "scored" ? left.performance.score : null,
      ageDays: ageInDays(left.publishedAt, now),
      viewCount: left.viewCount,
    });
    const rightKey = swipeRankKey({
      score: right.performance.kind === "scored" ? right.performance.score : null,
      ageDays: ageInDays(right.publishedAt, now),
      viewCount: right.viewCount,
    });
    const byRank = compareSwipeRank(leftKey, rightKey);
    if (byRank !== 0) return byRank;
    const byTraction = recentTraction(right) - recentTraction(left);
    if (byTraction !== 0) return byTraction;
    return Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
  };

  if (!needsJsPage) {
    return { items: rows.map(toItem), total, offset: query.offset, limit: query.limit };
  }

  const filtered = rows.map(toItem).filter(matchesFormat);
  const ordered =
    query.sort === "score"
      ? filtered.sort(bySwipeThenTraction)
      : query.sort === "views"
        ? filtered.sort((left, right) => right.viewCount - left.viewCount || Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
        : filtered.sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));

  return {
    items: ordered.slice(query.offset, query.offset + query.limit),
    total: query.format ? filtered.length : total,
    offset: query.offset,
    limit: query.limit,
  };
}

type ThemeSummaryQueryRow = {
  video_id: string;
  channel_id: string;
  channel_title: string;
  title: string;
  description: string | null;
  thumbnail_url: string;
  view_count: number;
  published_at: string;
  median_views: number | null;
};

function followedJevQuery(scope: string, channelTitles: readonly string[]): string {
  const unique = [...new Set(channelTitles.map((title) => title.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
  if (unique.length === 1) return unique[0]!;
  if (scope === "mine") return unique[0] ?? "Ma chaîne";
  if (scope !== "all" && unique[0]) return unique[0];
  return unique.length > 0 ? unique.slice(0, 4).join(", ") : "chaînes YouTube suivies";
}

async function nudgeFollowedTitles(query: string, videos: ThemeSummaryInput[]): Promise<boolean> {
  const shortlist = videos
    .filter((video) => video.rank != null)
    .sort((left, right) => {
      const byRank = compareSwipeRank(left.rank ?? null, right.rank ?? null);
      if (byRank !== 0) return byRank;
      return left.videoId.localeCompare(right.videoId);
    });
  if (shortlist.length === 0) return false;
  const nouls = await jevClickNouls(
    query,
    shortlist.map((video) => ({ videoId: video.videoId, title: video.title })),
    "followed",
  );
  if (nouls.size === 0) return false;
  for (const video of videos) {
    video.rank = applyJevNudge(video.rank ?? null, nouls.get(video.videoId));
  }
  return true;
}

/**
 * Thematic « idées qui marchent » for every channel ("all"), « Ma chaîne » ("mine")
 * or one followed channel id. Topics come from title + description. Swipe rank
 * first, then the same TypeSafe Jev title nudge as keyword search (text only).
 */
export async function typesSummary(scope: string, now: Date = new Date()): Promise<TypesSummaryResponse> {
  const where: string[] = [];
  const params: Record<string, string> = {};
  if (scope === "mine") {
    where.push("c.is_mine = 1");
  } else if (scope !== "all") {
    where.push("c.id = @channelId");
    params.channelId = scope;
  }
  const rows = getDb()
    .prepare(
      `SELECT v.video_id, v.channel_id, v.title, v.description, v.thumbnail_url, v.view_count, v.published_at,
              c.median_views, c.title AS channel_title
       FROM channel_videos v JOIN followed_channels c ON c.id = v.channel_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`,
    )
    .all(params) as ThemeSummaryQueryRow[];

  if (rows.length === 0) return { rows: [], jevUsed: false };

  const videos: ThemeSummaryInput[] = rows.map((row) => {
    const performance = videoPerformance({ publishedAt: row.published_at, viewCount: row.view_count }, row.median_views, now);
    const score = performance.kind === "scored" ? performance.score : null;
    return {
      videoId: row.video_id,
      channelId: row.channel_id,
      channelTitle: row.channel_title,
      title: row.title,
      description: row.description,
      thumbnailUrl: row.thumbnail_url,
      publishedAt: row.published_at,
      score,
      rank: swipeRankKey({
        score,
        ageDays: ageInDays(row.published_at, now),
        viewCount: row.view_count,
      }),
    };
  });

  const jevUsed = await nudgeFollowedTitles(
    followedJevQuery(
      scope,
      rows.map((row) => row.channel_title),
    ),
    videos,
  );
  return { rows: summarizeThemes(videos, now), jevUsed };
}

type WorkingSubjectQueryRow = ThemeSummaryQueryRow & { duration_seconds: number; thumb_type: string | null; thumb_type_source: "ai" | "manual" | null };

/**
 * Top performing followed long-form videos in the last 7 days. Code ranks by
 * swipe / ×N; Shorts and sous-performers are out. TypeSafe Choice+Score may
 * label format and nudge the shortlist afterwards.
 */
export async function workingSubject(now: Date = new Date()): Promise<WorkingSubjectResponse> {
  const params = { periodStart: new Date(now.getTime() - TREND_WINDOW_DAYS * DAY_MS).toISOString() };
  const rows = getDb()
    .prepare(
      `SELECT v.video_id, v.channel_id, v.title, v.description, v.thumbnail_url, v.view_count, v.published_at,
              v.duration_seconds, v.thumb_type, v.thumb_type_source, c.median_views, c.title AS channel_title
       FROM channel_videos v JOIN followed_channels c ON c.id = v.channel_id
       WHERE v.published_at >= @periodStart`,
    )
    .all(params) as WorkingSubjectQueryRow[];

  const pairs = latestSnapshotPairs(rows.map((row) => row.video_id));
  const pool: WorkingSubjectVideo[] = rows.map((row) => ({
    videoId: row.video_id,
    channelId: row.channel_id,
    channelTitle: row.channel_title,
    title: row.title,
    description: row.description,
    publishedAt: row.published_at,
    viewCount: row.view_count,
    thumbnailUrl: row.thumbnail_url,
    durationSeconds: row.duration_seconds,
    medianViews: row.median_views,
    snapshots: pairs.get(row.video_id) ?? null,
  }));

  const qualified = scoreTrendVideos(pool, now);
  const shortlist = pickTrendVideos(qualified, SWIPE_RERANK_TOP);
  let judgments = new Map<string, TrendJudgment>();
  try {
    judgments = await jevTrendJudgments(
      shortlist.map((hit) => ({
        videoId: hit.videoId,
        title: hit.title,
        description: hit.description,
        durationSeconds: hit.durationSeconds,
        overperformance: hit.overperformance,
        viewsPerHour: hit.viewsPerHour,
        velocityKind: hit.velocityKind,
      })),
    );
  } catch {
    judgments = new Map();
  }
  const jevUsed = judgments.size > 0;
  for (const hit of qualified) {
    const judged = judgments.get(hit.videoId);
    if (judged) {
      hit.formatId = judged.formatId;
      hit.jevNote = judged.note;
      const nudged = applyJevNudge(hit.rank, judged.score01);
      if (nudged !== null) hit.rank = nudged;
    } else {
      hit.formatId = classifyVideoFormat(hit.title, hit.description, hit.durationSeconds);
    }
  }

  const suggested = pickTrendVideos(qualified.filter((hit) => hit.formatId !== "shorts"));
  const videos: VideoListItem[] = suggested.map((video) => {
    const row = rows.find((item) => item.video_id === video.videoId)!;
    return {
      videoId: video.videoId,
      channelId: video.channelId,
      channelTitle: video.channelTitle,
      title: video.title,
      publishedAt: video.publishedAt,
      durationSeconds: video.durationSeconds,
      viewCount: video.viewCount,
      thumbnailUrl: video.thumbnailUrl,
      thumbType: isThumbType(row.thumb_type) ? row.thumb_type : null,
      thumbTypeSource: row.thumb_type_source,
      performance: videoPerformance({ publishedAt: video.publishedAt, viewCount: video.viewCount }, video.medianViews, now),
      description: video.description ?? "",
      overperformance: video.overperformance,
      viewsPerHour: video.viewsPerHour,
      velocityKind: video.velocityKind,
      formatId: isVideoFormat(video.formatId) ? video.formatId : classifyVideoFormat(video.title, video.description, video.durationSeconds),
      jevNote: video.jevNote ?? null,
    };
  });

  return { period: "7d", subject: buildTrendSubject(suggested), videos, jevUsed };
}
