/**
 * Per-image cost estimates (USD). Numbers are best-effort approximations
 * derived from the providers' published pricing as of early 2026.
 */
export const MODEL_COSTS: Record<string, number> = {
  // Google Gemini
  "gemini-2.5-flash-image": 0.02,
  "gemini-3.1-flash-image-preview": 0.02,
  "gemini-3-pro-image-preview": 0.04,
  // Ideogram
  "ideogram": 0.08,
  // OpenAI
  "gpt-image-2": 0.04,
  "gpt-image-1.5": 0.02,
  "gpt-image-1": 0.02,
  // xAI Grok
  "grok-imagine-image": 0.03,
};

export const PROVIDER_COLORS: Record<string, string> = {
  gemini: "#6EDDB3",
  ideogram: "#BB68FF",
  openai: "#10a37f",
  grok: "#F7FFA8",
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
