---
name: create-prompt
description: Writes a tight YouTube/diffusion image prompt and places or updates a prompt node on the canvas (iv-prompt or the existing uuid prompt). Use when the user types /create-prompt or /create-propt, or asks to create a prompt, nœud prompt, image prompt, prompt miniature, or fill the prompt node — not to sketch, not to click Générer.
---

# create-prompt

Write a **tight image prompt**, then put it on the open canvas as a **prompt node**. In-app slash: **/create-prompt** (typo **/create-propt** is the same skill). This is not a croquis and not the paid thumbnail.

There is no numbered interview. Do not mention a 7-step journey. Reply in the user's language (French if they write French). Thumb overlay **text** uses the thumbnail language from Réglages; the rest of the prompt stays visual English (diffusion).

The system block already has THUMBNAIL PROMPT ANATOMY — follow it. Full anti-patterns and the worked bar: [reference.md](reference.md).

## When

- `/create-prompt` or `/create-propt`, with or without an idea after the slash.
- "écris le prompt", "create prompt", "nœud prompt", "image prompt", "remplis le prompt".
- They want the generator's prompt filled, not a sketch and not a full packaging interview.

## When not

- **Croquis / esquisse** → skill `generate_sketch` (`/croquis`).
- **New thumbnail from scratch** (titles, first-gen A/B packs, promise) → `thumbnail-packaging` (full 7-sentence anatomy; A/B = two complete prompts).
- **Iterate an already-generated thumb** (preview / `stored:gi_` on ref-in) → still this skill for the prompt text, but write a **short edit prompt** (see below), not a scene recreation. Vague look/improve of the graph → `existing-workflow`.
- **Click Générer / paid run / croquis** — never this skill. No `next_actions` at all (`[]`). No `kind: "generate"`. No `generate_sketch`. A generator already on the canvas is not a reason to offer « Générer ».
- Same model step as `ask_user` or `finish_turn`.

## Empty idea

If the slash remainder (and canvas/brief) still lack a video topic **or** a focal subject: `ask_user` **alone** this turn (`options: []`, `allow_skip: false`). One question, e.g. « De quoi parle la vidéo, et qui ou quoi est au premier plan ? » Do **not** call `place_node`, `apply_workflow`, or `finish_turn` in that step. After they answer, continue this skill.

Deduce the rest (framing, 0–4 word thumb text, dark ground). Do not run a questionnaire.

## Write the prompt

**Mode** — two intents only. Look at the canvas before writing. A/B is variant slots (`prompt-in` / `prompt-in-b`), never the reason to shorten.

- **SCRATCH / FIRST GEN** — no preview / generator output / `stored:gi_` on `ref-in`. Full 7-sentence anatomy below. First-gen A/B = two complete 7-sentence prompts.
- **ITERATE / ADJUST THIS IMAGE** — a generated aperçu is (or will be) the edit source on `ref-in` / `ref-in-b` / `ref-in-c`. Same angle. **1–3 sentences only.** Change first (text, emotion, color, one object), then "Keep the rest of the thumbnail unchanged." Do **not** describe the person, curtains, logo, framing, or lighting again. Keep the chain: original prompt + this generation + the requested change. Wire that image as the ref (preview edge or swipeFile `stored:gi_<id>`). Short because you are iterating, not because A/B is on.

### FROM SCRATCH — 7 sentences

At most **7 sentences**, this order, **no labels**. Omit a line if irrelevant. Story in 3 planes (foreground action → midground context → background mood). Flat "person + logo on grey" is dead.

