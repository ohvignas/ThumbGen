---
name: search_youtube_channel
description: Searches videos inside one YouTube channel (optional keyword; handle, URL, or UC id; 100 quota units). Use when the user names a specific channel; not for open-web search (search_youtube), date/viewCount lists without a keyword (get_channel_videos), or followed « Ma chaîne » (list_followed_videos).
---

# search_youtube_channel

Keyword search **inside one channel**. Chat label: « Cherche dans la chaîne ». Text-only (video id, title, publishedAt, medium thumbnail URL). No images, no `result_id`, no DB write. Listed to both the in-app agent and MCP.

Load this skill with `read_skill` before the first call in the conversation.

## When

- The user names **a specific channel** (handle, channel URL, or `UC…` id) and you need videos from **that** channel.
- They also name a **topic or keyword** to mine inside it (“ses vidéos Claude”, “trouve le tuto Cursor sur @Fireship”).
- They want **recent uploads** from that channel and you have no keyword — omit `query`; the tool still lists newest-first.
- You need ids/titles/thumb URLs to ground packaging in that channel’s existing content, then optionally import one.

## When not

- **No channel named** — open-web discovery, “des exemples sur YouTube”, competitor vibes across many creators → `search_youtube` (required `query`, region/duration, can attach thumbnail images, `result_id`).
- **List a channel without a keyword**, especially “ce qui marche” / top videos → `get_channel_videos` (`sort`: `date` default or `viewCount`). This tool **cannot** sort by views; `order` is hard-coded to `date`.
- **« Ma chaîne » or already-followed catalogs** in ThumbGen → `list_followed_videos` (local DB, **no YouTube quota**, `sort` `date`|`score`, `scope` `mine`|`all`). Do not spend 100 units to re-fetch what is already synced.
- **Scored FR/EN niche outliers** → `find_competitor_thumbnails`, then `analyze_thumbnails`.
- They already gave a **video URL or 11-char id** → `import_youtube_thumbnail` and/or `extract_youtube_script`. Do not search the channel first.
- Do not paginate: there is **no `pageToken`**. Cap is `limit` 50.
- Do not call this to “see” thumbnails. URLs are text; `search_youtube` (and `import_youtube_thumbnail`) are the visual tools. Do **not** put this call in `finish_turn.results`.

## Neighbors

| Tool | Scope | Keyword | Sort | Limit default / max | Visual | Quota |
| --- | --- | --- | --- | --- | --- | --- |
| `search_youtube_channel` | one channel | optional `query` | always `date` | 10 / 50 | text URLs only | 100 (`search.list`) |
| `get_channel_videos` | one channel | **none** | `date` or `viewCount` | 10 / 50 | text URLs only | 100 |
| `search_youtube` | open web | **required** | `relevance` / `viewCount` / `date` | 8 / 12 | fetches thumbs by default; `result_id` | 100 (+ FR fallbacks) |
| `list_followed_videos` | followed / « Ma chaîne » | no | `date` or `score` | 5 / 12 | `youtube:<id>` lines | **none** (local) |

Same channel resolver as `get_channel_videos` (`resolveChannelId`). Same YouTube `search.list` endpoint. Difference: this tool may set `q`; `get_channel_videos` never does, and only `get_channel_videos` exposes `sort`.

`search_youtube` never takes a `channel` argument. It localizes (default `region=FR`, `duration=medium`, French query) and can return images. This tool has **no** `region`, `duration`, `sort`, or `include_thumbnails`.

## How

### Arguments

- `channel` (string, **required**) — handle, channel URL, or raw channel id. Not a video URL, not a playlist id.
- `query` (string, optional) — keyword sent as YouTube Search `q`, **restricted to that channel**. Omit it (or pass empty) to list the most recent videos. Do not invent English queries for a French channel if the user spoke French.
- `limit` (integer 1–50, optional, **default 10**) — `maxResults`. There is no `sort` / `order` argument; do not pass one.

Zod rejects `limit` outside 1–50 or a missing `channel` before the handler runs (MCP: `Invalid arguments: …`).

### Channel resolution (`resolveChannelId` → `parseChannelInput`)

1. Read `youtubeApiKey` from Settings. Missing key → error (below).
2. Parse `channel` (trimmed):

   | Input | Result |
   | --- | --- |
   | `@handle` | handle → `channels.list?part=id&forHandle=handle` (1 extra quota unit) |
   | `https://www.youtube.com/@handle`, `https://youtube.com/@handle`, `youtube.com/@handle` (scheme optional) | same; `/@handle/videos` still matches the handle |
   | `https://www.youtube.com/channel/UCxxxxxx` | `UC…` id, **no** lookup call |
   | `https://www.youtube.com/c/Name` | treated as handle `@Name` then `forHandle` — **best-effort**; `/c/` custom URLs are not real handles and often fail |
   | raw `UC` + ≥20 `[\w-]` | accepted as-is, no lookup |
   | `PL…` or `UU…` (playlist / uploads playlist) | **not** a channel → parse fails |
   | bare handle without `@`, `/user/…`, watch URLs, `youtu.be/…` | parse fails unless the string is a raw `UC…` id |

3. Handle lookup uses `forHandle` with the leading `@` stripped (`replace("@", "")`). Empty `items` → not found.
4. `/channel/` only accepts an id that **starts with `UC`**. Other `/channel/` paths fail parse.

