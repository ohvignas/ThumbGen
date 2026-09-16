/** Client-safe shapes and helpers for the library lists. */
import { matchesSearch } from "@/lib/search-text";

/** One row of GET /api/logos. `remote`: a Brandfetch reference fetched when used. */
export type LibraryLogo = { filename: string; label: string; size: number; remote: boolean };

/** One row of GET /api/swipe-files. */
export type LibrarySwipe = { filename: string; title: string; size: number };

export function logoImageUrl(filename: string): string {
  return `/api/logos/image?f=${encodeURIComponent(filename)}`;
}

export function swipeImageUrl(filename: string): string {
  return `/api/swipe-files/image?f=${encodeURIComponent(filename)}`;
}

/** Items whose label matches the query (case- and accent-insensitive), in their original order. */
export function filterBySearch<T>(items: readonly T[], label: (item: T) => string, query: string): T[] {
  return items.filter((item) => matchesSearch(label(item), query));
}

/** Default title of an imported file: its name without the extension. */
export function fileBaseName(fileName: string): string {
  return fileName.replace(/\.[^./\\]*$/, "").trim() || "Image";
}
