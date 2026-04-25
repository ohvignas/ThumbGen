import { describe, it, expect, beforeAll } from "vitest";
import { listFaceReactionsTool } from "@/lib/agent/tools/list-face-reactions";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";

describe("list_face_reactions", () => {
  beforeAll(() => {
    getDb().prepare("DELETE FROM face_reactions").run();
    const id = uuid();
    getDb()
      .prepare(
        "INSERT INTO face_reactions (id, label, mime_type, size, data) VALUES (?, ?, ?, ?, ?)"
      )
      .run(id, "Happy", "image/png", 200, Buffer.alloc(200));
  });

  it("returns text content listing face reactions", async () => {
    const r = await listFaceReactionsTool.handler({});
    expect(r.content[0].type).toBe("text");
    expect((r.content[0] as { text: string }).text).toContain("Happy");
    expect((r.content[0] as { text: string }).text).toContain("stored:fr_");
  });

  it("returns 'No face' when empty", async () => {
    getDb().prepare("DELETE FROM face_reactions").run();
    const r = await listFaceReactionsTool.handler({});
    expect((r.content[0] as { text: string }).text).toMatch(/No face/);
  });
});
