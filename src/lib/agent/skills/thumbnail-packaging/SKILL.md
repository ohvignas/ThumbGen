---
name: thumbnail-packaging
description: Packages a new YouTube thumbnail — promise, title plus 0–4 words of thumb text that complements the title, A/B that really differ, 1 focal, ≤3 elements, 168×94. Load when creating a new thumbnail (Aide-moi à construire la miniature, fais-moi une miniature, propose-moi des idées) before sketches or canvas, not when editing an existing workflow.
---

# thumbnail-packaging

YouTube title + thumbnail packaging for a **new** miniature. Not a numbered interview. **Gather only what you lack.** Deduce the rest. Skip any tool the user already covered. Trust `<thumbnail_brief>` over chat history for those fields.

Do **not** mention a 7-step pipeline, run STEPS 1–7, write « Until then », or send leftover `step` on `ask_user` / `update_brief`. `ask_user.step` is ignored leftover — omit it.

Existing canvas they want looked at, completed, or changed → `read_skill existing-workflow`. This skill is for a **new** thumbnail.

## When

- Start button / « Aide-moi à construire la miniature de ma vidéo. », « fais-moi une miniature », « propose-moi des idées »
- They give a topic, script, or YouTube link and want packages (title + thumb)
- Before the first `generate_sketch` or canvas write of a new design

## When not

- `<canvas_state>` has nodes **and** the ask is about **that** workflow (« améliore », « change le fond », « remplace le texte ») → `existing-workflow`
- You already loaded this skill this conversation and the packages/cards are in the brief — act, don't re-read
- Dumping `list_followed_videos` as the first question of a new video (ask what **this** video is about)

## Promise

Need a result-oriented **promise** ≤ 90 characters: what the viewer can **do or understand** at the end. Also keep `video.subject` ≤ 300, `audience` ≤ 120 (from `<channel_profile>`, else deduced).

If they pasted a YouTube URL or picked `youtube:<id>` / `[videoId]`: `extract_youtube_script` with a full `https://www.youtube.com/watch?v=` URL. Distill subject + promise from the **spoken** body. Thumbnail text must not promise what that script does not deliver. Do not paste the transcript in chat.

If you still don't know the video: `ask_user` free question (`options: []`, `allow_skip: false`), omit `step`:

> De quoi parle la vidéo, et qu'est-ce que le spectateur saura faire ou comprendre à la fin ?

Then `update_brief` `video: { subject, promise, audience }` (and `script` = spoken body only, ≤ 8000, no header). Optional memory — not a pipeline.

## Title + thumbnail text

Each **variant** is a title + thumbnail **pair** (max 3 variants, keys A / B / C):

| Field | Limit |
|---|---|
| `title` | ≤ 60 characters, required |
| `thumbnailText` | **0 to 4 words** and ≤ 20 characters (`""` = no text) |
| `direction` | ≤ 60 — the angle in one line |
| `visualIdea` | one sentence ≤ 120 |
| `titleRole` / `thumbRole` | ≤ 80 — what each one does for the click |

**Thumbnail text rules** (the click lives in the pair, not in either line alone):

- **0 to 4 words**, max **20 characters**. Empty string = no on-image text.
- It **complements the title**, never repeats it, never promises what the video doesn't deliver.
- Brand / tool names that already sit in the title may reappear on the thumb; other overlapping content words trigger a Fiche warning — rephrase once so the text adds what the title leaves unsaid.
- Readable at **168×94 px** (YouTube mobile preview). ALL CAPS, bold sans-serif, thick black outline when rendered on-image.
- Language = thumbnail language from Réglages, not the reply language.

`update_brief` **refuses** text over 4 words or 20 characters. Fix and retry once.

## A/B must really differ

YouTube Studio « Tester et comparer » = up to 3 thumbs. One ThumbGen generator holds at most 3 variants. Default: 2 or 3 packages from the promise.

`abStrategy`:

- **`concepts`** (default) — different concepts. Never the same layout **and** the same focal subject.
- **`single-variable`** — B and C change **only** `abVariable` from A: `text` \| `emotion` \| `background` \| `hero`.

Ask only if they have not chosen: « Quelle stratégie pour le test A/B ? » — « Trouver le meilleur concept » vs « Optimiser un détail » (then which variable).

Propose 1–3 packages (`label` = direction, `description` = `Titre | Texte miniature`). `ask_user` multiple, `max_selected` 3. Write each kept package: `update_brief` `variant: { key, set: { direction, title, thumbnailText, visualIdea, titleRole, thumbRole } }` plus `abStrategy` / `abVariable`. Warnings that variants are too close: rephrase once, then go on. Don't silently pick a "best" package for them.

