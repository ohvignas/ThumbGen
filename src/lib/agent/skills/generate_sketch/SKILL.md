---
name: generate_sketch
description: Generates a cheap OpenRouter Gemini Flash Image draft (~$0.02, pencil by default) to show composition before the user clicks Générer. Use when a layout/angle is ready to discuss; not the final thumbnail, not an empty idea, not a retry loop. Pass face_source stored:persona_<id> when their face is in the sketch.
---

# generate_sketch

Paid **draft** on OpenRouter (`google/gemini-3.1-flash-image`, ~$0.02, 1K, n=1). Default is a rough pencil croquis so you can debate layout without committing. It is never the finished YouTube thumbnail — that starts only when the user clicks **Générer** on a canvas generator.

Load this skill before the first sketch in a conversation. Do not mention a 7-step journey.
In-app slash: **/croquis** (same skill — do not invent a second sketch workflow). When invoked that way and the idea is empty, brainstorm with them first, then sketch.

## When

- A composition is clear enough to show (subject, framing, 1–3 elements) and you want a cheap visual to discuss.
- The user asks for a croquis / esquisse / direction visuelle / "montre-moi à quoi ça ressemble".
- One draft per kept package (A, then B, then C) after packages exist — not before you know what the video is about.
- A retouch of one variant after they reject a specific sketch (new prompt, same `face_source` / refs).

## When not

- **Final thumbnail.** Never treat this output as the published image. Do not call it to "generate for real". Ship a generator with `apply_workflow` / `place_node` and `finish_turn` next_action kind `generate`. Only their click on **Générer** starts that paid run.
- **Empty idea.** If you still lack the video topic or a focal subject, ask first (`ask_user` / `thumbnail-packaging`). Do not burn a sketch on "quelque chose de clic".
- **Retry loops.** One or two sketches, then talk. History may replace the image with a placeholder — that is **not** an invitation to regenerate; the `generated:sk_<id>` line above it stays valid.
- **Creator face from a selfie / upload / swipe-file.** Faces are Personnages only. Never pass `uploaded:`, `stored:sf_`, or `stored:gi_` as `face_source`.
- **`style: "polished"` as a fake final.** Polished still bills as a sketch on Flash Image. It is not Seedream/GPT Image/nano-banana on the canvas.
- **MCP / no-brief chats are unguarded** by the cap, but still cost money. Stay stingy.

## How

### Params

| Param | Required | Values / default |
|---|---|---|
| `prompt` | yes | 1+ chars. You write it (PROMPT ANATOMY). The tool prefixes `Generate a YouTube thumbnail draft.` |
| `aspect_ratio` | no | `16x9` (default, YouTube), `9x16`, `1x1`. Sent as `16:9` / `9:16` / `1:1`. |
| `style` | no | `pencil_sketch` (default) or `polished`. Pencil appends a graphite-on-paper suffix (rough strokes, monochrome, working draft). Polished sends your prompt as-is. |
| `face_source` | no | **`stored:persona_<id>`** when the creator's face is in the frame. The tool loads the Personnage **front** angle (else first available). Attached **first**. Preface: strict identity / hair / skin. Without it, you get a generic stranger. |
| `reference_sources` | no | Array of `stored:` / `generated:` / `uploaded:` refs (logos `stored:lg_<id>`, swipe-files `stored:sf_<id>`, past gens `stored:gi_<id>`, prior sketches `generated:sk_<id>`). Attached **after** the face. Preface: incorporate at the size/position described in the prompt. |

You cannot pick another image model, count, or resolution. Always Flash Image, n=1, 1K.

### Prompt (PROMPT ANATOMY)

At most **7 sentences**, this order, **no labels** in the prompt. Omit a line if irrelevant. Full rubric lives in `thumbnail-packaging` / the system block; this is the bar for this tool:

1. **SUBJECT** — foreground person: realistic pose, decomposed face (not "shocked"), outfit if it matters.
2. **SCENE** — midground action + background place/mood. A flat grey portrait is dead.
3. **COMPOSITION** — one valid framing only: extreme close-up \| close-up \| medium close-up \| medium shot \| medium full shot \| full shot \| wide shot. Subject left/center/right third. Midground slightly out of focus, background bokeh if you want depth.
4. **OBJECTS** — ≤3 elements including the hero. Each: % of frame, position, plane. Ex: `Claude logo (orange 8-pointed star, 14% frame) center-left, foreground.`
5. **TEXT** — 0–4 words, ≤20 chars, ALL CAPS, bold sans, color + position + thick black outline + % height. Omit the line if no overlay. Overlay mode: leave that zone empty.
6. **LIGHTING** — one coherent story, direction per plane.
7. **STYLE** — 2 descriptors max (`photorealistic, cinematic`).

