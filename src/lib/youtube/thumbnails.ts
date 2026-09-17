import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import { YOUTUBE_FETCH_TIMEOUT_MS, youtubeNetworkError } from "./api";

/**
 * Downloads a video's published thumbnail and copies it into the library
 * (swipe_files). Shared by the agent tool import_youtube_thumbnail and by
 * « Utiliser comme référence » on followed-channel videos.
 */

// Largest first. maxresdefault only exists when the uploader sent a 1280×720 master.
export const THUMB_SIZES = ["maxresdefault", "sddefault", "hqdefault", "mqdefault", "default"] as const;

// YouTube answers some missing sizes with a tiny grey placeholder instead of a 404.
const PLACEHOLDER_MAX_BYTES = 2000;

export type DownloadedThumbnail = { bytes: Buffer; mime: string };

const VIDEO_ID = /^[\w-]{11}$/;

/** null when the id is malformed or no size exists; throws the « YouTube injoignable » error on network failure or timeout. */
export async function fetchBestThumbnail(videoId: string): Promise<DownloadedThumbnail | null> {
  if (!VIDEO_ID.test(videoId)) return null;
  for (const size of THUMB_SIZES) {
    let buffer: ArrayBuffer;
    try {
      const res = await fetch(`https://i.ytimg.com/vi/${videoId}/${size}.jpg`, {
        signal: AbortSignal.timeout(YOUTUBE_FETCH_TIMEOUT_MS),
      });
      if (!res.ok) continue;
      buffer = await res.arrayBuffer();
    } catch {
      throw youtubeNetworkError();
    }
    if (buffer.byteLength < PLACEHOLDER_MAX_BYTES) continue;
    return { bytes: Buffer.from(buffer), mime: "image/jpeg" };
  }
  return null;
}

/** Stores the image in swipe_files and returns its id (served by /api/swipe-files/image?f=<id>). */
export function saveThumbnailToLibrary(title: string, thumbnail: DownloadedThumbnail): string {
  const id = uuid();
  getDb()
    .prepare("INSERT INTO swipe_files (id, title, mime_type, size, data) VALUES (?, ?, ?, ?, ?)")
    .run(id, title, thumbnail.mime, thumbnail.bytes.length, thumbnail.bytes);
  return id;
}

export function getSwipeFileTitle(swipeFileId: string): string | null {
  const row = getDb().prepare("SELECT title FROM swipe_files WHERE id = ?").get(swipeFileId) as { title: string } | undefined;
  return row?.title ?? null;
}
