import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import type { Edge } from "@xyflow/react";
import { useCanvasStore, type AppNode } from "@/store/canvas-store";
import { createProjectSyncPoller } from "@/hooks/useCanvasSync";
import { shouldApplyCanvasPatch, type CanvasPatch, type CanvasPatchEdge, type CanvasPatchNode, type CanvasWorkflowPatch } from "@/lib/canvas/canvas-patch";

const T0 = "2026-09-17T10:00:00.000Z";
const T1 = "2026-09-17T10:00:01.000Z";
const T2 = "2026-09-17T10:00:02.000Z";
const T3 = "2026-09-17T10:00:03.000Z";

const userNode: AppNode = { id: "user-1", type: "prompt", position: { x: 0, y: 0 }, data: { prompt: "Mon idée" } };
const prompt: CanvasPatchNode = { id: "iv-prompt", type: "prompt", position: { x: 620, y: 0 }, data: { prompt: "Premier jet", placedByAgentAt: T1 } };
const generator: CanvasPatchNode = { id: "iv-generator", type: "generator", position: { x: 1040, y: 0 }, data: { model: "gemini-3.1-flash-image", placedByAgentAt: T2 } };
const promptEdge: CanvasPatchEdge = { id: "e-1", source: "iv-prompt", target: "iv-generator", sourceHandle: null, targetHandle: "prompt-in" };

const PREVIOUS: Record<string, string> = { [T1]: T0, [T2]: T1, [T3]: T2 };
const created = (node: CanvasPatchNode, updatedAt: string, edges: CanvasPatchEdge[] = []): CanvasPatch => ({
  projectId: "patch-test",
  updatedAt,
  previousUpdatedAt: PREVIOUS[updatedAt] ?? T0,
  created: true,
  node,
  removedDataKeys: [],
  edges,
});
const updated = (node: CanvasPatchNode, updatedAt: string, removedDataKeys: string[] = []): CanvasPatch => ({
  ...created(node, updatedAt),
  created: false,
  removedDataKeys,
});

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>();

function seed(nodes: AppNode[], edges: Edge[] = [], knownUpdatedAt: string | null = T0) {
  useCanvasStore.setState({
    nodes,
    edges,
    loaded: true,
    loading: false,
    saving: false,
    dirty: false,
    recentOwnSaveUpdatedAts: [],
    knownUpdatedAt,
    deletedNodeIds: [],
    deletedEdgeIds: [],
    currentProjectId: "patch-test",
    history: [{ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }],
    historyIndex: 0,
    nodePicker: null,
  });
}

