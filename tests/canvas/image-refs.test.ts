import { describe, it, expect } from "vitest";
import { generatorImages, toImageSourceRef } from "@/lib/canvas/image-refs";

describe("toImageSourceRef", () => {
  it("maps the app's image URLs to image_source refs", () => {
    expect(toImageSourceRef("/api/generated-images/image?id=abc-1")).toBe("stored:gi_abc-1");
    expect(toImageSourceRef("/api/generated-images/image?f=abc.png")).toBe("stored:gi_abc");
    expect(toImageSourceRef("/api/swipe-files/image?f=sf1")).toBe("stored:sf_sf1");
    expect(toImageSourceRef("/api/logos/image?f=lg1.webp")).toBe("stored:lg_lg1");
    expect(toImageSourceRef("/api/personas/image?id=p1&angle=front")).toBe("stored:persona_p1");
    expect(toImageSourceRef("/api/generated-sketches/sk_9")).toBe("generated:sk_9");
    expect(toImageSourceRef("/api/chat-uploads/u1")).toBe("uploaded:u1");
  });

  it("keeps agent refs as they are", () => {
    expect(toImageSourceRef("stored:sf_x")).toBe("stored:sf_x");
    expect(toImageSourceRef("generated:sk_1")).toBe("generated:sk_1");
  });

  it("rejects inline bytes, external URLs and junk ids", () => {
    expect(toImageSourceRef("data:image/png;base64,AAAA")).toBeNull();
    expect(toImageSourceRef("https://example.com/api/logos/image?f=x")).toBeNull();
    expect(toImageSourceRef("/api/logos/image?f=../../etc")).toBeNull();
    expect(toImageSourceRef(undefined)).toBeNull();
  });
});

describe("generatorImages", () => {
  it("lists variant A's images, then the other variants', without duplicates", () => {
    expect(
      generatorImages({ generatedImages: ["a1"], generatedImagesByVariant: { A: ["a1"], B: ["b1"], C: ["c1"] } }),
    ).toEqual(["a1", "b1", "c1"]);
  });
});
