import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import * as store from "@/lib/youtube/channel-store";
import { buildWhyFacts } from "@/lib/youtube/why-performance";

const fetchCaptions = vi.fn();
const jevWhy = vi.fn();

vi.mock("@/lib/youtube/captions", () => ({
  fetchVideoCaptions: (...args: unknown[]) => fetchCaptions(...args),
}));
vi.mock("@/lib/typesafe/why-package", () => ({
  jevWhyPackage: (...args: unknown[]) => jevWhy(...args),
}));

const NOW = new Date("2026-09-19T12:00:00.000Z");

describe("buildWhyFacts", () => {
  it("uses the scored ×N and average VPH when there is no snapshot pair", () => {
    const facts = buildWhyFacts(
      {
        title: "Tuto Cursor 2.0 smash",
        description: "Pas à pas Cursor.",
        durationSeconds: 600,
        viewCount: 4000,
        publishedAt: "2026-08-01T00:00:00.000Z",
        medianViews: 1000,
        snapshots: null,
      },
      NOW,
    );
    expect(facts.overperformance).toBe(4);
    expect(facts.performance).toEqual({ kind: "scored", score: 4, band: "over" });
    expect(facts.velocityKind).toBe("average");
    expect(facts.viewsPerHour).toBeGreaterThan(0);
    expect(facts.formatId).toBe("tutorial");
    expect(facts.disclaimer).toBe("no_studio");
  });

  it("does not invent ×N for a video younger than 7 days", () => {
    const facts = buildWhyFacts(
      {
        title: "News flash",
        description: "",
        durationSeconds: 400,
        viewCount: 800,
        publishedAt: "2026-09-18T00:00:00.000Z",
        medianViews: 1000,
        snapshots: null,
      },
      NOW,
    );
    expect(facts.performance.kind).toBe("recent");
    expect(facts.overperformance).toBeNull();
  });

  it("marks velocity delta when two snapshots exist", () => {
    const facts = buildWhyFacts(
      {
        title: "V",
        description: "",
        durationSeconds: 400,
        viewCount: 5000,
        publishedAt: "2026-08-01T00:00:00.000Z",
        medianViews: 1000,
        snapshots: {
          latest: { capturedAt: "2026-09-19T12:00:00.000Z", viewCount: 5000, likeCount: 10 },
          previous: { capturedAt: "2026-09-19T08:00:00.000Z", viewCount: 4200, likeCount: 9 },
        },
      },
      NOW,
    );
    expect(facts.velocityKind).toBe("delta");
    expect(facts.viewsPerHour).toBe(200);
  });
});

describe("composeWhyVideo", () => {
  beforeEach(() => {
    getDb().exec("DELETE FROM followed_channels");
    fetchCaptions.mockReset();
    jevWhy.mockReset();
    const channelId = store.insertChannel(
      { youtubeChannelId: `UC${"z".repeat(22)}`, title: "Ma chaîne", handle: null, avatarUrl: null, subscriberCount: null, videoCount: null },
      { isMine: true },
    ).channel.id;
    store.finishSync(channelId, { medianViews: 1000, syncedAt: "2026-09-19T00:00:00.000Z" });
    store.upsertVideos(
      channelId,
      [
        {
          videoId: "whyvid00001",
          channelId: channelId,
          title: "Tuto Cursor 2.0 smash",
          publishedAt: "2026-08-01T00:00:00.000Z",
          durationSeconds: 600,
          viewCount: 4000,
          likeCount: null,
          thumbnailUrl: "https://i.ytimg.com/vi/whyvid00001/mqdefault.jpg",
          liveBroadcastContent: "none",
          description: "On parle de Cursor 2.0.",
        },
      ],
      "2026-09-19T00:00:00.000Z",
    );
  });

  it("returns null for an unknown id and does not fetch captions", async () => {
    const { composeWhyVideo } = await import("@/lib/youtube/why-performance");
    expect(await composeWhyVideo("missingxxxx")).toBeNull();
    expect(fetchCaptions).not.toHaveBeenCalled();
  });

  it("joins facts, hook quotes and jev without inventing captions", async () => {
    fetchCaptions.mockResolvedValue({
      status: "ok",
      kind: "official",
      language: "fr",
      cues: [{ startMs: 0, durationMs: 1000, text: "Tu vas voir le chiffre. Promis." }],
    });
    jevWhy.mockResolvedValue({
      used: true,
      note: 8,
      holdNoul: 0.7,
      holdBand: "holds",
      categoryId: "curiosity_gap",
      confidence: 0.8,
    });
    const { composeWhyVideo } = await import("@/lib/youtube/why-performance");
    const body = await composeWhyVideo("whyvid00001", new Date("2026-09-19T12:00:00.000Z"));
    expect(body?.videoId).toBe("whyvid00001");
    expect(body?.facts.overperformance).toBe(4);
    expect(body?.captions.quotes[0]).toContain("chiffre");
    expect(body?.jev.categoryId).toBe("curiosity_gap");
    expect(jevWhy.mock.calls[0][0].overperformance).toBe(4);
    expect(jevWhy.mock.calls[0][0].title).toBe("Tuto Cursor 2.0 smash");
  });
});
