import { describe, it, expect } from "vitest";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import { applyWorkflowTool } from "@/lib/agent/tools/apply-workflow";
import { createCanvasSnapshot, restoreCanvasSnapshot } from "@/lib/canvas-snapshots";

// A stored updated_at slightly in the future (a write in the same millisecond, or clock skew).
const FUTURE = new Date(Date.now() + 60_000).toISOString();
const afterFuture = (value: string) => Date.parse(value) > Date.parse(FUTURE);

function seedProject(nodes: unknown[] = []): string {
  const id = `proj_test_${uuid()}`;
  getDb().prepare("INSERT INTO projects_meta (id, name, description, created_at, updated_at) VALUES (?, 'M', '', ?, ?)").run(id, FUTURE, FUTURE);
  getDb().prepare("INSERT INTO projects (id, nodes, edges, updated_at) VALUES (?, ?, '[]', ?)").run(id, JSON.stringify(nodes), FUTURE);
  return id;
}

const updatedAt = (id: string) => (getDb().prepare("SELECT updated_at FROM projects WHERE id = ?").get(id) as { updated_at: string }).updated_at;

describe("agent writes never reuse or go back on updated_at", () => {
  it("apply_workflow writes after the stored updated_at", async () => {
    const id = seedProject();
    const result = await applyWorkflowTool.handler({
      project_id: id,
      blueprint: { nodes: [{ id: "p1", type: "prompt", data: { prompt: "x" } }], edges: [] },
    });
    expect(result.isError).toBeFalsy();
    expect(afterFuture(updatedAt(id))).toBe(true);
  });

  it("a snapshot restore writes after the stored updated_at", () => {
    const id = seedProject([{ id: "a", type: "prompt", position: { x: 0, y: 0 }, data: {} }]);
    const snapshot = createCanvasSnapshot(id, "[]", "[]", "apply_workflow");
    const restored = restoreCanvasSnapshot(id, snapshot.id);
    expect(restored && afterFuture(restored.updated_at)).toBe(true);
    expect(afterFuture(updatedAt(id))).toBe(true);
  });
});
