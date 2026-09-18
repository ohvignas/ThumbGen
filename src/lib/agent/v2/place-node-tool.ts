import { tool as aiTool, type Tool } from "ai";
import { placeInterviewNode, placeNodeInputSchema, type PlaceNodeInput } from "@/lib/agent/place-node";
import type { ToolResult } from "@/lib/agent/tools/types";
import type { CanvasPatch } from "@/lib/canvas/canvas-patch";
import { toolResultToModelOutput } from "./tool-adapter";

export const PLACE_NODE_TOOL_NAME = "place_node";

/** Broadcasts a placed node to the open canvas (the chat route writes a transient `data-canvas-patch` chunk). */
export type WritePatch = (patch: CanvasPatch) => void;

/** Places the node, broadcasts the patch, and answers the model in the app's ToolResult shape. */
export async function executePlaceNode(projectId: string, input: PlaceNodeInput, writePatch: WritePatch): Promise<ToolResult> {
  const outcome = await placeInterviewNode(projectId, input);
  if (!outcome.ok) return { isError: true, content: [{ type: "text", text: outcome.error }] };

  try {
    writePatch(outcome.patch);
  } catch (error) {
    // The node is in the database already: an open canvas picks it up on its next reload.
    console.error("[agent v2] place_node: could not broadcast the canvas patch:", error);
  }

  const lines = [`node id: ${outcome.patch.node.id}`];
  if (outcome.linkedToGenerator) {
    lines.push(outcome.linkedNodeIds.length > 0 ? `linked to iv-generator: ${outcome.linkedNodeIds.join(", ")}` : "linked to iv-generator");
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
}

/**
 * The guided interview's `place_node`, built for ONE chat request: the
 * project comes from the request (never from the model) and `writePatch`
 * from the route's UI message stream writer. Not in the tool registry, so
 * never listed to MCP clients.
 */
export function buildPlaceNodeTool({ projectId, writePatch }: { projectId: string; writePatch: WritePatch }): Tool {
  return aiTool({
    description: [
      "Places or completes ONE interview node on the canvas (iv-prompt, iv-persona, iv-ref-1..3, iv-logo-1..3, iv-generator). Use for a single-variant workflow node by node. Never in the same step as ask_user or finish_turn. For A/B or several nodes at once, apply_workflow — this generator has no abTest.",
      "Ids and types: iv-prompt (prompt), iv-persona (faceReference, image_source stored:persona_<id>), iv-ref-1..3 (swipeFile reference), iv-logo-1..3 (swipeFile logo), iv-generator (generator, no abTest).",
      "A new node needs its full data; an existing node keeps its position and every field you leave out. New nodes are laid out to the right of the existing canvas, and once iv-generator exists every interview node is wired to it automatically (face-in, ref-in, logo-in, prompt-in).",
      'Returns "node id: <id>", plus "linked to iv-generator" when the node is wired to the generator.',
    ].join("\n"),
    inputSchema: placeNodeInputSchema,
    execute: async (input: PlaceNodeInput) => executePlaceNode(projectId, input, writePatch),
    toModelOutput: ({ output }: { output: unknown }) => toolResultToModelOutput(output),
  }) as Tool;
}
