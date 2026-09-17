import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import { GET, POST } from "@/app/api/project/route";
import { placeInterviewNode } from "@/lib/agent/place-node";

type Node = { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> };
type Edge = { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null };
type SaveBody = { success: boolean; updatedAt: string; reinjected: Node[]; reinjectedEdges: Edge[] };

let projectId: string;

const userNode: Node = { id: "user-1", type: "prompt", position: { x: 0, y: 0 }, data: { prompt: "Mon idée" } };

function dbCanvas() {
  const row = getDb().prepare("SELECT nodes, edges, updated_at FROM projects WHERE id = ?").get(projectId) as {
    nodes: string;
    edges: string;
    updated_at: string;
  };
  return { nodes: JSON.parse(row.nodes) as Node[], edges: JSON.parse(row.edges) as Edge[], updatedAt: row.updated_at };
}

async function load() {
  const res = await GET(new NextRequest(`http://localhost/api/project?id=${projectId}`));
  return (await res.json()) as { nodes: Node[]; edges: Edge[]; updatedAt: string | null };
}

async function save(nodes: Node[], edges: Edge[], baseUpdatedAt?: string) {
  const res = await POST(
    new NextRequest("http://localhost/api/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, nodes, edges, ...(baseUpdatedAt !== undefined ? { baseUpdatedAt } : {}) }),
    }),
  );
  expect(res.status).toBe(200);
  return (await res.json()) as SaveBody;
}

async function placePromptAndGenerator() {
  for (const node of [
    { id: "iv-prompt", type: "prompt", data: { prompt: "x" } },
    { id: "iv-generator", type: "generator", data: { model: "nano-banana", aspectRatio: "16x9" } },
  ]) {
    const outcome = await placeInterviewNode(projectId, { node } as never);
    if (!outcome.ok) throw new Error(outcome.error);
  }
}

beforeEach(async () => {
  // createProject's id is proj_<Date.now()>: two tests in the same millisecond would collide.
  projectId = `proj_test_${uuid()}`;
  const createdAt = new Date().toISOString();
  getDb().prepare("INSERT INTO projects_meta (id, name, description, created_at, updated_at) VALUES (?, ?, '', ?, ?)").run(projectId, "Interview", createdAt, createdAt);
  getDb().prepare("INSERT INTO projects (id, nodes, edges, updated_at) VALUES (?, '[]', '[]', ?)").run(projectId, createdAt);
  await save([userNode], []);
});

describe("GET /api/project", () => {
  it("returns the canvas with its updatedAt", async () => {
    const body = await load();
    expect(body.nodes).toEqual([userNode]);
    expect(body.updatedAt).toBe(dbCanvas().updatedAt);
  });

  it("answers updatedAt null for an unknown project", async () => {
    const res = await GET(new NextRequest("http://localhost/api/project?id=proj_unknown_save"));
    expect(await res.json()).toEqual({ nodes: [], edges: [], updatedAt: null });
  });
});

describe("POST /api/project — agent nodes newer than the client base", () => {
  it("reinjects them with their edges when the payload predates them", async () => {
    const base = (await load()).updatedAt!;
    await placePromptAndGenerator();
    const body = await save([{ ...userNode, position: { x: 10, y: 10 } }], [], base);

    expect(body.reinjected.map((n) => n.id).sort()).toEqual(["iv-generator", "iv-prompt"]);
    expect(body.reinjectedEdges).toEqual([
      expect.objectContaining({ source: "iv-prompt", target: "iv-generator", targetHandle: "prompt-in" }),
    ]);
    const saved = dbCanvas();
    expect(saved.nodes.map((n) => n.id)).toEqual(["user-1", "iv-prompt", "iv-generator"]);
    expect(saved.nodes[0].position).toEqual({ x: 10, y: 10 });
    expect(saved.edges).toHaveLength(1);
    expect(body.updatedAt).toBe(saved.updatedAt);
  });

  it("respects a deletion made after the patch (⌘Z then save: the node stays absent)", async () => {
    await placePromptAndGenerator();
    const afterPatch = await load();
    const body = await save(
      afterPatch.nodes.filter((n) => n.id !== "iv-prompt"),
      afterPatch.edges.filter((e) => e.source !== "iv-prompt"),
      afterPatch.updatedAt!,
    );
    expect(body.reinjected).toEqual([]);
    expect(body.reinjectedEdges).toEqual([]);
    expect(dbCanvas().nodes.map((n) => n.id)).toEqual(["user-1", "iv-generator"]);
    expect(dbCanvas().edges).toEqual([]);
  });

  it("never reinjects an edge the user removed between two nodes they kept", async () => {
    await placePromptAndGenerator();
    const afterPatch = await load();
    const body = await save(afterPatch.nodes, [], "2000-01-01T00:00:00.000Z");
    expect(body.reinjected).toEqual([]);
    expect(body.reinjectedEdges).toEqual([]);
    expect(dbCanvas().edges).toEqual([]);
  });

  it("reinjects nothing without a base (older clients)", async () => {
    await placePromptAndGenerator();
    const body = await save([userNode], []);
    expect(body.reinjected).toEqual([]);
    expect(dbCanvas().nodes.map((n) => n.id)).toEqual(["user-1"]);
  });

  it("does not duplicate an agent node already in the payload", async () => {
    const base = (await load()).updatedAt!;
    await placePromptAndGenerator();
    const current = await load();
    const body = await save(current.nodes.filter((n) => n.id !== "iv-generator"), [], base);
    expect(body.reinjected.map((n) => n.id)).toEqual(["iv-generator"]);
    expect(body.reinjectedEdges.map((e) => e.source)).toEqual(["iv-prompt"]);
    expect(dbCanvas().nodes.map((n) => n.id)).toEqual(["user-1", "iv-prompt", "iv-generator"]);
  });

  it("drops a reinjected edge whose other end is gone", async () => {
    const generator = await placeInterviewNode(projectId, {
      node: { id: "iv-generator", type: "generator", data: { model: "nano-banana", aspectRatio: "16x9" } },
    } as never);
    expect(generator.ok).toBe(true);
    // The client saw the generator, then deleted it; meanwhile the agent placed the prompt (wired to it).
    const base = (await load()).updatedAt!;
    const prompt = await placeInterviewNode(projectId, { node: { id: "iv-prompt", type: "prompt", data: { prompt: "x" } } } as never);
    expect(prompt.ok && prompt.patch.edges).toHaveLength(1);

    const body = await save([userNode], [], base);
    expect(body.reinjected.map((n) => n.id)).toEqual(["iv-prompt"]);
    expect(body.reinjectedEdges).toEqual([]);
    expect(dbCanvas().nodes.map((n) => n.id)).toEqual(["user-1", "iv-prompt"]);
    expect(dbCanvas().edges).toEqual([]);
  });

  it("compares a legacy SQLite base as an instant", async () => {
    await placePromptAndGenerator();
    const body = await save([userNode], [], "2000-01-01 00:00:00");
    expect(body.reinjected.map((n) => n.id).sort()).toEqual(["iv-generator", "iv-prompt"]);
  });
});
