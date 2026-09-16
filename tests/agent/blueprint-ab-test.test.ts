import { describe, it, expect } from "vitest";
import { BlueprintSchema } from "@/lib/agent/blueprint/schema";

const prompt = (id: string) => ({ id, type: "prompt", data: { prompt: id } });
const generator = (data: Record<string, unknown> = {}) => ({
  id: "gen",
  type: "generator",
  data: { model: "nano-banana", aspectRatio: "16x9", ...data },
});

function issues(blueprint: unknown): string[] {
  const result = BlueprintSchema.safeParse(blueprint);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe("Blueprint — generator A/B/C test", () => {
  it.each([[["A", "B"]], [["A", "B", "C"]]])("accepts abTest.variants %j and keeps it in data", (variants) => {
    const result = BlueprintSchema.safeParse({ nodes: [generator({ abTest: { variants } })], edges: [] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.nodes[0].data.abTest).toEqual({ variants });
  });

  it("accepts abTest flattened on the node", () => {
    const result = BlueprintSchema.safeParse({
      nodes: [{ id: "gen", type: "generator", model: "nano-banana", aspectRatio: "16x9", abTest: { variants: ["A", "B"] } }],
      edges: [],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.nodes[0].data.abTest).toEqual({ variants: ["A", "B"] });
  });

  it.each([[["A"]], [["A", "C"]], [["B", "A"]], [["A", "B", "C", "D"]]])("rejects abTest.variants %j", (variants) => {
    expect(BlueprintSchema.safeParse({ nodes: [generator({ abTest: { variants } })], edges: [] }).success).toBe(false);
  });

  it("accepts per-variant edges when their variant is active", () => {
    const blueprint = {
      nodes: [prompt("pA"), prompt("pB"), prompt("pC"), generator({ abTest: { variants: ["A", "B", "C"] } })],
      edges: [
        { source: "pA", target: "gen", targetHandle: "prompt-in" },
        { source: "pB", target: "gen", targetHandle: "prompt-in-b" },
        { source: "pC", target: "gen", targetHandle: "prompt-in-c" },
      ],
    };
    expect(issues(blueprint)).toEqual([]);
  });

  it("rejects an edge to prompt-in-c when C is not active, with an explicit message", () => {
    const blueprint = {
      nodes: [prompt("pC"), generator({ abTest: { variants: ["A", "B"] } })],
      edges: [{ source: "pC", target: "gen", targetHandle: "prompt-in-c" }],
    };
    expect(issues(blueprint)).toEqual([
      'Edge to "prompt-in-c" needs variant C active on generator "gen": set its data.abTest = { variants: ["A","B","C"] }, or connect to "prompt-in".',
    ]);
  });

  it("rejects a B handle on a generator without abTest", () => {
    const blueprint = {
      nodes: [prompt("pB"), generator()],
      edges: [{ source: "pB", target: "gen", targetHandle: "sketch-in-b" }],
    };
    expect(issues(blueprint)).toEqual([
      'Edge to "sketch-in-b" needs variant B active on generator "gen": set its data.abTest = { variants: ["A","B"] }, or connect to "sketch-in".',
    ]);
  });

  it("rejects a variant handle on a node that is not a generator", () => {
    const blueprint = {
      nodes: [prompt("p1"), prompt("p2")],
      edges: [{ source: "p1", target: "p2", targetHandle: "ref-in-b" }],
    };
    expect(issues(blueprint)).toEqual([
      'Handle "ref-in-b" only exists on generator nodes; node "p2" is a prompt. Use "ref-in" instead.',
    ]);
  });

  it("still accepts a normal generator wired on A's handles", () => {
    const blueprint = {
      nodes: [prompt("p1"), generator()],
      edges: [{ source: "p1", target: "gen", targetHandle: "prompt-in" }],
    };
    expect(issues(blueprint)).toEqual([]);
  });
});
