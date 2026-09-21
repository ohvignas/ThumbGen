import { z } from "zod";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import { ToolDefinition, type ToolResult } from "./types";
import { registerTool } from "./index";
import { mergeBlueprintSchema, type CanvasNodeRef } from "@/lib/agent/blueprint/schema";
import { createCanvasSnapshot, writeProjectCanvas } from "@/lib/canvas-snapshots";
import { nextUpdatedAt, workflowPatchHasChanges, type CanvasWorkflowPatch } from "@/lib/canvas/canvas-patch";
import { edgesToRemoveForVariants, type VariantId } from "@/lib/canvas/generator-variants";
import { autoLayout, NODE_W } from "./_helpers/auto-layout";
import { imageExists, markAttached } from "./_helpers/image-source";
import { blueprintToCanvasData, blueprintUpdateToCanvasData, mergeCanvasData } from "./_helpers/blueprint-canvas-data";
import { debugLog } from "@/lib/debug-log";

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

export type ApplyWorkflowInput = z.infer<typeof InputSchema>;

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

function fail(text: string): { result: ToolResult; workflowPatch: null } {
  return { result: { isError: true, content: [{ type: "text", text }] }, workflowPatch: null };
}

export type ApplyWorkflowOutcome = {
  result: ToolResult;
  workflowPatch: CanvasWorkflowPatch | null;
};

/**
 * Merges a blueprint into the project canvas. Chat v2 broadcasts `workflowPatch`
 * as a live `data-canvas-workflow-patch`; MCP uses the text result only.
 */
