import { useCanvasStore } from "@/store/canvas-store";
import {
  CANVAS_PATCH_PART,
  CANVAS_WORKFLOW_PATCH_PART,
  isCanvasPatch,
  isCanvasWorkflowPatch,
  shouldApplyAgentWrite,
  shouldApplyCanvasPatch,
} from "@/lib/canvas/canvas-patch";
import { debugLog } from "@/lib/debug-log";

type PatchOptions = { openProjectId: string };

/**
 * A `data-canvas-patch` part received by the chat (place_node, chantier F2):
 * applied to the open canvas when it belongs to it and is newer than what the
 * canvas knows (a reconnection replays every patch of the turn: those are
 * ignored). Leaves the user's zoom and pan unchanged. Never sends anything.
 */
export function applyCanvasPatchPart(
  part: { type: string; data?: unknown },
  options: PatchOptions,
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
  if (!accepted) {
    debugLog("agent", "canvas-patch skipped", { nodeId: patch.node.id, projectId: patch.projectId, updatedAt: patch.updatedAt });
    return false;
  }
  state.applyAgentPatch(patch);
  debugLog("agent", "canvas-patch applied", { nodeId: patch.node.id, created: patch.created });
  return true;
}

/** A `data-canvas-workflow-patch` from apply_workflow (several nodes, one updatedAt). */
export function applyCanvasWorkflowPatchPart(part: { type: string; data?: unknown }, options: PatchOptions): boolean {
  if (part.type !== CANVAS_WORKFLOW_PATCH_PART || !isCanvasWorkflowPatch(part.data)) return false;
  const patch = part.data;
  const state = useCanvasStore.getState();
  const accepted = shouldApplyAgentWrite(patch, {
    openProjectId: options.openProjectId,
    loaded: state.loaded,
    loading: state.loading,
    knownUpdatedAt: state.knownUpdatedAt,
  });
  if (!accepted) {
    debugLog("agent", "workflow-patch skipped", { projectId: patch.projectId, updatedAt: patch.updatedAt });
    return false;
  }
  state.applyAgentWorkflowPatch(patch);
  debugLog("agent", "workflow-patch applied", {
    created: patch.created.map((node) => node.id),
    updated: patch.updated.map((item) => item.node.id),
  });
  return true;
}

/** place_node or apply_workflow live canvas write from the chat stream. */
export function applyAgentCanvasStreamPart(part: { type: string; data?: unknown }, options: PatchOptions): boolean {
  return applyCanvasPatchPart(part, options) || applyCanvasWorkflowPatchPart(part, options);
}
