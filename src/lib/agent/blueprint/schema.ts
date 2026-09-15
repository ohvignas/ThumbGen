import { z } from "zod";

// Stored prefixes map 1:1 to DB tables :
//   lg_ → logos, sf_ → swipe_files, fr_ → face_reactions, gi_ → generated_images,
//   persona_ → personas (resolves to up to 3 angle images, not one — see
//   blueprintToCanvasData's special-case handling in apply-workflow.ts)
export const ImageSourceSchema = z.string().refine(
  (s) =>
    /^stored:(lg|sf|fr|gi|persona)_[\w-]+$/.test(s) ||
    /^generated:[\w-]+$/.test(s) ||
    /^uploaded:[\w-]+$/.test(s) ||
    /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]{4,}$/.test(s),
  { message: "Invalid ImageSource" }
);

const NodeDataByType = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("faceReference"),
    image_source: ImageSourceSchema,
    label: z.string().optional(),
  }),
  z.object({
    type: z.literal("swipeFile"),
    kind: z.enum(["logo", "reference"]),
    image_source: ImageSourceSchema,
    label: z.string().optional(),
  }),
  z.object({
    type: z.literal("sketch"),
    image_source: ImageSourceSchema,
  }),
  z.object({
    type: z.literal("prompt"),
    prompt: z.string(),
    negativePrompt: z.string().optional(),
  }),
  z.object({
    type: z.literal("generator"),
    // "ideogram" and "grok" removed: dropped from the app's model roster when
    // image generation migrated to OpenRouter-only (neither has an OpenRouter
    // equivalent) — see MODEL_ID_MAP in ../tools/apply-workflow.ts.
    model: z.enum(["nano-banana", "openai", "seedream"]),
    aspectRatio: z.enum(["16x9", "9x16", "1x1"]),
    count: z.number().int().min(1).max(10).optional(),
  }),
]);

// Models calling this tool have repeatedly (reproduced live, multiple
// providers) sent type-specific fields (image_source, prompt, model, etc.)
// flattened directly on the node instead of nested under `data` — plausibly
// because the system prompt's prose examples ("faceReference with
// image_source = ...") read as a flat shape. Rather than rejecting an
// otherwise-correct blueprint over this, fold any recognized type-specific
// key found at the node's top level into `data` before validating. A node
// that already has a proper `data` object is passed through untouched.
const KNOWN_DATA_KEYS = new Set([
  "image_source",
  "label",
  "kind",
  "prompt",
  "negativePrompt",
  "model",
  "aspectRatio",
  "count",
]);
const RESERVED_NODE_KEYS = new Set(["id", "type", "position", "data"]);

function normalizeNode(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const node = raw as Record<string, unknown>;
  const existingData = node.data;
  const hasUsableData =
    typeof existingData === "object" && existingData !== null && !Array.isArray(existingData);
  const flattened: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (KNOWN_DATA_KEYS.has(key)) flattened[key] = value;
  }
  if (Object.keys(flattened).length === 0) return node; // nothing to fold in
  const merged = { ...flattened, ...(hasUsableData ? (existingData as Record<string, unknown>) : {}) };
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (RESERVED_NODE_KEYS.has(key) || KNOWN_DATA_KEYS.has(key)) continue;
    rest[key] = value;
  }
  return { ...rest, id: node.id, type: node.type, position: node.position, data: merged };
}

const NodeSchema = z.preprocess(
  normalizeNode,
  z
    .object({
      id: z.string().min(1),
      type: z.enum(["faceReference", "swipeFile", "sketch", "prompt", "generator"]),
      position: z.object({ x: z.number(), y: z.number() }).optional(),
      data: z.record(z.string(), z.unknown()),
    })
    .superRefine((node, ctx) => {
      const result = NodeDataByType.safeParse({ type: node.type, ...node.data });
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue({ ...issue, path: ["data", ...(issue.path ?? [])] });
        }
      }
    }),
);

const EdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  targetHandle: z.string(),
});

export const BlueprintSchema = z
  .object({
    nodes: z.array(NodeSchema),
    edges: z.array(EdgeSchema),
  })
  .superRefine((bp, ctx) => {
    const seen = new Set<string>();
    bp.nodes.forEach((n, i) => {
      if (seen.has(n.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["nodes", i, "id"],
          message: `Duplicate node id: ${n.id}`,
        });
      }
      seen.add(n.id);
    });
    bp.edges.forEach((e, i) => {
      if (!seen.has(e.source)) {
        ctx.addIssue({
          code: "custom",
          path: ["edges", i, "source"],
          message: `Unknown node id: ${e.source}`,
        });
      }
      if (!seen.has(e.target)) {
        ctx.addIssue({
          code: "custom",
          path: ["edges", i, "target"],
          message: `Unknown node id: ${e.target}`,
        });
      }
    });
  });

export type Blueprint = z.infer<typeof BlueprintSchema>;
export type ImageSource = z.infer<typeof ImageSourceSchema>;
