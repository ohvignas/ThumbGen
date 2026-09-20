import { describe, expect, it } from "vitest";
import {
  TREND_SUBJECT_ID,
  hoursSincePublish,
  intervalViewsPerHour,
  pickTrendVideos,
  rankRisingTrend,
  resolveViewsPerHour,
  scoreTrendVideo,
  scoreTrendVideos,
  trendRankKey,
  viewsPerHour,
  workingOverperformance,
  workingSubjectWhy,
  type WorkingSubjectVideo,
} from "@/lib/youtube/working-subject";

const NOW = new Date("2026-09-19T12:00:00.000Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();
const daysAgo = (days: number) => hoursAgo(days * 24);

const video = (
  partial: Pick<WorkingSubjectVideo, "videoId" | "channelId" | "title"> & Partial<WorkingSubjectVideo>,
): WorkingSubjectVideo => ({
  channelTitle: partial.channelTitle ?? partial.channelId,
  description: partial.description ?? "",
  publishedAt: partial.publishedAt ?? daysAgo(2),
  viewCount: partial.viewCount ?? 4_000,
  thumbnailUrl: `https://i.ytimg.com/vi/${partial.videoId}/mqdefault.jpg`,
  durationSeconds: partial.durationSeconds ?? 600,
  medianViews: partial.medianViews ?? 1_000,
  ...partial,
});

describe("hoursSincePublish", () => {
  it("floors at one hour so a brand-new row cannot explode VPH", () => {
    expect(hoursSincePublish(hoursAgo(0.1), NOW)).toBe(1);
    expect(hoursSincePublish(hoursAgo(48), NOW)).toBe(48);
  });
});

describe("resolveViewsPerHour", () => {
  it("uses the snapshot delta when two relevés exist, else the lifetime average", () => {
    const climbing = video({
      videoId: "hot",
      channelId: "a",
      title: "Hot",
      viewCount: 6_000,
      publishedAt: hoursAgo(48),
      snapshots: {
        latest: { capturedAt: hoursAgo(1), viewCount: 6_000, likeCount: 10 },
        previous: { capturedAt: hoursAgo(5), viewCount: 4_000, likeCount: 8 },
      },
    });
    expect(intervalViewsPerHour(climbing.snapshots!.previous!, climbing.snapshots!.latest)).toBe(500);
    expect(resolveViewsPerHour(climbing, NOW)).toEqual({ viewsPerHour: 500, kind: "delta" });
    expect(viewsPerHour(6_000, hoursAgo(48), NOW)).toBe(125);
    expect(resolveViewsPerHour(video({ videoId: "one", channelId: "a", title: "One", viewCount: 6_000, publishedAt: hoursAgo(48) }), NOW)).toEqual({
      viewsPerHour: 125,
      kind: "average",
    });
  });
});

describe("scoreTrendVideo ranking", () => {
  it("keeps an at-median 7-day long-form and drops dead, old, Shorts, and sous-performers", () => {
    const flat = scoreTrendVideo(video({ videoId: "flat", channelId: "a", title: "Flat", viewCount: 1_000 }), NOW);
    expect(flat).not.toBeNull();
    expect(flat?.velocityKind).toBe("average");
    expect(scoreTrendVideo(video({ videoId: "zero", channelId: "a", title: "Zero", viewCount: 0 }), NOW)).toBeNull();
    expect(scoreTrendVideo(video({ videoId: "old", channelId: "a", title: "Old", viewCount: 80_000, publishedAt: daysAgo(20) }), NOW)).toBeNull();
    expect(
      scoreTrendVideo(
        video({ videoId: "short", channelId: "a", title: "Tu veux des résultats différents", viewCount: 800, durationSeconds: 45 }),
        NOW,
      ),
    ).toBeNull();
    expect(
      scoreTrendVideo(video({ videoId: "hash", channelId: "a", title: "Astuce #shorts", viewCount: 8_000, durationSeconds: 180 }), NOW),
    ).toBeNull();
    expect(
      scoreTrendVideo(video({ videoId: "under", channelId: "a", title: "Under", viewCount: 400, medianViews: 1_000 }), NOW),
    ).toBeNull();
    expect(
      scoreTrendVideo(video({ videoId: "zero-x", channelId: "a", title: "Tiny vs median", viewCount: 40, medianViews: 10_000 }), NOW),
    ).toBeNull();
    expect(
      scoreTrendVideo(video({ videoId: "no-med", channelId: "a", title: "No median", viewCount: 80_000, medianViews: null }), NOW),
    ).toBeNull();
  });

  it("ranks by swipe / overperformance, not by a velocity gate or log2(views)", () => {
    const smash = video({ videoId: "smash", channelId: "a", title: "Smash", viewCount: 6_000, publishedAt: hoursAgo(48) });
    const drip = video({ videoId: "drip", channelId: "a", title: "Drip", viewCount: 1_100, publishedAt: hoursAgo(144) });
    expect(workingOverperformance(smash)).toBe(6);
    expect(trendRankKey(smash, NOW)!).toBeGreaterThan(trendRankKey(drip, NOW)!);
    const zeroX = video({
      videoId: "zero-x",
      channelId: "big",
      title: "How to Build Codex Skills",
      viewCount: 31_000,
      medianViews: 1_000_000,
      publishedAt: hoursAgo(160),
    });
    expect(workingOverperformance(zeroX)).toBe(0);
    expect(trendRankKey(zeroX, NOW)).toBeNull();
    expect(trendRankKey(smash, NOW)!).toBeGreaterThan(0);
  });
});

describe("workingSubjectWhy", () => {
  it("never claims ça grimpe on a lifetime average", () => {
    expect(
      workingSubjectWhy({ channelCount: 3, medianScore: 4.2, viewsPerHour: 180, velocityKind: "average" }),
    ).toBe("3 chaînes · ×4,2 vs médiane · moy. depuis publication · 180 vues/h · 7 j");
    expect(
      workingSubjectWhy({ channelCount: 2, medianScore: 4.2, viewsPerHour: 500, velocityKind: "delta" }),
    ).toBe("2 chaînes · ×4,2 vs médiane · ça grimpe · 500 vues/h · 7 j");
    expect(workingSubjectWhy({ channelCount: 1, medianScore: null, viewsPerHour: null, velocityKind: null })).toBe("1 chaîne · 7 j");
  });
});

describe("pickTrendVideos", () => {
  it("takes the global top 4 even when two come from the same channel, and does not pad", () => {
    const hits = scoreTrendVideos(
      [
        video({ videoId: "a-best", channelId: "a", title: "A smash", viewCount: 9_000, publishedAt: hoursAgo(40) }),
        video({ videoId: "a-mid", channelId: "a", title: "A mid", viewCount: 5_000, publishedAt: hoursAgo(36) }),
        video({ videoId: "b", channelId: "b", title: "B", viewCount: 4_000, medianViews: 1_000, publishedAt: hoursAgo(24) }),
        video({ videoId: "c", channelId: "c", title: "C", viewCount: 3_000, publishedAt: hoursAgo(20) }),
      ],
      NOW,
    );
    expect(pickTrendVideos(hits, 4).map((item) => item.videoId)).toEqual(["a-best", "a-mid", "b", "c"]);
    expect(pickTrendVideos(hits.slice(0, 2), 4)).toHaveLength(2);
  });
});

describe("rankRisingTrend", () => {
  it("returns the top performing 7-day followed videos, never a shared-subject cluster", () => {
    const { subject, suggested } = rankRisingTrend(
      [
        video({ videoId: "hot-a", channelId: "a", title: "Cursor smash", viewCount: 8_000, publishedAt: hoursAgo(36) }),
        video({ videoId: "hot-b", channelId: "b", title: "Claude smash", viewCount: 6_000, medianViews: 1_000, publishedAt: hoursAgo(24) }),
        video({ videoId: "hot-c", channelId: "c", title: "Liste smash", viewCount: 3_000, publishedAt: hoursAgo(20) }),
        video({ videoId: "old", channelId: "a", title: "Cursor archive", viewCount: 80_000, publishedAt: daysAgo(20) }),
        video({ videoId: "slow", channelId: "d", title: "Cursor drip", viewCount: 1_100, publishedAt: hoursAgo(160) }),
        video({ videoId: "under", channelId: "e", title: "Under", viewCount: 400, publishedAt: hoursAgo(12) }),
        video({ videoId: "short", channelId: "f", title: "Tu veux des résultats #shorts", viewCount: 20_000, durationSeconds: 32 }),
        video({ videoId: "dead", channelId: "g", title: "Dead", viewCount: 0, publishedAt: hoursAgo(6) }),
      ],
      NOW,
    );
    expect(subject?.subjectId).toBe(TREND_SUBJECT_ID);
    expect(subject?.label).toBe("En hausse");
    expect(subject?.why).toMatch(/moy\. depuis publication/);
    expect(subject?.why).not.toMatch(/ça grimpe/);
    expect(suggested.map((item) => item.videoId)).toEqual(["hot-a", "hot-b", "hot-c", "slow"]);
    expect(suggested).toHaveLength(4);
    expect(suggested.every((item) => (item.overperformance ?? 0) >= 0.5)).toBe(true);
  });

  it("does not pad Tendance with a lonely sous-performer or a Short", () => {
    const emptyUnder = rankRisingTrend([video({ videoId: "only", channelId: "a", title: "Sous", viewCount: 200, medianViews: 1_000 })], NOW);
    expect(emptyUnder.suggested).toEqual([]);
    expect(emptyUnder.subject).toBeNull();

    const emptyShort = rankRisingTrend(
      [video({ videoId: "clip", channelId: "a", title: "Format court hook", viewCount: 8_000, durationSeconds: 38 })],
      NOW,
    );
    expect(emptyShort.suggested).toEqual([]);
    expect(emptyShort.subject).toBeNull();
  });

  it("labels ça grimpe only when every picked tile has a delta", () => {
    const { subject, suggested } = rankRisingTrend(
      [
        video({
          videoId: "d1",
          channelId: "a",
          title: "Delta one",
          viewCount: 8_000,
          publishedAt: hoursAgo(36),
          snapshots: {
            latest: { capturedAt: hoursAgo(1), viewCount: 8_000, likeCount: null },
            previous: { capturedAt: hoursAgo(5), viewCount: 5_000, likeCount: null },
          },
        }),
        video({
          videoId: "d2",
          channelId: "b",
          title: "Delta two",
          viewCount: 6_000,
          publishedAt: hoursAgo(24),
          snapshots: {
            latest: { capturedAt: hoursAgo(1), viewCount: 6_000, likeCount: null },
            previous: { capturedAt: hoursAgo(5), viewCount: 4_000, likeCount: null },
          },
        }),
      ],
      NOW,
    );
    expect(suggested.every((item) => item.velocityKind === "delta")).toBe(true);
    expect(subject?.why).toMatch(/ça grimpe/);
    expect(subject?.why).not.toMatch(/moy\. depuis publication/);
  });
});
