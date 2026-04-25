"use client";

import { EdgeProps, getBezierPath, EdgeLabelRenderer, useReactFlow } from "@xyflow/react";

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
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const { setEdges } = useReactFlow();
  const color = selected ? "var(--ember)" : "var(--accent)";

  const handleDelete = () => {
    setEdges((edges) => edges.filter((e) => e.id !== id));
  };

  return (
    <>
      {/* Fat invisible hitbox path for clicking */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={40}
        className="react-flow__edge-interaction"
        style={{ cursor: "pointer" }}
      />
      {/* Visible path */}
      <path
        d={edgePath}
        fill="none"
        stroke={color}
        strokeWidth={selected ? 2.5 : 1.5}
        style={style}
        className="react-flow__edge-path"
      />
      {/* Delete button when selected */}
      {selected && (
        <EdgeLabelRenderer>
          <button
            onClick={handleDelete}
            className="nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: "var(--ember)",
              border: "2px solid var(--ink-1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--bone)" strokeWidth="1.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
