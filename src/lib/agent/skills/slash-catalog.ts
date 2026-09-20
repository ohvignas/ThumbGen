/**
 * User-facing Brainstorm slash commands (composer `/` picker).
 * Not the full SKILL.md catalog — tool skills stay model-only.
 * Safe to import from client components (no fs).
 */

export type SlashSkill = {
  /** Token after `/` in the composer (e.g. croquis). */
  slash: string;
  /** Extra tokens that invoke this row (not shown as their own picker line). */
  aliases?: readonly string[];
  /** Exact SKILL.md `name` passed to read_skill / <invoked_skill>. */
  skill: string;
  title: string;
  description: string;
};

export const SLASH_SKILLS: SlashSkill[] = [
  {
    slash: "croquis",
    skill: "generate_sketch",
    title: "Croquis",
    description: "Brainstorm puis dessine un croquis (pas la miniature finale).",
  },
  {
    slash: "create-prompt",
    aliases: ["create-propt"],
    skill: "create-prompt",
    title: "Create prompt",
    description: "Écrit un prompt image et le pose sur le nœud prompt.",
  },
  {
    slash: "miniature",
    skill: "thumbnail-packaging",
    title: "Nouvelle miniature",
    description: "Promesse, titres, textes miniature, packs A/B.",
  },
  {
    slash: "canvas",
    skill: "existing-workflow",
    title: "Workflow existant",
    description: "Analyse ou modifie le canvas ouvert.",
  },
  {
    slash: "recherche",
    skill: "research_topic",
    title: "Recherche",
    description: "Brief du sujet (Perplexity ou OpenRouter, payant).",
  },
  {
    slash: "concurrents",
    skill: "find_competitor_thumbnails",
    title: "Concurrents",
    description: "Miniatures qui performent dans la niche.",
  },
  {
    slash: "script",
    skill: "extract_youtube_script",
    title: "Script YouTube",
    description: "Transcription d'une vidéo collée.",
  },
  {
    slash: "youtube",
    skill: "search_youtube",
    title: "Chercher YouTube",
    description: "Recherche publique de vidéos.",
  },
  {
    slash: "logos",
    skill: "find_logos",
    title: "Logos",
    description: "Trouver des marques à coller sur la miniature.",
  },
];

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
