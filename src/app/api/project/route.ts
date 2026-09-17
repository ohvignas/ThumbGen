import { NextRequest, NextResponse } from "next/server";
import { getProject, saveProject, FlowNode, FlowEdge } from "@/lib/local-storage";

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("id") || "default";
    const project = getProject(projectId);
    if (!project) return NextResponse.json({ nodes: [], edges: [], updatedAt: null });
    return NextResponse.json({ nodes: project.nodes, edges: project.edges, updatedAt: project.updatedAt ?? null });
  } catch (err) {
    console.error("Load project error:", err);
    return NextResponse.json({ error: "Failed to load project" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { projectId = "default", nodes, edges, baseUpdatedAt } = (await request.json()) as {
      projectId?: string;
      nodes: FlowNode[];
      edges: FlowEdge[];
      /** The `updated_at` the client's canvas was based on (chantier F2): agent nodes placed after it are kept. */
      baseUpdatedAt?: unknown;
    };
    const { updatedAt, reinjected, reinjectedEdges, refreshed } = saveProject(
      projectId,
      nodes || [],
      edges || [],
      typeof baseUpdatedAt === "string" ? baseUpdatedAt : null,
    );
    return NextResponse.json({ success: true, updatedAt, reinjected, reinjectedEdges, refreshed });
  } catch (err) {
    console.error("Save project error:", err);
    return NextResponse.json({ error: "Failed to save project" }, { status: 500 });
  }
}
