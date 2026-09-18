---
name: find_logos
description: Searches Simple Icons, SVGL, and Wikimedia for named brands missing from list_logos and returns up to 3 logo-candidate:<id> lines per name (max 12 names, never a URL, image, or Brandfetch) for ask_user then add_logo; not the library inventory.
---

# find_logos

Searches **storable** mark sources for brand names and writes **unwired** candidates on this conversation's Fiche. Chat label: « Cherche les logos ». Chat-only (v2 route); not on MCP.

Free: local Simple Icons plus SVGL / Wikimedia (4 s per source). No OpenRouter, no YouTube quota, no Brandfetch fetch. Not a visual tool — no `result_id`, no pixels in the tool result. Leave `finish_turn.results` empty unless another visual tool ran.

Success lines are `logo-candidate:<id> | <name> | <source>`. Copy the `lc_…` id exactly. Never a URL, `data:`, base64, or image part. Then **`ask_user`** (those ids as option images) or **`add_logo`** (`candidate_id` only). `add_logo` is what creates `stored:lg_<id>`.

## Contrast `list_logos`

| | `find_logos` | `list_logos` |
|---|---|---|
| Effect | Search + replace `brief.logoCandidates` | SELECT the **Logos** table |
| Args | `{ names }` (1–12 strings) | `{}` |
| Returns | `logo-candidate:lc_… \| name \| source` | `stored:lg_<id>` + label, size, date |
| Wireable? | **No** | Yes |
| Writes | Fiche `logoCandidates` only (max 36) | none |
| Sources | Simple Icons / SVGL / Wikimedia (`STORABLE`) | Whatever the user already saved |
| Empty | `Aucun logo trouvé. L'utilisateur peut importer depuis la Bibliothèque ou Brandfetch en aperçu.` | `No logos in library.` |
| Next | `ask_user` then `add_logo` | `ask_user` with `stored:lg_` / keep the hit |

`add_logo` turns **one** candidate into a library row + `stored:lg_<id>` (Fiche logos cap 3). Do not skip `list_logos` when the brand might already be saved.

## When

- Named tools / brands / products the user cited, or `research_topic` `entities` (`company` / `tool` / `product`), that are **not** already a `stored:lg_<id>` from `list_logos`, `<thumbnail_brief>` logos, or the canvas.
- After research or a clear subject, before wiring `logo-in` / `generate_sketch` `reference_sources`.
- Empty library, or `list_logos` had no matching `"<label>"`.

## When not

- Brand **already** in `list_logos` → reuse `stored:lg_<id>`. Do not search a second copy.
- You already have live `logo-candidate:lc_…` lines from this turn — pick / `add_logo`; do not re-search unless the names changed (a new call **replaces** every candidate; old `lc_` die).
- User already said no logo / « aucun » / skip.
- Faces of the creator → `list_personas`. Inspiration / YouTube / past gens → `list_swipe_files` / `import_youtube_thumbnail` / `list_past_generations` (`ref-in`), never this tool.
- They have a **file** (PNG, a Brandfetch download, a mark these sources lack) → `request_user_image` `{ suggested_kind: "logo" }` alone in its step. Do not invent a URL for `add_logo`.
- Brandfetch UI preview: this tool **never** stores Brandfetch. They download and import in Bibliothèque; then `list_logos`.
- Passing a URL, slug, `data:` SVG, or `https://…` as a name or as `candidate_id`. Schema is **`names`** only.
- Do not dump 12 speculative names. Pass the brands that will actually appear on the thumb (same 12-entity cap as research).
- Do not mention « Étape n/7 » or run a numbered pipeline.

## How

Call `read_skill` `find_logos` before the first use in this conversation.

### Input

| Field | Required | Schema |
|---|---|---|
| `names` | yes | `string[]`, 1–12 items, each trimmed 1–80 characters |

```
{ "names": ["Claude", "Cursor"] }
```

Good names: `"Claude"`, `"Notion"`, `"YouTube"`. Bad: `""`, a URL, a sentence, 13 brands. Extra keys are stripped. One-character names parse but rarely hit.

### What the tool does

