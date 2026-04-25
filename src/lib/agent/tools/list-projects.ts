import { z } from "zod";
import { getDb } from "@/lib/db";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({});

export const listProjectsTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "list_projects",
  description: "Lists all ThumbGen projects.",
  inputSchema: InputSchema,
  handler: async () => {
    const rows = getDb()
      .prepare(
        "SELECT id, name, created_at, updated_at FROM projects_meta ORDER BY updated_at DESC"
      )
      .all() as { id: string; name: string; created_at: string; updated_at: string }[];
    if (rows.length === 0) {
      return { content: [{ type: "text", text: "No projects found." }] };
    }
    const lines = rows.map(
      (r) => `- ${r.id} — "${r.name}" (updated ${r.updated_at})`
    );
    return {
      content: [{ type: "text", text: `${rows.length} project(s):\n${lines.join("\n")}` }],
    };
  },
};

registerTool(listProjectsTool);
