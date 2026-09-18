export const RESEARCH_MODEL = "perplexity/sonar-pro";
export const RESEARCH_REQUEST_OPTIONS = { timeout: 60_000, maxRetries: 0 } as const;
/** OpenRouter Sonar Pro ballpark when `usage.cost` is missing. */
export const RESEARCH_PRICING = { inputPerM: 3, outputPerM: 15 } as const;

export function researchCostUsd(usage: { prompt_tokens?: number; completion_tokens?: number; cost?: number }): number {
  if (typeof usage.cost === "number" && Number.isFinite(usage.cost)) return usage.cost;
  return ((usage.prompt_tokens ?? 0) * RESEARCH_PRICING.inputPerM + (usage.completion_tokens ?? 0) * RESEARCH_PRICING.outputPerM) / 1_000_000;
}
