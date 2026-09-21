import { isWritingProjectId } from "./types";
import type { ToolResult } from "@/lib/agent/tools/types";

export type AgentSurface = "studio" | "canvas";

export const STUDIO_FILL_TOOLS = ["upsert_studio_script", "create_studio_video", "link_studio_miniature"] as const;
export const CANVAS_ONLY_TOOLS = [
  "generate_sketch",
  "apply_workflow",
  "place_node",
  "get_canvas_state",
  "view_canvas_images",
  "list_past_generations",
] as const;

const STUDIO_FILL = new Set<string>(STUDIO_FILL_TOOLS);
const CANVAS_ONLY = new Set<string>(CANVAS_ONLY_TOOLS);

export function agentSurfaceFromProjectId(projectId: string | undefined): AgentSurface {
  return projectId && isWritingProjectId(projectId) ? "studio" : "canvas";
}

export function refuseWrongSurface(toolName: string, projectId: string | undefined): ToolResult | null {
  const surface = agentSurfaceFromProjectId(projectId);
  if (surface === "studio" && CANVAS_ONLY.has(toolName)) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Outil canvas (${toolName}) refusé sur une fiche Vidéos / studio. Reste sur write_video, studio_format, studio_titles, studio_description, studio_script. Pas de croquis ni de workflow miniature ici.`,
        },
      ],
    };
  }
  if (surface === "canvas" && STUDIO_FILL.has(toolName)) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Outil d’écriture studio (${toolName}) refusé sur le canvas miniature. Ouvre Vidéos / une fiche, ou utilise generate_sketch / apply_workflow ici.`,
        },
      ],
    };
  }
  return null;
}
