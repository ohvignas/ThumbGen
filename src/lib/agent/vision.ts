import Anthropic from "@anthropic-ai/sdk";
import { getSetting } from "@/lib/settings";

export type FaceTags = {
  emotions: string[];          // ["surprise", "shock"]
  expression: string;           // "open mouth, raised eyebrows"
  intensity: "low" | "medium" | "high";
  keywords: string[];           // ["shocked", "amazed"] — short, EN/FR mixed for retrieval
  caption: string;              // one short sentence
};

const VISION_MODEL = "claude-haiku-4-5"; // cheap multimodal — fits tagging well

const TAG_PROMPT = `You are tagging a face/expression photo for thumbnail design retrieval.

Return ONLY a compact JSON object with this shape (no prose, no fences):
{
  "emotions": ["..."],          // 1-3 short emotion words, lowercase
  "expression": "...",          // describe the visible expression in 4-8 words
  "intensity": "low" | "medium" | "high",
  "keywords": ["..."],          // 3-6 short tags useful for matching to a thumbnail mood (mix EN/FR ok: shocked, surpris, joyeux, énervé, choqué, sceptique, déterminé, etc.)
  "caption": "..."              // one descriptive sentence in French
}

Important: focus on the EMOTION and EXPRESSION as it would translate to a YouTube thumbnail face. If multiple plausible labels exist, pick the strongest one.`;

/**
 * Sends an image to Claude vision and returns structured emotion tags.
 * Throws on missing API key or upstream failure.
 */
export async function tagFaceImage(bytes: Buffer, mimeType: string): Promise<FaceTags> {
  const apiKey = getSetting("anthropicApiKey") || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const client = new Anthropic({ apiKey });
  const resp = await client.messages.create({
    model: VISION_MODEL,
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mimeType as "image/png", data: bytes.toString("base64") },
          },
          { type: "text", text: TAG_PROMPT },
        ],
      },
    ],
  });

  const text = (resp.content.find((c) => c.type === "text") as { text?: string } | undefined)?.text ?? "";
  // Strip optional code fences and parse the first JSON object.
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/gm, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as FaceTags;
    return {
      emotions: Array.isArray(parsed.emotions) ? parsed.emotions.map(String).slice(0, 4) : [],
      expression: String(parsed.expression ?? "").slice(0, 200),
      intensity: parsed.intensity === "low" || parsed.intensity === "high" ? parsed.intensity : "medium",
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(String).slice(0, 8) : [],
      caption: String(parsed.caption ?? "").slice(0, 240),
    };
  } catch {
    // If parsing fails, fall back to a minimal record so we don't keep retrying.
    return {
      emotions: [],
      expression: "",
      intensity: "medium",
      keywords: [],
      caption: text.slice(0, 240),
    };
  }
}
