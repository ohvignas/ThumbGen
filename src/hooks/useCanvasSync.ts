"use client";
import { useEffect } from "react";
import { useCanvasStore } from "@/store/canvas-store";
import { isKnownUpdatedAt } from "@/lib/canvas/canvas-patch";

const POLL_MS = 2000;

/**
 * The polling decision logic, extracted from the React effect so it can be
 * unit-tested directly (no DOM/React renderer needed) and so its per-poller
 * state (`lastUpdatedAt`) isn't tangled up with `useRef`/`useEffect` timing.
 *
 * Polls the project's updated_at every `POLL_MS` (via the caller's loop).
 * When it changes (i.e. another client — the agent loop, a remote MCP
 * client, etc. — modified the canvas), reloads the project to refresh
 * nodes/edges in the local Zustand store.
 *
 * Caveats:
 * - Skips the reload while the store's `dirty` flag is set (a local edit is
 *   still waiting on its debounced save) so an in-flight drag/delete can't
 *   be overwritten by a reload of the not-yet-saved server state.
 * - Skips the reload when the new `updated_at` is one of the store's
 *   `recentOwnSaveUpdatedAts` (populated by `saveProject` from the server's
 *   response): that's this app's OWN debounced autosave landing, not an
 *   external change, and reloading would wipe the local undo history for no
 *   reason (see canvas-store.ts's `loadProject`, which resets `history` to a
 *   single snapshot). The baseline is still advanced so this same value
 *   isn't re-evaluated on the next tick. A bounded set (not just the latest
 *   value) is checked because a poll's GET can be answered, after a second
 *   self-save has already landed, with an earlier self-save's timestamp —
 *   still legitimately our own.
 * - Skips the reload when the new `updated_at` is not after the store's
 *   `knownUpdatedAt` (chantier F2): the canvas already holds that state — an
 *   agent patch applied live, or a save whose response set it. Server
 *   timestamps strictly increase per project, so anything newer is external.
 * - Stops touching the store once `stop()` has been called: a tick's fetch
 *   can still be in flight when the caller (useCanvasSync's effect cleanup)
 *   unmounts or switches to a different project. Without this, a late
 *   response would call `loadProject(oldProjectId)` against the *current*
 *   (now different) store, silently swapping the canvas back to the old
 *   project's content.
 */
export function createProjectSyncPoller(
  projectId: string,
  loadProject: (projectId: string) => Promise<void>,
) {
  let lastUpdatedAt: string | null = null;
  let stopped = false;

  function stop() {
    stopped = true;
  }

  async function tick() {
    try {
      const res = await fetch(`/api/project/${encodeURIComponent(projectId)}/updated-at`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { updated_at: string | null };
      if (stopped) return;

      // First poll: just record the baseline
      if (lastUpdatedAt === null) {
        lastUpdatedAt = data.updated_at;
        return;
      }
      if (data.updated_at && data.updated_at !== lastUpdatedAt) {
        const state = useCanvasStore.getState();
        if (state.dirty) {
          // A local edit (drag, delete, etc.) hasn't been persisted yet —
          // reloading now would overwrite it with the stale pre-edit server
          // state, which is exactly what looked like "my change reverted
          // itself". Don't update lastUpdatedAt either: re-check next tick
          // until the debounced save lands and dirty clears, then reload.
          return;
        }
        if (isKnownUpdatedAt(data.updated_at, state.knownUpdatedAt) || state.recentOwnSaveUpdatedAts.includes(data.updated_at)) {
          // This tick is observing one of the app's own recent autosaves
          // landing (see the doc comment above) — not an external mutation.
          // Re-baseline so it isn't re-detected, but don't reload.
          lastUpdatedAt = data.updated_at;
          return;
        }
        // External mutation detected — reload
        lastUpdatedAt = data.updated_at;
        await loadProject(projectId);
      }
    } catch {
      // Silent: network blip, will retry next tick
    }
  }

  return { tick, stop };
}

export function useCanvasSync(projectId: string) {
  const loadProject = useCanvasStore((s) => s.loadProject);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poller = createProjectSyncPoller(projectId, loadProject);

    const loop = async () => {
      await poller.tick();
      if (!cancelled) timer = setTimeout(loop, POLL_MS);
    };

    loop();

    return () => {
      cancelled = true;
      poller.stop();
      if (timer) clearTimeout(timer);
    };
  }, [projectId, loadProject]);
}
