import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listTools } from "@/lib/agent/tools";

/**
 * Builds an McpServer instance that exposes every tool currently registered
 * in the global tool registry. Caller should ensure tools are imported
 * (typically by importing `@/lib/agent/tools/all`) BEFORE calling this.
 */
export function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "thumbgen", version: "1.0.0" });

  for (const tool of listTools()) {
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
      async (args) => {
        // Re-validate against our own full schema to catch coercion issues
        const parsed = tool.inputSchema.safeParse(args ?? {});
        if (!parsed.success) {
          return {
            content: [
              {
                type: "text",
                text: `Invalid arguments: ${JSON.stringify((parsed as z.SafeParseError<unknown>).error.format())}`,
              },
            ],
            isError: true,
          };
        }
        return await tool.handler(parsed.data);
      },
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
