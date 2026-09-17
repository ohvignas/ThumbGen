import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import * as store from "@/lib/youtube/channel-store";
import type { ChannelDetails, VideoDetails } from "@/lib/youtube/types";

const details = (letter: string, overrides: Partial<ChannelDetails> = {}): ChannelDetails => ({
  youtubeChannelId: `UC${letter.repeat(22)}`,
  title: `Chaîne ${letter}`,
  handle: `@chaine${letter}`,
  avatarUrl: `https://yt3.example/${letter}.jpg`,
  subscriberCount: 1000,
  videoCount: 10,
  ...overrides,
});

const video = (videoId: string, overrides: Partial<VideoDetails> = {}): VideoDetails => ({
  videoId,
  title: `Vidéo ${videoId}`,
  publishedAt: "2026-08-01T10:00:00.000Z",
  durationSeconds: 600,
  viewCount: 100,
  likeCount: 5,
  thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
  liveBroadcastContent: "none",
  ...overrides,
});

const STAMP_1 = "2026-09-01T00:00:00.000Z";
const STAMP_2 = "2026-09-02T00:00:00.000Z";

beforeEach(() => {
  getDb().exec("DELETE FROM followed_channels");
});

describe("channels", () => {
  it("inserts once per YouTube channel and lists video counts", () => {
    const first = store.insertChannel(details("a"), { syncStatus: "syncing" });
    const again = store.insertChannel(details("a", { title: "Autre titre" }));
    expect(first.inserted).toBe(true);
    expect(again.inserted).toBe(false);
    expect(again.channel.id).toBe(first.channel.id);

    store.upsertVideos(first.channel.id, [video("vid-a1"), video("vid-a2")], STAMP_1);
    expect(store.listChannelItems()).toEqual([
      {
        id: first.channel.id,
        youtubeChannelId: `UC${"a".repeat(22)}`,
        title: "Chaîne a",
        handle: "@chainea",
        avatarUrl: "https://yt3.example/a.jpg",
        subscriberCount: 1000,
        isMine: false,
        medianViews: null,
        lastSyncedAt: null,
        syncStatus: "syncing",
        syncError: null,
        videoCount: 2,
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      },
    ]);
    expect(store.getChannelListItem(first.channel.id)?.videoCount).toBe(2);
    expect(store.getChannelListItem("nope")).toBeNull();
    expect(store.channelExists(first.channel.id)).toBe(true);
  });

  it("lists « Ma chaîne » first and moves the flag when it changes", () => {
    const a = store.insertChannel(details("a")).channel;
    const b = store.insertChannel(details("b")).channel;

    expect(store.setMineChannel(b.id)).toBe(true);
    expect(store.listChannelItems().map((item) => [item.id, item.isMine])).toEqual([
      [b.id, true],
      [a.id, false],
    ]);
    expect(store.setMineChannel(b.id)).toBe(false);
    expect(store.setMineChannel(a.id)).toBe(true);
    expect(store.getChannel(b.id)?.is_mine).toBe(0);
    expect(store.setMineChannel(null)).toBe(true);
    expect(store.listChannelItems().every((item) => !item.isMine)).toBe(true);
  });

  it("finds stale channels: never synced or synced before the cutoff", () => {
    const never = store.insertChannel(details("a")).channel;
    const old = store.insertChannel(details("b")).channel;
    const fresh = store.insertChannel(details("c")).channel;
    store.finishSync(old.id, { medianViews: 10, syncedAt: "2026-09-01T00:00:00.000Z" });
    store.finishSync(fresh.id, { medianViews: 10, syncedAt: "2026-09-10T00:00:00.000Z" });

    expect(store.staleChannelIds("2026-09-05T00:00:00.000Z")).toEqual([never.id, old.id]);
    expect(store.allChannelIds().sort()).toEqual([never.id, old.id, fresh.id].sort());
  });

  it("records sync progress and results", () => {
    const { channel } = store.insertChannel(details("a"));
    const playlistId = `UULF${"a".repeat(22)}`;
    store.setPlaylistId(channel.id, playlistId);
    store.setBackfill(channel.id, { pageToken: "100", done: false });
    store.setSyncState(channel.id, { status: "syncing" });
    expect(store.syncingChannelIds()).toEqual([channel.id]);
    store.setSyncState(channel.id, { status: "error", error: "Quota YouTube atteint — reprise demain" });
    expect(store.getChannel(channel.id)).toMatchObject({
      playlist_id: playlistId,
      backfill_page_token: "100",
      backfill_done: 0,
      sync_status: "error",
      sync_error: "Quota YouTube atteint — reprise demain",
    });

    store.setBackfill(channel.id, { pageToken: null, done: true });
    store.finishSync(channel.id, { medianViews: 1234.5, syncedAt: STAMP_2 });
    store.updateChannelDetails(channel.id, details("a", { title: "Nouveau nom", subscriberCount: 2000 }));
    expect(store.getChannel(channel.id)).toMatchObject({
      backfill_page_token: null,
      backfill_done: 1,
      median_views: 1234.5,
      last_synced_at: STAMP_2,
      sync_status: "idle",
      sync_error: null,
      title: "Nouveau nom",
      subscriber_count: 2000,
    });
    expect(store.syncingChannelIds()).toEqual([]);
  });

  it("deletes a channel with its videos", () => {
    const { channel } = store.insertChannel(details("a"));
    store.upsertVideos(channel.id, [video("vid-1")], STAMP_1);
    expect(store.deleteChannel(channel.id)).toBe(true);
    expect(store.getVideo("vid-1")).toBeNull();
    expect(store.deleteChannel(channel.id)).toBe(false);
  });
});

