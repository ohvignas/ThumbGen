---
name: finish_turn
description: Ends every Brainstorm turn as the last, alone tool call so the chat shows only summary, visual result_id cards, and 0–3 next_actions (ask_agent, focus_node, generate). Use after other tools return. Never ask_agent that starts a paid generation.
---

# finish_turn

Chat-only closer. No DB write, no paid API, no canvas patch. The handler returns `{ "ok": true }` and does nothing else. The panel reads **your input**: `summary` is the answer, `results` are the visual cards, `next_actions` are the « Et maintenant » buttons. Everything else from the turn (reasoning, free text, other tools) is folded into a collapsed step list. This call itself is never a step.

The tool loop **stops** as soon as a step contains `finish_turn`. MCP clients never see this tool.

Load this skill before the first `finish_turn` in a conversation. There is no 7-step pipeline and no « Étape n/7 ».

## When

- **Every turn**, including a plain reply with no other tools.
- After other tools in this turn have returned (you need their `result_id` lines and generator ids).
- After a **resumed** turn: you called `ask_user` or `request_user_image` **alone**, the user answered, you acted, then you close.
- After `place_node` / `apply_workflow` shipped a generator — offer `kind: "generate"` so **they** click « Générer ».
- After `generate_sketch` / `import_youtube_thumbnail` / `search_youtube` when those images should stay visible.
- A vague look at an existing canvas: 1–2 sentences + `ask_agent` buttons; change nothing.

## When not

- **Same model step as any other tool.** Wait until those results are back, then call this **alone**. Same-step `finish_turn` cannot read `result_id` (the adapter prints it only after the visual tool returns). Same-step `ask_user` / `request_user_image` pauses the turn **and** stops the loop — after they answer, the client auto-continues a turn you already closed.
- **Before** the work of the turn is done (you still need a list, a sketch, a place, a question).
- A second time in the same turn. Once. Last. Alone. Extra calls are waste; the UI keeps the last **valid** input.
- Mid-streaming: an `input-streaming` call is ignored until the input is complete and valid.
- MCP / external clients — not registered.
- To **start** a paid canvas generation yourself. You never run Seedream / GPT Image / nano-banana. `generate_sketch` (~$0.02 draft) is a different tool; the finished thumb starts only on their click of `kind: "generate"`.
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

**0–3** buttons under « Et maintenant » (last turn only). Each item is one `kind`. Do not send unused fields.

#### Shared

| Field | Limit | Who needs it |
| --- | --- | --- |
| `kind` | `"ask_agent"` \| `"focus_node"` \| `"generate"` | Always |
| `label` | trimmed, 1–**40** characters, reply language | **Required** for `ask_agent` and `focus_node`. **Omit** for `generate` — the app writes « Générer · … · ~x,xx $ » from the node. A label you send on `generate` is ignored. |
| `message` | trimmed, 1–**300** characters | **Required** for `ask_agent` only |
| `node_id` | trimmed, non-empty | **Required** for `focus_node` and `generate` |

Unknown `kind` is refused. Extra `message` / `node_id` on the wrong kind is ignored by the UI.

#### `kind: "ask_agent"`

Needs `label` + `message`. Click sends `message` **as the user's next reply** (their voice, not yours).

```json
{ "kind": "ask_agent", "label": "Garder la compo", "message": "Garde la composition, change seulement le fond." }
```

Write `message` as they would type it. Label is the button (« Garder A », « Sans le texte »).

**Never** an `ask_agent` that would start a **paid canvas generation** (« Génère la miniature », « Lance Seedream », « Clique sur Générer », « Génère pour de vrai »). That run is `kind: "generate"` + their click. Offering another cheap `generate_sketch` retouch is fine; offering the final image is not.

#### `kind: "focus_node"`

Needs `label` + `node_id`. Click selects and centers that canvas node (fit-view). Use when **they** should look at or edit something (the prompt, a ref). `node_id` comes from `<canvas_state>` or from `apply_workflow` / `place_node` this turn (`iv-generator`, `gen`, `prompt-a`, …).

If the node is gone, the button is disabled (« Élément introuvable »). Prefer `kind: "generate"` when the point is to run the generator — that button already selects and centers it.

#### `kind: "generate"`

Needs `node_id` of a **generator** node. **No `label`.** The app computes the caption and USD estimate from the node as it is now (model, count, A/B). Click selects, centers, then dispatches the node's own « Générer » — the **only** code path that starts that paid run. Nothing here runs without the click; it is never replayed from history.

```json
{ "kind": "generate", "node_id": "iv-generator" }
```

Use the id you just placed (`iv-generator`) or the `Generator node id: …` line from `apply_workflow` (often `gen`, or whatever id is on the canvas).

If the node is missing or not a generator: disabled « Générer » (« Élément introuvable »). While it runs: disabled « Génération en cours… ».

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

1. Work: lists, research, `generate_sketch`, imports, `update_brief`, `place_node` / `apply_workflow` (several `place_node` may share a step; never with this tool).
2. Optional pause: `ask_user` or `request_user_image` **alone**. No `finish_turn` until they answer and you finish the resumed turn.
3. `finish_turn` **once, alone**.

After a croquis: `results` with that `result_id`, `ask_agent` to keep / retouch — **not** `generate`. When they validate, later turn: wire the canvas, then `kind: "generate"`.

After a generator is on the canvas: `next_actions: [{ "kind": "generate", "node_id": "<that generator>" }]`. Optional extra `ask_agent` for a non-generation fork (« Changer le texte », « Variante sans visage »). Optional `focus_node` on a **different** node they should edit. Do not pair a redundant `focus_node` on the same generator.

Existing canvas, vague ask: `view_canvas_images` then this tool with `ask_agent` only — no `apply_workflow`.

Do not put this call in `results`. Chat label while it streams: « Rédige la réponse ».

## Example

User already chose the package, Personnage, logo. You placed `iv-prompt`, `iv-persona`, `iv-logo-1`, `iv-generator` in the previous step. Close so **they** pay:

```json
{
  "summary": "Le workflow A est sur le canvas : toi à droite, logo Claude à gauche.",
  "results": [],
  "next_actions": [
    { "kind": "generate", "node_id": "iv-generator" },
    { "kind": "ask_agent", "label": "Sans le texte", "message": "Enlève le texte overlay et mets à jour le prompt." }
  ]
}
```

`apply_workflow` A/B that printed `Generator node id: gen`:

```json
{
  "summary": "A choc et B duel sont câblés. Un clic lance les deux variantes.",
  "results": [],
  "next_actions": [{ "kind": "generate", "node_id": "gen" }]
}
```

After two successful sketches this turn (`result_id: call_7` and `result_id: call_8`). Debate, do **not** generate:

```json
{
  "summary": "Deux **croquis** : A visage serré, B duel avec le logo. On garde lequel ?",
  "results": ["call_7", "call_8"],
  "next_actions": [
    { "kind": "ask_agent", "label": "Garder A", "message": "Garde la composition A, on l'envoie sur le canvas." },
    { "kind": "ask_agent", "label": "Garder B", "message": "Garde la composition B, on l'envoie sur le canvas." },
    { "kind": "ask_agent", "label": "Retoucher le fond", "message": "Garde A mais refais un croquis avec un fond plus sombre." }
  ]
}
```
