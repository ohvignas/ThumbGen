"use client";

const FRIENDLY_NAMES: Record<string, string> = {
  web_search: "recherche web",
  generate_sketch: "croquis",
  apply_workflow: "workflow appliqué",
  extract_youtube_script: "transcript YouTube",
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
};

/**
 * Atelier Nocturne tool-call display.
 * Hairline left bar + mono eyebrow + Fraunces italic label.
 * No emoji. Status communicated via the bar color and a small mono glyph.
 */
export default function ToolCallCard({ name, status, summary, input }: ToolCallCardProps) {
  const label = FRIENDLY_NAMES[name] ?? name;

  const barColor =
    status === "error" ? "var(--ember)" : status === "done" ? "var(--bone-faint)" : "var(--bone-muted)";
  const glyph =
    status === "error" ? "✗" : status === "done" ? "·" : "…";
  const glyphColor =
    status === "error" ? "var(--ember)" : status === "done" ? "var(--text-muted)" : "var(--text-tertiary)";

  return (
    <div
      className="flex items-stretch gap-2.5 my-1.5 text-xs"
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
        {summary && (
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
