/**
 * A node placed by the agent on the server (`place_node`, chantier F2),
 * broadcast to the open canvas as a transient `data-canvas-patch` chunk of the
 * chat stream. Pure — shared by the server tool, the chat panel and the store.
 */

export const CANVAS_PATCH_PART = "data-canvas-patch" as const;

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

/** `node`: the whole node as written; `edges`: only the edges this placement added. */
export type CanvasPatch = { projectId: string; updatedAt: string; node: CanvasPatchNode; edges: CanvasPatchEdge[] };

/** An ISO string or a legacy SQLite `datetime('now')` value (UTC, no zone), in ms; null when unparsable. */
function parseTimestamp(value: string): number | null {
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
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

/** The later of two `updated_at` values (either may be null). */
export function laterUpdatedAt(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return compareUpdatedAt(a, b) >= 0 ? a : b;
}

/**
 * A patch is applied only to the open miniature once its canvas is loaded, and
 * only when it is newer than what the canvas already knows: a patch replayed
 * by a reconnection, or already contained in a reload from the database, is
 * ignored.
 */
export function shouldApplyCanvasPatch(
  patch: CanvasPatch,
  state: { openProjectId: string; loaded: boolean; knownUpdatedAt: string | null },
): boolean {
  if (patch.projectId !== state.openProjectId || !state.loaded) return false;
  return state.knownUpdatedAt === null || compareUpdatedAt(patch.updatedAt, state.knownUpdatedAt) > 0;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function isCanvasPatch(value: unknown): value is CanvasPatch {
  if (!isRecord(value) || typeof value.projectId !== "string" || typeof value.updatedAt !== "string") return false;
  const node = value.node;
  if (!isRecord(node) || typeof node.id !== "string" || typeof node.type !== "string" || !isRecord(node.data)) return false;
  if (!isRecord(node.position) || typeof node.position.x !== "number" || typeof node.position.y !== "number") return false;
  return (
    Array.isArray(value.edges) &&
    value.edges.every(
      (edge) =>
        isRecord(edge) &&
        typeof edge.id === "string" &&
        typeof edge.source === "string" &&
        typeof edge.target === "string" &&
        typeof edge.targetHandle === "string" &&
        (edge.sourceHandle === null || typeof edge.sourceHandle === "string"),
    )
  );
}
