// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { LQ_MAX_BYTES, prepareThumbnailDownload } from "@/lib/canvas/download-thumbnail";

function stubRasterSource(width: number, height: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob([new Uint8Array(32)], { type: "image/png" }),
    })),
  );
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width, height, close: vi.fn() })),
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    return {
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("prepareThumbnailDownload (canvas)", () => {
  it("encodes LQ as JPEG under 5 MB from a 1280×720 source", async () => {
    stubRasterSource(1280, 720);
    const sizes: Array<{ w: number; h: number; type?: string }> = [];
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, cb, type) {
      sizes.push({ w: this.width, h: this.height, type });
      cb(new Blob([new Uint8Array(180_000)], { type: type || "image/jpeg" }));
    });

    const prepared = await prepareThumbnailDownload("/api/generated-images/image?id=src", "lq");
    expect(prepared.filename).toBe("miniature-leger.jpg");
    expect(prepared.blob.size).toBeLessThan(LQ_MAX_BYTES);
    expect(sizes[0]).toEqual({ w: 1280, h: 720, type: "image/jpeg" });
  });

  it("upscales to 3840×2160 for the 4K download", async () => {
    stubRasterSource(1280, 720);
    const sizes: Array<{ w: number; h: number; type?: string }> = [];
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, cb, type) {
      sizes.push({ w: this.width, h: this.height, type });
      cb(new Blob([new Uint8Array(900_000)], { type: type || "image/png" }));
    });

    const prepared = await prepareThumbnailDownload("/api/generated-images/image?id=src", "hq");
    expect(prepared.filename).toBe("miniature-4k.png");
    expect(sizes[0]).toEqual({ w: 3840, h: 2160, type: "image/png" });
  });

  it("keeps 9:16 on LQ (1080×1920) and HQ (2160×3840)", async () => {
    stubRasterSource(2160, 3840);
    const sizes: Array<{ w: number; h: number; type?: string }> = [];
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, cb, type) {
      sizes.push({ w: this.width, h: this.height, type });
      cb(new Blob([new Uint8Array(400_000)], { type: type || "image/png" }));
    });

    const lq = await prepareThumbnailDownload("/api/generated-images/image?id=portrait", "lq");
    expect(lq.filename).toBe("miniature-leger.jpg");
    expect(lq.blob.size).toBeLessThan(LQ_MAX_BYTES);
    expect(sizes[0]).toEqual({ w: 1080, h: 1920, type: "image/jpeg" });

    sizes.length = 0;
    const hq = await prepareThumbnailDownload("/api/generated-images/image?id=portrait", "hq");
    expect(hq.filename).toBe("miniature-4k.png");
    expect(sizes[0]).toEqual({ w: 2160, h: 3840, type: "image/png" });
  });
});
