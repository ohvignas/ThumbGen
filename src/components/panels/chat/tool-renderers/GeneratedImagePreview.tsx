"use client";
import { useState } from "react";
import { useCanvasStore } from "@/store/canvas-store";
import { useChatStore } from "@/store/chat-store";

/**
 * See SearchYoutubeGallery.tsx for the full explanation of why a tool part's
 * `output` needs normalizing across two real shapes (live execute() return
 * vs. persisted/reloaded history). Duplicated here rather than shared so
 * this file stays a standalone component per this task's brief.
 */
type NormalizedItem = { type: "text"; text: string } | { type: "image"; mediaType: string; data: string };

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
    } else if (c.type === "file" && typeof c.data === "string" && typeof c.mediaType === "string" && c.mediaType.startsWith("image/")) {
      out.push({ type: "image", mediaType: c.mediaType, data: c.data });
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
  const loadProject = useCanvasStore((s) => s.loadProject);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  const items = normalizeToolContent(part.output);
  const textItem = items.find((c): c is Extract<NormalizedItem, { type: "text" }> => c.type === "text");
  const imageItem = items.find((c): c is Extract<NormalizedItem, { type: "image" }> => c.type === "image");
  const sketchId = textItem ? extractSketchId(textItem.text) : null;

  if (!imageItem) return null;
  const url = `data:${imageItem.mediaType};base64,${imageItem.data}`;

  // Verbatim port of the fetch call from the OLD ToolCallCard.tsx's
  // applySketchToCanvas (POST /api/agent/apply-sketch, body {sketch_id,
  // project_id}) — field names confirmed against the real route handler at
  // src/app/api/agent/apply-sketch/route.ts, which reads exactly
  // `body.sketch_id` / `body.project_id` and responds with
  // {success, sketchNodeId, createdGenId} (only `res.ok` is checked here,
  // matching the old component).
  const applyToCanvas = async () => {
    if (!sketchId || applied || applying) return;
    setApplying(true);
    try {
      const res = await fetch("/api/agent/apply-sketch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sketch_id: sketchId, project_id: projectId }),
      });
      if (res.ok) {
        setApplied(true);
        await loadProject(projectId);
      }
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="relative rounded-md overflow-hidden" style={{ border: "1px solid var(--line)", maxWidth: 280 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="généré" loading="lazy" onClick={() => openAnnotate(url)} className="w-full aspect-video object-cover" style={{ cursor: "zoom-in" }} />
      {sketchId && (
        <button type="button" onClick={applyToCanvas} disabled={applied || applying}
          className="absolute top-1.5 right-1.5 px-2 py-1 rounded text-[9px] uppercase"
          style={{ background: "rgba(15,15,20,0.85)", color: "var(--bone)", border: "1px solid var(--brand)" }}>
          {applied ? "Ajouté ✓" : applying ? "…" : "+ canvas"}
        </button>
      )}
    </div>
  );
}