## Composition card

Fill a card per kept variant (`update_brief` `variant.set.composition` **replaces** the whole card). Then confirm with `ask_user` if they have not validated. Never a 4th element: if they want one, propose which to drop.

| Field | Rule |
|---|---|
| `layout` | `face-left_object-right` \| `face-right_object-left` \| `center-hero_text-top` \| `split-versus` \| `before-after` \| `screen-hero_face-corner` \| `object-hero_no-face` \| `other` (`layoutNote` ≤ 120 if `other`) |
| `focal` | one focal subject, ≤ 80, identifiable in under a second at 168×94 |
| `elements` | 1–3 total, **exactly one** `hero`, rest `support`. `what` ≤ 80. `sizePct` 5–70. Sum of sizes **≤ 110**. `position` on the 3×3 grid |
| Grid | `top-left` `top` `top-right` `left` `center` `right` `bottom-left` `bottom` `bottom-right` |
| `textZone` | `null` if no thumb text; else `position` (grid, **never the hero's cell**) + `heightPct` 12–30 |
| `background` | `solid` \| `gradient` \| `blurred-scene` \| `scene`; optional `#RRGGBB` + note ≤ 120. Differ strongly from YouTube white |
| `emotion` | **only with a Personnage** (refused if `common.persona` is `"none"`). Label: `curiosité` `surprise` `satisfaction` `inquiétude` `concentration` `déterminé`. Intensity 1–3 (default 2). Mouth `closed` by default; `open` only when the angle really calls for it |
| `palette` | `{ dominant, accent, highlight }` as `#RRGGBB`. Hierarchy ~60 / 30 / 10. Brand colors from `<channel_profile>` when present |

Refused: not exactly one hero, 4 elements, sizes over 110 %, text zone on the hero's cell, emotion without a character. Fix what `update_brief` names; retry once.

Confirm: « Variante A : \<direction\> — on valide la carte ? » with « Valider » / « Changer l'émotion » / « Changer le fond » / « Changer le texte » / « Changer le sujet focal ». Card details in option `description` (≤ 140). A change re-asks only that field, 3 options.

## Common (Personnage, style, colors, text mode)

**Faces of the creator = Personnages only.** `list_personas` → `stored:persona_<id>`. Never a selfie, upload, swipe file, sketch, YouTube thumb, or `stored:fr_*` as `faceReference` / `face_source`. Empty library: quote the tool-less French meaning (Bibliothèque → onglet Personnages) and go faceless, or wait until they created one. Channel default in `<channel_profile>` wins unless they name someone else or « aucun ».

`common.persona`: `stored:persona_<id>` or `"none"`. `common.style` ≤ 300. `common.colors` max 3 hex — take brand colors from `<channel_profile>` when filled (say so in one line); otherwise offer 2–3 style/color options. `common.textMode`: `rendered` (default, words in the image prompt) or `overlay` (leave a reserved empty zone). `common.model`: see prices below.

## When to research / logos / competitors / sketches

Call a tool **only if you still lack that input**. Caps are per conversation / fiche.

| Need | Tool | Skip when |
|---|---|---|
| Topic or named brands still fuzzy | `research_topic` (`query`, `language` fr\|en). Paid. Max **2**. `refresh: true` to redo. Sources = API citations only | User already explained; no OpenRouter key (say so, continue with names they gave) |
| Named tools/brands on the thumb | `list_logos` first. Hits → keep the obvious one or `ask_user` « Quels logos garder ? » (`image: stored:lg_<id>`, `max_selected` 3). Miss → `find_logos` then `add_logo` `{ candidate_id }` → `stored:lg_<id>`. Max **3** logos on the brief | They said no logo; already have the refs |
| What works in the niche | After you know the topic: `find_competitor_thumbnails` (`query_fr` + `query_en`, max **2** searches) then `analyze_thumbnails` on those ids. Two-line summary: « Ce qui marche : … / Ce que tout le monde fait (à éviter) : … ». Optional refs: `ask_user` « Lesquelles garder en référence ? » (`max_selected` 3, skip allowed) then `import_youtube_thumbnail` for chosen ids only (max **3** refs) | They forbid competitors; no YouTube key (say so). Do **not** open a new video with `list_followed_videos` |
| Spoken content of **this** video | `extract_youtube_script` | Unpublished / no captions / they already pasted the script |
| Cheap composition draft | `generate_sketch` — see Sketches | Idea still empty; they want the **final** image |

Do not research "to have context" on a clear topic. Do not import 12 competitor thumbs. `find_logos` returns `logo-candidate:` — never wire that; `add_logo` first.

## Sketches

Optional. Show a layout once packages + a focal exist. Load `generate_sketch` before the first call.

- Prompt you write (PROMPT ANATOMY). `face_source: "stored:persona_<id>"` when they appear. Logos in `reference_sources`. Default `style: "pencil_sketch"`, `aspect_ratio: "16x9"`.
- One draft per kept package, then talk. Retouch = new prompt, same face/refs. Not the published thumb.
- Cap (fiche only): `2 × max(1, variants.length) + 3`. Past the limit: one sentence, offer to ship the canvas **without** another sketch. No brief → unguarded but still ~$0.02 — stay stingy.
- Record: `variant.set.sketch: { source: "generated:sk_<id>", status: "pending", autoFixed: false }`.
- Show via `finish_turn.results` with that call's `result_id`. Never `ask_agent` that would start a paid generation.

## PROMPT ANATOMY

When you call `generate_sketch` **or** fill a prompt node: **at most 7 sentences**, this order, **no labels** in the prompt. Omit a line if irrelevant. A great thumb is a story in one frame (foreground action → midground context → background mood). Flat "person + logo on grey" is dead.

1. **SUBJECT** — foreground who. Realistic pose. Face decomposed (« mouth closed, eyes slightly narrowed », not « shocked »). Outfit if it matters.
2. **SCENE** — midground happening + background place/mood. Skip only for an explicit flat portrait.
3. **COMPOSITION** — **one** valid framing: `extreme close-up` \| `close-up` \| `medium close-up` \| `medium shot` \| `medium full shot` \| `full shot` \| `wide shot`. Subject left / center / right third. Midground slightly out of focus; background bokeh if you want depth. Invalid: « ultra close-up », « extreme medium shot », « super wide ».
4. **OBJECTS** — ≤3 elements **including the hero**. Each: % of frame + grid/position + plane. Ex: `Claude logo (orange 8-pointed star, 14% frame) center-left, foreground.`
5. **TEXT** — 0 to 4 words (max 20 characters), requested language, ALL CAPS, bold sans-serif, color + position + « thick black outline » + size as % frame height. **Omit the line** if no overlay. `textMode: "overlay"`: write `leave the <zone> area (<n>% of height) completely empty` instead.
6. **LIGHTING** — one coherent story, direction per plane. Never three random lighting words.
7. **STYLE** — **2 descriptors max** (`photorealistic, cinematic`). More = noise.

Anti-contradiction: medium shot has no room for a giant logo beside a torso — use wide/full for subject-left + logo-right. Shallow DoF = one sharp plane. Pose must be anatomically possible.

Anti-noise (do **not** put in the prompt): ALL-CAPS emphasis, « preserve face fidelity » (that's `face_source`), CTR/viral marketing, 8K/masterpiece piles, « professionally/stunning ».

YouTube: high saturation + contrast (168×94 kills subtle gradients). Dark grounds (`#0F172A`, `#1A1A1A`) make warm subjects pop. Face 50–70% on face-forward thumbs. Text: yellow/white/red on dark; avoid YouTube UI in the bottom-right.

**Worked bar** — title « J'ai remplacé Figma par Claude pendant 7 jours », thumb text « ADIEU ? », 3 elements (man hero, Claude logo, cracked Figma): seven unlabeled sentences, moderate closed mouth, 1-word text that shares no word with the title, lighting per plane, style is two words.

## Model + prices

Pick from `nano-banana` \| `openai` \| `seedream` (not ideogram / grok). Don't agonize:

- Thumb text with **accents** or **more than 2 words** → `openai`
- Personnage connected and **no** text → `seedream`
- Else → `nano-banana` (default)

Prices for **16×9, one image per variant** (labels as the app writes them):

- nano-banana — Gemini 3.1 Flash — "Nano Banana · ~0,02 $ / image"
- openai — GPT Image 2.5 Sunburst (précis) — "GPT Image · ~0,05 $ / image"
- seedream — Seedream 4.5 (ByteDance) — "Seedream · ~0,02 $ / image"

Sketches are always Flash Image ~$0.02, n=1, 1K — not this table. Final run bills only when **they** click « Générer ».

## place_node vs apply_workflow

| Need | Tool |
|---|---|
| One variant, live `iv-*` nodes | `place_node` (one node per call; several `place_node` in one model step OK). Ids: `iv-prompt`, `iv-persona`, `iv-ref-1..3`, `iv-logo-1..3`, `iv-generator`. **No `abTest`** on `iv-generator` |
| Two or three packages / A/B/C | **`apply_workflow`** — one generator `data.abTest: { variants: ["A","B"] }` or `{ variants: ["A","B","C"] }`. Never two generators « to compare ». `place_node` cannot do this graph |
| Precise edit of an existing non-interview canvas | `existing-workflow` then `apply_workflow` with **only** changed/added nodes |
| Start paid generation | `finish_turn` `next_actions: [{ kind: "generate", node_id }]` — not these tools |

Never the same model step as `ask_user` or `finish_turn`. `finish_turn` last, alone.

**One variant (`place_node`):** `iv-prompt` with the final 7-sentence prompt (`rendered`: exact words in quotes + font + color + outline + % height; `overlay`: reserved empty zone) → optional `iv-persona` / `iv-logo-*` / `iv-ref-*` → `iv-generator` (`model`, `aspectRatio: "16x9"`, `count` 1 unless they ask). Then `finish_turn` `node_id: "iv-generator"`.

**A/B (`apply_workflow`):** one generator; shared Personnage → `face-in`; each logo → `logo-in` (do not clone per variant); own prompt every variant → `prompt-in` / `prompt-in-b` / `prompt-in-c`; sketches/refs only when they differ → `sketch-in` / `ref-in` (+ `-b` / `-c`). Count is per variant. After apply: one click produces Aperçu « Variante A » / « Variante B » (/ C). Don't pick a winner.

Load `place_node` or `apply_workflow` before the first use of that tool.

## iv-* keep or wipe — only if they ask

If `<canvas_state>` already has `iv-prompt` / `iv-persona` / `iv-ref-*` / `iv-logo-*` / `iv-generator` (or any other nodes):

- **Keep** them. Reuse ids. `apply_workflow` merges: omitted nodes stay. `place_node` updates an existing `iv-*` id in place.
- **Wipe / delete** (`apply_workflow` `remove_node_ids` listing those ids, empty blueprint) **only when the user explicitly asks** (« repartir de zéro », « supprime les nœuds », « recommence le canvas »). Never invent a restart. Never delete non-`iv-*` nodes they built unless they asked.
- Do **not** auto-ask « Reprendre l'interview / Repartir de zéro » as a pipeline gate. If they want a new thumbnail on a canvas that already has interview nodes, keep going on those nodes unless they say to clear them.

## Générer is their click

Never generate the final image yourself. Never `ask_agent` that would start a paid run.

After the workflow is on the canvas: `finish_turn` with `summary` 1–2 sentences (≤ 400), `next_actions: [{ "kind": "generate", "node_id": "<generator>" }]`. The app writes the « Générer » label and cost. **Only their click** starts it.

`finish_turn` every turn, last, alone. `ask_user` / `request_user_image` pause the turn — finish after they answer.

## Fiche (`update_brief`)

Optional memory the user edits in « Fiche ». Send **only what changed**. Objects merge field by field; `logos` / `references` replaced whole; variant merged by `key`; `set.composition` / `set.sketch` replace that whole object. Omit `step`. Invalid brief → reasons, fix once. Warnings (text repeating the title, variants too close) → rephrase once, continue.

## Flexible flow (not a script)

Use as a checklist in your head — skip any row you already have:

- **Video** — promise / script / URL → extract or one free question
- **Research** — only if the topic or brands are still unclear (max 2)
- **Logos** — named brands: library then find/add (max 3)
- **Competitors** — optional, after the topic is known (max 2 searches, max 3 refs)
- **Packages** — 1–3 title + 0–4-word thumb pairs that really differ; A/B strategy
- **Common** — Personnage (`list_personas` or none), style/colors, textMode
- **Cards** — 1 focal, ≤3 elements, one hero, text zone off the hero cell
- **Sketches** — optional cheap drafts, then talk
- **Canvas** — `place_node` (one variant) or `apply_workflow` (A/B); keep `iv-*` unless they asked to wipe
- **Close** — `finish_turn` kind `generate`; they click **Générer**

`ask_user` only for a real remaining choice. Deduce brand colors, audience, and obvious single logos. Be concise. Don't dump JSON.

## Example

User: « Miniature : j'ai remplacé Figma par Claude pendant 7 jours. »

You already know the promise. Skip research. `list_logos` → Claude (keep) ; Figma missing → `find_logos` / `add_logo`. `list_personas` → channel default. Propose two **concepts** packages, e.g. title « J'ai remplacé Figma par Claude pendant 7 jours » + thumb « ADIEU ? » vs a different layout/focal (not the same card with a synonym). One `ask_user` on packages if both are plausible; otherwise keep both for A/B.

Cards: exactly one hero, ≤3 elements, text zone not on the hero. Optional pencil sketches. Then `apply_workflow` one generator `abTest: { variants: ["A","B"] }`, shared face + logos, two prompts. `finish_turn` `kind: "generate"` on that generator.

If they had said « remplace le texte par X » on an existing graph: do **not** follow this skill — `existing-workflow`.
