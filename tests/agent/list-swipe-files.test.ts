import { describe, it, expect, beforeAll } from "vitest";
import { listSwipeFilesTool } from "@/lib/agent/tools/list-swipe-files";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";

describe("list_swipe_files", () => {
  beforeAll(() => {
    getDb().prepare("DELETE FROM swipe_files").run();
    const id = uuid();
    getDb()
      .prepare(
        "INSERT INTO swipe_files (id, title, mime_type, size, data) VALUES (?, ?, ?, ?, ?)"
      )
      .run(id, "Cool Reference", "image/png", 300, Buffer.alloc(300));
  });

  it("returns text content listing swipe files", async () => {
    const r = await listSwipeFilesTool.handler({});
    expect(r.content[0].type).toBe("text");
    expect((r.content[0] as { text: string }).text).toContain("Cool Reference");
    expect((r.content[0] as { text: string }).text).toContain("stored:sf_");
  });

  it("returns 'No swipe files' when empty", async () => {
    getDb().prepare("DELETE FROM swipe_files").run();
    const r = await listSwipeFilesTool.handler({});
    expect((r.content[0] as { text: string }).text).toMatch(/No swipe files/);
  });
});
