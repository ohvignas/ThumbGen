---
name: list_personas
description: Lists the creator's Personnages (multi-angle face sets). Use before offering a character, wiring a faceReference, or passing generate_sketch face_source. The only way to put their face on a thumbnail — never a one-off photo.
---

# list_personas

Free local read of the **global** Personnages library (not per-miniature). Copy each `stored:persona_<id>` exactly. There is no tool to create a Personnage.

A Personnage is a named identity with up to three photos — `front`, `left`, `right` — captured with the webcam or imported one photo per angle. Nano Banana Pro and Seedream receive those angles on the generator's `face-in` handle, which is what makes the face consistent. `generate_sketch` only consumes **one** image (front, else the first angle that exists).

**Faces of the creator are Personnages only.** Never a one-off photo, chat upload, selfie, swipe file, logo, sketch, YouTube thumb, or `data:` URI as their face.

## When

Call once in the conversation, then reuse the refs:

- A new thumbnail that might include the creator ("moi", "mon visage", "avec ma tête", "mets-moi", a named Personnage)
- Before `ask_user` character options (thumbnails need `image: stored:persona_<id>`)
- Before `place_node` `iv-persona` or `apply_workflow` `faceReference`
- Before `generate_sketch` with `face_source`
- They just created one in Bibliothèque — list again; the previous empty result is stale
- `<channel_profile>` has a default character and you still need to confirm the id / offer others

## When not

- They already said no face / "aucun" / "sans visage" / "pas moi" — do not list, do not invent a face
- You already listed this conversation and the ids are still in context (unless they went to create one)
- The open canvas already has the Personnage they want: `<canvas_state>` `faceReference.summary.persona` is `stored:persona_<id>` — reuse it
- You already chose a Personnage this conversation and they are not changing character — reuse that `stored:persona_<id>`
- Logos → `list_logos`. Inspiration / competitor thumbs → `list_swipe_files` / `import_youtube_thumbnail`. Those refs go on `logo-in` / `ref-in`, never `face-in`
- Do not call `request_user_image` (`suggested_kind: "face"` or anything else) to stand in for a Personnage. An upload cannot become a `faceReference`
- Do not treat a former single-photo face (`stored:fr_…`) as valid. That scheme is dead; `apply_workflow` rejects it
- Not a visual tool: never put this call in `finish_turn.results`

## How

No arguments. Call `list_personas` with `{}`. Extra keys are ignored.

**Success** (newest first). `created_at` is not shown. Angle names, when present, always appear in this order: `front`, `left`, `right`.

```
N personnage(s) :
- stored:persona_<id> — "<label>" (k/3 angles: front, left, right)
```

Examples of the angle clause:

- `(3/3 angles: front, left, right)`
- `(1/3 angles: front)`
- `(2/3 angles: front, right)`
- `(0/3 angles: aucun)` — row exists but has no photos; **do not** pass that ref downstream

Copy the `stored:persona_<id>` token as-is. Do not invent an id, drop the `stored:persona_` prefix, or pass the raw uuid.

**Empty library** is a normal (non-error) text result. Quote it to yourself and follow it; translate the *meaning* into the reply language, do not dump the French to an English user:

> Aucun Personnage dans la bibliothèque. S'il veut apparaître dans la miniature, propose-lui d'en créer un depuis la page Bibliothèque, onglet Personnages (capture webcam en 3 angles ou une photo par angle) ; sinon pars sur des angles sans visage.

Then: one short `finish_turn` summary + next_actions such as "Je l'ai créé" / "Sans visage". There is no tool that opens Bibliothèque or POSTs `/api/personas`. After they create one, call `list_personas` again.

`1/3` or `2/3` is still a valid Personnage — use it. More angles improve identity; you may mention they can add missing profiles in Bibliothèque → Personnages. Do not skip the face just because a profile shot is missing.

Text only. No images, no `result_id`, no DB writes, no paid API.

### Channel default

When `<channel_profile>` includes a line like:

> Default character: "Antoine". Use stored:persona_p1 as the default faceReference image_source unless the user asks for someone else or no face.

- They want to appear and did not name someone else → that ref is the default (still list once if you will offer a choice)
- They name someone else or "aucun" → conversation wins
- The line is **absent** when the default was deleted — do not reuse a remembered id; list again

Deleted defaults are stripped from the prompt even if Réglages still stores the old id.

### What to do with a ref

| Sink | Field | What the app does |
|---|---|---|
| `ask_user` option | `image: stored:persona_<id>` | Square tile = **front** (`/api/personas/image?id=…&angle=front`). Option `id` ≤ 40 chars |
| `generate_sketch` | `face_source: "stored:persona_<id>"` | **Front only** (else first existing angle). Costs money. Omit when no face |
| `place_node` | `{ id: "iv-persona", type: "faceReference", data: { image_source: "stored:persona_<id>" } }` | Wires to generator `face-in`. Label defaults to the library name |
| `apply_workflow` | node `type: "faceReference"`, `data.image_source: "stored:persona_<id>"`, edge `targetHandle: "face-in"` | Expands to **all** stored angles (`personaId` + `personaAngles`). A/B: one shared face, never duplicated per variant |

