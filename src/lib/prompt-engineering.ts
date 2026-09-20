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

export const SCRATCH_VS_ADJUST = `TWO INTENTS — SCRATCH vs ADJUST (iterate). Pick from the canvas. The two are not interchangeable.

A/B is only variant slots (prompt-in / prompt-in-b / prompt-in-c). A/B never means "write short prompts". Short prompts fire only when ITERATING on an already-generated image.

1. FROM SCRATCH / FIRST GEN (no already-generated thumbnail is the work source):
- No preview output, no generator selectedImage, no stored:gi_ on ref-in.
- Write the full 7-sentence PROMPT ANATOMY below.
- Typical graph: Personnage on face-in, logos on logo-in, competitor/swipe on ref-in.
- A/B on a first gen is two (or three) COMPLETE alternative prompts — different concepts or one variable — each a full 7-sentence anatomy. That is fine.

2. ADJUST / ITERATE THIS IMAGE (an already-generated thumbnail is the source — preview node, generator result, or swipeFile stored:gi_ on ref-in / ref-in-b / ref-in-c):
- Same angle. The user wants a change (text, emotion, crop, logo…).
- Do NOT rewrite the scene ("Young man in the left third, crimson curtains…"). The pixels are the prompt.
- Write a SHORT change-only prompt: 1–3 sentences. State the change first (text, emotion, color, one object), then what to preserve ("Keep the rest of the thumbnail unchanged").
- Examples: "Change the overlay to C'EST FINI ? in bold yellow. Keep face, pose, curtains, mascot, lighting." / "Same image, serious closed-mouth expression instead of shock."
- Wire that generated image on ref-in (or swipeFile kind=reference, image_source stored:gi_<id>). The generate route sends it first as the edit source (OpenAI /v1/images/edits when files are attached; OpenRouter input_references; Gemini image+text edit).
- Keep the chain: original prompt + this generation + the requested change. Narrate that path; do not invent a new scene.
- Face and logo may stay connected; do not recreate them in the prompt.
- If A/B slots are also on while iterating, each variant is still a short delta on that same source image (or per-variant refs) — short because you are iterating, not because of A/B.

Docs: OpenAI generations = text-to-image from scratch; edits = existing image + a delta ("Make the mug olive green"), not a scene essay. Gemini / OpenRouter: source image + instruction that says what to change and what to keep.`;

