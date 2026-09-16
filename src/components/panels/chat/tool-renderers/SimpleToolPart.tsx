"use client";
import type { UIMessage } from "ai";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

type ToolPart = Extract<UIMessage["parts"][number], { type: `tool-${string}` }>;

export default function SimpleToolPart({ part, label }: { part: ToolPart; label: string }) {
  const state = part.state;

  if (state === "output-error") {
    const errorText = "errorText" in part ? (part as { errorText?: string }).errorText : undefined;
    return (
      <Alert variant="destructive" className="my-1">
        <AlertTitle>{label}</AlertTitle>
        {errorText && <AlertDescription>{errorText}</AlertDescription>}
      </Alert>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs py-1 text-muted-foreground">
      {(state === "input-streaming" || state === "input-available") && (
        <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
          <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
        </svg>
      )}
      <span>{label}{state === "output-available" ? "" : "…"}</span>
    </div>
  );
}
