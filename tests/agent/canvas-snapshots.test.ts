import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "@/lib/db";
import { createProject, deleteProject } from "@/lib/local-storage";
import {
  MAX_RESTORE_SNAPSHOTS_PER_PROJECT,
  MAX_SNAPSHOTS_PER_PROJECT,
  createCanvasSnapshot,
  listCanvasSnapshots,
  restoreCanvasSnapshot,
} from "@/lib/canvas-snapshots";
import { GET } from "@/app/api/project/[id]/snapshots/route";
import { POST } from "@/app/api/project/[id]/snapshots/[snapshotId]/restore/route";

const projectId = "test-canvas-snapshots";
const otherProjectId = "test-canvas-snapshots-other";
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function seedProject(id: string, nodes: unknown[], edges: unknown[] = []) {
  getDb()
    .prepare("INSERT OR REPLACE INTO projects (id, nodes, edges, updated_at) VALUES (?, ?, ?, ?)")
    .run(id, JSON.stringify(nodes), JSON.stringify(edges), "2026-09-17 08:00:00");
}

function canvas(id: string) {
  const row = getDb().prepare("SELECT nodes, edges, updated_at FROM projects WHERE id = ?").get(id) as {
    nodes: string;
    edges: string;
    updated_at: string;
  };
  return { nodes: JSON.parse(row.nodes), edges: JSON.parse(row.edges), updatedAt: row.updated_at };
}

const listParams = (id: string) => ({ params: Promise.resolve({ id }) });
const restoreParams = (id: string, snapshotId: string) => ({ params: Promise.resolve({ id, snapshotId }) });
const jsonPost = (url: string) =>
  new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });

beforeEach(() => {
  getDb().prepare("DELETE FROM canvas_snapshots WHERE project_id IN (?, ?)").run(projectId, otherProjectId);
  getDb().prepare("DELETE FROM projects WHERE id IN (?, ?)").run(projectId, otherProjectId);
});

describe("canvas snapshots store", () => {
  it("creates a snapshot with an ISO created_at and lists newest first", () => {
    createCanvasSnapshot(projectId, JSON.stringify([{ id: "a" }]), "[]", "apply_workflow");
    createCanvasSnapshot(projectId, JSON.stringify([{ id: "a" }, { id: "b" }]), JSON.stringify([{ id: "e" }]), "restore");
    const list = listCanvasSnapshots(projectId);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ reason: "restore", node_count: 2, edge_count: 1 });
    expect(list[1]).toMatchObject({ reason: "apply_workflow", node_count: 1, edge_count: 0 });
    expect(list[0].created_at).toMatch(ISO);
    expect(list[0]).not.toHaveProperty("nodes");
  });

  it(`keeps only ${MAX_SNAPSHOTS_PER_PROJECT} snapshots per project, without touching other projects`, () => {
    createCanvasSnapshot(otherProjectId, "[]", "[]", "apply_workflow");
    for (let i = 0; i < MAX_SNAPSHOTS_PER_PROJECT + 3; i++) {
      createCanvasSnapshot(projectId, JSON.stringify([{ id: `n${i}` }]), "[]", "apply_workflow");
    }
    expect(MAX_SNAPSHOTS_PER_PROJECT).toBe(20);
    expect(listCanvasSnapshots(projectId)).toHaveLength(20);
    expect(listCanvasSnapshots(otherProjectId)).toHaveLength(1);
    const kept = getDb()
      .prepare("SELECT nodes FROM canvas_snapshots WHERE project_id = ?")
      .all(projectId) as Array<{ nodes: string }>;
    const ids = kept.map((row) => JSON.parse(row.nodes)[0].id);
    expect(ids).not.toContain("n0");
    expect(ids).toContain(`n${MAX_SNAPSHOTS_PER_PROJECT + 2}`);
  });

  it("counts nodes and edges in SQL, tolerating a payload that is not a JSON array", () => {
    createCanvasSnapshot(projectId, "not json", "{}", "apply_workflow");
    expect(listCanvasSnapshots(projectId)[0]).toMatchObject({ node_count: 0, edge_count: 0 });
  });

  it("does not store a snapshot identical to the newest one", () => {
    const first = createCanvasSnapshot(projectId, JSON.stringify([{ id: "a" }]), "[]", "apply_workflow");
    const again = createCanvasSnapshot(projectId, JSON.stringify([{ id: "a" }]), "[]", "apply_workflow");
    expect(again.id).toBe(first.id);
    expect(listCanvasSnapshots(projectId)).toHaveLength(1);
    createCanvasSnapshot(projectId, JSON.stringify([{ id: "b" }]), "[]", "apply_workflow");
    createCanvasSnapshot(projectId, JSON.stringify([{ id: "a" }]), "[]", "apply_workflow");
    expect(listCanvasSnapshots(projectId)).toHaveLength(3);
  });

  it(`keeps ${MAX_RESTORE_SNAPSHOTS_PER_PROJECT} restore snapshots apart from the agent snapshots`, () => {
    for (let i = 0; i < MAX_SNAPSHOTS_PER_PROJECT; i++) {
      createCanvasSnapshot(projectId, JSON.stringify([{ id: `agent${i}` }]), "[]", "apply_workflow");
    }
    for (let i = 0; i < MAX_RESTORE_SNAPSHOTS_PER_PROJECT + 2; i++) {
      createCanvasSnapshot(projectId, JSON.stringify([{ id: `restore${i}` }]), "[]", "restore");
    }
    expect(MAX_RESTORE_SNAPSHOTS_PER_PROJECT).toBe(5);
    const list = listCanvasSnapshots(projectId);
    expect(list.filter((s) => s.reason === "apply_workflow")).toHaveLength(MAX_SNAPSHOTS_PER_PROJECT);
    expect(list.filter((s) => s.reason === "restore")).toHaveLength(MAX_RESTORE_SNAPSHOTS_PER_PROJECT);
  });

  it("deleteProject deletes the project's snapshots too", () => {
    const { id } = createProject("Snapshots à supprimer");
    createCanvasSnapshot(id, JSON.stringify([{ id: "a" }]), "[]", "apply_workflow");
    createCanvasSnapshot(projectId, JSON.stringify([{ id: "keep" }]), "[]", "apply_workflow");
    deleteProject(id);
    expect(listCanvasSnapshots(id)).toHaveLength(0);
    expect(listCanvasSnapshots(projectId)).toHaveLength(1);
  });

  it("restores a snapshot after snapshotting the current state", () => {
    seedProject(projectId, [{ id: "before" }]);
    const snap = createCanvasSnapshot(projectId, JSON.stringify([{ id: "before" }]), "[]", "apply_workflow");
    seedProject(projectId, [{ id: "after-agent" }], [{ id: "e1" }]);

    const result = restoreCanvasSnapshot(projectId, snap.id);
    expect(result?.updated_at).toMatch(ISO);
    const now = canvas(projectId);
    expect(now.nodes).toEqual([{ id: "before" }]);
    expect(now.edges).toEqual([]);
    expect(now.updatedAt).toBe(result?.updated_at);

    const list = listCanvasSnapshots(projectId);
    expect(list[0]).toMatchObject({ reason: "restore", node_count: 1, edge_count: 1 });
  });

  it("returns null for an unknown snapshot or a snapshot of another project", () => {
    seedProject(projectId, []);
    seedProject(otherProjectId, []);
    const foreign = createCanvasSnapshot(otherProjectId, "[]", "[]", "apply_workflow");
    expect(restoreCanvasSnapshot(projectId, "nope")).toBeNull();
    expect(restoreCanvasSnapshot(projectId, foreign.id)).toBeNull();
    expect(listCanvasSnapshots(projectId)).toHaveLength(0);
  });
});

