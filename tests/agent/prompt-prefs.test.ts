import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "@/lib/db";
import { updateSettings } from "@/lib/settings";
import { EMPTY_CHANNEL_PROFILE } from "@/lib/settings-schema";
import { loadAgentPromptPrefs } from "@/lib/agent/prompt-prefs";

beforeEach(() => {
  getDb().exec("DELETE FROM settings");
});

describe("loadAgentPromptPrefs", () => {
  it("returns French and an empty profile by default", () => {
    expect(loadAgentPromptPrefs()).toEqual({
      responseLanguage: "fr",
      thumbnailLanguage: "fr",
      youtubeChannel: "",
      channelProfile: EMPTY_CHANNEL_PROFILE,
      defaultPersona: null,
      channelKnowledge: null,
    });
  });

  it("reads agentResponseLanguage and the thumbnail language setting", () => {
    updateSettings({ agentResponseLanguage: "en", language: "de" });
    const prefs = loadAgentPromptPrefs();
    expect(prefs.responseLanguage).toBe("en");
    expect(prefs.thumbnailLanguage).toBe("de");
  });

  it("resolves the default persona and the channel fields", () => {
    getDb().prepare("INSERT OR IGNORE INTO personas (id, label) VALUES (?, ?)").run("persona-prefs-1", "Antoine");
    updateSettings({ youtubePlaylistId: "@demo", channelProfile: { name: "Demo", defaultPersonaId: "persona-prefs-1" } });
    const prefs = loadAgentPromptPrefs();
    expect(prefs.youtubeChannel).toBe("@demo");
    expect(prefs.channelProfile.name).toBe("Demo");
    expect(prefs.defaultPersona).toEqual({ id: "persona-prefs-1", label: "Antoine" });
  });

  it("drops a default persona deleted since it was chosen", () => {
    getDb().prepare("INSERT OR IGNORE INTO personas (id, label) VALUES (?, ?)").run("persona-prefs-2", "Ancien");
    updateSettings({ channelProfile: { defaultPersonaId: "persona-prefs-2" } });
    getDb().prepare("DELETE FROM personas WHERE id = ?").run("persona-prefs-2");
    const prefs = loadAgentPromptPrefs();
    expect(prefs.channelProfile.defaultPersonaId).toBe("persona-prefs-2");
    expect(prefs.defaultPersona).toBeNull();
  });
});
