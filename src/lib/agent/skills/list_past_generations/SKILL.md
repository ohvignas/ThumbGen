---
name: list_past_generations
description: Lists this project's past paid generations (model, prompt, cost, stored:gi_<id>) for iterating or remixing a previous output. A chosen image is wired as swipeFile kind=reference on ref-in.
---

# list_past_generations

Read-only. No paid API. No DB write. Text only — not a visual `finish_turn` result.

## When

- User wants to start from, remix, or compare a previous **paid** render of **this** miniature: "reprends la dernière", "remix", "celle d'hier", "le prompt de la génération openai"
- You need a `stored:gi_<id>` that is **not** already on the open canvas (no `selectedImage` in `<canvas_state>`)
- They ask what they already generated here (model, prompt, cost)

## When not

- Brand-new thumbnail with nothing to remix → `thumbnail-packaging`, not a history dump
- The generator/preview already has `selectedImage: stored:gi_<id>` in `<canvas_state>` — that **is** the ref; skip this tool and wire it
- They want to **see** pixels → `view_canvas_images` (canvas images only). This tool returns text, no thumbnails
- Library inspiration → `list_swipe_files` (`stored:sf_<id>`), not `stored:gi_`
- A YouTube thumb they named → `import_youtube_thumbnail` (`stored:sf_<id>`)
- Creator's face → `list_personas` (`stored:persona_<id>` on **face-in**). Never put `stored:gi_` on face-in
- A logo → `list_logos` / `stored:lg_<id>` on **logo-in**
- Another miniature's name only → `list_projects` first. The open canvas stays `<project_id>`
- Every turn "just in case" — keep the `stored:gi_<id>` you already have
- Starting the paid final render — user clicks « Générer »; never `ask_agent` that would generate

Empty list is normal on a fresh project. Do not call this to "check" an empty canvas.

## How

### Call

```
project_id: from <project_id> (required)
limit: optional integer 1–100, default 20
```

Pass the injected `<project_id>` unless they explicitly pointed at **another** miniature from `list_projects` (then pass **that** id to list, but still **wire onto the open canvas**).

Omit `limit` for the last 20. Raise toward 100 only if they ask for older ones. There is no offset: you cannot page past 100. Do not pass `0` or a float.

### What it reads

SQLite `generations_log` for this `project_id`, `ORDER BY created_at DESC`, `LIMIT`. Columns used: `model`, `prompt`, `cost_estimate`, `created_at`, `generated_image_ids`.

It does **not** join `generated_images`, filter `status`, or filter `endpoint`. Rows with `project_id` NULL (classification, research, sketches, and some generate logs) **never appear**. Usage totals can still show cost for those.

The log row's own `id` is **not** printed. Never invent `stored:gi_<log-row-id>`.

### Output

Empty: `No generations found for this project.` (success, not `isError`).

Otherwise one header plus one bullet per row, newest first:

```
N generation(s) for project <project_id>:
- [<created_at>] <model> | "<prompt>" | cost: $0.0123 | images: stored:gi_<id1>, stored:gi_<id2>
```

- Missing prompt → `(no prompt)`
- Missing `generated_image_ids` → `images: (no images)` (failed/error rows, or a log with no saved image). Skip those for wiring
- Several images on one row = one generation with `count` > 1. Ask which one if it matters; otherwise take the first

`generated_image_ids` is split on commas, trimmed, prefixed `stored:gi_`. Copy each `stored:gi_<id>` **verbatim** (the `<id>` is a `generated_images` uuid).

### `stored:gi_<id>`

Prefix `gi_` → table `generated_images`. Valid `image_source` on a **swipeFile** (`kind: "reference"`) and on a sketch node. `apply_workflow` / `place_node` resolve it from the DB (inlined as bytes; there is no `/api/swipe-files` URL for `gi_`).

Not a Personnage, not a library swipe (`sf_`), not a logo (`lg_`), not a sketch (`generated:sk_<id>`).

`ask_user` option images **ignore** `stored:gi_` (no tile). Do not put these refs on `ask_user.image`. Describe date / model / prompt in the option label instead, or wire first then `view_canvas_images`.

### Wire as reference on ref-in

Do **not** rebuild the workflow. Add or update one swipeFile and connect it to the generator's **ref-in**. Keep face, logos, prompt, sketch.

**Existing / A/B canvas → `apply_workflow`** (reuse generator id from `<canvas_state>`):

```
project_id: <project_id>
blueprint:
  nodes:
    - id: <new id, or the existing reference node's id>
      type: swipeFile
      data:
        kind: reference
        image_source: stored:gi_<id>
        label: Génération précédente   # optional
  edges:
    - source: <that node id>
      target: <generator id>
      targetHandle: ref-in
```

