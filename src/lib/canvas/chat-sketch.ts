/**
 * Chat « + canvas » / apply-sketch: persistable sketch fields. Inline
 * imageBase64 is stripped on save (persist-snapshot), so click-placed
 * sketches must keep a generated: ref + same-origin URL.
 */
import { imageDisplayUrl } from "@/lib/canvas/image-refs";

export const CHAT_SKETCH_ID = /^sketch-[0-9a-f]{8}$/;
export const WORKFLOW_SKETCH_SLOT = /^sketch-[abc]$/;

export function generatedSketchSource(sketchId: string): string {
  const id = sketchId.startsWith("generated:") ? sketchId.slice("generated:".length) : sketchId;
  return `generated:${id}`;
}

export function chatSketchImageUrl(sketchId: string): string {
  const source = generatedSketchSource(sketchId);
  return imageDisplayUrl(source) ?? `/api/generated-sketches/${source.slice("generated:".length)}`;
}

export function chatSketchNodeData(
  sketchId: string,
  label = "Sketch IA",
): { image_source: string; imageUrl: string; label: string } {
  const image_source = generatedSketchSource(sketchId);
  return { image_source, imageUrl: chatSketchImageUrl(sketchId), label };
}

export function isWorkflowSketchSlotId(id: string): boolean {
  return WORKFLOW_SKETCH_SLOT.test(id);
}
