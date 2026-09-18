import { z } from "zod";
import { YoutubeTranscript } from "youtube-transcript";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({ url: z.string().url() });

export const extractYoutubeScriptTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "extract_youtube_script",
  description:
    "Fetches the spoken transcript of a YouTube video from its URL. Use when designing a thumb for a specific existing video and the title is not enough. Truncated after 8000 characters. If they already pasted the script, do not fetch.",
  inputSchema: InputSchema,
  handler: async ({ url }) => {
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(url);
      const text = transcript.map((c) => c.text).join(" ");
      const summary = `Transcript (${transcript.length} segments, ${text.length} chars):\n\n${text.slice(0, 8000)}${text.length > 8000 ? "\n…[truncated]" : ""}`;
      return { content: [{ type: "text", text: summary }] };
    } catch (e) {
      return {
        isError: true,
        content: [{ type: "text", text: `Failed to extract transcript: ${(e as Error).message}` }],
      };
    }
  },
};

registerTool(extractYoutubeScriptTool);
