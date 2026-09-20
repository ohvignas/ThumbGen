import { describe, it, expect } from "vitest";
import {
  formatVisibleImageId,
  visibleImageIdFromToolText,
  visibleImageIdFromValue,
} from "@/lib/canvas/visible-image-id";

describe("formatVisibleImageId", () => {
  it("uses the last 6 alphanumerics of a uuid, uppercase, with #", () => {
    expect(formatVisibleImageId("aaaa1111-bbbb-cccc-dddd-eeeeeeeeeeee")).toBe("#EEEEEE");
    expect(formatVisibleImageId("9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d")).toBe("#3DCB6D");
  });

  it("keeps short stems typeable (p1 → #P1)", () => {
    expect(formatVisibleImageId("p1")).toBe("#P1");
    expect(formatVisibleImageId("g2")).toBe("#G2");
    expect(formatVisibleImageId("abc123")).toBe("#ABC123");
  });
});

describe("visibleImageIdFromValue", () => {
  it("reads stored refs and generated-image URLs the same way", () => {
    expect(visibleImageIdFromValue("stored:gi_p1")).toBe("#P1");
    expect(visibleImageIdFromValue("/api/generated-images/image?id=p1")).toBe("#P1");
    expect(visibleImageIdFromValue("/api/generated-images/image?id=aaaa1111-bbbb-cccc-dddd-eeeeeeeeeeee")).toBe(
      "#EEEEEE",
    );
    expect(visibleImageIdFromValue("generated:sk_abc123")).toBe("#ABC123");
  });

  it("returns null for inline bytes and unknown strings", () => {
    expect(visibleImageIdFromValue("data:image/png;base64,QUJD")).toBeNull();
    expect(visibleImageIdFromValue("")).toBeNull();
    expect(visibleImageIdFromValue(null)).toBeNull();
  });
});

describe("visibleImageIdFromToolText", () => {
  it("picks generated: and stored:gi_ out of a tool caption", () => {
    expect(visibleImageIdFromToolText("Sketch generated. Reference: generated:sk_abc123 (cost: $0.01)")).toBe(
      "#ABC123",
    );
    expect(visibleImageIdFromToolText("Reference: stored:gi_p1")).toBe("#P1");
  });
});
