"use client";
import { useEffect, useState } from "react";
import LibraryPickerModal from "./LibraryPickerModal";
import { useCanvasStore } from "@/store/canvas-store";

export type UiToolRequest = {
  id: string;
  name: "request_user_image" | "request_user_sketch";
  input: { reason?: string; suggested_kind?: string; initial_image_id?: string };
};

const SKETCH_SENTINEL_NODE_ID = "__chat_sketch__";

function ActionButton({
  variant = "primary",
  onClick,
  disabled,
  children,
}: {
  variant?: "primary" | "secondary";
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const isPrimary = variant === "primary";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1.5 rounded-lg text-[10px] uppercase transition-all disabled:opacity-40"
      style={{
        fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
        letterSpacing: "0.18em",
        background: isPrimary ? "var(--bone)" : "transparent",
        color: isPrimary ? "var(--ink-1)" : "var(--text-secondary)",
        border: isPrimary ? "1px solid var(--bone)" : "1px solid var(--line-strong)",
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        if (!isPrimary) e.currentTarget.style.background = "var(--surface)";
      }}
      onMouseLeave={(e) => {
        if (!isPrimary) e.currentTarget.style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

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

  useEffect(() => {
    if (!sketchOpen) return;
    const unsub = useCanvasStore.subscribe(async (state) => {
      const sentinelNode = state.nodes.find((n) => n.id === SKETCH_SENTINEL_NODE_ID);
      if (!sentinelNode) return;
      const imageBase64 = (sentinelNode.data as Record<string, unknown>).imageBase64 as string | undefined;
      if (!imageBase64) return;
      unsub();
      setSketchOpen(false);
      updateNodeData(SKETCH_SENTINEL_NODE_ID, { imageBase64: undefined });
      try {
        const blob = await fetch(imageBase64).then((r) => r.blob());
        const fd = new FormData();
        fd.append("file", new File([blob], "sketch.png", { type: blob.type || "image/png" }));
        const upRes = await fetch("/api/chat-uploads", { method: "POST", body: fd });
        const upJson = (await upRes.json()) as { source?: string };
        if (upJson.source) onResolve(request.id, { generated_id: upJson.source });
        else onResolve(request.id, { skipped: true });
      } catch {
        onResolve(request.id, { skipped: true });
      }
    });
    return () => unsub();
  }, [sketchOpen, request.id, onResolve, updateNodeData]);

  const openSketch = () => {
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
      <div
        className="mx-3 my-2 rounded-xl p-3"
        style={{ background: "var(--brand-tint)", border: "1px solid var(--line-strong)" }}
      >
        <div
          className="text-[9px] uppercase mb-1.5"
          style={{
            color: "var(--bone-muted)",
            fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
            letterSpacing: "0.22em",
          }}
        >
          <span style={{ color: "var(--brand)" }}>→</span> Demande
        </div>
        <p
          className="text-sm italic mb-3"
          style={{
            color: "var(--text-primary)",
            fontFamily: "var(--font-display), 'Fraunces', serif",
            fontSize: 15,
            letterSpacing: "-0.01em",
            lineHeight: 1.4,
          }}
        >
          {request.input.reason || "L'assistant demande une image."}
        </p>
        <div className="flex gap-2 flex-wrap">
          <label
            className="px-3 py-1.5 rounded-lg text-[10px] uppercase transition-all cursor-pointer"
            style={{
              fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
              letterSpacing: "0.18em",
              background: "var(--bone)",
              color: "var(--ink-1)",
              opacity: uploading ? 0.5 : 1,
            }}
          >
            Uploader
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
          <ActionButton variant="secondary" onClick={() => setShowLib(true)}>
            Bibliothèque
          </ActionButton>
          <ActionButton variant="secondary" onClick={skip}>
            Skip
          </ActionButton>
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
      <div
        className="mx-3 my-2 rounded-xl p-3"
        style={{ background: "var(--brand-tint)", border: "1px solid var(--line-strong)" }}
      >
        <div
          className="text-[9px] uppercase mb-1.5"
          style={{
            color: "var(--bone-muted)",
            fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
            letterSpacing: "0.22em",
          }}
        >
          <span style={{ color: "var(--brand)" }}>→</span> Croquis
        </div>
        <p
          className="text-sm italic mb-3"
          style={{
            color: "var(--text-primary)",
            fontFamily: "var(--font-display), 'Fraunces', serif",
            fontSize: 15,
            lineHeight: 1.4,
          }}
        >
          {request.input.reason || "L'assistant veut que tu dessines un croquis."}
        </p>
        <div className="flex gap-2">
          <ActionButton onClick={openSketch} disabled={sketchOpen}>
            Dessiner
          </ActionButton>
          <ActionButton variant="secondary" onClick={skip}>
            Skip
          </ActionButton>
        </div>
        {sketchOpen && (
          <p
            className="text-[10px] mt-2 italic"
            style={{ color: "var(--text-muted)" }}
          >
            Éditeur ouvert — sauvegarde avec Cmd+S.
          </p>
        )}
      </div>
    );
  }

  return null;
}
