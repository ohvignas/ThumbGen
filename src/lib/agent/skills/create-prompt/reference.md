# Image prompt anatomy (ThumbGen)

Durable rubric for `/create-prompt`. Same rules as `src/lib/prompt-engineering.ts` (Améliorer, agent system block). Diffusion models used here: nano-banana (Gemini Flash Image), GPT Image, Seedream — not Midjourney/Flux syntax.

## Do

- At most 7 unlabeled sentences, order: SUBJECT → SCENE → COMPOSITION → OBJECTS → TEXT → LIGHTING → STYLE. Omit a line if irrelevant.
- Tell a story in three planes: foreground subject, midground action/context, background mood. Skip SCENE only for an explicit flat portrait.
- One valid framing: extreme close-up | close-up | medium close-up | medium shot | medium full shot | full shot | wide shot.
- Subject on a third (left/center/right). Midground slightly out of focus; background bokeh if depth is wanted.
- ≤3 elements including the hero. Each: size % of frame, position, plane.
- Thumb text: 0–4 words, ≤20 characters, complements the title, never repeats it, never promises what the video does not deliver. ALL CAPS + bold sans + thick black outline + color + % height. Omit the TEXT sentence if none.
- Lighting: one coherent story, direction per plane.
- Style: two descriptors max (`photorealistic, cinematic`).
- YouTube: high saturation/contrast (168×94). Dark ground vs YouTube white (`#0F172A`, `#1A1A1A`). Face-forward: subject ~50–70%. Text yellow/white/red on dark; avoid bottom-right UI.
- Face as features, mouth closed by default; open-mouth shock only when the angle needs it.

## Do not

- ALL CAPS emphasis in the prompt (`MUST`, `IMPORTANT`) — noise for diffusion.
- CTR / viral / "high engagement" marketing speak — not visual.
- More than two quality tokens (`8K`, `masterpiece`, `trending on artstation`, `hyperrealistic` piles).
- "preserve face fidelity" / "exact same person" — identity is the Personnage ref, not tokens.
- Vague qualifiers: professionally, stunning, amazing, beautiful.
- Invalid framings: ultra close-up, extreme medium shot, super wide.
- Medium shot + giant logo beside a torso (no room). Use wide or full for subject-left + logo-right.
- Shallow DoF with two sharp depths — pick one plane or say deep focus.
- Impossible poses (three phones + arms crossed). One body-possible pose.
- More than 3 elements, or a fourth "small" logo "just in the corner".

## Model hint (do not generate)

Only if they later add a generator: openai when thumb text has accents or >2 words; seedream with a Personnage and no text; else nano-banana. This skill does not place a generator and does not click Générer.

## Worked bar

Title « J'ai remplacé Figma par Claude pendant 7 jours », thumb text « ADIEU ? », 3 elements (man, Claude logo, cracked Figma):

Young man in the right third of the foreground, eyebrows raised and eyes slightly narrowed in skeptical surprise, mouth closed, head tilted slightly left, one hand raised toward the Claude logo.
Behind him in the midground, a large Figma logo cracks into a few glowing orange shards; further back, a dark design studio with purple wall accents fades into bokeh.
Medium shot with action, subject occupies the right 45% of the frame; midground slightly out of focus; background blurred to soft bokeh.
Claude logo (orange 8-pointed star, 14% frame) glowing just above his raised hand, foreground. Cracked Figma logo (18% frame) midground left, behind the subject's shoulder.
"ADIEU ?" in white bold sans-serif, top-left corner, thick black outline, 18% frame height.
Warm orange key light on the subject from the left, cool blue rim light from behind, background deep navy.
photorealistic, cinematic.

## Negative prompt (optional node field)

`blurry, low resolution, watermark, signature, distorted hands, extra fingers, deformed face, garbled text, misspelled letters, low contrast, washed out, generic stock photo, multiple subjects when one is asked, awkward pose, unnatural skin tone, jpeg artifacts`
