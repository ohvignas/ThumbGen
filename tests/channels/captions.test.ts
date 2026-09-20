import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";

const fetchMock = vi.fn<typeof fetch>();
const transcriptMock = vi.fn();

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: (...args: unknown[]) => transcriptMock(...args) },
}));

beforeEach(() => {
  getDb().exec("DELETE FROM settings");
  setSetting("language", "fr");
  fetchMock.mockReset();
  transcriptMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  const { resetCaptionCache } = await import("@/lib/youtube/captions");
  resetCaptionCache();
  vi.unstubAllGlobals();
});

const playerPayload = {
  captions: {
    playerCaptionsTracklistRenderer: {
      captionTracks: [
        {
          baseUrl: "https://www.youtube.com/api/timedtext?v=vid&lang=en&kind=asr&fmt=srv3",
          languageCode: "en",
          kind: "asr",
        },
        {
          baseUrl: "https://www.youtube.com/api/timedtext?v=vid&lang=fr",
          languageCode: "fr",
        },
      ],
    },
  },
};

describe("fetchVideoCaptions", () => {
  it("uses InnerTube ANDROID then official timedtext json3, not youtube-transcript", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(playerPayload), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "Hook FR" }] }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    const { fetchVideoCaptions } = await import("@/lib/youtube/captions");
    const result = await fetchVideoCaptions("abcdefghijk");
    expect(result).toEqual({
      status: "ok",
      kind: "official",
      language: "fr",
      cues: [{ startMs: 0, durationMs: 1000, text: "Hook FR" }],
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain("youtubei/v1/player");
    const playerInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(String(playerInit.headers)).toMatch(/com\.google\.android\.youtube/i);
    const playerBody = JSON.parse(String(playerInit.body));
    expect(playerBody.context.client.clientName).toBe("ANDROID");
    expect(playerBody.videoId).toBe("abcdefghijk");
    expect(String(fetchMock.mock.calls[1][0])).toContain("fmt=json3");
    expect(String(fetchMock.mock.calls[1][0])).toContain("lang=fr");
    expect(transcriptMock).not.toHaveBeenCalled();
  });

  it("falls back to youtube-transcript when InnerTube has no tracks", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ captions: {} }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    transcriptMock.mockResolvedValueOnce([{ text: "Hello", offset: 0, duration: 1000 }]);
    const { fetchVideoCaptions } = await import("@/lib/youtube/captions");
    const result = await fetchVideoCaptions("abcdefghijk");
    expect(result.status).toBe("ok");
    expect(result.kind).toBe("unknown");
    expect(result.cues).toEqual([{ startMs: 0, durationMs: 1000, text: "Hello" }]);
    expect(transcriptMock).toHaveBeenCalled();
  });

  it("returns blocked when player and fallback both fail", async () => {
    fetchMock.mockRejectedValueOnce(new Error("blocked"));
    transcriptMock.mockRejectedValueOnce(new Error("nope"));
    const { fetchVideoCaptions } = await import("@/lib/youtube/captions");
    expect(await fetchVideoCaptions("abcdefghijk")).toEqual({
      status: "blocked",
      kind: null,
      language: null,
      cues: [],
    });
  });

  it("returns missing when both paths find no cues", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ captions: {} }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    transcriptMock.mockRejectedValueOnce(new Error("No transcripts are available"));
    const { fetchVideoCaptions } = await import("@/lib/youtube/captions");
    expect(await fetchVideoCaptions("abcdefghijk")).toMatchObject({ status: "missing", cues: [] });
  });

  it("caches the result for 24h so a second call does not hit the network", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(playerPayload), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 1, segs: [{ utf8: "A" }] }] }), {
          status: 200,
        }),
      );
    const { fetchVideoCaptions } = await import("@/lib/youtube/captions");
    await fetchVideoCaptions("abcdefghijk");
    await fetchVideoCaptions("abcdefghijk");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
