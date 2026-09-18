import { z } from "zod";
import { getDb } from "@/lib/db";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({});

export const listSwipeFilesTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "list_swipe_files",
  description:
    "Lists visual inspirations in the library as stored:sf_<id>. Use when they want an existing reference on the canvas. To import a YouTube thumb into the library, import_youtube_thumbnail first. Wire as swipeFile kind=reference. Not for logos (list_logos).",
  inputSchema: InputSchema,
  handler: async () => {
    const rows = getDb()
      .prepare(
        "SELECT id, title, size, created_at FROM swipe_files ORDER BY created_at DESC"
      )
      .all() as { id: string; title: string; size: number; created_at: string }[];
    if (rows.length === 0) {
      return { content: [{ type: "text", text: "No swipe files in library." }] };
    }
    const lines = rows.map(
      (r) => `- stored:sf_${r.id} — "${r.title}" (${r.size} bytes, added ${r.created_at})`
    );
    return {
      content: [
        { type: "text", text: `${rows.length} swipe file(s):\n${lines.join("\n")}` },
      ],
    };
  },
};

registerTool(listSwipeFilesTool);
