import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import { saveGeneratedImage } from "@/lib/generated-images";

const ENDPOINT = "https://api.x.ai/v1/images/generations";

// Map our aspect ratios to Grok format
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
  try {
    const GROK_API_KEY = getSetting("grokApiKey");
    if (!GROK_API_KEY) {
      return NextResponse.json(
        { error: "Grok API Key non configurée. Ajoute-la dans Settings." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const {
      prompt,
      negativePrompt,
      faceImages = [],
      referenceImages = [],
      aspectRatio = "16x9",
    } = body;

    let fullPrompt = "Generate a YouTube thumbnail image.";
    if (prompt) fullPrompt += ` ${prompt}`;
    if (faceImages.length > 0) {
      fullPrompt += "\n\nThe provided reference images include face photos — the generated thumbnail must feature this exact person.";
    }
    if (referenceImages.length > 0) {
      fullPrompt += "\n\nUse the reference images as style and composition guides.";
    }
    if (negativePrompt) {
      fullPrompt += `\n\nAvoid: ${negativePrompt}`;
    }

    const grokBody: Record<string, unknown> = {
      model: "grok-imagine-image",
      prompt: fullPrompt,
      n: 1,
      aspect_ratio: mapAspectRatio(aspectRatio),
      resolution: "2k",
      response_format: "b64_json",
    };

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROK_API_KEY}`,
      },
      body: JSON.stringify(grokBody),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Grok API error:", errText);
      return NextResponse.json(
        { error: `Grok API error: ${res.status}` },
        { status: res.status }
      );
    }

    const result = await res.json();
    const images: string[] = [];

    for (const item of result.data || []) {
      if (item.b64_json) {
        const dataUrl = `data:image/png;base64,${item.b64_json}`;
        const { url } = saveGeneratedImage(dataUrl);
        images.push(url);
      } else if (item.url) {
        try {
          const imgRes = await fetch(item.url);
          const imgBuffer = await imgRes.arrayBuffer();
          const b64 = Buffer.from(imgBuffer).toString("base64");
          const { url } = saveGeneratedImage(`data:image/png;base64,${b64}`);
          images.push(url);
        } catch {
          console.error("Failed to download Grok image");
        }
      }
    }

    console.log(`[generate] model=grok-imagine-image | images generated: ${images.length}`);
    return NextResponse.json({ images });
  } catch (err) {
    console.error("Grok generation error:", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
