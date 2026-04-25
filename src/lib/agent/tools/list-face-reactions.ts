import { z } from "zod";
import { getDb } from "@/lib/db";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({});

export const listFaceReactionsTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "list_face_reactions",
  description:
    "Lists face images (with emotion labels) stored in the user's library — usable as faceReference nodes via stored:fr_<id>.",
  inputSchema: InputSchema,
  handler: async () => {
    const rows = getDb()
      .prepare(
        "SELECT id, label, size, created_at FROM face_reactions ORDER BY created_at DESC"
      )
      .all() as { id: string; label: string; size: number; created_at: string }[];
    if (rows.length === 0) {
      return { content: [{ type: "text", text: "No face reactions in library." }] };
    }
    const lines = rows.map(
      (r) => `- stored:fr_${r.id} — "${r.label}" (${r.size} bytes, added ${r.created_at})`
    );
    return {
      content: [
        { type: "text", text: `${rows.length} face reaction(s):\n${lines.join("\n")}` },
      ],
    };
  },
};

registerTool(listFaceReactionsTool);
