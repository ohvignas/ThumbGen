import { NextResponse } from "next/server";
import { listProjects } from "@/lib/local-storage";
import { countImagesByProject } from "@/lib/generated-images";

/** Gallery feed: one card per video project, with how many thumbnails it has produced. */
export async function GET() {
  const counts = countImagesByProject();
  const projects = listProjects().map((project) => ({
    ...project,
    imageCount: counts.get(project.id) ?? 0,
  }));

  // Most recently worked on first — matches how someone picks up yesterday's video.
  projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return NextResponse.json(projects);
}
