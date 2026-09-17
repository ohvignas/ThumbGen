import { z } from "zod";
import type { ToolResult } from "@/lib/agent/tools/types";

/**
 * Shared contract of the chat-only `finish_turn` tool (chantier E): the agent
 * calls it once at the end of every turn, and the chat panel reads its input
 * to show a short answer, the visual results and « Et maintenant » buttons.
 * Pure module — imported by the server tool, the AI SDK adapter and the chat UI.
 */
export const FINISH_TURN_TOOL_NAME = "finish_turn";

/** Tools whose output the chat can show as a visual result card. */
export const VISUAL_RESULT_TOOLS = ["generate_sketch", "import_youtube_thumbnail", "search_youtube"] as const;

export function isVisualResultTool(toolName: string): boolean {
  return (VISUAL_RESULT_TOOLS as readonly string[]).includes(toolName);
}

/** Start of the line appended to a visual tool's successful output, so the model can cite the call in `results`. */
export const RESULT_ID_PREFIX = "result_id: ";

export const FINISH_TURN_LIMITS = {
  summary: 400,
  results: 6,
  nextActions: 3,
  label: 40,
  message: 300,
} as const;

const nextActionSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(1)
      .max(FINISH_TURN_LIMITS.label)
      .optional()
      .describe("Button text, max 40 characters, in the reply language. Required for ask_agent and focus_node; leave it out for generate (the app writes it with the cost)."),
    kind: z
      .enum(["ask_agent", "focus_node", "generate"])
      .describe(
        '"ask_agent" sends `message` to you as the user\'s reply; "focus_node" selects and centers `node_id` on the canvas; "generate" shows the « Générer » button of generator `node_id` — the user clicks it to start the paid generation.',
      ),
    message: z
      .string()
      .trim()
      .min(1)
      .max(FINISH_TURN_LIMITS.message)
      .optional()
      .describe("Required when kind is ask_agent: the reply sent in the user's name, max 300 characters."),
    node_id: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Required when kind is focus_node or generate: the id of a node on the canvas."),
  })
  .superRefine((action, ctx) => {
    if (action.kind !== "generate" && !action.label) {
      ctx.addIssue({ code: "custom", path: ["label"], message: `label is required when kind is ${action.kind}` });
    }
    if (action.kind === "generate" && !action.node_id) {
      ctx.addIssue({ code: "custom", path: ["node_id"], message: "node_id is required when kind is generate" });
    }
    if (action.kind === "ask_agent" && !action.message) {
      ctx.addIssue({ code: "custom", path: ["message"], message: "message is required when kind is ask_agent" });
    }
    if (action.kind === "focus_node" && !action.node_id) {
      ctx.addIssue({ code: "custom", path: ["node_id"], message: "node_id is required when kind is focus_node" });
    }
  });

export const finishTurnInputSchema = z.object({
  summary: z
    .string()
    .trim()
    .min(1)
    .max(FINISH_TURN_LIMITS.summary)
    .describe("Your answer to the user: 1 to 2 short sentences, max 400 characters."),
  results: z
    .array(z.string().trim().min(1))
    .max(FINISH_TURN_LIMITS.results)
    .default([])
    .describe("Up to 6 result_id values of this turn's visual tool calls, in display order."),
  next_actions: z
    .array(nextActionSchema)
    .max(FINISH_TURN_LIMITS.nextActions)
    .default([])
    .describe("0 to 3 one-click follow-ups shown under the answer."),
});

export type FinishTurnInput = z.output<typeof finishTurnInputSchema>;

/** The validated input, or null when it is missing or invalid (the chat then falls back). */
export function parseFinishTurnInput(input: unknown): FinishTurnInput | null {
  const parsed = finishTurnInputSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

/** Appends `result_id: <toolCallId>` to a visual tool's successful output; any other output is returned as is. */
export function appendResultId(toolName: string, result: ToolResult, toolCallId: string): ToolResult {
  if (result.isError || !isVisualResultTool(toolName)) return result;
  return { ...result, content: [...result.content, { type: "text", text: `${RESULT_ID_PREFIX}${toolCallId}` }] };
}
