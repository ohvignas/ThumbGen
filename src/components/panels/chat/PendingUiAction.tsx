"use client";
import { useEffect, useRef, useState } from "react";
import LibraryPickerDialog from "@/components/library/LibraryPickerDialog";
import type { LibraryKind } from "@/components/library/picker-tabs";
import { libraryPickToAttachment, UNKNOWN_LIBRARY_IMAGE_ERROR } from "@/lib/library/library-pick-source";
import AskUserCard from "./AskUserCard";
import { useCanvasStore } from "@/store/canvas-store";
import { Button } from "@/components/ui/button";
import { clientToolNameOfPartType } from "@/lib/agent/client-tools";
import type { UIMessage } from "ai";

/**
 * The last message's pending client-tool part — a `tool-request_user_image`
 * or `tool-request_user_sketch` part whose `state` is not yet
 * "output-available" (derived in ChatPanel.tsx via a direct scan of
 * `chatMessages`, no intermediate normalized shape).
 *
 * Extracted against the template-literal `` `tool-${string}` `` shape
 * (matching ToolCallCard.tsx's own `ToolPart`, Task 9) rather than the two
 * literal tool-name strings directly: `useChat` here isn't given an explicit
 * UIMessage<..., ToolsMap> generic listing every tool name, so
 * `UIMessage["parts"][number]`'s tool variant only narrows down to the
 * broad `tool-${string}` template — `Extract<..., {type: "tool-request_
 * user_image" | "tool-request_user_sketch"}>` collapses to `never` (confirmed
 * via `tsc --noEmit`) since a broad template type is never assignable to a
 * narrower literal union. The two real tool names are still checked at
 * runtime in the `.find()` predicate below / the `toolName` branches further
 * down; this type only needs to be broad enough for `part.toolCallId`/
 * `part.input`/`part.type` to type-check.
 */
export type PendingToolPart = Extract<UIMessage["parts"][number], { type: `tool-${string}` }>;

/** request_user_image's `suggested_kind` → the library tab opened first. */
const SUGGESTED_LIBRARY_KIND: Record<string, LibraryKind | undefined> = {
  face: "personnages",
  logo: "logos",
  reference: "inspirations",
};

const SKETCH_SENTINEL_NODE_ID = "__chat_sketch__";

export default function PendingUiAction({
  part,
  onResolve,
}: {
  part: PendingToolPart;
  /** May return the sending promise: a rejected one lets the user answer again. */
  onResolve: (toolCallId: string, result: unknown) => void | Promise<unknown>;
}) {
  const [showLib, setShowLib] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [sketchOpen, setSketchOpen] = useState(false);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // `part.input` is `unknown` at the type level (AI SDK's default UITools
  // has no entry for these tool names, so it can't narrow further) — the
  // real shape is `requestUserImageInputSchema`'s inferred type
  // (reason/suggested_kind); `initial_image_id` was already speculative/
  // unused in the OLD UiToolRequest["input"] type this replaces.
  const input = part.input as { reason?: string; suggested_kind?: string; initial_image_id?: string } | undefined;
  const toolName = clientToolNameOfPartType(part.type);
  const toolCallId = part.toolCallId;

  const skip = () => onResolve(toolCallId, { skipped: true });

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
        if (upJson.source) onResolve(toolCallId, { generated_id: upJson.source });
        else onResolve(toolCallId, { skipped: true });
      } catch {
        onResolve(toolCallId, { skipped: true });
      }
    });
    return () => unsub();
  }, [sketchOpen, toolCallId, onResolve, updateNodeData]);

  const openSketch = () => {
    window.dispatchEvent(
      new CustomEvent("open-sketch-editor", {
        detail: { nodeId: SKETCH_SENTINEL_NODE_ID, aspectRatio: input?.suggested_kind || "16x9", workflowAssets: [] },
      }),
    );
    setSketchOpen(true);
  };

  if (toolName === "ask_user") {
    return (
      <div className="mx-3 my-2 rounded-xl p-3 bg-primary/10 border border-border">
        {/* One card per question: a new tool call never inherits the previous card's selection or lock. */}
        <AskUserCard key={toolCallId} input={part.input} onAnswer={(output) => onResolve(toolCallId, output)} />
      </div>
    );
  }

  if (toolName === "request_user_image") {
    return (
      <div className="mx-3 my-2 rounded-xl p-3 bg-primary/10 border border-border">
        <div className="text-[9px] uppercase tracking-[0.22em] mb-1.5 font-mono text-muted-foreground">
          <span className="text-primary">→</span> Demande
        </div>
        <p className="text-sm italic mb-3 text-[15px] tracking-[-0.01em] leading-snug text-foreground">
          {input?.reason || "L'assistant demande une image."}
        </p>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" disabled={uploading} onClick={() => uploadInputRef.current?.click()}>Uploader</Button>
          <input
            ref={uploadInputRef}
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
                if (j.source) onResolve(toolCallId, { source_ids: [j.source] });
                else onResolve(toolCallId, { skipped: true });
              } finally {
                setUploading(false);
              }
            }}
          />
          <Button size="sm" variant="outline" onClick={() => setShowLib(true)}>Bibliothèque</Button>
          <Button size="sm" variant="ghost" onClick={skip}>Skip</Button>
        </div>
        {pickError && <p className="mt-2 text-xs text-destructive">{pickError}</p>}
        <LibraryPickerDialog
          open={showLib}
          onOpenChange={setShowLib}
          kind="all"
          initialKind={SUGGESTED_LIBRARY_KIND[input?.suggested_kind ?? ""]}
          onPick={(pick) => {
            const attachment = libraryPickToAttachment(pick);
            if (!attachment) {
              setPickError(UNKNOWN_LIBRARY_IMAGE_ERROR);
              return;
            }
            setPickError(null);
            onResolve(toolCallId, { source_ids: [attachment.source] });
          }}
        />
      </div>
    );
  }

  if (toolName === "request_user_sketch") {
    return (
      <div className="mx-3 my-2 rounded-xl p-3 bg-primary/10 border border-border">
        <div className="text-[9px] uppercase tracking-[0.22em] mb-1.5 font-mono text-muted-foreground">
          <span className="text-primary">→</span> Croquis
        </div>
        <p className="text-sm italic mb-3 text-[15px] leading-snug text-foreground">
          {input?.reason || "L'assistant veut que tu dessines un croquis."}
        </p>
        <div className="flex gap-2">
          <Button size="sm" onClick={openSketch} disabled={sketchOpen}>Dessiner</Button>
          <Button size="sm" variant="ghost" onClick={skip}>Skip</Button>
        </div>
        {sketchOpen && <p className="text-[10px] mt-2 italic text-muted-foreground">Éditeur ouvert — sauvegarde avec Cmd+S.</p>}
      </div>
    );
  }

  return null;
}
