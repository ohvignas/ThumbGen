import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import sharp from "sharp";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";
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
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
    expect(sent.prompt).toContain("IDENTITY / AVATAR");
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

  it("labels competitor thumbs as layout-only and rewrites Young man when a Personnage is connected", async () => {
    const sent = await send({
      prompt: "Young man in the right third of the foreground, mouth closed.",
      projectId: "proj_1789746108631",
      faceImages: ["data:front", "data:left", "data:right"],
      logos: [{ image: "data:logo", label: "Claude" }],
      referenceImages: ["data:competitor-other-face"],
      sketchImages: ["data:sketch"],
    });
    expect(referenceUrls(sent)).toEqual([
      "data:front",
      "data:left",
      "data:right",
      "data:logo",
      "data:competitor-other-face",
      "data:sketch",
    ]);
    expect(sent.prompt).toMatch(/^the person in the identity\/avatar reference photos/);
    expect(sent.prompt).not.toMatch(/^Young man/);
    expect(sent.prompt).toContain("IDENTITY / AVATAR");
    expect(sent.prompt).toContain("Do not invent a new head");
    expect(sent.prompt).toContain("COMPOSITION / LAYOUT only");
    expect(sent.prompt).toContain("NEVER copy a face, head, or identity");
    expect(console.log).toHaveBeenCalledWith(
      "[generate] start",
      expect.objectContaining({
        projectId: "proj_1789746108631",
        identity: 3,
        logos: 1,
        composition: 1,
        sketch: 1,
        provider: "openrouter",
      }),
    );
    const row = getDb()
      .prepare("SELECT project_id FROM generations_log WHERE project_id = ?")
      .get("proj_1789746108631") as { project_id: string } | undefined;
    expect(row?.project_id).toBe("proj_1789746108631");
  });

  it("transcodes AVIF refs so OpenRouter never receives image/avif", async () => {
    const avif = await sharp({
      create: { width: 2, height: 2, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 128 } },
    })
      .avif()
      .toBuffer();
    const sent = await send({
      prompt: "Une miniature",
      faceImages: [`data:image/avif;base64,${avif.toString("base64")}`],
    });
    expect(referenceUrls(sent)).toHaveLength(1);
    expect(referenceUrls(sent)[0]).toMatch(/^data:image\/png;base64,/);
    expect(referenceUrls(sent)[0]).not.toContain("image/avif");
  });

  it("instructs the model to ignore faces on composition refs even without a Personnage", async () => {
    const sent = await send({ prompt: "Une miniature", referenceImages: ["data:r"] });
    expect(sent.prompt).toContain("Une miniature");
    expect(sent.prompt).toContain("COMPOSITION / LAYOUT only");
    expect(sent.prompt).toContain("NEVER copy a face");
    expect(referenceUrls(sent)).toEqual(["data:r"]);
  });

  it("sends a generated thumb first as the edit source, then identity", async () => {
    const sent = await send({
      prompt: "Change the overlay to C'EST FINI ?. Keep the rest of the thumbnail unchanged.",
      editImages: ["data:generated-thumb"],
      faceImages: ["data:face"],
      logos: [{ image: "data:logo", label: "OpenClaw" }],
      referenceImages: ["data:competitor"],
    });
    expect(referenceUrls(sent)).toEqual([
      "data:generated-thumb",
      "data:face",
      "data:logo",
      "data:competitor",
    ]);
    expect(sent.prompt).toContain("Reference image 1 is the SOURCE THUMBNAIL to edit");
    expect(sent.prompt).toContain("Do not recreate the scene from scratch");
    expect(sent.prompt).toContain("IDENTITY / AVATAR");
    expect(sent.prompt).toContain("COMPOSITION / LAYOUT only");
  });
});
