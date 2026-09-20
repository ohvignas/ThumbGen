import { getCachedMedian } from "@/lib/brief/channel-median-cache";
import { publishedAfterIso } from "@/lib/brief/competitor-rank";
import { jevClickNouls } from "@/lib/typesafe/rerank-titles";
import { fetchChannels, fetchVideos, searchVideos, YouTubeApiError } from "./api";
import * as store from "./channel-store";
import { ageInDays, performanceScore, videoPerformance } from "./performance";
import { SHORT_MAX_SECONDS } from "./sync";
import {
  applyJevNudge,
  compareSwipeRank,
  swipeBaseline,
  swipeRankKey,
  YOUTUBE_SEARCH_MAX_QUERY,
  YOUTUBE_SEARCH_MAX_RESULTS,
  YOUTUBE_SEARCH_MIN_CHARS,
} from "./swipe-rank";
import {
  DEFAULT_YOUTUBE_SEARCH_REGION,
  parseYoutubeSearchRegion,
  youtubeSearchLanguage,
  type YoutubeSearchRegion,
} from "./search-regions";
import { youtubeThumbnailUrl, type YoutubeSearchHit, type YoutubeSearchResponse } from "./types";

export { YOUTUBE_SEARCH_MIN_CHARS, YOUTUBE_SEARCH_MAX_QUERY };
export type { YoutubeSearchHit, YoutubeSearchResponse };

function resolveBaseline(
  youtubeChannelId: string,
  subscriberCount: number | null,
  now: Date,
): number | null {
  const followed = store.getChannelByYoutubeId(youtubeChannelId);
  if (followed?.median_views && followed.median_views > 0) {
    return swipeBaseline({ medianViews: followed.median_views, sampleCount: 50, subscriberCount });
  }
  const cached = getCachedMedian(youtubeChannelId, now);
  if (cached) {
    return swipeBaseline({
      medianViews: cached.medianViews,
      sampleCount: cached.sampleCount,
      subscriberCount,
    });
  }
  return swipeBaseline({ medianViews: null, sampleCount: 0, subscriberCount });
}

export async function searchPerformantThumbnails(
  apiKey: string,
  rawQuery: string,
  now: Date = new Date(),
  regionInput: string = DEFAULT_YOUTUBE_SEARCH_REGION,
): Promise<YoutubeSearchResponse> {
  const q = rawQuery.trim().slice(0, YOUTUBE_SEARCH_MAX_QUERY);
  const region: YoutubeSearchRegion = parseYoutubeSearchRegion(regionInput);
  const hits = await searchVideos(apiKey, {
    q,
    publishedAfter: publishedAfterIso(now),
    maxResults: YOUTUBE_SEARCH_MAX_RESULTS,
    relevanceLanguage: youtubeSearchLanguage(region),
    regionCode: region,
  });
  if (hits.length === 0) return { items: [], jevUsed: false };

  const rankById = new Map(hits.map((hit, index) => [hit.videoId, index]));
  const { videos } = await fetchVideos(
    apiKey,
    hits.map((hit) => hit.videoId),
  );
  const channelIds = [...new Set(videos.map((video) => video.channelId))];
  const channels = await fetchChannels(apiKey, channelIds);
  const subsByChannel = new Map(channels.map((channel) => [channel.youtubeChannelId, channel.subscriberCount]));
  const titleById = new Map(hits.map((hit) => [hit.videoId, hit.channelTitle]));

  const candidates = videos
    .filter((video) => video.durationSeconds > SHORT_MAX_SECONDS && video.liveBroadcastContent === "none")
    .map((video) => {
      const searchRank = rankById.get(video.videoId) ?? 99;
      const baseline = resolveBaseline(video.channelId, subsByChannel.get(video.channelId) ?? null, now);
      const score = performanceScore(video.viewCount, baseline);
      const ageDays = ageInDays(video.publishedAt, now);
      return {
        video,
        searchRank,
        score,
        ageDays,
        rank: swipeRankKey({ score, ageDays, viewCount: video.viewCount, searchRank }),
        performance: videoPerformance({ publishedAt: video.publishedAt, viewCount: video.viewCount }, baseline, now),
      };
    })
    .sort((a, b) => {
      const byRank = compareSwipeRank(a.rank, b.rank);
      if (byRank !== 0) return byRank;
      return a.searchRank - b.searchRank;
    });

  const nouls = await jevClickNouls(
    q,
    candidates.map((row) => ({ videoId: row.video.videoId, title: row.video.title })),
  );
  const jevUsed = nouls.size > 0;
  if (jevUsed) {
    for (const row of candidates) {
      row.rank = applyJevNudge(row.rank, nouls.get(row.video.videoId));
    }
    candidates.sort((a, b) => {
      const byRank = compareSwipeRank(a.rank, b.rank);
      if (byRank !== 0) return byRank;
      return a.searchRank - b.searchRank;
    });
  }

  return {
    jevUsed,
    items: candidates.map((row) => ({
      videoId: row.video.videoId,
      channelId: row.video.channelId,
      channelTitle: titleById.get(row.video.videoId) || row.video.channelId,
      title: row.video.title,
      publishedAt: row.video.publishedAt,
      viewCount: row.video.viewCount,
      thumbnailUrl: row.video.thumbnailUrl || youtubeThumbnailUrl(row.video.videoId),
      performance: row.performance,
      jevNudged: nouls.has(row.video.videoId),
    })),
  };
}

export function youtubeSearchErrorStatus(error: unknown): { status: number; message: string } {
  if (error instanceof YouTubeApiError) {
    if (error.isQuota) return { status: 429, message: "Quota YouTube atteint — réessaie demain." };
    return { status: error.status || 502, message: error.message };
  }
  return { status: 502, message: "Recherche YouTube impossible pour le moment." };
}
