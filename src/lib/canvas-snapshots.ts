import type Database from "better-sqlite3";
import { v4 as uuid } from "uuid";
import { getDb } from "./db";

/**
 * Canvas states saved right before an agent write, so any agent change can be
 * undone from the canvas (« Historique de l'agent »). Table created in
 * src/lib/agent/migrations.ts.
 */

/** Agent snapshots (`apply_workflow`) kept per project. */
export const MAX_SNAPSHOTS_PER_PROJECT = 20;
/** Pre-restore snapshots kept per project, on their own quota so restores never push agent snapshots out. */
export const MAX_RESTORE_SNAPSHOTS_PER_PROJECT = 5;
/** Guided-interview snapshots (`place_node`) kept per project, on their own quota too. */
export const MAX_PLACE_NODE_SNAPSHOTS_PER_PROJECT = 20;

/** `apply_workflow`: state before an agent write. `restore`: state before a restore. `place_node`: state before an interview node. */
export type SnapshotReason = "apply_workflow" | "restore" | "place_node";

export type CanvasSnapshotSummary = {
  id: string;
  created_at: string;
  reason: SnapshotReason;
  node_count: number;
  edge_count: number;
};

const QUOTAS: Record<SnapshotReason, number> = {
  apply_workflow: MAX_SNAPSHOTS_PER_PROJECT,
  restore: MAX_RESTORE_SNAPSHOTS_PER_PROJECT,
  place_node: MAX_PLACE_NODE_SNAPSHOTS_PER_PROJECT,
};

/**
 * Stores the given canvas (JSON strings exactly as in `projects`) and purges
 * the project's snapshots of that reason beyond its quota. A canvas identical
 * to the project's newest snapshot is not stored again: that snapshot is
 * returned instead. Call it inside the same transaction as the write it
 * protects.
 */
export function createCanvasSnapshot(
  projectId: string,
  nodesJson: string,
  edgesJson: string,
  reason: SnapshotReason,
  db: Database.Database = getDb(),
): { id: string; created_at: string } {
  // rowid breaks ties between snapshots created within the same millisecond.
  const newest = db
    .prepare(
      "SELECT id, created_at, nodes, edges FROM canvas_snapshots WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
    )
    .get(projectId) as { id: string; created_at: string; nodes: string; edges: string } | undefined;
  if (newest && newest.nodes === nodesJson && newest.edges === edgesJson) {
    return { id: newest.id, created_at: newest.created_at };
  }
  const id = uuid();
  const createdAt = new Date().toISOString();
  db.prepare(
    "INSERT INTO canvas_snapshots (id, project_id, created_at, nodes, edges, reason) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, projectId, createdAt, nodesJson, edgesJson, reason);
  db.prepare(
    `DELETE FROM canvas_snapshots WHERE project_id = ? AND reason = ? AND id NOT IN (
       SELECT id FROM canvas_snapshots WHERE project_id = ? AND reason = ? ORDER BY created_at DESC, rowid DESC LIMIT ?
     )`,
  ).run(projectId, reason, projectId, reason, QUOTAS[reason]);
  return { id, created_at: createdAt };
}

/** Newest first. Counts come from SQL: the canvas payloads are never loaded or parsed here. */
export function listCanvasSnapshots(projectId: string): CanvasSnapshotSummary[] {
  return getDb()
    .prepare(
      `SELECT id, created_at, reason,
         CASE WHEN json_valid(nodes) AND json_type(nodes) = 'array' THEN json_array_length(nodes) ELSE 0 END AS node_count,
         CASE WHEN json_valid(edges) AND json_type(edges) = 'array' THEN json_array_length(edges) ELSE 0 END AS edge_count
       FROM canvas_snapshots WHERE project_id = ? ORDER BY created_at DESC, rowid DESC`,
    )
    .all(projectId) as CanvasSnapshotSummary[];
}

export function projectExists(projectId: string): boolean {
  return Boolean(getDb().prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId));
}

/**
 * Writes the canvas to `projects` with an ISO updated_at (same format as
 * saveProject) and bumps the meta row when there is one. `now` lets a caller
 * stamp the same instant elsewhere (place_node's `placedByAgentAt`).
 */
export function writeProjectCanvas(
  projectId: string,
  nodesJson: string,
  edgesJson: string,
  db: Database.Database = getDb(),
  now: string = new Date().toISOString(),
): string {
  db.prepare(
    `INSERT INTO projects (id, nodes, edges, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET nodes = excluded.nodes, edges = excluded.edges, updated_at = excluded.updated_at`,
  ).run(projectId, nodesJson, edgesJson, now);
  db.prepare("UPDATE projects_meta SET updated_at = ? WHERE id = ?").run(now, projectId);
  return now;
}

/**
 * Puts a snapshot back on the canvas, after snapshotting the current state
 * (reason `restore`) so the restore itself can be undone. null when the
 * project or the snapshot (for this project) does not exist.
 */
export function restoreCanvasSnapshot(projectId: string, snapshotId: string): { updated_at: string } | null {
  const db = getDb();
  return db.transaction(() => {
    const current = db.prepare("SELECT nodes, edges FROM projects WHERE id = ?").get(projectId) as
      | { nodes: string; edges: string }
      | undefined;
    if (!current) return null;
    const snapshot = db
      .prepare("SELECT nodes, edges FROM canvas_snapshots WHERE id = ? AND project_id = ?")
      .get(snapshotId, projectId) as { nodes: string; edges: string } | undefined;
    if (!snapshot) return null;
    createCanvasSnapshot(projectId, current.nodes, current.edges, "restore", db);
    const updatedAt = writeProjectCanvas(projectId, snapshot.nodes, snapshot.edges, db);
    return { updated_at: updatedAt };
  })();
}
