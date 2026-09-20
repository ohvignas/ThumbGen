import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LibraryPickerQueryRow, LibraryPickerTabs, youtubePickerTabActive } from "@/components/library/LibraryPickerDialog";

type Props = Parameters<typeof LibraryPickerTabs>[0];
const render = (kind: Props["kind"], activeKind: Props["activeKind"] = null) =>
  renderToStaticMarkup(
    <LibraryPickerTabs kind={kind} query="" onPick={() => {}} tabByKind={{}} onTabChange={() => {}} activeKind={activeKind} onKindChange={() => {}} />,
  );

describe("LibraryPickerTabs", () => {
  it("chat mode (all) offers every library kind as a top-level switcher, Personnages first", () => {
    const html = render("all");
    for (const label of ["Personnages", "Logos", "Inspirations"]) expect(html).toContain(label);
    expect(html.indexOf("Personnages")).toBeLessThan(html.indexOf("Logos"));
    expect(html.indexOf("Logos")).toBeLessThan(html.indexOf("Inspirations"));
  });

  it("a single kind keeps its own tabs, without the kind switcher", () => {
    const html = render("inspirations");
    expect(html).toContain("Mes images");
    expect(html).toContain("YouTube");
    expect(html).toContain("Chaînes suivies");
    expect(html).not.toContain("Personnages");
  });

  it("chat mode opens the requested kind with its own tabs (the agent asked for a logo)", () => {
    const html = render("all", "logos");
    expect(html).toContain("Mes logos");
    expect(html).toContain("Chercher en ligne");
    expect(render("all")).not.toContain("Mes logos");
  });
});

describe("youtubePickerTabActive", () => {
  it("is true only on the Inspirations YouTube tab", () => {
    expect(youtubePickerTabActive("inspirations", null, { inspirations: "youtube" })).toBe(true);
    expect(youtubePickerTabActive("all", "inspirations", { inspirations: "youtube" })).toBe(true);
    expect(youtubePickerTabActive("inspirations", null, { inspirations: "mes-images" })).toBe(false);
    expect(youtubePickerTabActive("all", "logos", { inspirations: "youtube" })).toBe(false);
  });
});

describe("LibraryPickerQueryRow", () => {
  it("puts the country select next to the search bar on the YouTube tab", () => {
    const html = renderToStaticMarkup(
      <LibraryPickerQueryRow query="" onQueryChange={() => {}} region="FR" onRegionChange={() => {}} showRegion />,
    );
    expect(html).toContain("Rechercher dans la bibliothèque");
    expect(html).toContain("Pays des résultats YouTube");
    expect(html).toContain("France");
    expect(html.indexOf("Rechercher dans la bibliothèque")).toBeLessThan(html.indexOf("Pays des résultats YouTube"));
  });

  it("hides the country select on other tabs", () => {
    const html = renderToStaticMarkup(
      <LibraryPickerQueryRow
        query=""
        onQueryChange={() => {}}
        region="FR"
        onRegionChange={() => {}}
        showRegion={false}
      />,
    );
    expect(html).toContain("Rechercher dans la bibliothèque");
    expect(html).not.toContain("Pays des résultats YouTube");
  });
});
