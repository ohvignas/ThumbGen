import { NextResponse } from "next/server";
import { createStudioVideo, listStudioVideos } from "@/lib/studio/store";
import { isEtiquette, UNTITLED_STUDIO_VIDEO } from "@/lib/studio/types";
import { rejectNonJsonRequest } from "@/lib/youtube/route-errors";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(listStudioVideos());
}

export async function POST(request: Request) {
  const notJson = rejectNonJsonRequest(request);
  if (notJson) return notJson;
  const body = (await request.json().catch(() => null)) as {
    title?: unknown;
    description?: unknown;
    summary?: unknown;
    etiquette?: unknown;
  } | null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const summary =
    typeof body?.summary === "string"
      ? body.summary.trim()
      : typeof body?.description === "string"
        ? body.description.trim()
        : "";
  if (body?.etiquette != null && (typeof body.etiquette !== "string" || !isEtiquette(body.etiquette))) {
    return NextResponse.json({ error: "Étiquette inconnue" }, { status: 400 });
  }
  const created = createStudioVideo({
    title: title || UNTITLED_STUDIO_VIDEO,
    summary,
    etiquette: typeof body?.etiquette === "string" && isEtiquette(body.etiquette) ? body.etiquette : null,
  });
  return NextResponse.json(created, { status: 201 });
}
