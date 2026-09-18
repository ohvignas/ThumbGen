---
name: list_logos
description: Lists logos already saved in the user's library as stored:lg_<id> when matching a named brand, asking which to keep, or wiring a swipeFile kind=logo; not for unsaved brands — those are find_logos (logo-candidate:) then add_logo.
---

# list_logos

Read-only inventory of the **Logos** table (Bibliothèque). No arguments, no writes, no paid calls, no images, no `result_id`. Copy each `stored:lg_<id>` exactly.

Contrast: `find_logos` searches the web and returns **unwired** `logo-candidate:<id>` lines. `add_logo` is what turns one candidate into a library row and a `stored:lg_<id>`. This tool never searches.

## When

- The user names a brand, tool, or product that might already be saved.
- Before `ask_user` "Quels logos garder ?" so option `image` can be `stored:lg_<id>` (square tile).
- Before `apply_workflow` / `place_node` when a generator needs a logo on `logo-in`.
- Before `generate_sketch` `reference_sources` when a library logo should condition the draft.
- Before `update_brief` logos, to write `{ name, source: "stored:lg_<id>" }` (max 3).
- Empty library: still call once so you can quote the empty text and offer import / search, rather than inventing an id.

## When not

- Brand **not** in the library → `find_logos` (names, max 12) then `add_logo` with that `candidate_id`. Do not pass a URL.
- Already have the `stored:lg_<id>` from this turn or `add_logo` → do not re-list.
- Visual inspiration / YouTube thumb / past generation → `list_swipe_files` (`stored:sf_`), `import_youtube_thumbnail`, `list_past_generations` (`stored:gi_`). Those are `kind=reference` on `ref-in`, not logos.
- Face of the creator → `list_personas` (`stored:persona_<id>` on `face-in`). Never a logo as a face.
- User already said no logo / "aucun" / skip.
- Brandfetch preview in the UI: not persisted by `find_logos`. They download and import in Bibliothèque; then this list sees it.
- Do not call this to "search Claude". There is **no name/query/limit**. Extra keys are stripped; you still get every row.

## How

Call with `{}`. Newest first (`created_at DESC`).

**Success (rows):**

```
N logo(s):
- stored:lg_<id> — "<label>" (<size> bytes, added <created_at>)
```

**Success (empty):** `No logos in library.`

Match the user's brand to `"<label>"` yourself (human, case-insensitive). Keep at most 3. One obvious hit: keep it and say so in one line. Several plausible hits: one `ask_user` multiple, `max_selected` 3, each option `id` stable, `image: stored:lg_<id>`. Then `update_brief` logos.

Do **not** put a `logo-candidate:` string on a node, in `ask_user.image`, in `generate_sketch.reference_sources`, or in the brief. `ask_user` only tiles `stored:persona_`, `stored:sf_`, `stored:lg_`, `youtube:`, `generated:sk_`. `resolveImageSource` rejects `logo-candidate:`.

| Tool | Returns | Wireable? | Writes |
| --- | --- | --- | --- |
| `list_logos` | `stored:lg_<id>` + label, size, date | yes | no |
| `find_logos` | `logo-candidate:<id> \| name \| source` (≤3 per name; Simple Icons / SVGL / Wikimedia; never base64, never Brandfetch) | no | brief `logoCandidates` |
| `add_logo` | `stored:lg_<id>` from `candidate_id` only | yes (after) | logos table + brief logos (max 3) |

**Canvas — swipeFile kind=logo.** Prefix `lg_` is the logos table. Catalog treats a swipeFile as a logo when `kind` is `"logo"` or `image_source` starts with `stored:lg_`. That node plugs into generator **`logo-in`** (shared across A/B/C; never duplicate per variant). Not `ref-in`.

`apply_workflow` (A/B or several nodes):

```json
{
  "id": "logo-claude",
  "type": "swipeFile",
  "data": {
    "kind": "logo",
    "image_source": "stored:lg_<id>",
    "label": "Claude"
  }
}
```

Edge: that id → the generator, `targetHandle: "logo-in"`. Up to three logo nodes may share `logo-in`. New nodes need full data; omit `image_source` on an existing node to keep its image.

`place_node` (single `iv-*`): ids `iv-logo-1` .. `iv-logo-3`, type `swipeFile`. Kind is implied (`logo`); do not send `kind: "reference"`. Same `image_source`. Auto-wires to `iv-generator` on `logo-in` once that generator exists. Not in the same step as `ask_user` or `finish_turn`. `place_node` generators have no `abTest`.

