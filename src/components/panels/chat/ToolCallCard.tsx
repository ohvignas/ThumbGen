"use client";
import { useState } from "react";
import { useCanvasStore } from "@/store/canvas-store";

const FRIENDLY_NAMES: Record<string, string> = {
  web_search: "recherche web",
  generate_sketch: "croquis",
  apply_workflow: "workflow appliqué",
  extract_youtube_script: "transcript YouTube",
  search_youtube: "recherche YouTube",
  search_youtube_channel: "recherche dans la chaîne",
  get_channel_videos: "vidéos de la chaîne",
  trigger_generation: "génération finale",
  list_logos: "bibliothèque · logos",
  list_face_reactions: "bibliothèque · visages",
  list_swipe_files: "bibliothèque · références",
  list_projects: "liste projets",
  list_past_generations: "générations passées",
  get_canvas_state: "lecture canvas",
  get_node_details: "détails node",
  remix_image: "remix",
  edit_image: "édition",
  request_user_image: "demande image",
  request_user_sketch: "demande croquis",
};

export type ToolCallCardProps = {
  name: string;
  status: "pending" | "done" | "error";
  summary?: string;
  input?: unknown;
  images?: string[];
};

/**
 * Atelier Nocturne tool-call display.
 * Hairline left bar + mono eyebrow + Fraunces italic label.
 * No emoji. Status communicated via the bar color and a small mono glyph.
 * Renders a thumbnail gallery when the tool returns images (e.g. search_youtube).
 */
function extractSketchId(url: string): string | null {
  const m = url.match(/\/api\/generated-sketches\/(sk_[a-z0-9]+)/);
  return m ? m[1] : null;
}

