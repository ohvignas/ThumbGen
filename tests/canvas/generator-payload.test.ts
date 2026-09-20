import { describe, it, expect } from "vitest";
import {
  buildGenerationPayload,
  faceImageSources,
  generationPayloadFits,
  inputPreview,
  isEditSourceNode,
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
      editImages: ["loaded(/g1)"],
      faceImages: ["loaded(/f)", "loaded(/l)"],
      referenceImages: ["loaded(/ref)"],
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
      editImages: [],
      faceImages: [],
      referenceImages: [],
      logos: [],
      sketchImages: [],
    });
  });

  it("treats a stored:gi_ swipeFile as an edit source, not a layout swipe", async () => {
    const gi = n("gi", "swipeFile", {
      kind: "reference",
      imageUrl: "/api/generated-images/image?id=abc-1",
      image_source: "stored:gi_abc-1",
    });
    const swipe = n("sf", "swipeFile", { imageUrl: "/api/swipe-files/image?f=sf1" });
    expect(isEditSourceNode(gi)).toBe(true);
    expect(isEditSourceNode(swipe)).toBe(false);
    const payload = await buildGenerationPayload(
      variantInputs({ ref: { nodes: [swipe, gi], inherited: false } }),
      loader,
    );
    expect(payload.editImages).toEqual(["stored:gi_abc-1"]);
    expect(payload.referenceImages).toEqual(["stored:sf_sf1"]);
  });

  it("sends stored refs and persona URLs instead of inlined imageBase64", async () => {
    const payload = await buildGenerationPayload(
      variantInputs({
        face: [
          n("f", "faceReference", {
            personaId: "p1",
            personaAngles: {
              front: "data:image/png;base64,HUGEFRONT",
              left: "data:image/png;base64,HUGELEFT",
            },
          }),
        ],
        logo: [
          n("l", "swipeFile", {
            image_source: "stored:lg_logo1",
            imageBase64: "data:image/png;base64,HUGELOGO",
            label: "Marque",
          }),
        ],
        sketch: {
          nodes: [
            n("s", "sketch", {
              imageUrl: "/api/generated-sketches/sk_9",
              imageBase64: "data:image/png;base64,HUGESKETCH",
            }),
          ],
          inherited: false,
        },
        ref: {
          nodes: [
            n("r1", "preview", {
              generatedImages: ["/api/generated-images/image?id=abc-1"],
              imageBase64: "data:image/png;base64,HUGETHUMB",
            }),
            n("r2", "swipeFile", {
              imageUrl: "/api/swipe-files/image?f=sf1",
              imageBase64: "data:image/png;base64,HUGESWIPE",
            }),
          ],
          inherited: false,
        },
      }),
      loader,
    );

    expect(payload.faceImages).toEqual([
      "/api/personas/image?id=p1&angle=front",
      "/api/personas/image?id=p1&angle=left",
    ]);
    expect(payload.editImages).toEqual(["stored:gi_abc-1"]);
    expect(payload.referenceImages).toEqual(["stored:sf_sf1"]);
    expect(payload.logos).toEqual([{ image: "stored:lg_logo1", label: "Marque" }]);
    expect(payload.sketchImages).toEqual(["generated:sk_9"]);
    expect(JSON.stringify(payload)).not.toMatch(/base64,HUGE/);
  });

  it("rejects a payload that is still huge after compacting", () => {
    expect(
      generationPayloadFits({
        prompt: "x",
        negativePrompt: "",
        editImages: [],
        faceImages: [`data:image/png;base64,${"A".repeat(8_000_000)}`],
        referenceImages: [],
        logos: [],
        sketchImages: [],
      }),
    ).toBe(false);
    expect(
      generationPayloadFits({
        prompt: "x",
        negativePrompt: "",
        editImages: ["stored:gi_abc"],
        faceImages: ["/api/personas/image?id=p1&angle=front"],
        referenceImages: [],
        logos: [],
        sketchImages: [],
      }),
    ).toBe(true);
  });
});
