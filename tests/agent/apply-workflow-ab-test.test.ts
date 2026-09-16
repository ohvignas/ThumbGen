import { describe, it, expect, beforeEach } from "vitest";
import { applyWorkflowTool } from "@/lib/agent/tools/apply-workflow";
import { getDb } from "@/lib/db";

describe("apply_workflow — generator A/B/C test", () => {
  const projectId = "test-apply-workflow-ab";

  beforeEach(() => {
    getDb().prepare("INSERT OR REPLACE INTO projects (id, nodes, edges) VALUES (?, ?, ?)").run(projectId, "[]", "[]");
  });

  function persisted() {
    const row = getDb().prepare("SELECT nodes, edges FROM projects WHERE id = ?").get(projectId) as {
      nodes: string;
      edges: string;
    };
    return {
      nodes: JSON.parse(row.nodes) as Array<{ id: string; data: Record<string, unknown> }>,
      edges: JSON.parse(row.edges) as Array<{ source: string; targetHandle: string }>,
    };
  }

  it("copies abTest onto the canvas generator and keeps the variant edges", async () => {
    const blueprint = {
      nodes: [
        { id: "prompt-a", type: "prompt", data: { prompt: "Angle choc" } },
        { id: "prompt-b", type: "prompt", data: { prompt: "Angle démo" } },
        { id: "gen", type: "generator", data: { model: "nano-banana", aspectRatio: "16x9", abTest: { variants: ["A", "B"] } } },
      ],
      edges: [
        { source: "prompt-a", target: "gen", targetHandle: "prompt-in" },
        { source: "prompt-b", target: "gen", targetHandle: "prompt-in-b" },
      ],
    };
    const result = await applyWorkflowTool.handler({ project_id: projectId, blueprint });
    expect(result.isError).toBeFalsy();
    const { nodes, edges } = persisted();
    expect(nodes.find((n) => n.id === "gen")?.data.abTest).toEqual({ variants: ["A", "B"] });
    expect(edges.map((e) => [e.source, e.targetHandle])).toEqual([
      ["prompt-a", "prompt-in"],
      ["prompt-b", "prompt-in-b"],
    ]);
  });

  it("does not add abTest to a normal generator", async () => {
    const blueprint = {
      nodes: [{ id: "gen", type: "generator", data: { model: "openai", aspectRatio: "16x9" } }],
      edges: [],
    };
    await applyWorkflowTool.handler({ project_id: projectId, blueprint });
    expect(persisted().nodes[0].data).not.toHaveProperty("abTest");
  });

  it("refuses an edge to prompt-in-c when variant C is not active, and writes nothing", async () => {
    const blueprint = {
      nodes: [
        { id: "prompt-c", type: "prompt", data: { prompt: "Angle trois" } },
        { id: "gen", type: "generator", data: { model: "nano-banana", aspectRatio: "16x9", abTest: { variants: ["A", "B"] } } },
      ],
      edges: [{ source: "prompt-c", target: "gen", targetHandle: "prompt-in-c" }],
    };
    const result = await applyWorkflowTool.handler({ project_id: projectId, blueprint });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("prompt-in-c");
    expect(text).toContain("abTest");
    expect(persisted().nodes).toEqual([]);
  });
});
