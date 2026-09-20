import type { ToolHandler, ToolResult } from "@/lib/agent/tools/types";
import { countLiveSketchNodes } from "@/lib/canvas/live-sketches";
import type { ThumbnailBrief } from "./schema";
import { getBrief, releaseBriefUsage, reserveBriefUsage } from "./store";

/**
 * Server-side cost guard of generate_sketch when a conversation has a brief.
 * The cap counts **live** `type: "sketch"` nodes on the current canvas only.
 * Tombstones, deleted nodes, and earlier generate_sketch calls do not count.
 * No brief (plain canvas / MCP) → no cap.
 */

export function sketchLimit(brief: ThumbnailBrief): number {
  return 2 * Math.max(1, brief.variants.length) + 3;
}

export function liveSketchRefusal(limit: number, liveSketchCount: number): string | null {
  if (liveSketchCount >= limit) {
    return `Esquisse refusée : limite de ${limit} croquis visibles atteinte sur le canvas.`;
  }
  return null;
}

export function sketchRefusal(brief: ThumbnailBrief, liveSketchCount: number): string | null {
  return liveSketchRefusal(sketchLimit(brief), liveSketchCount);
}

export function guardSketchHandler(conversationId: string, handler: ToolHandler<unknown>): ToolHandler<unknown> {
  return async (input) => {
    const existing = getBrief(conversationId);
    if (!existing) return handler(input);
    const reason = sketchRefusal(existing.brief, countLiveSketchNodes(existing.projectId));
    if (reason) return { isError: true, content: [{ type: "text", text: reason }] };
    const reservation = reserveBriefUsage(conversationId, "sketches", () => null);
    if (reservation.status === "no-brief") return handler(input);
    if (reservation.status === "refused") return { isError: true, content: [{ type: "text", text: reservation.reason }] };
    // Only an error that happened before the paid request left the app gives the
    // reservation back; a provider error, a missing image or an unknown throw stays counted.
    const result: ToolResult = await handler(input);
    if (result.isError && result.requestNotSent) releaseBriefUsage(conversationId, "sketches");
    return result;
  };
}
