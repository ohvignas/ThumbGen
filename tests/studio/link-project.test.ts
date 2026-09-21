import { describe, it, expect, beforeEach, vi } from "vitest";
import { getDb } from "@/lib/db";
import { createProject, listProjects } from "@/lib/local-storage";
import { isWritingProjectId } from "@/lib/studio/types";
import { createStudioVideo } from "@/lib/studio/store";
import {
  createMiniatureForStudio,
  linkProjectToStudio,
  listProjectsForStudio,
  unlinkProjectFromStudio,
} from "@/lib/studio/link-project";

let videoId = "";

beforeEach(() => {
  let now = 1_800_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now++);
  getDb().exec("DELETE FROM projects");
  getDb().exec("DELETE FROM projects_meta");
  getDb().exec("DELETE FROM studio_drafts");
  getDb().exec("DELETE FROM studio_videos");
  videoId = createStudioVideo({ title: "Vibe Coding : c’est quoi ?", etiquette: "En cours" }).videoId;
});

describe("link project", () => {
  it("creates a real canvas project linked to the fiche", () => {
    const created = createMiniatureForStudio(videoId);
    expect(isWritingProjectId(created.id)).toBe(false);
    expect(created.id.startsWith("proj_")).toBe(true);
    expect(created.name).toContain("Vibe Coding");
    expect(listProjectsForStudio(videoId).map((p) => p.id)).toEqual([created.id]);
    expect(listProjects().some((p) => p.id === created.id)).toBe(true);
  });

  it("links an existing miniature and refuses a fourth A/B slot", () => {
    const a = createProject("Mini A");
    const b = createProject("Mini B");
    const c = createProject("Mini C");
    const d = createProject("Mini D");
    linkProjectToStudio(a.id, videoId);
    linkProjectToStudio(b.id, videoId);
    linkProjectToStudio(c.id, videoId);
    expect(() => linkProjectToStudio(d.id, videoId)).toThrow(/trois|3|A\/B/i);
    unlinkProjectFromStudio(b.id, videoId);
    expect(listProjectsForStudio(videoId).map((p) => p.id)).toEqual([c.id, a.id]);
  });

  it("rejects an unknown fiche", () => {
    expect(() => linkProjectToStudio("proj_1", "vid_unknownunknownunknownunknown")).toThrow(/fiche/i);
  });

  it("createMiniatureForStudio caps at three without orphan projects", () => {
    createMiniatureForStudio(videoId);
    createMiniatureForStudio(videoId);
    createMiniatureForStudio(videoId);
    const countBefore = listProjects().length;
    expect(() => createMiniatureForStudio(videoId)).toThrow("Trois miniatures maximum pour le test A/B.");
    expect(listProjects().length).toBe(countBefore);
    expect(listProjectsForStudio(videoId)).toHaveLength(3);
  });
});