const posts = () => fetchMock.mock.calls.filter(([url, init]) => url === "/api/project" && init?.method === "POST");
const saveAnswer = (body: Record<string, unknown>) =>
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
    url === "/api/project" && init?.method === "POST"
      ? { ok: true, json: async () => ({ success: true, reinjected: [], reinjectedEdges: [], refreshed: [], ...body }) }
      : { ok: true, json: async () => ({}) },
  );

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
    expect(useCanvasStore.getState().loading).toBe(false);
  });

  it("replays the patches applied during the load that are newer than the loaded canvas", async () => {
    let answer: (value: unknown) => void = () => {};
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    useCanvasStore.setState({ loaded: false, knownUpdatedAt: null });
    const loading = useCanvasStore.getState().loadProject("patch-test");
    const state = useCanvasStore.getState();
    const patch = created(generator, T2);
    expect(shouldApplyCanvasPatch(patch, { openProjectId: "patch-test", loaded: state.loaded, loading: state.loading, knownUpdatedAt: state.knownUpdatedAt })).toBe(true);
    state.applyAgentPatch(created(prompt, T1));
    state.applyAgentPatch(patch);
    // The load answers with the prompt already in it (T1), not the generator (T2).
    answer({ ok: true, json: async () => ({ nodes: [userNode, { ...prompt }], edges: [], updatedAt: T1 }) });
    await loading;

    const after = useCanvasStore.getState();
    expect(after.nodes.map((n) => n.id)).toEqual(["user-1", "iv-prompt", "iv-generator"]);
    expect(after.knownUpdatedAt).toBe(T2);
  });

  it("does not fetch a poll reload while the canvas is dirty from adding a generator", async () => {
    useCanvasStore.getState().addNode("generator", { x: 40, y: 20 });
    fetchMock.mockClear();
    await useCanvasStore.getState().loadProject("patch-test", { reason: "poll" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useCanvasStore.getState().nodes.some((n) => n.type === "generator")).toBe(true);
    await vi.advanceTimersByTimeAsync(300);
  });

  it("keeps a generator added while a poll GET is in flight instead of applying the smaller snapshot", async () => {
    let answer: (value: unknown) => void = () => {};
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const loading = useCanvasStore.getState().loadProject("patch-test", { reason: "poll" });
    const generatorId = useCanvasStore.getState().addNode("generator", { x: 80, y: 40 });
    answer({ ok: true, json: async () => ({ nodes: [userNode], edges: [], updatedAt: T0 }) });
    await loading;
    expect(useCanvasStore.getState().nodes.map((n) => n.id)).toContain(generatorId);
    expect(useCanvasStore.getState().dirty).toBe(true);
    await vi.advanceTimersByTimeAsync(300);
  });

  it("does not merge a deleted node back from a poll snapshot", async () => {
    const generator: AppNode = { id: "user-gen-1", type: "generator", position: { x: 80, y: 40 }, data: { model: "nano-banana" } };
    seed([userNode, generator], [], T1);
    useCanvasStore.getState().removeNode("user-gen-1");
    useCanvasStore.setState({ dirty: false, saving: false, loading: false });
    fetchMock.mockImplementation(async (url: string) =>
      String(url).startsWith("/api/project?id=")
        ? { ok: true, json: async () => ({ nodes: [userNode, generator], edges: [], updatedAt: T2 }) }
        : { ok: true, json: async () => ({}) },
    );
    await useCanvasStore.getState().loadProject("patch-test", { reason: "poll" });
    expect(useCanvasStore.getState().nodes.map((n) => n.id)).toEqual(["user-1"]);
    expect(useCanvasStore.getState().deletedNodeIds).toEqual(["user-gen-1"]);
    await vi.advanceTimersByTimeAsync(300);
  });
});

describe("applyAgentPatch", () => {
  it("adds the node and edges as one history entry, without dirty or save", async () => {
    useCanvasStore.getState().applyAgentPatch(created(prompt, T1));
    useCanvasStore.getState().applyAgentPatch(created(generator, T2, [promptEdge]));
    const state = useCanvasStore.getState();
    expect(state.nodes.map((n) => n.id)).toEqual(["user-1", "iv-prompt", "iv-generator"]);
    expect(state.edges).toEqual([promptEdge]);
    expect(state.dirty).toBe(false);
    expect(state.knownUpdatedAt).toBe(T2);
    expect(state.recentOwnSaveUpdatedAts).toEqual([]);

    // One immediate history entry per patch.
    expect(useCanvasStore.getState().history).toHaveLength(3);
    expect(useCanvasStore.getState().historyIndex).toBe(2);
    await vi.advanceTimersByTimeAsync(3000);
    expect(posts()).toHaveLength(0);
  });

  it("merges only the changed fields into the local node, keeps its position and drops removed keys", () => {
    useCanvasStore.getState().applyAgentPatch(created({ ...prompt, data: { ...prompt.data, imageUrl: "/old" } }, T1));
    useCanvasStore.setState({
      nodes: useCanvasStore.getState().nodes.map((n) => (n.id === "iv-prompt" ? { ...n, position: { x: 5, y: 6 }, data: { ...n.data, negativePrompt: "flou" } } : n)),
    });
    useCanvasStore.getState().applyAgentPatch(updated({ ...prompt, data: { prompt: "Texte", placedByAgentAt: T2 } }, T2, ["imageUrl"]));
    const node = useCanvasStore.getState().nodes.find((n) => n.id === "iv-prompt")!;
    expect(node.position).toEqual({ x: 5, y: 6 });
    expect(node.data).toEqual({ prompt: "Texte", negativePrompt: "flou", placedByAgentAt: T2 });
  });

  it("never builds a half node from an update of a node deleted here", () => {
    useCanvasStore.getState().applyAgentPatch(updated({ ...prompt, data: { prompt: "Texte", placedByAgentAt: T1 } }, T1));
    expect(useCanvasStore.getState().nodes.map((n) => n.id)).toEqual(["user-1"]);
    expect(useCanvasStore.getState().knownUpdatedAt).toBe(T1);
  });

  it("ignores duplicate edges and edges to a missing node, and does nothing before the canvas loads", () => {
    seed([userNode], [{ id: "mine", source: "iv-prompt", target: "iv-generator", sourceHandle: null, targetHandle: "prompt-in" }]);
    useCanvasStore.getState().applyAgentPatch(created(generator, T2, [promptEdge]));
    expect(useCanvasStore.getState().edges.map((e) => e.id)).toEqual(["mine"]);

    seed([userNode]);
    useCanvasStore.getState().applyAgentPatch(created(generator, T2, [promptEdge]));
    expect(useCanvasStore.getState().edges).toEqual([]);

    seed([userNode]);
    useCanvasStore.setState({ loaded: false });
    useCanvasStore.getState().applyAgentPatch(created(prompt, T1));
    expect(useCanvasStore.getState().nodes).toEqual([userNode]);
    expect(useCanvasStore.getState().knownUpdatedAt).toBe(T0);
  });

  it("lets the acceptance rule refuse a replayed patch", () => {
    useCanvasStore.getState().applyAgentPatch(created(prompt, T1));
    const state = useCanvasStore.getState();
    expect(
      shouldApplyCanvasPatch(created(prompt, T1), { openProjectId: state.currentProjectId, loaded: state.loaded, knownUpdatedAt: state.knownUpdatedAt }),
    ).toBe(false);
  });
});

