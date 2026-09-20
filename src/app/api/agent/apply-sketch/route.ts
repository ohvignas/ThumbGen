import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import { nextUpdatedAt } from "@/lib/canvas/canvas-patch";
import { chatSketchNodeData, isWorkflowSketchSlotId } from "@/lib/canvas/chat-sketch";
import { persistNodesForSave } from "@/lib/canvas/persist-snapshot";
import { writeProjectCanvas } from "@/lib/canvas-snapshots";
import { forgetTombstones } from "@/lib/local-storage";

export const runtime = "nodejs";

type CanvasNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
};

type CanvasEdge = {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

function newChatSketchId(): string {
  for (let i = 0; i < 8; i++) {
    const id = `sketch-${uuid().slice(0, 8)}`;
    if (!isWorkflowSketchSlotId(id)) return id;
  }
  return `sketch-${uuid().replace(/-/g, "").slice(0, 8)}`;
}

/**
 * Drops a generated sketch onto the canvas as a NEW unused sketch node
 * (never sketch-a/b/c). Does not create edges or a generator — the user
 * only asked to place it. Marks the sketch as attached so the GC won't
 * purge it.
 *
 * Persists `generated:` + `/api/generated-sketches/…` — not imageBase64 —
 * so a later save cannot strip the pixels and leave an empty node.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { sketch_id?: string; project_id?: string }
    | null;
  if (!body?.sketch_id || !body?.project_id) {
    return NextResponse.json({ error: "sketch_id and project_id required" }, { status: 400 });
  }

  const db = getDb();
  const sketch = db
    .prepare("SELECT mime_type, data, prompt FROM generated_sketches WHERE id = ?")
    .get(body.sketch_id) as { mime_type: string; data: Buffer; prompt: string } | undefined;
  if (!sketch) return NextResponse.json({ error: "Sketch not found" }, { status: 404 });

  db.prepare("UPDATE generated_sketches SET attached = 1 WHERE id = ?").run(body.sketch_id);

  const row = db
    .prepare("SELECT nodes, edges, updated_at FROM projects WHERE id = ?")
    .get(body.project_id) as { nodes: string; edges: string; updated_at: string } | undefined;
  const nodes: CanvasNode[] = row ? JSON.parse(row.nodes) : [];
  const edges: CanvasEdge[] = row ? JSON.parse(row.edges) : [];

  const existingGen = nodes.find((n) => n.type === "generator");
  let sketchNodeId = newChatSketchId();
  while (nodes.some((n) => n.id === sketchNodeId) || isWorkflowSketchSlotId(sketchNodeId)) {
    sketchNodeId = newChatSketchId();
  }

  const existingSketches = nodes.filter((n) => n.type === "sketch").length;
  const refPos = existingGen?.position ?? { x: 200, y: 200 };
  const position = { x: refPos.x - 380, y: refPos.y + 40 + existingSketches * 220 };
  const data = chatSketchNodeData(body.sketch_id, sketch.prompt.slice(0, 60) || "Sketch IA");
  const sketchNode: CanvasNode = {
    id: sketchNodeId,
    type: "sketch",
    position,
    data,
  };
  nodes.push(sketchNode);

  const updatedAt = nextUpdatedAt(row?.updated_at);
  const persistedNodes = persistNodesForSave(nodes);
  writeProjectCanvas(body.project_id, JSON.stringify(persistedNodes), JSON.stringify(edges), db, updatedAt);
  forgetTombstones(body.project_id, { nodeIds: [sketchNodeId], edgeIds: [] });

  return NextResponse.json({
    success: true,
    sketchNodeId,
    position,
    image_source: data.image_source,
    imageUrl: data.imageUrl,
  });
}
