import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import { saveGeneratedImage } from "@/lib/generated-images";
import { logGeneration } from "@/lib/generations-log";

const DEFAULT_MODEL = "gemini-3-pro-image";
const ALLOWED_MODELS = [
  "gemini-2.5-flash-image",
  "gemini-3.1-flash-lite-image",
  "gemini-3.1-flash-image",
  "gemini-3-pro-image",
];

// Per-model reference-image caps, from Google's docs + DeepMind model cards
// (Sept 2026). Pro/Flash break the 14-image ceiling into sub-quotas by role;
// exceeding a sub-quota degrades fidelity rather than erroring, so we trim
// instead of rejecting. "objects" covers our logo + sketch inputs, "characters"
// covers face refs, "style" covers the reference-thumbnail (style/composition) input.
// gemini-2.5-flash-image (older, non-Gemini-3 model) isn't documented for this —
// kept conservative.
const REFERENCE_CAPS: Record<string, { objects: number; characters: number; style: number }> = {
  "gemini-3-pro-image": { objects: 6, characters: 5, style: 3 },
  "gemini-3.1-flash-image": { objects: 10, characters: 4, style: 3 },
  "gemini-3.1-flash-lite-image": { objects: 14, characters: 0, style: 0 },
  "gemini-2.5-flash-image": { objects: 6, characters: 3, style: 2 },
};

function capImages<T>(images: T[], max: number, label: string): T[] {
  if (images.length <= max) return images;
  console.warn(`[generate] trimming ${label}: ${images.length} → ${max} (model cap)`);
  return images.slice(0, max);
}

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
  let modelUsed = "gemini-3-pro-image";
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
      faceImages: rawFaceImages = [],
      referenceImages: rawReferenceImages = [],
      logos: rawLogos = [],
      sketchImages: rawSketchImages = [],
      aspectRatio = "16x9",
      imageSize = "2K",
      model: requestedModel,
    } = body;

    const model = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : DEFAULT_MODEL;
    modelUsed = model;
    promptForLog = prompt || null;
    const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    if (!prompt && rawFaceImages.length === 0 && rawReferenceImages.length === 0 && rawSketchImages.length === 0) {
      return NextResponse.json({ error: "Connect a prompt, face reference, or reference thumbnail" }, { status: 400 });
    }

    // Trim to the model's per-role reference caps (see REFERENCE_CAPS above) —
    // degrades gracefully instead of overloading the model with more refs than
    // it can reliably hold identity/style for.
    const caps = REFERENCE_CAPS[model] ?? REFERENCE_CAPS["gemini-3-pro-image"];
    const faceImages: string[] = capImages(rawFaceImages, caps.characters, "faceImages");
    const referenceImages: string[] = capImages(rawReferenceImages, caps.style, "referenceImages");
    const logos: { image: string; label: string }[] = capImages(rawLogos, caps.objects, "logos");
    const sketchImages: string[] = capImages(rawSketchImages, 1, "sketchImages");

    // Build the parts array: text first, then reference images ordered
    // objects → characters → style → layout guide, per Google's multi-reference
    // prompting guidance (references should be ordered logically so the model
    // weighs identity-critical inputs correctly).
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

    // Add logo images with their labels ("object" refs — go first)
    if (hasLogo) {
      for (const logo of logos) {
        parts.push({ text: `LOGO TO INCLUDE — "${logo.label}":` });
        const { mimeType, data } = stripDataUrl(logo.image);
        parts.push({ inline_data: { mime_type: mimeType, data } });
      }
    }

    // Add face reference images ("character" refs — identity-critical, go next)
    if (hasFace) {
      parts.push({ text: "FACE REFERENCE:" });
      for (const img of faceImages) {
        const { mimeType, data } = stripDataUrl(img);
        parts.push({ inline_data: { mime_type: mimeType, data } });
      }
    }

    // Add reference thumbnails ("style" refs — go after characters)
    if (hasRef) {
      parts.push({ text: "REFERENCE THUMBNAIL:" });
      for (const img of referenceImages) {
        const { mimeType, data } = stripDataUrl(img);
        parts.push({ inline_data: { mime_type: mimeType, data } });
      }
    }

    // Add sketch images (layout guide — not an identity/style ref, goes last)
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
          imageSize: imageSize === "4K" ? "4K" : "2K",
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
