import { isVideoFormat, type VideoFormatId } from "./video-formats";
import type { VideoPerformance } from "./performance";
import {
  UNCLASSIFIED_FILTER,
  isThumbType,
  type ThumbType,
  type ThumbTypeFilter,
} from "./thumb-types";
import type { ThemeSummaryRow } from "./video-themes";
import type { WhyCategoryId, WhyHoldBand } from "./why-categories";

/**
 * Shapes and constants shared by the followed-channels routes and the UI.
 * Client-safe: no database or Node import here.
 */

export const QUOTA_SYNC_ERROR = "Quota YouTube atteint — reprise demain";
export const MISSING_YOUTUBE_KEY_ERROR = "Ajoute ta clé YouTube dans Réglages → Connexions";

export const VIDEO_SORTS = ["score", "views", "date"] as const;
export type VideoSort = (typeof VIDEO_SORTS)[number];

export const VIDEO_PERIODS = ["7d", "30d", "6m", "12m", "all"] as const;
export type VideoPeriod = (typeof VIDEO_PERIODS)[number];

/** Periods for « Sujet qui marche en ce moment » — user picks one. */
export const WORKING_PERIODS = ["7d", "30d", "6m"] as const;
export type WorkingPeriod = (typeof WORKING_PERIODS)[number];

export const WORKING_PERIOD_LABELS: Record<WorkingPeriod, string> = {
  "7d": "7 jours",
  "30d": "1 mois",
  "6m": "6 mois",
};

export const WORKING_VIDEO_COUNT = 4;

export function isWorkingPeriod(value: unknown): value is WorkingPeriod {
  return value === "7d" || value === "30d" || value === "6m";
}

export const VIDEO_PAGE_SIZE = 60;
export const VIDEO_MAX_LIMIT = 1200;

export type SyncStatus = "idle" | "syncing" | "error";

export type ChannelDetails = {
  youtubeChannelId: string;
  title: string;
  handle: string | null;
  avatarUrl: string | null;
  subscriberCount: number | null;
  videoCount: number | null;
};

export type ChannelPreview = ChannelDetails & { alreadyFollowed: boolean };

export type VideoDetails = {
  videoId: string;
  channelId: string;
  title: string;
  publishedAt: string;
  durationSeconds: number;
  viewCount: number;
  likeCount: number | null;
  thumbnailUrl: string;
  liveBroadcastContent: string;
  /** First-party snippet text; empty when YouTube omitted it or the row predates the column. */
  description?: string;
};

export type ChannelListItem = {
  id: string;
  youtubeChannelId: string;
  title: string;
  handle: string | null;
  avatarUrl: string | null;
  subscriberCount: number | null;
  isMine: boolean;
  medianViews: number | null;
  lastSyncedAt: string | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  videoCount: number;
  createdAt: string;
};

export type VideoListItem = {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  publishedAt: string;
  durationSeconds: number;
  viewCount: number;
  thumbnailUrl: string;
  thumbType: ThumbType | null;
  thumbTypeSource: "ai" | "manual" | null;
  performance: VideoPerformance;
  description: string;
  /** Set on « Tendance Youtube » rows: views ÷ channel median (code). */
  overperformance?: number | null;
  /** Set on « Tendance Youtube » rows: interval or lifetime VPH (code). */
  viewsPerHour?: number | null;
  velocityKind?: "delta" | "average";
  formatId?: VideoFormatId;
  /** TypeSafe Score note 0–10; absent when Jev did not run. */
  jevNote?: number | null;
};

export type VideoListResponse = { items: VideoListItem[]; total: number; offset: number; limit: number };

export type ClassificationStatus = {
  enabled: boolean;
  hasKey: boolean;
  pending: number;
  awaitingConfirmation: number;
  estimatedCostUsd: number;
  running: boolean;
  modelLabel: string;
};

export type ChannelsResponse = {
  youtubeConfigured: boolean;
  channels: ChannelListItem[];
  classification: ClassificationStatus;
};

export type TypesSummaryResponse = { rows: ThemeSummaryRow[]; jevUsed: boolean };

export type WorkingSubjectHit = {
  subjectId: string;
  label: string;
  channelCount: number;
  medianScore: number | null;
  why: string;
  videoIds: string[];
};

export type WorkingSubjectResponse = {
  period: "7d";
  subject: WorkingSubjectHit | null;
  videos: VideoListItem[];
  jevUsed: boolean;
};

export type UseVideoResponse = { swipeFileId: string; imageUrl: string; label: string };

export type YoutubeSearchHit = {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  publishedAt: string;
  viewCount: number;
  thumbnailUrl: string;
  performance: VideoPerformance;
  jevNudged: boolean;
};

