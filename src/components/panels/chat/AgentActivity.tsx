"use client";
import { useMemo } from "react";
import type { UIMessage, ChatStatus } from "ai";
import { TOOL_LABELS } from "@/lib/agent/tool-labels";

type Activity = { kind: "thinking" } | { kind: "writing" } | { kind: "tool"; name: string; label: string } | { kind: "idle" };

function deriveActivity(status: ChatStatus, lastMessage: UIMessage | undefined): Activity {
  if (status !== "streaming" && status !== "submitted") return { kind: "idle" };
  if (!lastMessage || lastMessage.role !== "assistant") return { kind: "thinking" };

  const lastPart = lastMessage.parts.at(-1);
  if (!lastPart) return { kind: "thinking" };

  if (lastPart.type.startsWith("tool-")) {
    const state = (lastPart as { state?: string }).state;
    if (state !== "output-available" && state !== "output-error") {
      const name = lastPart.type.slice("tool-".length);
      return { kind: "tool", name, label: TOOL_LABELS[name] ?? name };
    }
  }
  if (lastPart.type === "text") return { kind: "writing" };
  return { kind: "thinking" };
}

export default function AgentActivity({ status, lastMessage }: { status: ChatStatus; lastMessage: UIMessage | undefined }) {
  const activity = useMemo(() => deriveActivity(status, lastMessage), [status, lastMessage]);
  if (activity.kind === "idle") return null;

  let toolName: string | null = null;
  let label: string;
  switch (activity.kind) {
    case "thinking": label = "réfléchit"; break;
    case "writing": label = "écrit"; break;
    case "tool": toolName = activity.name; label = activity.label; break;
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2" style={{ borderTop: "1px solid var(--line-faint)", background: "var(--ink-3)" }}>
      <span className="block w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: "var(--brand)" }} />
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span className="text-[9px] uppercase shrink-0" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono), 'JetBrains Mono', monospace", letterSpacing: "0.22em" }}>Assistant</span>
        {toolName && (
          <span className="text-[9px] uppercase shrink-0" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono), 'JetBrains Mono', monospace", letterSpacing: "0.18em" }}>· {toolName}</span>
        )}
        <span className="italic truncate" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-display), 'Fraunces', serif", fontSize: 13, letterSpacing: "-0.01em" }}>{label}…</span>
      </div>
    </div>
  );
}
