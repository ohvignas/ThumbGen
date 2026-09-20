/**
 * Excalidraw scene for the sketch editor. Workflow / chat sketches are often
 * an imageUrl only (no sketchElements). Persist-snapshot also drops
 * sketchFiles, so a later open must rehydrate the node image as a file.
 */

import { imageDisplayUrl } from "@/lib/canvas/image-refs";

export const SKETCH_FRAME_ID = "thumbnail-frame";
export const SKETCH_LABEL_ID = "thumbnail-label";
export const SKETCH_BG_ELEMENT_ID = "sketch-node-image";
export const SKETCH_BG_FILE_ID = "sketch-node-image-file";

export const SKETCH_RATIOS: Record<string, { w: number; h: number; label: string }> = {
  "16x9": { w: 1280, h: 720, label: "16:9" },
  "1x1": { w: 1024, h: 1024, label: "1:1" },
  "4x3": { w: 1024, h: 768, label: "4:3" },
  "9x16": { w: 720, h: 1280, label: "9:16" },
};

export const SKETCH_EDITOR_APP_STATE = {
  activeTool: { type: "freedraw" as const, lastActiveTool: null, locked: false, customType: null },
  currentItemStrokeColor: "#ffffff",
  currentItemStrokeWidth: 1,
  viewBackgroundColor: "#121212",
  viewModeEnabled: false,
  zenModeEnabled: false,
};

export type SketchImageBytes = { dataURL: string; mimeType: string };

export type SketchSceneElement = {
  id: string;
  type: string;
  isDeleted?: boolean;
  fileId?: string | null;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  [key: string]: unknown;
};

export type SketchSceneFile = {
  id: string;
  dataURL: string;
  mimeType: string;
  created: number;
};

export type SketchInitialData = {
  elements: SketchSceneElement[];
  files?: Record<string, SketchSceneFile>;
  appState: typeof SKETCH_EDITOR_APP_STATE;
  scrollToContent: true;
};

export type OpenSketchEditorDetail = {
  nodeId: string;
  imageBase64: string | null;
  imageUrl: string | null;
  image_source: string | null;
  aspectRatio: string;
  sketchElements: string | null;
  sketchFiles: string | null;
  workflowAssets: unknown[];
};

export function sketchRatioDims(ratio: string): { w: number; h: number; label: string } {
  return SKETCH_RATIOS[ratio] || SKETCH_RATIOS["16x9"];
}

export function isSketchChromeId(id: string): boolean {
  return id === SKETCH_FRAME_ID || id === SKETCH_LABEL_ID;
}

export function parseSketchJson<T>(raw: unknown, fallback: T): T {
  if (raw == null || raw === "") return fallback;
  if (typeof raw !== "string") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Same-origin URL or data URL the editor can fetch / embed. */
export function sketchImageSrc(detail: {
  imageBase64?: string | null;
  imageUrl?: string | null;
  image_source?: string | null;
}): string | null {
  const inline = typeof detail.imageBase64 === "string" ? detail.imageBase64 : "";
  if (inline.startsWith("data:")) return inline;
  const url = typeof detail.imageUrl === "string" ? detail.imageUrl : "";
  if (url.startsWith("data:") || (url.startsWith("/") && !url.startsWith("//"))) return url;
  const fromSource =
    typeof detail.image_source === "string" && detail.image_source
      ? imageDisplayUrl(detail.image_source)
      : null;
  if (fromSource) return fromSource;
  if (inline.startsWith("/") && !inline.startsWith("//")) return inline;
  return null;
}

export function openSketchEditorDetail(
  nodeId: string,
  data: {
    imageBase64?: string;
    imageUrl?: string;
    image_source?: string;
    aspectRatio?: string;
    sketchElements?: string;
    sketchFiles?: string;
  },
  workflowAssets: unknown[] = [],
): OpenSketchEditorDetail {
  return {
    nodeId,
    imageBase64: typeof data.imageBase64 === "string" ? data.imageBase64 : null,
    imageUrl:
      (typeof data.imageUrl === "string" && data.imageUrl) ||
      (typeof data.image_source === "string" ? imageDisplayUrl(data.image_source) : null) ||
      null,
    image_source: typeof data.image_source === "string" ? data.image_source : null,
    aspectRatio: data.aspectRatio || "16x9",
    sketchElements: data.sketchElements || null,
    sketchFiles: data.sketchFiles || null,
    workflowAssets,
  };
}

export function sketchFrameElements(ratio: string): SketchSceneElement[] {
  const dims = sketchRatioDims(ratio);
  return [
    {
      type: "rectangle",
      id: SKETCH_FRAME_ID,
      x: -dims.w / 2,
      y: -dims.h / 2,
      width: dims.w,
      height: dims.h,
      angle: 0,
      strokeColor: "#a1a1aa",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 2,
      strokeStyle: "dashed",
      roughness: 0,
      opacity: 40,
      locked: true,
      roundness: { type: 3 },
      seed: 1,
      version: 1,
      versionNonce: 1,
      isDeleted: false,
      groupIds: [],
      frameId: null,
      boundElements: null,
      updated: 1,
      link: null,
    },
    {
      type: "text",
      id: SKETCH_LABEL_ID,
      x: -dims.w / 2,
      y: -dims.h / 2 - 30,
      width: 250,
      height: 25,
      angle: 0,
      text: `Zone miniature ${dims.label}`,
      fontSize: 16,
      fontFamily: 1,
      strokeColor: "#a1a1aa",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 40,
      locked: true,
      seed: 2,
      version: 1,
      versionNonce: 2,
      isDeleted: false,
      groupIds: [],
      frameId: null,
      boundElements: null,
      updated: 1,
      link: null,
    },
  ];
}

function asElements(value: unknown): SketchSceneElement[] {
  if (!Array.isArray(value)) return [];
  return value.filter((el): el is SketchSceneElement => Boolean(el && typeof el === "object" && typeof (el as SketchSceneElement).id === "string"));
}

function asFiles(value: unknown): Record<string, SketchSceneFile> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, SketchSceneFile> = {};
  for (const [id, file] of Object.entries(value as Record<string, unknown>)) {
    if (!file || typeof file !== "object") continue;
    const dataURL = (file as SketchSceneFile).dataURL;
    if (typeof dataURL !== "string" || !dataURL) continue;
    out[id] = {
      id: typeof (file as SketchSceneFile).id === "string" ? (file as SketchSceneFile).id : id,
      dataURL,
      mimeType: typeof (file as SketchSceneFile).mimeType === "string" ? (file as SketchSceneFile).mimeType : "image/png",
      created: typeof (file as SketchSceneFile).created === "number" ? (file as SketchSceneFile).created : 1,
    };
  }
  return out;
}