describe("videos", () => {
  let channelId: string;

  beforeEach(() => {
    channelId = store.insertChannel(details("v")).channel.id;
  });

  it("updates stats on re-import without touching the thumbnail type", () => {
    store.upsertVideos(channelId, [video("vid-1")], STAMP_1);
    store.setManualThumbType("vid-1", "versus");
    store.upsertVideos(channelId, [video("vid-1", { viewCount: 999, title: "Nouveau titre" })], STAMP_2);
    expect(store.getVideo("vid-1")).toMatchObject({
      view_count: 999,
      title: "Nouveau titre",
      thumb_type: "versus",
      thumb_type_source: "manual",
      stats_updated_at: STAMP_2,
    });
  });

  it("lists videos to refresh, refreshes and deletes them", () => {
    store.upsertVideos(channelId, [video("vid-1"), video("vid-2")], STAMP_1);
    store.upsertVideos(channelId, [video("vid-3")], STAMP_2);
    expect(store.videoIdsToRefresh(channelId, STAMP_2).sort()).toEqual(["vid-1", "vid-2"]);

    store.updateVideoStats([video("vid-1", { viewCount: 42, likeCount: null })], STAMP_2);
    store.deleteVideos(["vid-2"]);

    expect(store.getVideo("vid-1")).toMatchObject({ view_count: 42, like_count: null, stats_updated_at: STAMP_2 });
    expect(store.getVideo("vid-2")).toBeNull();
    expect([...store.knownVideoIds(channelId)].sort()).toEqual(["vid-1", "vid-3"]);
    expect(store.viewSamples(channelId)).toEqual(
      expect.arrayContaining([
        { publishedAt: "2026-08-01T10:00:00.000Z", viewCount: 42 },
        { publishedAt: "2026-08-01T10:00:00.000Z", viewCount: 100 },
      ]),
    );
  });

  it("never lets the AI overwrite a type once set", () => {
    store.upsertVideos(channelId, [video("vid-1"), video("vid-2")], STAMP_1);
    expect(store.setManualThumbType("vid-1", "face_text")).toBe(true);
    expect(store.setManualThumbType("missing", "face_text")).toBe(false);

    expect(store.setAiThumbType("vid-1", "scene")).toBe(false);
    expect(store.setAiThumbType("vid-2", "scene")).toBe(true);
    expect(store.setAiThumbType("vid-2", "object")).toBe(false);

    expect(store.getVideo("vid-1")).toMatchObject({ thumb_type: "face_text", thumb_type_source: "manual" });
    expect(store.getVideo("vid-2")).toMatchObject({ thumb_type: "scene", thumb_type_source: "ai" });
  });

  it("queues pending thumbnails with approval and at most 3 attempts", () => {
    store.upsertVideos(
      channelId,
      [
        video("old", { publishedAt: "2026-01-01T00:00:00.000Z" }),
        video("new", { publishedAt: "2026-06-01T00:00:00.000Z" }),
        video("done"),
      ],
      STAMP_1,
    );
    store.setManualThumbType("done", "other");

    expect(store.countPendingClassification()).toEqual({ pending: 2, unapproved: 2 });
    expect(store.nextClassificationBatch(10)).toEqual([]);
    expect(store.approvePendingClassification()).toBe(2);
    expect(store.nextClassificationBatch(10)).toEqual(["new", "old"]);

    for (let attempt = 0; attempt < 3; attempt += 1) store.incrementClassifyAttempts("old");
    expect(store.nextClassificationBatch(10)).toEqual(["new"]);
    expect(store.countPendingClassification()).toEqual({ pending: 1, unapproved: 0 });
  });

  it("remembers the library copy of a thumbnail", () => {
    store.upsertVideos(channelId, [video("vid-1")], STAMP_1);
    store.setVideoSwipeFile("vid-1", "swipe-123");
    expect(store.getVideo("vid-1")?.swipe_file_id).toBe("swipe-123");
  });
});
