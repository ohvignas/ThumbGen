"use client";

import { Handle, Position, NodeProps } from "@xyflow/react";
import { useCanvasStore, AppNode } from "@/store/canvas-store";
import { useCallback, useRef, useEffect, useState } from "react";
import { Library } from "lucide-react";
import LibraryPickerDialog from "@/components/library/LibraryPickerDialog";
import type { LibraryPick } from "@/components/library/picker-tabs";
import { catalogIdForNode } from "@/lib/canvas/node-catalog";
import NodeShell from "./NodeShell";

export default function SwipeFileNode({ id, data }: NodeProps<AppNode>) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const removeNode = useCanvasStore((s) => s.removeNode);
  const [removingBg, setRemovingBg] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // imageUrl answered 404: its library item was deleted. Shown as empty,
  // the saved data is left untouched.
  const [missingUrl, setMissingUrl] = useState<string | null>(null);

  useEffect(() => {
    if (data.imageUrl && !data.imageBase64) {
      const url = data.imageUrl;
      // no-cache: the image route serves a long-lived immutable Cache-Control,
      // so a cached 200 would otherwise hide a 404 once the item is deleted.
      fetch(url, { cache: "no-cache" })
        .then((r) => {
          if (r.status === 404) {
            setMissingUrl(url);
            return null;
          }
          return r.ok ? r.blob() : null;
        })
        .then((blob) => {
          if (!blob) return;
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
      reader.onload = async () => {
        const imageBase64 = typeof reader.result === "string" ? reader.result : "";
        const { persistUserCanvasImage } = await import("@/lib/canvas/persist-user-image");
        const persisted = imageBase64 ? await persistUserCanvasImage(imageBase64, "swipe", file.name) : null;
        updateNodeData(id, {
          imageBase64: persisted ? undefined : imageBase64,
          imageUrl: persisted?.imageUrl,
          image_source: persisted?.image_source,
          label: file.name,
        });
      };
      reader.readAsDataURL(file);
    },
    [id, updateNodeData]
  );

  const isLogo = catalogIdForNode({ type: "swipeFile", data }) === "logo";
  const hasImage = Boolean(data.imageBase64 || (data.imageUrl && data.imageUrl !== missingUrl));
  const displayTitle = data.label || (isLogo ? "Logo" : "Image");

  // Same data as a drag from the former sidebar: the library route, no copy of the file.
  const pickFromLibrary = (item: LibraryPick) => {
    setMissingUrl(null);
    updateNodeData(id, {
      imageUrl: item.imageUrl,
      imageBase64: undefined,
      label: item.label,
      kind: isLogo ? "logo" : "reference",
    });
  };

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
      const { persistUserCanvasImage } = await import("@/lib/canvas/persist-user-image");
      const persisted = await persistUserCanvasImage(result, "swipe", data.label || "Reference");
      updateNodeData(id, {
        imageBase64: persisted ? undefined : result,
        ...(persisted ?? {}),
      });
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
      onRemoveBg={hasImage ? handleRemoveBg : undefined}
      removingBg={removingBg}
      width={280}
      icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--canvas-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 15l5-5 4 4 4-6 5 7" />
        </svg>
      }
    >
      {hasImage ? (
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
                <path d="M12 2a10 10 0 019.95 9" stroke="var(--canvas-accent)" strokeWidth="3" strokeLinecap="round" />
              </svg>
              <span className="text-xs font-medium" style={{ color: "var(--canvas-accent)" }}>
                Suppression du fond…
              </span>
            </div>
          )}
          {!removingBg && (
            <button
              onClick={() => inputRef.current?.click()}
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-sm rounded-xl"
              style={{ background: "rgba(15, 15, 20, 0.6)", color: "var(--bone)" }}
            >
              Remplacer
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
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--canvas-accent)")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--surface)")}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 15l5-5 4 4 4-6 5 7" />
          </svg>
          <span className="text-xs">{isLogo ? "Ajouter un logo" : "Ajouter une miniature de référence"}</span>
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      {hasImage && (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full mt-3 text-xs transition-colors"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
        >
          + Ajouter d&apos;autres images
        </button>
      )}
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="nodrag nopan mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-(--line) py-1.5 text-xs text-(--text-secondary) transition-colors hover:border-(--canvas-accent) hover:text-(--text-primary)"
      >
        <Library className="size-3.5" />
        Choisir dans la bibliothèque
      </button>
      <LibraryPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        kind={isLogo ? "logos" : "inspirations"}
        onPick={pickFromLibrary}
      />
      <Handle type="source" position={Position.Right} id="image" />
    </NodeShell>
  );
}
