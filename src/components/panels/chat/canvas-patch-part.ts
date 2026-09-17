import { useCanvasStore } from "@/store/canvas-store";
import { CANVAS_PATCH_PART, isCanvasPatch, shouldApplyCanvasPatch } from "@/lib/canvas/canvas-patch";

/**
 * A `data-canvas-patch` part received by the chat (place_node, chantier F2):
 * applied to the open canvas when it belongs to it and is newer than what the
 * canvas knows (a reconnection replays every patch of the turn: those are
 * ignored), then the node is centered. Never sends anything.
 */
export function applyCanvasPatchPart(
  part: { type: string; data?: unknown },
  options: { openProjectId: string; fitNode: (nodeId: string, duration: number) => void; reducedMotion: boolean },
): boolean {
  if (part.type !== CANVAS_PATCH_PART || !isCanvasPatch(part.data)) return false;
  const patch = part.data;
  const state = useCanvasStore.getState();
  const accepted = shouldApplyCanvasPatch(patch, {
    openProjectId: options.openProjectId,
    loaded: state.loaded,
    loading: state.loading,
    knownUpdatedAt: state.knownUpdatedAt,
  });
  if (!accepted) return false;
  state.applyAgentPatch(patch);
  if (useCanvasStore.getState().nodes.some((node) => node.id === patch.node.id)) {
    options.fitNode(patch.node.id, options.reducedMotion ? 0 : 400);
  }
  return true;
}
