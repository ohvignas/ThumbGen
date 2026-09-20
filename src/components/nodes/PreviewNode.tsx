"use client";

import { Handle, Position, NodeProps } from "@xyflow/react";
import { useCanvasStore, AppNode } from "@/store/canvas-store";
import { generatedImageIdFromUrl, imageDisplayUrl } from "@/lib/canvas/image-refs";
import { toast } from "@/components/ui/toast";
import { useState } from "react";
import NodeShell from "./NodeShell";
import { ThumbnailDownloadButtons, thumbnailDownloadMenuItems } from "./ThumbnailDownloadActions";
import ImageIdBadge from "@/components/ImageIdBadge";
import { visibleImageIdFromValue } from "@/lib/canvas/visible-image-id";

export default function PreviewNode({ id, data }: NodeProps<AppNode>) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const removeNode = useCanvasStore((s) => s.removeNode);
  const coverImageUrl = useCanvasStore((s) => s.coverImageUrl);
  const setCoverImage = useCanvasStore((s) => s.setCoverImage);
  const [showDetails, setShowDetails] = useState(false);

  const images = data.generatedImages || [];
  const selectedIndex = data.selectedImageIndex || 0;
  const currentRaw = images[selectedIndex];
  const currentImage = typeof currentRaw === "string" && currentRaw ? imageDisplayUrl(currentRaw) ?? currentRaw : undefined;
  const isLoading = data.genStatus === "loading";
  const isError = data.genStatus === "error";
  const coverId = currentImage ? generatedImageIdFromUrl(currentImage) : null;
  const isCover = Boolean(coverId && coverImageUrl && generatedImageIdFromUrl(coverImageUrl) === coverId);

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <NodeShell
      title={data.label || "Aperçu"}
      onDelete={() => removeNode(id)}
      extraMenuItems={[
        ...thumbnailDownloadMenuItems(currentImage),
        ...(coverId && currentImage
          ? [
              {
                label: isCover ? "✓ Miniature gagnante" : "Miniature gagnante",
                onClick: () => {
                  if (isCover) return;
                  void setCoverImage(currentImage).then((ok) => {
                    toast({
                      title: ok
                        ? "Miniature gagnante enregistrée"
                        : "Impossible d'enregistrer la miniature gagnante",
                    });
                  });
                },
              },
            ]
          : []),
      ]}
      width={320}
      icon={
        isLoading ? (
          <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
            <path d="M12 2a10 10 0 019.95 9" stroke="var(--canvas-accent)" strokeWidth="3" strokeLinecap="round" />
          </svg>
        ) : isError ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ember)" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M15 9l-6 6M9 9l6 6" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--canvas-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
            <path d="M12 2a10 10 0 019.95 9" stroke="var(--canvas-accent)" strokeWidth="3" strokeLinecap="round" />
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
          <p className="text-[10px] text-center px-3 max-w-full break-words whitespace-pre-wrap" style={{ color: "var(--text-muted)" }}>
            {data.genError || "Échec de la génération"}
          </p>
        </div>
      )}

      {/* Image */}
      {currentImage && !isLoading && (
        <>
          <div className="relative rounded-xl overflow-hidden">
            <img src={currentImage} alt="Miniature générée" className="w-full" />
            {isCover && (
              <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                Gagnante
              </span>
            )}
            <ImageIdBadge id={visibleImageIdFromValue(currentImage)} />
          </div>

          {data.genWarning && (
            <p
              className="text-[10px] mt-2 px-2 py-1.5 rounded-lg"
              style={{ background: "rgba(247, 255, 168, 0.08)", color: "var(--canvas-accent-yellow)" }}
            >
              ⚠ {data.genWarning}
            </p>
          )}

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
                style={{ color: "var(--canvas-accent)" }}
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
                    background: i === selectedIndex ? "var(--canvas-accent)" : "var(--surface)",
                    color: i === selectedIndex ? "var(--canvas-bg)" : "var(--text-secondary)",
                  }}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}

          <ThumbnailDownloadButtons src={currentImage} />
        </>
      )}

      {/* Empty state (no loading, no error, no image) */}
      {!currentImage && !isLoading && !isError && (
        <div className="w-full h-48 rounded-xl flex items-center justify-center" style={{ background: "var(--surface)" }}>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {data.genPromptUsed ? "Génération interrompue" : "Aucune image"}
          </span>
        </div>
      )}

      <Handle type="source" position={Position.Right} id="preview-out" />
    </NodeShell>
  );
}
