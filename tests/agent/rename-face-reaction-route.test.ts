import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";

describe("POST /api/face-reactions/rename", () => {
  it("renames an existing face reaction", async () => {
    const id = uuid();
    getDb()
      .prepare("INSERT INTO face_reactions (id, label, mime_type, size, data) VALUES (?, ?, ?, ?, ?)")
      .run(id, "Old label", "image/jpeg", 10, Buffer.alloc(10));

    const { POST } = await import("@/app/api/face-reactions/rename/route");
    const req = new Request("http://localhost/api/face-reactions/rename", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: id, label: "New label" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);

    const row = getDb().prepare("SELECT label FROM face_reactions WHERE id = ?").get(id) as { label: string };
    expect(row.label).toBe("New label");
  });

  it("404s for an unknown filename", async () => {
    const { POST } = await import("@/app/api/face-reactions/rename/route");
    const req = new Request("http://localhost/api/face-reactions/rename", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: "does-not-exist", label: "x" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(404);
  });
});
