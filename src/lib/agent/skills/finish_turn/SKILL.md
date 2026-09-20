---
name: finish_turn
description: Ends every Brainstorm turn as the last, alone tool call so the chat shows only summary and visual result_id cards. next_actions must be []. Use after other tools return. Never start a paid generation.
---

# finish_turn

Chat-only closer. No DB write, no paid API, no canvas patch. The handler returns `{ "ok": true }` and does nothing else. The panel reads **your input**: `summary` is the answer, `results` are the visual cards. **`next_actions` must be `[]`** — the chat has no generate / voir / focus chips. Everything else from the turn (reasoning, free text, other tools) is folded into a collapsed step list. This call itself is never a step.

The tool loop **stops** as soon as a step contains `finish_turn`. MCP clients never see this tool.

Load this skill before the first `finish_turn` in a conversation. There is no 7-step pipeline and no « Étape n/7 ».

## When

- **Every turn**, including a plain reply with no other tools.
- After other tools in this turn have returned (you need their `result_id` lines and generator ids).
- After a **resumed** turn: you called `ask_user` or `request_user_image` **alone**, the user answered, you acted, then you close.
- After `place_node` / `apply_workflow` shipped a generator **because they asked to generate or to build the full thumbnail** — tell them in `summary` that the workflow is on the canvas. They click « Générer » on the node. `next_actions: []`.
- After `generate_sketch` / `import_youtube_thumbnail` / `search_youtube` when those images should stay visible.
- A vague look at an existing canvas: 1–2 sentences; change nothing.

## When not

- **Prompt-only work** (`create-prompt`, "écris le prompt", fill the prompt node): `next_actions` **must be `[]`**. A generator already on the canvas is not a reason to mention « Générer » as a chat button. They will ask if they want images later.

- **Same model step as any other tool.** Wait until those results are back, then call this **alone**. Same-step `finish_turn` cannot read `result_id` (the adapter prints it only after the visual tool returns). Same-step `ask_user` / `request_user_image` pauses the turn **and** stops the loop — after they answer, the client auto-continues a turn you already closed.
- **Before** the work of the turn is done (you still need a list, a sketch, a place, a question).
- A second time in the same turn. Once. Last. Alone. Extra calls are waste; the UI keeps the last **valid** input.
- Mid-streaming: an `input-streaming` call is ignored until the input is complete and valid.
- MCP / external clients — not registered.
- To **start** a paid canvas generation yourself. You never run Seedream / GPT Image / nano-banana. `generate_sketch` (~$0.02 draft) is a different tool; the finished thumb starts only on their click of « Générer » on the canvas generator.
- Do **not** skip this call and dump a long markdown answer instead. Free text before the call is folded, not shown as the answer.

## How

Call `finish_turn` with this object. Omitted `results` / `next_actions` become `[]`. Strings are trimmed; a blank after trim is invalid.

### `summary` (required)

Your answer. **1–2 short sentences**, **1–400 characters**, in the **reply language** (`<response_language>`). What you did, what you found, or what you need.

- **Bold** on **one** key phrase is fine.
- No headings, no lists, no walls of text, no JSON, no raw refs (`stored:…`, `generated:sk_…`) unless they asked.
- Do not paste transcripts, tool dumps, or blueprint JSON. At most one short sentence (or nothing) in free text **before** this call — it only appears in the folded list.

### `results` (optional, default `[]`)

Up to **6** strings: `result_id` values of **this turn's** visual tool calls, in **display order**.

Only these tools emit a visual card, and only on **success** (`isError` is not set). The AI SDK adapter appends a last text line `result_id: <toolCallId>` so you can cite the call — you never see tool-call ids otherwise. MCP has no such line.

| Tool | What the card shows | Put in `results`? |
| --- | --- | --- |
| `generate_sketch` | The croquis (plus a « + canvas » control) | Yes, copy the id, if you want them to see it |
| `import_youtube_thumbnail` | The imported JPEG (no « + canvas ») | Yes, if you want them to see the import |
| `search_youtube` | Full-width gallery of loaded thumbs | Yes, if the gallery has images worth showing |

**Copy the id exactly** (the token after `result_id: `). The UI also accepts a value that still has the `result_id: ` prefix, but do not rely on that. Do **not** put `stored:sf_<id>`, `generated:sk_<id>`, `youtube:<id>`, node ids, or this call's own id in `results`.

