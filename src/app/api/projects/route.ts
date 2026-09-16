import { NextRequest, NextResponse } from "next/server";
import { listProjects, createProject, renameProject, updateProjectDescription, deleteProject } from "@/lib/local-storage";

export async function GET() {
  return NextResponse.json(listProjects());
}

export async function POST(request: NextRequest) {
  try {
    const { name = "Nouveau projet", description = "" } = (await request.json()) as { name?: string; description?: string };
    return NextResponse.json(createProject(name.trim() || "Nouveau projet", description.trim()));
  } catch (err) {
    console.error("Create project error:", err);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    const { name, description } = (await request.json()) as { name?: string; description?: string };
    const trimmedName = name?.trim();
    if (!id || (!trimmedName && description === undefined)) {
      return NextResponse.json({ error: "Missing id, name or description" }, { status: 400 });
    }
    if (trimmedName && !renameProject(id, trimmedName)) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (description !== undefined && !updateProjectDescription(id, description.trim())) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Update project error:", err);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
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
