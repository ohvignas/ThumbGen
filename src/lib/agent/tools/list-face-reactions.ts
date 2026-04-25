import { z } from "zod";
import { getDb } from "@/lib/db";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({});

export const listFaceReactionsTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "list_face_reactions",
  description:
    "Lists the user's face/expression photos with auto-generated emotion tags. Each entry includes a `stored:fr_<id>` ref usable as a faceReference node, plus emotion + keywords + caption derived from a vision pass over the image. Use the tags to PICK the face whose emotion matches each thumbnail angle (e.g. for a 'choc' angle pick the surprised face, for a 'demo' angle pick the focused/concentré one).",
  inputSchema: InputSchema,
  handler: async () => {
    const rows = getDb()
      .prepare(
        "SELECT id, label, size, created_at, tags FROM face_reactions ORDER BY created_at DESC"
      )
      .all() as {
      id: string;
      label: string;
      size: number;
      created_at: string;
      tags: string | null;
    }[];

    if (rows.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "Aucun visage dans la bibliothèque. Demande à l'utilisateur s'il veut apparaître dans la miniature et joindre une photo, ou propose des angles sans visage si les patterns YouTube observés n'en ont pas.",
          },
        ],
      };
    }

    const lines = rows.map((r) => {
      let extras = "";
      if (r.tags) {
        try {
          const t = JSON.parse(r.tags) as {
            emotions?: string[];
            expression?: string;
            intensity?: string;
            keywords?: string[];
            caption?: string;
          };
          const parts = [
            t.emotions?.length ? `émotion: ${t.emotions.join(", ")}` : null,
            t.intensity ? `intensité: ${t.intensity}` : null,
            t.keywords?.length ? `tags: ${t.keywords.join(", ")}` : null,
            t.caption || null,
          ].filter(Boolean);
          if (parts.length) extras = `\n  → ${parts.join(" · ")}`;
        } catch {
          // ignore malformed
        }
      } else {
        extras = `\n  → (pas encore analysé — sera tagué automatiquement)`;
      }
      return `- stored:fr_${r.id} — "${r.label}"${extras}`;
    });

    return {
      content: [
        { type: "text", text: `${rows.length} visage(s) :\n${lines.join("\n")}` },
      ],
    };
  },
};

registerTool(listFaceReactionsTool);
