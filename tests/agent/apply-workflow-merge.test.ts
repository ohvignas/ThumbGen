import { describe, it, expect, beforeEach } from "vitest";
import { v4 as uuid } from "uuid";
import { applyWorkflowTool } from "@/lib/agent/tools/apply-workflow";
import { getDb } from "@/lib/db";

type PNode = { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> };
type PEdge = { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null };

const projectId = "test-apply-workflow-merge";
const IMPORTED = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function seed(nodes: PNode[], edges: PEdge[]) {
  getDb()
    .prepare("INSERT OR REPLACE INTO projects (id, nodes, edges, updated_at) VALUES (?, ?, ?, ?)")
    .run(projectId, JSON.stringify(nodes), JSON.stringify(edges), "2026-09-17T08:00:00.000Z");
}

function persisted() {
  const row = getDb().prepare("SELECT nodes, edges, updated_at FROM projects WHERE id = ?").get(projectId) as {
    nodes: string;
    edges: string;
    updated_at: string;
  };
  return {
    nodes: JSON.parse(row.nodes) as PNode[],
    edges: JSON.parse(row.edges) as PEdge[],
    updatedAt: row.updated_at,
  };
}

function text(r: { content: Array<{ type: string; text?: string }> }) {
  return (r.content[0] as { text: string }).text;
}

function snapshotRows() {
  return getDb()
    .prepare("SELECT id, nodes, edges, reason, created_at FROM canvas_snapshots WHERE project_id = ? ORDER BY created_at, rowid")
    .all(projectId) as Array<{ id: string; nodes: string; edges: string; reason: string; created_at: string }>;
}

const node = (id: string, type: string, x: number, y: number, data: Record<string, unknown>): PNode => ({
  id,
  type,
  position: { x, y },
  data,
});
const edge = (source: string, target: string, targetHandle: string): PEdge => ({
  id: `e-${source}-${target}-${targetHandle}`,
  source,
  sourceHandle: null,
  target,
  targetHandle,
});

beforeEach(() => {
  getDb().prepare("DELETE FROM canvas_snapshots WHERE project_id = ?").run(projectId);
  seed([], []);
});

