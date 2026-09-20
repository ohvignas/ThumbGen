import { describe, it, expect, beforeAll } from "vitest";
import { getCanvasStateTool } from "@/lib/agent/tools/get-canvas-state";
import { summarizeNode } from "@/components/panels/chat/canvas-snapshot";
import { getDb } from "@/lib/db";

type Summary = Record<string, unknown>;

describe("get_canvas_state — richer summaries", () => {
  const projectId = "test-canvas-state-rich";

  beforeAll(() => {
    getDb()
      .prepare("INSERT OR REPLACE INTO projects (id, nodes, edges) VALUES (?, ?, ?)")
      .run(
        projectId,
        JSON.stringify([
          { id: "sw-lib", type: "swipeFile", data: { imageUrl: "/api/swipe-files/image?f=abc.png", label: "Réf", kind: "reference" } },
          { id: "sw-logo", type: "swipeFile", data: { imageUrl: "/api/logos/image?f=lg1.png", label: "Logo", kind: "logo" } },
          { id: "sw-up", type: "swipeFile", data: { imageBase64: "data:image/png;base64,QUJDRA==", label: "images (3).png", kind: "reference" } },
          { id: "sk-agent", type: "sketch", data: { imageBase64: "data:image/png;base64,QUJDRA==", image_source: "generated:sk_1", label: "Sketch IA" } },
          {
            id: "gen",
            type: "generator",
            data: {
              model: "gemini-3.1-flash-image",
              aspectRatio: "16x9",
              numImages: 2,
              generatedImages: ["/api/generated-images/image?id=g1", "/api/generated-images/image?id=g2"],
              selectedImageIndex: 1,
            },
          },
          { id: "gen-empty", type: "generator", data: { model: "m", aspectRatio: "16x9", numImages: 1 } },
          {
            id: "prev",
            type: "preview",
            data: { label: "Nano #1", generatedImages: ["/api/generated-images/image?id=p1"], selectedImageIndex: 0, genStatus: "done" },
          },
          { id: "prev-empty", type: "preview", data: { label: "Nano #2", genStatus: "loading" } },
          {
            id: "txt",
            type: "textOverlay",
            data: { overlayText: "ÇA CHANGE TOUT", overlayColor: "#FFFFFF", overlayStrokeColor: "#000000", overlayPosition: "top", overlayFontScale: 1.2 },
          },
        ]),
        JSON.stringify([]),
      );
  });

  async function nodes(): Promise<Array<{ id: string; summary: Summary }>> {
    const r = await getCanvasStateTool.handler({ project_id: projectId });
    return JSON.parse((r.content[0] as { text: string }).text).nodes;
  }
  const byId = async (id: string) => (await nodes()).find((n) => n.id === id)!.summary;

  it("names where a swipe image comes from: library ref or canvas upload", async () => {
    expect(await byId("sw-lib")).toEqual({ label: "Réf", kind: "reference", source: "library:stored:sf_abc", hasImage: true });
    expect(await byId("sw-logo")).toMatchObject({ source: "library:stored:lg_lg1", hasImage: true });
    expect(await byId("sw-up")).toEqual({ label: "images (3).png", kind: "reference", source: "canvas-upload", hasImage: true });
    expect(await byId("sk-agent")).toMatchObject({ source: "library:generated:sk_1", hasImage: true, label: "Sketch IA" });
    const rich = JSON.parse(((await getCanvasStateTool.handler({ project_id: projectId })).content[0] as { text: string }).text);
    expect(rich.liveSketchCount).toBe(1);
  });

  it("omits source when the node has no image", () => {
    expect(summarizeNode("swipeFile", { label: "Vide", kind: "reference" })).toEqual({ label: "Vide", kind: "reference", hasImage: false });
    expect(summarizeNode("sketch", {})).not.toHaveProperty("source");
  });

  it("reports a generator's generated images and its selected one", async () => {
    expect(await byId("gen")).toEqual({
      model: "gemini-3.1-flash-image",
      aspectRatio: "16x9",
      count: 2,
      generatedCount: 2,
      selectedImage: "stored:gi_g2",
      selectedVisibleId: "#G2",
      images: [
        { visibleId: "#G1", image: "stored:gi_g1" },
        { visibleId: "#G2", image: "stored:gi_g2" },
      ],
    });
    const empty = await byId("gen-empty");
    expect(empty.generatedCount).toBe(0);
    expect(empty).not.toHaveProperty("selectedImage");
  });

  it("reports a preview's output", async () => {
    expect(await byId("prev")).toEqual({
      label: "Nano #1",
      hasOutput: true,
      imageCount: 1,
      selectedImage: "stored:gi_p1",
      selectedVisibleId: "#P1",
      images: [{ visibleId: "#P1", image: "stored:gi_p1" }],
    });
    expect(await byId("prev-empty")).toEqual({ label: "Nano #2", hasOutput: false, imageCount: 0 });
  });

  it("summarizes a text overlay's text and style", async () => {
    expect(await byId("txt")).toEqual({
      text: "ÇA CHANGE TOUT",
      color: "#FFFFFF",
      strokeColor: "#000000",
      position: "top",
      fontScale: 1.2,
      hasOutput: false,
    });
  });

  it("never leaks image bytes", async () => {
    const r = await getCanvasStateTool.handler({ project_id: projectId });
    expect((r.content[0] as { text: string }).text).not.toContain("QUJDRA");
  });

  it("points to view_canvas_images to actually see the images", () => {
    expect(getCanvasStateTool.description).toContain("view_canvas_images");
  });

  it("lists generated aperçus as currentThumbnails", async () => {
    const r = await getCanvasStateTool.handler({ project_id: projectId });
    const parsed = JSON.parse((r.content[0] as { text: string }).text) as {
      currentThumbnails?: Array<{ image: string; imageNode: string; role: string; visibleId?: string }>;
    };
    expect(parsed.currentThumbnails?.map((row) => ({ image: row.image, imageNode: row.imageNode, visibleId: row.visibleId }))).toEqual([
      { image: "stored:gi_p1", imageNode: "prev", visibleId: "#P1" },
      { image: "stored:gi_g2", imageNode: "gen", visibleId: "#G2" },
    ]);
    expect(parsed.currentThumbnails?.[0].role).toContain("improvements apply to THIS image");
  });

  it("the chat snapshot uses the same summaries", () => {
    expect(summarizeNode("swipeFile", { imageUrl: "/api/swipe-files/image?f=abc.png", label: "Réf", kind: "reference" })).toEqual({
      label: "Réf",
      kind: "reference",
      source: "library:stored:sf_abc",
      hasImage: true,
    });
    expect(summarizeNode("preview", { label: "P", generatedImages: ["/api/generated-images/image?id=p1"] })).toMatchObject({
      hasOutput: true,
      selectedImage: "stored:gi_p1",
    });
  });
});
