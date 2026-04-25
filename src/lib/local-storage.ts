import { getDb } from "./db";

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
  createdAt: string;
  updatedAt: string;
};

export type ProjectData = {
  nodes: FlowNode[];
  edges: FlowEdge[];
};

export function listProjects(): ProjectMeta[] {
  const db = getDb();
  const rows = db.prepare("SELECT id, name, created_at, updated_at FROM projects_meta ORDER BY created_at ASC").all() as Array<{
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function createProject(name: string): { id: string; name: string } {
  const db = getDb();
  const id = `proj_${Date.now()}`;
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare("INSERT INTO projects_meta (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run(id, name, now, now);
    db.prepare("INSERT INTO projects (id, nodes, edges, updated_at) VALUES (?, '[]', '[]', ?)").run(id, now);
  })();
  return { id, name };
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
  })();
}

export function getProject(id: string): ProjectData | null {
  const db = getDb();
  const row = db.prepare("SELECT nodes, edges FROM projects WHERE id = ?").get(id) as { nodes: string; edges: string } | undefined;
  if (!row) return null;
  let nodes: FlowNode[] = [];
  let edges: FlowEdge[] = [];
  try { nodes = JSON.parse(row.nodes); } catch {}
  try { edges = JSON.parse(row.edges); } catch {}
  return { nodes, edges };
}

export function saveProject(id: string, nodes: FlowNode[], edges: FlowEdge[]): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(`
      INSERT INTO projects (id, nodes, edges, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET nodes = excluded.nodes, edges = excluded.edges, updated_at = excluded.updated_at
    `).run(id, JSON.stringify(nodes), JSON.stringify(edges), now);
    // Ensure a meta entry exists (e.g. for "default" or external upsert)
    const exists = db.prepare("SELECT 1 FROM projects_meta WHERE id = ?").get(id);
    if (!exists) {
      db.prepare("INSERT INTO projects_meta (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run(id, id === "default" ? "Mon projet" : id, now, now);
    } else {
      db.prepare("UPDATE projects_meta SET updated_at = ? WHERE id = ?").run(now, id);
    }
  })();
}
