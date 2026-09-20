/**
 * « 🏆 Tendance Youtube » — top performing followed long-form videos from the last 7 days.
 * Not a shared-topic cluster. Not Shorts. Not ×0 / sous-performers.
 * Rank = swipeRankKey(views ÷ channel median). Missing median is not a score
 * (no log2(views) fallback — that scale beats real ×N and surfaces flops).
 * « ça grimpe » is a label from snapshot deltas (≥2 relevés), never a hard exclude.
 * TypeSafe Jev does not compute ×N or velocity. It only Choice-classifies format
 * and Score-grades packaging after code has attached those facts.
 */

import { ageInDays, median, performanceScore, UNDERPERFORM_SCORE } from "./performance";
import type { SnapshotPair, StatSnapshotPoint } from "./stat-snapshots";
import { compareSwipeRank, swipeRankKey } from "./swipe-rank";
import { WORKING_VIDEO_COUNT } from "./types";
import { isYouTubeShort } from "./video-formats";

export const TREND_WINDOW_DAYS = 7;
export const TREND_MATURE_HOURS = TREND_WINDOW_DAYS * 24;
export const TREND_SUBJECT_ID = "tendance";

export type VelocityKind = "delta" | "average";

export type WorkingSubjectVideo = {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  description?: string | null;
  publishedAt: string;
  viewCount: number;
  thumbnailUrl: string;
  durationSeconds: number;
  medianViews: number | null;
  snapshots?: SnapshotPair | null;
};

export type RisingHit = WorkingSubjectVideo & {
  overperformance: number | null;
  viewsPerHour: number;
  velocityKind: VelocityKind;
  velocity: number | null;
  rank: number;
  formatId?: string;
  jevNote?: number | null;
};

export type WorkingSubjectHit = {
  subjectId: string;
  label: string;
  channelCount: number;
  medianScore: number | null;
  why: string;
  videoIds: string[];
};

export type WorkingSubjectResult = {
  subject: WorkingSubjectHit | null;
  suggested: RisingHit[];
};

/** Hours online, floored at 1 so a just-published row cannot explode VPH. */
export function hoursSincePublish(publishedAt: string, now: Date): number {
  const published = Date.parse(publishedAt);
  if (Number.isNaN(published)) return 1;
  return Math.max(1, (now.getTime() - published) / 3_600_000);
}

export function viewsPerHour(viewCount: number, publishedAt: string, now: Date): number {
  return viewCount / hoursSincePublish(publishedAt, now);
}

/** Channel typical VPH if the median were earned across the 7-day window. */
export function channelTypicalVph(medianViews: number): number | null {
  if (!(medianViews > 0)) return null;
  return medianViews / TREND_MATURE_HOURS;
}

export function workingOverperformance(video: Pick<WorkingSubjectVideo, "viewCount" | "medianViews">): number | null {
  return performanceScore(video.viewCount, video.medianViews);
}

export function intervalViewsPerHour(previous: StatSnapshotPoint, latest: StatSnapshotPoint): number {
  const started = Date.parse(previous.capturedAt);
  const ended = Date.parse(latest.capturedAt);
  const hours = Number.isFinite(started) && Number.isFinite(ended) ? (ended - started) / 3_600_000 : 1;
  return (latest.viewCount - previous.viewCount) / Math.max(1, hours);
}

export function resolveViewsPerHour(
  video: Pick<WorkingSubjectVideo, "viewCount" | "publishedAt" | "snapshots">,
  now: Date,
): { viewsPerHour: number; kind: VelocityKind } {
  const previous = video.snapshots?.previous;
  const latest = video.snapshots?.latest;
  if (previous && latest) return { viewsPerHour: intervalViewsPerHour(previous, latest), kind: "delta" };
  return { viewsPerHour: viewsPerHour(video.viewCount, video.publishedAt, now), kind: "average" };
}

export function trendVelocity(video: Pick<WorkingSubjectVideo, "viewCount" | "medianViews" | "publishedAt">, now: Date): number | null {
  const typical = video.medianViews === null ? null : channelTypicalVph(video.medianViews);
  if (typical === null || typical <= 0) return null;
  return viewsPerHour(video.viewCount, video.publishedAt, now) / typical;
}

