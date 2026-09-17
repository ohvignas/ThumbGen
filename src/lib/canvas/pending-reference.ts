import { libraryImageUrl } from "@/lib/youtube/types";

/**
 * « Ouvrir dans une miniature… »: the library opens /m/<id>?reference=<swipeFileId>
 * and the canvas adds the image as a reference node once the project is loaded
 * (through the store, so it is one undo step and a normal autosave).
 */

export const PENDING_REFERENCE_PARAM = "reference";

const LIBRARY_ID = /^[\w.-]{1,100}$/;

export function referenceLinkFor(projectId: string, swipeFileId: string): string {
  return `/m/${encodeURIComponent(projectId)}?${PENDING_REFERENCE_PARAM}=${encodeURIComponent(swipeFileId)}`;
}

export function readPendingReference(search: string): string | null {
  const value = new URLSearchParams(search).get(PENDING_REFERENCE_PARAM);
  return value && LIBRARY_ID.test(value) && !value.includes("..") ? value : null;
}

export function referenceNodeData(swipeFileId: string, label: string): { kind: "reference"; imageUrl: string; label: string } {
  return { kind: "reference", imageUrl: libraryImageUrl(swipeFileId), label };
}
