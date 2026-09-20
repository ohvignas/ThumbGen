---
name: analyze_thumbnails
description: Vision-classifies competing YouTube thumbs from the last find_competitor_thumbnails call (cached per video_id is free; at most 2 paid OpenRouter calls per conversation) and returns two text lines. Use after that search with those video_ids (≤12). Not canvas pixels (view_canvas_images) and not a visual search gallery (search_youtube).
---

# analyze_thumbnails

Chat label: « Analyse les miniatures concurrentes ». Structured vision on **competing** YouTube thumbs the server already ranked. Cheap OpenRouter classify (`google/gemini-2.5-flash-lite`, `mqdefault`), not a generation. **Never an image.** Not a `finish_turn` visual result (`isVisualResultTool` is false — leave `results` empty). Load with `read_skill` before the first call.

The model never sees the JPEGs. You get two lines of French.

## When

- `find_competitor_thumbnails` just returned `youtube:<id>` lines and you need **what works / what everyone does** before proposing a package.
- The user asks how competing thumbs in this niche look (composition, faces, text, colors) after that ranked search.
- This conversation has no competition summary yet, and competing packaging would help.

Know the topic first. This tool does not search YouTube.

## When not

| Need | Tool instead |
|---|---|
| Pixels **on this canvas** (sketch, logo, Personnage, generated, upload) | `view_canvas_images` (`project_id`, optional `node_ids`). That sends JPEGs of **their** nodes. This tool never looks at the canvas. |
| Public query / « montre-moi des miniatures de … » / a gallery the user should **see** | `search_youtube` (quota, default thumbs, visual `result_id`). Do not duplicate a ranked competitor pass with it in the same turn. |
| Ranked FR+EN outliers (text lines, no images) | `find_competitor_thumbnails` first. This tool only classifies ids from **that** last search. |
| Copy one published thumb into the library | `import_youtube_thumbnail` **after** they pick 1–3 refs. Do not import 12 competitors “so you can analyze them”. |
| Followed catalog / one named channel | `list_followed_videos` / `search_youtube_channel` / `get_channel_videos` — those ids are **not** valid here unless they also appear in the last competitor search. |
| Spoken content | `extract_youtube_script` |

Do not:

- Call this with ids from `search_youtube`, a pasted URL, or `youtube:<id>` still prefixed — membership is the last `find_competitor_thumbnails` store (bare `videoId`).
- Call it when that search is missing or empty. Relance `find_competitor_thumbnails`, or skip competitors and package from what they said.
- Spend a **paid** slot on ids you already classified. Cached ids are free; mixed cached+fresh burns **one** of the two paid calls.
- Put this call in `finish_turn.results`. No `result_id` is appended.
- Mention a numbered interview / « Étape n/7 ». Competitors are optional, not a pipeline step.

**Vs `view_canvas_images`:** that tool is local canvas bytes (max 8 JPEGs, 768px) so you can **see** their workflow. This tool is remote competitor thumbs via OpenRouter, cache keyed by YouTube `video_id`, text-only. Wrong canvas → that tool. Wrong niche look → this one.

**Vs `search_youtube`:** that tool is an open-web `search.list` (100+ quota units) that **shows** up to 6 thumbs in chat. `find_competitor_thumbnails` is the ranked path (FR+EN, score vs channel median, **no** images, max 2 searches). This tool is the vision pass **after** that ranked list. Do not search again to “see” the same ids.

## How

One field:

```
video_ids: string[]   # required, 1–12 items, each 6–20 chars after trim
```

### `video_ids` — last search only

Copy the **11-char** id from each `find_competitor_thumbnails` line:

```
youtube:<videoId> | channel | views | ×score | age | lang
```

Strip `youtube:`. Do not pass the prefix (`youtube:` + 11 chars is 19 characters: Zod accepts it, the last-search filter then drops every id → error). Do not pass a URL.

The server:

1. Dedupes your array, keeps ids that exist on **this conversation’s last** competitor search, slices to 12.
2. Unknown ids (ghosts, search_youtube hits, a previous search that was overwritten) are dropped **silently**.
3. If nothing remains → error (see Errors).

