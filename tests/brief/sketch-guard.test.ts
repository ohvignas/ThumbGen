import { describe, it, expect, vi } from "vitest";
import { v4 as uuid } from "uuid";
import { createConversation } from "@/lib/agent/conversation/store";
import { briefUpdateInputSchema } from "@/lib/brief/merge";
import { emptyBrief } from "@/lib/brief/schema";
import { getBrief, updateBrief } from "@/lib/brief/store";
import { guardSketchHandler, sketchLimit, sketchRefusal } from "@/lib/brief/sketch-guard";
import { pkg } from "./fixtures";

const ok = { content: [{ type: "text" as const, text: "Sketch generated. Reference: generated:sk_1" }] };

function briefAt(step: number, variants: Array<"A" | "B" | "C"> = ["A"]) {
  const conversationId = createConversation("proj-guard").id;
  for (const key of variants) updateBrief(conversationId, "proj-guard", briefUpdateInputSchema.parse({ variant: { key, set: pkg() } }));
  updateBrief(conversationId, "proj-guard", briefUpdateInputSchema.parse({ step }));
  return conversationId;
}

describe("sketch guard", () => {
  it("computes the limit and the refusals", () => {
    expect(sketchLimit(emptyBrief())).toBe(5);
    expect(sketchLimit({ ...emptyBrief(), variants: [{ key: "A", ...pkg() }, { key: "B", ...pkg() }] })).toBe(7);
    expect(sketchRefusal({ ...emptyBrief(), step: 4 })).toBe("Esquisse refusée : la fiche est à l'étape 4/7, les esquisses viennent à l'étape 7.");
    expect(sketchRefusal({ ...emptyBrief(), step: 7 })).toBeNull();
    expect(sketchRefusal({ ...emptyBrief(), step: 7, usage: { research: 0, competitorSearches: 0, analyses: 0, sketches: 5 } })).toBe(
      "Esquisse refusée : limite de 5 esquisses atteinte pour cette miniature.",
    );
  });

  it("leaves a conversation without a brief alone", async () => {
    const handler = vi.fn(async () => ok);
    expect(await guardSketchHandler(uuid(), handler)({ prompt: "x" })).toBe(ok);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("refuses before step 7 without calling the image model", async () => {
    const conversationId = briefAt(4);
    const handler = vi.fn(async () => ok);
    const result = await guardSketchHandler(conversationId, handler)({ prompt: "x" });
    expect(result).toEqual({ isError: true, content: [{ type: "text", text: "Esquisse refusée : la fiche est à l'étape 4/7, les esquisses viennent à l'étape 7." }] });
    expect(handler).not.toHaveBeenCalled();
  });

  it("counts sketches at step 7 and refuses past 2 × variants + 3", async () => {
    const conversationId = briefAt(7, ["A", "B"]);
    const handler = vi.fn(async () => ok);
    const guarded = guardSketchHandler(conversationId, handler);
    for (let i = 0; i < 7; i++) expect((await guarded({ prompt: `s${i}` })).isError).toBeFalsy();
    expect((await guarded({ prompt: "one too many" })).isError).toBe(true);
    expect(handler).toHaveBeenCalledTimes(7);
    expect(getBrief(conversationId)!.brief.usage.sketches).toBe(7);
  });

  it("gives the reservation back only when the paid request was never sent", async () => {
    const conversationId = briefAt(7);
    const notSent = { isError: true, requestNotSent: true, content: [{ type: "text" as const, text: "Network error: offline" }] };
    expect(await guardSketchHandler(conversationId, vi.fn(async () => notSent))({ prompt: "x" })).toBe(notSent);
    expect(getBrief(conversationId)!.brief.usage.sketches).toBe(0);
  });

  it("keeps counting a sketch whose request reached the provider, or whose failure is unknown", async () => {
    const conversationId = briefAt(7);
    const noImage = { isError: true, content: [{ type: "text" as const, text: "OpenRouter returned no image" }] };
    const apiError = { isError: true, content: [{ type: "text" as const, text: "OpenRouter API error 500" }] };
    expect(await guardSketchHandler(conversationId, vi.fn(async () => noImage))({ prompt: "x" })).toBe(noImage);
    expect(await guardSketchHandler(conversationId, vi.fn(async () => apiError))({ prompt: "x" })).toBe(apiError);
    const boom = guardSketchHandler(conversationId, vi.fn(async () => {
      throw new Error("unexpected");
    }));
    await expect(boom({ prompt: "x" })).rejects.toThrow("unexpected");
    expect(getBrief(conversationId)!.brief.usage.sketches).toBe(3);
  });
});
