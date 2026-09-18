import { randomBytes } from "crypto";
import { tool as aiTool, type Tool } from "ai";
import { z } from "zod";
import { defaultLogoProviders, searchLogos, type LogoProvider } from "@/lib/logos/search";
import type { LogoSearchResult } from "@/lib/logos/shared";
import { ensureBrief } from "@/lib/brief/store";
import { setBriefLogoCandidates } from "@/lib/brief/server-fields";
import type { LogoCandidate } from "@/lib/brief/schema";
import type { ToolResult } from "@/lib/agent/tools/types";
import { isFakeAgentEnabled } from "./fake-agent-model";
import { FAKE_LOGO_CANDIDATES } from "./fake-f3b-fixtures";
import { toolResultToModelOutput } from "./tool-adapter";

export const FIND_LOGOS_TOOL_NAME = "find_logos";
export const findLogosInputSchema = z.object({
  names: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
});
export type FindLogosInput = z.output<typeof findLogosInputSchema>;

export type FindLogosContext = {
  conversationId: string;
  search?: (query: string, options: { providers: LogoProvider[] }) => Promise<{ results: LogoSearchResult[] }>;
  providers?: LogoProvider[];
};

const STORABLE = new Set(["simple-icons", "svgl", "wikimedia"]);

function newId(): string {
  return `lc_${randomBytes(6).toString("hex")}`;
}

function error(text: string, requestNotSent = false): ToolResult {
  return { isError: true, requestNotSent, content: [{ type: "text", text }] };
}

function linesOf(candidates: LogoCandidate[]): string {
  if (candidates.length === 0) return "Aucun logo trouvé. L'utilisateur peut importer depuis la Bibliothèque ou Brandfetch en aperçu.";
  return candidates.map((candidate) => `logo-candidate:${candidate.id} | ${candidate.name} | ${candidate.source}`).join("\n");
}

export async function executeFindLogos(context: FindLogosContext, input: FindLogosInput): Promise<ToolResult> {
  const existing = ensureBrief(context.conversationId);
  if (!existing) return error("Conversation introuvable.", true);

  if (isFakeAgentEnabled()) {
    const candidates = FAKE_LOGO_CANDIDATES.map((candidate) => ({
      ...candidate,
      previewUrl: `/api/briefs/${context.conversationId}/logo-candidates/${candidate.id}`,
    }));
    setBriefLogoCandidates(context.conversationId, candidates);
    return { content: [{ type: "text", text: linesOf(candidates) }] };
  }

  const search = context.search ?? searchLogos;
  const providers = context.providers ?? defaultLogoProviders();
  const candidates: LogoCandidate[] = [];
  for (const name of input.names) {
    const { results } = await search(name, { providers });
    const picked = results.filter((result) => STORABLE.has(result.source)).slice(0, 3);
    for (const result of picked) {
      const id = newId();
      candidates.push({
        id,
        name: result.name.slice(0, 80) || name.slice(0, 80),
        source: result.source as LogoCandidate["source"],
        ref: result.ref,
        previewUrl: `/api/briefs/${context.conversationId}/logo-candidates/${id}`,
      });
    }
  }
  setBriefLogoCandidates(context.conversationId, candidates.slice(0, 36));
  return { content: [{ type: "text", text: linesOf(candidates.slice(0, 36)) }] };
}

export function buildFindLogosTool(context: FindLogosContext): Tool {
  return aiTool({
    description: [
      "Searches logo candidates for named brands/tools. Use after research_topic entities or names the user cited that are not already in list_logos. Pass names (max 12). Returns logo-candidate:<id> | name | source — never a URL. Then add_logo, or ask_user with those images (max_selected 3).",
      "Returns lines logo-candidate:<id> | name | source — never a URL or image. Use those ids as ask_user option images, then add_logo with the chosen id.",
      "At most 3 candidates per name. If each name has one obvious hit, keep it with add_logo and say so in one line; else ask_user multiple \"Quels logos garder ?\" (max_selected 3).",
    ].join("\n"),
    inputSchema: findLogosInputSchema,
    execute: async (input: FindLogosInput) => executeFindLogos(context, input),
    toModelOutput: ({ output }: { output: unknown }) => toolResultToModelOutput(output),
  }) as Tool;
}
