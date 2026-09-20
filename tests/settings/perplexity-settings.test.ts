import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getDb } from "@/lib/db";
import { getTypedSettings, setSetting } from "@/lib/settings";
import { ENV_FALLBACK, SECRET_KEYS } from "@/lib/settings-schema";
import { TESTABLE_PROVIDERS, testProviderKey } from "@/lib/connection-tests";
import { GET as getSettings } from "@/app/api/settings/route";
import { POST as testRoute } from "@/app/api/settings/test/route";

const KEY = "pplx-secret-key-4242";
const fetchMock = vi.fn<typeof fetch>();
let savedEnv: string | undefined;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  getDb().exec("DELETE FROM settings");
  savedEnv = process.env.PERPLEXITY_API_KEY;
  delete process.env.PERPLEXITY_API_KEY;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (savedEnv === undefined) delete process.env.PERPLEXITY_API_KEY;
  else process.env.PERPLEXITY_API_KEY = savedEnv;
});

describe("perplexityApiKey setting", () => {
  it("is a secret with an environment fallback", () => {
    expect(SECRET_KEYS).toContain("perplexityApiKey");
    expect(ENV_FALLBACK.perplexityApiKey).toBe("PERPLEXITY_API_KEY");
    expect(getTypedSettings().perplexityApiKey).toBeUndefined();
    process.env.PERPLEXITY_API_KEY = "pplx-from-env-9999";
    expect(getTypedSettings().perplexityApiKey).toBe("pplx-from-env-9999");
  });

  it("is masked by GET /api/settings", async () => {
    setSetting("perplexityApiKey", KEY);
    const body = await (await getSettings()).json();
    expect(body.perplexityApiKey).toEqual({ configured: true, preview: "…4242", source: "settings" });
    expect(JSON.stringify(body)).not.toContain(KEY);
  });
});

describe("Perplexity connection test", () => {
  it("is testable and reports a missing key without any request", async () => {
    expect(TESTABLE_PROVIDERS).toContain("perplexity");
    expect(await testProviderKey("perplexity")).toEqual({ ok: false, detail: "Aucune clé configurée" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats HTTP 422 on an empty /v1/sonar POST as a valid key", async () => {
    setSetting("perplexityApiKey", KEY);
    fetchMock.mockResolvedValueOnce(json({ detail: "validation" }, 422));
    expect(await testProviderKey("perplexity")).toEqual({ ok: true, detail: "Clé valide" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.perplexity.ai/v1/sonar");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).body).toBe("{}");
  });

  it("reports 401 as an invalid key and masks it", async () => {
    setSetting("perplexityApiKey", KEY);
    fetchMock.mockResolvedValueOnce(json({ error: { message: `Invalid API key ${KEY}` } }, 401));
    expect(await testProviderKey("perplexity")).toEqual({ ok: false, detail: "HTTP 401 · Invalid API key …" });
  });

  it("is accepted by POST /api/settings/test", async () => {
    const res = await testRoute(new Request("http://localhost/api/settings/test?provider=perplexity", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, detail: "Aucune clé configurée" });
  });
});
