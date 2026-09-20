// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const removeBackground = vi.fn(async () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }));

vi.mock("@imgly/background-removal", () => ({
  removeBackground: (...args: unknown[]) => removeBackground(...args),
}));

import { ensurePngDataUrl, photoNeedsBackgroundRemoval, stripPhotoBackgrounds } from "@/lib/remove-bg";

describe("photoNeedsBackgroundRemoval", () => {
  it("keeps PNG cutouts and flags JPEG or remote photos", () => {
    expect(photoNeedsBackgroundRemoval("data:image/png;base64,xx")).toBe(false);
    expect(photoNeedsBackgroundRemoval("data:image/jpeg;base64,xx")).toBe(true);
    expect(photoNeedsBackgroundRemoval("/api/personas/image?id=p1&angle=front")).toBe(true);
  });
});

describe("stripPhotoBackgrounds", () => {
  beforeEach(() => {
    removeBackground.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Blob(["in"], { type: "image/jpeg" }))),
    );
  });

  it("rewrites a non-PNG cutout to a PNG data URL", async () => {
    const out = await ensurePngDataUrl("data:image/avif;base64,xx", async () => "data:image/png;base64,CUTOUT");
    expect(out).toBe("data:image/png;base64,CUTOUT");
    expect(await ensurePngDataUrl("data:image/png;base64,abc", async () => "data:image/png;base64,NO")).toBe(
      "data:image/png;base64,abc",
    );
  });

  it("skips PNG cutouts and strips JPEG photos", async () => {
    const png = "data:image/png;base64,abc";
    const jpeg = "data:image/jpeg;base64,/9j/xx";
    const result = await stripPhotoBackgrounds({ front: png, left: jpeg }, ["front", "left"]);
    expect(result.front).toBe(png);
    expect(result.left).toMatch(/^data:image\/png/);
    expect(removeBackground).toHaveBeenCalledOnce();
  });
});
