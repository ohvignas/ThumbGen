import { z } from "zod";
import { getStudioVideo } from "@/lib/studio/store";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({ video_id: z.string().min(8).max(80) });

function studioVideoId(raw: string): string {
  return raw.replace(/^studio:/, "").trim();
}

function clip(text: string): string {
  return `${text.slice(0, 4000)}${text.length > 4000 ? "\n…[truncated]" : ""}`;
}

export const getStudioVideoTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "get_studio_video",
  description:
    "Reads one local ThumbGen video fiche: title, etiquette, YouTube URL, script and description (truncated to 4000 characters). Accepts studio:<id> or the bare id.",
  inputSchema: InputSchema,
  handler: async ({ video_id }) => {
    const videoId = studioVideoId(video_id);
    const video = getStudioVideo(videoId);
    if (!video) {
      return {
        isError: true,
        content: [{ type: "text", text: `Fiche ${videoId} introuvable. Appelle list_studio_videos ou create_studio_video.` }],
      };
    }
    const lines = [
      `studio:${video.videoId} — "${video.title}"`,
      `etiquette: ${video.etiquette ?? "—"}`,
      `youtube_url: ${video.youtubeUrl ?? ""}`,
      `script (${video.draft.script.length} car.) :\n${clip(video.draft.script)}`,
      `description (${video.draft.description.length} car.) :\n${clip(video.draft.description)}`,
    ];
    return { content: [{ type: "text", text: lines.join("\n") }] };
  },
};

registerTool(getStudioVideoTool);