1. `ensureBrief` — creates an empty Fiche if this conversation has none. Deleted / unknown conversation → error, no search.
2. Fake agent (`THUMBGEN_FAKE_AGENT`): writes fixture candidates (`lc_fakeclaude` / Claude / simple-icons), **no** fetch / `searchLogos` / `logGeneration`.
3. Otherwise, for **each name in order** (sequential): `searchLogos` on Simple Icons + SVGL + Wikimedia in parallel (4 s timeout; a slow/failing source is dropped **silently** — you will not see « SVGL indisponible »).
4. Keeps only **STORABLE** hits: `simple-icons`, `svgl`, `wikimedia`. Brandfetch is not in the default providers and would be filtered anyway.
5. Merge order is Simple Icons → SVGL → Wikimedia (duplicates by `key` dropped). **At most 3** of those hits **per name** (`slice(0, 3)`). If Simple Icons already returned 3, you may never see SVGL/Wikimedia for that name. Each provider itself caps at 8 internally.
6. Each kept hit becomes `{ id: "lc_" + 12 hex, name: result.name (≤80) or the query, source, ref, previewUrl: /api/briefs/<conversation>/logo-candidates/<id> }`.
7. `setBriefLogoCandidates` **replaces** the whole `logoCandidates` array (schema max 36 = 12×3). Previous `lc_` ids from this chat are gone.
8. Returns text lines only. The model never sees `ref`, `previewUrl`, or Simple Icons' internal `data:image/svg+xml;base64,…`. `<thumbnail_brief>` later shows `{ id, name }` only.

Simple Icons is the local package (title, slug, aliases; exact then prefix then substring; brand-coloured SVG). SVGL: `api.svgl.app` (5 min cache, 404 = empty). Wikimedia: Commons `intitle:"<name>" intitle:logo`, SVG/PNG only.

### Output (success)

**Hits** — one line per candidate, in name order, up to 3 per name:

```
logo-candidate:lc_a1b2c3d4e5f6 | Claude | simple-icons
logo-candidate:lc_b2c3d4e5f6a7 | Claude | svgl
logo-candidate:lc_c3d4e5f6a7b8 | Claude | wikimedia
```

`source` is exactly `simple-icons` | `svgl` | `wikimedia`. Parse: prefix `logo-candidate:`, then id, ` | `, name, ` | `, source. The id is `lc_` + 12 hex (fits `add_logo` `candidate_id` max 40 and `ask_user` option id max 40).

**No hits** (not `isError`): `Aucun logo trouvé. L'utilisateur peut importer depuis la Bibliothèque ou Brandfetch en aperçu.`

### After the lines — pick, then persist

**One obvious hit** for a named brand (one line, or one that clearly is that mark): `add_logo` `{ candidate_id: "lc_…" }` immediately and say so in one line. Do not ask.

**Several plausible hits:** `ask_user` **alone** in the next step (never with `place_node` or `finish_turn`). Omit leftover `step`. Question `"Quels logos garder ?"`, `multiple: true`, `max_selected: 3` (Fiche logos cap), `allow_skip: true`. Each option:

- `id`: the bare `lc_…` (this is what `{ selected }` returns → `add_logo`)
- `label`: candidate name (≤60)
- `description`: `Simple Icons` / `SVGL` / `Wikimedia`
- `image`: full `logo-candidate:lc_…` (square tile via `/api/briefs/<conversation>/logo-candidates/<id>`; needs this conversation — do not mix with wide `youtube:` / `stored:sf_` / `generated:sk_` tiles)

`ask_user` allows **0–12** options. This tool can return up to **36** lines. Do not overflow: keep obvious names with `add_logo`, and only ask among ambiguous hits (or one question per leftover brand). Never put more than 12 options in one card.

Then, in the **resumed** turn: `add_logo` once per `{ selected }` id (parallel in one step is fine). `{ skipped }` / `{ other }` → do not add; listen, or `request_user_image` if they described a file.

### After `add_logo` — wire `stored:lg_<id>`

`logo-candidate:` is **not** wireable. `resolveImageSource` rejects it on nodes / sketches. Only the `stored:lg_<id>` `add_logo` returns may go on:

- `place_node` `iv-logo-1`..`iv-logo-3` swipeFile (`kind` implied `logo`, never `"reference"`) → **`logo-in`**
- `apply_workflow` swipeFile `kind: "logo"`, same handle (shared A/B/C)
- `generate_sketch` `reference_sources: ["stored:lg_<id>"]`, never `face_source`
- later `ask_user` tiles: `image: "stored:lg_<id>"`

