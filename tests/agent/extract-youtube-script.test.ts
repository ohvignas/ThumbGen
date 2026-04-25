import { describe, it, expect, vi } from "vitest";

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
});
