import { describe, it, expect } from "vitest";
import { persistCanvasEqual, persistCanvasKey, persistGraphEqual, persistGraphSnapshot, persistNodesForSave } from "@/lib/canvas/persist-snapshot";

const node = {
  id: "n1",
  type: "prompt",
  position: { x: 10, y: 20 },
  data: { prompt: "hello" },
};

describe("persistGraphEqual", () => {
  it("ignores React Flow view state and object identity", () => {
    const a = { ...node, selected: true, measured: { width: 200, height: 80 }, dragging: false };
    const b = { ...node, data: { prompt: "hello", isGenerating: true } };
    expect(persistGraphEqual({ nodes: [a], edges: [] }, { nodes: [b], edges: [] })).toBe(true);
    expect(persistGraphEqual({ nodes: [node], edges: [] }, { nodes: [{ ...node, position: { x: 11, y: 20 } }], edges: [] })).toBe(
      false,
    );
  });

  it("treats node order as irrelevant", () => {
    const other = { id: "n2", type: "generator", position: { x: 0, y: 0 }, data: {} };
    expect(persistGraphEqual({ nodes: [node, other], edges: [] }, { nodes: [other, node], edges: [] })).toBe(true);
  });

  it("ignores subpixel React Flow position jitter", () => {
    expect(
      persistGraphEqual(
        { nodes: [node], edges: [] },
        { nodes: [{ ...node, position: { x: 10.0000001, y: 19.9999999 } }], edges: [] },
      ),
    ).toBe(true);
    expect(
      persistGraphEqual({ nodes: [node], edges: [] }, { nodes: [{ ...node, position: { x: 11, y: 20 } }], edges: [] }),
    ).toBe(false);
  });
});

