import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useCanvasStore, type AppNode } from "@/store/canvas-store";
import {
  fetchAgentSnapshots,
  formatSnapshotTime,
  restoreAgentSnapshot,
  snapshotReasonLabel,
} from "@/lib/canvas/agent-history";

describe("agent history labels", () => {
  it("names each snapshot reason in French", () => {
    expect(snapshotReasonLabel("apply_workflow")).toBe("Avant modification de l'agent");
    expect(snapshotReasonLabel("restore")).toBe("Avant restauration");
  });

  it("shows only the time for a snapshot of today, the date too otherwise", () => {
    const now = new Date(2026, 8, 17, 18, 0);
    const today = new Date(2026, 8, 17, 8, 32).toISOString();
    const yesterday = new Date(2026, 8, 16, 21, 5).toISOString();
    expect(formatSnapshotTime(today, now)).toBe("08:32");
    expect(formatSnapshotTime(yesterday, now)).toBe("16/09 21:05");
  });
});

describe("agent history requests", () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("lists the project's snapshots without cache", async () => {
    const snapshots = [{ id: "s1", created_at: "2026-09-17T08:32:00.000Z", reason: "apply_workflow", node_count: 14, edge_count: 8 }];
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ snapshots }) });
    await expect(fetchAgentSnapshots("proj 1")).resolves.toEqual(snapshots);
    expect(fetchMock).toHaveBeenCalledWith("/api/project/proj%201/snapshots", { cache: "no-store" });
  });

  it("throws a French message when the list fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Projet introuvable" }) });
    await expect(fetchAgentSnapshots("p")).rejects.toThrow("Projet introuvable");
  });

  it("restores as a JSON POST", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, updated_at: "2026-09-17T09:00:00.000Z" }) });
    await restoreAgentSnapshot("p", "s/1");
    expect(fetchMock).toHaveBeenCalledWith("/api/project/p/snapshots/s%2F1/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  });

  it("throws when the restore fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Instantané introuvable" }) });
    await expect(restoreAgentSnapshot("p", "s")).rejects.toThrow("Instantané introuvable");
  });
});

describe("flushPendingSave", () => {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<{ ok: boolean; json: () => Promise<object> }>>(
    async () => ({ ok: true, json: async () => ({}) }),
  );
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchMock);
    useCanvasStore.setState({
      nodes: [],
      edges: [],
      loaded: true,
      saving: false,
      dirty: false,
      recentOwnSaveUpdatedAts: [],
      currentProjectId: "flush-test",
      history: [{ nodes: [], edges: [] }],
      historyIndex: 0,
    });
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fetchMock.mockClear();
  });

  const saves = () => fetchMock.mock.calls.filter(([url, init]) => url === "/api/project" && init?.method === "POST");

  it("saves a pending edit now and cancels the debounced save", async () => {
    const node: AppNode = { id: "n", type: "prompt", position: { x: 0, y: 0 }, data: { prompt: "x" } };
    useCanvasStore.getState().addNode("prompt", node.position, node.data);
    expect(useCanvasStore.getState().dirty).toBe(true);

    await useCanvasStore.getState().flushPendingSave();
    expect(saves()).toHaveLength(1);
    expect(useCanvasStore.getState().dirty).toBe(false);

    await vi.advanceTimersByTimeAsync(5000);
    expect(saves()).toHaveLength(1);
  });

  it("does nothing when there is no pending edit", async () => {
    await useCanvasStore.getState().flushPendingSave();
    expect(saves()).toHaveLength(0);
  });
});
