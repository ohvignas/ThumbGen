import { describe, it, expect } from "vitest";
import { libraryPickToAttachment } from "@/lib/library/library-pick-source";
import { logoImageUrl, swipeImageUrl } from "@/lib/library/library-items";
import { personaImageUrl } from "@/lib/personas";
import { libraryImageUrl } from "@/lib/youtube/types";

const uuid = "0b5c7a0e-6a55-4d0b-9d51-3f2b1a2c9e11";

describe("libraryPickToAttachment", () => {
  it("maps a library image (Mes images) to stored:sf_<id>", () => {
    expect(libraryPickToAttachment({ imageUrl: swipeImageUrl(uuid), label: "Réf" })).toEqual({
      source: `stored:sf_${uuid}`,
      preview_url: swipeImageUrl(uuid),
    });
  });

  it("maps a followed-channel thumbnail copied into the library to stored:sf_<id>", () => {
    expect(libraryPickToAttachment({ imageUrl: libraryImageUrl(uuid), label: "Vidéo" })?.source).toBe(`stored:sf_${uuid}`);
  });

  it("maps a logo to stored:lg_<id>", () => {
    expect(libraryPickToAttachment({ imageUrl: logoImageUrl(uuid), label: "Logo" })).toEqual({
      source: `stored:lg_${uuid}`,
      preview_url: logoImageUrl(uuid),
    });
  });

  it("maps a Personnage angle image to stored:persona_<id>", () => {
    expect(libraryPickToAttachment({ imageUrl: personaImageUrl("p 1", "left"), label: "Antoine" })).toEqual({
      source: "stored:persona_p 1",
      preview_url: personaImageUrl("p 1", "left"),
    });
  });

  it("drops a legacy file extension like the image routes do", () => {
    expect(libraryPickToAttachment({ imageUrl: `/api/swipe-files/image?f=${uuid}.png`, label: "x" })?.source).toBe(`stored:sf_${uuid}`);
  });

  it("returns null for anything it cannot reference", () => {
    for (const imageUrl of [
      "",
      "https://i.ytimg.com/vi/abc/hqdefault.jpg",
      "https://evil.example/api/logos/image?f=abc",
      "//evil.example/api/logos/image?f=abc",
      "/api/logos/image",
      "/api/logos/image?f=",
      "/api/personas/image?angle=front",
      "/api/generated-images/image?f=abc",
      "data:image/png;base64,AAAA",
    ]) {
      expect(libraryPickToAttachment({ imageUrl, label: "x" }), imageUrl).toBeNull();
    }
  });
});
