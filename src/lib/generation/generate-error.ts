/**
 * User-facing generate errors. The route used to swallow the real exception
 * and return the English "Generation failed" — the preview node then showed
 * that as a mashed "Generationfailed" at 10px.
 */

export const GENERATION_FAILED_FR = "Échec de la génération";
export const PAYLOAD_TOO_LARGE_FR = "Payload trop volumineux";
export const GENERATE_CONNECTION_FR = "Connexion interrompue — réessaie la génération";
export const GENERATE_MODERATION_FR = "Requête bloquée par la modération de contenu";
export const GENERATE_EMPTY_FR = "Le fournisseur n'a renvoyé aucune image";

const LOOKS_LIKE_KEY = /(sk-|or-|pk-|rk-)[A-Za-z0-9_-]{10,}/g;
const OVERSIZED_POSITION = 1_000_000;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message.trim() : typeof err === "string" ? err.trim() : "";
}

export function isOversizedGenerateError(err: unknown): boolean {
  const raw = errorMessage(err);
  if (!raw) return false;
  if (/body exceeded|too large|request entity too large|payload too large/i.test(raw)) return true;
  if (/unterminated string in json/i.test(raw)) return true;
  const position = raw.match(/position (\d+)/i);
  return Boolean(position && Number(position[1]) >= OVERSIZED_POSITION);
}

export function redactGenerateError(message: string): string {
  return message.replace(LOOKS_LIKE_KEY, "[redacted]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

export function userFacingGenerateError(err: unknown): string {
  const raw = errorMessage(err);
  if (!raw) return GENERATION_FAILED_FR;
  if (isOversizedGenerateError(raw)) return PAYLOAD_TOO_LARGE_FR;
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(raw)) return GENERATE_CONNECTION_FR;
  if (
    /content moderation|blocked this request|prohibited[_ ]content|safety (?:system|filter|block)|modération de contenu/i.test(
      raw,
    )
  ) {
    return GENERATE_MODERATION_FR;
  }
  if (/returned no image|aucune image|no image (?:data|returned)/i.test(raw)) return GENERATE_EMPTY_FR;
  if (/^generation\s*failed$/i.test(raw)) return GENERATION_FAILED_FR;
  return redactGenerateError(raw);
}

export type GenerationErrorFields = {
  error: string;
  status?: number;
  provider?: string;
};

export function generationErrorFields(err: unknown): GenerationErrorFields {
  const error = userFacingGenerateError(err);
  if (err && typeof err === "object") {
    const status = "status" in err && typeof err.status === "number" ? err.status : undefined;
    const provider = "provider" in err && typeof err.provider === "string" ? err.provider : undefined;
    return { error, status, provider };
  }
  return { error };
}
