import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import { GET } from "@/app/api/youtube/search/route";
import { MISSING_YOUTUBE_KEY_ERROR } from "@/lib/youtube/types";

const searchPerformantThumbnails = vi.fn(async () => ({ items: [], jevUsed: false }));

vi.mock("@/lib/youtube/keyword-search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/youtube/keyword-search")>();
  return {
    ...actual,
    searchPerformantThumbnails: (...args: unknown[]) => searchPerformantThumbnails(...args),
  };
});

beforeEach(() => {
  getDb().exec("DELETE FROM settings");
  searchPerformantThumbnails.mockClear();
});

describe("GET /api/youtube/search", () => {
  it("rejects a short query", async () => {
    const res = await GET(new Request("http://localhost/api/youtube/search?q=ab"));
    expect(res.status).toBe(400);
  });

  it("asks for a YouTube key", async () => {
    const res = await GET(new Request("http://localhost/api/youtube/search?q=notion"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: MISSING_YOUTUBE_KEY_ERROR });
  });

  it("returns the search payload when a key is set", async () => {
    setSetting("youtubeApiKey", "AIza-test");
    const res = await GET(new Request("http://localhost/api/youtube/search?q=notion"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], jevUsed: false });
    expect(searchPerformantThumbnails).toHaveBeenCalledWith("AIza-test", "notion", expect.any(Date), "FR");
  });

  it("forwards the region query param", async () => {
    setSetting("youtubeApiKey", "AIza-test");
    const res = await GET(new Request("http://localhost/api/youtube/search?q=notion&region=US"));
    expect(res.status).toBe(200);
    expect(searchPerformantThumbnails).toHaveBeenCalledWith("AIza-test", "notion", expect.any(Date), "US");
  });

  it("falls back to France for an unknown region", async () => {
    setSetting("youtubeApiKey", "AIza-test");
    const res = await GET(new Request("http://localhost/api/youtube/search?q=notion&region=xx"));
    expect(res.status).toBe(200);
    expect(searchPerformantThumbnails).toHaveBeenCalledWith("AIza-test", "notion", expect.any(Date), "FR");
  });
});
