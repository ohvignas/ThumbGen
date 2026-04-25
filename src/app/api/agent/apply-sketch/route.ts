import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";

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

/**
 * Drops a generated sketch onto the canvas as a sketch node, wired into the
 * existing generator (or creates a fresh generator if none). Marks the sketch
 * as attached so the GC won't purge it.
 *
 * The frontend's useCanvasSync polling (2s) picks up the change automatically,
 * but the response also includes the IDs so the caller could do an immediate
 * loadProject() if they want.
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

  const dataUrl = `data:${sketch.mime_type};base64,${sketch.data.toString("base64")}`;

  // Pin so GC keeps it (the sketch is now attached to a node).
  db.prepare("UPDATE generated_sketches SET attached = 1 WHERE id = ?").run(body.sketch_id);

  const row = db
    .prepare("SELECT nodes, edges FROM projects WHERE id = ?")
    .get(body.project_id) as { nodes: string; edges: string } | undefined;
  const nodes: CanvasNode[] = row ? JSON.parse(row.nodes) : [];
  const edges: CanvasEdge[] = row ? JSON.parse(row.edges) : [];

  const existingGen = nodes.find((n) => n.type === "generator");
  const sketchNodeId = `sketch-${uuid().slice(0, 8)}`;

  // Anchor: place sketch to the left of the generator (or near center if no gen).
  const refPos = existingGen?.position ?? { x: 200, y: 200 };
  const sketchNode: CanvasNode = {
    id: sketchNodeId,
    type: "sketch",
    position: { x: refPos.x - 380, y: refPos.y + 40 },
    data: {
      imageBase64: dataUrl,
      label: sketch.prompt.slice(0, 60) || "Sketch IA",
    },
  };
  nodes.push(sketchNode);

  let createdGenId: string | null = null;
  if (existingGen) {
    edges.push({
      id: `e-${uuid().slice(0, 8)}`,
      source: sketchNodeId,
      target: existingGen.id,
      sourceHandle: null,
      targetHandle: "sketch-in",
    });
  } else {
    createdGenId = `generator-${uuid().slice(0, 8)}`;
    nodes.push({
      id: createdGenId,
      type: "generator",
      position: { x: refPos.x + 200, y: refPos.y },
      data: { model: "ideogram", aspectRatio: "16x9", numImages: 1 },
    });
    edges.push({
      id: `e-${uuid().slice(0, 8)}`,
      source: sketchNodeId,
      target: createdGenId,
      sourceHandle: null,
      targetHandle: "sketch-in",
    });
  }

  if (row) {
    db.prepare(
      "UPDATE projects SET nodes = ?, edges = ?, updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?",
    ).run(JSON.stringify(nodes), JSON.stringify(edges), body.project_id);
  } else {
    db.prepare(
      "INSERT INTO projects (id, nodes, edges, updated_at) VALUES (?, ?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now'))",
    ).run(body.project_id, JSON.stringify(nodes), JSON.stringify(edges));
  }

  return NextResponse.json({
    success: true,
    sketchNodeId,
    createdGenId,
  });
}
