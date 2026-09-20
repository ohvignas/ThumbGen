import { describe, expect, it } from "vitest";
import {
  parseGeneratedImageIds,
  rehydratePreviewImages,
  type GenerationImageRow,
} from "@/lib/canvas/rehydrate-preview-images";

const laptop = "Turn the laptop around so its sleek back lid faces the camera";
const glitch = "Change the text overlay to 'LE GLITCH'";

function preview(id: string, prompt: string, images: string[] = []) {
  return {
    id,
    type: "preview",
    data: {
      label: id,
      genPromptUsed: prompt,
      ...(images.length > 0 ? { generatedImages: images, genStatus: "done" } : {}),
    },
  };
}

describe("parseGeneratedImageIds", () => {
  it("reads JSON arrays and comma lists", () => {
    expect(parseGeneratedImageIds(JSON.stringify(["aaa", "bbb"]))).toEqual(["aaa", "bbb"]);
    expect(parseGeneratedImageIds("aaa,bbb")).toEqual(["aaa", "bbb"]);
    expect(parseGeneratedImageIds('["ccc"]')).toEqual(["ccc"]);
    expect(parseGeneratedImageIds(null)).toEqual([]);
  });
});

describe("rehydratePreviewImages", () => {
  it("restores empty previews when unused log ids match 1:1 per prompt", () => {
    const nodes = [
      preview("a1", laptop),
      preview("a2", laptop),
      preview("used", laptop, ["/api/generated-images/image?id=used-1"]),
      preview("b1", glitch),
      preview("b2", glitch),
    ];
    const rows: GenerationImageRow[] = [
      { prompt: laptop, imageIds: ["used-1"], createdAt: "2026-09-19T22:49:46.000Z" },
      { prompt: laptop, imageIds: ["free-a1"], createdAt: "2026-09-19T22:59:10.000Z" },
      { prompt: laptop, imageIds: ["free-a2"], createdAt: "2026-09-19T22:59:13.000Z" },
      { prompt: glitch, imageIds: ["free-b1"], createdAt: "2026-09-19T22:59:12.000Z" },
      { prompt: glitch, imageIds: ["free-b2"], createdAt: "2026-09-19T22:59:14.000Z" },
    ];
    const { nodes: next, restored } = rehydratePreviewImages(nodes, rows);
    expect(restored).toBe(4);
    expect(next.find((n) => n.id === "a1")?.data?.generatedImages).toEqual(["/api/generated-images/image?id=free-a1"]);
    expect(next.find((n) => n.id === "a2")?.data?.generatedImages).toEqual(["/api/generated-images/image?id=free-a2"]);
    expect(next.find((n) => n.id === "b1")?.data?.generatedImages).toEqual(["/api/generated-images/image?id=free-b1"]);
    expect(next.find((n) => n.id === "b2")?.data?.generatedImages).toEqual(["/api/generated-images/image?id=free-b2"]);
    expect(next.find((n) => n.id === "used")?.data?.generatedImages).toEqual(["/api/generated-images/image?id=used-1"]);
    expect(next.find((n) => n.id === "a1")?.data?.genStatus).toBe("done");
  });

  it("does not guess when unused log ids do not match empty preview count", () => {
    const nodes = [preview("a1", laptop), preview("a2", laptop)];
    const rows: GenerationImageRow[] = [
      { prompt: laptop, imageIds: ["one"], createdAt: "t0" },
      { prompt: laptop, imageIds: ["two"], createdAt: "t1" },
      { prompt: laptop, imageIds: ["three"], createdAt: "t2" },
    ];
    const { nodes: next, restored } = rehydratePreviewImages(nodes, rows);
    expect(restored).toBe(0);
    expect(next[0].data?.generatedImages).toBeUndefined();
  });

  it("never restores a preview whose id is in deletedNodeIds", () => {
    const nodes = [preview("6d00aec9", laptop), preview("a2", laptop)];
    const rows: GenerationImageRow[] = [
      { prompt: laptop, imageIds: ["free-a1"], createdAt: "t0" },
      { prompt: laptop, imageIds: ["free-a2"], createdAt: "t1" },
    ];
    const { nodes: next, restored } = rehydratePreviewImages(nodes, rows, {
      deletedNodeIds: ["6d00aec9"],
    });
    expect(restored).toBe(0);
    expect(next.find((n) => n.id === "6d00aec9")?.data?.generatedImages).toBeUndefined();
    expect(next.find((n) => n.id === "a2")?.data?.generatedImages).toBeUndefined();
  });
});
