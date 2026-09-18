import { describe, it, expect } from "vitest";
import {
  filterCompetitors,
  formatCompetitorLine,
  pickTopCompetitors,
  rankingKey,
  scoreAgainstMedian,
  type RankableVideo,
  type ScoredVideo,
} from "@/lib/brief/competitor-rank";

const NOW = new Date("2026-09-17T12:00:00.000Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function video(overrides: Partial<RankableVideo> & { videoId: string }): RankableVideo {
  return {
    title: overrides.videoId,
    channel: "Chaîne",
    channelId: `UC${"c".repeat(22)}`,
    lang: "fr",
    views: 1000,
    publishedAt: day(40),
    durationSeconds: 600,
    liveBroadcastContent: "none",
    searchRank: 0,
    ...overrides,
  };
}

function scored(overrides: Partial<ScoredVideo> & { videoId: string }): ScoredVideo {
  const base = video(overrides);
  return { ...base, score: 5, viral: false, ageDays: 40, ...overrides };
}

describe("filterCompetitors", () => {
  it("drops Shorts, lives and videos younger than 14 days", () => {
    const kept = filterCompetitors(
      [
        video({ videoId: "short000001", durationSeconds: 180 }),
        video({ videoId: "live0000001", liveBroadcastContent: "live" }),
        video({ videoId: "young000001", publishedAt: day(13) }),
        video({ videoId: "ok000000001", durationSeconds: 181, publishedAt: day(14) }),
      ],
      NOW,
    );
    expect(kept.map((item) => item.videoId)).toEqual(["ok000000001"]);
  });
});

describe("scoreAgainstMedian", () => {
  it("is peu de données under 8 samples or 500 median views", () => {
    expect(scoreAgainstMedian(10_000, 400, 20)).toEqual({ score: null, viral: false });
    expect(scoreAgainstMedian(10_000, 1000, 7)).toEqual({ score: null, viral: false });
    expect(scoreAgainstMedian(10_000, 1000, 8)).toEqual({ score: 10, viral: false });
  });

  it("flags scores above ×30 as viral and keeps the raw score", () => {
    expect(scoreAgainstMedian(40_000, 1000, 20)).toEqual({ score: 40, viral: true });
  });
});

describe("rankingKey", () => {
  it("uses log2 of the capped score, pertinence and freshness", () => {
    const top = rankingKey(40, 0, 30)!;
    const capped = rankingKey(30, 0, 30)!;
    expect(top).toBeCloseTo(capped, 8);
    expect(rankingKey(8, 10, 30)!).toBeLessThan(rankingKey(8, 9, 30)!);
    expect(rankingKey(null, 0, 30)).toBeNull();
  });
});

describe("pickTopCompetitors", () => {
  it("sorts scored videos first and keeps peu de données at the end", () => {
    const picked = pickTopCompetitors([
      scored({ videoId: "low00000001", score: 2, searchRank: 0 }),
      scored({ videoId: "nodata00001", score: null, searchRank: 1 }),
      scored({ videoId: "high0000001", score: 9, searchRank: 2 }),
    ]);
    expect(picked.map((item) => item.videoId)).toEqual(["high0000001", "low00000001", "nodata00001"]);
  });

  it("dedupes by video id keeping FR first", () => {
    const picked = pickTopCompetitors([
      scored({ videoId: "same0000001", lang: "fr", score: 5 }),
      scored({ videoId: "same0000001", lang: "en", score: 9 }),
    ]);
    expect(picked).toHaveLength(1);
    expect(picked[0].lang).toBe("fr");
  });

  it("keeps at least 4 FR when they exist", () => {
    const pool: ScoredVideo[] = [
      ...Array.from({ length: 10 }, (_, index) =>
        scored({ videoId: `en${String(index).padStart(9, "0")}`, lang: "en", score: 20 - index, searchRank: index }),
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        scored({ videoId: `fr${String(index).padStart(9, "0")}`, lang: "fr", score: 1, searchRank: 20 + index }),
      ),
    ];
    const picked = pickTopCompetitors(pool);
    expect(picked).toHaveLength(12);
    expect(picked.filter((item) => item.lang === "fr")).toHaveLength(4);
  });
});

describe("formatCompetitorLine", () => {
  it("has no image and labels peu de données", () => {
    const line = formatCompetitorLine({
      videoId: "abcdefghijk",
      title: "T",
      channel: "C",
      channelId: "UCx",
      lang: "fr",
      views: 1000,
      score: null,
      ageDays: 40,
      searchRank: 0,
      viral: false,
    });
    expect(line).toBe("youtube:abcdefghijk | C | 1000 | peu de données | 40 j | fr");
    expect(line).not.toMatch(/data:|base64|ytimg/i);
  });
});
