import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import { saveGeneratedImage } from "@/lib/generated-images";

const ENDPOINT = "https://api.ideogram.ai/v1/ideogram-v3/edit";

function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string } {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  const mimeType = match?.[1] || "image/jpeg";
  const data = match?.[2] || dataUrl;
  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  return { blob: new Blob([bytes], { type: mimeType }), ext };
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
      image,
      mask,
      characterReferenceImage,
      renderingSpeed = "DEFAULT",
      styleType = "GENERAL",
    } = body;

    if (!prompt || !image) {
      return NextResponse.json({ error: "Prompt and image are required" }, { status: 400 });
    }

    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("rendering_speed", renderingSpeed);
    formData.append("style_type", styleType);
    formData.append("magic_prompt", "AUTO");
    formData.append("num_images", "1");

    // Source image
    const { blob: imgBlob, ext: imgExt } = dataUrlToBlob(image);
    formData.append("image", imgBlob, `source.${imgExt}`);

    // Mask (if provided)
    if (mask) {
      const { blob: maskBlob, ext: maskExt } = dataUrlToBlob(mask);
      formData.append("mask", maskBlob, `mask.${maskExt}`);
    }

    // Character reference
    if (characterReferenceImage) {
      const { blob, ext } = dataUrlToBlob(characterReferenceImage);
      formData.append("character_reference_images", blob, `face.${ext}`);
    }

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Api-Key": IDEOGRAM_API_KEY },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Ideogram Edit API error:", errText);
      return NextResponse.json(
        { error: `Ideogram Edit error: ${res.status}` },
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
          console.error("Failed to download edited image");
        }
      }
    }

    return NextResponse.json({ images });
  } catch (err) {
    console.error("Ideogram edit error:", err);
    return NextResponse.json({ error: "Edit failed" }, { status: 500 });
  }
}
