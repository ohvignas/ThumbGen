import { NextRequest, NextResponse } from "next/server";
import { getProject, saveProject } from "@/lib/local-storage";

// GET /api/project?id=default — load project state
export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("id") || "default";
    const project = getProject(projectId);

    if (!project) {
      return NextResponse.json({ nodes: [], edges: [] });
    }

    const flowNodes = project.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: { x: n.position_x, y: n.position_y },
      data: JSON.parse(n.data || "{}"),
    }));

    const flowEdges = project.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.source_handle,
      targetHandle: e.target_handle,
      type: e.edge_type || "custom",
    }));

    return NextResponse.json({ nodes: flowNodes, edges: flowEdges });
  } catch (err) {
    console.error("Load project error:", err);
    return NextResponse.json({ error: "Failed to load project" }, { status: 500 });
  }
}

// POST /api/project — save project state
export async function POST(request: NextRequest) {
  try {
    const { projectId = "default", nodes, edges } = await request.json();

    const dbNodes = nodes.map((node: { id: string; type: string; position: { x: number; y: number }; data?: Record<string, unknown> }) => ({
      id: node.id,
      type: node.type,
      position_x: node.position.x,
      position_y: node.position.y,
      data: JSON.stringify(node.data || {}),
    }));

    const dbEdges = edges.map((edge: { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null; type?: string }) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      source_handle: edge.sourceHandle || null,
      target_handle: edge.targetHandle || null,
      edge_type: edge.type || "custom",
    }));

    saveProject(projectId, dbNodes, dbEdges);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Save project error:", err);
    return NextResponse.json({ error: "Failed to save project" }, { status: 500 });
  }
}
