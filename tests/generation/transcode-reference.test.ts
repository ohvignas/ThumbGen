import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { decodeOpenAIReferenceImages } from "@/lib/generation/openai-native";
import { transcodeReferenceImage, transcodeReferenceImages } from "@/lib/generation/transcode-reference";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function avifDataUrl(alpha = 128): Promise<string> {
  const bytes = await sharp({
    create: { width: 2, height: 2, channels: 4, background: { r: 10, g: 20, b: 30, alpha } },
  })
    .avif()
    .toBuffer();
  return `data:image/avif;base64,${bytes.toString("base64")}`;
}

describe("transcodeReferenceImage", () => {
  it("leaves PNG, JPEG, WebP, and non-data URLs unchanged", async () => {
    const jpeg =
      "data:image/jpeg;base64," +
      (await sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 1, g: 2, b: 3 } } })
        .jpeg()
        .toBuffer()
      ).toString("base64");
    const webp =
      "data:image/webp;base64," +
      (await sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 4, g: 5, b: 6 } } })
        .webp()
        .toBuffer()
      ).toString("base64");
    expect(await transcodeReferenceImage(TINY_PNG)).toBe(TINY_PNG);
    expect(await transcodeReferenceImage(jpeg)).toBe(jpeg);
    expect(await transcodeReferenceImage(webp)).toBe(webp);
    expect(await transcodeReferenceImage("https://cdn.example/face.avif")).toBe("https://cdn.example/face.avif");
    expect(await transcodeReferenceImage("data:face")).toBe("data:face");
    expect(await transcodeReferenceImage("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
  });

  it("transcodes AVIF (including alpha) to PNG", async () => {
    const avif = await avifDataUrl(128);
    const out = await transcodeReferenceImage(avif);
    expect(out).toMatch(/^data:image\/png;base64,/);
    expect(out).not.toContain("image/avif");
    const meta = await sharp(Buffer.from(out.slice(out.indexOf(",") + 1), "base64")).metadata();
    expect(meta.format).toBe("png");
    expect(meta.hasAlpha).toBe(true);
    expect(meta.width).toBe(2);
    expect(meta.height).toBe(2);
  });

  it("transcodes GIF to PNG", async () => {
    const gif = await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 9, g: 8, b: 7 } } })
      .gif()
      .toBuffer();
    const out = await transcodeReferenceImage(`data:image/gif;base64,${gif.toString("base64")}`);
    expect(out).toMatch(/^data:image\/png;base64,/);
    expect((await sharp(Buffer.from(out.split(",")[1], "base64")).metadata()).format).toBe("png");
  });

  it("transcodes AVIF bytes that were mislabeled as PNG", async () => {
    const avif = await avifDataUrl();
    const bytes = avif.slice(avif.indexOf(",") + 1);
    const out = await transcodeReferenceImage(`data:image/png;base64,${bytes}`);
    expect(out).toMatch(/^data:image\/png;base64,/);
    expect(out).not.toBe(`data:image/png;base64,${bytes}`);
    expect((await sharp(Buffer.from(out.split(",")[1], "base64")).metadata()).format).toBe("png");
  });

  it("keeps the French OpenAI format error when conversion fails", async () => {
    const bad = `data:image/avif;base64,${Buffer.from("not-an-image").toString("base64")}`;
    await expect(transcodeReferenceImage(bad)).rejects.toThrow(
      "Format d'image non supporté par OpenAI (image/avif). PNG, JPEG ou WebP.",
    );
  });

  it("transcodes a list in order", async () => {
    const avif = await avifDataUrl();
    const out = await transcodeReferenceImages([TINY_PNG, avif, "data:logo"]);
    expect(out).toHaveLength(3);
    expect(out[0]).toBe(TINY_PNG);
    expect(out[1]).toMatch(/^data:image\/png;base64,/);
    expect(out[2]).toBe("data:logo");
  });
});

describe("decodeOpenAIReferenceImages after transcode", () => {
  it("never receives image/avif once references are transcoded", async () => {
    const files = decodeOpenAIReferenceImages(await transcodeReferenceImages([await avifDataUrl(), TINY_PNG]));
    expect(Array.isArray(files)).toBe(true);
    if (!Array.isArray(files)) return;
    expect(files.map((file) => file.mime)).toEqual(["image/png", "image/png"]);
    expect(files.some((file) => file.mime.includes("avif"))).toBe(false);
  });
});
