import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { getTypedSettings, setSetting } from "@/lib/settings";
import { ENV_FALLBACK, SECRET_KEYS } from "@/lib/settings-schema";
import { TESTABLE_PROVIDERS, testProviderKey } from "@/lib/connection-tests";
import { GET as getSettings } from "@/app/api/settings/route";
import { POST as testRoute } from "@/app/api/settings/test/route";

const KEY = "tsk-secret-key-4242";
const fetchMock = vi.fn<typeof fetch>();
let savedEnv: string | undefined;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  getDb().exec("DELETE FROM settings");
  savedEnv = process.env.TYPESAFE_API_KEY;
  delete process.env.TYPESAFE_API_KEY;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (savedEnv === undefined) delete process.env.TYPESAFE_API_KEY;
  else process.env.TYPESAFE_API_KEY = savedEnv;
});

describe("typesafeApiKey setting", () => {
  it("is a secret with an environment fallback", () => {
    expect(SECRET_KEYS).toContain("typesafeApiKey");
    expect(ENV_FALLBACK.typesafeApiKey).toBe("TYPESAFE_API_KEY");
    expect(getTypedSettings().typesafeApiKey).toBeUndefined();
    process.env.TYPESAFE_API_KEY = "tsk-from-env-9999";
    expect(getTypedSettings().typesafeApiKey).toBe("tsk-from-env-9999");
  });

  it("is masked by GET /api/settings", async () => {
    setSetting("typesafeApiKey", KEY);
    const body = await (await getSettings()).json();
    expect(body.typesafeApiKey).toEqual({ configured: true, preview: "…4242", source: "settings" });
    expect(JSON.stringify(body)).not.toContain(KEY);
  });
});

describe("TypeSafe connection test", () => {
  it("is testable and reports a missing key without any request", async () => {
    expect(TESTABLE_PROVIDERS).toContain("typesafe");
    expect(await testProviderKey("typesafe")).toEqual({ ok: false, detail: "Aucune clé configurée" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats GET /v1/models 200 as a valid key", async () => {
    setSetting("typesafeApiKey", KEY);
    fetchMock.mockResolvedValueOnce(json({ data: [] }));
    expect(await testProviderKey("typesafe")).toEqual({ ok: true, detail: "Clé valide" });
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.typesafe.ai/v1/models");
  });

  it("is accepted by POST /api/settings/test", async () => {
    const res = await testRoute(new Request("http://localhost/api/settings/test?provider=typesafe", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, detail: "Aucune clé configurée" });
  });
});
