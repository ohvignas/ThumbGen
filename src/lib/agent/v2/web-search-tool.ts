import { getTypedSettings } from "@/lib/settings";

/**
 * OpenRouter's web-search augmentation, opted in via the existing
 * agentWebSearch setting — same on/off semantics as v1's
 * `plugins: [{id: "web"}]` (loop.ts:132-139). Uses `web_search_options`,
 * the field @openrouter/ai-sdk-provider currently types for this (verified
 * against its source — the provider does not yet type the
 * `tools:[{type:'openrouter:web_search'}]` shape OpenRouter's own docs
 * describe as the newest mechanism; `plugins:[{id:'web'}]` still works but
 * is marked deprecated by OpenRouter).
 */
export function webSearchProviderOptions(): { web_search_options: Record<string, never> } | undefined {
  if (!getTypedSettings().agentWebSearch) return undefined;
  return { web_search_options: {} };
}
