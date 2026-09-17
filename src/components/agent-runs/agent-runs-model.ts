import type { AgentRunsSnapshot, AttentionEntry, AttentionKind } from "@/lib/agent/v2/run-types";

export const RUNS_POLL_ACTIVE_MS = 3_000;
export const RUNS_POLL_IDLE_MS = 30_000;
export const RUNS_MEMORY_KEY = "thumbgen.agentRuns.v1";
export const EMPTY_RUNS: AgentRunsSnapshot = { running: [], attention: [] };

/** Per browser: the last endedAt seen and toasted, by conversation. */
export type RunsMemory = { seen: Record<string, number>; toasted: Record<string, number> };

function numberRecord(value: unknown): Record<string, number> {
  if (typeof value !== "object" || value === null) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
  );
}

export function parseRunsMemory(raw: string | null): RunsMemory {
  if (!raw) return { seen: {}, toasted: {} };
  try {
    const parsed = JSON.parse(raw) as { seen?: unknown; toasted?: unknown } | null;
    return { seen: numberRecord(parsed?.seen), toasted: numberRecord(parsed?.toasted) };
  } catch {
    return { seen: {}, toasted: {} };
  }
}

export function nextPollDelay(snapshot: AgentRunsSnapshot): number {
  return snapshot.running.length > 0 ? RUNS_POLL_ACTIVE_MS : RUNS_POLL_IDLE_MS;
}

export function unseenAttentions(snapshot: AgentRunsSnapshot, memory: RunsMemory): AttentionEntry[] {
  return snapshot.attention.filter((entry) => entry.endedAt > (memory.seen[entry.conversationId] ?? 0));
}

/** The record with each entry's endedAt, or null when nothing would change. */
function recordEndedAt(record: Record<string, number>, entries: AttentionEntry[]): Record<string, number> | null {
  let next: Record<string, number> | null = null;
  for (const entry of entries) {
    if ((record[entry.conversationId] ?? 0) >= entry.endedAt) continue;
    next ??= { ...record };
    next[entry.conversationId] = entry.endedAt;
  }
  return next;
}

export function markSeenEntries(memory: RunsMemory, entries: AttentionEntry[]): RunsMemory {
  const seen = recordEndedAt(memory.seen, entries);
  return seen ? { ...memory, seen } : memory;
}

export function markToasted(memory: RunsMemory, entries: AttentionEntry[]): RunsMemory {
  const toasted = recordEndedAt(memory.toasted, entries);
  return toasted ? { ...memory, toasted } : memory;
}

/** Unseen, not toasted yet, and not about the miniature open right now. */
export function toastsToFire(snapshot: AgentRunsSnapshot, memory: RunsMemory, openProjectId: string | null): AttentionEntry[] {
  return unseenAttentions(snapshot, memory).filter(
    (entry) => entry.projectId !== openProjectId && entry.endedAt > (memory.toasted[entry.conversationId] ?? 0),
  );
}

/** Forgets conversations the registry no longer lists (their run was removed after 5 minutes). */
export function pruneRunsMemory(memory: RunsMemory, snapshot: AgentRunsSnapshot): RunsMemory {
  const listed = new Set(snapshot.attention.map((entry) => entry.conversationId));
  const prune = (record: Record<string, number>) => {
    const entries = Object.entries(record);
    const kept = entries.filter(([conversationId]) => listed.has(conversationId));
    return kept.length === entries.length ? record : Object.fromEntries(kept);
  };
  const seen = prune(memory.seen);
  const toasted = prune(memory.toasted);
  return seen === memory.seen && toasted === memory.toasted ? memory : { seen, toasted };
}

const TOAST_TITLES: Record<AttentionKind, string> = {
  finished: "L'agent a fini",
  error: "L'agent s'est arrêté sur une erreur",
  question: "L'agent te pose une question",
};

export function attentionToastTitle(entry: AttentionEntry): string {
  return `${TOAST_TITLES[entry.kind]} — ${entry.projectName}`;
}

export function openProjectIdFromPath(pathname: string | null): string | null {
  const match = pathname?.match(/^\/m\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export type RunIndicatorState = "running" | "attention" | null;

/** For one project, or for every project when projectId is omitted (sidebar). */
export function runIndicatorState(snapshot: AgentRunsSnapshot, unseen: AttentionEntry[], projectId?: string): RunIndicatorState {
  const concerned = (entry: { projectId: string }) => projectId === undefined || entry.projectId === projectId;
  if (snapshot.running.some(concerned)) return "running";
  return unseen.some(concerned) ? "attention" : null;
}

/**
 * Conversation to open with a miniature: the one where a turn runs, else the
 * newest one where a turn just ended (seen or not: the open page marks it seen
 * at once), else the most recent conversation (the list is sorted that way).
 */
export function pickConversationId(conversations: { id: string }[], snapshot: AgentRunsSnapshot, projectId: string): string | null {
  const ids = new Set(conversations.map((conversation) => conversation.id));
  const here = <T extends { projectId: string; conversationId: string }>(entry: T) => entry.projectId === projectId && ids.has(entry.conversationId);
  const running = snapshot.running.filter(here).sort((a, b) => b.startedAt - a.startedAt)[0];
  if (running) return running.conversationId;
  const ended = snapshot.attention.filter(here).sort((a, b) => b.endedAt - a.endedAt)[0];
  if (ended) return ended.conversationId;
  return conversations[0]?.id ?? null;
}
