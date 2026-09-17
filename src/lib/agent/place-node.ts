import { z } from "zod";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import { normalizeNode, validateBlueprintNodeData } from "@/lib/agent/blueprint/schema";
import {
  blueprintToCanvasData,
  blueprintUpdateToCanvasData,
  mergeCanvasData,
  type CanvasData,
} from "@/lib/agent/tools/_helpers/blueprint-canvas-data";
import { imageExists, markAttached } from "@/lib/agent/tools/_helpers/image-source";
import { NODE_W } from "@/lib/agent/tools/_helpers/auto-layout";
import { createCanvasSnapshot, writeProjectCanvas } from "@/lib/canvas-snapshots";
import type { CanvasPatch, CanvasPatchEdge, CanvasPatchNode } from "@/lib/canvas/canvas-patch";

/**
 * `place_node` (chantier F2): places or completes ONE guided-interview node
 * (`iv-*`) on a project's canvas, in the database. The chat route builds the
 * AI SDK tool per request (src/lib/agent/v2/place-node-tool.ts) and
 * broadcasts the returned patch to the open canvas.
 */

export const INTERVIEW_NODE_ID = /^iv-(prompt|persona|generator|ref-[1-3]|logo-[1-3])$/;
export const INTERVIEW_GENERATOR_ID = "iv-generator";

/** Gap between the right edge of the non-interview canvas and the interview inputs column. */
export const INTERVIEW_COLUMN_GAP = 200;
export const INTERVIEW_PROMPT_OFFSET = 420;
export const INTERVIEW_GENERATOR_OFFSET = 840;
export const INTERVIEW_ROW_SPACING = 240;
/** An input node closer than this to a slot (x and y) takes it. */
const SLOT_TOLERANCE = 120;

const PLACE_NODE_TYPES = ["prompt", "faceReference", "swipeFile", "generator"] as const;

export const placeNodeInputSchema = z.object({
  node: z
    .looseObject({
      id: z
        .string()
        .describe("iv-prompt, iv-persona, iv-ref-1..3, iv-logo-1..3 or iv-generator (the only ids place_node accepts)."),
      type: z.enum(PLACE_NODE_TYPES).describe("prompt for iv-prompt, faceReference for iv-persona, swipeFile for iv-ref-*/iv-logo-*, generator for iv-generator."),
      data: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          'prompt: { prompt, negativePrompt? }; faceReference: { image_source: "stored:persona_<id>" }; swipeFile: { image_source, label? } (kind is implied by the id); generator: { model: "nano-banana" | "openai" | "seedream", aspectRatio: "16x9" | "9x16" | "1x1", count? }. On an existing node only the fields you give change.',
        ),
    })
    .describe("The interview node to place or complete."),
});

export type PlaceNodeInput = z.infer<typeof placeNodeInputSchema>;

type StoredNode = {
  id: string;
  type: string;
  position?: { x: number; y: number };
  data?: Record<string, unknown>;
  width?: number;
  measured?: { width?: number };
};
type StoredEdge = { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null };

export type PlaceNodeOutcome =
  | { ok: true; patch: CanvasPatch; created: boolean; linkedToGenerator: boolean; linkedNodeIds: string[] }
  | { ok: false; error: string };

/** The node type (and swipe file kind) an interview id stands for; null for any other id. */
export function interviewNodeType(id: string): { type: (typeof PLACE_NODE_TYPES)[number]; kind?: "reference" | "logo" } | null {
  const match = id.match(INTERVIEW_NODE_ID);
  if (!match) return null;
  const role = match[1];
  if (role === "prompt") return { type: "prompt" };
  if (role === "persona") return { type: "faceReference" };
  if (role === "generator") return { type: "generator" };
  return { type: "swipeFile", kind: role.startsWith("ref-") ? "reference" : "logo" };
}

/** The generator handle an interview node plugs into; null for the generator itself or another type. */
export function interviewHandle(node: { type: string; data?: Record<string, unknown> }): string | null {
  switch (node.type) {
    case "faceReference":
      return "face-in";
    case "prompt":
      return "prompt-in";
    case "swipeFile":
      return node.data?.kind === "logo" ? "logo-in" : "ref-in";
    default:
      return null;
  }
}

