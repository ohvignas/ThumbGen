import { summarizeAbTest } from "@/lib/canvas/generator-variants";
import { generatorImages, selectedGeneratedImage, toImageSourceRef } from "@/lib/canvas/image-refs";

/**
 * Compact, byte-free description of one canvas node, shared by the chat
 * snapshot (<canvas_state>) and the get_canvas_state tool so the agent sees
 * the same thing both ways.
 */
export function summarizeNode(type: string, data: Record<string, unknown>): Record<string, unknown> {
  switch (type) {
    case "prompt":
      return { prompt: data.prompt, negativePrompt: data.negativePrompt };
    case "generator": {
      const selected = selectedGeneratedImage(data, true);
      return {
        model: data.model,
        aspectRatio: data.aspectRatio,
        // Canvas nodes store numImages; blueprints say count.
        count: data.count ?? data.numImages,
        abTest: summarizeAbTest(data.abTest),
        generatedCount: generatorImages(data).length,
        selectedImage: toImageSourceRef(selected) ?? undefined,
      };
    }
    case "faceReference":
      return {
        persona: typeof data.personaId === "string" ? `stored:persona_${data.personaId}` : null,
        label: data.label,
      };
    case "swipeFile":
    case "sketch": {
      const ref = toImageSourceRef(data.image_source) ?? toImageSourceRef(data.imageUrl);
      const hasImage = Boolean(data.imageBase64 || data.imageUrl || data.image_source);
      return {
        label: data.label,
        kind: data.kind, // swipeFile only; undefined elsewhere is dropped
        ...(hasImage ? { source: ref ? `library:${ref}` : "canvas-upload" } : {}),
        hasImage,
      };
    }
    case "preview": {
      const images = Array.isArray(data.generatedImages) ? data.generatedImages : [];
      const selected = selectedGeneratedImage(data, false);
      return {
        label: data.label,
        hasOutput: images.length > 0 || Boolean(data.imageBase64 || data.imageUrl),
        imageCount: images.length,
        selectedImage: toImageSourceRef(selected) ?? undefined,
      };
    }
    case "textOverlay":
      return {
        text: data.overlayText,
        color: data.overlayColor,
        strokeColor: data.overlayStrokeColor,
        position: data.overlayPosition,
        fontScale: data.overlayFontScale,
        hasOutput: Boolean(selectedGeneratedImage(data, false)),
      };
    default:
      return {};
  }
}
