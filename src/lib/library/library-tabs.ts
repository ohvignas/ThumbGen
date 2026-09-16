/** Tabs of the /bibliotheque page, kept in the URL as ?onglet=. */
export const LIBRARY_TAB_IDS = ["personnages", "logos", "inspirations"] as const;

export type LibraryTabId = (typeof LIBRARY_TAB_IDS)[number];

export const DEFAULT_LIBRARY_TAB: LibraryTabId = "personnages";

export const LIBRARY_TAB_LABELS: Record<LibraryTabId, string> = {
  personnages: "Personnages",
  logos: "Logos",
  inspirations: "Inspirations",
};

export function isLibraryTab(value: unknown): value is LibraryTabId {
  return typeof value === "string" && (LIBRARY_TAB_IDS as readonly string[]).includes(value);
}

export function parseLibraryTab(value: string | null | undefined): LibraryTabId {
  return isLibraryTab(value) ? value : DEFAULT_LIBRARY_TAB;
}

export function libraryTabHref(tab: LibraryTabId): string {
  return `/bibliotheque?onglet=${tab}`;
}
