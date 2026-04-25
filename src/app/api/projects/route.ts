import { NextRequest, NextResponse } from "next/server";
import { listProjects, createProject, renameProject, deleteProject } from "@/lib/local-storage";

export async function GET() {
  return NextResponse.json(listProjects());
}

export async function POST(request: NextRequest) {
  try {
    const { name = "Nouveau projet" } = await request.json();
    return NextResponse.json(createProject(name));
  } catch (err) {
    console.error("Create project error:", err);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    const { name } = await request.json();
    if (!id || !name) return NextResponse.json({ error: "Missing id or name" }, { status: 400 });
    if (!renameProject(id, name)) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Rename project error:", err);
    return NextResponse.json({ error: "Failed to rename" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing project id" }, { status: 400 });
    deleteProject(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete project error:", err);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
