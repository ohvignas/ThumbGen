import { z } from "zod";
import { YoutubeTranscript } from "youtube-transcript";
import { getTranscript } from "@/lib/youtube/knowledge-store";
import { youtubeVideoIdFromUrl } from "@/lib/youtube/video-id";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({ url: z.string().url() });

function formatTranscript(label: string, text: string, extra?: string): string {
  const summary = `${label} (${text.length} chars${extra ? `, ${extra}` : ""}):\n\n${text.slice(0, 8000)}${text.length > 8000 ? "\n…[truncated]" : ""}`;
  return summary;
}

export const extractYoutubeScriptTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "extract_youtube_script",
  description:
    "Fetches the spoken transcript of a YouTube video from its URL. Prefers the local cache when the creator connected their channel. Use when designing a thumb for a specific existing video and the title is not enough. Truncated after 8000 characters. If they already pasted the script, do not fetch.",
  inputSchema: InputSchema,
  handler: async ({ url }) => {
    const videoId = youtubeVideoIdFromUrl(url);
    if (videoId) {
      const cached = getTranscript(videoId);
      if (cached?.source === "timedtext" && cached.text) {
        return { content: [{ type: "text", text: formatTranscript("Cached transcript", cached.text, cached.language ?? undefined) }] };
      }
    }
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(url);
      const text = transcript.map((c) => c.text).join(" ");
      return { content: [{ type: "text", text: formatTranscript("Transcript", text, `${transcript.length} segments`) }] };
    } catch (e) {
      return {
        isError: true,
        content: [{ type: "text", text: `Failed to extract transcript: ${(e as Error).message}` }],
      };
    }
  },
};

registerTool(extractYoutubeScriptTool);
