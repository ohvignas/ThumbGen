import fs from "fs";
import path from "path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getDb, getDbFilePath } from "@/lib/db";
import { saveGeneratedImage } from "@/lib/generated-images";
import { GET as getGeneratedImageRoute } from "@/app/api/generated-images/image/route";
import { DISPLAY_THUMB_WIDTH, withDisplayThumb } from "@/lib/images/display-thumb";
import { encodeBaselineThumb } from "@/lib/images/display-thumb-cache";

function jpegSof(buf: Buffer): number | null {
  let i = 0;
  while (i < buf.length - 3) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xd8) {
      i += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return null;
    if (marker === 0xc0 || marker === 0xc2) return marker;
    if (marker === 0x00 || marker === 0xff) {
      i += 1;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    i += 2 + len;
  }
  return null;
}

async function progressiveJpeg(): Promise<Buffer> {
  const width = 2000;
  const height = 1200;
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 17) & 255;
  return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 90, progressive: true }).toBuffer();
}

describe("withDisplayThumb", () => {
  it("adds the display width only for stored generated images and sketches", () => {
    expect(withDisplayThumb("/api/generated-images/image?id=abc")).toBe(
      `/api/generated-images/image?id=abc&w=${DISPLAY_THUMB_WIDTH}`,
    );
    expect(withDisplayThumb("/api/generated-sketches/sk_abc")).toBe(
      `/api/generated-sketches/sk_abc?w=${DISPLAY_THUMB_WIDTH}`,
    );
    expect(withDisplayThumb("/api/logos/image?f=brand.png")).toBe("/api/logos/image?f=brand.png");
    expect(withDisplayThumb("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    expect(withDisplayThumb("https://i.ytimg.com/vi/x/hqdefault.jpg")).toBe("https://i.ytimg.com/vi/x/hqdefault.jpg");
  });
});

describe("encodeBaselineThumb", () => {
  it("turns a progressive JPEG into a smaller baseline JPEG at the display width", async () => {
    const source = await progressiveJpeg();
    expect(jpegSof(source)).toBe(0xc2);

    const thumb = await encodeBaselineThumb(source);
    const meta = await sharp(thumb).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(DISPLAY_THUMB_WIDTH);
    expect(meta.isProgressive).toBe(false);
    expect(jpegSof(thumb)).toBe(0xc0);
    expect(thumb.length).toBeLessThan(source.length);
  });
});

describe("GET /api/generated-images/image", () => {
  it("serves a cached baseline thumb with Content-Length, and the full blob without w", async () => {
    const source = await progressiveJpeg();
    const saved = saveGeneratedImage(`data:image/jpeg;base64,${source.toString("base64")}`);
    const id = saved.id;
    const before = getDb().prepare("SELECT data FROM generated_images WHERE id = ?").get(id) as { data: Buffer };

    const thumbRes = await getGeneratedImageRoute(
      new NextRequest(`http://localhost/api/generated-images/image?id=${id}&w=${DISPLAY_THUMB_WIDTH}`),
    );
    expect(thumbRes.status).toBe(200);
    expect(thumbRes.headers.get("content-type")).toBe("image/jpeg");
    expect(thumbRes.headers.get("cache-control")).toContain("immutable");
    const thumbBody = Buffer.from(await thumbRes.arrayBuffer());
    expect(thumbRes.headers.get("content-length")).toBe(String(thumbBody.length));
    expect(jpegSof(thumbBody)).toBe(0xc0);
    expect((await sharp(thumbBody).metadata()).width).toBe(DISPLAY_THUMB_WIDTH);
    expect(thumbBody.length).toBeLessThan(source.length);

    const cacheDir = path.join(path.dirname(getDbFilePath()), "cache", "image-thumbs");
    const cached = fs.readdirSync(cacheDir).filter((name) => name.includes(id) && name.endsWith(".jpg"));
    expect(cached).toHaveLength(1);

    const again = await getGeneratedImageRoute(
      new NextRequest(`http://localhost/api/generated-images/image?id=${id}&w=${DISPLAY_THUMB_WIDTH}`),
    );
    expect(Buffer.from(await again.arrayBuffer()).equals(thumbBody)).toBe(true);

    const full = await getGeneratedImageRoute(new NextRequest(`http://localhost/api/generated-images/image?id=${id}`));
    const fullBody = Buffer.from(await full.arrayBuffer());
    expect(full.headers.get("content-type")).toBe("image/jpeg");
    expect(full.headers.get("content-length")).toBe(String(source.length));
    expect(fullBody.equals(source)).toBe(true);

    const otherWidth = await getGeneratedImageRoute(
      new NextRequest(`http://localhost/api/generated-images/image?id=${id}&w=64`),
    );
    expect(otherWidth.headers.get("content-length")).toBe(String(source.length));

    const after = getDb().prepare("SELECT data FROM generated_images WHERE id = ?").get(id) as { data: Buffer };
    expect(after.data.equals(before.data)).toBe(true);
  });
});
