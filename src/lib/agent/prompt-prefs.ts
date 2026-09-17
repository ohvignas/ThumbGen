import { getDb } from "@/lib/db";
import { getTypedSettings } from "@/lib/settings";
import type { AgentPromptPrefs } from "@/lib/agent/system-prompt";

/** Reads the Réglages values that shape the agent's per-turn system blocks. */
export function loadAgentPromptPrefs(): AgentPromptPrefs {
  const settings = getTypedSettings();
  const personaId = settings.channelProfile.defaultPersonaId;
  const persona = personaId
    ? (getDb().prepare("SELECT id, label FROM personas WHERE id = ?").get(personaId) as
        | { id: string; label: string }
        | undefined)
    : undefined;
  return {
    responseLanguage: settings.agentResponseLanguage,
    thumbnailLanguage: settings.language,
    youtubeChannel: settings.youtubePlaylistId,
    channelProfile: settings.channelProfile,
    // A persona deleted since it was chosen is left out of the prompt.
    defaultPersona: persona ?? null,
  };
}
