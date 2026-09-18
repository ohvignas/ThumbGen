---
name: get_canvas_state
description: Reads the persisted canvas as compact JSON (node id, type, summary; edges source/target/targetHandle) with image bytes stripped. Use after apply_workflow or place_node in this turn, or when apply_workflow says the canvas changed, to refresh ids and wiring from SQLite. Prefer the injected <canvas_state> on the current turn when it looks complete — same summarizeNode shape from the live client at request time. Do not call to SEE pixels (view_canvas_images) or to list other miniatures (list_projects).
---

# get_canvas_state

Chat UI label: « Lit le canvas ». Not a visual result — never put this call in `finish_turn.results`. Do not paste the JSON to the user.

## When to use

- After `apply_workflow` or `place_node` **in this turn**, when you need the ids, types, summaries, or edges that were just written. `<canvas_state>` is snapshotted at request time and will not include those writes.
- When `apply_workflow` returns: `The canvas changed while apply_workflow was running (the user or another client edited it), so nothing was written. Call get_canvas_state, then retry apply_workflow against the current canvas.` Call this once, then retry the same targeted merge against the ids you just read. If it fails again, tell the user in one sentence.
- When you must reuse existing node ids in `apply_workflow` and the injected snapshot is missing, empty, or clearly older than a write you already made.
- To read prompts, generator settings, `selectedImage` refs, `canvas-upload` vs library sources, and `targetHandle` wiring as text — not pixels.

## When not

- **Every turn "just in case."** The live canvas is already injected as `<canvas_state>` (same `summarizeNode` summaries as this tool). The system prompt treats that block as the truth at the start of the turn.
- **To SEE images** (sketches, logos, Personnage, generated frames, uploads) → `view_canvas_images`. This tool never returns image parts; binary data is stripped.
- **To list other miniatures** → `list_projects`. Pass `project_id` from `<project_id>` for the **open** canvas only.
- **Empty canvas at turn start.** If `<canvas_state>` already has `"nodes": []`, calling this will not invent nodes.
- **User just dropped something on the canvas that is not in `<canvas_state>` yet.** Trust the injected snapshot (live React Flow). This tool reads SQLite; the client autosaves ~2 s after a local edit, so the DB can lag the open canvas.
- Same step as `ask_user` or `finish_turn`.

## How

Input (only field):

```json
{ "project_id": "<value inside <project_id>>" }
```

`project_id` is a required string. Copy it from the per-turn system block:

```
<project_id>…</project_id>
```

The block also says to pass that id to any tool that takes `project_id` (`apply_workflow`, `get_canvas_state`, `list_past_generations`, …). There is no `node_ids` filter (unlike `view_canvas_images`): the whole canvas is returned.

Handler: `SELECT nodes, edges FROM projects WHERE id = ?`. Each node becomes `{ id, type, summary }` via `summarizeNode(type, data ?? {})`. Each edge becomes `{ source, target, targetHandle }`. Positions, raw `data`, `sourceHandle`, and image bytes are dropped.

Return: one text part, pretty-printed JSON (`JSON.stringify(..., null, 2)`). `undefined` fields are omitted. Shape:

```json
{
  "nodes": [
    { "id": "<node id>", "type": "<prompt|generator|faceReference|swipeFile|sketch|preview|textOverlay|…>", "summary": {} }
  ],
  "edges": [
    { "source": "<id>", "target": "<id>", "targetHandle": "<handle or omitted>" }
  ]
}
```

Unknown project: **not** `{ isError: true }`. Same JSON with `"nodes": []` and `"edges": []`.

### vs injected `<canvas_state>`

Built by `snapshotCanvas` on the client and injected every turn as:

```
<canvas_state>
{ "nodes": […], "edges": […] }
</canvas_state>
```

Same node/edge keys and the **same** `summarizeNode` implementation (`src/lib/canvas/node-summary.ts`). Differences:

| | `<canvas_state>` | `get_canvas_state` |
|---|---|---|
| Source | Live canvas in the chat request (`nodes`/`edges` in memory) | SQLite `projects.nodes` / `projects.edges` |
| Freshness | Start of this turn (and of each `ask_user` / `request_user_image` continuation) | Now, including writes this turn already committed |
| Missing project | Still whatever the client sent (often empty nodes) | Empty `{ nodes: [], edges: [] }` |
| `targetHandle` | May be `null` | Omitted when undefined |

