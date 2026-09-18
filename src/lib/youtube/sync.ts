import { getTypedSettings } from "@/lib/settings";
import {
  fetchChannelDetails,
  fetchPlaylistPage,
  fetchVideos,
  longFormPlaylistId,
  uploadsPlaylistId,
  VIDEOS_BATCH_SIZE,
  YouTubeApiError,
} from "./api";
import * as store from "./channel-store";
import { channelMedianViews } from "./performance";
import { acquireChannelLock, markQuotaBlocked, releaseChannelLock } from "./runtime";
import { MISSING_YOUTUBE_KEY_ERROR, QUOTA_SYNC_ERROR, type VideoDetails } from "./types";

/** Shorts last up to 3 minutes: from the uploads playlist, only longer videos are kept. */
export const SHORT_MAX_SECONDS = 180;

export type SyncOutcome =
  | { status: "done"; imported: number; updated: number; removed: number }
  | { status: "busy" }
  | { status: "missing" }
  | { status: "no-key" }
  | { status: "quota" }
  | { status: "error"; message: string };

type PlaylistChoice = { id: string; filterByDuration: boolean };

class ChannelGoneError extends Error {}

export function keepVideo(video: VideoDetails, filterByDuration: boolean): boolean {
  if (video.liveBroadcastContent !== "none") return false;
  return !filterByDuration || video.durationSeconds > SHORT_MAX_SECONDS;
}

/** First sync: probe the long-form playlist (UULF…); a 404 falls back to the uploads playlist (UU…). */
async function choosePlaylist(apiKey: string, channel: store.ChannelRow, accessToken?: string | null): Promise<PlaylistChoice> {
  if (channel.playlist_id) {
    return { id: channel.playlist_id, filterByDuration: !channel.playlist_id.startsWith("UULF") };
  }
  const longForm = longFormPlaylistId(channel.youtube_channel_id);
  try {
    await fetchPlaylistPage(apiKey, longForm, null, accessToken);
    store.setPlaylistId(channel.id, longForm);
    return { id: longForm, filterByDuration: false };
  } catch (err) {
    if (!(err instanceof YouTubeApiError) || !err.isNotFound) throw err;
    const uploads = uploadsPlaylistId(channel.youtube_channel_id);
    store.setPlaylistId(channel.id, uploads);
    return { id: uploads, filterByDuration: true };
  }
}

/**
 * Walks the playlist from the newest video until a known one (everything on
 * the first import), then resumes an import the quota interrupted from its
 * saved page token. A later walk interrupted midway saves its own page token
 * (sync_page_token) and is finished before the next newest-first walk. Rows are written page by page so a stop keeps them.
 */
async function importNewVideos(
  apiKey: string,
  channel: store.ChannelRow,
  playlist: PlaylistChoice,
  stamp: string,
  accessToken?: string | null,
): Promise<number> {
  const known = store.knownVideoIds(channel.id);
  let imported = 0;

  const importPage = async (videoIds: string[]) => {
    const fresh = videoIds.filter((videoId) => !known.has(videoId));
    if (fresh.length === 0) return;
    const { videos } = await fetchVideos(apiKey, fresh, accessToken);
    const kept = videos.filter((video) => keepVideo(video, playlist.filterByDuration));
    if (!store.channelExists(channel.id)) throw new ChannelGoneError();
    store.upsertVideos(channel.id, kept, stamp);
    for (const video of kept) known.add(video.videoId);
    imported += kept.length;
  };

  const firstImport = channel.backfill_done === 0 && channel.backfill_page_token === null;

  // A later newest-first walk that stopped midway (quota, network) saved where it was: finish it first,
  // otherwise the next walk would stop on the already imported first page and leave a permanent gap.
  if (!firstImport && channel.sync_page_token) {
    let resumeToken: string | null = channel.sync_page_token;
    while (resumeToken) {
      const page = await fetchPlaylistPage(apiKey, playlist.id, resumeToken, accessToken);
      // Tokens are offsets from the newest video: uploads since the failure push already imported videos onto
      // this page, so only a page with nothing new means the gap is filled.
      const allKnown = page.videoIds.every((videoId) => known.has(videoId));
      await importPage(page.videoIds);
      resumeToken = allKnown ? null : page.nextPageToken;
      store.setSyncPageToken(channel.id, resumeToken);
    }
  }

  let pageToken: string | null = null;
  do {
    const page = await fetchPlaylistPage(apiKey, playlist.id, pageToken, accessToken);
    const reachedKnown = !firstImport && page.videoIds.some((videoId) => known.has(videoId));
    await importPage(page.videoIds);
    pageToken = page.nextPageToken;
    if (firstImport) store.setBackfill(channel.id, { pageToken, done: pageToken === null });
    else store.setSyncPageToken(channel.id, reachedKnown ? null : pageToken);
    if (reachedKnown) break;
  } while (pageToken);

  if (!firstImport && channel.backfill_done === 0 && channel.backfill_page_token) {
    let resumeToken: string | null = channel.backfill_page_token;
    while (resumeToken) {
      const page = await fetchPlaylistPage(apiKey, playlist.id, resumeToken, accessToken);
      await importPage(page.videoIds);
      resumeToken = page.nextPageToken;
      store.setBackfill(channel.id, { pageToken: resumeToken, done: resumeToken === null });
    }
  }

  return imported;
}

