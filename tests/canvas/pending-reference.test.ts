import { describe, expect, it } from "vitest";
import { readPendingReference, referenceLinkFor, referenceNodeData } from "@/lib/canvas/pending-reference";

describe("pending reference", () => {
  it("links to a miniature with the library image to add", () => {
    expect(referenceLinkFor("proj_1726480000000", "0f5c2c1e-4b1d-4a5e-9d7e-1b2c3d4e5f60")).toBe(
      "/m/proj_1726480000000?reference=0f5c2c1e-4b1d-4a5e-9d7e-1b2c3d4e5f60",
    );
    expect(referenceLinkFor("a b", "c")).toBe("/m/a%20b?reference=c");
  });

  it("reads only a plausible library id from the query string", () => {
    expect(readPendingReference("?reference=0f5c2c1e-4b1d-4a5e-9d7e-1b2c3d4e5f60")).toBe("0f5c2c1e-4b1d-4a5e-9d7e-1b2c3d4e5f60");
    expect(readPendingReference("?other=1&reference=abc_123.png")).toBe("abc_123.png");
    expect(readPendingReference("?reference=../secret")).toBeNull();
    expect(readPendingReference("?reference=")).toBeNull();
    expect(readPendingReference("")).toBeNull();
  });

  it("builds the reference node data the library picker also uses", () => {
    expect(referenceNodeData("abc", "Ma vidéo")).toEqual({
      kind: "reference",
      imageUrl: "/api/swipe-files/image?f=abc",
      label: "Ma vidéo",
    });
  });
});
