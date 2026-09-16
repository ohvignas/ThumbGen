import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import { MODEL_SLUGS } from "@/lib/image-models";
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
    const OPENROUTER_API_KEY = getSetting("openrouterApiKey");
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
      aspectRatio = "16x9",
      model: requestedModel,
      projectId = null,
    } = body;

    const model = requestedModel && MODEL_SLUGS[requestedModel] ? requestedModel : DEFAULT_MODEL;
    const orSlug = MODEL_SLUGS[model];
    modelUsed = model;
    promptForLog = prompt || null;

    const inputReferences: string[] = [...faceImages, ...referenceImages];

    if (!prompt && inputReferences.length === 0) {
      return NextResponse.json({ error: "Connect a prompt, face reference, or reference thumbnail" }, { status: 400 });
    }

    let fullPrompt = prompt || "Generate a YouTube thumbnail image.";
    if (faceImages.length > 0) {
      fullPrompt += `\n\nIMPORTANT: The first ${faceImages.length} reference image(s) show the person's face — the generated thumbnail must feature this exact person, same facial structure and features across all provided angles.`;
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
        resolution: "2K",
        ...(inputReferences.length > 0
          ? { input_references: inputReferences.map((url) => ({ type: "image_url", image_url: { url } })) }
          : {}),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("OpenRouter image API error:", errText);
      logGeneration({
        provider: "openrouter", model: modelUsed, endpoint: "generate",
        timeMs: Date.now() - start, imageCount: 0,
        prompt: promptForLog, status: "error",
        errorMessage: `OpenRouter API error: ${res.status}`,
      });
      return NextResponse.json({ error: `OpenRouter API error: ${res.status}` }, { status: res.status });
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
