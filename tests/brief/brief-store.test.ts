import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { emptyBrief } from "@/lib/brief/schema";
import { briefStepBadge, briefStepLine } from "@/lib/brief/steps";
import { resetBriefStore, useBriefStore } from "@/store/brief-store";
import { applyBriefUpdatedPart } from "@/components/panels/chat/brief-updated-part";

const T = "2026-09-17T10:00:00.000Z";
const fetchMock = vi.fn();
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

beforeEach(() => {
  resetBriefStore();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("journey steps", () => {
  it("names the badge and the step line", () => {
    expect(briefStepBadge(3)).toBe("Étape 3/7");
    expect(briefStepLine(3)).toBe("Étape 3/7 — Concurrents");
    expect(briefStepLine(1)).toBe("Étape 1/7 — Vidéo et promesse");
    expect(briefStepLine(7)).toBe("Étape 7/7 — Esquisses et workflow");
  });
});

describe("brief store", () => {
  it("loads the brief of a conversation, and clears on a change of conversation", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { brief: { ...emptyBrief(), step: 4 }, updatedAt: T }));
    await useBriefStore.getState().load("c1");
    expect(fetchMock).toHaveBeenCalledWith("/api/briefs/c1");
    expect(useBriefStore.getState()).toMatchObject({ conversationId: "c1", brief: { step: 4 }, updatedAt: T });

    fetchMock.mockResolvedValueOnce(json(200, { brief: null, updatedAt: null }));
    const loading = useBriefStore.getState().load("c2");
    expect(useBriefStore.getState()).toMatchObject({ conversationId: "c2", brief: null });
    await loading;
    await useBriefStore.getState().load(null);
    expect(useBriefStore.getState()).toMatchObject({ conversationId: null, brief: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores an answer that arrives after a newer load", async () => {
    let answerFirst: (value: unknown) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (answerFirst = resolve)));
    fetchMock.mockResolvedValueOnce(json(200, { brief: { ...emptyBrief(), step: 5 }, updatedAt: T }));
    const first = useBriefStore.getState().load("c1");
    await useBriefStore.getState().load("c1");
    answerFirst(json(200, { brief: { ...emptyBrief(), step: 2 }, updatedAt: T }));
    await first;
    expect(useBriefStore.getState().brief?.step).toBe(5);
  });

  it("follows the brief-updated chunk of the open conversation only", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { brief: { ...emptyBrief(), step: 1 }, updatedAt: T }));
    await useBriefStore.getState().load("c1");

    fetchMock.mockResolvedValueOnce(json(200, { brief: { ...emptyBrief(), step: 4, video: { promise: "P" } }, updatedAt: T }));
    expect(applyBriefUpdatedPart({ type: "data-brief-updated", data: { conversationId: "c1", step: 4, updatedAt: T } })).toBe(true);
    expect(useBriefStore.getState().brief?.step).toBe(4);
    await vi.waitFor(() => expect(useBriefStore.getState().brief?.video.promise).toBe("P"));

    expect(applyBriefUpdatedPart({ type: "data-brief-updated", data: { conversationId: "other", step: 6, updatedAt: T } })).toBe(true);
    expect(useBriefStore.getState().brief?.step).toBe(4);
    expect(applyBriefUpdatedPart({ type: "data-canvas-patch", data: {} })).toBe(false);
    expect(applyBriefUpdatedPart({ type: "data-brief-updated", data: { step: 2 } })).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("saves an edit with PATCH and returns the issues of a refusal", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { brief: { ...emptyBrief(), step: 6 }, updatedAt: T }));
    await useBriefStore.getState().load("c1");

    fetchMock.mockResolvedValueOnce(json(200, { brief: { ...emptyBrief(), step: 6, video: { promise: "Nouvelle" } }, updatedAt: T, warnings: [] }));
    expect(await useBriefStore.getState().patch({ video: { promise: "Nouvelle" } })).toEqual({ ok: true, warnings: [] });
    expect(fetchMock).toHaveBeenLastCalledWith("/api/briefs/c1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video: { promise: "Nouvelle" } }),
    });
    expect(useBriefStore.getState().brief?.video.promise).toBe("Nouvelle");

    const issues = [{ path: "variants.A.thumbnailText", message: "Texte de miniature : 4 mots maximum" }];
    fetchMock.mockResolvedValueOnce(json(400, { error: "Fiche invalide", issues }));
    expect(await useBriefStore.getState().patch({ variant: { key: "A", set: { thumbnailText: "a b c d e" } } })).toEqual({
      ok: false,
      error: "Fiche invalide",
      issues,
    });
    expect(useBriefStore.getState().brief?.video.promise).toBe("Nouvelle");

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await useBriefStore.getState().patch({ video: { promise: "x" } })).toEqual({ ok: false, error: "Enregistrement impossible, réessaie", issues: [] });
  });
});
