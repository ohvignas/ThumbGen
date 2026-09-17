import { NextResponse } from "next/server";
import * as store from "@/lib/youtube/channel-store";
import { rejectNonJsonRequest } from "@/lib/youtube/route-errors";
import { channelRuntime } from "@/lib/youtube/runtime";
import { fetchBestThumbnail, getSwipeFileTitle, saveThumbnailToLibrary } from "@/lib/youtube/thumbnails";
import { libraryImageUrl, type UseVideoResponse } from "@/lib/youtube/types";

export const runtime = "nodejs";

/** Downloads and stores the thumbnail; the library id, or null when YouTube serves none. Throws when unreachable. */
async function copyThumbnail(videoId: string, title: string): Promise<string | null> {
  const thumbnail = await fetchBestThumbnail(videoId);
  if (!thumbnail) return null;
  const swipeFileId = saveThumbnailToLibrary(title, thumbnail);
  store.setVideoSwipeFile(videoId, swipeFileId);
  return swipeFileId;
}

/** « Utiliser comme référence »: copies the thumbnail into the library (once) and returns its library URL. */
export async function POST(request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  const notJson = rejectNonJsonRequest(request);
  if (notJson) return notJson;
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

  // Two clicks (or tabs) at the same time share one download and one library copy.
  const copies = channelRuntime().thumbnailCopies;
  let copy = copies.get(videoId);
  if (!copy) {
    copy = copyThumbnail(videoId, video.title).finally(() => copies.delete(videoId));
    copies.set(videoId, copy);
  }

  let swipeFileId: string | null;
  try {
    swipeFileId = await copy;
  } catch {
    return NextResponse.json({ error: "YouTube injoignable, réessaie" }, { status: 502 });
  }
  if (!swipeFileId) return NextResponse.json({ error: "Miniature introuvable sur YouTube" }, { status: 404 });

  const created: UseVideoResponse = { swipeFileId, imageUrl: libraryImageUrl(swipeFileId), label: video.title };
  return NextResponse.json(created, { status: 201 });
}
