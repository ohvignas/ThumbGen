---
name: view_canvas_images
description: Sends canvas pixels (sketches, logos, Personnage, generated, uploads) to vision. @mentions and analyse / regarder / améliorer / iterate already attach those JPEGs on this user turn — call this only for other nodes. Not for ids, prompts or selectedImage refs — those live in <canvas_state> / get_canvas_state.
---

# view_canvas_images

Look at the pixels on the open canvas. Free (no paid generation). Token-heavy: at most 8 JPEGs per call, longest side 768px. Images stay in the collapsed step list — they are **not** a chat visual result.

## When to use

- The user talks about how something **looks**: "cette image", "le fond", "le visage", "le logo", "le croquis", "change the colours".
- Before analysing, completing or modifying an **existing** workflow when the needed nodes are **not** already attached this turn (`<canvas_state>` has nodes). General ask → omit `node_ids`. Targeted ask → pass those ids.
- A generator or preview has `selectedImage` (`stored:gi_<id>` in the snapshot) and you must **see** the chosen output before iterating it.
- You are about to claim something is restored, fixed or back in place — look first.
- A later turn's history replaced prior pixels with `[image retirée de l'historique — rappelle l'outil si besoin]` and you need to see them again.

## When not

- @mention or analyse / regarder / améliorer / iterate this turn: those images are already attached as JPEG file parts on the user message. Call this tool only if you need additional nodes.
- You only need ids, types, prompts, edges, `generatedCount` or `selectedImage` refs. That is already in `<canvas_state>` this turn. If that snapshot might be stale after a write, call `get_canvas_state` — it still returns **no bytes**.
- Empty canvas, or nodes that only hold text (a `prompt` node has nothing to see).
- Brand-new thumbnail from scratch with nothing visual on the canvas yet.
- Every turn "just in case". Call when the request is visual or about that workflow.
- Listing generations that are **not** on this canvas → `list_past_generations`.
- Starting a paid final image. This tool never generates. `finish_turn` `results` must not include this call (`isVisualResultTool` is false). Only `generate_sketch`, `import_youtube_thumbnail` and `search_youtube` produce visual chat cards.

**Vs `get_canvas_state`:** that tool (and the injected snapshot) is a compact JSON blueprint: node id, type, summary, edges. Summaries name `selectedImage` as `stored:gi_<id>`, image origin as `library:<ref>` or `canvas-upload`, prompts, overlay text. Unknown project → `{ "nodes": [], "edges": [] }`, not an error. **This** tool returns JPEG parts so you can actually see sketches, imports, logos, Personnage, generated images and preview outputs. Unknown project **is** an error.

## How

```
project_id: string   # required — copy from <project_id>
node_ids?: string[]  # optional — restrict to those nodes
```

**Scope**

- Omit `node_ids`: every node that currently carries an image, in **canvas order** (the stored nodes array). Prompt-only nodes are skipped.
- Pass `node_ids`: those nodes only, still in canvas order. A requested node with no readable image still gets a text line. Unknown ids get the missing-nodes line (does not abort the rest).

**What each type contributes** (most relevant first)

| type | Images sent |
|---|---|
| `sketch`, `swipeFile` | One: `imageBase64` else `imageUrl` else `image_source` |
| `faceReference` | One: Personnage **front** angle, else left, else right, else `imageBase64` / `imageUrl`, else `stored:persona_<id>` |
| `generator` | At most **2**. The **selected** image first (`selectedImageIndex` required to count as selected), then the newest remaining |
| `preview`, `textOverlay` | One: selected generated output (index defaults to 0), else `imageBase64` / `imageUrl` |
| anything else | One: `imageBase64` else `imageUrl` |

A generator with no `selectedImageIndex` still sends up to 2, newest first. A/B lists (`generatedImages` then variants A, B, C) are flattened; the cap of 2 still applies.

**Limits (hard)**

- 8 images **per call**, all nodes together (`MAX_IMAGES_PER_CALL`).
- 2 images **per generator** (`MAX_IMAGES_PER_GENERATOR`).
- Longest side 768px JPEG quality 80, never upscaled. Transparent pixels flatten on white.
- Decode cap 40_000_000 pixels — a huge file becomes unreadable rather than crashing the call.
- Reads **locally** (inline data URL or the DB). Never HTTP. One unreadable image never fails the whole call.

**Output shape**

Each readable image is a text header immediately followed by a JPEG part:

```
node <id> (<type>, <label>) — image k/n — stored:gi_<id>
```