/** Fresh views for every video not fetched during this sync; videos YouTube no longer returns are removed. */
async function refreshStats(
  apiKey: string,
  channelId: string,
  stamp: string,
  accessToken?: string | null,
): Promise<{ updated: number; removed: number }> {
  const videoIds = store.videoIdsToRefresh(channelId, stamp);
  let updated = 0;
  let removed = 0;
  for (let start = 0; start < videoIds.length; start += VIDEOS_BATCH_SIZE) {
    const batch = videoIds.slice(start, start + VIDEOS_BATCH_SIZE);
    const { videos, foundIds } = await fetchVideos(apiKey, batch, accessToken);
    store.updateVideoStats(videos, stamp);
    const gone = batch.filter((videoId) => !foundIds.has(videoId));
    store.deleteVideos(gone);
    updated += videos.length;
    removed += gone.length;
  }
  return { updated, removed };
}

/**
 * Name, avatar and subscribers change over time; failing to refresh them never fails the sync. An exhausted
 * quota is still recorded so the stale queue stops instead of spending the next channels' calls on errors.
 */
async function refreshChannelDetails(
  apiKey: string,
  channel: store.ChannelRow,
  now: Date,
  accessToken?: string | null,
): Promise<void> {
  try {
    const details = await fetchChannelDetails(apiKey, channel.youtube_channel_id, accessToken);
    if (details) store.updateChannelDetails(channel.id, details);
  } catch (err) {
    // Cosmetic data: keep the previous values.
    if (err instanceof YouTubeApiError && err.isQuota) markQuotaBlocked(now);
  }
}

export async function syncChannel(
  channelId: string,
  now: () => Date = () => new Date(),
  accessToken?: string | null,
): Promise<SyncOutcome> {
  if (!acquireChannelLock(channelId)) return { status: "busy" };
  try {
    const channel = store.getChannel(channelId);
    if (!channel) return { status: "missing" };
    const apiKey = getTypedSettings().youtubeApiKey ?? "";
    if (!apiKey && !accessToken) {
      store.setSyncState(channelId, { status: "error", error: MISSING_YOUTUBE_KEY_ERROR });
      return { status: "no-key" };
    }

    store.setSyncState(channelId, { status: "syncing", error: null });
    const stamp = now().toISOString();
    try {
      const playlist = await choosePlaylist(apiKey, channel, accessToken);
      const imported = await importNewVideos(apiKey, channel, playlist, stamp, accessToken);
      const { updated, removed } = await refreshStats(apiKey, channelId, stamp, accessToken);
      await refreshChannelDetails(apiKey, channel, now(), accessToken);
      if (!store.channelExists(channelId)) return { status: "missing" };
      store.finishSync(channelId, {
        medianViews: channelMedianViews(store.viewSamples(channelId), now()),
        syncedAt: now().toISOString(),
      });
      return { status: "done", imported, updated, removed };
    } catch (err) {
      if (err instanceof ChannelGoneError) return { status: "missing" };
      if (err instanceof YouTubeApiError && err.isQuota) {
        markQuotaBlocked(now());
        store.setSyncState(channelId, { status: "error", error: QUOTA_SYNC_ERROR });
        return { status: "quota" };
      }
      const message = err instanceof Error ? err.message : "Synchronisation impossible";
      store.setSyncState(channelId, { status: "error", error: message });
      return { status: "error", message };
    }
  } finally {
    releaseChannelLock(channelId);
  }
}
