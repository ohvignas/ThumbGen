import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LibraryPickerTabs, PickErrorLine, runLibraryPick, PICK_REFUSED_ERROR } from "@/components/library/LibraryPickerDialog";

const item = { imageUrl: "/api/logos/image?f=x", label: "Logo" };

describe("runLibraryPick", () => {
  it("accepts a pick (dialog closes) when onPick returns nothing or true", () => {
    expect(runLibraryPick(() => {}, item)).toBeNull();
    expect(runLibraryPick(() => true, item)).toBeNull();
  });

  it("keeps the dialog open with the generic error when onPick returns false", () => {
    expect(runLibraryPick(() => false, item)).toBe(PICK_REFUSED_ERROR);
  });

  it("shows the thrown error's message, or the generic one", () => {
    expect(
      runLibraryPick(() => {
        throw new Error("Image introuvable");
      }, item),
    ).toBe("Image introuvable");
    expect(
      runLibraryPick(() => {
        throw "x";
      }, item),
    ).toBe(PICK_REFUSED_ERROR);
  });
});

describe("picker accessibility", () => {
  it("renders the pick error as an alert, nothing without an error", () => {
    expect(renderToStaticMarkup(<PickErrorLine error="Oups" />)).toMatch(/role="alert"[^>]*>Oups</);
    expect(renderToStaticMarkup(<PickErrorLine error={null} />)).toBe("");
  });

  it("labels the kind switcher and the source tabs", () => {
    const html = renderToStaticMarkup(
      <LibraryPickerTabs kind="all" query="" onPick={() => {}} tabByKind={{}} onTabChange={() => {}} activeKind="logos" onKindChange={() => {}} />,
    );
    expect(html).toContain('aria-label="Type d&#x27;élément"');
    expect(html).toContain('aria-label="Source"');
  });
});
