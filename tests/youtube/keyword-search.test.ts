import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";

const searchVideos = vi.fn();
const fetchVideos = vi.fn();
const fetchChannels = vi.fn();
const jevClickNouls = vi.fn();

vi.mock("@/lib/youtube/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/youtube/api")>();
  return { ...actual, searchVideos, fetchVideos, fetchChannels };
});

vi.mock("@/lib/typesafe/rerank-titles", () => ({
  jevClickNouls: (...args: unknown[]) => jevClickNouls(...args),
}));

const { searchPerformantThumbnails } = await import("@/lib/youtube/keyword-search");

const NOW = new Date("2026-09-19T12:00:00.000Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

beforeEach(() => {
  getDb().exec("DELETE FROM followed_channels");
  getDb().exec("DELETE FROM channel_median_cache");
  searchVideos.mockReset();
  fetchVideos.mockReset();
  fetchChannels.mockReset();
  jevClickNouls.mockReset();
  jevClickNouls.mockResolvedValue(new Map());
});

describe("searchPerformantThumbnails", () => {
  it("drops Shorts and ranks the channel outlier first", async () => {
    searchVideos.mockResolvedValue([
      { videoId: "aaaaaaaaaaa", channelId: "UCa", channelTitle: "Petit", title: "Hit", publishedAt: day(21) },
      { videoId: "bbbbbbbbbbb", channelId: "UCb", channelTitle: "Gros", title: "Average", publishedAt: day(21) },
      { videoId: "ccccccccccc", channelId: "UCc", channelTitle: "Shorts", title: "Reel", publishedAt: day(21) },
    ]);
    fetchVideos.mockResolvedValue({
      foundIds: new Set(["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"]),
      videos: [
        {
          videoId: "aaaaaaaaaaa",
          channelId: "UCa",
          title: "Hit",
          publishedAt: day(21),
          durationSeconds: 600,
          viewCount: 80_000,
          likeCount: null,
          thumbnailUrl: "https://i.ytimg.com/vi/aaaaaaaaaaa/mqdefault.jpg",
          liveBroadcastContent: "none",
        },
        {
          videoId: "bbbbbbbbbbb",
          channelId: "UCb",
          title: "Average",
          publishedAt: day(21),
          durationSeconds: 600,
          viewCount: 400_000,
          likeCount: null,
          thumbnailUrl: "https://i.ytimg.com/vi/bbbbbbbbbbb/mqdefault.jpg",
          liveBroadcastContent: "none",
        },
        {
          videoId: "ccccccccccc",
          channelId: "UCc",
          title: "Reel",
          publishedAt: day(21),
          durationSeconds: 40,
          viewCount: 2_000_000,
          likeCount: null,
          thumbnailUrl: "https://i.ytimg.com/vi/ccccccccccc/mqdefault.jpg",
          liveBroadcastContent: "none",
        },
      ],
    });
    fetchChannels.mockResolvedValue([
      { youtubeChannelId: "UCa", title: "Petit", handle: null, avatarUrl: null, subscriberCount: 8_000, videoCount: 40 },
      { youtubeChannelId: "UCb", title: "Gros", handle: null, avatarUrl: null, subscriberCount: 400_000, videoCount: 200 },
      { youtubeChannelId: "UCc", title: "Shorts", handle: null, avatarUrl: null, subscriberCount: 10_000, videoCount: 10 },
    ]);

    const result = await searchPerformantThumbnails("yt-key", "notion tutoriel", NOW);
    expect(result.items.map((item) => item.videoId)).toEqual(["aaaaaaaaaaa", "bbbbbbbbbbb"]);
    expect(result.items[0].performance).toMatchObject({ kind: "scored" });
    expect(result.jevUsed).toBe(false);
    expect(searchVideos).toHaveBeenCalledWith(
      "yt-key",
      expect.objectContaining({
        q: "notion tutoriel",
        maxResults: 25,
        regionCode: "FR",
        relevanceLanguage: "fr",
      }),
    );
  });

  it("sends the chosen country to YouTube", async () => {
    searchVideos.mockResolvedValue([]);
    fetchVideos.mockResolvedValue({ foundIds: new Set(), videos: [] });
    fetchChannels.mockResolvedValue([]);
    await searchPerformantThumbnails("yt-key", "notion", NOW, "US");
    expect(searchVideos).toHaveBeenCalledWith(
      "yt-key",
      expect.objectContaining({ regionCode: "US", relevanceLanguage: "en" }),
    );
  });

  it("falls back to France when the country is unknown", async () => {
    searchVideos.mockResolvedValue([]);
    fetchVideos.mockResolvedValue({ foundIds: new Set(), videos: [] });
    fetchChannels.mockResolvedValue([]);
    await searchPerformantThumbnails("yt-key", "notion", NOW, "xx");
    expect(searchVideos).toHaveBeenCalledWith(
      "yt-key",
      expect.objectContaining({ regionCode: "FR", relevanceLanguage: "fr" }),
    );
  });

  it("reorders the top hits when Jev returns click nouls", async () => {
    searchVideos.mockResolvedValue([
      { videoId: "aaaaaaaaaaa", channelId: "UCa", channelTitle: "A", title: "Faible titre", publishedAt: day(21) },
      { videoId: "bbbbbbbbbbb", channelId: "UCa", channelTitle: "A", title: "Titre cliquant", publishedAt: day(21) },
    ]);
    fetchVideos.mockResolvedValue({
      foundIds: new Set(["aaaaaaaaaaa", "bbbbbbbbbbb"]),
      videos: [
        {
          videoId: "aaaaaaaaaaa",
          channelId: "UCa",
          title: "Faible titre",
          publishedAt: day(21),
          durationSeconds: 600,
          viewCount: 90_000,
          likeCount: null,
          thumbnailUrl: "https://i.ytimg.com/vi/aaaaaaaaaaa/mqdefault.jpg",
          liveBroadcastContent: "none",
        },
        {
          videoId: "bbbbbbbbbbb",
          channelId: "UCa",
          title: "Titre cliquant",
          publishedAt: day(21),
          durationSeconds: 600,
          viewCount: 80_000,
          likeCount: null,
          thumbnailUrl: "https://i.ytimg.com/vi/bbbbbbbbbbb/mqdefault.jpg",
          liveBroadcastContent: "none",
        },
      ],
    });
    fetchChannels.mockResolvedValue([
      { youtubeChannelId: "UCa", title: "A", handle: null, avatarUrl: null, subscriberCount: 8_000, videoCount: 20 },
    ]);
    jevClickNouls.mockResolvedValue(new Map([["aaaaaaaaaaa", 0.05], ["bbbbbbbbbbb", 0.99]]));

    const result = await searchPerformantThumbnails("yt-key", "notion", NOW);
    expect(result.jevUsed).toBe(true);
    expect(result.items[0].videoId).toBe("bbbbbbbbbbb");
  });
});
