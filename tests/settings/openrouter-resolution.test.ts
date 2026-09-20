import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getDb } from "@/lib/db";
import { setSetting, updateSettings } from "@/lib/settings";
import { POST } from "@/app/api/generate/openrouter/route";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  getDb().exec("DELETE FROM settings");
  setSetting("openrouterApiKey", "test-key");
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ data: [{ b64_json: "AAAA", media_type: "image/png" }], usage: {} }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function sentBody(extra: Record<string, unknown>): Promise<{ resolution: string; model: string }> {
  const res = await POST(
    new Request("http://localhost/api/generate/openrouter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "Une miniature", model: "gemini-3.1-flash-image", ...extra }),
    }) as never,
  );
  expect(res.status).toBe(200);
  return JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
}

describe("/api/generate/openrouter resolution", () => {
  it("uses the node's imageSize", async () => {
    updateSettings({ defaultResolution: "4K" });
    expect((await sentBody({ imageSize: "1K" })).resolution).toBe("1K");
  });

  it("falls back to defaultResolution when the node has none", async () => {
    updateSettings({ defaultResolution: "4K" });
    expect((await sentBody({})).resolution).toBe("4K");
  });

  it("falls back to defaultResolution (2K by default) for an unknown size", async () => {
    expect((await sentBody({ imageSize: "8K" })).resolution).toBe("2K");
  });

  it("still maps the model id to its OpenRouter slug", async () => {
    expect((await sentBody({})).model).toBe("google/gemini-3.1-flash-image");
  });
});
