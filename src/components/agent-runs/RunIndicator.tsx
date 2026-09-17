"use client";
import { cn } from "cn";
import { useAgentRuns } from "./AgentRunsProvider";
import { runIndicatorState } from "./agent-runs-model";

/** Violet dot: pulsing while the agent works, still when an ending is unseen. All projects when projectId is omitted. */
export function RunIndicator({ projectId, className }: { projectId?: string; className?: string }) {
  const { snapshot, unseen } = useAgentRuns();
  const state = runIndicatorState(snapshot, unseen, projectId);
  if (!state) return null;
  const label = state === "running" ? "L'agent travaille" : "L'agent a du nouveau";
  return (
    <span
      data-slot="run-indicator"
      data-state={state}
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-2.5 shrink-0 rounded-full bg-violet-400 ring-2 ring-background",
        state === "running" && "animate-pulse motion-reduce:animate-none",
        className,
      )}
    />
  );
}
