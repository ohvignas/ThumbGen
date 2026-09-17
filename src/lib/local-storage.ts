import { getDb } from "./db";
import { compareUpdatedAt, nextUpdatedAt } from "./canvas/canvas-patch";

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
};

export type ProjectData = {
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** `projects.updated_at` of this canvas (set by getProject). */
  updatedAt?: string;
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
};

export function listProjects(): ProjectMeta[] {
  const db = getDb();
  const rows = db.prepare("SELECT id, name, description, created_at, updated_at FROM projects_meta ORDER BY created_at ASC").all() as Array<{
    id: string;
    name: string;
    description: string;
    created_at: string;
    updated_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
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

export function deleteProject(id: string): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    db.prepare("DELETE FROM projects_meta WHERE id = ?").run(id);
    db.prepare("DELETE FROM canvas_snapshots WHERE project_id = ?").run(id);
  })();
}

export function getProject(id: string): ProjectData | null {
  const db = getDb();
  const row = db.prepare("SELECT nodes, edges, updated_at FROM projects WHERE id = ?").get(id) as
    | { nodes: string; edges: string; updated_at: string }
    | undefined;
  if (!row) return null;
  return { nodes: parseList<FlowNode>(row.nodes), edges: parseList<FlowEdge>(row.edges), updatedAt: row.updated_at };
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
 * What the agent wrote on the server (`data.placedByAgentAt`, chantier F2)
 * after the canvas state the client based its save on — the client never saw
 * it, so the save must not erase it:
 * - a stored agent node the payload doesn't carry is reinjected, with its
 *   stored edges when both ends exist (a node the client saw, base ≥
 *   placedByAgentAt, and removed stays removed);
 * - a payload node the agent updated meanwhile keeps the stored data (the
 *   payload's copy is stale) and the payload's position.
 */
function agentWritesToKeep(
  stored: { nodes: FlowNode[]; edges: FlowEdge[] },
  nodes: FlowNode[],
  edges: FlowEdge[],
  baseUpdatedAt: string,
): { nodes: FlowNode[]; reinjected: FlowNode[]; reinjectedEdges: FlowEdge[]; refreshed: FlowNode[] } {
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
  const reinjected = stored.nodes.filter((node) => !payloadIds.has(node.id) && placedAfter(node, baseUpdatedAt));
  if (reinjected.length === 0) return { nodes: keptNodes, reinjected, reinjectedEdges: [], refreshed };
  const reinjectedIds = new Set(reinjected.map((node) => node.id));
  const finalIds = new Set([...payloadIds, ...reinjectedIds]);
  const payloadEdgeKeys = new Set(edges.map(edgeKey));
  const reinjectedEdges = stored.edges.filter(
    (edge) =>
      (reinjectedIds.has(edge.source) || reinjectedIds.has(edge.target)) &&
      finalIds.has(edge.source) &&
      finalIds.has(edge.target) &&
      !payloadEdgeKeys.has(edgeKey(edge)),
  );
  return { nodes: keptNodes, reinjected, reinjectedEdges, refreshed };
}

export function saveProject(
  id: string,
  nodes: FlowNode[],
  edges: FlowEdge[],
  baseUpdatedAt?: string | null,
): SaveProjectResult {
  const db = getDb();
  return db.transaction((): SaveProjectResult => {
    const stored = getProject(id);
    const now = nextUpdatedAt(stored?.updatedAt);
    let keptNodes = nodes;
    let reinjected: FlowNode[] = [];
    let reinjectedEdges: FlowEdge[] = [];
    let refreshed: FlowNode[] = [];
    if (baseUpdatedAt && stored) {
      ({ nodes: keptNodes, reinjected, reinjectedEdges, refreshed } = agentWritesToKeep(stored, nodes, edges, baseUpdatedAt));
    }
    const finalNodes = [...keptNodes, ...reinjected];
    const finalEdges = [...edges, ...reinjectedEdges];
    db.prepare(`
      INSERT INTO projects (id, nodes, edges, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET nodes = excluded.nodes, edges = excluded.edges, updated_at = excluded.updated_at
    `).run(id, JSON.stringify(finalNodes), JSON.stringify(finalEdges), now);
    // Ensure a meta entry exists (e.g. for "default" or external upsert)
    const exists = db.prepare("SELECT 1 FROM projects_meta WHERE id = ?").get(id);
    if (!exists) {
      db.prepare("INSERT INTO projects_meta (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run(id, id === "default" ? "Mon projet" : id, now, now);
    } else {
      db.prepare("UPDATE projects_meta SET updated_at = ? WHERE id = ?").run(now, id);
    }
    return { updatedAt: now, reinjected, reinjectedEdges, refreshed };
  })();
}
