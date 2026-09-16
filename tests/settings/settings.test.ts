import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getDb } from "@/lib/db";
import {
  SettingsValidationError,
  clearSetting,
  getSecretStatus,
  getSetting,
  getTypedSettings,
  setSetting,
  updateSettings,
} from "@/lib/settings";
import { EMPTY_CHANNEL_PROFILE } from "@/lib/settings-schema";

const ENV_NAMES = ["OPENROUTER_API_KEY", "OPENAI_API_KEY", "YOUTUBE_API_KEY", "MCP_API_KEY", "LANGUAGE"];
const savedEnv: Record<string, string | undefined> = {};

function storedRows(): Record<string, string | null> {
  const rows = getDb().prepare("SELECT key, value FROM settings").all() as { key: string; value: string | null }[];
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

function issuesOf(fn: () => void): { path: string; message: string }[] {
  try {
    fn();
  } catch (err) {
    if (err instanceof SettingsValidationError) return err.issues;
    throw err;
  }
  throw new Error("expected a SettingsValidationError");
}

beforeEach(() => {
  getDb().exec("DELETE FROM settings");
  for (const name of ENV_NAMES) {
    savedEnv[name] = process.env[name];
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of ENV_NAMES) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
  vi.restoreAllMocks();
});

describe("getTypedSettings", () => {
  it("returns every default on an empty table", () => {
    expect(getTypedSettings()).toEqual({
      openrouterApiKey: undefined,
      openaiApiKey: undefined,
      youtubeApiKey: undefined,
      mcpApiKey: undefined,
      agentModel: "anthropic/claude-sonnet-4.6",
      agentWebSearch: true,
      agentReasoningEffort: "medium",
      agentMaxSteps: 25,
      agentAutoTitle: true,
      agentResponseLanguage: "fr",
      favoriteModel: "gemini-3.1-flash-image",
      defaultAspectRatio: "16x9",
      defaultImageCount: 1,
      defaultResolution: "2K",
      language: "fr",
      youtubePlaylistId: "",
      channelProfile: EMPTY_CHANNEL_PROFILE,
      theme: "dark",
      currentProjectId: "default",
    });
  });

  it.each([
    ["1", true],
    ["true", true],
    ["0", false],
    ["false", false],
  ] as Array<[string, boolean]>)("reads agentWebSearch %s as %s", (raw, expected) => {
    setSetting("agentWebSearch", raw);
    expect(getTypedSettings().agentWebSearch).toBe(expected);
  });

  it("treats an empty stored string as unset", () => {
    setSetting("agentWebSearch", "");
    setSetting("language", "");
    expect(getTypedSettings().agentWebSearch).toBe(true);
    expect(getTypedSettings().language).toBe("fr");
  });

  it("falls back to the default and warns on an invalid stored value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setSetting("agentMaxSteps", "999");
    setSetting("theme", "purple");
    setSetting("channelProfile", "{not json");
    const settings = getTypedSettings();
    expect(settings.agentMaxSteps).toBe(25);
    expect(settings.theme).toBe("dark");
    expect(settings.channelProfile).toEqual(EMPTY_CHANNEL_PROFILE);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("agentMaxSteps"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("channelProfile"));
  });

  it("ignores rows for settings that no longer exist", () => {
    getDb().prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("geminiApiKey", "AIza-old");
    expect(Object.keys(getTypedSettings())).not.toContain("geminiApiKey");
  });

  it("falls back to the environment for secrets only", () => {
    process.env.OPENAI_API_KEY = "sk-from-env-1234";
    process.env.LANGUAGE = "en";
    const settings = getTypedSettings();
    expect(settings.openaiApiKey).toBe("sk-from-env-1234");
    expect(settings.language).toBe("fr");
  });

  it("prefers the stored secret over the environment", () => {
    process.env.OPENAI_API_KEY = "sk-from-env-1234";
    setSetting("openaiApiKey", "sk-stored-5678");
    expect(getTypedSettings().openaiApiKey).toBe("sk-stored-5678");
  });
});

