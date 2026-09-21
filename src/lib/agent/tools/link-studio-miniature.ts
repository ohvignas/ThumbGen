import { z } from "zod";
import {
  createMiniatureForStudio,
  linkProjectToStudio,
  listProjectsForStudio,
  unlinkProjectFromStudio,
} from "@/lib/studio/link-project";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({
  video_id: z.string().min(8).max(80),
  action: z.enum(["link", "unlink", "create"]),
  project_id: z.string().min(4).max(80).optional(),
});

function studioVideoId(raw: string): string {
  return raw.replace(/^studio:/, "").trim();
}

export const linkStudioMiniatureTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "link_studio_miniature",
  description:
    "Creates, links or unlinks a local canvas miniature on a ThumbGen video fiche, with at most three A/B test slots.",
  inputSchema: InputSchema,
  handler: async ({ video_id, action, project_id }) => {
    const videoId = studioVideoId(video_id);
    if (action !== "create" && !project_id) {
      return {
        isError: true,
        content: [{ type: "text", text: `project_id est requis pour l’action ${action}.` }],
      };
    }
    try {
      if (action === "create") {
        const created = createMiniatureForStudio(videoId);
        return {
          content: [{ type: "text", text: `Miniature ${created.id} créée et liée à studio:${videoId}.` }],
        };
      }
      if (action === "link") {
        linkProjectToStudio(project_id!, videoId);
      } else {
        unlinkProjectFromStudio(project_id!, videoId);
      }
      const projects = listProjectsForStudio(videoId);
      return {
        content: [
          {
            type: "text",
            text: `Miniature ${project_id} ${action === "link" ? "liée à" : "détachée de"} studio:${videoId}. ${projects.length}/3 emplacement(s) utilisé(s).`,
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: error instanceof Error ? error.message : "Erreur inattendue" }],
      };
    }
  },
};

registerTool(linkStudioMiniatureTool);
