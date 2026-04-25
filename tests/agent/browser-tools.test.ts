import { describe, it, expect } from "vitest";
import {
  BROWSER_TOOL_DEFS,
  BROWSER_TOOL_NAMES,
  requestUserImageInputSchema,
  requestUserSketchInputSchema,
} from "@/lib/agent/browser-tools";

describe("browser-only tools", () => {
  it("exports request_user_image with a non-trivial description", () => {
    // v1: only request_user_image is exposed; request_user_sketch deferred until
    // SketchEditor supports a save callback (see browser-tools/index.ts NOTE).
    expect(BROWSER_TOOL_DEFS).toHaveLength(1);
    for (const def of BROWSER_TOOL_DEFS) {
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(40);
      expect(def.inputSchema).toBeTruthy();
    }
  });

  it("BROWSER_TOOL_NAMES contains request_user_image (only)", () => {
    expect(BROWSER_TOOL_NAMES.has("request_user_image")).toBe(true);
    expect(BROWSER_TOOL_NAMES.has("request_user_sketch")).toBe(false);
    expect(BROWSER_TOOL_NAMES.size).toBe(1);
  });

  describe("request_user_image input schema", () => {
    it("requires reason", () => {
      expect(requestUserImageInputSchema.safeParse({}).success).toBe(false);
      expect(requestUserImageInputSchema.safeParse({ reason: "Need a face" }).success).toBe(true);
    });

    it("rejects unknown suggested_kind", () => {
      expect(
        requestUserImageInputSchema.safeParse({ reason: "x", suggested_kind: "weird" }).success,
      ).toBe(false);
    });

    it("accepts valid suggested_kind values", () => {
      for (const k of ["face", "logo", "reference", "any"]) {
        expect(
          requestUserImageInputSchema.safeParse({ reason: "x", suggested_kind: k }).success,
        ).toBe(true);
      }
    });
  });

  describe("request_user_sketch input schema", () => {
    it("requires reason", () => {
      expect(requestUserSketchInputSchema.safeParse({}).success).toBe(false);
      expect(requestUserSketchInputSchema.safeParse({ reason: "Show me your idea" }).success).toBe(true);
    });

    it("accepts optional initial_image_id", () => {
      expect(
        requestUserSketchInputSchema.safeParse({ reason: "x", initial_image_id: "up_123" }).success,
      ).toBe(true);
    });
  });
});
