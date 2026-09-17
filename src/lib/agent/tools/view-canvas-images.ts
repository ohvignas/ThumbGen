import { z } from "zod";
import { getDb } from "@/lib/db";
import { ToolContent, ToolDefinition } from "./types";
import { registerTool } from "./index";
import { resolveImageSource, type ResolvedImage } from "./_helpers/image-source";
import { generatorImages, selectedGeneratedImage, toImageSourceRef } from "@/lib/canvas/image-refs";

/** Images sent to the model per call, all nodes together. */
export const MAX_IMAGES_PER_CALL = 8;
/** A generator contributes its selected image first, then its most recent ones. */
export const MAX_IMAGES_PER_GENERATOR = 2;
/** Longest side of every image sent to the model. */
export const MAX_IMAGE_SIDE = 768;
const JPEG_QUALITY = 80;
/** Refuse to decode images larger than this (width × height), whatever their file size. */
export const MAX_INPUT_PIXELS = 40_000_000;
const NOT_SAVED_HINT =
  "Le canvas n'est peut-être pas encore enregistré (sauvegarde ~2 s après une modification) — réessaie dans un instant.";

const InputSchema = z.object({
  project_id: z.string(),
  node_ids: z.array(z.string()).optional(),
});

type CanvasNode = { id: string; type: string; data?: Record<string, unknown> };

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** The image values a node shows on the canvas, most relevant first. */
function nodeImageValues(node: CanvasNode): string[] {
  const data = node.data ?? {};
  switch (node.type) {
    case "sketch":
    case "swipeFile": {
      const value = str(data.imageBase64) ?? str(data.imageUrl) ?? str(data.image_source);
      return value ? [value] : [];
    }
    case "faceReference": {
      const angles = (data.personaAngles ?? {}) as Record<string, unknown>;
      const value =
        str(angles.front) ??
        str(angles.left) ??
        str(angles.right) ??
        str(data.imageBase64) ??
        str(data.imageUrl) ??
        (str(data.personaId) ? `stored:persona_${data.personaId}` : undefined);
      return value ? [value] : [];
    }
    case "generator": {
      const all = generatorImages(data);
      const selected = selectedGeneratedImage(data, true);
      // The last generation's images come last in their lists: newest first.
      const newestFirst = [...all].reverse().filter((image) => image !== selected);
      return (selected ? [selected, ...newestFirst] : newestFirst).slice(0, MAX_IMAGES_PER_GENERATOR);
    }
    case "preview":
    case "textOverlay": {
      const value = selectedGeneratedImage(data, false) ?? str(data.imageBase64) ?? str(data.imageUrl);
      return value ? [value] : [];
    }
    default: {
      const value = str(data.imageBase64) ?? str(data.imageUrl);
      return value ? [value] : [];
    }
  }
}

/** Reads an image value's bytes locally (inline data or the DB) — never over HTTP. */
async function readImage(value: string): Promise<ResolvedImage | null> {
  const inline = value.match(/^data:([^;,]+);base64,(.+)$/);
  if (inline) return { mimeType: inline[1], bytes: Buffer.from(inline[2], "base64") };

  // A Personnage URL names its angle; resolveImageSource would pick the front one.
  if (value.startsWith("/api/personas/image")) {
    const params = new URL(value, "http://thumbgen.local").searchParams;
    const row = getDb()
      .prepare("SELECT mime_type, data FROM persona_photos WHERE persona_id = ? AND angle = ?")
      .get(params.get("id"), params.get("angle")) as { mime_type: string; data: Buffer } | undefined;
    return row ? { mimeType: row.mime_type, bytes: row.data } : null;
  }

  const ref = toImageSourceRef(value);
  if (!ref) return null;
  try {
    return await resolveImageSource(ref);
  } catch {
    return null;
  }
}

async function downscale(bytes: Buffer): Promise<string | null> {
  try {
    // Loaded on first use: the native module stays out of every tool-registry import.
    const { default: sharp } = await import("sharp");
    const out = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
    return out.toString("base64");
  } catch {
    return null;
  }
}

function nodeTitle(node: CanvasNode): string {
  const data = node.data ?? {};
  const label = str(data.label) ?? (node.type === "generator" ? str(data.model) : undefined);
  return `node ${node.id} (${label ? `${node.type}, ${label}` : node.type})`;
}

