/**
 * Thumbnail classification model and cost estimate (client-safe).
 *
 * Prices read from https://openrouter.ai/api/v1/models on 2026-09-16:
 * google/gemini-2.5-flash-lite costs $0.10 per million input tokens (images
 * included) and $0.40 per million output tokens, and supports structured
 * outputs. A 320×180 mqdefault thumbnail is 258 Gemini tokens; with the
 * instructions and the JSON schema a call is about 700 input tokens and the
 * answer about 20 output tokens.
 */

export const CLASSIFY_MODEL = "google/gemini-2.5-flash-lite";
export const CLASSIFY_MODEL_LABEL = "Gemini 2.5 Flash Lite";
export const CLASSIFY_PRICING = { inputPerM: 0.1, outputPerM: 0.4 } as const;
export const CLASSIFY_ESTIMATED_TOKENS = { input: 700, output: 20 } as const;

/** A first batch larger than this waits for the user's confirmation. */
export const CLASSIFY_CONFIRM_THRESHOLD = 200;

export function tokenCostUsd(inputTokens: number, outputTokens: number): number {
  return (inputTokens * CLASSIFY_PRICING.inputPerM + outputTokens * CLASSIFY_PRICING.outputPerM) / 1_000_000;
}

export function estimateClassificationCostUsd(count: number): number {
  return count * tokenCostUsd(CLASSIFY_ESTIMATED_TOKENS.input, CLASSIFY_ESTIMATED_TOKENS.output);
}
