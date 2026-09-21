---
name: existing-workflow
description: Use when <canvas_state> has nodes AND the user talks about that existing workflow (look, analyse, complete, improve, or change it) — not when they want a brand-new thumbnail. Iterating a generated aperçu = short edit prompt + that image on ref-in (same angle), not a scene rewrite. First-gen A/B still uses full prompts.
---

# existing-workflow

The open canvas is the user's work. `apply_workflow` **merges**. **Omit = keep.** See pixels before judging. Vague → ask, write nothing. Precise → targeted apply the same turn. Never claim restored without checking.

Load `view_canvas_images`, `apply_workflow`, and `get_canvas_state` with `read_skill` before the first use of each. This skill is the playbook; those skills are the param tables.

## When

Canvas has nodes and the request is about THAT workflow ("regarde", "analyse", "améliore cette miniature", "change le fond", "remplace le texte par X").

## When not

- Empty canvas, or a **new** thumbnail ("fais-moi une miniature", "propose-moi des idées") → `thumbnail-packaging`
- One live `iv-*` interview node → `place_node` (no `abTest` on `iv-generator`)
- Start a paid generation → they click « Générer » on the canvas generator; only that click costs money
- Every turn "just in case" on an unrelated chat
- A numbered 7-step interview / « Étape n/7 » / THUMBNAIL JOURNEY. There isn't one.

## How

1. **Confirm the canvas is the subject.** `<canvas_state>` has nodes. The user is talking about this graph, not a blank idea. Precise wording ("remplace le texte par X") is **not** a request to analyse first and wait: look, then act this turn (step 6).

2. **See the pixels.** For @mentions and analyse / regarder / améliorer / iterate, JPEGs are already attached on this user turn — look at those file parts first. Call `view_canvas_images` only if you need more nodes (sketches, logos, Personnage, other generators). General ask without those attachments → omit `node_ids` (every image-bearing node, canvas order). Targeted ask → those ids. Prompt-only nodes have nothing to see. Hard cap: 8 JPEGs/call, longest side 768px, 2 images per generator (selected first, then newest). Hit the cap → recall immediately with the skipped `node_ids`. Unknown project / missing ids: retry once (autosave ~2 s), then tell them. History later replaces JPEG parts with `[image retirée de l'historique — rappelle l'outil si besoin]` — recall if you need pixels again. Do **not** call `get_canvas_state` to see images; it returns no bytes.

3. **Read structure from `<canvas_state>`.** Prefer the injected snapshot at turn start (live React Flow). Call `get_canvas_state` only after a write this turn, or when `apply_workflow` says the canvas changed (SQLite; the DB can lag a drop that is already in `<canvas_state>`). If this tool returns `{ "nodes": [], "edges": [], "liveSketchCount": 0 }` while the injected snapshot has nodes, **trust the snapshot** — do not wipe. Do not paste JSON to the user.

4. **Notice sources and the start point.**
   - Prompts, `abTest`, edges/`targetHandle`, `generatedCount`.
   - Generator or preview `selectedImage` is `stored:gi_<id>` when they picked a frame. That is the image to iterate from. `selectedVisibleId` / `images[].visibleId` / `currentThumbnails[].visibleId` are the `#XXXXXX` badges; `@#XXXXXX` or `<mentioned_images>` means that thumbnail.
   - swipeFile / sketch `source: "library:<ref>"` (`library:stored:sf_…`, `library:stored:lg_…`, `library:stored:gi_…`, `library:generated:…`, `library:uploaded:…`) → reusable as `image_source`.
   - `source: "canvas-upload"` → user import (e.g. « images (3).png ») with **no** ref. You cannot rebuild it. **Omit the node to keep it.** Sending a new `image_source` replaces the import. There is no `image_source` to recreate a canvas-upload.

5. **Vague → ask, modify nothing.** Vague = "regarde", "analyse", "améliore", "change le fond" without saying how, which text, which node. After steps 2–4: `finish_turn` last, alone, with `summary` 1–2 sentences of what you saw, plus 1–3 `ask_agent` buttons in the user's voice (e.g. label « Garder la compo », message « Garde la composition, change seulement le fond. »). **Do not** call `apply_workflow`, `place_node`, or `remove_node_ids` this turn.

