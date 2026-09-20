import { describe, it, expect, beforeAll } from "vitest";
import { getCanvasStateTool } from "@/lib/agent/tools/get-canvas-state";
import { getDb } from "@/lib/db";

describe("get_canvas_state", () => {
  const projectId = "test-canvas-state";

  beforeAll(() => {
    getDb()
      .prepare("INSERT OR REPLACE INTO projects (id, nodes, edges) VALUES (?, ?, ?)")
      .run(
        projectId,
        JSON.stringify([
          { id: "p-1", type: "prompt", data: { prompt: "hello world", negativePrompt: "blur" } },
          { id: "g-1", type: "generator", data: { model: "openai", aspectRatio: "16x9", count: 4 } },
          {
            id: "f-1",
            type: "faceReference",
            data: { personaId: "abc", personaAngles: { front: "data:image/png;base64,AAAA" }, label: "Antoine" },
          },
          { id: "s-1", type: "swipeFile", data: { imageBase64: "data:image/png;base64,BBBB", label: "Brand", kind: "logo" } },
        ]),
        JSON.stringify([
          { source: "p-1", target: "g-1", targetHandle: "prompt-in" },
          { source: "f-1", target: "g-1", targetHandle: "face-in" },
          { source: "s-1", target: "g-1", targetHandle: "logo-in" },
        ]),
      );
  });

  it("returns blueprint with all nodes and edges", async () => {
    const r = await getCanvasStateTool.handler({ project_id: projectId });
    const parsed = JSON.parse((r.content[0] as { text: string }).text);
    expect(parsed.nodes).toHaveLength(4);
    expect(parsed.edges).toHaveLength(3);
  });

  it("strips binary image data from node summaries", async () => {
    const r = await getCanvasStateTool.handler({ project_id: projectId });
    const text = (r.content[0] as { text: string }).text;
    expect(text).not.toContain("AAAA");
    expect(text).not.toContain("BBBB");
    const parsed = JSON.parse(text);
    const swipe = parsed.nodes.find((n: { id: string }) => n.id === "s-1");
    expect(swipe.summary).toMatchObject({ hasImage: true, label: "Brand", kind: "logo" });
  });

  it("summarises a Personnage by its persona reference", async () => {
    const r = await getCanvasStateTool.handler({ project_id: projectId });
    const parsed = JSON.parse((r.content[0] as { text: string }).text);
    const face = parsed.nodes.find((n: { id: string }) => n.id === "f-1");
    expect(face.summary).toEqual({ persona: "stored:persona_abc", label: "Antoine" });
  });

  it("preserves prompt content in summary", async () => {
    const r = await getCanvasStateTool.handler({ project_id: projectId });
    const parsed = JSON.parse((r.content[0] as { text: string }).text);
    const prompt = parsed.nodes.find((n: { id: string }) => n.id === "p-1");
    expect(prompt.summary.prompt).toBe("hello world");
    expect(prompt.summary.negativePrompt).toBe("blur");
  });

  it("preserves generator config in summary", async () => {
    const r = await getCanvasStateTool.handler({ project_id: projectId });
    const parsed = JSON.parse((r.content[0] as { text: string }).text);
    const gen = parsed.nodes.find((n: { id: string }) => n.id === "g-1");
    expect(gen.summary).toMatchObject({ model: "openai", aspectRatio: "16x9", count: 4 });
  });

  it("returns empty blueprint for unknown project", async () => {
    const r = await getCanvasStateTool.handler({ project_id: "does-not-exist" });
    const parsed = JSON.parse((r.content[0] as { text: string }).text);
    expect(parsed.nodes).toEqual([]);
    expect(parsed.edges).toEqual([]);
    expect(parsed.liveSketchCount).toBe(0);
  });

  it("reports liveSketchCount and omits tombstoned sketch nodes", async () => {
    const projectId = "test-canvas-state-tombs";
    getDb()
      .prepare("INSERT OR REPLACE INTO projects (id, nodes, edges) VALUES (?, ?, '[]')")
      .run(
        projectId,
        JSON.stringify([
          { id: "sketch-live", type: "sketch", data: { label: "Live" } },
          { id: "sketch-dead", type: "sketch", data: { label: "Dead" } },
          { id: "p-keep", type: "prompt", data: { prompt: "ok" } },
        ]),
      );
    getDb()
      .prepare("INSERT OR REPLACE INTO canvas_tombstones (project_id, kind, item_id, deleted_at) VALUES (?, 'node', ?, ?)")
      .run(projectId, "sketch-dead", new Date().toISOString());
    const r = await getCanvasStateTool.handler({ project_id: projectId });
    const parsed = JSON.parse((r.content[0] as { text: string }).text) as {
      nodes: Array<{ id: string }>;
      liveSketchCount: number;
    };
    expect(parsed.nodes.map((n) => n.id)).toEqual(["sketch-live", "p-keep"]);
    expect(parsed.liveSketchCount).toBe(1);
  });
});
