"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useChatStore } from "@/store/chat-store";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Undo2, Trash2, Download } from "lucide-react";

type Stroke = { color: string; width: number; points: Array<{ x: number; y: number }> };

const PEN_COLORS = ["#FF2E63", "#F7FFA8", "#6EDDB3", "#FFFFFF"];
const PEN_WIDTHS = [3, 6, 12];

export default function ImageAnnotateModal({ imageUrl, onClose }: { imageUrl: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [color, setColor] = useState(PEN_COLORS[0]);
  const [width, setWidth] = useState(PEN_WIDTHS[1]);
  const [comment, setComment] = useState("");
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  const [sending, setSending] = useState(false);

  const setDraft = useChatStore((s) => s.setDraft);
  const addAttachment = useChatStore((s) => s.addAttachment);

  const syncCanvasSize = useCallback(() => {
    if (!imgRef.current || !canvasRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    canvasRef.current.width = rect.width;
    canvasRef.current.height = rect.height;
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, currentStroke]);

  useEffect(() => {
    if (!imgLoaded) return;
    syncCanvasSize();
    const ro = new ResizeObserver(syncCanvasSize);
    if (imgRef.current) ro.observe(imgRef.current);
    return () => ro.disconnect();
  }, [imgLoaded, syncCanvasSize]);

  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const draw = (s: Stroke) => {
      if (s.points.length === 0) return;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
      ctx.stroke();
    };
    strokes.forEach(draw);
    if (currentStroke) draw(currentStroke);
  }

  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, currentStroke]);

  function localPoint(e: React.PointerEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setCurrentStroke({ color, width, points: [localPoint(e)] });
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!currentStroke) return;
    setCurrentStroke({ ...currentStroke, points: [...currentStroke.points, localPoint(e)] });
  }
  function onPointerUp() {
    if (!currentStroke) return;
    setStrokes((prev) => [...prev, currentStroke]);
    setCurrentStroke(null);
  }
  function undo() {
    setStrokes((prev) => prev.slice(0, -1));
  }
  function clear() {
    setStrokes([]);
  }

  async function mergeImageWithDrawing(): Promise<Blob | null> {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return null;
    const off = document.createElement("canvas");
    off.width = img.naturalWidth;
    off.height = img.naturalHeight;
    const ctx = off.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, off.width, off.height);
    const scaleX = off.width / canvas.width;
    const scaleY = off.height / canvas.height;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of strokes) {
      if (s.points.length === 0) continue;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width * Math.max(scaleX, scaleY);
      ctx.beginPath();
      ctx.moveTo(s.points[0].x * scaleX, s.points[0].y * scaleY);
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x * scaleX, s.points[i].y * scaleY);
      ctx.stroke();
    }
    return new Promise((resolve) => off.toBlob((b) => resolve(b), "image/png"));
  }

  async function download() {
    const blob = await mergeImageWithDrawing();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `thumbgen-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function sendToAgent() {
    setSending(true);
    try {
      const blob = await mergeImageWithDrawing();
      if (!blob) {
        setSending(false);
        return;
      }
      const fd = new FormData();
      fd.append("file", new File([blob], "annotated.png", { type: "image/png" }));
      const res = await fetch("/api/chat-uploads", { method: "POST", body: fd });
      if (!res.ok) {
        setSending(false);
        return;
      }
      const data = (await res.json()) as { source: string };
      const previewUrl = URL.createObjectURL(blob);
      addAttachment({ source: data.source, preview_url: previewUrl });
      setDraft(comment.trim() || "Voici les modifications que je veux sur cette image:");
      onClose();
    } catch {
      // swallow — modal stays open so the user can retry
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="flex flex-col gap-3 p-5"
        style={{ maxWidth: "min(1200px, 95vw)", maxHeight: "92vh", minWidth: 600 }}
        ref={containerRef}
      >
        {/* Toolbar — chrome, converted; the drawing canvas below is the same
            kind of exception as the main React Flow canvas: its own pointer
            handlers and drawing logic are untouched.
            pr-10 reserves clearance on the right so this row's last button
            (Télécharger) doesn't sit under DialogContent's built-in close X,
            which is absolutely positioned at top-2 right-2 (28px square) and
            would otherwise overlap it by ~16x16px — see task-8 fix report. */}
        <div className="flex items-center justify-between gap-3 pr-10">
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-[0.18em] font-mono text-muted-foreground">
              <span className="text-primary">·</span> Annoter
            </span>
            <div className="flex items-center gap-1.5">
              {PEN_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  aria-label={`color ${c}`}
                  className="w-6 h-6 rounded-full transition-transform"
                  style={{ background: c, border: color === c ? "2px solid var(--foreground)" : "1px solid var(--border)", transform: color === c ? "scale(1.12)" : "scale(1)" }}
                />
              ))}
              <div className="w-px h-5 mx-1 bg-border" />
              {PEN_WIDTHS.map((w) => (
                <button
                  key={w}
                  onClick={() => setWidth(w)}
                  aria-label={`width ${w}`}
                  className="flex items-center justify-center w-6 h-6 rounded-md transition-colors"
                  style={{ background: width === w ? "var(--muted)" : "transparent", border: width === w ? "1px solid var(--primary)" : "1px solid var(--border)" }}
                >
                  <span className="block rounded-full" style={{ width: w, height: w, background: "var(--foreground)" }} />
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={undo} disabled={strokes.length === 0}>
              <Undo2 className="size-3" />
              Annuler
            </Button>
            <Button variant="outline" size="sm" onClick={clear} disabled={strokes.length === 0}>
              <Trash2 className="size-3" />
              Effacer tout
            </Button>
            <Button variant="outline" size="sm" onClick={download}>
              <Download className="size-3" />
              Télécharger
            </Button>
          </div>
        </div>

        {/* Image + drawing canvas — untouched */}
        <div className="relative flex-1 flex items-center justify-center overflow-hidden rounded-xl bg-muted" style={{ minHeight: 300 }}>
          <div className="relative inline-block" style={{ maxHeight: "65vh" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={imageUrl}
              alt=""
              onLoad={() => setImgLoaded(true)}
              onLoadCapture={(e) => {
                const im = e.currentTarget;
                setImgDims({ w: im.naturalWidth, h: im.naturalHeight });
              }}
              draggable={false}
              style={{ display: "block", maxWidth: "min(900px, 90vw)", maxHeight: "65vh", width: "auto", height: "auto", userSelect: "none", pointerEvents: "none" }}
            />
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{ position: "absolute", inset: 0, cursor: "crosshair", touchAction: "none" }}
            />
          </div>
        </div>

        {/* Comment + send */}
        <div className="flex items-end gap-2">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Décris à l'agent ce que tu veux modifier sur l'image…"
            rows={2}
            className="flex-1 resize-none"
          />
          <Button onClick={sendToAgent} disabled={sending} className="h-auto py-2">
            {sending ? "Envoi…" : "Envoyer à l'agent"}
          </Button>
        </div>

        {imgDims && (
          <p className="text-[10px] font-mono text-muted-foreground">
            {imgDims.w} × {imgDims.h} px · clique en dehors pour fermer · esc pour quitter
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
