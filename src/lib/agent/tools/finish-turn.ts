import { FINISH_TURN_TOOL_NAME, finishTurnInputSchema, type FinishTurnInput } from "@/lib/agent/finish-turn";
import type { ToolDefinition } from "./types";
import { registerTool } from "./index";
import { debugLog } from "@/lib/debug-log";

export const finishTurnTool: ToolDefinition<FinishTurnInput> = {
  name: FINISH_TURN_TOOL_NAME,
  description:
    "Ends the current chat turn. Call it exactly once per turn, as your last tool call, alone in its own step once every other tool result is back. The chat shows the user only `summary` and the visual results listed in `results` (the result_id values printed at the end of generate_sketch, import_youtube_thumbnail and search_youtube outputs). `next_actions` must be []. Do not offer generate, focus_node, or ask_agent chips. Everything else from the turn is folded into a collapsed step list. No side effect.",
  inputSchema: finishTurnInputSchema,
  chatOnly: true,
  handler: async (input) => {
    debugLog("chat", "finish_turn", {
      summaryChars: input.summary.length,
      results: input.results.length,
      nextActions: input.next_actions.map((action) => action.kind),
    });
    return { content: [{ type: "text", text: JSON.stringify({ ok: true }) }] };
  },
};

registerTool(finishTurnTool);
