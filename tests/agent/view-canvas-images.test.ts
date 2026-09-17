import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import sharp from "sharp";
import { getDb } from "@/lib/db";
import { viewCanvasImagesTool } from "@/lib/agent/tools/view-canvas-images";
import type { ToolContent, ToolResult } from "@/lib/agent/tools/types";
import { isVisualResultTool } from "@/lib/agent/finish-turn";

async function png(width: number, height: number, rgb: [number, number, number]): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } })
    .png()
    .toBuffer();
}

const texts = (r: ToolResult) => r.content.flatMap((c: ToolContent) => (c.type === "text" ? [c.text] : []));
const images = (r: ToolResult) =>
  r.content.flatMap((c: ToolContent) => (c.type === "image" ? [c] : [])) as Array<{ mimeType: string; data: string }>;

async function sizeOf(base64: string) {
  const meta = await sharp(Buffer.from(base64, "base64")).metadata();
  return { width: meta.width!, height: meta.height!, format: meta.format };
}

function insertProject(id: string, nodes: unknown[]) {
  getDb().prepare("INSERT OR REPLACE INTO projects (id, nodes, edges) VALUES (?, ?, '[]')").run(id, JSON.stringify(nodes));
}

describe("view_canvas_images", () => {
  const projectId = "test-view-canvas-images";

  beforeAll(async () => {
    const db = getDb();
    const big = await png(2000, 1000, [200, 30, 30]);
    const small = await png(300, 200, [30, 200, 30]);
    for (const id of ["vci-g1", "vci-g2", "vci-g3", "vci-p1"]) {
      db.prepare("INSERT OR REPLACE INTO generated_images (id, mime_type, data) VALUES (?, 'image/png', ?)").run(id, big);
    }
    db.prepare("INSERT OR REPLACE INTO swipe_files (id, title, mime_type, size, data) VALUES ('vci-sf', 'Réf', 'image/png', ?, ?)").run(
      small.length,
      small,
    );
    db.prepare("INSERT OR REPLACE INTO personas (id, label) VALUES ('vci-persona', 'Antoine')").run();
    db.prepare(
      "INSERT OR REPLACE INTO persona_photos (id, persona_id, angle, mime_type, size, data) VALUES ('vci-pp-f', 'vci-persona', 'front', 'image/png', ?, ?)",
    ).run(small.length, small);
    db.prepare(
      "INSERT OR REPLACE INTO persona_photos (id, persona_id, angle, mime_type, size, data) VALUES ('vci-pp-l', 'vci-persona', 'left', 'image/png', ?, ?)",
    ).run(big.length, big);

    insertProject(projectId, [
      { id: "prompt", type: "prompt", data: { prompt: "hello" } },
      { id: "upload", type: "swipeFile", data: { kind: "reference", label: "images (3).png", imageBase64: `data:image/png;base64,${big.toString("base64")}` } },
      { id: "lib", type: "swipeFile", data: { kind: "reference", label: "Réf", imageUrl: "/api/swipe-files/image?f=vci-sf" } },
      {
        id: "face",
        type: "faceReference",
        data: {
          label: "Antoine",
          personaId: "vci-persona",
          personaAngles: { left: "/api/personas/image?id=vci-persona&angle=left", front: "/api/personas/image?id=vci-persona&angle=front" },
        },
      },
      {
        id: "gen",
        type: "generator",
        data: {
          model: "gemini-3.1-flash-image",
          generatedImages: [
            "/api/generated-images/image?id=vci-g1",
            "/api/generated-images/image?id=vci-g2",
            "/api/generated-images/image?id=vci-g3",
          ],
          selectedImageIndex: 1,
        },
      },
      { id: "prev", type: "preview", data: { label: "Nano #1", generatedImages: ["/api/generated-images/image?id=vci-p1"], selectedImageIndex: 0 } },
      { id: "broken", type: "sketch", data: { label: "Croquis", imageUrl: "/api/generated-images/image?id=missing" } },
    ]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is not a visual result of the chat", () => {
    expect(isVisualResultTool("view_canvas_images")).toBe(false);
  });

  it("shows every image-bearing node in canvas order, each preceded by a text header", async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error("no HTTP");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const r = await viewCanvasImagesTool.handler({ project_id: projectId });
    expect(r.isError).toBeFalsy();
    expect(fetchSpy).not.toHaveBeenCalled();

    const headers = texts(r);
    expect(headers).toContain("node upload (swipeFile, images (3).png) — image 1/1");
    expect(headers).toContain("node lib (swipeFile, Réf) — image 1/1 — stored:sf_vci-sf");
    expect(headers).toContain("node face (faceReference, Antoine) — image 1/1 — stored:persona_vci-persona");
    expect(headers).toContain("node gen (generator, gemini-3.1-flash-image) — image 1/2 — stored:gi_vci-g2");
    expect(headers).toContain("node gen (generator, gemini-3.1-flash-image) — image 2/2 — stored:gi_vci-g3");
    expect(headers).toContain("node prev (preview, Nano #1) — image 1/1 — stored:gi_vci-p1");
    expect(headers).toContain("node broken (sketch, Croquis) — pas d'image lisible");
    expect(headers.join("\n")).not.toContain("node prompt");

    // Each image directly follows its header.
    r.content.forEach((part, i) => {
      if (part.type === "image") expect(r.content[i - 1].type).toBe("text");
    });
    expect(images(r)).toHaveLength(6);
  });

  it("downscales to 768px max as JPEG", async () => {
    const r = await viewCanvasImagesTool.handler({ project_id: projectId, node_ids: ["upload", "lib"] });
    const [upload, lib] = images(r);
    expect(upload.mimeType).toBe("image/jpeg");
    expect(await sizeOf(upload.data)).toEqual({ width: 768, height: 384, format: "jpeg" });
    // Never upscaled.
    expect(await sizeOf(lib.data)).toEqual({ width: 300, height: 200, format: "jpeg" });
  });

  it("shows the Personnage's front angle", async () => {
    const r = await viewCanvasImagesTool.handler({ project_id: projectId, node_ids: ["face"] });
    expect(images(r)).toHaveLength(1);
    expect(await sizeOf(images(r)[0].data)).toMatchObject({ width: 300, height: 200 });
  });

  it("limits a generator to 2 images, the selected one first", async () => {
    const r = await viewCanvasImagesTool.handler({ project_id: projectId, node_ids: ["gen"] });
    expect(images(r)).toHaveLength(2);
    expect(texts(r)[0]).toContain("stored:gi_vci-g2");
  });

  it("says when a requested node has no readable image or does not exist", async () => {
    const r = await viewCanvasImagesTool.handler({ project_id: projectId, node_ids: ["prompt", "nope"] });
    expect(images(r)).toHaveLength(0);
    expect(texts(r)).toContain("node prompt (prompt) — pas d'image lisible");
    const missing = texts(r).find((t) => t.includes("nope"))!;
    expect(missing).toMatch(/introuvable/);
    // The canvas autosaves ~2s after a change: suggest trying again.
    expect(missing).toMatch(/pas encore enregistré/);
    expect(missing).toMatch(/réessaie/);
  });

  it("returns at most 8 images per call and names the nodes left out", async () => {
    const tiny = (await png(20, 20, [0, 0, 255])).toString("base64");
    const nodes = Array.from({ length: 11 }, (_, i) => ({
      id: `s${i}`,
      type: "sketch",
      data: { label: `S${i}`, imageBase64: `data:image/png;base64,${tiny}` },
    }));
    insertProject("test-view-canvas-images-many", nodes);
    const r = await viewCanvasImagesTool.handler({ project_id: "test-view-canvas-images-many" });
    expect(images(r)).toHaveLength(8);
    const last = texts(r).at(-1)!;
    expect(last).toContain("s8");
    expect(last).toContain("s10");
    expect(last).toContain("node_ids");
    expect(last).toContain("non affichés");
  });

  it("lists a generator cut by the cap and a requested node left out", async () => {
    const tiny = (await png(20, 20, [0, 0, 255])).toString("base64");
    const sketches = Array.from({ length: 7 }, (_, i) => ({
      id: `t${i}`,
      type: "sketch",
      data: { imageBase64: `data:image/png;base64,${tiny}` },
    }));
    insertProject("test-view-canvas-images-cap", [
      ...sketches,
      {
        id: "gen2",
        type: "generator",
        data: { generatedImages: ["/api/generated-images/image?id=vci-g1", "/api/generated-images/image?id=vci-g2"] },
      },
      { id: "p9", type: "prompt", data: { prompt: "x" } },
    ]);
    const r = await viewCanvasImagesTool.handler({
      project_id: "test-view-canvas-images-cap",
      node_ids: [...sketches.map((s) => s.id), "gen2", "p9"],
    });
    expect(images(r)).toHaveLength(8);
    const last = texts(r).at(-1)!;
    expect(last).toContain("non affichés");
    expect(last).toContain("gen2 (1 image sur 2)");
    expect(last).toContain("p9");
  });

  it("errors on an unknown project", async () => {
    const r = await viewCanvasImagesTool.handler({ project_id: "does-not-exist" });
    expect(r.isError).toBe(true);
  });
});
