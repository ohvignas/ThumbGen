import type { VideoPerformance } from "./performance";
import {
  UNCLASSIFIED_FILTER,
  isThumbType,
  type ThumbType,
  type ThumbTypeFilter,
  type TypeSummaryRow,
} from "./thumb-types";

/**
 * Shapes and constants shared by the followed-channels routes and the UI.
 * Client-safe: no database or Node import here.
 */

export const QUOTA_SYNC_ERROR = "Quota YouTube atteint — reprise demain";
export const MISSING_YOUTUBE_KEY_ERROR = "Ajoute ta clé YouTube dans Réglages → Connexions";

export const VIDEO_SORTS = ["score", "views", "date"] as const;
export type VideoSort = (typeof VIDEO_SORTS)[number];

export const VIDEO_PERIODS = ["30d", "12m", "all"] as const;
export type VideoPeriod = (typeof VIDEO_PERIODS)[number];

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
  title: string;
  publishedAt: string;
  durationSeconds: number;
  viewCount: number;
  likeCount: number | null;
  thumbnailUrl: string;
  liveBroadcastContent: string;
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

export type TypesSummaryResponse = { rows: TypeSummaryRow[] };

export type UseVideoResponse = { swipeFileId: string; imageUrl: string; label: string };

export type VideoQuery = {
  sort: VideoSort;
  types: ThumbTypeFilter[];
  channelId: string | null;
  period: VideoPeriod;
  q: string;
  offset: number;
  limit: number;
};

export const DEFAULT_VIDEO_QUERY: VideoQuery = {
  sort: "score",
  types: [],
  channelId: null,
  period: "all",
  q: "",
  offset: 0,
  limit: VIDEO_PAGE_SIZE,
};

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const value = raw === null || raw.trim() === "" ? Number.NaN : Number(raw);
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function parseVideoQuery(params: URLSearchParams): VideoQuery {
  const types = (params.get("types") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is ThumbTypeFilter => value === UNCLASSIFIED_FILTER || isThumbType(value));
  return {
    sort: VIDEO_SORTS.find((sort) => sort === params.get("sort")) ?? DEFAULT_VIDEO_QUERY.sort,
    types: [...new Set(types)],
    channelId: params.get("channel")?.trim() || null,
    period: VIDEO_PERIODS.find((period) => period === params.get("period")) ?? DEFAULT_VIDEO_QUERY.period,
    q: (params.get("q") ?? "").trim().slice(0, 100),
    offset: clampInt(params.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER),
    limit: clampInt(params.get("limit"), VIDEO_PAGE_SIZE, 1, VIDEO_MAX_LIMIT),
  };
}

export function videoQueryToSearch(query: Partial<VideoQuery>): string {
  const params = new URLSearchParams();
  if (query.sort) params.set("sort", query.sort);
  if (query.types && query.types.length > 0) params.set("types", query.types.join(","));
  if (query.channelId) params.set("channel", query.channelId);
  if (query.period) params.set("period", query.period);
  if (query.q) params.set("q", query.q);
  if (query.offset) params.set("offset", String(query.offset));
  if (query.limit) params.set("limit", String(query.limit));
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
