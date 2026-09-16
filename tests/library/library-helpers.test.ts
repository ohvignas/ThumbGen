import { describe, it, expect } from "vitest";
import { matchesSearch, normalizeSearchText } from "@/lib/search-text";
import {
  DEFAULT_LIBRARY_TAB,
  LIBRARY_TAB_IDS,
  LIBRARY_TAB_LABELS,
  isLibraryTab,
  libraryTabHref,
  parseLibraryTab,
} from "@/lib/library/library-tabs";
import { fileBaseName, filterBySearch, logoImageUrl, swipeImageUrl } from "@/lib/library/library-items";

describe("search text", () => {
  it("ignores case, accents and surrounding spaces", () => {
    expect(normalizeSearchText("  Élodie À la Plage ")).toBe("elodie a la plage");
    expect(matchesSearch("Réaction choquée", "REACTION")).toBe(true);
    expect(matchesSearch("Réaction choquée", "choque reac")).toBe(true);
    expect(matchesSearch("Réaction choquée", "surprise")).toBe(false);
  });

  it("matches everything on a blank query", () => {
    expect(matchesSearch("Logo", "   ")).toBe(true);
    expect(matchesSearch("", "")).toBe(true);
  });
});

describe("library tabs", () => {
  it("lists the three tabs in order with French labels", () => {
    expect(LIBRARY_TAB_IDS).toEqual(["personnages", "logos", "inspirations"]);
    expect(LIBRARY_TAB_LABELS).toEqual({ personnages: "Personnages", logos: "Logos", inspirations: "Inspirations" });
    expect(DEFAULT_LIBRARY_TAB).toBe("personnages");
  });

  it("reads ?onglet= and falls back to personnages", () => {
    expect(parseLibraryTab("logos")).toBe("logos");
    expect(parseLibraryTab("inspirations")).toBe("inspirations");
    expect(parseLibraryTab("personnages")).toBe("personnages");
    expect(parseLibraryTab("Logos")).toBe("personnages");
    expect(parseLibraryTab("modeles")).toBe("personnages");
    expect(parseLibraryTab(null)).toBe("personnages");
    expect(parseLibraryTab(undefined)).toBe("personnages");
    expect(isLibraryTab("logos")).toBe(true);
    expect(isLibraryTab(3)).toBe(false);
  });

  it("builds the page link of a tab", () => {
    expect(libraryTabHref("personnages")).toBe("/bibliotheque?onglet=personnages");
    expect(libraryTabHref("logos")).toBe("/bibliotheque?onglet=logos");
  });
});

describe("library items", () => {
  it("builds image URLs from the stored id", () => {
    expect(logoImageUrl("3f2c")).toBe("/api/logos/image?f=3f2c");
    expect(swipeImageUrl("a b")).toBe("/api/swipe-files/image?f=a%20b");
  });

  it("filters by label, accent-insensitive, keeping the order", () => {
    const items = [{ label: "Notion" }, { label: "YouTube" }, { label: "Nötion clair" }];
    expect(filterBySearch(items, (item) => item.label, "notion")).toEqual([{ label: "Notion" }, { label: "Nötion clair" }]);
    expect(filterBySearch(items, (item) => item.label, "")).toEqual(items);
  });

  it("drops the extension of an imported file name", () => {
    expect(fileBaseName("logo.final.png")).toBe("logo.final");
    expect(fileBaseName("sans-extension")).toBe("sans-extension");
    expect(fileBaseName(".png")).toBe("Image");
  });
});
