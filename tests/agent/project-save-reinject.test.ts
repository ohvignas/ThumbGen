import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import { GET, POST } from "@/app/api/project/route";
import { placeInterviewNode } from "@/lib/agent/place-node";
import { applyWorkflowTool } from "@/lib/agent/tools/apply-workflow";

type Node = { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> };
type Edge = { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null };
type SaveBody = { success: boolean; updatedAt: string; reinjected: Node[]; reinjectedEdges: Edge[]; refreshed: Node[]; removed: string[] };

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

  it("keeps the agent's newer data when a stale payload contains iv-prompt", async () => {
    const first = await placeInterviewNode(projectId, { node: { id: "iv-prompt", type: "prompt", data: { prompt: "Premier jet" } } } as never);
    expect(first.ok).toBe(true);
    const seen = await load();
    const base = seen.updatedAt!;
    // The agent completes the prompt after the client's state was taken; the client then saves its stale copy, moved.
    const update = await placeInterviewNode(projectId, { node: { id: "iv-prompt", type: "prompt", data: { prompt: "Texte « ÇA CHANGE TOUT »" } } } as never);
    expect(update.ok).toBe(true);
    const stale = seen.nodes.map((n) => (n.id === "iv-prompt" ? { ...n, position: { x: 7, y: 8 } } : n));

    const body = await save(stale, seen.edges, base);
    const saved = dbCanvas().nodes.find((n) => n.id === "iv-prompt")!;
    expect(saved.position).toEqual({ x: 7, y: 8 });
    expect(saved.data.prompt).toBe("Texte « ÇA CHANGE TOUT »");
    expect(body.refreshed).toEqual([saved]);
    expect(body.reinjected).toEqual([]);

    // A payload based on the agent's write keeps the client's own data.
    const current = await load();
    const edited = current.nodes.map((n) => (n.id === "iv-prompt" ? { ...n, data: { ...n.data, prompt: "Ma version" } } : n));
    const second = await save(edited, current.edges, current.updatedAt!);
    expect(second.refreshed).toEqual([]);
    expect(dbCanvas().nodes.find((n) => n.id === "iv-prompt")!.data.prompt).toBe("Ma version");
  });

  it("never resurrects interview nodes removed on the server (« Repartir de zéro ») from a stale save", async () => {
    await placePromptAndGenerator();
    const seen = await load();
    const removal = await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: { nodes: [], edges: [] },
      remove_node_ids: ["iv-prompt", "iv-generator"],
    });
    expect(removal.isError).toBeFalsy();

    // The client still shows the old nodes (it saved before its poll saw the removal), plus its own new node.
    const mine: Node = { id: "user-2", type: "prompt", position: { x: 9, y: 9 }, data: { prompt: "Nouveau" } };
    const body = await save([...seen.nodes, mine], seen.edges, seen.updatedAt!);
    expect(body.removed.sort()).toEqual(["iv-generator", "iv-prompt"]);
    expect(dbCanvas().nodes.map((n) => n.id)).toEqual(["user-1", "user-2"]);
    expect(dbCanvas().edges).toEqual([]);
  });

  it("keeps a user's duplicate of an interview node through a stale save", async () => {
    await placePromptAndGenerator();
    const seen = await load();
    await applyWorkflowTool.handler({ project_id: projectId, blueprint: { nodes: [], edges: [] }, remove_node_ids: ["iv-generator"] });
    // An older copy made before the agent-field stripping: an uuid id, still carrying placedByAgentAt.
    const prompt = seen.nodes.find((n) => n.id === "iv-prompt")!;
    const copy: Node = { ...prompt, id: "3f2c1a9e-copy", position: { x: 40, y: 40 } };
    const body = await save([...seen.nodes, copy], seen.edges, seen.updatedAt!);
    expect(body.removed).toEqual(["iv-generator"]);
    expect(dbCanvas().nodes.map((n) => n.id)).toContain("3f2c1a9e-copy");
  });

  it("keeps an agent node the client re-added after seeing its removal (e.g. ⌘Z)", async () => {
    await placePromptAndGenerator();
    const before = await load();
    await applyWorkflowTool.handler({ project_id: projectId, blueprint: { nodes: [], edges: [] }, remove_node_ids: ["iv-prompt"] });
    const afterRemoval = await load();
    const undone = before.nodes;
    const body = await save(undone, before.edges, afterRemoval.updatedAt!);
    expect(body.removed).toEqual([]);
    expect(dbCanvas().nodes.map((n) => n.id)).toContain("iv-prompt");
  });

  it("compares a legacy SQLite base as an instant", async () => {
    await placePromptAndGenerator();
    const body = await save([userNode], [], "2000-01-01 00:00:00");
    expect(body.reinjected.map((n) => n.id).sort()).toEqual(["iv-generator", "iv-prompt"]);
  });
});
