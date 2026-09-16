import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useCanvasStore } from "@/store/canvas-store";
import { createProjectSyncPoller } from "@/hooks/useCanvasSync";

/**
 * Reproduces the bug: undo (⌘Z / the toolbar Undo button) stops working a
 * few seconds after adding or duplicating a node.
 *
 * Root cause: useCanvasSync polls `/api/project/<id>/updated-at` every 2s.
 * The app's own debounced autosave (canvas-store's `debouncedSave` /
 * `saveProject`, ~2s after an edit) moves the server's `updated_at` and
 * clears `dirty`. The poll only skips a reload while `dirty` is true; once
 * the save lands, the very next tick sees an `updated_at` it doesn't
 * recognize and — having no way to tell "my own save" from "an external
 * change" — treats it as an external mutation and calls `loadProject`.
 * `loadProject` resets `history` to a single snapshot (`historyIndex: 0`),
 * wiping the undo stack.
 */

// Simulates the real backend closely enough to exercise the poller
// end-to-end: GET .../updated-at reflects the server's current timestamp;
// POST /api/project (the store's real saveProject call) advances it and
// returns the new value, mirroring local-storage.ts's saveProject + the
// /api/project route.
function createFakeServer(initialUpdatedAt: string) {
  let updatedAt = initialUpdatedAt;
  let saveCount = 0;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/updated-at")) {
      return { ok: true, json: async () => ({ updated_at: updatedAt }) };
    }
    if (u === "/api/project" && init?.method === "POST") {
      saveCount++;
      updatedAt = `SELF-SAVE-${saveCount}`;
      return { ok: true, json: async () => ({ success: true, updatedAt }) };
    }
    return { ok: true, json: async () => ({}) };
  });
  return {
    fetchMock,
    bumpExternally(value: string) {
      updatedAt = value;
    },
  };
}

function seed(projectId: string) {
  useCanvasStore.setState({
    nodes: [],
    edges: [],
    loaded: true,
    saving: false,
    dirty: false,
    currentProjectId: projectId,
    history: [{ nodes: [], edges: [] }],
    historyIndex: 0,
    nodePicker: null,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useCanvasSync poller vs the app's own autosave", () => {
  it("keeps the undo history after adding a node, once the poll observes the app's own autosave landing", async () => {
    const server = createFakeServer("T0");
    vi.stubGlobal("fetch", server.fetchMock);
    seed("sync-test");

    const loadProject = vi.fn(async () => {});
    const poller = createProjectSyncPoller("sync-test", loadProject);

    // Baseline poll, before any edit.
    await poller.tick();

    // User adds a node (this is what « Ajouter une étape » / the right-click
    // "Ajouter" and "Dupliquer" menu items do under the hood).
    useCanvasStore.getState().addNode("prompt", { x: 0, y: 0 });
    await vi.advanceTimersByTimeAsync(300); // let pushHistory's debounce fire
    expect(useCanvasStore.getState().historyIndex).toBe(1);
    expect(useCanvasStore.getState().canUndo()).toBe(true);

    // A poll tick while the debounced autosave hasn't landed yet (dirty)
    // must not reload.
    await poller.tick();
    expect(loadProject).not.toHaveBeenCalled();

    // Let the debounced autosave (2s) fire and land.
    await vi.advanceTimersByTimeAsync(2000);
    expect(useCanvasStore.getState().dirty).toBe(false);

    // The next poll tick observes the new updated_at — from the app's own
    // save, not an external client. It must NOT reload, and the undo
    // history/Undo button must still reflect the add.
    await poller.tick();

    expect(loadProject).not.toHaveBeenCalled();
    expect(useCanvasStore.getState().historyIndex).toBe(1);
    expect(useCanvasStore.getState().canUndo()).toBe(true);
  });

  it("still reloads when another client (the agent loop / a remote MCP client) changes the project externally", async () => {
    const server = createFakeServer("T0");
    vi.stubGlobal("fetch", server.fetchMock);
    seed("sync-test");

    const loadProject = vi.fn(async () => {});
    const poller = createProjectSyncPoller("sync-test", loadProject);

    await poller.tick(); // baseline

    server.bumpExternally("EXTERNAL-1");
    await poller.tick();

    expect(loadProject).toHaveBeenCalledWith("sync-test");
  });
});
