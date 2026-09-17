import { describe, it, expect } from "vitest";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import { IMAGE_MODELS } from "@/lib/image-models";
import { BLUEPRINT_MODELS, MODEL_ID_MAP } from "@/lib/agent/blueprint/models";
import {
  blueprintToCanvasData,
  blueprintUpdateToCanvasData,
  libraryImageUrlForSource,
} from "@/lib/agent/tools/_helpers/blueprint-canvas-data";
import { normalizeNode, validateBlueprintNodeData } from "@/lib/agent/blueprint/schema";

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function seedLogo(): string {
  const id = uuid();
  getDb().prepare("INSERT INTO logos (id, label, mime_type, size, data) VALUES (?, ?, ?, ?, ?)").run(id, "Claude", "image/png", PNG.length, PNG);
  return id;
}

function seedSwipeFile(): string {
  const id = uuid();
  getDb().prepare("INSERT INTO swipe_files (id, title, mime_type, size, data) VALUES (?, ?, ?, ?, ?)").run(id, "Réf", "image/png", PNG.length, PNG);
  return id;
}

describe("blueprint models", () => {
  it("maps the three blueprint models to canvas models", () => {
    expect(BLUEPRINT_MODELS.map((model) => model.id)).toEqual(["nano-banana", "openai", "seedream"]);
    for (const model of BLUEPRINT_MODELS) {
      expect(MODEL_ID_MAP[model.id]).toBe(model.canvasModel);
      expect(IMAGE_MODELS.some((image) => image.id === model.canvasModel)).toBe(true);
    }
  });
});

describe("blueprintToCanvasData", () => {
  it("keeps base64 by default and uses library URLs on request", async () => {
    const logoId = seedLogo();
    const inline = await blueprintToCanvasData("swipeFile", { kind: "logo", image_source: `stored:lg_${logoId}` });
    expect(inline.imageBase64).toMatch(/^data:image\/png;base64,/);
    expect(inline.imageUrl).toBeUndefined();

    const byUrl = await blueprintToCanvasData("swipeFile", { kind: "logo", image_source: `stored:lg_${logoId}` }, { libraryUrls: true });
    expect(byUrl).toMatchObject({ imageUrl: `/api/logos/image?f=${logoId}`, kind: "logo", label: "Logo", image_source: `stored:lg_${logoId}` });
    expect(byUrl.imageBase64).toBeUndefined();

    const sfId = seedSwipeFile();
    const reference = await blueprintToCanvasData("swipeFile", { kind: "reference", image_source: `stored:sf_${sfId}` }, { libraryUrls: true });
    expect(reference.imageUrl).toBe(`/api/swipe-files/image?f=${sfId}`);
  });

  it("still inlines a source that has no library URL", async () => {
    const data = `data:image/png;base64,${PNG.toString("base64")}`;
    const result = await blueprintToCanvasData("swipeFile", { kind: "reference", image_source: data }, { libraryUrls: true });
    expect(result.imageBase64).toBe(data);
    expect(result.imageUrl).toBeUndefined();
    expect(libraryImageUrlForSource("generated:abc")).toBeNull();
    expect(libraryImageUrlForSource("stored:gi_abc")).toBeNull();
  });

  it("resolves a Personnage to its angles and maps generator fields", async () => {
    const personaId = uuid();
    getDb().prepare("INSERT INTO personas (id, label) VALUES (?, ?)").run(personaId, "Antoine");
    getDb()
      .prepare("INSERT INTO persona_photos (id, persona_id, angle, mime_type, size, data) VALUES (?, ?, ?, ?, ?, ?)")
      .run(uuid(), personaId, "front", "image/png", PNG.length, PNG);
    const face = await blueprintToCanvasData("faceReference", { image_source: `stored:persona_${personaId}` }, { libraryUrls: true });
    expect(face.personaId).toBe(personaId);
    expect((face.personaAngles as Record<string, string>).front).toMatch(/^data:image\/png;base64,/);

    expect(await blueprintToCanvasData("generator", { model: "nano-banana", aspectRatio: "16x9", count: 2 })).toEqual({
      model: "gemini-3.1-flash-image",
      aspectRatio: "16x9",
      numImages: 2,
    });
  });

  it("switches an updated swipe file to a library URL and drops the stale inline image", async () => {
    const logoId = seedLogo();
    const { patch, replacesImage } = await blueprintUpdateToCanvasData(
      "swipeFile",
      { image_source: `stored:lg_${logoId}` },
      { libraryUrls: true },
    );
    expect(replacesImage).toBe(true);
    expect(patch).toMatchObject({ imageUrl: `/api/logos/image?f=${logoId}`, image_source: `stored:lg_${logoId}` });
    expect(patch.imageBase64).toBeUndefined();
  });
});

describe("blueprint node validation", () => {
  it("validates a new node fully and an existing node partially", () => {
    expect(validateBlueprintNodeData("swipeFile", { kind: "reference" }, { existing: false }).success).toBe(false);
    expect(validateBlueprintNodeData("swipeFile", { kind: "reference" }, { existing: true }).success).toBe(true);
    expect(validateBlueprintNodeData("prompt", { prompt: "Un visage choqué" }, { existing: false }).success).toBe(true);
    const bad = validateBlueprintNodeData("generator", { model: "grok", aspectRatio: "16x9" }, { existing: false });
    expect(bad.success).toBe(false);
    expect(bad.success === false && bad.issues.join(" ")).toContain("model");
  });

  it("folds flattened fields into data", () => {
    expect(normalizeNode({ id: "iv-prompt", type: "prompt", prompt: "x" })).toMatchObject({ id: "iv-prompt", data: { prompt: "x" } });
  });
});