describe("GET /api/project/[id]/snapshots", () => {
  it("lists the project's snapshots", async () => {
    seedProject(projectId, []);
    createCanvasSnapshot(projectId, "[]", "[]", "apply_workflow");
    const res = await GET(new Request(`http://localhost/api/project/${projectId}/snapshots`) as never, listParams(projectId));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { snapshots: Array<{ id: string; reason: string; created_at: string }> };
    expect(body.snapshots).toHaveLength(1);
    expect(body.snapshots[0].reason).toBe("apply_workflow");
    expect(body.snapshots[0].created_at).toMatch(ISO);
  });

  it("404s for an unknown project", async () => {
    const res = await GET(new Request("http://localhost/api/project/ghost/snapshots") as never, listParams("ghost"));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/project/[id]/snapshots/[snapshotId]/restore", () => {
  it("restores and snapshots the current state first", async () => {
    seedProject(projectId, [{ id: "mine" }]);
    const snap = createCanvasSnapshot(projectId, JSON.stringify([{ id: "mine" }]), "[]", "apply_workflow");
    seedProject(projectId, [{ id: "agent" }]);

    const res = await POST(
      jsonPost(`http://localhost/api/project/${projectId}/snapshots/${snap.id}/restore`) as never,
      restoreParams(projectId, snap.id),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { updated_at: string };
    expect(body.updated_at).toMatch(ISO);
    expect(canvas(projectId).nodes).toEqual([{ id: "mine" }]);
    const list = listCanvasSnapshots(projectId);
    expect(list).toHaveLength(2);
    expect(list[0].reason).toBe("restore");
    expect(
      JSON.parse(
        (getDb().prepare("SELECT nodes FROM canvas_snapshots WHERE id = ?").get(list[0].id) as { nodes: string }).nodes,
      ),
    ).toEqual([{ id: "agent" }]);
  });

  it("404s for an unknown snapshot", async () => {
    seedProject(projectId, [{ id: "mine" }]);
    const res = await POST(
      jsonPost(`http://localhost/api/project/${projectId}/snapshots/ghost/restore`) as never,
      restoreParams(projectId, "ghost"),
    );
    expect(res.status).toBe(404);
    expect(canvas(projectId).nodes).toEqual([{ id: "mine" }]);
  });

  it("rejects a request that is not declared as JSON", async () => {
    seedProject(projectId, [{ id: "agent" }]);
    const snap = createCanvasSnapshot(projectId, "[]", "[]", "apply_workflow");
    const res = await POST(
      new Request(`http://localhost/api/project/${projectId}/snapshots/${snap.id}/restore`, { method: "POST" }) as never,
      restoreParams(projectId, snap.id),
    );
    expect(res.status).toBe(415);
    expect(canvas(projectId).nodes).toEqual([{ id: "agent" }]);
  });
});
