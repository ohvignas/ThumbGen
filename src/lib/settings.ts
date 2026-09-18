import crypto from "crypto";
import type { ZodType } from "zod";
import { getDb } from "./db";
import {
  ENV_FALLBACK,
  SECRET_KEYS,
  SETTING_KEYS,
  SettingsSchema,
  SettingsUpdateSchema,
  isSecretKey,
  previewSecret,
  toSettingsIssues,
  type SecretKey,
  type SecretStatus,
  type SettingsIssue,
  type SettingsResponse,
  type SettingsValues,
  type TypedSettings,
} from "./settings-schema";

export type { TypedSettings } from "./settings-schema";

export class SettingsValidationError extends Error {
  readonly issues: SettingsIssue[];

  constructor(issues: SettingsIssue[]) {
    super("Invalid settings");
    this.name = "SettingsValidationError";
    this.issues = issues;
  }
}

/** Keys whose typed value is a string — what the legacy getSetting() can return. */
type StringSettingKey = {
  [K in keyof TypedSettings]-?: NonNullable<TypedSettings[K]> extends string ? K : never;
}[keyof TypedSettings];

function readStoredRows(): Map<string, string> {
  const rows = getDb().prepare("SELECT key, value FROM settings").all() as { key: string; value: string | null }[];
  const stored = new Map<string, string>();
  for (const row of rows) {
    // An empty string has always meant "unset" in this table.
    if (row.value !== null && row.value !== "") stored.set(row.key, row.value);
  }
  return stored;
}

function readStoredValue(key: string): string | undefined {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string | null }
    | undefined;
  return row?.value ? row.value : undefined;
}

function describeForLog(key: string, value: string | undefined): string {
  if (isSecretKey(key)) return "(secret)";
  if (value === undefined) return "(unset)";
  return value.length > 60 ? `${value.slice(0, 60)}…` : value;
}

/**
 * Reads the settings table and returns every setting typed, with defaults.
 * Secrets fall back to their environment variable. An invalid stored value
 * never throws: it is logged and replaced by the default.
 */
export function getTypedSettings(): TypedSettings {
  const stored = readStoredRows();
  const out: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) {
    const field = SettingsSchema.shape[key] as ZodType;
    const storedValue = stored.get(key);
    let raw: unknown = storedValue;
    if (raw === undefined && isSecretKey(key)) raw = process.env[ENV_FALLBACK[key]] || undefined;
    if (raw === undefined && key === "googleOAuthClientId") raw = process.env.GOOGLE_OAUTH_CLIENT_ID || undefined;
    if (key === "channelProfile" && typeof storedValue === "string") {
      try {
        raw = JSON.parse(storedValue);
      } catch {
        raw = Symbol("invalid-json");
      }
    }
    const parsed = field.safeParse(raw);
    if (parsed.success) {
      out[key] = parsed.data;
      continue;
    }
    console.warn(`[settings] ${key}: invalid stored value ${describeForLog(key, storedValue)}, using the default`);
    out[key] = field.parse(undefined);
  }
  return out as TypedSettings;
}

function serialize(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/**
 * Validates a subset of settings and writes it in one transaction. Only the
 * keys present in `input` are written. A blank secret is ignored so an empty
 * password field never wipes a stored key.
 */
export function updateSettings(input: unknown): void {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new SettingsValidationError([{ path: "", message: "Objet de réglages attendu" }]);
  }

  const candidate: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (isSecretKey(key) && typeof value === "string" && value.trim() === "") continue;
    candidate[key] = value;
  }

  const parsed = SettingsUpdateSchema.safeParse(candidate);
  if (!parsed.success) throw new SettingsValidationError(toSettingsIssues(parsed.error));

  const db = getDb();
  const personaId = parsed.data.channelProfile?.defaultPersonaId;
  if ("channelProfile" in candidate && personaId) {
    const exists = db.prepare("SELECT 1 FROM personas WHERE id = ?").get(personaId);
    if (!exists) {
      throw new SettingsValidationError([
        { path: "channelProfile.defaultPersonaId", message: "Ce personnage n'existe plus" },
      ]);
    }
  }

  const values = parsed.data as Record<string, unknown>;
  const upsert = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  const write = db.transaction(() => {
    for (const key of Object.keys(candidate)) {
      if (values[key] === undefined) continue;
      upsert.run(key, serialize(values[key]));
    }
  });
  write();
}

export function clearSetting(key: string): void {
  getDb().prepare("DELETE FROM settings WHERE key = ?").run(key);
}

/** Raw, unvalidated write. Used by the MCP key helpers and by tests. */
export function setSetting(key: keyof TypedSettings, value: string): void {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}

/** Legacy string accessor kept for existing callers; typed values come from getTypedSettings(). */
export function getSetting(key: StringSettingKey): string {
  return getTypedSettings()[key] ?? "";
}

export function getSecretStatus(key: SecretKey): SecretStatus {
  const stored = readStoredValue(key);
  if (stored) return { configured: true, preview: previewSecret(stored), source: "settings" };
  const fromEnv = process.env[ENV_FALLBACK[key]];
  if (fromEnv) return { configured: true, preview: previewSecret(fromEnv), source: "env" };
  return { configured: false, preview: null, source: null };
}

/** What GET /api/settings returns: typed values, secrets replaced by their status. */
export function getPublicSettings(): SettingsResponse {
  const typed = getTypedSettings();
  const values: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) {
    if (!isSecretKey(key)) values[key] = typed[key];
  }
  const secrets = Object.fromEntries(SECRET_KEYS.map((key) => [key, getSecretStatus(key)])) as Record<
    SecretKey,
    SecretStatus
  >;
  return { ...(values as SettingsValues), ...secrets, sitePasswordEnabled: Boolean(process.env.SITE_PASSWORD) };
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
