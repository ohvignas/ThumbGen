import { z } from "zod";
import { getDb } from "@/lib/db";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({});

const ANGLES = ["front", "left", "right"] as const;

export const listPersonasTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "list_personas",
  description:
    "Lists the user's Personnages (multi-angle face sets). Use when a face of the creator might go on the thumbnail. A Personnage is the ONLY way to put their face in a sketch or generator — never a one-off photo. Returns stored:persona_<id> for faceReference and generate_sketch.face_source. Empty library: suggest Bibliothèque → Personnages.",
  inputSchema: InputSchema,
  handler: async () => {
    const personas = getDb()
      .prepare("SELECT id, label, created_at FROM personas ORDER BY created_at DESC")
      .all() as { id: string; label: string; created_at: string }[];

    if (personas.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "Aucun Personnage dans la bibliothèque. S'il veut apparaître dans la miniature, propose-lui d'en créer un depuis la page Bibliothèque, onglet Personnages (capture webcam en 3 angles ou une photo par angle) ; sinon pars sur des angles sans visage.",
          },
        ],
      };
    }

    const photoRows = getDb().prepare("SELECT persona_id, angle FROM persona_photos").all() as {
      persona_id: string;
      angle: (typeof ANGLES)[number];
    }[];
    const anglesByPersona = new Map<string, Set<string>>();
    for (const row of photoRows) {
      if (!anglesByPersona.has(row.persona_id)) anglesByPersona.set(row.persona_id, new Set());
      anglesByPersona.get(row.persona_id)!.add(row.angle);
    }

    const lines = personas.map((p) => {
      const angles = ANGLES.filter((a) => anglesByPersona.get(p.id)?.has(a));
      return `- stored:persona_${p.id} — "${p.label}" (${angles.length}/3 angles: ${angles.join(", ") || "aucun"})`;
    });

    return {
      content: [
        { type: "text", text: `${personas.length} personnage(s) :\n${lines.join("\n")}` },
      ],
    };
  },
};

registerTool(listPersonasTool);
