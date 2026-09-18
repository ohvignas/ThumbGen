---
name: import_youtube_thumbnail
description: Copies one YouTube video's published thumbnail into the library as stored:sf_<id> (same video once). Use when the user picks that exact thumb as a canvas reference. Not for classifying competitors (analyze_thumbnails) or previewing search hits (search_youtube / youtube: on ask_user).
---

# import_youtube_thumbnail

Downloads the **published** YouTube thumbnail (largest real size on `i.ytimg.com`) into `swipe_files` and returns `stored:sf_<id>`. Free. No vision model. The chat can show the image if you copy this call's `result_id` into `finish_turn.results`.

Two ids, never interchangeable:

| Token | Where it goes |
| --- | --- |
| `stored:sf_<uuid>` | `place_node` / `apply_workflow` `image_source`, `generate_sketch` `reference_sources`, `update_brief` `references[].source` |
| `result_id: <toolCallId>` | `finish_turn.results` only (so the user sees the import in chat). Last text line of a **successful** chat call. Copy it exactly. |

## When

- The user wants **that** published thumb as visual inspiration on the canvas (own past video, a competitor they named, a pasted watch URL).
- After they pick one `youtube:<videoId>` option (followed list, competitor list, search). Import the chosen id, not the whole list.
- Right before wiring a reference: `place_node` `iv-ref-1..3`, or `apply_workflow` swipeFile `kind="reference"`, or `generate_sketch` `reference_sources: ["stored:sf_<id>"]`.

## When not

- **`analyze_thumbnails`** — paid vision pass on up to 12 ids from the last `find_competitor_thumbnails`. Writes `brief.competition` (patterns / saturation / palette). Returns two text lines, **no image**, **no** `stored:sf_`, **not** a visual `result_id`. Import copies pixels into the library; analyze classifies without copying. Do not import 12 competitors "so you can analyze them".
- **Just looking** — `search_youtube` already loads thumbs for the turn (visual `result_id`). `ask_user` option `image: "youtube:<videoId>"` renders without import.
- **Already in the library** — this turn or a previous one printed `stored:sf_<id>` for that video. Later history replaces the pixels with `[image retirée — la miniature est déjà dans la bibliothèque (référence ci-dessus), ne la réimporte pas]`. Re-calling the tool is a no-op (same `sf_`) but still wastes a step. Prefer the existing ref; `list_swipe_files` if you lost it.
- **More than 3 references** — canvas `iv-ref-1..3` and `brief.references` cap at 3. Ask which to keep. Do not import a dozen "just in case".
- Logos (`stored:lg_`, swipeFile `kind="logo"`), Personnages (`stored:persona_`), sketches (`generated:sk_`), or a new generated thumb (`generate_sketch`).
- A final paid generation — `finish_turn` `kind: "generate"`; the user clicks « Générer ».

## How

### Inputs

- **`video_id`** (required): the 11-character id only (`[\w-]{11}`, e.g. `dQw4w9WgXcQ`). The download rejects any other shape (URL, `youtube:` prefix, Shorts path) with "No thumbnail found".
  - Strip `youtube:` from `list_followed_videos` / `find_competitor_thumbnails` lines.
  - From `search_youtube` / `get_channel_videos` take the `[videoId]` token, not the thumbnail URL.
  - From a watch link take the 11-char id (`watch?v=`, `youtu.be/`, `/shorts/`).
- **`label`** (optional):
  - **Followed-channel video** (`list_followed_videos` / « Ma chaîne »): **ignored**. Library title is the video title, same as the UI « Utiliser comme référence ».
  - **Untracked video**, first copy: used as the swipe-file title. If omitted: `YT — <title>` (first 60 chars) when a YouTube Data API key exists, else `YT <video_id>`. Title lookup is best-effort (1 quota unit, failure still imports).
  - **Untracked re-import**: `label` if you pass it, else the stored title.

You do not choose the copy path. The tool does.

### Copy paths (dedupe)

1. **Followed** — row in `channel_videos`. Same helper as the UI. One library row per video (`channel_videos.swipe_file_id`). Two calls at once share one download. Not written to `youtube_thumbnail_copies`.
2. **Untracked, already copied** — `youtube_thumbnail_copies.video_id` primary key. Returns the original `sf_`. No second download. First write wins (`INSERT OR IGNORE`); a later `label` does not create a new row.
3. **Untracked, first time** — `fetchBestThumbnail` then `saveThumbnailToLibrary` then `rememberCopy`. Sizes tried in order: `maxresdefault`, `sddefault`, `hqdefault`, `mqdefault`, `default`. Grey YouTube placeholders (< 2 KB) are skipped. Stored MIME is `image/jpeg`. No Data API key required for the image.

