import { z } from "zod";
import { getDb } from "@/lib/db";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({});

export const listLogosTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "list_logos",
  description:
    "Lists logos already in the user's library as stored:lg_<id>. Use when they named a brand that might already be saved. To search the web for new logos, find_logos then add_logo. Wire as swipeFile kind=logo.",
  inputSchema: InputSchema,
  handler: async () => {
    const rows = getDb()
      .prepare("SELECT id, label, size, created_at FROM logos ORDER BY created_at DESC")
      .all() as { id: string; label: string; size: number; created_at: string }[];
    if (rows.length === 0) {
      return { content: [{ type: "text", text: "No logos in library." }] };
    }
    const lines = rows.map(
      (r) => `- stored:lg_${r.id} — "${r.label}" (${r.size} bytes, added ${r.created_at})`
    );
    return {
      content: [{ type: "text", text: `${rows.length} logo(s):\n${lines.join("\n")}` }],
    };
  },
};

registerTool(listLogosTool);