describe("apply_workflow — non-destructive merge", () => {
  it("keeps canvas nodes the blueprint does not mention", async () => {
    seed(
      [
        node("p-1", "prompt", 0, 0, { prompt: "old" }),
        node("g-1", "generator", 400, 0, { model: "gemini-3.1-flash-image", aspectRatio: "16x9" }),
      ],
      [edge("p-1", "g-1", "prompt-in")],
    );
    const r = await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: { nodes: [{ id: "p-2", type: "prompt", data: { prompt: "new" } }], edges: [] },
    });
    expect(r.isError).toBeFalsy();
    const { nodes, edges } = persisted();
    expect(nodes.map((n) => n.id).sort()).toEqual(["g-1", "p-1", "p-2"]);
    expect(edges).toHaveLength(1);
    expect(text(r)).toContain("Applied: 1 created, 0 updated, 0 removed (kept 2 untouched).");
  });

  it("removes only remove_node_ids, with their edges, and reports unknown ids", async () => {
    seed(
      [
        node("p-1", "prompt", 0, 0, { prompt: "a" }),
        node("p-2", "prompt", 0, 300, { prompt: "b" }),
        node("g-1", "generator", 400, 0, { model: "openai", aspectRatio: "16x9" }),
      ],
      [edge("p-1", "g-1", "prompt-in"), edge("p-2", "g-1", "prompt-in")],
    );
    const r = await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: { nodes: [], edges: [] },
      remove_node_ids: ["p-2", "ghost"],
    });
    expect(r.isError).toBeFalsy();
    const { nodes, edges } = persisted();
    expect(nodes.map((n) => n.id).sort()).toEqual(["g-1", "p-1"]);
    expect(edges.map((e) => e.source)).toEqual(["p-1"]);
    expect(text(r)).toContain("Applied: 0 created, 0 updated, 1 removed (kept 2 untouched).");
    expect(text(r)).toContain("ghost");
  });

  it("refuses a node that is both in the blueprint and in remove_node_ids, writing nothing", async () => {
    seed([node("p-1", "prompt", 0, 0, { prompt: "a" })], []);
    const r = await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: { nodes: [{ id: "p-1", type: "prompt", data: { prompt: "b" } }], edges: [] },
      remove_node_ids: ["p-1"],
    });
    expect(r.isError).toBe(true);
    expect(persisted().nodes[0].data.prompt).toBe("a");
    expect(snapshotRows()).toHaveLength(0);
  });

  it("updates an existing node in place: keeps position, imported image and generated images", async () => {
    seed(
      [
        node("ref-1", "swipeFile", 10, 20, { label: "images (3).png", imageBase64: IMPORTED, kind: "reference" }),
        node("g-1", "generator", 500, 40, {
          model: "gemini-3.1-flash-image",
          aspectRatio: "16x9",
          numImages: 2,
          imageSize: "2K",
          generatedImages: ["/api/generated-images/image?id=aaa", "/api/generated-images/image?id=bbb"],
          selectedImageIndex: 1,
        }),
      ],
      [edge("ref-1", "g-1", "ref-in")],
    );
    const r = await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: {
        nodes: [
          { id: "ref-1", type: "swipeFile", data: { label: "Référence visage" } },
          { id: "g-1", type: "generator", data: { model: "openai", aspectRatio: "16x9" } },
        ],
        edges: [],
      },
    });
    expect(r.isError).toBeFalsy();
    const { nodes, edges } = persisted();
    const ref = nodes.find((n) => n.id === "ref-1")!;
    expect(ref.position).toEqual({ x: 10, y: 20 });
    expect(ref.data).toMatchObject({ label: "Référence visage", imageBase64: IMPORTED, kind: "reference" });
    const gen = nodes.find((n) => n.id === "g-1")!;
    expect(gen.position).toEqual({ x: 500, y: 40 });
    expect(gen.data).toMatchObject({
      model: "gpt-image-2.5-sunburst",
      aspectRatio: "16x9",
      numImages: 2,
      imageSize: "2K",
      generatedImages: ["/api/generated-images/image?id=aaa", "/api/generated-images/image?id=bbb"],
      selectedImageIndex: 1,
    });
    expect(edges).toHaveLength(1);
    expect(text(r)).toContain("Applied: 0 created, 2 updated, 0 removed (kept 0 untouched).");
  });

  it("accepts an existing sketch/swipeFile without image_source (the image is kept)", async () => {
    seed(
      [
        node("sk-1", "sketch", 0, 0, { label: "Croquis", imageBase64: IMPORTED }),
        node("sw-1", "swipeFile", 0, 300, { imageUrl: "/api/swipe-files/image?id=x", kind: "reference" }),
      ],
      [],
    );
    const r = await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: {
        nodes: [
          { id: "sk-1", type: "sketch", data: {} },
          { id: "sw-1", type: "swipeFile", data: { kind: "reference" } },
        ],
        edges: [],
      },
    });
    expect(r.isError).toBeFalsy();
    const { nodes } = persisted();
    expect(nodes.find((n) => n.id === "sk-1")!.data.imageBase64).toBe(IMPORTED);
    expect(nodes.find((n) => n.id === "sw-1")!.data.imageUrl).toBe("/api/swipe-files/image?id=x");
  });

  it("still validates provided fields of an existing node", async () => {
    seed([node("g-1", "generator", 0, 0, { model: "openai", aspectRatio: "16x9" })], []);
    const r = await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: { nodes: [{ id: "g-1", type: "generator", data: { count: 9 } }], edges: [] },
    });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/count/);
  });

  it("still requires image_source on a new sketch/swipeFile", async () => {
    const r = await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: { nodes: [{ id: "sw-new", type: "swipeFile", data: { kind: "logo" } }], edges: [] },
    });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/image_source/);
  });

  it("refuses to change the type of an existing node", async () => {
    seed([node("n-1", "prompt", 0, 0, { prompt: "x" })], []);
    const r = await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: { nodes: [{ id: "n-1", type: "generator", data: { model: "openai", aspectRatio: "16x9" } }], edges: [] },
    });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("n-1");
    expect(persisted().nodes[0].type).toBe("prompt");
  });

  it("replaces the image of an existing node when a new image_source is given", async () => {
    const logoId = uuid();
    getDb()
      .prepare("INSERT OR REPLACE INTO logos (id, label, mime_type, size, data) VALUES (?, ?, ?, ?, ?)")
      .run(logoId, "Brand", "image/png", 4, Buffer.from([1, 2, 3, 4]));
    seed([node("sw-1", "swipeFile", 0, 0, { imageUrl: "/api/swipe-files/image?id=x", kind: "logo", label: "Old" })], []);
    const r = await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: { nodes: [{ id: "sw-1", type: "swipeFile", data: { image_source: `stored:lg_${logoId}` } }], edges: [] },
    });
    expect(r.isError).toBeFalsy();
    const data = persisted().nodes[0].data;
    expect(data.imageUrl).toBe(`/api/logos/image?f=${logoId}`);
    expect(data.image_source).toBe(`stored:lg_${logoId}`);
    expect(data.imageBase64).toBeUndefined();
    expect(data.label).toBe("Old");
    expect(data.kind).toBe("logo");
  });

  it("updates a faceReference to another Personnage without a label: keeps the node's label", async () => {
    const personaId = uuid();
    getDb().prepare("INSERT INTO personas (id, label) VALUES (?, ?)").run(personaId, "Florence");
    getDb()
      .prepare("INSERT INTO persona_photos (id, persona_id, angle, mime_type, size, data) VALUES (?, ?, ?, ?, ?, ?)")
      .run(uuid(), personaId, "front", "image/png", 1, Buffer.from([7]));
    seed([node("face-1", "faceReference", 0, 0, { personaId: "old", personaAngles: { front: IMPORTED }, label: "Mon visage" })], []);
    const r = await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: { nodes: [{ id: "face-1", type: "faceReference", data: { image_source: `stored:persona_${personaId}` } }], edges: [] },
    });
    expect(r.isError).toBeFalsy();
    const data = persisted().nodes[0].data;
    expect(data.personaId).toBe(personaId);
    expect((data.personaAngles as Record<string, string>).front).toBe(`/api/personas/image?id=${personaId}&angle=front`);
    expect(data.label).toBe("Mon visage");
  });

  it("a new image on an existing sketch drops the stale Excalidraw drawing", async () => {
    seed(
      [node("sk-1", "sketch", 0, 0, { label: "Croquis", imageBase64: IMPORTED, sketchElements: "[{}]", sketchFiles: "{}" })],
      [],
    );
    const r = await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: { nodes: [{ id: "sk-1", type: "sketch", data: { image_source: IMPORTED } }], edges: [] },
    });
    expect(r.isError).toBeFalsy();
    const data = persisted().nodes[0].data;
    expect(data).not.toHaveProperty("sketchElements");
    expect(data).not.toHaveProperty("sketchFiles");
    expect(data.image_source).toBe(IMPORTED);
    expect(data.label).toBe("Croquis");
  });

  it("accepts an existing node given without data (nothing changes), not a new one", async () => {
    seed([node("g-1", "generator", 0, 0, { model: "openai", aspectRatio: "16x9", numImages: 2 })], []);
    const ok = await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: {
        nodes: [{ id: "g-1", type: "generator" }, { id: "p-new", type: "prompt", data: { prompt: "x" } }],
        edges: [{ source: "p-new", target: "g-1", targetHandle: "prompt-in" }],
      },
    });
    expect(ok.isError).toBeFalsy();
    expect(persisted().nodes[0].data).toEqual({ model: "openai", aspectRatio: "16x9", numImages: 2 });
    const bad = await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: { nodes: [{ id: "g-new", type: "generator" }], edges: [] },
    });
    expect(bad.isError).toBe(true);
  });

  it("places new nodes right of the existing canvas without moving existing nodes", async () => {
    seed(
      [
        node("p-1", "prompt", -100, 50, { prompt: "a" }),
        node("g-1", "generator", 900, 400, { model: "openai", aspectRatio: "16x9" }),
      ],
      [edge("p-1", "g-1", "prompt-in")],
    );
    const r = await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: {
        nodes: [
          { id: "p-new", type: "prompt", data: { prompt: "b" } },
          { id: "g-new", type: "generator", data: { model: "openai", aspectRatio: "16x9" } },
        ],
        edges: [{ source: "p-new", target: "g-new", targetHandle: "prompt-in" }],
      },
    });
    expect(r.isError).toBeFalsy();
    const { nodes } = persisted();
    expect(nodes.find((n) => n.id === "p-1")!.position).toEqual({ x: -100, y: 50 });
    expect(nodes.find((n) => n.id === "g-1")!.position).toEqual({ x: 900, y: 400 });
    // g-1's right edge = 900 + 320 (default node width) → new nodes start at ≥ 1420.
    const newNodes = nodes.filter((n) => n.id.endsWith("-new"));
    expect(Math.min(...newNodes.map((n) => n.position.x))).toBe(900 + 320 + 200);
    // Laid out between themselves: the prompt is left of its generator.
    expect(newNodes.find((n) => n.id === "p-new")!.position.x).toBeLessThan(
      newNodes.find((n) => n.id === "g-new")!.position.x,
    );
  });

  it("keeps, adds, dedupes and removes edges, including edges to existing nodes", async () => {
    seed(
      [
        node("p-1", "prompt", 0, 0, { prompt: "a" }),
        node("sk-1", "sketch", 0, 300, { imageBase64: IMPORTED }),
        node("g-1", "generator", 400, 0, { model: "openai", aspectRatio: "16x9" }),
      ],
      [edge("p-1", "g-1", "prompt-in"), edge("sk-1", "g-1", "sketch-in")],
    );
    const r = await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: {
        nodes: [{ id: "ref-new", type: "swipeFile", data: { kind: "reference", image_source: IMPORTED } }],
        edges: [
          { source: "p-1", target: "g-1", targetHandle: "prompt-in" }, // already there → deduped
          { source: "ref-new", target: "g-1", targetHandle: "ref-in" }, // new node → existing generator
          { source: "ref-new", target: "g-1", targetHandle: "ref-in" }, // duplicate in the blueprint
        ],
      },
      remove_edges: [{ source: "sk-1", target: "g-1", targetHandle: "sketch-in" }],
    });
    expect(r.isError).toBeFalsy();
    const { nodes, edges } = persisted();
    expect(nodes.map((n) => n.id).sort()).toEqual(["g-1", "p-1", "ref-new", "sk-1"]);
    expect(edges.map((e) => `${e.source}>${e.target}:${e.targetHandle}`).sort()).toEqual([
      "p-1>g-1:prompt-in",
      "ref-new>g-1:ref-in",
    ]);
    const added = edges.find((e) => e.source === "ref-new")!;
    expect(added.id).toMatch(/^e-/);
    expect(added.sourceHandle).toBeNull();
    // The existing edge object is kept as-is (same id).
    expect(edges.find((e) => e.source === "p-1")!.id).toBe("e-p-1-g-1-prompt-in");
  });

  it("refuses an edge to a node that is neither in the blueprint nor on the canvas", async () => {
    seed([node("g-1", "generator", 0, 0, { model: "openai", aspectRatio: "16x9" })], []);
    const r = await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: {
        nodes: [{ id: "p-new", type: "prompt", data: { prompt: "x" } }],
        edges: [
          { source: "p-new", target: "g-1", targetHandle: "prompt-in" },
          { source: "ghost", target: "g-1", targetHandle: "sketch-in" },
        ],
      },
    });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("ghost");
    expect(persisted().nodes).toHaveLength(1);
  });

  it("refuses an edge to a node removed in the same call", async () => {
    seed(
      [
        node("p-1", "prompt", 0, 0, { prompt: "x" }),
        node("g-1", "generator", 0, 0, { model: "openai", aspectRatio: "16x9" }),
      ],
      [],
    );
    const r = await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: { nodes: [], edges: [{ source: "p-1", target: "g-1", targetHandle: "prompt-in" }] },
      remove_node_ids: ["p-1"],
    });
    expect(r.isError).toBe(true);
  });

  it("checks variant handles against an existing generator's abTest", async () => {
    seed(
      [
        node("g-ab", "generator", 0, 0, { model: "openai", aspectRatio: "16x9", abTest: { variants: ["A", "B"] } }),
        node("g-1", "generator", 0, 400, { model: "openai", aspectRatio: "16x9" }),
      ],
      [],
    );
    const ok = await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: {
        nodes: [{ id: "p-b", type: "prompt", data: { prompt: "B" } }],
        edges: [{ source: "p-b", target: "g-ab", targetHandle: "prompt-in-b" }],
      },
    });
    expect(ok.isError).toBeFalsy();
    const bad = await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: {
        nodes: [{ id: "p-c", type: "prompt", data: { prompt: "B" } }],
        edges: [{ source: "p-c", target: "g-1", targetHandle: "prompt-in-b" }],
      },
    });
    expect(bad.isError).toBe(true);
    expect(text(bad)).toContain("abTest");
  });

  it("writes updated_at as an ISO timestamp", async () => {
    await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: { nodes: [{ id: "p-1", type: "prompt", data: { prompt: "x" } }], edges: [] },
    });
    const { updatedAt } = persisted();
    expect(updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(updatedAt).not.toBe("2026-09-17T08:00:00.000Z");
  });

  it("snapshots the canvas before writing", async () => {
    const before = [node("p-1", "prompt", 0, 0, { prompt: "before" })];
    const beforeEdges: PEdge[] = [];
    seed(before, beforeEdges);
    await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: { nodes: [{ id: "p-1", type: "prompt", data: { prompt: "after" } }], edges: [] },
    });
    const rows = snapshotRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe("apply_workflow");
    expect(JSON.parse(rows[0].nodes)).toEqual(before);
    expect(JSON.parse(rows[0].edges)).toEqual(beforeEdges);
    expect(rows[0].created_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it("does not snapshot (nor write) when the blueprint is invalid", async () => {
    seed([node("p-1", "prompt", 0, 0, { prompt: "x" })], []);
    await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: { nodes: [{ id: "g", type: "generator", data: {} }], edges: [] },
    });
    expect(snapshotRows()).toHaveLength(0);
  });

  it("keeps only the 20 most recent snapshots per project", async () => {
    for (let i = 0; i < 23; i++) {
      await applyWorkflowTool.handler({
        project_id: projectId,
        blueprint: { nodes: [{ id: "p-1", type: "prompt", data: { prompt: `v${i}` } }], edges: [] },
      });
    }
    const rows = snapshotRows();
    expect(rows).toHaveLength(20);
    // The oldest ones were purged: the most recent snapshot holds v21 (state before the v22 write).
    const prompts = rows.map((row) => (JSON.parse(row.nodes) as PNode[])[0]?.data.prompt);
    expect(prompts.at(-1)).toBe("v21");
    expect(prompts).not.toContain("v0");
  });

  it("real 2026-09-17 scenario: a 4-node blueprint on a 14-node canvas deletes nothing", async () => {
    const gen = (id: string, x: number, y: number) =>
      node(id, "generator", x, y, {
        label: "Générateur",
        model: "gemini-3.1-flash-image",
        aspectRatio: "16x9",
        numImages: 2,
        generatedImages: [`/api/generated-images/image?id=${id}-1`, `/api/generated-images/image?id=${id}-2`],
        selectedImageIndex: 0,
      });
    const canvas: PNode[] = [
      node("face-1", "faceReference", 0, 0, { personaId: "p", personaAngles: { front: IMPORTED }, label: "Antoine" }),
      node("logo-1", "swipeFile", 0, 250, { imageBase64: IMPORTED, kind: "logo", label: "Logo" }),
      node("ref-1", "swipeFile", 0, 500, { imageUrl: "/api/swipe-files/image?id=r", kind: "reference" }),
      node("sketch-1", "sketch", 0, 750, { imageBase64: IMPORTED, label: "Sketch IA" }),
      node("prompt-1", "prompt", 0, 1000, { prompt: "Antoine surpris devant un écran" }),
      gen("gen-1", 500, 400),
      node("preview-1", "preview", 1000, 400, { generatedImages: ["/api/generated-images/image?id=gen-1-1"] }),
      node("text-1", "textOverlay", 1500, 400, { overlayText: "INCROYABLE", overlayPosition: "top" }),
      // What Antoine added by hand before asking the agent:
      node("prompt-2", "prompt", 0, 1300, { prompt: "Même scène, fond rouge" }),
      node("import-1", "swipeFile", 0, 1550, { imageBase64: IMPORTED, label: "images (3).png" }),
      gen("gen-2", 500, 1300),
      node("preview-2", "preview", 1000, 1300, { generatedImages: [] }),
      node("sw-2", "swipeFile", 0, 1800, { imageUrl: "/api/swipe-files/image?id=s2", kind: "reference" }),
      node("text-2", "textOverlay", 1500, 1300, { overlayText: "WOW" }),
    ];
    const canvasEdges: PEdge[] = [
      edge("face-1", "gen-1", "face-in"),
      edge("logo-1", "gen-1", "logo-in"),
      edge("ref-1", "gen-1", "ref-in"),
      edge("sketch-1", "gen-1", "sketch-in"),
      edge("prompt-1", "gen-1", "prompt-in"),
      edge("prompt-2", "gen-2", "prompt-in"),
      edge("import-1", "gen-2", "ref-in"),
      edge("face-1", "gen-2", "face-in"),
    ];
    seed(canvas, canvasEdges);

    // What the agent sent: the 4 nodes it had in mind, with the old ids and no image_source.
    const r = await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: {
        nodes: [
          { id: "face-1", type: "faceReference", data: {} },
          { id: "sketch-1", type: "sketch", data: {} },
          { id: "prompt-1", type: "prompt", data: { prompt: "Antoine surpris, lumière dramatique" } },
          { id: "gen-1", type: "generator", data: { model: "nano-banana", aspectRatio: "16x9" } },
        ],
        edges: [
          { source: "face-1", target: "gen-1", targetHandle: "face-in" },
          { source: "sketch-1", target: "gen-1", targetHandle: "sketch-in" },
          { source: "prompt-1", target: "gen-1", targetHandle: "prompt-in" },
        ],
      },
    });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toContain("Applied: 0 created, 4 updated, 0 removed (kept 10 untouched).");

    const { nodes, edges } = persisted();
    expect(nodes).toHaveLength(14);
    expect(nodes.map((n) => n.id)).toEqual(canvas.map((n) => n.id));
    for (const original of canvas) {
      const now = nodes.find((n) => n.id === original.id)!;
      expect(now.position).toEqual(original.position);
      if (original.id !== "prompt-1") expect(now.data).toEqual(original.data);
    }
    expect(nodes.find((n) => n.id === "prompt-1")!.data.prompt).toBe("Antoine surpris, lumière dramatique");
    expect(edges.map((e) => e.id).sort()).toEqual(canvasEdges.map((e) => e.id).sort());
  });
});
