import dagre from "@dagrejs/dagre";

const NODE_W = 320;
const NODE_H = 200;

type MinNode = { id: string; type: string; position?: { x: number; y: number } };
type MinEdge = { source: string; target: string; targetHandle?: string };

export function autoLayout<N extends MinNode>(
  nodes: N[],
  edges: MinEdge[]
): (N & { position: { x: number; y: number } })[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 120 });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    return { ...n, position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 } };
  });
}
