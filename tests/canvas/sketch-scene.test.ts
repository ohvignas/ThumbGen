import { describe, it, expect } from "vitest";
import {
  SKETCH_BG_ELEMENT_ID,
  SKETCH_BG_FILE_ID,
  SKETCH_FRAME_ID,
  SKETCH_LABEL_ID,
  buildSketchInitialData,
  dataUrlToSketchImage,
  openSketchEditorDetail,
  parseSketchJson,
  sketchImageSrc,
  sketchSceneNeedsImage,
} from "@/lib/canvas/sketch-scene";

const PNG = "data:image/png;base64,AAAA";

describe("sketchImageSrc", () => {
  it("prefers a data URL, then a same-origin URL, then image_source", () => {
    expect(sketchImageSrc({ imageBase64: PNG })).toBe(PNG);
    expect(sketchImageSrc({ imageUrl: "/api/generated-sketches/sk_1" })).toBe("/api/generated-sketches/sk_1");
    expect(sketchImageSrc({ image_source: "generated:sk_1" })).toBe("/api/generated-sketches/sk_1");
    expect(sketchImageSrc({ imageBase64: "/api/generated-sketches/sk_legacy" })).toBe("/api/generated-sketches/sk_legacy");
    expect(sketchImageSrc({})).toBeNull();
  });
});

describe("openSketchEditorDetail", () => {
  it("passes imageUrl / image_source so an apply_workflow sketch is not image-less", () => {
    expect(
      openSketchEditorDetail("sketch-vault", {
        image_source: "generated:sk_vault",
        imageUrl: "/api/generated-sketches/sk_vault",
      }),
    ).toMatchObject({
      nodeId: "sketch-vault",
      imageUrl: "/api/generated-sketches/sk_vault",
      image_source: "generated:sk_vault",
      imageBase64: null,
      sketchElements: null,
      sketchFiles: null,
    });
  });
});

describe("sketchSceneNeedsImage", () => {
  it("needs an image when the scene has no paintable Excalidraw file", () => {
    expect(sketchSceneNeedsImage(null, null)).toBe(true);
    expect(sketchSceneNeedsImage([{ id: "stroke", type: "freedraw" }], {})).toBe(true);
    expect(
      sketchSceneNeedsImage(
        [{ id: "img", type: "image", fileId: "f1" }],
        { f1: { id: "f1", dataURL: PNG, mimeType: "image/png", created: 1 } },
      ),
    ).toBe(false);
    expect(sketchSceneNeedsImage([{ id: "img", type: "image", fileId: "f1" }], {})).toBe(true);
  });
});

describe("buildSketchInitialData", () => {
  it("puts an apply_workflow image under the 16:9 frame so the user can draw on it", () => {
    const scene = buildSketchInitialData({
      ratio: "16x9",
      background: { dataURL: PNG, mimeType: "image/png" },
    });
    const ids = scene.elements.map((el) => el.id);
    expect(ids).toEqual([SKETCH_FRAME_ID, SKETCH_LABEL_ID, SKETCH_BG_ELEMENT_ID]);
    expect(scene.elements[2]).toMatchObject({
      type: "image",
      fileId: SKETCH_BG_FILE_ID,
      locked: true,
      width: 1280,
      height: 720,
    });
    expect(scene.files?.[SKETCH_BG_FILE_ID]?.dataURL).toBe(PNG);
    expect(scene.appState.activeTool.type).toBe("freedraw");
    expect(scene.appState.viewModeEnabled).toBe(false);
  });

  it("keeps hand-drawn strokes on top of the node image when files were stripped", () => {
    const scene = buildSketchInitialData({
      ratio: "16x9",
      userElements: [
        { id: "stroke-1", type: "freedraw", x: 0, y: 0 },
        { id: SKETCH_FRAME_ID, type: "rectangle" },
      ],
      userFiles: {},
      background: { dataURL: PNG, mimeType: "image/png" },
    });
    expect(scene.elements.map((el) => el.id)).toEqual([
      SKETCH_FRAME_ID,
      SKETCH_LABEL_ID,
      SKETCH_BG_ELEMENT_ID,
      "stroke-1",
    ]);
  });

  it("does not add a second background when the scene already has a paintable image", () => {
    const scene = buildSketchInitialData({
      ratio: "16x9",
      userElements: [{ id: "img", type: "image", fileId: "f1" }],
      userFiles: { f1: { id: "f1", dataURL: PNG, mimeType: "image/png", created: 1 } },
      background: { dataURL: PNG, mimeType: "image/png" },
    });
    expect(scene.elements.filter((el) => el.type === "image")).toHaveLength(1);
    expect(scene.elements.some((el) => el.id === SKETCH_BG_ELEMENT_ID)).toBe(false);
  });

  it("reattaches a persist-stripped file onto the existing image element", () => {
    const scene = buildSketchInitialData({
      ratio: "16x9",
      userElements: [{ id: "old-bg", type: "image", fileId: "old-file", width: 100, height: 100 }],
      userFiles: {},
      background: { dataURL: PNG, mimeType: "image/png" },
    });
    expect(scene.elements.some((el) => el.id === SKETCH_BG_ELEMENT_ID)).toBe(false);
    expect(scene.files?.["old-file"]?.dataURL).toBe(PNG);
    expect(scene.elements.find((el) => el.id === "old-bg")?.fileId).toBe("old-file");
  });

  it("opens a blank drawable frame when there is no node image", () => {
    const scene = buildSketchInitialData({ ratio: "1x1" });
    expect(scene.elements.map((el) => el.id)).toEqual([SKETCH_FRAME_ID, SKETCH_LABEL_ID]);
    expect(scene.files).toBeUndefined();
    expect(scene.appState.activeTool.type).toBe("freedraw");
  });
});

describe("parseSketchJson / dataUrlToSketchImage", () => {
  it("parses saved JSON and ignores junk", () => {
    expect(parseSketchJson('[{"id":"a"}]', null)).toEqual([{ id: "a" }]);
    expect(parseSketchJson("{", null)).toBeNull();
    expect(parseSketchJson(undefined, [])).toEqual([]);
    expect(dataUrlToSketchImage(PNG)).toEqual({ dataURL: PNG, mimeType: "image/png" });
    expect(dataUrlToSketchImage("/api/generated-sketches/x")).toBeNull();
  });
});
