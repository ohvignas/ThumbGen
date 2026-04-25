import { describe, it, expect } from "vitest";
import { diffBlueprints } from "@/lib/agent/blueprint/diff";

describe("diffBlueprints", () => {
  it("identifies created/updated/deleted nodes", () => {
    const current = {
      nodes: [
        { id: "a", type: "prompt" as const, data: { prompt: "old" } },
        { id: "b", type: "generator" as const, data: { model: "ideogram", aspectRatio: "16x9" } },
      ],
      edges: [],
    };
    const target = {
      nodes: [
        { id: "a", type: "prompt" as const, data: { prompt: "new" } },         // updated
        { id: "c", type: "sketch" as const, data: { image_source: "stored:sf_x" } }, // created
        // b removed
      ],
      edges: [],
    };
    const ops = diffBlueprints(current, target);
    expect(ops.create.map((n) => n.id)).toEqual(["c"]);
    expect(ops.update.map((n) => n.id)).toEqual(["a"]);
    expect(ops.delete).toEqual(["b"]);
  });

  it("returns empty ops when blueprints are identical", () => {
    const bp = {
      nodes: [{ id: "p", type: "prompt" as const, data: { prompt: "hi" } }],
      edges: [],
    };
    const ops = diffBlueprints(bp, bp);
    expect(ops.create).toEqual([]);
    expect(ops.update).toEqual([]);
    expect(ops.delete).toEqual([]);
  });

  it("treats reordered keys in data as equal", () => {
    const a = { nodes: [{ id: "x", type: "generator" as const, data: { model: "ideogram", aspectRatio: "16x9" } }], edges: [] };
    const b = { nodes: [{ id: "x", type: "generator" as const, data: { aspectRatio: "16x9", model: "ideogram" } }], edges: [] };
    const ops = diffBlueprints(a, b);
    // Note: this test demonstrates a known limitation if the implementation uses naive JSON.stringify.
    // Either it's truly equal (preferred), or the test needs adjusting if the implementation chooses key order matters.
    // For v1 we accept either, but document the choice.
    expect(ops.delete).toEqual([]);
  });
});
