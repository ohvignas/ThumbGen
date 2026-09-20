---
name: get_channel_videos
description: Lists videos of one YouTube channel by date (default) or viewCount (100 quota units). Use when the user names an external handle, URL or UC id and wants recency or what's most viewed. Prefer list_followed_videos for followed/« Ma chaîne » (local, no quota); use search_youtube_channel when they give a keyword inside that channel.
---

# get_channel_videos

Live YouTube Data API catalog of **one** channel. Text only (ids, titles, dates, medium thumbnail URLs). No images, no view counts, no scores, no DB write. Advertised cost: **100 quota units** per call (`search.list`). A handle also costs 1 unit (`channels.list` via `resolveChannelId`). Exposed on chat **and** MCP (not `chatOnly`). Chat label: « Liste les vidéos de la chaîne ».

## When

- The user names a **specific channel that is not in ThumbGen's followed catalog**: `@handle`, `youtube.com/@…`, `youtube.com/channel/UC…`, or a raw `UC…` id — and wants that channel's **latest** videos or **most viewed**.
- They ask what is **working** on that external channel, or want top-performing thumbnails as inspiration. Pass `sort: "viewCount"`. Default `sort` is recency (`date`).
- MCP client: `list_followed_videos` is **not** listed. This tool is the channel lister there.

## When not

- **Followed / « Ma chaîne »** (chat) → `list_followed_videos`. Local `channel_videos`, **0 quota**, shorts already dropped, performance `×score` / « récente » / `n/a`, lines `youtube:<videoId>`. `scope` `"mine"` (default) or `"all"`; `sort` `"date"` (default) or `"score"` (views ÷ channel median, **not** `viewCount`); `best_type: true` keeps the winning **title/description theme** when ≥3 scored thumbs exist; `limit` 1–12, default 5. No « Ma chaîne » → a **text** answer, not `isError`.
- **Keyword inside a channel** ("trouve la vidéo Claude sur @x") → `search_youtube_channel`. Same 100-quota `search.list`, same `channel` resolver, optional `query`, **always** `order=date`, **no** `viewCount` sort. Empty + query → `No videos matching "<query>" in this channel.`
- **Open-web / topic search** → `search_youtube` (region FR, duration medium / shorts excluded, optional thumbnail images, `result_id`). Scored FR/EN niche outliers → `find_competitor_thumbnails` (max 2 searches / conversation).
- They already have a **video id or watch URL** and want that thumb or transcript → `import_youtube_thumbnail` / `extract_youtube_script`. Do not list the whole channel first.
- Starting a **new** thumbnail ("Aide-moi à construire…"). Do not dump old videos. Ask what **this** video is about.
- No YouTube key, or you would call it "just in case". Quota is 10,000 units/day by default; do not paginate by repeating the call (no `pageToken` — a second call with the same args is the same top N, another 100 units).
- Do not pass a **video** URL, a playlist `PL…` / `UU…`, a topic query, or `/user/…` as `channel`.

**Vs `search_youtube_channel`:** both resolve `channel` the same way and hit `search.list` at 100 units. **This** tool has `sort: "date" | "viewCount"` and **no** `query`. **That** tool has optional `query` and is **date-only**. If they gave a keyword, only `search_youtube_channel`. If they asked "top / most viewed / what works", only this tool with `sort: "viewCount"`. Do not call both on the same channel in one turn.