export type YoutubeSearchResponse = {
  items: YoutubeSearchHit[];
  jevUsed: boolean;
};

export type CaptionStatus = "ok" | "missing" | "blocked";
export type CaptionKind = "official" | "asr" | "unknown";
export type WhyDisclaimer = "no_studio";

export type WhyFacts = {
  overperformance: number | null;
  performance: VideoPerformance;
  viewsPerHour: number | null;
  velocityKind: "delta" | "average" | null;
  formatId: VideoFormatId;
  disclaimer: WhyDisclaimer;
};

export type WhyCaptions = {
  status: CaptionStatus;
  kind: CaptionKind | null;
  language: string | null;
  quotes: string[];
  hookText: string;
};

export type WhyJev = {
  used: boolean;
  note: number | null;
  holdNoul: number | null;
  holdBand: WhyHoldBand | null;
  categoryId: WhyCategoryId | null;
  confidence: number | null;
};

export type WhyVideoResponse = {
  videoId: string;
  facts: WhyFacts;
  captions: WhyCaptions;
  jev: WhyJev;
};

export type VideoQuery = {
  sort: VideoSort;
  types: ThumbTypeFilter[];
  channelId: string | null;
  /** Only the channels marked « Ma chaîne » (same rule as the types summary's "mine" scope). */
  mine?: boolean;
  period: VideoPeriod;
  q: string;
  /** Closed format taxonomy; empty = every format. */
  format: VideoFormatId | "";
  offset: number;
  limit: number;
  /** Restrict to these ids (theme filter / winning theme). Query string: `ids`. */
  videoIds?: string[];
};

export const DEFAULT_VIDEO_QUERY: VideoQuery = {
  sort: "score",
  types: [],
  channelId: null,
  period: "all",
  q: "",
  format: "",
  offset: 0,
  limit: VIDEO_PAGE_SIZE,
};

export const VIDEO_IDS_QUERY_MAX = 500;

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const value = raw === null || raw.trim() === "" ? Number.NaN : Number(raw);
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function parseVideoIds(raw: string | null): string[] | undefined {
  if (!raw?.trim()) return undefined;
  const ids = [
    ...new Set(
      raw
        .split(",")
        .map((value) => value.trim())
        .filter((value) => /^[\w-]{1,32}$/.test(value)),
    ),
  ];
  return ids.length > 0 ? ids.slice(0, VIDEO_IDS_QUERY_MAX) : undefined;
}

export function parseVideoQuery(params: URLSearchParams): VideoQuery {
  const types = (params.get("types") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is ThumbTypeFilter => value === UNCLASSIFIED_FILTER || isThumbType(value));
  const videoIds = parseVideoIds(params.get("ids"));
  const formatRaw = params.get("format");
  return {
    sort: VIDEO_SORTS.find((sort) => sort === params.get("sort")) ?? DEFAULT_VIDEO_QUERY.sort,
    types: [...new Set(types)],
    channelId: params.get("channel")?.trim() || null,
    period: VIDEO_PERIODS.find((period) => period === params.get("period")) ?? DEFAULT_VIDEO_QUERY.period,
    q: (params.get("q") ?? "").trim().slice(0, 100),
    format: isVideoFormat(formatRaw) ? formatRaw : "",
    offset: clampInt(params.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER),
    limit: clampInt(params.get("limit"), VIDEO_PAGE_SIZE, 1, VIDEO_MAX_LIMIT),
    ...(videoIds ? { videoIds } : {}),
  };
}

export function videoQueryToSearch(query: Partial<VideoQuery>): string {
  const params = new URLSearchParams();
  if (query.sort) params.set("sort", query.sort);
  if (query.types && query.types.length > 0) params.set("types", query.types.join(","));
  if (query.channelId) params.set("channel", query.channelId);
  if (query.period) params.set("period", query.period);
  if (query.q) params.set("q", query.q);
  if (query.format) params.set("format", query.format);
  if (query.offset) params.set("offset", String(query.offset));
  if (query.limit) params.set("limit", String(query.limit));
  if (query.videoIds && query.videoIds.length > 0) params.set("ids", query.videoIds.join(","));
  return params.toString();
}

export function youtubeThumbnailUrl(
  videoId: string,
  size: "mqdefault" | "hqdefault" | "maxresdefault" = "mqdefault",
): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/${size}.jpg`;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

/** URL of an image stored in the library's swipe_files table (chantier C contract). */
export function libraryImageUrl(swipeFileId: string): string {
  return `/api/swipe-files/image?f=${encodeURIComponent(swipeFileId)}`;
}
