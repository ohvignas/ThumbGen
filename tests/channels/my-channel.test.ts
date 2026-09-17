import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import * as store from "@/lib/youtube/channel-store";
import { waitForChannelJobs } from "@/lib/youtube/jobs";
import { reconcileMyChannel } from "@/lib/youtube/my-channel";
import { resetChannelRuntime } from "@/lib/youtube/runtime";
import { channelIdFor, createFakeYouTube, type FakeYouTube } from "./fake-youtube";

const MINE = channelIdFor("m");
const OTHER = channelIdFor("o");
let fake: FakeYouTube;

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
      { id: MINE, handle: "@machaine", title: "Ma chaîne" },
      { id: OTHER, handle: "@autre", title: "Autre chaîne" },
    ],
    videos: [{ id: "minevideo01", channelId: MINE, publishedAt: "2026-08-01T00:00:00Z" }],
  });
  vi.stubGlobal("fetch", fake.fetch);
});

afterEach(async () => {
  await waitForChannelJobs();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("reconcileMyChannel", () => {
  it("follows the channel set in Réglages → Ma chaîne and imports it", async () => {
    setSetting("youtubePlaylistId", "https://www.youtube.com/@machaine");

    const result = await reconcileMyChannel();
    expect(result.changed).toBe(true);
    expect(result.addedChannelId).not.toBeNull();
    await waitForChannelJobs();

    expect(store.listChannelItems()).toMatchObject([{ youtubeChannelId: MINE, isMine: true, videoCount: 1, syncStatus: "idle" }]);
  });

  it("does not ask YouTube again while the setting is unchanged", async () => {
    setSetting("youtubePlaylistId", "@machaine");
    await reconcileMyChannel();
    await waitForChannelJobs();
    const channelCalls = fake.count("channels");

    expect(await reconcileMyChannel()).toEqual({ changed: false, addedChannelId: null });
    expect(fake.count("channels")).toBe(channelCalls);
  });

  it("moves « Ma chaîne » when the setting changes and keeps following the old one", async () => {
    setSetting("youtubePlaylistId", "@machaine");
    await reconcileMyChannel();
    await waitForChannelJobs();

    setSetting("youtubePlaylistId", "@autre");
    expect((await reconcileMyChannel()).changed).toBe(true);
    await waitForChannelJobs();

    expect(store.listChannelItems().map((item) => [item.youtubeChannelId, item.isMine])).toEqual([
      [OTHER, true],
      [MINE, false],
    ]);
  });

  it("marks an already followed channel as mine without asking YouTube or adding it twice", async () => {
    store.insertChannel({ youtubeChannelId: OTHER, title: "Autre chaîne", handle: "@autre", avatarUrl: null, subscriberCount: null, videoCount: null });
    setSetting("youtubePlaylistId", OTHER);

    expect(await reconcileMyChannel()).toEqual({ changed: true, addedChannelId: null });
    expect(store.listChannelItems()).toMatchObject([{ youtubeChannelId: OTHER, isMine: true }]);
    expect(fake.count("channels")).toBe(0);
  });

  it("accepts the uploads playlist id older settings may hold", async () => {
    setSetting("youtubePlaylistId", `UU${MINE.slice(2)}`);

    await reconcileMyChannel();
    await waitForChannelJobs();

    expect(store.listChannelItems()[0]).toMatchObject({ youtubeChannelId: MINE, isMine: true });
  });

  it("clears « Ma chaîne » when the setting is emptied", async () => {
    setSetting("youtubePlaylistId", "@machaine");
    await reconcileMyChannel();
    await waitForChannelJobs();

    setSetting("youtubePlaylistId", "");
    expect(await reconcileMyChannel()).toEqual({ changed: true, addedChannelId: null });
    expect(store.listChannelItems()).toMatchObject([{ youtubeChannelId: MINE, isMine: false }]);
  });

  it("does nothing without a YouTube key", async () => {
    getDb().exec("DELETE FROM settings");
    vi.stubEnv("YOUTUBE_API_KEY", "");
    setSetting("youtubePlaylistId", "@machaine");

    expect(await reconcileMyChannel()).toEqual({ changed: false, addedChannelId: null });
    expect(fake.calls).toHaveLength(0);
    expect(store.listChannelItems()).toEqual([]);
  });

  it("keeps things as they are when YouTube fails", async () => {
    setSetting("youtubePlaylistId", "@machaine");
    fake.setQuotaAfter(0);

    expect(await reconcileMyChannel()).toEqual({ changed: false, addedChannelId: null });
    expect(store.listChannelItems()).toEqual([]);
  });
});
