import type { LanguageModel } from "ai";
import { getOpenRouterProvider } from "./openrouter-provider";
import { createFakeAgentModel, isFakeAgentEnabled } from "./fake-agent-model";

export type ResolvedAgentModel = { model: LanguageModel; fake: boolean };

/** Logged once per turn actually run on the dev fake model. */
export const FAKE_AGENT_WARNING = "[agent v2] THUMBGEN_FAKE_AGENT: simulated model, no real call";

/**
 * The agent's language model for one turn: the dev-only fake model when
 * THUMBGEN_FAKE_AGENT is set outside production, else OpenRouter, else null
 * (no key: the chat route answers its existing 400).
 */
export function resolveAgentLanguageModel(modelId: string): ResolvedAgentModel | null {
  // The caller logs FAKE_AGENT_WARNING once the turn is accepted (not for a 404/409).
  if (isFakeAgentEnabled()) return { model: createFakeAgentModel(), fake: true };
  const provider = getOpenRouterProvider();
  return provider ? { model: provider(modelId), fake: false } : null;
}