Prefer **one** call with the useful ids from that list (up to 12). Last search is already capped at 12, with at least 4 FR when they exist. Include FR: saturation and palette are computed on FR only. Prefer lines with a real `×score` — patterns ignore `score < 3` and `peu de données` (`score` null).

### Cache vs paid (max 2)

Cache is the `thumbnail_analyses` table, **per `video_id` globally** (any conversation that already classified that video). Not per conversation.

| Request | OpenRouter | `brief.usage.analyses` | Log |
|---|---|---|---|
| Every requested id already cached | **none** | unchanged (free, unlimited) | none |
| At least one id missing | one classify per missing id, sequential | **+1 once** for the whole call | `classify-thumbnail` per attempt |
| Third call that still has a missing id | **refused** (`requestNotSent`) | stays at 2 | none |

The cap is **2 paid batches per conversation**, not 2 videos. Twelve uncached ids in **one** call cost one slot (~700 input tokens each, roughly a tenth of a cent for a full batch). Twelve uncached ids in twelve calls would need six conversations — so batch.

Invalid model JSON / schema mismatch / a thrown classify: that video is **skipped** (not saved). The call still succeeds if anything analyzed (cached or fresh). A skipped id does not fill the cache; sending it again is another paid classify if the batch has any miss.

Do not re-call “just in case” after a successful two-liner. A later cached-only call with a **different subset** is free and rewrites `brief.competition` for that subset — useful after a second competitor search whose hits were already classified elsewhere.

No OpenRouter key → paid path refuses before any classify. Cached-only still works without a key.

The handler does **not** `fetch()` the JPEG; the classifier is given `https://i.ytimg.com/vi/<id>/mqdefault.jpg`.

### What the server writes (no second LLM)

From the analyses it kept (`lang` + `score` from the last search):

| Fiche field | Rule | Shown to you |
|---|---|---|
| `patterns` | Top 3 traits among items with **score ≥ 3** (FR+EN). Tie-break: French locale sort. | Line 1 |
| `saturation` | Traits on **> 70 % of FR** thumbs (any score), max 3. Overused in the French feed — do not copy. | Line 2 |
| `dominantPalette` | Up to 3 `#RRGGBB` from FR thumbs, **weighted by score** (null/≤0 skipped). Tie-break: hex. | Fiche only |
| `analyzedAt` | ISO timestamp | Fiche only |

Traits, in French: type label (`Visage + texte`, `Réaction sans texte`, `Avant / Après`, `Versus / comparaison`, `Capture d'écran / interface`, `Objet ou produit central`, `Texte seul`, `Scène / illustration`, `Autre`), layout label (e.g. `Visage à gauche, objet à droite`, `Héros au centre, texte en haut`, `Versus / split`, `Écran au centre, visage en coin`, `Objet central sans visage`), background (`Fond uni` / `Dégradé` / `Scène` / `Capture d'écran`), plus `Logo`, `Flèche ou cercle`, `Visage` (faceCount > 0), `Texte` (textWords > 0).

Empty lists render as `—`.

### Output (success)

Exactly two text lines, ` · ` between traits:

```
Ce qui marche : Fond uni · Texte · Visage
Ce que tout le monde fait (à éviter) : Fond uni · Texte · Visage
```

No JSON, no palette, no per-video breakdown, no images. Trust this tool’s two-line summary over chat history for those fields. Do not invent a competition dump.

## Errors

Quote and act on the real strings. These set `isError` / `requestNotSent` (no classify):

