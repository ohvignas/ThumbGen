import crypto from "crypto";
import { getDb } from "./db";

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
  currentProjectId?: string;
  mcpApiKey?: string;
  anthropicApiKey?: string;
};

const KEYS: (keyof AppSettings)[] = [
  "geminiApiKey",
  "ideogramApiKey",
  "openaiApiKey",
  "grokApiKey",
  "youtubeApiKey",
  "youtubePlaylistId",
  "sitePassword",
  "language",
  "favoriteModel",
  "currentProjectId",
  "mcpApiKey",
  "anthropicApiKey",
];

const ENV_MAP: Record<keyof AppSettings, string> = {
  geminiApiKey: "GEMINI_API_KEY",
  ideogramApiKey: "IDEOGRAM_API_KEY",
  openaiApiKey: "OPENAI_API_KEY",
  grokApiKey: "GROK_API_KEY",
  youtubeApiKey: "YOUTUBE_API_KEY",
  youtubePlaylistId: "YOUTUBE_PLAYLIST_ID",
  sitePassword: "SITE_PASSWORD",
  language: "LANGUAGE",
  favoriteModel: "FAVORITE_MODEL",
  currentProjectId: "CURRENT_PROJECT_ID",
  mcpApiKey: "MCP_API_KEY",
  anthropicApiKey: "ANTHROPIC_API_KEY",
};

export function getSettings(): AppSettings {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string | null }[];
  const out: AppSettings = {};
  for (const row of rows) {
    if ((KEYS as string[]).includes(row.key) && row.value != null) {
      (out as Record<string, string>)[row.key] = row.value;
    }
  }
  return out;
}

export function saveSettings(settings: AppSettings) {
  const db = getDb();
  const upsert = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  const transaction = db.transaction((s: AppSettings) => {
    for (const k of KEYS) {
      const v = s[k];
      if (v !== undefined) upsert.run(k, v ?? null);
    }
  });
  transaction(settings);
}

export function getSetting(key: keyof AppSettings): string {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string | null } | undefined;
  return row?.value || process.env[ENV_MAP[key]] || "";
}

export function setSetting(key: keyof AppSettings, value: string) {
  const db = getDb();
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export function getMcpApiKey(): string | null {
  const value = getSetting("mcpApiKey");
  return value || null;
}

export function ensureMcpApiKey(): string {
  const existing = getMcpApiKey();
  if (existing) return existing;
  const key = `tg_${crypto.randomBytes(32).toString("hex")}`;
  setSetting("mcpApiKey", key);
  return key;
}

export function regenerateMcpApiKey(): string {
  const key = `tg_${crypto.randomBytes(32).toString("hex")}`;
  setSetting("mcpApiKey", key);
  return key;
}
