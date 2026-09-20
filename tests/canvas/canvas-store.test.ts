import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Edge } from "@xyflow/react";
import { resetPinnedChatSketchesForTests, useCanvasStore, type AppNode } from "@/store/canvas-store";

const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, json: async () => ({}) }));

function seed(nodes: AppNode[], edges: Edge[] = []) {
  useCanvasStore.setState({
    nodes,
    edges,
    loaded: true,
    saving: false,
    dirty: false,
    recentOwnSaveUpdatedAts: [],
    currentProjectId: "store-test",
    coverImageUrl: null,
    lastSavedAt: null,
    saveError: null,
    deletedNodeIds: [],
    deletedEdgeIds: [],
    history: [{ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }],
    historyIndex: 0,
    nodePicker: null,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
  resetPinnedChatSketchesForTests();
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

  it("never copies the agent's interview bookkeeping", () => {
    const placed: AppNode = {
      id: "iv-prompt",
      type: "prompt",
      position: { x: 0, y: 0 },
      data: {
        prompt: "x",
        placedByAgentAt: "2026-09-17T10:00:00.000Z",
        agentCreatedAt: "2026-09-17T10:00:00.000Z",
        agentLinks: [{ node: "iv-generator", handle: "prompt-in", at: "2026-09-17T10:00:00.000Z" }],
      } as AppNode["data"],
    };
    seed([placed]);
    const newId = useCanvasStore.getState().duplicateNode("iv-prompt");
    const copy = useCanvasStore.getState().nodes.find((n) => n.id === newId)!;
    expect(copy.data).toEqual({ prompt: "x" });
    expect(useCanvasStore.getState().nodes.find((n) => n.id === "iv-prompt")!.data).toEqual(placed.data);
  });

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

describe("removeNode tombstones", () => {
  it("records the deleted id and forgets it on undo so a save can restore the node", async () => {
    const node: AppNode = { id: "n1", type: "prompt", position: { x: 0, y: 0 }, data: {} };
    seed([node]);
    useCanvasStore.getState().removeNode("n1");
    vi.advanceTimersByTime(300);
    expect(useCanvasStore.getState().nodes).toEqual([]);
    expect(useCanvasStore.getState().deletedNodeIds).toEqual(["n1"]);

    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().nodes.map((n) => n.id)).toEqual(["n1"]);
    expect(useCanvasStore.getState().deletedNodeIds).toEqual([]);

    const bodies: Array<{ deletedNodeIds: string[]; nodes: AppNode[] }> = [];
    const saveMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/project" && init?.method === "POST") {
        bodies.push(JSON.parse(String(init.body)) as { deletedNodeIds: string[]; nodes: AppNode[] });
        return { ok: true, json: async () => ({ success: true, updatedAt: "S1" }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", saveMock);
    await useCanvasStore.getState().saveProject();
    expect(bodies[0].deletedNodeIds).toEqual([]);
    expect(bodies[0].nodes.map((n) => n.id)).toEqual(["n1"]);
  });
});

describe("placeChatSketch", () => {
  const gen: AppNode = { id: "gen", type: "generator", position: { x: 400, y: 0 }, data: {} };
  const first: AppNode = {
    id: "sketch-11111111",
    type: "sketch",
    position: { x: 0, y: 0 },
    data: { image_source: "generated:sk_one", imageUrl: "/api/generated-sketches/sk_one", label: "One" },
  };
  const second: AppNode = {
    id: "sketch-22222222",
    type: "sketch",
    position: { x: 0, y: 220 },
    data: { image_source: "generated:sk_two", imageUrl: "/api/generated-sketches/sk_two", label: "Two" },
  };

  it("adds each click as a new sketch and keeps the previous image", () => {
    seed([gen, first]);
    useCanvasStore.getState().placeChatSketch(second, {
      id: "e-two",
      source: second.id,
      target: "gen",
      targetHandle: "sketch-in",
    });
    const nodes = useCanvasStore.getState().nodes;
    expect(nodes.filter((n) => n.type === "sketch").map((n) => n.id)).toEqual([first.id, second.id]);
    expect(nodes.find((n) => n.id === first.id)?.data.image_source).toBe("generated:sk_one");
    expect(nodes.find((n) => n.id === second.id)?.data.image_source).toBe("generated:sk_two");
    expect(nodes.find((n) => n.id === first.id)?.data.imageUrl).toBe("/api/generated-sketches/sk_one");
  });

  it("does not reuse sketch-a and clears a false tombstone on the new id", () => {
    seed([gen]);
    useCanvasStore.setState({ deletedNodeIds: ["sketch-a", "sketch-99999999"] });
    const id = useCanvasStore.getState().placeChatSketch({
      id: "sketch-a",
      type: "sketch",
      position: { x: 0, y: 0 },
      data: { image_source: "generated:sk_x", imageUrl: "/api/generated-sketches/sk_x" },
    });
    expect(id).not.toBe("sketch-a");
    expect(id).toMatch(/^sketch-[0-9a-f]{8}$/);
    expect(useCanvasStore.getState().nodes.some((n) => n.id === "sketch-a")).toBe(false);
    expect(useCanvasStore.getState().nodes.some((n) => n.id === id)).toBe(true);
    expect(useCanvasStore.getState().deletedNodeIds).not.toContain(id);
    expect(useCanvasStore.getState().deletedNodeIds).toContain("sketch-a");
  });

  it("ignores a React Flow remount remove so the click-placed sketch is not tombstoned", () => {
    seed([gen]);
    const id = useCanvasStore.getState().placeChatSketch(first);
    useCanvasStore.getState().onNodesChange([{ type: "remove", id }]);
    expect(useCanvasStore.getState().nodes.map((n) => n.id)).toEqual(["gen", first.id]);
    expect(useCanvasStore.getState().deletedNodeIds).toEqual([]);
  });
});

describe("prompt node persistence", () => {
  const prompt: AppNode = {
    id: "075e691c-a1a0-4a50-ad3b-a8375fc8af30",
    type: "prompt",
    position: { x: 0, y: 0 },
    data: { prompt: "keep this text" },
  };
  const generator: AppNode = { id: "gen", type: "generator", position: { x: 400, y: 0 }, data: {} };

  it("does not tombstone an unselected prompt when React Flow remounts with remove", () => {
    seed([prompt, generator]);
    useCanvasStore.getState().onNodesChange([{ type: "remove", id: prompt.id }]);
    expect(useCanvasStore.getState().nodes.map((n) => n.id)).toEqual([prompt.id, "gen"]);
    expect(useCanvasStore.getState().deletedNodeIds).toEqual([]);
    expect(useCanvasStore.getState().dirty).toBe(false);
  });

  it("does not tombstone a generator edge on a React Flow remount remove", () => {
    const edge = { id: "e-prompt", source: prompt.id, target: "gen", targetHandle: "prompt-in" };
    seed([prompt, generator], [edge]);
    useCanvasStore.getState().onEdgesChange([{ type: "remove", id: edge.id }]);
    expect(useCanvasStore.getState().edges.map((item) => item.id)).toEqual([edge.id]);
    expect(useCanvasStore.getState().deletedEdgeIds).toEqual([]);
    expect(useCanvasStore.getState().dirty).toBe(false);
  });

  it("does not tombstone a selected prompt on a React Flow remount remove (user is editing it)", () => {
    seed([{ ...prompt, selected: true }, generator]);
    useCanvasStore.getState().onNodesChange([{ type: "remove", id: prompt.id }]);
    expect(useCanvasStore.getState().nodes.map((n) => n.id)).toEqual([prompt.id, "gen"]);
    expect(useCanvasStore.getState().deletedNodeIds).toEqual([]);
  });

  it("tombstones a selected prompt deleted via the keyboard selection path", () => {
    seed([{ ...prompt, selected: true }, generator]);
    useCanvasStore.getState().deleteSelected();
    expect(useCanvasStore.getState().nodes.map((n) => n.id)).toEqual(["gen"]);
    expect(useCanvasStore.getState().deletedNodeIds).toEqual([prompt.id]);
  });

  it("does not adopt a server tombstone for a prompt still on the live canvas", async () => {
    const bodies: Array<{ deletedNodeIds: string[]; nodes: AppNode[] }> = [];
    const mock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith("/api/project?id=")) {
        return {
          ok: true,
          json: async () => ({
            nodes: [generator],
            edges: [],
            updatedAt: "T1",
            deletedNodeIds: [prompt.id],
            deletedEdgeIds: [],
          }),
        };
      }
      if (url === "/api/project" && init?.method === "POST") {
        bodies.push(JSON.parse(String(init.body)) as { deletedNodeIds: string[]; nodes: AppNode[] });
        return { ok: true, json: async () => ({ success: true, updatedAt: "T2", deletedNodeIds: [], removed: [] }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", mock);
    seed([prompt, generator]);
    useCanvasStore.setState({ knownUpdatedAt: "T0", dirty: false, saving: false, loading: false });

    await useCanvasStore.getState().loadProject("store-test", { reason: "poll" });

    expect(useCanvasStore.getState().nodes.map((n) => n.id)).toEqual(expect.arrayContaining([prompt.id, "gen"]));
    expect(useCanvasStore.getState().nodes).toHaveLength(2);
    expect(useCanvasStore.getState().deletedNodeIds).not.toContain(prompt.id);
    expect(useCanvasStore.getState().nodes.find((n) => n.id === prompt.id)?.data.prompt).toBe("keep this text");

    await Promise.resolve();
    await Promise.resolve();
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies[0].nodes.map((n) => n.id)).toContain(prompt.id);
    expect(bodies[0].deletedNodeIds).not.toContain(prompt.id);
  });
});

describe("duplicateNode generation status", () => {
  it("strips a loading genStatus so no spinner is left with nothing to update it", () => {
    const loadingPreview: AppNode = {
      id: "prev",
      type: "preview",
      position: { x: 0, y: 0 },
      data: { genStatus: "loading", genModel: "Nano Banana" },
    };
    seed([loadingPreview]);

    const newId = useCanvasStore.getState().duplicateNode("prev");
    const copy = useCanvasStore.getState().nodes.find((n) => n.id === newId)!;

    expect("genStatus" in copy.data).toBe(false);
    expect(copy.data.genModel).toBe("Nano Banana");
  });

  it("keeps a finished genStatus (done/error) on the copy", () => {
    const donePreview: AppNode = {
      id: "prev",
      type: "preview",
      position: { x: 0, y: 0 },
      data: { genStatus: "done", generatedImages: ["/img/a.png"] },
    };
    seed([donePreview]);

    const newId = useCanvasStore.getState().duplicateNode("prev");
    const copy = useCanvasStore.getState().nodes.find((n) => n.id === newId)!;

    expect(copy.data.genStatus).toBe("done");
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

describe("selectOnly", () => {
  it("selects exactly the given node ids and deselects everything else", () => {
    seed(
      [
        { id: "a", type: "prompt", position: { x: 0, y: 0 }, data: {}, selected: true },
        { id: "b", type: "prompt", position: { x: 0, y: 100 }, data: {} },
        { id: "c", type: "prompt", position: { x: 0, y: 200 }, data: {} },
      ],
      [{ id: "e", source: "a", target: "b", selected: true }],
    );

    useCanvasStore.getState().selectOnly(["b", "c"]);

    const { nodes, edges } = useCanvasStore.getState();
    expect(nodes.find((n) => n.id === "a")!.selected).toBe(false);
    expect(nodes.find((n) => n.id === "b")!.selected).toBe(true);
    expect(nodes.find((n) => n.id === "c")!.selected).toBe(true);
    expect(edges.every((e) => !e.selected)).toBe(true);
  });

  it("is view state: no history entry, no save", () => {
    seed([{ id: "a", type: "prompt", position: { x: 0, y: 0 }, data: {} }]);
    useCanvasStore.getState().selectOnly(["a"]);
    vi.advanceTimersByTime(3000);
    expect(useCanvasStore.getState().history).toHaveLength(1);
    expect(useCanvasStore.getState().dirty).toBe(false);
  });

  it("selects nothing when given an empty list", () => {
    seed([{ id: "a", type: "prompt", position: { x: 0, y: 0 }, data: {}, selected: true }]);
    useCanvasStore.getState().selectOnly([]);
    expect(useCanvasStore.getState().nodes.every((n) => !n.selected)).toBe(true);
  });
});

describe("loadProject migrations", () => {
  const legacyProject = {
    nodes: [
      { id: "face", type: "faceReference", position: { x: 0, y: 0 }, data: { imageUrl: "/api/face-reactions/image?f=abc", label: "Choqué" } },
      { id: "gen", type: "generator", position: { x: 400, y: 0 }, data: { model: "m" } },
    ],
    edges: [{ id: "e1", source: "face", sourceHandle: "face", target: "gen", targetHandle: "face-in" }],
  };

  function stubProject(project: unknown) {
    const mock = vi.fn(async (url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => (String(url).startsWith("/api/project?id=") ? project : {}),
    }));
    vi.stubGlobal("fetch", mock);
    return mock;
  }

  it("converts single-photo faces on load and autosaves the result", async () => {
    const mock = stubProject(legacyProject);
    useCanvasStore.setState({ loaded: false, dirty: false, saving: false });

    await useCanvasStore.getState().loadProject("legacy");

    const { nodes, edges, dirty, history } = useCanvasStore.getState();
    expect(nodes[0]).toMatchObject({ type: "swipeFile", data: { kind: "reference", label: "Choqué" } });
    expect(edges[0]).toMatchObject({ sourceHandle: "image", targetHandle: "ref-in" });
    expect(history[0].nodes[0].type).toBe("swipeFile");
    expect(dirty).toBe(true);

    await vi.advanceTimersByTimeAsync(2000);
    const save = mock.mock.calls.find(([url, init]) => url === "/api/project" && init?.method === "POST");
    expect(save).toBeDefined();
    expect(JSON.parse(String(save![1]!.body)).nodes[0].type).toBe("swipeFile");
  });

  it("does not schedule a save when nothing needed converting", async () => {
    stubProject({ nodes: [legacyProject.nodes[1]], edges: [] });
    useCanvasStore.setState({ loaded: false, dirty: false, saving: false });

    await useCanvasStore.getState().loadProject("clean");

    expect(useCanvasStore.getState().nodes).toHaveLength(1);
    expect(useCanvasStore.getState().dirty).toBe(false);
  });

  it("does not mark dirty after a poll load of the same persistable graph", async () => {
    const node: AppNode = { id: "n1", type: "prompt", position: { x: 0, y: 0 }, data: { prompt: "x" } };
    seed([node]);
    useCanvasStore.setState({ knownUpdatedAt: "T0", dirty: false, saving: false, loading: false });
    stubProject({ nodes: [node], edges: [], updatedAt: "T1", deletedNodeIds: [], deletedEdgeIds: [] });

    await useCanvasStore.getState().loadProject("store-test", { reason: "poll" });

    expect(useCanvasStore.getState().dirty).toBe(false);
    expect(useCanvasStore.getState().nodes).toHaveLength(1);
    expect(useCanvasStore.getState().knownUpdatedAt).toBe("T1");
  });

  it("keeps a dragged position across a poll that only differs by tombs and rehydrate", async () => {
    const live: AppNode = {
      id: "gold",
      type: "preview",
      position: { x: 400, y: 80 },
      data: { generatedImages: ["/api/generated-images/image?id=ok"], genStatus: "done", label: "Variante A" },
    };
    seed([live]);
    useCanvasStore.setState({
      knownUpdatedAt: "T0",
      dirty: false,
      saving: false,
      loading: false,
      deletedNodeIds: ["6d00aec9", "c2f38b62"],
    });
    const posts: unknown[] = [];
    const mock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith("/api/project?id=")) {
        return {
          ok: true,
          json: async () => ({
            nodes: [
              { ...live, position: { x: 400, y: 80 } },
              { id: "6d00aec9", type: "preview", position: { x: 0, y: 0 }, data: { genPromptUsed: "gold" } },
              { id: "c2f38b62", type: "preview", position: { x: 10, y: 10 }, data: { genPromptUsed: "gold" } },
            ],
            edges: [],
            updatedAt: "T1",
            deletedNodeIds: [],
            deletedEdgeIds: [],
          }),
        };
      }
      if (url === "/api/project" && init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        return { ok: true, json: async () => ({ success: true, updatedAt: "S1" }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", mock);

    useCanvasStore.getState().onNodesChange([
      { type: "position", id: "gold", position: { x: 520, y: 140 }, dragging: false },
    ]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(useCanvasStore.getState().nodes[0].position).toEqual({ x: 520, y: 140 });
    expect(useCanvasStore.getState().dirty).toBe(false);

    await useCanvasStore.getState().loadProject("store-test", { reason: "poll" });

    expect(useCanvasStore.getState().nodes.find((n) => n.id === "gold")?.position).toEqual({ x: 520, y: 140 });
    expect(useCanvasStore.getState().nodes.map((n) => n.id)).toEqual(["gold"]);
    expect(useCanvasStore.getState().dirty).toBe(false);
    expect(posts).toHaveLength(1);
  });

  it("does not re-dirty a poll that only strips already-known tombs still present on the server", async () => {
    const live: AppNode = { id: "gold", type: "preview", position: { x: 0, y: 0 }, data: {} };
    seed([live]);
    useCanvasStore.setState({
      knownUpdatedAt: "T0",
      dirty: false,
      saving: false,
      loading: false,
      deletedNodeIds: ["6d00aec9"],
    });
    const mock = stubProject({
      nodes: [live, { id: "6d00aec9", type: "preview", position: { x: 1, y: 1 }, data: {} }],
      edges: [],
      updatedAt: "T1",
      deletedNodeIds: [],
      deletedEdgeIds: [],
    });

    await useCanvasStore.getState().loadProject("store-test", { reason: "poll" });

    expect(useCanvasStore.getState().dirty).toBe(false);
    expect(useCanvasStore.getState().nodes.map((n) => n.id)).toEqual(["gold"]);
    expect(useCanvasStore.getState().deletedNodeIds).toEqual(["6d00aec9"]);
    expect(mock.mock.calls.some(([url, init]) => url === "/api/project" && init?.method === "POST")).toBe(false);
  });

  it("deduplicates concurrent GET /api/project for the same project", async () => {
    let gets = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).startsWith("/api/project?id=")) {
          gets += 1;
          await gate;
          return { ok: true, json: async () => ({ nodes: [], edges: [], updatedAt: "T1", deletedNodeIds: [], deletedEdgeIds: [] }) };
        }
        return { ok: true, json: async () => ({}) };
      }),
    );
    useCanvasStore.setState({ loaded: false, dirty: false, saving: false, loading: false, currentProjectId: "storm" });

    const first = useCanvasStore.getState().loadProject("storm");
    const second = useCanvasStore.getState().loadProject("storm");
    release();
    await Promise.all([first, second]);

    expect(gets).toBe(1);
  });

  it("does not re-dirty a poll when strippedDeleted is only already-tombstoned or live ids", async () => {
    const live: AppNode = { id: "prompt-realiste", type: "prompt", position: { x: 0, y: 0 }, data: { prompt: "local" } };
    seed([live]);
    useCanvasStore.setState({
      knownUpdatedAt: "T0",
      dirty: false,
      saving: false,
      loading: false,
      deletedNodeIds: ["prompt-realiste", "81c366ef-dead-beef-0000-000000000001"],
    });
    const mock = stubProject({
      nodes: [{ ...live, data: { prompt: "server" } }],
      edges: [],
      updatedAt: "T1",
      deletedNodeIds: ["81c366ef-dead-beef-0000-000000000001"],
      deletedEdgeIds: [],
    });

    await useCanvasStore.getState().loadProject("store-test", { reason: "poll" });

    expect(useCanvasStore.getState().dirty).toBe(false);
    expect(useCanvasStore.getState().deletedNodeIds).toEqual(["81c366ef-dead-beef-0000-000000000001"]);
    expect(mock.mock.calls.some(([url, init]) => url === "/api/project" && init?.method === "POST")).toBe(false);
  });

  it("keeps a loading preview and its images across a poll merge", async () => {
    const gen: AppNode = { id: "gen", type: "generator", position: { x: 0, y: 0 }, data: { model: "m", isGenerating: true } };
    const preview: AppNode = {
      id: "prev-1",
      type: "preview",
      position: { x: 400, y: 0 },
      data: { label: "Variante A", genStatus: "loading", genModel: "Nano" },
    };
    const done: AppNode = {
      id: "prev-2",
      type: "preview",
      position: { x: 400, y: 400 },
      data: {
        label: "Variante B",
        genStatus: "done",
        generatedImages: ["/api/generated-images/image?id=abc"],
        selectedImageIndex: 0,
      },
    };
    seed([gen, preview, done]);
    useCanvasStore.setState({
      knownUpdatedAt: "T0",
      dirty: false,
      saving: false,
      loading: false,
      deletedNodeIds: ["81c366ef-dead-beef-0000-000000000001"],
    });
    stubProject({
      nodes: [
        { id: "gen", type: "generator", position: { x: 0, y: 0 }, data: { model: "m" } },
        { id: "prev-1", type: "preview", position: { x: 400, y: 0 }, data: { label: "Variante A" } },
        { id: "prev-2", type: "preview", position: { x: 400, y: 400 }, data: { label: "Variante B" } },
      ],
      edges: [],
      updatedAt: "T1",
      deletedNodeIds: ["81c366ef-dead-beef-0000-000000000001"],
      deletedEdgeIds: [],
    });

    await useCanvasStore.getState().loadProject("store-test", { reason: "poll" });

    const state = useCanvasStore.getState();
    expect(state.nodes.find((n) => n.id === "prev-1")?.data.genStatus).toBe("loading");
    expect(state.nodes.find((n) => n.id === "gen")?.data.isGenerating).toBe(true);
    expect(state.nodes.find((n) => n.id === "prev-2")?.data.generatedImages).toEqual([
      "/api/generated-images/image?id=abc",
    ]);
    expect(state.dirty).toBe(true);
    expect(state.nodes.find((n) => n.id === "prev-1")?.data.genStatus).toBe("loading");
  });

  it("keeps server tombstones after load and sends them on the next save", async () => {
    const node: AppNode = { id: "n1", type: "prompt", position: { x: 0, y: 0 }, data: {} };
    const bodies: Array<{ deletedNodeIds: string[] }> = [];
    const mock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith("/api/project?id=")) {
        return {
          ok: true,
          json: async () => ({
            nodes: [node],
            edges: [],
            updatedAt: "T1",
            deletedNodeIds: ["gone", "preview-a"],
            deletedEdgeIds: [],
          }),
        };
      }
      if (url === "/api/project" && init?.method === "POST") {
        bodies.push(JSON.parse(String(init.body)) as { deletedNodeIds: string[] });
        return {
          ok: true,
          json: async () => ({ success: true, updatedAt: "T1", deletedNodeIds: ["gone", "preview-a"], unchanged: true }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", mock);
    useCanvasStore.setState({ loaded: false, dirty: false, saving: false, deletedNodeIds: [], deletedEdgeIds: [] });

    await useCanvasStore.getState().loadProject("tombs");
    expect(useCanvasStore.getState().deletedNodeIds).toEqual(["gone", "preview-a"]);
    expect(useCanvasStore.getState().dirty).toBe(false);

    useCanvasStore.getState().updateNodeData("n1", { prompt: "changed" });
    await useCanvasStore.getState().saveProject();
    expect(bodies[0].deletedNodeIds).toEqual(["gone", "preview-a"]);
    expect(useCanvasStore.getState().deletedNodeIds).toEqual(["gone", "preview-a"]);
  });

  it("does not drop a live preview when a stale save returns it in removed", async () => {
    const gen: AppNode = { id: "gen", type: "generator", position: { x: 0, y: 0 }, data: {} };
    const preview: AppNode = {
      id: "64a5de67-f5f0-4c47-875e-c88eb34eda6e",
      type: "preview",
      position: { x: 400, y: 0 },
      data: { genStatus: "loading" },
    };
    seed([gen]);
    useCanvasStore.setState({ knownUpdatedAt: "T0", loaded: true, saving: false });

    let finish: (value: unknown) => void = () => {};
    const gate = new Promise((resolve) => {
      finish = resolve;
    });
    const mock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/project" && init?.method === "POST") {
        await gate;
        return {
          ok: true,
          json: async () => ({
            success: true,
            updatedAt: "T2",
            removed: [preview.id],
            deletedNodeIds: [preview.id, "gone"],
            deletedEdgeIds: [],
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", mock);

    const pending = useCanvasStore.getState().saveProject();
    useCanvasStore.setState({
      nodes: [...useCanvasStore.getState().nodes, preview],
      edges: [
        ...useCanvasStore.getState().edges,
        { id: "e-preview", source: "gen", target: preview.id, targetHandle: "preview-in" },
      ],
    });
    finish(undefined);
    await pending;

    expect(useCanvasStore.getState().nodes.map((node) => node.id)).toEqual(expect.arrayContaining(["gen", preview.id]));
    expect(useCanvasStore.getState().deletedNodeIds).not.toContain(preview.id);
  });

  it("does not dirty when React Flow remounts with remove/add right after load", async () => {
    const node: AppNode = { id: "n1", type: "prompt", position: { x: 0, y: 0 }, data: {} };
    stubProject({ nodes: [node], edges: [], updatedAt: "T1", deletedNodeIds: [], deletedEdgeIds: [] });
    useCanvasStore.setState({ loaded: false, dirty: false, saving: false });

    await useCanvasStore.getState().loadProject("remount");
    expect(useCanvasStore.getState().dirty).toBe(false);

    useCanvasStore.getState().onNodesChange([{ type: "remove", id: "n1" }]);
    expect(useCanvasStore.getState().nodes.map((n) => n.id)).toEqual(["n1"]);
    expect(useCanvasStore.getState().dirty).toBe(false);
    expect(useCanvasStore.getState().deletedNodeIds).toEqual([]);
  });

  it("clears stuck loading generations on load without calling the image API", async () => {
    const mock = stubProject({
      nodes: [
        { id: "prev", type: "preview", position: { x: 0, y: 0 }, data: { genStatus: "loading", label: "Variante A" } },
        { id: "gen", type: "generator", position: { x: 400, y: 0 }, data: { isGenerating: true, model: "m" } },
      ],
      edges: [],
      updatedAt: "2026-09-18T10:00:00.000Z",
    });
    useCanvasStore.setState({ loaded: false, dirty: false, saving: false });
    await useCanvasStore.getState().loadProject("stuck");
    const prev = useCanvasStore.getState().nodes.find((n) => n.id === "prev")!;
    const gen = useCanvasStore.getState().nodes.find((n) => n.id === "gen")!;
    expect(prev.data.genStatus).toBe("error");
    expect(prev.data.genError).toBe("Génération interrompue");
    expect(gen.data.isGenerating).toBeUndefined();
    expect(useCanvasStore.getState().dirty).toBe(true);
    expect(mock.mock.calls.some(([url]) => String(url).includes("/api/generate"))).toBe(false);
  });
});

describe("saveProject", () => {
  it("keeps only the MAX_RECENT_SELF_SAVES most recent self-save updated_at values, so useCanvasSync's poll can still recognize an older-but-still-own one without unbounded growth", async () => {
    let n = 0;
    const saveMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/project" && init?.method === "POST") {
        n++;
        return { ok: true, json: async () => ({ success: true, updatedAt: `S${n}` }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", saveMock);
    seed([]);

    for (let i = 0; i < 7; i++) {
      useCanvasStore.setState({
        nodes: [{ id: "n1", type: "prompt", position: { x: i * 20, y: 0 }, data: { prompt: `v${i}` } }],
      });
      await useCanvasStore.getState().saveProject();
    }

    expect(useCanvasStore.getState().recentOwnSaveUpdatedAts).toEqual(["S3", "S4", "S5", "S6", "S7"]);
  });

  it("queues a second save when a node moves during an in-flight POST, so the drag is not lost", async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    const bodies: Array<{ nodes: AppNode[] }> = [];
    const saveMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/project" && init?.method === "POST") {
        bodies.push(JSON.parse(String(init.body)) as { nodes: AppNode[] });
        return new Promise((resolve) => {
          resolvers.push(resolve);
        });
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", saveMock);
    seed([{ id: "n1", type: "prompt", position: { x: 0, y: 0 }, data: {} }]);

    const first = useCanvasStore.getState().saveProject();
    useCanvasStore.getState().onNodesChange([{ type: "position", id: "n1", position: { x: 120, y: 40 } }]);
    // Same as the 2s debounce firing while POST is in flight (do not
    // advanceTimersByTimeAsync: it waits on the hanging fetch).
    void useCanvasStore.getState().saveProject();
    expect(bodies).toHaveLength(1);
    expect(bodies[0].nodes[0].position).toEqual({ x: 0, y: 0 });

    resolvers[0]!({ ok: true, json: async () => ({ success: true, updatedAt: "S1" }) });
    await first;
    await Promise.resolve();
    await Promise.resolve();
    expect(bodies).toHaveLength(2);
    expect(bodies[1].nodes[0].position).toEqual({ x: 120, y: 40 });
    expect(useCanvasStore.getState().nodes[0].position).toEqual({ x: 120, y: 40 });
    expect(useCanvasStore.getState().dirty).toBe(true);
    expect(useCanvasStore.getState().lastSavedAt).toBeNull();
    resolvers[1]!({ ok: true, json: async () => ({ success: true, updatedAt: "S2" }) });
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(useCanvasStore.getState().saving).toBe(false);
    expect(useCanvasStore.getState().lastSavedAt).toBe("S2");
    expect(useCanvasStore.getState().dirty).toBe(false);
  });

  it("keeps dirty when the save HTTP request fails, so a later poll cannot reload the old positions", async () => {
    const saveMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/project" && init?.method === "POST") {
        return { ok: false, status: 500, json: async () => ({ error: "fail" }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", saveMock);
    seed([{ id: "n1", type: "prompt", position: { x: 0, y: 0 }, data: {} }]);
    useCanvasStore.getState().onNodesChange([{ type: "position", id: "n1", position: { x: 80, y: 20 } }]);
    await useCanvasStore.getState().saveProject();
    expect(useCanvasStore.getState().dirty).toBe(true);
    expect(useCanvasStore.getState().saveError).toBe("Erreur de sauvegarde");
    expect(useCanvasStore.getState().nodes[0].position).toEqual({ x: 80, y: 20 });
  });

  it("does not retry a 404, so a stale tab cannot recreate a deleted gallery card", async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    const saveMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/project" && init?.method === "POST") {
        return new Promise((resolve) => {
          resolvers.push(resolve);
        });
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", saveMock);
    seed([{ id: "n1", type: "prompt", position: { x: 0, y: 0 }, data: {} }]);

    const first = useCanvasStore.getState().saveProject();
    useCanvasStore.getState().onNodesChange([{ type: "position", id: "n1", position: { x: 40, y: 10 } }]);
    void useCanvasStore.getState().saveProject();
    resolvers[0]!({ ok: false, status: 404, json: async () => ({ error: "Project not found" }) });
    await first;
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(saveMock.mock.calls.filter(([url, init]) => url === "/api/project" && init?.method === "POST")).toHaveLength(1);
    expect(useCanvasStore.getState().dirty).toBe(false);
    expect(useCanvasStore.getState().saving).toBe(false);
  });

  it("does not POST data:image pixels — only stored refs and urls", async () => {
    const bodies: Array<{ nodes: AppNode[] }> = [];
    const saveMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/project" && init?.method === "POST") {
        bodies.push(JSON.parse(String(init.body)) as { nodes: AppNode[] });
        return { ok: true, json: async () => ({ success: true, updatedAt: "S1" }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", saveMock);
    seed([
      {
        id: "gen",
        type: "generator",
        position: { x: 0, y: 0 },
        data: {
          generatedImages: ["data:image/png;base64,QUJDRA==", "/api/generated-images/image?id=abc"],
          imageBase64: "data:image/png;base64,BBBB",
          image_source: "stored:gi_abc",
        },
      },
      {
        id: "face",
        type: "faceReference",
        position: { x: 1, y: 1 },
        data: { personaId: "p1", personaAngles: { front: "data:image/png;base64,CCCC" } },
      },
    ]);
    await useCanvasStore.getState().saveProject();
    expect(JSON.stringify(bodies[0])).not.toContain("data:image");
    const gen = bodies[0].nodes.find((node) => node.id === "gen")!;
    expect(gen.data.generatedImages).toEqual(["/api/generated-images/image?id=abc"]);
    expect(gen.data.image_source).toBe("stored:gi_abc");
    expect(gen.data.imageBase64).toBeUndefined();
    expect((bodies[0].nodes.find((node) => node.id === "face")!.data.personaAngles as Record<string, string>).front).toBe(
      "/api/personas/image?id=p1&angle=front",
    );
  });

  it("retries a 413 with a stripped payload instead of spinning dirty", async () => {
    let n = 0;
    const bodies: string[] = [];
    const saveMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/project" && init?.method === "POST") {
        n += 1;
        bodies.push(String(init.body));
        if (n === 1) return { ok: false, status: 413, json: async () => ({ error: "Payload trop volumineux" }) };
        return { ok: true, json: async () => ({ success: true, updatedAt: "S1" }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", saveMock);
    seed([
      {
        id: "prev",
        type: "preview",
        position: { x: 0, y: 0 },
        data: { generatedImages: ["data:image/png;base64,QUJDRA==", "/api/generated-images/image?id=abc"] },
      },
    ]);
    await useCanvasStore.getState().saveProject();
    expect(n).toBe(2);
    expect(bodies.every((body) => !body.includes("data:image"))).toBe(true);
    expect(useCanvasStore.getState().dirty).toBe(false);
    expect(useCanvasStore.getState().saving).toBe(false);
    expect(useCanvasStore.getState().saveError).toBeNull();
  });

  it("does not persist in-flight genStatus loading", async () => {
    const bodies: Array<{ nodes: AppNode[] }> = [];
    const saveMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/project" && init?.method === "POST") {
        bodies.push(JSON.parse(String(init.body)) as { nodes: AppNode[] });
        return { ok: true, json: async () => ({ success: true, updatedAt: "S1" }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", saveMock);
    seed([
      { id: "prev", type: "preview", position: { x: 0, y: 0 }, data: { genStatus: "loading", label: "Variante A" } },
    ]);
    await useCanvasStore.getState().saveProject();
    expect(bodies[0].nodes[0].data.genStatus).toBeUndefined();
    expect(useCanvasStore.getState().nodes[0].data.genStatus).toBe("loading");
  });

  it("does not POST again when the persistable graph is unchanged", async () => {
    const posts: string[] = [];
    const saveMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/project" && init?.method === "POST") {
        posts.push(String(init.body));
        return { ok: true, json: async () => ({ success: true, updatedAt: `S${posts.length}`, unchanged: posts.length > 1 }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", saveMock);
    seed([{ id: "n1", type: "prompt", position: { x: 0, y: 0 }, data: { prompt: "hello" } }]);

    await useCanvasStore.getState().saveProject();
    await useCanvasStore.getState().saveProject();
    expect(posts).toHaveLength(1);
    expect(useCanvasStore.getState().dirty).toBe(false);
  });

  it("does not re-dirty after a successful save when the response echoes persist-stripped node data", async () => {
    const swipe: AppNode = {
      id: "sw-1",
      type: "swipeFile",
      position: { x: 0, y: 0 },
      data: {
        kind: "reference",
        imageUrl: "/api/swipe-files/image?f=abc",
        imageBase64: "data:image/png;base64,QUJDRA==",
        label: "Ref",
      },
    };
    const stripped = {
      id: "sw-1",
      type: "swipeFile",
      position: { x: 0, y: 0 },
      data: {
        kind: "reference",
        imageUrl: "/api/swipe-files/image?f=abc",
        image_source: "stored:sf_abc",
        label: "Ref",
      },
    };
    const saveMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/project" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            success: true,
            updatedAt: "S1",
            unchanged: false,
            refreshed: [stripped],
            deletedNodeIds: ["81c366ef-dead-beef-0000-000000000001"],
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", saveMock);
    seed([swipe]);
    useCanvasStore.setState({ deletedNodeIds: ["81c366ef-dead-beef-0000-000000000001"] });

    await useCanvasStore.getState().saveProject();
    expect(useCanvasStore.getState().dirty).toBe(false);

    useCanvasStore.getState().updateNodeData("sw-1", { imageBase64: "data:image/png;base64,QUJDRA==" });
    expect(useCanvasStore.getState().dirty).toBe(false);
    expect(useCanvasStore.getState().nodes[0].data.imageBase64).toBe("data:image/png;base64,QUJDRA==");

    await useCanvasStore.getState().saveProject();
    expect(saveMock.mock.calls.filter(([url, init]) => url === "/api/project" && init?.method === "POST")).toHaveLength(1);
    expect(useCanvasStore.getState().dirty).toBe(false);
  });

  it("does not mark dirty when React Flow remounts the same persistable graph after a save", async () => {
    const node: AppNode = { id: "n1", type: "prompt", position: { x: 40, y: 20 }, data: { prompt: "x" } };
    const saveMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/project" && init?.method === "POST") {
        return { ok: true, json: async () => ({ success: true, updatedAt: "S1", unchanged: false }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", saveMock);
    seed([node]);
    await useCanvasStore.getState().saveProject();
    expect(useCanvasStore.getState().dirty).toBe(false);

    useCanvasStore.getState().onNodesChange([
      { type: "reset", item: { ...node, position: { x: 40.0000001, y: 20 }, selected: true } } as never,
    ]);
    expect(useCanvasStore.getState().dirty).toBe(false);
  });
});

describe("undo/redo vs React Flow view changes", () => {
  it("keeps redo when React Flow reports measured dimensions and selection after an undo", () => {
    seed([]);
    const id = useCanvasStore.getState().addNode("prompt", { x: 0, y: 0 });
    vi.advanceTimersByTime(300);
    expect(useCanvasStore.getState().historyIndex).toBe(1);

    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().nodes).toHaveLength(0);
    // Remount after undo: React Flow measures and (de)selects without any user edit.
    useCanvasStore.getState().onNodesChange([
      { type: "dimensions", id, dimensions: { width: 200, height: 100 } },
    ]);
    useCanvasStore.getState().onNodesChange([{ type: "select", id, selected: false }]);
    useCanvasStore.getState().onEdgesChange([{ type: "select", id: "missing-edge", selected: true }]);
    vi.advanceTimersByTime(300);

    const state = useCanvasStore.getState();
    expect(state.historyIndex).toBe(0);
    expect(state.history).toHaveLength(2);
    expect(state.canRedo()).toBe(true);

    state.redo();
    expect(useCanvasStore.getState().nodes.map((n) => n.id)).toEqual([id]);
  });

  it("does not mark dirty when React Flow repeats the same position after a load", () => {
    const node: AppNode = { id: "n1", type: "generator", position: { x: 40, y: 20 }, data: {} };
    seed([node]);
    useCanvasStore.setState({ dirty: false });
    useCanvasStore.getState().onNodesChange([
      { type: "position", id: "n1", position: { x: 40, y: 20 }, dragging: false },
    ]);
    expect(useCanvasStore.getState().dirty).toBe(false);
    useCanvasStore.getState().onNodesChange([
      { type: "position", id: "n1", position: { x: 80, y: 20 }, dragging: false },
    ]);
    expect(useCanvasStore.getState().dirty).toBe(true);
    expect(useCanvasStore.getState().nodes[0].position).toEqual({ x: 80, y: 20 });
  });

  it("still applies view changes to the nodes without an entry or a save, but records a user resize", () => {
    const node: AppNode = { id: "n1", type: "prompt", position: { x: 0, y: 0 }, data: {} };
    seed([node]);

    useCanvasStore.getState().onNodesChange([
      { type: "dimensions", id: "n1", dimensions: { width: 300, height: 120 } },
      { type: "select", id: "n1", selected: true },
    ]);
    vi.advanceTimersByTime(2500);
    let state = useCanvasStore.getState();
    expect(state.nodes[0].measured).toEqual({ width: 300, height: 120 });
    expect(state.nodes[0].selected).toBe(true);
    expect(state.historyIndex).toBe(0);
    expect(state.dirty).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    useCanvasStore.getState().onNodesChange([
      { type: "dimensions", id: "n1", dimensions: { width: 400, height: 120 }, resizing: true, setAttributes: true },
    ]);
    vi.advanceTimersByTime(300);
    state = useCanvasStore.getState();
    expect(state.historyIndex).toBe(1);
    expect(state.dirty).toBe(true);
  });
});

describe("setCoverImage", () => {
  const cover = "/api/generated-images/image?id=aaaa1111-bbbb-cccc-dddd-eeeeeeeeeeee";
  const other = "/api/generated-images/image?id=ffff1111-bbbb-cccc-dddd-eeeeeeeeeeee";

  it("PATCHes the project cover and keeps it locally without marking the canvas dirty", async () => {
    const mock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith("/api/projects?id=") && init?.method === "PATCH") {
        return { ok: true, json: async () => ({ success: true }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", mock);
    seed([]);

    const ok = await useCanvasStore.getState().setCoverImage(cover);
    expect(ok).toBe(true);
    expect(useCanvasStore.getState().coverImageUrl).toBe(cover);
    expect(useCanvasStore.getState().dirty).toBe(false);
    expect(mock).toHaveBeenCalledWith("/api/projects?id=store-test", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverImageUrl: cover }),
    });
  });

  it("replaces the previous cover and skips a second PATCH when the same image is chosen again", async () => {
    const mock = vi.fn(async () => ({ ok: true, json: async () => ({ success: true }) }));
    vi.stubGlobal("fetch", mock);
    seed([]);

    await useCanvasStore.getState().setCoverImage(cover);
    await useCanvasStore.getState().setCoverImage(other);
    expect(useCanvasStore.getState().coverImageUrl).toBe(other);
    const again = await useCanvasStore.getState().setCoverImage(other);
    expect(again).toBe(true);
    const patches = mock.mock.calls.filter(([url, init]) => String(url).startsWith("/api/projects") && init?.method === "PATCH");
    expect(patches).toHaveLength(2);
  });

  it("reverts the local cover when PATCH fails", async () => {
    const mock = vi.fn(async () => ({ ok: false, json: async () => ({ error: "Invalid cover image" }) }));
    vi.stubGlobal("fetch", mock);
    seed([]);
    useCanvasStore.setState({ coverImageUrl: cover });

    const ok = await useCanvasStore.getState().setCoverImage(other);
    expect(ok).toBe(false);
    expect(useCanvasStore.getState().coverImageUrl).toBe(cover);
  });

  it("reads the cover from GET /api/project on load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () => (String(url).startsWith("/api/project?id=") ? { nodes: [], edges: [], coverImageUrl: cover } : {}),
      })),
    );
    useCanvasStore.setState({ loaded: false, dirty: false, saving: false, coverImageUrl: null });

    await useCanvasStore.getState().loadProject("with-cover");

    expect(useCanvasStore.getState().coverImageUrl).toBe(cover);
  });
});

describe("cancelStuckGenerations", () => {
  it("clears loading previews and isGenerating without posting to /api/generate", () => {
    seed([
      { id: "prev", type: "preview", position: { x: 0, y: 0 }, data: { genStatus: "loading", label: "Variante A" } },
      { id: "gen", type: "generator", position: { x: 0, y: 0 }, data: { isGenerating: true, model: "m" } },
    ]);
    fetchMock.mockClear();
    const cleared = useCanvasStore.getState().cancelStuckGenerations();
    expect(cleared).toBe(2);
    expect(useCanvasStore.getState().nodes.find((n) => n.id === "prev")!.data.genStatus).toBe("error");
    expect(useCanvasStore.getState().nodes.find((n) => n.id === "gen")!.data.isGenerating).toBeUndefined();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/generate"))).toBe(false);
  });
});
