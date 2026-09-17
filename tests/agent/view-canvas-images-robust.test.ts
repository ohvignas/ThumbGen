import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToolContent, ToolResult } from "@/lib/agent/tools/types";

// Canned projects row per test; persona_photos queries blow up to simulate a DB failure inside one node.
let projectNodes = "[]";
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    prepare: (sql: string) => ({
      get: () => {
        if (sql.includes("FROM projects")) return { nodes: projectNodes };
        throw new Error(`boom: ${sql}`);
      },
      all: () => [],
      run: () => ({}),
    }),
  }),
}));

const sharpCalls: unknown[][] = [];
vi.mock("sharp", () => {
  const sharp = (...args: unknown[]) => {
    sharpCalls.push(args);
    const chain = {
      rotate: () => chain,
      resize: () => chain,
      flatten: () => chain,
      jpeg: () => chain,
      toBuffer: async () => Buffer.from("jpeg-bytes"),
    };
    return chain;
  };
  return { default: sharp };
});

import { viewCanvasImagesTool } from "@/lib/agent/tools/view-canvas-images";

const texts = (r: ToolResult) => r.content.flatMap((c: ToolContent) => (c.type === "text" ? [c.text] : []));

describe("view_canvas_images — robustness", () => {
  beforeEach(() => {
    sharpCalls.length = 0;
  });

  it("returns an error, not a throw, when the project's nodes are corrupt", async () => {
    projectNodes = "{not json";
    const r = await viewCanvasImagesTool.handler({ project_id: "p" });
    expect(r.isError).toBe(true);
    expect(texts(r).join("\n")).toMatch(/illisible|corrompu/);
  });

  it("marks a node whose image read throws as unreadable and keeps going", async () => {
    projectNodes = JSON.stringify([
      { id: "face", type: "faceReference", data: { label: "A", personaAngles: { front: "/api/personas/image?id=x&angle=front" } } },
      { id: "up", type: "sketch", data: { label: "S", imageBase64: "data:image/png;base64,QUJDRA==" } },
    ]);
    const r = await viewCanvasImagesTool.handler({ project_id: "p" });
    expect(r.isError).toBeFalsy();
    expect(texts(r)).toContain("node face (faceReference, A) — pas d'image lisible");
    expect(texts(r)).toContain("node up (sketch, S) — image 1/1");
  });

  it("caps decoded pixels so a huge image cannot exhaust memory", async () => {
    projectNodes = JSON.stringify([{ id: "up", type: "sketch", data: { imageBase64: "data:image/png;base64,QUJDRA==" } }]);
    await viewCanvasImagesTool.handler({ project_id: "p" });
    expect(sharpCalls[0][1]).toEqual({ limitInputPixels: 40_000_000 });
  });
});
