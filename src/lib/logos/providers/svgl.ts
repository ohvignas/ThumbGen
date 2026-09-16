import { normalizeSearchText } from "@/lib/search-text";
import { THUMBGEN_USER_AGENT } from "@/lib/user-agent";
import type { LogoSearchResult, LogoVariant } from "../shared";

export const SVGL_LIMIT = 8;
/** SVGL asks API clients to cache answers for a few minutes. */
export const SVGL_CACHE_TTL_MS = 5 * 60 * 1000;

const SVGL_ASSET_PATTERN = /^https:\/\/svgl\.app\/[^?#\s]+\.svg$/;

export function isSvglAssetUrl(url: string): boolean {
  return SVGL_ASSET_PATTERN.test(url);
}

const cache = new Map<string, { at: number; results: LogoSearchResult[] }>();

export function clearSvglCache(): void {
  cache.clear();
}

type SvglEntry = { title?: unknown; route?: unknown; wordmark?: unknown };

/** `route` / `wordmark` are one URL, or `{ light, dark }` (light = for light backgrounds). */
function assets(value: unknown): { url: string; variant: LogoVariant | null }[] {
  if (typeof value === "string") return isSvglAssetUrl(value) ? [{ url: value, variant: null }] : [];
  if (typeof value !== "object" || value === null) return [];
  const themed = value as { light?: unknown; dark?: unknown };
  const out: { url: string; variant: LogoVariant | null }[] = [];
  if (typeof themed.light === "string" && isSvglAssetUrl(themed.light)) out.push({ url: themed.light, variant: "light" });
  if (typeof themed.dark === "string" && isSvglAssetUrl(themed.dark)) out.push({ url: themed.dark, variant: "dark" });
  return out;
}

function toResult(name: string, url: string, variant: LogoVariant | null): LogoSearchResult {
  return { key: `svgl:${url}`, source: "svgl", name, detail: null, variant, previewUrl: url, ref: url };
}

export async function searchSvgl(query: string, signal: AbortSignal, now: number = Date.now()): Promise<LogoSearchResult[]> {
  const cacheKey = normalizeSearchText(query);
  const cached = cache.get(cacheKey);
  if (cached && now - cached.at < SVGL_CACHE_TTL_MS) return cached.results;

  const res = await fetch(`https://api.svgl.app?search=${encodeURIComponent(query)}`, {
    headers: { "User-Agent": THUMBGEN_USER_AGENT },
    signal,
  });
  // SVGL answers 404 {"error": "… SVG not found"} when nothing matches.
  if (res.status === 404) {
    cache.set(cacheKey, { at: now, results: [] });
    return [];
  }
  if (!res.ok) throw new Error(`SVGL HTTP ${res.status}`);

  const body = (await res.json()) as unknown;
  const results: LogoSearchResult[] = [];
  for (const entry of Array.isArray(body) ? (body as SvglEntry[]) : []) {
    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    if (!title) continue;
    for (const { url, variant } of assets(entry.route)) results.push(toResult(title, url, variant));
    for (const { url, variant } of assets(entry.wordmark)) results.push(toResult(`${title} (logo texte)`, url, variant));
  }
  const limited = results.slice(0, SVGL_LIMIT);
  cache.set(cacheKey, { at: now, results: limited });
  return limited;
}
