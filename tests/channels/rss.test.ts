import { afterEach, describe, expect, it, vi } from "vitest";
import { YouTubeApiError } from "@/lib/youtube/api";
import { fetchYoutubeRss, parseYoutubeRss, youtubeRssUrl } from "@/lib/youtube/rss";

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
  <entry><yt:videoId>aaa11111111</yt:videoId></entry>
  <entry><yt:videoId>bbb22222222</yt:videoId></entry>
  <entry><yt:videoId>aaa11111111</yt:videoId></entry>
</feed>`;

describe("youtubeRssUrl", () => {
  it("points at the public channel Atom feed", () => {
    expect(youtubeRssUrl("UCabcdefghijabcdefghij")).toBe(
      "https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijabcdefghij",
    );
  });
});

describe("parseYoutubeRss", () => {
  it("returns unique yt:videoId values in document order", () => {
    expect(parseYoutubeRss(FEED)).toEqual(["aaa11111111", "bbb22222222"]);
    expect(parseYoutubeRss("<feed></feed>")).toEqual([]);
  });
});

describe("fetchYoutubeRss", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses a 200 Atom body and treats a 404 as no ids", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("missing")) return new Response("gone", { status: 404 });
      return new Response(FEED, { status: 200, headers: { "content-type": "application/atom+xml" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchYoutubeRss("UCabcdefghijabcdefghij")).toEqual(["aaa11111111", "bbb22222222"]);
    expect(await fetchYoutubeRss("UCmissingmissingmissing")).toEqual([]);
  });

  it("maps a network failure to YouTubeApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    await expect(fetchYoutubeRss("UCabcdefghijabcdefghij")).rejects.toBeInstanceOf(YouTubeApiError);
  });
});
