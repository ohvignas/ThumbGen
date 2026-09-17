import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE as unfollowChannel } from "@/app/api/channels/[id]/route";
import { POST as syncOne } from "@/app/api/channels/[id]/sync/route";
import { POST as classificationAction } from "@/app/api/channels/classification/route";
import { POST as previewChannel } from "@/app/api/channels/preview/route";
import { GET as listChannels, POST as followChannel } from "@/app/api/channels/route";
import { POST as syncStale } from "@/app/api/channels/sync-stale/route";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import * as store from "@/lib/youtube/channel-store";
import { waitForChannelJobs } from "@/lib/youtube/jobs";
import { acquireChannelLock, releaseChannelLock, resetChannelRuntime } from "@/lib/youtube/runtime";
import type { ChannelDetails, ChannelsResponse } from "@/lib/youtube/types";
import { channelIdFor, createFakeYouTube, type FakeYouTube } from "./fake-youtube";

const TIERCE = channelIdFor("t");
const TIERCE_DETAILS: ChannelDetails = {
  youtubeChannelId: TIERCE,
  title: "Chaîne tierce",
  handle: "@tierce",
  avatarUrl: null,
  subscriberCount: 4200,
  videoCount: 2,
};
let fake: FakeYouTube;

const jsonRequest = (url: string, method: string, body?: unknown) =>
  new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM followed_channels");
  db.exec("DELETE FROM settings");
  setSetting("youtubeApiKey", "test-yt-key");
  setSetting("inspirationAutoClassify", "false");
  vi.stubEnv("OPENROUTER_API_KEY", "");
  resetChannelRuntime();
  fake = createFakeYouTube({
    channels: [{ id: TIERCE, handle: "@tierce", title: "Chaîne tierce", subscribers: 4200 }],
    videos: [
      { id: "tiercevid01", channelId: TIERCE, publishedAt: "2026-08-01T00:00:00Z" },
      { id: "tiercevid02", channelId: TIERCE, publishedAt: "2026-08-10T00:00:00Z" },
    ],
  });
  vi.stubGlobal("fetch", fake.fetch);
});

afterEach(async () => {
  await waitForChannelJobs();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GET /api/channels", () => {
  it("says YouTube is not configured and calls nothing without a key", async () => {
    getDb().exec("DELETE FROM settings");
    vi.stubEnv("YOUTUBE_API_KEY", "");

    const res = await listChannels();

    expect(res.status).toBe(200);
    const body = (await res.json()) as ChannelsResponse;
    expect(body.youtubeConfigured).toBe(false);
    expect(body.channels).toEqual([]);
    expect(body.classification).toMatchObject({ pending: 0, awaitingConfirmation: 0, modelLabel: "Gemini 2.5 Flash Lite" });
    expect(fake.calls).toHaveLength(0);
  });
});

describe("POST /api/channels/preview", () => {
  const url = "http://localhost/api/channels/preview";

  it("previews a channel before following it", async () => {
    const res = await previewChannel(jsonRequest(url, "POST", { input: "https://www.youtube.com/@tierce" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      channel: {
        youtubeChannelId: TIERCE,
        title: "Chaîne tierce",
        handle: "@tierce",
        avatarUrl: `https://yt3.example/${TIERCE}.jpg`,
        subscriberCount: 4200,
        videoCount: 2,
        alreadyFollowed: false,
      },
    });
  });

  it("answers 404 for an unknown channel and 400 for an empty input", async () => {
    const unknown = await previewChannel(jsonRequest(url, "POST", { input: "@inconnue" }));
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: "Chaîne introuvable" });
    expect((await previewChannel(jsonRequest(url, "POST", { input: "   " }))).status).toBe(400);
  });

  it("answers 429 when the quota is exhausted and 400 without a key", async () => {
    fake.setQuotaAfter(0);
    const quota = await previewChannel(jsonRequest(url, "POST", { input: "@tierce" }));
    expect(quota.status).toBe(429);
    expect(await quota.json()).toEqual({ error: "Quota YouTube atteint — réessaie demain" });

    getDb().exec("DELETE FROM settings");
    vi.stubEnv("YOUTUBE_API_KEY", "");
    const noKey = await previewChannel(jsonRequest(url, "POST", { input: "@tierce" }));
    expect(noKey.status).toBe(400);
    expect(await noKey.json()).toEqual({ error: "Ajoute ta clé YouTube dans Réglages → Connexions" });
  });
});

