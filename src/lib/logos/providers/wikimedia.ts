import { THUMBGEN_USER_AGENT } from "@/lib/user-agent";
import type { LogoSearchResult } from "../shared";

export const WIKIMEDIA_LIMIT = 8;

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const COMMONS_FILE_PATTERN = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/[^?#\s]+\.(svg|png)$/i;

export function isCommonsFileUrl(url: string): boolean {
  return COMMONS_FILE_PATTERN.test(url);
}

/** File namespace search; « intitle » on both the brand and « logo » keeps unrelated files out. */
export function commonsSearchUrl(query: string): string {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: `intitle:"${query.replace(/"/g, "")}" intitle:logo`,
    gsrnamespace: "6",
    gsrlimit: "20",
    prop: "imageinfo",
    iiprop: "url|mime",
    iiurlwidth: "256",
  });
  return `${COMMONS_API}?${params.toString()}`;
}

type CommonsPage = {
  index?: unknown;
  title?: unknown;
  imageinfo?: { url?: unknown; thumburl?: unknown; mime?: unknown }[];
};

function fileTitle(title: string): string {
  return title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "").replace(/_/g, " ").trim();
}

export async function searchWikimedia(query: string, signal: AbortSignal): Promise<LogoSearchResult[]> {
  const res = await fetch(commonsSearchUrl(query), { headers: { "User-Agent": THUMBGEN_USER_AGENT }, signal });
  if (!res.ok) throw new Error(`Wikimedia HTTP ${res.status}`);
  const body = (await res.json()) as { query?: { pages?: CommonsPage[] } };
  // formatversion=2 returns pages unordered, with their rank in `index`.
  const pages = [...(body.query?.pages ?? [])].sort((a, b) => Number(a.index ?? 0) - Number(b.index ?? 0));

  const results: LogoSearchResult[] = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info || typeof page.title !== "string") continue;
    if (info.mime !== "image/svg+xml" && info.mime !== "image/png") continue;
    if (typeof info.url !== "string" || typeof info.thumburl !== "string") continue;
    const fileUrl = info.url.split("?")[0];
    if (!isCommonsFileUrl(fileUrl)) continue;
    results.push({
      key: `wikimedia:${fileUrl}`,
      source: "wikimedia",
      name: fileTitle(page.title),
      detail: info.mime === "image/svg+xml" ? "SVG" : "PNG",
      variant: null,
      previewUrl: info.thumburl,
      ref: fileUrl,
    });
    if (results.length >= WIKIMEDIA_LIMIT) break;
  }
  return results;
}
