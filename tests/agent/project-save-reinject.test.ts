import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import { GET, POST } from "@/app/api/project/route";
import { placeInterviewNode } from "@/lib/agent/place-node";
import { applyWorkflow, applyWorkflowTool } from "@/lib/agent/tools/apply-workflow";
import { deleteProject } from "@/lib/local-storage";

type Node = { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> };
type Edge = { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null };
type SaveBody = {
  success: boolean;
  updatedAt: string;
  reinjected: Node[];
  reinjectedEdges: Edge[];
  refreshed: Node[];
  removed: string[];
  deletedNodeIds: string[];
  deletedEdgeIds: string[];
  unchanged: boolean;
};

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
  return (await res.json()) as {
    nodes: Node[];
    edges: Edge[];
    updatedAt: string | null;
    deletedNodeIds: string[];
    deletedEdgeIds: string[];
  };
}

async function save(
  nodes: Node[],
  edges: Edge[],
  baseUpdatedAt?: string,
  deleted?: { deletedNodeIds?: string[]; deletedEdgeIds?: string[] },
) {
  const res = await POST(
    new NextRequest("http://localhost/api/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        nodes,
        edges,
        ...(baseUpdatedAt !== undefined ? { baseUpdatedAt } : {}),
        ...deleted,
      }),
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
    expect(await res.json()).toEqual({
      nodes: [],
      edges: [],
      updatedAt: null,
      coverImageUrl: null,
      deletedNodeIds: [],
      deletedEdgeIds: [],
    });
  });

  it("rehydrates preview image refs in the response without writing the database", async () => {
    const prompt = "Gold thumbnail for GET rehydrate";
    const empty: Node = {
      id: "prev-live",
      type: "preview",
      position: { x: 0, y: 0 },
      data: { genPromptUsed: prompt },
    };
    await save([empty], []);
    const before = dbCanvas();
    getDb()
      .prepare(
        `INSERT INTO generations_log (id, provider, model, endpoint, project_id, prompt, generated_image_ids)
         VALUES (?, 'openai', 'gpt-image', '/api/generate', ?, ?, ?)`,
      )
      .run(`gen_${projectId}`, projectId, prompt, JSON.stringify(["img-restored-1"]));

    const body = await load();
    expect(body.nodes.find((n) => n.id === "prev-live")?.data?.generatedImages).toEqual([
      "/api/generated-images/image?id=img-restored-1",
    ]);
    expect(dbCanvas().updatedAt).toBe(before.updatedAt);
    expect(dbCanvas().nodes).toEqual(before.nodes);
  });

  it("does not restore a preview listed in deletedNodeIds", async () => {
    const prompt = "Failed gold preview";
    const live: Node = { id: "prev-ok", type: "preview", position: { x: 0, y: 0 }, data: { genPromptUsed: prompt } };
    const gone: Node = { id: "6d00aec9", type: "preview", position: { x: 10, y: 0 }, data: { genPromptUsed: prompt } };
    const afterAdd = await load();
    await save([live, gone], [], afterAdd.updatedAt!);
    const afterBoth = await load();
    await save([live], [], afterBoth.updatedAt!, { deletedNodeIds: ["6d00aec9"] });
    getDb()
      .prepare(
        `INSERT INTO generations_log (id, provider, model, endpoint, project_id, prompt, generated_image_ids)
         VALUES (?, 'openai', 'gpt-image', '/api/generate', ?, ?, ?)`,
      )
      .run(`gen_tomb_${projectId}`, projectId, prompt, JSON.stringify(["img-a", "img-b"]));

    const body = await load();
    expect(body.nodes.map((n) => n.id)).not.toContain("6d00aec9");
    expect(body.deletedNodeIds).toContain("6d00aec9");
    expect(body.nodes.find((n) => n.id === "prev-ok")?.data?.generatedImages).toBeUndefined();
    const afterGet = dbCanvas();
    expect(afterGet.updatedAt).toBe(body.updatedAt);
    expect(afterGet.nodes.map((n) => n.id)).not.toContain("6d00aec9");
  });

  it("returns persisted tombstones and hides those nodes from the live graph", async () => {
    const generator: Node = { id: "user-gen-1", type: "generator", position: { x: 200, y: 0 }, data: { model: "nano-banana" } };
    const afterAdd = await load();
    await save([userNode, generator], [], afterAdd.updatedAt!);
    const afterBoth = await load();
    await save([userNode], [], afterBoth.updatedAt!, { deletedNodeIds: ["user-gen-1"] });

    const body = await load();
    expect(body.nodes.map((n) => n.id)).toEqual(["user-1"]);
    expect(body.deletedNodeIds).toContain("user-gen-1");
  });
});

