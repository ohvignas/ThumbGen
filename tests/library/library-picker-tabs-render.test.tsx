import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LibraryPickerTabs } from "@/components/library/LibraryPickerDialog";

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
