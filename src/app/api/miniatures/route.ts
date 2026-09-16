import { NextResponse } from "next/server";
import { listProjects } from "@/lib/local-storage";
import { listProjectImages, listUnassignedImages } from "@/lib/generated-images";

/**
 * Gallery feed: one entry per video project, carrying the thumbnails it has
 * produced (newest first) so the grid can render covers without a second
 * round-trip per project.
 */
export async function GET() {
  const projects = listProjects().map((project) => {
    const images = listProjectImages(project.id);
    return {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      imageCount: images.length,
      images,
    };
  });

  // Most recently worked on first — matches how someone picks up yesterday's video.
  projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return NextResponse.json({ projects, unassigned: listUnassignedImages() });
}
