import { z } from "zod";
import { activeVariants, baseGeneratorHandle, parseGeneratorHandle } from "@/lib/canvas/generator-variants";

// Stored prefixes map 1:1 to DB tables :
//   lg_ → logos, sf_ → swipe_files, gi_ → generated_images,
//   persona_ → personas (resolves to up to 3 angle images, not one — see
//   blueprintToCanvasData's special-case handling in ../tools/_helpers/blueprint-canvas-data.ts).
// Single face photos (fr_) are no longer a source: faces are Personnages
// only.
export const ImageSourceSchema = z.string().refine(
  (s) =>
    /^stored:(lg|sf|gi|persona)_[\w-]+$/.test(s) ||
    /^generated:[\w-]+$/.test(s) ||
    /^uploaded:[\w-]+$/.test(s) ||
    /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]{4,}$/.test(s),
  { message: "Invalid ImageSource" }
);

const PersonaSourceSchema = z
  .string()
  .regex(
    /^stored:persona_[\w-]+$/,
    "faceReference only accepts a Personnage: image_source must be stored:persona_<id> (see list_personas)",
  );

// Générateur A/B/C test: ["A","B"] or ["A","B","C"], nothing else.
const AbTestSchema = z.object({
  variants: z.union([
    z.tuple([z.literal("A"), z.literal("B")]),
    z.tuple([z.literal("A"), z.literal("B"), z.literal("C")]),
  ]),
});

const FaceReferenceData = z.object({
  type: z.literal("faceReference"),
  image_source: PersonaSourceSchema,
  label: z.string().optional(),
});
const SwipeFileData = z.object({
  type: z.literal("swipeFile"),
  kind: z.enum(["logo", "reference"]),
  image_source: ImageSourceSchema,
  label: z.string().optional(),
});
const SketchData = z.object({
  type: z.literal("sketch"),
  image_source: ImageSourceSchema,
});
const PromptData = z.object({
  type: z.literal("prompt"),
  prompt: z.string(),
  negativePrompt: z.string().optional(),
});
const GeneratorData = z.object({
  type: z.literal("generator"),
  // "ideogram" and "grok" removed: dropped from the app's model roster when
  // image generation migrated to OpenRouter-only (neither has an OpenRouter
  // equivalent) — see MODEL_ID_MAP in ./models.ts.
  model: z.enum(["nano-banana", "openai", "seedream"]),
  aspectRatio: z.enum(["16x9", "9x16", "1x1"]),
  count: z.number().int().min(1).max(4, "count must be at most 4 images (the UI's cap)").optional(),
  abTest: AbTestSchema.optional(),
});

const NodeDataByType = z.discriminatedUnion("type", [
  FaceReferenceData,
  SwipeFileData,
  SketchData,
  PromptData,
  GeneratorData,
]);

// Update of a node that already exists on the canvas: every field is
// optional (a missing image_source keeps the node's current image), but the
// fields that ARE given are validated like for a new node.
const NodeUpdateDataByType = z.discriminatedUnion("type", [
  FaceReferenceData.partial().extend({ type: FaceReferenceData.shape.type }),
  SwipeFileData.partial().extend({ type: SwipeFileData.shape.type }),
  SketchData.partial().extend({ type: SketchData.shape.type }),
  PromptData.partial().extend({ type: PromptData.shape.type }),
  GeneratorData.partial().extend({ type: GeneratorData.shape.type }),
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
  "abTest",
]);
const RESERVED_NODE_KEYS = new Set(["id", "type", "position", "data"]);

