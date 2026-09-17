import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BriefPanel from "@/components/brief/BriefPanel";
import { compositionSchema, emptyBrief, type ThumbnailBrief } from "@/lib/brief/schema";
import { NOW, card, pkg } from "./fixtures";

const full = (): ThumbnailBrief => ({
  ...emptyBrief(),
  step: 7,
  video: { subject: "Les miniatures YouTube", promise: "Savoir créer une miniature", audience: "Débutants" },
  research: {
    summary: "Les miniatures comptent.",
    keyPoints: [],
    entities: [],
    sources: [{ title: "Aide YouTube", url: "https://support.google.com/youtube" }],
    fetchedAt: NOW,
  },
  logos: [{ name: "Claude", source: "stored:lg_l1" }],
  competition: { patterns: ["Visage + objet"], saturation: ["Flèche rouge"], dominantPalette: ["#FF0000"], analyzedAt: NOW },
  references: [
    { videoId: "abcdefghijk", title: "Top miniature", channel: "Chaîne", lang: "fr", views: 1000, score: 8.2, ageDays: 30, source: "stored:sf_s1" },
  ],
  abStrategy: "concepts",
  common: { textMode: "rendered", persona: "stored:persona_p1", style: "Aplats", colors: ["#0F172A"] },
  variants: [
    {
      key: "A",
      ...pkg(),
      composition: compositionSchema.parse(card()),
      sketch: { source: "generated:sk_abc", status: "pending", autoFixed: false },
    },
  ],
});

describe("BriefPanel", () => {
  it("shows every section of a filled brief", () => {
    const html = renderToStaticMarkup(<BriefPanel brief={full()} onPatch={vi.fn()} />);
    for (const title of ["Vidéo et promesse", "Recherche", "Logos", "Concurrents", "Stratégie et éléments communs", "Variantes"]) {
      expect(html).toContain(title);
    }
    expect(html).toContain('value="Savoir créer une miniature"');
    expect(html).toContain('href="https://support.google.com/youtube"');
    expect(html).toContain("/api/logos/image?f=l1");
    expect(html).toContain("Ce qui marche");
    expect(html).toContain("Flèche rouge");
    expect(html).toContain("×8,2");
    expect(html).toContain("Trouver le meilleur concept");
    expect(html).toContain("#0F172A");
    expect(html).toContain("Variante A — Promesse chiffrée");
    expect(html).toContain('id="brief-A-thumbnailText"');
    expect(html).toContain('id="brief-A-focal"');
    expect(html).toContain("Visage à gauche, objet à droite");
    expect(html).toContain("/api/generated-sketches/sk_abc");
    expect(html).toContain("Esquisse à valider");
  });

  it("says what is not there yet", () => {
    const html = renderToStaticMarkup(<BriefPanel brief={emptyBrief()} onPatch={vi.fn()} />);
    expect(html).toContain("Pas encore de recherche.");
    expect(html).toContain("Aucun logo.");
    expect(html).toContain("Pas encore d&#x27;analyse des concurrents.");
    expect(html).toContain("Pas encore de variante.");
  });
});
