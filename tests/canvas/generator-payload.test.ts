import { describe, it, expect } from "vitest";
import {
  buildGenerationPayload,
  faceImageSources,
  inputPreview,
  nodeImageSource,
  type ImageLoader,
  type PayloadNode,
} from "@/lib/canvas/generator-payload";
import type { ResolvedVariantInputs } from "@/lib/canvas/generator-variants";

const n = (id: string, type: string, data: PayloadNode["data"]): PayloadNode => ({ id, type, data });

function variantInputs(partial: Partial<ResolvedVariantInputs<PayloadNode>>): ResolvedVariantInputs<PayloadNode> {
  const empty = { nodes: [], inherited: false };
  return { variant: "A", face: [], logo: [], prompt: empty, sketch: empty, ref: empty, ...partial };
}

// Fake loader: marks what was loaded, fails on sources starting with "broken".
const loader: ImageLoader = async (src) => (src.startsWith("broken") ? null : `loaded(${src})`);

describe("nodeImageSource", () => {
  it("prefers the embedded image, then the selected generated image, then the URL", () => {
    expect(nodeImageSource({ imageBase64: "data:a", imageUrl: "/u" })).toBe("data:a");
    expect(nodeImageSource({ generatedImages: ["/g0", "/g1"], selectedImageIndex: 1, imageUrl: "/u" })).toBe("/g1");
    expect(nodeImageSource({ generatedImages: ["/g0"] })).toBe("/g0");
    expect(nodeImageSource({ imageUrl: "/u" })).toBe("/u");
    expect(nodeImageSource({})).toBeNull();
  });
});

describe("faceImageSources", () => {
  it("expands a Personnage into its angles, front first", () => {
    expect(faceImageSources({ personaAngles: { right: "/r", front: "/f" }, imageUrl: "/u" })).toEqual(["/f", "/r"]);
  });

  it("falls back to the node's single image", () => {
    expect(faceImageSources({ imageBase64: "data:x" })).toEqual(["data:x"]);
    expect(faceImageSources({})).toEqual([]);
  });
});

describe("inputPreview", () => {
  it("shows nothing for an unconnected input", () => {
    expect(inputPreview("prompt", [])).toEqual({ kind: "none" });
  });

  it("shows the first line of the first prompt, shortened, and how many more are connected", () => {
    const long = "Un visage choqué devant un graphique rouge qui s'effondre en direct\nDeuxième ligne";
    expect(inputPreview("prompt", [n("p1", "prompt", { prompt: long }), n("p2", "prompt", { prompt: "b" })])).toEqual({
      kind: "text",
      text: "Un visage choqué devant un graphique rouge qui…",
      more: 1,
    });
    expect(inputPreview("prompt", [n("p", "prompt", {})])).toEqual({ kind: "text", text: "Prompt vide", more: 0 });
  });

  it("shows a Personnage's front angle", () => {
    expect(inputPreview("face", [n("f", "faceReference", { personaAngles: { left: "/l", front: "/f" } })])).toEqual({
      kind: "image",
      src: "/f",
      more: 0,
    });
  });

  it("shows an image input's picture, or its label when it has none", () => {
    expect(inputPreview("ref", [n("r", "preview", { generatedImages: ["/g"] })])).toEqual({ kind: "image", src: "/g", more: 0 });
    expect(inputPreview("logo", [n("l", "swipeFile", { label: "Marque" })])).toEqual({ kind: "text", text: "Marque", more: 0 });
    expect(inputPreview("sketch", [n("s", "sketch", {})])).toEqual({ kind: "text", text: "Sans image", more: 0 });
  });
});

describe("buildGenerationPayload", () => {
  it("builds the /api/generate/openrouter fields from a variant's inputs", async () => {
    const payload = await buildGenerationPayload(
      variantInputs({
        face: [n("f", "faceReference", { personaAngles: { front: "/f", left: "/l" } })],
        logo: [
          n("l1", "swipeFile", { imageBase64: "data:logo", label: "Marque" }),
          n("l2", "swipeFile", { imageUrl: "broken-logo" }),
        ],
        prompt: {
          nodes: [n("p1", "prompt", { prompt: "A", negativePrompt: "flou" }), n("p2", "prompt", { prompt: "B" })],
          inherited: false,
        },
        sketch: { nodes: [n("s", "sketch", { imageBase64: "data:sketch" })], inherited: true },
        ref: {
          nodes: [
            n("r1", "swipeFile", { imageUrl: "/ref" }),
            n("r2", "preview", { generatedImages: ["/g0", "/g1"], selectedImageIndex: 1 }),
            n("r3", "swipeFile", {}),
          ],
          inherited: false,
        },
      }),
      loader,
    );

    expect(payload).toEqual({
      prompt: "A\nB",
      negativePrompt: "flou",
      faceImages: ["loaded(/f)", "loaded(/l)"],
      referenceImages: ["loaded(/ref)", "loaded(/g1)"],
      logos: [{ image: "loaded(data:logo)", label: "Marque" }],
      sketchImages: ["loaded(data:sketch)"],
    });
  });

  it("takes text from Prompt nodes only and names an unlabeled logo « Logo »", async () => {
    const payload = await buildGenerationPayload(
      variantInputs({
        prompt: {
          nodes: [n("x", "swipeFile", { prompt: "ignored" }), n("p", "prompt", { prompt: "kept" })],
          inherited: false,
        },
        logo: [n("l", "swipeFile", { imageUrl: "/logo" })],
      }),
      loader,
    );
    expect(payload.prompt).toBe("kept");
    expect(payload.logos).toEqual([{ image: "loaded(/logo)", label: "Logo" }]);
  });

  it("returns empty fields for a variant with no inputs", async () => {
    expect(await buildGenerationPayload(variantInputs({}), loader)).toEqual({
      prompt: "",
      negativePrompt: "",
      faceImages: [],
      referenceImages: [],
      logos: [],
      sketchImages: [],
    });
  });
});
