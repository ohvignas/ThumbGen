import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import * as store from "@/lib/youtube/channel-store";
import {
  STALE_AFTER_MS,
  approveClassification,
  getClassificationStatus,
  queueChannelSyncs,
  reconcileSyncStatuses,
  startChannelSync,
  waitForChannelJobs,
} from "@/lib/youtube/jobs";
import { acquireChannelLock, markQuotaBlocked, releaseChannelLock, resetChannelRuntime } from "@/lib/youtube/runtime";
import { channelIdFor, createFakeYouTube, type FakeYouTube } from "./fake-youtube";

const A = channelIdFor("a");
const B = channelIdFor("b");
const NOW = new Date("2026-09-16T12:00:00.000Z");
let fake: FakeYouTube;

function follow(youtubeChannelId: string, lastSyncedAt: string | null): string {
  const { channel } = store.insertChannel({
    youtubeChannelId,
    title: youtubeChannelId.slice(0, 6),
    handle: null,
    avatarUrl: null,
    subscriberCount: null,
    videoCount: null,
  });
  if (lastSyncedAt) store.finishSync(channel.id, { medianViews: null, syncedAt: lastSyncedAt });
  return channel.id;
}

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM followed_channels");
  db.exec("DELETE FROM settings");
  setSetting("youtubeApiKey", "test-yt-key");
  setSetting("inspirationAutoClassify", "false");
  vi.stubEnv("OPENROUTER_API_KEY", "");
  resetChannelRuntime();
  fake = createFakeYouTube({
    channels: [
      { id: A, handle: "@a", title: "A" },
      { id: B, handle: "@b", title: "B" },
    ],
    videos: [
      { id: "vida0000001", channelId: A, publishedAt: "2026-08-01T00:00:00Z" },
      { id: "vidb0000001", channelId: B, publishedAt: "2026-08-02T00:00:00Z" },
    ],
  });
  vi.stubGlobal("fetch", fake.fetch);
});

afterEach(async () => {
  await waitForChannelJobs();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("startChannelSync", () => {
  it("starts a background sync once and refuses a second while it runs", async () => {
    const channelId = follow(A, null);

    expect(startChannelSync(channelId)).toBe(true);
    expect(startChannelSync(channelId)).toBe(false);
    await waitForChannelJobs();

    expect(store.getChannelListItem(channelId)).toMatchObject({ syncStatus: "idle", videoCount: 1 });
    expect(startChannelSync(channelId)).toBe(true);
  });
});

describe("queueChannelSyncs", () => {
  it("syncs only channels older than 12 hours, one after the other", async () => {
    const stale = follow(A, new Date(NOW.getTime() - STALE_AFTER_MS - 60_000).toISOString());
    const never = follow(B, null);
    const freshSyncedAt = new Date(NOW.getTime() - 60_000).toISOString();
    const fresh = follow(channelIdFor("c"), freshSyncedAt);

    expect(queueChannelSyncs({ now: NOW })).toEqual({ queued: 2, throttled: false });
    await waitForChannelJobs();

    expect(store.getChannelListItem(stale)?.videoCount).toBe(1);
    expect(store.getChannelListItem(never)?.videoCount).toBe(1);
    expect(store.getChannel(fresh)?.last_synced_at).toBe(freshSyncedAt);
    // Never-synced channels go first; B's calls all happen before A's first one.
    const playlists = fake.calls.filter((call) => call.resource === "playlistItems").map((call) => call.params.get("playlistId") ?? "");
    const lastB = playlists.map((playlistId) => playlistId.endsWith(B.slice(2))).lastIndexOf(true);
    const firstA = playlists.findIndex((playlistId) => playlistId.endsWith(A.slice(2)));
    expect(lastB).toBeGreaterThanOrEqual(0);
    expect(lastB).toBeLessThan(firstA);
  });

  it("is throttled for 10 minutes, « Tout actualiser » is not", async () => {
    follow(A, null);
    const b = follow(B, NOW.toISOString());

    expect(queueChannelSyncs({ now: NOW })).toEqual({ queued: 1, throttled: false });
    expect(queueChannelSyncs({ now: new Date(NOW.getTime() + 60_000) })).toEqual({ queued: 0, throttled: true });
    await waitForChannelJobs();

    expect(queueChannelSyncs({ all: true, now: new Date(NOW.getTime() + 120_000) })).toEqual({ queued: 2, throttled: false });
    await waitForChannelJobs();
    expect(store.getChannel(b)?.last_synced_at).not.toBe(NOW.toISOString());
  });

  it("does nothing while the quota is exhausted or without a YouTube key", () => {
    follow(A, null);
    markQuotaBlocked(NOW);
    expect(queueChannelSyncs({ now: NOW })).toEqual({ queued: 0, throttled: true });

    getDb().exec("DELETE FROM settings");
    vi.stubEnv("YOUTUBE_API_KEY", "");
    expect(queueChannelSyncs({ all: true, now: NOW })).toEqual({ queued: 0, throttled: false });
    expect(fake.calls).toHaveLength(0);
  });
});

describe("reconcileSyncStatuses", () => {
  it("resets a « syncing » status left behind by a restart, not a running one", () => {
    const orphan = follow(A, null);
    store.setSyncState(orphan, { status: "syncing" });
    const running = follow(B, null);
    store.setSyncState(running, { status: "syncing" });
    acquireChannelLock(running);

    reconcileSyncStatuses();

    expect(store.getChannel(orphan)?.sync_status).toBe("idle");
    expect(store.getChannel(running)?.sync_status).toBe("syncing");
    releaseChannelLock(running);
  });
});

describe("classification status", () => {
  it("reports pending thumbnails and approves them", async () => {
    const channelId = follow(A, null);
    store.upsertVideos(
      channelId,
      [
        {
          videoId: "pending0001",
          title: "En attente",
          publishedAt: "2026-08-01T00:00:00.000Z",
          durationSeconds: 600,
          viewCount: 1,
          likeCount: null,
          thumbnailUrl: "https://i.ytimg.com/vi/pending0001/mqdefault.jpg",
          liveBroadcastContent: "none",
        },
      ],
      "2026-09-01T00:00:00.000Z",
    );

    expect(getClassificationStatus()).toMatchObject({ enabled: false, hasKey: false, pending: 1, awaitingConfirmation: 0, running: false });
    expect(approveClassification()).toBe(1);
    await waitForChannelJobs();
    expect(store.getVideo("pending0001")?.thumb_type).toBeNull();
  });
});
