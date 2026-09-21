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

/** Live `type: "sketch"` node ids on the current canvas. Tombstones do not appear. */
export function listLiveSketchNodeIds(projectId: string): string[] {
  const live = loadLiveProjectCanvas(projectId);
  if (!live) return [];
  return live.nodes.filter((node) => node.type === "sketch").map((node) => node.id);
}

/** Visible `type: "sketch"` nodes on the current canvas. Tombstones do not count. */
export function countLiveSketchNodes(projectId: string): number {
  return listLiveSketchNodeIds(projectId).length;
}
