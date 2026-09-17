import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Spinner } from "@/components/ui/spinner";

describe("Marker + Spinner (shadcn base-nova)", () => {
  it("renders a status marker whose spinner is hidden from assistive tech", () => {
    const html = renderToStaticMarkup(
      <Marker role="status">
        <MarkerIcon>
          <Spinner />
        </MarkerIcon>
        <MarkerContent>Cherche sur YouTube</MarkerContent>
      </Marker>,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('data-slot="marker"');
    expect(html).toContain('data-slot="marker-icon"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-slot="spinner"');
    expect(html).toContain("animate-spin");
    expect(html).toContain("Cherche sur YouTube");
  });

  it("renders as another element through render", () => {
    const html = renderToStaticMarkup(
      <Marker render={<span />}>
        <MarkerContent>Réfléchit</MarkerContent>
      </Marker>,
    );
    expect(html.startsWith("<span")).toBe(true);
  });
});
