---
name: request_user_image
description: Asks the user to upload a logo or reference (file picker or library) and pauses until they upload or skip. Use when they must give an image you don't already have. Never for the creator's face (list_personas). Never the same model step as finish_turn.
---

# request_user_image

Client tool (no `execute`). In-app chat only — not MCP. `PendingUiAction` shows a card; `streamText` **pauses** until the browser resolves it via `addToolOutput`. You receive `{ source_ids }` or `{ skipped }` — you never invent that payload.

Call it **alone in its model step**. Never with `finish_turn` (the turn resumes after they answer; finish then). Never with `place_node`, `apply_workflow`, `generate_sketch`, or `ask_user` in the same step. Before the call, at most one short sentence (or nothing).

This tool does not search, does not call a paid API, and does not write the library. Uploader inserts a `chat_uploads` row (`uploaded:up_…`). Bibliothèque picks an existing row (`stored:lg_` / `stored:sf_` / `stored:persona_`). Online-logo add and followed-channel copy happen in the picker UI, then come back as `stored:` refs.

Chat label: « Demande une image ». Not a visual tool — no `result_id`. Leave `finish_turn.results` empty unless another visual tool ran.

## When

- They have a **file on disk** (PNG/JPEG/WebP logo or reference) that is not in the library.
- `list_logos` / `list_swipe_files` is empty or has no match, and they offered to upload rather than search.
- A listed logo file is missing on disk (`Image source not found`) and they still have the PNG.
- They say « je te l'envoie », « j'ai le fichier », « je l'uploade », « dans mes téléchargements ».

## When not

- **Face of the creator** ("moi", "mon visage", "avec ma tête", a named Personnage). That is a **Personnage** (`list_personas` → `stored:persona_<id>` on `face-in`). Never this tool, never `suggested_kind: "face"`, never a selfie / chat upload as `face_source` or `faceReference`. An `uploaded:` cannot become a Personnage. Empty Personnages library → Bibliothèque → onglet Personnages (webcam 3 angles or one photo per angle), or go faceless. There is no tool that creates a Personnage.
- The image is **already in the library** → `list_logos` (`stored:lg_`) or `list_swipe_files` (`stored:sf_`). Offer a choice with `ask_user`, don't open the picker.
- A **named brand** not in the library → `find_logos` then `add_logo`. They can also search inside the picker; you still prefer `find_logos` when you have the name.
- A **named YouTube video** → `import_youtube_thumbnail` (creates `stored:sf_`). Don't ask them to screenshot the thumb.
- A **croquis** → `generate_sketch`. `request_user_sketch` is not offered.
- You already have the bytes this turn (composer attachment, previous `{ source_ids }`, canvas `library:uploaded:` / `library:stored:…`).
- You can deduce you don't need the file (they said no logo / no ref).
- Same model step as `finish_turn` or `place_node`.
- A clickable **question** → `ask_user` (not a file picker).

## How

### Input (you send)

| Field | Required | Rules |
| --- | --- | --- |
| `reason` | yes | User-facing sentence on the card (italic). Reply language. What you need and why. Not JSON, not an id, not « Étape n/7 ». Empty string renders the fallback « L'assistant demande une image. » — send a real reason. |
| `suggested_kind` | no | `"logo"` \| `"reference"` \| `"any"`. Sets which Bibliothèque tab opens first. **Never `"face"`** (enum leftover; it would open Personnages — use `list_personas` instead). |

Always pass `suggested_kind` when you know the kind:

| Value | Library opens on | Typical next sink |
| --- | --- | --- |
| `"logo"` | Logos (Mes logos / Chercher en ligne) | `iv-logo-*` / `logo-in` |
| `"reference"` | Inspirations (Mes images / Chaînes suivies) | `iv-ref-*` / `ref-in` |
| `"any"` or omit | Personnages first if they click Bibliothèque | Avoid unless you truly don't know |

The picker is `kind="all"`: they can still switch tabs. Read the **returned prefix**, not the kind you suggested.

