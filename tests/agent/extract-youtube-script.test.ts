import { describe, it, expect, vi } from "vitest";
import { getDb } from "@/lib/db";
import * as store from "@/lib/youtube/channel-store";
import { upsertTranscript } from "@/lib/youtube/knowledge-store";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: {
    fetchTranscript: vi.fn(async (url: string) => {
      if (url.includes("fail")) throw new Error("Could not fetch");
      return [
        { text: "Hello world", offset: 0, duration: 1000 },
        { text: "this is a test", offset: 1000, duration: 1000 },
      ];
    }),
  },
}));

describe("extract_youtube_script", () => {
  it("returns transcript text concatenated", async () => {
    const { extractYoutubeScriptTool } = await import("@/lib/agent/tools/extract-youtube-script");
    const r = await extractYoutubeScriptTool.handler({ url: "https://youtube.com/watch?v=ok" });
    expect(r.isError).toBeFalsy();
    expect((r.content[0] as { text: string }).text).toContain("Hello world");
    expect((r.content[0] as { text: string }).text).toContain("this is a test");
  });

  it("returns isError on fetch failure", async () => {
    const { extractYoutubeScriptTool } = await import("@/lib/agent/tools/extract-youtube-script");
    const r = await extractYoutubeScriptTool.handler({ url: "https://youtube.com/watch?v=fail" });
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toMatch(/Failed/);
  });

  it("prefers the local timedtext cache over a network fetch", async () => {
    getDb().exec("DELETE FROM followed_channels");
    const channelId = store.insertChannel({
      youtubeChannelId: `UC${"c".repeat(22)}`,
      title: "Cache",
      handle: "@cache",
      avatarUrl: null,
      subscriberCount: 1,
      videoCount: 1,
    }).channel.id;
    store.upsertVideos(
      channelId,
      [
        {
          videoId: "cachedvid01",
          channelId,
          title: "Vidéo en cache",
          publishedAt: "2026-01-01T00:00:00.000Z",
          durationSeconds: 60,
          viewCount: 10,
          likeCount: 1,
          thumbnailUrl: "https://i.ytimg.com/vi/cachedvid01/mqdefault.jpg",
          liveBroadcastContent: "none",
          description: "",
        },
      ],
      "2026-09-01T00:00:00.000Z",
    );
    upsertTranscript({
      videoId: "cachedvid01",
      source: "timedtext",
      language: "fr",
      text: "Transcript local de ma chaîne.",
      fetchedAt: "2026-09-18T10:00:00.000Z",
    });
    const { extractYoutubeScriptTool } = await import("@/lib/agent/tools/extract-youtube-script");
    const r = await extractYoutubeScriptTool.handler({ url: "https://www.youtube.com/watch?v=cachedvid01" });
    expect(r.isError).toBeFalsy();
    expect((r.content[0] as { text: string }).text).toContain("Cached transcript");
    expect((r.content[0] as { text: string }).text).toContain("Transcript local de ma chaîne.");
    expect((r.content[0] as { text: string }).text).not.toContain("Hello world");
  });
});
