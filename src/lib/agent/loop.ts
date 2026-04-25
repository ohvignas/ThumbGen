import Anthropic from "@anthropic-ai/sdk";
import { getInMemoryMcpClient } from "@/lib/agent/mcp/in-memory-client";
import { buildSystemMessages } from "@/lib/agent/system-prompt";
import { appendMessage, listMessages } from "@/lib/agent/conversation/store";
import { registerPending, abandonPending } from "@/lib/agent/pending-actions";
import { BROWSER_TOOL_DEFS, BROWSER_TOOL_NAMES } from "@/lib/agent/browser-tools";
import { resolveImageSource } from "@/lib/agent/tools/_helpers/image-source";
import { getSetting } from "@/lib/settings";
import { startGcLoop } from "./gc";

if (typeof window === "undefined") {
  startGcLoop();
}

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

  // 3. Build the message history (full conversation thread).
  // We strip tool_use / tool_result blocks from persisted messages — Anthropic
  // requires every tool_use to be immediately followed by a matching tool_result,
  // and our DB stores them as one accumulated assistant message per turn so the
  // pairing breaks across turns. Each turn restarts fresh tool-wise; Claude
  // still has its own text recap (e.g. "j'ai généré 3 croquis") to remember.
  type AnthropicMsg = { role: "user" | "assistant"; content: unknown };
  const history: AnthropicMsg[] = listMessages(conversation_id).map((m) => {
    const raw = JSON.parse(m.content_json);
    const filtered = Array.isArray(raw)
      ? raw.filter((b: { type?: string }) => b.type !== "tool_use" && b.type !== "tool_result")
      : raw;
    return { role: m.role, content: filtered };
  }).filter((m) => Array.isArray(m.content) ? m.content.length > 0 : true);

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
    const msg = "Clé Anthropic non configurée. Ajoute ANTHROPIC_API_KEY dans Settings.";
    send("error", { message: msg });
    // Persist a minimal assistant message so the user sees the error after refetch.
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

  const anthropic = new Anthropic({ apiKey });
  const systemBlocks = buildSystemMessages(canvas_snapshot, project_id);

  // 6. Loop
  let iter = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let assistantBlocks: ContentBlock[] = [];
  // Sidecar map: tool_use id → { images, summary } extracted from tool_result.
  // Merged onto the persisted blocks at save time without mutating the in-memory
  // history (Anthropic 400s if it sees unknown fields on tool_use blocks).
  const toolMetaById = new Map<string, { images: string[]; summary: string }>();

  while (iter++ < MAX_ITER) {
    if (abort.aborted) break;

    // Stream the response so each text token reaches the browser immediately.
    // We accumulate the final content blocks via the SDK's message-end event.
    let finalMessage: Awaited<ReturnType<typeof anthropic.messages.create>>;
    try {
      const stream = anthropic.messages.stream({
        model: MODEL,
        max_tokens: 4096,
        system: systemBlocks as never,
        tools: tools as never,
        messages: history as never,
      });

      stream.on("text", (textDelta: string) => {
        // Forward each token to the browser as it arrives.
        if (textDelta) send("text_delta", { content: textDelta });
      });

      finalMessage = await stream.finalMessage();
    } catch (e) {
      const msg = `Claude API error: ${(e as Error).message}`;
      send("error", { message: msg });
      // Persist the error so it survives refetch and the user actually sees it.
      appendMessage({
        conversation_id,
        role: "assistant",
        content_json: JSON.stringify([{ type: "text", text: `⚠ ${msg}` }]),
        interrupted: 0,
        total_input_tokens: totalInput,
        total_output_tokens: totalOutput,
        cost_estimate: (totalInput * PRICE_INPUT_PER_M) / 1_000_000 + (totalOutput * PRICE_OUTPUT_PER_M) / 1_000_000,
      });
      return;
    }

    if ("usage" in finalMessage && finalMessage.usage) {
      totalInput += finalMessage.usage.input_tokens ?? 0;
      totalOutput += finalMessage.usage.output_tokens ?? 0;
    }

    // Tokens were already streamed as text_delta events; here we just collect
    // the final blocks so we have tool_use, text (assembled), etc. for the
    // tool dispatch and persistence steps.
    const respBlocks = (finalMessage.content ?? []) as ContentBlock[];
    assistantBlocks = [...assistantBlocks, ...respBlocks];
    const resp = finalMessage; // alias so the existing logic below still reads "resp.stop_reason"

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
            const images = extractImageUrls(r as { content: unknown });
            send("tool_result", { id: tu.id, name: tu.name, summary, images });
            // Stash images+summary in the sidecar map; we'll merge them onto
            // the persisted tool_use block at save time. Don't mutate the
            // in-memory tool_use block — Anthropic rejects unknown fields.
            toolMetaById.set(tu.id, { images, summary });
            toolResults.push({
              type: "tool_result",
              tool_use_id: tu.id,
              // Convert our internal image block shape ({type, mimeType, data})
              // to Anthropic's expected format ({type, source: {type:"base64",
              // media_type, data}}). Otherwise the API rejects with 400 on the
              // next turn (image-returning tools like generate_sketch).
              content: toAnthropicContent(r.content) as never,
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

  // Merge sidecar tool metadata onto the tool_use blocks we persist (so the
  // chat UI can re-render galleries on refetch). The merged shape is only ever
  // read by our display layer — it never goes back to Anthropic because the
  // history-build step strips tool_use blocks entirely.
  const persistedBlocks = assistantBlocks.map((b) => {
    const block = b as { type?: string; id?: string };
    if (block.type === "tool_use" && block.id && toolMetaById.has(block.id)) {
      const meta = toolMetaById.get(block.id)!;
      return { ...b, _images: meta.images, _summary: meta.summary };
    }
    return b;
  });

  appendMessage({
    conversation_id,
    role: "assistant",
    content_json: JSON.stringify(persistedBlocks),
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

/**
 * Translates our MCP tool's content blocks into Anthropic's expected format.
 *
 * Our internal `image` block: `{ type: "image", mimeType: string, data: string }`
 * Anthropic's tool_result `image`: `{ type: "image", source: { type: "base64", media_type: string, data: string } }`
 *
 * Text blocks pass through unchanged. Already-Anthropic-shaped image blocks
 * (with `source`) also pass through unchanged.
 */
function toAnthropicContent(content: unknown): unknown[] {
  if (!Array.isArray(content)) return [];
  return content.map((c) => {
    const block = c as { type?: string; mimeType?: string; media_type?: string; data?: string; source?: unknown };
    if (block.type === "image" && !block.source && block.data) {
      return {
        type: "image",
        source: {
          type: "base64",
          media_type: block.mimeType || block.media_type || "image/png",
          data: block.data,
        },
      };
    }
    return c;
  });
}

/**
 * Extracts image URLs from a tool result so the chat UI can preview them
 * inline (e.g. YouTube thumbnails from search_youtube). Looks for HTTPS
 * image-like URLs in any text block.
 */
function extractImageUrls(r: { content: unknown }): string[] {
  if (!Array.isArray(r.content)) return [];
  const urls = new Set<string>();
  for (const c of r.content as Array<{ type?: string; text?: string }>) {
    if (c.type !== "text" || !c.text) continue;
    // External image URLs (YouTube thumbnails, generic image extensions)
    const httpsRe = /https?:\/\/[^\s)\]"<>]+?(?:\.(?:jpg|jpeg|png|webp|gif)(?:\?[^\s)\]"<>]*)?|i\.ytimg\.com\/[^\s)\]"<>]+|i9\.ytimg\.com\/[^\s)\]"<>]+)/gi;
    const httpsMatches = c.text.match(httpsRe);
    if (httpsMatches) for (const m of httpsMatches) urls.add(m);
    // Internal sketch references — generate_sketch returns "generated:sk_<hex>"
    // strings that the chat UI needs as servable URLs.
    const sketchRe = /generated:(sk_[a-z0-9]+)/g;
    let m: RegExpExecArray | null;
    while ((m = sketchRe.exec(c.text)) !== null) {
      urls.add(`/api/generated-sketches/${m[1]}`);
    }
  }
  return Array.from(urls).slice(0, 12); // cap for sanity
}
