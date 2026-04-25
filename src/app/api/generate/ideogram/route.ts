import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import { saveGeneratedImage } from "@/lib/generated-images";
import { logGeneration } from "@/lib/generations-log";
const ENDPOINT = "https://api.ideogram.ai/v1/ideogram-v3/generate";

function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string } {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  const mimeType = match?.[1] || "image/jpeg";
  const data = match?.[2] || dataUrl;
  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  return { blob: new Blob([bytes], { type: mimeType }), ext };
}

// Ideogram v3 accepts aspect ratios in "WxH" format directly (e.g. "16x9")
const VALID_RATIOS = new Set(["1x1", "1x2", "1x3", "2x1", "2x3", "3x1", "3x2", "3x4", "4x3", "4x5", "5x4", "9x16", "16x9", "10x16", "16x10"]);

function normalizeAspectRatio(ratio: string): string {
  return VALID_RATIOS.has(ratio) ? ratio : "16x9";
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  let promptForLog: string | null = null;
  try {
    const IDEOGRAM_API_KEY = getSetting("ideogramApiKey");
    if (!IDEOGRAM_API_KEY) {
      return NextResponse.json({ error: "IDEOGRAM_API_KEY not configured. Add it in Settings." }, { status: 500 });
    }

    const body = await request.json();
    const {
      prompt,
      negativePrompt,
      characterReferenceImage,
      styleReferenceImages = [],
      aspectRatio = "16x9",
      renderingSpeed = "DEFAULT",
      styleType = "GENERAL",
    } = body;

    // Ideogram requires a prompt string, so provide a default when images are connected
    const effectivePrompt = prompt || "Recreate this YouTube thumbnail with the referenced person and style";
    promptForLog = prompt || null;

    const formData = new FormData();
    formData.append("prompt", effectivePrompt);
    if (negativePrompt) formData.append("negative_prompt", negativePrompt);
    formData.append("aspect_ratio", normalizeAspectRatio(aspectRatio));
    formData.append("rendering_speed", renderingSpeed);
    formData.append("style_type", styleType);
    formData.append("magic_prompt", "AUTO");
    formData.append("num_images", "1");

    // Add character reference image
    if (characterReferenceImage) {
      const { blob, ext } = dataUrlToBlob(characterReferenceImage);
      formData.append("character_reference_images", blob, `face.${ext}`);
    }

    // Add style reference images
    for (let i = 0; i < styleReferenceImages.length && i < 3; i++) {
      const { blob, ext } = dataUrlToBlob(styleReferenceImages[i]);
      formData.append("style_reference_images", blob, `style_${i}.${ext}`);
    }

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Api-Key": IDEOGRAM_API_KEY },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Ideogram API error:", errText);
      logGeneration({
        provider: "ideogram", model: "ideogram", endpoint: "generate",
        timeMs: Date.now() - start, imageCount: 0,
        prompt: promptForLog, status: "error",
        errorMessage: `Ideogram API error: ${res.status}`,
      });
      return NextResponse.json(
        { error: `Ideogram API error: ${res.status}` },
        { status: res.status }
      );
    }

    const result = await res.json();
    const images: string[] = [];
    const imageIds: string[] = [];

    for (const item of result.data || []) {
      if (item.url) {
        try {
          const imgRes = await fetch(item.url);
          const imgBuffer = await imgRes.arrayBuffer();
          const b64 = Buffer.from(imgBuffer).toString("base64");
          const dataUrl = `data:image/png;base64,${b64}`;
          const { id, url } = saveGeneratedImage(dataUrl);
          images.push(url);
          imageIds.push(id);
        } catch {
          console.error("Failed to download generated image");
        }
      }
    }

    logGeneration({
      provider: "ideogram", model: "ideogram", endpoint: "generate",
      timeMs: Date.now() - start, imageCount: images.length,
      prompt: promptForLog, generatedImageIds: imageIds,
    });
    return NextResponse.json({ images });
  } catch (err) {
    console.error("Ideogram generation error:", err);
    logGeneration({
      provider: "ideogram", model: "ideogram", endpoint: "generate",
      timeMs: Date.now() - start, imageCount: 0,
      prompt: promptForLog, status: "error",
      errorMessage: err instanceof Error ? err.message : "Generation failed",
    });
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
