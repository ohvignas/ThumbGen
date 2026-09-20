/** YouTube `regionCode` (ISO 3166-1 alpha-2) + `relevanceLanguage` for inspiration search. */

export const DEFAULT_YOUTUBE_SEARCH_REGION = "FR";
export const YOUTUBE_SEARCH_REGION_STORAGE_KEY = "thumbgen.youtube-search-region";

export const YOUTUBE_SEARCH_REGIONS = [
  { code: "FR", label: "France", language: "fr" },
  { code: "BE", label: "Belgique", language: "fr" },
  { code: "CH", label: "Suisse", language: "fr" },
  { code: "CA", label: "Canada", language: "fr" },
  { code: "MA", label: "Maroc", language: "fr" },
  { code: "SN", label: "Sénégal", language: "fr" },
  { code: "US", label: "États-Unis", language: "en" },
  { code: "GB", label: "Royaume-Uni", language: "en" },
  { code: "DE", label: "Allemagne", language: "de" },
  { code: "ES", label: "Espagne", language: "es" },
  { code: "IT", label: "Italie", language: "it" },
  { code: "PT", label: "Portugal", language: "pt" },
  { code: "BR", label: "Brésil", language: "pt" },
  { code: "MX", label: "Mexique", language: "es" },
] as const;

export type YoutubeSearchRegion = (typeof YOUTUBE_SEARCH_REGIONS)[number]["code"];

export const YOUTUBE_SEARCH_REGION_ITEMS = YOUTUBE_SEARCH_REGIONS.map((region) => ({
  value: region.code,
  label: region.label,
}));

export function isYoutubeSearchRegion(value: unknown): value is YoutubeSearchRegion {
  return typeof value === "string" && YOUTUBE_SEARCH_REGIONS.some((region) => region.code === value);
}

export function parseYoutubeSearchRegion(value: unknown): YoutubeSearchRegion {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return isYoutubeSearchRegion(code) ? code : DEFAULT_YOUTUBE_SEARCH_REGION;
}

export function youtubeSearchLanguage(region: YoutubeSearchRegion): string {
  return YOUTUBE_SEARCH_REGIONS.find((item) => item.code === region)?.language ?? "fr";
}

export function readStoredYoutubeSearchRegion(): YoutubeSearchRegion {
  if (typeof window === "undefined") return DEFAULT_YOUTUBE_SEARCH_REGION;
  try {
    return parseYoutubeSearchRegion(window.localStorage.getItem(YOUTUBE_SEARCH_REGION_STORAGE_KEY));
  } catch {
    return DEFAULT_YOUTUBE_SEARCH_REGION;
  }
}

export function writeStoredYoutubeSearchRegion(region: YoutubeSearchRegion): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(YOUTUBE_SEARCH_REGION_STORAGE_KEY, region);
  } catch {
    // private mode
  }
}
