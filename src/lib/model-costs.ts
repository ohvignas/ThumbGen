/**
 * Per-image cost estimates (USD). Numbers are best-effort approximations
 * derived from the providers' published pricing as of early 2026.
 */
export const MODEL_COSTS: Record<string, number> = {
  // Google Gemini
  "gemini-2.5-flash-image": 0.02,
  "gemini-3.1-flash-image": 0.02,
  "gemini-3.1-flash-lite-image": 0.01,
  "gemini-3-pro-image": 0.04,
  // Ideogram
  "ideogram": 0.08,
  // OpenAI
  "gpt-image-2.5-sunburst": 0.05,
  "gpt-image-2.5-flare": 0.03,
  "gpt-image-2": 0.04,
  "gpt-image-1.5": 0.02,
  "gpt-image-1": 0.02,
  // xAI Grok
  "grok-imagine-image-2.0": 0.03,
  // Via OpenRouter
  "bytedance-seed/seedream-4.5": 0.02,
};

export const PROVIDER_COLORS: Record<string, string> = {
  gemini: "#6EDDB3",
  ideogram: "#BB68FF",
  openai: "#10a37f",
  grok: "#F7FFA8",
  openrouter: "#8B5CF6",
};

/**
 * Couleurs identifiantes des types d'entrées sur les nœuds du canvas
 * (handles + labels du GeneratorNode). Usage strictement canvas-only,
 * fonctionnel : permet de distinguer en un coup d'œil quel type de donnée
 * est connecté à quel handle. Hors canvas, les tokens du design s'appliquent.
 */
export const INPUT_TYPE_COLORS = {
  prompt: "#BB68FF",
  face: "#EF9092",
  reference: "#6EDDB3", // var(--accent)
  logo: "#60a5fa",
  sketch: "#a78bfa",
  ideogram: "#BB68FF",
} as const;

export function getCostPerImage(model: string): number {
  return MODEL_COSTS[model] ?? 0;
}

/**
 * Per-Gemini-model reference-image caps, from Google's docs + DeepMind model
 * cards (Sept 2026). Pro/Flash break the 14-image ceiling into sub-quotas by
 * role; exceeding a sub-quota degrades fidelity rather than erroring.
 * "objects" covers logo + sketch inputs, "characters" covers face refs,
 * "style" covers the reference-thumbnail (style/composition) input.
 * gemini-2.5-flash-image (older, non-Gemini-3 model) isn't documented for
 * this — kept conservative.
 *
 * Used by GeneratorNode, which warns in the UI *before* generating if the
 * selected model can't use a connected face reference at all — e.g. Flash
 * Lite has a 0 budget. (The direct Gemini/nano-banana route that used to
 * enforce this server-side is gone — OpenRouter's Unified Image API is now
 * the only generation path, and doesn't expose a per-role reference cap.)
 */
export const REFERENCE_CAPS: Record<string, { objects: number; characters: number; style: number }> = {
  "gemini-3-pro-image": { objects: 6, characters: 5, style: 3 },
  "gemini-3.1-flash-image": { objects: 10, characters: 4, style: 3 },
  "gemini-3.1-flash-lite-image": { objects: 14, characters: 0, style: 0 },
  "gemini-2.5-flash-image": { objects: 6, characters: 3, style: 2 },
};
