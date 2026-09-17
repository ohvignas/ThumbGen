"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import type { AgentRunsSnapshot, AttentionEntry } from "@/lib/agent/v2/run-types";
import {
  EMPTY_RUNS,
  RUNS_MEMORY_KEY,
  RUNS_POLL_ACTIVE_MS,
  RUNS_POLL_IDLE_MS,
  attentionToastTitle,
  markSeenEntries,
  markToasted,
  mergeRunsMemory,
  nextPollDelay,
  openProjectIdFromPath,
  parseRunsMemory,
  pruneRunsMemory,
  toastsToFire,
  unseenAttentions,
  type RunsMemory,
} from "./agent-runs-model";

export type AgentRunsContextValue = {
  snapshot: AgentRunsSnapshot;
  /** Ended turns this browser has not seen yet. */
  unseen: AttentionEntry[];
  /** Fetches GET /api/agent/runs now; resolves to the latest snapshot (the previous one on failure). */
  refreshRuns: () => Promise<AgentRunsSnapshot>;
  markSeen: (conversationIds: string[]) => void;
  /**
   * The latest snapshot's endings that were unseen when the open miniature was
   * opened — still unseen, or marked seen by this page since (it marks its own
   * endings seen at once). Used to choose the conversation to open.
   */
  unseenOnArrival: () => AttentionEntry[];
};

export const AgentRunsContext = createContext<AgentRunsContextValue>({
  snapshot: EMPTY_RUNS,
  unseen: [],
  refreshRuns: async () => EMPTY_RUNS,
  markSeen: () => {},
  unseenOnArrival: () => [],
});

export function useAgentRuns(): AgentRunsContextValue {
  return useContext(AgentRunsContext);
}

function readMemory(): RunsMemory {
  try {
    return parseRunsMemory(localStorage.getItem(RUNS_MEMORY_KEY));
  } catch {
    // Server render, private mode or blocked storage.
    return parseRunsMemory(null);
  }
}

function writeMemory(memory: RunsMemory): void {
  try {
    localStorage.setItem(RUNS_MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // Storage unavailable: seen state just won't persist.
  }
}

/**
 * Agent turns running or just ended anywhere in the app (chantier F1): polls
 * GET /api/agent/runs, marks the open miniature's endings seen, and raises one
 * toast per other ending.
 */
export function AgentRunsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<AgentRunsSnapshot>(EMPTY_RUNS);
  const [memory, setMemory] = useState<RunsMemory>(readMemory);
  const snapshotRef = useRef<AgentRunsSnapshot>(EMPTY_RUNS);
  const memoryRef = useRef<RunsMemory>(memory);
  const openProjectId = openProjectIdFromPath(pathname);
  const openProjectIdRef = useRef<string | null>(openProjectId);

  // The toast action reads the router through a ref: refreshRuns (and the polling
  // effects that depend on it) must never be recreated because a router object changed.
  const routerRef = useRef(router);

  // Endings (conversationId → endedAt) this page marked seen because its miniature is open.
  const seenOnArrivalRef = useRef(new Map<string, number>());

  useEffect(() => {
    openProjectIdRef.current = openProjectId;
    seenOnArrivalRef.current = new Map();
  }, [openProjectId]);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  const commitMemory = useCallback((next: RunsMemory) => {
    if (next === memoryRef.current) return;
    memoryRef.current = next;
    setMemory(next);
    writeMemory(next);
  }, []);

  // Numbers each fetch: a response older than one already applied is ignored.
  const requestSeqRef = useRef(0);
  const appliedSeqRef = useRef(0);

  const refreshRuns = useCallback(async (): Promise<AgentRunsSnapshot> => {
    const seq = ++requestSeqRef.current;
    let next: AgentRunsSnapshot;
    try {
      const res = await fetch("/api/agent/runs", { cache: "no-store" });
      if (!res.ok) return snapshotRef.current;
      next = (await res.json()) as AgentRunsSnapshot;
    } catch {
      return snapshotRef.current;
    }
    if (seq < appliedSeqRef.current) return snapshotRef.current;
    appliedSeqRef.current = seq;
    snapshotRef.current = next;
    setSnapshot(next);

    // The open miniature's endings are seen at once; every other one gets a single toast.
    // Another tab may have seen or toasted some of them since: its entries are read back first.
    const open = openProjectIdRef.current;
    const current = mergeRunsMemory(memoryRef.current, readMemory());
    const arrivedUnseen = unseenAttentions(next, current).filter((entry) => entry.projectId === open);
    for (const entry of arrivedUnseen) seenOnArrivalRef.current.set(entry.conversationId, entry.endedAt);
    const seen = markSeenEntries(current, arrivedUnseen);
    const toFire = toastsToFire(next, seen, open);
    for (const entry of toFire) {
      toast({
        id: `agent-run-${entry.conversationId}-${entry.endedAt}`,
        title: attentionToastTitle(entry),
        action: { label: "Ouvrir", onClick: () => routerRef.current.push(`/m/${entry.projectId}`) },
      });
    }
    commitMemory(pruneRunsMemory(markToasted(seen, toFire), next));
    return next;
  }, [commitMemory]);

  // On mount and on every navigation (when the indicators matter)…
  useEffect(() => {
    const run = async () => {
      await refreshRuns();
    };
    void run();
  }, [pathname, refreshRuns]);

  // …then every 3 s while a turn runs somewhere, every 30 s otherwise.
  const active = snapshot.running.length > 0;
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (delay: number) => {
      timer = setTimeout(async () => {
        const next = await refreshRuns();
        if (!cancelled) schedule(nextPollDelay(next));
      }, delay);
    };
    schedule(active ? RUNS_POLL_ACTIVE_MS : RUNS_POLL_IDLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, refreshRuns]);

  const markSeen = useCallback(
    (conversationIds: string[]) => {
      const entries = snapshotRef.current.attention.filter((entry) => conversationIds.includes(entry.conversationId));
      commitMemory(markSeenEntries(mergeRunsMemory(memoryRef.current, readMemory()), entries));
    },
    [commitMemory],
  );

  const unseenOnArrival = useCallback((): AttentionEntry[] => {
    const latest = snapshotRef.current;
    const stillUnseen = unseenAttentions(latest, memoryRef.current);
    return latest.attention.filter(
      (entry) => stillUnseen.includes(entry) || seenOnArrivalRef.current.get(entry.conversationId) === entry.endedAt,
    );
  }, []);

  const unseen = useMemo(() => unseenAttentions(snapshot, memory), [snapshot, memory]);
  const value = useMemo<AgentRunsContextValue>(
    () => ({ snapshot, unseen, refreshRuns, markSeen, unseenOnArrival }),
    [snapshot, unseen, refreshRuns, markSeen, unseenOnArrival],
  );

  return <AgentRunsContext.Provider value={value}>{children}</AgentRunsContext.Provider>;
}
