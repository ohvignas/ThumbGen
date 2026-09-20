"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useCanvasStore } from "@/store/canvas-store";
import "@excalidraw/excalidraw/index.css";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { PenLine } from "lucide-react";
import {
  SKETCH_RATIOS,
  buildSketchInitialData,
  dataUrlToSketchImage,
  isSketchChromeId,
  parseSketchJson,
  sketchFileMime,
  sketchImageSrc,
  sketchSceneNeedsImage,
  type SketchImageBytes,
  type SketchInitialData,
  type SketchSceneElement,
} from "@/lib/canvas/sketch-scene";

type ExcalidrawAPI = {
  getSceneElements: () => unknown[];
  getAppState: () => Record<string, unknown>;
  getFiles: () => Record<string, unknown>;
  updateScene: (scene: Record<string, unknown>) => void;
  addFiles: (files: { id: string; dataURL: string; mimeType: string; created: number }[]) => void;
  setActiveTool: (tool: { type: string }) => void;
};

type ExcalidrawMod = {
  Excalidraw: React.ComponentType<Record<string, unknown>>;
  exportToBlob: (opts: Record<string, unknown>) => Promise<Blob>;
};

type WorkflowAsset = { url: string; label: string; type: string };

async function loadSketchImage(src: string): Promise<SketchImageBytes | null> {
  const inline = dataUrlToSketchImage(src);
  if (inline) return inline;
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    const mime = sketchFileMime(blob.type || "image/png");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const dataURL = `data:${mime};base64,${btoa(binary)}`;
    return { dataURL, mimeType: mime };
  } catch {
    return null;
  }
}

