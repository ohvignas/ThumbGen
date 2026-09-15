import { describe, it, expect } from "vitest";
import { BlueprintSchema, ImageSourceSchema } from "@/lib/agent/blueprint/schema";

describe("ImageSource", () => {
  it.each([
    "stored:lg_xyz",
    "stored:sf_aaa",
    "stored:fr_bbb",
    "stored:gi_ccc",
    "generated:sk_123",
    "uploaded:up_456",
    "data:image/png;base64,iVBORw0KGgo=",
  ])("accepts %s", (s) => {
    expect(ImageSourceSchema.safeParse(s).success).toBe(true);
  });

  it.each([
    "stored:fc_abc",            // fc_ prefix removed; face_reactions uses fr_
    "stored:invalid_prefix",
    "https://example.com/x.png",
    "fr_abc",                    // missing stored: prefix
    "data:image/png;base64,A",   // base64 too short
    "",
  ])("rejects %s", (s) => {
    expect(ImageSourceSchema.safeParse(s).success).toBe(false);
  });
});

describe("Blueprint", () => {
  it("accepts a minimal generator-only blueprint", () => {
    const bp = {
      nodes: [
        { id: "gen-1", type: "generator", data: { model: "openai", aspectRatio: "16x9" } },
      ],
      edges: [],
    };
    expect(BlueprintSchema.safeParse(bp).success).toBe(true);
  });

  it("accepts type-specific fields flattened on the node instead of nested under data (reproduced live with anthropic/claude-sonnet-4.6)", () => {
    const bp = {
      nodes: [
        { id: "face-1", type: "faceReference", image_source: "stored:persona_abc", label: "Antoine" },
        { id: "prompt-1", type: "prompt", prompt: "a shocked face" },
        { id: "gen-1", type: "generator", model: "seedream", aspectRatio: "16x9", count: 1 },
      ],
      edges: [
        { source: "face-1", target: "gen-1", targetHandle: "face-in" },
        { source: "prompt-1", target: "gen-1", targetHandle: "prompt-in" },
      ],
    };
    const result = BlueprintSchema.safeParse(bp);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nodes[0].data).toMatchObject({ image_source: "stored:persona_abc", label: "Antoine" });
      expect(result.data.nodes[1].data).toMatchObject({ prompt: "a shocked face" });
    }
  });

  it("prefers an existing nested data object over flattened top-level fields of the same name", () => {
    const bp = {
      nodes: [
        { id: "p-1", type: "prompt", prompt: "flattened version", data: { prompt: "nested version" } },
      ],
      edges: [],
    };
    const result = BlueprintSchema.safeParse(bp);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nodes[0].data.prompt).toBe("nested version");
    }
  });

  it("rejects edges referencing missing node ids", () => {
    const bp = {
      nodes: [{ id: "p-1", type: "prompt", data: { prompt: "hi" } }],
      edges: [{ source: "p-1", target: "missing", targetHandle: "prompt-in" }],
    };
    const result = BlueprintSchema.safeParse(bp);
    expect(result.success).toBe(false);
  });

  it("rejects faceReference without image_source", () => {
    const bp = {
      nodes: [{ id: "f-1", type: "faceReference", data: {} }],
      edges: [],
    };
    expect(BlueprintSchema.safeParse(bp).success).toBe(false);
  });

  it("rejects duplicate node ids", () => {
    const bp = {
      nodes: [
        { id: "p-1", type: "prompt", data: { prompt: "a" } },
        { id: "p-1", type: "prompt", data: { prompt: "b" } },
      ],
      edges: [],
    };
    const result = BlueprintSchema.safeParse(bp);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("Duplicate node id"))).toBe(true);
    }
  });
});
