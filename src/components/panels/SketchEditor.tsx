"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useCanvasStore } from "@/store/canvas-store";
import "@excalidraw/excalidraw/index.css";

type ExcalidrawAPI = {
  getSceneElements: () => unknown[];
  getAppState: () => Record<string, unknown>;
  getFiles: () => Record<string, unknown>;
  updateScene: (scene: Record<string, unknown>) => void;
  addFiles: (files: { id: string; dataURL: string; mimeType: string; created: number }[]) => void;
};

type ExcalidrawMod = {
  Excalidraw: React.ComponentType<Record<string, unknown>>;
  exportToBlob: (opts: Record<string, unknown>) => Promise<Blob>;
};

type WorkflowAsset = { url: string; label: string; type: string };

const RATIOS: Record<string, { w: number; h: number; label: string }> = {
  "16x9": { w: 1280, h: 720, label: "16:9" },
  "1x1": { w: 1024, h: 1024, label: "1:1" },
  "4x3": { w: 1024, h: 768, label: "4:3" },
  "9x16": { w: 720, h: 1280, label: "9:16" },
};

function makeFrameElements(ratio: string) {
  const dims = RATIOS[ratio] || RATIOS["16x9"];
  return [
    {
      type: "rectangle" as const,
      id: "thumbnail-frame",
      x: -dims.w / 2,
      y: -dims.h / 2,
      width: dims.w,
      height: dims.h,
      strokeColor: "#60a5fa",
      backgroundColor: "transparent",
      fillStyle: "solid" as const,
      strokeWidth: 2,
      strokeStyle: "dashed" as const,
      roughness: 0,
      opacity: 40,
      locked: true,
      roundness: { type: 3 },
    },
    {
      type: "text" as const,
      id: "thumbnail-label",
      x: -dims.w / 2,
      y: -dims.h / 2 - 30,
      width: 250,
      height: 25,
      text: `Zone miniature ${dims.label}`,
      fontSize: 16,
      fontFamily: 1,
      strokeColor: "#60a5fa",
      opacity: 40,
      locked: true,
    },
  ];
}

