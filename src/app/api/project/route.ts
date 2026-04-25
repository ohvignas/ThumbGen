import { NextRequest, NextResponse } from "next/server";
import { getProject, saveProject, FlowNode, FlowEdge } from "@/lib/local-storage";

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("id") || "default";
    const project = getProject(projectId);
    if (!project) return NextResponse.json({ nodes: [], edges: [] });
    return NextResponse.json(project);
  } catch (err) {
    console.error("Load project error:", err);
    return NextResponse.json({ error: "Failed to load project" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { projectId = "default", nodes, edges } = (await request.json()) as {
      projectId?: string;
      nodes: FlowNode[];
      edges: FlowEdge[];
    };
    saveProject(projectId, nodes || [], edges || []);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Save project error:", err);
    return NextResponse.json({ error: "Failed to save project" }, { status: 500 });
  }
}
