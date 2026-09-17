import type { ToolHandler, ToolResult } from "@/lib/agent/tools/types";
import { BRIEF_TOTAL_STEPS, type ThumbnailBrief } from "./schema";
import { releaseBriefUsage, reserveBriefUsage } from "./store";

/**
 * Server-side cost guard of generate_sketch during a thumbnail journey
 * (chantier F3): the limits never depend on the model's goodwill. A
 * conversation without a brief is not guarded (EXISTING WORKFLOW, MCP).
 */

export function sketchLimit(brief: ThumbnailBrief): number {
  return 2 * Math.max(1, brief.variants.length) + 3;
}

export function sketchRefusal(brief: ThumbnailBrief): string | null {
  if (brief.step < BRIEF_TOTAL_STEPS) {
    return `Esquisse refusée : la fiche est à l'étape ${brief.step}/${BRIEF_TOTAL_STEPS}, les esquisses viennent à l'étape ${BRIEF_TOTAL_STEPS}.`;
  }
  const limit = sketchLimit(brief);
  if (brief.usage.sketches >= limit) return `Esquisse refusée : limite de ${limit} esquisses atteinte pour cette miniature.`;
  return null;
}

export function guardSketchHandler(conversationId: string, handler: ToolHandler<unknown>): ToolHandler<unknown> {
  return async (input) => {
    const reservation = reserveBriefUsage(conversationId, "sketches", sketchRefusal);
    if (reservation.status === "no-brief") return handler(input);
    if (reservation.status === "refused") return { isError: true, content: [{ type: "text", text: reservation.reason }] };
    let result: ToolResult;
    try {
      result = await handler(input);
    } catch (error) {
      releaseBriefUsage(conversationId, "sketches");
      throw error;
    }
    if (result.isError) releaseBriefUsage(conversationId, "sketches");
    return result;
  };
}
