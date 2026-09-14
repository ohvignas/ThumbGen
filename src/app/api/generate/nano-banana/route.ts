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

type FaceGroup = { label: string; images: string[] };
type FaceGroupTrim = { label: string; kept: number; total: number };

// Fit face groups (one entry per connected faceReference node — a Personnage
// contributes one group with up to 3 angle images) into the model's total
// character-reference budget. Larger (multi-angle) groups are tried first so
// a persona is more likely to survive intact than get squeezed out by
// several loose single-image face refs; "front" stays first within a group
// since callers build group.images in [front, left, right] order. Any group
// that ends up with fewer images than it started with — whether trimmed to
// 1 or dropped to 0 — is reported in the returned `trims` array so the
// caller can warn the user instead of only logging server-side.
function fitFaceGroups(groups: FaceGroup[], maxTotal: number): { kept: FaceGroup[]; trims: FaceGroupTrim[] } {
  const ordered = groups
    .map((g, i) => ({ ...g, originalIndex: i }))
    .sort((a, b) => b.images.length - a.images.length || a.originalIndex - b.originalIndex);

  let remaining = maxTotal;
  const kept: (FaceGroup & { originalIndex: number })[] = [];
  const trims: FaceGroupTrim[] = [];
  for (const g of ordered) {
    const keepCount = Math.min(g.images.length, Math.max(0, remaining));
    if (keepCount < g.images.length) {
      trims.push({ label: g.label, kept: keepCount, total: g.images.length });
      console.warn(`[generate] trimming face group "${g.label}": ${g.images.length} → ${keepCount} (model cap)`);
    }
    if (keepCount > 0) {
      kept.push({ ...g, images: g.images.slice(0, keepCount) });
      remaining -= keepCount;
    }
  }
  // Restore original connection order for the prompt (priority sort above was
  // only to decide what survives, not the order it's presented in).
  kept.sort((a, b) => a.originalIndex - b.originalIndex);
  return { kept, trims };
}

