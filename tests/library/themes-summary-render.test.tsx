import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import TypesSummary from "@/components/library/followed-channels/TypesSummary";

describe("TypesSummary", () => {
  it("is a 7-day rising-hit strip, not a period switch or token wall", () => {
    const html = renderToStaticMarkup(<TypesSummary version="1" onOpen={vi.fn()} onSubject={vi.fn()} />);
    expect(html).toContain("🏆 Tendance Youtube");
    expect(html).not.toContain("Sujet qui marche en ce moment");
    expect(html).not.toContain("Fenêtre");
    expect(html).not.toContain("1 mois");
    expect(html).not.toContain("6 mois");
    expect(html).not.toContain("idée partagée");
    expect(html).not.toContain("type de vidéo");
    expect(html).not.toContain("La thématique qui marche");
    expect(html).not.toContain("Les thématiques qui marchent");
    expect(html).not.toContain("Autres sujets");
    expect(html).not.toContain("Type de miniature");
    expect(html).not.toContain("Thématiques visibles");
  });
});
