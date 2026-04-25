import { z } from "zod";
import { getSetting } from "@/lib/settings";
import { resolveChannelId } from "@/lib/youtube/channel";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({
  channel: z.string(),
  query: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const searchYoutubeChannelTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "search_youtube_channel",
  description:
    "Searches videos within a specific YouTube channel. Provide a channel handle (@xxx), URL, or channel ID. Optional `query` filters by keyword; without it returns the most recent videos. Useful to ground thumbnail design in the user's existing content. QUOTA: 100 units per call.",
  inputSchema: InputSchema,
  handler: async ({ channel, query, limit }) => {
    const apiKey = getSetting("youtubeApiKey");
    if (!apiKey) {
      return {
        isError: true,
        content: [{ type: "text", text: "YouTube API key not configured. Add it in Settings." }],
      };
    }

    const resolved = await resolveChannelId(apiKey, channel);
    if (!resolved.ok) {
      return { isError: true, content: [{ type: "text", text: resolved.error }] };
    }
    const channelId = resolved.id;

    const params = new URLSearchParams({
      part: "snippet",
      channelId,
      type: "video",
      order: "date",
      maxResults: String(limit ?? 10),
      key: apiKey,
    });
    if (query) params.set("q", query);

    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    if (!res.ok)
      return {
        isError: true,
        content: [{ type: "text", text: `Search failed: ${res.status}` }],
      };
    const data = await res.json();
    const items = (data.items || []) as Array<{
      id: { videoId: string };
      snippet: {
        title: string;
        publishedAt: string;
        thumbnails: { medium?: { url: string } };
      };
    }>;

    if (items.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: query
              ? `No videos matching "${query}" in this channel.`
              : "No videos found.",
          },
        ],
      };
    }

    const lines = items.map((it) => {
      const tn = it.snippet.thumbnails.medium?.url || "";
      return `- [${it.id.videoId}] "${it.snippet.title}" (published ${it.snippet.publishedAt}) — thumbnail: ${tn}`;
    });
    return { content: [{ type: "text", text: `${items.length} video(s):\n${lines.join("\n")}` }] };
  },
};

registerTool(searchYoutubeChannelTool);
