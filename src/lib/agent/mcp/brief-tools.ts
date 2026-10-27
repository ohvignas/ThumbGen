import { z } from "zod";
import { getDb } from "@/lib/db";
import { createConversation } from "@/lib/agent/conversation/store";
import type { ToolResult } from "@/lib/agent/tools/types";
import { executeFindLogos, findLogosInputSchema } from "@/lib/agent/v2/find-logos-tool";
import { executeAddLogo, addLogoInputSchema } from "@/lib/agent/v2/add-logo-tool";
import {
  executeFindCompetitorThumbnails,
  findCompetitorThumbnailsInputSchema,
} from "@/lib/agent/v2/find-competitor-thumbnails-tool";
import { executeAnalyzeThumbnails, analyzeThumbnailsInputSchema } from "@/lib/agent/v2/analyze-thumbnails-tool";

/**
 * The brief tools (logos, competitors) live in the chat route because they
 * store state on a conversation's brief. Over MCP there is no chat, so each
 * call names a miniature (project_id) and runs on that project's dedicated
 * "MCP" conversation: logo candidates found by find_logos are there for
 * add_logo, and the last competitor search is there for analyze_thumbnails.
 * Per-conversation caps (2 searches, 2 paid analyses) apply to that thread.
 */
export const MCP_CONVERSATION_TITLE = "MCP";

export function mcpConversationId(projectId: string): string | null {
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM projects_meta WHERE id = ?").get(projectId)) return null;
  const row = db
    .prepare(
      "SELECT id FROM conversations WHERE project_id = ? AND title = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1",
    )
    .get(projectId, MCP_CONVERSATION_TITLE) as { id: string } | undefined;
  return row?.id ?? createConversation(projectId, MCP_CONVERSATION_TITLE).id;
}

const projectShape = {
  project_id: z.string().min(4).max(80).describe("Miniature (proj_…) the logos and competitors are for."),
};

export type McpBriefTool = {
  name: string;
  description: string;
  shape: z.ZodRawShape;
  run: (conversationId: string, args: Record<string, unknown>) => Promise<ToolResult>;
};

function parsed<S extends z.ZodType>(schema: S, args: Record<string, unknown>): z.output<S> | ToolResult {
  const result = schema.safeParse(args);
  if (result.success) return result.data;
  const message = result.error.issues.map((issue) => issue.message).join("; ");
  return { isError: true, content: [{ type: "text", text: `Invalid arguments: ${message}` }] };
}

const isResult = (value: unknown): value is ToolResult =>
  typeof value === "object" && value !== null && "content" in value && Array.isArray((value as ToolResult).content);

export const MCP_BRIEF_TOOLS: McpBriefTool[] = [
  {
    name: "find_logos",
    description:
      "Searches logo candidates for named brands/tools (max 12 names, 3 candidates each). Returns logo-candidate:<id> | name | source — never a URL. Then add_logo with the chosen id on the same project_id. Check list_logos first.",
    shape: { ...projectShape, ...findLogosInputSchema.shape },
    run: async (conversationId, args) => {
      const input = parsed(findLogosInputSchema, args);
      return isResult(input) ? input : executeFindLogos({ conversationId }, input);
    },
  },
  {
    name: "add_logo",
    description:
      "Saves one find_logos candidate (same project_id) into the logo library. Pass candidate_id only. Returns stored:lg_<id>, wire it as swipeFile kind=logo. Max 3 logos per project thread.",
    shape: { ...projectShape, ...addLogoInputSchema.shape },
    run: async (conversationId, args) => {
      const input = parsed(addLogoInputSchema, args);
      return isResult(input) ? input : executeAddLogo({ conversationId }, input);
    },
  },
  {
    name: "find_competitor_thumbnails",
    description:
      "Searches competing YouTube videos in French and English and ranks them against each channel's median views. Prefer query_fr + query_en (a single query is mirrored). Returns youtube:<videoId> | channel | views | ×score | age | language lines, no image. Uses YouTube Data API quota; max 2 searches per project thread. Then analyze_thumbnails on those ids.",
    shape: {
      ...projectShape,
      query_fr: z.string().optional(),
      query_en: z.string().optional(),
      query: z.string().optional(),
    },
    run: async (conversationId, args) => {
      const input = parsed(findCompetitorThumbnailsInputSchema, args);
      return isResult(input) ? input : executeFindCompetitorThumbnails({ conversationId }, input);
    },
  },
  {
    name: "analyze_thumbnails",
    description:
      "Vision-analyses up to 12 competing thumbnails from the last find_competitor_thumbnails call on the same project_id. Cached analyses are free; otherwise a paid OpenRouter call, at most 2 per project thread. Returns « Ce qui marche » / « Ce que tout le monde fait (à éviter) ».",
    shape: { ...projectShape, ...analyzeThumbnailsInputSchema.shape },
    run: async (conversationId, args) => {
      const input = parsed(analyzeThumbnailsInputSchema, args);
      return isResult(input) ? input : executeAnalyzeThumbnails({ conversationId }, input);
    },
  },
];

export async function runMcpBriefTool(tool: McpBriefTool, args: Record<string, unknown>): Promise<ToolResult> {
  const { project_id: projectId, ...rest } = args;
  const conversationId = typeof projectId === "string" ? mcpConversationId(projectId) : null;
  if (!conversationId) {
    return { isError: true, content: [{ type: "text", text: `Unknown project_id: ${String(projectId)}. Use list_projects.` }] };
  }
  return tool.run(conversationId, rest);
}
