import { z } from "zod";
import { getSetting } from "@/lib/settings";
import { resolveChannelId } from "@/lib/youtube/channel";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({
  channel: z.string(),
  limit: z.number().int().min(1).max(50).optional(),
  sort: z.enum(["date", "viewCount"]).optional(),
});

export const getChannelVideosTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "get_channel_videos",
  description:
    "Lists a channel's videos by date (default) or viewCount. Use to see what performs and which thumbs to import. Keyword inside the channel: search_youtube_channel. Already-synced followed videos: list_followed_videos. QUOTA: 100 units.",
  inputSchema: InputSchema,
  handler: async ({ channel, limit, sort }) => {
    const apiKey = getSetting("youtubeApiKey");
    if (!apiKey) {
      return {
        isError: true,
        content: [{ type: "text", text: "YouTube API key not configured." }],
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
      order: sort ?? "date",
      maxResults: String(limit ?? 10),
      key: apiKey,
    });

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

    if (items.length === 0)
      return { content: [{ type: "text", text: "No videos found." }] };

    const lines = items.map((it) => {
      const tn = it.snippet.thumbnails.medium?.url || "";
      return `- [${it.id.videoId}] "${it.snippet.title}" — ${it.snippet.publishedAt} — thumbnail: ${tn}`;
    });
    return {
      content: [
        {
          type: "text",
          text: `${items.length} video(s) (sorted by ${sort ?? "date"}):\n${lines.join("\n")}`,
        },
      ],
    };
  },
};

registerTool(getChannelVideosTool);
