import { NextResponse } from "next/server";
import { rejectNonJsonRequest } from "@/lib/youtube/route-errors";
import { copyVideoThumbnailToLibrary } from "@/lib/youtube/use-thumbnail";
import type { UseVideoResponse } from "@/lib/youtube/types";

export const runtime = "nodejs";

/** « Utiliser comme référence »: copies the thumbnail into the library (once) and returns its library URL. */
export async function POST(request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  const notJson = rejectNonJsonRequest(request);
  if (notJson) return notJson;
  const { videoId } = await params;
  const outcome = await copyVideoThumbnailToLibrary(videoId);

  switch (outcome.status) {
    case "unknown-video":
      return NextResponse.json({ error: "Vidéo inconnue" }, { status: 404 });
    case "unreachable":
      return NextResponse.json({ error: "YouTube injoignable, réessaie" }, { status: 502 });
    case "not-found":
      return NextResponse.json({ error: "Miniature introuvable sur YouTube" }, { status: 404 });
    default: {
      const body: UseVideoResponse = { swipeFileId: outcome.swipeFileId, imageUrl: outcome.imageUrl, label: outcome.label };
      return NextResponse.json(body, { status: outcome.status === "created" ? 201 : 200 });
    }
  }
}
