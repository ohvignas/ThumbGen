import { describe, it, expect } from "vitest";
import { compareUpdatedAt, isCanvasPatch, shouldApplyCanvasPatch, type CanvasPatch } from "@/lib/canvas/canvas-patch";

const patch = (updatedAt: string, projectId = "proj-1"): CanvasPatch => ({
  projectId,
  updatedAt,
  created: true,
  node: { id: "iv-prompt", type: "prompt", position: { x: 0, y: 0 }, data: { prompt: "x" } },
  removedDataKeys: [],
  edges: [],
});

describe("compareUpdatedAt", () => {
  it("compares ISO strings and legacy SQLite timestamps as instants", () => {
    expect(compareUpdatedAt("2026-09-17T10:00:00.000Z", "2026-09-17T10:00:00.001Z")).toBe(-1);
    expect(compareUpdatedAt("2026-09-17T10:00:01.000Z", "2026-09-17T10:00:00.000Z")).toBe(1);
    expect(compareUpdatedAt("2026-09-17T10:00:00.000Z", "2026-09-17T10:00:00.000Z")).toBe(0);
    expect(compareUpdatedAt("2026-09-17 10:00:00", "2026-09-17T10:00:01.000Z")).toBe(-1);
    expect(compareUpdatedAt("2026-09-17 10:00:02", "2026-09-17T10:00:01.000Z")).toBe(1);
  });

  it("falls back to string order for unparsable values", () => {
    expect(compareUpdatedAt("b", "a")).toBe(1);
    expect(compareUpdatedAt("a", "a")).toBe(0);
  });
});

describe("shouldApplyCanvasPatch", () => {
  const state = { openProjectId: "proj-1", loaded: true, knownUpdatedAt: "2026-09-17T10:00:00.000Z" };

  it("applies a newer patch for the open, loaded project", () => {
    expect(shouldApplyCanvasPatch(patch("2026-09-17T10:00:00.500Z"), state)).toBe(true);
    expect(shouldApplyCanvasPatch(patch("2026-09-17T10:00:00.500Z"), { ...state, knownUpdatedAt: null })).toBe(true);
  });

  it("ignores another project, an unloaded canvas and a replayed or older patch", () => {
    expect(shouldApplyCanvasPatch(patch("2026-09-17T11:00:00.000Z", "proj-2"), state)).toBe(false);
    expect(shouldApplyCanvasPatch(patch("2026-09-17T11:00:00.000Z"), { ...state, loaded: false })).toBe(false);
    expect(shouldApplyCanvasPatch(patch("2026-09-17T10:00:00.000Z"), state)).toBe(false);
    expect(shouldApplyCanvasPatch(patch("2026-09-17T09:00:00.000Z"), state)).toBe(false);
  });
});

describe("isCanvasPatch", () => {
  it("accepts a complete patch and rejects anything else", () => {
    expect(isCanvasPatch(patch("2026-09-17T10:00:00.000Z"))).toBe(true);
    expect(
      isCanvasPatch({
        ...patch("t"),
        edges: [{ id: "e-1", source: "iv-prompt", target: "iv-generator", sourceHandle: null, targetHandle: "prompt-in" }],
      }),
    ).toBe(true);
    expect(isCanvasPatch(null)).toBe(false);
    expect(isCanvasPatch({ ...patch("t"), projectId: 1 })).toBe(false);
    expect(isCanvasPatch({ ...patch("t"), node: { id: "iv-prompt", type: "prompt", data: {} } })).toBe(false);
    expect(isCanvasPatch({ ...patch("t"), edges: [{ id: "e" }] })).toBe(false);
    expect(isCanvasPatch({ ...patch("t"), created: undefined })).toBe(false);
    expect(isCanvasPatch({ ...patch("t"), removedDataKeys: [1] })).toBe(false);
  });
});

describe("nextUpdatedAt", () => {
  it("is now, or 1 ms after a previous value that is not in the past", async () => {
    const { nextUpdatedAt } = await import("@/lib/canvas/canvas-patch");
    const now = Date.parse("2026-09-17T10:00:00.000Z");
    expect(nextUpdatedAt(null, now)).toBe("2026-09-17T10:00:00.000Z");
    expect(nextUpdatedAt("2026-09-17 09:00:00", now)).toBe("2026-09-17T10:00:00.000Z");
    expect(nextUpdatedAt("2026-09-17T10:00:00.000Z", now)).toBe("2026-09-17T10:00:00.001Z");
    expect(nextUpdatedAt("2026-09-17T10:00:05.000Z", now)).toBe("2026-09-17T10:00:05.001Z");
  });
});
