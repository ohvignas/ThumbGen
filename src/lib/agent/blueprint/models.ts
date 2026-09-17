/**
 * The coarse model names a blueprint (apply_workflow, place_node) uses, and
 * the canvas image model each one maps to. Pure — also read by the system
 * prompt's price table.
 *
 * nano-banana → Gemini 3.1 Flash (fast, cheap, great with faces — the default
 * recommendation for thumbnail generation). "ideogram"/"grok" are gone: no
 * OpenRouter equivalent (see the schema's GeneratorData).
 */
export const BLUEPRINT_MODELS = [
  { id: "nano-banana", canvasModel: "gemini-3.1-flash-image", name: "Nano Banana" },
  { id: "openai", canvasModel: "gpt-image-2.5-sunburst", name: "GPT Image" },
  { id: "seedream", canvasModel: "bytedance-seed/seedream-4.5", name: "Seedream" },
] as const;

export type BlueprintModelId = (typeof BLUEPRINT_MODELS)[number]["id"];

export const MODEL_ID_MAP: Record<string, string> = Object.fromEntries(
  BLUEPRINT_MODELS.map((model) => [model.id, model.canvasModel]),
);