describe("updateSettings", () => {
  it("accepts 5 and 50 steps and rejects 4 and 51", () => {
    updateSettings({ agentMaxSteps: 5 });
    expect(getTypedSettings().agentMaxSteps).toBe(5);
    updateSettings({ agentMaxSteps: 50 });
    expect(getTypedSettings().agentMaxSteps).toBe(50);
    expect(issuesOf(() => updateSettings({ agentMaxSteps: 4 }))).toEqual([
      { path: "agentMaxSteps", message: "Entre 5 et 50 étapes" },
    ]);
    expect(issuesOf(() => updateSettings({ agentMaxSteps: 51 }))[0].path).toBe("agentMaxSteps");
  });

  it("accepts 1 to 4 images and rejects 0 and 5", () => {
    updateSettings({ defaultImageCount: 1 });
    updateSettings({ defaultImageCount: 4 });
    expect(getTypedSettings().defaultImageCount).toBe(4);
    expect(issuesOf(() => updateSettings({ defaultImageCount: 0 }))[0]).toEqual({
      path: "defaultImageCount",
      message: "Entre 1 et 4 images",
    });
    expect(issuesOf(() => updateSettings({ defaultImageCount: 5 }))[0].path).toBe("defaultImageCount");
  });

  it("writes only the keys it receives, booleans as true/false", () => {
    updateSettings({ agentWebSearch: false, agentMaxSteps: 12 });
    expect(storedRows()).toEqual({ agentWebSearch: "false", agentMaxSteps: "12" });
  });

  it("stores the channel profile as JSON with nested defaults", () => {
    updateSettings({ channelProfile: { name: "Ma chaîne", brandColors: ["#FF0000"] } });
    expect(getTypedSettings().channelProfile).toEqual({
      ...EMPTY_CHANNEL_PROFILE,
      name: "Ma chaîne",
      brandColors: ["#FF0000"],
    });
    expect(JSON.parse(storedRows().channelProfile ?? "null")).toEqual(getTypedSettings().channelProfile);
  });

  it("rejects unknown keys and writes nothing", () => {
    expect(issuesOf(() => updateSettings({ geminiApiKey: "x", agentMaxSteps: 10 }))).toEqual([
      { path: "geminiApiKey", message: "Réglage inconnu : geminiApiKey" },
    ]);
    expect(storedRows()).toEqual({});
  });

  it("rejects a non-object body", () => {
    expect(issuesOf(() => updateSettings(["agentMaxSteps"]))).toEqual([
      { path: "", message: "Objet de réglages attendu" },
    ]);
  });

  it("ignores a blank secret instead of wiping the stored one", () => {
    updateSettings({ openrouterApiKey: "sk-or-v1-keep" });
    updateSettings({ openrouterApiKey: "   ", agentAutoTitle: false });
    expect(getTypedSettings().openrouterApiKey).toBe("sk-or-v1-keep");
    expect(getTypedSettings().agentAutoTitle).toBe(false);
  });

  it("rejects a badly formatted brand colour", () => {
    expect(issuesOf(() => updateSettings({ channelProfile: { brandColors: ["red"] } }))).toEqual([
      { path: "channelProfile.brandColors.0", message: "Couleur au format #RRGGBB" },
    ]);
  });

  it("rejects a default persona that does not exist and accepts one that does", () => {
    expect(issuesOf(() => updateSettings({ channelProfile: { defaultPersonaId: "ghost" } }))).toEqual([
      { path: "channelProfile.defaultPersonaId", message: "Ce personnage n'existe plus" },
    ]);
    getDb().prepare("INSERT OR IGNORE INTO personas (id, label) VALUES (?, ?)").run("persona-settings-test", "Moi");
    updateSettings({ channelProfile: { defaultPersonaId: "persona-settings-test" } });
    expect(getTypedSettings().channelProfile.defaultPersonaId).toBe("persona-settings-test");
  });
});

describe("secret helpers", () => {
  it("getSecretStatus reports the source and a 4-character preview", () => {
    expect(getSecretStatus("openrouterApiKey")).toEqual({ configured: false, preview: null, source: null });
    process.env.OPENROUTER_API_KEY = "sk-or-v1-envenvenv9999";
    expect(getSecretStatus("openrouterApiKey")).toEqual({ configured: true, preview: "…9999", source: "env" });
    updateSettings({ openrouterApiKey: "sk-or-v1-storedstored-a107" });
    expect(getSecretStatus("openrouterApiKey")).toEqual({ configured: true, preview: "…a107", source: "settings" });
  });

  it("clearSetting deletes the stored row", () => {
    updateSettings({ youtubeApiKey: "AIza-to-delete" });
    clearSetting("youtubeApiKey");
    expect(storedRows()).toEqual({});
    expect(getTypedSettings().youtubeApiKey).toBeUndefined();
  });

  it("getSetting returns strings with defaults applied", () => {
    expect(getSetting("openaiApiKey")).toBe("");
    expect(getSetting("language")).toBe("fr");
    expect(getSetting("agentModel")).toBe("anthropic/claude-sonnet-4.6");
  });
});
