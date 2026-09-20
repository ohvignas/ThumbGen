import { z } from "zod";
import { getDb } from "@/lib/db";
import { listVideos, typesSummary } from "@/lib/youtube/video-queries";
import { ageInDays } from "@/lib/youtube/performance";
import { thumbTypeLabel } from "@/lib/youtube/thumb-types";
import type { ThemeSummaryRow } from "@/lib/youtube/video-themes";
import { isWinningTheme, themeWhy } from "@/lib/youtube/video-themes";
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
    .describe(
      "true keeps only the title/description theme that performs best in this scope (needs at least 3 scored thumbnails).",
    ),
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

function whyText(video: VideoListItem, theme: ThemeSummaryRow, now: Date): string {
  return themeWhy({
    score: video.performance.kind === "scored" ? video.performance.score : null,
    ageDays: ageInDays(video.publishedAt, now),
    title: video.title,
    keywords: theme.keywords,
  });
}

export const listFollowedVideosTool: ToolDefinition<Input> = {
  name: "list_followed_videos",
  description:
    "Lists videos already synced from followed YouTube channels (local, no YouTube quota). Use for the user's own or followed thumbs. scope mine = Ma chaîne, all = every followed channel. Image refs youtube:<videoId> for ask_user. best_type keeps the winning title/description theme (swipe rank plus optional TypeSafe Jev on titles). Not a live YouTube search (search_youtube). Don't stall a new-video brief on old videos if they already described this one.",
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

    let bestTheme: ThemeSummaryRow | null = null;
    let noBestTheme = false;
    if (best_type) {
      bestTheme = (await typesSummary(scope)).rows.find(isWinningTheme) ?? null;
      noBestTheme = bestTheme === null;
    }

    const { items } = listVideos({
      sort,
      types: [],
      channelId: null,
      mine: scope === "mine",
      period: "all",
      q: "",
      format: "",
      offset: 0,
      limit,
      videoIds: bestTheme?.videoIds,
    });

    const header = [
      `${items.length} vidéo(s) (${scope === "mine" ? "Ma chaîne" : "toutes les chaînes suivies"}, tri ${sort === "date" ? "date" : "performance"}`,
      bestTheme ? `, thème ${bestTheme.label}` : "",
      noBestTheme ? ", pas assez de données pour une meilleure thématique" : "",
      ") :",
    ].join("");
    const now = new Date();
    const lines = items.map((video) => {
      const base = `- youtube:${video.videoId} — "${video.title}" — ${video.channelTitle}`;
      if (bestTheme) {
        return `${base} — thème: ${bestTheme.label} — perf: ${performanceText(video)} — pourquoi: ${whyText(video, bestTheme, now)}`;
      }
      return `${base} — type: ${thumbTypeLabel(video.thumbType)} — perf: ${performanceText(video)}`;
    });
    return { content: [{ type: "text", text: [header, ...lines].join("\n") }] };
  },
};

registerTool(listFollowedVideosTool);
