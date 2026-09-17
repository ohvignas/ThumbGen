import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import * as store from "@/lib/youtube/channel-store";
import type { ThumbType } from "@/lib/youtube/thumb-types";
import { DEFAULT_VIDEO_QUERY, VIDEO_MAX_LIMIT, VIDEO_PAGE_SIZE, type VideoQuery } from "@/lib/youtube/types";
import { listVideos, typesSummary } from "@/lib/youtube/video-queries";

const NOW = new Date("2026-09-16T12:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

let mineId: string;
let otherId: string;

function addVideo(channelId: string, videoId: string, days: number, views: number, type: ThumbType | null) {
  store.upsertVideos(
    channelId,
    [
      {
        videoId,
        title: `Titre ${videoId}`,
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
  mineId = store.insertChannel({ youtubeChannelId: `UC${"q".repeat(22)}`, title: "Ma chaîne", handle: null, avatarUrl: null, subscriberCount: null, videoCount: null }).channel.id;
  otherId = store.insertChannel({ youtubeChannelId: `UC${"r".repeat(22)}`, title: "Autre", handle: null, avatarUrl: null, subscriberCount: null, videoCount: null }).channel.id;
  store.setMineChannel(mineId);
  store.finishSync(mineId, { medianViews: 1_000, syncedAt: NOW.toISOString() });
  store.finishSync(otherId, { medianViews: 10_000, syncedAt: NOW.toISOString() });

  addVideo(mineId, "m-old-hit", 40, 9_000, "face_text"); // ×9
  addVideo(mineId, "m-old-mid", 100, 1_200, "face_text"); // ×1.2
  addVideo(mineId, "m-old-low", 200, 300, "versus"); // ×0.3
  addVideo(mineId, "m-recent", 2, 5_000, null); // recent
  addVideo(mineId, "m-year", 500, 2_000, "reaction"); // ×2
  addVideo(otherId, "o-hit", 20, 50_000, "face_text"); // ×5
  addVideo(otherId, "o-mid", 60, 10_000, null); // ×1
  addVideo(otherId, "o-new", 1, 900, "scene"); // recent
});

describe("listVideos", () => {
  it("sorts by score, recent videos last, newest first among them", () => {
    expect(ids({ sort: "score" })).toEqual(["m-old-hit", "o-hit", "m-year", "m-old-mid", "o-mid", "m-old-low", "o-new", "m-recent"]);
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
      title: "Titre m-old-hit",
      publishedAt: daysAgo(40),
      durationSeconds: 600,
      viewCount: 9_000,
      thumbnailUrl: "https://i.ytimg.com/vi/m-old-hit/mqdefault.jpg",
      thumbType: "face_text",
      thumbTypeSource: "ai",
      performance: { kind: "scored", score: 9, band: "over" },
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
    expect(ids({ sort: "date", period: "30d" })).toEqual(["o-new", "m-recent", "o-hit"]);
    expect(ids({ sort: "date", period: "12m" })).not.toContain("m-year");
    expect(ids({ sort: "date", period: "12m" })).toHaveLength(7);
    expect(ids({ sort: "date", q: "hit" })).toEqual(["o-hit", "m-old-hit"]);
    expect(ids({ q: "_" })).toEqual([]);
    expect(ids({ q: "%" })).toEqual([]);
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

describe("typesSummary", () => {
  it("ranks types with at least 3 scored thumbnails across every channel", () => {
    const rows = typesSummary("all", NOW);
    expect(rows.map((row) => row.type)).toEqual(["face_text", "reaction", "versus", "scene"]);
    expect(rows[0]).toMatchObject({ enoughData: true, scoredCount: 3, medianScore: 5, best: { videoId: "m-old-hit", score: 9 } });
    expect(rows[3]).toMatchObject({ type: "scene", totalCount: 1, scoredCount: 0, enoughData: false });
  });

  it("narrows to « Ma chaîne » or to one channel", () => {
    expect(typesSummary("mine", NOW).find((row) => row.type === "face_text")).toMatchObject({ totalCount: 2, enoughData: false });
    expect(typesSummary(otherId, NOW).map((row) => row.type)).toEqual(["face_text", "scene"]);
    expect(typesSummary("unknown-channel", NOW)).toEqual([]);
  });
});