| When | Text | What you do |
|---|---|---|
| No conversation / no fiche | `Conversation introuvable.` or `Pas de fiche pour cette conversation.` | Stop. One sentence. Do not invent patterns. |
| No last competitor search, or it is empty | `Aucune recherche de concurrents à analyser. Relance find_competitor_thumbnails.` | Call `find_competitor_thumbnails` if a search remains, else skip competitors and package from the brief / what they said. |
| Every id missing from that last search (including `youtube:` prefixes) | `Aucun identifiant ne correspond à la dernière recherche.` | Strip `youtube:`, use **this** search’s ids, retry **once**. Do not pull ids from `search_youtube`. |
| A paid call is needed but `usage.analyses >= 2` | `Limite de 2 analyses de miniatures atteinte pour cette miniature.` | Use whatever `competition` is already on the fiche, or a **cached-only** subset (free). Do not retry paid. Do not call `search_youtube` as a substitute ranker. |
| Missing ids and no OpenRouter key | `Clé API OpenRouter non configurée. Ajoute-la dans Réglages.` | Say so. Cached-only still works if every id is already stored. Do not invent a look. |

Zod (before the handler): empty `video_ids`, more than 12, or an id outside 6–20 chars after trim. Fix the args.

A successful call that skipped unreadable classifies is **not** an error. If both lines are `—`, say you could not read a pattern (low scores, FR-only saturation missed the 70 % bar, or every fresh classify failed) and still propose a package.

`find_competitor_thumbnails` itself may have said there is no YouTube key / quota — then there is no list to analyze. Skip. Do not invent videos.

## Chains

1. **New thumbnail, competitors useful** — topic known → `find_competitor_thumbnails` (`query_fr` + `query_en`) → `analyze_thumbnails` with those bare ids (one batch, ≤12) → read the two lines → `finish_turn` (paraphrase, `results: []`). Optional same conversation later: `ask_user` **alone**, `multiple` true, `max_selected` 3, `image: youtube:<videoId>`, skip allowed → `import_youtube_thumbnail` only for the kept ids → swipeFile `kind=reference`.
2. **Fiche already has `competition`** — do not re-analyze unless they asked to refresh or you ran a **new** competitor search. A new search overwrites the last-search store; analyze that new id list (cache may make it free).
3. **Cap / no key / empty search** — skip this tool; package from the video + optional `research_topic`. Never fill with a `search_youtube` gallery pretending it was scored.
4. **They want to see a thumb** — `search_youtube` or `import_youtube_thumbnail`, not this tool. This tool does not attach pixels.
5. **Existing canvas** — `view_canvas_images` for **their** pixels; this tool only if they also want niche competitors. Load `existing-workflow` when the ask is about that workflow.
6. **End the turn** — `finish_turn` last, **alone**. `results` empty. 1–2 sentences. Optional `ask_agent` (keep the pattern, avoid the saturated trick, pick refs). Never `ask_agent` that would start a paid final generation.

Do not call `finish_turn` in the same step as this tool.

## Example

After `find_competitor_thumbnails` (`query_fr: "Cursor 2.0 test"`, `query_en: "Cursor 2.0 review"`) the last search is:

```
youtube:dQw4w9WgXcQ | Chaîne FR | 120000 | ×5,2 | 40 j | fr
youtube:eXaMpLe0002 | EN channel | 80000 | ×4,1 | 55 j | en
youtube:eXaMpLe0003 | Autre FR | 9000 | peu de données | 20 j | fr
```

```
analyze_thumbnails
  video_ids: ["dQw4w9WgXcQ", "eXaMpLe0002", "eXaMpLe0003"]
```

Typical success (cached hits cost 0; any miss counts as paid call 1 of 2):

```
Ce qui marche : Fond uni · Texte · Visage
Ce que tout le monde fait (à éviter) : Fond uni · Texte · Visage
```

Then:

```
finish_turn
  summary: "Les outliers misent sur un visage + 2 mots sur fond uni — trop courant en FR. On part sur un objet net, texte ailleurs que le titre."
  results: []
  next_actions:
    - { kind: "ask_agent", label: "Garder ce différenciateur", message: "Pas de visage saturé : objet central, texte complémentaire du titre." }
    - { kind: "ask_agent", label: "Choisir 3 références", message: "Propose-moi 3 miniatures concurrentes à importer." }
```

If the user had said “le fond de **ma** miniature est trop sombre”, that is `view_canvas_images`, not this tool. If they said “montre-moi des miniatures Cursor 2.0” with no ranked search, that is `search_youtube`, not this tool.