function AssetPanel({ assets, onAddImage }: { assets: WorkflowAsset[]; onAddImage: (url: string) => void }) {
  if (assets.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full"
        style={{ width: 180, background: "#16161e", borderLeft: "1px solid rgba(255,255,255,0.06)" }}
      >
        <p className="text-[10px] text-center px-4" style={{ color: "rgba(255,255,255,0.3)" }}>
          Ajoute des nodes Face, Logo ou Image sur ton canvas pour les voir ici
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{ width: 180, background: "#16161e", borderLeft: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="px-3 pt-3 pb-2">
        <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>
          Workflow ({assets.length})
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        <div className="space-y-1.5">
          {assets.map((item, i) => (
            <button
              key={i}
              onClick={() => onAddImage(item.url)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all"
              style={{ border: "1px solid transparent", background: "rgba(255,255,255,0.03)" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#60a5fa"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; }}
              title={`Ajouter "${item.label}"`}
            >
              <img
                src={item.url}
                alt={item.label}
                className="w-10 h-10 rounded object-cover flex-shrink-0"
                loading="lazy"
              />
              <div className="min-w-0 text-left">
                <p className="text-[10px] font-medium truncate" style={{ color: "#fff" }}>
                  {item.label}
                </p>
                <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                  {item.type === "faceReference" ? "Face" : item.type === "swipeFile" ? "Image" : item.type}
                </p>
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
  const modRef = useRef<ExcalidrawMod | null>(null);
  const apiRef = useRef<ExcalidrawAPI | null>(null);
  const savedElementsRef = useRef<unknown[] | null>(null);
  const savedFilesRef = useRef<Record<string, unknown> | null>(null);
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

      if (detail.sketchElements) {
        try { savedElementsRef.current = JSON.parse(detail.sketchElements); }
        catch { savedElementsRef.current = null; }
      } else {
        savedElementsRef.current = null;
      }
      if (detail.sketchFiles) {
        try { savedFilesRef.current = JSON.parse(detail.sketchFiles); }
        catch { savedFilesRef.current = null; }
      } else {
        savedFilesRef.current = null;
      }

      setWorkflowAssets(detail.workflowAssets || []);
      setKey((k) => k + 1);
      setOpen(true);
    };
    window.addEventListener("open-sketch-editor", handler);
    return () => window.removeEventListener("open-sketch-editor", handler);
  }, []);

  const changeRatio = useCallback((newRatio: string) => {
    if (apiRef.current) {
      const currentElements = apiRef.current.getSceneElements() as Array<{ id: string }>;
      savedElementsRef.current = currentElements.filter(
        (el) => el.id !== "thumbnail-frame" && el.id !== "thumbnail-label"
      );
      savedFilesRef.current = apiRef.current.getFiles() as Record<string, unknown>;
    }
    setRatio(newRatio);
    setKey((k) => k + 1);
  }, []);

  const getInitialData = useCallback(() => {
    const frameElements = makeFrameElements(ratio);
    if (savedElementsRef.current && savedElementsRef.current.length > 0) {
      const userElements = (savedElementsRef.current as Array<{ id: string }>).filter(
        (el) => el.id !== "thumbnail-frame" && el.id !== "thumbnail-label"
      );
      return {
        elements: [...frameElements, ...userElements],
        files: savedFilesRef.current || undefined,
        scrollToContent: true,
      };
    }
    return { elements: frameElements, scrollToContent: true };
  }, [ratio]);

  // Add image by simulating a native file drop on Excalidraw canvas
  const addImageToCanvas = useCallback(async (imageUrl: string) => {
    try {
      // Fetch image as blob
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      const file = new File([blob], "image.png", { type: blob.type || "image/png" });

      // Find the Excalidraw canvas element
      const excalidrawEl = document.querySelector(".excalidraw .excalidraw__canvas");
      if (!excalidrawEl) return;

      // Create a native drop event with the file
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
      const dims = RATIOS[ratio] || RATIOS["16x9"];

      const blob = await modRef.current.exportToBlob({
        elements: allElements,
        appState: {
          ...appState,
          exportWithDarkMode: true,
          exportBackground: true,
          viewBackgroundColor: "#1e1e2e",
        },
        files,
        getDimensions: () => ({ width: dims.w, height: dims.h, scale: 1 }),
        mimeType: "image/png",
      });

      const reader = new FileReader();
      reader.onload = () => {
        updateNodeData(nodeId, {
          imageBase64: reader.result as string,
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
    <div className="fixed inset-0 z-[9999] flex flex-col" style={{ background: "#1e1e2e" }}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-2 flex-shrink-0"
        style={{ background: "#16161e", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round">
            <path d="M12 19l7-7 3 3-7 7-3-3z" />
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
          </svg>
          <span className="text-sm font-medium" style={{ color: "#fff" }}>Sketch Editor</span>
          <div className="flex gap-1 ml-4">
            {Object.entries(RATIOS).map(([k, val]) => (
              <button
                key={k}
                onClick={() => changeRatio(k)}
                className="px-2 py-0.5 rounded text-[11px] transition-all"
                style={{
                  background: ratio === k ? "#60a5fa" : "rgba(255,255,255,0.06)",
                  color: ratio === k ? "#000" : "rgba(255,255,255,0.5)",
                }}
              >
                {val.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            Cmd+S sauvegarder · Esc annuler
          </span>
          <button onClick={handleCancel} className="px-3 py-1.5 rounded-lg text-xs" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}>
            Annuler
          </button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 rounded-lg text-xs font-medium" style={{ background: saving ? "rgba(255,255,255,0.1)" : "#60a5fa", color: saving ? "rgba(255,255,255,0.5)" : "#000" }}>
            {saving ? "Export..." : "Sauvegarder"}
          </button>
        </div>
      </div>

      {/* Main area: Excalidraw + Asset panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Excalidraw */}
        <div className="flex-1">
          {Comp ? (
            <Comp
              key={key}
              excalidrawAPI={(api: unknown) => { apiRef.current = api as ExcalidrawAPI; }}
              theme="dark"
              initialData={getInitialData()}
              UIOptions={{
                canvasActions: {
                  saveToActiveFile: false,
                  loadScene: false,
                  export: false,
                  toggleTheme: false,
                },
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <span className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>Chargement...</span>
            </div>
          )}
        </div>

        {/* Asset panel — only shows images from the current workflow */}
        <AssetPanel assets={workflowAssets} onAddImage={addImageToCanvas} />
      </div>
    </div>
  );
}
