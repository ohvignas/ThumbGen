import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import * as store from "@/lib/youtube/channel-store";
import { getMyChannelKnowledgeTool } from "@/lib/agent/tools/get-my-channel-knowledge";
import { getMyVideoTool } from "@/lib/agent/tools/get-my-video";
import { searchMyChannelTool } from "@/lib/agent/tools/search-my-channel";
import { saveKnowledge, upsertTranscript } from "@/lib/youtube/knowledge-store";
import { EMPTY_CHANNEL_KNOWLEDGE } from "@/lib/youtube/knowledge-schema";
import { knowledgeToMarkdown } from "@/lib/youtube/knowledge";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

let channelId: string;

beforeEach(() => {
  getDb().exec("DELETE FROM followed_channels");
  getDb().exec("DELETE FROM channel_knowledge");
  getDb().exec("DELETE FROM video_transcripts");
  channelId = store.insertChannel({
    youtubeChannelId: `UC${"k".repeat(22)}`,
    title: "Ma chaîne",
    handle: "@demo",
    avatarUrl: null,
    subscriberCount: 1000,
    videoCount: 1,
  }).channel.id;
  store.setMineChannel(channelId);
  store.upsertVideos(
    channelId,
    [
      {
        videoId: "abcdefghijk",
        channelId,
        title: "Comment faire une miniature",
        publishedAt: "2026-01-01T00:00:00.000Z",
        durationSeconds: 600,
        viewCount: 9000,
        likeCount: 10,
        thumbnailUrl: "https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg",
        liveBroadcastContent: "none",
        description: "Tuto miniature",
      },
    ],
    "2026-09-01T00:00:00.000Z",
  );
});

describe("my-channel MCP tools", () => {
  it("get_my_channel_knowledge explains when the bible is missing", async () => {
    const result = await getMyChannelKnowledgeTool.handler({});
    expect((result.content[0] as { text: string }).text).toMatch(/pas encore été généré/);
  });

  it("returns the compact bible once saved", async () => {
    const json = { ...EMPTY_CHANNEL_KNOWLEDGE, identity: { ...EMPTY_CHANNEL_KNOWLEDGE.identity, niche: "Miniatures" } };
    saveKnowledge({
      channel_id: channelId,
      generated_at: "2026-09-18T10:00:00.000Z",
      document_md: knowledgeToMarkdown(json),
      json: JSON.stringify(json),
      video_count: 1,
      transcript_count: 1,
    });
    const text = (await getMyChannelKnowledgeTool.handler({})).content[0] as { text: string };
    expect(text.text).toContain("Miniatures");
    expect(text.text).toContain("Ma chaîne");
  });

  it("search_my_channel finds a title", async () => {
    const result = await searchMyChannelTool.handler({ query: "miniature", limit: 8 });
    expect((result.content[0] as { text: string }).text).toContain("youtube:abcdefghijk");
  });

  it("get_my_video returns local stats and a cached transcript", async () => {
    upsertTranscript({
      videoId: "abcdefghijk",
      source: "timedtext",
      language: "fr",
      text: "Voici comment créer une miniature YouTube.",
      fetchedAt: "2026-09-18T10:00:00.000Z",
    });
    const result = await getMyVideoTool.handler({ video_id: "youtube:abcdefghijk" });
    expect(result.isError).toBeFalsy();
    expect((result.content[0] as { text: string }).text).toContain("Voici comment créer");
    expect((result.content[0] as { text: string }).text).toContain("9000 vues");
  });
});
