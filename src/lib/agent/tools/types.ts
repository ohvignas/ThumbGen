import { z } from "zod";

export type ToolContent =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; data: string }; // base64

export type ToolResult = { content: ToolContent[]; isError?: boolean };

export type ToolHandler<I> = (input: I) => Promise<ToolResult>;

export type ToolDefinition<I = unknown> = {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  handler: ToolHandler<I>;
};
