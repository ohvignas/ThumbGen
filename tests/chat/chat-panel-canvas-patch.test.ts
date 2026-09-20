import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { useCanvasStore, type AppNode } from "@/store/canvas-store";
import { applyCanvasPatchPart, applyCanvasWorkflowPatchPart } from "@/components/panels/chat/canvas-patch-part";
import type { CanvasPatch, CanvasWorkflowPatch } from "@/lib/canvas/canvas-patch";

const T0 = "2026-09-17T10:00:00.000Z";
const T1 = "2026-09-17T10:00:01.000Z";

const userNode: AppNode = { id: "user-1", type: "prompt", position: { x: 0, y: 0 }, data: {} };
const patch = (overrides: Partial<CanvasPatch> = {}): CanvasPatch => ({
  projectId: "proj-open",
  updatedAt: T1,
  previousUpdatedAt: T0,
  created: true,
  node: { id: "iv-prompt", type: "prompt", position: { x: 620, y: 0 }, data: { prompt: "x", placedByAgentAt: T1 } },
  removedDataKeys: [],
  edges: [],
  ...overrides,
});
const part = (data: unknown) => ({ type: "data-canvas-patch", id: "iv-prompt", data, transient: true });

const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
  useCanvasStore.setState({
    nodes: [userNode],
    edges: [],
    loaded: true,
    loading: false,
    dirty: false,
    saving: false,
    knownUpdatedAt: T0,
    recentOwnSaveUpdatedAts: [],
    currentProjectId: "proj-open",
    history: [{ nodes: [userNode], edges: [] }],
    historyIndex: 0,
  });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockClear();
});

describe("applyCanvasPatchPart", () => {
  it("applies a newer patch of the open miniature without moving the viewport", async () => {
    expect(applyCanvasPatchPart(part(patch()), { openProjectId: "proj-open" })).toBe(true);
    expect(useCanvasStore.getState().nodes.map((n) => n.id)).toEqual(["user-1", "iv-prompt"]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores another project, a replayed patch, other data parts and malformed data", () => {
    const options = { openProjectId: "proj-open" };
    expect(applyCanvasPatchPart(part(patch({ projectId: "proj-other" })), options)).toBe(false);
    expect(applyCanvasPatchPart(part(patch({ updatedAt: T0 })), options)).toBe(false);
    expect(applyCanvasPatchPart({ type: "data-other", data: patch() }, options)).toBe(false);
    expect(applyCanvasPatchPart(part({ projectId: "proj-open" }), options)).toBe(false);
    expect(useCanvasStore.getState().nodes).toEqual([userNode]);
  });

  it("applies (buffers) a patch while the canvas loads", () => {
    useCanvasStore.setState({ loaded: false, loading: true });
    expect(applyCanvasPatchPart(part(patch()), { openProjectId: "proj-open" })).toBe(true);
  });
});

describe("applyCanvasWorkflowPatchPart", () => {
  const workflow = (): CanvasWorkflowPatch => ({
    projectId: "proj-open",
    updatedAt: T1,
    previousUpdatedAt: T0,
    created: [
      { id: "prompt-a", type: "prompt", position: { x: 10, y: 0 }, data: { prompt: "A", placedByAgentAt: T1 } },
      { id: "prompt-b", type: "prompt", position: { x: 10, y: 80 }, data: { prompt: "B", placedByAgentAt: T1 } },
    ],
    updated: [],
    removedIds: [],
    edges: [],
    removedEdges: [],
  });

  it("adds both prompt nodes from one apply_workflow write without moving the viewport", () => {
    expect(
      applyCanvasWorkflowPatchPart(
        { type: "data-canvas-workflow-patch", id: T1, data: workflow(), transient: true },
        { openProjectId: "proj-open" },
      ),
    ).toBe(true);
    expect(useCanvasStore.getState().nodes.map((n) => n.id)).toEqual(["user-1", "prompt-a", "prompt-b"]);
  });
});

describe("ChatPanel — interview wiring", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/components/panels/ChatPanel.tsx"), "utf8");

  it("applies canvas patches from useChat's onData only", () => {
    expect(source).toContain("onData: (dataPart) =>");
    expect(source).toContain("applyAgentCanvasStreamPart(dataPart,");
    const handler = source.slice(source.indexOf("onData: (dataPart) =>"), source.indexOf("onError:"));
    expect(handler).not.toMatch(/sendMessage|addToolOutput|regenerate|resumeStream/);
    expect(handler).not.toMatch(/fitView|setViewport|setCenter|zoomTo|fitNode/);
  });

  it("does not import React Flow viewport helpers for agent writes", () => {
    expect(source).not.toContain("useReactFlow");
    expect(source).not.toMatch(/fitView|setViewport|setCenter|zoomTo/);
  });

  it("detects and answers every client tool, ask_user included, once", () => {
    expect(source).not.toContain('"tool-request_user_image" || p.type === "tool-request_user_sketch"');
    expect(source).toContain("pendingClientToolPart(chatMessages, { stoppedLive })");
    expect(source).toContain("clientToolNameOfPartType(pendingToolPart.type)");
    expect(source).toContain("answeredToolCallIdsRef.current.has(toolCallId)) return;");
    expect(source).toContain("return sending;");
  });
});
