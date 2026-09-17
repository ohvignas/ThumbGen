import { describe, it, expect, beforeEach, vi } from "vitest";
import { getDb } from "@/lib/db";

// Runs a callback in the middle of apply_workflow, while it resolves an image
// (between its first read of the canvas and its write) — the moment the
// browser's autosave or another MCP client could land a change.
const hooks = vi.hoisted(() => ({ duringResolve: null as null | (() => void) }));
vi.mock("@/lib/agent/tools/_helpers/image-source", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/agent/tools/_helpers/image-source")>();
  return {
    ...actual,
    resolveImageSource: async (source: string) => {
      hooks.duringResolve?.();
      hooks.duringResolve = null;
      return actual.resolveImageSource(source);
    },
  };
});

import { applyWorkflowTool } from "@/lib/agent/tools/apply-workflow";

const projectId = "test-apply-workflow-conflict";
const IMG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const USER_NODES = JSON.stringify([
  { id: "p-1", type: "prompt", position: { x: 0, y: 0 }, data: { prompt: "a" } },
  { id: "p-user", type: "prompt", position: { x: 0, y: 300 }, data: { prompt: "ajouté pendant l'appel" } },
]);

function canvas() {
  return getDb().prepare("SELECT nodes, updated_at FROM projects WHERE id = ?").get(projectId) as {
    nodes: string;
    updated_at: string;
  };
}
const snapshots = () =>
  (getDb().prepare("SELECT COUNT(*) AS n FROM canvas_snapshots WHERE project_id = ?").get(projectId) as { n: number }).n;

beforeEach(() => {
  hooks.duringResolve = null;
  getDb().prepare("DELETE FROM canvas_snapshots WHERE project_id = ?").run(projectId);
  getDb()
    .prepare("INSERT OR REPLACE INTO projects (id, nodes, edges, updated_at) VALUES (?, ?, ?, ?)")
    .run(
      projectId,
      JSON.stringify([{ id: "p-1", type: "prompt", position: { x: 0, y: 0 }, data: { prompt: "a" } }]),
      "[]",
      "2026-09-17T08:00:00.000Z",
    );
});

describe("apply_workflow — canvas changed during the call", () => {
  it("writes nothing and asks to retry when the canvas changed after it was read", async () => {
    hooks.duringResolve = () => {
      getDb()
        .prepare("UPDATE projects SET nodes = ?, updated_at = ? WHERE id = ?")
        .run(USER_NODES, "2026-09-17T08:00:01.000Z", projectId);
    };
    const r = await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: { nodes: [{ id: "ref-new", type: "swipeFile", data: { kind: "reference", image_source: IMG } }], edges: [] },
    });
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toMatch(/changed[^]*get_canvas_state[^]*retry/i);
    expect(canvas().nodes).toBe(USER_NODES);
    expect(snapshots()).toBe(0);
  });

  it("applies normally when nothing changed in between", async () => {
    const r = await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: { nodes: [{ id: "ref-new", type: "swipeFile", data: { kind: "reference", image_source: IMG } }], edges: [] },
    });
    expect(r.isError).toBeFalsy();
    expect((JSON.parse(canvas().nodes) as unknown[]).length).toBe(2);
    expect(snapshots()).toBe(1);
  });
});
