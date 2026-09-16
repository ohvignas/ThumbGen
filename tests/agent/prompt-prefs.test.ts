import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "@/lib/db";
import { updateSettings } from "@/lib/settings";
import { loadAgentPromptPrefs } from "@/lib/agent/prompt-prefs";

beforeEach(() => {
  getDb().exec("DELETE FROM settings");
});

describe("loadAgentPromptPrefs", () => {
  it("defaults both languages to French", () => {
    expect(loadAgentPromptPrefs()).toEqual({ responseLanguage: "fr", thumbnailLanguage: "fr" });
  });

  it("reads agentResponseLanguage and the thumbnail language setting", () => {
    updateSettings({ agentResponseLanguage: "en", language: "de" });
    expect(loadAgentPromptPrefs()).toEqual({ responseLanguage: "en", thumbnailLanguage: "de" });
  });
});
