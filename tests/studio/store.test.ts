import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "@/lib/db";
import { appendMessage, createConversation, listConversations } from "@/lib/agent/conversation/store";
import { emptyStudioDraft } from "@/lib/studio/page-template";
import {
  createStudioVideo,
  deleteStudioVideo,
  getStudioVideo,
  listStudioVideos,
  saveStudioDraft,
  updateStudioVideo,
} from "@/lib/studio/store";
import { writingProjectId } from "@/lib/studio/types";

beforeEach(() => {
  getDb().exec("DELETE FROM studio_drafts");
  getDb().exec("DELETE FROM studio_videos");
});

describe("studio store", () => {
  it("creates a local video with an empty house draft", () => {
    const created = createStudioVideo({ title: "Vibe Coding : c’est quoi ?", etiquette: "En cours" });
    expect(created.videoId.startsWith("vid_")).toBe(true);
    expect(created.youtubeUrl).toBeNull();
    expect(created.draft.script).toBe("");
    expect(created.draft.titleVariants).toHaveLength(3);
    const row = getStudioVideo(created.videoId);
    expect(row?.title).toContain("Vibe Coding");
    expect(row?.etiquette).toBe("En cours");
    expect(listStudioVideos()).toHaveLength(1);
  });

  it("saves a draft and patches metadata without a remote write", () => {
    const created = createStudioVideo({ title: "Grok Bot" });
    const draft = emptyStudioDraft();
    draft.script = "## 1. Introduction\nTexte.";
    saveStudioDraft(created.videoId, draft);
    const updated = updateStudioVideo(created.videoId, { etiquette: "En prod", youtubeUrl: "https://youtu.be/abcdefghijk" });
    expect(updated?.etiquette).toBe("En prod");
    expect(updated?.youtubeVideoId).toBe("abcdefghijk");
    expect(getStudioVideo(created.videoId)?.draft.script).toContain("Introduction");
  });

  it("stores a project summary without filling the YouTube description draft", () => {
    const created = createStudioVideo({
      title: "Grok Bot",
      summary: "Angle: équipe AI, public vibe-coders.",
    });
    expect(created.summary).toBe("Angle: équipe AI, public vibe-coders.");
    expect(created.draft.description).toBe("");
    expect(getStudioVideo(created.videoId)?.summary).toBe("Angle: équipe AI, public vibe-coders.");
  });

  it("falls back to Sans titre when the title is blank", () => {
    const created = createStudioVideo({ title: "   " });
    expect(created.title).toBe("Sans titre");
  });

  it("patches the project summary without touching the YouTube description", () => {
    const created = createStudioVideo({ title: "Grok Bot", summary: "Premier angle" });
    const draft = emptyStudioDraft();
    draft.description = "Description YouTube";
    saveStudioDraft(created.videoId, draft);
    const updated = updateStudioVideo(created.videoId, { summary: "Angle mis à jour" });
    expect(updated?.summary).toBe("Angle mis à jour");
    expect(getStudioVideo(created.videoId)?.draft.description).toBe("Description YouTube");
  });

  it("deletes the fiche and its studio-scoped chat, not another video's", () => {
    const doomed = createStudioVideo({ title: "À supprimer" });
    const kept = createStudioVideo({ title: "On garde" });
    const doomedChat = createConversation(writingProjectId(doomed.videoId), "Chat doomed");
    appendMessage({
      conversation_id: doomedChat.id,
      role: "user",
      content_json: '[{"type":"text","text":"hook doomed"}]',
      interrupted: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      cost_estimate: 0,
    });
    const keptChat = createConversation(writingProjectId(kept.videoId), "Chat kept");
    appendMessage({
      conversation_id: keptChat.id,
      role: "user",
      content_json: '[{"type":"text","text":"hook kept"}]',
      interrupted: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      cost_estimate: 0,
    });

    expect(deleteStudioVideo(doomed.videoId)).toBe(true);
    expect(getStudioVideo(doomed.videoId)).toBeNull();
    expect(listConversations(writingProjectId(doomed.videoId))).toHaveLength(0);
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?").get(doomedChat.id)).toEqual({
      n: 0,
    });
    expect(getStudioVideo(kept.videoId)?.title).toBe("On garde");
    expect(listConversations(writingProjectId(kept.videoId)).map((row) => row.id)).toEqual([keptChat.id]);
    expect(deleteStudioVideo("vid_missing")).toBe(false);
  });
});
