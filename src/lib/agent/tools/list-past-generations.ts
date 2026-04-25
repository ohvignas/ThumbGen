import { z } from "zod";
import { getDb } from "@/lib/db";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({
  project_id: z.string(),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

export const listPastGenerationsTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "list_past_generations",
  description:
    "Lists past generations for a project — useful for iteration or remix. Returns model, prompt, cost, and stored:gi_<id> refs to the generated images.",
  inputSchema: InputSchema,
  handler: async ({ project_id, limit }) => {
    const rows = getDb()
      .prepare(
        `SELECT id, model, prompt, cost_estimate, created_at, generated_image_ids
         FROM generations_log
         WHERE project_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(project_id, limit ?? 20) as {
      id: string;
      model: string;
      prompt: string | null;
      cost_estimate: number;
      created_at: string;
      generated_image_ids: string | null;
    }[];

    if (rows.length === 0) {
      return { content: [{ type: "text", text: "No generations found for this project." }] };
    }

    const lines = rows.map((r) => {
      const imageRefs =
        r.generated_image_ids
          ? r.generated_image_ids
              .split(",")
              .map((id) => id.trim())
              .filter(Boolean)
              .map((id) => `stored:gi_${id}`)
              .join(", ")
          : "(no images)";
      const prompt = r.prompt ? `"${r.prompt}"` : "(no prompt)";
      return `- [${r.created_at}] ${r.model} | ${prompt} | cost: $${r.cost_estimate.toFixed(4)} | images: ${imageRefs}`;
    });

    return {
      content: [
        {
          type: "text",
          text: `${rows.length} generation(s) for project ${project_id}:\n${lines.join("\n")}`,
        },
      ],
    };
  },
};

registerTool(listPastGenerationsTool);