- Label is `data.label`, or the generator's `model` when it has no label. No label → `node <id> (<type>)`.
- `k/n` is the count **this node actually sent this call**, not the node's full history.
- The stored ref is appended only when `toImageSourceRef` can name one: `stored:gi_…`, `stored:sf_…`, `stored:lg_…`, `stored:persona_…`, `generated:…`, `uploaded:…`. Canvas-upload / inline `data:` bytes have **no** ref.
- Copy those refs as `image_source` later (e.g. swipeFile `kind: "reference"` on the generator's `ref-in`).

**After this turn:** later model input replaces the JPEG parts with `[image retirée de l'historique — rappelle l'outil si besoin]`. Headers and refs stay. Stored rows and the UI history are not rewritten. Recall this tool if you need pixels again — do not regenerate.

## Errors

Quote and act on the real strings. `isError: true` only for the first two.

| When | Text | What you do |
|---|---|---|
| Unknown `project_id` | `Projet introuvable : <id>. Le canvas n'est peut-être pas encore enregistré (sauvegarde ~2 s après une modification) — réessaie dans un instant.` | Retry once shortly (autosave ~2 s). Then tell the user the canvas is not saved yet. |
| Corrupt `nodes` JSON | `Canvas illisible (données corrompues) pour le projet <id>.` | Stop. One sentence: the canvas data is unreadable. Do not invent nodes. |
| Requested id not on canvas | `Nœuds introuvables sur le canvas : <ids>. Le canvas n'est peut-être pas encore enregistré (sauvegarde ~2 s après une modification) — réessaie dans un instant.` | Retry once with the same ids after a beat. Other requested nodes still return. |
| Node has nothing you can decode | `node <id> (<type>[, <label>]) — pas d'image lisible` | Believe it. A prompt node requested by id will say this. A broken sketch URL says this too. |
| Hit the 8-image cap | `Limite de 8 images atteinte — non affichés : <skipped>. Rappelle view_canvas_images avec node_ids pour les voir.` | Immediately recall with `node_ids` for the skipped ids. A generator cut mid-way is named `gen2 (1 image sur 2)` (or `N images sur M`). A node not shown at all is just its id. |
| No image-bearing node (and no `node_ids` miss) | `Aucune image sur le canvas.` | Do not pretend you looked at pictures. Use the snapshot for structure only. |

The autosave hint is always this exact sentence:

`Le canvas n'est peut-être pas encore enregistré (sauvegarde ~2 s après une modification) — réessaie dans un instant.`

## Chains

1. **Existing workflow (vague)** — @ / analyse / améliorer already attach the current JPEG. Call this tool only for extra nodes. Then read prompts in `<canvas_state>` → treat `selectedImage` as the start point → `finish_turn` with 1–2 sentences and 1–3 `ask_agent` buttons. Modify **nothing** this turn.
2. **Existing workflow (precise)** — look at attached pixels (or this tool on extra nodes) → `apply_workflow` with **only** changed or added nodes, same ids. Never `remove_node_ids` unless they asked to delete.
3. **Iterate a chosen generation** — header `stored:gi_<id>` (or snapshot `selectedImage`) → swipeFile `kind: "reference"`, `image_source: "stored:gi_<id>"` on `ref-in`. Do not rebuild the whole graph.
4. **Verify a fix** — after `apply_workflow` / restore, call this again (or re-read `<canvas_state>` for structure). Never say it is restored without that check.
5. **Canvas changed under you** — `apply_workflow` says so → `get_canvas_state` (not this tool) → retry the same targeted write once.
6. **Cap / history / unsaved** — recall with `node_ids`; recall after the history placeholder; retry once on the unsaved hint.
7. **End the turn** — `finish_turn` last, alone. Leave `results` empty for this tool.

Load `existing-workflow` when `<canvas_state>` is non-empty and the request is about that workflow. Do not start a 7-step packaging interview.

## Example

User: "Le fond de la miniature est trop sombre, améliore."
`<canvas_state>` has `gen` (generator, `selectedImage: "stored:gi_vci-g2"`, `generatedCount: 3`), `face`, a swipeFile upload, a preview.

The current thumbnail JPEG is already attached this turn. Call this tool only if you also need the Personnage or the import:

```
view_canvas_images
  project_id: <project_id>
  node_ids: ["face", "upload"]
```

Typical headers (canvas order, prompt nodes omitted):

```
node upload (swipeFile, images (3).png) — image 1/1
node face (faceReference, Antoine) — image 1/1 — stored:persona_vci-persona
node gen (generator, gemini-3.1-flash-image) — image 1/2 — stored:gi_vci-g2
node gen (generator, gemini-3.1-flash-image) — image 2/2 — stored:gi_vci-g3
node prev (preview, Nano #1) — image 1/1 — stored:gi_vci-p1
```

You now **see** the selected image (`image 1/2` = `stored:gi_vci-g2`) and the Personnage. The ask is still vague (how much lighter? keep the face?) → `finish_turn` with a short summary and `ask_agent` options. Do not `apply_workflow` yet.

If they had said "remplace le texte par X", you would still look, then act the same turn with only the changed nodes.

If the cap line listed `s8, s9, s10`, next call:

```
view_canvas_images
  project_id: <project_id>
  node_ids: ["s8", "s9", "s10"]
```
