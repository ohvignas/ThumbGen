import { NextResponse } from "next/server";
import { importAnyYoutubeThumbnail } from "@/lib/youtube/use-thumbnail";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { videoId?: unknown; title?: unknown } | null;
  const videoId = typeof body?.videoId === "string" ? body.videoId.trim() : "";
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!videoId) return NextResponse.json({ error: "videoId manquant" }, { status: 400 });

  const outcome = await importAnyYoutubeThumbnail(videoId, title || `YT ${videoId}`);
  if (outcome.status === "created" || outcome.status === "existing") {
    return NextResponse.json({ swipeFileId: outcome.swipeFileId, imageUrl: outcome.imageUrl, label: outcome.label });
  }
  if (outcome.status === "not-found") {
    return NextResponse.json({ error: "Miniature introuvable" }, { status: 404 });
  }
  if (outcome.status === "unreachable") {
    return NextResponse.json({ error: "YouTube injoignable" }, { status: 502 });
  }
  return NextResponse.json({ error: "Vidéo inconnue" }, { status: 404 });
}
