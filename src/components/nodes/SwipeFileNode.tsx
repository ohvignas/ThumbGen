"use client";

import { Handle, Position, NodeProps } from "@xyflow/react";
import { useCanvasStore, AppNode } from "@/store/canvas-store";
import { useCallback, useRef, useEffect, useState } from "react";
import NodeShell from "./NodeShell";

export default function SwipeFileNode({ id, data }: NodeProps<AppNode>) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const removeNode = useCanvasStore((s) => s.removeNode);
  const [removingBg, setRemovingBg] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (data.imageUrl && !data.imageBase64) {
      fetch(data.imageUrl)
        .then((r) => r.blob())
        .then((blob) => {
          const reader = new FileReader();
          reader.onload = () => {
            updateNodeData(id, { imageBase64: reader.result as string });
          };
          reader.readAsDataURL(blob);
        })
        .catch(() => {});
    }
  }, [data.imageUrl, data.imageBase64, id, updateNodeData]);

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        updateNodeData(id, {
          imageBase64: reader.result as string,
          label: file.name,
        });
      };
      reader.readAsDataURL(file);
    },
    [id, updateNodeData]
  );

  const displayTitle = data.label || "Image";

  const handleRemoveBg = async () => {
    const src = data.imageBase64 || data.imageUrl;
    if (!src) return;
    setRemovingBg(true);
    try {
      // Get data URL if it's a server URL
      let dataUrl = src;
      if (!src.startsWith("data:")) {
        const res = await fetch(src);
        const blob = await res.blob();
        dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      }
      const { removeBackground } = await import("@/lib/remove-bg");
      const result = await removeBackground(dataUrl);
      updateNodeData(id, { imageBase64: result });
    } catch (err) {
      console.error("Remove BG error:", err);
    } finally {
      setRemovingBg(false);
    }
  };

  return (
    <NodeShell
      title={displayTitle}
      onDelete={() => removeNode(id)}
      onRename={(newName) => updateNodeData(id, { label: newName })}
      onRemoveBg={(data.imageBase64 || data.imageUrl) ? handleRemoveBg : undefined}
      removingBg={removingBg}
      width={280}
      icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF9092" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 15l5-5 4 4 4-6 5 7" />
        </svg>
      }
    >
      {data.imageBase64 || data.imageUrl ? (
        <div className="relative group rounded-xl overflow-hidden">
          <img
            src={data.imageBase64 || data.imageUrl}
            alt={displayTitle}
            className="w-full object-cover"
            style={{ maxHeight: 180, opacity: removingBg ? 0.3 : 1, transition: "opacity 0.3s" }}
          />
          {removingBg && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <svg className="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                <path d="M12 2a10 10 0 019.95 9" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round" />
              </svg>
              <span className="text-xs font-medium" style={{ color: "#60a5fa" }}>
                Suppression du fond...
              </span>
            </div>
          )}
          {!removingBg && (
            <button
              onClick={() => inputRef.current?.click()}
              className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-sm rounded-xl"
            >
              Replace
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full h-48 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-3 transition-colors nopan nodrag"
          style={{
            borderColor: "var(--surface)",
            color: "var(--text-muted)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#EF9092")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--surface)")}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 15l5-5 4 4 4-6 5 7" />
          </svg>
          <span className="text-xs">Add reference thumbnail</span>
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      {(data.imageBase64 || data.imageUrl) && (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full mt-3 text-xs transition-colors"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
        >
          + Add more images
        </button>
      )}
      <Handle type="source" position={Position.Right} id="image" />
    </NodeShell>
  );
}
