import { getProject, liveProjectCanvas, type FlowEdge, type FlowNode } from "@/lib/local-storage";
import { countSketchNodes } from "@/lib/canvas/sketch-nodes";

export { countSketchNodes };

/** Live canvas after `canvas_tombstones` — the nodes the user can still see. */
export function loadLiveProjectCanvas(projectId: string): { nodes: FlowNode[]; edges: FlowEdge[] } | null {
  const project = getProject(projectId);
  if (!project) return null;
  return liveProjectCanvas(project, {
    nodeIds: project.deletedNodeIds ?? [],
    edgeIds: project.deletedEdgeIds ?? [],
  });
}

/** Visible `type: "sketch"` nodes on the current canvas. Tombstones do not count. */
export function countLiveSketchNodes(projectId: string): number {
  const live = loadLiveProjectCanvas(projectId);
  return live ? countSketchNodes(live.nodes) : 0;
}
