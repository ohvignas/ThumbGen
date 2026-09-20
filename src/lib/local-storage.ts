import { getDb } from "./db";
import { INTERVIEW_NODE_ID, compareUpdatedAt, nextUpdatedAt } from "./canvas/canvas-patch";
import { generatedImageIdFromUrl, generatedImageUrl } from "./canvas/image-refs";
import { persistCanvasEqual, persistNodesForSave } from "./canvas/persist-snapshot";
import { asDeletedIds, filterTombstonedCanvas, type TombstoneIds } from "./canvas/tombstones";
import { debugLog } from "./debug-log";

export type FlowNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
};

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
};

export type ProjectMeta = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  /** Gallery card image (`/api/generated-images/image?id=`), or null when unset. */
  coverImageUrl: string | null;
};

export type SetProjectCoverResult = "ok" | "not_found" | "invalid";

export type ProjectData = {
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** `projects.updated_at` of this canvas (set by getProject). */
  updatedAt?: string;
  deletedNodeIds?: string[];
  deletedEdgeIds?: string[];
};

/**
 * What a save wrote, plus what it kept from the agent (chantier F2):
 * `reinjected` — agent nodes (and their edges) the payload lacked;
 * `refreshed` — payload nodes whose data the agent changed after the client's
 * base: written with the stored data and the payload's position.
 */
export type SaveProjectResult = {
  updatedAt: string;
  reinjected: FlowNode[];
  reinjectedEdges: FlowEdge[];
  refreshed: FlowNode[];
  /** Agent nodes of the payload the server had removed after the client's base (not written): drop them locally. */
  removed: string[];
  deletedNodeIds: string[];
  deletedEdgeIds: string[];
  /** True when the stored canvas already matched — `updatedAt` was not bumped. */
  unchanged: boolean;
};

function coverUrlFromId(id: string | null | undefined): string | null {
  return id ? generatedImageUrl(id) : null;
}

export function listProjects(): ProjectMeta[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT id, name, description, created_at, updated_at, cover_image_id FROM projects_meta ORDER BY created_at ASC",
  ).all() as Array<{
    id: string;
    name: string;
    description: string;
    created_at: string;
    updated_at: string;
    cover_image_id: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    coverImageUrl: coverUrlFromId(r.cover_image_id),
  }));
}

/** The project's gallery cover URL, or null when unset / the project does not exist. */
export function getProjectCoverUrl(id: string): string | null {
  const row = getDb().prepare("SELECT cover_image_id FROM projects_meta WHERE id = ?").get(id) as
    | { cover_image_id: string | null }
    | undefined;
  return coverUrlFromId(row?.cover_image_id);
}

/**
 * Sets the project's « miniature gagnante ». Replaces the previous one.
 * `url` must be a same-origin generated-image URL that belongs to this project
 * (or a legacy image with no project_id).
 */
export function setProjectCover(id: string, url: string): SetProjectCoverResult {
  const imageId = generatedImageIdFromUrl(url);
  if (!imageId) return "invalid";
  const db = getDb();
  const meta = db.prepare("SELECT 1 FROM projects_meta WHERE id = ?").get(id);
  if (!meta) return "not_found";
  const image = db.prepare("SELECT project_id FROM generated_images WHERE id = ?").get(imageId) as
    | { project_id: string | null }
    | undefined;
  if (!image) return "invalid";
  if (image.project_id && image.project_id !== id) return "invalid";
  db.prepare("UPDATE projects_meta SET cover_image_id = ?, updated_at = ? WHERE id = ?").run(
    imageId,
    new Date().toISOString(),
    id,
  );
  return "ok";
}

/** The project's name, or null when it does not exist (deleted). */
export function getProjectName(id: string): string | null {
  const row = getDb().prepare("SELECT name FROM projects_meta WHERE id = ?").get(id) as { name: string } | undefined;
  return row?.name ?? null;
}

export function createProject(name: string, description = ""): { id: string; name: string } {
  const db = getDb();
  const id = `proj_${Date.now()}`;
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare("INSERT INTO projects_meta (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(id, name, description, now, now);
    db.prepare("INSERT INTO projects (id, nodes, edges, updated_at) VALUES (?, '[]', '[]', ?)").run(id, now);
  })();
  return { id, name };
}