function modelLabelFor(model: string): string {
  const labels: Record<string, string> = {
    "gemini-3-pro-image": "Gemini 3 Pro",
    "gemini-3.1-flash-image": "Gemini 3.1 Flash",
    "gemini-3.1-flash-lite-image": "Gemini 3.1 Flash Lite",
    "gemini-2.5-flash-image": "Gemini 2.5 Flash",
  };
  return labels[model] || model;
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
      faceGroups: rawFaceGroups,
      faceImages: legacyFaceImages = [],
      referenceImages: rawReferenceImages = [],
      logos: rawLogos = [],
      sketchImages: rawSketchImages = [],
      aspectRatio = "16x9",
      imageSize = "2K",
      model: requestedModel,
    } = body;

    // Prefer the grouped shape (one group per connected faceReference node,
    // so a Personnage's 2-3 angles stay tagged as "same identity"); fall back
    // to a flat legacy faceImages[] with each image as its OWN group — these
    // are ungrouped single photos with no known relationship to each other,
    // so they must not be claimed as "same person, multiple angles".
    const faceGroupsInput: FaceGroup[] = Array.isArray(rawFaceGroups) && rawFaceGroups.length > 0
      ? rawFaceGroups.filter(
          (g): g is FaceGroup => !!g && typeof g.label === "string" && Array.isArray(g.images) && g.images.every((i: unknown) => typeof i === "string"),
        )
      : Array.isArray(legacyFaceImages)
        ? legacyFaceImages.filter((i: unknown): i is string => typeof i === "string").map((img) => ({ label: "Visage", images: [img] }))
        : [];

    const model = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : DEFAULT_MODEL;
    modelUsed = model;
    promptForLog = prompt || null;
    const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    if (!prompt && faceGroupsInput.length === 0 && rawReferenceImages.length === 0 && rawSketchImages.length === 0) {
      return NextResponse.json({ error: "Connect a prompt, face reference, or reference thumbnail" }, { status: 400 });
    }

    // Trim to the model's per-role reference caps (see REFERENCE_CAPS above) —
    // degrades gracefully instead of overloading the model with more refs than
    // it can reliably hold identity/style for.
    const caps = REFERENCE_CAPS[model] ?? REFERENCE_CAPS["gemini-3-pro-image"];
    const { kept: faceGroups, trims: faceGroupTrims } = fitFaceGroups(faceGroupsInput, caps.characters);
    const faceImages: string[] = faceGroups.flatMap((g) => g.images);
    const referenceImages: string[] = capImages(rawReferenceImages, caps.style, "referenceImages");
    const logos: { image: string; label: string }[] = capImages(rawLogos, caps.objects, "logos");
    const sketchImages: string[] = capImages(rawSketchImages, 1, "sketchImages");

    // Surfaced to the user — a Personnage silently dropped or partially
    // trimmed (e.g. Gemini 3.1 Flash Lite has a 0 character-reference
    // budget, or two face groups compete for a small budget) used to be
    // only a server-side console.warn, so the user got a stranger's face
    // with no explanation. Covers full drops (kept:0) and partial trims
    // (0 < kept < total) alike.
    const warnings: string[] = [];
    if (faceGroupsInput.length > 0 && caps.characters === 0) {
      warnings.push(
        `${modelLabelFor(model)} ne supporte pas les références de visage — le personnage connecté a été ignoré.`,
      );
    } else {
      for (const t of faceGroupTrims) {
        warnings.push(
          t.kept === 0
            ? `Limite de ${caps.characters} visage(s) atteinte pour ${modelLabelFor(model)} — "${t.label}" ignoré.`
            : `Limite de ${caps.characters} visage(s) atteinte pour ${modelLabelFor(model)} — "${t.label}" réduit à ${t.kept}/${t.total} angle(s).`,
        );
      }
    }

    // Build the parts array: text first, then reference images ordered
    // objects → characters → style → layout guide, per Google's multi-reference
    // prompting guidance (references should be ordered logically so the model
    // weighs identity-critical inputs correctly).
    const parts: Array<Record<string, unknown>> = [];

    const hasFace = faceImages.length > 0;
    const hasRef = referenceImages.length > 0;
    const hasLogo = logos.length > 0;
    const hasSketch = sketchImages.length > 0;
    // True when at least one face group is a Personnage's multiple angles of
    // one person, as opposed to several separate single-photo face refs —
    // this is what tells the model "these N images are ONE identity" rather
    // than N different people to blend together.
    const multiAngleGroups = faceGroups.filter((g) => g.images.length > 1);

    let fullPrompt = "";

    const userPrompt = prompt ? ` ${prompt}` : "";

    const multiAngleNote = multiAngleGroups.length > 0
      ? `\n\nIMPORTANT: Some FACE REFERENCE images are grouped as multiple angles (front / profile views) of the SAME single person — a character sheet, not different people. Use all angles within a group together to lock in that one person's identity; do not treat them as separate individuals.`
      : "";

    if (hasFace && hasRef) {
      // Both face + reference thumbnail — the main use case
      fullPrompt = `Generate a YouTube thumbnail image. Recreate the style, composition, layout, and color scheme of the REFERENCE THUMBNAIL provided below, but replace the person in it with the face from the FACE REFERENCE image(s).${userPrompt}\n\nIMPORTANT: The person in the generated image MUST have the exact face from the FACE REFERENCE — same facial structure, eye shape, jawline, skin tone, and hair. The overall thumbnail layout, background, text placement, and visual style should closely match the REFERENCE THUMBNAIL.${multiAngleNote}`;
    } else if (hasFace) {
      // Face only, no reference thumbnail
      fullPrompt = `Generate a YouTube thumbnail image featuring the person from the FACE REFERENCE image(s).${userPrompt}\n\nIMPORTANT: Preserve exact facial structure, eye shape, jawline, and skin texture from the FACE REFERENCE image(s).${multiAngleNote}`;
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

    // Add face reference images ("character" refs — identity-critical, go
    // next), one labeled block per group so multi-angle Personnage groups
    // are legible as a single identity rather than dumped as one flat list.
    for (const group of faceGroups) {
      const label = group.images.length > 1
        ? `FACE REFERENCE — "${group.label}", ${group.images.length} angles of the SAME person:`
        : `FACE REFERENCE — "${group.label}":`;
      parts.push({ text: label });
      for (const img of group.images) {
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

    return NextResponse.json({ images, stats, warnings: warnings.length > 0 ? warnings : undefined });
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
