"use client";
import { useEffect } from "react";
import { useCanvasStore } from "@/store/canvas-store";
import { isKnownUpdatedAt } from "@/lib/canvas/canvas-patch";
import { isCanvasGenerating } from "@/lib/canvas/generation-state";
import { debugLog } from "@/lib/debug-log";
import type { LoadProjectOptions } from "@/lib/canvas/load-guard";

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
 * - Skips the reload while the store's `dirty`, `saving`, or `loading` flag
 *   is set so an in-flight add/drag/save/load can't be overwritten by a
 *   snapshot taken before that edit landed.
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
 * - `loadProject(..., { reason: "poll" })` then treats tomb/rehydrate echoes
 *   as `same` and keeps local `position` (controlled React Flow: onNodesChange
 *   already applied the drag; persist key includes x/y).
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
  loadProject: (projectId: string, options?: LoadProjectOptions) => Promise<void>,
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
        if (state.dirty || state.saving || state.loading || isCanvasGenerating(state.nodes)) {
          debugLog("canvas-load", "poll skip in-flight", {
            projectId,
            dirty: state.dirty,
            saving: state.saving,
            loading: state.loading,
            generating: isCanvasGenerating(state.nodes),
            serverUpdatedAt: data.updated_at,
          });
          return;
        }
        if (isKnownUpdatedAt(data.updated_at, state.knownUpdatedAt) || state.recentOwnSaveUpdatedAts.includes(data.updated_at)) {
          // This tick is observing one of the app's own recent autosaves
          // landing (see the doc comment above) — not an external mutation.
          // Re-baseline so it isn't re-detected, but don't reload.
          debugLog("canvas-load", "poll skip known", { projectId, updatedAt: data.updated_at });
          lastUpdatedAt = data.updated_at;
          return;
        }
        // External mutation detected — reload
        debugLog("canvas-load", "poll reload", {
          projectId,
          from: lastUpdatedAt,
          to: data.updated_at,
          knownUpdatedAt: state.knownUpdatedAt,
        });
        lastUpdatedAt = data.updated_at;
        await loadProject(projectId, { reason: "poll" });
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
