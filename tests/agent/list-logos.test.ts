import { describe, it, expect, beforeAll } from "vitest";
import { listLogosTool } from "@/lib/agent/tools/list-logos";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";

describe("list_logos", () => {
  beforeAll(() => {
    getDb().prepare("DELETE FROM logos").run();
    const id = uuid();
    getDb()
      .prepare("INSERT INTO logos (id, label, mime_type, size, data) VALUES (?, ?, ?, ?, ?)")
      .run(id, "Claude", "image/png", 100, Buffer.alloc(100));
  });

  it("returns text content listing logos", async () => {
    const r = await listLogosTool.handler({});
    expect(r.content[0].type).toBe("text");
    expect((r.content[0] as { text: string }).text).toContain("Claude");
    expect((r.content[0] as { text: string }).text).toContain("stored:lg_");
  });

  it("returns 'No logos' when empty", async () => {
    getDb().prepare("DELETE FROM logos").run();
    const r = await listLogosTool.handler({});
    expect((r.content[0] as { text: string }).text).toMatch(/No logos/);
  });
});