Prefer `<canvas_state>` unless a write in this turn (or a concurrent edit) made it stale.

### vs `view_canvas_images`

| | `get_canvas_state` | `view_canvas_images` |
|---|---|---|
| Output | Text JSON blueprint | JPEG pixels (plus caption lines) |
| Scope | Every node and edge | Optional `node_ids`; only nodes that carry a readable image |
| Cap | None | 8 images/call, 2/generator, 768 px |
| Missing project | Empty arrays | `Projet introuvable : <id>. Le canvas n'est peut-être pas encore enregistré (sauvegarde ~2 s après une modification) — réessaie dans un instant.` |
| Use for | Ids, prompts, settings, refs, wiring | What an image **looks like** |

Typical existing-workflow pass: read prompts/ids from `<canvas_state>` (or this tool after a write), then `view_canvas_images` on the nodes concerned.

### Node summaries

**`prompt`**

- `prompt`, `negativePrompt`

**`generator`**

- `model`, `aspectRatio`
- `count` — blueprint `count`, else canvas `numImages`
- `abTest` — `{ "variants": ["A","B"] }` or `["A","B","C"]` only when an A/B test is active (≥ 2 variants). Absent in normal mode.
- `generatedCount` — distinct strings in `generatedImages` plus `generatedImagesByVariant` A/B/C
- `selectedImage` — `stored:gi_<id>` (or another `toImageSourceRef` value) of `generatedImages[selectedImageIndex]`. Omitted when no index / no image. This is the chosen frame to iterate from.

**`faceReference`** (Personnage)

- `persona` — `"stored:persona_<id>"` when `personaId` is a string, else `null`
- `label`

**`swipeFile`** / **`sketch`**

- `label`
- `kind` — swipeFile only (`"logo"` or `"reference"`); omitted on sketch
- `hasImage` — true if `imageBase64`, `imageUrl`, or `image_source` is set
- `source` — only when `hasImage` is true:
  - `"library:<ref>"` when `image_source` or `imageUrl` maps to a ref (`library:stored:sf_<id>`, `library:stored:lg_<id>`, `library:generated:sk_<id>`, `library:stored:gi_<id>`, `library:uploaded:<id>`, …)
  - `"canvas-upload"` when there are bytes/url but **no** reusable ref (user import). You cannot rebuild that image with `image_source`.

**`preview`** (Aperçu)

- `label`
- `hasOutput` — `generatedImages.length > 0` or inline `imageBase64`/`imageUrl`
- `imageCount` — `generatedImages.length` only
- `selectedImage` — ref of the selected (or first) generated image, if any

**`textOverlay`**

- `text` (`overlayText`), `color`, `strokeColor`, `position` (`"top"` \| `"center"` \| `"bottom"`), `fontScale`
- `hasOutput` — true when a selected generated image is present

**Any other `type`:** `summary` is `{}`. The node still appears with `id` and `type`.

### Image refs (text only)

`toImageSourceRef` never inlines bytes. Common values:

- `stored:gi_<id>` — generated image (`/api/generated-images/image?id=`)
- `stored:sf_<id>` — swipe-file (`/api/swipe-files/image?f=`)
- `stored:lg_<id>` — logo (`/api/logos/image?f=`)
- `stored:persona_<id>` — Personnage (`/api/personas/image?id=`)
- `generated:<id>` — sketch (`/api/generated-sketches/<id>`)
- `uploaded:<id>` — chat upload (`/api/chat-uploads/<id>`)

Reuse these as `image_source` on `apply_workflow` / `place_node`. A generator or preview `selectedImage` of `stored:gi_<id>` is the start point for an iterate: swipeFile `kind: "reference"` on `ref-in`.

### Edges / handles

`targetHandle` is the input on the **target** node. Generator inputs:

- Shared (every A/B variant): `face-in`, `logo-in`
- Variant A: `prompt-in`, `sketch-in`, `ref-in`
- Variant B: `prompt-in-b`, `sketch-in-b`, `ref-in-b`
- Variant C: `prompt-in-c`, `sketch-in-c`, `ref-in-c`

Other targets: preview `preview-in`, text overlay `image-in`. `sourceHandle` is not returned. Tests wire e.g. prompt → generator `prompt-in`, Personnage → `face-in`, logo swipeFile → `logo-in`.