export function updateProjectDescription(id: string, description: string): boolean {
  const result = getDb()
    .prepare("UPDATE projects_meta SET description = ?, updated_at = ? WHERE id = ?")
    .run(description, new Date().toISOString(), id);
  return result.changes > 0;
}

export function renameProject(id: string, name: string): boolean {
  const db = getDb();
  const result = db.prepare("UPDATE projects_meta SET name = ?, updated_at = ? WHERE id = ?").run(name, new Date().toISOString(), id);
  return result.changes > 0;
}

export class ProjectNotFoundError extends Error {
  readonly code = "PROJECT_NOT_FOUND" as const;
  constructor(id: string) {
    super(`Project not found: ${id}`);
    this.name = "ProjectNotFoundError";
  }
}

export function deleteProject(id: string): void {
  const db = getDb();
  db.transaction(() => {
    // messages.conversation_id → conversations(id) has no ON DELETE CASCADE.
    db.prepare(
      "DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE project_id = ?)",
    ).run(id);
    db.prepare(
      "DELETE FROM competitor_search_results WHERE conversation_id IN (SELECT id FROM conversations WHERE project_id = ?)",
    ).run(id);
    db.prepare("DELETE FROM thumbnail_briefs WHERE project_id = ?").run(id);
    db.prepare("DELETE FROM conversations WHERE project_id = ?").run(id);
    db.prepare("DELETE FROM canvas_snapshots WHERE project_id = ?").run(id);
    db.prepare("DELETE FROM generated_images WHERE project_id = ?").run(id);
    db.prepare("DELETE FROM generations_log WHERE project_id = ?").run(id);
    db.prepare("DELETE FROM canvas_tombstones WHERE project_id = ?").run(id);
    db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    db.prepare("DELETE FROM projects_meta WHERE id = ?").run(id);
  })();
}

export function getProjectTombstones(id: string): TombstoneIds {
  const nodeIds: string[] = [];
  const edgeIds: string[] = [];
  for (const row of readTombstones(id)) {
    if (row.kind === "node") nodeIds.push(row.itemId);
    else edgeIds.push(row.itemId);
  }
  return { nodeIds, edgeIds };
}

/** Drop tombstones for ids that are live again (chat click-placed sketches). */
export function forgetTombstones(projectId: string, ids: TombstoneIds): void {
  const db = getDb();
  const del = db.prepare("DELETE FROM canvas_tombstones WHERE project_id = ? AND kind = ? AND item_id = ?");
  for (const id of asDeletedIds(ids.nodeIds)) del.run(projectId, "node", id);
  for (const id of asDeletedIds(ids.edgeIds)) del.run(projectId, "edge", id);
}

export function liveProjectCanvas(project: Pick<ProjectData, "nodes" | "edges">, tombstones: TombstoneIds) {
  return filterTombstonedCanvas(project.nodes, project.edges, tombstones);
}

export function getProject(id: string): ProjectData | null {
  const db = getDb();
  const row = db.prepare("SELECT nodes, edges, updated_at FROM projects WHERE id = ?").get(id) as
    | { nodes: string; edges: string; updated_at: string }
    | undefined;
  if (!row) return null;
  const tombstones = getProjectTombstones(id);
  return {
    nodes: parseList<FlowNode>(row.nodes),
    edges: parseList<FlowEdge>(row.edges),
    updatedAt: row.updated_at,
    deletedNodeIds: tombstones.nodeIds,
    deletedEdgeIds: tombstones.edgeIds,
  };
}

