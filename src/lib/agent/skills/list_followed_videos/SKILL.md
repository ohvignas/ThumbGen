---
name: list_followed_videos
description: Lists already-synced videos from followed YouTube channels in the local DB (no quota; scope mine=« Ma chaîne » or all; sort date or score; optional best_type; youtube:<videoId> for ask_user) when they want their own or followed thumbs; not a live open-web search (search_youtube, 100 units) and not the opening of a new-video brief they already described.
---

# list_followed_videos

Local SQLite catalog of videos **already imported** into `channel_videos` for `followed_channels`. Chat label: « Liste les vidéos suivies ». `chatOnly: true` — **not** on MCP. Text only: no image parts, no `result_id`, no YouTube Data API, no OpenRouter, no DB write. Tests stub `fetch`; this handler never calls it.

Call `read_skill` with `list_followed_videos` before the first use in this conversation.

## When

- They want **their** past thumbs / what already worked (« mes miniatures », « Ma chaîne », « ce qui surperforme chez moi »)
- They want the **followed** catalog (own + competitors they added in Chaînes suivies), not the open web
- You need `youtube:<videoId>` tiles for `ask_user`, or ids to `import_youtube_thumbnail`
- `best_type: true` + `sort: "score"` to keep only the thumbnail type that wins in this scope (≥3 scored thumbs)

Know what **this** video is about first. Then list as references, not as a substitute for the brief.

## When not

| Need | Tool instead |
|---|---|
| Public topic / « montre-moi des miniatures de … » / **see** pixels | `search_youtube` (**100 quota units** / `search.list`, key required, default FR + thumbs) |
| One **named** external `@handle` / URL / `UC…`, recency or most viewed | `get_channel_videos` (100 units; `sort` `"date"` \| `"viewCount"`) |
| Keyword **inside** one named channel | `search_youtube_channel` (100 units, date-only, optional `query`) |
| Scored FR+EN niche outliers | `find_competitor_thumbnails` then `analyze_thumbnails` |
| Copy one published thumb into Bibliothèque | `import_youtube_thumbnail` with the 11-char `video_id` (after they pick) |
| Spoken content of one video | `extract_youtube_script` with `https://www.youtube.com/watch?v=<id>` |
| Swipes already in the library | `list_swipe_files` (`stored:sf_<id>`) |

Do not:

- Open a **new** thumbnail (« Aide-moi à construire… », they already described this video) by dumping old catalog rows. Ask what **this** one is about.
- Spend **100 units** on `search_youtube` / `get_channel_videos` / `search_youtube_channel` to re-fetch a channel that is already followed.
- Pass a query, `@handle`, `UC…`, period, `pageToken`, `include_thumbnails`, or `sort: "viewCount"` — those args **do not exist** here.
- Put this call in `finish_turn.results` (not a visual tool). `VISUAL_RESULT_TOOLS` is only `generate_sketch`, `import_youtube_thumbnail`, `search_youtube`.
- Import 8–12 videos « just in case ». Max **3** refs on a thumbnail.
- Mention « Étape n/7 ».

MCP clients never see this tool. There, list a named channel with `get_channel_videos`.

### Vs `search_youtube` (quota)

