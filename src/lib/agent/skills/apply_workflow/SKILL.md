---
name: apply_workflow
description: Merges a blueprint into the project's canvas (create/update nodes and edges, keep everything unmentioned) to ship a full workflow or A/B/C test. Use when building or editing multiple connected nodes. Do not use for one iv-* interview node (place_node) or to start a paid generation (finish_turn kind generate).
---

# apply_workflow

How you **ship** a design. MERGES into the open canvas; never replaces it. Snapshot before every write; the user can restore from « Historique de l'agent ». After success, the user clicks « Générer » — you never start the paid run.

## When

- Build a new thumbnail workflow (prompt + generator, plus face / logo / sketch / ref as needed)
- Edit an existing canvas: send **only** the nodes you add or change, reusing ids from `<canvas_state>` / `get_canvas_state`
- Ship an A/B/C test: **one** generator with `abTest`, shared face/logo, per-variant prompt/sketch/ref
- Wire a new node onto an existing generator (new id + an edge to a canvas id)
- Disconnect an existing edge with `remove_edges` (matched on source + target + targetHandle)
- Delete nodes **only** when the user explicitly asked: `remove_node_ids` (their edges go too)

## When not

- One live interview node (`iv-prompt`, `iv-persona`, `iv-ref-1..3`, `iv-logo-1..3`, `iv-generator`) → `place_node`. That path auto-wires A-handles only and **refuses** `abTest` on `iv-generator`
- Start a paid generation → they click « Générer » on the canvas generator. Only that click costs money
- Vague look / analyse / improve on a non-empty canvas → `existing-workflow` first (view images, ask; modify only when the ask is precise)
- Rebuild or resend the whole canvas. Omitted nodes stay. `remove_node_ids` is not how you "replace"
- Pick a "best" variant for them. A/B means they compare real Aperçus (and YouTube Studio « Tester et comparer »)
- Numbered 7-step interview / "step N of 7". Ask only what you still need, then ship
- Same step as `ask_user`: wait for the answer, then apply
- Change a node's `type` (use a new id). Create `preview` / `textOverlay` (not blueprint types — leave them on the canvas by omitting them)
- Face as a one-off photo (`stored:fr_*` or a random upload). Faces are Personnages only: `stored:persona_<id>`

## How

`project_id` from `<project_id>`. `blueprint` is `{ nodes, edges }` (object; a JSON string is accepted if valid). Optional `remove_node_ids: string[]`, `remove_edges: { source, target, targetHandle }[]`.

### Merge

1. Blueprint node whose **id already exists** → UPDATE. Only the `data` fields you give change. Position, generated images, imported images, persona angles, generator settings stay. Omit `image_source` to keep the current image. **Type cannot change.**
2. New id → CREATE. Needs **full** data (`image_source` on faceReference / swipeFile / sketch). New nodes are auto-laid out left-to-right among themselves, then placed **200px to the right** of the existing canvas. Existing nodes are never moved. Don't send `position`.
3. Canvas nodes **not** in the blueprint are **kept** untouched. Send only what you add or change.
4. `remove_node_ids`: delete those ids and their edges — **only** if the user asked. Unknown ids are ignored and reported. A node cannot be in both the blueprint and `remove_node_ids`.
5. Existing edges stay. Blueprint edges are added, **deduped** on `source + target + targetHandle`, and may connect new nodes to existing canvas nodes. Disconnect with `remove_edges`. Duplicate edges in the same call are collapsed.

Existing node given as `{ id, type }` (no `data`) is a no-op update — valid for wiring a new edge onto it. A **new** node still needs full data.

### Nodes

Nest type-specific fields under `data`. Flattened keys (`prompt`, `model`, `abTest`, `image_source`, …) are folded in if `data` is missing, but nested is canonical.

