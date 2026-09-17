import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Edge } from "@xyflow/react";
import { useCanvasStore, type AppNode } from "@/store/canvas-store";
import { createProjectSyncPoller } from "@/hooks/useCanvasSync";
import { shouldApplyCanvasPatch, type CanvasPatchEdge, type CanvasPatchNode } from "@/lib/canvas/canvas-patch";

const T0 = "2026-09-17T10:00:00.000Z";
const T1 = "2026-09-17T10:00:01.000Z";
const T2 = "2026-09-17T10:00:02.000Z";

const userNode: AppNode = { id: "user-1", type: "prompt", position: { x: 0, y: 0 }, data: { prompt: "Mon idée" } };
const prompt: CanvasPatchNode = { id: "iv-prompt", type: "prompt", position: { x: 620, y: 0 }, data: { prompt: "Premier jet", placedByAgentAt: T1 } };
const generator: CanvasPatchNode = { id: "iv-generator", type: "generator", position: { x: 1040, y: 0 }, data: { model: "gemini-3.1-flash-image", placedByAgentAt: T2 } };
const promptEdge: CanvasPatchEdge = { id: "e-1", source: "iv-prompt", target: "iv-generator", sourceHandle: null, targetHandle: "prompt-in" };

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>();

function seed(nodes: AppNode[], edges: Edge[] = [], knownUpdatedAt: string | null = T0) {
  useCanvasStore.setState({
    nodes,
    edges,
    loaded: true,
    saving: false,
    dirty: false,
    recentOwnSaveUpdatedAts: [],
    knownUpdatedAt,
    currentProjectId: "patch-test",
    history: [{ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }],
    historyIndex: 0,
    nodePicker: null,
  });
}

const posts = () => fetchMock.mock.calls.filter(([url, init]) => url === "/api/project" && init?.method === "POST");

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({}) }));
  seed([userNode]);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("loadProject", () => {
  it("remembers the canvas updatedAt", async () => {
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ nodes: [userNode], edges: [], updatedAt: T1 }) }));
    useCanvasStore.setState({ loaded: false, knownUpdatedAt: null });
    await useCanvasStore.getState().loadProject("patch-test");
    expect(useCanvasStore.getState().knownUpdatedAt).toBe(T1);
  });
});

