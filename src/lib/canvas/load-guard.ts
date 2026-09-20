import { compareUpdatedAt, isKnownUpdatedAt } from "@/lib/canvas/canvas-patch";
import { keepLocalNodePositions } from "@/lib/canvas/generation-state";
import { persistGraphEqual, type PersistEdge, type PersistNode } from "@/lib/canvas/persist-snapshot";
import { filterTombstonedCanvas, type TombstoneIds } from "@/lib/canvas/tombstones";

const REHYDRATE_KEYS = new Set(["generatedImages", "selectedImageIndex", "genStatus"]);

function withoutRehydrateFields(nodes: readonly PersistNode[]): PersistNode[] {
  return nodes.map((node) => {
    const data = node.data;
    if (!data) return node;
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (REHYDRATE_KEYS.has(key)) {
        changed = true;
        continue;
      }
      next[key] = value;
    }
    return changed ? { ...node, data: next } : node;
  });
}

export type LoadProjectReason = "replace" | "poll" | "resync";

export type LoadProjectOptions = {
  reason?: LoadProjectReason;
  /** History restore / explicit switch: apply the server snapshot even if local is dirty. */
  force?: boolean;
};

export type LoadGuardInput = {
  reason: LoadProjectReason;
  force?: boolean;
  sameProject: boolean;
  loaded: boolean;
  dirty: boolean;
  saving: boolean;
  localNodeCount: number;
  serverNodeCount: number;
  serverUpdatedAt: string | null;
  knownUpdatedAt: string | null;
  epochAtStart: number;
  revision: number;
  /** Persistable nodes/edges match the live canvas — do not replace. */
  samePersistCanvas?: boolean;
};

/**
 * Whether a fetched server canvas should replace the live store.
 * A 2s poll GET can be answered with a snapshot taken before the user's
 * generator was saved — applying it is the flicker (node shows, then hides).
 */
export function serverCanvasSkipReason(input: LoadGuardInput): string | null {
  if (input.force) return null;
  if (!input.sameProject || !input.loaded) return null;
  // Same graph (even if updatedAt moved, or a spurious dirty): keep local nodes.
  if (input.samePersistCanvas) return "same";
  if (input.dirty || input.saving || input.revision !== input.epochAtStart) return "dirty";
  if (input.serverUpdatedAt && isKnownUpdatedAt(input.serverUpdatedAt, input.knownUpdatedAt)) return "known";
  if (
    input.serverUpdatedAt &&
    input.knownUpdatedAt !== null &&
    compareUpdatedAt(input.serverUpdatedAt, input.knownUpdatedAt) < 0
  ) {
    return "older";
  }
  // Poll only: applying a smaller snapshot is the flicker. A resync after an
  // agent write may legitimately have more server nodes; extras are merged.
  if (input.reason === "poll" && input.localNodeCount > input.serverNodeCount) return "more-nodes";
  return null;
}

export type PollEchoInput = {
  localNodes: PersistNode[];
  localEdges: PersistEdge[];
  serverNodes: PersistNode[];
  serverEdges: PersistEdge[];
  tombstones: TombstoneIds;
};

/**
 * Poll snapshot that only resurrects known tombs or fills empty preview
 * refs — not a real remote edit. Applying it resets controlled positions.
 */
export function pollCanvasIsEcho(input: PollEchoInput): boolean {
  const filtered = filterTombstonedCanvas(input.serverNodes, input.serverEdges, input.tombstones);
  const positioned = keepLocalNodePositions(filtered.nodes, input.localNodes);
  const local = { nodes: input.localNodes, edges: input.localEdges };
  const incoming = { nodes: positioned, edges: filtered.edges };
  if (persistGraphEqual(local, incoming)) return true;
  return persistGraphEqual(
    { nodes: withoutRehydrateFields(local.nodes), edges: local.edges },
    { nodes: withoutRehydrateFields(incoming.nodes), edges: incoming.edges },
  );
}
