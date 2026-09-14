import { tool as aiTool, type Tool } from "ai";
import { getTool, listTools } from "@/lib/agent/tools";
import type { ToolContent, ToolResult } from "@/lib/agent/tools/types";

/**
 * Wraps one registered ThumbGen tool as an AI SDK tool() definition. Calls
 * straight into the existing ToolDefinition.handler — no MCP round-trip.
 * The registry (src/lib/agent/tools/index.ts) is untouched; this only
 * changes how the v2 chat route CONSUMES it (v1's loop.ts still goes
 * through the in-memory MCP client, unaffected by this file).
 */
function toAiSdkTool(name: string): Tool {
  const def = getTool(name);
  if (!def) throw new Error(`Unknown tool: ${name}`);
  return aiTool({
    description: def.description,
    inputSchema: def.inputSchema as any,
    execute: async (input: unknown) => {
      const result: ToolResult = await def.handler(input);
      return result as any;
    },
    // Shapes what the MODEL sees back. The UI (Plan 2) reads the raw
    // execute() return value (our ToolResult) directly off the tool part's
    // `output` field instead — this only controls the next model turn.
    toModelOutput: ({ output }: any) => {
      const result = output as ToolResult;
      return {
        type: "content" as const,
        value: result.content.map((c: ToolContent) =>
          c.type === "text"
            ? { type: "text" as const, text: c.text }
            : { type: "file" as const, mediaType: c.mimeType, data: c.data },
        ),
      } as any;
    },
  }) as Tool;
}

/** Builds the full { [toolName]: Tool } map streamText expects, from every tool currently in the registry. */
export function buildAiSdkTools(): Record<string, Tool> {
  const out: Record<string, Tool> = {};
  for (const def of listTools()) {
    out[def.name] = toAiSdkTool(def.name);
  }
  return out;
}
