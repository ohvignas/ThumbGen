import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { getSetting } from "@/lib/settings";

/**
 * Creates a fresh OpenRouter provider from the current Settings value on
 * every call — no module-scope singleton. v1's llm-client.ts reads the API
 * key fresh per-call by explicit design (a Settings-page key change must
 * apply to the very next message, no restart); the common singleton pattern
 * shown in most @openrouter/ai-sdk-provider examples would silently break
 * that on a warm server process, so this deliberately does not cache.
 */
export function getOpenRouterProvider() {
  const apiKey = getSetting("openrouterApiKey");
  if (!apiKey) return null;
  return createOpenRouter({
    apiKey,
    headers: {
      "HTTP-Referer": "https://thumbgen.local",
      "X-Title": "ThumbGen",
    },
  });
}
