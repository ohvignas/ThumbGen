import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Edge } from "@xyflow/react";
import { useCanvasStore, type AppNode } from "@/store/canvas-store";

const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, json: async () => ({}) }));

function seed(nodes: AppNode[], edges: Edge[] = []) {
  useCanvasStore.setState({
    nodes,
    edges,
    loaded: true,
    saving: false,
    dirty: false,
    currentProjectId: "store-test",
    history: [{ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }],
    historyIndex: 0,
    nodePicker: null,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
  seed([]);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockClear();
});

describe("node picker state", () => {
  it("starts closed, opens with the given state and closes", () => {
    expect(useCanvasStore.getState().nodePicker).toBeNull();

    useCanvasStore.getState().openNodePicker({ mode: "free", flowPos: { x: 10, y: 20 } });
    expect(useCanvasStore.getState().nodePicker).toEqual({ mode: "free", flowPos: { x: 10, y: 20 } });

    const connect = {
      mode: "connect" as const,
      from: { nodeId: "gen", handleId: "logo-in", handleType: "target" as const },
    };
    useCanvasStore.getState().openNodePicker(connect);
    expect(useCanvasStore.getState().nodePicker).toEqual(connect);

    useCanvasStore.getState().closeNodePicker();
    expect(useCanvasStore.getState().nodePicker).toBeNull();
  });
});

describe("duplicateNode", () => {
  const generator: AppNode = {
    id: "gen",
    type: "generator",
    position: { x: 100, y: 200 },
    data: { model: "gemini-3.1-flash-image", isGenerating: true, generatedImages: ["/img/a.png"] },
  };
  const prompt: AppNode = { id: "p", type: "prompt", position: { x: 0, y: 0 }, data: { prompt: "hello" } };
  const edge: Edge = { id: "e1", source: "p", target: "gen", targetHandle: "prompt-in" };

  it("adds a copy with a new id, offset by +40/+40, without isGenerating and without edges", () => {
    seed([generator, prompt], [edge]);

    const newId = useCanvasStore.getState().duplicateNode("gen");
    const { nodes, edges } = useCanvasStore.getState();

    expect(newId).toBeTruthy();
    expect(newId).not.toBe("gen");
    expect(nodes).toHaveLength(3);
    const copy = nodes.find((n) => n.id === newId)!;
    expect(copy.type).toBe("generator");
    expect(copy.position).toEqual({ x: 140, y: 240 });
    expect(copy.data.model).toBe("gemini-3.1-flash-image");
    expect("isGenerating" in copy.data).toBe(false);
    expect(copy.data.generatedImages).toEqual(["/img/a.png"]);
    expect(edges).toEqual([edge]);
  });

  it("deep-clones data so editing the copy leaves the original untouched", () => {
    seed([generator]);
    const newId = useCanvasStore.getState().duplicateNode("gen");
    const copy = useCanvasStore.getState().nodes.find((n) => n.id === newId)!;
    copy.data.generatedImages!.push("/img/b.png");
    const original = useCanvasStore.getState().nodes.find((n) => n.id === "gen")!;
    expect(original.data.generatedImages).toEqual(["/img/a.png"]);
  });

  it("records the duplication in the undo history", () => {
    seed([generator]);
    useCanvasStore.getState().duplicateNode("gen");
    vi.advanceTimersByTime(300);
    const { history, historyIndex } = useCanvasStore.getState();
    expect(historyIndex).toBe(1);
    expect(history[historyIndex].nodes).toHaveLength(2);
    expect(useCanvasStore.getState().dirty).toBe(true);
  });

  it("returns an empty string and changes nothing for an unknown id", () => {
    seed([generator]);
    expect(useCanvasStore.getState().duplicateNode("missing")).toBe("");
    expect(useCanvasStore.getState().nodes).toHaveLength(1);
  });
});

describe("setAllSelected", () => {
  it("selects every node, then clears nodes and edges, without touching history", () => {
    seed(
      [
        { id: "a", type: "prompt", position: { x: 0, y: 0 }, data: {} },
        { id: "b", type: "prompt", position: { x: 0, y: 100 }, data: {}, selected: true },
      ],
      [{ id: "e", source: "a", target: "b", selected: true }],
    );

    useCanvasStore.getState().setAllSelected(true);
    expect(useCanvasStore.getState().nodes.every((n) => n.selected)).toBe(true);

    useCanvasStore.getState().setAllSelected(false);
    expect(useCanvasStore.getState().nodes.some((n) => n.selected)).toBe(false);
    expect(useCanvasStore.getState().edges.some((e) => e.selected)).toBe(false);

    vi.advanceTimersByTime(3000);
    expect(useCanvasStore.getState().history).toHaveLength(1);
  });
});
