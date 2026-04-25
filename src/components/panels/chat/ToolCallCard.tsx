"use client";

const ICONS: Record<string, string> = {
  web_search: "🔍",
  generate_sketch: "🎨",
  apply_workflow: "🛠",
  extract_youtube_script: "📺",
  search_youtube_channel: "📊",
  get_channel_videos: "📊",
  trigger_generation: "⚡",
  list_logos: "📚",
  list_face_reactions: "📚",
  list_swipe_files: "📚",
  list_projects: "📁",
  list_past_generations: "🖼",
  get_canvas_state: "🗺",
  get_node_details: "🔎",
  remix_image: "🔁",
  edit_image: "✏️",
  request_user_image: "🖼",
  request_user_sketch: "✏️",
};

const FRIENDLY_NAMES: Record<string, string> = {
  web_search: "Recherche web",
  generate_sketch: "Croquis",
  apply_workflow: "Workflow appliqué",
  extract_youtube_script: "Transcript YouTube",
  search_youtube_channel: "Recherche dans la chaîne",
  get_channel_videos: "Vidéos de la chaîne",
  trigger_generation: "Génération finale",
  list_logos: "Bibliothèque des logos",
  list_face_reactions: "Bibliothèque des visages",
  list_swipe_files: "Bibliothèque des références",
  list_projects: "Liste des projets",
  list_past_generations: "Générations passées",
  get_canvas_state: "Lecture du canvas",
  get_node_details: "Détails d'un node",
  remix_image: "Remix d'image",
  edit_image: "Édition d'image",
  request_user_image: "Demande d'image",
  request_user_sketch: "Demande de croquis",
};

export type ToolCallCardProps = {
  name: string;
  status: "pending" | "done" | "error";
  summary?: string;
  input?: unknown;
};

export default function ToolCallCard({ name, status, summary, input }: ToolCallCardProps) {
  const icon = ICONS[name] ?? "🛠";
  const label = FRIENDLY_NAMES[name] ?? name;

  const borderColor =
    status === "error" ? "border-red-300 bg-red-50"
    : status === "done" ? "border-green-200 bg-green-50/30"
    : "border-gray-200 bg-gray-50";

  return (
    <div className={`rounded-lg border ${borderColor} px-2.5 py-2 my-1.5 text-xs flex items-start gap-2`}>
      <span className="text-base shrink-0 leading-none mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-700 flex items-center gap-1.5">
          {label}
          {status === "pending" && <span className="text-gray-400 animate-pulse">…</span>}
          {status === "done" && <span className="text-green-600">✓</span>}
          {status === "error" && <span className="text-red-600">✗</span>}
        </div>
        {summary && (
          <div className="text-gray-600 mt-1 line-clamp-3 whitespace-pre-wrap break-words">{summary}</div>
        )}
        {!summary && input != null && (
          <details className="mt-1">
            <summary className="cursor-pointer text-gray-400 hover:text-gray-600">Détails</summary>
            <pre className="mt-1 text-[10px] bg-white p-2 rounded overflow-x-auto text-gray-700">
              {JSON.stringify(input, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
