import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchChannelDetails,
  fetchMineChannel,
  fetchPlaylistPage,
  fetchVideos,
  localChannelId,
  longFormPlaylistId,
  parseIsoDuration,
  resolveChannelInput,
  uploadsPlaylistId,
  YouTubeApiError,
} from "@/lib/youtube/api";
import { channelIdFor, createFakeYouTube, type FakeYouTube } from "./fake-youtube";

const KEY = "test-yt-key";
const MINE = channelIdFor("m");
let fake: FakeYouTube;

function install(nextFake: FakeYouTube) {
  fake = nextFake;
  vi.stubGlobal("fetch", fake.fetch);
}

/** Installs a raw fetch stub answering www.googleapis.com/youtube/v3/<resource> with `body`, bypassing the fake's typed FakeVideo/FakeChannel shapes so malformed statistics can be injected directly. */
function installRaw(body: unknown) {
  const raw = vi.fn(
    async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", raw);
  return raw;
}

beforeEach(() => {
  install(
    createFakeYouTube({
      channels: [{ id: MINE, handle: "@MaChaine", title: "Ma chaîne", subscribers: 12_500 }],
      videos: [
        { id: "long0000001", channelId: MINE, publishedAt: "2026-09-01T10:00:00Z", durationSeconds: 754, views: 1_200, likes: 30 },
        { id: "hidden00001", channelId: MINE, publishedAt: "2026-08-01T10:00:00Z", views: 50, likes: null },
      ],
      playlists: { PLmaplaylist0001: MINE },
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseIsoDuration", () => {
  it.each([
    ["PT15M33S", 933],
    ["PT1H2M3S", 3723],
    ["PT45S", 45],
    ["P1DT2H", 93_600],
    ["P0D", 0],
    ["PT0S", 0],
    ["", 0],
    ["garbage", 0],
  ])("%s → %i s", (value, seconds) => {
    expect(parseIsoDuration(value)).toBe(seconds);
  });
});

describe("playlist and channel ids", () => {
  it("derives the long-form and uploads playlists from the channel id", () => {
    expect(longFormPlaylistId("UCabcdefghijklmnopqrstuv")).toBe("UULFabcdefghijklmnopqrstuv");
    expect(uploadsPlaylistId("UCabcdefghijklmnopqrstuv")).toBe("UUabcdefghijklmnopqrstuv");
  });

  it("reads channel ids that need no request", () => {
    expect(localChannelId(MINE)).toBe(MINE);
    expect(localChannelId(`https://www.youtube.com/channel/${MINE}`)).toBe(MINE);
    expect(localChannelId(`UU${MINE.slice(2)}`)).toBe(MINE);
    expect(localChannelId("@MaChaine")).toBeNull();
    expect(localChannelId("PLmaplaylist0001")).toBeNull();
  });
});

describe("resolveChannelInput", () => {
  it.each([
    ["https://www.youtube.com/@MaChaine"],
    ["@MaChaine"],
    ["MaChaine"],
    [`https://www.youtube.com/channel/${MINE}`],
    [MINE],
    [`UU${MINE.slice(2)}`],
    ["PLmaplaylist0001"],
  ])("resolves %s", async (input) => {
    expect(await resolveChannelInput(KEY, input)).toEqual({
      status: "found",
      channel: {
        youtubeChannelId: MINE,
        title: "Ma chaîne",
        handle: "@machaine",
        avatarUrl: `https://yt3.example/${MINE}.jpg`,
        subscriberCount: 12_500,
        videoCount: 2,
        description: null,
      },
    });
  });

  it("asks channels.list for snippet, statistics and contentDetails with the key", async () => {
    await resolveChannelInput(KEY, "@MaChaine");
    const call = fake.calls.find((entry) => entry.resource === "channels");
    expect(call?.params.get("part")).toBe("snippet,statistics,contentDetails");
    expect(call?.params.get("forHandle")).toBe("MaChaine");
    expect(call?.params.get("key")).toBe(KEY);
  });

  it("reports an unknown handle or an unusable input as not found", async () => {
    expect(await resolveChannelInput(KEY, "@inconnue")).toEqual({ status: "not-found" });
    expect(await resolveChannelInput(KEY, "https://example.com/pas/une/chaine")).toEqual({ status: "not-found" });
    expect(await resolveChannelInput(KEY, "   ")).toEqual({ status: "not-found" });
    expect(await resolveChannelInput(KEY, "PLinconnue000001")).toEqual({ status: "not-found" });
  });

  it("leaves the subscriber count out when the channel hides it", async () => {
    install(createFakeYouTube({ channels: [{ id: MINE, handle: "@MaChaine", title: "Ma chaîne", hiddenSubscribers: true }] }));
    const resolved = await resolveChannelInput(KEY, "@MaChaine");
    expect(resolved.status === "found" && resolved.channel.subscriberCount).toBeNull();
  });

  it("throws YouTube's quota error", async () => {
    fake.setQuotaAfter(0);
    const error = (await resolveChannelInput(KEY, "@MaChaine").catch((err: unknown) => err)) as YouTubeApiError;
    expect(error).toBeInstanceOf(YouTubeApiError);
    expect(error.status).toBe(403);
    expect(error.reason).toBe("quotaExceeded");
    expect(error.isQuota).toBe(true);
  });

  it("turns a network failure into an error that never contains the key", async () => {
    fake.setNetworkDown(true);
    const error = (await fetchChannelDetails(KEY, MINE).catch((err: unknown) => err)) as YouTubeApiError;
    expect(error).toBeInstanceOf(YouTubeApiError);
    expect(error.status).toBe(0);
    expect(error.reason).toBe("network");
    expect(error.message).toBe("YouTube injoignable");
  });

  it("gives every request a 15 s timeout and turns a timeout into the network error", async () => {
    const timedOut = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    vi.stubGlobal("fetch", timedOut);

    const error = (await fetchChannelDetails(KEY, MINE).catch((err: unknown) => err)) as YouTubeApiError;
    expect(timedOut).toHaveBeenCalledTimes(1);
    expect(timedOut.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    expect(error).toBeInstanceOf(YouTubeApiError);
    expect(error.status).toBe(0);
    expect(error.reason).toBe("network");
    expect(error.message).toBe("YouTube injoignable");
  });

  it("guards subscriberCount as a non-negative safe integer", async () => {
    installRaw({
      items: [
        {
          id: MINE,
          snippet: { title: "Ma chaîne", customUrl: "@machaine" },
          statistics: { subscriberCount: "-100", hiddenSubscriberCount: false, videoCount: "2" },
          contentDetails: { relatedPlaylists: { uploads: `UU${MINE.slice(2)}` } },
        },
      ],
    });
    const resolved = await resolveChannelInput(KEY, MINE);
    expect(resolved.status === "found" && resolved.channel.subscriberCount).toBeNull();
  });
});

describe("fetchChannelDetails", () => {
  it("returns null for an unknown channel id", async () => {
    expect(await fetchChannelDetails(KEY, channelIdFor("x"))).toBeNull();
  });
});

describe("fetchMineChannel", () => {
  it("asks YouTube for mine=true with a bearer token and no API key", async () => {
    install(
      createFakeYouTube({
        channels: [{ id: MINE, handle: "@MaChaine", title: "Ma chaîne" }],
      }),
    );
    const mine = await fetchMineChannel("ya29.access-token");
    expect(mine?.youtubeChannelId).toBe(MINE);
    expect(mine?.title).toBe("Ma chaîne");
    const call = fake.calls.find((entry) => entry.resource === "channels");
    expect(call?.params.get("mine")).toBe("true");
    expect(call?.params.get("key")).toBeNull();
    expect(call?.params.get("part")).toContain("brandingSettings");
  });
});

describe("fetchPlaylistPage", () => {
  it("pages through a playlist 50 items at a time, newest first", async () => {
    install(
      createFakeYouTube({
        channels: [{ id: MINE, handle: "@MaChaine", title: "Ma chaîne" }],
        videos: Array.from({ length: 120 }, (_, index) => ({
          id: `vid${String(index).padStart(8, "0")}`,
          channelId: MINE,
          publishedAt: new Date(Date.UTC(2026, 0, 1) + index * 86_400_000).toISOString(),
        })),
      }),
    );
    const first = await fetchPlaylistPage(KEY, longFormPlaylistId(MINE));
    expect(first.videoIds).toHaveLength(50);
    expect(first.videoIds[0]).toBe("vid00000119");
    expect(first.nextPageToken).not.toBeNull();
    const second = await fetchPlaylistPage(KEY, longFormPlaylistId(MINE), first.nextPageToken);
    const third = await fetchPlaylistPage(KEY, longFormPlaylistId(MINE), second.nextPageToken);
    expect(third.videoIds).toHaveLength(20);
    expect(third.nextPageToken).toBeNull();
    expect(
      fake.calls
        .filter((call) => call.resource === "playlistItems")
        .every((call) => call.params.get("maxResults") === "50" && call.params.get("part") === "contentDetails"),
    ).toBe(true);
  });

  it("throws a not-found error for a missing playlist", async () => {
    install(createFakeYouTube({ channels: [{ id: MINE, handle: "@MaChaine", title: "Ma chaîne", hasLongFormPlaylist: false }] }));
    const error = (await fetchPlaylistPage(KEY, longFormPlaylistId(MINE)).catch((err: unknown) => err)) as YouTubeApiError;
    expect(error).toBeInstanceOf(YouTubeApiError);
    expect(error.status).toBe(404);
    expect(error.reason).toBe("playlistNotFound");
    expect(error.isNotFound).toBe(true);
    expect(error.isQuota).toBe(false);
  });
});

describe("fetchVideos", () => {
  it("reads title, date, duration, views, likes and thumbnail, and which ids still exist", async () => {
    const batch = await fetchVideos(KEY, ["long0000001", "hidden00001", "gone0000001"]);
    expect(batch.foundIds).toEqual(new Set(["long0000001", "hidden00001"]));
    expect(batch.videos[0]).toEqual({
      videoId: "long0000001",
      channelId: MINE,
      title: "Vidéo long0000001",
      description: "",
      publishedAt: "2026-09-01T10:00:00.000Z",
      durationSeconds: 754,
      viewCount: 1200,
      likeCount: 30,
      thumbnailUrl: "https://i.ytimg.com/vi/long0000001/mqdefault.jpg",
      liveBroadcastContent: "none",
      description: "",
    });
    expect(batch.videos[1].likeCount).toBeNull();
    const call = fake.calls.find((entry) => entry.resource === "videos");
    expect(call?.params.get("part")).toBe("snippet,statistics,contentDetails");
    expect(call?.params.get("id")).toBe("long0000001,hidden00001,gone0000001");
  });

  it("makes no request for an empty list and refuses more than 50 ids", async () => {
    expect(await fetchVideos(KEY, [])).toEqual({ videos: [], foundIds: new Set() });
    expect(fake.calls).toHaveLength(0);
    await expect(fetchVideos(KEY, Array.from({ length: 51 }, (_, index) => `v${index}`))).rejects.toThrow("50");
  });

  it("guards viewCount and likeCount as non-negative safe integers", async () => {
    installRaw({
      items: [
        {
          id: "negativevw1",
          snippet: { title: "Négatif", publishedAt: "2026-01-01T00:00:00Z", liveBroadcastContent: "none", channelId: MINE },
          statistics: { viewCount: "-5", likeCount: "12.5" },
          contentDetails: { duration: "PT1M" },
        },
        {
          id: "junkcounts01",
          snippet: { title: "Charabia", publishedAt: "2026-01-02T00:00:00Z", liveBroadcastContent: "none", channelId: MINE },
          statistics: { viewCount: "abc", likeCount: "-1" },
          contentDetails: { duration: "PT1M" },
        },
        {
          id: "missingview1",
          snippet: { title: "Sans vues", publishedAt: "2026-01-03T00:00:00Z", liveBroadcastContent: "none", channelId: MINE },
          statistics: {},
          contentDetails: { duration: "PT1M" },
        },
      ],
    });
    const batch = await fetchVideos(KEY, ["negativevw1", "junkcounts01", "missingview1"]);
    // negative or non-integer counts are invalid → null for likeCount, 0 for the missing/invalid viewCount
    expect(batch.videos[0].viewCount).toBe(0);
    expect(batch.videos[0].likeCount).toBeNull();
    expect(batch.videos[1].viewCount).toBe(0);
    expect(batch.videos[1].likeCount).toBeNull();
    expect(batch.videos[2].viewCount).toBe(0);
    expect(batch.videos[2].likeCount).toBeNull();
  });

  it("skips a video whose publishedAt doesn't parse as a date", async () => {
    installRaw({
      items: [
        {
          id: "baddate0001",
          snippet: { title: "Date invalide", publishedAt: "pas-une-date", liveBroadcastContent: "none", channelId: MINE },
          statistics: { viewCount: "10" },
          contentDetails: { duration: "PT1M" },
        },
        {
          id: "nodate00001",
          snippet: { title: "Sans date", liveBroadcastContent: "none", channelId: MINE },
          statistics: { viewCount: "10" },
          contentDetails: { duration: "PT1M" },
        },
        {
          id: "gooddate001",
          snippet: { title: "Date valide", publishedAt: "2026-01-05T00:00:00Z", liveBroadcastContent: "none", channelId: MINE },
          statistics: { viewCount: "10" },
          contentDetails: { duration: "PT1M" },
        },
      ],
    });
    const batch = await fetchVideos(KEY, ["baddate0001", "nodate00001", "gooddate001"]);
    expect(batch.videos.map((video) => video.videoId)).toEqual(["gooddate001"]);
  });

  it("keeps the snippet description for theme clustering", async () => {
    installRaw({
      items: [
        {
          id: "desc0000001",
          snippet: {
            title: "Clickbait",
            description: "  On parle de Cursor 2.0.  ",
            publishedAt: "2026-01-05T00:00:00Z",
            liveBroadcastContent: "none",
            channelId: MINE,
          },
          statistics: { viewCount: "10" },
          contentDetails: { duration: "PT1M" },
        },
      ],
    });
    const batch = await fetchVideos(KEY, ["desc0000001"]);
    expect(batch.videos[0]?.description).toBe("On parle de Cursor 2.0.");
  });
});
