import { z } from "zod";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";
import { BlueprintSchema } from "@/lib/agent/blueprint/schema";
import { diffBlueprints } from "@/lib/agent/blueprint/diff";
import { autoLayout } from "./_helpers/auto-layout";
import { imageExists, markAttached, resolveImageSource } from "./_helpers/image-source";

const InputSchema = z.object({
  project_id: z.string(),
  blueprint: z.unknown(),  // validated via BlueprintSchema below for better error formatting
});

// Maps the blueprint's coarse model name (nano-banana/openai/seedream) onto
// the actual canvas model ID expected by GeneratorNode. nano-banana →
// Gemini 3.1 Flash (fast, cheap, great with faces — the default
// recommendation for thumbnail generation per the user). "ideogram"/"grok"
// removed from the schema enum (see schema.ts) — no OpenRouter equivalent.
const MODEL_ID_MAP: Record<string, string> = {
  "nano-banana": "gemini-3.1-flash-image",
  openai: "gpt-image-2.5-sunburst",
  seedream: "bytedance-seed/seedream-4.5",
};

type CanvasData = Record<string, unknown>;

async function blueprintToCanvasData(
  type: string,
  data: Record<string, unknown>,
): Promise<CanvasData> {
  const imageSource = typeof data.image_source === "string" ? data.image_source : undefined;

  // A Personnage ref resolves to up to 3 angle images (front/left/right),
  // not one — handled separately from the generic single-image resolver
  // below, which only ever returns one image.
  const personaMatch = type === "faceReference" ? imageSource?.match(/^stored:persona_(.+)$/) : null;
  if (personaMatch) {
    const personaId = personaMatch[1];
    const photos = getDb()
      .prepare("SELECT angle, mime_type, data FROM persona_photos WHERE persona_id = ?")
      .all(personaId) as { angle: "front" | "left" | "right"; mime_type: string; data: Buffer }[];
    const personaAngles: Record<string, string> = {};
    for (const p of photos) {
      personaAngles[p.angle] = `data:${p.mime_type};base64,${p.data.toString("base64")}`;
    }
    const personaRow = getDb().prepare("SELECT label FROM personas WHERE id = ?").get(personaId) as
      | { label: string }
      | undefined;
    return {
      personaId,
      personaAngles,
      label: (data.label as string) || personaRow?.label || "Personnage",
    };
  }

  let imageBase64: string | undefined;
  if (imageSource) {
    const resolved = await resolveImageSource(imageSource);
    imageBase64 = `data:${resolved.mimeType};base64,${resolved.bytes.toString("base64")}`;
  }

  switch (type) {
    case "sketch":
      return {
        imageBase64,
        label: data.label || "Sketch IA",
        // Keep the source ref in case a future tool needs to re-resolve.
        image_source: imageSource,
      };
    case "faceReference":
      return {
        imageBase64,
        label: data.label || "Visage",
        image_source: imageSource,
      };
    case "swipeFile":
      return {
        imageBase64,
        label: data.label || (data.kind === "logo" ? "Logo" : "Image"),
        image_source: imageSource,
      };
    case "prompt":
      return {
        prompt: data.prompt,
        negativePrompt: data.negativePrompt,
      };
    case "generator":
      return {
        model: MODEL_ID_MAP[data.model as string] ?? data.model,
        aspectRatio: data.aspectRatio,
        numImages: data.count ?? 1,
      };
    default:
      return data;
  }
}