A YouTube key is **not** required to import. `search_youtube` / `get_channel_videos` still need a key; `list_followed_videos` does not.

### Success (chat)

Text then image then `result_id`:

```
Thumbnail imported. Reference: stored:sf_<uuid> (label: "<label>", N KB). Wire this as a swipeFile (kind="reference") in apply_workflow.
```

plus a JPEG, plus a last line `result_id: <toolCallId>` (AI SDK adapter; only on success, not on `isError`). MCP has no `result_id` line — this skill is for Brainstorm chat.

`finish_turn` (mandatory last call, **alone**, after this result is back):

- `results`: this `result_id` (and other visual ids this turn), display order, max 6. Visual tools: `generate_sketch`, `import_youtube_thumbnail`, `search_youtube`. Empty `results` hides the image from the user.
- Do not put `stored:sf_…` in `results`.
- `summary` ≤ 400 chars, reply language: what you imported, not the raw ref.

The preview card has **no** « + canvas » button (that is sketches only). You must place the node.

### Wire `stored:sf_<id>`

`place_node` (one live interview node; not in the same step as `ask_user` or `finish_turn`):

```
id: iv-ref-1   (or iv-ref-2 / iv-ref-3)
type: swipeFile
data: { image_source: "stored:sf_<uuid>", label?: "…" }
```

`kind` is implied by the id (`reference`). Do not set `kind: "logo"`.

`apply_workflow` (full graph / A/B): a `swipeFile` node with `kind: "reference"`, `image_source: "stored:sf_<uuid>"`, edge onto the generator `ref-in` (shared by B/C). Unknown `image_source` → `Image source not found on node …`.

`generate_sketch`: `reference_sources: ["stored:sf_<uuid>"]` (optional, paid).

`update_brief`: `references` **replaces** the whole list (max 3). Each `source` must match `stored:sf_<id>`.

## Errors

Quoted server text. Do not invent a thumb. Do not retry the same id in a loop.

| Situation | What you get |
| --- | --- |
| Id not 11 chars `[\w-]`, no real size, or followed video with no thumb | `isError`, `No thumbnail found for video_id=<id>` |
| Followed video, network / 15s timeout | `isError`, `YouTube is unreachable, could not import video_id=<id>` |
| Untracked network / timeout | tool failure (`YouTube injoignable`) |
| Cache hit (followed `existing` / copies table) | **success**, same `stored:sf_`, image still attached |

Missing YouTube key does **not** block import. Tell the user only if a **search** tool failed for that reason.

## Chains

Typical:

1. Discover ids: `list_followed_videos` (local, no quota; own catalog) or `search_youtube` / `get_channel_videos` / `find_competitor_thumbnails`.
2. Optional `ask_user` with `image: "youtube:<videoId>"` (no import yet). Never same step as `place_node` / `finish_turn`.
3. `import_youtube_thumbnail` on the **chosen** ids only (≤3, parallel ok).
4. `place_node` `iv-ref-N` and/or `apply_workflow`, optional `update_brief` `references`.
5. `finish_turn` with those import `result_id`s in `results`.

Vs neighbors:

| Need | Tool |
| --- | --- |
| Own followed catalog | `list_followed_videos` then import picks |
| Ad-hoc public search (quota 100) | `search_youtube`; import only if they want it on the canvas |
| Channel listing | `search_youtube_channel` then `get_channel_videos` then import |
| Scored FR/EN competitors, no images | `find_competitor_thumbnails` |
| What works / what everyone does | `analyze_thumbnails` on those ids (not import) |
| Already in library | `list_swipe_files` — skip import |
| Script / title copy | `extract_youtube_script` — not this tool |

## Example

User: « Prends la miniature de ma vidéo qui a le mieux marché comme référence. »

1. `list_followed_videos` `{ "scope": "mine", "sort": "score", "limit": 5 }`
   - line: `- youtube:aBcDeFgHiJk — "Ma meilleure vidéo" — …`
2. (optional) `ask_user` with that `youtube:aBcDeFgHiJk` as an option image.
3. `import_youtube_thumbnail` `{ "video_id": "aBcDeFgHiJk" }`
   - text: `Thumbnail imported. Reference: stored:sf_3f2c… (label: "Ma meilleure vidéo", 84 KB). …`
   - last line: `result_id: call_7Qx…`
4. `place_node` `{ "node": { "id": "iv-ref-1", "type": "swipeFile", "data": { "image_source": "stored:sf_3f2c…" } } }`
5. `finish_turn` `{ "summary": "J'ai posé ta miniature la plus performante en référence.", "results": ["call_7Qx…"], "next_actions": [] }`
