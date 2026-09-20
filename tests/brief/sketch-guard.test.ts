import { describe, it, expect, vi } from "vitest";
import { v4 as uuid } from "uuid";
import { createConversation } from "@/lib/agent/conversation/store";
import { briefUpdateInputSchema } from "@/lib/brief/merge";
import { emptyBrief } from "@/lib/brief/schema";
import { getBrief, replaceBrief, updateBrief } from "@/lib/brief/store";
import { countLiveSketchNodes } from "@/lib/canvas/live-sketches";
import { guardSketchHandler, sketchLimit, sketchRefusal } from "@/lib/brief/sketch-guard";
import { getDb } from "@/lib/db";
import { pkg } from "./fixtures";

const ok = { content: [{ type: "text" as const, text: "Sketch generated. Reference: generated:sk_1" }] };

function seedSketches(projectId: string, liveIds: string[], tombIds: string[] = []) {
  const nodes = [...liveIds, ...tombIds].map((id) => ({
    id,
    type: "sketch",
    position: { x: 0, y: 0 },
    data: { label: id },
  }));
  getDb()
    .prepare("INSERT OR REPLACE INTO projects (id, nodes, edges) VALUES (?, ?, '[]')")
    .run(projectId, JSON.stringify(nodes));
  const insert = getDb().prepare(
    "INSERT OR REPLACE INTO canvas_tombstones (project_id, kind, item_id, deleted_at) VALUES (?, 'node', ?, ?)",
  );
  for (const id of tombIds) insert.run(projectId, id, new Date().toISOString());
}

function briefAt(step: number, variants: Array<"A" | "B" | "C"> = ["A"], projectId = `proj-guard-${uuid()}`) {
  const conversationId = createConversation(projectId).id;
  for (const key of variants) updateBrief(conversationId, projectId, briefUpdateInputSchema.parse({ variant: { key, set: pkg() } }));
  updateBrief(conversationId, projectId, briefUpdateInputSchema.parse({ step }));
  return { conversationId, projectId };
}

describe("sketch guard", () => {
  it("computes the limit from variants and refuses only on live canvas count", () => {
    expect(sketchLimit(emptyBrief())).toBe(5);
    expect(sketchLimit({ ...emptyBrief(), variants: [{ key: "A", ...pkg() }, { key: "B", ...pkg() }] })).toBe(7);
    expect(sketchRefusal({ ...emptyBrief(), step: 4 }, 0)).toBeNull();
    expect(sketchRefusal({ ...emptyBrief(), step: 7 }, 4)).toBeNull();
    expect(sketchRefusal({ ...emptyBrief(), step: 7, usage: { research: 0, competitorSearches: 0, analyses: 0, sketches: 5 } }, 1)).toBeNull();
    expect(sketchRefusal({ ...emptyBrief(), step: 7, usage: { research: 0, competitorSearches: 0, analyses: 0, sketches: 5 } }, 5)).toBe(
      "Esquisse refusée : limite de 5 croquis visibles atteinte sur le canvas.",
    );
  });

  it("counts live sketch nodes and ignores tombstoned ids still sitting in nodes JSON", () => {
    const projectId = `proj-live-sketches-${uuid()}`;
    seedSketches(projectId, ["sketch-live"], ["sketch-dead-1", "sketch-dead-2", "sketch-dead-3", "sketch-dead-4"]);
    expect(countLiveSketchNodes(projectId)).toBe(1);
    expect(countLiveSketchNodes(`missing-${uuid()}`)).toBe(0);
  });

  it("leaves a conversation without a brief alone", async () => {
    const handler = vi.fn(async () => ok);
    expect(await guardSketchHandler(uuid(), handler)({ prompt: "x" })).toBe(ok);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("allows sketches when the canvas has fewer live nodes than the cap", async () => {
    const { conversationId } = briefAt(4);
    const handler = vi.fn(async () => ok);
    const result = await guardSketchHandler(conversationId, handler)({ prompt: "x" });
    expect(result).toBe(ok);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("refuses when live canvas sketch nodes already meet 2 × variants + 3", async () => {
    const { conversationId, projectId } = briefAt(7, ["A", "B"]);
    seedSketches(projectId, ["s1", "s2", "s3", "s4", "s5", "s6", "s7"]);
    const handler = vi.fn(async () => ok);
    const result = await guardSketchHandler(conversationId, handler)({ prompt: "one too many" });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toBe(
      "Esquisse refusée : limite de 7 croquis visibles atteinte sur le canvas.",
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not refuse when usage is already 5 but only one live sketch remains", async () => {
    const { conversationId, projectId } = briefAt(7);
    seedSketches(projectId, ["sketch-live"], ["sketch-4a242b6b", "sketch-55783851", "sketch-5b859840", "sketch-vault"]);
    const stored = getBrief(conversationId)!;
    replaceBrief(conversationId, {
      ...stored.brief,
      usage: { ...stored.brief.usage, sketches: 5 },
    });
    const handler = vi.fn(async () => ok);
    const result = await guardSketchHandler(conversationId, handler)({ prompt: "variante B" });
    expect(result).toBe(ok);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(getBrief(conversationId)!.brief.usage.sketches).toBe(6);
  });

  it("gives the reservation back only when the paid request was never sent", async () => {
    const { conversationId } = briefAt(7);
    const notSent = { isError: true, requestNotSent: true, content: [{ type: "text" as const, text: "Network error: offline" }] };
    expect(await guardSketchHandler(conversationId, vi.fn(async () => notSent))({ prompt: "x" })).toBe(notSent);
    expect(getBrief(conversationId)!.brief.usage.sketches).toBe(0);
  });

  it("keeps booking a sketch whose request reached the provider, or whose failure is unknown", async () => {
    const { conversationId } = briefAt(7);
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
