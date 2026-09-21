export const STUDIO_AGENT_PHASES = [
  "listening",
  "researching",
  "asking_format",
  "writing",
  "filling",
  "done",
] as const;
export type StudioAgentPhase = (typeof STUDIO_AGENT_PHASES)[number];

export const STUDIO_PHASE_COPY: Record<StudioAgentPhase, string> = {
  listening: "L’agent t’écoute",
  researching: "L’agent lit tes dernières vidéos…",
  asking_format: "L’agent précise le format de tournage",
  writing: "L’agent écrit titres, description et script…",
  filling: "L’agent prépare les données",
  done: "Brouillon prêt",
};

const ORDER: readonly StudioAgentPhase[] = STUDIO_AGENT_PHASES;

function atLeast(current: StudioAgentPhase, next: StudioAgentPhase): StudioAgentPhase {
  return ORDER.indexOf(next) < ORDER.indexOf(current) ? current : next;
}

export function phaseFromToolName(name: string): StudioAgentPhase | null {
  if (name === "retrieve_own_corpus" || name === "list_studio_videos" || name === "get_studio_video") {
    return "researching";
  }
  if (name === "ask_user") return "asking_format";
  if (name === "read_skill") return "writing";
  if (name === "upsert_studio_script") return "filling";
  if (name === "finish_turn") return "done";
  return null;
}

export function advanceStudioPhase(current: StudioAgentPhase, toolName: string): StudioAgentPhase {
  const hinted = phaseFromToolName(toolName);
  if (!hinted) return current;
  return atLeast(current, hinted);
}

export function toolNameFromPart(part: { type?: string; toolName?: string }): string | null {
  if (typeof part.toolName === "string" && part.toolName.length > 0) return part.toolName;
  const type = part.type ?? "";
  const prefixed = type.match(/^tool-(.+)$/);
  if (prefixed?.[1] && prefixed[1] !== "invocation") return prefixed[1];
  return null;
}
