---
name: place_node
description: Places or completes one live canvas node (iv-prompt, iv-persona, iv-ref-1..3, iv-logo-1..3, iv-generator). Use for a single additive change after a choice. For an A/B graph or many nodes, use apply_workflow. Never the same step as ask_user or finish_turn; never pass abTest.
---

# place_node

Places or completes **one** `iv-*` node on the open canvas. The project is injected (do not send `project_id`). The canvas shows the node live. Non-`iv-*` nodes are never moved, updated, or deleted.

There is no numbered pipeline and no « Étape n/7 ». Place a node when that choice is known; skip anything the user already covered.

## When

- One variant is going on the canvas: prompt, optional personnage / refs / logos, then the generator
- The user just chose a Personnage, logo, or reference — put that one node up now
- Completing an existing `iv-*` node (rewrite the prompt, swap a logo, change `count`)
- Shipping a **single-variant** generator so they can click « Générer »

## When not

- **Two or three variants / A/B/C** → `apply_workflow` with one generator whose `data.abTest` is `{ variants: ["A","B"] }` or `{ variants: ["A","B","C"] }`. `place_node` cannot do A/B: `iv-generator` **rejects `abTest`**.
- **Many non-`iv-*` nodes**, sketches, custom ids (`prompt-1`, `journey-generator`) → `apply_workflow`
- **Delete** nodes → `apply_workflow` `remove_node_ids`, and only if they asked
- **Same step as `ask_user` or `finish_turn`** — question alone; `finish_turn` last and alone
- Starting a paid generation — `finish_turn` `next_actions: [{ kind: "generate", node_id: "iv-generator" }]`; they click
- A sketch node — `generate_sketch` returns `generated:sk_<id>`; `place_node` has no sketch id
- An existing non-interview workflow they want edited → `apply_workflow` (skill `existing-workflow`)

| Need | Tool |
|---|---|
| One `iv-*` node, live | `place_node` |
| A/B graph, many nodes, delete | `apply_workflow` |
| Clickable choice | `ask_user` (own step) |
| Close the turn / « Générer » | `finish_turn` (own step) |

## How

Argument: `{ node: { id, type, data? } }`. Flattened fields (`prompt`, `image_source`, `model`, …) on the node are folded into `data`. Do not send `position` or `edges` (layout and wiring are automatic). Do not send `project_id`.

New node: **full** `data` for that type. Existing node: only the fields you give change; **position and omitted fields stay**. `kind` is implied by the id — omit it, or pass the matching kind.

Several `place_node` calls may share one step (prompt + persona + logos + generator). Never mix that step with `ask_user` or `finish_turn`.

### Allowed ids and types

| id | type | implied kind | generator handle |
|---|---|---|---|
| `iv-prompt` | `prompt` | — | `prompt-in` |
| `iv-persona` | `faceReference` | — | `face-in` |
| `iv-ref-1` `iv-ref-2` `iv-ref-3` | `swipeFile` | `reference` | `ref-in` |
| `iv-logo-1` `iv-logo-2` `iv-logo-3` | `swipeFile` | `logo` | `logo-in` |
| `iv-generator` | `generator` | — | — (no `abTest`) |

Any other id (`prompt-1`, `iv-ref-4`, …) is refused. Type must match the id. A canvas node that already has that id with another type is refused.

### Data shapes (new node)

**`iv-prompt`**

```json
{ "id": "iv-prompt", "type": "prompt", "data": { "prompt": "<final image prompt>", "negativePrompt": "<optional>" } }
```

`prompt` is required. Write it from thumbnail-packaging (PROMPT ANATOMY). If on-image text is rendered, put the exact words in quotes with font, color, outline, and size in % of height. If text is an overlay, describe the reserved empty zone.

**`iv-persona`** — Personnage only, never a one-off photo.

```json
{ "id": "iv-persona", "type": "faceReference", "data": { "image_source": "stored:persona_<id>", "label": "<optional>" } }
```

`image_source` required. Get the id from `list_personas`.

**`iv-ref-1..3`**

```json
{ "id": "iv-ref-1", "type": "swipeFile", "data": { "image_source": "stored:sf_<id>", "label": "<optional>" } }
```

`image_source` required. Allowed: `stored:sf_<id>` (`list_swipe_files`, `import_youtube_thumbnail`), `stored:gi_<id>` (`list_past_generations`), `generated:<id>` (a sketch), `uploaded:<id>`, or a `data:image/png|jpeg|jpg|webp;base64,…` URI. Do **not** pass `kind: "logo"`. `kind: "reference"` is optional.

**`iv-logo-1..3`**

```json
{ "id": "iv-logo-1", "type": "swipeFile", "data": { "image_source": "stored:lg_<id>", "label": "<optional>" } }
```

`image_source` required, typically `stored:lg_<id>` from `list_logos` / `add_logo`. Do **not** pass `kind: "reference"`.

**`iv-generator`** — no `abTest`. Ever.

```json
{ "id": "iv-generator", "type": "generator", "data": { "model": "nano-banana", "aspectRatio": "16x9", "count": 1 } }
```

- `model` (required on create): `"nano-banana"` \| `"openai"` \| `"seedream"`. Prefer `openai` when the thumb text has accents or more than two words; `seedream` with a character and no text; else `nano-banana`.
- `aspectRatio` (required on create): `"16x9"` \| `"9x16"` \| `"1x1"`. YouTube thumbs: `16x9`.
- `count` optional, integer 1–4, default 1. Keep 1 unless they ask for more.

