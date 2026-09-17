import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getDb } from "@/lib/db";
import { getTypedSettings, setSetting } from "@/lib/settings";
import { ENV_FALLBACK, SECRET_KEYS } from "@/lib/settings-schema";
import { TESTABLE_PROVIDERS, testProviderKey } from "@/lib/connection-tests";
import { GET as getSettings } from "@/app/api/settings/route";
import { POST as testRoute } from "@/app/api/settings/test/route";

const KEY = "bf-client-secret-1234";
const fetchMock = vi.fn<typeof fetch>();
let savedEnv: string | undefined;

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

beforeEach(() => {
  getDb().exec("DELETE FROM settings");
  savedEnv = process.env.BRANDFETCH_API_KEY;
  delete process.env.BRANDFETCH_API_KEY;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (savedEnv === undefined) delete process.env.BRANDFETCH_API_KEY;
  else process.env.BRANDFETCH_API_KEY = savedEnv;
});

describe("brandfetchApiKey setting", () => {
  it("is a secret with an environment fallback", () => {
    expect(SECRET_KEYS).toContain("brandfetchApiKey");
    expect(ENV_FALLBACK.brandfetchApiKey).toBe("BRANDFETCH_API_KEY");
    expect(getTypedSettings().brandfetchApiKey).toBeUndefined();
    process.env.BRANDFETCH_API_KEY = "bf-from-env-9999";
    expect(getTypedSettings().brandfetchApiKey).toBe("bf-from-env-9999");
  });

  it("is masked by GET /api/settings", async () => {
    setSetting("brandfetchApiKey", KEY);
    const body = await (await getSettings()).json();
    expect(body.brandfetchApiKey).toEqual({ configured: true, preview: "…1234", source: "settings" });
    expect(JSON.stringify(body)).not.toContain(KEY);
  });
});

describe("Brandfetch connection test", () => {
  it("is testable and reports a missing key without any request", async () => {
    expect(TESTABLE_PROVIDERS).toContain("brandfetch");
    expect(await testProviderKey("brandfetch")).toEqual({ ok: false, detail: "Aucune clé configurée" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("runs a single Brand Search request and reports the search is active — no image fetch", async () => {
    setSetting("brandfetchApiKey", KEY);
    fetchMock.mockResolvedValueOnce(
      json([{ brandId: "id_x", name: "Brandfetch", domain: "brandfetch.com", icon: "https://cdn.brandfetch.io/id_x/icon.webp" }]),
    );
    expect(await testProviderKey("brandfetch")).toEqual({
      ok: true,
      detail: "Client ID enregistré — la recherche Brandfetch est active.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [searchUrl, searchInit] = fetchMock.mock.calls[0];
    expect(String(searchUrl)).toBe(`https://api.brandfetch.io/v2/search/brandfetch?c=${KEY}`);
    expect((searchInit?.headers as Record<string, string>)["User-Agent"]).toMatch(/^ThumbGen\//);
    // Never requests the image CDN: Brandfetch forbids programmatic/server-side image access.
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("cdn.brandfetch.io"))).toBe(false);
  });

  it("succeeds even on an empty result array (the search itself is what's being tested)", async () => {
    setSetting("brandfetchApiKey", KEY);
    fetchMock.mockResolvedValueOnce(json([]));
    expect(await testProviderKey("brandfetch")).toEqual({
      ok: true,
      detail: "Client ID enregistré — la recherche Brandfetch est active.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a non-200 search response through the masking failure() helper", async () => {
    setSetting("brandfetchApiKey", KEY);
    fetchMock.mockResolvedValueOnce(json({ error: "client_id_invalid_signature" }, 403));
    const result = await testProviderKey("brandfetch");
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("HTTP 403");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("masks the key in a search error and stops there", async () => {
    setSetting("brandfetchApiKey", KEY);
    fetchMock.mockResolvedValueOnce(json({ error: { message: `Invalid client ${KEY}` } }, 401));
    const result = await testProviderKey("brandfetch");
    expect(result).toEqual({ ok: false, detail: "HTTP 401 · Invalid client …" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("is accepted by POST /api/settings/test", async () => {
    const res = await testRoute(new Request("http://localhost/api/settings/test?provider=brandfetch", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, detail: "Aucune clé configurée" });
  });
});
