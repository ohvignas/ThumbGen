import type { LanguageModel } from "ai";
import { getOpenRouterProvider } from "./openrouter-provider";
import { createFakeAgentModel, isFakeAgentEnabled } from "./fake-agent-model";

export type ResolvedAgentModel = { model: LanguageModel; fake: boolean };

/**
 * The agent's language model for one turn: the dev-only fake model when
 * THUMBGEN_FAKE_AGENT is set outside production, else OpenRouter, else null
 * (no key: the chat route answers its existing 400).
 */
export function resolveAgentLanguageModel(modelId: string): ResolvedAgentModel | null {
  if (isFakeAgentEnabled()) {
    console.warn("[agent v2] THUMBGEN_FAKE_AGENT: simulated model, no real call");
    return { model: createFakeAgentModel(), fake: true };
  }
  const provider = getOpenRouterProvider();
  return provider ? { model: provider(modelId), fake: false } : null;
}
