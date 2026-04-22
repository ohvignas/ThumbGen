import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

export type AppSettings = {
  geminiApiKey?: string;
  ideogramApiKey?: string;
  openaiApiKey?: string;
  grokApiKey?: string;
  youtubeApiKey?: string;
  youtubePlaylistId?: string;
  sitePassword?: string;
  language?: string;
  favoriteModel?: string;
};

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function getSettings(): AppSettings {
  ensureDir();
  if (!fs.existsSync(SETTINGS_FILE)) return {};
  return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8")) as AppSettings;
}

export function saveSettings(settings: AppSettings) {
  ensureDir();
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
}

/**
 * Get a setting value, falling back to env var if not set in local settings.
 * Local settings take priority over env vars.
 */
export function getSetting(key: keyof AppSettings): string {
  const settings = getSettings();
  const envMap: Record<keyof AppSettings, string> = {
    geminiApiKey: "GEMINI_API_KEY",
    ideogramApiKey: "IDEOGRAM_API_KEY",
    openaiApiKey: "OPENAI_API_KEY",
    grokApiKey: "GROK_API_KEY",
    youtubeApiKey: "YOUTUBE_API_KEY",
    youtubePlaylistId: "YOUTUBE_PLAYLIST_ID",
    sitePassword: "SITE_PASSWORD",
    language: "LANGUAGE",
    favoriteModel: "FAVORITE_MODEL",
  };
  return settings[key] || process.env[envMap[key]] || "";
}
