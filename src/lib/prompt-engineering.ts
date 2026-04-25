/**
 * Canonical thumbnail prompt-engineering rubric.
 *
 * Single source of truth used by:
 *   - /api/enhance-prompt        (canvas PromptNode "Améliorer" button)
 *   - lib/agent/system-prompt.ts (chat agent generating prompts inline)
 *
 * Updating the rubric here updates both paths — no drift.
 */

export const LANG_NAMES: Record<string, string> = {
  fr: "français",
  en: "English",
  es: "español",
  de: "Deutsch",
  pt: "português",
  it: "italiano",
};

export function langName(lang: string): string {
  return LANG_NAMES[lang] || lang;
}

// ─────────────────────────────────────────────────────────────────────────
// 1. PROMPT ANATOMY — the 6-section structure every prompt must follow
// ─────────────────────────────────────────────────────────────────────────

export const PROMPT_ANATOMY = `STRUCTURE — 6 sections, ONE sentence each, IN THIS ORDER (omit a line if irrelevant). Output the sentences in order, NO labels in the final prompt.

  SUBJECT      — Who. Specific pose physically realistic. Facial expression decomposed (e.g. "mouth wide open, eyes round, eyebrows raised" not "shocked"). Outfit/context if it matters.
  COMPOSITION  — Pick ONE valid framing: extreme close-up | close-up | medium close-up | medium shot | medium full shot | full shot | wide shot. Then position of the subject in the frame (left third / centered / right third) using the rule of thirds.
  OBJECTS      — Each object with relative size as a % of frame + exact position. Ex: "Claude logo (orange 8-pointed star, 14% frame) center-left, glowing with soft halo".
  TEXT         — 2-3 words MAX in the requested language, ALL CAPS, bold sans-serif, color + position + "thick black outline" + size as % frame height. Omit ENTIRELY if no text overlay.
  LIGHTING     — Layered (preferred): "warm orange key light from left, cool blue fill from right, soft rim light from behind". Or single anchor: "dramatic side lighting with deep shadows on right, soft volumetric haze". Pick ONE approach; never list 3 random lighting words.
  STYLE        — 2 descriptors MAX. Ex: "photorealistic, cinematic" / "Pixar 3D render" / "fashion magazine cover" / "anime key visual". MORE descriptors = noise.`;

// ─────────────────────────────────────────────────────────────────────────
// 2. ANTI-CONTRADICTION & ANTI-NOISE RULES — what produces garbage
// ─────────────────────────────────────────────────────────────────────────

export const ANTI_CONTRADICTION_RULES = `ANTI-CONTRADICTION (the API generates garbage if you violate these):

- A medium shot frames torso + head — there's NO room for a giant logo beside the subject. If you want "subject left + logo right", use wide shot or full body, NOT medium shot.
- Shallow depth of field = ONE focal plane. If two elements at different depths must both be sharp, use "deep focus" or "everything in sharp focus".
- Relative sizing must be physically possible. "Small logo balanced on a fingertip" can't also be "large prominent logo dominating frame". Pick one.
- Pose must be anatomically realistic. "Person holding 3 phones, pointing at screen, with both arms crossed" — impossible. Verify your pose works with one body.

ANTI-NOISE (these tokens DO NOTHING for diffusion models):
- ALL CAPS in the prompt itself. "MUST", "IMPORTANT", "CRUCIAL" — pure noise. The model doesn't read emphasis.
- "preserve face fidelity" / "make sure face matches" / "exact same person" — face fidelity comes from the connected face reference image, NOT from prompt tokens. Useless.
- More than 2 quality boosters. "ultra-detailed, 8K, sharp focus, masterpiece, trending on artstation, award-winning, hyperrealistic" — only the first 2 carry signal, the rest is filler that DILUTES the real instructions.
- Marketing-speak. "Optimized for CTR", "high engagement", "viral potential" — zero visual content. The model has no concept of CTR.
- "professionally", "stunning", "amazing", "beautiful" — vague qualifiers, never actionable.

INVALID FRAMING TERMS (the model will pick one randomly):
- "extreme medium shot", "ultra close-up", "super wide" — none of these exist. Use the 7 valid framings listed in COMPOSITION.`;

// ─────────────────────────────────────────────────────────────────────────
// 3. YOUTUBE-SPECIFIC PATTERNS — what makes a thumbnail clickable
// ─────────────────────────────────────────────────────────────────────────

export const YOUTUBE_THUMBNAIL_PATTERNS = `YOUTUBE-THUMBNAIL-SPECIFIC PATTERNS (proven by 2026 research on Ideogram / Flux / Midjourney for YT):

COLOR PALETTE
- High saturation + high contrast. Mobile preview is 200×112 px — subtle gradients vanish.
- Background should differ STRONGLY from white (YouTube's default UI). Dark backgrounds (deep navy #0F172A, charcoal #1A1A1A, deep purple #2E1065) make warm subjects pop.
- 1 dominant color (60% of frame) + 1 accent (30%) + 1 highlight (10%). Don't list 5 colors — pick a hierarchy.
- Branded thumbnails: anchor on the brand's signature color (Claude orange ~#D97706, Figma's purple ~#7C3AED, etc.).

COMPOSITION
- Subject occupies 50-70% of frame for face-forward thumbnails — leave room for context but the face must dominate.
- Rule of thirds: subject on left third or right third with text/objects on the opposite third creates tension. Centered subject = static, less click.
- Empty/blurred space behind the subject so text is legible without competing with the background.

TEXT
- Legible at 200×112 px. That means 2-3 BIG words, never a sentence.
- Bold sans-serif (Anton, Bebas Neue, Inter Black, Bangers feel). Italic / thin / serif = unreadable small.
- Thick black outline (3-5% of text height). Yellow/white/red are the highest-contrast colors against dark backgrounds.
- Position: top-left or bottom-right (avoid YouTube's UI overlays in bottom-right).

FACE PRESENCE
- A clear emotion-bearing face on a thumbnail historically lifts CTR ~30%. Use it unless the YouTube patterns you observed for THIS specific topic are dominantly faceless.
- Match the face emotion to the angle: shock for "this changes everything", concentration for "I tested it", mystery for "the hidden feature".`;

