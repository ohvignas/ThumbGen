import { describe, it, expect } from "vitest";
import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/store/canvas-store";
import { migrateCanvas } from "@/lib/canvas/migrate-canvas";

const generator: AppNode = { id: "gen", type: "generator", position: { x: 400, y: 0 }, data: { model: "m" } };

describe("migrateCanvas", () => {
  it("turns a single-photo faceReference into a reference image and rewires its edges", () => {
    const nodes: AppNode[] = [
      {
        id: "face",
        type: "faceReference",
        position: { x: 0, y: 0 },
        data: { imageUrl: "/api/face-reactions/image?f=abc", imageBase64: "data:image/jpeg;base64,AAAA", label: "Choqué", image_source: "stored:fr_abc" } as AppNode["data"],
      },
      generator,
    ];
    const edges: Edge[] = [
      { id: "e1", source: "face", sourceHandle: "face", target: "gen", targetHandle: "face-in" },
      { id: "e2", source: "prompt", sourceHandle: "prompt", target: "gen", targetHandle: "prompt-in" },
    ];

    const result = migrateCanvas(nodes, edges);

    expect(result.changed).toBe(true);
    expect(result.nodes[0]).toEqual({
      id: "face",
      type: "swipeFile",
      position: { x: 0, y: 0 },
      data: {
        kind: "reference",
        imageUrl: "/api/face-reactions/image?f=abc",
        imageBase64: "data:image/jpeg;base64,AAAA",
        label: "Choqué",
      },
    });
    expect(result.nodes[1]).toBe(generator);
    expect(result.edges[0]).toEqual({ id: "e1", source: "face", sourceHandle: "image", target: "gen", targetHandle: "ref-in" });
    expect(result.edges[1]).toBe(edges[1]);
  });

  it("rewires a null sourceHandle edge (agent-built) on the target side only", () => {
    const nodes: AppNode[] = [
      { id: "face", type: "faceReference", position: { x: 0, y: 0 }, data: { imageBase64: "data:image/png;base64,BBBB" } },
      generator,
    ];
    const edges: Edge[] = [{ id: "e1", source: "face", sourceHandle: null, target: "gen", targetHandle: "face-in" }];
    const result = migrateCanvas(nodes, edges);
    expect(result.edges[0]).toEqual({ id: "e1", source: "face", sourceHandle: null, target: "gen", targetHandle: "ref-in" });
    expect(result.nodes[0].data).toEqual({ kind: "reference", imageBase64: "data:image/png;base64,BBBB" });
  });

  it("keeps Personnage nodes and empty face nodes as they are", () => {
    const persona: AppNode = {
      id: "persona",
      type: "faceReference",
      position: { x: 0, y: 0 },
      data: { personaId: "p1", personaAngles: { front: "/api/personas/image?id=p1&angle=front" }, label: "Antoine" },
    };
    const empty: AppNode = { id: "empty", type: "faceReference", position: { x: 0, y: 200 }, data: {} };
    const edges: Edge[] = [{ id: "e1", source: "persona", sourceHandle: "face", target: "gen", targetHandle: "face-in" }];

    const result = migrateCanvas([persona, empty, generator], edges);

    expect(result.changed).toBe(false);
    expect(result.nodes).toEqual([persona, empty, generator]);
    expect(result.edges).toEqual(edges);
  });

  it("still renames the legacy image-in handle to ref-in", () => {
    const edges: Edge[] = [{ id: "e1", source: "ref", target: "gen", targetHandle: "image-in" }];
    const result = migrateCanvas([generator], edges);
    expect(result.changed).toBe(true);
    expect(result.edges[0].targetHandle).toBe("ref-in");
  });
});
