"use client";
import { useEffect, useState } from "react";
import LibraryPickerModal from "./LibraryPickerModal";
import { useCanvasStore } from "@/store/canvas-store";

export type UiToolRequest = {
  id: string;
  name: "request_user_image" | "request_user_sketch";
  input: { reason?: string; suggested_kind?: string; initial_image_id?: string };
};

/**
 * Sentinel node ID used to receive sketch output from the global SketchEditor.
 * SketchEditor saves its output to a canvas node via updateNodeData — we use
 * this fake node ID to intercept that result without polluting the real canvas.
 */
const SKETCH_SENTINEL_NODE_ID = "__chat_sketch__";

export default function PendingUiAction({
  request,
  onResolve,
}: {
  request: UiToolRequest;
  onResolve: (toolUseId: string, result: unknown) => void;
}) {
  const [showLib, setShowLib] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sketchOpen, setSketchOpen] = useState(false);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  const skip = () => onResolve(request.id, { skipped: true });

  // When sketchOpen=true, subscribe to canvas store changes for the sentinel node
  // to detect when SketchEditor has saved the export.
  useEffect(() => {
    if (!sketchOpen) return;

    const unsub = useCanvasStore.subscribe(async (state) => {
      const sentinelNode = state.nodes.find((n) => n.id === SKETCH_SENTINEL_NODE_ID);
      if (!sentinelNode) return;
      const imageBase64 = (sentinelNode.data as Record<string, unknown>).imageBase64 as
        | string
        | undefined;
      if (!imageBase64) return;

      // We got the sketch — clean up sentinel node, close sketch, upload & resolve.
      unsub();
      setSketchOpen(false);

      // Clean up the sentinel node from the store
      updateNodeData(SKETCH_SENTINEL_NODE_ID, { imageBase64: undefined });

      try {
        const blob = await fetch(imageBase64).then((r) => r.blob());
        const fd = new FormData();
        fd.append(
          "file",
          new File([blob], "sketch.png", { type: blob.type || "image/png" }),
        );
        const upRes = await fetch("/api/chat-uploads", { method: "POST", body: fd });
        const upJson = (await upRes.json()) as { source?: string };
        if (upJson.source) {
          onResolve(request.id, { generated_id: upJson.source });
        } else {
          onResolve(request.id, { skipped: true });
        }
      } catch {
        onResolve(request.id, { skipped: true });
      }
    });

    return () => unsub();
  }, [sketchOpen, request.id, onResolve, updateNodeData]);

  const openSketch = () => {
    // Dispatch the custom event that SketchEditor listens for.
    // Pass the sentinel nodeId so we can intercept the save.
    window.dispatchEvent(
      new CustomEvent("open-sketch-editor", {
        detail: {
          nodeId: SKETCH_SENTINEL_NODE_ID,
          aspectRatio: request.input.suggested_kind || "16x9",
          workflowAssets: [],
        },
      }),
    );
    setSketchOpen(true);
  };

  if (request.name === "request_user_image") {
    return (
      <div className="border-2 border-dashed border-blue-300 bg-blue-50/50 rounded-lg p-3 mx-3 my-2">
        <p className="text-sm text-blue-900 mb-2">
          {request.input.reason || "Claude veut une image."}
        </p>
        <div className="flex gap-2 flex-wrap">
          <label className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 cursor-pointer">
            📎 Uploader
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              disabled={uploading}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setUploading(true);
                try {
                  const fd = new FormData();
                  fd.append("file", f);
                  const res = await fetch("/api/chat-uploads", { method: "POST", body: fd });
                  const j = (await res.json()) as { source?: string; error?: string };
                  if (j.source) onResolve(request.id, { source_ids: [j.source] });
                  else onResolve(request.id, { skipped: true });
                } finally {
                  setUploading(false);
                }
              }}
            />
          </label>
          <button
            onClick={() => setShowLib(true)}
            className="px-3 py-1.5 bg-white border border-blue-300 text-blue-700 rounded text-xs hover:bg-blue-50"
          >
            📚 Bibliothèque
          </button>
          <button
            onClick={skip}
            className="px-3 py-1.5 border rounded text-xs text-gray-600 hover:bg-gray-50"
          >
            Skip
          </button>
        </div>
        {showLib && (
          <LibraryPickerModal
            onClose={() => setShowLib(false)}
            onPick={(source) => {
              onResolve(request.id, { source_ids: [source] });
              setShowLib(false);
            }}
          />
        )}
      </div>
    );
  }

  if (request.name === "request_user_sketch") {
    return (
      <div className="border-2 border-dashed border-purple-300 bg-purple-50/50 rounded-lg p-3 mx-3 my-2">
        <p className="text-sm text-purple-900 mb-2">
          {request.input.reason || "Claude veut que tu dessines un croquis."}
        </p>
        <div className="flex gap-2">
          <button
            onClick={openSketch}
            disabled={sketchOpen}
            className="px-3 py-1.5 bg-purple-600 text-white rounded text-xs hover:bg-purple-700 disabled:opacity-60"
          >
            🎨 Dessiner
          </button>
          <button
            onClick={skip}
            className="px-3 py-1.5 border rounded text-xs text-gray-600 hover:bg-gray-50"
          >
            Skip
          </button>
        </div>
        {sketchOpen && (
          <p className="text-xs text-purple-700 mt-2">
            Éditeur de croquis ouvert — sauvegarde avec Cmd+S ou le bouton Sauvegarder.
          </p>
        )}
      </div>
    );
  }

  return null;
}
