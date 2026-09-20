"use client";

import BlueprintExportButton from "./BlueprintExportButton";
import WorkflowLogsSheet from "./WorkflowLogsSheet";

/** Top-right of the miniature canvas: export the workflow blueprint, then open session logs. */
export default function CanvasHeaderActions() {
  return (
    <div className="flex items-center gap-2" data-canvas-header-actions>
      <BlueprintExportButton />
      <WorkflowLogsSheet />
    </div>
  );
}
