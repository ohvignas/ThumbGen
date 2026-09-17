import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import * as store from "@/lib/youtube/channel-store";
import { isQuotaBlocked, resetChannelRuntime } from "@/lib/youtube/runtime";
import { keepVideo, syncChannel } from "@/lib/youtube/sync";
import { MISSING_YOUTUBE_KEY_ERROR, QUOTA_SYNC_ERROR, type VideoDetails } from "@/lib/youtube/types";
import { channelIdFor, createFakeYouTube, type FakeVideo, type FakeYouTube } from "./fake-youtube";

const CHANNEL = channelIdFor("s");
const T0 = new Date("2026-09-16T12:00:00.000Z");
const at = (hours: number) => () => new Date(T0.getTime() + hours * 3_600_000);
const daysBefore = (days: number) => new Date(T0.getTime() - days * 86_400_000).toISOString();

let fake: FakeYouTube;

function longVideos(count: number): FakeVideo[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `lv${String(index).padStart(9, "0")}`,
    channelId: CHANNEL,
    publishedAt: daysBefore(8 + index),
    views: 1000 + index,
    durationSeconds: 900,
  }));
}

function useFake(videos: FakeVideo[], options: { hasLongFormPlaylist?: boolean } = {}) {
  fake = createFakeYouTube({
    channels: [{ id: CHANNEL, handle: "@suivie", title: "Chaîne suivie", hasLongFormPlaylist: options.hasLongFormPlaylist }],
    videos,
  });
  vi.stubGlobal("fetch", fake.fetch);
}

function follow(): string {
  return store.insertChannel(
    { youtubeChannelId: CHANNEL, title: "Chaîne suivie", handle: "@suivie", avatarUrl: null, subscriberCount: 10, videoCount: null },
    { syncStatus: "syncing" },
  ).channel.id;
}

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM followed_channels");
  db.exec("DELETE FROM settings");
  setSetting("youtubeApiKey", "test-yt-key");
  resetChannelRuntime();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("keepVideo", () => {
  const base: VideoDetails = {
    videoId: "x",
    title: "x",
    publishedAt: T0.toISOString(),
    durationSeconds: 600,
    viewCount: 1,
    likeCount: null,
    thumbnailUrl: "",
    liveBroadcastContent: "none",
  };

  it("keeps every long-form playlist entry except lives", () => {
    expect(keepVideo({ ...base, durationSeconds: 30 }, false)).toBe(true);
    expect(keepVideo({ ...base, liveBroadcastContent: "upcoming" }, false)).toBe(false);
    expect(keepVideo({ ...base, liveBroadcastContent: "live" }, true)).toBe(false);
  });

  it("drops uploads of 3 minutes or less when filtering by duration", () => {
    expect(keepVideo({ ...base, durationSeconds: 180 }, true)).toBe(false);
    expect(keepVideo({ ...base, durationSeconds: 181 }, true)).toBe(true);
  });
});

