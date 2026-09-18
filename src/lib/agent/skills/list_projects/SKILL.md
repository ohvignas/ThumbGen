---
name: list_projects
description: Lists every ThumbGen miniature (projects_meta id, name, dates). Use when the user asks what they have or names another project. Not for the open canvas (already <project_id>) and not for one project's images (list_past_generations).
---

# list_projects

Read-only catalog of **all** miniatures. Local SQLite, no args, no quota, no writes. The chat stays on the open canvas; this tool does not switch it.

## Contrast

| Need | Source |
|---|---|
| Id of the **open** canvas | Injected `<project_id>`. Do not call this tool to learn it. |
| Nodes / prompts on the open canvas | Injected `<canvas_state>`, or `get_canvas_state` with that id |
| Pixels on a canvas | `view_canvas_images` (`project_id` required) |
| Paid renders / `stored:gi_<id>` of **one** project | `list_past_generations` (`project_id` required, optional `limit` 1–100 default 20) |
| Names and ids of **every** miniature | `list_projects` (this tool) |

`<project_id>` is the current canvas. Pass **that** id to `apply_workflow`, `place_node`, `get_canvas_state`, `view_canvas_images`, `list_past_generations`. `list_projects` does not take `project_id` and must not replace that block.

`list_past_generations` is not a project list. It reads `generations_log` for one id and returns model, prompt, cost, and `stored:gi_<id>` refs. Empty project → `No generations found for this project.` Wire a chosen image as swipeFile `kind: "reference"`, `image_source: "stored:gi_<id>"` on the **open** generator's `ref-in`.

Two tables: `projects_meta` (this tool — id, name, timestamps) vs `projects` (canvas JSON — `get_canvas_state`). This SELECT never joins `projects` and never returns nodes, edges, or image bytes.

## When

- « Mes miniatures », « quels projets j'ai », « mes autres miniatures »
- They name a miniature that is **not** the open canvas (« la miniature finance », « celle d'hier »)
- Comparing or remixing across projects (then chain — see below)
- MCP with no `<project_id>` block: discover ids before any per-project tool

## When not

- You already have `<project_id>` and the request is about **this** canvas — use it
- Reading the open workflow → `<canvas_state>` / `get_canvas_state`
- Seeing images on the open canvas → `view_canvas_images`
- Past outputs of one project → `list_past_generations` with `<project_id>` (open) or an id from this list (another miniature)
- Library assets → `list_personas` / `list_logos` / `list_swipe_files`
- Creating, renaming, or deleting a miniature — this tool cannot
- Every turn « just in case », or again in the same conversation if the list is still in context
- Passing `project_id` (or any other field) into this tool

## How

Call with `{}`. Schema is empty (`z.object({})`). UI step label: « Liste tes miniatures ». Exposed in chat and MCP (`chatOnly` is unset).

SQL: `SELECT id, name, created_at, updated_at FROM projects_meta ORDER BY updated_at DESC`.

- Newest **edit** first (`updated_at`), not gallery order (`created_at ASC` in the app's own `listProjects()`)
- `description` exists on the table but is **not** selected
- `created_at` is selected but **not** printed — only `updated_at` appears in each line
- Typical ids: `proj_<timestamp>`, or `default` named `"Mon projet"`

Success:

```
N project(s):
- <id> — "<name>" (updated <updated_at>)
```

English tool text. Do not dump it as the user-facing answer. `finish_turn.summary` in the reply language, names not ids unless they asked. No `result_id` — leave `finish_turn.results` empty. Max 3 `next_actions`.

This call does **not** change the open canvas, the conversation's `project_id`, or `<project_id>` on the next turn. In chat, keep writes (`apply_workflow`, `place_node`) on `<project_id>`. To work inside another miniature, tell them to open it in the gallery. To reuse its look on **this** canvas, take `stored:gi_<id>` from `list_past_generations` and wire `ref-in`.

MCP may pass a listed id into `get_canvas_state` / `list_past_generations` / `apply_workflow` when the user named that project. `get_canvas_state` on an unknown id returns `{"nodes":[],"edges":[]}` (not an error). `place_node` on a missing canvas returns `Project not found: <id>`.

## Errors

The handler never sets `isError`. Failures you will actually see:

| Text | Meaning |
|---|---|
| `No projects found.` | `projects_meta` is empty. Say the gallery has no miniatures. Do not invent ids. |
| MCP `Invalid arguments: …` | Non-object input. Retry with `{}`. |
| Uncaught SQLite error | Rare DB failure. One sentence; do not retry in a loop. |

A long list is not an error. Summarize; offer at most three named miniatures as `ask_agent` buttons. Matching a spoken name is your job — there is no search parameter.

## Chains

1. **Other miniature → its images.** `list_projects` → pick the id whose name matches → `list_past_generations` `{ project_id, limit }` → put `stored:gi_<id>` on the **open** canvas `ref-in` (existing-workflow). Do not `apply_workflow` on the other id from chat.
2. **Other miniature → its graph (MCP / explicit inspect).** `list_projects` → `get_canvas_state` `{ project_id }` → `view_canvas_images` only if they need pixels. Still do not silently write that canvas from the in-app chat.
3. **This miniature's history.** Skip this tool. `list_past_generations` with `<project_id>`.
4. **This miniature's canvas.** Skip this tool. `<canvas_state>` / `get_canvas_state` / `view_canvas_images` with `<project_id>`.
5. **New thumbnail on the open canvas.** `thumbnail-packaging`, not a project tour.

Always `read_skill` for a chained tool you have not loaded yet. End the turn with `finish_turn` once, alone.

## Example

User: « C'est quoi mes autres miniatures ? Y'en a une sur la finance, tu peux reprendre son visuel. »

1. `list_projects` `{}`
2. Match the finance name; copy its `id` (not `<project_id>`)
3. `list_past_generations` `{ "project_id": "<that id>" }`
4. Choose a `stored:gi_…` line
5. `apply_workflow` on **`<project_id>`** with a swipeFile `kind: "reference"` `image_source: "stored:gi_<id>"` on `ref-in` — or, if the ask is still vague, `finish_turn` with that proposal as `ask_agent`

Do not tell them you opened the other project. You listed it, then reused one image on the canvas they already have open.