export function normalizeNode(raw: unknown): unknown {
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

/**
 * One node's data checked against its type's blueprint schema: in full for a
 * new node, field by field (every field optional) for a node that already
 * exists on the canvas. Issues are "path: message" lines.
 */
export function validateBlueprintNodeData(
  type: string,
  data: Record<string, unknown>,
  { existing }: { existing: boolean },
): { success: true } | { success: false; issues: string[] } {
  const result = (existing ? NodeUpdateDataByType : NodeDataByType).safeParse({ ...data, type });
  if (result.success) return { success: true };
  return {
    success: false,
    issues: result.error.issues.map((issue) => `${["data", ...issue.path.map(String)].join(".")}: ${issue.message}`),
  };
}

const NodeShape = z.object({
  id: z.string().min(1),
  type: z.enum(["faceReference", "swipeFile", "sketch", "prompt", "generator"]),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  data: z.record(z.string(), z.unknown()),
});

const NodeSchema = z.preprocess(
  normalizeNode,
  NodeShape
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

type EdgeInput = z.infer<typeof EdgeSchema>;
type NodeLike = { type: string; data: Record<string, unknown> };

// Variant handles (prompt-in-b, sketch-in-c, …) only exist on a generator
// whose abTest includes that variant.
function checkVariantHandles(edges: EdgeInput[], nodesById: Map<string, NodeLike>, ctx: z.RefinementCtx) {
  edges.forEach((e, i) => {
    const handle = parseGeneratorHandle(e.targetHandle);
    if (handle?.kind !== "input" || handle.variant === "A") return;
    const target = nodesById.get(e.target);
    if (!target) return; // already reported as an unknown node id
    const base = baseGeneratorHandle(e.targetHandle);
    if (target.type !== "generator") {
      ctx.addIssue({
        code: "custom",
        path: ["edges", i, "targetHandle"],
        message: `Handle "${e.targetHandle}" only exists on generator nodes; node "${e.target}" is a ${target.type}. Use "${base}" instead.`,
      });
      return;
    }
    if (!activeVariants(target.data.abTest).includes(handle.variant)) {
      const variants = handle.variant === "C" ? '["A","B","C"]' : '["A","B"]';
      ctx.addIssue({
        code: "custom",
        path: ["edges", i, "targetHandle"],
        message: `Edge to "${e.targetHandle}" needs variant ${handle.variant} active on generator "${e.target}": set its data.abTest = { variants: ${variants} }, or connect to "${base}".`,
      });
    }
  });
}

export const BlueprintSchema = z
  .object({
    nodes: z.array(NodeSchema).default([]),
    // Omit = add no edges. Updating nodes without touching the graph is valid.
    edges: z.array(EdgeSchema).default([]),
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

    checkVariantHandles(bp.edges, new Map(bp.nodes.map((n) => [n.id, n])), ctx);
  });

export type Blueprint = z.infer<typeof BlueprintSchema>;

export type CanvasNodeRef = { id: string; type: string; data: Record<string, unknown> };

/**
 * Blueprint validated against the current canvas, for apply_workflow's merge:
 * - a node whose id is on the canvas (and not removed) is an update: it must
 *   keep its type, and only the fields it gives are validated (image_source
 *   may be missing);
 * - any other node is a new node, validated in full;
 * - an edge may connect blueprint nodes and canvas nodes that are kept;
 * - a node cannot be both in the blueprint and in `removeNodeIds`.
 */
export function mergeBlueprintSchema(canvasNodes: CanvasNodeRef[], removeNodeIds: ReadonlySet<string>) {
  const canvasById = new Map(canvasNodes.filter((n) => !removeNodeIds.has(n.id)).map((n) => [n.id, n]));
  return z
    .object({
      // `data` may be left out: an existing node given as { id, type } changes nothing.
      // Omit nodes/edges = []: update-only (or remove-only) calls need not resend the graph.
      nodes: z.array(z.preprocess(normalizeNode, NodeShape.extend({ data: NodeShape.shape.data.default({}) }))).default([]),
      edges: z.array(EdgeSchema).default([]),
    })
    .superRefine((bp, ctx) => {
      const seen = new Set<string>();
      const merged = new Map<string, NodeLike>(canvasById);
      bp.nodes.forEach((n, i) => {
        if (seen.has(n.id)) {
          ctx.addIssue({ code: "custom", path: ["nodes", i, "id"], message: `Duplicate node id: ${n.id}` });
        }
        seen.add(n.id);
        if (removeNodeIds.has(n.id)) {
          ctx.addIssue({
            code: "custom",
            path: ["nodes", i, "id"],
            message: `Node "${n.id}" is both in the blueprint and in remove_node_ids.`,
          });
          return;
        }
        const existing = canvasById.get(n.id);
        if (existing && existing.type !== n.type) {
          ctx.addIssue({
            code: "custom",
            path: ["nodes", i, "type"],
            message: `Node "${n.id}" already exists on the canvas as a ${existing.type}; its type cannot change to ${n.type}. Use a new id for a new node.`,
          });
          return;
        }
        const schema = existing ? NodeUpdateDataByType : NodeDataByType;
        const result = schema.safeParse({ type: n.type, ...n.data });
        if (!result.success) {
          for (const issue of result.error.issues) {
            ctx.addIssue({ ...issue, path: ["nodes", i, "data", ...(issue.path ?? [])] } as z.core.$ZodRawIssue);
          }
        }
        merged.set(n.id, existing ? { type: n.type, data: { ...existing.data, ...n.data } } : n);
      });
      bp.edges.forEach((e, i) => {
        for (const end of ["source", "target"] as const) {
          if (!merged.has(e[end])) {
            ctx.addIssue({
              code: "custom",
              path: ["edges", i, end],
              message: `Unknown node id: ${e[end]} (not in the blueprint, and not on the canvas or removed in this call)`,
            });
          }
        }
      });
      checkVariantHandles(bp.edges, merged, ctx);
    });
}
export type ImageSource = z.infer<typeof ImageSourceSchema>;