### Card (what they see)

Header « Demande », then `reason`, then three actions:

1. **Uploader** — hidden `<input accept="image/jpeg,image/png,image/webp">`. POST `/api/chat-uploads` (max **5 MB**). Success → `{ source_ids: ["uploaded:up_<hex>"] }`. Missing `source` or thrown fetch → treated as **skip**. GIF/SVG/empty/too-large never become a source (the API 400s; the card then skips).
2. **Bibliothèque** — `LibraryPickerDialog`. A pick maps the preview URL to a ref (`libraryPickToAttachment`):

   | Preview path | Result |
   | --- | --- |
   | `/api/logos/image?f=` | `stored:lg_<id>` |
   | `/api/swipe-files/image?f=` | `stored:sf_<id>` |
   | `/api/personas/image?id=` | `stored:persona_<id>` |

   « Chercher en ligne » saves a PNG into Logos first, then returns `stored:lg_`. « Chaînes suivies » copies the thumb into swipe files first, then returns `stored:sf_`. An unrecognized URL stays on the dialog (`Cette image de la bibliothèque ne peut pas être jointe.`) — not a tool result.
3. **Skip** — `{ skipped: true }`. The card does not add « Autre ».

The composer stays usable. A **new user message** abandons the request (see Output). One answer per `toolCallId`; a failed send unlocks the card.

### Output (you receive)

Exactly one of:

```json
{ "source_ids": ["uploaded:up_abc123"] }
{ "skipped": true }
{ "skipped": true, "reason": "abandoned" }
```

- `{ source_ids }` — currently **one** id (the UI never sends a batch). Copy it verbatim. Length-0 is not produced by the card.
- `{ skipped: true }` — they clicked Skip, or the upload returned no `source`.
- `{ skipped: true, reason: "abandoned" }` — they sent a composer message instead. Read that message; do not wait on the card. Re-ask only if you still need a file.

Persisted history may wrap the same object as `{ type: "json", value: { … } }`. Read the inner object.

### What to do with a ref

| Prefix | Origin | Face (`face-in` / `face_source`) | Logo (`logo-in` / brief logos) | Ref (`ref-in` / sketch refs) |
| --- | --- | --- | --- | --- |
| `uploaded:up_…` | Uploader (`chat_uploads`) | **never** | Canvas `swipeFile` `kind=logo` yes; `update_brief` logos **no** (`stored:lg_` only) | Canvas `iv-ref-*` / `generate_sketch.reference_sources` yes; brief `references` **no** (`stored:sf_` + YouTube metadata only) |
| `stored:lg_<id>` | Logos pick or in-picker add | never | yes, including `update_brief` `{ name, source }` (max 3) | use as logo, not as a swipe |
| `stored:sf_<id>` | Inspirations pick or followed-channel copy | never | never (`kind=logo` is `stored:lg_`) | yes; brief `references` only if it came from a video |
| `stored:persona_<id>` | Personnages pick | **yes** — treat as `list_personas` | never | never |

`ask_user` tiles do **not** accept `uploaded:` (`stored:persona_` / `lg_` / `sf_`, `youtube:`, `generated:sk_`, `logo-candidate:` only). After this tool you already have the id — don't re-ask which file they just sent.

Wire in **this resumed turn** when you still need the pixels on the canvas. Unattached `uploaded:` rows are GC'd after **24 hours**. `place_node` / `apply_workflow` call `markAttached`. `generate_sketch` reads the bytes once and does not attach.

Do not dump the raw id in the summary. Say "ton logo" / "ta référence".

## Errors

No server `execute`. Schema / UI / downstream only:

- Missing `reason` → input schema fails (`reason` required).
- `suggested_kind` other than `face` \| `logo` \| `reference` \| `any` → schema fails. Still **do not send `face`**.
- Upload 400 (no file, empty, >5 MB, mime not jpeg/png/webp) → card resolves `{ skipped: true }`. Ask once more with a clearer `reason` (PNG/JPEG/WebP, 5 Mo) only if you still need the file.
- Unknown library URL → dialog stays open; you are not resumed.
- They picked a Personnage while you asked for a logo → you get `stored:persona_<id>`. Use it as a character if they want to appear; **do not** put it on `logo-in`. Ask again for the logo if you still need one.
- `place_node` / `apply_workflow` with `uploaded:` on `faceReference`:

  > faceReference only accepts a Personnage: image_source must be stored:persona_<id> (see list_personas)

- `generate_sketch` `face_source: "uploaded:…"` → `Cannot resolve` / identity rules: still not a Personnage. Pass `stored:persona_<id>` or omit.
- Stale upload (`Upload not found: uploaded:up_…` / `Image source not found on node …: uploaded:…`) → GC or never attached. Call this tool again; do not invent an id.
- `update_brief` logos with `uploaded:` → `Logo au format stored:lg_<id>`. Wire the canvas instead, or have them save it in Bibliothèque → Logos then `list_logos`.
- `update_brief` references with `uploaded:` → `Référence au format stored:sf_<id>`. Wire `iv-ref-*`; don't fake a `videoId`.

Do not retry a skip with the same card in a loop. Do not invent `uploaded:` / `stored:` ids.

## Chains

Typical: list/find in an **earlier** step → this tool **alone** → turn pauses.

After the answer, in **later** steps of the resumed turn:

1. `{ source_ids: ["stored:lg_…"] }` → `update_brief` logos (if under 3) → `place_node` `iv-logo-1..3` or `apply_workflow` swipeFile `kind=logo` on `logo-in` → optional `generate_sketch` `reference_sources`.
2. `{ source_ids: ["stored:sf_…"] }` → `place_node` `iv-ref-1..3` (`kind=reference`) on `ref-in` → optional sketch refs. Brief `references` only for YouTube-backed rows.
3. `{ source_ids: ["uploaded:up_…"] }` → same canvas sinks as (1) or (2) from `suggested_kind`. Not the fiche logo/reference arrays. Not `face-in`.
4. `{ source_ids: ["stored:persona_…"] }` → `update_brief` `common.persona` → `face_source` / `iv-persona`. Do **not** treat this as having obtained a logo.
5. `{ skipped }` / abandoned → continue without that image. One `finish_turn` (need / next_actions). Don't reopen the picker unless they now say they have the file.

End the resumed turn with `finish_turn` **once, alone**. Never `finish_turn` in the same step as this tool. Don't start a paid generation; « Générer » is their click on `finish_turn` kind `generate`.

Prefer `list_logos` / `list_swipe_files` / `find_logos` / `import_youtube_thumbnail` **before** this tool. Prefer `list_personas` **instead of** this tool for faces.

## Example

User: « J'ai le logo Claude en PNG sur le bureau, pas encore dans la bibliothèque. »

1. `read_skill` `request_user_image` (first use this conversation).
2. `list_logos` `{}` — empty or no "Claude".
3. This tool **alone**:

```json
{
  "reason": "Envoie le PNG du logo Claude (ou choisis-le dans la bibliothèque).",
  "suggested_kind": "logo"
}
```

4. They click Uploader → `{ "source_ids": ["uploaded:up_a1b2c3"] }`.
5. Later steps: `place_node` `{ "id": "iv-logo-1", "type": "swipeFile", "data": { "image_source": "uploaded:up_a1b2c3", "label": "Claude" } }` (auto-wires `logo-in`). Optional `generate_sketch` `{ "reference_sources": ["uploaded:up_a1b2c3"] }`. Do **not** `update_brief` logos with that `uploaded:` token.
6. `finish_turn` alone — summary in the reply language; `results` empty.

If step 4 had been Skip: say you'll go on without the mark (or offer `find_logos` "Claude"), then `finish_turn`. If they had picked Mes logos instead: `{ "source_ids": ["stored:lg_…"] }` → that **can** go on the fiche.

If they had said « mets-moi sur la miniature »: do **not** call this tool. `list_personas` → `ask_user` / default Personnage.