describe("syncChannel", () => {
  it("imports the whole long-form history page by page", async () => {
    useFake(longVideos(120));
    const channelId = follow();

    expect(await syncChannel(channelId, at(0))).toEqual({ status: "done", imported: 120, updated: 0, removed: 0 });

    expect(store.listChannelItems()[0]).toMatchObject({
      videoCount: 120,
      syncStatus: "idle",
      syncError: null,
      lastSyncedAt: T0.toISOString(),
      medianViews: 1024.5,
    });
    expect(store.getChannel(channelId)).toMatchObject({
      playlist_id: `UULF${CHANNEL.slice(2)}`,
      backfill_done: 1,
      backfill_page_token: null,
    });
    expect(fake.count("playlistItems")).toBe(4); // playlist probe + 3 pages
    expect(fake.count("videos")).toBe(3);
  });

  it("falls back to the uploads playlist without Shorts when the long-form playlist is missing", async () => {
    useFake(
      [
        { id: "long0000001", channelId: CHANNEL, publishedAt: daysBefore(10), durationSeconds: 600 },
        { id: "short000001", channelId: CHANNEL, publishedAt: daysBefore(11), durationSeconds: 45, short: true },
        { id: "edge0000180", channelId: CHANNEL, publishedAt: daysBefore(12), durationSeconds: 180 },
        { id: "edge0000181", channelId: CHANNEL, publishedAt: daysBefore(13), durationSeconds: 181 },
        { id: "live0000001", channelId: CHANNEL, publishedAt: daysBefore(1), live: "upcoming" },
      ],
      { hasLongFormPlaylist: false },
    );
    const channelId = follow();

    await syncChannel(channelId, at(0));

    expect([...store.knownVideoIds(channelId)].sort()).toEqual(["edge0000181", "long0000001"]);
    expect(store.getChannel(channelId)?.playlist_id).toBe(`UU${CHANNEL.slice(2)}`);
  });

  it("stops at the first known video, refreshes views and drops removed videos", async () => {
    useFake(longVideos(60));
    const channelId = follow();
    await syncChannel(channelId, at(0));

    fake.addVideo({ id: "new00000001", channelId: CHANNEL, publishedAt: daysBefore(2), views: 50 });
    fake.addVideo({ id: "new00000002", channelId: CHANNEL, publishedAt: daysBefore(1), views: 80 });
    fake.setViews("lv000000000", 99_999);
    fake.removeVideo("lv000000059");
    const playlistCallsBefore = fake.count("playlistItems");

    expect(await syncChannel(channelId, at(1))).toEqual({ status: "done", imported: 2, updated: 59, removed: 1 });

    expect(fake.count("playlistItems") - playlistCallsBefore).toBe(1);
    expect(store.getVideo("lv000000000")?.view_count).toBe(99_999);
    expect(store.getVideo("lv000000059")).toBeNull();
    expect(store.getVideo("new00000002")).toMatchObject({ view_count: 80, stats_updated_at: at(1)().toISOString() });
  });

  it("keeps a manual thumbnail type across syncs", async () => {
    useFake(longVideos(3));
    const channelId = follow();
    await syncChannel(channelId, at(0));
    store.setManualThumbType("lv000000001", "versus");

    await syncChannel(channelId, at(1));

    expect(store.getVideo("lv000000001")).toMatchObject({ thumb_type: "versus", thumb_type_source: "manual" });
  });

  it("stops cleanly on quota, keeps imported videos and resumes where it stopped", async () => {
    useFake(longVideos(120));
    const channelId = follow();
    fake.setQuotaAfter(5); // probe, page 1, videos, page 2, videos — page 3 hits the quota

    expect(await syncChannel(channelId, at(0))).toEqual({ status: "quota" });
    expect(store.listChannelItems()[0]).toMatchObject({
      videoCount: 100,
      syncStatus: "error",
      syncError: QUOTA_SYNC_ERROR,
      lastSyncedAt: null,
    });
    expect(store.getChannel(channelId)).toMatchObject({ backfill_page_token: "100", backfill_done: 0 });
    expect(isQuotaBlocked(at(0)())).toBe(true);

    fake.setQuotaAfter(null);
    expect(await syncChannel(channelId, at(24))).toMatchObject({ status: "done", imported: 20 });
    expect(store.listChannelItems()[0]).toMatchObject({ videoCount: 120, syncStatus: "idle", syncError: null });
    expect(store.getChannel(channelId)).toMatchObject({ backfill_page_token: null, backfill_done: 1 });
  });

  it("finishes a newest-first walk that an error interrupted, instead of stopping at the first known page", async () => {
    useFake(longVideos(10));
    const channelId = follow();
    await syncChannel(channelId, at(0));

    for (let index = 0; index < 130; index += 1) {
      fake.addVideo({ id: `nw${String(index).padStart(9, "0")}`, channelId: CHANNEL, publishedAt: daysBefore(7 - index / 100), views: 10 });
    }
    // 140 videos = 3 playlist pages. Page 1 and its videos go through, page 2 hits the quota.
    fake.setQuotaAfter(2);
    expect(await syncChannel(channelId, at(1))).toEqual({ status: "quota" });
    expect(store.knownVideoIds(channelId).size).toBe(60);
    expect(store.getChannel(channelId)?.sync_page_token).toBe("50");

    fake.setQuotaAfter(null);
    expect(await syncChannel(channelId, at(25))).toMatchObject({ status: "done", imported: 80 });
    expect(store.knownVideoIds(channelId).size).toBe(140);
    expect(store.getChannel(channelId)?.sync_page_token).toBeNull();
  });

  it("stops the stale queue when refreshing the channel details hits the quota, without failing the sync", async () => {
    useFake(longVideos(3));
    const channelId = follow();
    fake.setQuotaAfter(3); // probe, page 1, videos — channels.list hits the quota

    expect(await syncChannel(channelId, at(0))).toMatchObject({ status: "done", imported: 3 });
    expect(isQuotaBlocked(at(0)())).toBe(true);
  });

  it("runs one sync at a time per channel", async () => {
    useFake(longVideos(3));
    const channelId = follow();

    const first = syncChannel(channelId, at(0));
    expect(await syncChannel(channelId, at(0))).toEqual({ status: "busy" });
    await expect(first).resolves.toMatchObject({ status: "done" });
    await expect(syncChannel(channelId, at(1))).resolves.toMatchObject({ status: "done" });
  });

  it("marks the channel in error when YouTube cannot be reached, keeping its videos", async () => {
    useFake(longVideos(3));
    const channelId = follow();
    await syncChannel(channelId, at(0));
    fake.setNetworkDown(true);

    expect(await syncChannel(channelId, at(1))).toEqual({ status: "error", message: "YouTube injoignable" });
    expect(store.listChannelItems()[0]).toMatchObject({ syncStatus: "error", syncError: "YouTube injoignable", videoCount: 3 });
  });

  it("needs a YouTube key", async () => {
    useFake(longVideos(3));
    const channelId = follow();
    getDb().exec("DELETE FROM settings");
    vi.stubEnv("YOUTUBE_API_KEY", "");

    expect(await syncChannel(channelId, at(0))).toEqual({ status: "no-key" });
    expect(store.getChannel(channelId)).toMatchObject({ sync_status: "error", sync_error: MISSING_YOUTUBE_KEY_ERROR });
    expect(fake.calls).toHaveLength(0);
  });

  it("ignores an unknown channel", async () => {
    useFake([]);
    expect(await syncChannel("unknown-channel", at(0))).toEqual({ status: "missing" });
  });
});