6. **Precise → targeted merge the same turn.** After looking at attached pixels (or `view_canvas_images` on extra nodes), call `apply_workflow` with `project_id` and a blueprint of **only** the nodes you add or change, **reusing canvas ids**. Omitted nodes stay, including the second generator, imports, previews, overlays, generated images. Never resend the whole canvas. **Omit `edges` (or send `[]`) when you only update nodes** — existing wiring stays. Never `remove_node_ids` unless they **explicitly asked to delete** (those ids and their edges go; unknown ids are ignored and reported). Disconnect with `remove_edges` (`source` + `target` + `targetHandle`). A node cannot be in both the blueprint and `remove_node_ids`.

7. **Merge rules (omit = keep).** Existing id → UPDATE: only the `data` fields you send change. Position, generated images, imported `imageBase64`/`imageUrl`, persona angles, generator settings (`numImages`, `selectedImageIndex`, `imageSize`, …) stay. Omit `image_source` to keep the current image. **Type cannot change** (new id for a new type). `{ id, type }` with no `data` is a no-op update, valid for wiring a new edge onto it. New id → CREATE: full data required (`image_source` on faceReference / swipeFile / sketch). Do not send `position` (new nodes layout among themselves, then 200px to the right of the existing canvas; existing nodes never move). Do not create `preview` or `textOverlay` — leave them by omitting them. Faces are Personnages only: `stored:persona_<id>`, never `stored:fr_*` or a one-off photo. Omit `edges` when you only patch nodes. Blueprint edges, if sent, are added and deduped; existing edges stay unless `remove_edges`.

8. **Iterate a chosen generation (ITERATE THIS IMAGE, not first gen).** `<canvas_state>.currentThumbnails` (when present) names the current aperçu and its parent prompt — that is the work source. Copy `stored:gi_<id>` from `selectedImage` or from a `view_canvas_images` header (`node <id> (generator, …) — image 1/2 — stored:gi_<id>`). Wire that image as the **primary edit source**: preview → `ref-in`, or new/existing `swipeFile` `kind: "reference"` with `image_source: "stored:gi_<id>"` on `ref-in` (or `ref-in-b` / `ref-in-c` if only that variant should see it). Write a **short change-only prompt** (1–3 sentences: text / emotion / color, then "keep the rest"). Keep the chain: original prompt + this generation + the requested change. Do **not** write a 7-sentence scene recreation — the pixels already are the prompt. Short because you are iterating, not because A/B is on. If A/B slots stay on, each variant can still be a short delta on the same generated ref (or per-variant refs). Do not rebuild the graph. Off-canvas gens → `list_past_generations`.

9. **After a successful apply.** Tool text looks like `Applied: X created, Y updated, Z removed (kept N untouched).` plus Created / Updated / Removed ids and `Generator node id: <id>`. Tell them the workflow is ready. Then `finish_turn` last, alone: `summary` 1–2 sentences; `next_actions: []`. Never dump JSON. You never click « Générer ».

10. **Conflict.** If apply returns that the canvas changed while it was running, **nothing was written** (no snapshot). Call `get_canvas_state`, retry **once** against current ids, still only targeted nodes, still no `remove_node_ids` unless they asked to delete. If it fails again, one sentence to the user.

11. **Verify before you claim anything.** Never say the canvas is restored, fixed, or "back" without looking: `get_canvas_state` / a fresh `<canvas_state>` for ids and wiring, `view_canvas_images` for pixels. The user restores from « Historique de l'agent » (snapshots before each successful apply). You do not "restore" by rewriting the whole graph.

## Merge at a glance

| You send | What happens |
| --- | --- |
| Node id already on canvas | Update given `data` only. Omit = keep. |
| New id | Create (full data). Placed to the right. |
| Node not in the blueprint | Kept. A 4-node blueprint on a 14-node canvas deletes **nothing**. |
| `edges` omitted or `[]` | Graph kept. Valid when you only update nodes. |
| `remove_node_ids` | Delete those ids + edges. Only if they asked. |
| `remove_edges` | Disconnect that triple. Other edges stay. |
| New `image_source` on an existing node | Replaces the image. On a sketch, drops stale Excalidraw. |
| No `image_source` on an existing node | Current image kept (required for canvas-upload). |
| `preview` / `textOverlay` in the blueprint | Don't. Not blueprint types. Omit them. |

## Image refs