Do **not** put in the prompt: ALL-CAPS emphasis, "preserve face fidelity" (that's `face_source`), CTR/viral marketing, 8K/masterpiece piles, invalid framings (`ultra close-up`). Medium shot has no room for a giant logo beside a torso — use wide/full if subject left + logo right.

### Success

Text: `Sketch generated. Reference: generated:sk_<id> (cost: $0.020)` plus the image. Adapter appends `result_id: <toolCallId>` on success only.

Copy `generated:sk_<id>` exactly (id is `sk_` + hex, no dashes). Copy `result_id` into `finish_turn.results` (max 6, display order) so the chat shows the croquis.

Wire later:

- Sketch node: `{ type: "sketch", image_source: "generated:sk_<id>" }` → generator `sketch-in` (B/C: `sketch-in-b` / `sketch-in-c`).
- Optional fiche: `update_brief` variant `set.sketch: { source: "generated:sk_<id>", status: "pending", autoFixed: false }`.

### Cost cap (fiche only)

If this conversation has a thumbnail brief, the server reserves **before** the HTTP call:

`limit = 2 × max(1, variants.length) + 3`

Examples: 0 or 1 variant → 5; two → 7; three → 9. Auto-fixes and retouches count. No brief (plain canvas / MCP) → no cap.

Past the limit the handler is **not** called. Quote the refusal and stop sketching.

A reservation is **refunded** only when `requestNotSent` is true (key missing, unresolved ref, network throw — the paid request never left). Provider errors, empty image, and unknown throws **stay counted**. Do not retry those hoping for a free extra.

## Errors

Quote / paraphrase in one sentence; do not dump JSON.

| Signal | Meaning | Do |
|---|---|---|
| `Clé API OpenRouter non configurée. Ajoute-la dans Réglages.` | No OpenRouter key. `requestNotSent`. | Tell them to add it in Réglages. Do not retry. |
| `Esquisse refusée : limite de N esquisses atteinte pour cette miniature.` | Cap `N = 2×variants+3`. Handler never ran. | One sentence. Offer to place the canvas / validate **without** another sketch. |
| `Cannot resolve image_source <ref>: …` | Bad/missing `face_source` or `reference_sources`. `requestNotSent`. | `list_personas` / `list_logos` / `list_swipe_files` and pass a real ref. Persona with no photos → `Persona not found or has no photos: stored:persona_<id>`. |
| `Network error: …` | Fetch threw. `requestNotSent`. | Retry **once**. Still failing → say the network dropped, no image billed. |
| `OpenRouter API error <status>` | Provider answered. **Counted.** | Do not hammer. One sentence, suggest later or continue without a sketch. |
| `OpenRouter returned no image` | 200 but empty `data`. **Counted.** | Same: no retry loop. |

Never invent a face because resolve failed.

## Chains

1. `read_skill thumbnail-packaging` if the promise / packages are still fuzzy.
2. `list_personas` → `face_source: "stored:persona_<id>"` when they appear. Empty library: the tool-less French line from that skill; faceless angles, do not upload a selfie as face.
3. `list_logos` / `list_swipe_files` / `list_past_generations` → `reference_sources` (`stored:lg_`, `stored:sf_`, `stored:gi_`).
4. `generate_sketch` (one call per variant you actually show). Parallel calls each cost ~$0.02 and each increment the cap.
5. `update_brief` with the `generated:sk_<id>` if you are keeping a fiche.
6. Show it: `finish_turn` with that `result_id`, short summary, ask_agent ("Garder A", "Retoucher le fond") — **never** an ask_agent that would start a paid generation.
7. When they validate: `apply_workflow` / `place_node` (sketch node on `sketch-in`, Personnage on `face-in`, logos on `logo-in`) then `finish_turn` kind `generate` so **they** click **Générer**.

Existing canvas: `read_skill existing-workflow` first. A sketch can still illustrate a change; wiring goes on `sketch-in`, not as the generator output.

## Example

User: « Montre-moi un croquis, moi à droite, logo Claude à gauche. »

You already have a package and `list_personas` → `stored:persona_abc`, `list_logos` → `stored:lg_claude`.

```
generate_sketch
  prompt: (7-sentence anatomy: man right third, Claude logo left, medium shot with action, "ADIEU ?" top-left, orange key / navy ground, photorealistic cinematic)
  aspect_ratio: "16x9"
  style: "pencil_sketch"
  face_source: "stored:persona_abc"
  reference_sources: ["stored:lg_claude"]
```

Success text includes `Reference: generated:sk_…` and `result_id: call_7`.

`finish_turn`: summary that this is a **croquis**, `results: ["call_7"]`, ask_agent "Garder cette compo" / "Sans le texte". Do **not** trigger generation.

If the next call returns `Esquisse refusée : limite de 5 esquisses atteinte pour cette miniature.` → say the limit is reached and offer to put A on the canvas without a new sketch, with **Générer** as their click.
