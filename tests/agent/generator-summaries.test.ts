import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "@/lib/db";
import { getCanvasStateTool } from "@/lib/agent/tools/get-canvas-state";
import { snapshotCanvas, summarizeNode } from "@/components/panels/chat/canvas-snapshot";

describe("generator summaries expose the A/B/C test", () => {
  const projectId = "test-generator-summaries";

  beforeAll(() => {
    getDb()
      .prepare("INSERT OR REPLACE INTO projects (id, nodes, edges) VALUES (?, ?, ?)")
      .run(
        projectId,
        JSON.stringify([
          {
            id: "g-ab",
            type: "generator",
            data: { model: "gpt-image-2", aspectRatio: "16x9", numImages: 2, abTest: { variants: ["A", "B", "C"] } },
          },
          { id: "g-plain", type: "generator", data: { model: "gpt-image-2", aspectRatio: "16x9", numImages: 1 } },
          { id: "p-b", type: "prompt", data: { prompt: "B" } },
        ]),
        JSON.stringify([{ source: "p-b", target: "g-ab", targetHandle: "prompt-in-b" }]),
      );
  });

  async function canvasState() {
    const result = await getCanvasStateTool.handler({ project_id: projectId });
    return JSON.parse((result.content[0] as { text: string }).text) as {
      nodes: Array<{ id: string; summary: Record<string, unknown> }>;
      edges: Array<{ targetHandle?: string }>;
    };
  }

  it("get_canvas_state reports abTest.variants and the image count of an A/B/C generator", async () => {
    const state = await canvasState();
    expect(state.nodes.find((n) => n.id === "g-ab")?.summary).toEqual({
      model: "gpt-image-2",
      aspectRatio: "16x9",
      count: 2,
      abTest: { variants: ["A", "B", "C"] },
    });
    expect(state.edges[0].targetHandle).toBe("prompt-in-b");
  });

  it("get_canvas_state leaves abTest out for a normal generator", async () => {
    const state = await canvasState();
    expect(state.nodes.find((n) => n.id === "g-plain")?.summary).not.toHaveProperty("abTest");
  });

  it("the chat snapshot summarizes abTest the same way", () => {
    expect(
      summarizeNode("generator", { model: "m", aspectRatio: "16x9", numImages: 1, abTest: { variants: ["A", "B"] } }),
    ).toEqual({ model: "m", aspectRatio: "16x9", count: 1, abTest: { variants: ["A", "B"] } });
    expect(summarizeNode("generator", { model: "m", abTest: { variants: ["A"] } }).abTest).toBeUndefined();
  });

  it("the chat snapshot keeps variant target handles", () => {
    const snapshot = snapshotCanvas(
      [{ id: "g", type: "generator", data: { abTest: { variants: ["A", "B"] } } }],
      [{ source: "p", target: "g", targetHandle: "prompt-in-b" }],
    ) as { edges: Array<{ targetHandle?: string | null }> };
    expect(snapshot.edges[0].targetHandle).toBe("prompt-in-b");
  });
});