const isInterviewInput = (id: string) => id === "iv-persona" || /^iv-(ref|logo)-[1-3]$/.test(id);

/**
 * Column position of a new interview node, relative to the non-interview
 * canvas (so the columns never drift as the interview grows): inputs stacked
 * in the first free slot at `maxRight + 200`, prompt at +420, generator at +840.
 */
export function interviewPosition(id: string, canvasNodes: StoredNode[]): { x: number; y: number } {
  const others = canvasNodes.filter((node) => !node.id.startsWith("iv-"));
  const left =
    others.length > 0
      ? Math.max(...others.map((node) => (node.position?.x ?? 0) + (node.measured?.width ?? node.width ?? NODE_W))) +
        INTERVIEW_COLUMN_GAP
      : 0;
  const top = others.length > 0 ? Math.min(...others.map((node) => node.position?.y ?? 0)) : 0;

  if (id === "iv-prompt") return { x: left + INTERVIEW_PROMPT_OFFSET, y: top };
  if (id === INTERVIEW_GENERATOR_ID) return { x: left + INTERVIEW_GENERATOR_OFFSET, y: top };

  const taken = canvasNodes.filter((node) => node.id !== id && isInterviewInput(node.id) && node.position).map((node) => node.position!);
  for (let slot = 0; ; slot++) {
    const y = top + INTERVIEW_ROW_SPACING * slot;
    if (!taken.some((position) => Math.abs(position.x - left) < SLOT_TOLERANCE && Math.abs(position.y - y) < SLOT_TOLERANCE)) {
      return { x: left, y };
    }
  }
}

const edgeKey = (edge: { source: string; target: string; targetHandle?: string | null }) =>
  JSON.stringify([edge.source, edge.target, edge.targetHandle ?? ""]);

/** Edges from every interview node present to iv-generator (when it is present), not already on the canvas. */
function missingGeneratorEdges(nodes: StoredNode[], edges: StoredEdge[]): CanvasPatchEdge[] {
  if (!nodes.some((node) => node.id === INTERVIEW_GENERATOR_ID)) return [];
  const keys = new Set(edges.map(edgeKey));
  const added: CanvasPatchEdge[] = [];
  for (const node of nodes) {
    if (node.id === INTERVIEW_GENERATOR_ID || !INTERVIEW_NODE_ID.test(node.id)) continue;
    const targetHandle = interviewHandle(node);
    if (!targetHandle) continue;
    const edge = { source: node.id, target: INTERVIEW_GENERATOR_ID, targetHandle };
    if (keys.has(edgeKey(edge))) continue;
    keys.add(edgeKey(edge));
    // id + sourceHandle:null so React Flow renders them (same shape as apply_workflow)
    added.push({ id: `e-${uuid().slice(0, 8)}`, source: edge.source, sourceHandle: null, target: edge.target, targetHandle });
  }
  return added;
}