| type | New node `data` | Update (every field optional) |
| --- | --- | --- |
| `faceReference` | `image_source`: `stored:persona_<id>` (from `list_personas`); `label?` | omit `image_source` to keep the Personnage; a new persona without `label` **keeps** the node's current label |
| `swipeFile` | `kind`: `"logo"` \| `"reference"`; `image_source`; `label?` | omit `image_source` to keep the image; new source replaces it |
| `sketch` | `image_source` | omit `image_source` to keep the drawing; a **new** source drops stale Excalidraw (`sketchElements` / `sketchFiles`) |
| `prompt` | `prompt`; `negativePrompt?` | patch only given fields |
| `generator` | `model`; `aspectRatio`; `count?` (1–4); `abTest?` | same; omitted fields kept (`numImages`, `generatedImages`, `selectedImageIndex`, `imageSize`, …) |

`id`: non-empty string. Reuse canvas ids. New ids: unique, readable (`prompt-a`, `logo-1`, `gen`). Blueprint types only — not `preview` or `textOverlay`.

### `image_source`

Must exist at apply time (cheap check, then resolved to pixels so the node renders).

| scheme | meaning |
| --- | --- |
| `stored:persona_<id>` | Personnage — **only** valid source on `faceReference` (up to 3 angles) |
| `stored:lg_<id>` | logo (`list_logos` / `find_logos`) |
| `stored:sf_<id>` | swipe file (`list_swipe_files`) |
| `stored:gi_<id>` | past generation (`list_past_generations` or a generator's `selectedImage`) |
| `generated:<id>` | sketch from `generate_sketch` (`generated:sk_<id>`) |
| `uploaded:<id>` | chat upload (`request_user_image`) |
| `data:image/(png\|jpeg\|jpg\|webp);base64,…` | inline |

Invalid: `stored:fr_*`, missing file, unknown prefix. On success, `generated:` / `uploaded:` refs are marked attached (skip GC).

### Generator

- `model`: `"nano-banana"` \| `"openai"` \| `"seedream"` (not ideogram / grok). Prefer `openai` when thumb text has accents or >2 words, `seedream` with a character and no text, else `nano-banana`
- `aspectRatio`: `"16x9"` (YouTube) \| `"9x16"` \| `"1x1"`
- `count`: 1–4 images, **per variant** in A/B mode. Default 1. Keep 1 unless they ask for more. UI cap is 4
- `abTest`: omit for a normal generator (do not send `{ variants: ["A"] }`)

Blueprint `model` / `count` map to canvas `model` (internal id) / `numImages`. You still send the coarse ids above.

### Edges

`{ source, target, targetHandle }`. Both ends must be in the blueprint **or** still on the canvas (and not removed in this call). Don't send `id` or `sourceHandle` (the tool sets `e-…` and `sourceHandle: null`).

Generator **input** handles:

| slot | A (default) | B | C | shared? |
| --- | --- | --- | --- | --- |
| face | `face-in` | — | — | yes, every variant |
| logo | `logo-in` | — | — | yes, every variant |
| prompt | `prompt-in` | `prompt-in-b` | `prompt-in-c` | no |
| sketch | `sketch-in` | `sketch-in-b` | `sketch-in-c` | no |
| ref | `ref-in` | `ref-in-b` | `ref-in-c` | no |

There is no `face-in-b` / `logo-in-c`. Outputs (`result`, `result-b`, `result-c`) are for the canvas; you don't wire them.

Iterate a chosen generation: new or existing `swipeFile` `kind: "reference"` with `image_source: "stored:gi_<id>"` on `ref-in` (or `ref-in-b` / `ref-in-c` if only that variant should see it). That is **ITERATE THIS IMAGE**: write a short change-only prompt (1–3 sentences), not a 7-sentence recreation. Keep the chain: original prompt + this generation + the requested change. The generate route sends that image first as the edit source. Short because you are iterating — A/B is only variant slots.

### After a successful apply

Tool returns e.g. `Applied: X created, Y updated, Z removed (kept N untouched).` plus Created / Updated / Removed id lists, ignored unknown removes, and `Generator node id: <id> — l'utilisateur peut cliquer "Generate" dessus pour lancer.`

Tell the user the workflow is ready. Then `finish_turn`: `summary` 1–2 sentences; `next_actions: []`. Don't dump JSON.

## A-B

A/B is **variant slots** on one generator — not a prompt-length rule. First gen: two complete 7-sentence prompts. Iterate on a generated aperçu: short deltas because that image is the source.

YouTube Studio « Tester et comparer » tests **up to 3** thumbnails per video. One ThumbGen generator holds **at most 3** variants. Ship 2 or 3 packages as **one** test, not separate generators.

1. **One generator.** `data.abTest = { variants: ["A","B"] }` or `{ variants: ["A","B","C"] }`. Variant A in your packages is canvas A, B is B, C is C. Never two generators "to compare".
2. **Shared once.** Personnage `faceReference` → `face-in`. Each logo `swipeFile` `kind: "logo"` → `logo-in`. Do not clone face/logo per variant.
3. **Own prompt every variant.** A's prompt → `prompt-in`, B → `prompt-in-b`, C → `prompt-in-c`. Unique ids (`prompt-a`, `prompt-b`, `prompt-c`). Always wire a prompt even if B/C would inherit A's — they should differ. A/B is variant slots, not a prompt-length rule. **First gen / from scratch** = full 7-sentence anatomy **each** (two complete alternative prompts is the normal first-gen A/B). **Iterate** (generated thumb on `ref-in`) = short deltas, because the aperçu is the source — not because A/B is on.
4. **Per-variant sketch / ref only when they differ.** Sketch → `sketch-in` / `sketch-in-b` / `sketch-in-c`. A reference only one variant uses → `ref-in` / `ref-in-b` / `ref-in-c`.
5. **Inheritance.** An unconnected prompt/sketch/ref handle on B or C reuses **A's** input on that slot (`inherited: true`). Wire only what differs — except prompts, which you always give.
6. **Handles vs abTest.** `-b` needs `"B"` in `variants`; `-c` needs `"C"` (`["A","B","C"]`). Otherwise: `Edge to "prompt-in-c" needs variant C active on generator "<id>": set its data.abTest = { variants: ["A","B","C"] }, or connect to "prompt-in".` Variant handles on a non-generator: use the unsuffixed handle. Edges to `-b` on a canvas generator that **already** has B active are valid even if you don't resend `abTest`.
7. **Legal `variants` only.** Accept: `["A","B"]`, `["A","B","C"]`. Reject: `["A"]`, `["A","C"]`, `["B","A"]`, four entries, anything else. Dropping C (or turning A/B off) **deletes that variant's edges** (prompt-in-c, sketch-in-c, …); the prompt/sketch **nodes** stay unless `remove_node_ids`. A is never dropped.
8. **Same model + count for every variant.** `count` is per variant (2 variants × count 1 = 2 images). Model-compare (`compareModels`) is ignored in A/B mode.
9. **After apply.** One click on « Générer » produces one Aperçu per variant, titled « Variante A », « Variante B » (and « Variante C »), ready to compare and to upload into YouTube Studio. Don't silently pick a winner.

`place_node` cannot do this graph. `iv-generator` has no A/B. For 2–3 variants, this tool — one call.

## Errors

Nothing is written (no snapshot) on validation / conflict failure. Fix and retry.

| symptom | fix |
| --- | --- |
| `Invalid blueprint: received a string that is not valid JSON` | send the object, not a broken string |
| `Invalid blueprint:` + Zod `format()` | missing `model` / `aspectRatio` / `image_source`; `count` > 4; bad `abTest`; duplicate node id |
| `Image source not found on node <id>: …` | `list_personas` / `list_logos` / `generate_sketch` first; use a real id |
| `faceReference only accepts a Personnage` | `stored:persona_<id>`, never `stored:fr_*` |
| `Unknown node id: <id> (not in the blueprint, and not on the canvas or removed…)` | both ends must exist after this call; don't edge to a removed id |
| `Node "<id>" is both in the blueprint and in remove_node_ids` | update **or** delete, not both |
| `already exists on the canvas as a <type>; its type cannot change` | new id for a new type |
| `Handle "…-b" only exists on generator nodes` | variant handles only on the generator |
| `Edge to "prompt-in-c" needs variant C active` | set `abTest.variants` to include C, or use `prompt-in` |
| `The canvas changed while apply_workflow was running… Call get_canvas_state, then retry` | concurrent edit (user / another client). `get_canvas_state`, retry **once** against current ids; if it fails again, one sentence to the user |
| `Ignored remove_node_ids not on the canvas: …` / `Ignored remove_edges not on the canvas: …` | not a failure; those ids weren't there |

## Chains

1. Prefer injected `<canvas_state>` (ids, types, summaries, `abTest`, `selectedImage`). `get_canvas_state` if it may be stale after a write, or after a conflict. `view_canvas_images` to **see** pixels.
2. Collect sources: `list_personas` → `stored:persona_<id>`; `list_logos` / `find_logos` → `stored:lg_<id>`; `generate_sketch` → `generated:sk_<id>`; `import_youtube_thumbnail` / swipe → `stored:sf_*` or `stored:gi_*`.
3. New thumbnail: `thumbnail-packaging` for promise / title+thumb text / 1 focal, then this tool (not a 7-step script).
4. Existing canvas: `existing-workflow` — precise edit → this tool with only targeted nodes; iterate a chosen image via `stored:gi_<id>` on `ref-in`.
5. This call (one blueprint). Don't loop apply for each node — that's `place_node`'s job for `iv-*`.
6. `finish_turn` last, alone: `next_actions: []`. They click « Générer » on the canvas generator.
7. Conflict → `get_canvas_state` → retry once.

## Example

Two packages, shared face + logo, own prompts + sketches. `project_id` from `<project_id>`.

```json
{
  "nodes": [
    { "id": "face-1", "type": "faceReference", "data": { "image_source": "stored:persona_abc" } },
    { "id": "logo-1", "type": "swipeFile", "data": { "kind": "logo", "image_source": "stored:lg_xyz" } },
    { "id": "prompt-a", "type": "prompt", "data": { "prompt": "<first-gen A: full 7-sentence anatomy — abbreviated here>" } },
    { "id": "prompt-b", "type": "prompt", "data": { "prompt": "<first-gen B: a different complete 7-sentence anatomy>" } },
    { "id": "sketch-a", "type": "sketch", "data": { "image_source": "generated:sk_a" } },
    { "id": "sketch-b", "type": "sketch", "data": { "image_source": "generated:sk_b" } },
    {
      "id": "gen",
      "type": "generator",
      "data": {
        "model": "nano-banana",
        "aspectRatio": "16x9",
        "count": 1,
        "abTest": { "variants": ["A", "B"] }
      }
    }
  ],
  "edges": [
    { "source": "face-1", "target": "gen", "targetHandle": "face-in" },
    { "source": "logo-1", "target": "gen", "targetHandle": "logo-in" },
    { "source": "prompt-a", "target": "gen", "targetHandle": "prompt-in" },
    { "source": "prompt-b", "target": "gen", "targetHandle": "prompt-in-b" },
    { "source": "sketch-a", "target": "gen", "targetHandle": "sketch-in" },
    { "source": "sketch-b", "target": "gen", "targetHandle": "sketch-in-b" }
  ]
}
```

Three variants: add `prompt-c` (and sketch/ref if they differ), set `abTest.variants` to `["A","B","C"]`, wire `prompt-in-c` / `sketch-in-c` / `ref-in-c`.

Iterate an existing aperçu (`gen` + `prompt-1`; don't resend the face) — short delta, not a new scene:

```json
{
  "nodes": [{ "id": "prompt-1", "type": "prompt", "data": { "prompt": "Change the overlay to INSTANT. Keep the rest of the thumbnail unchanged." } }],
  "edges": []
}
```

Turn A/B off or drop C: update that generator `{ "data": { "abTest": { "variants": ["A", "B"] } } }` — C's edges go; delete leftover nodes only if they asked.

Then `finish_turn`: `next_actions: []`.
