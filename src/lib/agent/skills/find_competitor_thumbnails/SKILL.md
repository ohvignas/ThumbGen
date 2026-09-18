---
name: find_competitor_thumbnails
description: Searches competing French and English YouTube videos, scores them vs each channel's median, and returns up to 12 youtube:<id> lines with no images (keeps at least 4 FR when they exist). Use to see what works in the niche. Max 2 searches per conversation. No key or quota: skip competitors and say so. Then analyze_thumbnails on those ids.
---

# find_competitor_thumbnails

Ranked FR+EN niche outliers versus each channel's own median views. Chat label: « Cherche les miniatures concurrentes ». Text only — never an image, never a `result_id`. Not a paid OpenRouter call; YouTube Data API quota only.

The server keeps the last hit list for `analyze_thumbnails`. This tool does **not** write `brief.competition` (patterns / saturation / palette). Do not invent competitors. Do not mention « Étape n/7 », « step 3 », or a 7-step journey — if this search cannot run, **skip competitors** and keep packaging.

Load with `read_skill` before the first call in this conversation.

## When

- You already know the **topic** (subject / promise / product) and competing packaging would help.
- They ask what works in the niche, « ce qui marche », outliers, or competing thumbs across many creators — not one named channel.
- Before `analyze_thumbnails`. That tool only classifies ids from **this** conversation's last stored search.

Know the video first. « Fais-moi une miniature » is not a query.

## When not

| Need | Tool instead |
|---|---|
| Their followed catalog / « Ma chaîne » / what already worked for them | `list_followed_videos` (local, **no quota**, lines `youtube:<id>`) |
| Videos **inside one** @handle / URL / UC id, optional keyword | `search_youtube_channel` (100 units, text + URLs) |
| That channel listed by date or viewCount, **no keyword** | `get_channel_videos` (100 units, text + URLs) |
| **See** public thumbs this turn (composition, color, faces) | `search_youtube` (images + `result_id`; default FR, duration medium) |
| Copy one published thumb into the library | `import_youtube_thumbnail` after an 11-char id |
| Spoken content of one video | `extract_youtube_script` on a watch URL |
| Classify thumbs you already searched | `analyze_thumbnails` (`video_ids` from this tool) |

Do not:

- Call this when they **forbid** looking at competitors — skip competitors, say so in one sentence.
- Call it before you know the topic. Ask what **this** video is about.
- Call it when `<thumbnail_brief>.usage.competitorSearches` is already **2**.
- Call `search_youtube` in the same turn to “also rank” the same niche.
- Import 8–12 competitor thumbs “just in case”.
- Dump old public hits when they start a **new** video.
- Send leftover `ask_user.step` or talk about Étape 3/7 — there is no competitor *step*; there is only this optional search.

## How

Exactly two strings. Both required. No other fields.

```
query_fr: string   # 1–200 chars after trim — French search
query_en: string   # 1–200 chars after trim — English search
```

Zod rejects empty, missing, or >200. Do not pad a fake query.

### Queries

Niche keywords in each language, with exact product/brand names. Not “meilleures miniatures”, not the full working title, not a script paste.

| Good `query_fr` | Good `query_en` |
|---|---|
| `Cursor 2.0 test` | `Cursor 2.0 review` |
| `Claude Design avis` | `Claude Design tutorial` |
| `meilleur logiciel design 2026` | `best design software 2026` |

FR search is `regionCode=FR` + `relevanceLanguage=fr`. EN search is `relevanceLanguage=en` with **no** region. A French query in `query_en` (or the reverse) pollutes the language buckets.

### What the server does (you do not configure this)

1. Refuses a third search (`usage.competitorSearches >= 2`) without hitting YouTube.
2. Needs `youtubeApiKey` in Réglages. No key → skip competitors (usage stays 0).
3. Then **counts one search** (`competitorSearches + 1`), even if the API later quotas.
4. Two `search.list` calls (`order=relevance`, `maxResults=25`, published in the last **18 months**).
5. `videos.list` in batches of 50 for unique ids.
6. Drops **Shorts** (duration ≤ 180 s), **lives** (`liveBroadcastContent` not `"none"`), videos **younger than 14 days**.
7. Scores each remaining hit vs that channel's median (followed catalog locally; else a 24 h cache; else long-form playlist then uploads, excluding the candidate itself). At most **24** channels get a median.
8. Keeps the top **12**, **deduped** (FR row wins if the same id hit both searches), and replaces trailing EN rows so at least **4 FR** remain when that many FR hits exist.
9. Overwrites the conversation's stored list. A second search **replaces** the first — `analyze_thumbnails` only sees the latest ids.

Median too thin (`< 8` non-recent samples, or median `< 500` views, or no median) → score is `peu de données`, sorted last. Score `> ×30` stays raw on the line and is flagged `viral atypique`; ranking itself caps at ×30. You never see titles — only the line below.

### Output (success, ≥1 hit)

One text part, no image, no `result_id` (not a visual tool; leave it out of `finish_turn.results`):

```
youtube:<videoId> | <channel> | <views> | <score> | <ageDays> j | <lang>
…
unités YouTube : <n>
```