| In the snapshot / header | Meaning | Reuse |
| --- | --- | --- |
| `selectedImage: "stored:gi_<id>"` | Chosen generated frame | swipeFile `kind: "reference"` on `ref-in` |
| `library:stored:lg_<id>` / `sf_` / `gi_` / `persona_` | Library / past gen / Personnage | that ref as `image_source` |
| `library:generated:sk_<id>` | Sketch from `generate_sketch` | `generated:sk_<id>` |
| `library:uploaded:<id>` | Chat upload | `uploaded:<id>` |
| `source: "canvas-upload"` | Inline import, no ref | **Omit the node.** Do not invent a source. |

`view_canvas_images` headers look like `node gen (generator, gemini-3.1-flash-image) — image 1/2 — stored:gi_vci-g2`. Canvas-upload / inline `data:` bytes have **no** ref on the header.

## Vague vs precise

| User says | This turn |
| --- | --- |
| "regarde le workflow", "analyse", "améliore", "le fond est trop sombre" | Pixels already attached this turn. `finish_turn` + `ask_agent`. `view_canvas_images` only for extra nodes. No write. |
| "remplace le texte par X", "supprime le logo", "branche cette image en référence" | Look, then `apply_workflow` with only those nodes. |

## Example — vague

`<canvas_state>` has `gen` (`selectedImage: "stored:gi_vci-g2"`), a Personnage, a swipeFile upload (`source: "canvas-upload"`), a second generator the user added by hand.

User: "Le fond de la miniature est trop sombre, améliore."

The current thumbnail JPEG is already attached this turn. Call `view_canvas_images` only if you also need the Personnage or the import. Ask whether to keep the face and how much lighter. `finish_turn` with 1–3 `ask_agent` options. Do not `apply_workflow`. Do not send `remove_node_ids`. Leaving the upload and the second generator out is how they survive — you are not sending a write at all.

## Example — precise

User: "remplace le texte par INSTANT, garde le reste." Canvas ids `prompt-1` → `gen-1`.

```
view_canvas_images
  project_id: <project_id>
  node_ids: ["prompt-1", "gen-1"]
```

Then `apply_workflow`:

```json
{
  "nodes": [{ "id": "prompt-1", "type": "prompt", "data": { "prompt": "Change the overlay to INSTANT. Keep the rest of the thumbnail unchanged." } }]
}
```

Do not resend the face, logo, canvas-upload, preview, or overlay. Do not rewrite "Young man in the left third…". `finish_turn` with `next_actions: []`.

Iterate that chosen output: add `{ "id": "ref-iter", "type": "swipeFile", "data": { "kind": "reference", "image_source": "stored:gi_vci-g2" } }` and `{ "source": "ref-iter", "target": "gen-1", "targetHandle": "ref-in" }`. Prompt stays a short delta.

## Mistakes

| Excuse | Reality |
| --- | --- |
| "I'll send the complete blueprint so nothing is lost" | Completeness deletes. Omit = keep. The 2026-09-17 14-node canvas died that way. |
| "get_canvas_state is enough, hasImage is true" | That is a flag. Call `view_canvas_images` to see. |
| "Vague improve → just rewrite the prompt" | Ask first. Precise text swap → act. |
| "Iterate = rewrite a full new scene" / "A/B means short prompts" | No. Iterate = short delta + the generated thumb on `ref-in` (same angle). First-gen A/B (no generated source) still uses two complete 7-sentence prompts. A/B is variant slots only. |
| "I'll recreate the import from memory" | `canvas-upload` has no `image_source`. Omit it. |
| "remove_node_ids to replace the graph" | Only when they asked to delete. |
| "It's restored, I applied again" | Look first (`view_canvas_images` / snapshot). Historique de l'agent is the restore path. |
| "Start the 7-step journey on this canvas" | No. This skill, then targeted tools. |

## Chains

1. Vague look / improve → pixels already attached for @ / analyse / améliorer; `view_canvas_images` only if more nodes needed → read `<canvas_state>` → `finish_turn` (`ask_agent`). Modify nothing.
2. Precise edit → look at attached pixels (or `view_canvas_images` on extra nodes) → `apply_workflow` (only those ids) → `finish_turn` (`generate`).
3. Iterate selected image → `stored:gi_<id>` on `ref-in` (step 8).
4. Apply conflict → `get_canvas_state` → retry once.
5. Cap / history placeholder / unsaved project → recall `view_canvas_images` as its skill says.

End every turn with `finish_turn` last, alone.
