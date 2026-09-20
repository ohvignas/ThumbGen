import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import { testProviderKey } from "@/lib/connection-tests";
import { POST } from "@/app/api/settings/test/route";

const ENV_NAMES = ["OPENROUTER_API_KEY", "OPENAI_API_KEY", "YOUTUBE_API_KEY", "PERPLEXITY_API_KEY"];
const savedEnv: Record<string, string | undefined> = {};
const fetchMock = vi.fn<typeof fetch>();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  getDb().exec("DELETE FROM settings");
  for (const name of ENV_NAMES) {
    savedEnv[name] = process.env[name];
    delete process.env[name];
  }
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const name of ENV_NAMES) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
});

describe("testProviderKey", () => {
  it("reports a missing key without calling the provider", async () => {
    expect(await testProviderKey("openai")).toEqual({ ok: false, detail: "Aucune clé configurée" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tests OpenRouter with the stored key and summarises usage and limit", async () => {
    setSetting("openrouterApiKey", "sk-or-v1-secret-a107");
    fetchMock.mockResolvedValue(json({ data: { label: "x", usage: 1.5, limit: 10, limit_remaining: 8.5, is_free_tier: false } }));
    const result = await testProviderKey("openrouter");
    expect(result).toEqual({ ok: true, detail: "Clé valide · consommation 1,50 $ · limite 10,00 $ · reste 8,50 $" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/key");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer sk-or-v1-secret-a107");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("says when OpenRouter reports no limit", async () => {
    setSetting("openrouterApiKey", "sk-or-v1-secret-a107");
    fetchMock.mockResolvedValue(json({ data: { usage: 0, limit: null, limit_remaining: null, is_free_tier: true } }));
    expect(await testProviderKey("openrouter")).toEqual({
      ok: true,
      detail: "Clé valide · consommation 0,00 $ · sans limite · offre gratuite",
    });
  });

  it("tests OpenAI against /v1/models", async () => {
    setSetting("openaiApiKey", "sk-openai-key");
    fetchMock.mockResolvedValue(json({ data: [] }));
    expect(await testProviderKey("openai")).toEqual({ ok: true, detail: "Clé valide" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/models");
  });

  it("tests YouTube with a 1-unit channels lookup", async () => {
    setSetting("youtubeApiKey", "AIza-yt-key");
    fetchMock.mockResolvedValue(json({ items: [{ id: "UC" }] }));
    expect(await testProviderKey("youtube")).toEqual({ ok: true, detail: "Clé valide · 1 unité de quota utilisée" });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("https://www.googleapis.com/youtube/v3/channels?");
    expect(url).toContain("part=id");
    expect(url).toContain("forHandle=%40YouTube");
    expect(url).toContain("key=AIza-yt-key");
  });

  it("uses the environment fallback like the rest of the app", async () => {
    process.env.OPENAI_API_KEY = "sk-env-key";
    fetchMock.mockResolvedValue(json({ data: [] }));
    expect((await testProviderKey("openai")).ok).toBe(true);
  });

  it("returns the HTTP status and a short message, never the key", async () => {
    setSetting("openaiApiKey", "sk-leaky-key-9999");
    fetchMock.mockResolvedValue(json({ error: { message: "Incorrect API key provided: sk-leaky-key-9999." } }, 401));
    const result = await testProviderKey("openai");
    expect(result).toEqual({ ok: false, detail: "HTTP 401 · Incorrect API key provided: …." });
    expect(result.detail).not.toContain("sk-leaky-key-9999");
  });

  it("reports a timeout", async () => {
    setSetting("openaiApiKey", "sk-openai-key");
    fetchMock.mockRejectedValue(Object.assign(new Error("timed out"), { name: "TimeoutError" }));
    expect(await testProviderKey("openai")).toEqual({ ok: false, detail: "Délai dépassé (10 s)" });
  });

  it("reports an unreachable service", async () => {
    setSetting("youtubeApiKey", "AIza-yt-key");
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await testProviderKey("youtube")).toEqual({ ok: false, detail: "Service injoignable" });
  });
});

describe("POST /api/settings/test", () => {
  it("rejects an unknown provider", async () => {
    const res = await POST(new Request("http://localhost/api/settings/test?provider=gemini", { method: "POST" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, detail: "Fournisseur inconnu" });
  });

  it("returns the test result without the key", async () => {
    setSetting("openrouterApiKey", "sk-or-v1-never-leak-0001");
    fetchMock.mockResolvedValue(json({ data: { usage: 2, limit: null } }));
    const res = await POST(new Request("http://localhost/api/settings/test?provider=openrouter", { method: "POST" }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text).ok).toBe(true);
    expect(text).not.toContain("sk-or-v1-never-leak-0001");
  });
});
