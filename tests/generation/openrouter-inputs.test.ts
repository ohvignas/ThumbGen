import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import { POST } from "@/app/api/generate/openrouter/route";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  getDb().exec("DELETE FROM settings");
  setSetting("openrouterApiKey", "test-key");
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [], usage: {} }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

type SentBody = { prompt: string; input_references?: { type: string; image_url: { url: string } }[] };

async function send(body: Record<string, unknown>): Promise<SentBody> {
  const res = await POST(
    new Request("http://localhost/api/generate/openrouter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "gemini-3.1-flash-image", ...body }),
    }) as never,
  );
  expect(res.status).toBe(200);
  return JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
}

const referenceUrls = (sent: SentBody) => (sent.input_references ?? []).map((ref) => ref.image_url.url);

describe("/api/generate/openrouter inputs", () => {
  it("sends faces, then logos, then references, then the sketch", async () => {
    const sent = await send({
      prompt: "Une miniature",
      faceImages: ["data:face"],
      logos: [{ image: "data:logo", label: "Marque" }],
      referenceImages: ["data:ref"],
      sketchImages: ["data:sketch"],
    });
    expect(referenceUrls(sent)).toEqual(["data:face", "data:logo", "data:ref", "data:sketch"]);
  });

  it("tells the model which reference images are logos and that the last one is a layout sketch", async () => {
    const sent = await send({
      prompt: "Une miniature",
      faceImages: ["data:f1", "data:f2"],
      logos: [
        { image: "data:l1", label: "Marque" },
        { image: "data:l2", label: "Studio" },
      ],
      sketchImages: ["data:s"],
    });
    expect(sent.prompt).toContain("Reference images 3 to 4 are logos to include in the thumbnail: Marque, Studio.");
    expect(sent.prompt).toContain("The last reference image is a rough COMPOSITION SKETCH.");
  });

  it("forwards one sketch at most and skips malformed logos", async () => {
    const sent = await send({
      prompt: "Une miniature",
      logos: [{ label: "sans image" }, "data:bad", { image: "data:l", label: "" }],
      sketchImages: ["data:s1", "data:s2"],
    });
    expect(referenceUrls(sent)).toEqual(["data:l", "data:s1"]);
    expect(sent.prompt).toContain("Reference image 1 is a logo to include in the thumbnail: Logo.");
  });

  it("accepts a sketch as the only input", async () => {
    const sent = await send({ sketchImages: ["data:s"] });
    expect(referenceUrls(sent)).toEqual(["data:s"]);
  });

  it("leaves the prompt untouched without logos or sketches", async () => {
    const sent = await send({ prompt: "Une miniature", referenceImages: ["data:r"] });
    expect(sent.prompt).toBe("Une miniature");
    expect(referenceUrls(sent)).toEqual(["data:r"]);
  });
});
