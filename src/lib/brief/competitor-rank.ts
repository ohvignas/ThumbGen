import { SHORT_MAX_SECONDS } from "@/lib/youtube/sync";
import { ageInDays, performanceScore } from "@/lib/youtube/performance";
import { swipeRankKey } from "@/lib/youtube/swipe-rank";
import type { CompetitorHit } from "./competitor-search-store";

export const COMPETITOR_MIN_AGE_DAYS = 14;
export const COMPETITOR_MAX_RESULTS = 12;
export const COMPETITOR_MIN_FR = 4;
export const COMPETITOR_SCORE_CAP = 30;
export const COMPETITOR_MIN_SAMPLE = 8;
export const COMPETITOR_MIN_MEDIAN_VIEWS = 500;
export const COMPETITOR_MAX_CHANNELS = 24;
export const COMPETITOR_PUBLISHED_AFTER_MONTHS = 18;

export type RankableVideo = {
  videoId: string;
  title: string;
  channel: string;
  channelId: string;
  lang: "fr" | "en";
  views: number;
  publishedAt: string;
  durationSeconds: number;
  liveBroadcastContent: string;
  searchRank: number;
};

export type ScoredVideo = RankableVideo & { score: number | null; viral: boolean; ageDays: number };

export function filterCompetitors(videos: readonly RankableVideo[], now: Date): RankableVideo[] {
  return videos.filter((video) => {
    if (video.durationSeconds <= SHORT_MAX_SECONDS) return false;
    if (video.liveBroadcastContent !== "none") return false;
    if (ageInDays(video.publishedAt, now) < COMPETITOR_MIN_AGE_DAYS) return false;
    return true;
  });
}

export function scoreAgainstMedian(views: number, median: number | null, sampleCount: number): { score: number | null; viral: boolean } {
  if (sampleCount < COMPETITOR_MIN_SAMPLE || median === null || median < COMPETITOR_MIN_MEDIAN_VIEWS) {
    return { score: null, viral: false };
  }
  const score = performanceScore(views, median);
  if (score === null) return { score: null, viral: false };
  return { score, viral: score > COMPETITOR_SCORE_CAP };
}

export function rankingKey(score: number | null, searchRank: number, ageDays: number, viewCount = 20_000): number | null {
  return swipeRankKey({ score, searchRank, ageDays, viewCount });
}

function dedupe(videos: readonly ScoredVideo[]): ScoredVideo[] {
  const seen = new Set<string>();
  const out: ScoredVideo[] = [];
  for (const video of videos) {
    if (seen.has(video.videoId)) continue;
    seen.add(video.videoId);
    out.push(video);
  }
  return out;
}

export function sortCompetitors(videos: readonly ScoredVideo[]): ScoredVideo[] {
  return [...videos].sort((a, b) => {
    const ka = rankingKey(a.score, a.searchRank, a.ageDays, a.views);
    const kb = rankingKey(b.score, b.searchRank, b.ageDays, b.views);
    if (ka === null && kb === null) return a.searchRank - b.searchRank;
    if (ka === null) return 1;
    if (kb === null) return -1;
    return kb - ka;
  });
}

/** Top 12, keeping at least 4 FR when they exist. FR search is applied first so duplicates keep the FR row. */
export function pickTopCompetitors(videos: readonly ScoredVideo[]): CompetitorHit[] {
  const unique = sortCompetitors(dedupe(videos));
  const fr = unique.filter((video) => video.lang === "fr");
  const chosen: ScoredVideo[] = unique.slice(0, COMPETITOR_MAX_RESULTS);
  let frCount = chosen.filter((video) => video.lang === "fr").length;
  const unusedFr = fr.filter((video) => !chosen.some((row) => row.videoId === video.videoId));
  while (frCount < COMPETITOR_MIN_FR && unusedFr.length > 0 && chosen.length > 0) {
    const replaceAt = [...chosen].reverse().findIndex((video) => video.lang !== "fr");
    if (replaceAt < 0) break;
    const index = chosen.length - 1 - replaceAt;
    chosen[index] = unusedFr.shift()!;
    frCount += 1;
  }
  if (chosen.length < COMPETITOR_MAX_RESULTS) {
    // already the whole pool
  }
  return chosen.slice(0, COMPETITOR_MAX_RESULTS).map((video) => ({
    videoId: video.videoId,
    title: video.title,
    channel: video.channel,
    channelId: video.channelId,
    lang: video.lang,
    views: video.views,
    score: video.score,
    ageDays: video.ageDays,
    searchRank: video.searchRank,
    viral: video.viral,
  }));
}

export function formatCompetitorLine(hit: CompetitorHit): string {
  const score = hit.score === null ? "peu de données" : `×${hit.score.toFixed(1).replace(".", ",")}${hit.viral ? " viral atypique" : ""}`;
  return `youtube:${hit.videoId} | ${hit.channel} | ${hit.views} | ${score} | ${hit.ageDays} j | ${hit.lang}`;
}

export function publishedAfterIso(now: Date): string {
  const months = COMPETITOR_PUBLISHED_AFTER_MONTHS;
  const date = new Date(now.getTime());
  date.setMonth(date.getMonth() - months);
  return date.toISOString();
}