export function trendRankKey(
  video: Pick<WorkingSubjectVideo, "viewCount" | "medianViews" | "publishedAt">,
  now: Date,
): number | null {
  if (!(video.viewCount > 0)) return null;
  return swipeRankKey({
    score: workingOverperformance(video),
    ageDays: ageInDays(video.publishedAt, now),
    viewCount: video.viewCount,
  });
}

export function scoreTrendVideo(video: WorkingSubjectVideo, now: Date): RisingHit | null {
  if (ageInDays(video.publishedAt, now) >= TREND_WINDOW_DAYS) return null;
  if (!(video.viewCount > 0)) return null;
  if (isYouTubeShort(video.title, video.description, video.durationSeconds)) return null;
  const overperformance = workingOverperformance(video);
  if (overperformance === null || overperformance < UNDERPERFORM_SCORE) return null;
  const rank = trendRankKey(video, now);
  if (rank === null) return null;
  const resolved = resolveViewsPerHour(video, now);
  const typical = video.medianViews === null ? null : channelTypicalVph(video.medianViews);
  return {
    ...video,
    overperformance,
    viewsPerHour: resolved.viewsPerHour,
    velocityKind: resolved.kind,
    velocity: typical && typical > 0 ? resolved.viewsPerHour / typical : null,
    rank,
  };
}

export function scoreTrendVideos(videos: readonly WorkingSubjectVideo[], now: Date = new Date()): RisingHit[] {
  return videos.flatMap((video) => {
    const hit = scoreTrendVideo(video, now);
    return hit ? [hit] : [];
  });
}

function formatWhyScore(score: number): string {
  return score.toFixed(1).replace(".", ",");
}

function formatWhyVph(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(".", ",")} k vues/h`;
  return `${Math.round(value)} vues/h`;
}

export function workingSubjectWhy(input: {
  channelCount: number;
  medianScore: number | null;
  viewsPerHour: number | null;
  velocityKind: VelocityKind | null;
}): string {
  const parts = [`${input.channelCount} chaîne${input.channelCount > 1 ? "s" : ""}`];
  if (input.medianScore !== null) parts.push(`×${formatWhyScore(input.medianScore)} vs médiane`);
  if (input.velocityKind === "delta") parts.push("ça grimpe");
  else if (input.velocityKind === "average") parts.push("moy. depuis publication");
  if (input.viewsPerHour !== null) parts.push(formatWhyVph(input.viewsPerHour));
  parts.push("7 j");
  return parts.join(" · ");
}

function compareHits(left: RisingHit, right: RisingHit): number {
  const byRank = compareSwipeRank(left.rank, right.rank);
  if (byRank !== 0) return byRank;
  return Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
}

/** Global top N by numeric rank. No channel-diversity pass. Never pads. */
export function pickTrendVideos(hits: readonly RisingHit[], limit = WORKING_VIDEO_COUNT): RisingHit[] {
  return [...hits].sort(compareHits).slice(0, limit);
}

export function buildTrendSubject(hits: readonly RisingHit[]): WorkingSubjectHit | null {
  if (hits.length === 0) return null;
  const channels = new Set(hits.map((hit) => hit.channelId));
  const scores = hits.map((hit) => hit.overperformance).filter((score): score is number => score !== null);
  const vphs = hits.map((hit) => hit.viewsPerHour);
  const middle = median(scores);
  const medianScore = middle === null ? null : Math.round(middle * 10) / 10;
  const midVph = median(vphs);
  const climbKind = hits.every((hit) => hit.velocityKind === "delta") ? "delta" : "average";
  return {
    subjectId: TREND_SUBJECT_ID,
    label: "En hausse",
    channelCount: channels.size,
    medianScore,
    why: workingSubjectWhy({
      channelCount: channels.size,
      medianScore,
      viewsPerHour: midVph,
      velocityKind: climbKind,
    }),
    videoIds: hits.map((hit) => hit.videoId),
  };
}

export function rankRisingTrend(
  videos: readonly WorkingSubjectVideo[],
  now: Date = new Date(),
): WorkingSubjectResult {
  const picked = pickTrendVideos(scoreTrendVideos(videos, now));
  return { subject: buildTrendSubject(picked), suggested: picked };
}
