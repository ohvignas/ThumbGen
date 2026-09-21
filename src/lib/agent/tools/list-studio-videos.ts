import { z } from "zod";
import { listStudioVideos } from "@/lib/studio/store";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({});

export const listStudioVideosTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "list_studio_videos",
  description:
    "Lists local ThumbGen video fiches: studio:<videoId>, title, etiquette. Use when no fiche is open or they ask which video to write. Local SQLite, no YouTube quota.",
  inputSchema: InputSchema,
  handler: async () => {
    const rows = listStudioVideos();
    if (rows.length === 0) {
      return { content: [{ type: "text", text: "Aucune fiche vidéo." }] };
    }
    const lines = rows.map(
      (row) => `- studio:${row.videoId} — "${row.title}" — ${row.etiquette ?? "—"}`,
    );
    return { content: [{ type: "text", text: `${rows.length} fiche(s) :\n${lines.join("\n")}` }] };
  },
};

registerTool(listStudioVideosTool);
