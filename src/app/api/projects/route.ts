import { NextRequest, NextResponse } from "next/server";
import {
  listProjects,
  createProject,
  renameProject,
  updateProjectDescription,
  deleteProject,
  setProjectCover,
} from "@/lib/local-storage";

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
    const { name, description, coverImageUrl } = (await request.json()) as {
      name?: string;
      description?: string;
      coverImageUrl?: unknown;
    };
    const trimmedName = name?.trim();
    const hasCover = coverImageUrl !== undefined;
    if (!id || (!trimmedName && description === undefined && !hasCover)) {
      return NextResponse.json({ error: "Missing id, name or description" }, { status: 400 });
    }
    if (trimmedName && !renameProject(id, trimmedName)) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (description !== undefined && !updateProjectDescription(id, description.trim())) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (hasCover) {
      if (typeof coverImageUrl !== "string") {
        return NextResponse.json({ error: "Invalid cover image" }, { status: 400 });
      }
      const result = setProjectCover(id, coverImageUrl);
      if (result === "not_found") return NextResponse.json({ error: "Project not found" }, { status: 404 });
      if (result === "invalid") return NextResponse.json({ error: "Invalid cover image" }, { status: 400 });
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
