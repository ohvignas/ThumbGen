import { Bot, Database, ImagePlus, KeyRound, Palette, Plug, TvMinimalPlay, type LucideIcon } from "lucide-react";

// lucide-react 1.x ships no brand icons (no `Youtube`), hence TvMinimalPlay for « Ma chaîne ».
export const SETTINGS_SECTIONS = [
  { slug: "connexions", label: "Connexions des modèles", icon: KeyRound },
  { slug: "agent", label: "Agent IA", icon: Bot },
  { slug: "generation", label: "Génération d'images", icon: ImagePlus },
  { slug: "chaine", label: "Ma chaîne", icon: TvMinimalPlay },
  { slug: "integrations", label: "Intégrations", icon: Plug },
  { slug: "donnees", label: "Données & sauvegardes", icon: Database },
  { slug: "apparence", label: "Apparence", icon: Palette },
] as const satisfies ReadonlyArray<{ slug: string; label: string; icon: LucideIcon }>;

export type SettingsSectionSlug = (typeof SETTINGS_SECTIONS)[number]["slug"];

export function isSettingsSectionSlug(value: string): value is SettingsSectionSlug {
  return SETTINGS_SECTIONS.some((section) => section.slug === value);
}

/** "/reglages/<slug>/…" → slug; anything else falls back to the first section. */
export function activeSectionSlug(pathname: string): SettingsSectionSlug {
  const segment = pathname.split("/")[2] ?? "";
  return isSettingsSectionSlug(segment) ? segment : "connexions";
}
