import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import { POST } from "@/app/api/generate/openrouter/route";

// F2: the route must surface *why* OpenRouter rejected a request (e.g. an
// unsupported resolution for a given model) instead of just the bare status
// code, without ever making a real network call.
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  getDb().exec("DELETE FROM settings");
  setSetting("openrouterApiKey", "test-key");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function postGenerate(extra: Record<string, unknown> = {}) {
  return POST(
    new Request("http://localhost/api/generate/openrouter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "Une miniature", model: "gemini-3.1-flash-image", ...extra }),
    }) as never,
  );
}

describe("/api/generate/openrouter error passthrough", () => {
  it("extracts error.message from a JSON error body", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "resolution '4K' is not supported by this model", code: "invalid_request" } }), {
        status: 400,
      }),
    );

    const res = await postGenerate({ imageSize: "4K" });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("OpenRouter API error: 400 — resolution '4K' is not supported by this model");
  });

  it("falls back to the status code for a non-JSON error body", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Bad Gateway</html>", { status: 502 }));

    const res = await postGenerate();
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error).toBe("OpenRouter API error: 502");
  });

  it("falls back to the status code when the JSON body has no error.message", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { code: "rate_limited" } }), { status: 429 }));

    const res = await postGenerate();
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error).toBe("OpenRouter API error: 429");
  });

  it("truncates an unreasonably long error message", async () => {
    const longMessage = "x".repeat(1000);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: longMessage } }), { status: 400 }));

    const res = await postGenerate();
    const json = await res.json();

    expect(json.error.length).toBeLessThan(350);
    expect(json.error).toContain("…");
  });

  it("never includes the Authorization header or key in the returned error", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: "invalid model" } }), { status: 400 }));

    const res = await postGenerate();
    const json = await res.json();

    expect(json.error).not.toContain("test-key");
    expect(json.error).not.toContain("Bearer");
    expect(json.error).not.toContain("Authorization");
  });

  it("never makes more than the one mocked fetch call (no real network call)", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: "boom" } }), { status: 400 }));

    await postGenerate();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps Gemini content moderation to French instead of the raw OpenRouter string", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Gemini blocked this request through content moderation." } }), {
        status: 400,
      }),
    );

    const res = await postGenerate();
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Requête bloquée par la modération de contenu");
    expect(json.error).not.toMatch(/Gemini blocked|content moderation/i);
  });

  it("treats a 200 with no image data as an error", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));

    const res = await postGenerate();
    const json = await res.json();

    expect(res.ok).toBe(false);
    expect(json.error).toMatch(/aucune image/i);
  });
});