describe("POST /api/project — no-op writes", () => {
  it("does not bump updatedAt when the persistable canvas is unchanged", async () => {
    const first = await load();
    const second = await save(first.nodes, first.edges, first.updatedAt!, {
      deletedNodeIds: first.deletedNodeIds,
      deletedEdgeIds: first.deletedEdgeIds,
    });
    expect(second.unchanged).toBe(true);
    expect(second.updatedAt).toBe(first.updatedAt);
    expect(dbCanvas().updatedAt).toBe(first.updatedAt);
  });

  it("does not rewrite when stored JSON mentions data:image but the persistable graph is the same", async () => {
    const sketchElements = JSON.stringify([
      { id: "rect", type: "rectangle", x: 0, y: 0, width: 100, height: 40, label: "paste a data:image/png thumbnail" },
    ]);
    const withSketch: Node = {
      id: "sk-1",
      type: "sketch",
      position: { x: 0, y: 0 },
      data: { label: "Croquis", sketchElements },
    };
    const afterFirst = await save([withSketch], []);
    expect(JSON.stringify(dbCanvas().nodes)).toContain("data:image");
    const second = await save([withSketch], [], afterFirst.updatedAt!, {
      deletedNodeIds: afterFirst.deletedNodeIds,
      deletedEdgeIds: afterFirst.deletedEdgeIds,
    });
    expect(second.unchanged).toBe(true);
    expect(second.updatedAt).toBe(afterFirst.updatedAt);
    expect(dbCanvas().updatedAt).toBe(afterFirst.updatedAt);
  });

  it("keeps stored tombstones when the client sends an empty deleted list", async () => {
    const generator: Node = { id: "user-gen-1", type: "generator", position: { x: 200, y: 0 }, data: { model: "nano-banana" } };
    const afterAdd = await load();
    await save([userNode, generator], [], afterAdd.updatedAt!);
    const afterBoth = await load();
    const deleted = await save([userNode], [], afterBoth.updatedAt!, { deletedNodeIds: ["user-gen-1"] });
    expect(deleted.deletedNodeIds).toContain("user-gen-1");

    const empty = await save([userNode], [], deleted.updatedAt!, { deletedNodeIds: [] });
    expect(empty.unchanged).toBe(true);
    expect(empty.updatedAt).toBe(deleted.updatedAt);
    expect(empty.deletedNodeIds).toContain("user-gen-1");
    expect((await load()).deletedNodeIds).toContain("user-gen-1");
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
      { deletedNodeIds: ["iv-prompt"] },
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

  it("keeps apply_workflow A/B prompt nodes through a stale client save", async () => {
    const base = (await load()).updatedAt!;
    const outcome = await applyWorkflow({
      project_id: projectId,
      blueprint: {
        nodes: [
          { id: "prompt-a", type: "prompt", data: { prompt: "A shock" } },
          { id: "prompt-b", type: "prompt", data: { prompt: "B emotion" } },
        ],
        edges: [],
      },
    });
    expect(outcome.result.isError).toBeFalsy();
    const body = await save([{ ...userNode, position: { x: 10, y: 10 } }], [], base);
    expect(body.reinjected.map((n) => n.id).sort()).toEqual(["prompt-a", "prompt-b"]);
    expect(dbCanvas().nodes.map((n) => n.id).sort()).toEqual(["prompt-a", "prompt-b", "user-1"]);
    expect(dbCanvas().nodes.find((n) => n.id === "prompt-a")!.data.prompt).toBe("A shock");
  });

  it("reinjects a user-added generator a stale save dropped (no placedByAgentAt)", async () => {
    const base = (await load()).updatedAt!;
    const generator: Node = {
      id: "user-gen-1",
      type: "generator",
      position: { x: 200, y: 0 },
      data: { model: "nano-banana" },
    };
    await save([userNode, generator], [], base);
    const body = await save([userNode], [], base);
    expect(body.reinjected.map((n) => n.id)).toEqual(["user-gen-1"]);
    expect(dbCanvas().nodes.map((n) => n.id)).toEqual(["user-1", "user-gen-1"]);
  });

  it("does not reinject a user node the client deleted (stale save + deletedIds)", async () => {
    const base = (await load()).updatedAt!;
    const generator: Node = {
      id: "user-gen-1",
      type: "generator",
      position: { x: 200, y: 0 },
      data: { model: "nano-banana" },
    };
    await save([userNode, generator], [], base);
    const body = await save([userNode], [], base, { deletedNodeIds: ["user-gen-1"] });
    expect(body.reinjected).toEqual([]);
    expect(dbCanvas().nodes.map((n) => n.id)).toEqual(["user-1"]);
  });

  it("does not let a stale tab put back a node the client already deleted", async () => {
    const base = (await load()).updatedAt!;
    const generator: Node = {
      id: "user-gen-1",
      type: "generator",
      position: { x: 200, y: 0 },
      data: { model: "nano-banana" },
    };
    await save([userNode, generator], [], base);
    const afterAdd = await load();
    await save([userNode], [], afterAdd.updatedAt!, { deletedNodeIds: ["user-gen-1"] });
    expect(dbCanvas().nodes.map((n) => n.id)).toEqual(["user-1"]);

    const body = await save([userNode, generator], [], base);
    expect(body.removed).toContain("user-gen-1");
    expect(body.reinjected).toEqual([]);
    expect(dbCanvas().nodes.map((n) => n.id)).toEqual(["user-1"]);
  });

  it("restores a node the client re-adds after the delete when the base is current", async () => {
    const base = (await load()).updatedAt!;
    const generator: Node = {
      id: "user-gen-1",
      type: "generator",
      position: { x: 200, y: 0 },
      data: { model: "nano-banana" },
    };
    await save([userNode, generator], [], base);
    const afterAdd = await load();
    await save([userNode], [], afterAdd.updatedAt!, { deletedNodeIds: ["user-gen-1"] });
    const afterDelete = await load();
    const body = await save([userNode, generator], [], afterDelete.updatedAt!);
    expect(body.removed).not.toContain("user-gen-1");
    expect(dbCanvas().nodes.map((n) => n.id)).toEqual(["user-1", "user-gen-1"]);
  });

  it("does not reinject an agent node the client deleted (stale save + deletedIds)", async () => {
    const base = (await load()).updatedAt!;
    await placePromptAndGenerator();
    const body = await save([userNode], [], base, { deletedNodeIds: ["iv-prompt", "iv-generator"] });
    expect(body.reinjected).toEqual([]);
    expect(dbCanvas().nodes.map((n) => n.id)).toEqual(["user-1"]);
  });

  it("does not drop stored prompt nodes when a smaller current snapshot omits them", async () => {
    const extra: Node = {
      id: "075e691c-a1a0-4a50-ad3b-a8375fc8af30",
      type: "prompt",
      position: { x: 80, y: 0 },
      data: { prompt: "surviving prompt" },
    };
    const afterUser = await load();
    await save([userNode, extra], [], afterUser.updatedAt!);
    const afterBoth = await load();
    expect(afterBoth.nodes.map((n) => n.id).sort()).toEqual([extra.id, "user-1"]);

    const body = await save([userNode], [], afterBoth.updatedAt!, { deletedNodeIds: ["sketch-4a242b6b"] });
    expect(body.removed).not.toContain(extra.id);
    expect(body.reinjected.map((n) => n.id)).toContain(extra.id);
    expect(dbCanvas().nodes.map((n) => n.id).sort()).toEqual([extra.id, "user-1"]);
    expect((await load()).deletedNodeIds).not.toContain(extra.id);
    expect(dbCanvas().nodes.find((n) => n.id === extra.id)?.data.prompt).toBe("surviving prompt");
  });

  it("keeps a prompt that is both in the payload and in deletedNodeIds when the base is current", async () => {
    const extra: Node = {
      id: "2c2e6c41-ad3b-47c9-9534-b506825c3044",
      type: "prompt",
      position: { x: 40, y: 0 },
      data: { prompt: "still visible" },
    };
    const afterUser = await load();
    await save([userNode, extra], [], afterUser.updatedAt!);
    const afterBoth = await load();

    const body = await save([userNode, extra], [], afterBoth.updatedAt!, { deletedNodeIds: [extra.id] });
    expect(body.removed).not.toContain(extra.id);
    expect(dbCanvas().nodes.map((n) => n.id).sort()).toEqual([extra.id, "user-1"]);
    expect((await load()).deletedNodeIds).not.toContain(extra.id);
    expect(dbCanvas().nodes.find((n) => n.id === extra.id)?.data.prompt).toBe("still visible");
  });
});

describe("POST /api/project — oversized body", () => {
  it("maps truncated incoming JSON to 413 Payload trop volumineux, not Unterminated string", async () => {
    const res = await POST({
      headers: { get: () => null },
      text: async () => {
        throw new SyntaxError("Unterminated string in JSON at position 10485093");
      },
      json: async () => {
        throw new SyntaxError("Unterminated string in JSON at position 10485093");
      },
    } as never);
    expect(res.status).toBe(413);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("Payload trop volumineux");
    expect(json.error).not.toMatch(/Unterminated/);
  });

  it("rejects an oversized Content-Length before parsing", async () => {
    const res = await POST({
      headers: { get: (name: string) => (name.toLowerCase() === "content-length" ? String(12 * 1024 * 1024) : null) },
      text: async () => JSON.stringify({ projectId, nodes: [userNode], edges: [] }),
      json: async () => ({ projectId, nodes: [userNode], edges: [] }),
    } as never);
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe("Payload trop volumineux");
  });

  it("strips data:image from nodes before writing", async () => {
    const fat: Node = {
      id: "prev",
      type: "preview",
      position: { x: 0, y: 0 },
      data: {
        generatedImages: ["data:image/png;base64,QUJDRA==", "/api/generated-images/image?id=gi1"],
        imageBase64: "data:image/png;base64,QUJDRA==",
      },
    };
    const res = await POST(
      new NextRequest("http://localhost/api/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, nodes: [userNode, fat], edges: [] }),
      }),
    );
    expect(res.status).toBe(200);
    const stored = dbCanvas().nodes.find((node) => node.id === "prev")!;
    expect(JSON.stringify(stored)).not.toContain("data:image");
    expect(stored.data.generatedImages).toEqual(["/api/generated-images/image?id=gi1"]);
    expect(stored.data.imageBase64).toBeUndefined();
  });
});

describe("POST /api/project — deleted project", () => {
  it("returns 404 and does not recreate the gallery meta row", async () => {
    deleteProject(projectId);
    const res = await POST(
      new NextRequest("http://localhost/api/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, nodes: [userNode], edges: [] }),
      }),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Project not found" });
    expect(getDb().prepare("SELECT 1 AS ok FROM projects_meta WHERE id = ?").get(projectId)).toBeUndefined();
    expect(getDb().prepare("SELECT 1 AS ok FROM projects WHERE id = ?").get(projectId)).toBeUndefined();
  });
});
