"use client";

import { Handle, Position, NodeProps } from "@xyflow/react";
import { useCanvasStore, AppNode } from "@/store/canvas-store";
import { useCallback, useState } from "react";
import NodeShell from "./NodeShell";

// Matches the "3-5 words, top third, high contrast" pattern used by the
// popular AI thumbnail tools researched for this feature (Hooksnap, Juma,
// ThumbnailCreator): text is composited as a crisp separate layer instead of
// being left to the image model's unreliable text rendering.
const MAX_RECOMMENDED_WORDS = 5;

const POSITIONS: { id: "top" | "center" | "bottom"; label: string }[] = [
  { id: "top", label: "Haut" },
  { id: "center", label: "Centre" },
  { id: "bottom", label: "Bas" },
];

function getSourceImage(node: AppNode): string | null {
  if (node.data.imageBase64) return node.data.imageBase64;
  if (node.data.generatedImages?.length) {
    return node.data.generatedImages[node.data.selectedImageIndex || 0] || null;
  }
  if (node.data.imageUrl) return node.data.imageUrl;
  return null;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image introuvable ou illisible"));
    img.src = src;
  });
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (current && ctx.measureText(test).width > maxWidth) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export default function TextOverlayNode({ id, data }: NodeProps<AppNode>) {
  const { updateNodeData, removeNode, getConnectedInputs } = useCanvasStore();
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  const text = data.overlayText ?? "";
  const color = data.overlayColor ?? "#FFFFFF";
  const strokeColor = data.overlayStrokeColor ?? "#000000";
  const position = data.overlayPosition ?? "top";
  const fontScale = data.overlayFontScale ?? 1;
  const resultImage = data.generatedImages?.[data.selectedImageIndex || 0];

  const inputs = getConnectedInputs(id);
  const sourceNode = inputs.images[0];
  const sourceImage = sourceNode ? getSourceImage(sourceNode) : null;

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const tooManyWords = wordCount > MAX_RECOMMENDED_WORDS;

  const applyOverlay = useCallback(async () => {
    if (!sourceImage) {
      setError("Connecte une image (Aperçu ou Image/logo) à gauche.");
      return;
    }
    setError(null);
    setRendering(true);
    try {
      const img = await loadImage(sourceImage);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponible");
      ctx.drawImage(img, 0, 0);

      if (text.trim()) {
        const baseFontSize = Math.round(canvas.width * 0.09 * fontScale);
        ctx.font = `900 ${baseFontSize}px Arial, Helvetica, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.miterLimit = 2;

        const maxWidth = canvas.width * 0.9;
        const lines = wrapLines(ctx, text, maxWidth);
        const lineHeight = baseFontSize * 1.15;
        const totalHeight = lineHeight * lines.length;
        const marginY = canvas.height * 0.08;

        let startY: number;
        if (position === "top") startY = marginY + lineHeight / 2;
        else if (position === "bottom") startY = canvas.height - marginY - totalHeight + lineHeight / 2;
        else startY = canvas.height / 2 - totalHeight / 2 + lineHeight / 2;

        ctx.lineWidth = baseFontSize * 0.16;
        ctx.strokeStyle = strokeColor;
        ctx.fillStyle = color;

        lines.forEach((line, i) => {
          const y = startY + i * lineHeight;
          ctx.strokeText(line, canvas.width / 2, y);
          ctx.fillText(line, canvas.width / 2, y);
        });
      }

      const dataUrl = canvas.toDataURL("image/png");
      updateNodeData(id, { generatedImages: [dataUrl], selectedImageIndex: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la superposition");
    } finally {
      setRendering(false);
    }
  }, [sourceImage, text, color, strokeColor, position, fontScale, id, updateNodeData]);

  const handleDownload = () => {
    if (!resultImage) return;
    const link = document.createElement("a");
    link.href = resultImage;
    link.download = `thumbnail-${Date.now()}.png`;
    link.click();
  };

  return (
    <NodeShell
      title="Texte overlay"
      onDelete={() => removeNode(id)}
      width={320}
      icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--canvas-accent-yellow)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7V5h16v2M9 20h6M12 5v15" />
        </svg>
      }
    >
      <Handle type="target" position={Position.Left} id="image-in" style={{ top: "20%" }} />
      <span
        className="absolute text-xs pointer-events-none"
        style={{ left: -8, top: "20%", transform: "translateX(-100%) translateY(-50%)", color: "var(--canvas-accent)" }}
      >
        Image
      </span>

      {!sourceImage && (
        <div className="w-full h-32 rounded-xl flex items-center justify-center mb-3" style={{ background: "var(--surface)" }}>
          <span className="text-xs text-center px-4" style={{ color: "var(--text-muted)" }}>
            Connecte un Aperçu ou une Image à gauche
          </span>
        </div>
      )}

      {(resultImage || sourceImage) && (
        <div className="mb-3 rounded-xl overflow-hidden">
          <img src={resultImage || sourceImage || ""} alt="Miniature" className="w-full" />
        </div>
      )}

      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs" style={{ color: "var(--text-muted)" }}>Titre</label>
            <span className="text-[10px]" style={{ color: tooManyWords ? "var(--ember)" : "var(--text-muted)" }}>
              {wordCount} mot{wordCount > 1 ? "s" : ""} {tooManyWords ? "· trop long, vise 3-5" : ""}
            </span>
          </div>
          <textarea
            value={text}
            onChange={(e) => updateNodeData(id, { overlayText: e.target.value })}
            placeholder="TITRE ACCROCHEUR"
            rows={2}
            className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none nopan nodrag resize-none"
            style={{ background: "var(--surface)", color: "var(--text-secondary)", border: "1px solid transparent" }}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs block mb-1.5" style={{ color: "var(--text-muted)" }}>Couleur texte</label>
            <input
              type="color"
              value={color}
              onChange={(e) => updateNodeData(id, { overlayColor: e.target.value })}
              className="w-full h-9 rounded-lg nopan nodrag cursor-pointer"
              style={{ background: "var(--surface)", border: "1px solid transparent" }}
            />
          </div>
          <div>
            <label className="text-xs block mb-1.5" style={{ color: "var(--text-muted)" }}>Contour</label>
            <input
              type="color"
              value={strokeColor}
              onChange={(e) => updateNodeData(id, { overlayStrokeColor: e.target.value })}
              className="w-full h-9 rounded-lg nopan nodrag cursor-pointer"
              style={{ background: "var(--surface)", border: "1px solid transparent" }}
            />
          </div>
        </div>

        <div>
          <label className="text-xs block mb-1.5" style={{ color: "var(--text-muted)" }}>Position</label>
          <div className="flex gap-1">
            {POSITIONS.map((p) => (
              <button
                key={p.id}
                onClick={() => updateNodeData(id, { overlayPosition: p.id })}
                className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all nopan nodrag"
                style={{
                  background: position === p.id ? "var(--canvas-accent)" : "var(--surface)",
                  color: position === p.id ? "var(--canvas-bg)" : "var(--text-muted)",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          {position === "bottom" && (
            <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
              ⚠️ YouTube affiche la durée en bas à droite — préfère "Haut" si possible.
            </p>
          )}
        </div>

        <div>
          <label className="text-xs block mb-1.5" style={{ color: "var(--text-muted)" }}>
            Taille du texte : {Math.round(fontScale * 100)}%
          </label>
          <input
            type="range"
            min={0.5}
            max={1.6}
            step={0.05}
            value={fontScale}
            onChange={(e) => updateNodeData(id, { overlayFontScale: Number(e.target.value) })}
            className="w-full nopan nodrag"
            style={{ accentColor: "var(--canvas-accent)" }}
          />
        </div>

        <button
          onClick={applyOverlay}
          disabled={rendering || !sourceImage}
          className="w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: "var(--canvas-accent-yellow)", color: "var(--canvas-bg)" }}
        >
          {rendering ? "Application…" : "→ Appliquer le texte"}
        </button>

        {resultImage && (
          <button
            onClick={handleDownload}
            className="w-full py-2 rounded-xl text-xs font-medium transition-colors"
            style={{ background: "var(--surface)", color: "var(--text-secondary)" }}
          >
            Télécharger
          </button>
        )}

        {error && <p className="text-xs" style={{ color: "var(--ember)" }}>{error}</p>}
      </div>

      <Handle type="source" position={Position.Right} id="result" />
      <span
        className="absolute text-xs pointer-events-none"
        style={{ right: -8, top: "15%", transform: "translateX(100%) translateY(-50%)", color: "var(--canvas-accent)" }}
      >
        Résultat
      </span>
    </NodeShell>
  );
}
