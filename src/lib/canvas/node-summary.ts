import { summarizeAbTest } from "@/lib/canvas/generator-variants";
import { generatorImages, selectedGeneratedImage, toImageSourceRef } from "@/lib/canvas/image-refs";
import { describeVisibleImages } from "@/lib/canvas/mentionable-images";
import { visibleImageIdFromValue } from "@/lib/canvas/visible-image-id";

/**
 * Compact, byte-free description of one canvas node, shared by the chat
 * snapshot (<canvas_state>) and the get_canvas_state tool so the agent sees
 * the same thing both ways. Graph-level currentThumbnails (generated aperçu +
 * parent prompt) are added by describeCurrentThumbnails, not here.
 */
export function summarizeNode(type: string, data: Record<string, unknown>): Record<string, unknown> {
  switch (type) {
    case "prompt":
      return { prompt: data.prompt, negativePrompt: data.negativePrompt };
    case "generator": {
      const selected = selectedGeneratedImage(data, true);
      const images = describeVisibleImages(generatorImages(data));
      return {
        model: data.model,
        aspectRatio: data.aspectRatio,
        // Canvas nodes store numImages; blueprints say count.
        count: data.count ?? data.numImages,
        abTest: summarizeAbTest(data.abTest),
        generatedCount: generatorImages(data).length,
        selectedImage: toImageSourceRef(selected) ?? undefined,
        ...(visibleImageIdFromValue(selected) ? { selectedVisibleId: visibleImageIdFromValue(selected) } : {}),
        ...(images.length > 0 ? { images } : {}),
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
      const listed =
        type === "sketch"
          ? describeVisibleImages(
              [data.image_source, data.imageUrl].filter((value): value is string => typeof value === "string" && Boolean(value)),
            )
          : [];
      return {
        label: data.label,
        kind: data.kind, // swipeFile only; undefined elsewhere is dropped
        ...(hasImage ? { source: ref ? `library:${ref}` : "canvas-upload" } : {}),
        hasImage,
        ...(listed.length > 0
          ? {
              images: listed,
              selectedImage: listed[0]!.image,
              selectedVisibleId: listed[0]!.visibleId,
            }
          : {}),
      };
    }
    case "preview": {
      const images = Array.isArray(data.generatedImages) ? data.generatedImages : [];
      const selected = selectedGeneratedImage(data, false);
      const listed = describeVisibleImages(images);
      return {
        label: data.label,
        hasOutput: images.length > 0 || Boolean(data.imageBase64 || data.imageUrl),
        imageCount: images.length,
        selectedImage: toImageSourceRef(selected) ?? undefined,
        ...(visibleImageIdFromValue(selected) ? { selectedVisibleId: visibleImageIdFromValue(selected) } : {}),
        ...(listed.length > 0 ? { images: listed } : {}),
      };
    }
    case "textOverlay": {
      const selected = selectedGeneratedImage(data, false);
      const listed = describeVisibleImages(Array.isArray(data.generatedImages) ? data.generatedImages : []);
      return {
        text: data.overlayText,
        color: data.overlayColor,
        strokeColor: data.overlayStrokeColor,
        position: data.overlayPosition,
        fontScale: data.overlayFontScale,
        hasOutput: Boolean(selected),
        ...(toImageSourceRef(selected) ? { selectedImage: toImageSourceRef(selected) } : {}),
        ...(visibleImageIdFromValue(selected) ? { selectedVisibleId: visibleImageIdFromValue(selected) } : {}),
        ...(listed.length > 0 ? { images: listed } : {}),
      };
    }
    default:
      return {};
  }
}
