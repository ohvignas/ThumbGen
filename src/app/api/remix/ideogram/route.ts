import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import { saveGeneratedImage } from "@/lib/generated-images";
const ENDPOINT = "https://api.ideogram.ai/v1/ideogram-v3/remix";

function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string } {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  const mimeType = match?.[1] || "image/jpeg";
  const data = match?.[2] || dataUrl;
  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  return { blob: new Blob([bytes], { type: mimeType }), ext };
}

const VALID_RATIOS = new Set(["1x1", "1x2", "1x3", "2x1", "2x3", "3x1", "3x2", "3x4", "4x3", "4x5", "5x4", "9x16", "16x9", "10x16", "16x10"]);

function normalizeAspectRatio(ratio: string): string {
  return VALID_RATIOS.has(ratio) ? ratio : "16x9";
}

export async function POST(request: NextRequest) {
  try {
    const IDEOGRAM_API_KEY = getSetting("ideogramApiKey");
    if (!IDEOGRAM_API_KEY) {
      return NextResponse.json({ error: "IDEOGRAM_API_KEY not configured. Add it in Settings." }, { status: 500 });
    }

    const body = await request.json();
    const {
      prompt,
      negativePrompt,
      image,
      imageWeight = 50,
      characterReferenceImage,
      styleReferenceImages = [],
      aspectRatio = "16x9",
      renderingSpeed = "DEFAULT",
      styleType = "GENERAL",
    } = body;

    if (!prompt || !image) {
      return NextResponse.json({ error: "Prompt and image are required" }, { status: 400 });
    }

    const formData = new FormData();
    formData.append("prompt", prompt);
    if (negativePrompt) formData.append("negative_prompt", negativePrompt);
    formData.append("image_weight", String(imageWeight));
    formData.append("aspect_ratio", normalizeAspectRatio(aspectRatio));
    formData.append("rendering_speed", renderingSpeed);
    formData.append("style_type", styleType);
    formData.append("magic_prompt", "AUTO");
    formData.append("num_images", "1");

    // Source image
    const { blob: imgBlob, ext: imgExt } = dataUrlToBlob(image);
    formData.append("image", imgBlob, `source.${imgExt}`);

    // Character reference
    if (characterReferenceImage) {
      const { blob, ext } = dataUrlToBlob(characterReferenceImage);
      formData.append("character_reference_images", blob, `face.${ext}`);
    }

    // Style references
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
      console.error("Ideogram Remix API error:", errText);
      return NextResponse.json(
        { error: `Ideogram Remix error: ${res.status}` },
        { status: res.status }
      );
    }

    const result = await res.json();
    const images: string[] = [];

    for (const item of result.data || []) {
      if (item.url) {
        try {
          const imgRes = await fetch(item.url);
          const imgBuf = await imgRes.arrayBuffer();
          const b64 = Buffer.from(imgBuf).toString("base64");
          const { url } = saveGeneratedImage(`data:image/png;base64,${b64}`);
          images.push(url);
        } catch {
          console.error("Failed to download remixed image");
        }
      }
    }

    return NextResponse.json({ images });
  } catch (err) {
    console.error("Ideogram remix error:", err);
    return NextResponse.json({ error: "Remix failed" }, { status: 500 });
  }
}
