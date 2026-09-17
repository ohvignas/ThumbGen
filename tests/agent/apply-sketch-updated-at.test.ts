import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import { POST } from "@/app/api/agent/apply-sketch/route";

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe("POST /api/agent/apply-sketch", () => {
  it("writes an ISO updated_at after the stored one", async () => {
    const projectId = `proj_test_${uuid()}`;
    const future = new Date(Date.now() + 60_000).toISOString();
    getDb().prepare("INSERT INTO projects (id, nodes, edges, updated_at) VALUES (?, '[]', '[]', ?)").run(projectId, future);
    const sketchId = uuid();
    getDb()
      .prepare("INSERT INTO generated_sketches (id, mime_type, data, prompt) VALUES (?, 'image/png', ?, 'Croquis')")
      .run(sketchId, Buffer.from([1, 2, 3]));
    const res = await POST(
      new NextRequest("http://localhost/api/agent/apply-sketch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sketch_id: sketchId, project_id: projectId }),
      }),
    );
    expect(res.status).toBe(200);
    const { updated_at } = getDb().prepare("SELECT updated_at FROM projects WHERE id = ?").get(projectId) as { updated_at: string };
    expect(updated_at).toMatch(ISO);
    expect(Date.parse(updated_at)).toBeGreaterThan(Date.parse(future));
  });
});