describe("applyAgentPatch — projects, missed writes and history", () => {
  it("never applies another project's patch, even while a project loads", async () => {
    const other = { ...created(prompt, T1), projectId: "project-a" };
    useCanvasStore.getState().applyAgentPatch(other);
    expect(useCanvasStore.getState().nodes).toEqual([userNode]);
    expect(useCanvasStore.getState().knownUpdatedAt).toBe(T0);

    // A patch for A arrives while B loads: B never gets it.
    let answer: (value: unknown) => void = () => {};
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    useCanvasStore.setState({ currentProjectId: "project-a" });
    const loading = useCanvasStore.getState().loadProject("project-b");
    useCanvasStore.getState().applyAgentPatch({ ...created(generator, T3), projectId: "project-a" });
    answer({ ok: true, json: async () => ({ nodes: [], edges: [], updatedAt: T1 }) });
    await loading;
    const state = useCanvasStore.getState();
    expect(state.currentProjectId).toBe("project-b");
    expect(state.nodes).toEqual([]);
    expect(state.knownUpdatedAt).toBe(T1);
  });

  it("applies a patch that follows an unseen server write, keeps the base and reloads", async () => {
    let loads = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/project?id=")) {
        loads++;
        return { ok: true, json: async () => ({ nodes: [userNode, { ...prompt }, { ...generator }], edges: [], updatedAt: T2 }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    // The server wrote T1 (unseen here), then the agent placed the generator (previous = T1).
    useCanvasStore.getState().applyAgentPatch(created(generator, T2));
    expect(useCanvasStore.getState().nodes.map((n) => n.id)).toContain("iv-generator");
    expect(useCanvasStore.getState().knownUpdatedAt).toBe(T0);
    await vi.advanceTimersByTimeAsync(0);
    expect(loads).toBe(1);
    expect(useCanvasStore.getState().nodes.map((n) => n.id)).toEqual(["user-1", "iv-prompt", "iv-generator"]);
    expect(useCanvasStore.getState().knownUpdatedAt).toBe(T2);
  });

  it("does not reload for a patch in sequence", async () => {
    useCanvasStore.getState().applyAgentPatch(created(prompt, T1));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/project?id="))).toHaveLength(0);
  });

  it("keeps a user edit made right after a patch as its own undo step", async () => {
    useCanvasStore.getState().applyAgentPatch(created(prompt, T1));
    useCanvasStore.getState().updateNodeData("user-1", { prompt: "Édité" });
    await vi.advanceTimersByTimeAsync(300);
    const { history } = useCanvasStore.getState();
    expect(history).toHaveLength(3);
    expect(history[1].nodes.find((n) => n.id === "user-1")?.data.prompt).toBe("Mon idée");
    expect(history[2].nodes.find((n) => n.id === "user-1")?.data.prompt).toBe("Édité");
  });

  it("keeps an edit made just before a patch as its own undo step too", async () => {
    useCanvasStore.getState().updateNodeData("user-1", { prompt: "Avant" });
    useCanvasStore.getState().applyAgentPatch(created(prompt, T1));
    const { history } = useCanvasStore.getState();
    expect(history).toHaveLength(3);
    expect(history[1].nodes.map((n) => n.id)).toEqual(["user-1"]);
    expect(history[2].nodes.map((n) => n.id)).toEqual(["user-1", "iv-prompt"]);
  });
});

describe("saveProject with the known base", () => {
  it("drops locally the agent nodes the server removed", async () => {
    seed([userNode, { ...prompt }], [{ ...promptEdge, target: "user-1" }]);
    saveAnswer({ updatedAt: T3, removed: ["iv-prompt"] });
    await useCanvasStore.getState().saveProject();
    expect(useCanvasStore.getState().nodes.map((n) => n.id)).toEqual(["user-1"]);
    expect(useCanvasStore.getState().edges).toEqual([]);
    expect(useCanvasStore.getState().deletedNodeIds).toContain("iv-prompt");
  });

  it("sends the base read when the payload is built and merges reinjected agent nodes", async () => {
    let release: () => void = () => {};
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/project" && init?.method === "POST") {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return { ok: true, json: async () => ({ success: true, updatedAt: T2, reinjected: [prompt], reinjectedEdges: [], refreshed: [] }) };
      }
      return { ok: true, json: async () => ({}) };
    });

    const saving = useCanvasStore.getState().saveProject();
    await vi.advanceTimersByTimeAsync(0);
    expect(JSON.parse(String(posts()[0][1]!.body))).toMatchObject({ projectId: "patch-test", baseUpdatedAt: T0 });
    useCanvasStore.getState().applyAgentPatch(created(prompt, T1));
    release();
    await saving;

    const state = useCanvasStore.getState();
    expect(state.nodes.filter((n) => n.id === "iv-prompt")).toHaveLength(1);
    expect(state.knownUpdatedAt).toBe(T2);
    expect(state.dirty).toBe(false);
  });

  it("appends reinjected nodes and edges without a history entry, dropping edges to missing nodes", async () => {
    const orphanEdge = { ...promptEdge, id: "e-2", source: "iv-persona", targetHandle: "face-in" };
    saveAnswer({ updatedAt: T2, reinjected: [prompt, generator], reinjectedEdges: [promptEdge, orphanEdge] });
    await useCanvasStore.getState().saveProject();
    await vi.advanceTimersByTimeAsync(1000);
    const state = useCanvasStore.getState();
    expect(state.nodes.map((n) => n.id)).toEqual(["user-1", "iv-prompt", "iv-generator"]);
    expect(state.edges).toEqual([promptEdge]);
    expect(state.history).toHaveLength(1);
    expect(state.dirty).toBe(false);
  });

  it("takes the agent's newer data for refreshed nodes and keeps the local position", async () => {
    seed([userNode, { id: "iv-prompt", type: "prompt", position: { x: 7, y: 8 }, data: { prompt: "Premier jet" } }]);
    saveAnswer({ updatedAt: T3, refreshed: [{ ...prompt, position: { x: 7, y: 8 }, data: { prompt: "Texte « ÇA CHANGE TOUT »", placedByAgentAt: T2 } }] });
    await useCanvasStore.getState().saveProject();
    const node = useCanvasStore.getState().nodes.find((n) => n.id === "iv-prompt")!;
    expect(node.position).toEqual({ x: 7, y: 8 });
    expect(node.data).toEqual({ prompt: "Texte « ÇA CHANGE TOUT »", placedByAgentAt: T2 });
    expect(useCanvasStore.getState().history).toHaveLength(1);
  });

  it("sends no base when none is known", async () => {
    seed([userNode], [], null);
    await useCanvasStore.getState().saveProject();
    expect(JSON.parse(String(posts()[0][1]!.body)).baseUpdatedAt).toBeUndefined();
  });

  it("sends deletedNodeIds so a stale save cannot resurrect a removed node", async () => {
    const generator: AppNode = { id: "user-gen-1", type: "generator", position: { x: 80, y: 40 }, data: {} };
    seed([userNode, generator]);
    useCanvasStore.getState().removeNode("user-gen-1");
    saveAnswer({ updatedAt: T2 });
    await useCanvasStore.getState().saveProject();
    expect(JSON.parse(String(posts()[0][1]!.body)).deletedNodeIds).toEqual(["user-gen-1"]);
    expect(useCanvasStore.getState().nodes.map((n) => n.id)).toEqual(["user-1"]);
  });

  it("ignores a save response that reinjects a node the user deleted", async () => {
    const generator: AppNode = { id: "user-gen-1", type: "generator", position: { x: 80, y: 40 }, data: {} };
    seed([userNode, generator]);
    useCanvasStore.getState().removeNode("user-gen-1");
    saveAnswer({ updatedAt: T2, reinjected: [generator] });
    await useCanvasStore.getState().saveProject();
    expect(useCanvasStore.getState().nodes.map((n) => n.id)).toEqual(["user-1"]);
  });

  it("never merges a save's reinjected nodes into another project opened meanwhile", async () => {
    let release: () => void = () => {};
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/project" && init?.method === "POST") {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return { ok: true, json: async () => ({ success: true, updatedAt: T2, reinjected: [prompt], reinjectedEdges: [], refreshed: [prompt] }) };
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
  it("never reloads for a state the canvas already knows, reloads for a newer one", async () => {
    let serverUpdatedAt = T0;
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ updated_at: serverUpdatedAt }) }));
    const loadProject = vi.fn(async () => {});
    const poller = createProjectSyncPoller("patch-test", loadProject);
    await poller.tick();

    // Two patches applied (T1 then T2); the poll still answers with the first one.
    useCanvasStore.setState({ knownUpdatedAt: T2, recentOwnSaveUpdatedAts: [] });
    serverUpdatedAt = T1;
    await poller.tick();
    serverUpdatedAt = T2;
    await poller.tick();
    expect(loadProject).not.toHaveBeenCalled();

    serverUpdatedAt = T3;
    await poller.tick();
    expect(loadProject).toHaveBeenCalledTimes(1);
  });

  it("does not reload while a save is in flight", async () => {
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ updated_at: T0 }) }));
    const loadProject = vi.fn(async () => {});
    const poller = createProjectSyncPoller("patch-test", loadProject);
    await poller.tick();
    useCanvasStore.setState({ dirty: false, saving: true, loading: false });
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ updated_at: T3 }) }));
    await poller.tick();
    expect(loadProject).not.toHaveBeenCalled();
  });
});