function liveUserElements(elements: SketchSceneElement[]): SketchSceneElement[] {
  return elements.filter((el) => !el.isDeleted && !isSketchChromeId(el.id));
}

function imageElements(elements: SketchSceneElement[]): SketchSceneElement[] {
  return elements.filter((el) => el.type === "image" && !el.isDeleted && el.fileId);
}

function fileHasBytes(files: Record<string, SketchSceneFile>, fileId: string): boolean {
  const file = files[fileId];
  return Boolean(file?.dataURL);
}

/** True when the scene has no Excalidraw image that can actually paint. */
export function sketchSceneNeedsImage(elements: unknown, files: unknown): boolean {
  const els = liveUserElements(asElements(elements));
  const stored = asFiles(files);
  return !imageElements(els).some((el) => fileHasBytes(stored, String(el.fileId)));
}

function backgroundImageElement(ratio: string, fileId: string): SketchSceneElement {
  const dims = sketchRatioDims(ratio);
  return {
    type: "image",
    id: SKETCH_BG_ELEMENT_ID,
    fileId,
    status: "saved",
    scale: [1, 1],
    crop: null,
    x: -dims.w / 2,
    y: -dims.h / 2,
    width: dims.w,
    height: dims.h,
    angle: 0,
    strokeColor: "transparent",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 0,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    locked: true,
    roundness: null,
    seed: 3,
    version: 1,
    versionNonce: 3,
    isDeleted: false,
    groupIds: [],
    frameId: null,
    boundElements: null,
    updated: 1,
    link: null,
  };
}

function sketchFile(fileId: string, image: SketchImageBytes): SketchSceneFile {
  return {
    id: fileId,
    dataURL: image.dataURL,
    mimeType: image.mimeType.startsWith("image/") ? image.mimeType : "image/png",
    created: 1,
  };
}

/**
 * Frame + optional node image + any saved Excalidraw strokes.
 * The image sits under user drawings so they can ink on top.
 */
export function buildSketchInitialData(opts: {
  ratio: string;
  userElements?: unknown;
  userFiles?: unknown;
  background?: SketchImageBytes | null;
}): SketchInitialData {
  const frame = sketchFrameElements(opts.ratio);
  const userElements = liveUserElements(asElements(opts.userElements));
  const files = asFiles(opts.userFiles);
  const background = opts.background ?? null;

  if (background) {
    const missing = imageElements(userElements).find((el) => !fileHasBytes(files, String(el.fileId)));
    if (missing?.fileId) {
      files[String(missing.fileId)] = sketchFile(String(missing.fileId), background);
    } else if (sketchSceneNeedsImage(userElements, files)) {
      files[SKETCH_BG_FILE_ID] = sketchFile(SKETCH_BG_FILE_ID, background);
      userElements.unshift(backgroundImageElement(opts.ratio, SKETCH_BG_FILE_ID));
    }
  }

  return {
    // Frame under the image so the locked 16:9 rect does not sit on top of
    // the drawing surface. User strokes stay last so they paint above.
    elements: [...frame, ...userElements],
    files: Object.keys(files).length > 0 ? files : undefined,
    appState: SKETCH_EDITOR_APP_STATE,
    scrollToContent: true,
  };
}

export function sketchFileMime(mime: string): string {
  if (mime === "image/jpeg" || mime === "image/jpg") return "image/jpeg";
  if (mime === "image/webp") return "image/webp";
  if (mime === "image/gif") return "image/gif";
  if (mime === "image/svg+xml") return "image/svg+xml";
  return "image/png";
}

export function dataUrlToSketchImage(dataURL: string): SketchImageBytes | null {
  if (!dataURL.startsWith("data:")) return null;
  const semi = dataURL.indexOf(";");
  const mime = semi > 5 ? dataURL.slice(5, semi) : "image/png";
  return { dataURL, mimeType: sketchFileMime(mime) };
}