describe("applyAgentPatch", () => {
  it("adds the node and edges as one history entry, without dirty or save", async () => {
    useCanvasStore.getState().applyAgentPatch(prompt, [], T1);
    useCanvasStore.getState().applyAgentPatch(generator, [promptEdge], T2);
    const state = useCanvasStore.getState();
    expect(state.nodes.map((n) => n.id)).toEqual(["user-1", "iv-prompt", "iv-generator"]);
    expect(state.edges).toEqual([promptEdge]);
    expect(state.dirty).toBe(false);
    expect(state.knownUpdatedAt).toBe(T2);
    expect(state.recentOwnSaveUpdatedAts).toEqual([T1, T2]);

    await vi.advanceTimersByTimeAsync(300);
    expect(useCanvasStore.getState().history).toHaveLength(2);
    expect(useCanvasStore.getState().historyIndex).toBe(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(posts()).toHaveLength(0);
  });

  it("merges an update into the local node and keeps its position", () => {
    useCanvasStore.getState().applyAgentPatch(prompt, [], T1);
    useCanvasStore.setState({
      nodes: useCanvasStore.getState().nodes.map((n) => (n.id === "iv-prompt" ? { ...n, position: { x: 5, y: 6 }, data: { ...n.data, negativePrompt: "flou" } } : n)),
    });
    useCanvasStore.getState().applyAgentPatch({ ...prompt, position: { x: 620, y: 0 }, data: { prompt: "Texte", placedByAgentAt: T2 } }, [], T2);
    const node = useCanvasStore.getState().nodes.find((n) => n.id === "iv-prompt")!;
    expect(node.position).toEqual({ x: 5, y: 6 });
    expect(node.data).toMatchObject({ prompt: "Texte", negativePrompt: "flou", placedByAgentAt: T2 });
  });

  it("ignores duplicate edges and does nothing before the canvas is loaded", () => {
    seed([userNode], [{ id: "mine", source: "iv-prompt", target: "iv-generator", sourceHandle: null, targetHandle: "prompt-in" }]);
    useCanvasStore.getState().applyAgentPatch(generator, [promptEdge], T2);
    expect(useCanvasStore.getState().edges.map((e) => e.id)).toEqual(["mine"]);

    seed([userNode]);
    useCanvasStore.setState({ loaded: false });
    useCanvasStore.getState().applyAgentPatch(prompt, [], T1);
    expect(useCanvasStore.getState().nodes).toEqual([userNode]);
    expect(useCanvasStore.getState().knownUpdatedAt).toBe(T0);
  });

  it("lets the acceptance rule refuse a replayed patch", () => {
    useCanvasStore.getState().applyAgentPatch(prompt, [], T1);
    const state = useCanvasStore.getState();
    const patch = { projectId: "patch-test", updatedAt: T1, node: prompt, edges: [] };
    expect(shouldApplyCanvasPatch(patch, { openProjectId: state.currentProjectId, loaded: state.loaded, knownUpdatedAt: state.knownUpdatedAt })).toBe(false);
  });
});

describe("saveProject with the known base", () => {
  it("sends the base read when the payload is built and merges reinjected agent nodes", async () => {
    let release: () => void = () => {};
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/project" && init?.method === "POST") {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return {
          ok: true,
          json: async () => ({ success: true, updatedAt: T2, reinjected: [prompt], reinjectedEdges: [] }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    const saving = useCanvasStore.getState().saveProject();
    await vi.advanceTimersByTimeAsync(0);
    expect(JSON.parse(String(posts()[0][1]!.body))).toMatchObject({ projectId: "patch-test", baseUpdatedAt: T0 });
    // A patch lands while the save is in flight: the base already sent stays T0.
    useCanvasStore.getState().applyAgentPatch(prompt, [], T1);
    release();
    await saving;

    const state = useCanvasStore.getState();
    expect(state.nodes.filter((n) => n.id === "iv-prompt")).toHaveLength(1);
    expect(state.knownUpdatedAt).toBe(T2);
    expect(state.dirty).toBe(false);
  });

  it("appends reinjected nodes and edges without a history entry", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      url === "/api/project" && init?.method === "POST"
        ? { ok: true, json: async () => ({ success: true, updatedAt: T2, reinjected: [prompt, generator], reinjectedEdges: [promptEdge] }) }
        : { ok: true, json: async () => ({}) },
    );
    await useCanvasStore.getState().saveProject();
    await vi.advanceTimersByTimeAsync(1000);
    const state = useCanvasStore.getState();
    expect(state.nodes.map((n) => n.id)).toEqual(["user-1", "iv-prompt", "iv-generator"]);
    expect(state.edges).toEqual([promptEdge]);
    expect(state.history).toHaveLength(1);
    expect(state.dirty).toBe(false);
  });

  it("sends no base when none is known", async () => {
    seed([userNode], [], null);
    await useCanvasStore.getState().saveProject();
    expect(JSON.parse(String(posts()[0][1]!.body)).baseUpdatedAt).toBeUndefined();
  });

  it("never merges a save's reinjected nodes into another project opened meanwhile", async () => {
    let release: () => void = () => {};
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/project" && init?.method === "POST") {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return { ok: true, json: async () => ({ success: true, updatedAt: T2, reinjected: [prompt], reinjectedEdges: [] }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    const saving = useCanvasStore.getState().saveProject();
    await vi.advanceTimersByTimeAsync(0);
    useCanvasStore.setState({ currentProjectId: "other", nodes: [], knownUpdatedAt: T0 });
    release();
    await saving;
    expect(useCanvasStore.getState().nodes).toEqual([]);
    expect(useCanvasStore.getState().knownUpdatedAt).toBe(T0);
  });
});

describe("sync poller", () => {
  it("never reloads for the known updatedAt, reloads for an unknown one", async () => {
    let serverUpdatedAt = T0;
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ updated_at: serverUpdatedAt }) }));
    const loadProject = vi.fn(async () => {});
    const poller = createProjectSyncPoller("patch-test", loadProject);
    await poller.tick();

    useCanvasStore.setState({ knownUpdatedAt: T1, recentOwnSaveUpdatedAts: [] });
    serverUpdatedAt = T1;
    await poller.tick();
    expect(loadProject).not.toHaveBeenCalled();

    serverUpdatedAt = T2;
    await poller.tick();
    expect(loadProject).toHaveBeenCalledTimes(1);
  });
});
