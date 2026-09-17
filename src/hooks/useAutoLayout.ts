"use client";

import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { autoLayout } from "@/lib/agent/tools/_helpers/auto-layout";

/**
 * « Ranger le workflow »: left-to-right dagre layout (the same one
 * apply_workflow uses), then fit the view. Shared by the ZoomBar button, the
 * canvas context menu and the ⇧⌥T shortcut. `setNodes` on this controlled
 * flow goes through the store's onNodesChange, so it is undoable and saved.
 */
export function useAutoLayout(): () => void {
  const { getNodes, getEdges, setNodes, fitView } = useReactFlow();

  return useCallback(() => {
    const nodes = getNodes();
    if (nodes.length === 0) return;
    const laidOut = autoLayout(
      nodes.map((node) => ({ id: node.id, type: node.type ?? "" })),
      getEdges().map((edge) => ({ source: edge.source, target: edge.target })),
    );
    const positions = new Map(laidOut.map((node) => [node.id, node.position]));
    setNodes(nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position })));
    setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50);
  }, [getNodes, getEdges, setNodes, fitView]);
}
