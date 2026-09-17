import { FINISH_TURN_TOOL_NAME, finishTurnInputSchema, type FinishTurnInput } from "@/lib/agent/finish-turn";
import type { ToolDefinition } from "./types";
import { registerTool } from "./index";

export const finishTurnTool: ToolDefinition<FinishTurnInput> = {
  name: FINISH_TURN_TOOL_NAME,
  description:
    "Ends the current chat turn. Call it exactly once per turn, as your last tool call, alone in its own step once every other tool result is back. The chat shows the user only `summary`, the visual results listed in `results` (the result_id values printed at the end of generate_sketch, import_youtube_thumbnail and search_youtube outputs) and the `next_actions` buttons; everything else from the turn is folded into a collapsed step list. No side effect.",
  inputSchema: finishTurnInputSchema,
  chatOnly: true,
  handler: async () => ({ content: [{ type: "text", text: JSON.stringify({ ok: true }) }] }),
};

registerTool(finishTurnTool);
