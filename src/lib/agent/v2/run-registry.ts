import type { UIMessageChunk } from "ai";
import type { EndedRunStatus, RunStatus, RunSummary } from "./run-types";
import { CLIENT_TOOL_NAME_SET } from "@/lib/agent/client-tools";

/**
 * In-process registry of agent turns (chantier F1). A turn belongs to its run,
 * not to an HTTP request: the chat route reads the model's UI stream to the end
 * into `chunks`, and every response (the sender's, a reconnection) is only a
 * subscriber. Like src/lib/youtube/runtime.ts it lives on globalThis (route
 * bundles and dev hot reloads must share it). Nothing survives a restart.
 */

/** An ended run stays listed (attention, late reconnection) this long. */
export const RUN_RETENTION_MS = 5 * 60_000;
/** Soft cap of the buffer: past it, consecutive deltas of one part are merged. */
export const RUN_CHUNK_SOFT_CAP = 2_000;

export type AgentRun = {
  conversationId: string;
  projectId: string;
  startedAt: number;
  status: RunStatus;
  abort: AbortController;
  chunks: UIMessageChunk[];
  subscribers: Set<ReadableStreamDefaultController<UIMessageChunk>>;
  endedAt?: number;
  cleanupTimer?: ReturnType<typeof setTimeout>;
};

declare global {
  var __thumbgen_agent_runs: Map<string, AgentRun> | undefined;
}

function runs(): Map<string, AgentRun> {
  if (!globalThis.__thumbgen_agent_runs) globalThis.__thumbgen_agent_runs = new Map();
  return globalThis.__thumbgen_agent_runs;
}

function closeSubscribers(run: AgentRun): void {
  for (const subscriber of run.subscribers) {
    try {
      subscriber.close();
    } catch {
      // Already cancelled by its reader.
    }
  }
  run.subscribers.clear();
}

/** Tests only: forget every run and its timer. */
export function resetRunRegistry(): void {
  for (const run of runs().values()) {
    if (run.cleanupTimer) clearTimeout(run.cleanupTimer);
    closeSubscribers(run);
  }
  globalThis.__thumbgen_agent_runs = new Map();
}

export function getRun(conversationId: string): AgentRun | null {
  return runs().get(conversationId) ?? null;
}

/**
 * Registers a turn, or returns null when one already runs for the conversation.
 * Check and registration are synchronous (no await in between): two requests,
 * even from two tabs, can never both start a paid turn.
 */
export function startRun(conversationId: string, projectId: string): AgentRun | null {
  const registry = runs();
  const existing = registry.get(conversationId);
  if (existing?.status === "running") return null;
  if (existing?.cleanupTimer) clearTimeout(existing.cleanupTimer);
  const run: AgentRun = {
    conversationId,
    projectId,
    startedAt: Date.now(),
    status: "running",
    abort: new AbortController(),
    chunks: [],
    subscribers: new Set(),
  };
  registry.set(conversationId, run);
  return run;
}

/** Early exit before streamText (a 400): removed at once, never listed, no toast. */
export function discardRun(run: AgentRun): void {
  if (runs().get(run.conversationId) === run) runs().delete(run.conversationId);
  if (run.cleanupTimer) clearTimeout(run.cleanupTimer);
  run.status = "error";
  run.endedAt = Date.now();
  closeSubscribers(run);
}

function mergeDelta(previous: UIMessageChunk | undefined, chunk: UIMessageChunk): UIMessageChunk | null {
  if (!previous) return null;
  if (chunk.type === "text-delta" && previous.type === "text-delta" && previous.id === chunk.id) {
    return { ...previous, delta: previous.delta + chunk.delta };
  }
  if (chunk.type === "reasoning-delta" && previous.type === "reasoning-delta" && previous.id === chunk.id) {
    return { ...previous, delta: previous.delta + chunk.delta };
  }
  if (chunk.type === "tool-input-delta" && previous.type === "tool-input-delta" && previous.toolCallId === chunk.toolCallId) {
    return { ...previous, inputTextDelta: previous.inputTextDelta + chunk.inputTextDelta };
  }
  return null;
}

