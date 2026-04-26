import { getInMemoryMcpClient } from "@/lib/agent/mcp/in-memory-client";
import { buildSystemMessages } from "@/lib/agent/system-prompt";
import { appendMessage, listMessages } from "@/lib/agent/conversation/store";
import { generateAndPersistTitle } from "@/lib/agent/conversation/auto-title";
import { registerPending, abandonPending } from "@/lib/agent/pending-actions";
import { BROWSER_TOOL_DEFS, BROWSER_TOOL_NAMES } from "@/lib/agent/browser-tools";
import { resolveImageSource } from "@/lib/agent/tools/_helpers/image-source";
import { getSetting } from "@/lib/settings";
import { startGcLoop } from "./gc";
import { getOpenRouterClient } from "@/lib/agent/llm-client";
import {
  toolsToOpenAI,
  persistedMessagesToOpenAI,
  type AnthropicBlock,
} from "@/lib/agent/translate";
import { getModelById, DEFAULT_AGENT_MODEL } from "@/lib/agent/models";
import { v4 as uuid } from "uuid";

if (typeof window === "undefined") {
  startGcLoop();
}

const MAX_ITER = 25;
const MAX_TOKENS = 16000;
// Reasoning effort the agent gets when the chosen model supports thinking.
// "medium" is the OpenRouter knob roughly equivalent to ~6K thinking budget on
// Claude or Gemini's medium thinking — enough to plan tool calls without
// blowing latency or cost.
const REASONING_EFFORT = "medium" as const;

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

