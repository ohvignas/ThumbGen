import { z } from "zod";
import { getStudioVideo, saveStudioDraft, updateStudioVideo } from "@/lib/studio/store";
import { indexStudioCorpus } from "@/lib/studio/corpus";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({
  video_id: z.string().min(8).max(80),
  title: z.string().trim().min(1).max(200).optional(),
  summary: z.string().trim().max(4_000).optional(),
  etiquette: z.enum(["Propositions", "Pas commencer", "En cours", "En prod", "Terminer"]).optional(),
  script: z.string().max(80_000).optional(),
  description: z.string().max(20_000).optional(),
  title_variants: z
    .array(z.object({ title: z.string(), thumbText: z.string(), visualConcept: z.string() }))
    .max(3)
    .optional(),
});

function studioVideoId(raw: string): string {
  return raw.replace(/^studio:/, "").trim();
}

export const upsertStudioScriptTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "upsert_studio_script",
  description:
    "Saves script, description and up to 3 title/thumb-text rows on a local ThumbGen fiche. No HTTP, no Notion. The editor already has the draft.",
  inputSchema: InputSchema,
  handler: async ({ video_id, title, summary, etiquette, script, description, title_variants }) => {
    const videoId = studioVideoId(video_id);
    const video = getStudioVideo(videoId);
    if (!video) {
      return {
        isError: true,
        content: [{ type: "text", text: `Fiche ${videoId} introuvable. Appelle list_studio_videos ou create_studio_video.` }],
      };
    }
    const draft = video.draft;
    if (script !== undefined) draft.script = script;
    if (description !== undefined) draft.description = description;
    if (title_variants) {
      for (let i = 0; i < 3 && i < title_variants.length; i += 1) {
        draft.titleVariants[i] = title_variants[i];
      }
    }
    saveStudioDraft(videoId, draft);
    if (title !== undefined || summary !== undefined || etiquette !== undefined) {
      updateStudioVideo(videoId, { title, summary, etiquette });
    }
    indexStudioCorpus(videoId);
    return {
      content: [
        {
          type: "text",
          text: `Brouillon enregistré pour studio:${videoId} (script ${draft.script.length} car., description ${draft.description.length} car.).`,
        },
      ],
    };
  },
};

registerTool(upsertStudioScriptTool);
