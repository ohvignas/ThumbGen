import { z } from "zod";
import { getDb } from "@/lib/db";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({});

export const listSwipeFilesTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "list_swipe_files",
  description:
    "Lists visual reference inspirations stored in the user's library — usable as swipeFile nodes with kind='reference' via stored:sf_<id>.",
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
