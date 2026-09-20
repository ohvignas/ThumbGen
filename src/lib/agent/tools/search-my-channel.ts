import { z } from "zod";
import { searchMyChannel } from "@/lib/youtube/knowledge-store";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({
  query: z.string().min(1).max(200).describe("Mots-clés (titre, sujet, phrase du transcript)."),
  limit: z.number().int().min(1).max(20).default(8),
});

export const searchMyChannelTool: ToolDefinition<z.output<typeof InputSchema>> = {
  name: "search_my_channel",
  description:
    "Full-text search over the creator's own synced videos (titles, descriptions, transcript summaries). Local data, no YouTube quota. Returns youtube:<videoId> lines usable with get_my_video and import_youtube_thumbnail.",
  inputSchema: InputSchema,
  handler: async ({ query, limit }) => {
    const hits = searchMyChannel(query, limit);
    if (hits.length === 0) {
      return { content: [{ type: "text", text: `Aucun résultat local pour « ${query} ».` }] };
    }
    const lines = hits.map((hit) => `- youtube:${hit.videoId} — "${hit.title}" — ${hit.snippet.replace(/\s+/g, " ").slice(0, 180)}`);
    return { content: [{ type: "text", text: `${hits.length} vidéo(s) :\n${lines.join("\n")}` }] };
  },
};

registerTool(searchMyChannelTool);
