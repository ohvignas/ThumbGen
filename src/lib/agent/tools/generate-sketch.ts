import { z } from "zod";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { logGeneration } from "@/lib/generations-log";
import { getCostPerImage } from "@/lib/model-costs";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";
import { resolveImageSource } from "./_helpers/image-source";

const InputSchema = z.object({
  prompt: z.string().min(1),
  aspect_ratio: z.enum(["16x9", "9x16", "1x1"]).optional(),
  style: z.enum(["pencil_sketch", "polished"]).optional(),
  // OPTIONAL: the user's Personnage, to bake their actual face into the sketch
  // (so the sketched person resembles them, not a generic person). Pass
  // `stored:persona_<id>` — its front angle is used.
  face_source: z.string().optional(),
  // OPTIONAL: extra reference images (logo, swipe-file, prior thumbnail) to
  // condition composition / brand. Pass an array of stored:/generated:/uploaded: refs.
  reference_sources: z.array(z.string()).optional(),
});

const ASPECT_MAP: Record<string, string> = { "16x9": "16:9", "9x16": "9:16", "1x1": "1:1" };
// Gemini 3.1 Flash Image: same price as 2.5 (MODEL_COSTS), better layouts and references.
const SKETCH_MODEL = "gemini-3.1-flash-image";
const OPENROUTER_SKETCH_SLUG = "google/gemini-3.1-flash-image";
const OPENROUTER_IMAGES_ENDPOINT = "https://openrouter.ai/api/v1/images";

const PENCIL_SUFFIX =
  " Render this as a hand-drawn rough pencil sketch on white paper — visible pencil strokes, simple line work, monochrome graphite, very rough proportions, no fine detail, working draft style. The goal is a sketch a designer would scribble on a notebook to communicate composition, not a polished render.";

export const generateSketchTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "generate_sketch",
  description:
    "Generates a fast, cheap draft thumbnail using Gemini Flash Image. Defaults to a HAND-DRAWN PENCIL SKETCH style (rough strokes, monochrome graphite on paper) — perfect for proposing layout/angle ideas without committing to a polished design. Pass style='polished' for a finished thumbnail render. ALWAYS pass `face_source: stored:persona_<id>` (the chosen Personnage) when the user's face is involved, so the sketched person actually resembles the user (otherwise you get a generic stranger). Optionally pass `reference_sources: [stored:lg_<id>, stored:sf_<id>]` to condition logo placement / composition. Returns a `generated:<id>` reference usable as a sketch node's image_source in apply_workflow. Aspect ratio defaults to 16x9.",
  inputSchema: InputSchema,
  handler: async ({ prompt, aspect_ratio, style, face_source, reference_sources }) => {
    const start = Date.now();
    const ratio = aspect_ratio ?? "16x9";
    const useStyle = style ?? "pencil_sketch";

    const apiKey = getSetting("openrouterApiKey");
    if (!apiKey) {
      return {
        isError: true,
        requestNotSent: true,
        content: [{ type: "text" as const, text: "Clé API OpenRouter non configurée. Ajoute-la dans Réglages." }],
      };
    }

    // Resolve image inputs (face + extra refs) → data URLs for OpenRouter's
    // input_references (each entry must be {type:"image_url", image_url:{url}}
    // — a bare string 400s, confirmed against the real API).
    const imageDataUrls: string[] = [];
    const sourcesToLoad: string[] = [];
    if (face_source) sourcesToLoad.push(face_source);
    if (reference_sources?.length) sourcesToLoad.push(...reference_sources);
    for (const src of sourcesToLoad) {
      try {
        const resolved = await resolveImageSource(src);
        imageDataUrls.push(`data:${resolved.mimeType};base64,${resolved.bytes.toString("base64")}`);
      } catch (e) {
        return {
          isError: true,
          requestNotSent: true,
          content: [{ type: "text" as const, text: `Cannot resolve image_source ${src}: ${(e as Error).message}` }],
        };
      }
    }

    // Instruct the model on what the attached images are for. Without this
    // preface Gemini may treat them as decorative input or ignore them.
    const prefaceParts: string[] = [];
    if (face_source) {
      prefaceParts.push(
        "Use the first attached image as a STRICT reference for the person's face — preserve their identity, facial features, hair, and skin tone exactly.",
      );
    }
    if (reference_sources?.length) {
      const refStart = face_source ? "next" : "attached";
      prefaceParts.push(
        `The ${refStart} image(s) are visual references (logos, brand assets, or composition inspiration) — incorporate them faithfully into the scene at the size and position described in the prompt.`,
      );
    }
    const preface = prefaceParts.length ? prefaceParts.join(" ") + " " : "";
    const stylized = useStyle === "pencil_sketch" ? `${prompt}${PENCIL_SUFFIX}` : prompt;
    const body = {
      model: OPENROUTER_SKETCH_SLUG,
      prompt: `Generate a YouTube thumbnail draft. ${preface}${stylized}`,
      n: 1,
      aspect_ratio: ASPECT_MAP[ratio],
      resolution: "1K",
      ...(imageDataUrls.length > 0
        ? { input_references: imageDataUrls.map((url) => ({ type: "image_url", image_url: { url } })) }
        : {}),
    };

    let res: Response;
    try {
      res = await fetch(OPENROUTER_IMAGES_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
    } catch (e) {
      // fetch threw: no response came back, the request was not billed.
      return {
        isError: true,
        requestNotSent: true,
        content: [{ type: "text" as const, text: `Network error: ${(e as Error).message}` }],
      };
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      logGeneration({
        provider: "openrouter",
        model: SKETCH_MODEL,
        endpoint: "generate",
        timeMs: Date.now() - start,
        imageCount: 0,
        prompt,
        status: "error",
        errorMessage: `OpenRouter ${res.status}: ${errText.slice(0, 200)}`,
      });
      return {
        isError: true,
        content: [{ type: "text" as const, text: `OpenRouter API error ${res.status}` }],
      };
    }

    const result = await res.json();
    const imgData = result.data?.[0]?.b64_json
      ? { data: result.data[0].b64_json, mimeType: result.data[0].media_type }
      : undefined;
    if (!imgData) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: "OpenRouter returned no image" }],
      };
    }
    const mimeType: string = imgData.mimeType || "image/png";
    const base64: string = imgData.data;
    const bytes = Buffer.from(base64, "base64");

    const id = `sk_${uuid().replace(/-/g, "")}`;
    const costEstimate = getCostPerImage(SKETCH_MODEL); // per-image cost from model-costs

    getDb()
      .prepare(
        "INSERT INTO generated_sketches (id, prompt, mime_type, data, cost_estimate) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, prompt, mimeType, bytes, costEstimate);

    const usage = result.usage || {};
    logGeneration({
      provider: "openrouter",
      model: SKETCH_MODEL,
      endpoint: "generate",
      timeMs: Date.now() - start,
      imageCount: 1,
      inputTokens: usage.prompt_tokens || 0,
      outputTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
      prompt,
      generatedImageIds: [id],
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `Sketch generated. Reference: generated:${id} (cost: $${costEstimate.toFixed(3)})`,
        },
        { type: "image" as const, mimeType, data: base64 },
      ],
    };
  },
};

registerTool(generateSketchTool);
