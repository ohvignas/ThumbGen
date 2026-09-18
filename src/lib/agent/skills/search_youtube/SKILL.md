---
name: search_youtube
description: Searches public YouTube (100 quota units per call, default French query + region FR with fallback, duration 4–20 min, visual thumbs) when the user names a query or scored competitors are not enough; not for followed catalogs (list_followed_videos, local, no quota), not for one named channel (search_youtube_channel / get_channel_videos), not for ranked FR/EN outliers (find_competitor_thumbnails, text only).
---

# search_youtube

Open-web YouTube Data API `search.list`. Returns a numbered list plus, by default, up to 6 thumbnail images for visual analysis. Quota-limited, not a paid OpenRouter call. Does not write the DB or copy thumbs into the library.

## When

- The user names a public query, topic, product, or “montre-moi des miniatures de …”
- You need to **see** competitor/example thumbs (composition, color, focal, text, faces)
- `find_competitor_thumbnails` is unavailable (no fiche, no key, or its 2-search cap) and you still need public examples
- A one-off search the ranked competitor tool would not cover (a title they typed, a niche keyword, a US-only look)

Know the topic first. “Fais-moi une miniature” is not a query.

## When not

| Need | Tool instead |
|---|---|
| Their followed catalog / « Ma chaîne » / what already worked | `list_followed_videos` (local DB, **no quota**, lines `youtube:<id>`) |
| Videos **inside one** @handle / URL / UC id, optional keyword | `search_youtube_channel` (100 units, text + URLs, no images) |
| That channel listed by date or viewCount, **no keyword** | `get_channel_videos` (100 units, text + URLs, no images) |
| Scored FR+EN outliers vs channel median, packaging refs | `find_competitor_thumbnails` (`query_fr` + `query_en`, **never images**, max 2/conversation, then `analyze_thumbnails`) |
| Copy one published thumb into the library | `import_youtube_thumbnail` after you have a video id |
| Spoken content of one video | `extract_youtube_script` with the video URL |

Do not:

- Query in **English** while `region` is FR — that trips the FR fallback ladder and dumps US thumbs
- Call this to “rank what works in the niche” when `find_competitor_thumbnails` is in the tool list
- Open a new video by dumping old public hits; ask what it is about
- Import 8–12 videos “just in case”
- Treat listing URLs as vision — without default thumbs you have not analyzed the design
- Mention a numbered interview / « Étape n/7 »

## How

Call `read_skill` with `search_youtube` before the first use in this conversation.

### `query` (required, string min 1)

Formulate in **French**. Include exact product/brand names.

Good: `"Claude Design avis"`, `"Cursor 2.0 test"`, `"meilleur logiciel design 2026"`.
Bad: `"best AI coding thumbnail"` with default FR (forces fallback → US thumbs).

### `sort` (optional, default `"relevance"`)

`"relevance"` | `"viewCount"` | `"date"`. Use `viewCount` for what is most clicked; `date` for newest; `relevance` for topical match.

### `limit` (optional, default `8`, int 1–12)

**Always leave at 8** unless the user asks otherwise. Fewer hits = weaker pattern reading. The API may still return fewer. Vision loads at most **6** images even if `limit` is 12.

### `include_thumbnails` (optional, default `true`)

Omitted or any value except `false` → fetch high (else medium) JPEG/PNG from YouTube’s CDN for the top 6 hits and attach them as images. `false` → text listing only (ids + thumbnail URLs). CDN fetches are **not** Data API quota. Failed image fetches are skipped; a partial gallery is success.

Leave the default on when you will comment on design. Set `false` only to harvest ids (then you still have not seen the thumbs).

### `region` (optional, default `"FR"`)

`"FR"` | `"US"` | `"any"`.

| Value | First request | Fallback if first pass returns fewer than 4 hits |
|---|---|---|
| `FR` (default) | `regionCode=FR` + `relevanceLanguage=fr` | 1) drop region, keep `fr` → header `fr (langue, toutes régions)`; 2) if still under 4, drop language → `any (aucun match FR)` |
| `US` | `regionCode=US` + `relevanceLanguage=us` | none |
| `any` | no region, no language | none |

Fallback runs **only** for default/explicit `FR`. Each extra `search.list` costs another 100 units. Header adds `(fallback global après FR < 4 résultats)` when a fallback was kept.

