import { z } from "zod";
import { getDb } from "@/lib/db";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({});

export const listLogosTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "list_logos",
  description:
    "Lists logos stored in the user's library. Returns id, label, size, created_at, and a `stored:lg_<id>` reference usable in apply_workflow as a swipeFile node with kind='logo'.",
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
