import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { defaultLogoProviders, searchLogos, type LogoProvider } from "@/lib/logos/search";
import {
  SEARCH_UNAVAILABLE_MESSAGE,
  searchEmptyMessage,
  unavailableNotice,
  type LogoSearchResponse,
  type LogoSearchResult,
  type LogoSource,
} from "@/lib/logos/shared";
import { clearSvglCache } from "@/lib/logos/providers/svgl";
import { GET } from "@/app/api/logos/search/route";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";

function hit(source: LogoSource, ref: string): LogoSearchResult {
  return { key: `${source}:${ref}`, source, name: ref, detail: null, variant: null, previewUrl: `https://example.test/${ref}.svg`, ref };
}

describe("searchLogos", () => {
  it("merges sources in a fixed order and drops duplicates", async () => {
    const providers: LogoProvider[] = [
      { source: "wikimedia", search: async () => [hit("wikimedia", "w1")] },
      { source: "svgl", search: async () => [hit("svgl", "s1"), hit("svgl", "s1")] },
      { source: "simple-icons", search: async () => [hit("simple-icons", "i1")] },
    ];
    const response = await searchLogos("nike", { providers });
    expect(response.results.map((result) => result.key)).toEqual(["simple-icons:i1", "svgl:s1", "wikimedia:w1"]);
    expect(response.queried).toEqual(["simple-icons", "svgl", "wikimedia"]);
    expect(response.unavailable).toEqual([]);
  });

  it("ignores a failing source and reports it", async () => {
    const providers: LogoProvider[] = [
      { source: "simple-icons", search: async () => [hit("simple-icons", "i1")] },
      { source: "svgl", search: async () => { throw new Error("SVGL HTTP 500"); } },
    ];
    const response = await searchLogos("nike", { providers });
    expect(response.results.map((result) => result.key)).toEqual(["simple-icons:i1"]);
    expect(response.unavailable).toEqual(["svgl"]);
  });

  it("gives up on a slow source after the timeout and aborts its request", async () => {
    let aborted = false;
    const providers: LogoProvider[] = [
      { source: "simple-icons", search: async () => [hit("simple-icons", "i1")] },
      {
        source: "wikimedia",
        search: (_query, signal) =>
          new Promise<LogoSearchResult[]>(() => {
            signal.addEventListener("abort", () => {
              aborted = true;
            });
          }),
      },
    ];
    const started = Date.now();
    const response = await searchLogos("nike", { providers, timeoutMs: 50 });
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(response.unavailable).toEqual(["wikimedia"]);
    expect(response.results.map((result) => result.key)).toEqual(["simple-icons:i1"]);
    expect(aborted).toBe(true);
  });

  it("queries Brandfetch only with a client ID", () => {
    expect(defaultLogoProviders().map((provider) => provider.source)).toEqual(["simple-icons", "svgl", "wikimedia"]);
    expect(defaultLogoProviders("bf-client-1234").map((provider) => provider.source)).toEqual([
      "simple-icons",
      "svgl",
      "wikimedia",
      "brandfetch",
    ]);
  });
});

describe("search wording", () => {
  it("names the unavailable sources", () => {
    expect(unavailableNotice([])).toBeNull();
    expect(unavailableNotice(["svgl"])).toBe("SVGL indisponible");
    expect(unavailableNotice(["wikimedia", "svgl"])).toBe("SVGL et Wikimedia indisponibles");
    expect(unavailableNotice(["wikimedia", "svgl", "brandfetch"])).toBe("SVGL, Brandfetch et Wikimedia indisponibles");
  });

  it("explains an empty grid", () => {
    const base: LogoSearchResponse = { results: [], queried: ["simple-icons", "svgl"], unavailable: [] };
    expect(searchEmptyMessage({ ...base, unavailable: ["simple-icons", "svgl"] }, "nike")).toBe(SEARCH_UNAVAILABLE_MESSAGE);
    expect(searchEmptyMessage(base, "zzz")).toBe("Aucun logo trouvé pour « zzz ».");
    expect(searchEmptyMessage({ ...base, results: [hit("svgl", "s1")] }, "nike")).toBeNull();
  });
});

describe("GET /api/logos/search", () => {
  const fetchMock = vi.fn<typeof fetch>();
  let savedEnv: string | undefined;

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }

  beforeEach(() => {
    getDb().exec("DELETE FROM settings");
    savedEnv = process.env.BRANDFETCH_API_KEY;
    delete process.env.BRANDFETCH_API_KEY;
    clearSvglCache();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("https://api.svgl.app")) return json({ error: "❌ (SVGL - API) SVG not found" }, 404);
      if (url.startsWith("https://commons.wikimedia.org")) return json({ batchcomplete: true });
      if (url.startsWith("https://api.brandfetch.io")) return json([]);
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (savedEnv === undefined) delete process.env.BRANDFETCH_API_KEY;
    else process.env.BRANDFETCH_API_KEY = savedEnv;
  });

  const search = (q: string) => GET(new Request(`http://localhost/api/logos/search?q=${encodeURIComponent(q)}`));

  it("rejects a query shorter than 2 characters", async () => {
    expect((await search("y")).status).toBe(400);
    expect((await search(" ")).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a query longer than 100 characters", async () => {
    expect((await search("a".repeat(101))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await search("a".repeat(100))).status).toBe(200);
  });

  it("returns merged results and never calls Brandfetch without a key", async () => {
    const res = await search("youtube");
    expect(res.status).toBe(200);
    const body = (await res.json()) as LogoSearchResponse;
    expect(body.results[0]).toMatchObject({ source: "simple-icons", ref: "youtube" });
    expect(body.queried).toEqual(["simple-icons", "svgl", "wikimedia"]);
    expect(body.unavailable).toEqual([]);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("brandfetch"))).toBe(false);
  });

  it("adds Brandfetch when a client ID is saved", async () => {
    setSetting("brandfetchApiKey", "bf-client-1234");
    const body = (await (await search("youtube")).json()) as LogoSearchResponse;
    expect(body.queried).toEqual(["simple-icons", "svgl", "brandfetch", "wikimedia"]);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain("https://api.brandfetch.io/v2/search/youtube?c=bf-client-1234");
  });
});
