import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const PROJECTS_FILE = path.join(DATA_DIR, "projects.json");
const PROJECTS_META = path.join(DATA_DIR, "projects-meta.json");

type ProjectMeta = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readMeta(): ProjectMeta[] {
  ensureDir();
  if (!fs.existsSync(PROJECTS_META)) {
    // Bootstrap with "default" if projects.json exists
    const defaultMeta: ProjectMeta[] = [{
      id: "default",
      name: "Mon projet",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }];
    fs.writeFileSync(PROJECTS_META, JSON.stringify(defaultMeta, null, 2), "utf-8");
    return defaultMeta;
  }
  return JSON.parse(fs.readFileSync(PROJECTS_META, "utf-8")) as ProjectMeta[];
}

function writeMeta(meta: ProjectMeta[]) {
  ensureDir();
  fs.writeFileSync(PROJECTS_META, JSON.stringify(meta, null, 2), "utf-8");
}

// GET /api/projects — list all projects
export async function GET() {
  const meta = readMeta();
  return NextResponse.json(meta);
}

// POST /api/projects — create a new project
export async function POST(request: NextRequest) {
  try {
    const { name = "Nouveau projet" } = await request.json();
    const id = `proj_${Date.now()}`;
    const meta = readMeta();
    meta.push({
      id,
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    writeMeta(meta);
    return NextResponse.json({ id, name });
  } catch (err) {
    console.error("Create project error:", err);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}

// PATCH /api/projects?id=xxx — rename a project
export async function PATCH(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("id");
    const { name } = await request.json();
    if (!projectId || !name) {
      return NextResponse.json({ error: "Missing id or name" }, { status: 400 });
    }
    const meta = readMeta();
    const project = meta.find((p) => p.id === projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    project.name = name;
    project.updatedAt = new Date().toISOString();
    writeMeta(meta);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Rename project error:", err);
    return NextResponse.json({ error: "Failed to rename" }, { status: 500 });
  }
}

// DELETE /api/projects?id=xxx — delete a project
export async function DELETE(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("id");
    if (!projectId) {
      return NextResponse.json({ error: "Missing project id" }, { status: 400 });
    }

    // Remove from meta
    let meta = readMeta();
    meta = meta.filter((p) => p.id !== projectId);
    writeMeta(meta);

    // Remove from projects data
    if (fs.existsSync(PROJECTS_FILE)) {
      const store = JSON.parse(fs.readFileSync(PROJECTS_FILE, "utf-8"));
      delete store[projectId];
      fs.writeFileSync(PROJECTS_FILE, JSON.stringify(store, null, 2), "utf-8");
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete project error:", err);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