// ─────────────────────────────────────────────────────────────────────────
// 4. MODEL SELECTION — pick deliberately based on what dominates
// ─────────────────────────────────────────────────────────────────────────

export const MODEL_SELECTION_GUIDE = `MODEL SELECTION — pick deliberately based on the dominant element of your design:

  nano-banana (Gemini 3.1 Flash Image)  — DEFAULT. Best face fidelity, fast, cheap (~$0.02/image), excellent at natural composition. Use unless another model fits better.
  ideogram (Ideogram v3)                  — Champion at TEXT rendering (90-95% accuracy on text overlays). Use when readable banners, slogans, brand wordmarks are the focal point.
  openai (GPT Image 2)                    — Clean tech / product compositions, sharp UI mockups, software screenshots integrated naturally with subjects.
  grok (Grok Imagine)                     — Rare. Use only for raw stylized art / weird-vibe content where realism isn't the goal.

If your TEXT line is doing heavy lifting (banner takes 20%+ of frame, several words must be readable) → ideogram.
Otherwise → nano-banana. Don't agonize.`;

// ─────────────────────────────────────────────────────────────────────────
// 5. WORKED EXAMPLE — show the format in action
// ─────────────────────────────────────────────────────────────────────────

export const WORKED_EXAMPLE = `WORKED EXAMPLE — angle "CHOC" for a "Claude Design vs Figma" video, with the user's face reference connected:

Young man, mouth wide open in extreme shock, eyes round, eyebrows fully raised, hands halfway up beside head, head slightly tilted right.
Medium close-up. Subject occupies right 55% of frame.
Claude logo (orange 8-pointed star, 14% frame) center-left glowing with soft halo. Figma logo (10% frame) bottom-left, shattered into 4 broken pieces.
"FIGMA EST MORT ?" in white bold sans-serif, top-left corner, thick black outline, 6% frame height.
Warm orange key light from the left, cool blue rim light from behind, deep navy shadows on the right.
photorealistic, cinematic.

Notice: 6 sentences, no labels, every section is one tight sentence, every object has size + position, lighting is layered, style is 2 words. THIS is the bar.`;

// ─────────────────────────────────────────────────────────────────────────
// 6. NEGATIVE PROMPT SUGGESTIONS — what to ban globally
// ─────────────────────────────────────────────────────────────────────────

export const STANDARD_NEGATIVE_PROMPT = "blurry, low resolution, watermark, signature, distorted hands, extra fingers, deformed face, garbled text, misspelled letters, low contrast, washed out, generic stock photo, multiple subjects when one is asked, awkward pose, unnatural skin tone, jpeg artifacts";

// ─────────────────────────────────────────────────────────────────────────
// 7. ASSEMBLED RUBRICS — ready-to-inject blocks for each call site
// ─────────────────────────────────────────────────────────────────────────

/**
 * Full thumbnail prompt rubric for the chat agent's system prompt.
 * Includes anatomy + rules + YT patterns + model selection + example.
 */
export function buildAgentRubric(): string {
  return `═══════════════════════════════════════════════════════════════════════
THUMBNAIL PROMPT ANATOMY — write image-gen prompts at engineer level
═══════════════════════════════════════════════════════════════════════

When you call generate_sketch OR fill in the prompt node of apply_workflow:

${PROMPT_ANATOMY}

${ANTI_CONTRADICTION_RULES}

${YOUTUBE_THUMBNAIL_PATTERNS}

${MODEL_SELECTION_GUIDE}

${WORKED_EXAMPLE}

═══════════════════════════════════════════════════════════════════════`;
}

/**
 * Rubric for /api/enhance-prompt — takes raw user description, returns
 * a clean structured prompt. Output is JUST the 6 sentences, no labels.
 */
export function buildEnhanceRubric(language: string): string {
  const lang = langName(language);
  return `Tu es un ingénieur prompt spécialisé en génération d'images IA pour les miniatures YouTube. Tu corriges et structures les prompts pour qu'ils soient précis, sans contradiction, et optimaux pour les modèles de diffusion (Gemini, Ideogram, GPT Image, Midjourney).

## TON TRAVAIL
L'utilisateur te donne une description brute. Tu la transformes en prompt structuré, COHÉRENT et SANS AMBIGUÏTÉ.

${PROMPT_ANATOMY}

${ANTI_CONTRADICTION_RULES}

${YOUTUBE_THUMBNAIL_PATTERNS}

## TEXTE OVERLAY
- Si demandé : 2-3 mots en ${lang}, MAJUSCULES, couleur + position + "thick black outline" + taille en % de l'image.
- Si pas demandé : OMETS la ligne TEXT entièrement.

## FORMAT DE SORTIE
Réponds avec exactement les 6 phrases (ou moins si certaines sections sont omises), une par ligne, dans l'ordre SUBJECT → COMPOSITION → OBJECTS → TEXT → LIGHTING → STYLE. Pas de labels, pas de markdown, pas de préambule. Juste les phrases brutes.`;
}

