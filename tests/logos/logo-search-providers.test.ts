import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { searchSimpleIcons, simpleIconSvg } from "@/lib/logos/providers/simple-icons";
import { SVGL_CACHE_TTL_MS, clearSvglCache, isSvglAssetUrl, searchSvgl } from "@/lib/logos/providers/svgl";
import { commonsSearchUrl, isCommonsFileUrl, searchWikimedia } from "@/lib/logos/providers/wikimedia";
import { brandfetchLogoUrl, isBrandfetchBrandId, searchBrandfetch } from "@/lib/logos/providers/brandfetch";

const fetchMock = vi.fn<typeof fetch>();
const signal = new AbortController().signal;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  clearSvglCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Simple Icons (local package)", () => {
  it("finds a brand by title, coloured, without any request", () => {
    const [first] = searchSimpleIcons("nike");
    expect(first).toMatchObject({
      key: "simple-icons:nike",
      source: "simple-icons",
      name: "Nike",
      detail: null,
      variant: "color",
      ref: "nike",
    });
    expect(first.previewUrl.startsWith("data:image/svg+xml;base64,")).toBe(true);
    const svg = Buffer.from(first.previewUrl.split(",")[1], "base64").toString("utf8");
    expect(svg).toContain('fill="#111111"');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("finds a brand by alias", () => {
    expect(searchSimpleIcons("twitter").map((result) => result.ref)).toContain("x");
  });

  it("ranks the exact title first, ignores case and accents, caps the list", () => {
    expect(searchSimpleIcons("YOUTUBE")[0].ref).toBe("youtube");
    expect(searchSimpleIcons("Nîke")[0].ref).toBe("nike");
    expect(searchSimpleIcons("go").length).toBeLessThanOrEqual(8);
    expect(searchSimpleIcons("   ")).toEqual([]);
  });

  it("gives the brand-coloured SVG of a slug", () => {
    expect(simpleIconSvg("youtube")).toContain('fill="#FF0000"');
    expect(simpleIconSvg("does-not-exist")).toBeNull();
  });
});

