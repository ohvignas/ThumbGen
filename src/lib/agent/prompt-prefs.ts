import { getTypedSettings } from "@/lib/settings";
import type { AgentPromptPrefs } from "@/lib/agent/system-prompt";

/** Reads the Réglages values that shape the agent's per-turn system blocks. */
export function loadAgentPromptPrefs(): AgentPromptPrefs {
  const settings = getTypedSettings();
  return {
    responseLanguage: settings.agentResponseLanguage,
    thumbnailLanguage: settings.language,
  };
}
