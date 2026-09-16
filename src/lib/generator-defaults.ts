import { DEFAULT_IMAGE_MODEL } from "@/lib/image-models";
import type { SettingsResponse } from "@/lib/settings-schema";
import type { NodeData } from "@/store/canvas-store";

export type GeneratorDefaults = Required<Pick<NodeData, "model" | "aspectRatio" | "numImages" | "imageSize">>;

/** Same values as the schema defaults, used until GET /api/settings answers. */
export const FALLBACK_GENERATOR_DEFAULTS: GeneratorDefaults = {
  model: DEFAULT_IMAGE_MODEL,
  aspectRatio: "16x9",
  numImages: 1,
  imageSize: "2K",
};

export function generatorDefaultsFromSettings(
  settings: Pick<SettingsResponse, "favoriteModel" | "defaultAspectRatio" | "defaultImageCount" | "defaultResolution">,
): GeneratorDefaults {
  return {
    model: settings.favoriteModel,
    aspectRatio: settings.defaultAspectRatio,
    numImages: settings.defaultImageCount,
    imageSize: settings.defaultResolution,
  };
}