/** Buffers a chunk (merging deltas past the soft cap) and sends it to every subscriber. */
export function appendChunk(run: AgentRun, chunk: UIMessageChunk): void {
  if (run.status !== "running") return;
  const merged = run.chunks.length >= RUN_CHUNK_SOFT_CAP ? mergeDelta(run.chunks.at(-1), chunk) : null;
  if (merged) run.chunks[run.chunks.length - 1] = merged;
  else run.chunks.push(chunk);
  for (const subscriber of run.subscribers) {
    try {
      subscriber.enqueue(chunk);
    } catch {
      run.subscribers.delete(subscriber);
    }
  }
}

/**
 * The whole buffer from the start, then the live chunks, closed at the end of
 * the run. Cancelling it (Next cancels a response whose client left) only
 * unsubscribes: the run goes on.
 */
export function subscribe(run: AgentRun): ReadableStream<UIMessageChunk> {
  let own: ReadableStreamDefaultController<UIMessageChunk> | null = null;
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of run.chunks) controller.enqueue(chunk);
      if (run.status !== "running") {
        controller.close();
        return;
      }
      own = controller;
      run.subscribers.add(controller);
    },
    cancel() {
      if (own) run.subscribers.delete(own);
    },
  });
}

/** « Arrêter »: aborts the model call of a running run. */
export function stopRun(conversationId: string): boolean {
  const run = runs().get(conversationId);
  if (!run || run.status !== "running") return false;
  run.abort.abort();
  return true;
}

/**
 * Ends a run once (later calls are ignored), after its turn was saved: closes
 * the subscribers and removes the entry 5 minutes later — only if it is still
 * this run, never a newer one.
 */
export function finishRun(run: AgentRun, status: EndedRunStatus): void {
  if (run.status !== "running") return;
  run.status = status;
  run.endedAt = Date.now();
  closeSubscribers(run);
  const timer = setTimeout(() => {
    if (runs().get(run.conversationId) === run) runs().delete(run.conversationId);
  }, RUN_RETENTION_MS);
  timer.unref?.();
  run.cleanupTimer = timer;
}

/** A client request (request_user_image / request_user_sketch) still waiting for the user. */
export function hasPendingClientRequest(chunks: readonly UIMessageChunk[]): boolean {
  const pending = new Set<string>();
  for (const chunk of chunks) {
    if (chunk.type === "tool-input-available" && CLIENT_TOOL_NAME_SET.has(chunk.toolName)) pending.add(chunk.toolCallId);
    else if (chunk.type === "tool-output-available" || chunk.type === "tool-output-error" || chunk.type === "tool-output-denied") {
      pending.delete(chunk.toolCallId);
    }
  }
  return pending.size > 0;
}

export function listRuns(): RunSummary[] {
  return [...runs().values()].map((run) => ({
    conversationId: run.conversationId,
    projectId: run.projectId,
    startedAt: run.startedAt,
    status: run.status,
    endedAt: run.endedAt ?? null,
    pendingClientRequest: hasPendingClientRequest(run.chunks),
  }));
}

/** toUIMessageStream's onEnd outcome → the run's final status. */
export function runStatusForOutcome(status: "completed" | "failed" | "aborted" | "unknown"): EndedRunStatus {
  if (status === "aborted") return "stopped";
  if (status === "failed") return "error";
  return "done";
}

/**
 * Reads the model's UI stream to its end into the run, then ends the run —
 * exactly once, after onEnd/onAbort saved the turn (they run before the stream
 * closes). A read failure ends it as "error".
 */
export async function pumpRunStream(
  run: AgentRun,
  stream: ReadableStream<UIMessageChunk>,
  endStatus: () => EndedRunStatus,
): Promise<void> {
  let failed = false;
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      appendChunk(run, value);
    }
  } catch (error) {
    failed = true;
    console.error("[agent v2] run stream failed:", error);
  } finally {
    finishRun(run, failed ? "error" : endStatus());
  }
}