export const viewCanvasImagesTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "view_canvas_images",
  description:
    "Lets you SEE the images on the project's canvas: sketches, imported or library reference images, logos, the Personnage (front angle), a generator's generated images (at most 2 per generator, its selected image first) and preview outputs. Pass node_ids to look at specific nodes; without node_ids every node that carries an image is shown, in canvas order. At most 8 images per call, each downscaled to 768px. Each image is preceded by a line « node <id> (<type>, <label>) — image k/n » followed by its stored ref when it has one (e.g. stored:gi_<id>, reusable as an image_source). Call it before analysing, completing or modifying an existing workflow.",
  inputSchema: InputSchema,
  handler: async ({ project_id, node_ids }) => {
    const row = getDb().prepare("SELECT nodes FROM projects WHERE id = ?").get(project_id) as
      | { nodes: string }
      | undefined;
    if (!row) {
      return { isError: true, content: [{ type: "text", text: `Projet introuvable : ${project_id}. ${NOT_SAVED_HINT}` }] };
    }

    let canvasNodes: CanvasNode[];
    try {
      const parsed: unknown = JSON.parse(row.nodes);
      if (!Array.isArray(parsed)) throw new Error("nodes is not an array");
      canvasNodes = parsed.filter(
        (n): n is CanvasNode => typeof n === "object" && n !== null && typeof (n as CanvasNode).id === "string",
      );
    } catch {
      return { isError: true, content: [{ type: "text", text: `Canvas illisible (données corrompues) pour le projet ${project_id}.` }] };
    }
    const requested = node_ids ? new Set(node_ids) : null;
    const content: ToolContent[] = [];

    if (requested) {
      const known = new Set(canvasNodes.map((n) => n.id));
      const missing = [...requested].filter((id) => !known.has(id));
      if (missing.length > 0) content.push({ type: "text", text: `Nœuds introuvables sur le canvas : ${missing.join(", ")}. ${NOT_SAVED_HINT}` });
    }

    const targets = canvasNodes
      .filter((node) => (requested ? requested.has(node.id) : true))
      .map((node) => {
        try {
          return { node, values: nodeImageValues(node) };
        } catch {
          return { node, values: [] as string[], broken: true };
        }
      })
      .filter((target) => requested !== null || target.values.length > 0 || "broken" in target);

    let shown = 0;
    const skipped: string[] = [];
    for (const { node, values } of targets) {
      const remaining = MAX_IMAGES_PER_CALL - shown;
      if (remaining <= 0) {
        skipped.push(node.id);
        continue;
      }
      const ready: Array<{ data: string; ref: string | null }> = [];
      let tried = 0;
      for (const value of values) {
        if (ready.length >= remaining) break;
        tried++;
        try {
          const image = await readImage(value);
          const data = image ? await downscale(image.bytes) : null;
          if (data) ready.push({ data, ref: toImageSourceRef(value) });
        } catch {
          // One unreadable image never fails the whole call.
        }
      }
      if (tried < values.length && ready.length > 0) {
        const left = values.length - ready.length;
        skipped.push(`${node.id} (${left} image${left > 1 ? "s" : ""} sur ${values.length})`);
      }
      if (ready.length === 0) {
        content.push({ type: "text", text: `${nodeTitle(node)} — pas d'image lisible` });
        continue;
      }
      ready.forEach((image, index) => {
        const ref = image.ref ? ` — ${image.ref}` : "";
        content.push({ type: "text", text: `${nodeTitle(node)} — image ${index + 1}/${ready.length}${ref}` });
        content.push({ type: "image", mimeType: "image/jpeg", data: image.data });
      });
      shown += ready.length;
    }

    if (skipped.length > 0) {
      content.push({
        type: "text",
        text: `Limite de ${MAX_IMAGES_PER_CALL} images atteinte — non affichés : ${skipped.join(", ")}. Rappelle view_canvas_images avec node_ids pour les voir.`,
      });
    }
    if (content.length === 0) content.push({ type: "text", text: "Aucune image sur le canvas." });
    return { content };
  },
};

registerTool(viewCanvasImagesTool);
