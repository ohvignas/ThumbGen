import { beforeEach, describe, expect, it } from "vitest";
import type { Edge } from "@xyflow/react";
import { useCanvasStore, type AppNode } from "@/store/canvas-store";

const at = { x: 0, y: 0 };

const NODES: AppNode[] = [
  { id: "gen", type: "generator", position: at, data: { model: "gpt-image-2", abTest: { variants: ["A", "B", "C"] } } },
  { id: "pA", type: "prompt", position: at, data: { prompt: "A" } },
  { id: "pB", type: "prompt", position: at, data: { prompt: "B" } },
  { id: "pC", type: "prompt", position: at, data: { prompt: "C" } },
  { id: "face", type: "faceReference", position: at, data: {} },
  { id: "prevB", type: "preview", position: at, data: {} },
];

const EDGES: Edge[] = [
  { id: "e-pA", source: "pA", target: "gen", targetHandle: "prompt-in" },
  { id: "e-pB", source: "pB", target: "gen", targetHandle: "prompt-in-b" },
  { id: "e-pC", source: "pC", target: "gen", targetHandle: "prompt-in-c" },
  { id: "e-face", source: "face", target: "gen", targetHandle: "face-in" },
  { id: "e-prevB", source: "gen", sourceHandle: "result-b", target: "prevB", targetHandle: "preview-in" },
];

// loaded: false keeps history snapshots and autosave (fetch) out of these tests.
beforeEach(() => {
  useCanvasStore.setState({ nodes: structuredClone(NODES), edges: structuredClone(EDGES), loaded: false });
});

const generator = () => useCanvasStore.getState().nodes.find((n) => n.id === "gen")!;
const edgeIds = () => useCanvasStore.getState().edges.map((e) => e.id);

describe("canvas store — generator variants", () => {
  it("getVariantInputs resolves a variant with the shared Personnage", () => {
    const b = useCanvasStore.getState().getVariantInputs("gen", "B");
    expect(b.prompt.nodes.map((n) => n.id)).toEqual(["pB"]);
    expect(b.prompt.inherited).toBe(false);
    expect(b.face.map((n) => n.id)).toEqual(["face"]);
  });

  it("removing C keeps A and B and drops C's edges", () => {
    useCanvasStore.getState().setGeneratorVariants("gen", ["A", "B"]);
    expect(generator().data.abTest).toEqual({ variants: ["A", "B"] });
    expect(edgeIds()).toEqual(["e-pA", "e-pB", "e-face", "e-prevB"]);
  });

  it("disabling the test clears abTest and drops every B and C edge", () => {
    useCanvasStore.getState().setGeneratorVariants("gen", ["A"]);
    expect(generator().data.abTest).toBeUndefined();
    expect(edgeIds()).toEqual(["e-pA", "e-face"]);
  });

  it("enabling the test on a normal generator only adds abTest", () => {
    useCanvasStore.setState({
      nodes: [{ id: "gen", type: "generator", position: at, data: { model: "gpt-image-2" } }, structuredClone(NODES[1])],
      edges: [structuredClone(EDGES[0])],
    });
    useCanvasStore.getState().setGeneratorVariants("gen", ["A", "B"]);
    expect(generator().data.abTest).toEqual({ variants: ["A", "B"] });
    expect(generator().data.model).toBe("gpt-image-2");
    expect(edgeIds()).toEqual(["e-pA"]);
  });
});
