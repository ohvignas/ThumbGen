/**
 * Direct api.openai.com Images API (not OpenRouter).
 *
 * OpenRouter's unified POST /images accepts a flat `input_references` bag and
 * does not list `input_fidelity` among its request fields
 * (https://openrouter.ai/docs/guides/overview/multimodal/image-generation).
 *
 * Native `/v1/images/edits` is multipart files (not URLs) and, for gpt-image-1
 * / gpt-image-1.5, accepts `input_fidelity=high` so faces/logos match the
 * inputs: https://developers.openai.com/api/docs/guides/image-generation
 * https://developers.openai.com/cookbook/examples/generate_images_with_high_input_fidelity
 *
 * gpt-image-2 and gpt-image-2.5 process every image input at high fidelity
 * automatically — sending `input_fidelity` 400s. Identity still goes first:
 * the first file keeps the richest texture.
 */

import { parseDataUrl } from "@/lib/db";
import type { ImageResolution } from "@/lib/image-models";
import { PROVIDER_SAFE_IMAGE_MIMES, unsupportedOpenAIImageFormatError } from "@/lib/generation/transcode-reference";

export const OPENAI_IMAGES_EDITS = "https://api.openai.com/v1/images/edits";
export const OPENAI_IMAGES_GENERATIONS = "https://api.openai.com/v1/images/generations";

const MAX_REFERENCE_IMAGES = 16;
const MAX_ERROR_DETAIL_LENGTH = 300;

/** ThumbGen canvas ids that exist as native OpenAI Image API model names. */
export const OPENAI_NATIVE_MODELS: Record<string, string> = {
  "gpt-image-2.5-sunburst": "gpt-image-2.5-sunburst",
  "gpt-image-2.5-flare": "gpt-image-2.5-flare",
  "gpt-image-2": "gpt-image-2",
  "gpt-image-1": "gpt-image-1",
};

const ALLOWED_MIME = PROVIDER_SAFE_IMAGE_MIMES;

const GPT_IMAGE_1_SIZE: Record<string, string> = {
  "1x1": "1024x1024",
  "16x9": "1536x1024",
  "9x16": "1024x1536",
};

/** gpt-image-2 / 2.5: edges multiple of 16, 655_360–8_294_400 px, max edge 3840. */
const FLEX_SIZE: Record<ImageResolution, Record<string, string>> = {
  "1K": { "1x1": "1024x1024", "16x9": "1536x864", "9x16": "864x1536" },
  "2K": { "1x1": "2048x2048", "16x9": "2048x1152", "9x16": "1152x2048" },
  "4K": { "1x1": "2880x2880", "16x9": "3840x2160", "9x16": "2160x3840" },
};

export type OpenAINativeFile = {
  bytes: Buffer;
  mime: string;
  filename: string;
};

export type OpenAINativeUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type OpenAINativeSuccess = {
  ok: true;
  images: { b64: string; mediaType: string }[];
  usage: OpenAINativeUsage;
};

export type OpenAINativeFailure = {
  ok: false;
  status: number;
  error: string;
};

export function isOpenAINativeModel(modelId: string): boolean {
  return Object.hasOwn(OPENAI_NATIVE_MODELS, modelId);
}

export function nativeOpenAIModel(modelId: string): string | null {
  return OPENAI_NATIVE_MODELS[modelId] ?? null;
}

/**
 * Only gpt-image-1 / 1.5 accept this field. Later models always run high
 * fidelity and reject the parameter (invalid_input_fidelity_model).
 */
export function openaiInputFidelity(modelId: string): "high" | null {
  return modelId === "gpt-image-1" || modelId === "gpt-image-1.5" ? "high" : null;
}

export function openaiNativeSize(
  modelId: string,
  aspectRatio: string,
  resolution: ImageResolution,
): string {
  const ratio = aspectRatio === "9x16" || aspectRatio === "1x1" ? aspectRatio : "16x9";
  if (modelId === "gpt-image-1" || modelId === "gpt-image-1.5") {
    return GPT_IMAGE_1_SIZE[ratio] ?? "1536x1024";
  }
  return FLEX_SIZE[resolution]?.[ratio] ?? "2048x1152";
}

export function decodeOpenAIReferenceImages(urls: readonly string[]): OpenAINativeFile[] | { error: string } {
  if (urls.length === 0) return [];
  const files: OpenAINativeFile[] = [];
  for (const [index, url] of urls.slice(0, MAX_REFERENCE_IMAGES).entries()) {
    if (typeof url !== "string" || !url.startsWith("data:")) {
      return {
        error:
          "Les références OpenAI natives doivent être des fichiers (data URL), pas des liens HTTP. OpenAI /v1/images/edits n'accepte pas les URLs.",
      };
    }
    try {
      const { buffer, mimeType } = parseDataUrl(url);
      const mime = mimeType.split(";")[0].trim().toLowerCase();
      if (!ALLOWED_MIME.has(mime)) {
        return { error: unsupportedOpenAIImageFormatError(mime) };
      }
      const ext = mime.includes("jpeg") || mime === "image/jpg" ? "jpg" : mime.includes("webp") ? "webp" : "png";
      files.push({
        bytes: buffer,
        mime: mime === "image/jpg" ? "image/jpeg" : mime,
        filename: `ref-${index + 1}.${ext}`,
      });
    } catch {
      return { error: `Image de référence ${index + 1} illisible (data URL invalide).` };
    }
  }
  return files;
}

