import { z } from "zod";
import { getDb } from "@/lib/db";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";
import { summarizeNode } from "@/lib/canvas/node-summary";

const InputSchema = z.object({ project_id: z.string() });

export const getCanvasStateTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "get_canvas_state",
  description:
    "Reads compact JSON of the open canvas (ids, types, summaries — no image bytes). Use when <canvas_state> may be stale after a write, or you need ids you just created. Prefer the injected <canvas_state> on this turn. To SEE pixels, call view_canvas_images.",
  inputSchema: InputSchema,
  handler: async ({ project_id }) => {
    const row = getDb()
      .prepare("SELECT nodes, edges FROM projects WHERE id = ?")
      .get(project_id) as { nodes: string; edges: string } | undefined;

    if (!row) {
      return { content: [{ type: "text", text: JSON.stringify({ nodes: [], edges: [] }) }] };
    }

    const nodes = JSON.parse(row.nodes).map(
      (n: { id: string; type: string; data?: Record<string, unknown> }) => ({
        id: n.id,
        type: n.type,
        summary: summarizeNode(n.type, n.data ?? {}),
      })
    );
    const edges = JSON.parse(row.edges).map(
      (e: { source: string; target: string; targetHandle?: string }) => ({
        source: e.source,
        target: e.target,
        targetHandle: e.targetHandle,
      })
    );

    return {
      content: [{ type: "text", text: JSON.stringify({ nodes, edges }, null, 2) }],
    };
  },
};

registerTool(getCanvasStateTool);
