/**
 * Single source of truth for tool display labels — replaces the two
 * independently-drifted FRIENDLY_NAMES tables that used to live in
 * ToolCallCard.tsx and AgentActivity.tsx (both referenced tools that were
 * never registered, and both were missing tools that were).
 */
export const TOOL_LABELS: Record<string, string> = {
  list_logos: "bibliothèque · logos",
  list_personas: "bibliothèque · personnages",
  list_swipe_files: "bibliothèque · références",
  list_projects: "liste projets",
  list_past_generations: "générations passées",
  get_canvas_state: "lecture canvas",
  apply_workflow: "workflow appliqué",
  generate_sketch: "croquis",
  extract_youtube_script: "transcript YouTube",
  search_youtube: "recherche YouTube",
  search_youtube_channel: "recherche dans la chaîne",
  get_channel_videos: "vidéos de la chaîne",
  import_youtube_thumbnail: "import miniature YouTube",
  request_user_image: "demande image",
};
