import OpenAI from "openai";
import { getSetting } from "@/lib/settings";

export type TranscriptionResult = { text: string };

/**
 * Transcribes an audio File via OpenAI's gpt-4o-mini-transcribe model.
 * Defaults to French; pass language=undefined for auto-detection.
 */
export async function transcribeAudio(
  file: File,
  language: string | undefined = "fr",
): Promise<TranscriptionResult> {
  const apiKey = getSetting("openaiApiKey") || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const openai = new OpenAI({ apiKey });
  const result = await openai.audio.transcriptions.create({
    file,
    model: "gpt-4o-mini-transcribe",
    language,
  });
  return { text: result.text };
}
