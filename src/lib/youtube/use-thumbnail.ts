import { getCopiedSwipeFile, rememberCopy } from "@/lib/brief/youtube-thumbnail-copies";
import * as store from "./channel-store";
import { channelRuntime } from "./runtime";
import { fetchBestThumbnail, getSwipeFileTitle, saveThumbnailToLibrary } from "./thumbnails";
import { libraryImageUrl } from "./types";

/**
 * « Utiliser comme référence » for a followed-channel video: copies its
 * thumbnail into the library once (deduplicated on `channel_videos.swipe_file_id`
 * and on copies in flight). Shared by POST /api/channels/videos/[videoId]/use
 * and the agent tool import_youtube_thumbnail.
 */
export type UseThumbnailOutcome =
  | { status: "existing" | "created"; swipeFileId: string; imageUrl: string; label: string }
  | { status: "unknown-video" }
  | { status: "not-found" }
  | { status: "unreachable" };

/** Downloads and stores the thumbnail; the library id, or null when YouTube serves none. Throws when unreachable. */
async function copyThumbnail(videoId: string, title: string): Promise<string | null> {
  const thumbnail = await fetchBestThumbnail(videoId);
  if (!thumbnail) return null;
  const swipeFileId = saveThumbnailToLibrary(title, thumbnail);
  store.setVideoSwipeFile(videoId, swipeFileId);
  return swipeFileId;
}

export async function copyVideoThumbnailToLibrary(videoId: string): Promise<UseThumbnailOutcome> {
  const video = store.getVideo(videoId);
  if (!video) return { status: "unknown-video" };

  if (video.swipe_file_id) {
    const title = getSwipeFileTitle(video.swipe_file_id);
    if (title !== null) {
      return { status: "existing", swipeFileId: video.swipe_file_id, imageUrl: libraryImageUrl(video.swipe_file_id), label: title };
    }
  }

  // Two clicks (or tabs, or the agent) at the same time share one download and one library copy.
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
    return { status: "unreachable" };
  }
  if (!swipeFileId) return { status: "not-found" };
  return { status: "created", swipeFileId, imageUrl: libraryImageUrl(swipeFileId), label: video.title };
}

/** Followed-channel copy, else a one-off `youtube_thumbnail_copies` row (open-web search). */
export async function importAnyYoutubeThumbnail(videoId: string, title: string): Promise<UseThumbnailOutcome> {
  const followed = await copyVideoThumbnailToLibrary(videoId);
  if (followed.status !== "unknown-video") return followed;

  const existing = getCopiedSwipeFile(videoId);
  if (existing) {
    const label = getSwipeFileTitle(existing) ?? title;
    return { status: "existing", swipeFileId: existing, imageUrl: libraryImageUrl(existing), label };
  }

  try {
    const thumbnail = await fetchBestThumbnail(videoId);
    if (!thumbnail) return { status: "not-found" };
    const swipeFileId = saveThumbnailToLibrary(title, thumbnail);
    rememberCopy(videoId, swipeFileId);
    return { status: "created", swipeFileId, imageUrl: libraryImageUrl(swipeFileId), label: title };
  } catch {
    return { status: "unreachable" };
  }
}
