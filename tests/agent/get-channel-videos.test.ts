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

describe("get_channel_videos", () => {
  it("lists videos sorted by date for a channel handle", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ id: "UC456" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: { videoId: "abc123" },
              snippet: {
                title: "My Latest Video",
                publishedAt: "2026-04-10T00:00:00Z",
                thumbnails: { medium: { url: "https://yt.com/thumb.jpg" } },
              },
            },
          ],
        }),
      });

    const { getChannelVideosTool } = await import("@/lib/agent/tools/get-channel-videos");
    const r = await getChannelVideosTool.handler({ channel: "@mychannel" });
    expect(r.isError).toBeFalsy();
    const text = (r.content[0] as { text: string }).text;
    expect(text).toContain("My Latest Video");
    expect(text).toContain("abc123");
    expect(text).toContain("sorted by date");
  });

  it("respects viewCount sort parameter", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ id: "UC789" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: { videoId: "top1" },
              snippet: {
                title: "Top Video",
                publishedAt: "2026-01-01T00:00:00Z",
                thumbnails: { medium: { url: "https://yt.com/top.jpg" } },
              },
            },
          ],
        }),
      });

    const { getChannelVideosTool } = await import("@/lib/agent/tools/get-channel-videos");
    const r = await getChannelVideosTool.handler({ channel: "@mychannel", sort: "viewCount" });
    expect(r.isError).toBeFalsy();
    const text = (r.content[0] as { text: string }).text;
    expect(text).toContain("sorted by viewCount");
    expect(text).toContain("Top Video");
  });

  it("returns isError when API key is missing", async () => {
    getDb().prepare("DELETE FROM settings WHERE key = ?").run("youtubeApiKey");
    const { getChannelVideosTool } = await import("@/lib/agent/tools/get-channel-videos");
    const r = await getChannelVideosTool.handler({ channel: "@x" });
    expect(r.isError).toBe(true);
  });
});
