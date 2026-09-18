import { summarizeNode } from "@/lib/canvas/node-summary";

export { summarizeNode };

export type SnapshotNode = { id: string; type?: string; data?: Record<string, unknown>; selected?: boolean };
export type SnapshotEdge = { source: string; target: string; targetHandle?: string | null };

/**
 * Compact canvas description sent with every agent turn (`canvas_snapshot`),
 * rendered into the system prompt as <canvas_state>. No binary image data.
 */
export function snapshotCanvas(nodes: SnapshotNode[], edges: SnapshotEdge[]): unknown {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      ...(n.selected ? { selected: true } : {}),
      summary: summarizeNode(n.type ?? "", n.data ?? {}),
    })),
    edges: edges.map((e) => ({ source: e.source, target: e.target, targetHandle: e.targetHandle })),
  };
}
