import { describe, it, expect } from "vitest";
import {
  BLUEPRINT_EXPORT_KIND,
  blueprintExportFilename,
  exportCanvasBlueprint,
  stringifyBlueprintExport,
} from "@/lib/canvas/export-blueprint";

const LONG_PROMPT =
  "The person in the identity/avatar reference photos, right third, mouth open, eyebrows raised. A live chart collapses in the midground behind the subject, slightly out of focus. Medium shot, rule of thirds. Claude logo 14% frame center-left, foreground. C'EST FINI ? in bold yellow, thick black outline, 12% frame height. Warm key from the left, cool rim from behind. Photorealistic, cinematic.";

describe("exportCanvasBlueprint", () => {
  it("names the file thumbgen-blueprint-<projectId>.json", () => {
    expect(blueprintExportFilename("proj_1789746108631")).toBe("thumbgen-blueprint-proj_1789746108631.json");
    expect(blueprintExportFilename("weird/id")).toBe("thumbgen-blueprint-weird_id.json");
  });

  it("exports a scratch A/B graph with full prompts, handles, and no image bytes", () => {
    const doc = exportCanvasBlueprint({
      projectId: "proj_1",
      projectTitle: "Clip test",
      nodes: [
        { id: "p-a", type: "prompt", data: { prompt: LONG_PROMPT, negativePrompt: "blurry" } },
        { id: "p-b", type: "prompt", data: { prompt: `${LONG_PROMPT} Variant B keeps the same person, swaps the chart for a green rocket.` } },
        { id: "face", type: "faceReference", data: { personaId: "persona-1", label: "Moi" } },
        {
          id: "logo",
          type: "swipeFile",
          data: { kind: "logo", label: "Marque", imageUrl: "/api/logos/image?f=lg1.png" },
        },
        {
          id: "upload",
          type: "swipeFile",
          data: { kind: "reference", label: "images (3).png", imageBase64: "data:image/png;base64,QUJDRA==" },
        },
        {
          id: "g-1",
          type: "generator",
          data: { model: "nano-banana", aspectRatio: "16x9", numImages: 1, abTest: { variants: ["A", "B"] } },
        },
      ],
      edges: [
        { source: "p-a", target: "g-1", targetHandle: "prompt-in" },
        { source: "p-b", target: "g-1", targetHandle: "prompt-in-b" },
        { source: "face", target: "g-1", targetHandle: "face-in" },
        { source: "logo", target: "g-1", targetHandle: "logo-in" },
        { source: "upload", target: "g-1", targetHandle: "ref-in" },
      ],
    });

    expect(doc.kind).toBe(BLUEPRINT_EXPORT_KIND);
    expect(doc.project).toEqual({ id: "proj_1", title: "Clip test" });
    expect(doc.intent.mode).toBe("scratch");
    expect(doc.intent.generatedApercuWiredAsEditSource).toBe(false);
    expect(doc.howToUse).toMatch(/Cursor/i);

    const promptA = doc.nodes.find((node) => node.id === "p-a")!;
    expect(promptA.prompt).toBe(LONG_PROMPT);
    expect(promptA.summary.prompt).toBe(LONG_PROMPT);
    expect(promptA.negativePrompt).toBe("blurry");

    expect(doc.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "face", target: "g-1", targetHandle: "face-in" }),
        expect.objectContaining({ source: "p-b", target: "g-1", targetHandle: "prompt-in-b" }),
        expect.objectContaining({ source: "logo", target: "g-1", targetHandle: "logo-in" }),
      ]),
    );
    expect(doc.handleLegend["ref-in"]).toMatch(/edit-source/i);

    const wiring = doc.generators[0];
    expect(wiring.abTest).toEqual({ variants: ["A", "B"] });
    expect(wiring.variants[0]).toMatchObject({
      variant: "A",
      prompt: LONG_PROMPT,
      promptNode: "p-a",
      face: ["face"],
      logos: ["logo"],
      refs: ["upload"],
      generatedApercuWiredAsEditSource: false,
    });
    expect(wiring.variants[1].prompt).toContain("Variant B");

    const json = stringifyBlueprintExport(doc);
    expect(json).toContain(LONG_PROMPT);
    expect(json).not.toContain("QUJDRA");
    expect(json).not.toContain("data:image/png;base64");
    expect(json).not.toContain("tombstone");
    expect(doc.nodes.find((node) => node.id === "upload")?.image).toMatchObject({
      filename: "images (3).png",
      note: expect.stringMatching(/pixels omitted/i),
    });
    expect(doc.nodes.find((node) => node.id === "logo")?.image).toMatchObject({
      ref: "stored:lg_lg1",
      url: "/api/logos/image?f=lg1.png",
      filename: "lg1.png",
    });
  });

  it("marks iterate when a generated aperçu is wired on ref-in, and names the winner", () => {
    const cover = "/api/generated-images/image?id=win1";
    const doc = exportCanvasBlueprint({
      projectId: "proj_iter",
      projectTitle: "Iterate",
      coverImageUrl: cover,
      nodes: [
        { id: "p-1", type: "prompt", data: { prompt: LONG_PROMPT } },
        {
          id: "g-1",
          type: "generator",
          data: {
            model: "openai",
            aspectRatio: "16x9",
            generatedImages: ["/api/generated-images/image?id=g1"],
            selectedImageIndex: 0,
          },
        },
        {
          id: "prev",
          type: "preview",
          selected: true,
          data: { label: "Aperçu", generatedImages: [cover], selectedImageIndex: 0 },
        },
        {
          id: "ref-iter",
          type: "swipeFile",
          data: { kind: "reference", label: "Edit", image_source: "stored:gi_g1", imageUrl: "/api/generated-images/image?id=g1" },
        },
      ],
      edges: [
        { source: "p-1", target: "g-1", targetHandle: "prompt-in" },
        { source: "g-1", target: "prev", targetHandle: "preview-in" },
        { source: "ref-iter", target: "g-1", targetHandle: "ref-in" },
      ],
    });

    expect(doc.intent.mode).toBe("iterate");
    expect(doc.intent.generatedApercuWiredAsEditSource).toBe(true);
    expect(doc.intent.editSources).toEqual([{ image: "stored:gi_g1", nodeId: "ref-iter", role: "edit-source" }]);
    expect(doc.project.winner).toMatchObject({ image: "stored:gi_win1", nodeId: "prev", role: "winner" });
    expect(doc.nodes.find((node) => node.id === "prev")?.previewRole).toBe("winner");
    expect(doc.nodes.find((node) => node.id === "ref-iter")?.previewRole).toBe("edit-source");
    expect(doc.generators[0].variants[0].generatedApercuWiredAsEditSource).toBe(true);
    expect(doc.currentThumbnails?.[0].parentPrompt).toBe(LONG_PROMPT);
  });
});
