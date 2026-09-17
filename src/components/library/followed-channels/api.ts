import type { ThumbType } from "@/lib/youtube/thumb-types";
import {
  videoQueryToSearch,
  type ChannelListItem,
  type ChannelPreview,
  type ChannelsResponse,
  type ClassificationStatus,
  type TypesSummaryResponse,
  type UseVideoResponse,
  type VideoListResponse,
  type VideoQuery,
} from "@/lib/youtube/types";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const body = (await res.json().catch(() => ({}))) as { error?: unknown };
  if (!res.ok) throw new ApiError(res.status, typeof body.error === "string" ? body.error : "Erreur inattendue");
  return body as T;
}

// Every POST says application/json: the routes that spend quota or credit refuse anything else (415).
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const channelsApi = {
  list: () => request<ChannelsResponse>("/api/channels"),
  preview: (input: string) => request<{ channel: ChannelPreview }>("/api/channels/preview", json("POST", { input })),
  follow: (youtubeChannelId: string) =>
    request<{ channel: ChannelListItem; alreadyFollowed: boolean }>("/api/channels", json("POST", { youtubeChannelId })),
  unfollow: (channelId: string) =>
    request<{ success: true }>(`/api/channels/${encodeURIComponent(channelId)}`, { method: "DELETE" }),
  sync: (channelId: string) =>
    request<{ started: true; channel: ChannelListItem }>(`/api/channels/${encodeURIComponent(channelId)}/sync`, json("POST", {})),
  syncAll: () => request<{ queued: number; throttled: boolean }>("/api/channels/sync-stale", json("POST", { all: true })),
  videos: (query: Partial<VideoQuery>) => request<VideoListResponse>(`/api/channels/videos?${videoQueryToSearch(query)}`),
  setType: (videoId: string, thumbType: ThumbType) =>
    request<{ videoId: string; thumbType: ThumbType; thumbTypeSource: "manual" }>(
      `/api/channels/videos/${encodeURIComponent(videoId)}`,
      json("PATCH", { thumbType }),
    ),
  use: (videoId: string) =>
    request<UseVideoResponse>(`/api/channels/videos/${encodeURIComponent(videoId)}/use`, json("POST", {})),
  typesSummary: (scope: string) =>
    request<TypesSummaryResponse>(`/api/channels/types-summary?scope=${encodeURIComponent(scope)}`),
  approveClassification: () =>
    request<{ approved: number; classification: ClassificationStatus }>(
      "/api/channels/classification",
      json("POST", { action: "approve" }),
    ),
};
