import { z } from "zod";

export const ImageSourceSchema = z.string().refine(
  (s) =>
    /^stored:(fc|lg|sf|fr|gi)_[\w-]+$/.test(s) ||
    /^generated:[\w-]+$/.test(s) ||
    /^uploaded:[\w-]+$/.test(s) ||
    /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(s),
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
    model: z.enum(["ideogram", "grok", "nano-banana", "openai"]),
    aspectRatio: z.enum(["16x9", "9x16", "1x1"]),
    count: z.number().int().min(1).max(10).optional(),
  }),
]);

const NodeSchema = z
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
  });

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
    const ids = new Set(bp.nodes.map((n) => n.id));
    bp.edges.forEach((e, i) => {
      if (!ids.has(e.source)) {
        ctx.addIssue({
          code: "custom",
          path: ["edges", i, "source"],
          message: `Unknown node id: ${e.source}`,
        });
      }
      if (!ids.has(e.target)) {
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
