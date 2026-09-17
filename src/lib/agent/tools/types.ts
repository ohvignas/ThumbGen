import { z } from "zod";

export type ToolContent =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; data: string }; // base64

export type ToolResult = {
  content: ToolContent[];
  isError?: boolean;
  /** Set on an error that happened before any paid request left the app (cost guards give their reservation back). */
  requestNotSent?: boolean;
};

export type ToolHandler<I> = (input: I) => Promise<ToolResult>;

export type ToolDefinition<I = unknown> = {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  handler: ToolHandler<I>;
  /** Only meaningful inside ThumbGen's chat panel: the MCP server never lists it. */
  chatOnly?: boolean;
};
