"use client";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import SimpleToolPart from "./tool-renderers/SimpleToolPart";
import { TextMarkdown } from "./TextMarkdown";
import type { TurnStep } from "./turn-model";

function reasoningLabel(streaming: boolean, duration?: number): string {
  if (streaming) return "Réflexion…";
  return duration === undefined ? "Réflexion" : `Réflexion (${duration} s)`;
}

/** The folded detail of a turn: reasoning, intermediate texts and tool calls, in order. */
export default function TurnSteps({ steps, live }: { steps: TurnStep[]; live: boolean }) {
  if (steps.length === 0) {
    return <p className="text-xs text-muted-foreground">Aucune étape pour l&apos;instant.</p>;
  }

  return (
    <ol aria-label="Étapes" className="flex flex-col gap-1.5 border-l border-border pl-3">
      {steps.map((step, index) => (
        <li key={step.id} className="min-w-0">
          {step.kind === "reasoning" && (
            <Reasoning isStreaming={live && index === steps.length - 1} defaultOpen={false} className="mb-0">
              <ReasoningTrigger className="text-xs" getThinkingMessage={reasoningLabel} />
              <ReasoningContent className="mt-1.5 text-xs">{step.text}</ReasoningContent>
            </Reasoning>
          )}
          {step.kind === "text" && <TextMarkdown text={step.text} className="text-xs text-muted-foreground" />}
          {step.kind === "tool" && <SimpleToolPart step={step} />}
        </li>
      ))}
    </ol>
  );
}