describe("persist snapshot image fields", () => {
  it("drops data:image pixels and keeps stored refs / urls", () => {
    const nodes = [
      {
        id: "gen",
        type: "generator",
        position: { x: 0, y: 0 },
        data: {
          generatedImages: ["data:image/png;base64,QUJDRA==", "/api/generated-images/image?id=abc"],
          generatedImagesByVariant: { A: ["data:image/png;base64,QUJDRA=="], B: ["stored:gi_def"] },
          imageBase64: "data:image/png;base64,BBBB",
          image_source: "stored:gi_abc",
        },
      },
      {
        id: "face",
        type: "faceReference",
        position: { x: 1, y: 1 },
        data: { personaId: "p1", personaAngles: { front: "data:image/png;base64,CCCC" } },
      },
    ];
    const json = JSON.stringify(persistGraphSnapshot({ nodes, edges: [] }));
    expect(json).not.toContain("data:image");
    expect(json).toContain("stored:gi_abc");
    expect(json).toContain("/api/generated-images/image?id=abc");
    expect(json).toContain("/api/generated-images/image?id=def");
    expect(json).toContain("/api/personas/image?id=p1&angle=front");

    const saved = persistNodesForSave(nodes);
    expect(JSON.stringify(saved)).not.toContain("data:image");
    expect(saved[0].data?.generatedImages).toEqual(["/api/generated-images/image?id=abc"]);
    expect(saved[0].data?.image_source).toBe("stored:gi_abc");
    expect(saved[0].data?.imageBase64).toBeUndefined();
    expect((saved[1].data?.personaAngles as Record<string, string>).front).toBe("/api/personas/image?id=p1&angle=front");
  });

  it("keeps generated: and stored:gi_ refs on a preview so persist cannot blank it", () => {
    const saved = persistNodesForSave([
      {
        id: "prev",
        type: "preview",
        position: { x: 0, y: 0 },
        data: {
          generatedImages: ["generated:sk_abc", "stored:gi_73e71e83-0ee3-4b89-bebc-dda314c35e48"],
          image_source: "generated:sk_abc",
          genStatus: "done",
        },
      },
    ]);
    expect(saved[0].data?.generatedImages).toEqual([
      "/api/generated-sketches/sk_abc",
      "/api/generated-images/image?id=73e71e83-0ee3-4b89-bebc-dda314c35e48",
    ]);
    expect(saved[0].data?.image_source).toBe("generated:sk_abc");
    expect(saved[0].data?.genStatus).toBe("done");
  });

  it("keeps a generated sketch ref so a chat click does not persist as an empty node", () => {
    const empty = persistNodesForSave([
      {
        id: "sketch-old",
        type: "sketch",
        position: { x: 0, y: 0 },
        data: { imageBase64: "data:image/png;base64,QUJD", label: "IA" },
      },
    ]);
    expect(empty[0].data?.imageBase64).toBeUndefined();
    expect(empty[0].data?.image_source).toBeUndefined();

    const kept = persistNodesForSave([
      {
        id: "sketch-new",
        type: "sketch",
        position: { x: 0, y: 0 },
        data: {
          image_source: "generated:sk_abc",
          imageUrl: "/api/generated-sketches/sk_abc",
          imageBase64: "data:image/png;base64,QUJD",
          label: "IA",
        },
      },
    ]);
    expect(kept[0].data?.imageBase64).toBeUndefined();
    expect(kept[0].data?.image_source).toBe("generated:sk_abc");
    expect(kept[0].data?.imageUrl).toBe("/api/generated-sketches/sk_abc");
  });

  it("keeps Excalidraw sketchElements JSON and only drops real image bytes", () => {
    const sketchElements = JSON.stringify([
      {
        id: "a",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 1280,
        height: 720,
        strokeColor: "#ffffff",
        backgroundColor: "#1e1e2e",
        label: "thumbnail-frame ".repeat(20),
      },
    ]);
    expect(sketchElements.length).toBeGreaterThan(240);
    const saved = persistNodesForSave([
      {
        id: "sk-drawn",
        type: "sketch",
        position: { x: 0, y: 0 },
        data: {
          sketchElements,
          sketchFiles: JSON.stringify({ file1: { dataURL: "data:image/png;base64,QUJD" } }),
          imageBase64: "data:image/png;base64,QUJD",
          label: "Croquis",
        },
      },
    ]);
    expect(saved[0].data?.sketchElements).toBe(sketchElements);
    expect(saved[0].data?.imageBase64).toBeUndefined();
    expect(saved[0].data?.sketchFiles).toBeUndefined();
  });
});

describe("persistCanvasKey", () => {
  it("includes node position so a drag is a new persist key", () => {
    const moved = { ...node, position: { x: 520, y: 140 } };
    expect(persistCanvasKey({ nodes: [node], edges: [], deletedNodeIds: [], deletedEdgeIds: [] })).not.toBe(
      persistCanvasKey({ nodes: [moved], edges: [], deletedNodeIds: [], deletedEdgeIds: [] }),
    );
    expect(persistCanvasKey({ nodes: [moved], edges: [], deletedNodeIds: [], deletedEdgeIds: [] })).toBe(
      persistCanvasKey({ nodes: [{ ...moved, selected: true }], edges: [], deletedNodeIds: [], deletedEdgeIds: [] }),
    );
  });
});

describe("persistCanvasEqual", () => {
  it("compares tombstone id sets, not order", () => {
    expect(
      persistCanvasEqual(
        { nodes: [node], edges: [], deletedNodeIds: ["b", "a"], deletedEdgeIds: [] },
        { nodes: [node], edges: [], deletedNodeIds: ["a", "b"], deletedEdgeIds: [] },
      ),
    ).toBe(true);
    expect(
      persistCanvasEqual(
        { nodes: [node], edges: [], deletedNodeIds: ["a"], deletedEdgeIds: [] },
        { nodes: [node], edges: [], deletedNodeIds: [], deletedEdgeIds: [] },
      ),
    ).toBe(false);
  });
});
