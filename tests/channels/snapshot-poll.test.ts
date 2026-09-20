import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import * as store from "@/lib/youtube/channel-store";
import { queueSnapshotPoll, waitForChannelJobs } from "@/lib/youtube/jobs";
import { acquireChannelLock, markQuotaBlocked, releaseChannelLock, resetChannelRuntime } from "@/lib/youtube/runtime";
import { latestSnapshotPairs } from "@/lib/youtube/stat-snapshots";
import { pollFollowedSnapshots } from "@/lib/youtube/snapshot-poll";
import type { VideoDetails } from "@/lib/youtube/types";
import { channelIdFor, createFakeYouTube, type FakeYouTube } from "./fake-youtube";

const A = channelIdFor("a");
const NOW = new Date("2026-09-19T12:00:00.000Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();
let fake: FakeYouTube;
let channelId: string;

const known: VideoDetails = {
  videoId: "oldvid00001",
  title: "Old",
  publishedAt: hoursAgo(20),
  durationSeconds: 600,
  viewCount: 100,
  likeCount: 1,
  thumbnailUrl: "https://i.ytimg.com/vi/oldvid00001/mqdefault.jpg",
  liveBroadcastContent: "none",
};

beforeEach(() => {
  getDb().exec("DELETE FROM followed_channels");
  getDb().exec("DELETE FROM settings");
  setSetting("youtubeApiKey", "test-yt-key");
  resetChannelRuntime();
  fake = createFakeYouTube({
    channels: [{ id: A, handle: "@a", title: "A", hasLongFormPlaylist: true }],
    videos: [
      { id: "oldvid00001", channelId: A, publishedAt: hoursAgo(20), views: 220, title: "Old" },
      { id: "newvid00001", channelId: A, publishedAt: hoursAgo(2), views: 40, title: "New" },
    ],
  });
  vi.stubGlobal("fetch", fake.fetch);
  channelId = store.insertChannel({
    youtubeChannelId: A,
    title: "A",
    handle: "@a",
    avatarUrl: null,
    subscriberCount: 1000,
    videoCount: 1,
  }).channel.id;
  store.setPlaylistId(channelId, `UULF${A.slice(2)}`);
  store.upsertVideos(channelId, [known], hoursAgo(5));
});

afterEach(async () => {
  await waitForChannelJobs();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("pollFollowedSnapshots", () => {
  it("imports a new RSS id and refreshes a young video whose snapshot is stale", async () => {
    const outcome = await pollFollowedSnapshots(() => NOW);
    expect(outcome).toEqual({ rssNew: 1, refreshed: 1, status: "done" });
    expect(store.getVideo("newvid00001")).toMatchObject({ view_count: 40, title: "New" });
    expect(store.getVideo("oldvid00001")?.view_count).toBe(220);
    expect(latestSnapshotPairs(["oldvid00001"]).get("oldvid00001")?.latest.viewCount).toBe(220);
    expect(fake.count("videos")).toBeGreaterThanOrEqual(1);
    expect(fake.calls.some((call) => call.resource === "playlistItems")).toBe(false);
  });

  it("skips a channel that is mid-sync and stops on quota", async () => {
    acquireChannelLock(channelId);
    expect(await pollFollowedSnapshots(() => NOW)).toEqual({ rssNew: 0, refreshed: 0, status: "done" });
    expect(store.getVideo("newvid00001")).toBeNull();
    releaseChannelLock(channelId);

    fake.setQuotaAfter(0);
    const quota = await pollFollowedSnapshots(() => NOW);
    expect(quota.status).toBe("quota");
  });

  it("does nothing without a YouTube key", async () => {
    getDb().exec("DELETE FROM settings");
    vi.stubEnv("YOUTUBE_API_KEY", "");
    expect(await pollFollowedSnapshots(() => NOW)).toEqual({ rssNew: 0, refreshed: 0, status: "no-key" });
    expect(fake.count("videos")).toBe(0);
  });
});

describe("queueSnapshotPoll", () => {
  it("is throttled for 15 minutes unless forced", async () => {
    expect(queueSnapshotPoll({ now: NOW })).toEqual({ started: true, throttled: false });
    expect(queueSnapshotPoll({ now: new Date(NOW.getTime() + 60_000) })).toEqual({ started: false, throttled: true });
    expect(queueSnapshotPoll({ now: new Date(NOW.getTime() + 60_000), force: true })).toEqual({ started: true, throttled: false });
    await waitForChannelJobs();
    expect(store.getVideo("newvid00001")?.view_count).toBe(40);
  });

  it("does not start while the quota is blocked", () => {
    markQuotaBlocked(NOW);
    expect(queueSnapshotPoll({ now: NOW })).toEqual({ started: false, throttled: true });
  });
});
