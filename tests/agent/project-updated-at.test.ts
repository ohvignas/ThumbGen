import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "@/lib/db";

const projectId = "test-updated-at";

beforeAll(() => {
  getDb()
    .prepare("INSERT OR REPLACE INTO projects (id, nodes, edges, updated_at) VALUES (?, ?, ?, datetime('now'))")
    .run(projectId, "[]", "[]");
});

describe("/api/project/[id]/updated-at", () => {
  it("returns the updated_at for an existing project", async () => {
    const { GET } = await import("@/app/api/project/[id]/updated-at/route");
    const req = new Request(`http://localhost/api/project/${projectId}/updated-at`);
    const res = await GET(req as never, { params: Promise.resolve({ id: projectId }) } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated_at).toBeTruthy();
    expect(typeof body.updated_at).toBe("string");
  });

  it("returns null updated_at for unknown project", async () => {
    const { GET } = await import("@/app/api/project/[id]/updated-at/route");
    const req = new Request("http://localhost/api/project/does-not-exist/updated-at");
    const res = await GET(req as never, { params: Promise.resolve({ id: "does-not-exist" }) } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated_at).toBeNull();
  });
});