- New id = create (laid out to the right). Existing swipeFile id = update image only
- `kind` must be `"reference"`, never `"logo"`
- A/B: variant A's ref is `ref-in`; only B uses this image → `ref-in-b` (needs `abTest.variants` including `"B"`); only C → `ref-in-c`. Shared face/logos stay on face-in / logo-in
- Send only the nodes you add or change. No `remove_node_ids` unless they asked to delete

**Guided interview, one live node → `place_node`:**

```
node:
  id: iv-ref-1          # or iv-ref-2 / iv-ref-3 if 1 is taken
  type: swipeFile
  data:
    image_source: stored:gi_<id>
```

`kind` is implied (`reference`). If `iv-generator` exists, the edge to **ref-in** is added for you. Never the same step as `ask_user`.

Then `finish_turn`: short summary, empty `results`, `next_actions` with `{ kind: "generate", node_id: "<generator>" }` so **they** click.

## Errors

| What you see | What to do |
|---|---|
| `No generations found for this project.` | Say there is no history **in this log**. If the canvas already shows a render, use `selectedImage` / `view_canvas_images` (`stored:gi_<id>` in the image header). Do not invent an id. Do not retry with a random `project_id` |
| Zod / invalid `limit` (0, >100, non-int) or missing `project_id` | Call again: `project_id` from `<project_id>`, omit `limit` or 1–100 |
| `apply_workflow` / `place_node`: `Image source not found on node …: stored:gi_<id>` | That row is gone from `generated_images`. Pick another ref from the list or from the canvas. Do not retry the same id. Do not fabricate a uuid |
| `Invalid ImageSource` | Ref must match `stored:gi_<uuid>` exactly. Do not wrap in quotes inside the value, do not use `generated:gi_`, `generated:sk_`, or the log line's timestamp as an id |
| User picks a row with `(no images)` | Cannot wire. Offer another row or a new composition |
| `ask_user` with `image: stored:gi_…` | Tile is blank. Use text options, or place the node then `view_canvas_images` |

This handler never sets `isError` on an empty project. An empty string is an answer.

## Chains

1. **Remix this project's last good render (not on canvas)**  
   `list_past_generations` → pick a line with a real `stored:gi_<id>` → `apply_workflow` or `place_node` as above → `finish_turn` + « Générer ».

2. **Remix the image already chosen on the generator**  
   Skip this tool. `get_canvas_state` / injected snapshot → `selectedImage` → same wiring. `view_canvas_images` if you must look.

3. **They name another miniature**  
   `list_projects` → `list_past_generations` with **that** `project_id` → if they want it **here**, wire `stored:gi_<id>` onto **this** canvas's generator. Do not silently switch project.

4. **Cheap draft conditioned on a past final** (costs money)  
   `generate_sketch` with `reference_sources: ["stored:gi_<id>"]` — optional. Still not the final. Face remains `face_source: stored:persona_<id>`.

5. **New packaging, ignore history**  
   Do not list. Follow `thumbnail-packaging`.

Do not chain into a paid final generation yourself.

## Example

User: "Reprends la dernière miniature et change juste le fond."

1. If `<canvas_state>` already has `selectedImage: stored:gi_8f3a…` on the generator — use that, skip the list.
2. Else:

```
list_past_generations
  project_id: <project_id>
```

Reply line (do not dump the raw list in the chat):

```
3 generation(s) for project …:
- [2026-09-17 14:02:01] gemini-3.1-flash-image | "… red backdrop …" | cost: $0.0450 | images: stored:gi_8f3a1c2e-…
- [2026-09-16 09:11:00] openai | "(no prompt)" | cost: $0.0000 | images: (no images)
```

Take `stored:gi_8f3a1c2e-…`. Skip the `(no images)` row.

3. Wire (existing generator `gen-1`; no reference node yet):

```
apply_workflow
  project_id: <project_id>
  blueprint:
    nodes:
      - id: ref-last
        type: swipeFile
        data: { kind: "reference", image_source: "stored:gi_8f3a1c2e-…", label: "Dernière génération" }
    edges:
      - { source: "ref-last", target: "gen-1", targetHandle: "ref-in" }
```

Interview-only canvas instead:

```
place_node
  node: { id: "iv-ref-1", type: "swipeFile", data: { image_source: "stored:gi_8f3a1c2e-…" } }
```

4. `finish_turn`: summary that the last render is now the **référence** (fond will change in the prompt if they asked); `results: []`; next action `generate` on that generator.

Never: rebuild nodes, put `stored:gi_` on face-in / logo-in / sketch-in, offer an `ask_agent` that generates, or cite this tool's call in `results`.