**Update** (node already on the canvas): send only what changes, e.g. `{ "id": "iv-prompt", "type": "prompt", "data": { "prompt": "…" } }` or `{ "id": "iv-generator", "type": "generator", "data": { "count": 2 } }`. `image_source` may be omitted to keep the current image.

### Layout (automatic)

Do not set `position`. New nodes sit to the **right of non-`iv-*` nodes** (empty canvas = origin):

- Column gap `200`, node width `320`
- Inputs (`iv-persona`, `iv-ref-*`, `iv-logo-*`): stacked at `x = left`, `y = top + 240 * slot` (first free slot; a deleted input is recreated in the first free one)
- `iv-prompt`: `x = left + 420`, same `top`
- `iv-generator`: `x = left + 840`, same `top`

Existing nodes keep the position the user may have dragged.

### Auto-wiring to `iv-generator`

Send **no edges**. Once `iv-generator` is on the canvas:

- Placing the generator links every interview input already present (`face-in` / `prompt-in` / `ref-in` / `logo-in`)
- Placing a later input links that input
- Edge shape: id `e-<8 hex chars>`, `sourceHandle: null` (same as `apply_workflow`)
- A link the **user removed** is never put back. A **recreated** node (deleted, then placed again) is linked again. A user-drawn duplicate is not added twice.

Place the generator last if you want one wiring burst; placing it first still wires each later input.

### Success (model only — do not dump to chat)

```
node id: iv-prompt
```

When wired:

```
node id: iv-ref-2
linked to iv-generator
```

When placing the generator, linked sources may be listed:

```
node id: iv-generator
linked to iv-generator: iv-prompt, iv-persona, iv-ref-1, iv-logo-1
```

A broadcast failure still succeeds: the node is already saved; the open canvas picks it up on reload.

Writes are snapshotted (`place_node`) so they can undo from « Historique de l'agent ».

## Errors

On error **nothing is written** (no patch). Apologise in one sentence. For a mid-flight delete, ask before placing that id again.

Quote the tool text (the `<id>` / type / kind / source vary):

- `Invalid node id "<id>": place_node only accepts iv-prompt, iv-persona, iv-ref-1..3, iv-logo-1..3 and iv-generator.`
- `Node "<id>" must be a <expected type>, not a <given or "missing type">.`
- `Node "<id>" is a <reference|logo> swipeFile: its kind cannot be "<other>".`
- `The interview generator has no A/B test (abTest): leave it out.`
- `Project not found: <project_id>`
- `Node "<id>" already exists on the canvas as a <type>; place_node cannot change it to a <type>.`
- `Invalid data for node "<id>":` then `data.<field>: <zod message>` lines (missing `prompt` / `image_source` / `model` / `aspectRatio`, bad `count`, invalid `image_source` shape, `model` not in the enum, …)
- `Image source not found on node <id>: <image_source>`
- `Could not resolve the image of node <id>: <message>`
- `nœud supprimé entre-temps: the user deleted <id> while place_node was running, so nothing was written. Ask the user before placing it again.`

## Chains

1. `ask_user` **alone** → they answer → later step: one or more `place_node` → later step: `finish_turn` **alone**
2. `list_personas` → `place_node` `iv-persona` with `stored:persona_<id>`
3. `list_logos` / `add_logo` → `place_node` `iv-logo-n` with `stored:lg_<id>`
4. `import_youtube_thumbnail` / `list_swipe_files` → `place_node` `iv-ref-n` with `stored:sf_<id>`
5. `list_past_generations` → `place_node` `iv-ref-n` with `stored:gi_<id>`
6. After `iv-generator`: `finish_turn` with `next_actions: [{ "kind": "generate", "node_id": "iv-generator" }]`
7. Two or three packages to compare → **stop using `place_node` for the graph**; `apply_workflow` + `abTest` (skill `apply_workflow`)
8. `place_node` error → one-sentence apology; do not retry a deleted node until they say so

Never call `place_node` in the same step as `ask_user` or `finish_turn`.

## Example

One variant, choices already known (persona, one logo, one imported ref). Same step, five `place_node` calls, **no** `ask_user` / `finish_turn`:

```json
{ "node": { "id": "iv-prompt", "type": "prompt", "data": { "prompt": "Close-up of Antoine, shocked, dark studio. Text \"ÇA CHANGE TOUT\" white extra-bold, 18% of height, thick black outline, right third." } } }
```

```json
{ "node": { "id": "iv-persona", "type": "faceReference", "data": { "image_source": "stored:persona_abc" } } }
```

```json
{ "node": { "id": "iv-logo-1", "type": "swipeFile", "data": { "image_source": "stored:lg_xyz" } } }
```

```json
{ "node": { "id": "iv-ref-1", "type": "swipeFile", "data": { "image_source": "stored:sf_ref1" } } }
```

```json
{ "node": { "id": "iv-generator", "type": "generator", "data": { "model": "nano-banana", "aspectRatio": "16x9", "count": 1 } } }
```

Next step, alone:

```json
{ "summary": "Le workflow est sur le canvas.", "results": [], "next_actions": [{ "kind": "generate", "node_id": "iv-generator" }] }
```

Two packages to A/B? Do **not** place two prompts with `place_node`. Call `apply_workflow` with `abTest` and per-variant handles (`prompt-in` / `prompt-in-b`).
