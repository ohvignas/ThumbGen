---
name: list_swipe_files
description: Lists Bibliothèque inspirations as stored:sf_<id> text refs for swipeFile kind=reference. Use when picking a swipe already saved. Does not insert rows: import_youtube_thumbnail creates stored:sf_ from a YouTube thumb; list_logos lists logos (stored:lg_, kind=logo).
---

# list_swipe_files

Read-only listing of the global `swipe_files` table (Bibliothèque → Inspirations / Mes images). Chat label: « Liste tes références ». Also on MCP. No `project_id`: the library is not the open canvas.

Copy each `stored:sf_<id>` verbatim. Wire as a **swipeFile** with **kind="reference"** on **ref-in**. Never as a logo, never as the creator's face.

## When

- User wants a référence / swipe / inspiration already in Bibliothèque
- Before offering which library images to keep (ask_user tiles with `image: stored:sf_<id>`)
- Before `place_node` iv-ref-1..3 or `apply_workflow` swipeFile kind=reference, when you do not already have the ids
- User says « mes images », « dans la bibliothèque », « une ref que j'ai déjà »

## When not

- A YouTube video they named (search, competitors, followed list) → `import_youtube_thumbnail`. That tool **creates** the `swipe_files` row and returns `stored:sf_<id>` plus image bytes. After a successful import you already have the ref; do not list to "confirm"
- Brand marks / logos → `list_logos` (`stored:lg_<id>`, kind=logo, logo-in). Tables are separate. A logo never appears in this list
- Creator's face → `list_personas` (`stored:persona_<id>`). A swipe is not a Personnage. Never put `stored:sf_` on face-in
- Past paid render of **this** miniature → `list_past_generations` (`stored:gi_<id>` on ref-in)
- Image not in the library yet → `request_user_image` (`suggested_kind: "reference"`). Picker may return `stored:sf_` (library pick) or `uploaded:` (new file). `uploaded:` is not in `swipe_files`
- Followed-channel videos whose thumb is not copied yet → `list_followed_videos` then `import_youtube_thumbnail` (or they click « Utiliser comme référence »). Listing will not invent those thumbs
- Canvas already shows the library image (`get_canvas_state` source `library:stored:sf_<id>`, or `view_canvas_images` header with `stored:sf_…`) → reuse that ref
- You already listed this conversation → do not re-call
- Do not open a new-thumbnail turn by dumping the whole library. Ask what the video is about first. List when you need visual refs
- Do not import 12 YouTube thumbs "just in case". Keep at most 3 references

## Contrast

| | `list_swipe_files` | `import_youtube_thumbnail` | `list_logos` |
|---|---|---|---|
| Effect | SELECT only | INSERT into `swipe_files` (deduped) | SELECT only |
| Table | `swipe_files` | `swipe_files` | `logos` |
| Args | none | `video_id`, optional `label` | none |
| Ref | `stored:sf_<id>` | `stored:sf_<id>` (created) | `stored:lg_<id>` |
| Node | swipeFile **kind=reference** | same, after import | swipeFile **kind=logo** |
| Handle | ref-in / ref-in-b / ref-in-c | ref-in | logo-in |
| place_node id | iv-ref-1..3 | iv-ref-1..3 | iv-logo-1..3 |
| Output | text lines, no image, no `result_id` | text + image bytes; `finish_turn.results` | text lines, no image |
| Empty | `No swipe files in library.` | n/a (errors on missing thumb) | `No logos in library.` |
| Name field | `title` | derived label, then stored as title | `label` |
| Size in output | **bytes** | **KB** | bytes |
| ask_user tile | wide (`/api/swipe-files/image?f=`) | after import, same `stored:sf_` | square |

`import_youtube_thumbnail` is how a YouTube thumb **becomes** a row this tool can list. `list_swipe_files` never fetches YouTube, never writes the DB, never returns pixels.

## How

Call with no arguments (`{}`). Extra filters, search, limit, `project_id` do not exist.

SQL (newest first): `SELECT id, title, size, created_at FROM swipe_files ORDER BY created_at DESC`.

Does not return `mime_type`, image bytes, or a thumbnail URL. You cannot see the pixels from this tool. To show the user the image, pass `stored:sf_<id>` into `ask_user` option `image` (wide tile) or wire the node and use `view_canvas_images`.

### Success (one or more rows)

```
N swipe file(s):
- stored:sf_<id> — "<title>" (<size> bytes, added <created_at>)
```

- `id` is the UUID. The ref is `stored:sf_` + that id, copied from the line
- `title` defaults to `Reference` when the user never renamed it. Import from YouTube often looks like `YT — <title>` or the video title
- `size` is raw bytes (not KB)
- `created_at` is SQLite UTC `datetime('now')`

### Empty library (success, not an error)

Exact text: `No swipe files in library.`

Tell them to add images in Bibliothèque, or `import_youtube_thumbnail` for a named video, or `request_user_image`. Do not invent `stored:sf_` ids. Do not retry.

