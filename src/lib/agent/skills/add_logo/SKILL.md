---
name: add_logo
description: Saves one find_logos candidate into the library as stored:lg_<id>. Use after the user picked a logo-candidate id or a single obvious hit. Pass candidate_id only, never a URL. Max 3 logos on the Fiche. Unknown id is refused. Not for a user file or library pick — that is request_user_image.
---

# add_logo

Persists **one** `find_logos` hit into the **Logos** table and appends it on this conversation's Fiche. Chat label: « Enregistre le logo ». Free: no OpenRouter, no YouTube quota, no Brandfetch fetch.

You pass **`candidate_id` only** — the `lc_…` token from a `logo-candidate:<id>` line. Never a URL, never `previewUrl`, never `logo-candidate:` as a prefix, never `stored:lg_`. Success text is exactly `stored:lg_<uuid>` (copy it verbatim). That ref is wireable. The candidate id is not.

Not a visual tool. No `result_id`. Leave `finish_turn.results` empty unless another visual tool ran. Chat-only (v2 route); not on MCP.

## When

- `find_logos` returned `logo-candidate:<id> | <name> | <source>` and the user picked that id (`ask_user` `{ selected }`, or they named it).
- **One obvious hit** for a named brand (one candidate, or one that clearly matches) — call immediately and say so in one line. Do not ask.
- Several selected ids (max 3 **kept** logos total on the Fiche) — one call per id. Parallel in the same step is fine.

## When not

- Brand **already** in `list_logos` / `<thumbnail_brief>` logos / the canvas as `stored:lg_<id>` — reuse that ref. Do not search-and-add a second copy.
- The user must **supply a file** they have (PNG/JPEG/WebP, a download from Brandfetch, a mark not in Simple Icons / SVGL / Wikimedia) → **`request_user_image`** `{ suggested_kind: "logo" }`. That client tool **pauses** the turn (picker + Bibliothèque + Skip). Do **not** call `finish_turn` in the same step. This tool never opens a picker and never accepts a URL or bytes.
- Faces of the creator → `list_personas` (`stored:persona_` on **face-in**). Never `add_logo`, never `request_user_image` `suggested_kind: "face"`.
- Visual inspiration / YouTube thumb / past generation → `list_swipe_files` / `import_youtube_thumbnail` / `list_past_generations` on **ref-in**, not logos.
- Fiche already has **3** logos (`brief.logos.length >= 3`) — ask which to drop. Do not call. A fourth attempt still downloads then fails `"3 logos maximum."` (orphan row in the library).
- No `find_logos` this conversation, or a stale `lc_` from another chat — ids live on **this** brief's `logoCandidates`. Unknown → `"Candidat de logo inconnu."`
- Brandfetch UI preview — `find_logos` never stores Brandfetch (`STORABLE` is Simple Icons / SVGL / Wikimedia only). They download and import in Bibliothèque; then `list_logos` or `request_user_image`.
- Inventing a CDN/Wikimedia/SVGL URL, a `data:` SVG, or `https://…` as `candidate_id`. Schema is `candidate_id` (string 1–40). `{ url: "https://…" }` alone fails parse. The handler never fetches a model-supplied address.
- Wiring `logo-candidate:` onto a node, `generate_sketch.reference_sources`, or `update_brief` logos. Only `stored:lg_<id>` is valid (`^stored:lg_[\w-]+$`).
- Do not re-call the same `candidate_id`. Each success **inserts a new uuid** (not idempotent). Same `stored:lg_` on the Fiche is a no-op; a second add is a **new** row.

**`add_logo` vs `request_user_image`**

| | `add_logo` | `request_user_image` |
|---|---|---|
| Kind | Server tool, runs now | Client tool, **pauses** until upload / library pick / Skip |
| Input | `{ candidate_id }` from `find_logos` | `{ reason, suggested_kind?: "face"\|"logo"\|"reference"\|"any" }` |
| Source of pixels | Candidate `ref` already on the brief (slug or allowlisted URL) | User file → `uploaded:<id>` (chat-uploads); Bibliothèque pick → `stored:lg_` / `stored:sf_` / `stored:persona_` |
| Writes | `logos` table + `appendBriefLogo` (max 3) | None by this tool. Upload is a chat file; library pick is an existing row |
| Same step as `finish_turn` | No (`finish_turn` last, **alone**) | **Never** — turn resumes after they answer |
| Face of the creator | Never | Never (`suggested_kind: "face"` still must not stand in for a Personnage) |

## How

### Input

| Field | Required | Schema | What to pass |
|---|---|---|---|
| `candidate_id` | yes | `z.string().trim().min(1).max(40)` | The id **after** `logo-candidate:`, before ` \| ` |

From `find_logos`:

```
logo-candidate:lc_a1b2c3d4e5f6 | Claude | simple-icons
```

