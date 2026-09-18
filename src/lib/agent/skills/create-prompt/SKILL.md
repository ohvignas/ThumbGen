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
- **New thumbnail from scratch** (titles, A/B packs, promise) → `thumbnail-packaging`.
- **Vague edit of a full existing graph** ("améliore", "regarde") → `existing-workflow`.
- **Click Générer / paid run** — never. No `next_actions` kind `generate`. No `generate_sketch` unless they ask for a croquis after.
- Same model step as `ask_user` or `finish_turn`.

## Empty idea

If the slash remainder (and canvas/brief) still lack a video topic **or** a focal subject: `ask_user` **alone** this turn (`options: []`, `allow_skip: false`). One question, e.g. « De quoi parle la vidéo, et qui ou quoi est au premier plan ? » Do **not** call `place_node`, `apply_workflow`, or `finish_turn` in that step. After they answer, continue this skill.

Deduce the rest (framing, 0–4 word thumb text, dark ground). Do not run a questionnaire.

## Write the prompt

At most **7 sentences**, this order, **no labels**. Omit a line if irrelevant. Story in 3 planes (foreground action → midground context → background mood). Flat "person + logo on grey" is dead.

1. **SUBJECT** — foreground who. Realistic pose. Face as features ("mouth closed, eyes slightly narrowed"), not "shocked". Outfit if it matters.
2. **SCENE** — midground happening + background place/mood.
3. **COMPOSITION** — one of: extreme close-up | close-up | medium close-up | medium shot | medium full shot | full shot | wide shot. Subject left / center / right third. Midground slightly out of focus; background bokeh if depth is wanted.
4. **OBJECTS** — ≤3 elements including the hero. Each: % of frame, position, plane.
5. **TEXT** — 0–4 words, ≤20 characters, ALL CAPS, bold sans, color + position + thick black outline + % height. Omit the line if none. Overlay mode: leave that zone empty. Avoid YouTube UI in the bottom-right.
6. **LIGHTING** — one coherent story, direction per plane.
7. **STYLE** — 2 descriptors max (`photorealistic, cinematic`).

Do **not** put in the prompt: ALL-CAPS emphasis, CTR/viral speak, 8K/masterpiece piles, "preserve face fidelity", "professionally/stunning", invalid framings (`ultra close-up`). Medium shot cannot hold a giant logo beside a torso — use wide/full. Pose must be anatomically possible. Optional `negativePrompt`: `blurry, low resolution, watermark, signature, distorted hands, extra fingers, deformed face, garbled text, misspelled letters, low contrast, washed out, generic stock photo`.

## Place the node

`read_skill place_node` (and `apply_workflow` if needed) before the first call of that tool.

Target, first match:

1. The prompt they named, or the **selected** prompt (`selected: true` on `<canvas_state>`).
2. Existing **`iv-prompt`**.
3. Else **create** `iv-prompt`.

| Target | Tool |
|---|---|
| `iv-prompt` (create or rewrite) | `place_node` `{ "node": { "id": "iv-prompt", "type": "prompt", "data": { "prompt": "<7 sentences>", "negativePrompt": "<optional>" } } }` |
| Other prompt id (`prompt-1`, `prompt-a`, …) | `apply_workflow` — only that node: `{ "nodes": [{ "id": "<id>", "type": "prompt", "data": { "prompt": "…" } }], "edges": [] }`. `project_id` from `<project_id>`. Omit = keep. |

Do not add a generator. Do not delete nodes. Do not dump JSON to chat.

## Close

`finish_turn` last, **alone**: 1–2 sentence `summary` (the prompt is on the canvas). Optional `focus_node` on that prompt id. Optional `ask_agent` ("Dessine un croquis", "Ajoute le générateur"). **Never** `kind: "generate"`. Never click **Générer**.

## Examples

**Bare `/create-prompt`** — idea empty. `ask_user` free question about the video + focal subject. Stop.

**`/create-prompt moi à droite, logo Claude, texte ADIEU ?`** — 7-sentence prompt (man right third, Claude left, medium shot with action, "ADIEU ?" top-left, orange key / navy ground, photorealistic cinematic). `place_node` `iv-prompt`. `finish_turn` with `focus_node: "iv-prompt"`.

**Canvas has `prompt-1`, they said "remplace le prompt, plus de contraste"** — `apply_workflow` that id only. `finish_turn`.