describe("SVGL", () => {
  it("maps plain routes, light/dark routes and wordmarks", async () => {
    fetchMock.mockResolvedValue(
      json([
        { id: 416, title: "Notion", category: "Software", route: "https://svgl.app/library/notion.svg", url: "https://notion.so/" },
        {
          id: 555,
          title: "Vercel",
          category: ["Hosting", "Vercel"],
          route: { light: "https://svgl.app/library/vercel.svg", dark: "https://svgl.app/library/vercel_dark.svg" },
          wordmark: { light: "https://svgl.app/library/vercel_wordmark.svg", dark: "https://svgl.app/library/vercel_wordmark_dark.svg" },
          url: "https://vercel.com/",
        },
      ]),
    );

    const results = await searchSvgl("ver", signal);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.svgl.app?search=ver");
    expect((init?.headers as Record<string, string>)["User-Agent"]).toMatch(/^ThumbGen\//);
    expect(results.map((result) => [result.name, result.variant, result.ref])).toEqual([
      ["Notion", null, "https://svgl.app/library/notion.svg"],
      ["Vercel", "light", "https://svgl.app/library/vercel.svg"],
      ["Vercel", "dark", "https://svgl.app/library/vercel_dark.svg"],
      ["Vercel (logo texte)", "light", "https://svgl.app/library/vercel_wordmark.svg"],
      ["Vercel (logo texte)", "dark", "https://svgl.app/library/vercel_wordmark_dark.svg"],
    ]);
    expect(results[0]).toEqual({
      key: "svgl:https://svgl.app/library/notion.svg",
      source: "svgl",
      name: "Notion",
      detail: null,
      variant: null,
      previewUrl: "https://svgl.app/library/notion.svg",
      ref: "https://svgl.app/library/notion.svg",
    });
  });

  it("treats SVGL's 404 « SVG not found » as no result", async () => {
    fetchMock.mockResolvedValue(json({ error: "❌ (SVGL - API) SVG not found" }, 404));
    expect(await searchSvgl("zzzz", signal)).toEqual([]);
  });

  it("throws on other errors so the source is reported unavailable", async () => {
    fetchMock.mockResolvedValue(json({ error: "boom" }, 500));
    await expect(searchSvgl("nike", signal)).rejects.toThrow("SVGL HTTP 500");
  });

  it("caches answers for a few minutes per normalised query", async () => {
    fetchMock.mockImplementation(async () =>
      json([{ id: 416, title: "Notion", route: "https://svgl.app/library/notion.svg" }]),
    );
    await searchSvgl("Notion", signal, 1_000);
    await searchSvgl("notion", signal, 1_000 + SVGL_CACHE_TTL_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await searchSvgl("notion", signal, 1_000 + SVGL_CACHE_TTL_MS + 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores assets outside svgl.app", async () => {
    fetchMock.mockResolvedValue(json([{ id: 1, title: "Piège", route: "https://evil.example/logo.svg" }]));
    expect(await searchSvgl("piege", signal)).toEqual([]);
    expect(isSvglAssetUrl("https://svgl.app/library/notion.svg")).toBe(true);
    expect(isSvglAssetUrl("https://svgl.app.evil.example/notion.svg")).toBe(false);
    expect(isSvglAssetUrl("https://svgl.app/library/notion.png")).toBe(false);
  });
});

describe("Wikimedia Commons", () => {
  it("builds the Commons file search", () => {
    const url = new URL(commonsSearchUrl('ni"ke'));
    expect(`${url.origin}${url.pathname}`).toBe("https://commons.wikimedia.org/w/api.php");
    expect(url.searchParams.get("gsrsearch")).toBe('intitle:"nike" intitle:logo');
    expect(url.searchParams.get("generator")).toBe("search");
    expect(url.searchParams.get("gsrnamespace")).toBe("6");
    expect(url.searchParams.get("prop")).toBe("imageinfo");
    expect(url.searchParams.get("iiprop")).toBe("url|mime");
    expect(url.searchParams.get("iiurlwidth")).toBe("256");
    expect(url.searchParams.get("formatversion")).toBe("2");
  });

  it("keeps SVG and PNG files in search order, with clean names and original URLs", async () => {
    fetchMock.mockResolvedValue(
      json({
        batchcomplete: true,
        query: {
          pages: [
            {
              pageid: 3,
              ns: 6,
              title: "File:Logo nike principal.jpg",
              index: 2,
              imageinfo: [{ url: "https://upload.wikimedia.org/wikipedia/commons/3/36/Logo_nike_principal.jpg?utm_source=commons.wikimedia.org", thumburl: "https://upload.wikimedia.org/wikipedia/commons/3/36/Logo_nike_principal.jpg", mime: "image/jpeg" }],
            },
            {
              pageid: 2,
              ns: 6,
              title: "File:Niké logo.png",
              index: 3,
              imageinfo: [{ url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Nik%C3%A9_logo.png?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original", thumburl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Nik%C3%A9_logo.png/330px-Nik%C3%A9_logo.png", mime: "image/png" }],
            },
            {
              pageid: 1,
              ns: 6,
              title: "File:Logo NIKE.svg",
              index: 1,
              imageinfo: [{ url: "https://upload.wikimedia.org/wikipedia/commons/a/a6/Logo_NIKE.svg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original", thumburl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a6/Logo_NIKE.svg/330px-Logo_NIKE.svg.png", mime: "image/svg+xml" }],
            },
          ],
        },
      }),
    );

    const results = await searchWikimedia("nike", signal);

    expect(results.map((result) => [result.name, result.detail, result.ref])).toEqual([
      ["Logo NIKE", "SVG", "https://upload.wikimedia.org/wikipedia/commons/a/a6/Logo_NIKE.svg"],
      ["Niké logo", "PNG", "https://upload.wikimedia.org/wikipedia/commons/a/ab/Nik%C3%A9_logo.png"],
    ]);
    expect(results[0]).toMatchObject({
      key: "wikimedia:https://upload.wikimedia.org/wikipedia/commons/a/a6/Logo_NIKE.svg",
      source: "wikimedia",
      variant: null,
      previewUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a6/Logo_NIKE.svg/330px-Logo_NIKE.svg.png",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(commonsSearchUrl("nike"));
    expect((init?.headers as Record<string, string>)["User-Agent"]).toMatch(/^ThumbGen\//);
  });

  it("returns nothing when Commons finds nothing, and throws on HTTP errors", async () => {
    fetchMock.mockResolvedValueOnce(json({ batchcomplete: true }));
    expect(await searchWikimedia("zzzz", signal)).toEqual([]);
    fetchMock.mockResolvedValueOnce(json({}, 503));
    await expect(searchWikimedia("nike", signal)).rejects.toThrow("Wikimedia HTTP 503");
  });

  it("accepts only Commons upload URLs of SVG or PNG files", () => {
    expect(isCommonsFileUrl("https://upload.wikimedia.org/wikipedia/commons/a/a6/Logo_NIKE.svg")).toBe(true);
    expect(isCommonsFileUrl("https://upload.wikimedia.org/wikipedia/commons/3/36/Logo.jpg")).toBe(false);
    expect(isCommonsFileUrl("https://upload.wikimedia.org/wikipedia/en/a/a6/Logo.svg")).toBe(false);
    expect(isCommonsFileUrl("https://evil.example/wikipedia/commons/a/a6/Logo.svg")).toBe(false);
  });
});

describe("Brandfetch", () => {
  it("searches by name with the client ID and keeps hotlinkable icons", async () => {
    fetchMock.mockResolvedValue(
      json([
        { brandId: "id_0dwKPKT", claimed: true, domain: "nike.com", name: "Nike", icon: "https://cdn.brandfetch.io/id_0dwKPKT/w/128/h/128/fallback/lettermark/icon.webp?c=1axSIGNED", _score: 98.2, qualityScore: 0.99, verified: true },
        { brandId: "idQiyUiVWb", claimed: false, domain: "nikeplus.com", name: "", icon: "https://cdn.brandfetch.io/idQiyUiVWb/w/128/h/128/fallback/lettermark/icon.webp?c=1axSIGNED" },
        { brandId: "bad id!", domain: "x.com", name: "Bad", icon: "https://cdn.brandfetch.io/x/icon.webp" },
        { brandId: "idNoIcon1", domain: "noicon.com", name: "No icon" },
      ]),
    );

    const results = await searchBrandfetch("nike", "bf-client-1234", signal);

    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.brandfetch.io/v2/search/nike?c=bf-client-1234");
    expect(results).toEqual([
      {
        key: "brandfetch:id_0dwKPKT",
        source: "brandfetch",
        name: "Nike",
        detail: "nike.com",
        variant: null,
        previewUrl: "https://cdn.brandfetch.io/id_0dwKPKT/w/128/h/128/fallback/lettermark/icon.webp?c=1axSIGNED",
        ref: "id_0dwKPKT",
      },
      {
        key: "brandfetch:idQiyUiVWb",
        source: "brandfetch",
        name: "nikeplus.com",
        detail: "nikeplus.com",
        variant: null,
        previewUrl: "https://cdn.brandfetch.io/idQiyUiVWb/w/128/h/128/fallback/lettermark/icon.webp?c=1axSIGNED",
        ref: "idQiyUiVWb",
      },
    ]);
  });

  it("throws on HTTP errors", async () => {
    fetchMock.mockResolvedValue(json({ message: "Unauthorized" }, 401));
    await expect(searchBrandfetch("nike", "bf-client-1234", signal)).rejects.toThrow("Brandfetch HTTP 401");
  });

  it("builds the CDN address of a brand icon without the client ID", () => {
    expect(brandfetchLogoUrl("id_0dwKPKT")).toBe("https://cdn.brandfetch.io/id_0dwKPKT/w/1024/fallback/404/icon.png");
    expect(isBrandfetchBrandId("id_0dwKPKT")).toBe(true);
    expect(isBrandfetchBrandId("../etc")).toBe(false);
  });
});