Call `{ "candidate_id": "lc_a1b2c3d4e5f6" }`. `ask_user` options should use that same `lc_…` as `options[].id` (max 40) and `image: "logo-candidate:lc_…"` (square tile via `/api/briefs/<conversation>/logo-candidates/<id>`). `{ selected: ["lc_…"] }` is then ready.

Do not pass `source`, `ref`, `name`, or `url`. Extra keys are stripped; missing `candidate_id` is a schema error.

### What the tool does

1. `ensureBrief` — creates an empty Fiche if this conversation has none. Deleted / unknown conversation → error, no download.
2. Looks up `brief.logoCandidates` by **exact** `id`. No match → error, no download (`requestNotSent`).
3. Fake agent (`THUMBGEN_FAKE_AGENT`): returns `stored:lg_fake_<candidate.id>`, appends that source, **no** fetch / DB insert / `logGeneration`.
4. Otherwise `addLogoFromSearch({ source, ref, name })` using the **candidate's** fields, not yours:
   - **simple-icons** — local SVG by slug, no HTTP. Missing slug → `"Logo Simple Icons introuvable."`
   - **svgl** — `ref` must match `^https://svgl.app/[^?#\s]+\.svg$`. Else `"Adresse SVGL refusée."` (no fetch). Download SVG → 1024 px transparent PNG.
   - **wikimedia** — `ref` must match `^https://upload.wikimedia.org/wikipedia/commons/…\.(svg|png)$`. Else `"Adresse Wikimedia refusée."`. `.svg` rasterised; `.png` stored as-is if it has a PNG signature.
   - **brandfetch** — refused immediately (not a brief source). No request.
5. `INSERT INTO logos` (uuid, label = `name.trim().slice(0, 100)` or `"Logo"`, `image/png`). SVG longest side **1024** px, transparent. Downloads: 10 s timeout, **5 Mo** cap while streaming, `redirect: "manual"` (3xx / opaque redirect refused — no SSRF).
6. `appendBriefLogo({ name: candidate.name, source: "stored:lg_<uuid>" })`:
   - `logos.length >= 3` → `{ ok: false }` → `"3 logos maximum."` (pixels may already be in the library; you did not get the ref).
   - Same `source` already on the Fiche → success, no duplicate row on the brief.
   - Else append. Schema cap is also `"3 logos maximum"`.
7. Success content (text only): `stored:lg_<uuid>`.

`update_brief` `logos` **replaces the whole list**. This tool already appended. Skip a second write unless you are dropping/renaming the set.

### After success — wire `stored:lg_<id>`

Copy the returned string exactly. Tell the user the **name**, not the raw id.

- `place_node` `iv-logo-1` .. `iv-logo-3`, type `swipeFile`, `data.image_source: "stored:lg_<id>"`. Do **not** send `kind: "reference"`. Auto-wires to `iv-generator` **`logo-in`**. Not the same step as `ask_user` / `finish_turn`.
- `apply_workflow`: swipeFile `kind: "logo"`, same `image_source`, edge `targetHandle: "logo-in"` (shared A/B/C; do not duplicate per variant). Up to three logo nodes.
- `generate_sketch`: `reference_sources: ["stored:lg_<id>"]`, never `face_source`.
- `ask_user` later: option `image: "stored:lg_<id>"` (square). `logo-candidate:` is only for unsaved hits.

Prefix `lg_` → `logos` table. `/api/logos/image?f=<id>`. Not `stored:sf_` (ref-in), not `stored:persona_` (face-in), not `uploaded:` (chat file from `request_user_image`).

## Errors

`isError: true`. The model sees `error-text` (the quoted string). Do not invent a `stored:lg_`. Do not retry the same id in a loop. Do not fall back to a paid API or a URL you wrote.

**Before any download** (`requestNotSent: true`):

| Quoted text | Meaning | What you do |
|---|---|---|
| `Conversation introuvable.` | No live conversation (deleted / bad id). `ensureBrief` returned null | Stop. Do not retry. |
| `Candidat de logo inconnu.` | `candidate_id` not in this brief's `logoCandidates` (wrong prefix, `stored:lg_`, URL, other chat's `lc_`, already replaced by a newer `find_logos`) | `find_logos` again; pass the new `lc_`. Do not guess. |

**After `addLogoFromSearch` / append** (`requestNotSent` unset):

