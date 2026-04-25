import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import { saveGeneratedImage } from "@/lib/generated-images";
import { logGeneration } from "@/lib/generations-log";

const DEFAULT_MODEL = "gemini-3-pro-image-preview";
const ALLOWED_MODELS = [
  "gemini-2.5-flash-image",
  "gemini-3.1-flash-image-preview",
  "gemini-3-pro-image-preview",
];

function stripDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) return { mimeType: "image/jpeg", data: dataUrl };
  return { mimeType: match[1], data: match[2] };
}

// Map aspect ratios from our format to what Gemini supports
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
  let modelUsed = "gemini-3-pro-image-preview";
  let promptForLog: string | null = null;
  try {
    const GEMINI_API_KEY = getSetting("geminiApiKey");
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: "GEMINI_API_KEY not configured. Add it in Settings." }, { status: 500 });
    }

    const body = await request.json();
    const {
      prompt,
      negativePrompt,
      faceImages = [],
      referenceImages = [],
      logos = [],
      sketchImages = [],
      aspectRatio = "16x9",
      model: requestedModel,
    } = body;

    const model = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : DEFAULT_MODEL;
    modelUsed = model;
    promptForLog = prompt || null;
    const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    if (!prompt && faceImages.length === 0 && referenceImages.length === 0 && sketchImages.length === 0) {
      return NextResponse.json({ error: "Connect a prompt, face reference, or reference thumbnail" }, { status: 400 });
    }

    // Build the parts array: text first, then face images, then reference images
    // Gemini processes them in order, so labeling matters
    const parts: Array<Record<string, unknown>> = [];

    const hasFace = faceImages.length > 0;
    const hasRef = referenceImages.length > 0;
    const hasLogo = logos.length > 0;
    const hasSketch = sketchImages.length > 0;

    let fullPrompt = "";

    const userPrompt = prompt ? ` ${prompt}` : "";

    if (hasFace && hasRef) {
      // Both face + reference thumbnail — the main use case
      fullPrompt = `Generate a YouTube thumbnail image. Recreate the style, composition, layout, and color scheme of the REFERENCE THUMBNAIL provided below, but replace the person in it with the face from the FACE REFERENCE image(s).${userPrompt}\n\nIMPORTANT: The person in the generated image MUST have the exact face from the FACE REFERENCE — same facial structure, eye shape, jawline, skin tone, and hair. The overall thumbnail layout, background, text placement, and visual style should closely match the REFERENCE THUMBNAIL.`;
    } else if (hasFace) {
      // Face only, no reference thumbnail
      fullPrompt = `Generate a YouTube thumbnail image featuring the person from the FACE REFERENCE image(s).${userPrompt}\n\nIMPORTANT: Preserve exact facial structure, eye shape, jawline, and skin texture from the FACE REFERENCE image(s).`;
    } else if (hasRef) {
      // Reference thumbnail only, no face
      fullPrompt = `Generate a YouTube thumbnail image. Use the REFERENCE THUMBNAIL below as a style and composition guide — match its layout, colors, and visual feel.${userPrompt}`;
    } else {
      // Just a text prompt
      fullPrompt = `Generate a YouTube thumbnail image.${userPrompt}`;
    }

    if (hasLogo) {
      const logoNames = (logos as { image: string; label: string }[]).map((l) => l.label).join(", ");
      fullPrompt += `\n\nIMPORTANT: Include the following logo(s) in the thumbnail: ${logoNames}. Place each logo visibly — in a corner, beside the person, or integrated into the composition. Each logo must be clearly recognizable, well-positioned, and not distorted or blended into the background.`;
    }

    if (hasSketch) {
      fullPrompt += `\n\nIMPORTANT: A COMPOSITION SKETCH is provided below. This is a rough hand-drawn layout showing WHERE elements should be placed in the thumbnail. Use it as a LAYOUT AND COMPOSITION GUIDE — match the positioning and arrangement of elements. Do NOT reproduce the sketchy/hand-drawn style — create a polished, professional result. The sketch only shows placement, not the final visual quality.`;
    }

    if (negativePrompt) {
      fullPrompt += `\n\nAvoid: ${negativePrompt}`;
    }

    parts.push({ text: fullPrompt });

    console.log(`[generate] model=${model} | faces=${faceImages.length} refs=${referenceImages.length} logos=${logos.length} sketches=${sketchImages.length}`);
    console.log(`[generate] prompt: ${fullPrompt.substring(0, 300)}...`);

    // Add face reference images (labeled so Gemini knows which is which)
    if (hasFace) {
      parts.push({ text: "FACE REFERENCE:" });
      for (const img of faceImages) {
        const { mimeType, data } = stripDataUrl(img);
        parts.push({ inline_data: { mime_type: mimeType, data } });
      }
    }

    // Add reference thumbnails
    if (hasRef) {
      parts.push({ text: "REFERENCE THUMBNAIL:" });
      for (const img of referenceImages) {
        const { mimeType, data } = stripDataUrl(img);
        parts.push({ inline_data: { mime_type: mimeType, data } });
      }
    }

    // Add logo images with their labels
    if (hasLogo) {
      for (const logo of logos as { image: string; label: string }[]) {
        parts.push({ text: `LOGO TO INCLUDE — "${logo.label}":` });
        const { mimeType, data } = stripDataUrl(logo.image);
        parts.push({ inline_data: { mime_type: mimeType, data } });
      }
    }

    // Add sketch images (composition guide)
    if (hasSketch) {
      parts.push({ text: "COMPOSITION SKETCH (use as layout guide, NOT style reference):" });
      for (const img of sketchImages) {
        const { mimeType, data } = stripDataUrl(img);
        parts.push({ inline_data: { mime_type: mimeType, data } });
      }
    }

    const geminiBody = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {
          aspectRatio: mapAspectRatio(aspectRatio),
          imageSize: "2K",
        },
      },
    };

    const res = await fetch(`${ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Gemini API error:", errText);
      logGeneration({
        provider: "gemini", model: modelUsed, endpoint: "generate",
        timeMs: Date.now() - start, imageCount: 0,
        prompt: promptForLog, status: "error",
        errorMessage: `Gemini API error: ${res.status}`,
      });
      return NextResponse.json(
        { error: `Gemini API error: ${res.status}` },
        { status: res.status }
      );
    }

    const result = await res.json();
    const images: string[] = [];
    const imageIds: string[] = [];

    const candidates = result.candidates || [];
    for (const candidate of candidates) {
      const contentParts = candidate.content?.parts || [];
      for (const part of contentParts) {
        const imgData = part.inlineData || part.inline_data;
        if (imgData) {
          const b64 = imgData.data;
          const mime = imgData.mimeType || imgData.mime_type || "image/png";
          const dataUrl = `data:${mime};base64,${b64}`;
          const { id, url } = saveGeneratedImage(dataUrl);
          images.push(url);
          imageIds.push(id);
        }
      }
    }

    const usage = result.usageMetadata || {};
    const stats = {
      inputTokens: usage.promptTokenCount || 0,
      outputTokens: usage.candidatesTokenCount || 0,
      totalTokens: usage.totalTokenCount || 0,
      model,
    };

    logGeneration({
      provider: "gemini", model, endpoint: "generate",
      timeMs: Date.now() - start, imageCount: images.length,
      inputTokens: stats.inputTokens, outputTokens: stats.outputTokens, totalTokens: stats.totalTokens,
      prompt: promptForLog, generatedImageIds: imageIds,
    });

    return NextResponse.json({ images, stats });
  } catch (err) {
    console.error("Nano Banana generation error:", err);
    logGeneration({
      provider: "gemini", model: modelUsed, endpoint: "generate",
      timeMs: Date.now() - start, imageCount: 0,
      prompt: promptForLog, status: "error",
      errorMessage: err instanceof Error ? err.message : "Generation failed",
    });
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
