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

// Resets every field the poller or the store actions under test read/write,
// so tests can't pass (or fail) depending on what a previous test left
// behind in this module-level singleton store.
function seed(projectId: string) {
  useCanvasStore.setState({
    nodes: [],
    edges: [],
    loaded: true,
    saving: false,
    dirty: false,
    recentOwnSaveUpdatedAts: [],
    deletedNodeIds: [],
    deletedEdgeIds: [],
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

    expect(loadProject).toHaveBeenCalledWith("sync-test", { reason: "poll" });
  });

  it("reloads for a genuine external change that arrives after the app's own save has already landed", async () => {
    // Interleaving: own save lands -> a tick doesn't reload -> an external
    // change bumps updated_at -> the next tick reloads.
    const server = createFakeServer("T0");
    vi.stubGlobal("fetch", server.fetchMock);
    seed("sync-test");

    const loadProject = vi.fn(async () => {});
    const poller = createProjectSyncPoller("sync-test", loadProject);

    await poller.tick(); // baseline T0

    useCanvasStore.getState().addNode("prompt", { x: 0, y: 0 });
    await vi.advanceTimersByTimeAsync(2300); // history debounce + save debounce

    // The own save landed — this tick must recognize it and not reload.
    await poller.tick();
    expect(loadProject).not.toHaveBeenCalled();

    // Now a genuine external client writes to the project.
    server.bumpExternally("EXTERNAL-1");
    await poller.tick();

    expect(loadProject).toHaveBeenCalledWith("sync-test", { reason: "poll" });
  });

  it("documents current behaviour: an external change that lands while a local edit is dirty is overwritten by the pending autosave, and is not itself surfaced as a reload", async () => {
    // Interleaving: external change while dirty -> own save lands -> next tick.
    //
    // What actually happens: the poll skips the tick that sees the external
    // write because the store is dirty (a local edit is mid-flight). It does
    // NOT advance its baseline while skipping. When the local debounced save
    // fires, saveProject POSTs whatever the local nodes/edges currently are
    // — which don't include the external client's change — so that save
    // silently overwrites the external write on the server (last write
    // wins; this save path doesn't merge, and that's pre-existing,
    // unrelated to this fix). The next tick then observes the resulting
    // updated_at, recognizes it as the app's own save (it's in
    // recentOwnSaveUpdatedAts), and does not reload. Net effect: the
    // external edit is lost either way (old or new poller logic) — what
    // this fix changes is that the local undo history survives instead of
    // being wiped by a spurious reload.
    const server = createFakeServer("T0");
    vi.stubGlobal("fetch", server.fetchMock);
    seed("sync-test");

    const loadProject = vi.fn(async () => {});
    const poller = createProjectSyncPoller("sync-test", loadProject);

    await poller.tick(); // baseline T0

    // Local edit starts — dirty until its debounced save (2000ms) lands.
    useCanvasStore.getState().addNode("prompt", { x: 0, y: 0 });
    await vi.advanceTimersByTimeAsync(300); // history debounce only
    expect(useCanvasStore.getState().dirty).toBe(true);

    // Meanwhile, another client writes to the server.
    server.bumpExternally("EXTERNAL-mid-edit");
    await poller.tick();
    expect(loadProject).not.toHaveBeenCalled(); // skipped: dirty

    // The local debounced save now fires and overwrites the external write.
    await vi.advanceTimersByTimeAsync(2000);
    expect(useCanvasStore.getState().dirty).toBe(false);

    // The next tick observes the app's own save landing, not a reload-worthy
    // external change.
    await poller.tick();
    expect(loadProject).not.toHaveBeenCalled();
  });

  it("recognizes any of several recent self-saves, not just the latest, so a late GET can't be mistaken for an external change", async () => {
    // Race: a poll GET issued before a second self-save (S2) commits can
    // still be *answered* (network/server scheduling) with the *first*
    // self-save's (S1) timestamp, after S2 has already landed client-side
    // and (with a single-value baseline) overwritten the memory of S1. A
    // bounded set, checked by membership, fixes this: both S1 and S2 are
    // still recognized as our own.
    seed("sync-test");
    useCanvasStore.setState({ recentOwnSaveUpdatedAts: ["SELF-1", "SELF-2"] });

    const loadProject = vi.fn(async () => {});
    const poller = createProjectSyncPoller("sync-test", loadProject);

    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ updated_at: "T0" }) })));
    await poller.tick(); // baseline T0

    // A late GET reports SELF-1 (the older, non-latest self-save).
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ updated_at: "SELF-1" }) })));
    await poller.tick();

    expect(loadProject).not.toHaveBeenCalled();
  });

  it("does not reload when stop() is called while a tick's fetch is still in flight", async () => {
    // Regression test: switching to another project (ProjectBar / /m/[id])
    // or unmounting while a poll's fetch is in flight must not let that
    // stale tick call loadProject(oldProjectId) against the now-current
    // store once the response finally arrives.
    seed("sync-test");

    const loadProject = vi.fn(async () => {});
    const poller = createProjectSyncPoller("sync-test", loadProject);

    // Baseline tick, resolved immediately.
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ updated_at: "T0" }) })));
    await poller.tick();

    // Second tick: leave the fetch deliberately unresolved so we can call
    // stop() while it's still in flight, then resolve it with a genuine
    // external change (something that, if not for stop(), would reload).
    let resolveFetch!: (v: { ok: true; json: () => Promise<{ updated_at: string }> }) => void;
    const pending = new Promise<{ ok: true; json: () => Promise<{ updated_at: string }> }>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal("fetch", vi.fn(() => pending));

    const tickPromise = poller.tick();
    poller.stop(); // e.g. the effect cleanup ran: switched project / unmounted
    resolveFetch({ ok: true, json: async () => ({ updated_at: "EXTERNAL-1" }) });
    await tickPromise;

    expect(loadProject).not.toHaveBeenCalled();
  });

  it("does not reload while a generation is in flight, even if updated_at changed", async () => {
    const server = createFakeServer("T0");
    vi.stubGlobal("fetch", server.fetchMock);
    seed("sync-test");
    useCanvasStore.setState({
      dirty: false,
      saving: false,
      nodes: [
        {
          id: "prev",
          type: "preview",
          position: { x: 0, y: 0 },
          data: { genStatus: "loading", label: "Variante A" },
        },
      ],
    });

    const loadProject = vi.fn(async () => {});
    const poller = createProjectSyncPoller("sync-test", loadProject);
    await poller.tick();
    server.bumpExternally("EXTERNAL-1");
    await poller.tick();
    expect(loadProject).not.toHaveBeenCalled();
  });

  it("does not reload while saving, even if updated_at changed", async () => {
    const server = createFakeServer("T0");
    vi.stubGlobal("fetch", server.fetchMock);
    seed("sync-test");
    useCanvasStore.setState({ saving: true, dirty: false });

    const loadProject = vi.fn(async () => {});
    const poller = createProjectSyncPoller("sync-test", loadProject);
    await poller.tick();
    server.bumpExternally("EXTERNAL-1");
    await poller.tick();
    expect(loadProject).not.toHaveBeenCalled();
  });

  it("does not dirty the store when a poll reload is the same persistable graph", async () => {
    const node = { id: "n1", type: "prompt", position: { x: 0, y: 0 }, data: {} };
    seed("sync-test");
    useCanvasStore.setState({
      nodes: [node],
      edges: [],
      knownUpdatedAt: "T0",
      dirty: false,
      history: [{ nodes: [node], edges: [] }],
    });
    let updatedAt = "T0";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("/updated-at")) return { ok: true, json: async () => ({ updated_at: updatedAt }) };
        if (String(url).startsWith("/api/project?id=")) {
          return {
            ok: true,
            json: async () => ({ nodes: [node], edges: [], updatedAt: "T1", deletedNodeIds: [], deletedEdgeIds: [] }),
          };
        }
        return { ok: true, json: async () => ({}) };
      }),
    );

    const poller = createProjectSyncPoller("sync-test", useCanvasStore.getState().loadProject);
    await poller.tick();
    updatedAt = "T1";
    await poller.tick();

    expect(useCanvasStore.getState().dirty).toBe(false);
    expect(useCanvasStore.getState().nodes).toHaveLength(1);
    expect(useCanvasStore.getState().knownUpdatedAt).toBe("T1");
  });
});
