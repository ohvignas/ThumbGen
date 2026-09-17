import { BRIEF_TOTAL_STEPS, type ThumbnailBrief } from "./schema";

/**
 * What the agent reads of the thumbnail brief: the per-turn `<thumbnail_brief>`
 * block and update_brief's answer. Compact — the script is truncated (or
 * omitted), research sources become their titles, logo candidates their id and
 * name — and never any base64. Pure.
 */

export const BRIEF_CONTEXT_SCRIPT_CHARS = 1500;

function scrubImages(value: unknown): unknown {
  if (typeof value === "string") return /^data:[^,]*;base64,/i.test(value) ? "[image]" : value;
  if (Array.isArray(value)) return value.map(scrubImages);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrubImages(item)]));
  }
  return value;
}

export function briefContextView(brief: ThumbnailBrief, { script }: { script: "truncate" | "omit" }): Record<string, unknown> {
  const { script: fullScript, ...video } = brief.video;
  const videoView: Record<string, unknown> = { ...video };
  if (fullScript) {
    if (script === "truncate") {
      videoView.script =
        fullScript.length > BRIEF_CONTEXT_SCRIPT_CHARS ? `${fullScript.slice(0, BRIEF_CONTEXT_SCRIPT_CHARS)}…` : fullScript;
    }
    videoView.scriptChars = fullScript.length;
  }
  const view = {
    ...brief,
    video: videoView,
    research: brief.research ? { ...brief.research, sources: brief.research.sources.map((source) => source.title) } : undefined,
    logoCandidates: brief.logoCandidates.map(({ id, name }) => ({ id, name })),
  };
  // JSON round trip: drops undefined fields, then no data URL survives.
  return scrubImages(JSON.parse(JSON.stringify(view))) as Record<string, unknown>;
}

/** The per-turn system block, after <canvas_state>. Angle brackets typed by the creator can't fake a tag. */
export function buildThumbnailBriefBlock(brief: ThumbnailBrief): string {
  const json = JSON.stringify(briefContextView(brief, { script: "truncate" }))
    .replace(/</g, "‹")
    .replace(/>/g, "›");
  return [
    "<thumbnail_brief>",
    "The thumbnail brief of this conversation (THUMBNAIL JOURNEY): every decision so far. It is the source of truth — trust it over the chat history, and resume at its step unless the request is about the existing workflow.",
    json,
    "</thumbnail_brief>",
  ].join("\n");
}

/** update_brief's answer: the saved brief without the full script, then the warnings. */
export function briefToolSummary(brief: ThumbnailBrief, warnings: string[]): string {
  const lines = [`Fiche enregistrée (étape ${brief.step}/${BRIEF_TOTAL_STEPS}).`, JSON.stringify(briefContextView(brief, { script: "omit" }))];
  if (warnings.length > 0) lines.push("Avertissements (reformule une fois, puis continue) :", ...warnings.map((warning) => `- ${warning}`));
  return lines.join("\n");
}
