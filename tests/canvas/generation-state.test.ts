import { describe, expect, it } from "vitest";
import { persistGraphEqual } from "@/lib/canvas/persist-snapshot";
import { keepLocalGenerationNodes, keepLocalNodePositions } from "@/lib/canvas/generation-state";

describe("keepLocalGenerationNodes", () => {
  it("does not wipe a finished preview's images with an empty server copy", () => {
    const server = [
      { id: "prev", data: { label: "Variante A" } },
      { id: "gen", data: { model: "m" } },
    ];
    const local = [
      {
        id: "prev",
        data: {
          label: "Variante A",
          genStatus: "done",
          generatedImages: ["/api/generated-images/image?id=abc"],
        },
      },
      { id: "gen", data: { model: "m", isGenerating: false } },
    ];
    const merged = keepLocalGenerationNodes(server, local);
    expect(merged[0].data?.generatedImages).toEqual(["/api/generated-images/image?id=abc"]);
    expect(
      persistGraphEqual({ nodes: server, edges: [] }, { nodes: merged, edges: [] }),
    ).toBe(false);
  });

  it("keeps an in-flight loader even when the server copy is stripped", () => {
    const server = [{ id: "prev", data: { label: "Variante A" } }];
    const local = [{ id: "prev", data: { label: "Variante A", genStatus: "loading" } }];
    const merged = keepLocalGenerationNodes(server, local);
    expect(merged[0].data?.genStatus).toBe("loading");
    expect(persistGraphEqual({ nodes: server, edges: [] }, { nodes: merged, edges: [] })).toBe(true);
  });
});

describe("keepLocalNodePositions", () => {
  it("keeps the local x/y of overlapping nodes so a poll cannot snap a drag back", () => {
    const server = [
      { id: "gold", position: { x: 400, y: 80 }, data: { label: "A" } },
      { id: "extra", position: { x: 0, y: 0 }, data: {} },
    ];
    const local = [{ id: "gold", position: { x: 520, y: 140 }, data: { label: "A" } }];
    const merged = keepLocalNodePositions(server, local);
    expect(merged.find((n) => n.id === "gold")?.position).toEqual({ x: 520, y: 140 });
    expect(merged.find((n) => n.id === "extra")?.position).toEqual({ x: 0, y: 0 });
  });
});
