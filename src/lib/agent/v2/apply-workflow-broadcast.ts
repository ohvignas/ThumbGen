import { applyWorkflow, type ApplyWorkflowInput } from "@/lib/agent/tools/apply-workflow";
import type { ToolHandler } from "@/lib/agent/tools/types";
import type { CanvasWorkflowPatch } from "@/lib/canvas/canvas-patch";
import { debugLog } from "@/lib/debug-log";

export type WriteWorkflowPatch = (patch: CanvasWorkflowPatch) => void;

/** Runs apply_workflow and broadcasts a live canvas patch (chat v2 stream). */
export function broadcastApplyWorkflow(writePatch: WriteWorkflowPatch): ToolHandler<unknown> {
  return async (input) => {
    const outcome = await applyWorkflow(input as ApplyWorkflowInput);
    if (outcome.workflowPatch) {
      try {
        writePatch(outcome.workflowPatch);
        debugLog("agent", "apply_workflow broadcast patch", {
          projectId: outcome.workflowPatch.projectId,
          created: outcome.workflowPatch.created.map((node) => node.id),
          updated: outcome.workflowPatch.updated.map((item) => item.node.id),
          removed: outcome.workflowPatch.removedIds,
        });
      } catch (error) {
        // The canvas is in the database already: an open tab picks it up on its next reload.
        console.error("[agent] apply_workflow: could not broadcast the canvas patch:", error);
      }
    }
    return outcome.result;
  };
}
