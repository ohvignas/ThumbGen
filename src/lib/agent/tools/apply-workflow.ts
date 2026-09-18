import { z } from "zod";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";
import { mergeBlueprintSchema, type CanvasNodeRef } from "@/lib/agent/blueprint/schema";
import { createCanvasSnapshot, writeProjectCanvas } from "@/lib/canvas-snapshots";
import { nextUpdatedAt } from "@/lib/canvas/canvas-patch";
import { edgesToRemoveForVariants, type VariantId } from "@/lib/canvas/generator-variants";
import { autoLayout, NODE_W } from "./_helpers/auto-layout";
import { imageExists, markAttached } from "./_helpers/image-source";
import { blueprintToCanvasData, blueprintUpdateToCanvasData, mergeCanvasData } from "./_helpers/blueprint-canvas-data";

const EdgeRefSchema = z.object({
  source: z.string(),
  target: z.string(),
  targetHandle: z.string(),
});

const InputSchema = z.object({
  project_id: z.string(),
  blueprint: z.unknown(), // validated against the canvas below (mergeBlueprintSchema) for better error formatting
  remove_node_ids: z
    .array(z.string())
    .optional()
    .describe("Ids of canvas nodes to delete, with their edges. Only when the user explicitly asked to delete them."),
  remove_edges: z
    .array(EdgeRefSchema)
    .optional()
    .describe("Existing canvas edges to disconnect, matched on source + target + targetHandle."),
});

// Gap between the right edge of the existing canvas and the new nodes.
const NEW_NODES_GAP = 200;

type StoredNode = {
  id: string;
  type: string;
  position?: { x: number; y: number };
  data: Record<string, unknown>;
  width?: number;
  measured?: { width?: number };
};
type StoredEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};
type EdgeRef = z.infer<typeof EdgeRefSchema>;

const edgeKey = (e: { source: string; target: string; targetHandle?: string | null }) =>
  JSON.stringify([e.source, e.target, e.targetHandle ?? ""]);

function parseArray<T>(json: string): T[] {
  const value = JSON.parse(json);
  return Array.isArray(value) ? (value as T[]) : [];
}

