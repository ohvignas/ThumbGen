import { describe, expect, it } from "vitest";
import {
  ageInDays,
  channelMedianViews,
  isRecent,
  median,
  performanceBand,
  performanceScore,
  recentCutoffIso,
  videoPerformance,
  viewsPerDay,
} from "@/lib/youtube/performance";

const NOW = new Date("2026-09-16T12:00:00.000Z");
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

describe("median", () => {
  it("takes the middle value of an odd list", () => {
    expect(median([30, 10, 20])).toBe(20);
  });

  it("averages the two middle values of an even list", () => {
    expect(median([40, 10, 30, 20])).toBe(25);
  });

  it("is null for an empty list", () => {
    expect(median([])).toBeNull();
  });

  it("leaves the caller's array untouched", () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe("recent videos", () => {
  it("counts fractional days since publication", () => {
    expect(ageInDays(daysAgo(1.5), NOW)).toBeCloseTo(1.5);
  });

  it("is recent under 7 days and old from 7 days on", () => {
    expect(isRecent(daysAgo(6.9), NOW)).toBe(true);
    expect(isRecent(daysAgo(7), NOW)).toBe(false);
  });

  it("exposes the cutoff 7 days back as an ISO date", () => {
    expect(recentCutoffIso(NOW)).toBe("2026-09-09T12:00:00.000Z");
  });
});

describe("channelMedianViews", () => {
  it("ignores videos published less than 7 days ago", () => {
    const videos = [
      { publishedAt: daysAgo(1), viewCount: 1_000_000 },
      { publishedAt: daysAgo(10), viewCount: 100 },
      { publishedAt: daysAgo(20), viewCount: 300 },
    ];
    expect(channelMedianViews(videos, NOW)).toBe(200);
  });

  it("keeps only the 50 most recent old videos, whatever the input order", () => {
    const videos = Array.from({ length: 60 }, (_, index) => ({
      publishedAt: daysAgo(8 + index),
      viewCount: 1000 + index,
    })).reverse();
    // The 50 most recent are indexes 0..49 → views 1000..1049 → median 1024.5
    expect(channelMedianViews(videos, NOW)).toBe(1024.5);
  });

  it("uses every old video when there are fewer than 50", () => {
    const videos = [
      { publishedAt: daysAgo(9), viewCount: 10 },
      { publishedAt: daysAgo(30), viewCount: 30 },
    ];
    expect(channelMedianViews(videos, NOW)).toBe(20);
  });

  it("is null when every video is recent", () => {
    expect(channelMedianViews([{ publishedAt: daysAgo(2), viewCount: 50 }], NOW)).toBeNull();
  });
});

describe("performanceScore", () => {
  it("divides by the channel median and rounds to one decimal", () => {
    expect(performanceScore(1_234, 1_000)).toBe(1.2);
    expect(performanceScore(400, 1_000)).toBe(0.4);
    expect(performanceScore(8_460, 1_000)).toBe(8.5);
  });

  it("has no score without a positive median", () => {
    expect(performanceScore(500, null)).toBeNull();
    expect(performanceScore(500, 0)).toBeNull();
  });
});

describe("performanceBand", () => {
  it("splits at ×3 and ×0.5", () => {
    expect(performanceBand(3)).toBe("over");
    expect(performanceBand(8.5)).toBe("over");
    expect(performanceBand(2.9)).toBe("neutral");
    expect(performanceBand(0.5)).toBe("neutral");
    expect(performanceBand(0.4)).toBe("under");
  });
});

describe("viewsPerDay", () => {
  it("divides views by the days since publication", () => {
    expect(viewsPerDay(1_700, daysAgo(2), NOW)).toBe(850);
  });

  it("counts at least one day for a video published a few hours ago", () => {
    expect(viewsPerDay(300, daysAgo(0.1), NOW)).toBe(300);
  });
});

describe("videoPerformance", () => {
  it("shows views per day for a recent video", () => {
    expect(videoPerformance({ publishedAt: daysAgo(2), viewCount: 1_700 }, 1_000, NOW)).toEqual({
      kind: "recent",
      viewsPerDay: 850,
    });
  });

  it("scores an older video with its band", () => {
    expect(videoPerformance({ publishedAt: daysAgo(30), viewCount: 3_000 }, 1_000, NOW)).toEqual({
      kind: "scored",
      score: 3,
      band: "over",
    });
  });

  it("has nothing to show when the median is unknown", () => {
    expect(videoPerformance({ publishedAt: daysAgo(30), viewCount: 3_000 }, null, NOW)).toEqual({ kind: "none" });
  });
});
