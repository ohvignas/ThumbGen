/**
 * Wire-boundary translators between our persisted Anthropic-shaped messages
 * and the OpenAI Chat Completions shape OpenRouter expects.
 *
 * The DB schema stores messages as Anthropic blocks (tool_use, tool_result,
 * image with source.base64). We translate to OpenAI on the way out; new
 * assistant turns coming back from OpenRouter are translated to Anthropic
 * blocks on the way in (handled in loop.ts via streaming accumulator).
 */

export type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: AnthropicBlock[] | string };

export type AnthropicToolSpec = {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
};

export type OpenAIToolSpec = {
  type: "function";
  function: { name: string; description?: string; parameters: Record<string, unknown> };
};

export type OpenAIContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type OpenAIMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | OpenAIContentPart[] }
  | {
      role: "assistant";
      content: string | OpenAIContentPart[] | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | { role: "tool"; tool_call_id: string; content: string | OpenAIContentPart[] };

export function toolsToOpenAI(tools: AnthropicToolSpec[]): OpenAIToolSpec[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

export function contentBlocksToOpenAIContent(
  blocks: AnthropicBlock[],
): string | OpenAIContentPart[] {
  // If every block is text, collapse to a single string for the simplest shape.
  if (blocks.every((b) => b.type === "text")) {
    return blocks.map((b) => (b.type === "text" ? b.text : "")).join("\n");
  }
  const parts: OpenAIContentPart[] = [];
  for (const b of blocks) {
    if (b.type === "text") parts.push({ type: "text", text: b.text });
    else if (b.type === "image") {
      parts.push({
        type: "image_url",
        image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` },
      });
    }
    // Skip tool_use / tool_result here — those belong in dedicated messages.
  }
  return parts;
}

function toolResultContent(content: AnthropicBlock[] | string): string | OpenAIContentPart[] {
  if (typeof content === "string") return content;
  return contentBlocksToOpenAIContent(content);
}

/**
 * Translate persisted conversation messages (Anthropic shape) into the
 * OpenAI message stream OpenRouter expects. One Anthropic assistant message
 * with multiple tool_use blocks becomes ONE OpenAI assistant message with a
 * tool_calls array. One Anthropic user message with multiple tool_result
 * blocks becomes MULTIPLE OpenAI role=tool messages — one per result.
 */
export function persistedMessagesToOpenAI(
  messages: Array<{ role: "user" | "assistant"; content: AnthropicBlock[] }>,
): OpenAIMessage[] {
  const out: OpenAIMessage[] = [];
  for (const msg of messages) {
    if (msg.role === "assistant") {
      const textBlocks = msg.content.filter((b): b is Extract<AnthropicBlock, { type: "text" }> => b.type === "text");
      const toolUseBlocks = msg.content.filter(
        (b): b is Extract<AnthropicBlock, { type: "tool_use" }> => b.type === "tool_use",
      );
      const text = textBlocks.map((b) => b.text).join("\n");
      const toolCalls = toolUseBlocks.map((b) => ({
        id: b.id,
        type: "function" as const,
        function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
      }));
      const assistantMsg: Extract<OpenAIMessage, { role: "assistant" }> = {
        role: "assistant",
        content: text || null,
      };
      if (toolCalls.length) assistantMsg.tool_calls = toolCalls;
      out.push(assistantMsg);
    } else {
      // User: split tool_result blocks out into separate role=tool messages,
      // and combine remaining text+image blocks into a single user message.
      const toolResults = msg.content.filter(
        (b): b is Extract<AnthropicBlock, { type: "tool_result" }> => b.type === "tool_result",
      );
      const otherBlocks = msg.content.filter((b) => b.type !== "tool_result");
      for (const tr of toolResults) {
        out.push({
          role: "tool",
          tool_call_id: tr.tool_use_id,
          content: toolResultContent(tr.content),
        });
      }
      if (otherBlocks.length) {
        out.push({ role: "user", content: contentBlocksToOpenAIContent(otherBlocks) });
      }
    }
  }
  return out;
}
