import { describe, it, expect, beforeEach, vi } from "vitest";
import { getDb } from "@/lib/db";
import { emptyStudioDraft } from "@/lib/studio/page-template";
import { createStudioVideo, saveStudioDraft } from "@/lib/studio/store";
import { indexStudioCorpus, retrieveOwnCorpus } from "@/lib/studio/corpus";
import { insertChannel, upsertVideos } from "@/lib/youtube/channel-store";
import { saveKnowledge, upsertTranscript } from "@/lib/youtube/knowledge-store";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => [{ text: "Installer n8n", offset: 0, duration: 1 }]) },
}));

beforeEach(() => {
  getDb().exec("DELETE FROM studio_drafts");
  getDb().exec("DELETE FROM studio_videos");
  getDb().exec("DELETE FROM video_transcripts");
  getDb().exec("DELETE FROM channel_knowledge");
  getDb().exec("DELETE FROM channel_videos");
  getDb().exec("DELETE FROM followed_channels");
  try {
    getDb().exec("DELETE FROM studio_corpus_fts");
  } catch {
    /* FTS table may be empty */
  }
});

describe("retrieveOwnCorpus", () => {
  it("finds a studio script by keyword without calling a paid API", () => {
    const created = createStudioVideo({
      title: "Comment installer et utiliser n8n gratuitement en 2 min !",
      etiquette: "Terminer",
      youtubeUrl: "https://youtu.be/Dv74NSS_zJo",
    });
    const draft = emptyStudioDraft();
    draft.script = "Dans cette vidéo, je vais te montrer comment installer N8N.";
    saveStudioDraft(created.videoId, draft);
    indexStudioCorpus(created.videoId);
    const hits = retrieveOwnCorpus("installer n8n", 5);
    expect(hits.some((hit) => hit.videoId === created.videoId && hit.source === "studio")).toBe(true);
    expect(hits[0]?.snippet.toLowerCase()).toContain("n8n");
  });

  it("ranks Ma chaîne ingested transcripts before studio drafts", () => {
    const mine = insertChannel(
      {
        youtubeChannelId: "UC_corpus_mine",
        title: "Ma chaîne test",
        handle: "@mine",
        avatarUrl: null,
        subscriberCount: 1,
        videoCount: 15,
        description: null,
      },
      { isMine: true },
    ).channel;
    upsertVideos(
      mine.id,
      [
        {
          videoId: "dQw4w9WgXcQ",
          channelId: mine.youtube_channel_id,
          title: "Installer n8n depuis Ma chaîne",
          publishedAt: "2026-01-01T00:00:00.000Z",
          durationSeconds: 120,
          viewCount: 99,
          likeCount: 1,
          thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg",
          liveBroadcastContent: "none",
          description: "Desc n8n chaîne",
        },
      ],
      "2026-01-01T00:00:00.000Z",
    );
    upsertTranscript({
      videoId: "dQw4w9WgXcQ",
      source: "timedtext",
      language: "fr",
      text: "Dans cette vidéo YouTube je montre installer n8n sur Ma chaîne.",
      fetchedAt: "2026-01-01T00:00:00.000Z",
    });
    saveKnowledge({
      channel_id: mine.id,
      generated_at: "2026-09-18T08:44:00.000Z",
      document_md: "# Ma chaîne\nNiche n8n",
      json: "{}",
      video_count: 15,
      transcript_count: 15,
    });

    const created = createStudioVideo({
      title: "Brouillon studio n8n",
      etiquette: "Propositions",
    });
    const draft = emptyStudioDraft();
    draft.script = "Hook studio installer n8n.";
    saveStudioDraft(created.videoId, draft);
    indexStudioCorpus(created.videoId);

    const hits = retrieveOwnCorpus("installer n8n", 8);
    expect(hits[0]?.source).toBe("channel");
    expect(hits[0]?.youtubeVideoId).toBe("dQw4w9WgXcQ");
    expect(hits.some((hit) => hit.source === "studio" && hit.videoId === created.videoId)).toBe(true);
  });
});
