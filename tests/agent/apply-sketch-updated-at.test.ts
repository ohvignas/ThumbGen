import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import { POST } from "@/app/api/agent/apply-sketch/route";
import { getProjectTombstones } from "@/lib/local-storage";

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

type CanvasNode = { id: string; type: string; data: Record<string, unknown> };

async function applySketch(projectId: string, sketchId: string) {
  return POST(
    new NextRequest("http://localhost/api/agent/apply-sketch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sketch_id: sketchId, project_id: projectId }),
    }),
  );
}

function insertSketch(id: string, prompt = "Croquis") {
  getDb()
    .prepare("INSERT INTO generated_sketches (id, mime_type, data, prompt) VALUES (?, 'image/png', ?, ?)")
    .run(id, Buffer.from([1, 2, 3]), prompt);
}

function projectNodes(projectId: string): CanvasNode[] {
  const row = getDb().prepare("SELECT nodes FROM projects WHERE id = ?").get(projectId) as { nodes: string };
  return JSON.parse(row.nodes) as CanvasNode[];
}

describe("POST /api/agent/apply-sketch", () => {
  it("writes an ISO updated_at after the stored one", async () => {
    const projectId = `proj_test_${uuid()}`;
    const future = new Date(Date.now() + 60_000).toISOString();
    getDb().prepare("INSERT INTO projects (id, nodes, edges, updated_at) VALUES (?, '[]', '[]', ?)").run(projectId, future);
    const sketchId = uuid();
    insertSketch(sketchId);
    const res = await applySketch(projectId, sketchId);
    expect(res.status).toBe(200);
    const { updated_at } = getDb().prepare("SELECT updated_at FROM projects WHERE id = ?").get(projectId) as { updated_at: string };
    expect(updated_at).toMatch(ISO);
    expect(Date.parse(updated_at)).toBeGreaterThan(Date.parse(future));
  });

  it("adds a persistable unique sketch each click and does not empty the previous", async () => {
    const projectId = `proj_test_${uuid()}`;
    getDb()
      .prepare("INSERT INTO projects (id, nodes, edges, updated_at) VALUES (?, ?, '[]', ?)")
      .run(
        projectId,
        JSON.stringify([
          { id: "sketch-a", type: "sketch", position: { x: 0, y: 0 }, data: { label: "Slot A" } },
          { id: "gen", type: "generator", position: { x: 400, y: 0 }, data: { model: "gemini-3.1-flash-image" } },
        ]),
        new Date().toISOString(),
      );
    const firstId = `sk_${uuid().replace(/-/g, "")}`;
    const secondId = `sk_${uuid().replace(/-/g, "")}`;
    insertSketch(firstId, "Premier");
    insertSketch(secondId, "Second");

    const first = await applySketch(projectId, firstId);
    const second = await applySketch(projectId, secondId);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstBody = (await first.json()) as { sketchNodeId: string; image_source: string };
    const secondBody = (await second.json()) as { sketchNodeId: string; image_source: string };

    expect(firstBody.sketchNodeId).toMatch(/^sketch-[0-9a-f]{8}$/);
    expect(secondBody.sketchNodeId).toMatch(/^sketch-[0-9a-f]{8}$/);
    expect(firstBody.sketchNodeId).not.toBe("sketch-a");
    expect(secondBody.sketchNodeId).not.toBe(firstBody.sketchNodeId);
    expect(firstBody.image_source).toBe(`generated:${firstId}`);
    expect(secondBody.image_source).toBe(`generated:${secondId}`);

    const nodes = projectNodes(projectId);
    const sketches = nodes.filter((node) => node.type === "sketch");
    expect(sketches.map((node) => node.id).sort()).toEqual(["sketch-a", firstBody.sketchNodeId, secondBody.sketchNodeId].sort());
    const firstNode = sketches.find((node) => node.id === firstBody.sketchNodeId)!;
    const secondNode = sketches.find((node) => node.id === secondBody.sketchNodeId)!;
    expect(firstNode.data.imageBase64).toBeUndefined();
    expect(secondNode.data.imageBase64).toBeUndefined();
    expect(firstNode.data.image_source).toBe(`generated:${firstId}`);
    expect(secondNode.data.image_source).toBe(`generated:${secondId}`);
    expect(firstNode.data.imageUrl).toBe(`/api/generated-sketches/${firstId}`);
    expect(secondNode.data.imageUrl).toBe(`/api/generated-sketches/${secondId}`);
    expect(sketches.find((node) => node.id === "sketch-a")?.data.label).toBe("Slot A");
  });

  it("does not add edges or create a generator — only places the node", async () => {
    const projectId = `proj_test_${uuid()}`;
    getDb()
      .prepare("INSERT INTO projects (id, nodes, edges, updated_at) VALUES (?, ?, ?, ?)")
      .run(
        projectId,
        JSON.stringify([
          { id: "gen", type: "generator", position: { x: 400, y: 0 }, data: { model: "gemini-3.1-flash-image" } },
        ]),
        JSON.stringify([]),
        new Date().toISOString(),
      );
    const sketchId = `sk_${uuid().replace(/-/g, "")}`;
    insertSketch(sketchId);

    const res = await applySketch(projectId, sketchId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { edge?: unknown; createdGenId?: string | null };
    expect(body.edge).toBeUndefined();
    expect(body.createdGenId ?? null).toBeNull();

    const row = getDb().prepare("SELECT nodes, edges FROM projects WHERE id = ?").get(projectId) as {
      nodes: string;
      edges: string;
    };
    expect(JSON.parse(row.edges)).toEqual([]);
    const nodes = JSON.parse(row.nodes) as CanvasNode[];
    expect(nodes.filter((node) => node.type === "generator")).toHaveLength(1);
    expect(nodes.filter((node) => node.type === "sketch")).toHaveLength(1);
  });

  it("does not create a generator when the canvas has none", async () => {
    const projectId = `proj_test_${uuid()}`;
    getDb().prepare("INSERT INTO projects (id, nodes, edges, updated_at) VALUES (?, '[]', '[]', ?)").run(
      projectId,
      new Date().toISOString(),
    );
    const sketchId = `sk_${uuid().replace(/-/g, "")}`;
    insertSketch(sketchId);

    const res = await applySketch(projectId, sketchId);
    expect(res.status).toBe(200);
    const nodes = projectNodes(projectId);
    expect(nodes.map((node) => node.type)).toEqual(["sketch"]);
    const { edges } = getDb().prepare("SELECT edges FROM projects WHERE id = ?").get(projectId) as { edges: string };
    expect(JSON.parse(edges)).toEqual([]);
  });

  it("drops a tombstone for the click-placed id so GET can return that sketch", async () => {
    const projectId = `proj_test_${uuid()}`;
    const now = new Date().toISOString();
    getDb().prepare("INSERT INTO projects (id, nodes, edges, updated_at) VALUES (?, '[]', '[]', ?)").run(projectId, now);
    const sketchId = `sk_${uuid().replace(/-/g, "")}`;
    insertSketch(sketchId);
    const staleId = "sketch-4a242b6b";
    getDb()
      .prepare("INSERT INTO canvas_tombstones (project_id, kind, item_id, deleted_at) VALUES (?, 'node', ?, ?)")
      .run(projectId, staleId, now);

    const res = await applySketch(projectId, sketchId);
    const body = (await res.json()) as { sketchNodeId: string };
    const tombs = getProjectTombstones(projectId);
    expect(tombs.nodeIds).toContain(staleId);
    expect(tombs.nodeIds).not.toContain(body.sketchNodeId);
    expect(projectNodes(projectId).some((node) => node.id === body.sketchNodeId)).toBe(true);
  });
});
