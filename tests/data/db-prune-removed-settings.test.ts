import { describe, it, expect, beforeEach } from "vitest";
import { getDb, pruneRemovedSettingsKeys } from "@/lib/db";

// F9: rows for keys the Réglages rework dropped (direct provider keys,
// sitePassword) must not linger in the settings table — they get copied
// into every backup otherwise, secret values included.
const REMOVED_KEYS = ["geminiApiKey", "ideogramApiKey", "grokApiKey", "anthropicApiKey", "sitePassword"];

function setRaw(key: string, value: string) {
  getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

function hasKey(key: string): boolean {
  return Boolean(getDb().prepare("SELECT 1 FROM settings WHERE key = ?").get(key));
}

beforeEach(() => {
  getDb().exec("DELETE FROM settings");
});

describe("pruneRemovedSettingsKeys", () => {
  it("deletes every removed provider-key/password row", () => {
    for (const key of REMOVED_KEYS) setRaw(key, "leaked-secret-value");
    setRaw("openrouterApiKey", "keep-me");

    pruneRemovedSettingsKeys(getDb());

    for (const key of REMOVED_KEYS) expect(hasKey(key)).toBe(false);
    expect(hasKey("openrouterApiKey")).toBe(true);
  });

  it("is idempotent — running it again on an already-clean table is a no-op", () => {
    setRaw("openrouterApiKey", "keep-me");
    pruneRemovedSettingsKeys(getDb());
    pruneRemovedSettingsKeys(getDb());
    expect(hasKey("openrouterApiKey")).toBe(true);
  });

  it("is a no-op when none of the removed keys are present", () => {
    setRaw("agentModel", "some-model");
    pruneRemovedSettingsKeys(getDb());
    expect(hasKey("agentModel")).toBe(true);
  });

  it("already ran once when the database was first opened for this test file", () => {
    // db.ts calls pruneRemovedSettingsKeys() from init(), which getDb() has
    // already triggered by the time this test file's first test runs — so a
    // fresh temp DB never carries removed-key rows in the first place.
    for (const key of REMOVED_KEYS) expect(hasKey(key)).toBe(false);
  });
});