describe("applyAgentWorkflowPatch", () => {
  it("creates both A/B prompt nodes and their edges in one history step", () => {
    const patch: CanvasWorkflowPatch = {
      projectId: "patch-test",
      updatedAt: T1,
      previousUpdatedAt: T0,
      created: [
        { id: "prompt-a", type: "prompt", position: { x: 10, y: 0 }, data: { prompt: "A", placedByAgentAt: T1 } },
        { id: "prompt-b", type: "prompt", position: { x: 10, y: 80 }, data: { prompt: "B", placedByAgentAt: T1 } },
      ],
      updated: [],
      removedIds: [],
      edges: [
        { id: "e-a", source: "prompt-a", target: "user-1", sourceHandle: null, targetHandle: "prompt-in" },
      ],
      removedEdges: [],
    };
    useCanvasStore.getState().applyAgentWorkflowPatch(patch);
    const state = useCanvasStore.getState();
    expect(state.nodes.map((n) => n.id)).toEqual(["user-1", "prompt-a", "prompt-b"]);
    expect(state.edges).toHaveLength(1);
    expect(state.knownUpdatedAt).toBe(T1);
    expect(state.dirty).toBe(false);
  });

  it("does not call fitView or setViewport", () => {
    const applySource = fs.readFileSync(path.join(process.cwd(), "src/store/canvas-store.ts"), "utf8");
    const start = applySource.indexOf("applyAgentWorkflowPatch: (patch) => {");
    expect(start).toBeGreaterThan(-1);
    const body = applySource.slice(start, applySource.indexOf("cancelStuckGenerations:", start));
    expect(body).not.toMatch(/fitView|setViewport|setCenter|zoomTo|fitNode/);

    const patchPart = fs.readFileSync(path.join(process.cwd(), "src/components/panels/chat/canvas-patch-part.ts"), "utf8");
    expect(patchPart).not.toMatch(/fitView|setViewport|setCenter|zoomTo|fitNode/);
  });
});
