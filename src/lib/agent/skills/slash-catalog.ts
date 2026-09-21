/**
 * User-facing Brainstorm slash commands (composer `/` picker).
 * Not the full SKILL.md catalog — tool skills stay model-only.
 * Safe to import from client components (no fs).
 */

import type { AgentSurface } from "@/lib/studio/agent-surface";

export type SlashSkill = {
  /** Token after `/` in the composer (e.g. croquis). */
  slash: string;
  /** Extra tokens that invoke this row (not shown as their own picker line). */
  aliases?: readonly string[];
  /** Exact SKILL.md `name` passed to read_skill / <invoked_skill>. */
  skill: string;
  title: string;
  description: string;
  surfaces: readonly AgentSurface[];
};

export const SLASH_SKILLS: SlashSkill[] = [
  {
    slash: "ecrire",
    aliases: ["write"],
    skill: "write_video",
    title: "Écrire une vidéo",
    description: "Vidéos / studio : corpus, format, script, titres et description YouTube.",
    surfaces: ["studio"],
  },
  {
    slash: "format",
    skill: "studio_format",
    title: "Format de tournage",
    description: "Vidéos / studio : préciser la mise en forme (face + écran, tuto, essai…).",
    surfaces: ["studio"],
  },
  {
    slash: "titres",
    skill: "studio_titles",
    title: "Titres A/B",
    description: "Vidéos / studio : trois lignes Titre / texte miniature / concept.",
    surfaces: ["studio"],
  },
  {
    slash: "desc",
    skill: "studio_description",
    title: "Description YouTube",
    description: "Vidéos / studio : apprentissages, timestamps et hashtags.",
    surfaces: ["studio"],
  },
  {
    slash: "scenario",
    skill: "studio_script",
    title: "Script",
    description: "Vidéos / studio : texte long calé sur le format de tournage.",
    surfaces: ["studio"],
  },
  {
    slash: "croquis",
    skill: "generate_sketch",
    title: "Croquis",
    description: "Brainstorm puis dessine un croquis (pas la miniature finale).",
    surfaces: ["canvas"],
  },
  {
    slash: "create-prompt",
    aliases: ["create-propt"],
    skill: "create-prompt",
    title: "Create prompt",
    description: "Écrit un prompt image et le pose sur le nœud prompt.",
    surfaces: ["canvas"],
  },
  {
    slash: "miniature",
    skill: "thumbnail-packaging",
    title: "Nouvelle miniature",
    description: "Promesse, titres, textes miniature, packs A/B.",
    surfaces: ["canvas"],
  },
  {
    slash: "canvas",
    skill: "existing-workflow",
    title: "Workflow existant",
    description: "Analyse ou modifie le canvas ouvert.",
    surfaces: ["canvas"],
  },
  {
    slash: "recherche",
    skill: "research_topic",
    title: "Recherche",
    description: "Brief du sujet (Perplexity ou OpenRouter, payant).",
    surfaces: ["studio", "canvas"],
  },
  {
    slash: "concurrents",
    skill: "find_competitor_thumbnails",
    title: "Concurrents",
    description: "Miniatures qui performent dans la niche.",
    surfaces: ["canvas"],
  },
  {
    slash: "script",
    skill: "extract_youtube_script",
    title: "Script YouTube",
    description: "Transcription d'une vidéo collée.",
    surfaces: ["studio", "canvas"],
  },
  {
    slash: "youtube",
    skill: "search_youtube",
    title: "Chercher YouTube",
    description: "Recherche publique de vidéos.",
    surfaces: ["studio", "canvas"],
  },
  {
    slash: "logos",
    skill: "find_logos",
    title: "Logos",
    description: "Trouver des marques à coller sur la miniature.",
    surfaces: ["canvas"],
  },
];

export function slashSkillsForSurface(surface: AgentSurface): SlashSkill[] {
  return SLASH_SKILLS.filter((row) => row.surfaces.includes(surface));
}

/** Resolves a typed token (`croquis`, hidden `generate_sketch`, or a row alias) to a picker row. */
export function lookupSlashToken(token: string): SlashSkill | null {
  const normalized = token.trim().toLowerCase();
  if (!normalized) return null;
  return (
    SLASH_SKILLS.find(
      (row) =>
        row.slash === normalized ||
        row.skill === normalized ||
        row.aliases?.some((alias) => alias === normalized),
    ) ?? null
  );
}