function parseArray<T>(json: string): T[] {
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

const readCanvas = (projectId: string) =>
  getDb().prepare("SELECT nodes, edges FROM projects WHERE id = ?").get(projectId) as { nodes: string; edges: string } | undefined;

const fail = (error: string): PlaceNodeOutcome => ({ ok: false, error });

export async function placeInterviewNode(projectId: string, input: PlaceNodeInput): Promise<PlaceNodeOutcome> {
  const raw = normalizeNode(input?.node) as { id?: unknown; type?: unknown; data?: unknown } | null;
  const id = typeof raw?.id === "string" ? raw.id : "";
  const type = typeof raw?.type === "string" ? raw.type : "";
  const data: Record<string, unknown> =
    raw?.data && typeof raw.data === "object" && !Array.isArray(raw.data) ? { ...(raw.data as Record<string, unknown>) } : {};

  const expected = interviewNodeType(id);
  if (!expected) {
    return fail(`Invalid node id "${id}": place_node only accepts iv-prompt, iv-persona, iv-ref-1..3, iv-logo-1..3 and iv-generator.`);
  }
  if (type !== expected.type) return fail(`Node "${id}" must be a ${expected.type}, not a ${type || "missing type"}.`);
  if (expected.kind) {
    if (data.kind !== undefined && data.kind !== expected.kind) {
      return fail(`Node "${id}" is a ${expected.kind} swipeFile: its kind cannot be "${String(data.kind)}".`);
    }
    data.kind = expected.kind;
  }
  if (type === "generator" && data.abTest !== undefined) {
    return fail("The interview generator has no A/B test (abTest): leave it out.");
  }

  const before = readCanvas(projectId);
  if (!before) return fail(`Project not found: ${projectId}`);
  const existing = parseArray<StoredNode>(before.nodes).find((node) => node.id === id);
  if (existing && existing.type !== type) {
    return fail(`Node "${id}" already exists on the canvas as a ${existing.type}; place_node cannot change it to a ${type}.`);
  }

  const validation = validateBlueprintNodeData(type, data, { existing: Boolean(existing) });
  if (!validation.success) return fail(`Invalid data for node "${id}":\n${validation.issues.join("\n")}`);

  const imageSource = typeof data.image_source === "string" ? data.image_source : undefined;
  if (imageSource && !imageExists(imageSource)) return fail(`Image source not found on node ${id}: ${imageSource}`);

  // Images are resolved before the write; the merge itself runs on a fresh read inside the transaction.
  let mapped: { data: CanvasData; replacesImage: boolean };
  try {
    if (existing) {
      const { patch, replacesImage } = await blueprintUpdateToCanvasData(type, data, { libraryUrls: true });
      mapped = { data: patch, replacesImage };
    } else {
      mapped = { data: await blueprintToCanvasData(type, data, { libraryUrls: true }), replacesImage: Boolean(imageSource) };
    }
  } catch (error) {
    return fail(`Could not resolve the image of node ${id}: ${(error as Error).message}`);
  }

  const db = getDb();
  const updatedAt = new Date().toISOString();
  const written = db.transaction(() => {
    const fresh = readCanvas(projectId);
    if (!fresh) return fail(`Project not found: ${projectId}`);
    const nodes = parseArray<StoredNode>(fresh.nodes);
    const edges = parseArray<StoredEdge>(fresh.edges);
    const index = nodes.findIndex((node) => node.id === id);
    if (index >= 0 && nodes[index].type !== type) {
      return fail(`Node "${id}" already exists on the canvas as a ${nodes[index].type}; place_node cannot change it to a ${type}.`);
    }

    let placed: CanvasPatchNode;
    if (index >= 0) {
      const current = nodes[index];
      placed = {
        id,
        type,
        position: current.position ?? { x: 0, y: 0 },
        data: { ...mergeCanvasData(current.data ?? {}, mapped.data, mapped.replacesImage), placedByAgentAt: updatedAt },
      };
      nodes[index] = { ...current, position: placed.position, data: placed.data };
    } else {
      placed = { id, type, position: interviewPosition(id, nodes), data: { ...mapped.data, placedByAgentAt: updatedAt } };
      nodes.push(placed);
    }

    const added = missingGeneratorEdges(nodes, edges);
    const finalEdges = [...edges, ...added];
    createCanvasSnapshot(projectId, fresh.nodes, fresh.edges, "place_node", db);
    writeProjectCanvas(projectId, JSON.stringify(nodes), JSON.stringify(finalEdges), db, updatedAt);

    const linkedNodeIds =
      id === INTERVIEW_GENERATOR_ID
        ? finalEdges.filter((edge) => edge.target === INTERVIEW_GENERATOR_ID && INTERVIEW_NODE_ID.test(edge.source)).map((edge) => edge.source)
        : [];
    const linkedToGenerator =
      id === INTERVIEW_GENERATOR_ID
        ? linkedNodeIds.length > 0
        : finalEdges.some((edge) => edge.source === id && edge.target === INTERVIEW_GENERATOR_ID);
    const outcome: PlaceNodeOutcome = {
      ok: true,
      patch: { projectId, updatedAt, node: placed, edges: added },
      created: index < 0,
      linkedToGenerator,
      linkedNodeIds: [...new Set(linkedNodeIds)],
    };
    return outcome;
  })();

  if (written.ok && imageSource) markAttached(imageSource);
  return written;
}
