import type { ThumbnailBrief } from "./schema";

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
  const { step: _step, video: _video, research, logoCandidates, ...rest } = brief;
  const videoView: Record<string, unknown> = { ...video };
  if (fullScript) {
    if (script === "truncate") {
      videoView.script =
        fullScript.length > BRIEF_CONTEXT_SCRIPT_CHARS ? `${fullScript.slice(0, BRIEF_CONTEXT_SCRIPT_CHARS)}…` : fullScript;
    }
    videoView.scriptChars = fullScript.length;
  }
  const view = {
    ...rest,
    video: videoView,
    research: research ? { ...research, sources: research.sources.map((source) => source.title) } : undefined,
    logoCandidates: logoCandidates.map(({ id, name }) => ({ id, name })),
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
    "Optional memory for this conversation (the « Fiche »). Trust it over chat history for these fields. It is not a 7-step pipeline.",
    json,
    "</thumbnail_brief>",
  ].join("\n");
}

/** update_brief's answer: the saved brief without the full script, then the warnings. */
export function briefToolSummary(brief: ThumbnailBrief, warnings: string[]): string {
  const lines = [`Fiche enregistrée.`, JSON.stringify(briefContextView(brief, { script: "omit" }))];
  if (warnings.length > 0) lines.push("Avertissements (reformule une fois, puis continue) :", ...warnings.map((warning) => `- ${warning}`));
  return lines.join("\n");
}
