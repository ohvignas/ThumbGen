import { describe, it, expect, beforeEach } from "vitest";
import { applyWorkflowTool } from "@/lib/agent/tools/apply-workflow";
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
        { id: "g-1", type: "generator", data: { model: "ideogram", aspectRatio: "16x9" } },
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
        { id: "g-1", type: "generator", data: { model: "ideogram", aspectRatio: "16x9" } },
      ],
      edges: [{ source: "f-1", target: "g-1", targetHandle: "logo-in" }],
    };
    const r = await applyWorkflowTool.handler({ project_id: projectId, blueprint: bp });
    expect(r.isError).toBeFalsy();
  });

  it("resolves image_source to a data URL on the persisted swipeFile node so canvas can render it", async () => {
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
    expect(swipe.data.imageBase64).toMatch(/^data:image\/png;base64,/);
    expect(swipe.data.label).toBe("Brand");
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
    expect(nodes[0].data.model).toBe("gemini-3-pro-image-preview");
    expect(nodes[0].data.numImages).toBe(3);
  });

  it("adds id and sourceHandle:null to edges so React Flow renders them", async () => {
    const bp = {
      nodes: [
        { id: "p-1", type: "prompt", data: { prompt: "hi" } },
        { id: "g-1", type: "generator", data: { model: "ideogram", aspectRatio: "16x9" } },
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

  it("computes a diff against existing canvas (deletes b, creates c)", async () => {
    // Seed existing
    getDb().prepare("UPDATE projects SET nodes = ?, edges = ? WHERE id = ?")
      .run(JSON.stringify([
        { id: "a", type: "prompt", data: { prompt: "x" } },
        { id: "b", type: "generator", data: { model: "ideogram", aspectRatio: "16x9" } },
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
    expect(text).toMatch(/1 deleted/);
  });
});
