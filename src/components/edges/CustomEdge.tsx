"use client";

import { BaseEdge, EdgeToolbar, EdgeProps, getBezierPath, useReactFlow } from "@xyflow/react";

/** Official BaseEdge interaction path (docs default is 20). */
export const EDGE_INTERACTION_WIDTH = 48;

export default function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  selected,
  markerEnd,
  markerStart,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const { deleteElements } = useReactFlow();
  const color = selected ? "var(--ember)" : "var(--canvas-accent)";

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={EDGE_INTERACTION_WIDTH}
        style={{ ...style, stroke: color, strokeWidth: selected ? 2.5 : 1.5 }}
      />
      <EdgeToolbar
        edgeId={id}
        x={labelX}
        y={labelY}
        isVisible={Boolean(selected)}
        className="nodrag nopan"
      >
        <button
          type="button"
          aria-label="Supprimer le trait"
          className="nodrag nopan"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            void deleteElements({ edges: [{ id }] });
          }}
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "var(--ember)",
            border: "2px solid var(--ink-1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            pointerEvents: "all",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--bone)" strokeWidth="1.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </EdgeToolbar>
    </>
  );
}