export function buildOpenAIEditForm(input: {
  model: string;
  prompt: string;
  size: string;
  inputFidelity: "high" | null;
  files: readonly OpenAINativeFile[];
}): FormData {
  const form = new FormData();
  form.append("model", input.model);
  form.append("prompt", input.prompt);
  form.append("n", "1");
  form.append("size", input.size);
  form.append("output_format", "png");
  if (input.inputFidelity) form.append("input_fidelity", input.inputFidelity);
  for (const file of input.files) {
    const blob = new Blob([new Uint8Array(file.bytes)], { type: file.mime });
    form.append("image[]", blob, file.filename);
  }
  return form;
}

export function extractProviderErrorDetail(rawBody: string): string | null {
  try {
    const parsed = JSON.parse(rawBody) as { error?: { message?: unknown } };
    const message = parsed?.error?.message;
    if (typeof message === "string" && message.trim()) {
      const trimmed = message.trim();
      return trimmed.length > MAX_ERROR_DETAIL_LENGTH
        ? `${trimmed.slice(0, MAX_ERROR_DETAIL_LENGTH)}…`
        : trimmed;
    }
  } catch {
    // Non-JSON body.
  }
  return null;
}

function usageFromBody(result: { usage?: Record<string, unknown> }): OpenAINativeUsage {
  const usage = result.usage ?? {};
  const inputTokens = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0) || 0;
  const outputTokens = Number(usage.output_tokens ?? usage.completion_tokens ?? 0) || 0;
  const totalTokens = Number(usage.total_tokens ?? inputTokens + outputTokens) || 0;
  return { inputTokens, outputTokens, totalTokens };
}

function imagesFromBody(result: { data?: Array<{ b64_json?: unknown }> }): { b64: string; mediaType: string }[] {
  const images: { b64: string; mediaType: string }[] = [];
  for (const item of result.data ?? []) {
    if (typeof item.b64_json === "string" && item.b64_json) {
      images.push({ b64: item.b64_json, mediaType: "image/png" });
    }
  }
  return images;
}

function failFromResponse(status: number, raw: string, label: string): OpenAINativeFailure {
  const detail = extractProviderErrorDetail(raw);
  return {
    ok: false,
    status,
    error: detail ? `${label} error: ${status} — ${detail}` : `${label} error: ${status}`,
  };
}

export function isOpenAICreditOrAuthFailure(status: number, error = ""): boolean {
  if (status === 401 || status === 403 || status === 429) return true;
  return /no credits remaining|insufficient[_ ]?(quota|funds)|billing|credit balance|exceeded your current quota|invalid api key|incorrect api key|invalid_api_key|authentication/i.test(
    error,
  );
}

/** Native OpenAI cannot fulfill this request; OpenRouter may still be able to. */
export function shouldFallbackToOpenRouter(failure: Pick<OpenAINativeFailure, "status" | "error">): boolean {
  if (isOpenAICreditOrAuthFailure(failure.status, failure.error)) return true;
  if (failure.status === 502 || failure.status === 503 || failure.status === 504) return true;
  return /fetch failed|network|econnreset|enotfound|etimedout|socket|aborted/i.test(failure.error);
}

export function userFacingOpenAICreditOrAuthError(status: number, error = ""): string {
  if (
    status === 401 ||
    status === 403 ||
    /invalid api key|incorrect api key|invalid_api_key|authentication/i.test(error)
  ) {
    return "Clé API OpenAI manquante ou invalide. Ajoute une clé OpenAI ou OpenRouter dans Réglages.";
  }
  return "Crédits OpenAI épuisés. Ajoute une clé OpenRouter dans Réglages, ou recharge tes crédits OpenAI.";
}

function failFromThrown(err: unknown): OpenAINativeFailure {
  const message = err instanceof Error && err.message.trim() ? err.message.trim() : "erreur réseau";
  return { ok: false, status: 502, error: `OpenAI API error: ${message}` };
}

export async function generateOpenAINative(input: {
  apiKey: string;
  modelId: string;
  prompt: string;
  size: string;
  files: readonly OpenAINativeFile[];
}): Promise<OpenAINativeSuccess | OpenAINativeFailure> {
  const model = nativeOpenAIModel(input.modelId);
  if (!model) {
    return { ok: false, status: 400, error: `Modèle OpenAI natif inconnu: ${input.modelId}` };
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${input.apiKey}` };
  const endpoint = input.files.length > 0 ? OPENAI_IMAGES_EDITS : OPENAI_IMAGES_GENERATIONS;
  let body: BodyInit;
  try {
    body =
      input.files.length > 0
        ? buildOpenAIEditForm({
            model,
            prompt: input.prompt,
            size: input.size,
            inputFidelity: openaiInputFidelity(input.modelId),
            files: input.files,
          })
        : JSON.stringify({
            model,
            prompt: input.prompt,
            n: 1,
            size: input.size,
            output_format: "png",
          });
  } catch (err) {
    return failFromThrown(err);
  }

  if (input.files.length === 0) headers["Content-Type"] = "application/json";

  try {
    const res = await fetch(endpoint, { method: "POST", headers, body });
    const raw = await res.text();
    if (!res.ok) return failFromResponse(res.status, raw, "OpenAI API");

    try {
      const result = JSON.parse(raw) as { data?: Array<{ b64_json?: unknown }>; usage?: Record<string, unknown> };
      return { ok: true, images: imagesFromBody(result), usage: usageFromBody(result) };
    } catch {
      return { ok: false, status: 502, error: "OpenAI API error: réponse JSON illisible" };
    }
  } catch (err) {
    return failFromThrown(err);
  }
}
