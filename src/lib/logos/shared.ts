/** Logo search types and wording shared by the API and the UI (client-safe). */

/** Also the order of the merged result grid. */
export const LOGO_SOURCES = ["simple-icons", "svgl", "brandfetch", "wikimedia"] as const;

export type LogoSource = (typeof LOGO_SOURCES)[number];

export function isLogoSource(value: unknown): value is LogoSource {
  return typeof value === "string" && (LOGO_SOURCES as readonly string[]).includes(value);
}

export const LOGO_SOURCE_LABELS: Record<LogoSource, string> = {
  "simple-icons": "Simple Icons",
  svgl: "SVGL",
  brandfetch: "Brandfetch",
  wikimedia: "Wikimedia",
};

export type LogoVariant = "light" | "dark" | "color";

export const LOGO_VARIANT_LABELS: Record<LogoVariant, string> = {
  light: "Clair",
  dark: "Sombre",
  color: "Couleur",
};

export const LOGO_SEARCH_MIN_CHARS = 2;

export const SEARCH_UNAVAILABLE_MESSAGE = "Recherche indisponible, importe une image";

/** One search hit. `ref` is what POST /api/logos/add needs to fetch it again. */
export type LogoSearchResult = {
  key: string;
  source: LogoSource;
  name: string;
  detail: string | null;
  variant: LogoVariant | null;
  previewUrl: string;
  ref: string;
};

export type LogoSearchResponse = {
  results: LogoSearchResult[];
  queried: LogoSource[];
  unavailable: LogoSource[];
};

/** Answer of POST /api/logos/add. */
export type AddedLogo = { filename: string; label: string };

function joinFrench(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

/** « SVGL indisponible », « SVGL et Wikimedia indisponibles »; null when every source answered. */
export function unavailableNotice(unavailable: readonly LogoSource[]): string | null {
  const labels = LOGO_SOURCES.filter((source) => unavailable.includes(source)).map((source) => LOGO_SOURCE_LABELS[source]);
  if (labels.length === 0) return null;
  return `${joinFrench(labels)} ${labels.length > 1 ? "indisponibles" : "indisponible"}`;
}

/** What to show instead of the grid: nothing when there are results. */
export function searchEmptyMessage(response: LogoSearchResponse, query: string): string | null {
  if (response.queried.length > 0 && response.queried.every((source) => response.unavailable.includes(source))) {
    return SEARCH_UNAVAILABLE_MESSAGE;
  }
  if (response.results.length === 0) return `Aucun logo trouvé pour « ${query} ».`;
  return null;
}
