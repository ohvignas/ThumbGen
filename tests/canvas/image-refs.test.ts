import { describe, it, expect } from "vitest";
import {
  compactGenerationImageRef,
  generatedImageIdFromUrl,
  generatedImageUrl,
  generatorImages,
  imageDisplayUrl,
  isInlineImageBytes,
  isServerResolvableGenerationRef,
  toImageSourceRef,
} from "@/lib/canvas/image-refs";

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

describe("generatedImageIdFromUrl", () => {
  it("reads the id from current and legacy generated-image URLs", () => {
    expect(generatedImageIdFromUrl("/api/generated-images/image?id=abc-1")).toBe("abc-1");
    expect(generatedImageIdFromUrl("/api/generated-images/image?f=abc.png")).toBe("abc");
    expect(generatedImageUrl("abc-1")).toBe("/api/generated-images/image?id=abc-1");
  });

  it("rejects sketches, data URLs and other image kinds", () => {
    expect(generatedImageIdFromUrl("/api/generated-sketches/sk_9")).toBeNull();
    expect(generatedImageIdFromUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(generatedImageIdFromUrl("/api/swipe-files/image?f=sf1")).toBeNull();
  });
});

describe("compactGenerationImageRef", () => {
  it("turns library URLs into stored refs but keeps persona angle URLs", () => {
    expect(compactGenerationImageRef("/api/generated-images/image?id=abc-1")).toBe("stored:gi_abc-1");
    expect(compactGenerationImageRef("/api/swipe-files/image?f=sf1.png")).toBe("stored:sf_sf1");
    expect(compactGenerationImageRef("/api/logos/image?f=lg1.webp")).toBe("stored:lg_lg1");
    expect(compactGenerationImageRef("/api/generated-sketches/sk_9")).toBe("generated:sk_9");
    expect(compactGenerationImageRef("/api/personas/image?id=p1&angle=left")).toBe(
      "/api/personas/image?id=p1&angle=left",
    );
    expect(compactGenerationImageRef("stored:gi_abc-1")).toBe("stored:gi_abc-1");
    expect(compactGenerationImageRef("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
  });

  it("marks stored refs and app image URLs as server-resolvable", () => {
    expect(isServerResolvableGenerationRef("stored:gi_abc-1")).toBe(true);
    expect(isServerResolvableGenerationRef("/api/personas/image?id=p1&angle=front")).toBe(true);
    expect(isServerResolvableGenerationRef("data:image/png;base64,AAAA")).toBe(true);
    expect(isServerResolvableGenerationRef("https://cdn.example/face.jpg")).toBe(false);
  });
});

describe("imageDisplayUrl", () => {
  it("maps stored refs to same-origin URLs and rejects inline pixels", () => {
    expect(imageDisplayUrl("stored:gi_abc-1")).toBe("/api/generated-images/image?id=abc-1");
    expect(imageDisplayUrl("stored:sf_sf1")).toBe("/api/swipe-files/image?f=sf1");
    expect(imageDisplayUrl("/api/logos/image?f=lg1.webp")).toBe("/api/logos/image?f=lg1.webp");
    expect(imageDisplayUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(isInlineImageBytes("data:image/png;base64,AAAA")).toBe(true);
    expect(isInlineImageBytes("stored:gi_abc-1")).toBe(false);
    expect(isInlineImageBytes(`{"id":"a","type":"rectangle","x":0,"width":1280,"height":720,"stroke":"${"x".repeat(200)}"}`)).toBe(
      false,
    );
    expect(isInlineImageBytes("A".repeat(300))).toBe(true);
  });
});

describe("generatorImages", () => {
  it("lists variant A's images, then the other variants', without duplicates", () => {
    expect(
      generatorImages({ generatedImages: ["a1"], generatedImagesByVariant: { A: ["a1"], B: ["b1"], C: ["c1"] } }),
    ).toEqual(["a1", "b1", "c1"]);
  });
});
