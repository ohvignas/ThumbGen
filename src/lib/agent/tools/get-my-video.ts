import { z } from "zod";
import { getTranscript, getVideoAnalytics } from "@/lib/youtube/knowledge-store";
import { getVideo } from "@/lib/youtube/channel-store";
import { thumbTypeLabel, type ThumbType } from "@/lib/youtube/thumb-types";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({
  video_id: z.string().min(8).max(20).describe("YouTube video id (the 11-character id, or youtube:<id>)."),
});

function normalizeId(raw: string): string {
  return raw.replace(/^youtube:/, "").trim();
}

export const getMyVideoTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "get_my_video",
  description:
    "Local details for one video of the creator's channel: title, views, thumbnail type, Studio analytics when ingested, summary and a transcript excerpt. No YouTube quota.",
  inputSchema: InputSchema,
  handler: async ({ video_id }) => {
    const videoId = normalizeId(video_id);
    const video = getVideo(videoId);
    if (!video) {
      return {
        isError: true,
        content: [{ type: "text", text: `Vidéo ${videoId} absente du catalogue local. Synchronise « Ma chaîne ».` }],
      };
    }
    const analytics = getVideoAnalytics(videoId);
    const transcript = getTranscript(videoId);
    const lines = [
      `youtube:${video.video_id} — "${video.title}"`,
      `Publiée ${video.published_at} · ${video.view_count} vues · type ${thumbTypeLabel((video.thumb_type as ThumbType | null) ?? null)}`,
      video.description ? `Description : ${video.description.slice(0, 400)}` : "",
      analytics
        ? `Studio ${analytics.period_start} → ${analytics.period_end} : ${analytics.views ?? "?"} vues, AVD ${analytics.average_view_duration ?? "?"} s, rétention ${analytics.average_view_percentage ?? "?"} %, +${analytics.subscribers_gained ?? "?"} abo`
        : "Pas encore de stats Studio pour cette vidéo.",
      transcript?.summary ? `Résumé : ${transcript.summary}` : "",
      transcript?.hook ? `Hook : ${transcript.hook}` : "",
      transcript?.source === "timedtext" && transcript.text
        ? `Transcript (${transcript.char_count} car.) :\n${transcript.text.slice(0, 4000)}${transcript.text.length > 4000 ? "\n…[truncated]" : ""}`
        : transcript?.source === "none"
          ? "Pas de sous-titres publics pour cette vidéo."
          : "Transcript pas encore récupéré.",
    ].filter(Boolean);
    return { content: [{ type: "text", text: lines.join("\n") }] };
  },
};

registerTool(getMyVideoTool);