export async function applyWorkflow({
  project_id,
  blueprint,
  remove_node_ids = [],
  remove_edges = [],
}: ApplyWorkflowInput): Promise<ApplyWorkflowOutcome> {
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
      debugLog("agent", "apply_workflow invalid blueprint string", { projectId: project_id });
      return fail("Invalid blueprint: received a string that is not valid JSON.");
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
    debugLog("agent", "apply_workflow invalid blueprint", { projectId: project_id });
    return fail(`Invalid blueprint:\n${JSON.stringify(parsed.error.format(), null, 2)}`);
  }
  const target = parsed.data;

  // Cheap existence check — no bytes loaded
  for (const node of target.nodes) {
    const src = getImageSource(node);
    if (src && !imageExists(src)) {
      debugLog("agent", "apply_workflow missing image", { projectId: project_id, nodeId: node.id });
      return fail(`Image source not found on node ${node.id}: ${src}`);
    }
  }

  const blueprintById = new Map(target.nodes.map((n) => [n.id, n]));
  const removedIds = remove_node_ids.filter((id) => currentIds.has(id));
  const unknownRemoveIds = remove_node_ids.filter((id) => !currentIds.has(id));

  type UpdatedChange = {
    id: string;
    type: string;
    position: { x: number; y: number };
    dataPatch: Record<string, unknown>;
    removedDataKeys: string[];
  };
  const updatedChanges: UpdatedChange[] = [];
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
    const { patch, replacesImage } = await blueprintUpdateToCanvasData(node.type, update.data, { libraryUrls: true });
    // A new image drops the old URL and a sketch's now-stale Excalidraw drawing.
    const data = mergeCanvasData(node.data, patch, replacesImage);
    const removedDataKeys = Object.keys(node.data ?? {}).filter((key) => !(key in data));
    const changed =
      replacesImage ||
      removedDataKeys.length > 0 ||
      JSON.stringify(node.data ?? {}) !== JSON.stringify(data);
    if (node.type === "generator" && patch.abTest) {
      variantChanges.push({ id: node.id, variants: (patch.abTest as { variants: VariantId[] }).variants });
    }
    updatedIds.push(node.id);
    keptNodes.push({ ...node, data });
    if (changed) {
      updatedChanges.push({
        id: node.id,
        type: node.type,
        position: node.position ?? { x: 0, y: 0 },
        dataPatch: patch,
        removedDataKeys,
      });
    }
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
      data: await blueprintToCanvasData(n.type, n.data as Record<string, unknown>, { libraryUrls: true }),
    })),
  );
  const createdIds = new Set(createdNodes.map((n) => n.id));
  const updatedChangeIds = new Set(updatedChanges.map((change) => change.id));

  // Edges: kept when both ends survive and not disconnected, then blueprint edges added once.
  const removeEdgeKeys = new Set(remove_edges.map(edgeKey));
  const matchedRemoveKeys = new Set<string>();
  const survivingIds = new Set([...keptNodes.map((n) => n.id), ...createdNodes.map((n) => n.id)]);
  let mergedEdges: StoredEdge[] = currentEdges.filter((e) => {
    if (!survivingIds.has(e.source) || !survivingIds.has(e.target)) return false;
    if (removeEdgeKeys.has(edgeKey(e))) {
      matchedRemoveKeys.add(edgeKey(e));
      return false;
    }
    return true;
  });
  // A generator whose abTest lost variants loses those variants' edges, as on the canvas.
  for (const change of variantChanges) {
    const dropped = new Set(edgesToRemoveForVariants(mergedEdges, change.id, change.variants));
    mergedEdges = mergedEdges.filter((e) => !dropped.has(e));
  }
  const edgeKeys = new Set(mergedEdges.map(edgeKey));
  const addedEdges: StoredEdge[] = [];
  for (const e of target.edges) {
    if (edgeKeys.has(edgeKey(e))) continue;
    edgeKeys.add(edgeKey(e));
    const edge: StoredEdge = {
      // id + sourceHandle:null so React Flow renders them
      id: `e-${uuid().slice(0, 8)}`,
      source: e.source,
      sourceHandle: null,
      target: e.target,
      targetHandle: e.targetHandle,
    };
    mergedEdges.push(edge);
    addedEdges.push(edge);
  }
  const unknownRemoveEdges = remove_edges.filter((e: EdgeRef) => !matchedRemoveKeys.has(edgeKey(e)));
  const mergedEdgeKeys = new Set(mergedEdges.map(edgeKey));
  const removedEdges = currentEdges
    .filter((e) => !mergedEdgeKeys.has(edgeKey(e)))
    .map((e) => ({ source: e.source, target: e.target, targetHandle: e.targetHandle ?? "" }));

  // The merge above awaited image resolution: the browser's autosave or another
  // client may have written meanwhile. Re-read inside the write transaction and
  // refuse rather than overwrite a change the merge never saw. Otherwise snapshot
  // that fresh read, then write.
  type WriteResult = { ok: false } | { ok: true; updatedAt: string; previousUpdatedAt: string; nodesJson: string; edgesJson: string };
  const written = db.transaction((): WriteResult => {
    const fresh = readCanvas();
    const changed =
      Boolean(fresh) !== Boolean(row) ||
      (fresh && row && (fresh.updated_at !== row.updated_at || fresh.nodes !== row.nodes || fresh.edges !== row.edges));
    if (changed) return { ok: false };
    const previousUpdatedAt = fresh?.updated_at ?? new Date().toISOString();
    const updatedAt = nextUpdatedAt(fresh?.updated_at);
    const stampedKept = keptNodes.map((node) =>
      updatedChangeIds.has(node.id) ? { ...node, data: { ...node.data, placedByAgentAt: updatedAt } } : node,
    );
    const stampedCreated = createdNodes.map((node) => ({ ...node, data: { ...node.data, placedByAgentAt: updatedAt } }));
    const finalNodes = [...stampedKept, ...stampedCreated];
    const nodesJson = JSON.stringify(finalNodes);
    const edgesJson = JSON.stringify(mergedEdges);
    if (fresh) createCanvasSnapshot(project_id, fresh.nodes, fresh.edges, "apply_workflow", db);
    writeProjectCanvas(project_id, nodesJson, edgesJson, db, updatedAt);
    return { ok: true, updatedAt, previousUpdatedAt, nodesJson, edgesJson };
  })();
  if (!written.ok) {
    debugLog("agent", "apply_workflow conflict", { projectId: project_id, created: createdNodes.length, updated: updatedIds.length });
    return fail(
      "The canvas changed while apply_workflow was running (the user or another client edited it), so nothing was written. Call get_canvas_state, then retry apply_workflow against the current canvas.",
    );
  }

  // Stamp in-memory copies used for the live patch (same timestamp as the DB write).
  const createdForPatch = createdNodes.map((node) => ({
    ...node,
    data: { ...node.data, placedByAgentAt: written.updatedAt },
  }));
  for (const change of updatedChanges) {
    change.dataPatch = { ...change.dataPatch, placedByAgentAt: written.updatedAt };
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
  const writtenNodes = parseArray<StoredNode>(written.nodesJson);
  const touched = writtenNodes.filter((n) => createdIds.has(n.id) || updatedIds.includes(n.id));
  const generator = touched.find((n) => n.type === "generator");
  if (generator) {
    lines.push(`Generator node id: ${generator.id} — l'utilisateur peut cliquer "Générer" sur le nœud du canvas.`);
  }

  const workflowPatch: CanvasWorkflowPatch = {
    projectId: project_id,
    updatedAt: written.updatedAt,
    previousUpdatedAt: written.previousUpdatedAt,
    created: createdForPatch.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position ?? { x: 0, y: 0 },
      data: node.data,
    })),
    updated: updatedChanges.map((change) => ({
      node: {
        id: change.id,
        type: change.type,
        position: change.position,
        data: change.dataPatch,
      },
      removedDataKeys: change.removedDataKeys,
    })),
    removedIds,
    edges: addedEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? "",
    })),
    removedEdges,
  };

  debugLog("agent", "apply_workflow wrote", {
    projectId: project_id,
    created: createdForPatch.map((n) => n.id),
    updated: updatedIds,
    removed: removedIds,
    addedEdges: addedEdges.length,
    removedEdges: removedEdges.length,
    livePatch: workflowPatchHasChanges(workflowPatch),
    updatedAt: written.updatedAt,
  });

  return {
    result: { content: [{ type: "text", text: lines.join("\n") }] },
    workflowPatch: workflowPatchHasChanges(workflowPatch) ? workflowPatch : null,
  };
}