1. **SUBJECT** — If a Personnage is connected or they are in the thumb: **"the person in the identity/avatar reference photos"** (pose + decomposed expression). Never a generic "Young man" / "Young woman". Outfit if it matters.
2. **SCENE** — midground happening + background place/mood.
3. **COMPOSITION** — one of: extreme close-up | close-up | medium close-up | medium shot | medium full shot | full shot | wide shot. Subject left / center / right third. Midground slightly out of focus; background bokeh if depth is wanted.
4. **OBJECTS** — ≤3 elements including the hero. Each: % of frame, position, plane.
5. **TEXT** — 0–4 words, ≤20 characters, ALL CAPS, bold sans, color + position + thick black outline + % height. Omit the line if none. Overlay mode: leave that zone empty. Avoid YouTube UI in the bottom-right.
6. **LIGHTING** — one coherent story, direction per plane.
7. **STYLE** — 2 descriptors max (`photorealistic, cinematic`).

Do **not** put in the prompt: ALL-CAPS emphasis, CTR/viral speak, 8K/masterpiece piles, "preserve face fidelity" (the generate route appends the IDENTITY / AVATAR lock), "professionally/stunning", invalid framings (`ultra close-up`). Medium shot cannot hold a giant logo beside a torso — use wide/full. Pose must be anatomically possible. Optional `negativePrompt`: `blurry, low resolution, watermark, signature, distorted hands, extra fingers, deformed face, garbled text, misspelled letters, low contrast, washed out, generic stock photo`.

### ITERATE / ADJUST — short edit

Examples: `Change the overlay to "C'EST FINI ?" in bold yellow. Keep face, pose, curtains, mascot, lighting.` / `Same image, serious closed-mouth look instead of shock.` Optional negative stays the usual artifacts list.

## Place the node

`read_skill place_node` (and `apply_workflow` if needed) before the first call of that tool.

Target, first match:

1. The prompt they named, or the **selected** prompt (`selected: true` on `<canvas_state>`).
2. Existing **`iv-prompt`**.
3. Else **create** `iv-prompt`.

| Target | Tool |
|---|---|
| `iv-prompt` (create or rewrite) | `place_node` `{ "node": { "id": "iv-prompt", "type": "prompt", "data": { "prompt": "<first gen: 7 sentences | iterate: short delta>", "negativePrompt": "<optional>" } } }` |
| Other prompt id (`prompt-1`, `prompt-a`, …) | `apply_workflow` — only that node: `{ "nodes": [{ "id": "<id>", "type": "prompt", "data": { "prompt": "…" } }], "edges": [] }`. `project_id` from `<project_id>`. Omit = keep. |

Do not add a generator. Do not delete nodes. Do not dump JSON to chat.

## Close

`finish_turn` last, **alone**: 1–2 sentence `summary` (the prompt is on the canvas). **`results: []`. `next_actions: []`.**

Do **not** ask what to do next. No `ask_user` after placing. No `ask_agent`. No `focus_node`. No `kind: "generate"`. No « Et maintenant ». Never `generate_sketch`. Never click **Générer**. Stop. The chat already shows the prompt from `place_node` / `apply_workflow`.

## Examples

**Bare `/create-prompt`** — idea empty. `ask_user` free question about the video + focal subject. Stop.

**`/create-prompt moi à droite, logo Claude, texte ADIEU ?`** — 7-sentence prompt (the person in the identity/avatar photos, right third, Claude left, medium shot with action, "ADIEU ?" top-left, orange key / navy ground, photorealistic cinematic). `place_node` `iv-prompt`. `finish_turn` `{ "summary": "…", "results": [], "next_actions": [] }`.

**Canvas has a generated preview on `ref-in`, they said "améliore cette miniature / plus sérieux, texte C'EST FINI ?"** — iterate: short edit prompt only + that image as source. Narrate original prompt + this gen + the change. Do not rewrite "Young man in the left third…". `finish_turn` with empty `next_actions`.

**Canvas has `prompt-1`, they said "remplace le prompt, plus de contraste"** — if no generated thumb is the work source, full anatomy (first gen, A/B = two full prompts); if a generated aperçu is the source, keep it a short delta. `apply_workflow` that id only. `finish_turn` with empty `next_actions`.
