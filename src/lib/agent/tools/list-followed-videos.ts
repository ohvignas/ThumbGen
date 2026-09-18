import { z } from "zod";
import { getDb } from "@/lib/db";
import { listVideos, typesSummary } from "@/lib/youtube/video-queries";
import { thumbTypeLabel, type ThumbType } from "@/lib/youtube/thumb-types";
import type { VideoListItem } from "@/lib/youtube/types";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

export const LIST_FOLLOWED_VIDEOS_MAX = 12;

const InputSchema = z.object({
  scope: z
    .enum(["mine", "all"])
    .default("mine")
    .describe('"mine": the channel marked « Ma chaîne »; "all": every followed channel.'),
  sort: z.enum(["date", "score"]).default("date").describe('"date": newest first; "score": best views / channel median first.'),
  best_type: z
    .boolean()
    .optional()
    .describe("true keeps only the thumbnail type that performs best in this scope (needs at least 3 scored thumbnails)."),
  limit: z.number().int().min(1).max(LIST_FOLLOWED_VIDEOS_MAX).default(5),
});

type Input = z.output<typeof InputSchema>;

function performanceText(video: VideoListItem): string {
  const performance = video.performance;
  if (performance.kind === "scored") return `×${String(performance.score).replace(".", ",")}`;
  if (performance.kind === "recent") return "récente";
  return "n/a";
}

function hasMyChannel(): boolean {
  return Boolean(getDb().prepare("SELECT 1 FROM followed_channels WHERE is_mine = 1 LIMIT 1").get());
}

export const listFollowedVideosTool: ToolDefinition<Input> = {
  name: "list_followed_videos",
  description:
    "Lists videos already synced from followed YouTube channels (local, no API quota). Use for the user's own or followed thumbs. scope mine = Ma chaîne, all = every followed channel. Image refs youtube:<videoId> for ask_user. Not a live YouTube search (search_youtube). Don't stall a new-video brief on old videos if they already described this one.",
  inputSchema: InputSchema,
  chatOnly: true,
  handler: async ({ scope, sort, best_type, limit }) => {
    if (scope === "mine") {
      if (!hasMyChannel()) {
        return {
          content: [
            {
              type: "text",
              text: "Aucune chaîne n'est marquée « Ma chaîne » dans les chaînes suivies : skip this question or ask the user for a YouTube link or a description.",
            },
          ],
        };
      }
    }

    let bestType: ThumbType | null = null;
    let noBestType = false;
    if (best_type) {
      bestType = typesSummary(scope).find((row) => row.enoughData)?.type ?? null;
      noBestType = bestType === null;
    }

    const { items } = listVideos({
      sort,
      types: bestType ? [bestType] : [],
      channelId: null,
      mine: scope === "mine",
      period: "all",
      q: "",
      offset: 0,
      limit,
    });

    const header = [
      `${items.length} vidéo(s) (${scope === "mine" ? "Ma chaîne" : "toutes les chaînes suivies"}, tri ${sort === "date" ? "date" : "performance"}`,
      bestType ? `, type ${thumbTypeLabel(bestType)}` : "",
      noBestType ? ", pas assez de données pour un meilleur type" : "",
      ") :",
    ].join("");
    const lines = items.map(
      (video) =>
        `- youtube:${video.videoId} — "${video.title}" — ${video.channelTitle} — type: ${thumbTypeLabel(video.thumbType)} — perf: ${performanceText(video)}`,
    );
    return { content: [{ type: "text", text: [header, ...lines].join("\n") }] };
  },
};

registerTool(listFollowedVideosTool);
