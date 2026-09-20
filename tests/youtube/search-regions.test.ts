import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_YOUTUBE_SEARCH_REGION,
  parseYoutubeSearchRegion,
  readStoredYoutubeSearchRegion,
  writeStoredYoutubeSearchRegion,
  YOUTUBE_SEARCH_REGION_STORAGE_KEY,
  youtubeSearchLanguage,
} from "@/lib/youtube/search-regions";

describe("parseYoutubeSearchRegion", () => {
  it("defaults to France", () => {
    expect(DEFAULT_YOUTUBE_SEARCH_REGION).toBe("FR");
    expect(parseYoutubeSearchRegion(null)).toBe("FR");
    expect(parseYoutubeSearchRegion("xx")).toBe("FR");
  });

  it("accepts a known country code case-insensitively", () => {
    expect(parseYoutubeSearchRegion("us")).toBe("US");
    expect(parseYoutubeSearchRegion("BE")).toBe("BE");
  });
});

describe("youtubeSearchLanguage", () => {
  it("maps France to fr and the US to en", () => {
    expect(youtubeSearchLanguage("FR")).toBe("fr");
    expect(youtubeSearchLanguage("US")).toBe("en");
  });
});

describe("stored youtube search region", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists the last country and treats junk as France", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
    });
    expect(readStoredYoutubeSearchRegion()).toBe("FR");
    writeStoredYoutubeSearchRegion("US");
    expect(store.get(YOUTUBE_SEARCH_REGION_STORAGE_KEY)).toBe("US");
    expect(readStoredYoutubeSearchRegion()).toBe("US");
    store.set(YOUTUBE_SEARCH_REGION_STORAGE_KEY, "xx");
    expect(readStoredYoutubeSearchRegion()).toBe("FR");
  });
});
