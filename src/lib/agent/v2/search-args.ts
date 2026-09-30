/** Coerce model-sloppy language args so research_topic does not 400. */
export function normalizeResearchLanguage(value: unknown): "fr" | "en" | undefined {
  if (typeof value !== "string") return undefined;
  const raw = value.trim().toLowerCase().replace(/_/g, "-");
  if (!raw) return undefined;
  if (raw === "fr" || raw.startsWith("fr-") || raw === "french" || raw === "francais" || raw === "français") {
    return "fr";
  }
  if (raw === "en" || raw.startsWith("en-") || raw === "english" || raw === "us" || raw === "usa" || raw === "uk" || raw === "gb") {
    return "en";
  }
  return undefined;
}

export function resolveCompetitorQueries(input: {
  query_fr?: string;
  query_en?: string;
  query?: string;
}): { query_fr: string; query_en: string } | null {
  const fr = input.query_fr?.trim() ?? "";
  const en = input.query_en?.trim() ?? "";
  const q = input.query?.trim() ?? "";
  const query_fr = (fr || q || en).slice(0, 200);
  const query_en = (en || q || fr).slice(0, 200);
  if (!query_fr || !query_en) return null;
  return { query_fr, query_en };
}

/** find_competitor_thumbnails returns youtube:<id>; analyze_thumbnails must accept that. */
export function bareYoutubeVideoId(value: string): string {
  return value.trim().replace(/^youtube:/i, "");
}
