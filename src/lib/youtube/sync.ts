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
async function choosePlaylist(apiKey: string, channel: store.ChannelRow): Promise<PlaylistChoice> {
  if (channel.playlist_id) {
    return { id: channel.playlist_id, filterByDuration: !channel.playlist_id.startsWith("UULF") };
  }
  const longForm = longFormPlaylistId(channel.youtube_channel_id);
  try {
    await fetchPlaylistPage(apiKey, longForm);
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
 * saved page token. Rows are written page by page so a stop keeps them.
 */
async function importNewVideos(
  apiKey: string,
  channel: store.ChannelRow,
  playlist: PlaylistChoice,
  stamp: string,
): Promise<number> {
  const known = store.knownVideoIds(channel.id);
  let imported = 0;

  const importPage = async (videoIds: string[]) => {
    const fresh = videoIds.filter((videoId) => !known.has(videoId));
    if (fresh.length === 0) return;
    const { videos } = await fetchVideos(apiKey, fresh);
    const kept = videos.filter((video) => keepVideo(video, playlist.filterByDuration));
    if (!store.channelExists(channel.id)) throw new ChannelGoneError();
    store.upsertVideos(channel.id, kept, stamp);
    for (const video of kept) known.add(video.videoId);
    imported += kept.length;
  };

  const firstImport = channel.backfill_done === 0 && channel.backfill_page_token === null;
  let pageToken: string | null = null;
  do {
    const page = await fetchPlaylistPage(apiKey, playlist.id, pageToken);
    const reachedKnown = !firstImport && page.videoIds.some((videoId) => known.has(videoId));
    await importPage(page.videoIds);
    pageToken = page.nextPageToken;
    if (firstImport) store.setBackfill(channel.id, { pageToken, done: pageToken === null });
    if (reachedKnown) break;
  } while (pageToken);

  if (!firstImport && channel.backfill_done === 0 && channel.backfill_page_token) {
    let resumeToken: string | null = channel.backfill_page_token;
    while (resumeToken) {
      const page = await fetchPlaylistPage(apiKey, playlist.id, resumeToken);
      await importPage(page.videoIds);
      resumeToken = page.nextPageToken;
      store.setBackfill(channel.id, { pageToken: resumeToken, done: resumeToken === null });
    }
  }

  return imported;
}

/** Fresh views for every video not fetched during this sync; videos YouTube no longer returns are removed. */
async function refreshStats(apiKey: string, channelId: string, stamp: string): Promise<{ updated: number; removed: number }> {
  const videoIds = store.videoIdsToRefresh(channelId, stamp);
  let updated = 0;
  let removed = 0;
  for (let start = 0; start < videoIds.length; start += VIDEOS_BATCH_SIZE) {
    const batch = videoIds.slice(start, start + VIDEOS_BATCH_SIZE);
    const { videos, foundIds } = await fetchVideos(apiKey, batch);
    store.updateVideoStats(videos, stamp);
    const gone = batch.filter((videoId) => !foundIds.has(videoId));
    store.deleteVideos(gone);
    updated += videos.length;
    removed += gone.length;
  }
  return { updated, removed };
}

/** Name, avatar and subscribers change over time; failing to refresh them never fails the sync. */
async function refreshChannelDetails(apiKey: string, channel: store.ChannelRow): Promise<void> {
  try {
    const details = await fetchChannelDetails(apiKey, channel.youtube_channel_id);
    if (details) store.updateChannelDetails(channel.id, details);
  } catch {
    // Cosmetic data: keep the previous values.
  }
}

export async function syncChannel(channelId: string, now: () => Date = () => new Date()): Promise<SyncOutcome> {
  if (!acquireChannelLock(channelId)) return { status: "busy" };
  try {
    const channel = store.getChannel(channelId);
    if (!channel) return { status: "missing" };
    const apiKey = getTypedSettings().youtubeApiKey;
    if (!apiKey) {
      store.setSyncState(channelId, { status: "error", error: MISSING_YOUTUBE_KEY_ERROR });
      return { status: "no-key" };
    }

    store.setSyncState(channelId, { status: "syncing", error: null });
    const stamp = now().toISOString();
    try {
      const playlist = await choosePlaylist(apiKey, channel);
      const imported = await importNewVideos(apiKey, channel, playlist, stamp);
      const { updated, removed } = await refreshStats(apiKey, channelId, stamp);
      await refreshChannelDetails(apiKey, channel);
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
