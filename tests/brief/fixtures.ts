/** A valid package (title + thumbnail) for variant tests. */
export const pkg = (overrides: Record<string, unknown> = {}) => ({
  direction: "Promesse chiffrée",
  title: "Ma méthode pour des miniatures qui cliquent",
  thumbnailText: "10 MIN",
  visualIdea: "Visage surpris à gauche, chronomètre à droite.",
  titleRole: "Promet la méthode",
  thumbRole: "Montre la rapidité",
  ...overrides,
});

/** A valid composition card: hero on the left, text zone top-right. */
export const card = (overrides: Record<string, unknown> = {}) => ({
  layout: "face-left_object-right",
  focal: "Visage surpris",
  elements: [
    { what: "Visage surpris", role: "hero", sizePct: 45, position: "left" },
    { what: "Chronomètre", role: "support", sizePct: 25, position: "right" },
  ],
  textZone: { position: "top-right", heightPct: 20 },
  background: { kind: "solid", color: "#0F172A" },
  emotion: { label: "surprise", intensity: 2, mouth: "closed" },
  palette: { dominant: "#0F172A", accent: "#F59E0B", highlight: "#FFFFFF" },
  ...overrides,
});

export const NOW = "2026-09-17T10:00:00.000Z";
