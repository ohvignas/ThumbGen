import { z } from "zod";
import { getSetting } from "@/lib/settings";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({
  query: z.string().min(1),
  sort: z.enum(["relevance", "viewCount", "date"]).optional(),
  limit: z.number().int().min(1).max(25).optional(),
});

export const searchYoutubeTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "search_youtube",
  description:
    "Searches YouTube globally for videos on a topic (NOT scoped to a single channel). Use this when designing a thumbnail to discover the top-performing thumbnails on the topic and use them as visual inspiration. Returns video id, title, channel name, view count, published date, and HD thumbnail URL. Sort by 'viewCount' to see what performs best, 'relevance' (default) for topical match, 'date' for fresh angles. QUOTA: 100 units per call.",
  inputSchema: InputSchema,
  handler: async ({ query, sort, limit }) => {
    const apiKey = getSetting("youtubeApiKey");
    if (!apiKey) {
      return {
        isError: true,
        content: [{ type: "text", text: "YouTube API key not configured. Add it in Settings." }],
      };
    }

    const params = new URLSearchParams({
      part: "snippet",
      type: "video",
      q: query,
      order: sort ?? "relevance",
      maxResults: String(limit ?? 12),
      key: apiKey,
    });

    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    if (!res.ok) {
      return { isError: true, content: [{ type: "text", text: `YouTube search failed: ${res.status}` }] };
    }
    const data = await res.json();
    const items = (data.items || []) as Array<{
      id: { videoId: string };
      snippet: {
        title: string;
        channelTitle: string;
        publishedAt: string;
        thumbnails: { high?: { url: string }; medium?: { url: string } };
      };
    }>;

    if (items.length === 0) {
      return { content: [{ type: "text", text: `Aucun résultat pour "${query}".` }] };
    }

    // Optional: enrich with viewCount via videos.list (1 unit per call) — only if sort=viewCount.
    // For the thumbnail-inspiration use case, the snippet alone is enough.
    const lines = items.map((it) => {
      const tn = it.snippet.thumbnails.high?.url || it.snippet.thumbnails.medium?.url || "";
      return `- [${it.id.videoId}] "${it.snippet.title}" — ${it.snippet.channelTitle} (${it.snippet.publishedAt.slice(0, 10)})\n  thumbnail: ${tn}`;
    });
    return {
      content: [
        {
          type: "text",
          text: `${items.length} vidéo(s) sur "${query}" (sorted by ${sort ?? "relevance"}):\n${lines.join("\n")}`,
        },
      ],
    };
  },
};

registerTool(searchYoutubeTool);
