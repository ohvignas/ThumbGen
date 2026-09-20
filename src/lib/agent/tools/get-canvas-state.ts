import { z } from "zod";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";
import { describeCurrentThumbnails } from "@/lib/canvas/current-thumbnail";
import { countSketchNodes, loadLiveProjectCanvas } from "@/lib/canvas/live-sketches";
import { summarizeNode } from "@/lib/canvas/node-summary";

const InputSchema = z.object({ project_id: z.string() });

export const getCanvasStateTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "get_canvas_state",
  description:
    "Reads compact JSON of the open canvas (ids, types, summaries — no image bytes). Includes liveSketchCount (visible sketch nodes only; deleted/tombstoned sketches are omitted). Use when <canvas_state> may be stale after a write, or you need ids you just created. Prefer the injected <canvas_state> on this turn. To SEE pixels, call view_canvas_images.",
  inputSchema: InputSchema,
  handler: async ({ project_id }) => {
    const live = loadLiveProjectCanvas(project_id);
    if (!live) {
      return { content: [{ type: "text", text: JSON.stringify({ nodes: [], edges: [], liveSketchCount: 0 }) }] };
    }

    const nodes = live.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      summary: summarizeNode(n.type, n.data ?? {}),
    }));
    const edges = live.edges.map((e) => ({
      source: e.source,
      target: e.target,
      targetHandle: e.targetHandle,
    }));
    const currentThumbnails = describeCurrentThumbnails(nodes, edges);
    const liveSketchCount = countSketchNodes(nodes);

    return {
      content: [{
        type: "text",
        text: JSON.stringify(
          { nodes, edges, liveSketchCount, ...(currentThumbnails.length > 0 ? { currentThumbnails } : {}) },
          null,
          2,
        ),
      }],
    };
  },
};

registerTool(getCanvasStateTool);