`get_canvas_state` / `<canvas_state>` summarize a face node as `{ persona: "stored:persona_<id>", label }`. `view_canvas_images` can show the photos; it does not list the library.

Generator model when a Personnage is connected and the thumbnail has **no** text: prefer `seedream`. Text with accents or more than 2 words: `openai`. Otherwise `nano-banana`.

Composition: emotion (label, intensity 1–3, mouth closed by default) only with a character. Faceless packages skip emotion.

## Errors

`list_personas` itself does not return `isError`. The empty-library French above is success.

Downstream, if you invent an id, use a non-persona source on `faceReference`, or pass a Personnage with no photos:

`apply_workflow` / `place_node` when the id is not in `personas`:

> Image source not found on node face-1: stored:persona_dead

`place_node` same check:

> Image source not found on node iv-persona: stored:persona_dead

`generate_sketch` when the id is missing or has no photos (`requestNotSent: true` — not billed):

> Cannot resolve image_source stored:persona_dead: Persona not found or has no photos: stored:persona_dead

`apply_workflow` / `place_node` when `image_source` is not `stored:persona_<id>` (selfie, upload, swipe, sketch, legacy `stored:fr_…`, etc.):

> faceReference only accepts a Personnage: image_source must be stored:persona_<id> (see list_personas)

`place_node` wraps that as:

> Invalid data for node "iv-persona":
> data.image_source: faceReference only accepts a Personnage: image_source must be stored:persona_<id> (see list_personas)

`apply_workflow` wraps schema failures as:

> Invalid blueprint:

followed by the formatted Zod issues (same `stored:persona_` message inside).

`place_node` if the image row vanishes while resolving:

> Could not resolve the image of node iv-persona: Persona not found or has no photos: stored:persona_<id>

Fix: call `list_personas`, copy a real ref (or go faceless). Do not retry with `stored:fr_`, `uploaded:`, `stored:sf_`, `generated:`, or `request_user_image`. Emotion on a card only with a Personnage.

## Chains

**Choice (typical):** `list_personas` → `ask_user` (one option per Personnage, `image: stored:persona_<id>`, plus "Aucun") → later `generate_sketch` `{ face_source }` and/or `place_node` / `apply_workflow` faceReference on `face-in` → `finish_turn`.

**Default, no objection:** `<channel_profile>` default ref (confirm with a list if you have not listed yet) → skip the question → same sketch / canvas path.

**Empty library, they want to appear:** tell them Bibliothèque → onglet Personnages (webcam 3 angles **or** one photo per angle) → `finish_turn` with a comeback button → after they return, `list_personas` again.

**Empty library, they don't need to appear:** faceless packages. No `face_source`, no `iv-persona`.

**Existing canvas:** if `faceReference.summary.persona` is already the one they want, do not list; do not rebuild the node. To swap character: list, then `apply_workflow` update that node's `image_source` (omit `label` to keep a custom node name).

**A/B:** one `faceReference`, one edge to `face-in`. Variants share it. Do not create `iv-persona-b`.

Cap `ask_user` at 12 options. Newest first matches this tool. Keep ~11 Personnages + "Aucun" if the library is huge.

`ask_user` is **alone in its step** (never with `place_node` or `finish_turn`). Do not send a journey step number.

## Example

User: "Fais-moi une miniature où je suis dessus."

1. `read_skill` `list_personas` (first use this conversation).
2. `list_personas` `{}`.
3. Tool returns:

```
2 personnage(s) :
- stored:persona_a1b2 — "Antoine" (3/3 angles: front, left, right)
- stored:persona_c3d4 — "Studio" (1/3 angles: front)
```

4. `<channel_profile>` says default character "Antoine" / `stored:persona_a1b2`. Offer a clickable choice anyway if more than one exists:

`ask_user` question "Quel personnage sur la miniature ?"
- `{ id: "a1b2", label: "Antoine", image: "stored:persona_a1b2" }`
- `{ id: "c3d4", label: "Studio", image: "stored:persona_c3d4" }`
- `{ id: "none", label: "Aucun" }`

5. They pick Antoine.
6. Sketch: `generate_sketch` `{ prompt: "…", face_source: "stored:persona_a1b2" }`.
7. Canvas: `place_node` `{ id: "iv-persona", type: "faceReference", data: { image_source: "stored:persona_a1b2" } }` (or `apply_workflow` with that node on `face-in`). Generator model `seedream` if there is no thumb text.
8. `finish_turn` — do not include the list call in `results`.

If step 2 had been the empty-library sentence: do **not** call `request_user_image`. Do **not** wire a selfie as `faceReference`. Propose Bibliothèque → Personnages, or continue without a face.
