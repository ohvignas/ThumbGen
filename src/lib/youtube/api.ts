import { parseChannelInput } from "./channel";
import { youtubeThumbnailUrl, type ChannelDetails, type VideoDetails } from "./types";

/**
 * YouTube Data API v3 client for followed channels. channels.list,
 * playlists.list, playlistItems.list and videos.list cost 1 quota unit;
 * search.list costs 100.
 * Errors never carry the API key: the request URL is not part of any message.
 *
 * Counts and dates are the only fields this client hands to the rest of the
 * app without a second check downstream, so they are guarded here:
 * viewCount / likeCount / subscriberCount parse only as non-negative safe
 * integers (anything else → null for like/subscriber counts, 0 for a missing
 * or invalid viewCount), and a video whose publishedAt doesn't parse as a
 * date is skipped rather than returned with a bad date.
 */

const API_BASE = "https://www.googleapis.com/youtube/v3";
const CHANNEL_PARTS = "snippet,statistics,contentDetails";
const VIDEO_PARTS = "snippet,statistics,contentDetails";

export const PLAYLIST_PAGE_SIZE = 50;
export const VIDEOS_BATCH_SIZE = 50;

const CHANNEL_ID = /^UC[\w-]{20,}$/;
const UPLOADS_PLAYLIST_ID = /^UU[\w-]{20,}$/;
const PLAYLIST_ID = /^PL[\w-]{10,}$/;
const BARE_HANDLE = /^[\w.-]{3,30}$/;

export class YouTubeApiError extends Error {
  readonly status: number;
  readonly reason: string | null;
  readonly isQuota: boolean;
  readonly isNotFound: boolean;

  constructor(status: number, reason: string | null, message: string) {
    super(message);
    this.name = "YouTubeApiError";
    this.status = status;
    this.reason = reason;
    this.isQuota = status === 403 && (reason === "quotaExceeded" || reason === "dailyLimitExceeded");
    this.isNotFound = status === 404;
  }
}

/** A request that gets no answer within this delay is treated like a network failure. */
export const YOUTUBE_FETCH_TIMEOUT_MS = 15_000;

export function youtubeNetworkError(): YouTubeApiError {
  return new YouTubeApiError(0, "network", "YouTube injoignable");
}

