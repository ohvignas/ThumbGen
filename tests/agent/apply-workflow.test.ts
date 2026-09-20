import { describe, it, expect, beforeEach } from "vitest";
import { applyWorkflow, applyWorkflowTool } from "@/lib/agent/tools/apply-workflow";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";

describe("apply_workflow", () => {
  const projectId = "test-apply-workflow";
  let logoId: string;

  beforeEach(() => {
    getDb().prepare("INSERT OR REPLACE INTO projects (id, nodes, edges) VALUES (?, ?, ?)")
      .run(projectId, "[]", "[]");
    // seed a logo to reference in tests
    logoId = uuid();
    getDb().prepare("INSERT OR REPLACE INTO logos (id, label, mime_type, size, data) VALUES (?, ?, ?, ?, ?)")
      .run(logoId, "Brand", "image/png", 4, Buffer.from([0, 0, 0, 0]));
  });

  it("validates and persists a fresh blueprint", async () => {
    const blueprint = {
      nodes: [
        { id: "p-1", type: "prompt", data: { prompt: "hello" } },
        { id: "g-1", type: "generator", data: { model: "openai", aspectRatio: "16x9" } },
      ],
      edges: [{ source: "p-1", target: "g-1", targetHandle: "prompt-in" }],
    };
    const r = await applyWorkflowTool.handler({ project_id: projectId, blueprint });
    expect(r.isError).toBeFalsy();

    const row = getDb().prepare("SELECT nodes, edges FROM projects WHERE id = ?").get(projectId) as { nodes: string; edges: string };
    const persistedNodes = JSON.parse(row.nodes);
    expect(persistedNodes).toHaveLength(2);
    // auto-layout adds positions
    expect(persistedNodes[0].position).toBeDefined();
  });

  it("accepts a JSON-stringified blueprint (some models send it this way)", async () => {
    const blueprint = {
      nodes: [
        { id: "p-1", type: "prompt", data: { prompt: "hello" } },
        { id: "g-1", type: "generator", data: { model: "openai", aspectRatio: "16x9" } },
      ],
      edges: [{ source: "p-1", target: "g-1", targetHandle: "prompt-in" }],
    };
    const r = await applyWorkflowTool.handler({ project_id: projectId, blueprint: JSON.stringify(blueprint) });
    expect(r.isError).toBeFalsy();
    const row = getDb().prepare("SELECT nodes FROM projects WHERE id = ?").get(projectId) as { nodes: string };
    expect(JSON.parse(row.nodes)).toHaveLength(2);
  });

  it("rejects a blueprint string that isn't valid JSON", async () => {
    const r = await applyWorkflowTool.handler({ project_id: projectId, blueprint: "{not json" });
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toMatch(/not valid JSON/i);
  });

  it("rejects an invalid blueprint with helpful error", async () => {
    const invalid = { nodes: [{ id: "x", type: "generator", data: {} }], edges: [] };
    const r = await applyWorkflowTool.handler({ project_id: projectId, blueprint: invalid });
    expect(r.isError).toBe(true);
    const text = (r.content[0] as { text: string }).text;
    expect(text.toLowerCase()).toMatch(/invalid|model|aspectratio/);
  });

  it("rejects a blueprint with unresolvable image_source", async () => {
    const bp = {
      nodes: [
        { id: "f-1", type: "swipeFile", data: { kind: "logo", image_source: "stored:lg_does-not-exist" } },
      ],
      edges: [],
    };
    const r = await applyWorkflowTool.handler({ project_id: projectId, blueprint: bp });
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toMatch(/Image source/);
  });

  it("marks resolved stored references without error", async () => {
    const bp = {
      nodes: [
        { id: "f-1", type: "swipeFile", data: { kind: "logo", image_source: `stored:lg_${logoId}` } },
        { id: "g-1", type: "generator", data: { model: "openai", aspectRatio: "16x9" } },
      ],
      edges: [{ source: "f-1", target: "g-1", targetHandle: "logo-in" }],
    };
    const r = await applyWorkflowTool.handler({ project_id: projectId, blueprint: bp });
    expect(r.isError).toBeFalsy();
  });

  it("resolves image_source to a library URL on the persisted swipeFile node so canvas can render it", async () => {
    const bp = {
      nodes: [
        { id: "f-1", type: "swipeFile", data: { kind: "logo", image_source: `stored:lg_${logoId}`, label: "Brand" } },
      ],
      edges: [],
    };
    await applyWorkflowTool.handler({ project_id: projectId, blueprint: bp });
    const row = getDb().prepare("SELECT nodes FROM projects WHERE id = ?").get(projectId) as { nodes: string };
    const nodes = JSON.parse(row.nodes) as Array<{ data: Record<string, unknown> }>;
    const swipe = nodes[0];
    expect(swipe.data.imageUrl).toBe(`/api/logos/image?f=${logoId}`);
    expect(swipe.data.imageBase64).toBeUndefined();
    expect(swipe.data.label).toBe("Brand");
    expect(swipe.data.kind).toBe("logo"); // lets the canvas wire a Logo to logo-in
    expect(swipe.data.image_source).toBe(`stored:lg_${logoId}`); // kept for re-resolve
  });

  it("maps generator blueprint shape to canvas shape (model id + numImages)", async () => {
    const bp = {
      nodes: [
        { id: "g-1", type: "generator", data: { model: "nano-banana", aspectRatio: "16x9", count: 3 } },
      ],
      edges: [],
    };
    await applyWorkflowTool.handler({ project_id: projectId, blueprint: bp });
    const row = getDb().prepare("SELECT nodes FROM projects WHERE id = ?").get(projectId) as { nodes: string };
    const nodes = JSON.parse(row.nodes) as Array<{ data: Record<string, unknown> }>;
    expect(nodes[0].data.model).toBe("gemini-3.1-flash-image");
    expect(nodes[0].data.numImages).toBe(3);
  });

  it("adds id and sourceHandle:null to edges so React Flow renders them", async () => {
    const bp = {
      nodes: [
        { id: "p-1", type: "prompt", data: { prompt: "hi" } },
        { id: "g-1", type: "generator", data: { model: "openai", aspectRatio: "16x9" } },
      ],
      edges: [{ source: "p-1", target: "g-1", targetHandle: "prompt-in" }],
    };
    await applyWorkflowTool.handler({ project_id: projectId, blueprint: bp });
    const row = getDb().prepare("SELECT edges FROM projects WHERE id = ?").get(projectId) as { edges: string };
    const edges = JSON.parse(row.edges) as Array<{ id?: string; sourceHandle?: string | null; targetHandle?: string }>;
    expect(edges).toHaveLength(1);
    expect(edges[0].id).toMatch(/^e-/);
    expect(edges[0].sourceHandle).toBeNull();
    expect(edges[0].targetHandle).toBe("prompt-in");
  });

  it("merges into the existing canvas (keeps b, creates c, deletes nothing)", async () => {
    // Seed existing
    getDb().prepare("UPDATE projects SET nodes = ?, edges = ? WHERE id = ?")
      .run(JSON.stringify([
        { id: "a", type: "prompt", data: { prompt: "x" } },
        { id: "b", type: "generator", data: { model: "openai", aspectRatio: "16x9" } },
      ]), JSON.stringify([]), projectId);

    const target = {
      nodes: [
        { id: "a", type: "prompt", data: { prompt: "x" } },
        { id: "c", type: "generator", data: { model: "openai", aspectRatio: "16x9" } },
      ],
      edges: [],
    };
    const r = await applyWorkflowTool.handler({ project_id: projectId, blueprint: target });
    expect(r.isError).toBeFalsy();
    const text = (r.content[0] as { text: string }).text;
    expect(text).toMatch(/1 created/);
    expect(text).toMatch(/0 removed \(kept 1 untouched\)/);
    const row = getDb().prepare("SELECT nodes FROM projects WHERE id = ?").get(projectId) as { nodes: string };
    expect((JSON.parse(row.nodes) as Array<{ id: string }>).map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  it("stores a Personnage faceReference as its angle photos", async () => {
    const personaId = uuid();
    getDb().prepare("INSERT INTO personas (id, label) VALUES (?, ?)").run(personaId, "Antoine");
    getDb()
      .prepare("INSERT INTO persona_photos (id, persona_id, angle, mime_type, size, data) VALUES (?, ?, ?, ?, ?, ?)")
      .run(uuid(), personaId, "front", "image/png", 1, Buffer.from([1]));
    const bp = {
      nodes: [{ id: "face-1", type: "faceReference", data: { image_source: `stored:persona_${personaId}` } }],
      edges: [],
    };
    const r = await applyWorkflowTool.handler({ project_id: projectId, blueprint: bp });
    expect(r.isError).toBeFalsy();
    const row = getDb().prepare("SELECT nodes FROM projects WHERE id = ?").get(projectId) as { nodes: string };
    const face = (JSON.parse(row.nodes) as Array<{ data: Record<string, unknown> }>)[0];
    expect(face.data.personaId).toBe(personaId);
    expect((face.data.personaAngles as Record<string, string>).front).toBe(`/api/personas/image?id=${personaId}&angle=front`);
    expect(face.data.label).toBe("Antoine");
    expect(face.data.imageBase64).toBeUndefined();
  });

  it("rejects a single face photo on a faceReference", async () => {
    const bp = { nodes: [{ id: "face-1", type: "faceReference", data: { image_source: "stored:fr_legacy" } }], edges: [] };
    const r = await applyWorkflowTool.handler({ project_id: projectId, blueprint: bp });
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toContain("stored:persona_");
  });

  it("stamps placedByAgentAt on created A/B prompts and returns a live workflow patch", async () => {
    const outcome = await applyWorkflow({
      project_id: projectId,
      blueprint: {
        nodes: [
          { id: "prompt-a", type: "prompt", data: { prompt: "A shock" } },
          { id: "prompt-b", type: "prompt", data: { prompt: "B emotion" } },
          { id: "g-1", type: "generator", data: { model: "openai", aspectRatio: "16x9", abTest: { variants: ["A", "B"] } } },
        ],
        edges: [
          { source: "prompt-a", target: "g-1", targetHandle: "prompt-in" },
          { source: "prompt-b", target: "g-1", targetHandle: "prompt-in-b" },
        ],
      },
    });
    expect(outcome.result.isError).toBeFalsy();
    expect(outcome.workflowPatch).not.toBeNull();
    expect(outcome.workflowPatch!.created.map((node) => node.id).sort()).toEqual(["g-1", "prompt-a", "prompt-b"]);
    expect(outcome.workflowPatch!.edges).toHaveLength(2);
    const row = getDb().prepare("SELECT nodes FROM projects WHERE id = ?").get(projectId) as { nodes: string };
    const nodes = JSON.parse(row.nodes) as Array<{ id: string; data: Record<string, unknown> }>;
    for (const node of nodes) {
      expect(typeof node.data.placedByAgentAt).toBe("string");
    }
  });
});