`<score>` is `peu de données`, or `×2,0` (comma decimal), or `×40,0 viral atypique`. `<lang>` is `fr` or `en`. `<views>` is a raw integer. `<videoId>` is what you pass to `analyze_thumbnails` (strip `youtube:`) and to `ask_user` as `image: "youtube:<videoId>"`.

Typical quota: **200** units for the two searches (`search.list` = 100 each) + **1** per `videos.list` batch of ≤50 ids + **1** `playlistItems` per unfollowed channel whose median is not cached (then another **1** for that channel's `videos.list`). Followed channels and a fresh cache cost 0 extra. Daily Data API budget is ~10 000. Do not spray this tool.

## Errors

Quote the real strings. `isError: true`. Schema failures (empty query, only one language, length) happen **before** the handler.

| Situation | Text | Usage counted? | Do |
|---|---|---|---|
| No conversation / no fiche | `Conversation introuvable.` | no | Stop. Do not invent a list. |
| Already 2 searches | `Limite de 2 recherches de concurrents atteinte pour cette miniature.` | no (stays at 2) | **Skip competitors.** Continue with the last stored list if you already analyzed it, or with what they said / followed thumbs. Do not retry. |
| No `youtubeApiKey` | `Ajoute ta clé YouTube dans Réglages → Connexions Pas de clé YouTube ou quota atteint : continue sans miniatures concurrentes.` | no | One sentence: add the free key in Réglages → Connexions. **Skip competitors.** Do not invent videos. Prefer `list_followed_videos` if they have a catalog. |
| Daily quota (HTTP 403 `quotaExceeded` / `dailyLimitExceeded`) | `Pas de clé YouTube ou quota atteint : continue sans miniatures concurrentes.` | **yes** (already reserved) | **Skip competitors.** Do not retry any YouTube search tool this turn. |
| Network / timeout (`YouTube injoignable`) | `YouTube injoignable. Pas de clé YouTube ou quota atteint : continue sans miniatures concurrentes.` | yes | Retry **once**. Then skip competitors. |
| Other YouTube refusal | `YouTube a refusé la requête (<status> · <reason>)` (or the thrown `.message`) | yes | One sentence. Do not loop. Skip competitors. |
| Zero hits after filters | `Aucun concurrent trouvé. Continue sans analyse.` | yes | **Skip competitors** — do not call `analyze_thumbnails`. Rephrase **once** only if you still have a search left and the queries were clearly wrong. Then continue. |
| Reservation without a fiche | `Pas de fiche pour cette conversation.` | no | Stop. |

Never put the API key in anything you write. Never invent `youtube:` lines. Empty and error results are not visual cards — omit them from `finish_turn.results`.

## Chains

1. Topic is known → `find_competitor_thumbnails` with `query_fr` + `query_en`.
2. **Success** → same turn, next step: `analyze_thumbnails` `{ "video_ids": ["<id>", …] }` — the 11-char ids from those lines, **max 12**, only ids from **this** result. Cached ids are free; at most **2** paid analyses per conversation. Returns two lines: `Ce qui marche : …` / `Ce que tout le monde fait (à éviter) : …`. Load `analyze_thumbnails` before that first call. Do not import 12 thumbs in order to classify them.
3. Optional refs (max 3): `ask_user` **alone** (`multiple` true, `max_selected` ≤ 3, `allow_skip` true, **omit `step`**). Option `id` = video id, `image` = `youtube:<videoId>`, `label` from channel + score + lang (you have no title). Then `import_youtube_thumbnail` `{ video_id }` only for kept ids → `stored:sf_<id>` → swipeFile `kind=reference`.
4. **Skip path** (no key, quota, cap, empty, user said no): do **not** call `analyze_thumbnails`. Continue `thumbnail-packaging` from what they told you, `list_followed_videos`, and `list_logos`. One sentence that you continue without competing thumbs.
5. `finish_turn` last, **alone**. `results` empty for this tool. Summary: 1–2 sentences in the reply language — patterns if you analyzed, or that you skipped competitors. Optional `ask_agent` buttons (keep a look, search a tighter query). Never `ask_user` or `finish_turn` in the same step as this tool.

Do not call this twice in one turn. A second call in the conversation is only if the topic **changed** and they asked, and you still have a search left — it wipes the previous store.

## Example

User: « Miniature pour mon test de Cursor 2.0 — vois ce qui marche dans la niche. »

`<thumbnail_brief>.usage.competitorSearches` is 0. Topic is clear.

```
find_competitor_thumbnails
  query_fr: "Cursor 2.0 test"
  query_en: "Cursor 2.0 review"
```

Typical text:

```
youtube:goodfr00001 | Chaîne FR | 8000 | ×8,0 | 40 j | fr
youtube:goeden00001 | EN channel | 9000 | ×9,0 | 40 j | en
youtube:thin0000001 | Thin channel | 10000 | peu de données | 40 j | en
unités YouTube : 202
```

Next step:

```
analyze_thumbnails
  video_ids: ["goodfr00001", "goeden00001", "thin0000001"]
```

Then `finish_turn` with a two-sentence summary of `Ce qui marche` / what to avoid. `results: []`.

No key or quota instead:

You do **not** invent lines. Skip competitors. `finish_turn` `{ "summary": "Pas de recherche YouTube (clé ou quota) — on continue sans miniatures concurrentes.", "results": [] }`.
