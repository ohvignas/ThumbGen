import { describe, it, expect } from "vitest";
import { autoLayout } from "@/lib/agent/tools/_helpers/auto-layout";

describe("autoLayout", () => {
  it("assigns positions to all nodes", () => {
    const nodes = [
      { id: "a", type: "prompt" },
      { id: "b", type: "generator" },
    ];
    const edges = [{ source: "a", target: "b", targetHandle: "prompt-in" }];
    const positioned = autoLayout(nodes, edges);
    expect(positioned).toHaveLength(2);
    positioned.forEach((n) => {
      expect(typeof n.position.x).toBe("number");
      expect(typeof n.position.y).toBe("number");
      expect(Number.isFinite(n.position.x)).toBe(true);
      expect(Number.isFinite(n.position.y)).toBe(true);
    });
    // LR layout: source node should be left of target
    const a = positioned.find((n) => n.id === "a")!;
    const b = positioned.find((n) => n.id === "b")!;
    expect(a.position.x).toBeLessThan(b.position.x);
  });

  it("handles a chain of 4 nodes", () => {
    const nodes = [
      { id: "a", type: "swipeFile" },
      { id: "b", type: "swipeFile" },
      { id: "c", type: "prompt" },
      { id: "d", type: "generator" },
    ];
    const edges = [
      { source: "a", target: "d", targetHandle: "ref-in" },
      { source: "b", target: "d", targetHandle: "ref-in" },
      { source: "c", target: "d", targetHandle: "prompt-in" },
    ];
    const positioned = autoLayout(nodes, edges);
    expect(positioned).toHaveLength(4);
    // generator (d) should be rightmost
    const xs = positioned.map((n) => ({ id: n.id, x: n.position.x }));
    const dX = xs.find((p) => p.id === "d")!.x;
    expect(xs.filter((p) => p.id !== "d").every((p) => p.x < dX)).toBe(true);
  });

  it("handles a single node with no edges", () => {
    const positioned = autoLayout([{ id: "solo", type: "prompt" }], []);
    expect(positioned).toHaveLength(1);
    expect(Number.isFinite(positioned[0].position.x)).toBe(true);
    expect(Number.isFinite(positioned[0].position.y)).toBe(true);
  });

  it("preserves all original node properties", () => {
    const positioned = autoLayout(
      [{ id: "a", type: "prompt", data: { prompt: "hi" } }],
      []
    );
    expect(positioned[0]).toMatchObject({ id: "a", type: "prompt", data: { prompt: "hi" } });
  });
});
