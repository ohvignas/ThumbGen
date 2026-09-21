import { NextResponse } from "next/server";
import {
  createMiniatureForStudio,
  linkProjectToStudio,
  listProjectsForStudio,
  unlinkProjectFromStudio,
} from "@/lib/studio/link-project";
import { getStudioVideo } from "@/lib/studio/store";
import { rejectNonJsonRequest } from "@/lib/youtube/route-errors";

export const runtime = "nodejs";

type VideoParams = { params: Promise<{ videoId: string }> };

export async function GET(_request: Request, { params }: VideoParams) {
  const { videoId } = await params;
  if (!getStudioVideo(videoId)) {
    return NextResponse.json({ error: "Fiche vidéo introuvable." }, { status: 404 });
  }
  return NextResponse.json({ projects: listProjectsForStudio(videoId) });
}

export async function POST(request: Request, { params }: VideoParams) {
  const notJson = rejectNonJsonRequest(request);
  if (notJson) return notJson;
  const { videoId } = await params;
  const body = (await request.json().catch(() => null)) as { projectId?: unknown } | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Requête JSON attendue" }, { status: 400 });
  }
  if (body.projectId !== undefined && typeof body.projectId !== "string") {
    return NextResponse.json({ error: "Identifiant de miniature invalide" }, { status: 400 });
  }
  try {
    if (typeof body.projectId === "string") {
      linkProjectToStudio(body.projectId, videoId);
      return NextResponse.json({ projects: listProjectsForStudio(videoId) });
    }
    const project = createMiniatureForStudio(videoId);
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inattendue";
    const status = /fiche/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request, { params }: VideoParams) {
  const notJson = rejectNonJsonRequest(request);
  if (notJson) return notJson;
  const { videoId } = await params;
  if (!getStudioVideo(videoId)) {
    return NextResponse.json({ error: "Fiche vidéo introuvable." }, { status: 404 });
  }
  const body = (await request.json().catch(() => null)) as { projectId?: unknown } | null;
  if (!body || typeof body.projectId !== "string" || !body.projectId) {
    return NextResponse.json({ error: "Identifiant de miniature requis" }, { status: 400 });
  }
  unlinkProjectFromStudio(body.projectId, videoId);
  return NextResponse.json({ projects: listProjectsForStudio(videoId) });
}