`generate_sketch`: pass logos in `reference_sources: ["stored:lg_<id>"]`, never as `face_source`.

`update_brief` logos: `{ name: "<label>", source: "stored:lg_<id>" }`. Regex `^stored:lg_[\w-]+$`. Cap 3 (`"3 logos maximum"`). `add_logo` also appends; skip a second write if the brief already has that source.

Missing file on disk: `request_user_image` with `suggested_kind: "logo"` (turn pauses). Prefer this list first.

Chat label: « Liste tes logos ». Not a visual tool — `finish_turn.results` stays empty. Tell the user the label, not the raw id. Do not dump JSON.

## Errors

This handler never sets `isError`. Empty library is a normal text result.

| Text / later failure | Meaning | What to do |
| --- | --- | --- |
| `No logos in library.` | `logos` table empty | `find_logos` → `add_logo`, or `request_user_image` (`suggested_kind: "logo"`), or they import in Bibliothèque. Do not invent `stored:lg_…`. |
| `Image source not found on node <id>: stored:lg_<id>` | `apply_workflow` / `place_node` (`imageExists`) — id not in `logos` | Re-call this tool; use a listed ref; or `add_logo` first. Never guess. |
| `Cannot resolve image_source stored:lg_<id>: Image not found: …` | `generate_sketch` | Same. |
| `Node "iv-logo-N" is a logo swipeFile: its kind cannot be "reference".` | `place_node` | Drop `kind` or send `"logo"`. |
| `3 logos maximum.` / brief `"3 logos maximum"` | Fourth logo on the fiche | Ask which one to drop; do not add. |
| `Candidat de logo inconnu.` | That was `add_logo`, not this tool | Need a fresh `find_logos` `logo-candidate:` id, not a library id. |
| `Pas de fiche pour cette conversation.` | `find_logos` / `add_logo` need a brief | This list does not. |
| `Invalid arguments: …` | MCP / schema (empty object only) | Retry with `{}`. |

Unknown `stored:lg_` ids, `logo-candidate:` as `image_source`, and `kind: "reference"` on a logo node all fail downstream — this tool will not catch them.

## Chains

1. Named brand → `list_logos` → match label → `ask_user` (images `stored:lg_<id>`, max 3) or keep the obvious one → `update_brief` logos → `generate_sketch` `reference_sources` and/or `apply_workflow` / `place_node` swipeFile `kind=logo` on `logo-in` → `finish_turn` (`results` empty unless another visual tool ran).
2. No match / empty → `find_logos` `{ names: ["…"] }` → optional `ask_user` on names (not `logo-candidate:` images) → `add_logo` `{ candidate_id }` → use the returned `stored:lg_<id>` (same wiring as above). No need to list again.
3. User has a PNG, nothing in library → `request_user_image` `{ suggested_kind: "logo" }` alone in its step (no `finish_turn` until they answer).
4. Existing canvas already has a logo swipeFile (`image_source` / `/api/logos/image?f=`) → reuse that id from `<canvas_state>`; do not list unless they want a different mark.
5. A/B: one shared logo node on `logo-in`; per-variant prompts/sketches/refs only. `list_swipe_files` stays on `ref-in`.

## Example

User: « Miniature Claude Code vs Cursor, mets le logo Claude. »

```
list_logos  →  {}
```

Result:

```
2 logo(s):
- stored:lg_a1b2c3d4 — "Claude" (18432 bytes, added 2026-09-12T10:04:01.000Z)
- stored:lg_e5f6g7h8 — "YouTube" (22016 bytes, added 2026-08-03T18:22:11.000Z)
```

Keep Claude (one obvious hit). `update_brief` logos `[{ name: "Claude", source: "stored:lg_a1b2c3d4" }]`. Wire:

```json
{
  "id": "iv-logo-1",
  "type": "swipeFile",
  "data": {
    "kind": "logo",
    "image_source": "stored:lg_a1b2c3d4",
    "label": "Claude"
  }
}
```

Edge to the generator `logo-in`. Sketch: `reference_sources: ["stored:lg_a1b2c3d4"]`.

If the list had been `No logos in library.` (or no "Claude" row): `find_logos` `{ names: ["Claude"] }` → `logo-candidate:lc_… | Claude | simple-icons` → `add_logo` `{ candidate_id: "lc_…" }` → `stored:lg_<new>` → same node. Never `image_source: "logo-candidate:lc_…"`.
