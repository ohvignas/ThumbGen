import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import YoutubeSearchSection from "@/components/library/YoutubeSearchSection";

describe("YoutubeSearchSection", () => {
  it("puts the country select next to the search bar, France by default", () => {
    const html = renderToStaticMarkup(<YoutubeSearchSection />);
    expect(html).toContain("Rechercher des miniatures YouTube");
    expect(html).toContain("Pays des résultats YouTube");
    expect(html).toContain("France");
    expect(html.indexOf("Rechercher des miniatures YouTube")).toBeLessThan(html.indexOf("Pays des résultats YouTube"));
  });
});
