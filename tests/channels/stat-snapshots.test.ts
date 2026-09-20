import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import * as store from "@/lib/youtube/channel-store";
import {
  SNAPSHOT_RETENTION_DAYS,
  insertStatSnapshots,
  latestSnapshotPairs,
  pruneStatSnapshots,
  youngVideoIdsDueForSnapshot,
} from "@/lib/youtube/stat-snapshots";
import type { ChannelDetails, VideoDetails } from "@/lib/youtube/types";

const NOW = new Date("2026-09-19T12:00:00.000Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

const details = (letter: string): ChannelDetails => ({
  youtubeChannelId: `UC${letter.repeat(22)}`,
  title: `Chaîne ${letter}`,
  handle: null,
  avatarUrl: null,
  subscriberCount: null,
  videoCount: null,
});

const video = (videoId: string, overrides: Partial<VideoDetails> = {}): VideoDetails => ({
  videoId,
  title: videoId,
  publishedAt: hoursAgo(24),
  durationSeconds: 600,
  viewCount: 100,
  likeCount: 3,
  thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
  liveBroadcastContent: "none",
  ...overrides,
});

let channelId: string;

beforeEach(() => {
  getDb().exec("DELETE FROM followed_channels");
  channelId = store.insertChannel(details("s")).channel.id;
});

describe("insertStatSnapshots and latestSnapshotPairs", () => {
  it("keeps the last two relevés per video and ignores a duplicate stamp", () => {
    store.upsertVideos(channelId, [video("vid-1")], hoursAgo(10));
    insertStatSnapshots([{ videoId: "vid-1", capturedAt: hoursAgo(10), viewCount: 100, likeCount: 3 }]);
    insertStatSnapshots([
      { videoId: "vid-1", capturedAt: hoursAgo(4), viewCount: 180, likeCount: 4 },
      { videoId: "vid-1", capturedAt: hoursAgo(4), viewCount: 999, likeCount: 9 },
    ]);
    const pair = latestSnapshotPairs(["vid-1"]).get("vid-1");
    expect(pair).toEqual({
      latest: { capturedAt: hoursAgo(4), viewCount: 180, likeCount: 4 },
      previous: { capturedAt: hoursAgo(10), viewCount: 100, likeCount: 3 },
    });
  });
});

describe("pruneStatSnapshots", () => {
  it("drops rows older than 30 days and keeps younger ones", () => {
    store.upsertVideos(channelId, [video("vid-1")], hoursAgo(2));
    insertStatSnapshots([
      {
        videoId: "vid-1",
        capturedAt: new Date(NOW.getTime() - (SNAPSHOT_RETENTION_DAYS + 1) * 86_400_000).toISOString(),
        viewCount: 10,
        likeCount: null,
      },
    ]);
    expect(pruneStatSnapshots(NOW)).toBe(1);
    expect(latestSnapshotPairs(["vid-1"]).get("vid-1")).toMatchObject({
      latest: { viewCount: 100 },
      previous: null,
    });
  });
});

describe("youngVideoIdsDueForSnapshot", () => {
  it("lists 7-day videos with no snapshot or a snapshot older than 4 hours", () => {
    store.upsertVideos(channelId, [video("young-due", { publishedAt: hoursAgo(20) })], hoursAgo(5));
    store.upsertVideos(channelId, [video("young-fresh", { publishedAt: hoursAgo(10) })], hoursAgo(1));
    store.upsertVideos(channelId, [video("old", { publishedAt: hoursAgo(8 * 24) })], hoursAgo(5));
    expect(youngVideoIdsDueForSnapshot(NOW, channelId).sort()).toEqual(["young-due"]);
  });
});
