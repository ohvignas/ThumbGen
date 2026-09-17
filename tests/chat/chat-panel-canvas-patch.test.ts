import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { useCanvasStore, type AppNode } from "@/store/canvas-store";
import { applyCanvasPatchPart } from "@/components/panels/chat/canvas-patch-part";
import type { CanvasPatch } from "@/lib/canvas/canvas-patch";

const T0 = "2026-09-17T10:00:00.000Z";
const T1 = "2026-09-17T10:00:01.000Z";

const userNode: AppNode = { id: "user-1", type: "prompt", position: { x: 0, y: 0 }, data: {} };
const patch = (overrides: Partial<CanvasPatch> = {}): CanvasPatch => ({
  projectId: "proj-open",
  updatedAt: T1,
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
  it("applies a newer patch of the open miniature and centers the node", async () => {
    const fitNode = vi.fn();
    expect(applyCanvasPatchPart(part(patch()), { openProjectId: "proj-open", fitNode, reducedMotion: false })).toBe(true);
    expect(useCanvasStore.getState().nodes.map((n) => n.id)).toEqual(["user-1", "iv-prompt"]);
    expect(fitNode).toHaveBeenCalledWith("iv-prompt", 400);
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("centers without animation when motion is reduced", () => {
    const fitNode = vi.fn();
    applyCanvasPatchPart(part(patch()), { openProjectId: "proj-open", fitNode, reducedMotion: true });
    expect(fitNode).toHaveBeenCalledWith("iv-prompt", 0);
  });

  it("ignores another project, a replayed patch, other data parts and malformed data", () => {
    const fitNode = vi.fn();
    const options = { openProjectId: "proj-open", fitNode, reducedMotion: false };
    expect(applyCanvasPatchPart(part(patch({ projectId: "proj-other" })), options)).toBe(false);
    expect(applyCanvasPatchPart(part(patch({ updatedAt: T0 })), options)).toBe(false);
    expect(applyCanvasPatchPart({ type: "data-other", data: patch() }, options)).toBe(false);
    expect(applyCanvasPatchPart(part({ projectId: "proj-open" }), options)).toBe(false);
    expect(fitNode).not.toHaveBeenCalled();
    expect(useCanvasStore.getState().nodes).toEqual([userNode]);
  });

  it("applies (buffers) a patch while the canvas loads, without centering an absent node", () => {
    useCanvasStore.setState({ loaded: false, loading: true });
    const fitNode = vi.fn();
    expect(applyCanvasPatchPart(part(patch()), { openProjectId: "proj-open", fitNode, reducedMotion: false })).toBe(true);
    expect(fitNode).not.toHaveBeenCalled();
  });
});

describe("ChatPanel — interview wiring", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/components/panels/ChatPanel.tsx"), "utf8");

  it("applies canvas patches from useChat's onData only", () => {
    expect(source).toContain("onData: (dataPart) =>");
    expect(source).toContain("applyCanvasPatchPart(dataPart,");
    const handler = source.slice(source.indexOf("onData: (dataPart) =>"), source.indexOf("onData: (dataPart) =>") + 400);
    expect(handler).not.toMatch(/sendMessage|addToolOutput|regenerate|resumeStream/);
  });

  it("detects and answers every client tool, ask_user included, once", () => {
    expect(source).not.toContain('"tool-request_user_image" || p.type === "tool-request_user_sketch"');
    expect(source.match(/clientToolNameOfPartType\(/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source).toContain("answeredToolCallIdsRef.current.has(toolCallId)) return;");
    expect(source).toContain("return sending;");
  });
});
