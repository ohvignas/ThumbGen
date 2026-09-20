import { getTypedSettings } from "@/lib/settings";
import { fetchVideos, VIDEOS_BATCH_SIZE, YouTubeApiError } from "./api";
import * as store from "./channel-store";
import { fetchYoutubeRss } from "./rss";
import { isChannelLocked, markQuotaBlocked } from "./runtime";
import { pruneStatSnapshots, youngVideoIdsDueForSnapshot } from "./stat-snapshots";
import { keepVideo } from "./sync";

export async function pollFollowedSnapshots(now: () => Date = () => new Date()): Promise<{
  rssNew: number;
  refreshed: number;
  status: "done" | "no-key" | "quota" | "error";
}> {
  const apiKey = getTypedSettings().youtubeApiKey;
  if (!apiKey) return { rssNew: 0, refreshed: 0, status: "no-key" };

  let rssNew = 0;
  let refreshed = 0;
  const stamp = now().toISOString();

  try {
    for (const channel of store.listFollowedForPoll()) {
      if (isChannelLocked(channel.id)) continue;
      const filterByDuration = !channel.playlistId || !channel.playlistId.startsWith("UULF");
      const rssIds = await fetchYoutubeRss(channel.youtubeChannelId);
      const known = store.knownVideoIds(channel.id);
      const fresh = rssIds.filter((videoId) => !known.has(videoId));
      for (let start = 0; start < fresh.length; start += VIDEOS_BATCH_SIZE) {
        const { videos } = await fetchVideos(apiKey, fresh.slice(start, start + VIDEOS_BATCH_SIZE));
        const kept = videos.filter((video) => keepVideo(video, filterByDuration));
        if (kept.length === 0) continue;
        store.upsertVideos(channel.id, kept, stamp);
        rssNew += kept.length;
      }
      const due = youngVideoIdsDueForSnapshot(now(), channel.id);
      for (let start = 0; start < due.length; start += VIDEOS_BATCH_SIZE) {
        const batch = due.slice(start, start + VIDEOS_BATCH_SIZE);
        const { videos } = await fetchVideos(apiKey, batch);
        store.updateVideoStats(videos, stamp);
        refreshed += videos.length;
      }
    }
    pruneStatSnapshots(now());
    return { rssNew, refreshed, status: "done" };
  } catch (err) {
    if (err instanceof YouTubeApiError && err.isQuota) {
      markQuotaBlocked(now());
      return { rssNew, refreshed, status: "quota" };
    }
    return { rssNew, refreshed, status: "error" };
  }
}
