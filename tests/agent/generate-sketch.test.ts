import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getDb } from "@/lib/db";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  // Seed the API key into settings so the tool finds it
  getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
    .run("geminiApiKey", "test-key");
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
        candidates: [
          {
            content: {
              parts: [
                { inlineData: { mimeType: "image/png", data: onePxPng } },
              ],
            },
          },
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
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
    getDb().prepare("DELETE FROM settings WHERE key = ?").run("geminiApiKey");
    const { generateSketchTool } = await import("@/lib/agent/tools/generate-sketch");
    const r = await generateSketchTool.handler({ prompt: "x" });
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toMatch(/API key/i);
  });

  it("returns error on Gemini failure", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "internal",
      json: async () => ({}),
    });

    const { generateSketchTool } = await import("@/lib/agent/tools/generate-sketch");
    const r = await generateSketchTool.handler({ prompt: "x" });
    expect(r.isError).toBe(true);
  });

  it("defaults aspect_ratio to 16x9", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: onePxPng } }] } }],
      }),
    });
    const { generateSketchTool } = await import("@/lib/agent/tools/generate-sketch");
    const r = await generateSketchTool.handler({ prompt: "x" });
    expect(r.isError).toBeFalsy();
    // verify the call body included 16:9
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.generationConfig.imageConfig.aspectRatio).toBe("16:9");
  });
});
