import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getDb } from "@/lib/db";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  getDb()
    .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
    .run("youtubeApiKey", "test-yt-key");
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ items: [] }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("search_youtube", () => {
  it("uses ISO language codes, not the region code lowercased", async () => {
    const { searchYoutubeTool } = await import("@/lib/agent/tools/search-youtube");
    await searchYoutubeTool.handler({ query: "miniatures", region: "US" });
    const usUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(usUrl).toContain("regionCode=US");
    expect(usUrl).toContain("relevanceLanguage=en");
    expect(usUrl).not.toContain("relevanceLanguage=us");

    fetchMock.mockClear();
    await searchYoutubeTool.handler({ query: "miniatures", region: "FR" });
    const frUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(frUrl).toContain("regionCode=FR");
    expect(frUrl).toContain("relevanceLanguage=fr");
  });
});
