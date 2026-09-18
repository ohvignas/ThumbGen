import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDb } from "@/lib/db";
import { getTypedSettings, setSetting } from "@/lib/settings";
import { DELETE, GET, POST } from "@/app/api/settings/route";

const ENV_NAMES = ["OPENROUTER_API_KEY", "OPENAI_API_KEY", "YOUTUBE_API_KEY", "MCP_API_KEY", "SITE_PASSWORD", "GOOGLE_OAUTH_CLIENT_SECRET"];
const savedEnv: Record<string, string | undefined> = {};

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

function del(key: string) {
  return DELETE(new Request(`http://localhost/api/settings?key=${encodeURIComponent(key)}`, { method: "DELETE" }));
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
});

describe("GET /api/settings", () => {
  it("returns typed values and masks every secret", async () => {
    setSetting("openrouterApiKey", "sk-or-v1-0000000000a107");
    setSetting("agentWebSearch", "0");
    const res = await GET();
    const body = await res.json();
    expect(body.openrouterApiKey).toEqual({ configured: true, preview: "…a107", source: "settings" });
    expect(body.openaiApiKey).toEqual({ configured: false, preview: null, source: null });
    expect(body.agentWebSearch).toBe(false);
    expect(body.agentMaxSteps).toBe(25);
    expect(body.sitePasswordEnabled).toBe(false);
    expect(JSON.stringify(body)).not.toContain("sk-or-v1-0000000000a107");
  });

  it("exposes SITE_PASSWORD only as a boolean", async () => {
    process.env.SITE_PASSWORD = "hunter2-secret";
    const body = await (await GET()).json();
    expect(body.sitePasswordEnabled).toBe(true);
    expect(JSON.stringify(body)).not.toContain("hunter2-secret");
  });
});

describe("POST /api/settings", () => {
  it("saves a valid subset", async () => {
    const res = await post({ agentMaxSteps: 12, theme: "light" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(getTypedSettings().agentMaxSteps).toBe(12);
    expect(getTypedSettings().theme).toBe("light");
  });

  it("returns 400 with per-field issues", async () => {
    const res = await post({ agentMaxSteps: 99, defaultResolution: "8K" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Réglages invalides");
    expect(body.issues).toEqual([
      { path: "agentMaxSteps", message: "Entre 5 et 50 étapes" },
      { path: "defaultResolution", message: "Résolution inconnue" },
    ]);
    expect(getTypedSettings().agentMaxSteps).toBe(25);
  });

  it("ignores an empty secret", async () => {
    setSetting("openaiApiKey", "sk-keep-me");
    const res = await post({ openaiApiKey: "" });
    expect(res.status).toBe(200);
    expect(getTypedSettings().openaiApiKey).toBe("sk-keep-me");
  });

  it("returns 400 on a malformed body", async () => {
    const res = await post("{nope");
    expect(res.status).toBe(400);
    expect((await res.json()).issues).toEqual([]);
  });
});

describe("DELETE /api/settings", () => {
  it("refuses a non-secret key", async () => {
    setSetting("language", "en");
    const res = await del("language");
    expect(res.status).toBe(400);
    expect(getTypedSettings().language).toBe("en");
  });

  it("clears a stored secret", async () => {
    setSetting("youtubeApiKey", "AIza-stored-key");
    const res = await del("youtubeApiKey");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ key: "youtubeApiKey", configured: false, preview: null, source: null });
  });

  it("reports when the environment still provides the secret", async () => {
    process.env.OPENAI_API_KEY = "sk-env-provided-4321";
    setSetting("openaiApiKey", "sk-stored-1111");
    const body = await (await del("openaiApiKey")).json();
    expect(body).toEqual({ key: "openaiApiKey", configured: true, preview: "…4321", source: "env" });
  });
});
