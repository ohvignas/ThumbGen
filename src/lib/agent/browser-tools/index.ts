import { requestUserImageTool } from "./request-user-image";
import { requestUserSketchTool } from "./request-user-sketch";

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
 */
export const BROWSER_TOOL_DEFS: BrowserToolDef[] = [
  requestUserImageTool,
  requestUserSketchTool,
];

export const BROWSER_TOOL_NAMES = new Set(BROWSER_TOOL_DEFS.map((t) => t.name));

export * from "./request-user-image";
export * from "./request-user-sketch";