Pass `US` or `any` only when the user wants that geography.

### `duration` (optional, default `"medium"`)

YouTube `videoDuration`. No `"short"` value.

| Value | Meaning | Header |
|---|---|---|
| `medium` (default) | 4–20 min; excludes Shorts under 4 min | `4-20min (shorts exclus)` |
| `long` | over 20 min | `>20min` |
| `any` | all lengths, including Shorts | `tous formats` |

### Output (success)

1. Header: `N vidéo(s) sur "{query}" · sorted by {sort} · région {used} · durée {bucket}`.
2. One block per hit: `[i] [videoId] "title" — channel (YYYY-MM-DD)` and `thumbnail: {url}`.
3. If thumbs loaded: a short instruction to read composition / palette / focal / faces / text / contrast, then interleaved `[i] "title" — channel` + image for the top 6.
4. Adapter appends `result_id: <toolCallId>` on **non-error** results (including an empty list). Copy that id **exactly** into `finish_turn.results` (max 6) when the gallery is worth showing. The chat shows `search_youtube` full-width. Ids with no images do not render a gallery.

Video ids are the 11-char id, not `youtube:` prefixed. For `ask_user` option images use `youtube:<videoId>`. For `import_youtube_thumbnail` pass `video_id`.

Prior-turn images are stripped from later model input (`[image retirée de l'historique — rappelle l'outil si besoin]`). The chat still has them. Re-call only if you must see pixels again (another 100 units).

## Errors

| Situation | What you get | Do |
|---|---|---|
| No `youtubeApiKey` | `isError`, `"YouTube API key not configured. Add it in Settings."` | Say so. Do not invent videos. Prefer `list_followed_videos` if they have a catalog. |
| `search.list` HTTP not OK (quota 403, 400, …) | `isError`, `"YouTube search failed: {status}"` | One sentence; do not retry in a loop. Fall back to what the user said / followed videos. |
| Zero hits after FR ladder (or US/`any` first pass) | **not** `isError`: `Aucun résultat pour "{query}" (région {requested}, durée {duration}).` | Rephrase in French, or `duration=any` / `region=any` once. Stop after one retry. |
| Zod (empty `query`, `limit` outside 1–12, bad enum) | Schema refusal before the handler | Fix the args; do not pad a fake query. |
| Some CDN thumbs fail | Those images omitted; the rest still return | Analyze what arrived. |

Empty and error results are not useful visual cards — omit them from `finish_turn.results` (the UI also hides results with no images).

Quota: advertised **100 units per tool call**. A sparse FR search can fire 2 extra `search.list` (200 or 300 units). Daily Data API budget is ~10 000. Do not spray this tool.

## Chains

1. `search_youtube` (defaults; French `query`; `limit` 8; thumbs on).
2. Read the 6 images. State concrete click reasons — do not generalize.
3. If they should pick refs: `ask_user` **alone** (not in the same step as `finish_turn`), `multiple` true, `max_selected` 3, `image: youtube:<videoId>`, allow skip. Then `import_youtube_thumbnail` only for the kept ids → `stored:sf_<id>` → swipeFile `kind=reference`.
4. End the turn with `finish_turn` **alone**, `results: ["<result_id>"]`, 1–2 sentences, optional `ask_agent` buttons.

`find_competitor_thumbnails` (when present) stays the ranked path: no images, then `analyze_thumbnails` on those ids — do not duplicate it with this tool in the same turn.

Do not call `finish_turn` in the same step as this tool.

## Example

User: « Montre-moi des miniatures Cursor 2.0. »

```
search_youtube
  query: "Cursor 2.0 test"
  # sort relevance, limit 8, include_thumbnails true, region FR, duration medium
```

After the gallery (`result_id: call_abc`):

```
finish_turn
  summary: "Six miniatures Cursor 2.0 : gros logo, visage choqué, texte 2–3 mots. On en garde en référence ?"
  results: ["call_abc"]
  next_actions:
    - { kind: "ask_agent", label: "Garder 1, 2 et 4", message: "Importe 1, 2 et 4 comme références." }
    - { kind: "ask_agent", label: "Chercher en anglais", message: "Refais la recherche en region US." }
```