export const PROMPT_ANATOMY = `FROM SCRATCH ONLY — 7 sentences MAX, IN THIS ORDER (omit a line if irrelevant). Output the sentences in order, NO labels in the final prompt. Skip this block when ADJUST applies (see SCRATCH vs ADJUST).

A great thumbnail tells a STORY in one frame, with depth — the eye should travel from FOREGROUND (the action / subject) to MIDGROUND (the context that explains the action) to BACKGROUND (the world / mood). A flat photo of "person + logo on grey" is dead. A scene where the subject reacts to something HAPPENING in the midground, against a meaningful backdrop, is alive. Compose in 3 layers, then describe each layer's contents.

  SUBJECT      — Who, in the FOREGROUND. When a Personnage is connected, name them as "the person in the identity/avatar reference photos" — never a generic "Young man" / "Young woman". Then pose (physically realistic) and facial expression decomposed (e.g. "mouth wide open, eyes round, eyebrows raised" not "shocked"). Outfit/context if it matters. The subject is what the viewer sees first.
  SCENE        — What is HAPPENING around the subject. Describe the MIDGROUND (secondary action / context elements 2-4 meters behind the subject — a screen lighting up, a product mid-fall, a comparison element, a reaction to something) AND the BACKGROUND (the location / atmosphere — studio with neon signs, messy desk with monitors, dark void with particle haze, cinematic cityscape blur). Skipping this line gives a flat portrait; including it gives a story.
  COMPOSITION  — Pick ONE valid framing: extreme close-up | close-up | medium close-up | medium shot | medium full shot | full shot | wide shot. Optionally a medium shot with action (the subject doing something with the hero object). Then position of the subject in the frame (left third / centered / right third) using the rule of thirds. State explicitly that the midground is "behind subject, slightly out of focus" and background is "deep, blurred to bokeh" if you want depth-of-field separation between the 3 planes.
  OBJECTS      — At most 3 elements in total, the hero included. Each object with relative size as a % of frame + exact position + which plane (foreground / midground / background). Ex: "Claude logo (orange 8-pointed star, 14% frame) center-left, foreground, glowing with soft halo."
  TEXT         — 0 to 4 words (max 20 characters) in the requested language, ALL CAPS, bold sans-serif, color + position + "thick black outline" + size as % frame height. Omit ENTIRELY if no text overlay. When the text is added afterwards (overlay mode), write instead: "leave the <zone> area (<n>% of height) completely empty".
  LIGHTING     — Layered, with explicit direction PER PLANE if depth matters: "warm orange key light on subject from left, cool blue rim light from behind, midground lit by ambient screen glow, background deep navy with single backlight". Pick ONE coherent lighting story; never list 3 random lighting words.
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
- ALL CAPS in the prompt itself. "MUST", "IMPORTANT", "CRUCIAL" — pure noise. The model doesn't read emphasis. The generate route already appends an IDENTITY / AVATAR block that names which input_references slots are the face.
- "Young man" / "Young woman" / "a guy" when a Personnage is connected — that describes a stock extra and the model invents a new head. Name "the person in the identity/avatar reference photos". Do not dump "preserve face fidelity" into the 7 sentences; OpenRouter has no per-image role field, so identity is (1) that subject phrase plus (2) the route's role block.
- More than 2 quality boosters. "ultra-detailed, 8K, sharp focus, masterpiece, trending on artstation, award-winning, hyperrealistic" — only the first 2 carry signal, the rest is filler that DILUTES the real instructions.
- Marketing-speak. "Optimized for CTR", "high engagement", "viral potential" — zero visual content. The model has no concept of CTR.
- "professionally", "stunning", "amazing", "beautiful" — vague qualifiers, never actionable.

INVALID FRAMING TERMS (the model will pick one randomly):
- "extreme medium shot", "ultra close-up", "super wide" — none of these exist. Use the 7 valid framings listed in COMPOSITION.`;

// ─────────────────────────────────────────────────────────────────────────
// 3. YOUTUBE-SPECIFIC PATTERNS — what makes a thumbnail clickable
// ─────────────────────────────────────────────────────────────────────────

export const YOUTUBE_THUMBNAIL_PATTERNS = `YOUTUBE-THUMBNAIL-SPECIFIC PATTERNS:

COLOR PALETTE
- High saturation + high contrast. Mobile preview is 168×94 px — subtle gradients vanish.
- Background should differ STRONGLY from white (YouTube's default UI). Dark backgrounds (deep navy #0F172A, charcoal #1A1A1A, deep purple #2E1065) make warm subjects pop.
- 1 dominant color (60% of frame) + 1 accent (30%) + 1 highlight (10%). Don't list 5 colors — pick a hierarchy.
- Branded thumbnails: anchor on the brand's signature color (Claude orange ~#D97706, Figma's purple ~#7C3AED, etc.).

COMPOSITION
- One focal subject, identifiable in under a second at 168×94 px, and at most 3 elements, the hero included.
- Subject occupies 50-70% of frame for face-forward thumbnails — leave room for context but the face must dominate.
- Rule of thirds: subject on left third or right third with text/objects on the opposite third creates tension. Centered subject = static, less click.
- Empty/blurred space behind the subject so text is legible without competing with the background.

TEXT
- 0 to 4 words (max 20 characters), legible at 168×94 px. It complements the video title — never repeats it — and never promises what the video doesn't deliver.
- Bold sans-serif (Anton, Bebas Neue, Inter Black, Bangers feel). Italic / thin / serif = unreadable small.
- Thick black outline (3-5% of text height). Yellow/white/red are the highest-contrast colors against dark backgrounds.
- Position: top-left or bottom-right (avoid YouTube's UI overlays in bottom-right).

FACE PRESENCE
- Use a face when the competing thumbnails of this topic show faces working; go faceless when they are dominantly faceless.
- Match the emotion to the promise: surprise for "this changes everything", concentration for "I tested it", curiosity for "the hidden feature". Keep it moderate by default (mouth closed); an open-mouth shock only when the angle really calls for it.`;

// ─────────────────────────────────────────────────────────────────────────
// 4. MODEL SELECTION — pick deliberately based on what dominates
// ─────────────────────────────────────────────────────────────────────────

