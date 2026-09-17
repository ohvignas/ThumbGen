import { NextRequest, NextResponse } from "next/server";
import { getTypedSettings } from "@/lib/settings";
import { isImageResolution, MODEL_SLUGS } from "@/lib/image-models";
import { saveGeneratedImage } from "@/lib/generated-images";
import { logGeneration } from "@/lib/generations-log";

// OpenRouter's Unified Image API (launched June 2026) — one key, one request
// shape, routes to 30+ models across 8 providers. This is now the ONLY
// image-generation path in the app (direct Gemini/OpenAI keys, Ideogram,
// and Grok routes are no longer used from the client) — verified live
// against the real API on 2026-09-15 which of ThumbGen's model ids have a
// working OpenRouter slug. Reuses the same openrouterApiKey already
// configured for the chat agent — no new setting needed.
const ENDPOINT = "https://openrouter.ai/api/v1/images";

// The id → OpenRouter slug map lives in src/lib/image-models.ts. Ideogram,
// Grok and gpt-image-1.5 have no OpenRouter equivalent and are absent from it.

const DEFAULT_MODEL = "bytedance-seed/seedream-4.5";

// Keep the surfaced error readable in a node's error bubble and avoid
// leaking an unexpectedly huge provider response into the UI/logs.
const MAX_ERROR_DETAIL_LENGTH = 300;

// OpenRouter error bodies are JSON shaped like { error: { message, code } }
// when the request itself was rejected (e.g. an unsupported resolution for
// a given model). Some failures (gateway timeouts, WAF blocks) return an
// HTML or plain-text body instead — those have no `error.message` to pull.
function extractOpenRouterErrorDetail(rawBody: string): string | null {
  try {
    const parsed = JSON.parse(rawBody);
    const message = parsed?.error?.message;
    if (typeof message === "string" && message.trim()) {
      const trimmed = message.trim();
      return trimmed.length > MAX_ERROR_DETAIL_LENGTH
        ? `${trimmed.slice(0, MAX_ERROR_DETAIL_LENGTH)}…`
        : trimmed;
    }
  } catch {
    // Non-JSON body — no detail to extract, fall back to the status code.
  }
  return null;
}

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

export async function POST(request: NextRequest) {
  const start = Date.now();
  let modelUsed = DEFAULT_MODEL;
  let promptForLog: string | null = null;
  try {
    const settings = getTypedSettings();
    const OPENROUTER_API_KEY = settings.openrouterApiKey;
    if (!OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: "Clé API OpenRouter non configurée. Ajoute-la dans Réglages." },
        { status: 500 },
      );
    }

    const body = await request.json();
    const {
      prompt,
      negativePrompt,
      faceImages = [],
      referenceImages = [],
      logos: rawLogos = [],
      sketchImages: rawSketchImages = [],
      aspectRatio = "16x9",
      model: requestedModel,
      imageSize,
      projectId = null,
    } = body;

    const model = requestedModel && MODEL_SLUGS[requestedModel] ? requestedModel : DEFAULT_MODEL;
    const orSlug = MODEL_SLUGS[model];
    modelUsed = model;
    promptForLog = prompt || null;
    // A node without its own resolution (older nodes, agent-built workflows)
    // uses the Réglages default instead of a hard-coded 2K.
    const resolution = isImageResolution(imageSize) ? imageSize : settings.defaultResolution;

    const logos = (Array.isArray(rawLogos) ? rawLogos : []).filter(
      (logo: unknown): logo is { image: string; label?: string } =>
        typeof logo === "object" && logo !== null && typeof (logo as { image?: unknown }).image === "string",
    );
    // One composition sketch at most: it is a layout guide, not a style or identity reference.
    const sketchImages: string[] = (Array.isArray(rawSketchImages) ? rawSketchImages : [])
      .filter((sketch: unknown): sketch is string => typeof sketch === "string")
      .slice(0, 1);

    // Order matters: the prompt below points at images by position.
    const inputReferences: string[] = [
      ...faceImages,
      ...logos.map((logo) => logo.image),
      ...referenceImages,
      ...sketchImages,
    ];

    if (!prompt && inputReferences.length === 0) {
      return NextResponse.json({ error: "Connect a prompt, face reference, or reference thumbnail" }, { status: 400 });
    }

    let fullPrompt = prompt || "Generate a YouTube thumbnail image.";
    if (faceImages.length > 0) {
      fullPrompt += `\n\nIMPORTANT: The first ${faceImages.length} reference image(s) show the person's face — the generated thumbnail must feature this exact person, same facial structure and features across all provided angles.`;
    }
    if (logos.length > 0) {
      const first = faceImages.length + 1;
      const last = faceImages.length + logos.length;
      const which = first === last ? `Reference image ${first} is a logo` : `Reference images ${first} to ${last} are logos`;
      const names = logos.map((logo) => logo.label || "Logo").join(", ");
      fullPrompt += `\n\nIMPORTANT: ${which} to include in the thumbnail: ${names}. Place each logo visibly and keep it recognizable — not distorted or blended into the background.`;
    }
    if (sketchImages.length > 0) {
      fullPrompt += `\n\nIMPORTANT: The last reference image is a rough COMPOSITION SKETCH. Match its layout and where elements are placed, not its hand-drawn style — the result must look polished and professional.`;
    }
    if (negativePrompt) fullPrompt += `\n\nAvoid: ${negativePrompt}`;

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
      console.error("OpenRouter image API error:", errText);
      const detail = extractOpenRouterErrorDetail(errText);
      const errorMessage = detail
        ? `OpenRouter API error: ${res.status} — ${detail}`
        : `OpenRouter API error: ${res.status}`;
      logGeneration({
        provider: "openrouter", model: modelUsed, endpoint: "generate",
        timeMs: Date.now() - start, imageCount: 0,
        prompt: promptForLog, status: "error",
        errorMessage,
      });
      return NextResponse.json({ error: errorMessage }, { status: res.status });
    }

    const result = await res.json();
    const images: string[] = [];
    const imageIds: string[] = [];

    for (const item of result.data || []) {
      if (item.b64_json) {
        const mime = item.media_type || "image/png";
        const { id, url } = saveGeneratedImage(`data:${mime};base64,${item.b64_json}`, projectId);
        images.push(url);
        imageIds.push(id);
      }
    }

    const usage = result.usage || {};
    const stats = {
      inputTokens: usage.prompt_tokens || 0,
      outputTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
      model,
    };

    logGeneration({
      provider: "openrouter", model, endpoint: "generate",
      timeMs: Date.now() - start, imageCount: images.length,
      inputTokens: stats.inputTokens, outputTokens: stats.outputTokens, totalTokens: stats.totalTokens,
      prompt: promptForLog, generatedImageIds: imageIds,
    });

    return NextResponse.json({ images, stats });
  } catch (err) {
    console.error("OpenRouter image generation error:", err);
    logGeneration({
      provider: "openrouter", model: modelUsed, endpoint: "generate",
      timeMs: Date.now() - start, imageCount: 0,
      prompt: promptForLog, status: "error",
      errorMessage: err instanceof Error ? err.message : "Generation failed",
    });
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
