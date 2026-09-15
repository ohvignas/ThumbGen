"use client";
import type { UIMessage } from "ai";

type ToolPart = Extract<UIMessage["parts"][number], { type: `tool-${string}` }>;

export default function SimpleToolPart({ part, label }: { part: ToolPart; label: string }) {
  const state = part.state;

  return (
    <div className="flex items-center gap-1.5 text-xs py-1" style={{ color: "var(--text-tertiary)" }}>
      {(state === "input-streaming" || state === "input-available") && (
        <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
          <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
        </svg>
      )}
      {state === "output-error" ? (
        <span style={{ color: "var(--ember)" }}>{label} · erreur{"errorText" in part && part.errorText ? ` — ${part.errorText}` : ""}</span>
      ) : (
        <span>{label}{state === "output-available" ? "" : "…"}</span>
      )}
    </div>
  );
}
