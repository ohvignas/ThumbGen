import { z } from "zod";
import { getSetting } from "@/lib/settings";
import { ToolDefinition, ToolContent } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({
  query: z.string().min(1),
  sort: z.enum(["relevance", "viewCount", "date"]).optional(),
  limit: z.number().int().min(1).max(12).optional(),
  include_thumbnails: z.boolean().optional(),
});

const MAX_THUMBS_FOR_VISION = 6;

export const searchYoutubeTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "search_youtube",
  description:
    "Searches YouTube globally for videos on a topic. By default fetches the top thumbnails as images so you can VISUALLY analyze them (composition, color contrast, focal point, text legibility, face placement) instead of guessing patterns from titles. Return list includes id, title, channel, date, and HD thumbnail URL. Use sort='viewCount' to surface what's most clicked, 'relevance' (default) for topical match, 'date' for fresh angles. Be precise with the query — include exact product names and brands. QUOTA: 100 units per call + small additional thumbnail bandwidth.",
  inputSchema: InputSchema,
  handler: async ({ query, sort, limit, include_thumbnails }) => {
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
      maxResults: String(limit ?? 8),
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

    const fetchThumbs = include_thumbnails !== false; // default true

    // Text summary listing all hits
    const lines = items.map((it, i) => {
      const tn = it.snippet.thumbnails.high?.url || it.snippet.thumbnails.medium?.url || "";
      return `[${i + 1}] [${it.id.videoId}] "${it.snippet.title}" — ${it.snippet.channelTitle} (${it.snippet.publishedAt.slice(0, 10)})\n  thumbnail: ${tn}`;
    });

    const content: ToolContent[] = [
      {
        type: "text",
        text: `${items.length} vidéo(s) sur "${query}" (sorted by ${sort ?? "relevance"}):\n${lines.join("\n")}`,
      },
    ];

    if (!fetchThumbs) return { content };

    // Fetch the top N thumbnails so the agent can visually analyze design patterns.
    // Cap at MAX_THUMBS_FOR_VISION to keep input tokens reasonable.
    const thumbsToFetch = items.slice(0, MAX_THUMBS_FOR_VISION);
    content.push({
      type: "text",
      text: `\n\nThumbnails (top ${thumbsToFetch.length}) loaded for visual analysis. For each: read composition, color palette, focal point, face placement and expression, text size/weight/color, contrast ratio. Articulate WHY each likely earns clicks — don't generalize.`,
    });

    for (let i = 0; i < thumbsToFetch.length; i++) {
      const it = thumbsToFetch[i];
      const url = it.snippet.thumbnails.high?.url || it.snippet.thumbnails.medium?.url;
      if (!url) continue;
      try {
        const imgRes = await fetch(url);
        if (!imgRes.ok) continue;
        const buf = Buffer.from(await imgRes.arrayBuffer());
        const ct = imgRes.headers.get("content-type") || "image/jpeg";
        const mimeType = ct.split(";")[0].trim();
        content.push({ type: "text", text: `[${i + 1}] "${it.snippet.title}" — ${it.snippet.channelTitle}` });
        content.push({ type: "image", mimeType, data: buf.toString("base64") });
      } catch {
        // skip on fetch failure — partial result is better than failure
      }
    }

    return { content };
  },
};

registerTool(searchYoutubeTool);
