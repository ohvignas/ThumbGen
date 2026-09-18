import { tool as aiTool, type Tool } from "ai";
import { z } from "zod";
import { addLogoFromSearch, type AddedLogoRow } from "@/lib/logos/add-logo";
import { ensureBrief } from "@/lib/brief/store";
import { appendBriefLogo } from "@/lib/brief/server-fields";
import type { ToolResult } from "@/lib/agent/tools/types";
import { isFakeAgentEnabled } from "./fake-agent-model";
import { toolResultToModelOutput } from "./tool-adapter";

export const ADD_LOGO_TOOL_NAME = "add_logo";
export const addLogoInputSchema = z.object({
  candidate_id: z.string().trim().min(1).max(40),
});
export type AddLogoInput = z.output<typeof addLogoInputSchema>;

export type AddLogoContext = {
  conversationId: string;
  add?: (input: { source: "simple-icons" | "svgl" | "wikimedia"; ref: string; name: string }) => Promise<AddedLogoRow>;
};

function error(text: string, requestNotSent = false): ToolResult {
  return { isError: true, requestNotSent, content: [{ type: "text", text }] };
}

export async function executeAddLogo(context: AddLogoContext, input: AddLogoInput): Promise<ToolResult> {
  const existing = ensureBrief(context.conversationId);
  if (!existing) return error("Conversation introuvable.", true);
  const candidate = existing.brief.logoCandidates.find((entry) => entry.id === input.candidate_id);
  if (!candidate) return error("Candidat de logo inconnu.", true);

  if (isFakeAgentEnabled()) {
    const stored = `stored:lg_fake_${candidate.id}`;
    appendBriefLogo(context.conversationId, { name: candidate.name, source: stored });
    return { content: [{ type: "text", text: stored }] };
  }

  try {
    const add = context.add ?? addLogoFromSearch;
    const row = await add({ source: candidate.source, ref: candidate.ref, name: candidate.name });
    const stored = `stored:lg_${row.id}`;
    const written = appendBriefLogo(context.conversationId, { name: candidate.name, source: stored });
    if (!written.ok) return error("3 logos maximum.");
    return { content: [{ type: "text", text: stored }] };
  } catch (err) {
    return error(err instanceof Error ? err.message : "Enregistrement du logo impossible.");
  }
}

export function buildAddLogoTool(context: AddLogoContext): Tool {
  return aiTool({
    description: [
      "Saves one find_logos candidate into the library. Use after the user picked a logo-candidate id (or a single obvious hit). Pass candidate_id only, never a URL. Returns stored:lg_<id>. Max 3 logos on the Fiche.",
      "Returns stored:lg_<id> to write on the brief with update_brief logos.",
    ].join("\n"),
    inputSchema: addLogoInputSchema,
    execute: async (input: AddLogoInput) => executeAddLogo(context, input),
    toModelOutput: ({ output }: { output: unknown }) => toolResultToModelOutput(output),
  }) as Tool;
}