| Quoted text | Meaning | What you do |
|---|---|---|
| `3 logos maximum.` | Fiche already has 3 (`appendBriefLogo`), or the append could not be stored | Ask which logo to drop. `update_brief` logos with the kept three `stored:lg_` refs. Do not add a fourth. |
| `Enregistrement du logo impossible.` | Non-`Error` throw | Stop. Ask them to import in Bibliothèque. |
| `Les logos Brandfetch ne s'ajoutent pas automatiquement : ouvre-le sur Brandfetch, télécharge le fichier puis importe-le.` | Brandfetch ref (HTTP `/api/logos/add` path; not a brief candidate) | `request_user_image` `{ suggested_kind: "logo" }` after they have the file, or they import in Bibliothèque. |
| `Logo Simple Icons introuvable.` | Slug missing in Simple Icons | Try another candidate for that name, or `request_user_image`. |
| `Adresse SVGL refusée.` | `ref` not `https://svgl.app/….svg` | Do not pass a URL yourself. Pick another candidate or `find_logos` again. |
| `Adresse Wikimedia refusée.` | `ref` not a Commons `upload.wikimedia.org/….(svg\|png)` | Same. |
| `Téléchargement du logo impossible — réessaie.` | `fetch` threw / timeout (10 s) | Retry **once**. Still failing → ask them to import. |
| `Téléchargement du logo impossible (redirection refusée).` | 3xx or `opaqueredirect` | Do not retry that ref. Another candidate or import. |
| `Téléchargement du logo impossible (HTTP <status>).` | Upstream not OK (e.g. HTTP 500) | Retry **once** on 5xx. 4xx → another candidate. |
| `Fichier trop lourd (5 Mo maximum).` | Body (or Content-Length) over 5 MiB | Another candidate or a file they import. |
| `Le fichier du logo est vide.` | Zero-byte download | Another candidate. |
| `Ce fichier n'est pas un PNG.` | Wikimedia non-SVG whose bytes lack a PNG signature | Another candidate (prefer SVG) or import. |
| `Source de logo inconnue.` | `source` not in the switch | `find_logos` again. |
| `Ce SVG n'est pas utilisable comme logo.` | Rasterize: `<image>`, remote `href`, degenerate/extreme aspect (>8:1) | Another candidate or import a PNG. |
| `Ce logo contient du texte non vectorisé : importe plutôt une image.` | SVG has `<text>` | `request_user_image` / Bibliothèque import. |
| `Ce fichier n'est pas un SVG.` | Body lacked `<svg` | Another candidate. |
| `SVG invalide : <detail>` | resvg failed | Another candidate or import. |

Schema / AI SDK (no handler): `candidate_id` missing, empty, or longer than 40. Retry with the bare `lc_` id only.

Downstream (not this tool): `Image source not found on node …: stored:lg_<id>` / `Cannot resolve image_source stored:lg_<id>` — the id is not in `logos`. Use the string this tool just returned, or `list_logos`. Never put `logo-candidate:` on a node.

## Chains

1. Named brand → `list_logos`. Hit → keep `stored:lg_<id>` (this tool is done).
2. No library hit → `find_logos` `{ names }` (max 12, 3 storable hits per name). One obvious line → `add_logo`. Several plausible → `ask_user` multiple `"Quels logos garder ?"`, `max_selected` 3, option id = `lc_…`, `image: "logo-candidate:lc_…"`. Then `add_logo` once per `selected` id. `{ skipped }` / `{ other }` → do not add; ask or `request_user_image` if they described a file.
3. Success → optional `place_node` / `apply_workflow` swipeFile **kind=logo** on **logo-in**; optional `generate_sketch` `reference_sources`. Skip `update_brief` logos if the Fiche already lists that `stored:lg_`.
4. User has a file, Brandfetch-only mark, or SVG-with-text → `request_user_image` `{ reason: "…", suggested_kind: "logo" }` **alone** in its step. After resume: `source_ids` (`stored:lg_` from Bibliothèque, or `uploaded:` from Uploader) or `{ skipped: true }`. `uploaded:` is not a Logos-table row — do not treat it as `stored:lg_`. Prefer they import in Bibliothèque if you need `logo-in`.
5. `finish_turn` last, **alone**. `results` empty for this tool. `summary` names the brand. `next_actions` can offer to place it on the canvas — not an `ask_agent` that starts a paid generation.

No Étape n/7. Never the same model step as `ask_user`, `request_user_image`, or `finish_turn` when those pause or close the turn.

## Example

User: « Miniature Claude Code, mets le logo Claude. »

`list_logos` → `No logos in library.`

`find_logos` `{ "names": ["Claude"] }` →

```
logo-candidate:lc_a1b2c3d4e5f6 | Claude | simple-icons
```

One obvious hit. `add_logo` `{ "candidate_id": "lc_a1b2c3d4e5f6" }` → `stored:lg_7f3a…`

Fiche logos is already `[{ name: "Claude", source: "stored:lg_7f3a…" }]`. Then `place_node`:

```
{ "id": "iv-logo-1", "type": "swipeFile", "data": { "image_source": "stored:lg_7f3a…", "label": "Claude" } }
```

`finish_turn` `{ "summary": "J'ai enregistré le logo Claude et je l'ai posé sur la miniature.", "results": [], "next_actions": [] }`

If `find_logos` had returned three marks: `ask_user` first (not this tool), then `add_logo` for each `selected` `lc_`. If they said « j'ai le PNG »: `request_user_image` `{ "reason": "Envoie le logo Claude (PNG ou SVG).", "suggested_kind": "logo" }` — never `{ "candidate_id": "https://…" }`.
