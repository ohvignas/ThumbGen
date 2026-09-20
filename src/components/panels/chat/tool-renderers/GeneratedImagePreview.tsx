"use client";
import { useState } from "react";
import { useCanvasStore } from "@/store/canvas-store";
import { useChatStore } from "@/store/chat-store";
import ImageIdBadge from "@/components/ImageIdBadge";
import { visibleImageIdFromToolText } from "@/lib/canvas/visible-image-id";

/**
 * See SearchYoutubeGallery.tsx for the full explanation of why a tool part's
 * `output` needs normalizing across two real shapes (live execute() return
 * vs. persisted/reloaded history) — including why a reloaded `type:"file"`
 * item's `data` field must itself accept EITHER a bare base64 string
 * (pre-Bug-2-fix / unmigrated rows) or the tagged `{type:"data", data}`
 * object (current, schema-correct rows): accepting only the newer shape is
 * what silently made this component render nothing (`imageItem` undefined
 * → `return null`, no image, no caption, no "+ canvas" button) for any
 * reloaded generate_sketch result once that fix landed. Duplicated here
 * rather than shared so this file stays a standalone component per this
 * task's brief.
 */
type NormalizedItem = { type: "text"; text: string } | { type: "image"; mediaType: string; data: string };

/** Reloaded file parts carry `data` as either a bare base64 string (pre-fix
 * / unmigrated rows) or the tagged `{type:"data", data}` object (current,
 * schema-correct rows) — accept both. */
function extractFileData(data: unknown): string | undefined {
  if (typeof data === "string") return data;
  if (data && typeof data === "object" && typeof (data as { data?: unknown }).data === "string") {
    return (data as { data: string }).data;
  }
  return undefined;
}

function normalizeToolContent(output: unknown): NormalizedItem[] {
  if (!output || typeof output !== "object") return [];
  const o = output as Record<string, unknown>;
  const items = Array.isArray(o.content)
    ? (o.content as unknown[]) // live shape: {content: [...]}
    : o.type === "content" && Array.isArray(o.value)
      ? (o.value as unknown[]) // reloaded shape: {type:"content", value: [...]}
      : [];
  const out: NormalizedItem[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    if (c.type === "text" && typeof c.text === "string") {
      out.push({ type: "text", text: c.text });
    } else if (c.type === "image" && typeof c.data === "string") {
      out.push({ type: "image", mediaType: typeof c.mimeType === "string" ? c.mimeType : "image/jpeg", data: c.data });
    } else if (c.type === "file" && typeof c.mediaType === "string" && c.mediaType.startsWith("image/")) {
      const d = extractFileData(c.data);
      if (d) out.push({ type: "image", mediaType: c.mediaType, data: d });
    }
  }
  return out;
}

// generate-sketch.ts's handler returns the text
// `Sketch generated. Reference: generated:${id} (cost: $${costEstimate.toFixed(3)})`
// where `id = "sk_" + uuid().replace(/-/g, "")` (lowercase hex) — confirmed
// directly against src/lib/agent/tools/generate-sketch.ts. import-youtube-
// thumbnail.ts instead returns `Reference: stored:sf_${id}`, which this
// regex deliberately does not match — no sketch_id means no "+ canvas"
// button, since /api/agent/apply-sketch only knows about generated_sketches
// rows, not swipe files.
function extractSketchId(text: string): string | null {
  const m = text.match(/generated:(sk_[a-z0-9]+)/);
  return m ? m[1] : null;
}

export default function GeneratedImagePreview({ part }: { part: { output?: unknown } }) {
  const openAnnotate = useChatStore((s) => s.openAnnotate);
  const projectId = useCanvasStore((s) => s.currentProjectId);
  const flushPendingSave = useCanvasStore((s) => s.flushPendingSave);
  const placeChatSketch = useCanvasStore((s) => s.placeChatSketch);
  const [applying, setApplying] = useState(false);

  const items = normalizeToolContent(part.output);
  const textItem = items.find((c): c is Extract<NormalizedItem, { type: "text" }> => c.type === "text");
  const imageItem = items.find((c): c is Extract<NormalizedItem, { type: "image" }> => c.type === "image");
  const sketchId = textItem ? extractSketchId(textItem.text) : null;

  if (!imageItem) return null;
  const url = `data:${imageItem.mediaType};base64,${imageItem.data}`;
  const visibleId = textItem ? visibleImageIdFromToolText(textItem.text) : null;

  // POST /api/agent/apply-sketch then placeChatSketch locally. Do not
  // flush+loadProject after: that save tombstoned the new id and stripped
  // imageBase64, so a second click landed as an empty sketch.
  const applyToCanvas = async () => {
    if (!sketchId || applying) return;
    setApplying(true);
    try {
      // Flush first so apply-sketch reads the live canvas. Do not flush+reload
      // after: that POST listed the new sketch in deletedNodeIds and emptied it.
      await flushPendingSave();
      const res = await fetch("/api/agent/apply-sketch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sketch_id: sketchId, project_id: projectId }),
      });
      if (!res.ok) return;
      const body = (await res.json()) as {
        sketchNodeId?: string;
        position?: { x: number; y: number };
        image_source?: string;
        imageUrl?: string;
      };
      if (typeof body.sketchNodeId !== "string" || !body.sketchNodeId) return;
      // Place only — no edge. Each click is a new unused sketch node.
      placeChatSketch({
        id: body.sketchNodeId,
        type: "sketch",
        position: body.position ?? { x: 200, y: 200 },
        data: {
          image_source: body.image_source ?? `generated:${sketchId}`,
          imageUrl: body.imageUrl ?? `/api/generated-sketches/${sketchId}`,
          label: "Sketch IA",
        },
      });
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="relative rounded-md overflow-hidden border border-border" style={{ maxWidth: 280 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="généré" loading="lazy" onClick={() => openAnnotate(url)} className="w-full aspect-video object-cover cursor-zoom-in" />
      <ImageIdBadge id={visibleId} />
      {sketchId && (
        <button type="button" onClick={applyToCanvas} disabled={applying}
          className="absolute top-1.5 right-1.5 px-2 py-1 rounded text-[9px] uppercase bg-black/85 text-white border border-primary">
          {applying ? "…" : "+ canvas"}
        </button>
      )}
    </div>
  );
}
