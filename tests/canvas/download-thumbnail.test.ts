import { describe, it, expect, afterEach, vi } from "vitest";
import {
  HQ_HEIGHT,
  HQ_PNG_MAX_BYTES,
  HQ_SQUARE,
  HQ_WIDTH,
  LQ_MAX_BYTES,
  coverCrop,
  downloadThumbnail,
  encode4kThumbnail,
  encodeLightThumbnail,
  fitInside,
  hqFrameSize,
  lqFrameSizes,
} from "@/lib/canvas/download-thumbnail";

describe("coverCrop", () => {
  it("uses the full frame when the source is already 16:9", () => {
    expect(coverCrop(1280, 720, HQ_WIDTH, HQ_HEIGHT)).toEqual({ sx: 0, sy: 0, sw: 1280, sh: 720 });
  });

  it("center-crops a square source onto 16:9", () => {
    const crop = coverCrop(1000, 1000, HQ_WIDTH, HQ_HEIGHT);
    expect(crop.sw).toBe(1000);
    expect(crop.sh).toBeCloseTo(1000 * (HQ_HEIGHT / HQ_WIDTH));
    expect(crop.sx).toBe(0);
    expect(crop.sy).toBeCloseTo((1000 - crop.sh) / 2);
  });
});

describe("lqFrameSizes", () => {
  it("does not upscale a 1280×720 source", () => {
    expect(lqFrameSizes(1280, 720)[0]).toEqual({ width: 1280, height: 720 });
    expect(lqFrameSizes(1280, 720)).toEqual([
      { width: 1280, height: 720 },
      { width: 960, height: 540 },
    ]);
  });

  it("starts a 4K 16:9 source at 1920×1080, then 1280×720", () => {
    expect(lqFrameSizes(3840, 2160)[0]).toEqual({ width: 1920, height: 1080 });
    expect(lqFrameSizes(3840, 2160)[1]).toEqual({ width: 1280, height: 720 });
  });

  it("keeps a small source at its own 16:9 crop (no upscale)", () => {
    expect(fitInside(640, 360, 1920, 1080)).toEqual({ width: 640, height: 360 });
    expect(lqFrameSizes(640, 360)).toEqual([{ width: 640, height: 360 }]);
  });

  it("keeps a 9:16 source as portrait (never crops to landscape 16:9)", () => {
    expect(lqFrameSizes(2160, 3840)).toEqual([
      { width: 1080, height: 1920 },
      { width: 720, height: 1280 },
      { width: 540, height: 960 },
    ]);
    expect(lqFrameSizes(1080, 1920)[0]).toEqual({ width: 1080, height: 1920 });
  });
});

describe("hqFrameSize", () => {
  it("maps 16:9 to landscape 4K and 9:16 to portrait 4K", () => {
    expect(hqFrameSize(1280, 720)).toEqual({ width: 3840, height: 2160 });
    expect(hqFrameSize(3840, 2160)).toEqual({ width: HQ_WIDTH, height: HQ_HEIGHT });
    expect(hqFrameSize(2160, 3840)).toEqual({ width: 2160, height: 3840 });
    expect(hqFrameSize(1080, 1920)).toEqual({ width: 2160, height: 3840 });
  });

  it("maps 1:1 to the product 4K square (2880), not landscape 4K", () => {
    expect(hqFrameSize(1024, 1024)).toEqual({ width: HQ_SQUARE, height: HQ_SQUARE });
  });
});

