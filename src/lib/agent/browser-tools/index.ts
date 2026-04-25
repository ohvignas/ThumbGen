import { requestUserImageTool } from "./request-user-image";

export type BrowserToolDef = {
  name: string;
  description: string;
  inputSchema: import("zod").ZodObject<import("zod").ZodRawShape>;
};

/**
 * Definitions of "browser-only" tools that the agent loop injects into the
 * Anthropic tools list (alongside the MCP-backed tools). When Claude calls one,
 * the loop emits a `ui_tool_request` SSE event and waits for the browser to
 * POST a result to /api/agent/chat/tool-result.
 *
 * NOTE: `request_user_sketch` is intentionally NOT exposed in v1 — the existing
 * SketchEditor lacks a save callback, so the suspend-handshake would hang.
 * Claude can still suggest sketches via `generate_sketch` (cheap automated draft)
 * which works end-to-end. To restore user-drawn sketches in v2, refactor
 * SketchEditor to dispatch a "sketch-saved-for-chat" event or accept a callback
 * prop, then re-add `requestUserSketchTool` here.
 */
export const BROWSER_TOOL_DEFS: BrowserToolDef[] = [
  requestUserImageTool,
];

export const BROWSER_TOOL_NAMES = new Set(BROWSER_TOOL_DEFS.map((t) => t.name));

export * from "./request-user-image";
// `request_user_sketch` definition is preserved (still exported via the file)
// but excluded from BROWSER_TOOL_DEFS for v1. Re-add when SketchEditor supports
// a save callback.
export * from "./request-user-sketch";