describe("POST /api/channels", () => {
  const url = "http://localhost/api/channels";

  it("follows a channel, imports it in the background and never follows it twice", async () => {
    const res = await followChannel(jsonRequest(url, "POST", { youtubeChannelId: TIERCE }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      alreadyFollowed: false,
      channel: { youtubeChannelId: TIERCE, title: "Chaîne tierce", syncStatus: "syncing", isMine: false },
    });

    await waitForChannelJobs();
    const list = (await (await listChannels()).json()) as ChannelsResponse;
    expect(list.channels).toMatchObject([{ youtubeChannelId: TIERCE, syncStatus: "idle", videoCount: 2 }]);

    const again = await followChannel(jsonRequest(url, "POST", { youtubeChannelId: TIERCE }));
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ alreadyFollowed: true, channel: { youtubeChannelId: TIERCE } });
  });

  it("rejects an invalid id and an unknown channel", async () => {
    expect((await followChannel(jsonRequest(url, "POST", { youtubeChannelId: "@tierce" }))).status).toBe(400);
    expect((await followChannel(jsonRequest(url, "POST", { youtubeChannelId: channelIdFor("x") }))).status).toBe(404);
  });
});

describe("DELETE /api/channels/[id]", () => {
  it("unfollows a channel with its videos", async () => {
    const { channel } = store.insertChannel(TIERCE_DETAILS);
    const request = () => new Request(`http://localhost/api/channels/${channel.id}`, { method: "DELETE" });

    const res = await unfollowChannel(request(), idParams(channel.id));
    expect(res.status).toBe(200);
    expect(store.getChannel(channel.id)).toBeNull();
    expect((await unfollowChannel(request(), idParams(channel.id))).status).toBe(404);
  });

  it("refuses to unfollow « Ma chaîne »", async () => {
    const { channel } = store.insertChannel(TIERCE_DETAILS, { isMine: true });

    const res = await unfollowChannel(new Request(`http://localhost/api/channels/${channel.id}`, { method: "DELETE" }), idParams(channel.id));

    expect(res.status).toBe(409);
    expect(store.getChannel(channel.id)).not.toBeNull();
  });
});

describe("POST /api/channels/[id]/sync", () => {
  it("starts a sync, refuses one already running and ignores unknown channels", async () => {
    const { channel } = store.insertChannel(TIERCE_DETAILS);
    const request = () => new Request(`http://localhost/api/channels/${channel.id}/sync`, { method: "POST" });

    acquireChannelLock(channel.id);
    expect((await syncOne(request(), idParams(channel.id))).status).toBe(409);
    releaseChannelLock(channel.id);

    const started = await syncOne(request(), idParams(channel.id));
    expect(started.status).toBe(202);
    expect(await started.json()).toMatchObject({ started: true, channel: { id: channel.id, syncStatus: "syncing" } });
    await waitForChannelJobs();
    expect(store.getChannelListItem(channel.id)).toMatchObject({ syncStatus: "idle", videoCount: 2 });

    expect((await syncOne(request(), idParams("unknown-channel"))).status).toBe(404);
  });
});

describe("POST /api/channels/sync-stale", () => {
  const url = "http://localhost/api/channels/sync-stale";

  it("queues stale channels, is then throttled, and « all » is not", async () => {
    store.insertChannel(TIERCE_DETAILS);

    const first = await syncStale(jsonRequest(url, "POST", {}));
    expect(first.status).toBe(202);
    expect(await first.json()).toEqual({ queued: 1, throttled: false });
    expect(await (await syncStale(jsonRequest(url, "POST", {}))).json()).toEqual({ queued: 0, throttled: true });

    await waitForChannelJobs();
    expect(await (await syncStale(jsonRequest(url, "POST", { all: true }))).json()).toEqual({ queued: 1, throttled: false });
  });

  it("accepts a request without a body", async () => {
    expect((await syncStale(new Request(url, { method: "POST" }))).status).toBe(202);
  });
});

describe("POST /api/channels/classification", () => {
  it("approves every pending thumbnail", async () => {
    const { channel } = store.insertChannel(TIERCE_DETAILS);
    store.upsertVideos(
      channel.id,
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
    const url = "http://localhost/api/channels/classification";

    const res = await classificationAction(jsonRequest(url, "POST", { action: "approve" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ approved: 1, classification: { pending: 1 } });
    expect((await classificationAction(jsonRequest(url, "POST", { action: "nope" }))).status).toBe(400);
  });
});
