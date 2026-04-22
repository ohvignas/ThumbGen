"use client";

import { useReactFlow, useViewport, type Node as FlowNode } from "@xyflow/react";
import { useState, useRef, useEffect, useCallback } from "react";
import { useCanvasStore } from "@/store/canvas-store";

export default function ZoomBar() {
  const { zoomIn, zoomOut, fitView, zoomTo } = useReactFlow();
  const { zoom } = useViewport();
  const { undo, redo, canUndo, canRedo } = useCanvasStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState<"navigate" | "pan">("navigate");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  const zoomPercent = Math.round(zoom * 100);
  const { getNodes, getEdges, setNodes } = useReactFlow();

  const autoLayout = useCallback(() => {
    const nodes = getNodes();
    const edges = getEdges();
    if (nodes.length === 0) return;

    // Build adjacency: which nodes connect to which
    const children: Record<string, string[]> = {};
    const parents: Record<string, string[]> = {};
    for (const e of edges) {
      if (!children[e.source]) children[e.source] = [];
      children[e.source].push(e.target);
      if (!parents[e.target]) parents[e.target] = [];
      parents[e.target].push(e.source);
    }

    // Find root nodes (no parents)
    const roots = nodes.filter((n) => !parents[n.id] || parents[n.id].length === 0);

    // BFS to assign columns (depth) and rows
    const colMap: Record<string, number> = {};
    const visited = new Set<string>();
    const queue: { id: string; col: number }[] = [];

    for (const r of roots) {
      queue.push({ id: r.id, col: 0 });
    }

    while (queue.length > 0) {
      const { id: nid, col } = queue.shift()!;
      if (visited.has(nid)) {
        // Keep the deepest column
        if ((colMap[nid] || 0) < col) colMap[nid] = col;
        continue;
      }
      visited.add(nid);
      colMap[nid] = col;
      for (const childId of children[nid] || []) {
        queue.push({ id: childId, col: col + 1 });
      }
    }

    // Assign unvisited nodes to column 0
    for (const n of nodes) {
      if (!visited.has(n.id)) {
        visited.add(n.id);
        colMap[n.id] = 0;
      }
    }

    // Group by column, sort by original Y position
    const columns: Record<number, FlowNode[]> = {};
    for (const n of nodes) {
      const col = colMap[n.id] || 0;
      if (!columns[col]) columns[col] = [];
      columns[col].push(n);
    }

    for (const col of Object.keys(columns)) {
      columns[Number(col)].sort((a, b) => a.position.y - b.position.y);
    }

    // Layout: columns left to right, nodes top to bottom
    const COL_WIDTH = 360;
    const ROW_GAP = 20;
    const START_X = 0;
    const START_Y = 0;

    const updated = nodes.map((n) => {
      const col = colMap[n.id] || 0;
      const colNodes = columns[col];
      const rowIndex = colNodes.indexOf(n);

      // Calculate Y: sum of heights above + gaps
      let y = START_Y;
      for (let i = 0; i < rowIndex; i++) {
        y += 250 + ROW_GAP; // Estimate node height
      }

      return {
        ...n,
        position: { x: START_X + col * COL_WIDTH, y },
      };
    });

    setNodes(updated);
    setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50);
  }, [getNodes, getEdges, setNodes, fitView]);

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 rounded-xl px-2 py-1.5 shadow-2xl"
      style={{ background: "var(--node-bg)", border: "1px solid var(--surface)" }}
    >
      {/* Navigate / Pan toggle */}
      <button
        onClick={() => setMode("navigate")}
        className="p-1.5 rounded-lg transition-all"
        style={{
          background: mode === "navigate" ? "var(--accent-yellow)" : "transparent",
          color: mode === "navigate" ? "var(--canvas-bg)" : "var(--text-tertiary)",
        }}
        title="Navigate"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4.5 2.5l15 9.5-6.5 1.5-3 6.5L4.5 2.5z" />
        </svg>
      </button>
      <button
        onClick={() => setMode("pan")}
        className="p-1.5 rounded-lg transition-all"
        style={{
          background: mode === "pan" ? "var(--accent-yellow)" : "transparent",
          color: mode === "pan" ? "var(--canvas-bg)" : "var(--text-tertiary)",
        }}
        title="Pan"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M18 11V6a2 2 0 0 0-4 0v5m0 0V4a2 2 0 0 0-4 0v7m0-3a2 2 0 0 0-4 0v4m0 0a2 2 0 0 0-4 0v1a8 8 0 0 0 16 0v-3a2 2 0 0 0-4 0" />
        </svg>
      </button>

      {/* Auto layout */}
      <button
        onClick={autoLayout}
        className="p-1.5 rounded-lg transition-all"
        style={{ color: "var(--text-tertiary)" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-tertiary)")}
        title="Réorganiser le canvas"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      </button>

      {/* Separator */}
      <div className="w-px h-5 mx-1" style={{ background: "var(--surface)" }} />

      {/* Undo / Redo */}
      <button
        onClick={undo}
        disabled={!canUndo()}
        className="p-1.5 rounded-lg transition-colors disabled:opacity-30"
        style={{ color: "var(--text-tertiary)" }}
        title="Undo (Cmd+Z)"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7v6h6" /><path d="M3 13a9 9 0 0 1 15.36-6.36" />
        </svg>
      </button>
      <button
        onClick={redo}
        disabled={!canRedo()}
        className="p-1.5 rounded-lg transition-colors disabled:opacity-30"
        style={{ color: "var(--text-tertiary)" }}
        title="Redo (Cmd+Shift+Z)"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 7v6h-6" /><path d="M21 13a9 9 0 0 0-15.36-6.36" />
        </svg>
      </button>

      {/* Separator */}
      <div className="w-px h-5 mx-1" style={{ background: "var(--surface)" }} />

      {/* Zoom control */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors"
          style={{ color: "var(--text-secondary)" }}
        >
          {zoomPercent}%
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <path d="M2 4l3 3 3-3" />
          </svg>
        </button>
        {menuOpen && (
          <div
            className="absolute bottom-full left-0 mb-2 rounded-xl overflow-hidden shadow-2xl min-w-[160px]"
            style={{ background: "var(--node-bg)", border: "1px solid var(--surface)" }}
          >
            <ZoomMenuItem label="Zoom in" shortcut="Cmd +" onClick={() => { zoomIn(); setMenuOpen(false); }} />
            <ZoomMenuItem label="Zoom out" shortcut="Cmd -" onClick={() => { zoomOut(); setMenuOpen(false); }} />
            <ZoomMenuItem label="Zoom to 100%" shortcut="Cmd 0" onClick={() => { zoomTo(1); setMenuOpen(false); }} />
            <ZoomMenuItem label="Zoom to fit" shortcut="Cmd 1" onClick={() => { fitView({ padding: 0.1 }); setMenuOpen(false); }} />
          </div>
        )}
      </div>
    </div>
  );
}

function ZoomMenuItem({ label, shortcut, onClick }: { label: string; shortcut: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-3 py-2 text-xs transition-colors"
      style={{ color: "var(--text-secondary)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span>{label}</span>
      <span style={{ color: "var(--text-muted)", fontSize: 10 }}>{shortcut}</span>
    </button>
  );
}
