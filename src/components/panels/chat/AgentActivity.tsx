"use client";
import { useMemo } from "react";
import type { ChatEvent } from "@/hooks/useChat";

const FRIENDLY_NAMES: Record<string, string> = {
  web_search: "recherche web",
  generate_sketch: "génération d'un croquis",
  apply_workflow: "construction du workflow",
  extract_youtube_script: "extraction du transcript YouTube",
  search_youtube_channel: "recherche dans la chaîne",
  get_channel_videos: "lecture des vidéos de la chaîne",
  trigger_generation: "génération finale",
  list_logos: "lecture de la bibliothèque · logos",
  list_face_reactions: "lecture de la bibliothèque · visages",
  list_swipe_files: "lecture de la bibliothèque · références",
  list_projects: "liste des projets",
  list_past_generations: "lecture des générations passées",
  get_canvas_state: "lecture du canvas",
  get_node_details: "lecture d'un node",
  remix_image: "remix",
  edit_image: "édition d'image",
  request_user_image: "attend une image",
  request_user_sketch: "attend un croquis",
};

type Activity =
  | { kind: "thinking" }
  | { kind: "writing" }
  | { kind: "tool"; name: string; label: string }
  | { kind: "waiting_user"; name: string; label: string }
  | { kind: "idle" };

function deriveActivity(events: ChatEvent[], streaming: boolean): Activity {
  if (!streaming && events.length === 0) return { kind: "idle" };

  // Latest unresolved UI tool request → user gate
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "ui_tool_request") {
      const acked = events.some((x) => x.type === "ui_tool_response_ack" && x.id === e.id);
      if (!acked) {
        const name = e.name as string;
        return { kind: "waiting_user", name, label: FRIENDLY_NAMES[name] ?? name };
      }
      break;
    }
  }

  // Latest unresolved server tool_call → "using X"
  // Walk events in reverse, find the latest tool_call that has no matching tool_result.
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "tool_call") {
      const resolved = events.slice(i + 1).some((x) => x.type === "tool_result" && x.id === e.id);
      if (!resolved) {
        return { kind: "tool", name: e.name, label: FRIENDLY_NAMES[e.name] ?? e.name };
      }
      // already resolved → keep walking back; next state depends on what came after
      break;
    }
  }

  // If we got text after the last tool_result, Claude is writing.
  // If only tool_results since last text_delta, Claude is thinking through the next step.
  let lastTextIdx = -1;
  let lastToolResultIdx = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === "text_delta" && lastTextIdx === -1) lastTextIdx = i;
    if (events[i].type === "tool_result" && lastToolResultIdx === -1) lastToolResultIdx = i;
    if (lastTextIdx !== -1 && lastToolResultIdx !== -1) break;
  }
  if (streaming) {
    if (lastTextIdx > lastToolResultIdx) return { kind: "writing" };
    return { kind: "thinking" };
  }
  return { kind: "idle" };
}

export default function AgentActivity({
  events,
  streaming,
}: {
  events: ChatEvent[];
  streaming: boolean;
}) {
  const activity = useMemo(() => deriveActivity(events, streaming), [events, streaming]);
  if (activity.kind === "idle" || activity.kind === "waiting_user") return null;

  let toolName: string | null = null;
  let label: string;
  switch (activity.kind) {
    case "thinking":
      label = "réfléchit";
      break;
    case "writing":
      label = "écrit";
      break;
    case "tool":
      toolName = activity.name;
      label = activity.label;
      break;
  }

  return (
    <div
      className="flex items-center gap-2 px-4 py-2"
      style={{
        borderTop: "1px solid var(--line-faint)",
        background: "var(--ink-3)",
      }}
    >
      <span
        className="block w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
        style={{ background: "var(--brand)" }}
      />
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span
          className="text-[9px] uppercase shrink-0"
          style={{
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
            letterSpacing: "0.22em",
          }}
        >
          Claude
        </span>
        {toolName && (
          <span
            className="text-[9px] uppercase shrink-0"
            style={{
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
              letterSpacing: "0.18em",
            }}
          >
            · {toolName}
          </span>
        )}
        <span
          className="italic truncate"
          style={{
            color: "var(--text-secondary)",
            fontFamily: "var(--font-display), 'Fraunces', serif",
            fontSize: 13,
            letterSpacing: "-0.01em",
          }}
        >
          {label}…
        </span>
      </div>
    </div>
  );
}
