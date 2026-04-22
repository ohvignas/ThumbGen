import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import { saveGeneratedImage } from "@/lib/generated-images";

const EDITS_ENDPOINT = "https://api.openai.com/v1/images/edits";
const GENERATIONS_ENDPOINT = "https://api.openai.com/v1/images/generations";

const ALLOWED_MODELS = ["gpt-image-2", "gpt-image-1.5", "gpt-image-1"];

// Map our aspect ratios to OpenAI sizes
// gpt-image-2 supports up to 3840px, custom sizes (multiples of 16)
function mapSize(ratio: string, model: string): string {
  if (model === "gpt-image-2") {
    const map: Record<string, string> = {
      "16x9": "1920x1088",  // ~16:9, multiples of 16, within limits
      "1x1": "1024x1024",
      "4x3": "1536x1152",
      "3x2": "1536x1024",
      "9x16": "1088x1920",
    };
    return map[ratio] || "1920x1088";
  }
  const map: Record<string, string> = {
    "16x9": "1536x1024",
    "1x1": "1024x1024",
    "4x3": "1536x1024",
    "3x2": "1536x1024",
    "9x16": "1024x1536",
  };
  return map[ratio] || "1536x1024";
}

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mimeType: string } {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  const mimeType = match?.[1] || "image/png";
  const data = match?.[2] || dataUrl;
  return { buffer: Buffer.from(data, "base64"), mimeType };
}

export async function POST(request: NextRequest) {
  try {
    const OPENAI_API_KEY = getSetting("openaiApiKey");
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API Key non configurée. Ajoute-la dans Settings." },
        { status: 500 }
      );
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

    const model = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : "gpt-image-2";
    const size = mapSize(aspectRatio, model);
    const allImages = [...faceImages, ...referenceImages];
    const hasLogo = logos.length > 0;
    const hasSketch = sketchImages.length > 0;

    // Add logo and sketch images to allImages for OpenAI
    for (const logo of logos as { image: string; label: string }[]) {
      allImages.push(logo.image);
    }
    for (const sketch of sketchImages) {
      allImages.push(sketch);
    }
    const hasImages = allImages.length > 0;

    let fullPrompt = "Generate a YouTube thumbnail image.";
    if (prompt) fullPrompt += ` ${prompt}`;
    if (faceImages.length > 0) {
      fullPrompt += "\n\nThe first image(s) provided are FACE REFERENCES — the generated thumbnail must feature this exact person's face.";
    }
    if (referenceImages.length > 0) {
      fullPrompt += "\n\nUse the reference image(s) as style and composition guides — match the layout, colors, and visual feel.";
    }
    if (hasLogo) {
      const logoNames = (logos as { image: string; label: string }[]).map((l) => l.label).join(", ");
      fullPrompt += `\n\nInclude the following logo(s) in the thumbnail: ${logoNames}. Place each logo visibly and clearly recognizable.`;
    }
    if (hasSketch) {
      fullPrompt += "\n\nA COMPOSITION SKETCH is provided. Use it as a LAYOUT GUIDE for element placement — do NOT reproduce the sketchy style, create a polished result.";
    }
    if (negativePrompt) {
      fullPrompt += `\n\nAvoid: ${negativePrompt}`;
    }

    console.log(`[generate] model=${model} | faces=${faceImages.length} refs=${referenceImages.length} logos=${logos.length} sketches=${sketchImages.length}`);

    let res: Response;

    if (hasImages) {
      // Use /images/edits when we have reference images
      const formData = new FormData();
      formData.append("model", model);
      formData.append("prompt", fullPrompt);
      formData.append("size", size);
      formData.append("quality", "high");
      formData.append("n", "1");

      for (const img of allImages) {
        const { buffer, mimeType } = dataUrlToBuffer(img);
        const ext = mimeType.includes("png") ? "png" : "jpg";
        const uint8 = new Uint8Array(buffer);
        const blob = new Blob([uint8], { type: mimeType });
        formData.append("image[]", blob, `ref.${ext}`);
      }

      res = await fetch(EDITS_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: formData,
      });
    } else {
      // Use /images/generations for text-only prompts
      res = await fetch(GENERATIONS_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          prompt: fullPrompt,
          n: 1,
          size,
          quality: "high",
        }),
      });
    }

    if (!res.ok) {
      const errText = await res.text();
      console.error("OpenAI API error:", errText);
      return NextResponse.json(
        { error: `OpenAI API error: ${res.status}` },
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
          console.error("Failed to download OpenAI image");
        }
      }
    }

    const usage = result.usage || {};
    const stats = {
      inputTokens: usage.input_tokens || usage.prompt_tokens || 0,
      outputTokens: usage.output_tokens || usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
      model,
    };

    console.log(`[generate] model=${model} | images generated: ${images.length} | tokens: ${stats.totalTokens}`);
    return NextResponse.json({ images, stats });
  } catch (err) {
    console.error("OpenAI generation error:", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
