import { tool as aiTool, type Tool } from "ai";
import { getTool, listTools } from "@/lib/agent/tools";
import type { ToolContent, ToolResult } from "@/lib/agent/tools/types";
import { appendResultId } from "@/lib/agent/finish-turn";
// Side-effect-only import: populates the tool registry (src/lib/agent/tools/index.ts)
// by loading every tool module, each of which calls registerTool() on load. Without
// this, listTools()/getTool() below see an empty registry in the real app — the only
// thing that previously triggered this population was `tests/agent/v2-route-handler.test.ts`
// importing "@/lib/agent/tools/all" itself, which masked the gap in production/dev (npm run
// test was green while the real chat route had zero server-side tools available to the model).
import "@/lib/agent/tools/all";

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
    execute: async (input: unknown, { toolCallId }: { toolCallId: string }) => {
      const result: ToolResult = await def.handler(input);
      // Visual tools end with "result_id: <toolCallId>" so the model can cite
      // them in finish_turn.results — it never sees tool call ids otherwise.
      return appendResultId(name, result, toolCallId) as any;
    },
    // Shapes what the MODEL sees back. The UI (Plan 2) reads the raw
    // execute() return value (our ToolResult) directly off the tool part's
    // `output` field instead — this only controls the next model turn.
    //
    // The file branch's `data` MUST be the tagged `FileData` object
    // (`{ type: "data", data: <base64 string> }`), not a bare base64
    // string — confirmed against @ai-sdk/provider-utils's real FilePart
    // type (`data: FileData | DataContent | URL | ProviderReference`,
    // where the bare-string shorthand is only for the message-level
    // FilePart, auto-normalized by ai@7.0.99's own standardizePrompt/
    // convertToLanguageModelPrompt before it reaches a provider — see
    // node_modules/ai/dist/index.js ~L1306-1327). A tool RESULT's
    // `output.value[]` items go through a separate schema
    // (LanguageModelV4ToolResultOutput's content union) that does NOT get
    // that same normalization, and there `type:"file"` strictly requires
    // `data` to already be the tagged object — a bare string fails Zod's
    // ModelMessage[] validation with "Invalid input: expected object,
    // received string" at `content[].output.value[N].data`. Reproduced
    // live: every image-bearing tool result (e.g. search_youtube's
    // thumbnail gallery) tripped this on the very next model turn,
    // surfacing to the client as a generic SSE `{"type":"error"}` with no
    // indication this was the cause — see task-14-report.md's Bug 2
    // write-up for the full trace.
    toModelOutput: ({ output }: any) => {
      const result = output as ToolResult;
      // Registry failures ({ isError: true }) become an error-text output: a
      // "content" output would drop isError once persisted, and the reopened
      // chat would show the failed step as ✓ (and a failed visual as a result).
      if (result.isError === true) {
        const text = result.content.flatMap((c: ToolContent) => (c.type === "text" ? [c.text] : [])).join("\n");
        return { type: "error-text" as const, value: text || "Erreur" };
      }
      return {
        type: "content" as const,
        value: result.content.map((c: ToolContent) =>
          c.type === "text"
            ? { type: "text" as const, text: c.text }
            : { type: "file" as const, mediaType: c.mimeType, data: { type: "data" as const, data: c.data } },
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
