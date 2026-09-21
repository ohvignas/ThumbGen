import { z } from "zod";
import { createStudioVideo } from "@/lib/studio/store";
import { indexStudioCorpus } from "@/lib/studio/corpus";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  etiquette: z.enum(["Propositions", "Pas commencer", "En cours", "En prod", "Terminer"]).optional(),
});

export const createStudioVideoTool: ToolDefinition<z.output<typeof InputSchema>> = {
  name: "create_studio_video",
  description:
    "Creates a local ThumbGen video fiche (title, optional etiquette) and returns studio:<videoId>. Use when they named a new topic and no fiche exists.",
  inputSchema: InputSchema,
  handler: async ({ title, etiquette }) => {
    const created = createStudioVideo({ title, etiquette });
    indexStudioCorpus(created.videoId);
    return {
      content: [
        {
          type: "text",
          text: `Créé studio:${created.videoId} — "${created.title}" — ${created.etiquette ?? "—"}`,
        },
      ],
    };
  },
};

registerTool(createStudioVideoTool);
