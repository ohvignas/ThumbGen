import { describe, it, expect } from "vitest";
import { pollCanvasIsEcho, serverCanvasSkipReason, type LoadGuardInput } from "@/lib/canvas/load-guard";

const T0 = "2026-09-18T21:31:46.305Z";
const T1 = "2026-09-18T21:31:48.132Z";

function input(overrides: Partial<LoadGuardInput> = {}): LoadGuardInput {
  return {
    reason: "poll",
    sameProject: true,
    loaded: true,
    dirty: false,
    saving: false,
    localNodeCount: 16,
    serverNodeCount: 16,
    serverUpdatedAt: T1,
    knownUpdatedAt: T0,
    epochAtStart: 1,
    revision: 1,
    ...overrides,
  };
}

describe("serverCanvasSkipReason", () => {
  it("never skips a forced replace (history restore)", () => {
    expect(serverCanvasSkipReason(input({ force: true, dirty: true, localNodeCount: 20, serverNodeCount: 2 }))).toBeNull();
  });

  it("applies the first load of a project", () => {
    expect(serverCanvasSkipReason(input({ loaded: false, sameProject: false }))).toBeNull();
  });

  it("keeps a dirty live canvas instead of a stale poll snapshot", () => {
    expect(serverCanvasSkipReason(input({ dirty: true, serverNodeCount: 15 }))).toBe("dirty");
  });

  it("keeps the live canvas while a save is in flight", () => {
    expect(serverCanvasSkipReason(input({ saving: true }))).toBe("dirty");
  });

  it("keeps the live canvas when a generator was added during the GET", () => {
    expect(serverCanvasSkipReason(input({ epochAtStart: 4, revision: 5 }))).toBe("dirty");
  });

  it("skips a snapshot the canvas already knows", () => {
    expect(serverCanvasSkipReason(input({ knownUpdatedAt: T1, serverUpdatedAt: T1 }))).toBe("known");
  });

  it("skips an older server snapshot", () => {
    expect(serverCanvasSkipReason(input({ knownUpdatedAt: T1, serverUpdatedAt: T0 }))).toBe("known");
  });

  it("does not replace a larger local canvas with a smaller poll snapshot", () => {
    expect(serverCanvasSkipReason(input({ localNodeCount: 16, serverNodeCount: 15 }))).toBe("more-nodes");
  });

  it("still applies a resync when the server has more nodes than local", () => {
    expect(serverCanvasSkipReason(input({ reason: "resync", localNodeCount: 15, serverNodeCount: 16 }))).toBeNull();
  });

  it("skips a poll whose persistable graph already matches the live canvas", () => {
    expect(serverCanvasSkipReason(input({ samePersistCanvas: true, dirty: true }))).toBe("same");
  });
});

describe("pollCanvasIsEcho", () => {
  const live = { id: "gold", type: "preview", position: { x: 520, y: 140 }, data: { label: "A" } };
  const tomb = { id: "6d00aec9", type: "preview", position: { x: 0, y: 0 }, data: { genPromptUsed: "gold" } };

  it("treats a newer snapshot that only adds known tombs as an echo", () => {
    expect(
      pollCanvasIsEcho({
        localNodes: [live],
        localEdges: [],
        serverNodes: [{ ...live, position: { x: 400, y: 80 } }, tomb],
        serverEdges: [],
        tombstones: { nodeIds: ["6d00aec9"], edgeIds: [] },
      }),
    ).toBe(true);
  });

  it("treats a rehydrate image fill on the same live nodes as an echo", () => {
    expect(
      pollCanvasIsEcho({
        localNodes: [{ ...live, data: { genPromptUsed: "gold" } }],
        localEdges: [],
        serverNodes: [
          {
            ...live,
            data: {
              genPromptUsed: "gold",
              generatedImages: ["/api/generated-images/image?id=abc"],
              selectedImageIndex: 0,
              genStatus: "done",
            },
          },
        ],
        serverEdges: [],
        tombstones: { nodeIds: [], edgeIds: [] },
      }),
    ).toBe(true);
  });

  it("does not treat a real extra live node as an echo", () => {
    expect(
      pollCanvasIsEcho({
        localNodes: [live],
        localEdges: [],
        serverNodes: [live, { id: "new-prompt", type: "prompt", position: { x: 1, y: 1 }, data: { prompt: "x" } }],
        serverEdges: [],
        tombstones: { nodeIds: [], edgeIds: [] },
      }),
    ).toBe(false);
  });
});
