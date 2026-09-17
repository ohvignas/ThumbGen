import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

// Promoted from Task 5: pins that setGeneratorVariants participates in undo
// history and autosave like every other store mutation, once the canvas is
// loaded — not just the edge/abTest bookkeeping covered above.
describe("canvas store — generator variants — undo/autosave", () => {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, json: async () => ({}) }));

  const abGenerator: AppNode = { id: "gen", type: "generator", position: at, data: { model: "gpt-image-2", abTest: { variants: ["A", "B"] } } };
  const pB: AppNode = { id: "pB", type: "prompt", position: at, data: { prompt: "B" } };
  const edgeB: Edge = { id: "e-pB", source: "pB", target: "gen", targetHandle: "prompt-in-b" };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchMock);
    const nodes = structuredClone([abGenerator, pB]);
    const edges = structuredClone([edgeB]);
    useCanvasStore.setState({
      nodes,
      edges,
      loaded: true,
      saving: false,
      dirty: false,
      recentOwnSaveUpdatedAts: [],
      currentProjectId: "variants-undo-test",
      history: [{ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }],
      historyIndex: 0,
      nodePicker: null,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fetchMock.mockClear();
  });

  it("pins one history snapshot 300ms after removing B, autosaves the removal, and undo still restores abTest + the B edge", async () => {
    useCanvasStore.getState().setGeneratorVariants("gen", ["A"]);

    await vi.advanceTimersByTimeAsync(300);
    const { history, historyIndex } = useCanvasStore.getState();
    expect(historyIndex).toBe(1);
    const removalSnapshot = history[historyIndex];
    expect(removalSnapshot.nodes.find((n) => n.id === "gen")!.data.abTest).toBeUndefined();
    expect(removalSnapshot.edges.some((e) => e.targetHandle === "prompt-in-b")).toBe(false);

    // Completes the 2000ms autosave debounce started by setGeneratorVariants.
    await vi.advanceTimersByTimeAsync(1700);
    const save = fetchMock.mock.calls.find(([url, init]) => url === "/api/project" && init?.method === "POST");
    expect(save).toBeDefined();
    const savedGen = JSON.parse(String(save![1]!.body)).nodes.find((n: { id: string }) => n.id === "gen");
    expect(savedGen.data.abTest).toBeUndefined();

    useCanvasStore.getState().undo();
    const restored = useCanvasStore.getState();
    expect(restored.nodes.find((n) => n.id === "gen")!.data.abTest).toEqual({ variants: ["A", "B"] });
    expect(restored.edges.some((e) => e.targetHandle === "prompt-in-b")).toBe(true);
  });
});
