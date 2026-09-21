import { describe, it, expect, beforeEach, vi } from "vitest";
import { getDb } from "@/lib/db";
import { emptyStudioDraft } from "@/lib/studio/page-template";
import { createStudioVideo, saveStudioDraft } from "@/lib/studio/store";
import { indexStudioCorpus } from "@/lib/studio/corpus";
import { insertChannel, upsertVideos } from "@/lib/youtube/channel-store";
import { saveKnowledge, upsertTranscript } from "@/lib/youtube/knowledge-store";
import { writingProjectId } from "@/lib/studio/types";
import {
  buildStudioFirstTurnBlock,
  studioFirstTurnQuery,
} from "@/lib/studio/first-turn";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
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

describe("studioFirstTurnQuery", () => {
  it("uses the idea after /ecrire, else dernières vidéos", () => {
    expect(studioFirstTurnQuery("/ecrire")).toBe("dernières vidéos");
    expect(studioFirstTurnQuery("/ecrire  ")).toBe("dernières vidéos");
    expect(studioFirstTurnQuery("/ecrire OpenClaw local")).toBe("OpenClaw local");
    expect(studioFirstTurnQuery("une vidéo sur n8n")).toBe("une vidéo sur n8n");
  });
});

describe("buildStudioFirstTurnBlock", () => {
  it("is omitted on canvas projects", () => {
    expect(buildStudioFirstTurnBlock("proj_1", "/ecrire")).toBeNull();
  });

  it("already retrieves Document de chaîne + last videos so the model must not narrate a later read", () => {
    const mine = insertChannel(
      {
        youtubeChannelId: "UC_first_turn",
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
      document_md: "# Ma chaîne\nNiche n8n et automatisation",
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

    const block = buildStudioFirstTurnBlock(writingProjectId(created.videoId), "/ecrire");
    expect(block).toContain("<studio_first_turn>");
    expect(block).toContain("get_my_channel_knowledge");
    expect(block).toContain("retrieve_own_corpus");
    expect(block).toMatch(/Niche n8n|Ma chaîne/);
    expect(block).toMatch(/dQw4w9WgXcQ|Installer n8n/);
    expect(block).toContain("studio:");
    expect(block).toMatch(/already retrieved|already ran|déjà (récupéré|lu)/i);
    expect(block).toMatch(/Do not announce|Never (say|announce)|ne (dis|raconte) pas/i);
    expect(block).not.toMatch(/Je vais d’abord lire|I'll go read then ask/i);
  });
});

describe("first-turn wiring", () => {
  it("route-handler injects the first-turn block on a new studio send", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("../../src/lib/agent/v2/route-handler.ts", import.meta.url), "utf8");
    expect(source).toContain("isFirstTurn");
    expect(source).toContain("firstUserText");
    expect(source).toMatch(/buildSystemMessages\([\s\S]*isFirstTurn[\s\S]*firstUserText/);
  });
});
