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
          { id: "g-1", type: "generator", data: { model: "ideogram", aspectRatio: "16x9", count: 4 } },
          { id: "f-1", type: "faceReference", data: { imageBase64: "AAAA", label: "Excited" } },
        ]),
        JSON.stringify([
          { source: "p-1", target: "g-1", targetHandle: "prompt-in" },
          { source: "f-1", target: "g-1", targetHandle: "face-in" },
        ])
      );
  });

  it("returns blueprint with all nodes and edges", async () => {
    const r = await getCanvasStateTool.handler({ project_id: projectId });
    const text = (r.content[0] as { text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed.nodes).toHaveLength(3);
    expect(parsed.edges).toHaveLength(2);
  });

  it("strips binary image data from node summaries", async () => {
    const r = await getCanvasStateTool.handler({ project_id: projectId });
    const text = (r.content[0] as { text: string }).text;
    expect(text).not.toContain("AAAA");
    const parsed = JSON.parse(text);
    const face = parsed.nodes.find((n: { id: string }) => n.id === "f-1");
    expect(face.summary.hasImage).toBe(true);
    expect(face.summary.label).toBe("Excited");
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
    expect(gen.summary).toMatchObject({ model: "ideogram", aspectRatio: "16x9", count: 4 });
  });

  it("returns empty blueprint for unknown project", async () => {
    const r = await getCanvasStateTool.handler({ project_id: "does-not-exist" });
    const parsed = JSON.parse((r.content[0] as { text: string }).text);
    expect(parsed.nodes).toEqual([]);
    expect(parsed.edges).toEqual([]);
  });
});
