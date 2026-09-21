import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "@/lib/db";
import { emptyStudioDraft } from "@/lib/studio/page-template";
import { createStudioVideo, saveStudioDraft } from "@/lib/studio/store";
import { writingProjectId } from "@/lib/studio/types";
import {
  buildAgentSurfaceBlock,
  buildChannelKnowledgeBlock,
  buildStudioVideoBlock,
  buildSystemMessages,
} from "@/lib/agent/system-prompt";
import { listSkillCatalog, readSkillBody } from "@/lib/agent/skills/catalog";

beforeEach(() => {
  getDb().exec("DELETE FROM studio_drafts");
  getDb().exec("DELETE FROM studio_videos");
});

describe("studio video prompt block", () => {
  it("forbids croquis on studio conversations and studio fills on canvas", () => {
    const studio = buildAgentSurfaceBlock("studio:vid_abc");
    expect(studio).toContain("<agent_surface>");
    expect(studio).toContain("studio");
    expect(studio).toMatch(/generate_sketch|croquis|apply_workflow/);
    expect(studio).toMatch(/Do not|Forbidden|interdit/i);
    expect(studio).not.toMatch(/Étape\s+\d/);
    expect(studio).toMatch(/studio_first_turn|already retrieved|Do not announce/i);
    const canvas = buildAgentSurfaceBlock("proj_1");
    expect(canvas).toContain("canvas");
    expect(canvas).toMatch(/upsert_studio_script|create_studio_video/);
    const messages = buildSystemMessages({ nodes: [], edges: [] }, "studio:vid_abc");
    expect(messages.some((m) => m.text.includes("<agent_surface>"))).toBe(true);
  });

  it("injects first-turn corpus + channel knowledge so the model does not announce a later read", () => {
    const created = createStudioVideo({ title: "OpenClaw", etiquette: "Propositions" });
    const projectId = writingProjectId(created.videoId);
    const messages = buildSystemMessages({ nodes: [], edges: [] }, projectId, undefined, null, null, {
      isFirstTurn: true,
      firstUserText: "/ecrire",
    });
    const joined = messages.map((m) => m.text).join("\n");
    expect(joined).toContain("<studio_first_turn>");
    expect(joined).toContain("</studio_first_turn>");
    expect(joined).toContain("retrieve_own_corpus");
    expect(joined).toContain("get_my_channel_knowledge");
    expect(joined).not.toMatch(/Je vais d’abord lire|I'll go read then ask/i);
    expect(
      buildSystemMessages({ nodes: [], edges: [] }, projectId).some((m) => m.text.includes("</studio_first_turn>")),
    ).toBe(false);
  });

  it("tells the writing agent to ground on Document de chaîne, not only thumbnails", () => {
    const block = buildChannelKnowledgeBlock({ channelKnowledge: "- Niche: n8n" });
    expect(block).toMatch(/écriture|writing|script/i);
    expect(block).toMatch(/Ground writing/i);
    expect(block).toMatch(/get_my_channel_knowledge|search_my_channel|get_my_video/);
  });

  it("is omitted for a canvas project", () => {
    expect(buildStudioVideoBlock("default")).toBeNull();
  });

  it("grounds the writing agent on the open fiche without a 7-step journey", () => {
    const created = createStudioVideo({ title: "Vibe Coding : c’est quoi ?", etiquette: "En cours" });
    const draft = emptyStudioDraft();
    draft.script = "## 1. Introduction\nDéjà écrit.";
    saveStudioDraft(created.videoId, draft);
    const projectId = writingProjectId(created.videoId);
    const block = buildStudioVideoBlock(projectId);
    expect(block).toContain("<studio_video>");
    expect(block).toContain("Vibe Coding");
    expect(block).toContain("En cours");
    expect(block).toContain("retrieve_own_corpus");
    expect(block).not.toMatch(/Étape\s+\d/);
    expect(block).not.toMatch(/Notion/i);
    const messages = buildSystemMessages({ nodes: [], edges: [] }, projectId);
    expect(messages.some((m) => m.text.includes("<studio_video>"))).toBe(true);
    expect(messages[0].text).toContain("Never mention \"step 3 of 7\"");
  });
});

describe("write_video first-turn retrieval", () => {
  it("forbids narrating a later read and requires tools or studio_first_turn first", () => {
    const body = readSkillBody("write_video") ?? "";
    expect(body).toContain("studio_first_turn");
    expect(body).toMatch(/Do not announce|Never (say|announce)|ne (dis|raconte) pas/i);
    expect(body).toMatch(/ask_user|studio_format|format de tournage/i);
    expect(body).not.toMatch(/Je vais d’abord lire/i);
  });
});

describe("studio writing skill catalog copy", () => {
  it("catalog descriptions for writing skills mention Vidéos / studio and not miniatures", () => {
    const catalog = listSkillCatalog();
    for (const name of [
      "write_video",
      "studio_format",
      "studio_titles",
      "studio_description",
      "studio_script",
      "retrieve_own_corpus",
      "upsert_studio_script",
    ]) {
      const row = catalog.find((skill) => skill.name === name);
      expect(row, name).toBeTruthy();
      expect(row!.description).toMatch(/Vidéos|studio/i);
      expect(row!.description).not.toMatch(/generate_sketch|croquis/i);
    }
  });
});
