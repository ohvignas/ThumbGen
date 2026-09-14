import { appendMessage } from "@/lib/agent/conversation/store";
import type { AgentModel } from "@/lib/agent/models";

export function estimateCost(m: AgentModel | undefined, inTok: number, outTok: number): number {
  if (!m) return 0;
  return (inTok / 1_000_000) * m.pricing.inputPerM + (outTok / 1_000_000) * m.pricing.outputPerM;
}

export type FinishInfo = {
  conversationId: string;
  // ResponseMessage[] (AssistantModelMessage | ToolModelMessage). On the
  // normal completion path this is streamText's onEnd event's top-level
  // `responseMessages` field — NOT `response.messages` (that field is a
  // deprecated alias for `finalStep.response.messages`, i.e. only the LAST
  // step of a multi-step tool call turn, since ai@7.0.99). On the abort path
  // there is no such aggregated field at all (see `interrupted` below), so
  // the caller reconstructs it from `steps[].response.messages`.
  responseMessages: unknown[];
  totalUsage: { inputTokens?: number; outputTokens?: number };
  finishReason: string;
  /**
   * Explicit override marking this turn as interrupted (stream aborted
   * before completion). This can NOT be inferred from `finishReason`: the
   * real ai@7.0.99 `FinishReason` union is
   * `'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other'`
   * — it has no "aborted" member, and `streamText`'s `onAbort` callback
   * receives a `GenerateTextAbortEvent` that carries no `finishReason` field
   * at all (only `callId`, `steps`, and an optional abort `reason`). So the
   * onAbort call site in route-handler.ts sets this flag directly instead of
   * trying to force a sentinel value through `finishReason`.
   */
  interrupted?: boolean;
  modelInfo: AgentModel | undefined;
};

/**
 * Persists the assistant's completed turn into the SAME `messages` table
 * v1 uses, with the SAME columns UsageBadge / /api/agent/usage already read.
 *
 * IMPORTANT — v1 and v2 are NOT interchangeable at the DB layer, despite
 * sharing this table and these columns: v1 writes Anthropic-block-shaped
 * JSON (`[{type:"text",...}]` / `{type:"tool_use",...}` / etc.) into
 * `content_json`; v2 writes ModelMessage-shaped JSON (`[{role,content},...]`)
 * into that exact same column. Neither side can parse the other's rows.
 * THUMBGEN_AGENT_V2 is meant to be flipped ONCE, for good — not toggled
 * per-conversation or back and forth — because a conversation that picks up
 * even a single v2 turn can no longer be replayed correctly by the v1 code
 * path (and symmetrically, a v1 conversation continued under v2 before
 * `scripts/migrate-chat-messages-to-uimessage.ts` has run for it will feed
 * malformed history into `streamText`). See route-handler.ts's shape guard
 * on `priorMessages`, which rejects that case at request time with a clear
 * 400 instead of failing silently deep inside the provider call.
 *
 * `info.totalUsage` is populated from onEnd's `usage` field, which — despite
 * the name overlap with the deprecated `totalUsage` field on the same event
 * — IS the whole-turn aggregate (ai@7.0.99's onEnd event literally sets
 * `usage: totalUsage, totalUsage,` as two keys carrying the same value; see
 * node_modules/ai/src/generate-text/stream-text.ts). The PER-STEP figure
 * lives only at `steps[n].usage` / `finalStep.usage`, which nothing here
 * reads. This matches v1's totalInput/totalOutput accumulation across up to
 * 25 iterations (loop.ts:241-242) — using the per-step figure here would
 * silently under-report cost on any turn that called more than one tool.
 */
export function persistAssistantTurn(info: FinishInfo): void {
  const cost = estimateCost(info.modelInfo, info.totalUsage.inputTokens ?? 0, info.totalUsage.outputTokens ?? 0);
  appendMessage({
    conversation_id: info.conversationId,
    role: "assistant",
    content_json: JSON.stringify(info.responseMessages),
    interrupted: info.interrupted ? 1 : 0,
    total_input_tokens: info.totalUsage.inputTokens ?? 0,
    total_output_tokens: info.totalUsage.outputTokens ?? 0,
    cost_estimate: cost,
  });
}
