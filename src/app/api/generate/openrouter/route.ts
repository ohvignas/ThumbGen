import { NextRequest, NextResponse } from "next/server";
import { getTypedSettings } from "@/lib/settings";
import { DEFAULT_IMAGE_MODEL, isImageResolution, MODEL_SLUGS, type ImageResolution } from "@/lib/image-models";
import { saveGeneratedImage } from "@/lib/generated-images";
import { logGeneration } from "@/lib/generations-log";
import {
  applyReferenceRolesToPrompt,
  countReferenceRoles,
  planGenerationReferences,
} from "@/lib/generation/reference-prompt";
import {
  decodeOpenAIReferenceImages,
  extractProviderErrorDetail,
  generateOpenAINative,
  isOpenAICreditOrAuthFailure,
  isOpenAINativeModel,
  openaiNativeSize,
  shouldFallbackToOpenRouter,
  userFacingOpenAICreditOrAuthError,
} from "@/lib/generation/openai-native";
import {
  GENERATE_EMPTY_FR,
  isOversizedGenerateError,
  PAYLOAD_TOO_LARGE_FR,
  userFacingGenerateError,
} from "@/lib/generation/generate-error";
import { resolveGenerationImageUrl, resolveGenerationImageUrls } from "@/lib/generation/resolve-refs";
import { transcodeReferenceImages } from "@/lib/generation/transcode-reference";
import { debugLog } from "@/lib/debug-log";

// OpenRouter's Unified Image API (launched June 2026) — one key, one request
// shape, routes to 30+ models across 8 providers. OpenAI-family models use
// api.openai.com instead when openaiApiKey is set, so we can send
// input_fidelity=high (gpt-image-1) and multipart identity files that
// OpenRouter's flat input_references bag does not expose.
const ENDPOINT = "https://openrouter.ai/api/v1/images";

// The id → OpenRouter slug map lives in src/lib/image-models.ts. Ideogram,
// Grok and gpt-image-1.5 have no OpenRouter equivalent and are absent from it.

/** Stay under the Next.js 16 ~10MB proxy body cap. Compact refs are a few KB. */
const GENERATION_REQUEST_MAX_BYTES = 8 * 1024 * 1024;

function mapAspectRatio(ratio: string): string {
  const map: Record<string, string> = {
    "16x9": "16:9",
    "1x1": "1:1",
    "4x3": "4:3",
    "3x2": "3:2",
    "9x16": "9:16",
  };
  return map[ratio] || "16:9";
}

function asStringArray(value: unknown): string[] {
  return (Array.isArray(value) ? value : []).filter((item): item is string => typeof item === "string");
}

function httpStatus(status: number): number {
  return status >= 400 && status <= 599 ? status : 502;
}

function generationErrorJson(error: string, status: number, provider: string) {
  return NextResponse.json({ error, provider, status }, { status: httpStatus(status) });
}

async function readGenerateBody(
  request: NextRequest,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; error: string; status: number }> {
  const headerLen = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(headerLen) && headerLen > GENERATION_REQUEST_MAX_BYTES) {
    return { ok: false, error: PAYLOAD_TOO_LARGE_FR, status: 413 };
  }
  let text: string;
  try {
    text = await request.text();
  } catch (err) {
    return {
      ok: false,
      error: userFacingGenerateError(err),
      status: isOversizedGenerateError(err) ? 413 : 400,
    };
  }
  if (text.length > GENERATION_REQUEST_MAX_BYTES) {
    return { ok: false, error: PAYLOAD_TOO_LARGE_FR, status: 413 };
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "Requête de génération invalide.", status: 400 };
    }
    return { ok: true, body: parsed as Record<string, unknown> };
  } catch (err) {
    return {
      ok: false,
      error: userFacingGenerateError(err),
      status: isOversizedGenerateError(err) ? 413 : 400,
    };
  }
}

