import { tool as aiTool, type Tool } from "ai";
import { z } from "zod";
import { getSetting } from "@/lib/settings";
import {
  PLAYLIST_ITEMS_UNITS,
  SEARCH_LIST_UNITS,
  VIDEOS_BATCH_SIZE,
  VIDEOS_LIST_UNITS,
  YouTubeApiError,
  fetchPlaylistPage,
  fetchVideos,
  longFormPlaylistId,
  searchVideos,
  uploadsPlaylistId,
} from "@/lib/youtube/api";
import { MISSING_YOUTUBE_KEY_ERROR } from "@/lib/youtube/types";
import * as store from "@/lib/youtube/channel-store";
import { ageInDays, channelMedianViews, isRecent } from "@/lib/youtube/performance";
import { ensureBrief, reserveBriefUsage } from "@/lib/brief/store";
import { getCachedMedian, setCachedMedian } from "@/lib/brief/channel-median-cache";
import { saveCompetitorSearch, type CompetitorHit } from "@/lib/brief/competitor-search-store";
import {
  COMPETITOR_MAX_CHANNELS,
  filterCompetitors,
  formatCompetitorLine,
  pickTopCompetitors,
  publishedAfterIso,
  scoreAgainstMedian,
  type RankableVideo,
  type ScoredVideo,
} from "@/lib/brief/competitor-rank";
import { getDb } from "@/lib/db";
import type { ToolResult } from "@/lib/agent/tools/types";
import { isFakeAgentEnabled } from "./fake-agent-model";
import { FAKE_COMPETITOR_HITS } from "./fake-f3b-fixtures";
import { toolResultToModelOutput } from "./tool-adapter";

export const FIND_COMPETITOR_THUMBNAILS_TOOL_NAME = "find_competitor_thumbnails";
export const findCompetitorThumbnailsInputSchema = z.object({
  query_fr: z.string().trim().min(1).max(200),
  query_en: z.string().trim().min(1).max(200),
});
export type FindCompetitorThumbnailsInput = z.output<typeof findCompetitorThumbnailsInputSchema>;
export type FindCompetitorThumbnailsContext = { conversationId: string; now?: Date };

const SKIP = "Pas de clé YouTube ou quota atteint : continue sans miniatures concurrentes.";

function error(text: string, requestNotSent = false): ToolResult {
  return { isError: true, requestNotSent, content: [{ type: "text", text }] };
}

function followedSamples(channelRowId: string): { publishedAt: string; viewCount: number; videoId: string }[] {
  return getDb()
    .prepare(
      "SELECT video_id AS videoId, published_at AS publishedAt, view_count AS viewCount FROM channel_videos WHERE channel_id = ?",
    )
    .all(channelRowId) as { videoId: string; publishedAt: string; viewCount: number }[];
}

async function baseline(
  apiKey: string,
  youtubeChannelId: string,
  excludeVideoId: string,
  now: Date,
  units: { n: number },
): Promise<{ median: number | null; sampleCount: number }> {
  const followed = store.getChannelByYoutubeId(youtubeChannelId);
  if (followed) {
    const samples = followedSamples(followed.id)
      .filter((row) => row.videoId !== excludeVideoId)
      .map(({ publishedAt, viewCount }) => ({ publishedAt, viewCount }));
    const median = channelMedianViews(samples, now);
    const sampleCount = samples.filter((row) => !isRecent(row.publishedAt, now)).length;
    return { median, sampleCount: Math.min(sampleCount, 50) };
  }
  const cached = getCachedMedian(youtubeChannelId, now);
  if (cached) return { median: cached.medianViews, sampleCount: cached.sampleCount };

  const playlists = [longFormPlaylistId(youtubeChannelId), uploadsPlaylistId(youtubeChannelId)];
  let videoIds: string[] = [];
  for (const playlistId of playlists) {
    try {
      const page = await fetchPlaylistPage(apiKey, playlistId);
      units.n += PLAYLIST_ITEMS_UNITS;
      videoIds = page.videoIds;
      break;
    } catch (err) {
      if (err instanceof YouTubeApiError && err.isNotFound) continue;
      throw err;
    }
  }
  const { videos } = await fetchVideos(apiKey, videoIds.slice(0, VIDEOS_BATCH_SIZE));
  if (videoIds.length > 0) units.n += VIDEOS_LIST_UNITS;
  const samples = videos.filter((video) => video.videoId !== excludeVideoId).map((video) => ({ publishedAt: video.publishedAt, viewCount: video.viewCount }));
  const median = channelMedianViews(samples, now);
  const sampleCount = Math.min(samples.filter((row) => !isRecent(row.publishedAt, now)).length, 50);
  setCachedMedian(youtubeChannelId, median, sampleCount, now);
  return { median, sampleCount };
}

