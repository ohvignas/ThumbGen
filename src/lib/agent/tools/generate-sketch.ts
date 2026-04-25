import { z } from "zod";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { logGeneration } from "@/lib/generations-log";
import { getCostPerImage } from "@/lib/model-costs";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({
  prompt: z.string().min(1),
  aspect_ratio: z.enum(["16x9", "9x16", "1x1"]).optional(),
  style: z.enum(["pencil_sketch", "polished"]).optional(),
});

const ASPECT_MAP: Record<string, string> = { "16x9": "16:9", "9x16": "9:16", "1x1": "1:1" };
const SKETCH_MODEL = "gemini-2.5-flash-image"; // fastest/cheapest variant for drafts

const PENCIL_SUFFIX =
  " Render this as a hand-drawn rough pencil sketch on white paper — visible pencil strokes, simple line work, monochrome graphite, very rough proportions, no fine detail, working draft style. The goal is a sketch a designer would scribble on a notebook to communicate composition, not a polished render.";

export const generateSketchTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "generate_sketch",
  description:
    "Generates a fast, cheap draft thumbnail using Gemini Flash Image. Defaults to a HAND-DRAWN PENCIL SKETCH style (rough strokes, monochrome graphite on paper) — perfect for proposing layout/angle ideas without committing to a polished design. Pass style='polished' for a finished thumbnail render. Returns a `generated:<id>` reference usable as a sketch node's image_source in apply_workflow. Aspect ratio defaults to 16x9.",
  inputSchema: InputSchema,
  handler: async ({ prompt, aspect_ratio, style }) => {
    const start = Date.now();
    const ratio = aspect_ratio ?? "16x9";
    const useStyle = style ?? "pencil_sketch";

    const apiKey = getSetting("geminiApiKey");
    if (!apiKey) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: "Gemini API key not configured. Add it in Settings." }],
      };
    }

    const stylized = useStyle === "pencil_sketch" ? `${prompt}${PENCIL_SUFFIX}` : prompt;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${SKETCH_MODEL}:generateContent?key=${apiKey}`;
    const body = {
      contents: [{ parts: [{ text: `Generate a YouTube thumbnail draft. ${stylized}` }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio: ASPECT_MAP[ratio], imageSize: "1K" },
      },
    };

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Network error: ${(e as Error).message}` }],
      };
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      logGeneration({
        provider: "gemini",
        model: SKETCH_MODEL,
        endpoint: "generate",
        timeMs: Date.now() - start,
        imageCount: 0,
        prompt,
        status: "error",
        errorMessage: `Gemini ${res.status}: ${errText.slice(0, 200)}`,
      });
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Gemini API error ${res.status}` }],
      };
    }

    const result = await res.json();
    const part = result.candidates?.[0]?.content?.parts?.find(
      (p: { inlineData?: unknown; inline_data?: unknown }) => p.inlineData || p.inline_data,
    );
    const imgData = part?.inlineData ?? part?.inline_data;
    if (!imgData) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: "Gemini returned no image" }],
      };
    }
    const mimeType: string = imgData.mimeType ?? imgData.mime_type ?? "image/png";
    const base64: string = imgData.data;
    const bytes = Buffer.from(base64, "base64");

    const id = `sk_${uuid().replace(/-/g, "")}`;
    const costEstimate = getCostPerImage(SKETCH_MODEL); // per-image cost from model-costs

    getDb()
      .prepare(
        "INSERT INTO generated_sketches (id, prompt, mime_type, data, cost_estimate) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, prompt, mimeType, bytes, costEstimate);

    const usage = result.usageMetadata || {};
    logGeneration({
      provider: "gemini",
      model: SKETCH_MODEL,
      endpoint: "generate",
      timeMs: Date.now() - start,
      imageCount: 1,
      inputTokens: usage.promptTokenCount || 0,
      outputTokens: usage.candidatesTokenCount || 0,
      totalTokens: usage.totalTokenCount || 0,
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
