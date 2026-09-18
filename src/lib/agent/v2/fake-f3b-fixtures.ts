import type { BriefCompetition, BriefResearch, LogoCandidate } from "@/lib/brief/schema";
import type { CompetitorHit } from "@/lib/brief/competitor-search-store";

export const FAKE_RESEARCH: BriefResearch = {
  summary: "Les miniatures YouTube se lisent en une seconde : un point focal, peu de texte, des couleurs qui ressortent du fil.",
  keyPoints: ["Texte court complémentaire du titre", "Un visage ou un objet dominant", "Contraste fort sur mobile"],
  entities: [{ name: "Claude", kind: "tool" }],
  sources: [{ title: "Aide YouTube", url: "https://support.google.com/youtube" }],
  fetchedAt: "2026-09-17T10:00:00.000Z",
};

export const FAKE_LOGO_CANDIDATES: LogoCandidate[] = [
  {
    id: "lc_fakeclaude",
    name: "Claude",
    source: "simple-icons",
    ref: "anthropic",
    previewUrl: "/api/briefs/fake/logo-candidates/lc_fakeclaude",
  },
];

export const FAKE_COMPETITOR_HITS: CompetitorHit[] = Array.from({ length: 12 }, (_, index) => ({
  videoId: `yt_fake_${index < 6 ? "fr" : "en"}_${index + 1}`.padEnd(11, "x").slice(0, 11),
  title: `Concurrent ${index + 1}`,
  channel: index < 6 ? "Chaîne FR" : "EN channel",
  channelId: `UC${(index < 6 ? "f" : "e").repeat(22)}`,
  lang: index < 6 ? "fr" : "en",
  views: 10_000 - index * 100,
  score: 8 - index * 0.2,
  ageDays: 30 + index,
  searchRank: index,
  viral: false,
}));

export const FAKE_COMPETITION: BriefCompetition = {
  patterns: ["Visage + objet", "Texte court en haut", "Fond uni sombre"],
  saturation: ["Flèche rouge", "Cercle jaune"],
  dominantPalette: ["#0F172A", "#F59E0B", "#FFFFFF"],
  analyzedAt: "2026-09-17T10:00:00.000Z",
};