One `search_youtube` call = **one** `result_id` (the whole gallery), not one id per video. Duplicate ids are shown once. Unknown ids are skipped. Failed visuals and outputs **without an image** never render, even if you cite them (empty `search_youtube` text list, error sketch). If you list ids and **none** resolve, the UI falls back to every showable visual of the turn — a same-step bug. Cite real ids.

Leave `results: []` when nothing visual is worth showing (`list_*`, `get_canvas_state`, `view_canvas_images`, `apply_workflow`, `place_node`, `analyze_thumbnails`, `find_competitor_thumbnails`, `get_channel_videos`, `search_youtube_channel`, `extract_youtube_script`, …). An explicit empty list **hides** sketches that ran this turn. Omit a failed or empty visual rather than padding.

### `next_actions` (optional, default `[]`)

**Always `[]`.** The chat does not render generate / focus_node / ask_agent chips — they raced the canvas autosave and re-fired paid runs. Tell them in `summary` what you did. They click « Générer » on the canvas themselves.

The schema still accepts the old kinds so stored messages parse; the UI ignores them. Do not send `generate`, `focus_node`, or `ask_agent`.

### Output (you receive)

```json
{ "ok": true }
```

Then stop. Do not call more tools in this turn.

## Errors

Schema is checked **before** the handler. On refusal, fix the input and call **once** more; do not invent a spoken answer in free text.

| Signal | Cause | Do |
| --- | --- | --- |
| missing / blank / >400 `summary` | required 1–400 after trim | Shorten; 1–2 sentences |
| `results` length 7+ | max 6 | Keep the ones they should see |
| `next_actions` length 4+ | max 3 | Drop the weakest |
| `label is required when kind is ask_agent` / `focus_node` | you omitted it | Add a ≤40 char label |
| `message is required when kind is ask_agent` | you omitted it | Add ≤300 char user-voice `message` |
| `node_id is required when kind is generate` / `focus_node` | you omitted it | Pass the canvas id |
| `label` >40 or `message` >300 | limits | Shorten |
| unknown `kind` | only the three enums | |
| Invalid or streaming input (UI) | `parseFinishTurnInput` → null | Chat **falls back**: last free text as the answer, every showable visual as results, no buttons. Do not rely on this. |
| `{ "ok": true }` | success | Always, if the schema passed. Not a visual result. |

A disabled « Générer » / « Élément introuvable » is a **wrong `node_id`**, not a tool error — you placed a different id, or the node is not a generator. Read `<canvas_state>` / `get_canvas_state` next turn if needed.

Quote schema text in one sentence if you must explain a failed call. Do not dump Zod JSON.

## Chains

Typical order in **separate** steps of one turn:

1. Work: lists, research, `generate_sketch`, imports, `place_node` / `apply_workflow` (several `place_node` may share a step; never with this tool).
2. Optional pause: `ask_user` or `request_user_image` **alone**. No `finish_turn` until they answer and you finish the resumed turn.
3. `finish_turn` **once, alone**.

After a croquis: `results` with that `result_id`. When they validate, later turn: wire the canvas. They click « Générer » on the node.

After a generator is on the canvas: `next_actions: []`. Tell them in `summary` the workflow is ready.

Existing canvas, vague ask: `view_canvas_images` then this tool — no `apply_workflow`.

Do not put this call in `results`. Chat label while it streams: « Rédige la réponse ».

## Example

User already chose the package, Personnage, logo. You placed `iv-prompt`, `iv-persona`, `iv-logo-1`, `iv-generator` in the previous step. Close so **they** pay:

```json
{
  "summary": "Le workflow A est sur le canvas : toi à droite, logo Claude à gauche.",
  "results": [],
  "next_actions": []
}
```

`apply_workflow` A/B that printed `Generator node id: gen`:

```json
{
  "summary": "A choc et B duel sont câblés. Un clic lance les deux variantes.",
  "results": [],
  "next_actions": []
}
```

After two successful sketches this turn (`result_id: call_7` and `result_id: call_8`). Debate, do **not** generate:

```json
{
  "summary": "Deux **croquis** : A visage serré, B duel avec le logo. On garde lequel ?",
  "results": ["call_7", "call_8"],
  "next_actions": []
}
```
