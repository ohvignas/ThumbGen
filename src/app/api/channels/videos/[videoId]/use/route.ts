import { NextResponse } from "next/server";
import * as store from "@/lib/youtube/channel-store";
import {
  fetchBestThumbnail,
  getSwipeFileTitle,
  saveThumbnailToLibrary,
  type DownloadedThumbnail,
} from "@/lib/youtube/thumbnails";
import { libraryImageUrl, type UseVideoResponse } from "@/lib/youtube/types";

export const runtime = "nodejs";

/** « Utiliser comme référence »: copies the thumbnail into the library (once) and returns its library URL. */
export async function POST(_request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  const { videoId } = await params;
  const video = store.getVideo(videoId);
  if (!video) return NextResponse.json({ error: "Vidéo inconnue" }, { status: 404 });

  if (video.swipe_file_id) {
    const title = getSwipeFileTitle(video.swipe_file_id);
    if (title !== null) {
      const existing: UseVideoResponse = {
        swipeFileId: video.swipe_file_id,
        imageUrl: libraryImageUrl(video.swipe_file_id),
        label: title,
      };
      return NextResponse.json(existing);
    }
  }

  let thumbnail: DownloadedThumbnail | null;
  try {
    thumbnail = await fetchBestThumbnail(videoId);
  } catch {
    return NextResponse.json({ error: "YouTube injoignable, réessaie" }, { status: 502 });
  }
  if (!thumbnail) return NextResponse.json({ error: "Miniature introuvable sur YouTube" }, { status: 404 });

  const swipeFileId = saveThumbnailToLibrary(video.title, thumbnail);
  store.setVideoSwipeFile(videoId, swipeFileId);
  const created: UseVideoResponse = { swipeFileId, imageUrl: libraryImageUrl(swipeFileId), label: video.title };
  return NextResponse.json(created, { status: 201 });
}
