"use client";
import { useEffect, useRef } from "react";
import { useCanvasStore } from "@/store/canvas-store";

const POLL_MS = 2000;

/**
 * Polls the project's updated_at every 2s. When it changes (i.e. another client
 * — the agent loop, a remote MCP client, etc. — modified the canvas), re-loads
 * the project to refresh nodes/edges in the local Zustand store.
 *
 * Caveats:
 * - Polls indefinitely while the component is mounted. Disable in tests if needed.
 * - Skips the reload while the store's `dirty` flag is set (a local edit is
 *   still waiting on its debounced save) so an in-flight drag/delete can't
 *   be overwritten by a reload of the not-yet-saved server state.
 */
export function useCanvasSync(projectId: string) {
  const loadProject = useCanvasStore((s) => s.loadProject);
  const lastUpdatedAt = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fetch(`/api/project/${encodeURIComponent(projectId)}/updated-at`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { updated_at: string | null };
        if (cancelled) return;
        // First poll: just record the baseline
        if (lastUpdatedAt.current === null) {
          lastUpdatedAt.current = data.updated_at;
        } else if (data.updated_at && data.updated_at !== lastUpdatedAt.current) {
          if (useCanvasStore.getState().dirty) {
            // A local edit (drag, delete, etc.) hasn't been persisted yet —
            // reloading now would overwrite it with the stale pre-edit server
            // state, which is exactly what looked like "my change reverted
            // itself". Don't update lastUpdatedAt either: re-check next tick
            // until the debounced save lands and dirty clears, then reload.
            return;
          }
          // External mutation detected — reload
          lastUpdatedAt.current = data.updated_at;
          await loadProject(projectId);
        }
      } catch {
        // Silent: network blip, will retry next tick
      } finally {
        if (!cancelled) timer = setTimeout(tick, POLL_MS);
      }
    };

    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [projectId, loadProject]);
}