type ContentBlock = AnthropicBlock;

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

  // 2. Persist the user message + auto-title on first turn
  const isFirstTurn = listMessages(conversation_id).length === 0;
  appendMessage({
    conversation_id,
    role: "user",
    content_json: JSON.stringify(userBlocks),
    interrupted: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    cost_estimate: 0,
  });
  if (isFirstTurn && message.text?.trim()) {
    void generateAndPersistTitle(conversation_id, message.text, send);
  }

  // 3. Build the message history. Strip cross-turn tool blocks (each turn
  // restarts fresh tool-wise — Anthropic required strict pairing; for
  // OpenAI the same constraint applies because tool_call ids only exist
  // within their own turn) then translate to OpenAI shape.
  const persisted = listMessages(conversation_id).map((m) => ({
    role: m.role as "user" | "assistant",
    content: (() => {
      const raw = JSON.parse(m.content_json) as ContentBlock[];
      return raw.filter((b) => b.type !== "tool_use" && b.type !== "tool_result");
    })(),
  })).filter((m) => m.content.length > 0);
  const oaiHistory = persistedMessagesToOpenAI(persisted);

  // 4. Connect MCP and assemble tools list
  const mcp = await getInMemoryMcpClient();
  const { tools: mcpTools } = await mcp.listTools();

  const browserToolSpecs = BROWSER_TOOL_DEFS.map((def) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { $schema, ...input_schema } = def.inputSchema.toJSONSchema() as Record<string, unknown> & { $schema?: string };
    return { name: def.name, description: def.description, input_schema };
  });
  const mcpToolSpecs = mcpTools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    input_schema: t.inputSchema as Record<string, unknown>,
  }));
  const tools = toolsToOpenAI([...mcpToolSpecs, ...browserToolSpecs]);

  // 5. Resolve client + model
  const client = getOpenRouterClient();
  if (!client) {
    const msg = "Clé OpenRouter non configurée. Ajoute OPENROUTER_API_KEY dans Settings.";
    send("error", { message: msg });
    appendMessage({
      conversation_id,
      role: "assistant",
      content_json: JSON.stringify([{ type: "text", text: `⚠ ${msg}` }]),
      interrupted: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      cost_estimate: 0,
    });
    return;
  }

  const userModelId = getSetting("agentModel") || DEFAULT_AGENT_MODEL;
  const webSearchOn = getSetting("agentWebSearch") !== "0";
  // OpenRouter's `web` plugin works with any model and is the modern API for
  // augmenting completions with search results. The legacy `:online` suffix
  // 404s on a lot of models (incl. google/gemini-3-pro-preview), so prefer
  // the plugins array.
  const modelId = userModelId;
  const modelInfo = getModelById(userModelId);
  const webPlugin = webSearchOn ? [{ id: "web" }] : undefined;

  // 6. Build the OpenAI messages: system + history + new user turn
  const systemBlocks = buildSystemMessages(canvas_snapshot, project_id);
  const systemText = systemBlocks.map((b) => b.text).join("\n\n");

  type ChatMessage = Parameters<typeof client.chat.completions.create>[0]["messages"][number];
  const newUserContent: ChatMessage["content"] =
    userBlocks.length === 1 && userBlocks[0].type === "text"
      ? userBlocks[0].text
      : (userBlocks.map((b) =>
          b.type === "text"
            ? { type: "text" as const, text: b.text }
            : {
                type: "image_url" as const,
                image_url: {
                  url: `data:${(b as Extract<ContentBlock, { type: "image" }>).source.media_type};base64,${(b as Extract<ContentBlock, { type: "image" }>).source.data}`,
                },
              },
        ) as ChatMessage["content"]);

  const oaiMessages: ChatMessage[] = [
    { role: "system", content: systemText },
    ...(oaiHistory as ChatMessage[]),
    { role: "user", content: newUserContent } as ChatMessage,
  ];

  // 7. Iterate up to MAX_ITER tool-use rounds
  let totalInput = 0;
  let totalOutput = 0;
  const accumulatedAssistantBlocks: ContentBlock[] = [];
  const pendingToolResults: ContentBlock[] = [];

  for (let iter = 0; iter < MAX_ITER; iter++) {
    if (abort.aborted) break;

    let stream: AsyncIterable<{
      choices?: Array<{ delta?: unknown }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    }>;
    try {
      stream = (await client.chat.completions.create({
        model: modelId,
        max_tokens: MAX_TOKENS,
        messages: oaiMessages,
        tools: tools.length ? (tools as never) : undefined,
        tool_choice: tools.length ? "auto" : undefined,
        stream: true,
        ...(modelInfo?.supportsThinking ? ({ reasoning_effort: REASONING_EFFORT } as never) : {}),
        ...(webPlugin ? ({ plugins: webPlugin } as never) : {}),
      })) as never;
    } catch (e) {
      const errMsg = (e as Error).message || String(e);
      console.error("[agent] OpenRouter create() failed:", errMsg, e);
      send("error", { message: `OpenRouter ${modelId}: ${errMsg}` });
      appendMessage({
        conversation_id,
        role: "assistant",
        content_json: JSON.stringify([{ type: "text", text: `⚠ OpenRouter (${modelId}): ${errMsg}` }]),
        interrupted: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
        cost_estimate: 0,
      });
      return;
    }

    // 8. Accumulate streaming chunks
    let accumText = "";
    const toolCallAccum = new Map<number, { id?: string; name?: string; args: string }>();
    let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;

    for await (const chunk of stream) {
      if (abort.aborted) break;
      const choice = chunk.choices?.[0];
      const delta = choice?.delta as
        | {
            content?: string;
            tool_calls?: Array<{
              index: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }>;
          }
        | undefined;
      if (delta?.content) {
        accumText += delta.content;
        send("text_delta", { content: delta.content });
      }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const cur = toolCallAccum.get(tc.index) ?? { args: "" };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name = tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          toolCallAccum.set(tc.index, cur);
        }
      }
      if (chunk.usage) usage = chunk.usage;
    }

    if (accumText) accumulatedAssistantBlocks.push({ type: "text", text: accumText });
    if (usage?.prompt_tokens) totalInput += usage.prompt_tokens;
    if (usage?.completion_tokens) totalOutput += usage.completion_tokens;

    const toolCalls = Array.from(toolCallAccum.values()).filter((c) => c.id && c.name);
    if (toolCalls.length === 0) {
      // No more tools — assistant turn complete.
      break;
    }

    // 9. Persist the assistant turn (text + tool_calls) into the OAI conversation
    // for the next iteration AND record tool_use blocks in the DB shape.
    oaiMessages.push({
      role: "assistant",
      content: accumText || null,
      tool_calls: toolCalls.map((c) => ({
        id: c.id!,
        type: "function" as const,
        function: { name: c.name!, arguments: c.args || "{}" },
      })),
    } as ChatMessage);
    for (const c of toolCalls) {
      let parsed: unknown = {};
      try { parsed = JSON.parse(c.args || "{}"); } catch {}
      const block: ContentBlock = { type: "tool_use", id: c.id!, name: c.name!, input: parsed };
      accumulatedAssistantBlocks.push(block);
      send("tool_call", {
        id: c.id,
        name: c.name,
        input: parsed,
        scope: BROWSER_TOOL_NAMES.has(c.name!) ? "ui" : "server",
      });
    }

    // 10. Dispatch each tool
    for (const c of toolCalls) {
      let resultText = "";
      let resultBlocks: AnthropicBlock[] | string = "";
      try {
        if (BROWSER_TOOL_NAMES.has(c.name!)) {
          // UI tool — emit request, await browser response (or abort).
          // We use a separate requestId (UUID) so the pending registry key
          // is decoupled from the LLM's tool_call id.
          const requestId = uuid();
          send("ui_tool_request", {
            id: c.id,
            request_id: requestId,
            name: c.name,
            input: JSON.parse(c.args || "{}"),
          });
          let browserResult: unknown;
          let wasAborted = false;
          try {
            browserResult = await Promise.race([
              registerPending(requestId),
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
            if (wasAborted) abandonPending(requestId);
          }
          send("ui_tool_response_ack", { id: c.id });
          resultBlocks = typeof browserResult === "string" ? browserResult : JSON.stringify(browserResult);
          resultText = typeof resultBlocks === "string" ? resultBlocks : "";
        } else {
          const r = await mcp.callTool({ name: c.name!, arguments: JSON.parse(c.args || "{}") });
          const blocks: AnthropicBlock[] = [];
          for (const part of (r.content as Array<{ type: string; text?: string; mimeType?: string; data?: string }>) ?? []) {
            if (part.type === "text" && part.text) {
              blocks.push({ type: "text", text: part.text });
            } else if (part.type === "image" && part.data && part.mimeType) {
              blocks.push({
                type: "image",
                source: { type: "base64", media_type: part.mimeType, data: part.data },
              });
            }
          }
          resultBlocks = blocks;
          resultText = blocks
            .filter((b): b is Extract<AnthropicBlock, { type: "text" }> => b.type === "text")
            .map((b) => b.text)
            .join("\n");
        }
      } catch (e) {
        const errMsg = (e as Error).message;
        resultBlocks = `ERROR: ${errMsg}`;
        resultText = errMsg;
      }

      pendingToolResults.push({
        type: "tool_result",
        tool_use_id: c.id!,
        content: resultBlocks,
      });

      oaiMessages.push({
        role: "tool",
        tool_call_id: c.id!,
        content:
          typeof resultBlocks === "string"
            ? resultBlocks
            : (resultBlocks.map((b) =>
                b.type === "text"
                  ? { type: "text" as const, text: b.text }
                  : b.type === "image"
                    ? {
                        type: "image_url" as const,
                        image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` },
                      }
                    : { type: "text" as const, text: "" },
              ) as never),
      } as ChatMessage);

      const summaryImages = (typeof resultBlocks === "string" ? [] : resultBlocks)
        .filter((b): b is Extract<AnthropicBlock, { type: "image" }> => b.type === "image")
        .map((b) => `data:${b.source.media_type};base64,${b.source.data}`);
      send("tool_result", {
        id: c.id,
        name: c.name,
        summary: resultText.slice(0, 500),
        images: summaryImages.length ? summaryImages : undefined,
      });
    }
  }

  // 11. Persist the assistant turn (text + tool_use) and the user turn
  // carrying the tool_results, mirroring the prior Anthropic-shape on disk.
  const finalAssistantBlocks: ContentBlock[] = accumulatedAssistantBlocks.length
    ? accumulatedAssistantBlocks
    : [{ type: "text", text: "" }];
  appendMessage({
    conversation_id,
    role: "assistant",
    content_json: JSON.stringify(finalAssistantBlocks),
    interrupted: abort.aborted ? 1 : 0,
    total_input_tokens: totalInput,
    total_output_tokens: totalOutput,
    cost_estimate: estimateCost(modelInfo, totalInput, totalOutput),
  });
  if (pendingToolResults.length) {
    appendMessage({
      conversation_id,
      role: "user",
      content_json: JSON.stringify(pendingToolResults),
      interrupted: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      cost_estimate: 0,
    });
  }

  send("done", {
    usage: { input: totalInput, output: totalOutput },
    cost: estimateCost(modelInfo, totalInput, totalOutput),
  });
}

function estimateCost(
  m: ReturnType<typeof getModelById>,
  inTok: number,
  outTok: number,
): number {
  if (!m) return 0;
  return (
    (inTok / 1_000_000) * m.pricing.inputPerM +
    (outTok / 1_000_000) * m.pricing.outputPerM
  );
}