### After you have the list

1. Pick at most 3 that match the video. Do not dump the raw list in chat
2. If several could fit: `ask_user` alone in its step (never with `place_node` or `finish_turn`). `multiple: true`, `max_selected` 3, each option `id` stable, `label` = title, `image: stored:sf_<id>`. Omit `step`
3. Wire the chosen refs (see Wiring)
4. `finish_turn` last, alone. Leave `results` empty: this tool has no `result_id` and no visual output. Only `generate_sketch`, `import_youtube_thumbnail`, and `search_youtube` fill `results`

## Wiring

New swipeFile nodes need `image_source`. Existing canvas nodes keep their image if you omit it.

**place_node** (one live iv-* node; kind is implied by the id; do not send kind=logo on iv-ref-*):

```
place_node node:
  id: iv-ref-1
  type: swipeFile
  data: { image_source: "stored:sf_<id>", label: "<title>" }
```

Slots: iv-ref-1, iv-ref-2, iv-ref-3. Auto-wires to iv-generator **ref-in**.

**apply_workflow** (several nodes / A/B):

```
{ id: "ref-a", type: "swipeFile", data: { kind: "reference", image_source: "stored:sf_<id>", label: "<title>" } }
```

Edge to the generator: `targetHandle: "ref-in"` (variant A). A ref only variant B or C uses: `ref-in-b` / `ref-in-c`. Shared logos stay on `logo-in` with `stored:lg_`, not here.

place_node with `libraryUrls` stores `imageUrl` `/api/swipe-files/image?f=<id>` (not inline base64). apply_workflow inlines base64 unless that option is on. Either way the agent ref stays `stored:sf_<id>`.

**generate_sketch** (optional composition cue, paid): `reference_sources: ["stored:sf_<id>"]`. Face still `face_source: stored:persona_<id>` only.

**ask_user option.image**: `stored:sf_<id>` → `/api/swipe-files/image?f=<id>`, shape wide.

## Errors

This tool never sets `isError`. Empty library is a normal text result.

Downstream, if you pass a ref that is not in `swipe_files`:

- `place_node` / `apply_workflow`: `Image source not found on node <id>: stored:sf_<id>`
- `place_node` iv-ref-* with kind logo: `Node "iv-ref-1" is a reference swipeFile: its kind cannot be "logo"`
- New swipeFile without `image_source`: validation fails (`image_source` required when the node does not already exist)
- `generate_sketch`: `Cannot resolve image_source stored:sf_<id>: Image not found: stored:sf_<id>` (`requestNotSent`)

Do not invent ids. Do not strip the `stored:sf_` prefix. Do not pass `/api/swipe-files/image?f=` as `image_source` (tools want the stored ref; the canvas URL is an implementation detail).

MCP invalid args (if a client sends a non-object): `Invalid arguments: …` with `isError`.

## Chains

Typical:

1. `read_skill` list_swipe_files (first use this conversation)
2. `list_swipe_files`
3. Empty → say so, then `import_youtube_thumbnail` or `request_user_image`; stop
4. Hits → `ask_user` (images) if the user must choose
5. `place_node` iv-ref-* **or** `apply_workflow` swipeFile kind=reference
6. Optional: `generate_sketch` with `reference_sources`
7. `finish_turn` (no `results` from this list)

YouTube path (does not start with this tool): `search_youtube` / `search_youtube_channel` / `get_channel_videos` / `list_followed_videos` / `find_competitor_thumbnails` → `import_youtube_thumbnail` → wire `stored:sf_<id>`. List later only if they ask what else is already saved.

Logo path: `list_logos` → `find_logos` / `add_logo` if missing. Never this tool.

Do not batch this with `list_personas` / `list_logos` / `search_youtube` on the first turn before you know the topic. After you know you need library swipes, one list is enough.

## Example

User: « Prends une de mes refs en bibliothèque, le style YouTube choc. »

You: `list_swipe_files` `{}`

Tool:

```
2 swipe file(s):
- stored:sf_0b5c7a0e-6a55-4d0b-9d51-3f2b1a2c9e11 — "MrBeast split" (184320 bytes, added 2026-09-17 18:02:11)
- stored:sf_aa11bb22-cc33-dd44-ee55-ff6677889900 — "Reference" (4096 bytes, added 2026-09-10 09:00:00)
```

Then `ask_user` (alone): question « Quelle référence garder ? », multiple, max_selected 3, options with `image: stored:sf_0b5c7a0e-6a55-4d0b-9d51-3f2b1a2c9e11` and the other id.

User picks the first. `place_node` iv-ref-1, `image_source: "stored:sf_0b5c7a0e-6a55-4d0b-9d51-3f2b1a2c9e11"`, label « MrBeast split ». Then `finish_turn` with a short summary, empty `results`.

Empty variant: tool returns `No swipe files in library.` Summary: no inspirations saved yet. next_actions: import a YouTube thumb they name, or upload one. Do not call `apply_workflow` with a fake `stored:sf_`.
