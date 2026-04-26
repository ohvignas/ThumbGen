import OpenAI from "openai";
import { getSetting } from "@/lib/settings";

/**
 * Singleton-ish factory for an OpenAI client pointed at OpenRouter.
 * Reads the api key from settings on each call so a Settings update takes
 * effect without restart. Returns null if the user hasn't configured a key —
 * callers must handle that and surface a friendly error.
 *
 * The HTTP-Referer + X-Title headers help ThumbGen show up in OpenRouter's
 * dashboards for the user's own analytics; they're not required.
 */
export function getOpenRouterClient(): OpenAI | null {
  const apiKey = getSetting("openrouterApiKey");
  if (!apiKey) return null;
  return new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://thumbgen.local",
      "X-Title": "ThumbGen",
    },
  });
}
