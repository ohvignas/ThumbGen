import { getDb } from "@/lib/db";

export function getCopiedSwipeFile(videoId: string): string | null {
  const row = getDb().prepare("SELECT swipe_file_id FROM youtube_thumbnail_copies WHERE video_id = ?").get(videoId) as
    | { swipe_file_id: string }
    | undefined;
  return row?.swipe_file_id ?? null;
}

/** First write wins: a second import of the same video keeps the original `sf_`. */
export function rememberCopy(videoId: string, swipeFileId: string): void {
  getDb()
    .prepare("INSERT OR IGNORE INTO youtube_thumbnail_copies (video_id, swipe_file_id) VALUES (?, ?)")
    .run(videoId, swipeFileId);
}
