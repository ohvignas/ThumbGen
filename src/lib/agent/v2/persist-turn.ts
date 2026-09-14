import { appendMessage } from "@/lib/agent/conversation/store";
import type { AgentModel } from "@/lib/agent/models";

export function estimateCost(m: AgentModel | undefined, inTok: number, outTok: number): number {
  if (!m) return 0;
  return (inTok / 1_000_000) * m.pricing.inputPerM + (outTok / 1_000_000) * m.pricing.outputPerM;
}

export type FinishInfo = {
  conversationId: string;
  responseMessages: unknown[]; // result.response.messages from streamText's onFinish
  totalUsage: { inputTokens?: number; outputTokens?: number };
  finishReason: string;
  modelInfo: AgentModel | undefined;
};

/**
 * Persists the assistant's completed turn into the SAME `messages` table
 * v1 uses, with the SAME columns UsageBadge / /api/agent/usage already read
 * — so v1 and v2 stay interchangeable at the DB layer for as long as the
 * kill-switch exists.
 *
 * totalUsage (aggregated across the whole multi-step tool loop) is used
 * instead of onFinish's step-level `usage`, matching v1's totalInput/
 * totalOutput accumulation across up to 25 iterations (loop.ts:241-242) —
 * using step-level usage here would silently under-report cost on any turn
 * that called more than one tool.
 */
export function persistAssistantTurn(info: FinishInfo): void {
  const cost = estimateCost(info.modelInfo, info.totalUsage.inputTokens ?? 0, info.totalUsage.outputTokens ?? 0);
  appendMessage({
    conversation_id: info.conversationId,
    role: "assistant",
    content_json: JSON.stringify(info.responseMessages),
    interrupted: info.finishReason === "aborted" ? 1 : 0,
    total_input_tokens: info.totalUsage.inputTokens ?? 0,
    total_output_tokens: info.totalUsage.outputTokens ?? 0,
    cost_estimate: cost,
  });
}
