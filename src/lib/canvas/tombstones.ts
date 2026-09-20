/**
 * Session tombstones: node/edge ids the user deleted. A stale save or poll
 * snapshot must not treat those as « missing, reinject » (the flicker fix
 * for adds). Undo / re-add / an agent recreate clears the id.
 */

export type TombstoneIds = {
  nodeIds: string[];
  edgeIds: string[];
};

const edgeKey = (edge: { source: string; target: string; targetHandle?: string | null }) =>
  JSON.stringify([edge.source, edge.target, edge.targetHandle ?? ""]);

export function asDeletedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || item.length === 0 || seen.has(item)) continue;
    seen.add(item);
    ids.push(item);
  }
  return ids;
}

export function nextDeletedIds(prev: { id: string }[], next: { id: string }[], deleted: string[]): string[] {
  const nextIds = new Set(next.map((item) => item.id));
  const out = new Set(deleted);
  for (const item of prev) {
    if (!nextIds.has(item.id)) out.add(item.id);
  }
  for (const id of nextIds) out.delete(id);
  return [...out];
}

export function emptyTombstones(): TombstoneIds {
  return { nodeIds: [], edgeIds: [] };
}

export function unionDeletedIds(...lists: readonly (readonly string[])[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const id of asDeletedIds(list)) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function mergeTombstones(a: TombstoneIds, b: TombstoneIds): TombstoneIds {
  return { nodeIds: unionDeletedIds(a.nodeIds, b.nodeIds), edgeIds: unionDeletedIds(a.edgeIds, b.edgeIds) };
}

/** A node still on the canvas is live — a poll/load must not keep it tombstoned. */
export function exceptLiveIds<T extends { id: string }>(deleted: readonly string[], live: readonly T[]): string[] {
  if (deleted.length === 0 || live.length === 0) return [...deleted];
  const liveIds = new Set(live.map((item) => item.id));
  return deleted.filter((id) => !liveIds.has(id));
}

export function exceptLiveTombstones<N extends { id: string }, E extends { id: string }>(
  tombs: TombstoneIds,
  nodes: readonly N[],
  edges: readonly E[],
): TombstoneIds {
  return { nodeIds: exceptLiveIds(tombs.nodeIds, nodes), edgeIds: exceptLiveIds(tombs.edgeIds, edges) };
}

export function filterTombstonedCanvas<
  N extends { id: string },
  E extends { id: string; source: string; target: string },
>(nodes: N[], edges: E[], tombstones: TombstoneIds): { nodes: N[]; edges: E[] } {
  const deletedNodes = new Set(tombstones.nodeIds);
  const deletedEdges = new Set(tombstones.edgeIds);
  const nextNodes = (nodes ?? []).filter((node) => !deletedNodes.has(node.id));
  const ids = new Set(nextNodes.map((node) => node.id));
  return {
    nodes: nextNodes,
    edges: (edges ?? []).filter(
      (edge) => !deletedEdges.has(edge.id) && ids.has(edge.source) && ids.has(edge.target),
    ),
  };
}

export function mergeLocalOnlyCanvas<
  N extends { id: string },
  E extends { id: string; source: string; target: string; targetHandle?: string | null },
>(
  serverNodes: N[],
  serverEdges: E[],
  localNodes: N[],
  localEdges: E[],
  tombstones: TombstoneIds = emptyTombstones(),
): { nodes: N[]; edges: E[] } {
  const deletedNodes = new Set(tombstones.nodeIds);
  const deletedEdges = new Set(tombstones.edgeIds);
  const baseNodes = serverNodes.filter((node) => !deletedNodes.has(node.id));
  const ids = new Set(baseNodes.map((node) => node.id));
  const extras = localNodes.filter((node) => !ids.has(node.id) && !deletedNodes.has(node.id));
  const nodes = extras.length > 0 ? [...baseNodes, ...extras] : baseNodes;
  const mergedIds = new Set(nodes.map((node) => node.id));
  const baseEdges = serverEdges.filter(
    (edge) => !deletedEdges.has(edge.id) && mergedIds.has(edge.source) && mergedIds.has(edge.target),
  );
  const keys = new Set(baseEdges.map(edgeKey));
  const extraEdges = localEdges.filter((edge) => {
    if (deletedEdges.has(edge.id)) return false;
    if (keys.has(edgeKey(edge))) return false;
    return mergedIds.has(edge.source) && mergedIds.has(edge.target);
  });
  return extraEdges.length > 0 ? { nodes, edges: [...baseEdges, ...extraEdges] } : { nodes, edges: baseEdges };
}
