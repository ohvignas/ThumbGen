import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "@/lib/db";
import { createProject, listProjects } from "@/lib/local-storage";
import { isWritingProjectId } from "@/lib/studio/types";

beforeEach(() => {
  getDb().exec("DELETE FROM projects");
  getDb().exec("DELETE FROM projects_meta");
});

describe("listProjects", () => {
  it("never lists writing studio ids even if someone inserted one", () => {
    const created = createProject("Démo");
    getDb()
      .prepare("INSERT INTO projects_meta (id, name) VALUES (?, ?)")
      .run("studio:vid_3db7d7d1139d809baaa3f455a1e8162d", "Ne pas montrer");
    expect(listProjects().map((p) => p.id)).toEqual([created.id]);
    expect(isWritingProjectId("studio:vid_3db7d7d1139d809baaa3f455a1e8162d")).toBe(true);
  });
});