`add_logo` already appended Fiche logos. Skip a second `update_brief` logos unless you are dropping/renaming the set. Tell the user the **brand name**, not the raw id. Do not dump JSON.

## Errors

**`isError: true`** (model sees `error-text`):

| Quoted text | Meaning | What you do |
|---|---|---|
| `Conversation introuvable.` | No live conversation (`ensureBrief` null). `requestNotSent` | Stop. Do not retry. Do not invent `lc_` ids. |

**Not an error:** empty French sentence above → `request_user_image` `{ suggested_kind: "logo" }`, they import in Bibliothèque, or continue without a logo. Do not invent a candidate.

**Schema (no handler):** `names` missing, empty, more than 12, or an item empty / longer than 80. Fix the array; do not pad fake brands.

Silent provider failures (timeout, HTTP) just omit that source. Do not re-call in a loop hoping for SVGL. Re-call only with **different names**, knowing it wipes prior `lc_` ids.

Downstream (not this tool):

| Later failure | Meaning |
|---|---|
| `Candidat de logo inconnu.` | `add_logo` — stale `lc_`, `stored:lg_` passed as `candidate_id`, or you searched again |
| `3 logos maximum.` | `add_logo` / Fiche already has 3 — ask which to drop **before** adding |
| `Image source not found… logo-candidate:` | You wired a candidate. `add_logo` first |
| `Les logos Brandfetch ne s'ajoutent pas automatiquement…` | Brandfetch cannot be persisted. File import |

## Chains

1. Named brand → `list_logos`. Match → keep `stored:lg_<id>` (this tool is done).
2. No match / empty library → `find_logos` `{ names }` (only missing brands, max 12). One obvious line → `add_logo`. Several → `ask_user` `"Quels logos garder ?"` (`logo-candidate:` images, `max_selected` 3) **alone** → `add_logo` per `selected` `lc_`.
3. Success → `place_node` / `apply_workflow` swipeFile **kind=logo** on **logo-in**; optional `generate_sketch` `reference_sources`. `finish_turn` last, **alone**, `results` empty for this tool.
4. No hits / Brandfetch-only / they have a PNG → `request_user_image` `{ suggested_kind: "logo" }` alone. After resume, Bibliothèque pick may be `stored:lg_`; `uploaded:` is not a Logos-table row.
5. `research_topic` (paid, max 2) → take `entities` names still missing from the library → this tool. On research failure, use names the user cited. This search itself is free.

Never the same model step as `ask_user`, `request_user_image`, or `finish_turn`. Never `place_node` in the same step as `ask_user`.

## Example

User: « Miniature Claude Code vs Cursor, mets les logos. »

`list_logos` → `No logos in library.`

```
find_logos
  names: ["Claude", "Cursor"]
```

Result:

```
logo-candidate:lc_aaa111222333 | Claude | simple-icons
logo-candidate:lc_bbb222333444 | Claude | svgl
logo-candidate:lc_ccc333444555 | Cursor | simple-icons
```

Claude has two marks, Cursor one obvious. `add_logo` `{ "candidate_id": "lc_ccc333444555" }` for Cursor (say so in one line). Then `ask_user` **alone** (omit `step`):

```json
{
  "question": "Quels logos garder ?",
  "multiple": true,
  "max_selected": 3,
  "allow_skip": true,
  "options": [
    { "id": "lc_aaa111222333", "label": "Claude", "description": "Simple Icons", "image": "logo-candidate:lc_aaa111222333" },
    { "id": "lc_bbb222333444", "label": "Claude", "description": "SVGL", "image": "logo-candidate:lc_bbb222333444" }
  ]
}
```

They pick Claude Simple Icons → `{ "selected": ["lc_aaa111222333"] }` → `add_logo` `{ "candidate_id": "lc_aaa111222333" }` → `stored:lg_<uuid>`. Wire that ref on `logo-in`. Never `image_source: "logo-candidate:lc_…"`.

If the result had been the empty French sentence: `request_user_image` `{ "reason": "Envoie le logo Claude (PNG ou SVG).", "suggested_kind": "logo" }` — never a URL you wrote.