export const applyWorkflowTool: ToolDefinition<ApplyWorkflowInput> = {
  name: "apply_workflow",
  description: [
    "Merges a blueprint into the canvas (create/update named nodes; omitted nodes stay). Use to ship a new workflow or edit an existing one. For ONE live iv-* node, place_node is simpler. Never delete unless the user asked. A/B: one generator with abTest, not separate workflows. Never starts a paid generation — the user clicks Générer on the canvas generator themselves.",
    "Merge rules:",
    "1. A blueprint node whose id already exists on the canvas is an UPDATE: only the data fields you give change, every other field is kept (generated images, imported images, persona angles, generator settings) and so is its position. image_source is optional there (omit it to keep the current image). Its type cannot change.",
    "2. A node with a new id is CREATED: it needs its full data (image_source for faceReference/swipeFile/sketch). New nodes are laid out to the right of the existing canvas; existing nodes are never moved.",
    "3. Canvas nodes NOT in the blueprint are KEPT untouched. Send only the nodes you add or change, reusing the existing ids from get_canvas_state.",
    "4. To delete nodes, list their ids in remove_node_ids (their edges go too) — only when the user explicitly asked to delete them. Unknown ids are ignored and reported.",
    "5. Existing edges are kept. Omit edges (or send []) when you only update nodes — the graph is untouched. Blueprint edges are added, deduplicated on source + target + targetHandle, and may connect new nodes to existing canvas nodes. Disconnect an existing edge with remove_edges.",
    "The canvas is snapshotted before every write; the user can restore it from « Historique de l'agent ».",
    "Every image_source is stored as a same-origin URL / stored: ref (pixels stay in SQLite). Blueprint fields are mapped to the canvas shape. Edge handles for the generator are: face-in, ref-in, logo-in, sketch-in, prompt-in. For an A/B/C test set the generator's data.abTest = { variants: [\"A\",\"B\"] } or { variants: [\"A\",\"B\",\"C\"] }: variant B's own inputs go to prompt-in-b / sketch-in-b / ref-in-b, variant C's to prompt-in-c / sketch-in-c / ref-in-c, while face-in and logo-in are shared by every variant.",
    "Returns « Applied: X created, Y updated, Z removed (kept N untouched). » After a successful apply, tell the user the workflow is on the canvas. They click Générer on the generator node if they want images. finish_turn next_actions must be [].",
  ].join("\n"),
  inputSchema: InputSchema,
  handler: async (input) => (await applyWorkflow(input)).result,
};

type ValidatedNode = { id: string; type: string; data: Record<string, unknown> };
function getImageSource(node: ValidatedNode): string | undefined {
  const v = node.data.image_source;
  return typeof v === "string" ? v : undefined;
}

// TODO(v2): optimistic locking via projects.updated_at if-match — currently
// concurrent writers (browser + remote MCP) silently last-write-wins.

registerTool(applyWorkflowTool);