| | `list_followed_videos` | `search_youtube` |
|---|---|---|
| Source | Local `channel_videos` ⋈ `followed_channels` | Live `search.list` |
| Quota | **0** (no key, no `fetch`) | **100 units** per call; sparse FR can add 2 extra `search.list` (200–300) |
| Key | none | `youtubeApiKey` or `isError` |
| Scope | followed only (`mine` / `all`) | open web (`query` required) |
| Sort | `"date"` (default) or `"score"` (views ÷ **that channel's** median) | `"relevance"` (default) / `"viewCount"` / `"date"` |
| Limit | default **5**, max **`LIST_FOLLOWED_VIDEOS_MAX` = 12** | default **8**, max 12; leave at 8 |
| Images | none; `youtube:<id>` for `ask_user` tiles | up to 6 JPEGs; `result_id` |
| Shorts | dropped **at sync** (UULF, or duration ≤ 180 s on UU) | excluded when `duration` default `"medium"` (4–20 min) |
| Empty | header `0 vidéo(s)…` or the « Ma chaîne » skip line; **not** `isError` | `Aucun résultat pour "{query}"…` or `isError` on missing key / HTTP |

`sort: "score"` ≠ YouTube `order=viewCount`. Score is **this channel's** views / `median_views`, not raw views and not a global ranking.

## How

```
scope?: "mine" | "all"     # default "mine"
sort?: "date" | "score"    # default "date"
best_type?: boolean        # omit or false = every type
limit?: number             # int 1–12, default 5
```

Omit args for « Ma chaîne », newest first, 5 rows. Zod applies defaults before the handler (`{}` is valid). Extra keys are stripped. There is **no** `query`, `channel`, `period`, `offset`, `types`, or `views` sort — `listVideos` is always called with `channelId: null`, `period: "all"`, `q: ""`, `offset: 0`.

**`scope`**

- `"mine"` (default): `followed_channels.is_mine = 1` (« Ma chaîne »). Usually one row (the UI `setMineChannel` keeps a single flag); **every** flagged channel is included if several exist.
- `"all"`: every followed channel, including competitors they added.

Not a YouTube channel id. To list **one** unfollowed handle, use `get_channel_videos`. To pick one followed competitor from the mix, use `scope: "all"` and choose the lines.

**`sort`**

- `"date"` (default): `published_at DESC` (newest first, including videos <7 days old).
- `"score"`: SQL `score DESC NULLS LAST, published_at DESC`. Score exists only when `median_views > 0` **and** the video is ≥7 days old (`recentCutoff`). Recent rows have `NULL` score and sort **last**. Displayed perf still comes from `videoPerformance` (not the raw SQL ratio).

There is no `"views"`, `"viewCount"`, `"relevance"`, or `"rating"`.

**`limit`** — `LIST_FOLLOWED_VIDEOS_MAX` is **12**. Default **5**. No pagination: `offset` is hardcoded 0; a second call with the same args is the same top N. Raise toward 12 only if they ask for more. Do not pass `0`, a float, or `13`.

**`best_type`**

When `true`, `typesSummary(scope)` loads classified thumbs (`thumb_type IS NOT NULL`) in that same mine/all scope. Each type with **≥3 scored** videos (`MIN_SCORED_FOR_RANKING`) is `enoughData`; those rows sort first by **median score**. The first `enoughData` type is kept.

- Hit → `listVideos` `types: [thatType]`; header adds `, type {French label}` (e.g. `, type Visage + texte`). Unclassified rows drop out of the list.
- Miss → `types: []` (unfiltered, including unclassified); header adds `, pas assez de données pour un meilleur type`. Do not invent a winning type. Do not retry with `scope: "all"` unless they asked for every followed channel.

`false` / omitted: skip `typesSummary`.

Type labels (`thumbTypeLabel`; unknown/null → `Non classée`):

| id | label |
|---|---|
| `face_text` | Visage + texte |
| `reaction` | Réaction sans texte |
| `before_after` | Avant / Après |
| `versus` | Versus / comparaison |
| `screenshot` | Capture d'écran / interface |
| `object` | Objet ou produit central |
| `text_only` | Texte seul |
| `scene` | Scène / illustration |
| `other` | Autre |

**What the catalog contains**

Sync (not this tool) writes the rows. Lives (`liveBroadcastContent !== "none"`) are dropped. Shorts: long-form playlist `UULF…`, else uploads `UU…` keeping only `durationSeconds > 180`. Stale until the next Chaînes suivies sync — this is not live YouTube.

### Output (success, after the mine-guard)

One text part, header then one bullet per item (`items.length` may be below `limit`):

```
N vidéo(s) (Ma chaîne, tri date) :
- youtube:<videoId> — "<title>" — <channelTitle> — type: <label> — perf: ×4
```

Header pieces, concatenated:

- Scope phrase: `Ma chaîne` or `toutes les chaînes suivies`
- Sort phrase: `tri date` or `tri performance` (`score` → the word **performance**)
- Optional `, type {label}` when `best_type` found a winner
- Optional `, pas assez de données pour un meilleur type` when `best_type` found none
- Always ends `) :`

**`perf:`** from `performance.kind` only (no view counts, no dates, no thumbnail URLs, no band):

| kind | Printed | Meaning |
|---|---|---|
| `scored` | `×{score}` with `.` → `,` (`×4`, `×1,2`) | views / channel `median_views`, rounded to 1 decimal. ≥3 = over, <0.5 = under — **not** printed |
| `recent` | `récente` | published **< 7 days**; `viewsPerDay` exists but is **not** printed |
| `none` | `n/a` | old enough, but no usable median (`median_views` null or ≤ 0) |

Zero rows: `0 vidéo(s) (… ) :` and **no** bullets. Success, not `isError`.

### `youtube:<videoId>` for `ask_user`

Copy the token **verbatim** onto `options[].image`. The card loads `https://i.ytimg.com/vi/<videoId>/mqdefault.jpg` (wide 16:9, 2 columns). You do **not** see those pixels in **this** tool result; the user does on the card. Do not import first just to preview.

- `options[].id` = the video id (≤40 chars, unique), **not** the `youtube:` prefix
- `label` = short title (≤60)
- `multiple: true`, `max_selected` ≤ 3, `allow_skip` ok
- Omit leftover `step`. Call `ask_user` **alone** (never with `place_node` or `finish_turn`)

For `import_youtube_thumbnail`, pass `video_id` as the **11-char id only** (strip `youtube:`). Followed rows reuse the UI « Utiliser comme référence » helper; `label` is ignored; library title is the video title; same video → same `stored:sf_<id>`. For `extract_youtube_script`, rewrite to `https://www.youtube.com/watch?v=<id>` — do not pass `youtube:<id>`.

## Errors

The handler **never** sets `isError`. Quote the real strings.

| Situation | Text | Do |
|---|---|---|
| `scope: "mine"` and no `is_mine = 1` row | `Aucune chaîne n'est marquée « Ma chaîne » dans les chaînes suivies : skip this question or ask the user for a YouTube link or a description.` | Skip this question. Ask for a link or a description, or use `scope: "all"` if they wanted followed competitors, or `search_youtube` / a pasted URL. Do **not** retry `mine`. |
| Mine exists but catalog empty / `all` with nothing synced | `0 vidéo(s) (Ma chaîne, tri date) :` (or `toutes les chaînes suivies`) | Say the local catalog is empty. Do not invent ids. Sync happens in Chaînes suivies, not here. |
| `best_type` without ≥3 scored thumbs of one type | header includes `pas assez de données pour un meilleur type`; list is **unfiltered** | Use the lines you got, or `sort: "score"` without `best_type`. |
| Zod (`limit` 0/13/float, `sort: "viewCount"`, `scope: "UC…"`) | schema refusal **before** the handler | Fix args. Defaults are already valid. |
| MCP | tool **not listed** (`chatOnly`) | Use `get_channel_videos` on that client. |

Never invent `youtube:` ids. Never put a YouTube API key in anything you write. A missing key is irrelevant here.

## Chains

1. **`read_skill` `list_followed_videos`** once, then call the tool.
2. **Own / followed refs** — `{ scope: "mine" }` (or `"all"`), `sort: "score"` if they asked what works, optional `best_type: true`. Then `ask_user` **alone** with `image: youtube:<videoId>`. Then `import_youtube_thumbnail` `{ video_id }` for kept ids → `stored:sf_<id>` → `place_node` / `apply_workflow` swipeFile `kind: "reference"` on `ref-in`. Cap 3.
3. **This video's words** — after they pick one, `extract_youtube_script` on the watch URL if the promise is still unclear.
4. **New video, they already described it** — do **not** start here. `thumbnail-packaging` / `ask_user` about **this** title. List later only if they want their past look as a ref.
5. **Open-web examples** — `search_youtube` (French `query`, `limit` 8, thumbs on). Costs quota. Do not pair it in the same turn to « also list Ma chaîne » unless they asked both.
6. **Named unfollowed channel** — `get_channel_videos` / `search_youtube_channel`, not this tool.
7. **End** — `finish_turn` last, **alone**. `results` = `result_id`s from **imports** (or `search_youtube`) this turn, never from this list. Summary 1–2 sentences.

Do not call `finish_turn` in the same step as this tool. Do not start a paid final render; « Générer » is their click.

## Example

User: « Montre-moi mes miniatures qui marchent, on en garde deux en référence. »

```
list_followed_videos
  scope: "mine"
  sort: "score"
  best_type: true
```

Typical text (winning type, or the not-enough-data header if « Ma chaîne » has <3 scored thumbs of one type):

```
3 vidéo(s) (Ma chaîne, tri performance, type Visage + texte) :
- youtube:mine0000002 — "Titre mine0000002" — Ma chaîne — type: Visage + texte — perf: ×4
- youtube:mine0000003 — "Titre mine0000003" — Ma chaîne — type: Visage + texte — perf: ×2
```

Next step, **alone**:

```
ask_user
  question: "Lesquelles garder en référence ?"
  multiple: true
  max_selected: 2
  allow_skip: true
  options:
    - { id: "mine0000002", label: "Titre mine0000002", image: "youtube:mine0000002" }
    - { id: "mine0000003", label: "Titre mine0000003", image: "youtube:mine0000003" }
```

They pick both → `import_youtube_thumbnail` `{ video_id: "mine0000002" }` / `{ video_id: "mine0000003" }` → wire `stored:sf_…` → `finish_turn` with those import `result_id`s.

No « Ma chaîne » → the skip sentence; ask for a link or description. They said « des exemples Cursor 2.0 » and no followed catalog → `search_youtube` `{ query: "Cursor 2.0 test" }`, never this tool.
