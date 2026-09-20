import { jevWhyPackage } from "@/lib/typesafe/why-package";
import { getChannel, getVideo } from "./channel-store";
import { fetchVideoCaptions } from "./captions";
import { extractHook } from "./hook-extract";
import { videoPerformance, type VideoPerformance } from "./performance";
import { latestSnapshotPairs, type SnapshotPair } from "./stat-snapshots";
import type { WhyCaptions, WhyDisclaimer, WhyFacts, WhyVideoResponse } from "./types";
import { classifyVideoFormat } from "./video-formats";
import { resolveViewsPerHour } from "./working-subject";

export type WhyFactsInput = {
  title: string;
  description: string;
  durationSeconds: number;
  viewCount: number;
  publishedAt: string;
  medianViews: number | null;
  snapshots: SnapshotPair | null;
};

export function buildWhyFacts(input: WhyFactsInput, now: Date): WhyFacts {
  const performance: VideoPerformance = videoPerformance(
    { publishedAt: input.publishedAt, viewCount: input.viewCount },
    input.medianViews,
    now,
  );
  const resolved = resolveViewsPerHour(
    { viewCount: input.viewCount, publishedAt: input.publishedAt, snapshots: input.snapshots },
    now,
  );
  return {
    overperformance: performance.kind === "scored" ? performance.score : null,
    performance,
    viewsPerHour: resolved.viewsPerHour,
    velocityKind: resolved.kind,
    formatId: classifyVideoFormat(input.title, input.description, input.durationSeconds),
    disclaimer: "no_studio" satisfies WhyDisclaimer,
  };
}

function excerptText(text: string, max = 220): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1).trimEnd()}…`;
}

export async function composeWhyVideo(
  videoId: string,
  now: Date = new Date(),
  signal?: AbortSignal,
): Promise<WhyVideoResponse | null> {
  const video = getVideo(videoId);
  if (!video) return null;
  const channel = getChannel(video.channel_id);
  if (!channel) return null;
  const snapshots = latestSnapshotPairs([videoId]).get(videoId) ?? null;
  const facts = buildWhyFacts(
    {
      title: video.title,
      description: video.description ?? "",
      durationSeconds: video.duration_seconds,
      viewCount: video.view_count,
      publishedAt: video.published_at,
      medianViews: channel.median_views,
      snapshots,
    },
    now,
  );
  const fetched = await fetchVideoCaptions(videoId);
  const hook = extractHook(fetched.cues);
  const captions: WhyCaptions = {
    status: fetched.status,
    kind: fetched.kind,
    language: fetched.language,
    quotes: hook.quotes,
    hookText: hook.hookText,
  };
  const jev = await jevWhyPackage(
    {
      title: video.title,
      descriptionExcerpt: excerptText(video.description ?? ""),
      hookText: hook.hookText,
      hookQuotes: hook.quotes,
      captionKind: fetched.kind,
      language: fetched.language,
      overperformance: facts.overperformance,
      performanceKind: facts.performance.kind,
      viewsPerHour: facts.viewsPerHour,
      velocityKind: facts.velocityKind,
    },
    signal,
  );
  return { videoId, facts, captions, jev };
}
