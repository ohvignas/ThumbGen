import { describe, it, expect, beforeEach, vi } from "vitest";
import { getDb } from "@/lib/db";
import { emptyStudioDraft } from "@/lib/studio/page-template";
import { createStudioVideo, saveStudioDraft } from "@/lib/studio/store";

vi.mock("youtube-transcript", () => ({ YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) } }));

let videoId = "";

beforeEach(() => {
  getDb().exec("DELETE FROM studio_drafts");
  getDb().exec("DELETE FROM studio_videos");
  const created = createStudioVideo({ title: "Vibe Coding : c’est quoi ?", etiquette: "En cours" });
  videoId = created.videoId;
  saveStudioDraft(videoId, emptyStudioDraft());
});

describe("studio tools", () => {
  it("lists local videos and reads one fiche", async () => {
    const { listStudioVideosTool } = await import("@/lib/agent/tools/list-studio-videos");
    const { getStudioVideoTool } = await import("@/lib/agent/tools/get-studio-video");
    const listed = await listStudioVideosTool.handler({});
    expect((listed.content[0] as { text: string }).text).toContain(`studio:${videoId}`);
    const one = await getStudioVideoTool.handler({ video_id: `studio:${videoId}` });
    expect((one.content[0] as { text: string }).text).toContain("Vibe Coding");
  });

  it("upserts a script locally without calling any HTTP API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { upsertStudioScriptTool } = await import("@/lib/agent/tools/upsert-studio-script");
    await upsertStudioScriptTool.handler({
      video_id: videoId,
      script: "## 1. Introduction\nNouveau hook.",
    });
    const { getStudioVideo } = await import("@/lib/studio/store");
    expect(getStudioVideo(videoId)?.draft.script).toContain("Nouveau hook");
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("updates the fiche title so a Sans titre draft becomes visible", async () => {
    const { updateStudioVideo } = await import("@/lib/studio/store");
    updateStudioVideo(videoId, { title: "Sans titre" });
    const { upsertStudioScriptTool } = await import("@/lib/agent/tools/upsert-studio-script");
    await upsertStudioScriptTool.handler({
      video_id: videoId,
      title: "OpenClaw est mort",
      title_variants: [{ title: "OpenClaw est mort", thumbText: "OPENCLAW", visualConcept: "Face + UI" }],
    });
    const { getStudioVideo } = await import("@/lib/studio/store");
    const row = getStudioVideo(videoId);
    expect(row?.title).toBe("OpenClaw est mort");
    expect(row?.draft.titleVariants[0]?.title).toBe("OpenClaw est mort");
  });

  it("links, creates and unlinks studio miniatures locally", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { createProject } = await import("@/lib/local-storage");
    const { listProjectsForStudio } = await import("@/lib/studio/link-project");
    const { linkStudioMiniatureTool } = await import("@/lib/agent/tools/link-studio-miniature");
    const existing = createProject("Mini existante");

    await linkStudioMiniatureTool.handler({
      video_id: videoId,
      project_id: existing.id,
      action: "link",
    });
    expect(listProjectsForStudio(videoId).map((project) => project.id)).toContain(existing.id);

    const created = await linkStudioMiniatureTool.handler({
      video_id: `studio:${videoId}`,
      action: "create",
    });
    expect((created.content[0] as { text: string }).text).toMatch(/proj_/);
    expect(listProjectsForStudio(videoId)).toHaveLength(2);

    await linkStudioMiniatureTool.handler({
      video_id: videoId,
      project_id: existing.id,
      action: "unlink",
    });
    expect(listProjectsForStudio(videoId).map((project) => project.id)).not.toContain(existing.id);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
