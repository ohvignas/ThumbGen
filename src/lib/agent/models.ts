/**
 * Curated list of OpenRouter model IDs the agent UI exposes.
 * Pricing is per million tokens at the time of writing — refresh from
 * https://openrouter.ai/<model> when adding new entries. supportsThinking
 * gates the `reasoning_effort` parameter we pass to OpenRouter (only
 * thinking-capable models accept it; sending it to others is a soft 400).
 */
export type AgentModel = {
  id: string;
  label: string;
  provider: "anthropic" | "google" | "openai" | "xai" | "meta";
  supportsThinking: boolean;
  pricing: { inputPerM: number; outputPerM: number; cachedInputPerM: number };
};

export const AGENT_MODELS: AgentModel[] = [
  {
    id: "google/gemini-3.8-flash",
    label: "Gemini 3.8 Flash",
    provider: "google",
    supportsThinking: true,
    pricing: { inputPerM: 0.75, outputPerM: 3.75, cachedInputPerM: 0.1875 },
  },
  {
    id: "google/gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro (preview)",
    provider: "google",
    supportsThinking: true,
    pricing: { inputPerM: 2.0, outputPerM: 12.0, cachedInputPerM: 0.5 },
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    label: "Claude Sonnet 4.6",
    provider: "anthropic",
    supportsThinking: true,
    pricing: { inputPerM: 3.0, outputPerM: 15.0, cachedInputPerM: 0.3 },
  },
  {
    id: "anthropic/claude-opus-4.7",
    label: "Claude Opus 4.7",
    provider: "anthropic",
    supportsThinking: true,
    pricing: { inputPerM: 15.0, outputPerM: 75.0, cachedInputPerM: 1.5 },
  },
  {
    id: "openai/gpt-5",
    label: "GPT-5",
    provider: "openai",
    supportsThinking: false,
    pricing: { inputPerM: 5.0, outputPerM: 15.0, cachedInputPerM: 1.25 },
  },
];

// Gemini models hit a "corrupted thought signature" failure on multi-image
// tool results (e.g. search_youtube returning multiple thumbnails), which
// blocks the agent's own research step — the exact feature this default
// needs to support. The running instance's DB-stored setting was already
// switched to Claude; this is the code-level fallback so a fresh deploy or
// a wiped /app/data volume doesn't silently regress back to the broken model.
export const DEFAULT_AGENT_MODEL = "anthropic/claude-sonnet-4.6";

export function getModelById(id: string): AgentModel | undefined {
  // Strip the :online suffix used for web-search variants when looking up.
  const base = id.replace(/:online$/, "");
  return AGENT_MODELS.find((m) => m.id === base);
}
