import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import * as store from "@/lib/youtube/channel-store";
import type { ThumbType } from "@/lib/youtube/thumb-types";
import { DEFAULT_VIDEO_QUERY, VIDEO_MAX_LIMIT, VIDEO_PAGE_SIZE, type VideoQuery } from "@/lib/youtube/types";

const jevClickNouls = vi.fn();
const jevTrendJudgments = vi.fn();
vi.mock("@/lib/typesafe/rerank-titles", () => ({
  jevClickNouls: (...args: unknown[]) => jevClickNouls(...args),
  jevTrendJudgments: (...args: unknown[]) => jevTrendJudgments(...args),
}));

const { listVideos, typesSummary, workingSubject } = await import("@/lib/youtube/video-queries");

const NOW = new Date("2026-09-16T12:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

let mineId: string;
let otherId: string;

function addVideo(
  channelId: string,
  videoId: string,
  days: number,
  views: number,
  type: ThumbType | null,
  title = `Titre ${videoId}`,
  description = "",
) {
  store.upsertVideos(
    channelId,
    [
      {
        videoId,
        title,
        description,
        publishedAt: daysAgo(days),
        durationSeconds: 600,
        viewCount: views,
        likeCount: null,
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        liveBroadcastContent: "none",
      },
    ],
    NOW.toISOString(),
  );
  if (type) store.setAiThumbType(videoId, type);
}

const ids = (query: Partial<VideoQuery>) =>
  listVideos({ ...DEFAULT_VIDEO_QUERY, limit: 100, ...query }, NOW).items.map((item) => item.videoId);

beforeEach(() => {
  getDb().exec("DELETE FROM followed_channels");
  getDb().exec("DELETE FROM settings");
  jevClickNouls.mockReset();
  jevClickNouls.mockResolvedValue(new Map());
  jevTrendJudgments.mockReset();
  jevTrendJudgments.mockResolvedValue(new Map());
  mineId = store.insertChannel({ youtubeChannelId: `UC${"q".repeat(22)}`, title: "Ma chaîne", handle: null, avatarUrl: null, subscriberCount: null, videoCount: null }).channel.id;
  otherId = store.insertChannel({ youtubeChannelId: `UC${"r".repeat(22)}`, title: "Autre", handle: null, avatarUrl: null, subscriberCount: null, videoCount: null }).channel.id;
  store.setMineChannel(mineId);
  store.finishSync(mineId, { medianViews: 1_000, syncedAt: NOW.toISOString() });
  store.finishSync(otherId, { medianViews: 10_000, syncedAt: NOW.toISOString() });

  addVideo(mineId, "m-old-hit", 40, 9_000, "face_text", "Cursor 2.0 smash"); // ×9
  addVideo(mineId, "m-old-mid", 100, 1_200, "face_text", "Cursor 2.0 mid"); // ×1.2
  addVideo(mineId, "m-old-low", 200, 300, "versus", "Versus lone"); // ×0.3
  addVideo(mineId, "m-recent", 2, 5_000, null, "Recent fresh"); // recent
  addVideo(mineId, "m-year", 500, 2_000, "reaction", "Reaction archive"); // ×2
  addVideo(otherId, "o-hit", 20, 50_000, "face_text", "Cursor 2.0 hit"); // ×5
  addVideo(otherId, "o-mid", 60, 10_000, null, "Alpha mid"); // ×1
  addVideo(otherId, "o-new", 1, 900, "scene", "Beta new"); // recent
});

describe("listVideos", () => {
  it("sorts by score, recent videos last, then by early traction", () => {
    expect(ids({ sort: "score" })).toEqual(["o-hit", "m-old-hit", "m-year", "m-old-mid", "o-mid", "m-old-low", "m-recent", "o-new"]);
  });

  it("sorts by views and by date", () => {
    expect(ids({ sort: "views" })).toEqual(["o-hit", "o-mid", "m-old-hit", "m-recent", "m-year", "m-old-mid", "o-new", "m-old-low"]);
    expect(ids({ sort: "date" })).toEqual(["o-new", "m-recent", "o-hit", "m-old-hit", "o-mid", "m-old-mid", "m-old-low", "m-year"]);
  });

  it("returns each video with its channel and performance", () => {
    const { items } = listVideos({ ...DEFAULT_VIDEO_QUERY, sort: "date", limit: 100 }, NOW);
    expect(items.find((item) => item.videoId === "m-old-hit")).toEqual({
      videoId: "m-old-hit",
      channelId: mineId,
      channelTitle: "Ma chaîne",
      title: "Cursor 2.0 smash",
      publishedAt: daysAgo(40),
      durationSeconds: 600,
      viewCount: 9_000,
      thumbnailUrl: "https://i.ytimg.com/vi/m-old-hit/mqdefault.jpg",
      thumbType: "face_text",
      thumbTypeSource: "ai",
      performance: { kind: "scored", score: 9, band: "over" },
      description: "",
    });
    expect(items.find((item) => item.videoId === "m-recent")?.performance).toEqual({ kind: "recent", viewsPerDay: 2_500 });
    expect(items.find((item) => item.videoId === "m-old-low")?.performance).toEqual({ kind: "scored", score: 0.3, band: "under" });
  });

  it("filters by types, unclassified included", () => {
    expect(ids({ sort: "date", types: ["face_text"] })).toEqual(["o-hit", "m-old-hit", "m-old-mid"]);
    expect(ids({ sort: "date", types: ["versus", "none"] })).toEqual(["m-recent", "o-mid", "m-old-low"]);
  });

  it("filters by channel, period and title, escaping LIKE wildcards", () => {
    expect(ids({ sort: "date", channelId: otherId })).toEqual(["o-new", "o-hit", "o-mid"]);
    expect(ids({ sort: "date", period: "7d" })).toEqual(["o-new", "m-recent"]);
    expect(ids({ sort: "score", period: "7d" })).toEqual(["m-recent", "o-new"]);
    expect(ids({ sort: "date", period: "30d" })).toEqual(["o-new", "m-recent", "o-hit"]);
    expect(ids({ sort: "date", period: "6m" })).not.toContain("m-old-low");
    expect(ids({ sort: "date", period: "6m" })).not.toContain("m-year");
    expect(ids({ sort: "date", period: "12m" })).not.toContain("m-year");
    expect(ids({ sort: "date", period: "12m" })).toHaveLength(7);
    expect(ids({ sort: "date", q: "Cursor" })).toEqual(["o-hit", "m-old-hit", "m-old-mid"]);
    expect(ids({ q: "_" })).toEqual([]);
    expect(ids({ q: "%" })).toEqual([]);
  });

  it("searches the description locally and filters by closed format", () => {
    addVideo(mineId, "m-secret", 15, 3_000, null, "Titre muet", "Motcachexyz dans la description.");
    addVideo(mineId, "m-tuto", 18, 4_000, null, "Tuto Figma complet");
    expect(ids({ sort: "date", q: "Motcachexyz" })).toEqual(["m-secret"]);
    expect(ids({ sort: "date", format: "tutorial" })).toEqual(["m-tuto"]);
    expect(ids({ sort: "date", format: "comparison" })).toEqual(["m-old-low"]);
  });

  it("filters by an explicit video id list", () => {
    expect(ids({ sort: "date", videoIds: ["m-old-hit", "o-hit"] })).toEqual(["o-hit", "m-old-hit"]);
  });

  it("pages with offset and limit and reports the total", () => {
    const page = listVideos({ ...DEFAULT_VIDEO_QUERY, sort: "date", offset: 2, limit: 3 }, NOW);
    expect(page.items.map((item) => item.videoId)).toEqual(["o-hit", "m-old-hit", "o-mid"]);
    expect(page).toMatchObject({ total: 8, offset: 2, limit: 3 });
  });

  it("clamps limit and offset itself, whatever the caller passes", () => {
    const run = (limit: number, offset: number) => {
      const { items, limit: usedLimit, offset: usedOffset } = listVideos({ ...DEFAULT_VIDEO_QUERY, sort: "date", limit, offset }, NOW);
      return { count: items.length, usedLimit, usedOffset };
    };
    expect(run(0, -5)).toEqual({ count: 1, usedLimit: 1, usedOffset: 0 });
    expect(run(-3, 0)).toEqual({ count: 1, usedLimit: 1, usedOffset: 0 });
    expect(run(50_000, 0)).toEqual({ count: 8, usedLimit: VIDEO_MAX_LIMIT, usedOffset: 0 });
    expect(run(2.9, 6.7)).toEqual({ count: 2, usedLimit: 2, usedOffset: 6 });
    expect(run(Number.NaN, Number.NaN)).toEqual({ count: 8, usedLimit: VIDEO_PAGE_SIZE, usedOffset: 0 });
  });
});

describe("workingSubject", () => {
  it("returns the top 7-day followed long-form videos that actually perform", async () => {
    addVideo(otherId, "o-hot", 1, 40_000, null, "Claude smash");
    addVideo(mineId, "m-short", 1, 12_000, null, "Tu veux des résultats différents");
    getDb().prepare("UPDATE channel_videos SET duration_seconds = 38 WHERE video_id = 'm-short'").run();
    const result = await workingSubject(NOW);
    expect(result.period).toBe("7d");
    expect(result.jevUsed).toBe(false);
    expect(result.subject?.subjectId).toBe("tendance");
    expect(result.subject?.why).toMatch(/moy\. depuis publication/);
    expect(result.videos.map((item) => item.videoId)).toEqual(["o-hot", "m-recent"]);
    expect(result.videos.map((item) => item.videoId)).not.toContain("o-new");
    expect(result.videos.map((item) => item.videoId)).not.toContain("m-short");
    expect(result.videos.length).toBeLessThanOrEqual(4);
    expect(result.videos.every((item) => item.velocityKind === "average")).toBe(true);
    expect(result.videos.every((item) => (item.overperformance ?? 0) >= 0.5)).toBe(true);
    expect(jevTrendJudgments).toHaveBeenCalled();
  });

  it("returns an empty Tendance when the only 7-day rows are sous-performers", async () => {
    getDb().exec("DELETE FROM channel_videos");
    addVideo(otherId, "o-drip", 2, 900, null, "Under median");
    const result = await workingSubject(NOW);
    expect(result.videos).toEqual([]);
    expect(result.subject).toBeNull();
    expect(result.jevUsed).toBe(false);
  });

  it("attaches mocked Jev format and note without asking Jev to compute ×N", async () => {
    addVideo(otherId, "o-hot", 1, 40_000, null, "Claude smash");
    jevTrendJudgments.mockResolvedValueOnce(
      new Map([
        ["m-recent", { formatId: "tutorial", note: 9, score01: 0.99 }],
        ["o-hot", { formatId: "commentary", note: 2, score01: 0.01 }],
      ]),
    );
    const nudged = await workingSubject(NOW);
    expect(nudged.jevUsed).toBe(true);
    expect(nudged.videos.find((item) => item.videoId === "m-recent")).toMatchObject({
      formatId: "tutorial",
      jevNote: 9,
    });
    expect(jevTrendJudgments.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([expect.objectContaining({ videoId: "o-hot", overperformance: 4 })]),
    );

    const numeric = await workingSubject(NOW);
    expect(numeric.jevUsed).toBe(false);
    expect(numeric.videos.map((item) => item.videoId)).toEqual(["o-hot", "m-recent"]);
  });

  it("drops a row Jev labelled format court even if duration looks long-form", async () => {
    getDb().exec("DELETE FROM channel_videos");
    addVideo(mineId, "m-long-short", 1, 8_000, null, "Looks long");
    jevTrendJudgments.mockResolvedValueOnce(new Map([["m-long-short", { formatId: "shorts", note: 1.7, score01: 0.17 }]]));
    const result = await workingSubject(NOW);
    expect(result.videos).toEqual([]);
    expect(result.subject).toBeNull();
  });

  it("uses snapshot deltas for velocityKind when two relevés exist", async () => {
    getDb().exec("DELETE FROM channel_videos");
    addVideo(mineId, "m-climb", 1, 8_000, null, "Climbing");
    getDb()
      .prepare(
        `INSERT INTO video_stat_snapshots (video_id, captured_at, view_count, like_count)
         VALUES ('m-climb', '2026-09-16T07:00:00.000Z', 3000, NULL)`,
      )
      .run();
    const result = await workingSubject(NOW);
    expect(result.videos[0]).toMatchObject({ videoId: "m-climb", velocityKind: "delta" });
    expect(result.subject?.why).toMatch(/ça grimpe/);
  });
});

describe("typesSummary", () => {
  it("ranks title/description themes with at least 3 scored videos across every channel", async () => {
    const { rows, jevUsed } = await typesSummary("all", NOW);
    expect(rows[0]?.label.toLowerCase()).toContain("cursor");
    expect(rows[0]).toMatchObject({
      enoughData: true,
      scoredCount: 3,
      medianScore: 5,
      winner: { videoId: "o-hit", score: 5 },
    });
    expect(rows[0]?.perChannel.map((entry) => entry.videoId).sort()).toEqual(["m-old-hit", "o-hit"]);
    expect(jevUsed).toBe(false);
    expect(jevClickNouls).toHaveBeenCalledWith(
      "Autre, Ma chaîne",
      expect.arrayContaining([expect.objectContaining({ videoId: "o-hit", title: "Cursor 2.0 hit" })]),
      "followed",
    );
  });

  it("narrows to « Ma chaîne » or to one channel", async () => {
    expect((await typesSummary("mine", NOW)).rows.find((row) => row.label.toLowerCase().includes("cursor"))).toMatchObject({
      totalCount: 2,
      enoughData: false,
    });
    const other = await typesSummary(otherId, NOW);
    expect(other.rows.some((row) => row.videoIds.includes("o-hit"))).toBe(true);
    expect(other.rows.every((row) => row.themeId !== "face_text")).toBe(true);
    jevClickNouls.mockClear();
    expect(await typesSummary("unknown-channel", NOW)).toEqual({ rows: [], jevUsed: false });
    expect(jevClickNouls).not.toHaveBeenCalled();
  });

  it("can attach a video to a theme from its description", async () => {
    addVideo(mineId, "m-desc", 25, 4_000, null, "Tu ne vas pas y croire", "On parle de Cursor 2.0 dans cette vidéo.");
    const { rows } = await typesSummary("mine", NOW);
    const cursor = rows.find((row) => row.label.toLowerCase().includes("cursor"));
    expect(cursor?.videoIds).toContain("m-desc");
    expect(cursor?.totalCount).toBe(3);
    expect(cursor?.enoughData).toBe(true);
  });
});
