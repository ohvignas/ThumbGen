"use client";
import { CheckIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import ToolCallCard, { hasResultRenderer } from "../ToolCallCard";
import { formatToolJson } from "../tool-json";
import type { ToolStatus, ToolStep } from "../turn-model";

const STATUS_TEXT: Record<ToolStatus, string> = { running: "en cours", done: "terminé", error: "échec" };

function StatusIcon({ status }: { status: ToolStatus }) {
  return (
    <span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center">
      {status === "running" && <Spinner className="size-3.5" />}
      {status === "done" && <CheckIcon className="size-3.5 text-emerald-500" />}
      {status === "error" && <XIcon className="size-3.5 text-destructive" />}
    </span>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[11px] font-medium text-muted-foreground">{title}</p>
      <pre className="max-h-40 overflow-auto rounded-md bg-muted px-2 py-1.5 font-mono text-[11px] leading-snug break-all whitespace-pre-wrap text-muted-foreground">
        {formatToolJson(value)}
      </pre>
    </div>
  );
}

/** One tool call in the step detail: label and status, its input and output on demand. */
export default function SimpleToolPart({ step }: { step: ToolStep }) {
  const { part, status } = step;
  const showVisual = !step.shownInResults && status === "done" && hasResultRenderer(step.toolName);

  return (
    <Collapsible>
      <CollapsibleTrigger
        render={
          <button
            type="button"
            className="group/tool flex w-full items-center gap-2 rounded-md py-0.5 text-left text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        }
      >
        <StatusIcon status={status} />
        <span className="min-w-0 flex-1 truncate">{step.label}</span>
        <span className="sr-only">({STATUS_TEXT[status]})</span>
        <ChevronRightIcon aria-hidden="true" className="size-3.5 shrink-0 transition-transform group-data-[panel-open]/tool:rotate-90 motion-reduce:transition-none" />
      </CollapsibleTrigger>
      {status === "error" && step.errorText && <p className="pl-6 text-xs text-destructive">{step.errorText}</p>}
      <CollapsibleContent className="flex flex-col gap-2 pt-1.5 pl-6">
        {step.shownInResults ? (
          <p className="text-xs text-muted-foreground">Voir les résultats ci-dessous.</p>
        ) : (
          <>
            {showVisual && <ToolCallCard part={part} />}
            <JsonBlock title="Entrée" value={part.input} />
            {status !== "running" && (
              <JsonBlock title="Sortie" value={part.state === "output-error" ? part.errorText : part.output} />
            )}
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
