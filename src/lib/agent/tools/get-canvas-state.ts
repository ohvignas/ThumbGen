import { z } from "zod";
import { getDb } from "@/lib/db";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({ project_id: z.string() });

export const getCanvasStateTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "get_canvas_state",
  description:
    "Reads the current workflow on the canvas for a given project. Returns a compact JSON blueprint with nodes (id, type, summary) and edges (source, target, targetHandle). Use this at the start of every conversation turn to know what already exists. Binary image data is stripped — call get_node_details if you need the full node payload.",
  inputSchema: InputSchema,
  handler: async ({ project_id }) => {
    const row = getDb()
      .prepare("SELECT nodes, edges FROM projects WHERE id = ?")
      .get(project_id) as { nodes: string; edges: string } | undefined;

    if (!row) {
      return { content: [{ type: "text", text: JSON.stringify({ nodes: [], edges: [] }) }] };
    }

    const nodes = JSON.parse(row.nodes).map(
      (n: { id: string; type: string; data: Record<string, unknown> }) => ({
        id: n.id,
        type: n.type,
        summary: summarize(n.type, n.data),
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

function summarize(type: string, data: Record<string, unknown>): Record<string, unknown> {
  switch (type) {
    case "prompt":
      return { prompt: data.prompt, negativePrompt: data.negativePrompt };
    case "generator":
      return { model: data.model, aspectRatio: data.aspectRatio, count: data.count };
    case "faceReference":
    case "swipeFile":
    case "sketch":
      return {
        hasImage: Boolean(data.imageBase64 || data.imageUrl || data.image_source),
        label: data.label,
        kind: data.kind, // for swipeFile only; undefined elsewhere is fine
      };
    case "preview":
      return { hasOutput: Boolean(data.imageBase64 || data.imageUrl) };
    default:
      return {};
  }
}

registerTool(getCanvasStateTool);