function AssetPanel({ assets, onAddImage }: { assets: WorkflowAsset[]; onAddImage: (url: string) => void }) {
  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-[180px] bg-muted border-l border-border">
        <p className="text-[10px] text-center px-4 text-muted-foreground">
          Ajoute des nodes Face, Logo ou Image sur ton canvas pour les voir ici
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-[180px] bg-muted border-l border-border">
      <div className="px-3 pt-3 pb-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Workflow ({assets.length})</span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        <div className="space-y-1.5">
          {assets.map((item, i) => (
            <button
              key={i}
              onClick={() => onAddImage(item.url)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all border border-transparent hover:border-primary bg-card/50"
              title={`Ajouter "${item.label}"`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url} alt={item.label} className="w-10 h-10 rounded object-cover flex-shrink-0" loading="lazy" />
              <div className="min-w-0 text-left">
                <p className="text-[10px] font-medium truncate text-foreground">{item.label}</p>
                <p className="text-[9px] text-muted-foreground">{item.type === "faceReference" ? "Face" : item.type === "swipeFile" ? "Image" : item.type}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SketchEditor() {
  const [open, setOpen] = useState(false);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [ratio, setRatio] = useState("16x9");
  const [Comp, setComp] = useState<React.ComponentType<Record<string, unknown>> | null>(null);
  const [saving, setSaving] = useState(false);
  const [key, setKey] = useState(0);
  const [workflowAssets, setWorkflowAssets] = useState<WorkflowAsset[]>([]);
  const [sceneReady, setSceneReady] = useState(false);
  const modRef = useRef<ExcalidrawMod | null>(null);
  const apiRef = useRef<ExcalidrawAPI | null>(null);
  const savedElementsRef = useRef<unknown[] | null>(null);
  const savedFilesRef = useRef<Record<string, unknown> | null>(null);
  const pendingImageSrcRef = useRef<string | null>(null);
  const initialSceneRef = useRef<SketchInitialData | null>(null);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  useEffect(() => {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).EXCALIDRAW_ASSET_PATH = "/excalidraw-fonts/";
    }
    import("@excalidraw/excalidraw").then((mod) => {
      modRef.current = mod as unknown as ExcalidrawMod;
      setComp(() => mod.Excalidraw as unknown as React.ComponentType<Record<string, unknown>>);
    });
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setNodeId(detail.nodeId);
      setRatio(detail.aspectRatio || "16x9");
      savedElementsRef.current = parseSketchJson<unknown[] | null>(detail.sketchElements, null);
      savedFilesRef.current = parseSketchJson<Record<string, unknown> | null>(detail.sketchFiles, null);
      pendingImageSrcRef.current = sketchImageSrc(detail);
      setWorkflowAssets(detail.workflowAssets || []);
      initialSceneRef.current = null;
      setSceneReady(false);
      setKey((k) => k + 1);
      setOpen(true);
    };
    window.addEventListener("open-sketch-editor", handler);
    return () => window.removeEventListener("open-sketch-editor", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const src = pendingImageSrcRef.current;
      const needsImage = sketchSceneNeedsImage(savedElementsRef.current, savedFilesRef.current);
      const background = src && needsImage ? await loadSketchImage(src) : null;
      if (cancelled) return;
      initialSceneRef.current = buildSketchInitialData({
        ratio,
        userElements: savedElementsRef.current,
        userFiles: savedFilesRef.current,
        background,
      });
      setSceneReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, key, ratio]);

  const changeRatio = useCallback((newRatio: string) => {
    if (apiRef.current) {
      const currentElements = apiRef.current.getSceneElements() as SketchSceneElement[];
      savedElementsRef.current = currentElements.filter((el) => !isSketchChromeId(el.id));
      savedFilesRef.current = apiRef.current.getFiles() as Record<string, unknown>;
    }
    setSceneReady(false);
    setRatio(newRatio);
    setKey((k) => k + 1);
  }, []);

  const getInitialData = useCallback(() => {
    return initialSceneRef.current ?? buildSketchInitialData({ ratio });
  }, [ratio]);

  const addImageToCanvas = useCallback(async (imageUrl: string) => {
    try {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      const file = new File([blob], "image.png", { type: blob.type || "image/png" });
      const excalidrawEl = document.querySelector(".excalidraw .excalidraw__canvas");
      if (!excalidrawEl) return;
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      const rect = excalidrawEl.getBoundingClientRect();
      const dropEvent = new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      });
      excalidrawEl.dispatchEvent(dropEvent);
    } catch (err) {
      console.error("Failed to drop image:", err);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!apiRef.current || !modRef.current || !nodeId) return;
    setSaving(true);
    try {
      const allElements = apiRef.current.getSceneElements() as Array<{ id: string }>;
      const appState = apiRef.current.getAppState();
      const files = apiRef.current.getFiles();
      const dims = SKETCH_RATIOS[ratio] || SKETCH_RATIOS["16x9"];

      const blob = await modRef.current.exportToBlob({
        elements: allElements,
        appState: { ...appState, exportWithDarkMode: true, exportBackground: true, viewBackgroundColor: "#1e1e2e" },
        files,
        getDimensions: () => ({ width: dims.w, height: dims.h, scale: 1 }),
        mimeType: "image/png",
      });

      const reader = new FileReader();
      reader.onload = async () => {
        const imageBase64 = typeof reader.result === "string" ? reader.result : "";
        const { persistUserCanvasImage } = await import("@/lib/canvas/persist-user-image");
        const persisted = imageBase64 ? await persistUserCanvasImage(imageBase64, "sketch") : null;
        updateNodeData(nodeId, {
          imageBase64,
          ...(persisted ?? {}),
          aspectRatio: ratio,
          sketchElements: JSON.stringify(allElements),
          sketchFiles: JSON.stringify(files),
        });
        setOpen(false);
        setSaving(false);
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.error("Export sketch error:", err);
      setSaving(false);
    }
  }, [nodeId, ratio, updateNodeData]);

  const handleCancel = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCancel();
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, handleSave]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0 bg-card border-b border-border">
        <div className="flex items-center gap-3">
          <PenLine className="size-4 text-primary" strokeWidth={1.5} />
          <span className="text-sm font-medium text-foreground">Éditeur de croquis</span>
          <ToggleGroup
            value={[ratio]}
            onValueChange={(v) => {
              const next = v[0];
              if (next) changeRatio(next);
            }}
            className="ml-4"
          >
            {Object.entries(SKETCH_RATIOS).map(([k, val]) => (
              <ToggleGroupItem key={k} value={k} className="text-[11px] px-2 h-6">
                {val.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Cmd+S sauvegarder · Esc annuler</span>
          <Button variant="outline" size="sm" onClick={handleCancel}>Annuler</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Export..." : "Sauvegarder"}</Button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="relative min-h-0 min-w-0 flex-1">
          {Comp && sceneReady ? (
            <div className="absolute inset-0 [&_.excalidraw]:h-full [&_.excalidraw]:w-full">
              <Comp
                key={key}
                excalidrawAPI={(api: unknown) => {
                  const next = api as ExcalidrawAPI;
                  apiRef.current = next;
                  next.setActiveTool({ type: "freedraw" });
                }}
                theme="dark"
                viewModeEnabled={false}
                zenModeEnabled={false}
                detectScroll={false}
                initialData={getInitialData()}
                UIOptions={{ canvasActions: { saveToActiveFile: false, loadScene: false, export: false, toggleTheme: false } }}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <span className="text-sm text-muted-foreground">Chargement...</span>
            </div>
          )}
        </div>

        <AssetPanel assets={workflowAssets} onAddImage={addImageToCanvas} />
      </div>
    </div>
  );
}