export const applyWorkflowTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "apply_workflow",
  description:
    "Builds or replaces the canvas workflow for a project — this is how you SHIP a chosen design. Provide a complete Blueprint with all nodes (faceReference, swipeFile for logos/refs, sketch, prompt, generator) AND all edges connecting them to the generator. The tool resolves every image_source to a data URL so nodes render correctly on the canvas, maps blueprint fields to canvas shape, and auto-layouts. Edge handles for the generator are: face-in, ref-in, logo-in, sketch-in, prompt-in. After successful apply, tell the user the workflow is ready and they can click Generate on the generator node — or you can hint them to that step.",
  inputSchema: InputSchema,
  handler: async ({ project_id, blueprint }) => {
    // Some models serialize this generically-typed (z.unknown()) argument as
    // a JSON string instead of a nested object — reproduced live with
    // anthropic/claude-sonnet-4.6 via OpenRouter tool-calling, 100% of
    // attempts. Accept both rather than rejecting a syntactically-valid
    // blueprint just because of how the model chose to encode it.
    let candidate: unknown = blueprint;
    if (typeof blueprint === "string") {
      try {
        candidate = JSON.parse(blueprint);
      } catch {
        return {
          isError: true,
          content: [{ type: "text", text: "Invalid blueprint: received a string that is not valid JSON." }],
        };
      }
    }
    const parsed = BlueprintSchema.safeParse(candidate);
    if (!parsed.success) {
      return {
        isError: true,
        content: [{ type: "text", text: `Invalid blueprint:\n${JSON.stringify(parsed.error.format(), null, 2)}` }],
      };
    }
    const target = parsed.data;

    // Cheap existence check — no bytes loaded
    for (const node of target.nodes) {
      const src = getImageSource(node);
      if (src && !imageExists(src)) {
        return {
          isError: true,
          content: [{ type: "text", text: `Image source not found on node ${node.id}: ${src}` }],
        };
      }
    }

    // Load current canvas state (for the diff summary)
    const row = getDb().prepare("SELECT nodes, edges FROM projects WHERE id = ?").get(project_id) as
      | { nodes: string; edges: string }
      | undefined;
    const current = row
      ? { nodes: JSON.parse(row.nodes), edges: JSON.parse(row.edges) }
      : { nodes: [], edges: [] };
    const ops = diffBlueprints(current, target);

    // Auto-layout the target
    const positioned = autoLayout(target.nodes, target.edges);

    // Resolve every image_source → imageBase64 data URL and map fields to the
    // canvas data shape. This is what makes nodes ACTUALLY display on the canvas.
    const canvasNodes = await Promise.all(
      positioned.map(async (n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: await blueprintToCanvasData(n.type, n.data as Record<string, unknown>),
      })),
    );

    // Edges: enrich with id + sourceHandle:null so React Flow renders them
    const canvasEdges = target.edges.map((e) => ({
      id: `e-${uuid().slice(0, 8)}`,
      source: e.source,
      sourceHandle: null,
      target: e.target,
      targetHandle: e.targetHandle,
    }));

    if (row) {
      getDb()
        .prepare(
          "UPDATE projects SET nodes = ?, edges = ?, updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?",
        )
        .run(JSON.stringify(canvasNodes), JSON.stringify(canvasEdges), project_id);
    } else {
      getDb()
        .prepare(
          "INSERT INTO projects (id, nodes, edges, updated_at) VALUES (?, ?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now'))",
        )
        .run(project_id, JSON.stringify(canvasNodes), JSON.stringify(canvasEdges));
    }

    // Mark referenced uploads/sketches as attached (skip GC)
    for (const node of target.nodes) {
      const src = getImageSource(node);
      if (src) markAttached(src);
    }

    const summary = `Applied: ${ops.create.length} created, ${ops.update.length} updated, ${ops.delete.length} deleted.`;
    const generator = canvasNodes.find((n) => n.type === "generator");
    const generatorHint = generator
      ? `\nGenerator node id: ${generator.id} — l'utilisateur peut cliquer "Generate" dessus pour lancer.`
      : "";
    return {
      content: [
        { type: "text", text: `${summary}\nNodes: ${target.nodes.map((n) => n.id).join(", ")}${generatorHint}` },
      ],
    };
  },
};

type ValidatedNode = { id: string; type: string; data: Record<string, unknown> };
function getImageSource(node: ValidatedNode): string | undefined {
  const v = node.data.image_source;
  return typeof v === "string" ? v : undefined;
}

// TODO(v2): optimistic locking via projects.updated_at if-match — currently
// concurrent writers (browser + remote MCP) silently last-write-wins.

registerTool(applyWorkflowTool);
