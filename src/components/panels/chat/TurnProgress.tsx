"use client";
import type { ChatStatus, UIMessage } from "ai";
import { ChevronRightIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Spinner } from "@/components/ui/spinner";
import TurnSteps from "./TurnSteps";
import { currentStepLabel, formatElapsed, type TurnStep } from "./turn-model";
import { useElapsedMs } from "./useElapsedMs";

/**
 * The single live line of a running turn: spinner, current step, m:ss timer.
 * Clicking it unfolds the step list, updated as the turn streams. The text the
 * model writes is never shown word by word here.
 */
export default function TurnProgress({
  message,
  status,
  startedAt,
  steps,
}: {
  message: UIMessage | undefined;
  status: ChatStatus;
  startedAt: number | null;
  steps: TurnStep[];
}) {
  const elapsedMs = useElapsedMs(startedAt);
  const stepLabel = currentStepLabel(message, status);
  const label = stepLabel;

  return (
    <Collapsible className="flex flex-col gap-2">
      {/* The one live region, outside the trigger button so label changes are announced (not the timer). */}
      <span role="status" aria-live="polite" className="sr-only">
        {label}
      </span>
      <CollapsibleTrigger
        render={
          <button
            type="button"
            className="group/progress flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        }
      >
        <Marker render={<span />} className="min-w-0 flex-1">
          <MarkerIcon>
            <Spinner />
          </MarkerIcon>
          <MarkerContent className="truncate shimmer motion-reduce:shimmer-none">{label}</MarkerContent>
        </Marker>
        <span aria-hidden="true" className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
          {formatElapsed(elapsedMs)}
        </span>
        <ChevronRightIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]/progress:rotate-90 motion-reduce:transition-none"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-2">
        <TurnSteps steps={steps} live />
      </CollapsibleContent>
    </Collapsible>
  );
}