describe("encodeLightThumbnail", () => {
  it("encodes 1280×720 JPEG when that file is already under 5 MB", async () => {
    const calls: Array<{ mime: string; width: number; height: number; quality?: number }> = [];
    const encoded = await encodeLightThumbnail(1280, 720, async (opts) => {
      calls.push(opts);
      return new Uint8Array(400_000);
    });
    expect(encoded.filename).toBe("miniature-leger.jpg");
    expect(encoded.mime).toBe("image/jpeg");
    expect(encoded.width).toBe(1280);
    expect(encoded.height).toBe(720);
    expect(encoded.bytes.byteLength).toBeLessThan(LQ_MAX_BYTES);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ mime: "image/jpeg", width: 1280, height: 720 });
  });

  it("steps JPEG quality down until the blob is under 5 MB", async () => {
    const qualities: number[] = [];
    const encoded = await encodeLightThumbnail(1280, 720, async ({ quality }) => {
      qualities.push(quality ?? 1);
      return new Uint8Array((quality ?? 1) >= 0.8 ? 6_000_000 : 2_400_000);
    });
    expect(encoded.bytes.byteLength).toBeLessThan(LQ_MAX_BYTES);
    expect(encoded.filename).toBe("miniature-leger.jpg");
    expect(qualities.length).toBeGreaterThan(1);
    expect(qualities[qualities.length - 1]).toBeLessThan(0.8);
  });

  it("falls back to WebP when JPEG stays over 5 MB at this size", async () => {
    const encoded = await encodeLightThumbnail(1280, 720, async ({ mime }) => {
      return new Uint8Array(mime === "image/webp" ? 1_200_000 : 6_000_000);
    });
    expect(encoded.filename).toBe("miniature-leger.webp");
    expect(encoded.mime).toBe("image/webp");
    expect(encoded.bytes.byteLength).toBeLessThan(LQ_MAX_BYTES);
  });

  it("downscales from 1920×1080 to 1280×720 when the large frame stays over 5 MB", async () => {
    const encoded = await encodeLightThumbnail(3840, 2160, async ({ width }) => {
      return new Uint8Array(width >= 1920 ? 6_000_000 : 1_800_000);
    });
    expect(encoded.width).toBe(1280);
    expect(encoded.height).toBe(720);
    expect(encoded.bytes.byteLength).toBeLessThan(LQ_MAX_BYTES);
    expect(encoded.filename).toBe("miniature-leger.jpg");
  });

  it("encodes a 9:16 source as 1080×1920 JPEG under 5 MB", async () => {
    const encoded = await encodeLightThumbnail(2160, 3840, async (opts) => {
      expect(opts.width / opts.height).toBeCloseTo(9 / 16);
      return new Uint8Array(400_000);
    });
    expect(encoded.width).toBe(1080);
    expect(encoded.height).toBe(1920);
    expect(encoded.bytes.byteLength).toBeLessThan(LQ_MAX_BYTES);
    expect(encoded.filename).toBe("miniature-leger.jpg");
  });
});

describe("encode4kThumbnail", () => {
  it("produces 3840×2160 PNG when the file is reasonable", async () => {
    const encoded = await encode4kThumbnail(1280, 720, async (opts) => {
      expect(opts.width).toBe(HQ_WIDTH);
      expect(opts.height).toBe(HQ_HEIGHT);
      expect(opts.mime).toBe("image/png");
      return new Uint8Array(4_000_000);
    });
    expect(encoded.filename).toBe("miniature-4k.png");
    expect(encoded.mime).toBe("image/png");
    expect(encoded.width).toBe(3840);
    expect(encoded.height).toBe(2160);
    expect(encoded.bytes.byteLength).toBeLessThanOrEqual(HQ_PNG_MAX_BYTES);
  });

  it("produces 2160×3840 PNG for a 9:16 source, not landscape 4K", async () => {
    const encoded = await encode4kThumbnail(2160, 3840, async (opts) => {
      expect(opts.width).toBe(2160);
      expect(opts.height).toBe(3840);
      expect(opts.mime).toBe("image/png");
      return new Uint8Array(4_000_000);
    });
    expect(encoded.width).toBe(2160);
    expect(encoded.height).toBe(3840);
    expect(encoded.filename).toBe("miniature-4k.png");
  });

  it("falls back to high-quality JPEG when the 4K PNG is huge", async () => {
    const encoded = await encode4kThumbnail(1920, 1080, async ({ mime }) => {
      return new Uint8Array(mime === "image/png" ? 20_000_000 : 3_200_000);
    });
    expect(encoded.filename).toBe("miniature-4k.jpg");
    expect(encoded.mime).toBe("image/jpeg");
    expect(encoded.width).toBe(3840);
    expect(encoded.height).toBe(2160);
  });
});

describe("downloadThumbnail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns empty when there is no image (does not crash)", async () => {
    expect(await downloadThumbnail(null, "lq")).toBe("empty");
    expect(await downloadThumbnail(undefined, "hq")).toBe("empty");
    expect(await downloadThumbnail("", "lq")).toBe("empty");
  });

  it("returns error when the stored image cannot be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    expect(await downloadThumbnail("/api/generated-images/image?id=missing", "hq")).toBe("error");
  });
});
