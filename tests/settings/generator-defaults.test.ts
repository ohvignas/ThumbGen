import { describe, it, expect } from "vitest";
import { FALLBACK_GENERATOR_DEFAULTS, generatorDefaultsFromSettings } from "@/lib/generator-defaults";

describe("generator defaults", () => {
  it("maps the Génération settings to new generator node data", () => {
    expect(
      generatorDefaultsFromSettings({
        favoriteModel: "gpt-image-2",
        defaultAspectRatio: "9x16",
        defaultImageCount: 3,
        defaultResolution: "4K",
      }),
    ).toEqual({ model: "gpt-image-2", aspectRatio: "9x16", numImages: 3, imageSize: "4K" });
  });

  it("uses the schema defaults until the settings are loaded", () => {
    expect(FALLBACK_GENERATOR_DEFAULTS).toEqual({
      model: "gemini-3.1-flash-image",
      aspectRatio: "16x9",
      numImages: 1,
      imageSize: "2K",
    });
  });
});