export default function ToolCallCard({ name, status, summary, input, images }: ToolCallCardProps) {
  const label = FRIENDLY_NAMES[name] ?? name;
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [appliedIdx, setAppliedIdx] = useState<Set<number>>(new Set());
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null);
  const projectId = useCanvasStore((s) => s.currentProjectId);
  const loadProject = useCanvasStore((s) => s.loadProject);

  const applySketchToCanvas = async (sketchId: string, idx: number) => {
    if (appliedIdx.has(idx) || applyingIdx === idx) return;
    setApplyingIdx(idx);
    try {
      const res = await fetch("/api/agent/apply-sketch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sketch_id: sketchId, project_id: projectId }),
      });
      if (res.ok) {
        setAppliedIdx((prev) => new Set(prev).add(idx));
        await loadProject(projectId);
      }
    } finally {
      setApplyingIdx(null);
    }
  };

  const barColor =
    status === "error" ? "var(--ember)" : status === "done" ? "var(--bone-faint)" : "var(--bone-muted)";
  const glyph =
    status === "error" ? "✗" : status === "done" ? "·" : "…";
  const glyphColor =
    status === "error" ? "var(--ember)" : status === "done" ? "var(--text-muted)" : "var(--text-tertiary)";

  const hasImages = images && images.length > 0;

  return (
    <div
      className="flex items-stretch gap-2.5 my-2 text-xs"
      style={{ paddingLeft: 2 }}
    >
      <div
        className="w-px self-stretch shrink-0 transition-colors"
        style={{ background: barColor }}
      />
      <div className="flex-1 min-w-0 py-0.5">
        <div className="flex items-baseline gap-1.5">
          <span
            className="text-[9px] uppercase shrink-0"
            style={{
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
              letterSpacing: "0.18em",
            }}
          >
            {name}
          </span>
          <span
            className={status === "pending" ? "animate-pulse" : ""}
            style={{ color: glyphColor, fontFamily: "var(--font-mono), monospace", fontSize: 11 }}
          >
            {glyph}
          </span>
          {hasImages && (
            <span
              className="text-[9px] uppercase shrink-0"
              style={{
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
                letterSpacing: "0.18em",
              }}
            >
              · {images!.length} thumb.
            </span>
          )}
        </div>
        <div
          className="mt-0.5 italic"
          style={{
            color: "var(--text-secondary)",
            fontFamily: "var(--font-display), 'Fraunces', serif",
            fontSize: 13,
            letterSpacing: "-0.01em",
          }}
        >
          {label}
        </div>

        {hasImages && (
          <div className="thumb-grid mt-2">
            {images!.map((url, i) => {
              const sketchId = extractSketchId(url);
              const isSketch = sketchId !== null;
              const isApplied = appliedIdx.has(i);
              const isApplying = applyingIdx === i;
              return (
                <div key={`${url}-${i}`} className="thumb-wrapper">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="thumb-cell"
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    style={{
                      transform: hoveredIdx === i ? "translateY(-2px) scale(1.04)" : "none",
                      zIndex: hoveredIdx === i ? 2 : 1,
                      boxShadow:
                        hoveredIdx === i
                          ? "0 8px 16px rgba(0,0,0,0.4)"
                          : "0 2px 4px rgba(0,0,0,0.2)",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="thumbnail" loading="lazy" />
                    <span className="thumb-overlay" />
                  </a>
                  {isSketch && (
                    <button
                      type="button"
                      className="apply-btn"
                      onClick={(e) => {
                        e.preventDefault();
                        applySketchToCanvas(sketchId!, i);
                      }}
                      disabled={isApplied || isApplying}
                      title={isApplied ? "Ajouté au canvas" : "Ajouter ce sketch au canvas"}
                      aria-label="Ajouter au canvas"
                    >
                      {isApplied ? (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : isApplying ? (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="apply-spin">
                          <circle cx="12" cy="12" r="9" strokeDasharray="56" strokeDashoffset="20" />
                        </svg>
                      ) : (
                        <>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                          <span>canvas</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
            <style jsx>{`
              .thumb-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 6px;
              }
              .thumb-wrapper { position: relative; }
              .thumb-cell {
                position: relative;
                aspect-ratio: 16 / 9;
                overflow: hidden;
                border-radius: 6px;
                border: 1px solid var(--line);
                background: var(--ink-3);
                transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1),
                            box-shadow 0.18s ease,
                            border-color 0.18s ease;
                display: block;
              }
              .thumb-cell:hover { border-color: var(--bone-muted); }
              .apply-btn {
                position: absolute;
                top: 4px;
                right: 4px;
                z-index: 3;
                display: flex;
                align-items: center;
                gap: 3px;
                padding: 3px 6px;
                font-family: var(--font-mono), 'JetBrains Mono', monospace;
                font-size: 9px;
                text-transform: uppercase;
                letter-spacing: 0.12em;
                background: rgba(15, 15, 20, 0.85);
                color: var(--bone);
                border: 1px solid var(--brand);
                border-radius: 4px;
                cursor: pointer;
                opacity: 0;
                transition: opacity 0.18s ease, background 0.15s ease;
                backdrop-filter: blur(6px);
              }
              .thumb-wrapper:hover .apply-btn { opacity: 1; }
              .apply-btn:hover { background: var(--brand); color: var(--ink-1); }
              .apply-btn:disabled {
                opacity: 1;
                background: var(--brand);
                color: var(--ink-1);
                cursor: default;
              }
              .apply-spin {
                animation: applyspin 0.8s linear infinite;
              }
              @keyframes applyspin {
                from { transform: rotate(0); }
                to { transform: rotate(360deg); }
              }
              .thumb-cell img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                display: block;
                transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1),
                            filter 0.3s ease;
                filter: saturate(0.92) brightness(0.92);
              }
              .thumb-cell:hover img {
                transform: scale(1.06);
                filter: saturate(1.05) brightness(1);
              }
              .thumb-overlay {
                position: absolute;
                inset: 0;
                background:
                  linear-gradient(180deg, rgba(8,8,12,0) 60%, rgba(8,8,12,0.6) 100%),
                  radial-gradient(circle at 100% 0%, rgba(230,0,126,0.0) 60%, rgba(230,0,126,0.18) 100%);
                pointer-events: none;
                opacity: 0;
                transition: opacity 0.2s ease;
              }
              .thumb-cell:hover .thumb-overlay { opacity: 1; }
            `}</style>
          </div>
        )}

        {summary && !hasImages && (
          <div
            className="mt-1 line-clamp-3 whitespace-pre-wrap break-words"
            style={{ color: "var(--text-tertiary)" }}
          >
            {summary}
          </div>
        )}
        {!summary && input != null && (
          <details className="mt-1">
            <summary
              className="cursor-pointer text-[10px]"
              style={{ color: "var(--text-muted)" }}
            >
              voir détails
            </summary>
            <pre
              className="mt-1 text-[10px] p-2 rounded overflow-x-auto"
              style={{
                background: "var(--ink-3)",
                color: "var(--text-tertiary)",
                fontFamily: "var(--font-mono), monospace",
                border: "1px solid var(--line-faint)",
              }}
            >
              {JSON.stringify(input, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
