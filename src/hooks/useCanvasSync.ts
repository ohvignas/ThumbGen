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
 * - On conflict (local unsaved changes + external mutation), `loadProject`
 *   replaces the local state. Mono-user app — acceptable for v1.
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
