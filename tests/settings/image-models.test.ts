import { describe, it, expect } from "vitest";
import {
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODEL_GROUPS,
  IMAGE_MODEL_IDS,
  IMAGE_MODELS,
  IMAGE_RESOLUTIONS,
  MODEL_SLUGS,
  imageModelLabel,
  isImageResolution,
} from "@/lib/image-models";

describe("image model catalogue", () => {
  it("keeps the exact OpenRouter slugs the route used before the extraction", () => {
    expect(MODEL_SLUGS).toEqual({
      "gemini-3-pro-image": "google/gemini-3-pro-image",
      "gemini-3.1-flash-image": "google/gemini-3.1-flash-image",
      "gemini-3.1-flash-lite-image": "google/gemini-3.1-flash-lite-image",
      "gemini-2.5-flash-image": "google/gemini-2.5-flash-image",
      "gpt-image-2.5-sunburst": "openai/gpt-image-2.5-sunburst",
      "gpt-image-2.5-flare": "openai/gpt-image-2.5-flare",
      "gpt-image-2": "openai/gpt-image-2",
      "gpt-image-1": "openai/gpt-image-1",
      "bytedance-seed/seedream-4.5": "bytedance-seed/seedream-4.5",
    });
  });

  it("has unique ids, a known default and a group for every model", () => {
    expect(new Set(IMAGE_MODEL_IDS).size).toBe(IMAGE_MODELS.length);
    expect(IMAGE_MODEL_IDS).toContain(DEFAULT_IMAGE_MODEL);
    for (const model of IMAGE_MODELS) expect(IMAGE_MODEL_GROUPS).toContain(model.group);
  });

  it("labels known ids and falls back to the id", () => {
    expect(imageModelLabel("gpt-image-2")).toBe("GPT Image 2 (4K)");
    expect(imageModelLabel("unknown-model")).toBe("unknown-model");
  });

  it("recognises the three resolutions only", () => {
    expect(IMAGE_RESOLUTIONS).toEqual(["1K", "2K", "4K"]);
    expect(isImageResolution("4K")).toBe(true);
    expect(isImageResolution("8K")).toBe(false);
    expect(isImageResolution(undefined)).toBe(false);
  });
});
