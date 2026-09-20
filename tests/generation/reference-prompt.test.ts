import { describe, it, expect } from "vitest";
import {
  IDENTITY_SUBJECT,
  applyReferenceRolesToPrompt,
  buildReferenceRolePrompt,
  classifySketchReferenceSource,
  countReferenceRoles,
  planGenerationReferences,
  rewriteGenericSubject,
  type ReferenceEntry,
} from "@/lib/generation/reference-prompt";

describe("classifySketchReferenceSource", () => {
  it("treats past gens as edit sources, logos, sketches, and everything else as composition", () => {
    expect(classifySketchReferenceSource("stored:gi_old")).toBe("edit");
    expect(classifySketchReferenceSource("stored:lg_abc")).toBe("logo");
    expect(classifySketchReferenceSource("generated:sk_abc")).toBe("sketch");
    expect(classifySketchReferenceSource("stored:sf_competitor")).toBe("composition");
    expect(classifySketchReferenceSource("uploaded:u1")).toBe("composition");
  });
});

describe("planGenerationReferences", () => {
  it("puts the generated thumb first on an adjust, then identity, logos, layout, sketch", () => {
    const planned = planGenerationReferences({
      editImages: ["data:edit"],
      faceImages: ["data:face"],
      logos: [{ image: "data:logo", label: "Marque" }],
      referenceImages: ["data:ref"],
      sketchImages: ["data:sketch", "data:ignored"],
    });
    expect(planned.urls).toEqual(["data:edit", "data:face", "data:logo", "data:ref", "data:sketch"]);
    expect(planned.entries.map((entry) => entry.role)).toEqual([
      "edit",
      "identity",
      "logo",
      "composition",
      "sketch",
    ]);
  });
});

describe("rewriteGenericSubject", () => {
  it("replaces a stock-person opener with the identity/avatar phrase", () => {
    expect(rewriteGenericSubject("Young man in the right third of the foreground, mouth closed.")).toBe(
      `${IDENTITY_SUBJECT} in the right third of the foreground, mouth closed.`,
    );
    expect(rewriteGenericSubject("Un jeune homme à droite, bouche fermée.\nStudio sombre.")).toBe(
      `${IDENTITY_SUBJECT} à droite, bouche fermée.\nStudio sombre.`,
    );
    expect(rewriteGenericSubject("Generate a YouTube thumbnail draft. Young man in the left third.")).toBe(
      `Generate a YouTube thumbnail draft. ${IDENTITY_SUBJECT} in the left third.`,
    );
  });

  it("leaves a prompt that already names the avatar, and lines without a generic opener", () => {
    const already = `${IDENTITY_SUBJECT} in the left third, eyebrows raised.`;
    expect(rewriteGenericSubject(already)).toBe(already);
    expect(rewriteGenericSubject("Claude logo left, cracked Figma right.")).toBe(
      "Claude logo left, cracked Figma right.",
    );
  });
});

describe("buildReferenceRolePrompt", () => {
  it("numbers identity, logos, layout refs and the sketch the way OpenRouter positions them", () => {
    const entries: ReferenceEntry[] = [
      { role: "identity" },
      { role: "identity" },
      { role: "identity" },
      { role: "logo", label: "Claude" },
      { role: "composition" },
      { role: "sketch" },
    ];
    expect(countReferenceRoles(entries)).toEqual({ edit: 0, identity: 3, logos: 1, composition: 1, sketch: 1 });
    const text = buildReferenceRolePrompt(entries);
    expect(text).toContain("Reference images 1 to 3 are the IDENTITY / AVATAR");
    expect(text).toContain("one identity, not several people");
    expect(text).toContain("Do not invent a new head");
    expect(text).toContain("Reference image 4 is a logo to include in the thumbnail: Claude.");
    expect(text).toContain("Reference image 5 is COMPOSITION / LAYOUT only");
    expect(text).toContain("NEVER copy a face, head, or identity from that image");
    expect(text).toContain("The last reference image is a rough COMPOSITION SKETCH.");
  });
});

describe("applyReferenceRolesToPrompt", () => {
  it("rewrites Young man and appends role blocks when a Personnage is connected", () => {
    const prompt = applyReferenceRolesToPrompt("Young man in the right third, mouth closed.", [
      { role: "identity" },
      { role: "identity" },
      { role: "composition" },
    ]);
    expect(prompt.startsWith(IDENTITY_SUBJECT)).toBe(true);
    expect(prompt).not.toMatch(/^Young man/);
    expect(prompt).toContain("IDENTITY / AVATAR");
    expect(prompt).toContain("COMPOSITION / LAYOUT");
  });

  it("does not invent a default prompt when nothing is attached", () => {
    expect(applyReferenceRolesToPrompt("Une miniature", [])).toBe("Une miniature");
  });

  it("names a generated thumb as the source to edit instead of a layout swipe", () => {
    const prompt = applyReferenceRolesToPrompt("Change the overlay to C'EST FINI ?. Keep the rest.", [
      { role: "edit" },
      { role: "identity" },
    ]);
    expect(prompt).toContain("SOURCE THUMBNAIL to edit");
    expect(prompt).toContain("this is the current thumbnail; improvements apply to THIS image");
    expect(prompt).toContain("Do not recreate the scene from scratch");
    expect(prompt).toContain("IDENTITY / AVATAR");
    expect(prompt).not.toContain("COMPOSITION / LAYOUT");
  });
});
