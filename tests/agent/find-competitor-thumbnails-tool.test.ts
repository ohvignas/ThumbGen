import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

import { createConversation } from "@/lib/agent/conversation/store";
import { executeFindCompetitorThumbnails } from "@/lib/agent/v2/find-competitor-thumbnails-tool";
import { getCompetitorSearch } from "@/lib/brief/competitor-search-store";
import { briefUpdateInputSchema } from "@/lib/brief/merge";
import { getBrief, updateBrief } from "@/lib/brief/store";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import * as store from "@/lib/youtube/channel-store";
import { SEARCH_LIST_UNITS, VIDEOS_LIST_UNITS, PLAYLIST_ITEMS_UNITS, longFormPlaylistId } from "@/lib/youtube/api";
import { setCachedMedian } from "@/lib/brief/channel-median-cache";
import { isFakeAgentEnabled } from "@/lib/agent/v2/fake-agent-model";
import * as generationsLog from "@/lib/generations-log";
import { channelIdFor, createFakeYouTube, type FakeYouTube, type FakeVideo } from "../channels/fake-youtube";

vi.mock("@/lib/agent/v2/fake-agent-model", () => ({
  isFakeAgentEnabled: vi.fn(() => false),
}));

const NOW = new Date("2026-09-17T12:00:00.000Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const FR = channelIdFor("f");
const EN = channelIdFor("e");
const THIN = channelIdFor("t");
const VIRAL = channelIdFor("v");

let fake: FakeYouTube;

function conversationWithBrief() {
  const conversation = createConversation("proj-comp");
  updateBrief(conversation.id, conversation.project_id, briefUpdateInputSchema.parse({ step: 3 }));
  return conversation.id;
}

function video(partial: Partial<FakeVideo> & { id: string; channelId: string }): FakeVideo {
  return {
    publishedAt: day(40),
    durationSeconds: 600,
    views: 1000,
    title: `Vidéo ${partial.id}`,
    ...partial,
  };
}

function follow(youtubeChannelId: string, title: string, samples: Array<{ id: string; views: number }>) {
  const { channel } = store.insertChannel(
    { youtubeChannelId, title, handle: null, avatarUrl: null, subscriberCount: null, videoCount: null },
    { isMine: false },
  );
  store.upsertVideos(
    channel.id,
    samples.map((sample, index) => ({
      videoId: sample.id,
      title: "base",
      publishedAt: day(80 + index),
      durationSeconds: 600,
      viewCount: sample.views,
      likeCount: null,
      thumbnailUrl: "",
      liveBroadcastContent: "none",
      channelId: youtubeChannelId,
    })),
    NOW.toISOString(),
  );
  store.finishSync(channel.id, { medianViews: 1000, syncedAt: NOW.toISOString() });
}

const text = (result: { content: Array<{ type: string; text?: string }> }) =>
  result.content.flatMap((part) => (part.type === "text" && part.text ? [part.text] : [])).join("\n");

beforeEach(() => {
  vi.mocked(isFakeAgentEnabled).mockReturnValue(false);
  getDb().exec("DELETE FROM followed_channels");
  getDb().exec("DELETE FROM generations_log");
  getDb().exec("DELETE FROM channel_median_cache");
  setSetting("youtubeApiKey", "test-yt-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("find_competitor_thumbnails", () => {
  it("excludes Shorts, lives and young videos, skips the followed playlist, and returns no images", async () => {
    const extras: FakeVideo[] = Array.from({ length: 12 }, (_, index) =>
      video({
        id: `baseen${String(index).padStart(5, "0")}`,
        channelId: EN,
        views: 800,
        publishedAt: day(60 + index),
        title: "baseline en",
      }),
    );
    fake = createFakeYouTube({
      channels: [
        { id: FR, handle: "@Fr", title: "Chaîne FR", hasLongFormPlaylist: true },
        { id: EN, handle: "@En", title: "EN channel", hasLongFormPlaylist: true },
      ],
      videos: [
        video({ id: "goodfr00001", channelId: FR, title: "miniatures FR hit", views: 8000 }),
        video({ id: "shortfr0001", channelId: FR, title: "miniatures FR short", durationSeconds: 60 }),
        video({ id: "livefr00001", channelId: FR, title: "miniatures FR live", live: "live" }),
        video({ id: "youngfr0001", channelId: FR, title: "miniatures FR young", publishedAt: day(3) }),
        video({ id: "goeden00001", channelId: EN, title: "thumbnails EN hit", views: 9000 }),
        ...extras,
      ],
    });
    vi.stubGlobal("fetch", fake.fetch);
    follow(
      FR,
      "Chaîne FR",
      Array.from({ length: 10 }, (_, index) => ({ id: `frbase${String(index).padStart(5, "0")}`, views: 1000 })),
    );

    const conversationId = conversationWithBrief();
    const result = await executeFindCompetitorThumbnails(
      { conversationId, now: NOW },
      { query_fr: "miniatures FR", query_en: "thumbnails EN" },
    );
    expect(result.isError).toBeFalsy();
    const body = text(result);
    expect(body).toContain("youtube:goodfr00001");
    expect(body).toContain("youtube:goeden00001");
    expect(body).not.toContain("shortfr0001");
    expect(body).not.toContain("livefr00001");
    expect(body).not.toContain("youngfr0001");
    expect(body).not.toMatch(/data:|base64|i\.ytimg/i);
    expect(fake.calls.some((call) => call.resource === "playlistItems" && call.params.get("playlistId") === longFormPlaylistId(FR))).toBe(
      false,
    );
    expect(fake.count("playlistItems")).toBe(1);
    expect(getBrief(conversationId)!.brief.competition).toBeUndefined();
    expect(getCompetitorSearch(conversationId)?.some((hit) => hit.videoId === "goodfr00001")).toBe(true);
    expect(getBrief(conversationId)!.brief.usage.competitorSearches).toBe(1);
    const expectedUnits = 2 * SEARCH_LIST_UNITS + 2 * VIDEOS_LIST_UNITS + PLAYLIST_ITEMS_UNITS;
    expect(body).toContain(`unités YouTube : ${expectedUnits}`);
  });

  it("excludes the candidate from the unfollowed median so a thin channel stays peu de données", async () => {
    fake = createFakeYouTube({
      channels: [
        { id: FR, handle: "@Fr", title: "Chaîne FR", hasLongFormPlaylist: true },
        { id: THIN, handle: "@Thin", title: "Thin channel", hasLongFormPlaylist: true },
      ],
      videos: [
        video({ id: "goodfr00001", channelId: FR, title: "miniatures FR hit", views: 2000 }),
        video({ id: "thin0000001", channelId: THIN, title: "thumbnails EN viral", views: 10_000 }),
        ...Array.from({ length: 7 }, (_, index) =>
          video({
            id: `thinbase${String(index).padStart(4, "0")}`,
            channelId: THIN,
            views: 1000,
            publishedAt: day(50 + index),
            title: "thin baseline",
          }),
        ),
      ],
    });
    vi.stubGlobal("fetch", fake.fetch);
    follow(
      FR,
      "Chaîne FR",
      Array.from({ length: 10 }, (_, index) => ({ id: `frbase${String(index).padStart(5, "0")}`, views: 1000 })),
    );

    const conversationId = conversationWithBrief();
    const body = text(
      await executeFindCompetitorThumbnails({ conversationId, now: NOW }, { query_fr: "miniatures FR", query_en: "thumbnails EN" }),
    );
    expect(body).toContain("youtube:thin0000001");
    expect(body).toMatch(/youtube:thin0000001 \| Thin channel \| 10000 \| peu de données \|/);
  });

  it("caps sort at ×30, flags viral atypique, and keeps at least 4 FR", async () => {
    const extraChannels = Array.from({ length: 9 }, (_, index) => channelIdFor(String(index)));
    const enHits: FakeVideo[] = [
      video({
        id: "enhit000000",
        channelId: VIRAL,
        title: "thumbnails EN hit 0",
        views: 40_000,
      }),
      ...extraChannels.map((channelId, index) =>
        video({
          id: `enhit${String(index + 1).padStart(6, "0")}`,
          channelId,
          title: `thumbnails EN hit ${index + 1}`,
          views: 5000,
          publishedAt: day(40 + index),
        }),
      ),
    ];
    const frHits: FakeVideo[] = Array.from({ length: 4 }, (_, index) =>
      video({
        id: `frhit${String(index).padStart(6, "0")}`,
        channelId: FR,
        title: `miniatures FR hit ${index}`,
        views: 2000,
        publishedAt: day(40 + index),
      }),
    );
    fake = createFakeYouTube({
      channels: [
        { id: FR, handle: "@Fr", title: "Chaîne FR", hasLongFormPlaylist: true },
        { id: VIRAL, handle: "@Viral", title: "Viral channel", hasLongFormPlaylist: true },
        ...extraChannels.map((id, index) => ({
          id,
          handle: `@En${index}`,
          title: `EN channel ${index}`,
          hasLongFormPlaylist: true as const,
        })),
      ],
      videos: [
        ...frHits,
        ...enHits,
        ...Array.from({ length: 12 }, (_, index) =>
          video({
            id: `viralbase${String(index).padStart(3, "0")}`,
            channelId: VIRAL,
            views: 1000,
            publishedAt: day(60 + index),
            title: "viral baseline",
          }),
        ),
      ],
    });
    vi.stubGlobal("fetch", fake.fetch);
    for (const channelId of extraChannels) setCachedMedian(channelId, 1000, 20, NOW);
    follow(
      FR,
      "Chaîne FR",
      Array.from({ length: 10 }, (_, index) => ({ id: `frbase${String(index).padStart(5, "0")}`, views: 1000 })),
    );

    const conversationId = conversationWithBrief();
    const body = text(
      await executeFindCompetitorThumbnails({ conversationId, now: NOW }, { query_fr: "miniatures FR", query_en: "thumbnails EN" }),
    );
    expect(body).toMatch(/youtube:enhit000000 \| Viral channel \| 40000 \| ×40,0 viral atypique \|/);
    const hits = getCompetitorSearch(conversationId)!;
    expect(hits).toHaveLength(12);
    expect(hits.filter((hit) => hit.lang === "fr")).toHaveLength(4);
    expect(hits[0].videoId).toBe("enhit000000");
    expect(hits[0].viral).toBe(true);
    expect(hits[0].score).toBe(40);
  });

  it("skips without a key, after quota, and after the limit of 2", async () => {
    fake = createFakeYouTube({
      channels: [
        { id: FR, handle: "@Fr", title: "Chaîne FR" },
        { id: EN, handle: "@En", title: "EN channel", hasLongFormPlaylist: true },
      ],
      videos: [
        video({ id: "goodfr00001", channelId: FR, title: "miniatures FR hit", views: 2000 }),
        video({ id: "goeden00001", channelId: EN, title: "thumbnails EN hit", views: 2000 }),
        ...Array.from({ length: 10 }, (_, index) =>
          video({
            id: `baseen${String(index).padStart(5, "0")}`,
            channelId: EN,
            views: 1000,
            publishedAt: day(60 + index),
            title: "baseline en",
          }),
        ),
      ],
    });
    vi.stubGlobal("fetch", fake.fetch);

    const conversationId = conversationWithBrief();
    setSetting("youtubeApiKey", "");
    const none = await executeFindCompetitorThumbnails({ conversationId, now: NOW }, { query_fr: "a", query_en: "b" });
    expect(none.isError).toBe(true);
    expect(none.requestNotSent).toBe(true);
    expect(text(none)).toMatch(/clé YouTube/i);
    expect(fake.fetch).not.toHaveBeenCalled();
    expect(getBrief(conversationId)!.brief.usage.competitorSearches).toBe(0);

    setSetting("youtubeApiKey", "test-yt-key");
    fake.setQuotaAfter(0);
    const quota = await executeFindCompetitorThumbnails(
      { conversationId, now: NOW },
      { query_fr: "miniatures FR", query_en: "thumbnails EN" },
    );
    expect(quota.isError).toBe(true);
    expect(text(quota)).toMatch(/continue sans miniatures concurrentes/i);
    expect(getBrief(conversationId)!.brief.usage.competitorSearches).toBe(1);

    fake.setQuotaAfter(null);
    await executeFindCompetitorThumbnails({ conversationId, now: NOW }, { query_fr: "miniatures FR", query_en: "thumbnails EN" });
    const limited = await executeFindCompetitorThumbnails(
      { conversationId, now: NOW },
      { query_fr: "miniatures FR", query_en: "thumbnails EN" },
    );
    expect(limited.requestNotSent).toBe(true);
    expect(text(limited)).toMatch(/Limite de 2/);
    expect(getBrief(conversationId)!.brief.usage.competitorSearches).toBe(2);
  });

  it("does not fetch or log in fake mode", async () => {
    vi.mocked(isFakeAgentEnabled).mockReturnValue(true);
    fake = createFakeYouTube();
    vi.stubGlobal("fetch", fake.fetch);
    const spy = vi.spyOn(generationsLog, "logGeneration");
    const conversationId = conversationWithBrief();
    await executeFindCompetitorThumbnails({ conversationId, now: NOW }, { query_fr: "a", query_en: "b" });
    expect(fake.fetch).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
    expect(getCompetitorSearch(conversationId)?.length).toBe(12);
    spy.mockRestore();
  });
});
