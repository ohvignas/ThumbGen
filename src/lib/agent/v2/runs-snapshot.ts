import type { AgentRunsSnapshot, AttentionEntry, AttentionKind, RunningEntry, RunSummary } from "./run-types";

const UNNAMED_PROJECT = "Miniature sans nom";

/** A paused request is a question; otherwise an error, or « finished » (done or stopped). */
export function attentionKind(run: RunSummary): AttentionKind {
  if (run.pendingClientRequest) return "question";
  return run.status === "error" ? "error" : "finished";
}

/** Everything the registry holds, minus deleted conversations. The client filters what it has seen. */
export function buildRunsSnapshot(
  runs: RunSummary[],
  lookup: { conversationExists: (conversationId: string) => boolean; projectName: (projectId: string) => string | null },
): AgentRunsSnapshot {
  const running: RunningEntry[] = [];
  const attention: AttentionEntry[] = [];
  for (const run of runs) {
    if (!lookup.conversationExists(run.conversationId)) continue;
    const projectName = lookup.projectName(run.projectId) ?? UNNAMED_PROJECT;
    if (run.status === "running") {
      running.push({ conversationId: run.conversationId, projectId: run.projectId, projectName, startedAt: run.startedAt });
    } else {
      attention.push({
        conversationId: run.conversationId,
        projectId: run.projectId,
        projectName,
        kind: attentionKind(run),
        endedAt: run.endedAt ?? run.startedAt,
      });
    }
  }
  return { running, attention };
}