Followed-channel ingest (`resolveChannelInput` in `youtube/api.ts`) is **wider** (bare handles, `UU…` → `UC…`, `PL…` via `playlists.list`). **This tool does not.** Pass `@handle`, a `/channel/UC…` URL, or a `UC…` id.

### Search call

`GET https://www.googleapis.com/youtube/v3/search` with:

- `part=snippet`
- `channelId` = resolved id
- `type=video`
- `order=date` (always)
- `maxResults` = `limit ?? 10`
- `q` = `query` only when `query` is truthy
- `key` = Settings YouTube API key

Quota: **100 units** per `search.list` (tool description). Resolving a handle adds `channels.list` (**1 unit**). A raw `UC…` or `/channel/UC…` skips that extra call. This path does **not** parse `quotaExceeded`; a 403 is just `Search failed: 403` or `Channel lookup failed: 403`.

The search `fetch` is **not** wrapped in try/catch (only the handle lookup is). Network failure on `search.list` can throw instead of returning a quoted error.

### Success shape

```
N video(s):
- [videoId] "title" (published 2026-04-01T00:00:00Z) — thumbnail: https://…
```

- `N` is `items.length` (may be below `limit`).
- `publishedAt` is the full ISO timestamp (not sliced to a date).
- Thumbnail is `snippet.thumbnails.medium.url`, or empty if missing. **high** is never used.
- No `channelTitle` (you already scoped the channel).
- No image parts. `finish_turn.results` must stay empty for this call (`VISUAL_RESULT_TOOLS` is only `generate_sketch`, `import_youtube_thumbnail`, `search_youtube`).

Empty channel / no hits is **not** `isError` — see Errors.

## Errors

Quote and treat as terminal unless you can fix the argument (wrong `channel` shape, then retry once).

**`isError: true`**

- `YouTube API key not configured. Add it in Settings.` — tell the user to add the key in Réglages. Do not fake results. (`get_channel_videos` uses the shorter `YouTube API key not configured.` without the Settings sentence.)
- `Cannot parse channel: ${channel}` — `channel` is not `@handle`, a supported URL, or a raw `UC…` id. Ask for `@handle` or a `youtube.com/channel/UC…` / `youtube.com/@…` link. Playlist ids (`PL…` / `UU…`) hit this.
- `Network error: ${message}` — `channels.list` (handle lookup) threw.
- `Channel lookup failed: ${status}` — `channels.list` HTTP not OK (e.g. `403`, `400`).
- `No channel found for handle ${parsed.value}` — handle lookup returned no `items`. `${parsed.value}` still has the `@` (e.g. `No channel found for handle @Fireship`). `/c/Name` failures often look like this.
- `Search failed: ${status}` — `search.list` HTTP not OK.

**Not `isError` (empty list)**

- `No videos matching "${query}" in this channel.` — `query` was set and `items` is empty. Try a simpler keyword, drop `query` for newest, or switch to `get_channel_videos` if they wanted a full recent/top list rather than a keyword.
- `No videos found.` — no `query` (or empty) and `items` is empty.

Do not invent videos when you see these strings.

## Chains

1. `read_skill` `search_youtube_channel` (this file) → call the tool.
2. Show a short pick of titles in `finish_turn.summary`. Offer `ask_user` (or `ask_agent` buttons) to choose **which** video to keep — max 3 refs on a thumbnail.
3. `import_youtube_thumbnail` with `video_id` = the 11-char id in `[…]`. Returns `stored:sf_<id>`; wire `swipeFile` `kind="reference"`. Same video is copied only once.
4. For packaging that video: `extract_youtube_script` with `url` `https://www.youtube.com/watch?v=<videoId>` (truncated at 8000 chars with `…[truncated]`).
5. Same channel, **no** keyword, want **views** → `get_channel_videos` `sort: "viewCount"`.
6. Same topic, **any** channel → `search_youtube` or `find_competitor_thumbnails`.
7. Their own synced catalog → stop and use `list_followed_videos` instead of another 100-unit call.
8. End the turn with `finish_turn` alone, after other tools return. Do not cite this tool in `results`.

## Example

User: « Cherche les vidéos Claude sur @Fireship. »

```
search_youtube_channel
channel: "@Fireship"
query: "Claude"
limit: 10
```

Typical success line:

```
2 video(s):
- [abc123xyz00] "Claude 4 just dropped" (published 2026-04-01T00:00:00Z) — thumbnail: https://i.ytimg.com/vi/abc123xyz00/mqdefault.jpg
```

Then, if they pick that video: `import_youtube_thumbnail` `{ "video_id": "abc123xyz00" }`. `finish_turn.results` gets **that** import’s `result_id`, not this search.

Newest-only on a `/channel/UC…` URL (no keyword, skips handle lookup):

```
search_youtube_channel
channel: "https://www.youtube.com/channel/UCXuqSBlHAE6Xw-yeJA0Tunw"
limit: 8
```

Wrong: `search_youtube` `{ "query": "Fireship Claude" }` when they already named the channel — that searches the whole site. Wrong: `get_channel_videos` when they asked for a **keyword** inside the channel. Wrong: `search_youtube_channel` `{ "channel": "Fireship" }` without `@` → `Cannot parse channel: Fireship`.
