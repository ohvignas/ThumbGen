import { describe, it, expect } from "vitest";
import { SETTINGS_SECTIONS, activeSectionSlug, isSettingsSectionSlug } from "@/components/settings/sections";

describe("settings sections", () => {
  it("lists the seven sections in the spec order with their labels", () => {
    expect(SETTINGS_SECTIONS.map((s) => [s.slug, s.label])).toEqual([
      ["connexions", "Connexions des modèles"],
      ["agent", "Agent IA"],
      ["generation", "Génération d'images"],
      ["chaine", "Ma chaîne"],
      ["integrations", "Intégrations"],
      ["donnees", "Données & sauvegardes"],
      ["apparence", "Apparence"],
    ]);
  });

  it("finds the active section from the pathname", () => {
    expect(activeSectionSlug("/reglages/agent")).toBe("agent");
    expect(activeSectionSlug("/reglages/donnees/extra")).toBe("donnees");
    expect(activeSectionSlug("/reglages")).toBe("connexions");
    expect(activeSectionSlug("/reglages/nope")).toBe("connexions");
  });

  it("recognises section slugs", () => {
    expect(isSettingsSectionSlug("apparence")).toBe(true);
    expect(isSettingsSectionSlug("theme")).toBe(false);
  });
});
