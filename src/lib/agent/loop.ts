import Anthropic from "@anthropic-ai/sdk";
import { getInMemoryMcpClient } from "@/lib/agent/mcp/in-memory-client";
import { buildSystemMessages } from "@/lib/agent/system-prompt";
import { appendMessage, listMessages } from "@/lib/agent/conversation/store";
import { registerPending, abandonPending } from "@/lib/agent/pending-actions";
import { BROWSER_TOOL_DEFS, BROWSER_TOOL_NAMES } from "@/lib/agent/browser-tools";
import { resolveImageSource } from "@/lib/agent/tools/_helpers/image-source";
import { getSetting } from "@/lib/settings";

const MODEL = "claude-sonnet-4-6";
const MAX_ITER = 25;

// Approximate Sonnet 4.6 pricing per million tokens — refresh from current docs.
// Used only for cost display; actual billing is on Anthropic's side.
const PRICE_INPUT_PER_M = 3.0;
const PRICE_OUTPUT_PER_M = 15.0;

export type SendFn = (event: string, data: unknown) => void;

export type AgentLoopOptions = {
  conversation_id: string;
  project_id: string;
  message: {
    text: string;
    attachments?: Array<{ type: "image"; source: string }>;
  };
  canvas_snapshot: unknown;
  abort: AbortSignal;
  send: SendFn;
};

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: unknown };