export const MODEL_SELECTION_GUIDE = `MODEL SELECTION — pick deliberately based on the dominant element of your design:

  nano-banana (Gemini 3.1 Flash Image) — DEFAULT. Fast, cheap (~$0.02/image), natural composition, good with faces. Use unless another model fits better.
  openai (GPT Image)                    — Most reliable TEXT rendering (accents, more than 2 words) and clean tech / product / UI compositions.
  seedream (Seedream 4.5)               — Best identity consistency when a Personnage is connected and the thumbnail has no text.

Thumbnail text with accents or more than 2 words → openai. A Personnage and no text → seedream. Otherwise → nano-banana. Don't agonize.`;

// ─────────────────────────────────────────────────────────────────────────
// 5. WORKED EXAMPLE — show the format in action
// ─────────────────────────────────────────────────────────────────────────

export const WORKED_EXAMPLE = `WORKED EXAMPLE — package "Claude remplace Figma ?" (title "J'ai remplacé Figma par Claude pendant 7 jours", thumbnail text "ADIEU ?"), with the user's Personnage connected. 3 elements: the man (hero), the Claude logo, the cracked Figma logo.

The person in the identity/avatar reference photos in the right third of the foreground, eyebrows raised and eyes slightly narrowed in skeptical surprise, mouth closed, head tilted slightly left, one hand raised toward the Claude logo.
Behind him in the midground, a large Figma logo cracks into a few glowing orange shards; further back, a dark design studio with purple wall accents fades into bokeh.
Medium shot with action, subject occupies the right 45% of the frame; midground slightly out of focus; background blurred to soft bokeh.
Claude logo (orange 8-pointed star, 14% frame) glowing just above his raised hand, foreground. Cracked Figma logo (18% frame) midground left, behind the subject's shoulder.
"ADIEU ?" in white bold sans-serif, top-left corner, thick black outline, 18% frame height.
Warm orange key light on the subject from the left, cool blue rim light from behind, background deep navy.
photorealistic, cinematic.

Notice: 7 sentences, no labels, exactly 3 elements (hero included) and nothing else in the frame, a moderate emotion with the mouth closed, a 1-word text that shares no word with the title and adds what it leaves unsaid, lighting layered per plane, style is 2 words. THIS is the bar.`;

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

When you call generate_sketch OR fill in the prompt node of apply_workflow / place_node:

${SCRATCH_VS_ADJUST}

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
  return `Tu es un ingénieur prompt spécialisé en génération d'images IA pour les miniatures YouTube. Tu corriges et structures les prompts pour qu'ils soient précis, sans contradiction, et optimaux pour les modèles de diffusion (Gemini, GPT Image, Seedream).

## TON TRAVAIL
L'utilisateur te donne une description brute. Tu la transformes en prompt structuré, COHÉRENT et SANS AMBIGUÏTÉ.

Deux intentions seulement. Première génération (pas d'aperçu déjà généré comme source) : anatomie 7 phrases. A/B = deux prompts complets, pas une raison de raccourcir. Itération sur une miniature déjà générée (changer le texte, l'émotion, une couleur, « garde le reste ») : prompt d'édition court (1–3 phrases : le changement d'abord, puis ce qui reste). Ne réécris pas toute la scène.

${PROMPT_ANATOMY}

${ANTI_CONTRADICTION_RULES}

${YOUTUBE_THUMBNAIL_PATTERNS}

## TEXTE OVERLAY
- Si demandé : 0 à 4 mots (20 caractères au plus) en ${lang}, MAJUSCULES, complémentaires du titre de la vidéo, couleur + position + "thick black outline" + taille en % de l'image.
- Si pas demandé : OMETS la ligne TEXT entièrement.

## FORMAT DE SORTIE
Réponds avec au maximum 7 phrases (omets celles qui ne s'appliquent pas), une par ligne, dans l'ordre SUBJECT → SCENE (foreground/midground/background) → COMPOSITION → OBJECTS → TEXT → LIGHTING → STYLE. La phrase SCENE est essentielle pour donner une histoire à la miniature — ne l'omets que si l'utilisateur a explicitement demandé un portrait flat. Pas de labels, pas de markdown, pas de préambule. Juste les phrases brutes.`;
}

