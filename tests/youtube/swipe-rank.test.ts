import { describe, expect, it } from "vitest";
import { applyJevNudge, compareSwipeRank, swipeBaseline, swipeRankKey } from "@/lib/youtube/swipe-rank";

describe("swipeBaseline", () => {
  it("uses the channel median when the sample is solid", () => {
    expect(swipeBaseline({ medianViews: 8_000, sampleCount: 12, subscriberCount: 50_000 })).toBe(8_000);
  });

  it("falls back to a quarter of subscribers", () => {
    expect(swipeBaseline({ medianViews: 200, sampleCount: 20, subscriberCount: 8_000 })).toBe(2_000);
    expect(swipeBaseline({ medianViews: null, sampleCount: 0, subscriberCount: 500 })).toBeNull();
  });
});

describe("swipeRankKey", () => {
  it("puts a current ×3 with real volume ahead of an old ×30 catalog hit", () => {
    const current = swipeRankKey({ score: 3, ageDays: 21, viewCount: 240_000 })!;
    const fossil = swipeRankKey({ score: 30, ageDays: 900, viewCount: 2_400_000 })!;
    expect(current).toBeGreaterThan(fossil);
  });

  it("caps the ratio so a ×40 does not beat ×20", () => {
    expect(swipeRankKey({ score: 40, ageDays: 30, viewCount: 20_000 })).toBeCloseTo(
      swipeRankKey({ score: 20, ageDays: 30, viewCount: 20_000 })!,
      8,
    );
  });

  it("returns null when there is no score", () => {
    expect(swipeRankKey({ score: null, ageDays: 20, viewCount: 10_000 })).toBeNull();
  });
});

describe("applyJevNudge", () => {
  it("keeps the numeric rank when Jev is silent", () => {
    expect(applyJevNudge(2, undefined)).toBe(2);
  });

  it("raises a high noul above a low noul on the same rank", () => {
    expect(applyJevNudge(2, 0.9)!).toBeGreaterThan(applyJevNudge(2, 0.1)!);
  });
});

describe("compareSwipeRank", () => {
  it("sorts nulls last", () => {
    expect(compareSwipeRank(1, null)).toBeLessThan(0);
    expect(compareSwipeRank(null, 1)).toBeGreaterThan(0);
  });
});
