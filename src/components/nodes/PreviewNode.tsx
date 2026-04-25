"use client";

import { Handle, Position, NodeProps } from "@xyflow/react";
import { useCanvasStore, AppNode } from "@/store/canvas-store";
import { useState } from "react";
import NodeShell from "./NodeShell";

export default function PreviewNode({ id, data }: NodeProps<AppNode>) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const removeNode = useCanvasStore((s) => s.removeNode);
  const [showDetails, setShowDetails] = useState(false);

  const images = data.generatedImages || [];
  const selectedIndex = data.selectedImageIndex || 0;
  const currentImage = images[selectedIndex];
  const isLoading = data.genStatus === "loading";
  const isError = data.genStatus === "error";

  const handleDownload = async () => {
    if (!currentImage) return;
    try {
      const res = await fetch(currentImage);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `thumbnail-${Date.now()}.png`;
      link.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      const link = document.createElement("a");
      link.href = currentImage;
      link.download = `thumbnail-${Date.now()}.png`;
      link.click();
    }
  };

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <NodeShell
      title={data.label || "Aperçu"}
      onDelete={() => removeNode(id)}
      accentColor={data.axisColor}
      width={320}
      icon={
        isLoading ? (
          <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
            <path d="M12 2a10 10 0 019.95 9" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
          </svg>
        ) : isError ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ember)" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M15 9l-6 6M9 9l6 6" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )
      }
    >
      <Handle type="target" position={Position.Left} id="preview-in" />

      {/* Loading state */}
      {isLoading && (
        <div className="w-full h-48 rounded-xl flex flex-col items-center justify-center gap-3" style={{ background: "var(--surface)" }}>
          <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
            <path d="M12 2a10 10 0 019.95 9" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Génération en cours…</span>
          {data.genModel && (
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{data.genModel}</span>
          )}
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="w-full px-4 py-6 rounded-xl flex flex-col items-center gap-2" style={{ background: "rgba(239, 144, 146, 0.08)", border: "1px solid rgba(239, 144, 146, 0.2)" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--ember)" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M15 9l-6 6M9 9l6 6" />
          </svg>
          <span className="text-xs font-medium" style={{ color: "var(--ember)" }}>Erreur</span>
          {data.genError && (
            <p className="text-[10px] text-center" style={{ color: "var(--text-muted)" }}>{data.genError}</p>
          )}
        </div>
      )}

      {/* Image */}
      {currentImage && !isLoading && (
        <>
          <div className="rounded-xl overflow-hidden">
            <img src={currentImage} alt="Miniature générée" className="w-full" />
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-2 mt-2 px-1 flex-wrap">
            {data.genTimeMs && (
              <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: "var(--text-muted)", background: "var(--surface)" }}>
                {formatTime(data.genTimeMs)}
              </span>
            )}
            {data.genTokens ? (
              <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: "var(--text-muted)", background: "var(--surface)" }}>
                {data.genTokens.toLocaleString()} tok
              </span>
            ) : null}
            {data.genCost && (
              <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: "var(--bone-soft)", background: "rgba(255, 255, 255, 0.04)" }}>
                {data.genCost}
              </span>
            )}
            <div className="flex-1" />
            {data.genPromptUsed && (
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-[9px] nopan nodrag"
                style={{ color: "var(--accent)" }}
              >
                {showDetails ? "Masquer" : "Prompt"}

              </button>
            )}
          </div>

          {/* Prompt details */}
          {showDetails && data.genPromptUsed && (
            <div className="mt-1 relative rounded-lg nopan nodrag" style={{ background: "var(--surface)" }}>
              <div className="px-2 py-2 text-[9px] leading-relaxed" style={{ color: "var(--text-muted)", maxHeight: 120, overflowY: "auto" }}>
                {data.genPromptUsed}
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(data.genPromptUsed || "")}
                className="absolute top-1 right-1 p-1 rounded transition-all"
                style={{ background: "rgba(0,0,0,0.3)", color: "var(--text-muted)" }}
                title="Copier le prompt"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              </button>
            </div>
          )}

          {images.length > 1 && (
            <div className="flex items-center justify-center gap-2 mt-2">
              {images.map((_, i) => (
                <button
                  key={i}
                  onClick={() => updateNodeData(id, { selectedImageIndex: i })}
                  className="w-8 h-8 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: i === selectedIndex ? "var(--accent)" : "var(--surface)",
                    color: i === selectedIndex ? "var(--canvas-bg)" : "var(--text-secondary)",
                  }}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={handleDownload}
            className="w-full mt-2 py-2 rounded-xl text-xs font-medium transition-colors"
            style={{ background: "var(--surface)", color: "var(--text-secondary)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--node-bg-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surface)")}
          >
            Télécharger
          </button>
        </>
      )}

      {/* Empty state (no loading, no error, no image) */}
      {!currentImage && !isLoading && !isError && (
        <div className="w-full h-48 rounded-xl flex items-center justify-center" style={{ background: "var(--surface)" }}>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Aucune image</span>
        </div>
      )}

      <Handle type="source" position={Position.Right} id="preview-out" />
    </NodeShell>
  );
}
