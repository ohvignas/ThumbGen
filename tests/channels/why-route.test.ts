import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as whyRoute } from "@/app/api/channels/videos/[videoId]/why/route";
import { getDb } from "@/lib/db";
import * as store from "@/lib/youtube/channel-store";
import type { WhyVideoResponse } from "@/lib/youtube/types";

const compose = vi.fn();

vi.mock("@/lib/youtube/why-performance", () => ({
  composeWhyVideo: (...args: unknown[]) => compose(...args),
}));

const params = (videoId: string) => ({ params: Promise.resolve({ videoId }) });

beforeEach(() => {
  getDb().exec("DELETE FROM followed_channels");
  compose.mockReset();
  const channelId = store.insertChannel(
    { youtubeChannelId: `UC${"w".repeat(22)}`, title: "Ma chaîne", handle: null, avatarUrl: null, subscriberCount: null, videoCount: null },
    { isMine: true },
  ).channel.id;
  store.finishSync(channelId, { medianViews: 1000, syncedAt: new Date().toISOString() });
  store.upsertVideos(
    channelId,
    [
      {
        videoId: "routevid001",
        channelId,
        title: "Vidéo routevid001",
        publishedAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
        durationSeconds: 600,
        viewCount: 5000,
        likeCount: null,
        thumbnailUrl: "https://i.ytimg.com/vi/routevid001/mqdefault.jpg",
        liveBroadcastContent: "none",
      },
    ],
    new Date().toISOString(),
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/channels/videos/[videoId]/why", () => {
  it("returns 404 when compose returns null", async () => {
    compose.mockResolvedValue(null);
    const res = await whyRoute(new Request("http://localhost/api/channels/videos/nope/why"), params("nope"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Vidéo inconnue" });
  });

  it("returns the composed body for a followed video", async () => {
    const body: WhyVideoResponse = {
      videoId: "routevid001",
      facts: {
        overperformance: 5,
        performance: { kind: "scored", score: 5, band: "over" },
        viewsPerHour: 10,
        velocityKind: "average",
        formatId: "other",
        disclaimer: "no_studio",
      },
      captions: { status: "missing", kind: null, language: null, quotes: [], hookText: "" },
      jev: { used: false, note: null, holdNoul: null, holdBand: null, categoryId: null, confidence: null },
    };
    compose.mockResolvedValue(body);
    const res = await whyRoute(new Request("http://localhost/api/channels/videos/routevid001/why"), params("routevid001"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(body);
    expect(compose).toHaveBeenCalledWith("routevid001", expect.any(Date), expect.any(AbortSignal));
  });
});
