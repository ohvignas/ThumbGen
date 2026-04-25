"use client";

import { Handle, Position, NodeProps } from "@xyflow/react";
import { useCanvasStore, AppNode } from "@/store/canvas-store";
import NodeShell from "./NodeShell";

export default function SketchNode({ id, data }: NodeProps<AppNode>) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const removeNode = useCanvasStore((s) => s.removeNode);
  const nodes = useCanvasStore((s) => s.nodes);

  const hasImage = !!data.imageBase64;

  const openEditor = () => {
    // Collect images from all nodes in the current workflow
    const workflowAssets = nodes
      .filter((n) =>
        (n.type === "faceReference" || n.type === "swipeFile") &&
        n.id !== id &&
        (n.data.imageBase64 || n.data.imageUrl)
      )
      .map((n) => ({
        url: n.data.imageBase64 || n.data.imageUrl || "",
        label: n.data.label || n.type || "Image",
        type: n.type || "image",
      }));

    window.dispatchEvent(
      new CustomEvent("open-sketch-editor", {
        detail: {
          nodeId: id,
          imageBase64: data.imageBase64 || null,
          aspectRatio: data.aspectRatio || "16x9",
          sketchElements: data.sketchElements || null,
          sketchFiles: data.sketchFiles || null,
          workflowAssets,
        },
      })
    );
  };

  return (
    <NodeShell
      title={data.label || "Croquis"}
      onDelete={() => removeNode(id)}
      onRename={(n) => updateNodeData(id, { label: n })}
      width={300}
      icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round">
          <path d="M12 19l7-7 3 3-7 7-3-3z" />
          <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
        </svg>
      }
    >
      {hasImage ? (
        <div
          className="relative group rounded-xl overflow-hidden cursor-pointer"
          onClick={openEditor}
          style={{
            aspectRatio: data.aspectRatio === "1x1" ? "1/1" : data.aspectRatio === "9x16" ? "9/16" : data.aspectRatio === "4x3" ? "4/3" : "16/9",
            maxHeight: 280,
            background: "var(--ink-2)",
          }}
        >
          <img
            src={data.imageBase64}
            alt="Croquis"
            className="w-full h-full object-contain"
          />
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 rounded-xl"
            style={{ background: "rgba(15, 15, 20, 0.6)", color: "var(--bone)" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
            </svg>
            <span className="text-sm font-medium">Modifier</span>
          </div>
        </div>
      ) : (
        <button
          onClick={openEditor}
          className="w-full h-48 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-3 transition-colors nopan nodrag"
          style={{ borderColor: "var(--surface)", color: "var(--text-muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--surface)")}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M12 19l7-7 3 3-7 7-3-3z" />
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
          </svg>
          <span className="text-xs">Ouvrir l&apos;éditeur de croquis</span>
        </button>
      )}

      <Handle type="source" position={Position.Right} id="image" />
      <div className="handle-label handle-label-right" style={{ top: "50%", right: -8, transform: "translateX(100%) translateY(-50%)" }}>
        <span style={{ color: "var(--accent)", fontSize: 10 }}>Croquis</span>
      </div>
    </NodeShell>
  );
}
