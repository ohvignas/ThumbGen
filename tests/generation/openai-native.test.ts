import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import sharp from "sharp";
import { getDb } from "@/lib/db";
import { clearSetting, setSetting } from "@/lib/settings";
import { POST } from "@/app/api/generate/openrouter/route";
import {
  OPENAI_IMAGES_EDITS,
  OPENAI_IMAGES_GENERATIONS,
  buildOpenAIEditForm,
  decodeOpenAIReferenceImages,
  generateOpenAINative,
  isOpenAINativeModel,
  openaiInputFidelity,
  openaiNativeSize,
} from "@/lib/generation/openai-native";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function avifDataUrl(): Promise<string> {
  const bytes = await sharp({
    create: { width: 2, height: 2, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 128 } },
  })
    .avif()
    .toBuffer();
  return `data:image/avif;base64,${bytes.toString("base64")}`;
}

const fetchMock = vi.fn<typeof fetch>();
let previousOpenAIKey: string | undefined;
let previousOpenRouterKey: string | undefined;

beforeEach(() => {
  previousOpenAIKey = process.env.OPENAI_API_KEY;
  previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  getDb().exec("DELETE FROM settings");
  setSetting("openrouterApiKey", "or-test-key");
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ data: [{ b64_json: "aaaa" }], usage: { input_tokens: 9, output_tokens: 4, total_tokens: 13 } }), {
      status: 200,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  if (previousOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousOpenAIKey;
  if (previousOpenRouterKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = previousOpenRouterKey;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function postGenerate(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/generate/openrouter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
  );
}

describe("openai native helpers", () => {
  it("maps ThumbGen OpenAI ids to native models and fidelity", () => {
    expect(isOpenAINativeModel("gpt-image-1")).toBe(true);
    expect(isOpenAINativeModel("gpt-image-2.5-sunburst")).toBe(true);
    expect(isOpenAINativeModel("gemini-3.1-flash-image")).toBe(false);
    expect(openaiInputFidelity("gpt-image-1")).toBe("high");
    expect(openaiInputFidelity("gpt-image-2")).toBeNull();
    expect(openaiInputFidelity("gpt-image-2.5-flare")).toBeNull();
  });

  it("clamps gpt-image-1 to the three allowed sizes and maps 2/2.5 16:9 2K to 2048x1152", () => {
    expect(openaiNativeSize("gpt-image-1", "16x9", "4K")).toBe("1536x1024");
    expect(openaiNativeSize("gpt-image-1", "1x1", "1K")).toBe("1024x1024");
    expect(openaiNativeSize("gpt-image-1", "9x16", "2K")).toBe("1024x1536");
    expect(openaiNativeSize("gpt-image-2", "16x9", "2K")).toBe("2048x1152");
    expect(openaiNativeSize("gpt-image-2.5-sunburst", "16x9", "4K")).toBe("3840x2160");
    expect(openaiNativeSize("gpt-image-2.5-sunburst", "9x16", "4K")).toBe("2160x3840");
    expect(openaiNativeSize("gpt-image-2.5-flare", "9x16", "2K")).toBe("1152x2048");
  });

  it("rejects HTTP URLs and accepts identity data URLs in order", () => {
    expect(decodeOpenAIReferenceImages(["https://example.com/face.jpg"])).toEqual({
      error:
        "Les références OpenAI natives doivent être des fichiers (data URL), pas des liens HTTP. OpenAI /v1/images/edits n'accepte pas les URLs.",
    });
    const files = decodeOpenAIReferenceImages([TINY_PNG, TINY_PNG]);
    expect(Array.isArray(files)).toBe(true);
    if (!Array.isArray(files)) return;
    expect(files).toHaveLength(2);
    expect(files[0].filename).toBe("ref-1.png");
    expect(files[0].mime).toBe("image/png");
  });

  it("puts input_fidelity=high on gpt-image-1 edit forms and omits it for 2.5", () => {
    const files = decodeOpenAIReferenceImages([TINY_PNG]);
    if (!Array.isArray(files)) throw new Error("expected files");
    const withFidelity = buildOpenAIEditForm({
      model: "gpt-image-1",
      prompt: "thumb",
      size: "1536x1024",
      inputFidelity: "high",
      files,
    });
    expect(withFidelity.get("input_fidelity")).toBe("high");
    expect(withFidelity.getAll("image[]")).toHaveLength(1);

    const without = buildOpenAIEditForm({
      model: "gpt-image-2.5-sunburst",
      prompt: "thumb",
      size: "2048x1152",
      inputFidelity: null,
      files,
    });
    expect(without.get("input_fidelity")).toBeNull();
  });
});

describe("/api/generate/openrouter OpenAI native dispatch", () => {
  it("sends gpt-image-1 identity photos to api.openai.com edits with input_fidelity=high, identity first", async () => {
    setSetting("openaiApiKey", "sk-openai-test");
    const res = await postGenerate({
      prompt: "Young man on the right.",
      model: "gpt-image-1",
      aspectRatio: "16x9",
      imageSize: "2K",
      faceImages: [TINY_PNG, TINY_PNG],
      logos: [{ image: TINY_PNG, label: "Marque" }],
      referenceImages: [TINY_PNG],
    });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(OPENAI_IMAGES_EDITS);
    const init = fetchMock.mock.calls[0][1];
    expect(init?.headers).toEqual({ Authorization: "Bearer sk-openai-test" });
    const form = init?.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("model")).toBe("gpt-image-1");
    expect(form.get("input_fidelity")).toBe("high");
    expect(form.get("size")).toBe("1536x1024");
    expect(String(form.get("prompt"))).toContain("IDENTITY / AVATAR");
    expect(String(form.get("prompt"))).toMatch(/the person in the identity\/avatar reference photos/);
    expect(form.getAll("image[]")).toHaveLength(4);
    const json = await res.json();
    expect(json.stats).toMatchObject({ model: "gpt-image-1", inputTokens: 9, outputTokens: 4, totalTokens: 13 });
    expect(json.images).toHaveLength(1);
    const row = getDb().prepare("SELECT provider FROM generations_log ORDER BY created_at DESC LIMIT 1").get() as
      | { provider: string }
      | undefined;
    expect(row?.provider).toBe("openai");
  });

  it("omits input_fidelity for gpt-image-2.5-sunburst native edits", async () => {
    setSetting("openaiApiKey", "sk-openai-test");
    const res = await postGenerate({
      prompt: "Une miniature",
      model: "gpt-image-2.5-sunburst",
      faceImages: [TINY_PNG],
    });
    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe(OPENAI_IMAGES_EDITS);
    const form = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(form.get("model")).toBe("gpt-image-2.5-sunburst");
    expect(form.get("input_fidelity")).toBeNull();
    expect(form.get("size")).toBe("2048x1152");
  });

  it("uses /v1/images/generations JSON when an OpenAI model has no reference files", async () => {
    setSetting("openaiApiKey", "sk-openai-test");
    const res = await postGenerate({ prompt: "Une miniature", model: "gpt-image-2" });
    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe(OPENAI_IMAGES_GENERATIONS);
    const init = fetchMock.mock.calls[0][1];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "gpt-image-2",
      n: 1,
      size: "2048x1152",
    });
    expect(JSON.parse(String(init?.body))).not.toHaveProperty("input_fidelity");
  });

  it("keeps Seedream on OpenRouter even when an OpenAI key is present", async () => {
    setSetting("openaiApiKey", "sk-openai-test");
    const res = await postGenerate({
      prompt: "Une miniature",
      model: "bytedance-seed/seedream-4.5",
      faceImages: [TINY_PNG],
    });
    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://openrouter.ai/api/v1/images");
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(sent.model).toBe("bytedance-seed/seedream-4.5");
    expect(sent).not.toHaveProperty("input_fidelity");
  });

  it("keeps Gemini on OpenRouter even when an OpenAI key is present", async () => {
    setSetting("openaiApiKey", "sk-openai-test");
    const res = await postGenerate({
      prompt: "Une miniature",
      model: "gemini-3.1-flash-image",
      faceImages: [TINY_PNG],
    });
    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://openrouter.ai/api/v1/images");
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(sent.model).toBe("google/gemini-3.1-flash-image");
    expect(sent.input_references[0].image_url.url).toBe(TINY_PNG);
    expect(sent).not.toHaveProperty("input_fidelity");
  });

  it("falls back to OpenRouter for GPT Image when only the OpenRouter key is set", async () => {
    const res = await postGenerate({
      prompt: "Une miniature",
      model: "gpt-image-1",
      faceImages: [TINY_PNG],
    });
    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://openrouter.ai/api/v1/images");
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(sent.model).toBe("openai/gpt-image-1");
    expect(sent).not.toHaveProperty("input_fidelity");
  });

  it("transcodes AVIF identity photos so the OpenAI payload is never image/avif", async () => {
    setSetting("openaiApiKey", "sk-openai-test");
    const avif = await avifDataUrl();
    const res = await postGenerate({
      prompt: "Une miniature",
      model: "gpt-image-2.5-sunburst",
      faceImages: [avif, TINY_PNG],
    });
    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe(OPENAI_IMAGES_EDITS);
    const form = fetchMock.mock.calls[0][1]?.body as FormData;
    const blobs = form.getAll("image[]") as Blob[];
    expect(blobs).toHaveLength(2);
    expect(blobs.map((blob) => blob.type)).toEqual(["image/png", "image/png"]);
    expect(blobs.some((blob) => blob.type.includes("avif"))).toBe(false);
    const files = decodeOpenAIReferenceImages([avif]);
    expect(files).toEqual({
      error: "Format d'image non supporté par OpenAI (image/avif). PNG, JPEG ou WebP.",
    });
  });

  it("keeps the French format error when an AVIF reference cannot be converted", async () => {
    setSetting("openaiApiKey", "sk-openai-test");
    const res = await postGenerate({
      prompt: "Une miniature",
      model: "gpt-image-2.5-sunburst",
      faceImages: [`data:image/avif;base64,${Buffer.from("not-an-image").toString("base64")}`],
    });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.error).toBe("Format d'image non supporté par OpenAI (image/avif). PNG, JPEG ou WebP.");
    expect(json.provider).toBe("openai");
  });

  it("rejects native OpenAI identity images that are not data URLs", async () => {
    setSetting("openaiApiKey", "sk-openai-test");
    const res = await postGenerate({
      prompt: "Une miniature",
      model: "gpt-image-1",
      faceImages: ["https://cdn.example/face.jpg"],
    });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.error).toMatch(/data URL/);
    expect(json.provider).toBe("openai");
  });

  it("falls back to OpenRouter when native OpenAI returns 429 and an OpenRouter key exists", async () => {
    setSetting("openaiApiKey", "sk-openai-test");
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "You have no credits remaining" } }), { status: 429 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ b64_json: "bbbb" }], usage: { total_tokens: 4 } }), { status: 200 }),
      );
    const res = await postGenerate({ prompt: "Une miniature", model: "gpt-image-2.5-sunburst" });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toBe(OPENAI_IMAGES_GENERATIONS);
    expect(String(fetchMock.mock.calls[1][0])).toBe("https://openrouter.ai/api/v1/images");
    const json = await res.json();
    expect(json.images).toHaveLength(1);
    const row = getDb().prepare("SELECT provider, status FROM generations_log ORDER BY created_at DESC LIMIT 1").get() as
      | { provider: string; status: string }
      | undefined;
    expect(row).toMatchObject({ provider: "openrouter", status: "success" });
  });

  it("returns a French credit message when OpenAI has no credits and OpenRouter is unset", async () => {
    setSetting("openaiApiKey", "sk-openai-test");
    clearSetting("openrouterApiKey");
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "You have no credits remaining" } }), { status: 429 }),
    );
    const res = await postGenerate({ prompt: "Une miniature", model: "gpt-image-2.5-sunburst" });
    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const json = await res.json();
    expect(json.error).toMatch(/Crédits OpenAI/);
    expect(json.provider).toBe("openai");
    expect(json.status).toBe(429);
    expect(json.error).not.toMatch(/Generation ?failed/i);
  });

  it("does not fall back to OpenRouter on a native 400", async () => {
    setSetting("openaiApiKey", "sk-openai-test");
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "invalid size" } }), { status: 400 }),
    );
    const res = await postGenerate({ prompt: "Une miniature", model: "gpt-image-2.5-sunburst" });
    expect(res.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const json = await res.json();
    expect(json.error).toMatch(/invalid size/);
    expect(json.provider).toBe("openai");
  });

  it("falls back to OpenRouter when the native fetch throws", async () => {
    setSetting("openaiApiKey", "sk-openai-test");
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ b64_json: "cccc" }], usage: {} }), { status: 200 }),
      );
    const res = await postGenerate({ prompt: "Une miniature", model: "gpt-image-2.5-sunburst" });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toBe("https://openrouter.ai/api/v1/images");
  });

  it("returns a 502 failure object when generateOpenAINative fetch throws", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const result = await generateOpenAINative({
      apiKey: "sk-test",
      modelId: "gpt-image-2.5-sunburst",
      prompt: "thumb",
      size: "2048x1152",
      files: [],
    });
    expect(result).toMatchObject({ ok: false, status: 502 });
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toMatch(/fetch failed/);
  });

  it("surfaces the real parse error instead of Generation failed", async () => {
    const res = await POST(
      new Request("http://localhost/api/generate/openrouter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not-json",
      }) as never,
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    const json = await res.json();
    expect(json.error).not.toMatch(/Generation ?failed/i);
    expect(json.error).toBeTruthy();
    expect(String(json.error)).toContain(" ");
    expect(json.provider).toBe("openrouter");
  });

  it("maps truncated incoming JSON to Payload trop volumineux without claiming seedream ran", async () => {
    const res = await POST({
      headers: { get: () => null },
      text: async () => {
        throw new SyntaxError("Unterminated string in JSON at position 10458271");
      },
      json: async () => {
        throw new SyntaxError("Unterminated string in JSON at position 10458271");
      },
    } as never);
    expect(res.status).toBe(413);
    const json = await res.json();
    expect(json.error).toBe("Payload trop volumineux");
    expect(json.error).not.toMatch(/Unterminated/);
    expect(console.error).toHaveBeenCalled();
    const generateLogs = vi.mocked(console.log).mock.calls.filter((call) => String(call[0]).includes("[generate]"));
    expect(JSON.stringify(generateLogs)).not.toContain("bytedance-seed/seedream-4.5");
    expect(JSON.stringify(generateLogs)).toMatch(/unknown/);
  });

  it("runs the requested GPT Image model, not seedream, when the body parses", async () => {
    const res = await postGenerate({
      prompt: "Une miniature",
      model: "gpt-image-2.5-sunburst",
    });
    expect(res.status).toBe(200);
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(sent.model).toBe("openai/gpt-image-2.5-sunburst");
    expect(sent.model).not.toBe("bytedance-seed/seedream-4.5");
  });

  it("rejects an unknown model instead of silently running seedream", async () => {
    const res = await postGenerate({ prompt: "Une miniature", model: "not-a-real-model" });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Modèle inconnu/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves a stored:gi_ ref on the server so the client need not send base64", async () => {
    getDb()
      .prepare("INSERT INTO generated_images (id, mime_type, data) VALUES (?, ?, ?)")
      .run("gi-resolve-1", "image/png", Buffer.from([1, 2, 3, 4]));
    const res = await postGenerate({
      prompt: "Une miniature",
      model: "gemini-3.1-flash-image",
      editImages: ["stored:gi_gi-resolve-1"],
    });
    expect(res.status).toBe(200);
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(sent.input_references[0].image_url.url).toMatch(/^data:image\/png;base64,/);
    expect(JSON.stringify({ prompt: "Une miniature", editImages: ["stored:gi_gi-resolve-1"] }).length).toBeLessThan(
      200,
    );
  });
});
