/**
 * Turns compact generate-request refs (stored: / generated: / uploaded: /
 * same-origin /api/ URLs) into data URLs the OpenAI / OpenRouter clients need.
 * Never HTTP-fetches: pixels come from SQLite the app already has.
 */
import { toImageSourceRef } from "@/lib/canvas/image-refs";
import { getDb } from "@/lib/db";
import { resolveImageSource } from "@/lib/agent/tools/_helpers/image-source";

const PERSONA_ANGLE = /^(front|left|right)$/;

function toDataUrl(mimeType: string, bytes: Buffer): string {
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

function loadPersonaAngle(personaId: string, angle: string): string {
  const row = getDb()
    .prepare("SELECT mime_type, data FROM persona_photos WHERE persona_id = ? AND angle = ?")
    .get(personaId, angle) as { mime_type: string; data: Buffer } | undefined;
  if (!row) throw new Error(`Image de référence introuvable (persona ${personaId}, ${angle}).`);
  return toDataUrl(row.mime_type, row.data);
}

function personaAngleFromUrl(src: string): { id: string; angle: string } | null {
  if (!src.startsWith("/api/personas/image")) return null;
  try {
    const url = new URL(src, "http://thumbgen.local");
    const id = url.searchParams.get("id");
    const angle = url.searchParams.get("angle") || "front";
    if (!id || !PERSONA_ANGLE.test(angle)) return null;
    return { id, angle };
  } catch {
    return null;
  }
}

export async function resolveGenerationImageUrl(src: string): Promise<string> {
  if (!src) throw new Error("Référence image vide.");
  if (src.startsWith("data:")) return src;
  if (src.startsWith("http://") || src.startsWith("https://")) return src;

  const persona = personaAngleFromUrl(src);
  if (persona) return loadPersonaAngle(persona.id, persona.angle);

  const ref = toImageSourceRef(src) ?? (/^(stored:|generated:|uploaded:)/.test(src) ? src : null);
  if (!ref) throw new Error("Référence image illisible.");

  if (ref.startsWith("stored:persona_")) {
    return loadPersonaAngle(ref.slice("stored:persona_".length), "front");
  }

  const image = await resolveImageSource(ref);
  return toDataUrl(image.mimeType, image.bytes);
}

export async function resolveGenerationImageUrls(sources: readonly string[]): Promise<string[]> {
  const urls: string[] = [];
  for (const src of sources) {
    if (!src) continue;
    urls.push(await resolveGenerationImageUrl(src));
  }
  return urls;
}