export const applyWorkflowTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "apply_workflow",
  description: [
    "Merges a blueprint into the canvas (create/update named nodes; omitted nodes stay). Use to ship a new workflow or edit an existing one. For ONE live iv-* node, place_node is simpler. Never delete unless the user asked. A/B: one generator with abTest, not separate workflows. Never starts a paid generation — finish_turn kind generate, user clicks.",
    "Merge rules:",
    "1. A blueprint node whose id already exists on the canvas is an UPDATE: only the data fields you give change, every other field is kept (generated images, imported images, persona angles, generator settings) and so is its position. image_source is optional there (omit it to keep the current image). Its type cannot change.",
    "2. A node with a new id is CREATED: it needs its full data (image_source for faceReference/swipeFile/sketch). New nodes are laid out to the right of the existing canvas; existing nodes are never moved.",
    "3. Canvas nodes NOT in the blueprint are KEPT untouched. Send only the nodes you add or change, reusing the existing ids from get_canvas_state.",
    "4. To delete nodes, list their ids in remove_node_ids (their edges go too) — only when the user explicitly asked to delete them. Unknown ids are ignored and reported.",
    "5. Existing edges are kept. Blueprint edges are added, deduplicated on source + target + targetHandle, and may connect new nodes to existing canvas nodes. Disconnect an existing edge with remove_edges.",
    "The canvas is snapshotted before every write; the user can restore it from « Historique de l'agent ».",
    "Every image_source is resolved to a data URL so nodes render on the canvas, and blueprint fields are mapped to the canvas shape. Edge handles for the generator are: face-in, ref-in, logo-in, sketch-in, prompt-in. For an A/B/C test set the generator's data.abTest = { variants: [\"A\",\"B\"] } or { variants: [\"A\",\"B\",\"C\"] }: variant B's own inputs go to prompt-in-b / sketch-in-b / ref-in-b, variant C's to prompt-in-c / sketch-in-c / ref-in-c, while face-in and logo-in are shared by every variant.",
    "Returns « Applied: X created, Y updated, Z removed (kept N untouched). » After a successful apply, tell the user the workflow is ready and they can click Generate on the generator node.",
  ].join("\n"),
  inputSchema: InputSchema,
  handler: async ({ project_id, blueprint, remove_node_ids = [], remove_edges = [] }) => {
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

    const db = getDb();
    const readCanvas = () =>
      db.prepare("SELECT nodes, edges, updated_at FROM projects WHERE id = ?").get(project_id) as
        | { nodes: string; edges: string; updated_at: string }
        | undefined;
    const row = readCanvas();
    const currentNodes = row ? parseArray<StoredNode>(row.nodes) : [];
    const currentEdges = row ? parseArray<StoredEdge>(row.edges) : [];
    const currentIds = new Set(currentNodes.map((n) => n.id));
    const removeSet = new Set(remove_node_ids);

    const parsed = mergeBlueprintSchema(currentNodes as CanvasNodeRef[], removeSet).safeParse(candidate);
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

    const blueprintById = new Map(target.nodes.map((n) => [n.id, n]));
    const removedIds = remove_node_ids.filter((id) => currentIds.has(id));
    const unknownRemoveIds = remove_node_ids.filter((id) => !currentIds.has(id));

    // Existing nodes: removed, updated in place (position kept, data merged) or untouched.
    const updatedIds: string[] = [];
    let untouched = 0;
    const variantChanges: Array<{ id: string; variants: VariantId[] }> = [];
    const keptNodes: StoredNode[] = [];
    for (const node of currentNodes) {
      if (removeSet.has(node.id)) continue;
      const update = blueprintById.get(node.id);
      if (!update) {
        untouched++;
        keptNodes.push(node);
        continue;
      }
      const { patch, replacesImage } = await blueprintUpdateToCanvasData(node.type, update.data);
      // A new image drops the old URL and a sketch's now-stale Excalidraw drawing.
      const data = mergeCanvasData(node.data, patch, replacesImage);
      if (node.type === "generator" && patch.abTest) {
        variantChanges.push({ id: node.id, variants: (patch.abTest as { variants: VariantId[] }).variants });
      }
      updatedIds.push(node.id);
      keptNodes.push({ ...node, data });
    }

    // New nodes: laid out among themselves, then placed right of the existing canvas.
    const newBlueprintNodes = target.nodes.filter((n) => !currentIds.has(n.id));
    const newIds = new Set(newBlueprintNodes.map((n) => n.id));
    const positioned = autoLayout(
      newBlueprintNodes,
      target.edges.filter((e) => newIds.has(e.source) && newIds.has(e.target)),
    );
    let dx = 0;
    let dy = 0;
    if (keptNodes.length > 0 && positioned.length > 0) {
      // Older canvases may hold a node without a position: count it at the origin.
      const maxX = Math.max(...keptNodes.map((n) => (n.position?.x ?? 0) + (n.measured?.width ?? n.width ?? NODE_W)));
      const minY = Math.min(...keptNodes.map((n) => n.position?.y ?? 0));
      dx = maxX + NEW_NODES_GAP - Math.min(...positioned.map((n) => n.position.x));
      dy = minY - Math.min(...positioned.map((n) => n.position.y));
    }
    const createdNodes: StoredNode[] = await Promise.all(
      positioned.map(async (n) => ({
        id: n.id,
        type: n.type,
        position: { x: n.position.x + dx, y: n.position.y + dy },
        data: await blueprintToCanvasData(n.type, n.data as Record<string, unknown>),
      })),
    );
    const finalNodes = [...keptNodes, ...createdNodes];
    const finalIds = new Set(finalNodes.map((n) => n.id));

    // Edges: kept when both ends survive and not disconnected, then blueprint edges added once.
    const removeEdgeKeys = new Set(remove_edges.map(edgeKey));
    const matchedRemoveKeys = new Set<string>();
    let finalEdges: StoredEdge[] = currentEdges.filter((e) => {
      if (!finalIds.has(e.source) || !finalIds.has(e.target)) return false;
      if (removeEdgeKeys.has(edgeKey(e))) {
        matchedRemoveKeys.add(edgeKey(e));
        return false;
      }
      return true;
    });
    // A generator whose abTest lost variants loses those variants' edges, as on the canvas.
    for (const change of variantChanges) {
      const dropped = new Set(edgesToRemoveForVariants(finalEdges, change.id, change.variants));
      finalEdges = finalEdges.filter((e) => !dropped.has(e));
    }
    const edgeKeys = new Set(finalEdges.map(edgeKey));
    for (const e of target.edges) {
      if (edgeKeys.has(edgeKey(e))) continue;
      edgeKeys.add(edgeKey(e));
      finalEdges.push({
        // id + sourceHandle:null so React Flow renders them
        id: `e-${uuid().slice(0, 8)}`,
        source: e.source,
        sourceHandle: null,
        target: e.target,
        targetHandle: e.targetHandle,
      });
    }
    const unknownRemoveEdges = remove_edges.filter((e: EdgeRef) => !matchedRemoveKeys.has(edgeKey(e)));

    // The merge above awaited image resolution: the browser's autosave or another
    // client may have written meanwhile. Re-read inside the write transaction and
    // refuse rather than overwrite a change the merge never saw. Otherwise snapshot
    // that fresh read, then write.
    const written = db.transaction(() => {
      const fresh = readCanvas();
      const changed =
        Boolean(fresh) !== Boolean(row) ||
        (fresh && row && (fresh.updated_at !== row.updated_at || fresh.nodes !== row.nodes || fresh.edges !== row.edges));
      if (changed) return false;
      if (fresh) createCanvasSnapshot(project_id, fresh.nodes, fresh.edges, "apply_workflow", db);
      writeProjectCanvas(project_id, JSON.stringify(finalNodes), JSON.stringify(finalEdges), db, nextUpdatedAt(fresh?.updated_at));
      return true;
    })();
    if (!written) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "The canvas changed while apply_workflow was running (the user or another client edited it), so nothing was written. Call get_canvas_state, then retry apply_workflow against the current canvas.",
          },
        ],
      };
    }

    // Mark referenced uploads/sketches as attached (skip GC)
    for (const node of target.nodes) {
      const src = getImageSource(node);
      if (src) markAttached(src);
    }

    const lines = [
      `Applied: ${createdNodes.length} created, ${updatedIds.length} updated, ${removedIds.length} removed (kept ${untouched} untouched).`,
    ];
    if (createdNodes.length) lines.push(`Created: ${createdNodes.map((n) => n.id).join(", ")}`);
    if (updatedIds.length) lines.push(`Updated: ${updatedIds.join(", ")}`);
    if (removedIds.length) lines.push(`Removed: ${removedIds.join(", ")}`);
    if (unknownRemoveIds.length) {
      lines.push(`Ignored remove_node_ids not on the canvas: ${unknownRemoveIds.join(", ")}`);
    }
    if (unknownRemoveEdges.length) {
      const list = unknownRemoveEdges.map((e) => `${e.source} → ${e.target} (${e.targetHandle})`).join(", ");
      lines.push(`Ignored remove_edges not on the canvas: ${list}`);
    }
    const touched = [...keptNodes.filter((n) => updatedIds.includes(n.id)), ...createdNodes];
    const generator = touched.find((n) => n.type === "generator");
    if (generator) {
      lines.push(`Generator node id: ${generator.id} — l'utilisateur peut cliquer "Generate" dessus pour lancer.`);
    }
    return { content: [{ type: "text", text: lines.join("\n") }] };
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