**Vs `list_followed_videos`:** that tool never leaves the laptop. This tool is live YouTube, may include Shorts (no `videoDuration` filter), does **not** return view counts even when sorted by `viewCount` (snippet only — YouTube's **order**, not statistics), and does not classify types. `sort: "viewCount"` ≠ `sort: "score"`. A `<channel_profile>` YouTube channel is **not** a reason to burn 100 units; if it is followed, use `list_followed_videos`.

## How

```
channel: string              # required — handle, channel URL, or UC id
limit?: number               # optional int 1–50, default 10
sort?: "date" | "viewCount"  # optional, default "date"
```

**`channel` (required)** — passed to `resolveChannelId` after trim:

| Input | Resolution |
|---|---|
| `@handle` | `channels.list?forHandle=` (strips `@`) → UC id |
| `https://www.youtube.com/@handle` (or `youtube.com/@…`, with or without `https://`) | same handle lookup |
| `https://www.youtube.com/channel/UC…` | UC id, **no** extra request |
| raw `UC` + ≥20 `[\w-]` | accepted as-is, **no** extra request |
| `youtube.com/c/name` | treated as `@name`, then handle lookup |

Anything else (watch URL, `PL…`/`UU…` playlist, `/user/…`, empty, a search phrase) → `Cannot parse channel: <input>`.

**`limit`** — `maxResults` on `search.list`. Omit unless they asked for more; 10 is enough to pick references. Quota is 100 **regardless** of `limit`. Cap 50; there is no next page.

**`sort`** — `order` on `search.list`. Omit for newest. `"viewCount"` for inspiration from what's most clicked. There is no `"relevance"`, `"score"`, or `"rating"`.

**Request** — `part=snippet`, `type=video`, `channelId`, `order`, `maxResults`. No `q`, no region, no duration, no `pageToken`. Not a paid image model. Does not write `swipe_files` / `channel_videos`.

**Output (success, ≥1 video)** — one text part, no image, no `result_id` (`isVisualResultTool` is false; not in `HISTORY_IMAGE_TRIMMED_TOOLS`):

```
N video(s) (sorted by date):
- [<videoId>] "<title>" — <publishedAt> — thumbnail: <medium url or empty>
```

Header uses `sorted by viewCount` when that sort was passed. `publishedAt` is the full ISO timestamp. The `[videoId]` in brackets is what you pass to `import_youtube_thumbnail` as `video_id`, and what you prefix as `youtube:<videoId>` on an `ask_user` option `image`. The `thumbnail:` URL is a YouTube CDN link in **text** — you do **not** see the pixels, and you must **not** wire that URL as `image_source`. Empty `items` (including missing `data.items`) → `No videos found.` without `isError`.

## Errors

Quote the real strings. `isError: true` only for the rows marked yes. Schema failures (`limit` 0/51, `sort: "score"`, missing `channel`) happen **before** the handler (`Invalid arguments: …`).

| When | `isError` | Text | What you do |
|---|---|---|---|
| No `youtubeApiKey` (settings / `YOUTUBE_API_KEY`) | yes | `YouTube API key not configured.` | One sentence: add the free key in Réglages → Connexions. Do not invent a catalog. (Neighbor `search_youtube_channel` appends ` Add it in Settings.` — this tool does not.) |
| Unparseable `channel` | yes | `Cannot parse channel: <input>` | Ask for `@handle`, a channel URL, or `UC…`. Do not retry the same string. |
| Handle lookup HTTP error | yes | `Channel lookup failed: <status>` | 403 → quota/key; 404/other → check the handle. Do not loop. |
| Handle lookup network throw | yes | `Network error: <message>` | Retry **once**. Then say YouTube is unreachable. |
| Handle has no `items[0].id` | yes | `No channel found for handle <value>` | `<value>` includes `@`. The handle does not resolve — ask them to confirm it. |
| `search.list` not OK | yes | `Search failed: <status>` | 403 is usually daily quota (10,000). Stop YouTube search tools this turn. |
| Zero videos | **no** | `No videos found.` | Tell them. Do not fake rows. A new or empty channel is possible. |

Unhandled: the search `fetch` itself has **no** try/catch (unlike handle lookup). A thrown network error is not one of the strings above — say YouTube is unreachable, do not retry more than once.

Never put the API key in anything you write. Never invent view counts from `sort: "viewCount"`.

## Chains

1. **Pick references (this is the point)** — `get_channel_videos` → `ask_user` **alone** in its step (`multiple: true`, `max_selected` ≤ 3, `allow_skip` ok). Each option: `id` = the video id (≤40 chars), `label` = short title, `image` = `youtube:<videoId>`. Max **3** refs. Do not import 10 "just in case". Omit `step` (no Étape n/7). Never pair `ask_user` with `place_node` or `finish_turn`.
2. **Import** — for each kept id, `import_youtube_thumbnail` `{ video_id }` (11-char id, **not** `youtube:`). Followed copies are deduped with « Utiliser comme référence »; others still land as `stored:sf_<id>`. Success text: `Thumbnail imported. Reference: stored:sf_<id> (label: "…", N KB). Wire this as a swipeFile (kind="reference") in apply_workflow.` plus an image and a `result_id:` line. Already in the library → same `stored:sf_` , do not re-import. Then `place_node` / `apply_workflow`: swipeFile `kind: "reference"`, `image_source: "stored:sf_<id>"` on `ref-in` (or `ref-in-b` / `ref-in-c`).
3. **This video's content** — after they pick one, `extract_youtube_script` on its watch URL if you still lack the promise. Do not transcribe a competitor "just to look".
4. **Their own past thumbs (chat)** — skip this tool; `list_followed_videos` (`sort: "score"`, optional `best_type: true`) → same `ask_user` / `import_youtube_thumbnail` chain (`youtube:` is already on each line).
5. **Keyword on a named channel** — `search_youtube_channel` only, then the same import chain.
6. **End the turn** — `finish_turn` last, alone. `results` = `result_id` values from **`import_youtube_thumbnail`** this turn (max 6), never from this tool. Summary: 1–2 sentences, what you found, which they picked.

Load `import_youtube_thumbnail` before the first import. Load `list_followed_videos` instead when the channel is already followed.

## Example

User: "Qu'est-ce qui marche visuellement sur @mkbhd ? Prends 2 miniatures en référence."
Channel is **not** followed. `<channel_profile>` may list a different YouTube channel — ignore it for this ask.

```
get_channel_videos
  channel: "@mkbhd"
  sort: "viewCount"
  limit: 10
```

Typical text:

```
10 video(s) (sorted by viewCount):
- [dQw4w9WgXcQ] "Why this phone won" — 2026-03-01T18:00:00Z — thumbnail: https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg
- [abcdefghijk] "I tried every AI editor" — 2026-02-14T12:00:00Z — thumbnail: https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg
```

You still have **not** seen the pixels. Next step, **alone**:

```
ask_user
  question: "Lesquelles garder en référence ?"
  multiple: true
  max_selected: 2
  allow_skip: true
  options:
    - { id: "dQw4w9WgXcQ", label: "Why this phone won", image: "youtube:dQw4w9WgXcQ" }
    - { id: "abcdefghijk", label: "I tried every AI editor", image: "youtube:abcdefghijk" }
```

They pick both → two `import_youtube_thumbnail` calls `{ video_id: "dQw4w9WgXcQ" }` / `{ video_id: "abcdefghijk" }` → wire `stored:sf_…` as references → `finish_turn` with those two `result_id`s.

If they had asked "trouve sa vidéo sur l'iPhone" → `search_youtube_channel` `{ channel: "@mkbhd", query: "iPhone" }` instead, never this tool.

If they had asked "mes miniatures qui surperforment" and « Ma chaîne » is followed → `list_followed_videos` `{ scope: "mine", sort: "score" }`, never this tool.
