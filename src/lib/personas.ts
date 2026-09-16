/** A Personnage: one identity captured from up to three angles. */
export type PersonaAngle = "front" | "left" | "right";

export const PERSONA_ANGLES: PersonaAngle[] = ["front", "left", "right"];

export const PERSONA_ANGLE_LABELS: Record<PersonaAngle, string> = {
  front: "Face",
  left: "Profil gauche",
  right: "Profil droit",
};

/** One row of `GET /api/personas`. */
export type PersonaSummary = { id: string; label: string; angles: PersonaAngle[] };

export function personaImageUrl(personaId: string, angle: PersonaAngle): string {
  return `/api/personas/image?id=${encodeURIComponent(personaId)}&angle=${angle}`;
}

/** Data of a faceReference node showing this Personnage. */
export function personaNodeData(persona: PersonaSummary): {
  label: string;
  personaId: string;
  personaAngles: Partial<Record<PersonaAngle, string>>;
} {
  const personaAngles: Partial<Record<PersonaAngle, string>> = {};
  for (const angle of persona.angles) personaAngles[angle] = personaImageUrl(persona.id, angle);
  return { label: persona.label, personaId: persona.id, personaAngles };
}

/** Item of the chat « Bibliothèque » picker; null for a Personnage without photos. */
export function personaPickerItem(
  persona: PersonaSummary,
): { source: string; preview_url: string; label: string } | null {
  const angle = persona.angles[0];
  if (!angle) return null;
  return {
    source: `stored:persona_${persona.id}`,
    preview_url: personaImageUrl(persona.id, angle),
    label: persona.label || "Personnage",
  };
}
