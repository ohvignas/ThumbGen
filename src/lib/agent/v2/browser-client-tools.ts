import { tool as aiTool } from "ai";
import { requestUserImageInputSchema } from "@/lib/agent/browser-tools/request-user-image";
import { askUserToolInputSchema } from "@/lib/agent/browser-tools/ask-user";

/**
 * AI SDK "client tool": no `execute`, so streamText pauses the step and the
 * client resolves it via useChat's addToolOutput (Plan 2). This replaces
 * v1's ui_tool_request / registerPending(requestId) handshake, which is
 * confirmed broken: loop.ts registers the pending promise under a freshly
 * generated requestId, but resolution (POST /api/agent/chat/tool-result)
 * looks it up by the model's tool_call id — two different keys, never
 * reconciled, no timeout. addToolOutput correlates by the model's own
 * toolCallId end to end, so there is no second synthetic ID to keep in
 * sync — this fixes the hang by construction, not by patching the old
 * two-ID handshake.
 *
 * request_user_sketch is intentionally NOT included here, matching v1
 * (browser-tools/index.ts excludes it from BROWSER_TOOL_DEFS) — SketchEditor
 * still has no save callback, unrelated to this migration.
 */
export const requestUserImageClientTool = aiTool({
  description:
    "Asks the user to upload an image (logo or reference). The browser opens a file picker or the library. Never for the creator's face — that must be a Personnage (list_personas). The conversation suspends until they upload OR skip. Don't call finish_turn in the same step.",
  inputSchema: requestUserImageInputSchema,
});

/**
 * Guided interview question (chantier F2): the chat shows a card with the
 * options; the turn resumes only once the user clicks an answer.
 */
export const askUserClientTool = aiTool({
  description:
    "Asks the user ONE clickable question (0–12 text options: full label + one-line description). The card never shows photos — omit image / image_url; persona, logo, canvas, YouTube and sketch refs are ignored. The chat adds « Autre » and, when allow_skip, « Passer ». Pause until { selected }, { other } or { skipped }. Call it alone in its model step (never with place_node or finish_turn). Skip the question if you can deduce the answer.",
  inputSchema: askUserToolInputSchema,
});

export const V2_CLIENT_TOOLS = {
  request_user_image: requestUserImageClientTool,
  ask_user: askUserClientTool,
};

export const V2_CLIENT_TOOL_NAMES = new Set(Object.keys(V2_CLIENT_TOOLS));
