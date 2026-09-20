"use client";
import type { PromptCardModel } from "./prompt-cards";

/**
 * The image prompt written this turn (place_node / apply_workflow). Always
 * mounted on the turn — not a last-turn-only chip. Canvas focus lives on
 * the real nodes, not a chat button that can re-fire generate.
 */
export default function PromptResultCard({ prompt }: PromptCardModel) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <p className="text-xs font-medium text-muted-foreground">Prompt</p>
      <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap">{prompt}</pre>
    </div>
  );
}