export async function executeFindCompetitorThumbnails(
  context: FindCompetitorThumbnailsContext,
  input: FindCompetitorThumbnailsInput,
): Promise<ToolResult> {
  const existing = ensureBrief(context.conversationId);
  if (!existing) return error("Conversation introuvable.", true);
  const now = context.now ?? new Date();

  if (isFakeAgentEnabled()) {
    saveCompetitorSearch(context.conversationId, FAKE_COMPETITOR_HITS);
    return {
      content: [
        {
          type: "text",
          text: `${FAKE_COMPETITOR_HITS.map(formatCompetitorLine).join("\n")}\nunités YouTube : 0`,
        },
      ],
    };
  }

  if (existing.brief.usage.competitorSearches >= 2) {
    return error("Limite de 2 recherches de concurrents atteinte pour cette miniature.", true);
  }
  const apiKey = getSetting("youtubeApiKey");
  if (!apiKey) return error(MISSING_YOUTUBE_KEY_ERROR + " " + SKIP, true);

  const reservation = reserveBriefUsage(context.conversationId, "competitorSearches", () => null);
  if (reservation.status !== "reserved") {
    return error(reservation.status === "refused" ? reservation.reason : "Pas de fiche pour cette conversation.", true);
  }

  const units = { n: 0 };
  try {
    const publishedAfter = publishedAfterIso(now);
    const frHits = await searchVideos(apiKey, {
      q: input.query_fr,
      publishedAfter,
      maxResults: 25,
      relevanceLanguage: "fr",
      regionCode: "FR",
    });
    units.n += SEARCH_LIST_UNITS;
    const enHits = await searchVideos(apiKey, {
      q: input.query_en,
      publishedAfter,
      maxResults: 25,
      relevanceLanguage: "en",
    });
    units.n += SEARCH_LIST_UNITS;

    const combined = [
      ...frHits.map((hit, index) => ({ ...hit, lang: "fr" as const, searchRank: index })),
      ...enHits.map((hit, index) => ({ ...hit, lang: "en" as const, searchRank: index })),
    ];
    const ids = [...new Set(combined.map((hit) => hit.videoId))];
    const details = new Map<string, Awaited<ReturnType<typeof fetchVideos>>["videos"][number]>();
    for (let offset = 0; offset < ids.length; offset += VIDEOS_BATCH_SIZE) {
      const batch = ids.slice(offset, offset + VIDEOS_BATCH_SIZE);
      const { videos } = await fetchVideos(apiKey, batch);
      units.n += VIDEOS_LIST_UNITS;
      for (const video of videos) details.set(video.videoId, video);
    }

    const rankable: RankableVideo[] = [];
    for (const hit of combined) {
      const video = details.get(hit.videoId);
      if (!video) continue;
      rankable.push({
        videoId: video.videoId,
        title: video.title,
        channel: hit.channelTitle,
        channelId: video.channelId,
        lang: hit.lang,
        views: video.viewCount,
        publishedAt: video.publishedAt,
        durationSeconds: video.durationSeconds,
        liveBroadcastContent: video.liveBroadcastContent,
        searchRank: hit.searchRank,
      });
    }
    const filtered = filterCompetitors(rankable, now);
    const channels: string[] = [];
    for (const video of filtered) {
      if (!channels.includes(video.channelId) && channels.length < COMPETITOR_MAX_CHANNELS) channels.push(video.channelId);
    }
    const medians = new Map<string, { median: number | null; sampleCount: number }>();
    for (const channelId of channels) {
      const candidate = filtered.find((video) => video.channelId === channelId)!.videoId;
      medians.set(channelId, await baseline(apiKey, channelId, candidate, now, units));
    }

    const scored: ScoredVideo[] = filtered.map((video) => {
      const base = medians.get(video.channelId) ?? { median: null, sampleCount: 0 };
      const { score, viral } = scoreAgainstMedian(video.views, base.median, base.sampleCount);
      return { ...video, score, viral, ageDays: Math.floor(ageInDays(video.publishedAt, now)) };
    });
    const hits: CompetitorHit[] = pickTopCompetitors(scored);
    saveCompetitorSearch(context.conversationId, hits);
    if (hits.length === 0) return error("Aucun concurrent trouvé. Continue sans analyse.");
    return {
      content: [
        {
          type: "text",
          text: `${hits.map(formatCompetitorLine).join("\n")}\nunités YouTube : ${units.n}`,
        },
      ],
    };
  } catch (err) {
    if (err instanceof YouTubeApiError && (err.isQuota || err.status === 0)) {
      return error(err.isQuota ? SKIP : `${err.message}. ${SKIP}`);
    }
    return error(err instanceof Error ? err.message : SKIP);
  }
}

export function buildFindCompetitorThumbnailsTool(context: FindCompetitorThumbnailsContext): Tool {
  return aiTool({
    description: [
      "Searches competing YouTube videos in French and English and ranks them. Use when competing packaging would help. query_fr + query_en. Returns youtube:<videoId> lines. Max 2 searches per conversation. Then analyze_thumbnails. If there is no YouTube key or quota is exhausted: skip competitors, don't invent them.",
      "Returns lines youtube:<videoId> | channel | views | ×score | age | language — never an image. At most 2 searches per conversation.",
      "If there is no YouTube key or the quota is exhausted: skip competitors and continue.",
    ].join("\n"),
    inputSchema: findCompetitorThumbnailsInputSchema,
    execute: async (input: FindCompetitorThumbnailsInput) => executeFindCompetitorThumbnails(context, input),
    toModelOutput: ({ output }: { output: unknown }) => toolResultToModelOutput(output),
  }) as Tool;
}
