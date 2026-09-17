/**
 * Performance maths for followed-channel videos (chantier D §3), pure and
 * client-safe. A score compares a video's views with the median views of its
 * channel's recent long-form videos, like vidIQ / OutlierKit / 1of10.
 */

export const RECENT_DAYS = 7;
export const MEDIAN_SAMPLE_SIZE = 50;
export const OVERPERFORM_SCORE = 3;
export const UNDERPERFORM_SCORE = 0.5;

const DAY_MS = 24 * 60 * 60 * 1000;

export type PerformanceBand = "over" | "neutral" | "under";

export type ViewSample = { publishedAt: string; viewCount: number };

export type VideoPerformance =
  | { kind: "scored"; score: number; band: PerformanceBand }
  | { kind: "recent"; viewsPerDay: number }
  | { kind: "none" };

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function ageInDays(publishedAt: string, now: Date): number {
  const published = Date.parse(publishedAt);
  if (Number.isNaN(published)) return 0;
  return Math.max(0, (now.getTime() - published) / DAY_MS);
}

/** Published less than 7 days ago: too early for a score. */
export function isRecent(publishedAt: string, now: Date): boolean {
  return ageInDays(publishedAt, now) < RECENT_DAYS;
}

/** Videos published at or before this instant are old enough to be scored. */
export function recentCutoffIso(now: Date): string {
  return new Date(now.getTime() - RECENT_DAYS * DAY_MS).toISOString();
}

/** Median views of the 50 latest videos published more than 7 days ago (all of them if fewer). */
export function channelMedianViews(videos: readonly ViewSample[], now: Date): number | null {
  const sample = videos
    .filter((video) => !isRecent(video.publishedAt, now))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, MEDIAN_SAMPLE_SIZE)
    .map((video) => video.viewCount);
  return median(sample);
}

export function performanceScore(viewCount: number, medianViews: number | null): number | null {
  if (medianViews === null || !(medianViews > 0)) return null;
  return Math.round((viewCount / medianViews) * 10) / 10;
}

export function performanceBand(score: number): PerformanceBand {
  if (score >= OVERPERFORM_SCORE) return "over";
  if (score < UNDERPERFORM_SCORE) return "under";
  return "neutral";
}

/** Views divided by days online, counting at least one day. */
export function viewsPerDay(viewCount: number, publishedAt: string, now: Date): number {
  return Math.round(viewCount / Math.max(1, ageInDays(publishedAt, now)));
}

export function videoPerformance(video: ViewSample, medianViews: number | null, now: Date): VideoPerformance {
  if (isRecent(video.publishedAt, now)) {
    return { kind: "recent", viewsPerDay: viewsPerDay(video.viewCount, video.publishedAt, now) };
  }
  const score = performanceScore(video.viewCount, medianViews);
  if (score === null) return { kind: "none" };
  return { kind: "scored", score, band: performanceBand(score) };
}
