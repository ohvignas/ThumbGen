import { NextRequest } from "next/server";
import { streamText, isStepCount, type ModelMessage } from "ai";
import { getOpenRouterProvider } from "./openrouter-provider";
import { buildAiSdkTools } from "./tool-adapter";
import { V2_CLIENT_TOOLS } from "./browser-client-tools";
import { webSearchProviderOptions } from "./web-search-tool";
import { persistAssistantTurn } from "./persist-turn";
import { buildSystemMessages } from "@/lib/agent/system-prompt";
import { appendMessage, listMessages } from "@/lib/agent/conversation/store";
import { resolveImageSource } from "@/lib/agent/tools/_helpers/image-source";
import { getSetting } from "@/lib/settings";
import { getModelById, DEFAULT_AGENT_MODEL } from "@/lib/agent/models";

const MAX_STEPS = 25;

export async function postV2(req: NextRequest): Promise<Response> {
  const body = (await req.json().catch(() => null)) as
    | {
        conversation_id?: string;
        project_id?: string;
        message?: { text?: string; attachments?: Array<{ type: "image"; source: string }> };
        canvas_snapshot?: unknown;
      }
    | null;

  if (!body?.conversation_id || !body?.project_id) {
    return new Response("Missing conversation_id or project_id", { status: 400 });
  }

  const provider = getOpenRouterProvider();
  if (!provider) {
    return new Response(
      "Clé OpenRouter non configurée. Ajoute OPENROUTER_API_KEY dans Settings.",
      { status: 400 },
    );
  }

  const modelId = getSetting("agentModel") || DEFAULT_AGENT_MODEL;
  const modelInfo = getModelById(modelId);
  const conversationId = body.conversation_id;

  // Everything below is pre-stream setup: attachment resolution and prior-
  // history reconstruction, both of which read data supplied by (or on
  // behalf of) the client and can throw on bad input — a stale/invalid
  // attachment reference (resolveImageSource) or a conversation row that
  // doesn't parse as JSON. Left unguarded, either escapes as an unhandled
  // 500 with a stack trace exposed to the client, unlike v1's call site
  // (the v1 branch of POST in src/app/api/agent/chat/route.ts), which wraps
  // its whole loop in try/catch and degrades to an SSE `error` event.
  let priorMessages: unknown[];
  let systemText: string;
  let userParts: Array<
    { type: "text"; text: string } | { type: "file"; mediaType: string; data: string }
  >;
  try {
    userParts = [];
    if (body.message?.text) userParts.push({ type: "text", text: body.message.text });
    for (const a of body.message?.attachments ?? []) {
      if (a.type !== "image") continue;
      const img = await resolveImageSource(a.source);
      userParts.push({ type: "file", mediaType: img.mimeType, data: img.bytes.toString("base64") });
    }

    appendMessage({
      conversation_id: conversationId,
      role: "user",
      content_json: JSON.stringify([{ role: "user", content: userParts }]),
      interrupted: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      cost_estimate: 0,
    });

    // Every prior row is assumed to already be ModelMessage-shaped — true
    // once scripts/migrate-chat-messages-to-uimessage.ts has run for real
    // (Plan 2's cutover sequencing: migrate, THEN flip THUMBGEN_AGENT_V2,
    // THEN swap the frontend). That assumption doesn't hold for a
    // conversation that still carries old v1 Anthropic-block-shaped rows
    // (see persist-turn.ts's header comment — the two JSON shapes are NOT
    // interchangeable), so guard it explicitly rather than silently feeding
    // malformed history into streamText and letting it fail with an opaque
    // provider error: a ModelMessage always carries a `role` key, an
    // Anthropic content block never does.
    const priorRows = listMessages(conversationId).slice(0, -1);
    priorMessages = [];
    for (const row of priorRows) {
      const parsed: unknown = JSON.parse(row.content_json);
      const looksMigrated =
        Array.isArray(parsed) &&
        parsed.every((m) => typeof m === "object" && m !== null && "role" in (m as Record<string, unknown>));
      if (!looksMigrated) {
        return new Response(
          "This conversation has messages in the old (pre-migration) format and can't " +
            "be continued on the new agent backend. Run scripts/migrate-chat-messages-to-uimessage.ts " +
            "first, then retry.",
          { status: 400 },
        );
      }
      priorMessages.push(...(parsed as unknown[]));
    }

    const systemBlocks = buildSystemMessages(body.canvas_snapshot, body.project_id);
    systemText = systemBlocks.map((b) => b.text).join("\n\n");
  } catch (e) {
    return new Response(`Failed to prepare the conversation: ${(e as Error).message}`, { status: 400 });
  }

  const result = streamText({
    model: provider(modelId),
    system: systemText,
    messages: [...priorMessages, { role: "user", content: userParts }] as ModelMessage[],
    tools: { ...buildAiSdkTools(), ...V2_CLIENT_TOOLS },
    stopWhen: isStepCount(MAX_STEPS),
    // v1 checks abort only at the outer-iteration and token-streaming
    // boundaries, never inside the per-tool-call dispatch loop — a Stop
    // click lets any tool calls already in flight for the current batch
    // finish before the next iteration notices. Passing the request's own
    // signal here reproduces that same "finish current batch, then stop"
    // granularity as the starting point (whatever AI SDK's own abortSignal
    // handling does internally), not a tightened version — see spec §6.1.
    abortSignal: req.signal,
    providerOptions: {
      openrouter: {
        ...(modelInfo?.supportsThinking ? { reasoning: { effort: "medium" as const } } : {}),
        ...webSearchProviderOptions(),
      },
    },
    // `onFinish` is deprecated in ai@7.0.99 in favor of `onEnd` (identical
    // callback shape — `onFinish` is now a literal alias typed as
    // `StreamTextOnEndCallback`, not a separate event type). Read
    // `responseMessages` off the event directly rather than the deprecated
    // `response.messages` field: `response` there is itself a deprecated
    // alias for `finalStep.response`, so on a multi-step tool-calling turn
    // it would only carry the LAST step's messages. `responseMessages` is
    // the actual aggregate across every step of the turn. Same reasoning for
    // `usage` over the deprecated `totalUsage` alias (both carry the same
    // aggregated-across-all-steps numbers; `usage` is simply the current
    // name — see persist-turn.ts's FinishInfo.totalUsage for why aggregation
    // across steps is required in the first place).
    onEnd: async ({ responseMessages, usage, finishReason }) => {
      persistAssistantTurn({
        conversationId,
        responseMessages,
        totalUsage: usage,
        finishReason,
        modelInfo,
      });
    },
    // Fires instead of onEnd when the stream is aborted (e.g. a Stop click)
    // — onEnd does NOT fire on abort. Without this, a Stop click during a v2
    // turn persisted nothing at all, unlike v1 (loop.ts:378-386), which
    // always writes a partial assistant row with interrupted:1. The abort
    // event (GenerateTextAbortEvent) carries no finishReason/usage/
    // responseMessages the way onEnd's event does — only `steps`, the
    // per-step results finished before the abort — so they're reconstructed
    // here by aggregating across those steps.
    onAbort: ({ steps }) => {
      const totalUsage = steps.reduce(
        (acc, s) => ({
          inputTokens: acc.inputTokens + (s.usage.inputTokens ?? 0),
          outputTokens: acc.outputTokens + (s.usage.outputTokens ?? 0),
        }),
        { inputTokens: 0, outputTokens: 0 },
      );
      persistAssistantTurn({
        conversationId,
        responseMessages: steps.flatMap((s) => s.response.messages),
        totalUsage,
        finishReason: "aborted",
        interrupted: true,
        modelInfo,
      });
    },
  });

  // Force the underlying generation to keep running to completion — and
  // onEnd/onAbort to fire — even if the HTTP client disconnects (tab closed,
  // navigation away) mid-stream. Without this, toUIMessageStreamResponse()'s
  // stream gets cancelled on disconnect and neither callback runs, so
  // nothing is ever persisted for that turn. Not awaited: this runs
  // alongside the response stream, not before it.
  void result.consumeStream({
    onError: (error) => {
      console.error("[agent v2] consumeStream error:", error);
    },
  });

  return result.toUIMessageStreamResponse();
}
