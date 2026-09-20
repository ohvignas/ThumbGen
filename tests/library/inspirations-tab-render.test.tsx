import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import InspirationsTab from "@/components/library/InspirationsTab";

describe("InspirationsTab", () => {
  it("does not show Mes images; YouTube search and followed channels stay", () => {
    const html = renderToStaticMarkup(<InspirationsTab />);
    expect(html).not.toContain("Mes images");
    expect(html).not.toContain("Miniatures et visuels importés");
    expect(html).toContain("Chercher sur YouTube");
    expect(html).toContain("Chaînes suivies");
  });
});
