import { z } from "zod";
import { getDb } from "@/lib/db";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({});

const ANGLES = ["front", "left", "right"] as const;

export const listPersonasTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "list_personas",
  description:
    "Lists the user's Personnages — multi-angle face reference sets (front + left/right profile, captured via webcam or imported one photo per angle). A Personnage is the ONLY way to put the user's face in a thumbnail: it gives Nano Banana Pro and Seedream up to 3 angles of the same identity, which measurably improves face consistency. Each entry includes a `stored:persona_<id>` ref usable as a faceReference node's image_source in apply_workflow and as generate_sketch's face_source.",
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
            text: "Aucun Personnage dans la bibliothèque. S'il veut apparaître dans la miniature, propose-lui d'en créer un depuis l'onglet Personnages de la sidebar (capture webcam en 3 angles ou une photo par angle) ; sinon pars sur des angles sans visage.",
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
