/**
 * A node placed by the agent on the server (`place_node`, chantier F2),
 * broadcast to the open canvas as a transient `data-canvas-patch` chunk of the
 * chat stream. Pure — shared by the server tool, the chat panel and the store.
 */

export const CANVAS_PATCH_PART = "data-canvas-patch" as const;

/** Ids of the guided interview's nodes, the only ones place_node writes. */
export const INTERVIEW_NODE_ID = /^iv-(prompt|persona|generator|ref-[1-3]|logo-[1-3])$/;

export type CanvasPatchNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
};

export type CanvasPatchEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string;
};

/**
 * One placement:
 * - `created`: true when the node is new — `node.data` is then its whole data;
 *   false for an update — `node.data` holds only the fields this placement
 *   changed (always `placedByAgentAt`), to merge over the local node;
 * - `node.position`: the node's position in the database (kept locally on an update);
 * - `removedDataKeys`: data fields the placement deleted (a replaced image's stale fields);
 * - `edges`: only the edges this placement added.
 */
export type CanvasPatch = {
  projectId: string;
  updatedAt: string;
  /** The project's updated_at right before this write: a client that doesn't know it missed a server write. */
  previousUpdatedAt: string;
  created: boolean;
  node: CanvasPatchNode;
  removedDataKeys: string[];
  edges: CanvasPatchEdge[];
};

/**
 * One `apply_workflow` write, broadcast as a transient `data-canvas-workflow-patch`
 * chunk. Several nodes share one `updatedAt`, so this cannot be split into
 * successive `data-canvas-patch` parts (the second would look replayed).
 */
export const CANVAS_WORKFLOW_PATCH_PART = "data-canvas-workflow-patch" as const;

export type CanvasWorkflowPatchUpdate = {
  node: CanvasPatchNode;
  removedDataKeys: string[];
};

export type CanvasWorkflowPatchEdgeRef = {
  source: string;
  target: string;
  targetHandle: string;
};

export type CanvasWorkflowPatch = {
  projectId: string;
  updatedAt: string;
  previousUpdatedAt: string;
  created: CanvasPatchNode[];
  updated: CanvasWorkflowPatchUpdate[];
  removedIds: string[];
  edges: CanvasPatchEdge[];
  removedEdges: CanvasWorkflowPatchEdgeRef[];
};

/** An ISO string or a legacy SQLite `datetime('now')` value (UTC, no zone), in ms; null when unparsable. */
function parseTimestamp(value: string): number | null {
  // Strict formats only: Date.parse is lenient with arbitrary strings ("SELF-SAVE-1" parses in V8).
  // SQLite: datetime('now') or strftime('%Y-%m-%d %H:%M:%f') — UTC, no zone, optional fraction.
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(iso)) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** -1, 0 or 1 comparing two `updated_at` values as instants (string order when one can't be parsed). */
export function compareUpdatedAt(a: string, b: string): number {
  const ta = parseTimestamp(a);
  const tb = parseTimestamp(b);
  if (ta !== null && tb !== null) return ta === tb ? 0 : ta < tb ? -1 : 1;
  return a === b ? 0 : a < b ? -1 : 1;
}

/**
 * A new ISO `updated_at` strictly after `previous`: two writes in the same
 * millisecond (a save and an agent placement) must never share a timestamp,
 * or a client base equal to one would wrongly cover the other.
 */
export function nextUpdatedAt(previous: string | null | undefined, nowMs: number = Date.now()): string {
  const previousMs = previous ? parseTimestamp(previous) : null;
  return new Date(previousMs !== null && previousMs >= nowMs ? previousMs + 1 : nowMs).toISOString();
}

/**
 * True when `value` is the same state as `known` or an older one: both parse
 * as instants and `value` is not after `known`, or they are equal strings.
 * Unparsable values never count as older.
 */
export function isKnownUpdatedAt(value: string, known: string | null): boolean {
  if (known === null) return false;
  if (value === known) return true;
  const tv = parseTimestamp(value);
  const tk = parseTimestamp(known);
  return tv !== null && tk !== null && tv <= tk;
}

/** The later of two `updated_at` values (either may be null). */
export function laterUpdatedAt(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return compareUpdatedAt(a, b) >= 0 ? a : b;
}

/**
 * A patch is applied only to the open miniature once its canvas is loaded (or
 * while it loads: the store replays it over the loaded canvas), and
 * only when it is newer than what the canvas already knows: a patch replayed
 * by a reconnection, or already contained in a reload from the database, is
 * ignored.
 */
export function shouldApplyAgentWrite(
  write: { projectId: string; updatedAt: string },
  state: { openProjectId: string; loaded: boolean; loading?: boolean; knownUpdatedAt: string | null },
): boolean {
  if (write.projectId !== state.openProjectId || !(state.loaded || state.loading)) return false;
  return state.knownUpdatedAt === null || compareUpdatedAt(write.updatedAt, state.knownUpdatedAt) > 0;
}

export function shouldApplyCanvasPatch(
  patch: CanvasPatch,
  state: { openProjectId: string; loaded: boolean; loading?: boolean; knownUpdatedAt: string | null },
): boolean {
  return shouldApplyAgentWrite(patch, state);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function isPatchNode(value: unknown): value is CanvasPatchNode {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.type !== "string" || !isRecord(value.data)) return false;
  return isRecord(value.position) && typeof value.position.x === "number" && typeof value.position.y === "number";
}

function isPatchEdge(value: unknown): value is CanvasPatchEdge {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.source === "string" &&
    typeof value.target === "string" &&
    typeof value.targetHandle === "string" &&
    (value.sourceHandle === null || typeof value.sourceHandle === "string")
  );
}

export function isCanvasPatch(value: unknown): value is CanvasPatch {
  if (!isRecord(value) || typeof value.projectId !== "string" || typeof value.updatedAt !== "string") return false;
  if (typeof value.created !== "boolean" || typeof value.previousUpdatedAt !== "string") return false;
  if (!Array.isArray(value.removedDataKeys) || !value.removedDataKeys.every((key) => typeof key === "string")) return false;
  if (!isPatchNode(value.node)) return false;
  return Array.isArray(value.edges) && value.edges.every(isPatchEdge);
}

export function isCanvasWorkflowPatch(value: unknown): value is CanvasWorkflowPatch {
  if (!isRecord(value) || typeof value.projectId !== "string" || typeof value.updatedAt !== "string") return false;
  if (typeof value.previousUpdatedAt !== "string") return false;
  if (!Array.isArray(value.created) || !value.created.every(isPatchNode)) return false;
  if (
    !Array.isArray(value.updated) ||
    !value.updated.every(
      (item) =>
        isRecord(item) &&
        isPatchNode(item.node) &&
        Array.isArray(item.removedDataKeys) &&
        item.removedDataKeys.every((key) => typeof key === "string"),
    )
  ) {
    return false;
  }
  if (!Array.isArray(value.removedIds) || !value.removedIds.every((id) => typeof id === "string")) return false;
  if (!Array.isArray(value.edges) || !value.edges.every(isPatchEdge)) return false;
  return (
    Array.isArray(value.removedEdges) &&
    value.removedEdges.every(
      (edge) =>
        isRecord(edge) &&
        typeof edge.source === "string" &&
        typeof edge.target === "string" &&
        typeof edge.targetHandle === "string",
    )
  );
}

export function workflowPatchHasChanges(patch: CanvasWorkflowPatch): boolean {
  return (
    patch.created.length > 0 ||
    patch.updated.length > 0 ||
    patch.removedIds.length > 0 ||
    patch.edges.length > 0 ||
    patch.removedEdges.length > 0
  );
}
