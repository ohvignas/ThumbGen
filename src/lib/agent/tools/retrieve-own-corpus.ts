import { z } from "zod";
import { retrieveOwnCorpus } from "@/lib/studio/corpus";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(20).default(8),
});

export const retrieveOwnCorpusTool: ToolDefinition<z.output<typeof InputSchema>> = {
  name: "retrieve_own_corpus",
  description:
    "Local full-text search over the creator's own ThumbGen scripts and Ma chaîne transcripts. Free, no OpenRouter, no YouTube quota. Ground writing on real past videos.",
  inputSchema: InputSchema,
  handler: async ({ query, limit }) => {
    const hits = retrieveOwnCorpus(query, limit);
    if (hits.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `Aucun résultat local pour « ${query} ». Corpus mince — importe d’anciens scripts ou connecte Ma chaîne.`,
          },
        ],
      };
    }
    const lines = hits.map((hit) => {
      const id = hit.source === "studio" && hit.videoId ? `studio:${hit.videoId}` : hit.youtubeVideoId ? `youtube:${hit.youtubeVideoId}` : hit.source;
      return `- ${id} [${hit.source}/${hit.kind}] — "${hit.title}" — ${hit.snippet.replace(/\s+/g, " ").slice(0, 180)}`;
    });
    return { content: [{ type: "text", text: `${hits.length} extrait(s) :\n${lines.join("\n")}` }] };
  },
};

registerTool(retrieveOwnCorpusTool);
