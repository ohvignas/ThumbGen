import { THUMBGEN_USER_AGENT } from "@/lib/user-agent";
import type { LogoSearchResult } from "../shared";

export const BRANDFETCH_LIMIT = 6;

const BRAND_ID_PATTERN = /^[A-Za-z0-9_-]{2,64}$/;

export function isBrandfetchBrandId(value: string): boolean {
  return BRAND_ID_PATTERN.test(value);
}

/** CDN address of a brand icon as PNG, without the client ID (appended when fetched). */
export function brandfetchLogoUrl(brandId: string): string {
  return `https://cdn.brandfetch.io/${brandId}/w/1024/fallback/404/icon.png`;
}

type BrandfetchBrand = { brandId?: unknown; name?: unknown; domain?: unknown; icon?: unknown };

/** Brand Search API. The `icon` URLs are signed by Brandfetch and must be hotlinked, never stored. */
export async function searchBrandfetch(query: string, clientId: string, signal: AbortSignal): Promise<LogoSearchResult[]> {
  const url = `https://api.brandfetch.io/v2/search/${encodeURIComponent(query)}?c=${encodeURIComponent(clientId)}`;
  const res = await fetch(url, { headers: { "User-Agent": THUMBGEN_USER_AGENT }, signal });
  if (!res.ok) throw new Error(`Brandfetch HTTP ${res.status}`);
  const body = (await res.json()) as unknown;

  const results: LogoSearchResult[] = [];
  for (const brand of Array.isArray(body) ? (body as BrandfetchBrand[]) : []) {
    if (typeof brand.brandId !== "string" || !isBrandfetchBrandId(brand.brandId)) continue;
    if (typeof brand.icon !== "string" || !brand.icon.startsWith("https://cdn.brandfetch.io/")) continue;
    const domain = typeof brand.domain === "string" && brand.domain ? brand.domain : null;
    const name = typeof brand.name === "string" && brand.name.trim() ? brand.name.trim() : (domain ?? "Logo");
    results.push({
      key: `brandfetch:${brand.brandId}`,
      source: "brandfetch",
      name,
      detail: domain,
      variant: null,
      previewUrl: brand.icon,
      ref: brand.brandId,
    });
    if (results.length >= BRANDFETCH_LIMIT) break;
  }
  return results;
}
