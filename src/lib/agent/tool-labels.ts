/**
 * Single source of truth for tool display labels in the chat (live step line
 * and step detail). Each label says what the agent is doing, in French.
 */
export const TOOL_LABELS: Record<string, string> = {
  list_logos: "Liste tes logos",
  list_personas: "Liste tes personnages",
  list_swipe_files: "Liste tes références",
  list_projects: "Liste tes miniatures",
  list_past_generations: "Relit les générations passées",
  get_canvas_state: "Lit le canvas",
  view_canvas_images: "Regarde les images du canvas",
  apply_workflow: "Construit le workflow",
  place_node: "Pose un nœud sur le canvas",
  generate_sketch: "Dessine le croquis",
  extract_youtube_script: "Lit la transcription YouTube",
  search_youtube: "Cherche sur YouTube",
  search_youtube_channel: "Cherche dans la chaîne",
  get_channel_videos: "Liste les vidéos de la chaîne",
  import_youtube_thumbnail: "Importe la miniature",
  list_followed_videos: "Liste les vidéos suivies",
  request_user_image: "Demande une image",
  request_user_sketch: "Demande un croquis",
  ask_user: "Te pose une question",
  finish_turn: "Rédige la réponse",
};

/** The label of a tool, or its name made readable when it has none. */
export function toolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? toolName.replace(/_/g, " ");
}