function parseProviderJson(raw: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "Réponse du fournisseur tronquée ou illisible." };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, error: "Réponse du fournisseur tronquée ou illisible." };
  }
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  let modelUsed = "unknown";
  let promptForLog: string | null = null;
  let projectIdForLog: string | null = null;
  let logProvider = "openrouter";
  try {
    const settings = getTypedSettings();
    const parsed = await readGenerateBody(request);
    if (!parsed.ok) {
      console.error("[generate] failed", parsed.error);
      debugLog(
        "generate",
        "failed",
        { projectId: projectIdForLog, model: modelUsed, provider: logProvider, status: parsed.status, error: parsed.error },
        "error",
      );
      return generationErrorJson(parsed.error, parsed.status, logProvider);
    }
    const body = parsed.body;
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const negativePrompt = typeof body.negativePrompt === "string" ? body.negativePrompt : "";
    const rawFaceImages = body.faceImages;
    const rawEditImages = body.editImages;
    const rawReferenceImages = body.referenceImages;
    const rawLogos = body.logos;
    const rawSketchImages = body.sketchImages;
    const aspectRatio = typeof body.aspectRatio === "string" ? body.aspectRatio : "16x9";
    const requestedModel = typeof body.model === "string" ? body.model : "";
    const imageSize = body.imageSize;
    const projectId = body.projectId ?? null;
    projectIdForLog = typeof projectId === "string" && projectId.trim() ? projectId.trim() : null;
    promptForLog = prompt || null;

    if (requestedModel && !MODEL_SLUGS[requestedModel]) {
      const error = `Modèle inconnu: ${requestedModel}`;
      debugLog("generate", "unknown model", { requestedModel, projectId: projectIdForLog }, "error");
      return generationErrorJson(error, 400, logProvider);
    }
    const model = requestedModel && MODEL_SLUGS[requestedModel] ? requestedModel : DEFAULT_IMAGE_MODEL;
    if (!requestedModel) {
      debugLog(
        "generate",
        "model fallback",
        { requested: null, model, reason: "omitted" },
        "warn",
      );
    }
    const orSlug = MODEL_SLUGS[model];
    modelUsed = model;
    const resolution: ImageResolution = isImageResolution(imageSize) ? imageSize : settings.defaultResolution;

    const openaiKey = settings.openaiApiKey;
    const useNativeOpenAI = Boolean(openaiKey && isOpenAINativeModel(model));
    logProvider = useNativeOpenAI ? "openai" : "openrouter";

    if (!useNativeOpenAI && !settings.openrouterApiKey) {
      const error = isOpenAINativeModel(model)
        ? "Clé API OpenAI ou OpenRouter non configurée. Ajoute-la dans Réglages."
        : "Clé API OpenRouter non configurée. Ajoute-la dans Réglages.";
      debugLog(
        "generate",
        "error",
        { projectId: projectIdForLog, model, provider: logProvider, status: 500, error },
        "error",
      );
      return generationErrorJson(error, 500, logProvider);
    }

    const rawLogosList = (Array.isArray(rawLogos) ? rawLogos : []).filter(
      (logo: unknown): logo is { image: string; label?: string } =>
        typeof logo === "object" && logo !== null && typeof (logo as { image?: unknown }).image === "string",
    );
    let faceImages: string[];
    let editImages: string[];
    let referenceImages: string[];
    let logos: { image: string; label?: string }[];
    let sketchImages: string[];
    try {
      [faceImages, editImages, referenceImages, logos, sketchImages] = await Promise.all([
        resolveGenerationImageUrls(asStringArray(rawFaceImages)),
        resolveGenerationImageUrls(asStringArray(rawEditImages)),
        resolveGenerationImageUrls(asStringArray(rawReferenceImages)),
        Promise.all(
          rawLogosList.map(async (logo) => ({
            image: await resolveGenerationImageUrl(logo.image),
            label: logo.label,
          })),
        ),
        // One composition sketch at most: it is a layout guide, not a style or identity reference.
        resolveGenerationImageUrls(asStringArray(rawSketchImages).slice(0, 1)),
      ]);
    } catch (err) {
      const error = userFacingGenerateError(err);
      debugLog(
        "generate",
        "error",
        { projectId: projectIdForLog, model, provider: logProvider, error, status: 400 },
        "error",
      );
      return generationErrorJson(error, 400, logProvider);
    }

    // Adjust: generated thumb first (primary edit source). Scratch: identity first.
    // Then logos, layout-only refs, one sketch — the prompt names each slot.
    const planned = planGenerationReferences({
      editImages,
      faceImages,
      logos,
      referenceImages,
      sketchImages,
    });
    let inputReferences: string[];
    try {
      inputReferences = await transcodeReferenceImages(planned.urls);
    } catch (err) {
      const error = userFacingGenerateError(err);
      debugLog(
        "generate",
        "error",
        { projectId: projectIdForLog, model, provider: logProvider, error, status: 400 },
        "error",
      );
      logGeneration({
        provider: logProvider,
        model: modelUsed,
        endpoint: "generate",
        timeMs: Date.now() - start,
        imageCount: 0,
        prompt: promptForLog,
        projectId: projectIdForLog,
        status: "error",
        errorMessage: error,
      });
      return generationErrorJson(error, 400, logProvider);
    }
    const referenceEntries = planned.entries;
    const referenceCounts = countReferenceRoles(referenceEntries);
    debugLog("generate", "start", {
      projectId: projectIdForLog,
      model,
      provider: logProvider,
      resolution,
      promptChars: typeof prompt === "string" ? prompt.length : 0,
      ...referenceCounts,
    });

    if (!prompt && inputReferences.length === 0) {
      return NextResponse.json({ error: "Connect a prompt, face reference, or reference thumbnail" }, { status: 400 });
    }

    let fullPrompt = applyReferenceRolesToPrompt(prompt || "", referenceEntries);
    if (negativePrompt) fullPrompt += `\n\nAvoid: ${negativePrompt}`;

    if (useNativeOpenAI && openaiKey) {
      const files = decodeOpenAIReferenceImages(inputReferences);
      if ("error" in files) {
        debugLog(
          "generate",
          "error",
          { projectId: projectIdForLog, model, provider: "openai", error: files.error, status: 400 },
          "error",
        );
        logGeneration({
          provider: "openai",
          model: modelUsed,
          endpoint: "generate",
          timeMs: Date.now() - start,
          imageCount: 0,
          prompt: promptForLog,
          projectId: projectIdForLog,
          status: "error",
          errorMessage: files.error,
        });
        return generationErrorJson(files.error, 400, "openai");
      }

      const native = await generateOpenAINative({
        apiKey: openaiKey,
        modelId: model,
        prompt: fullPrompt,
        size: openaiNativeSize(model, String(aspectRatio), resolution),
        files,
      });

      if (!native.ok) {
        const canFallback = shouldFallbackToOpenRouter(native) && Boolean(settings.openrouterApiKey);
        if (canFallback) {
          debugLog(
            "generate",
            "openai fallback",
            {
              projectId: projectIdForLog,
              model,
              provider: "openrouter",
              status: native.status,
              error: native.error,
            },
            "warn",
          );
          logProvider = "openrouter";
        } else {
          const credit = isOpenAICreditOrAuthFailure(native.status, native.error);
          const error = credit
            ? userFacingOpenAICreditOrAuthError(native.status, native.error)
            : userFacingGenerateError(native.error);
          console.error("[generate] OpenAI HTTP", { status: native.status, error });
          debugLog(
            "generate",
            "HTTP error",
            { projectId: projectIdForLog, model, provider: "openai", status: native.status, error },
            "error",
          );
          logGeneration({
            provider: "openai",
            model: modelUsed,
            endpoint: "generate",
            timeMs: Date.now() - start,
            imageCount: 0,
            prompt: promptForLog,
            projectId: projectIdForLog,
            status: "error",
            errorMessage: error,
          });
          return generationErrorJson(error, native.status, "openai");
        }
      } else {
        const images: string[] = [];
        const imageIds: string[] = [];
        for (const item of native.images) {
          const { id, url } = saveGeneratedImage(`data:${item.mediaType};base64,${item.b64}`, projectIdForLog);
          images.push(url);
          imageIds.push(id);
        }

        logGeneration({
          provider: "openai",
          model,
          endpoint: "generate",
          timeMs: Date.now() - start,
          imageCount: images.length,
          inputTokens: native.usage.inputTokens,
          outputTokens: native.usage.outputTokens,
          totalTokens: native.usage.totalTokens,
          prompt: promptForLog,
          projectId: projectIdForLog,
          generatedImageIds: imageIds,
        });

        debugLog("generate", "ok", {
          projectId: projectIdForLog,
          model,
          provider: "openai",
          images: images.length,
          ms: Date.now() - start,
        });

        return NextResponse.json({
          images,
          stats: {
            inputTokens: native.usage.inputTokens,
            outputTokens: native.usage.outputTokens,
            totalTokens: native.usage.totalTokens,
            model,
          },
        });
      }
    }

    const OPENROUTER_API_KEY = settings.openrouterApiKey;
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: orSlug,
        prompt: fullPrompt,
        n: 1,
        aspect_ratio: mapAspectRatio(aspectRatio),
        resolution,
        ...(inputReferences.length > 0
          ? { input_references: inputReferences.map((url) => ({ type: "image_url", image_url: { url } })) }
          : {}),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[generate] OpenRouter HTTP", { status: res.status, detailChars: errText.length });
      const detail = extractProviderErrorDetail(errText);
      const errorMessage = userFacingGenerateError(
        detail ? `OpenRouter API error: ${res.status} — ${detail}` : `OpenRouter API error: ${res.status}`,
      );
      debugLog(
        "generate",
        "HTTP error",
        { projectId: projectIdForLog, model, provider: "openrouter", status: res.status, error: errorMessage },
        "error",
      );
      logGeneration({
        provider: "openrouter",
        model: modelUsed,
        endpoint: "generate",
        timeMs: Date.now() - start,
        imageCount: 0,
        prompt: promptForLog,
        projectId: projectIdForLog,
        status: "error",
        errorMessage,
      });
      return generationErrorJson(errorMessage, res.status, "openrouter");
    }

    const raw = await res.text();
    const parsedProvider = parseProviderJson(raw);
    if (!parsedProvider.ok) {
      debugLog(
        "generate",
        "failed",
        {
          projectId: projectIdForLog,
          model,
          provider: "openrouter",
          status: 502,
          error: parsedProvider.error,
        },
        "error",
      );
      logGeneration({
        provider: "openrouter",
        model: modelUsed,
        endpoint: "generate",
        timeMs: Date.now() - start,
        imageCount: 0,
        prompt: promptForLog,
        projectId: projectIdForLog,
        status: "error",
        errorMessage: parsedProvider.error,
      });
      return generationErrorJson(parsedProvider.error, 502, "openrouter");
    }
    const result = parsedProvider.value as {
      data?: Array<{ b64_json?: string; media_type?: string }>;
      usage?: Record<string, number>;
    };
    const images: string[] = [];
    const imageIds: string[] = [];

    for (const item of result.data || []) {
      if (item.b64_json) {
        const mime = item.media_type || "image/png";
        const { id, url } = saveGeneratedImage(`data:${mime};base64,${item.b64_json}`, projectIdForLog);
        images.push(url);
        imageIds.push(id);
      }
    }

    if (images.length === 0) {
      const error = GENERATE_EMPTY_FR;
      debugLog(
        "generate",
        "failed",
        { projectId: projectIdForLog, model, provider: "openrouter", status: 502, error },
        "error",
      );
      logGeneration({
        provider: "openrouter",
        model: modelUsed,
        endpoint: "generate",
        timeMs: Date.now() - start,
        imageCount: 0,
        prompt: promptForLog,
        projectId: projectIdForLog,
        status: "error",
        errorMessage: error,
      });
      return generationErrorJson(error, 502, "openrouter");
    }

    const usage = result.usage || {};
    const stats = {
      inputTokens: usage.prompt_tokens || 0,
      outputTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
      model,
    };

    logGeneration({
      provider: "openrouter",
      model,
      endpoint: "generate",
      timeMs: Date.now() - start,
      imageCount: images.length,
      inputTokens: stats.inputTokens,
      outputTokens: stats.outputTokens,
      totalTokens: stats.totalTokens,
      prompt: promptForLog,
      projectId: projectIdForLog,
      generatedImageIds: imageIds,
    });

    debugLog("generate", "ok", {
      projectId: projectIdForLog,
      model,
      provider: "openrouter",
      images: images.length,
      ms: Date.now() - start,
    });

    return NextResponse.json({ images, stats });
  } catch (err) {
    const error = userFacingGenerateError(err);
    console.error("[generate] failed", error);
    debugLog(
      "generate",
      "failed",
      { projectId: projectIdForLog, model: modelUsed, provider: logProvider, status: 500, error },
      "error",
    );
    try {
      logGeneration({
        provider: logProvider,
        model: modelUsed,
        endpoint: "generate",
        timeMs: Date.now() - start,
        imageCount: 0,
        prompt: promptForLog,
        projectId: projectIdForLog,
        status: "error",
        errorMessage: error,
      });
    } catch {
      // A locked DB must not hide the real generate error.
    }
    return generationErrorJson(error, 500, logProvider);
  }
}
