/**
 * Every image model the canvas can generate with. All of them are served by
 * OpenRouter's Unified Image API (one key, one endpoint). Client-safe — no
 * server imports — so GeneratorNode, /api/generate/openrouter, the settings
 * schema and the Réglages page share this exact list.
 */
export type ImageModelGroup = "Gemini" | "OpenAI" | "ByteDance";

export type ImageModel = { id: string; label: string; group: ImageModelGroup; slug: string };

export const IMAGE_MODELS: readonly ImageModel[] = [
  { id: "gemini-3-pro-image", label: "Gemini 3 Pro", group: "Gemini", slug: "google/gemini-3-pro-image" },
  { id: "gemini-3.1-flash-image", label: "Gemini 3.1 Flash", group: "Gemini", slug: "google/gemini-3.1-flash-image" },
  { id: "gemini-3.1-flash-lite-image", label: "Gemini 3.1 Flash Lite", group: "Gemini", slug: "google/gemini-3.1-flash-lite-image" },
  { id: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash", group: "Gemini", slug: "google/gemini-2.5-flash-image" },
  { id: "gpt-image-2.5-sunburst", label: "GPT Image 2.5 Sunburst (précis)", group: "OpenAI", slug: "openai/gpt-image-2.5-sunburst" },
  { id: "gpt-image-2.5-flare", label: "GPT Image 2.5 Flare (rapide)", group: "OpenAI", slug: "openai/gpt-image-2.5-flare" },
  { id: "gpt-image-2", label: "GPT Image 2 (4K)", group: "OpenAI", slug: "openai/gpt-image-2" },
  { id: "gpt-image-1", label: "GPT Image 1", group: "OpenAI", slug: "openai/gpt-image-1" },
  { id: "bytedance-seed/seedream-4.5", label: "Seedream 4.5 (ByteDance)", group: "ByteDance", slug: "bytedance-seed/seedream-4.5" },
];

export const IMAGE_MODEL_GROUPS: readonly ImageModelGroup[] = ["Gemini", "OpenAI", "ByteDance"];

export const IMAGE_MODEL_IDS = IMAGE_MODELS.map((model) => model.id) as [string, ...string[]];

// ThumbGen's internal model id (what the client sends) → OpenRouter slug.
export const MODEL_SLUGS: Record<string, string> = Object.fromEntries(
  IMAGE_MODELS.map((model) => [model.id, model.slug]),
);

export const DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image";

export function imageModelLabel(id: string): string {
  return IMAGE_MODELS.find((model) => model.id === id)?.label ?? id;
}

export const IMAGE_RESOLUTIONS = ["1K", "2K", "4K"] as const;

export type ImageResolution = (typeof IMAGE_RESOLUTIONS)[number];

export function isImageResolution(value: unknown): value is ImageResolution {
  return typeof value === "string" && (IMAGE_RESOLUTIONS as readonly string[]).includes(value);
}