async function youtubeGet<T>(
  apiKey: string,
  resource: string,
  params: Record<string, string>,
  accessToken?: string | null,
): Promise<T> {
  const search = new URLSearchParams(params);
  if (!accessToken) search.set("key", apiKey);
  const headers: HeadersInit = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/${resource}?${search.toString()}`, {
      headers,
      signal: AbortSignal.timeout(YOUTUBE_FETCH_TIMEOUT_MS),
    });
  } catch {
    // Network failure, DNS, or the timeout (TimeoutError DOMException).
    throw youtubeNetworkError();
  }
  if (!res.ok) {
    let reason: string | null = null;
    try {
      const body = (await res.json()) as { error?: { errors?: Array<{ reason?: unknown }> } };
      const raw = body.error?.errors?.[0]?.reason;
      reason = typeof raw === "string" ? raw : null;
    } catch {
      reason = null;
    }
    throw new YouTubeApiError(res.status, reason, `YouTube a refusé la requête (${res.status}${reason ? ` · ${reason}` : ""})`);
  }
  try {
    return (await res.json()) as T;
  } catch (err) {
    // The timeout also covers reading the body.
    if (err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError")) throw youtubeNetworkError();
    throw err;
  }
}

/** ISO 8601 duration (PT15M33S, P1DT2H, P0D…) to seconds; 0 when unreadable. */
export function parseIsoDuration(value: string | null | undefined): number {
  const match = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value ?? "");
  if (!match) return 0;
  const [, weeks, days, hours, minutes, seconds] = match;
  return Math.round(
    Number(weeks ?? 0) * 7 * 86_400 +
      Number(days ?? 0) * 86_400 +
      Number(hours ?? 0) * 3_600 +
      Number(minutes ?? 0) * 60 +
      Number(seconds ?? 0),
  );
}

/** Undocumented but widely used: UULF + channel id without "UC" lists long-form videos only. */
export function longFormPlaylistId(youtubeChannelId: string): string {
  return `UULF${youtubeChannelId.slice(2)}`;
}

export function uploadsPlaylistId(youtubeChannelId: string): string {
  return `UU${youtubeChannelId.slice(2)}`;
}

/** Channel ids readable without a request: UC…, a /channel/UC… URL, or the uploads playlist UU…. */
export function localChannelId(input: string): string | null {
  const raw = input.trim();
  const parsed = parseChannelInput(raw);
  if (parsed?.type === "channelId") return parsed.value;
  if (CHANNEL_ID.test(raw)) return raw;
  if (UPLOADS_PLAYLIST_ID.test(raw)) return `UC${raw.slice(2)}`;
  return null;
}

type ThumbnailSet = Record<string, { url?: string } | undefined>;

type ChannelsResponse = {
  items?: Array<{
    id: string;
    snippet?: { title?: string; customUrl?: string; description?: string; thumbnails?: ThumbnailSet };
    statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string };
    brandingSettings?: { channel?: { description?: string; keywords?: string } };
  }>;
};

/** A count field (viewCount, likeCount, subscriberCount, videoCount) as YouTube sends it: an unsigned integer in a
 * string. Anything that isn't a non-negative safe integer (absent, empty, negative, fractional, unparseable, or
 * unsafely large) is not trustworthy and becomes `null` so callers never propagate a bad count or date pairing. */
function toCount(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function toChannelDetails(item: NonNullable<ChannelsResponse["items"]>[number]): ChannelDetails {
  const thumbnails = item.snippet?.thumbnails ?? {};
  const customUrl = item.snippet?.customUrl?.trim();
  return {
    youtubeChannelId: item.id,
    title: item.snippet?.title?.trim() || item.id,
    handle: customUrl ? (customUrl.startsWith("@") ? customUrl : `@${customUrl}`) : null,
    avatarUrl: thumbnails.medium?.url ?? thumbnails.high?.url ?? thumbnails.default?.url ?? null,
    subscriberCount: item.statistics?.hiddenSubscriberCount ? null : toCount(item.statistics?.subscriberCount),
    videoCount: toCount(item.statistics?.videoCount),
    description: item.brandingSettings?.channel?.description?.trim() || item.snippet?.description?.trim() || null,
  };
}

export async function fetchChannelDetails(
  apiKey: string,
  youtubeChannelId: string,
  accessToken?: string | null,
): Promise<ChannelDetails | null> {
  const channels = await fetchChannels(apiKey, [youtubeChannelId], accessToken);
  return channels[0] ?? null;
}

/** `channels.list` — at most 50 ids (1 quota unit). */
export async function fetchChannels(
  apiKey: string,
  youtubeChannelIds: readonly string[],
  accessToken?: string | null,
): Promise<ChannelDetails[]> {
  const ids = [...new Set(youtubeChannelIds.filter(Boolean))];
  if (ids.length === 0) return [];
  if (ids.length > VIDEOS_BATCH_SIZE) throw new Error(`fetchChannels takes at most ${VIDEOS_BATCH_SIZE} ids`);
  const data = await youtubeGet<ChannelsResponse>(
    apiKey,
    "channels",
    { part: CHANNEL_PARTS, id: ids.join(",") },
    accessToken,
  );
  return (data.items ?? []).map(toChannelDetails);
}

/** Owner's channel via OAuth (`mine=true`); includes the About text. */
export async function fetchMineChannel(accessToken: string): Promise<ChannelDetails | null> {
  const data = await youtubeGet<ChannelsResponse>(
    "",
    "channels",
    { part: `${CHANNEL_PARTS},brandingSettings`, mine: "true" },
    accessToken,
  );
  const item = data.items?.[0];
  return item ? toChannelDetails(item) : null;
}

export type ResolvedChannel = { status: "found"; channel: ChannelDetails } | { status: "not-found" };

/** A channel URL, @handle, bare handle, UC… id, UU… uploads playlist or PL… playlist → channel details. */
export async function resolveChannelInput(
  apiKey: string,
  input: string,
  accessToken?: string | null,
): Promise<ResolvedChannel> {
  const raw = input.trim();
  if (!raw) return { status: "not-found" };

  let query: Record<string, string> | null = null;
  const local = localChannelId(raw);
  const parsed = parseChannelInput(raw);
  if (local) {
    query = { id: local };
  } else if (parsed?.type === "handle") {
    query = { forHandle: parsed.value.replace(/^@/, "") };
  } else if (PLAYLIST_ID.test(raw)) {
    const playlists = await youtubeGet<{ items?: Array<{ snippet?: { channelId?: string } }> }>(
      apiKey,
      "playlists",
      {
        part: "snippet",
        id: raw,
      },
      accessToken,
    );
    const channelId = playlists.items?.[0]?.snippet?.channelId;
    if (!channelId) return { status: "not-found" };
    query = { id: channelId };
  } else if (BARE_HANDLE.test(raw)) {
    query = { forHandle: raw };
  }
  if (!query) return { status: "not-found" };

  const data = await youtubeGet<ChannelsResponse>(apiKey, "channels", { part: CHANNEL_PARTS, ...query }, accessToken);
  const item = data.items?.[0];
  return item ? { status: "found", channel: toChannelDetails(item) } : { status: "not-found" };
}

export type PlaylistPage = { videoIds: string[]; nextPageToken: string | null };

export async function fetchPlaylistPage(
  apiKey: string,
  playlistId: string,
  pageToken?: string | null,
  accessToken?: string | null,
): Promise<PlaylistPage> {
  const params: Record<string, string> = { part: "contentDetails", playlistId, maxResults: String(PLAYLIST_PAGE_SIZE) };
  if (pageToken) params.pageToken = pageToken;
  const data = await youtubeGet<{ nextPageToken?: string; items?: Array<{ contentDetails?: { videoId?: string } }> }>(
    apiKey,
    "playlistItems",
    params,
    accessToken,
  );
  return {
    videoIds: (data.items ?? [])
      .map((item) => item.contentDetails?.videoId)
      .filter((videoId): videoId is string => typeof videoId === "string" && videoId.length > 0),
    nextPageToken: data.nextPageToken || null,
  };
}

type VideosResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      description?: string;
      publishedAt?: string;
      liveBroadcastContent?: string;
      channelId?: string;
      thumbnails?: ThumbnailSet;
    };
    statistics?: { viewCount?: string; likeCount?: string };
    contentDetails?: { duration?: string };
  }>;
};

export type VideosBatch = { videos: VideoDetails[]; foundIds: Set<string> };

/** At most 50 ids. `foundIds` lists every id YouTube still returns (private or deleted videos are absent). A video
 * whose `publishedAt` doesn't parse as a date is left out of `videos` — its id still exists, but nothing downstream
 * can trust an undated video, so it isn't returned rather than being returned with a made-up date. */
export async function fetchVideos(
  apiKey: string,
  videoIds: readonly string[],
  accessToken?: string | null,
): Promise<VideosBatch> {
  if (videoIds.length === 0) return { videos: [], foundIds: new Set() };
  if (videoIds.length > VIDEOS_BATCH_SIZE) throw new Error(`fetchVideos takes at most ${VIDEOS_BATCH_SIZE} ids`);
  const data = await youtubeGet<VideosResponse>(
    apiKey,
    "videos",
    { part: VIDEO_PARTS, id: videoIds.join(",") },
    accessToken,
  );

  const videos: VideoDetails[] = [];
  const foundIds = new Set<string>();
  for (const item of data.items ?? []) {
    if (!item.id) continue;
    foundIds.add(item.id);
    const published = Date.parse(item.snippet?.publishedAt ?? "");
    if (Number.isNaN(published)) continue;
    const channelId = item.snippet?.channelId?.trim();
    if (!channelId) continue;
    videos.push({
      videoId: item.id,
      channelId,
      title: item.snippet?.title?.trim() || item.id,
      description: (item.snippet?.description ?? "").trim().slice(0, 4000),
      publishedAt: new Date(published).toISOString(),
      durationSeconds: parseIsoDuration(item.contentDetails?.duration),
      viewCount: toCount(item.statistics?.viewCount) ?? 0,
      likeCount: toCount(item.statistics?.likeCount),
      thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? youtubeThumbnailUrl(item.id),
      liveBroadcastContent: item.snippet?.liveBroadcastContent ?? "none",
      description: item.snippet?.description?.trim() || "",
    });
  }
  return { videos, foundIds };
}

export const SEARCH_LIST_UNITS = 100;
export const VIDEOS_LIST_UNITS = 1;
export const PLAYLIST_ITEMS_UNITS = 1;

export type SearchVideoHit = {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  publishedAt: string;
};

/** `search.list` (100 quota units). Video ids only — details come from `fetchVideos`. */
export async function searchVideos(
  apiKey: string,
  params: {
    q: string;
    publishedAfter: string;
    maxResults: number;
    relevanceLanguage?: string;
    regionCode?: string;
  },
): Promise<SearchVideoHit[]> {
  const query: Record<string, string> = {
    part: "snippet",
    type: "video",
    order: "relevance",
    q: params.q,
    publishedAfter: params.publishedAfter,
    maxResults: String(params.maxResults),
  };
  if (params.relevanceLanguage) query.relevanceLanguage = params.relevanceLanguage;
  if (params.regionCode) query.regionCode = params.regionCode;
  const data = await youtubeGet<{
    items?: Array<{
      id?: { kind?: string; videoId?: string };
      snippet?: { title?: string; channelId?: string; channelTitle?: string; publishedAt?: string };
    }>;
  }>(apiKey, "search", query);
  const hits: SearchVideoHit[] = [];
  for (const item of data.items ?? []) {
    if (item.id?.kind && item.id.kind !== "youtube#video") continue;
    const videoId = item.id?.videoId;
    const channelId = item.snippet?.channelId?.trim();
    const published = Date.parse(item.snippet?.publishedAt ?? "");
    if (!videoId || !channelId || Number.isNaN(published)) continue;
    hits.push({
      videoId,
      channelId,
      channelTitle: item.snippet?.channelTitle?.trim() || channelId,
      title: item.snippet?.title?.trim() || videoId,
      publishedAt: new Date(published).toISOString(),
    });
  }
  return hits;
}
