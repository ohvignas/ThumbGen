import { tool as aiTool, type Tool } from "ai";
import { briefUpdateInputSchema, type BriefUpdateInput } from "@/lib/brief/merge";
import { updateBrief } from "@/lib/brief/store";
import { briefToolSummary } from "@/lib/brief/context";
import type { BriefUpdatedData } from "@/lib/brief/brief-updated";
import type { ToolResult } from "@/lib/agent/tools/types";
import { toolResultToModelOutput } from "./tool-adapter";

export const UPDATE_BRIEF_TOOL_NAME = "update_brief";

/** Tells the open chat that the brief changed (the chat route writes a transient `data-brief-updated` chunk). */
export type WriteBriefUpdated = (data: BriefUpdatedData) => void;
export type UpdateBriefContext = { conversationId: string; projectId: string; writeBriefUpdated: WriteBriefUpdated };

export function executeUpdateBrief(context: UpdateBriefContext, input: BriefUpdateInput): ToolResult {
  const result = updateBrief(context.conversationId, context.projectId, input);
  if (!result.ok) {
    const lines = ["Fiche refusée, rien n'a été enregistré :", ...result.issues.map((issue) => `- ${issue.path || "fiche"} : ${issue.message}`)];
    return { isError: true, content: [{ type: "text", text: lines.join("\n") }] };
  }
  try {
    context.writeBriefUpdated({ conversationId: context.conversationId, step: result.stored.brief.step, updatedAt: result.stored.updatedAt });
  } catch (error) {
    // The brief is saved: the panel picks it up on its next load.
    console.error("[agent v2] update_brief: could not broadcast the brief update:", error);
  }
  return { content: [{ type: "text", text: briefToolSummary(result.stored.brief, result.warnings) }] };
}

/**
 * `update_brief` for ONE chat request: conversation and project come from the
 * request, never from the model. Not in the tool registry, so never listed to MCP.
 */
export function buildUpdateBriefTool(context: UpdateBriefContext): Tool {
  return aiTool({
    description: [
      "Writes optional memory into this chat's Fiche (promise, packages, logos, composition). Use after a decision worth keeping. Send only changed fields. Omit step — do not drive a 7-step wizard. Trust <thumbnail_brief> over chat history for those fields.",
      "step: optional leftover (1-7), not a pipeline. video, common, competition: merged field by field (null clears a field). research: summary, keyPoints, entities. abStrategy, abVariable. logos and references: replaced whole. variant: { key: A|B|C, set } merged by key — set.composition and set.sketch replace the whole card or sketch. removeVariant: A|B|C.",
      "Refused with the reasons when the brief would break a rule (thumbnail text over 4 words or 20 characters, a card without exactly one hero, 4 elements, sizes over 110 %, a text zone on the hero's cell, an emotion without a character): fix what it names and retry once.",
      "Returns the saved brief (without the full script) and warnings to rephrase once (a thumbnail text repeating the title, variants too close for the strategy).",
    ].join("\n"),
    inputSchema: briefUpdateInputSchema,
    execute: async (input: BriefUpdateInput) => executeUpdateBrief(context, input),
    toModelOutput: ({ output }: { output: unknown }) => toolResultToModelOutput(output),
  }) as Tool;
}
