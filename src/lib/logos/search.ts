import { searchBrandfetch } from "./providers/brandfetch";
import { searchSimpleIcons } from "./providers/simple-icons";
import { searchSvgl } from "./providers/svgl";
import { searchWikimedia } from "./providers/wikimedia";
import { LOGO_SOURCES, type LogoSearchResponse, type LogoSearchResult, type LogoSource } from "./shared";

/** Longest wait for one source; a slower source is dropped and reported unavailable. */
export const LOGO_SEARCH_TIMEOUT_MS = 4_000;

export type LogoProvider = {
  source: LogoSource;
  search: (query: string, signal: AbortSignal) => Promise<LogoSearchResult[]>;
};

export function defaultLogoProviders(brandfetchClientId?: string): LogoProvider[] {
  const providers: LogoProvider[] = [
    { source: "simple-icons", search: async (query) => searchSimpleIcons(query) },
    { source: "svgl", search: (query, signal) => searchSvgl(query, signal) },
    { source: "wikimedia", search: (query, signal) => searchWikimedia(query, signal) },
  ];
  if (brandfetchClientId) {
    providers.push({ source: "brandfetch", search: (query, signal) => searchBrandfetch(query, brandfetchClientId, signal) });
  }
  return providers;
}

type Settled = { source: LogoSource; ok: boolean; results: LogoSearchResult[] };

async function runProvider(provider: LogoProvider, query: string, timeoutMs: number): Promise<Settled> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`${provider.source} timed out`));
    }, timeoutMs);
  });
  try {
    const results = await Promise.race([provider.search(query, controller.signal), timeout]);
    return { source: provider.source, ok: true, results };
  } catch {
    return { source: provider.source, ok: false, results: [] };
  } finally {
    clearTimeout(timer);
  }
}

/** Queries every provider in parallel; a failing or slow source never fails the search. */
export async function searchLogos(
  query: string,
  options: { providers: LogoProvider[]; timeoutMs?: number },
): Promise<LogoSearchResponse> {
  const timeoutMs = options.timeoutMs ?? LOGO_SEARCH_TIMEOUT_MS;
  const settled = await Promise.all(options.providers.map((provider) => runProvider(provider, query, timeoutMs)));

  const seen = new Set<string>();
  const results: LogoSearchResult[] = [];
  for (const source of LOGO_SOURCES) {
    for (const entry of settled.filter((item) => item.source === source)) {
      for (const result of entry.results) {
        if (seen.has(result.key)) continue;
        seen.add(result.key);
        results.push(result);
      }
    }
  }

  return {
    results,
    queried: LOGO_SOURCES.filter((source) => settled.some((item) => item.source === source)),
    unavailable: LOGO_SOURCES.filter((source) => settled.some((item) => item.source === source && !item.ok)),
  };
}