## Errors

This tool **never** sets `isError`. There is no French error string and no « projet introuvable » hint (that belongs to `view_canvas_images`).

| Situation | What you get |
|---|---|
| Unknown `project_id` | `{"nodes": [], "edges": []}` — looks like an empty canvas. If `<canvas_state>` has nodes, the DB row is missing or not saved yet; do not wipe the workflow. Prefer the injected snapshot; for pixels, `view_canvas_images` will say the project is missing and mention the ~2 s save. |
| Missing / non-string `project_id` | Schema reject before the handler (`project_id` required). |
| Corrupt `nodes`/`edges` JSON | Uncaught `JSON.parse` — no dedicated message. |
| Empty but valid canvas | Same empty arrays; `<canvas_state>` will match if the client also has no nodes. |

Related message (from `apply_workflow`, not this tool):

```
The canvas changed while apply_workflow was running (the user or another client edited it), so nothing was written. Call get_canvas_state, then retry apply_workflow against the current canvas.
```

## Chains

1. **Start of turn, existing workflow** — read prompts, `selectedImage`, `source: "canvas-upload"`, and ids from `<canvas_state>`. Call `view_canvas_images` (with `node_ids` when you know them) to see pixels. Call this tool only if the snapshot is unusable.
2. **After a successful merge** — `apply_workflow` / `place_node` → this tool if you need ids for `finish_turn` `focus_node` / `generate`, or to confirm wiring. Then `view_canvas_images` only if you must verify appearance.
3. **Concurrent edit** — `apply_workflow` conflict text above → this tool → retry **once** with only the targeted nodes, reusing current ids. No `remove_node_ids` unless the user asked to delete.
4. **Iterate a chosen generation** — read `selectedImage` (`stored:gi_<id>`) → `apply_workflow` swipeFile `kind: "reference"` with that `image_source` on `ref-in`.

## Example

User: « remplace le texte du prompt par un fond noir, garde le reste. » `<project_id>` is `proj-open`. `<canvas_state>` at turn start already has the graph; you still call this after a failed apply because the canvas changed under you.

Call:

```json
{ "project_id": "proj-open" }
```

Return (text):

```json
{
  "nodes": [
    {
      "id": "p-1",
      "type": "prompt",
      "summary": { "prompt": "hello world", "negativePrompt": "blur" }
    },
    {
      "id": "g-1",
      "type": "generator",
      "summary": {
        "model": "gemini-3.1-flash-image",
        "aspectRatio": "16x9",
        "count": 2,
        "abTest": { "variants": ["A", "B"] },
        "generatedCount": 2,
        "selectedImage": "stored:gi_g2"
      }
    },
    {
      "id": "f-1",
      "type": "faceReference",
      "summary": { "persona": "stored:persona_abc", "label": "Antoine" }
    },
    {
      "id": "s-1",
      "type": "swipeFile",
      "summary": { "label": "Brand", "kind": "logo", "source": "canvas-upload", "hasImage": true }
    },
    {
      "id": "sw-lib",
      "type": "swipeFile",
      "summary": { "label": "Réf", "kind": "reference", "source": "library:stored:sf_abc", "hasImage": true }
    },
    {
      "id": "prev",
      "type": "preview",
      "summary": { "label": "Nano #1", "hasOutput": true, "imageCount": 1, "selectedImage": "stored:gi_p1" }
    },
    {
      "id": "txt",
      "type": "textOverlay",
      "summary": {
        "text": "ÇA CHANGE TOUT",
        "color": "#FFFFFF",
        "strokeColor": "#000000",
        "position": "top",
        "fontScale": 1.2,
        "hasOutput": false
      }
    }
  ],
  "edges": [
    { "source": "p-1", "target": "g-1", "targetHandle": "prompt-in" },
    { "source": "f-1", "target": "g-1", "targetHandle": "face-in" },
    { "source": "s-1", "target": "g-1", "targetHandle": "logo-in" }
  ]
}
```

Retry `apply_workflow` with `project_id: "proj-open"` and **only** node `p-1` (new prompt text). Keep `g-1`, `f-1`, `s-1`. Do not send `remove_node_ids`. Do not dump this JSON in chat. `s-1` is `canvas-upload` — there is no `image_source` to recreate it; leaving the node out keeps it.
