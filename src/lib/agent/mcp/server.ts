import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listTools } from "@/lib/agent/tools";
import { MCP_BRIEF_TOOLS, runMcpBriefTool } from "./brief-tools";
import { MCP_WORKFLOW_TOOLS } from "./workflow-tools";

const MCP_INSTRUCTIONS =
  "ThumbGen builds YouTube thumbnails on a node canvas. Call list_skills first, then read_skill(\"mcp-workflow\") for the end-to-end order: create_project → create_upload_link (local images) → apply_workflow → run_generator (paid) → view_canvas_images → export_image. A face is always a Personnage (list_personas). run_generator and generate_sketch cost money: call them only when the user asked for images.";

/**
 * Builds an McpServer instance that exposes every tool currently registered
 * in the global tool registry. Caller should ensure tools are imported
 * (typically by importing `@/lib/agent/tools/all`) BEFORE calling this.
 */
export function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "thumbgen", version: "1.1.0" }, { instructions: MCP_INSTRUCTIONS });

  for (const tool of listTools()) {
    // Chat-only tools (finish_turn) mean nothing to an external MCP client.
    if (tool.chatOnly) continue;
    // The MCP SDK registerTool inputSchema accepts either:
    //   - ZodRawShapeCompat: a plain Record<string, ZodType> (the .shape object)
    //   - AnySchema: a full Zod v3/v4 type
    //
    // Since we use Zod v4, ZodObject is an AnySchema (z4.$ZodType) and can be
    // passed directly. For non-object schemas we pass the schema as-is too.
    // However, for zero-arg tools (z.object({})), passing the shape {} is cleaner.
    //
    // We extract .shape when the schema is a ZodObject so the SDK can generate
    // accurate JSON Schema for the tool's inputSchema in the protocol listing.
    const inputSchema = extractShape(tool.inputSchema);

    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema },
      async (args: unknown) => {
        // Re-validate against our own full schema to catch coercion issues
        const parsed = tool.inputSchema.safeParse(args ?? {});
        if (!parsed.success) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Invalid arguments: ${JSON.stringify((parsed as z.ZodSafeParseError<unknown>).error.format())}`,
              },
            ],
            isError: true,
          };
        }
        return await tool.handler(parsed.data);
      },
    );
  }

  // Brief tools are built per chat conversation, outside the registry; over
  // MCP they run on the named project's "MCP" conversation.
  for (const tool of MCP_BRIEF_TOOLS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.shape },
      async (args: unknown) => await runMcpBriefTool(tool, (args ?? {}) as Record<string, unknown>),
    );
  }

  // MCP-only workflow tools (skills, project creation, file in/out, paid run):
  // what a client without a ThumbGen window cannot do otherwise.
  for (const tool of MCP_WORKFLOW_TOOLS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.shape },
      async (args: unknown) => await tool.run((args ?? {}) as Record<string, unknown>),
    );
  }

  return server;
}

/**
 * If the schema is a Zod v4 object (has `_def.type === "object"` and a `.shape`),
 * return the raw shape so the SDK can register the tool with proper parameter schema.
 * Otherwise return the schema as-is (it qualifies as AnySchema in the SDK).
 */
function extractShape(
  s: z.ZodType,
): Record<string, z.ZodType> | z.ZodType {
  if (
    s &&
    typeof s === "object" &&
    "_def" in s &&
    (s as { _def: { type?: string } })._def?.type === "object" &&
    "shape" in s
  ) {
    return (s as z.ZodObject<z.ZodRawShape>).shape as Record<string, z.ZodType>;
  }
  return s;
}
