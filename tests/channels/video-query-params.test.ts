import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIDEO_QUERY,
  libraryImageUrl,
  parseVideoQuery,
  videoQueryToSearch,
  youtubeThumbnailUrl,
  youtubeWatchUrl,
  type VideoQuery,
} from "@/lib/youtube/types";

describe("parseVideoQuery", () => {
  it("falls back to score, every type, every channel, all time, first 60", () => {
    expect(parseVideoQuery(new URLSearchParams())).toEqual(DEFAULT_VIDEO_QUERY);
    expect(DEFAULT_VIDEO_QUERY).toEqual({ sort: "score", types: [], channelId: null, period: "all", q: "", offset: 0, limit: 60 });
  });

  it("ignores unknown values and clamps the page window", () => {
    const query = parseVideoQuery(
      new URLSearchParams("sort=likes&period=week&types=versus,banana,none,versus&offset=-5&limit=5000&channel=%20&q=%20%20"),
    );
    expect(query).toEqual({ sort: "score", types: ["versus", "none"], channelId: null, period: "all", q: "", offset: 0, limit: 1200 });
    expect(parseVideoQuery(new URLSearchParams("limit=0")).limit).toBe(1);
    expect(parseVideoQuery(new URLSearchParams("limit=abc")).limit).toBe(60);
  });

  it("round-trips through videoQueryToSearch", () => {
    const query: VideoQuery = {
      sort: "date",
      types: ["face_text", "none"],
      channelId: "channel-1",
      period: "12m",
      q: "avant après",
      offset: 60,
      limit: 120,
    };
    expect(parseVideoQuery(new URLSearchParams(videoQueryToSearch(query)))).toEqual(query);
    expect(videoQueryToSearch({})).toBe("");
  });
});

describe("URL helpers", () => {
  it("builds YouTube and library URLs", () => {
    expect(youtubeThumbnailUrl("abcdefghijk")).toBe("https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg");
    expect(youtubeThumbnailUrl("abcdefghijk", "maxresdefault")).toBe("https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg");
    expect(youtubeWatchUrl("abcdefghijk")).toBe("https://www.youtube.com/watch?v=abcdefghijk");
    expect(libraryImageUrl("0f5c2c1e-4b1d-4a5e-9d7e-1b2c3d4e5f60")).toBe(
      "/api/swipe-files/image?f=0f5c2c1e-4b1d-4a5e-9d7e-1b2c3d4e5f60",
    );
  });
});