export async function runAgentLoop(opts: AgentLoopOptions): Promise<void> {
  const { conversation_id, project_id, message, canvas_snapshot, abort, send } = opts;

  // 1. Build user content blocks (text + resolved image attachments)
  const userBlocks: ContentBlock[] = [{ type: "text", text: message.text || "" }];
  for (const a of message.attachments ?? []) {
    if (a.type !== "image") continue;
    try {
      const img = await resolveImageSource(a.source);
      userBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.mimeType,
          data: img.bytes.toString("base64"),
        },
      });
    } catch (e) {
      send("error", { message: `Attachment failed: ${(e as Error).message}` });
      return;
    }
  }

  // 2. Persist the user message
  appendMessage({
    conversation_id,
    role: "user",
    content_json: JSON.stringify(userBlocks),
    interrupted: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    cost_estimate: 0,
  });

  // 3. Build the message history (full conversation thread)
  type AnthropicMsg = { role: "user" | "assistant"; content: unknown };
  const history: AnthropicMsg[] = listMessages(conversation_id).map((m) => ({
    role: m.role,
    content: JSON.parse(m.content_json),
  }));

  // 4. Connect MCP and assemble tools list
  const mcp = await getInMemoryMcpClient();
  const { tools: mcpTools } = await mcp.listTools();

  // Zod v4 has a native toJSONSchema() on ZodObject — use it directly instead of
  // a hand-rolled converter. Strip the $schema field Anthropic doesn't accept.
  const browserToolSpecs = BROWSER_TOOL_DEFS.map((def) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { $schema, ...input_schema } = def.inputSchema.toJSONSchema() as Record<string, unknown> & { $schema?: string };
    return {
      name: def.name,
      description: def.description,
      input_schema,
    };
  });

  const mcpToolSpecs = mcpTools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    input_schema: t.inputSchema as Record<string, unknown>,
  }));

  const tools = [
    ...mcpToolSpecs,
    ...browserToolSpecs,
    { type: "web_search_20250305", name: "web_search", max_uses: 5 },
  ];

  // 5. Resolve API key
  const apiKey = getSetting("anthropicApiKey") || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    send("error", { message: "ANTHROPIC_API_KEY not configured" });
    return;
  }

  const anthropic = new Anthropic({ apiKey });
  const systemBlocks = buildSystemMessages(canvas_snapshot, project_id);

  // 6. Loop
  let iter = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let assistantBlocks: ContentBlock[] = [];

  while (iter++ < MAX_ITER) {
    if (abort.aborted) break;

    let resp: Awaited<ReturnType<typeof anthropic.messages.create>>;
    try {
      // Cast tools to never to avoid Anthropic SDK type strictness on union types
      resp = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: systemBlocks as never,
        tools: tools as never,
        messages: history as never,
      });
    } catch (e) {
      send("error", { message: `Claude API error: ${(e as Error).message}` });
      return;
    }

    if ("usage" in resp && resp.usage) {
      totalInput += resp.usage.input_tokens ?? 0;
      totalOutput += resp.usage.output_tokens ?? 0;
    }

    // Forward text deltas + collect blocks
    const respBlocks = (resp.content ?? []) as ContentBlock[];
    for (const block of respBlocks) {
      if (block.type === "text") {
        send("text_delta", { content: (block as { text: string }).text });
      }
    }
    assistantBlocks = [...assistantBlocks, ...respBlocks];

    if (resp.stop_reason === "tool_use") {
      const toolResults: ContentBlock[] = [];
      for (const block of respBlocks) {
        if (block.type !== "tool_use") continue;
        const tu = block as { id: string; name: string; input: unknown };
        send("tool_call", {
          id: tu.id,
          name: tu.name,
          input: tu.input,
          scope: BROWSER_TOOL_NAMES.has(tu.name) ? "ui" : "server",
        });

        if (BROWSER_TOOL_NAMES.has(tu.name)) {
          // UI tool — emit request, await browser response (or abort)
          send("ui_tool_request", { id: tu.id, name: tu.name, input: tu.input });
          let result: unknown;
          let wasAborted = false;
          try {
            result = await Promise.race([
              registerPending(tu.id),
              new Promise<{ aborted: true }>((resolve) => {
                abort.addEventListener(
                  "abort",
                  () => {
                    wasAborted = true;
                    resolve({ aborted: true });
                  },
                  { once: true },
                );
              }),
            ]);
          } finally {
            // If we aborted before the browser responded, drop the pending entry
            // (otherwise it would leak — the browser POST would still resolve it
            // into nothing, which is harmless, but the Map entry stays).
            if (wasAborted) abandonPending(tu.id);
          }
          send("ui_tool_response_ack", { id: tu.id });
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            // UI tool results are small objects ({source_ids: [...]} | {skipped: true})
            // — JSON-stringify is fine.
            content: JSON.stringify(result),
          });
        } else {
          // MCP tool — pass content blocks through directly so image-returning
          // tools (generate_sketch, remix_image, edit_image) make their images
          // visible to Claude on the next turn instead of degrading to JSON text.
          try {
            const r = await mcp.callTool({
              name: tu.name,
              arguments: (tu.input ?? {}) as Record<string, unknown>,
            });
            const summary = summarizeToolResult(r as { content: unknown });
            send("tool_result", { id: tu.id, name: tu.name, summary });
            toolResults.push({
              type: "tool_result",
              tool_use_id: tu.id,
              // Anthropic accepts content as ContentBlock[] directly — preserves
              // text + image blocks correctly.
              content: r.content as never,
            });
          } catch (e) {
            const errText = (e as Error).message;
            send("tool_result", { id: tu.id, name: tu.name, summary: `Error: ${errText}` });
            toolResults.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: errText,
            });
          }
        }
      }

      history.push({ role: "assistant", content: respBlocks });
      history.push({ role: "user", content: toolResults });
      continue;
    }

    if (resp.stop_reason === "pause_turn") {
      // Server-side tools (web_search) need another iteration
      history.push({ role: "assistant", content: respBlocks });
      continue;
    }

    // end_turn / stop_sequence / max_tokens
    break;
  }

  // 7. Persist the assistant message
  const cost =
    (totalInput * PRICE_INPUT_PER_M) / 1_000_000 +
    (totalOutput * PRICE_OUTPUT_PER_M) / 1_000_000;

  appendMessage({
    conversation_id,
    role: "assistant",
    content_json: JSON.stringify(assistantBlocks),
    interrupted: abort.aborted ? 1 : 0,
    total_input_tokens: totalInput,
    total_output_tokens: totalOutput,
    cost_estimate: cost,
  });

  send("done", { usage: { input: totalInput, output: totalOutput }, cost });
}

function summarizeToolResult(r: { content: unknown }): string {
  if (!Array.isArray(r.content)) return "";
  const first = r.content.find(
    (c: { type?: string; text?: string }) => c.type === "text" && c.text,
  ) as { text?: string } | undefined;
  return (first?.text ?? "").slice(0, 200);
}
