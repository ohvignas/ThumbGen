import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getDb } from "@/lib/db";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  getDb()
    .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
    .run("youtubeApiKey", "test-yt-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("search_youtube_channel", () => {
  it("resolves a handle to channel ID then searches", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ id: "UC123" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: { videoId: "vid1" },
              snippet: {
                title: "Test video",
                publishedAt: "2026-04-01T00:00:00Z",
                thumbnails: { medium: { url: "https://yt.com/t.jpg" } },
              },
            },
          ],
        }),
      });

    const { searchYoutubeChannelTool } = await import("@/lib/agent/tools/search-youtube-channel");
    const r = await searchYoutubeChannelTool.handler({ channel: "@testhandle", query: "test" });
    expect(r.isError).toBeFalsy();
    expect((r.content[0] as { text: string }).text).toContain("Test video");
    expect((r.content[0] as { text: string }).text).toContain("vid1");
  });

  it("returns isError when API key is missing", async () => {
    getDb().prepare("DELETE FROM settings WHERE key = ?").run("youtubeApiKey");
    const { searchYoutubeChannelTool } = await import("@/lib/agent/tools/search-youtube-channel");
    const r = await searchYoutubeChannelTool.handler({ channel: "@x" });
    expect(r.isError).toBe(true);
  });
});
