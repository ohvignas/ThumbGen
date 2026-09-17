import { describe, it, expect, vi } from "vitest";
import {
  compositionPatch,
  fieldSaver,
  formatScore,
  imageUrlOf,
  strategyLabel,
  textModePatch,
  variantFieldPatch,
  videoFieldPatch,
} from "@/components/brief/brief-view";
import { briefPatchInputSchema } from "@/lib/brief/merge";
import { compositionSchema, emptyBrief } from "@/lib/brief/schema";
import { card } from "./fixtures";

describe("brief view helpers", () => {
  it("builds PATCH bodies the route accepts", () => {
    expect(videoFieldPatch("promise", "  Savoir cliquer ")).toEqual({ video: { promise: "Savoir cliquer" } });
    expect(videoFieldPatch("audience", "   ")).toEqual({ video: { audience: null } });
    expect(variantFieldPatch("B", "thumbnailText", " ENFIN ")).toEqual({ variant: { key: "B", set: { thumbnailText: "ENFIN" } } });
    const composition = compositionSchema.parse(card());
    expect(compositionPatch("A", composition)).toEqual({ variant: { key: "A", set: { composition } } });
    expect(textModePatch("overlay")).toEqual({ common: { textMode: "overlay" } });
    expect(textModePatch("nope")).toBe("Mode de texte inconnu");
    for (const body of [videoFieldPatch("promise", "x"), variantFieldPatch("A", "title", "x"), compositionPatch("A", composition)]) {
      expect(briefPatchInputSchema.safeParse(body).success).toBe(true);
    }
  });

  it("turns a patch outcome into the message under the field", async () => {
    const onPatch = vi.fn();
    onPatch.mockResolvedValueOnce({ ok: true, warnings: [] });
    expect(await fieldSaver(onPatch, (value) => videoFieldPatch("promise", value))("x")).toBeNull();
    onPatch.mockResolvedValueOnce({ ok: false, error: "Fiche invalide", issues: [{ path: "video.promise", message: "90 caractères maximum" }] });
    expect(await fieldSaver(onPatch, (value) => videoFieldPatch("promise", value))("x")).toBe("90 caractères maximum");
    onPatch.mockResolvedValueOnce({ ok: false, error: "Enregistrement impossible, réessaie", issues: [] });
    expect(await fieldSaver(onPatch, (value) => videoFieldPatch("promise", value))("x")).toBe("Enregistrement impossible, réessaie");
    expect(await fieldSaver(onPatch, () => "Nombre entier attendu")("x")).toBe("Nombre entier attendu");
    expect(onPatch).toHaveBeenCalledTimes(3);
  });

  it("formats scores, images and the strategy", () => {
    expect(formatScore(8.2)).toBe("×8,2");
    expect(formatScore(null)).toBe("peu de données");
    expect(imageUrlOf("generated:sk_abc")).toBe("/api/generated-sketches/sk_abc");
    expect(imageUrlOf("stored:lg_1")).toBe("/api/logos/image?f=1");
    expect(imageUrlOf(undefined)).toBeNull();
    expect(strategyLabel(emptyBrief())).toBe("Stratégie pas encore choisie.");
    expect(strategyLabel({ ...emptyBrief(), abStrategy: "concepts" })).toBe("Trouver le meilleur concept");
    expect(strategyLabel({ ...emptyBrief(), abStrategy: "single-variable", abVariable: "emotion" })).toBe("Optimiser un détail : l'émotion");
  });
});
