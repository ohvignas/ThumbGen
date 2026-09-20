import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getDb } from "@/lib/db";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  // Seed the API key into settings so the tool finds it
  getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
    .run("openrouterApiKey", "test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const onePxPng =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZkqfO0AAAAASUVORK5CYII=";

describe("generate_sketch", () => {
  it("creates a sketch and returns a generated:* reference", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ b64_json: onePxPng, media_type: "image/png" }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    });

    const { generateSketchTool } = await import("@/lib/agent/tools/generate-sketch");
    const r = await generateSketchTool.handler({ prompt: "cat in space", aspect_ratio: "16x9" });

    expect(r.isError).toBeFalsy();
    const text = (r.content[0] as { text: string }).text;
    expect(text).toMatch(/Reference: generated:sk_/);
    expect(r.content[1].type).toBe("image");
    expect((r.content[1] as { mimeType: string }).mimeType).toBe("image/png");

    // Verify it was persisted in generated_sketches
    const m = text.match(/generated:(sk_\w+)/);
    expect(m).toBeTruthy();
    const id = m![1];
    const row = getDb().prepare("SELECT prompt, mime_type FROM generated_sketches WHERE id = ?").get(id) as { prompt: string; mime_type: string };
    expect(row.prompt).toBe("cat in space");
    expect(row.mime_type).toBe("image/png");
  });

  it("returns error when API key is missing", async () => {
    getDb().prepare("DELETE FROM settings WHERE key = ?").run("openrouterApiKey");
    const previousEnv = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      const { generateSketchTool } = await import("@/lib/agent/tools/generate-sketch");
      const r = await generateSketchTool.handler({ prompt: "x" });
      expect(r.isError).toBe(true);
      expect((r.content[0] as { text: string }).text).toMatch(/API key|Clé API/i);
      expect(r.requestNotSent).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      if (previousEnv !== undefined) process.env.OPENROUTER_API_KEY = previousEnv;
    }
  });

  it("marks an unreadable image source and a network failure as never sent", async () => {
    const { generateSketchTool } = await import("@/lib/agent/tools/generate-sketch");
    const badSource = await generateSketchTool.handler({ prompt: "x", reference_sources: ["stored:sf_does-not-exist"] });
    expect(badSource.isError).toBe(true);
    expect(badSource.requestNotSent).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    const network = await generateSketchTool.handler({ prompt: "x" });
    expect(network.isError).toBe(true);
    expect(network.requestNotSent).toBe(true);
  });

  it("does not mark a request the provider answered as never sent", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [] }) });
    const { generateSketchTool } = await import("@/lib/agent/tools/generate-sketch");
    const noImage = await generateSketchTool.handler({ prompt: "x" });
    expect(noImage.isError).toBe(true);
    expect(noImage.requestNotSent).toBeUndefined();
  });

  it("returns error on OpenRouter failure", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "internal",
      json: async () => ({}),
    });

    const { generateSketchTool } = await import("@/lib/agent/tools/generate-sketch");
    const r = await generateSketchTool.handler({ prompt: "x" });
    expect(r.isError).toBe(true);
    expect(r.requestNotSent).toBeUndefined();
  });

  it("defaults aspect_ratio to 16x9", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ b64_json: onePxPng, media_type: "image/png" }],
      }),
    });
    const { generateSketchTool } = await import("@/lib/agent/tools/generate-sketch");
    const r = await generateSketchTool.handler({ prompt: "x" });
    expect(r.isError).toBeFalsy();
    // verify the call body included 16:9 and hit OpenRouter's images endpoint
    expect(fetchMock.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/images");
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.aspect_ratio).toBe("16:9");
    expect(callBody.model).toBe("google/gemini-3.1-flash-image");
  });

  it("draws with Gemini 3.1 Flash Image at the same cost", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ b64_json: onePxPng, media_type: "image/png" }] }),
    });
    const { generateSketchTool } = await import("@/lib/agent/tools/generate-sketch");
    const r = await generateSketchTool.handler({ prompt: "model check" });
    expect(r.isError).toBeFalsy();
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.model).toBe("google/gemini-3.1-flash-image");
    const id = (r.content[0] as { text: string }).text.match(/generated:(sk_\w+)/)![1];
    const row = getDb().prepare("SELECT cost_estimate FROM generated_sketches WHERE id = ?").get(id) as { cost_estimate: number };
    expect(row.cost_estimate).toBe(0.02);
  });

  it("wraps a face/reference image as a tagged input_references object, not a bare string", async () => {
    const bytes = Buffer.from(onePxPng, "base64");
    getDb().prepare("INSERT OR REPLACE INTO personas (id, label) VALUES (?, ?)").run("test1", "Test persona");
    getDb()
      .prepare("INSERT OR REPLACE INTO persona_photos (id, persona_id, angle, mime_type, size, data) VALUES (?, ?, ?, ?, ?, ?)")
      .run("test1-front", "test1", "front", "image/png", bytes.length, bytes);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ b64_json: onePxPng, media_type: "image/png" }] }),
    });
    const { generateSketchTool } = await import("@/lib/agent/tools/generate-sketch");
    const r = await generateSketchTool.handler({ prompt: "x", face_source: "stored:persona_test1" });
    expect(r.isError).toBeFalsy();
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.input_references).toHaveLength(1);
    expect(callBody.input_references[0]).toMatchObject({ type: "image_url" });
    expect(callBody.input_references[0].image_url.url).toMatch(/^data:image\/png;base64,/);
    expect(callBody.prompt).toContain("IDENTITY / AVATAR");
    expect(callBody.prompt).toContain("Do not invent a new head");
    expect(callBody.prompt).toContain("STRICT reference");
  });
});