function parseList<T>(json: string): T[] {
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

const edgeKey = (edge: FlowEdge) => JSON.stringify([edge.source, edge.target, edge.targetHandle ?? ""]);

const placedAfter = (node: FlowNode, baseUpdatedAt: string) => {
  const placedAt = node.data?.placedByAgentAt;
  return typeof placedAt === "string" && compareUpdatedAt(placedAt, baseUpdatedAt) > 0;
};

/**
 * Writes the payload must not erase from the stored canvas:
 * - agent nodes (`placedByAgentAt`) placed after the client's base;
 * - any stored node missing from the payload that the client did not list
 *   as deleted — a 7-node autosave used to wipe a 27-node canvas (prompts
 *   included) because absence was treated as a delete.
 * Ids the client listed as deleted (tombstones) are never reinjected, even
 * when they are agent-stamped: the user dropped them on purpose.
 */
function agentWritesToKeep(
  stored: { nodes: FlowNode[]; edges: FlowEdge[] },
  nodes: FlowNode[],
  edges: FlowEdge[],
  baseUpdatedAt: string,
  deleted: TombstoneIds = { nodeIds: [], edgeIds: [] },
): { nodes: FlowNode[]; reinjected: FlowNode[]; reinjectedEdges: FlowEdge[]; refreshed: FlowNode[] } {
  const deletedNodes = new Set(deleted.nodeIds);
  const deletedEdges = new Set(deleted.edgeIds);
  const storedById = new Map(stored.nodes.map((node) => [node.id, node]));
  const refreshed: FlowNode[] = [];
  const keptNodes = nodes.map((node) => {
    const newer = storedById.get(node.id);
    if (!newer || newer.type !== node.type || !placedAfter(newer, baseUpdatedAt)) return node;
    const next = { ...node, data: newer.data };
    refreshed.push(next);
    return next;
  });
  const payloadIds = new Set(nodes.map((node) => node.id));
  const reinjected = stored.nodes.filter((node) => {
    if (payloadIds.has(node.id) || deletedNodes.has(node.id)) return false;
    if (placedAfter(node, baseUpdatedAt)) return true;
    // User nodes have no agent stamp. A 7-node snapshot must not wipe them.
    // Interview nodes the client already saw stay omitted (⌘Z / drop).
    return typeof node.data?.placedByAgentAt !== "string";
  });
  if (reinjected.length === 0) return { nodes: keptNodes, reinjected, reinjectedEdges: [], refreshed };
  const reinjectedIds = new Set(reinjected.map((node) => node.id));
  const finalIds = new Set([...payloadIds, ...reinjectedIds]);
  const payloadEdgeKeys = new Set(edges.map(edgeKey));
  const reinjectedEdges = stored.edges.filter(
    (edge) =>
      !deletedEdges.has(edge.id) &&
      (reinjectedIds.has(edge.source) || reinjectedIds.has(edge.target)) &&
      finalIds.has(edge.source) &&
      finalIds.has(edge.target) &&
      !payloadEdgeKeys.has(edgeKey(edge)),
  );
  return { nodes: keptNodes, reinjected, reinjectedEdges, refreshed };
}

/**
 * Agent-placed nodes (`placedByAgentAt`) the payload carries but the stored
 * canvas no longer has, when the client's base is older than the stored
 * canvas: the server removed them after the client's state was taken (e.g.
 * « Repartir de zéro »), so a stale save must not bring them back.
 */
type StoredTombstone = { kind: "node" | "edge"; itemId: string; deletedAt: string };

function readTombstones(projectId: string): StoredTombstone[] {
  return getDb()
    .prepare("SELECT kind, item_id AS itemId, deleted_at AS deletedAt FROM canvas_tombstones WHERE project_id = ?")
    .all(projectId) as StoredTombstone[];
}

function persistTombstones(projectId: string, next: StoredTombstone[]): void {
  const db = getDb();
  db.prepare("DELETE FROM canvas_tombstones WHERE project_id = ?").run(projectId);
  const insert = db.prepare(
    "INSERT INTO canvas_tombstones (project_id, kind, item_id, deleted_at) VALUES (?, ?, ?, ?)",
  );
  for (const row of next) insert.run(projectId, row.kind, row.itemId, row.deletedAt);
}

function staleAgainstTombstone(baseUpdatedAt: string | null | undefined, deletedAt: string): boolean {
  return Boolean(baseUpdatedAt && compareUpdatedAt(baseUpdatedAt, deletedAt) < 0);
}

function agentNodesRemovedOnServer(
  stored: { nodes: FlowNode[]; updatedAt?: string },
  nodes: FlowNode[],
  baseUpdatedAt: string,
): Set<string> {
  if (!stored.updatedAt || compareUpdatedAt(baseUpdatedAt, stored.updatedAt) >= 0) return new Set();
  const storedIds = new Set(stored.nodes.map((node) => node.id));
  return new Set(
    nodes
      .filter(
        // Only real interview nodes: a copy the user made keeps its own (uuid) id.
        (node) => INTERVIEW_NODE_ID.test(node.id) && typeof node.data?.placedByAgentAt === "string" && !storedIds.has(node.id),
      )
      .map((node) => node.id),
  );
}

export function saveProject(
  id: string,
  nodes: FlowNode[],
  edges: FlowEdge[],
  baseUpdatedAt?: string | null,
  deleted?: { nodeIds?: unknown; edgeIds?: unknown } | null,
): SaveProjectResult {
  const db = getDb();
  return db.transaction((): SaveProjectResult => {
    const stored = getProject(id);
    const now = nextUpdatedAt(stored?.updatedAt);
    let payloadNodes = nodes;
    let payloadEdges = edges;
    let removed: string[] = [];
    let keptNodes = nodes;
    let reinjected: FlowNode[] = [];
    let reinjectedEdges: FlowEdge[] = [];
    let refreshed: FlowNode[] = [];
    const requested: TombstoneIds = {
      nodeIds: asDeletedIds(deleted?.nodeIds),
      edgeIds: asDeletedIds(deleted?.edgeIds),
    };
    const storedTombstones = readTombstones(id);
    const storedTombAt = new Map(storedTombstones.map((row) => [`${row.kind}:${row.itemId}`, row.deletedAt]));
    const tombstoneAt = new Map(storedTombAt);
    for (const nodeId of requested.nodeIds) tombstoneAt.set(`node:${nodeId}`, now);
    for (const edgeId of requested.edgeIds) tombstoneAt.set(`edge:${edgeId}`, now);

    const dropNodes = new Set<string>(requested.nodeIds);
    for (const node of nodes) {
      const storedDeletedAt = storedTombAt.get(`node:${node.id}`);
      if (storedDeletedAt && staleAgainstTombstone(baseUpdatedAt, storedDeletedAt)) {
        dropNodes.add(node.id);
        continue;
      }
      // In the payload: live. A poll that merged a false tombstone into
      // deletedNodeIds must not delete a node the user still has.
      dropNodes.delete(node.id);
      tombstoneAt.delete(`node:${node.id}`);
    }
    const dropEdges = new Set<string>(requested.edgeIds);
    for (const edge of edges) {
      const storedDeletedAt = storedTombAt.get(`edge:${edge.id}`);
      if (storedDeletedAt && staleAgainstTombstone(baseUpdatedAt, storedDeletedAt)) {
        dropEdges.add(edge.id);
        continue;
      }
      dropEdges.delete(edge.id);
      tombstoneAt.delete(`edge:${edge.id}`);
    }
    if (dropNodes.size > 0 || dropEdges.size > 0) {
      payloadNodes = nodes.filter((node) => !dropNodes.has(node.id));
      payloadEdges = edges.filter(
        (edge) => !dropEdges.has(edge.id) && !dropNodes.has(edge.source) && !dropNodes.has(edge.target),
      );
    }

    const deletedIds: TombstoneIds = {
      nodeIds: [...tombstoneAt.keys()].filter((key) => key.startsWith("node:")).map((key) => key.slice(5)),
      edgeIds: [...tombstoneAt.keys()].filter((key) => key.startsWith("edge:")).map((key) => key.slice(5)),
    };

    if (baseUpdatedAt && stored) {
      const removedIds = agentNodesRemovedOnServer(stored, payloadNodes, baseUpdatedAt);
      for (const nodeId of dropNodes) removedIds.add(nodeId);
      if (removedIds.size > 0) {
        removed = [...removedIds];
        payloadNodes = payloadNodes.filter((node) => !removedIds.has(node.id));
        payloadEdges = payloadEdges.filter((edge) => !removedIds.has(edge.source) && !removedIds.has(edge.target));
      }
      ({ nodes: keptNodes, reinjected, reinjectedEdges, refreshed } = agentWritesToKeep(
        stored,
        payloadNodes,
        payloadEdges,
        baseUpdatedAt,
        deletedIds,
      ));
    } else {
      keptNodes = payloadNodes;
      removed = [...dropNodes];
    }
    const finalNodes = persistNodesForSave([...keptNodes, ...reinjected]) as FlowNode[];
    const finalEdges = [...payloadEdges, ...reinjectedEdges];
    const cleanReinjected = persistNodesForSave(reinjected) as FlowNode[];
    const cleanRefreshed = persistNodesForSave(refreshed) as FlowNode[];
    const nextTombstones: StoredTombstone[] = [...tombstoneAt.entries()].map(([key, deletedAt]) => {
      const sep = key.indexOf(":");
      return { kind: key.slice(0, sep) as "node" | "edge", itemId: key.slice(sep + 1), deletedAt };
    });
    const nextTombIds: TombstoneIds = {
      nodeIds: nextTombstones.filter((row) => row.kind === "node").map((row) => row.itemId),
      edgeIds: nextTombstones.filter((row) => row.kind === "edge").map((row) => row.itemId),
    };
    const exists = db.prepare("SELECT 1 FROM projects_meta WHERE id = ?").get(id);
    if (!exists) {
      // A stale canvas tab used to INSERT a meta row named after the id, so a
      // deleted gallery card came back as « proj_… » / « Pas de description. ».
      throw new ProjectNotFoundError(id);
    }
    const storedLive = stored
      ? liveProjectCanvas(stored, {
          nodeIds: stored.deletedNodeIds ?? [],
          edgeIds: stored.deletedEdgeIds ?? [],
        })
      : { nodes: [] as FlowNode[], edges: [] as FlowEdge[] };
    const finalLive = liveProjectCanvas({ nodes: finalNodes, edges: finalEdges }, nextTombIds);
    const sameCanvas = persistCanvasEqual(
      {
        nodes: storedLive.nodes,
        edges: storedLive.edges,
        deletedNodeIds: stored?.deletedNodeIds,
        deletedEdgeIds: stored?.deletedEdgeIds,
      },
      {
        nodes: finalLive.nodes,
        edges: finalLive.edges,
        deletedNodeIds: nextTombIds.nodeIds,
        deletedEdgeIds: nextTombIds.edgeIds,
      },
    );
    if (sameCanvas && stored?.updatedAt) {
      debugLog("canvas-save", "skip unchanged", {
        projectId: id,
        nodes: storedLive.nodes.length,
        edges: storedLive.edges.length,
        deletedNodeIds: nextTombIds.nodeIds,
        deletedEdgeIds: nextTombIds.edgeIds,
        reinjected: cleanReinjected.map((node) => node.id),
        refreshed: cleanRefreshed.map((node) => node.id),
        removed,
        updatedAt: stored.updatedAt,
      });
      return {
        updatedAt: stored.updatedAt,
        reinjected: cleanReinjected,
        reinjectedEdges,
        refreshed: cleanRefreshed,
        removed,
        deletedNodeIds: nextTombIds.nodeIds,
        deletedEdgeIds: nextTombIds.edgeIds,
        unchanged: true,
      };
    }
    db.prepare(`
      INSERT INTO projects (id, nodes, edges, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET nodes = excluded.nodes, edges = excluded.edges, updated_at = excluded.updated_at
    `).run(id, JSON.stringify(finalLive.nodes), JSON.stringify(finalLive.edges), now);
    db.prepare("UPDATE projects_meta SET updated_at = ? WHERE id = ?").run(now, id);
    persistTombstones(id, nextTombstones);
    debugLog("canvas-save", "db wrote", {
      projectId: id,
      nodes: finalLive.nodes.length,
      edges: finalLive.edges.length,
      deletedNodeIds: nextTombIds.nodeIds,
      deletedEdgeIds: nextTombIds.edgeIds,
      reinjected: cleanReinjected.map((node) => node.id),
      refreshed: cleanRefreshed.map((node) => node.id),
      removed,
      updatedAt: now,
    });
    return {
      updatedAt: now,
      reinjected: cleanReinjected,
      reinjectedEdges,
      refreshed: cleanRefreshed,
      removed,
      deletedNodeIds: nextTombIds.nodeIds,
      deletedEdgeIds: nextTombIds.edgeIds,
      unchanged: false,
    };
  })();
}
