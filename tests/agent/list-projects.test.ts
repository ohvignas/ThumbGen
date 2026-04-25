import { describe, it, expect, beforeAll } from "vitest";
import { listProjectsTool } from "@/lib/agent/tools/list-projects";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";

describe("list_projects", () => {
  beforeAll(() => {
    getDb().prepare("DELETE FROM projects_meta").run();
    const id = uuid();
    getDb()
      .prepare("INSERT INTO projects_meta (id, name) VALUES (?, ?)")
      .run(id, "My Thumbnail Project");
  });

  it("returns text content listing projects", async () => {
    const r = await listProjectsTool.handler({});
    expect(r.content[0].type).toBe("text");
    expect((r.content[0] as { text: string }).text).toContain("My Thumbnail Project");
  });

  it("returns 'No projects' when empty", async () => {
    getDb().prepare("DELETE FROM projects_meta").run();
    const r = await listProjectsTool.handler({});
    expect((r.content[0] as { text: string }).text).toMatch(/No projects/);
  });
});
