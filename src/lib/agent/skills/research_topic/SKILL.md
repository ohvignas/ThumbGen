---
name: research_topic
description: Researches a named video topic with Perplexity Sonar Pro via OpenRouter (summary, key points, entities; paid, ~0.01–0.03 $, max 2 per conversation). Use when the subject is named and logos or competitors would benefit. Do not call when the user already explained everything, the Fiche already has research (unless they asked to redo), or the 2-call cap is reached; on failure continue from names they cited, then find_logos.
---

# research_topic

Paid topic brief for **this** conversation: summary, key points, named entities, citation titles. Chat-only (not MCP). Chat label: « Recherche le sujet ». Model `perplexity/sonar-pro` via OpenRouter. Timeout **60 s**, no retries. Not a visual tool — no `result_id`, no images, never base64. The server writes `brief.research` (and increments `usage.research`); do not invent the same JSON via `update_brief`.

Creates an empty « Fiche » if this chat has none (`ensureBrief`). Ambient OpenRouter web search is off once a Fiche exists — this tool is then the only web research.

## When

- The user named a **subject** (product, tool, brand, vs, niche) and you still lack official names, owners, or what the thing *is* — enough to pick logos and later competitors.
- Named tools/brands would go on the thumb and are not already obvious from what they typed or from a transcript you already read.
- They ask what X is, who makes it, or “cherche un peu le sujet”.

Know the topic first. “Fais-moi une miniature” is not a query — ask what the video is about.

## When not

- They already explained the video, pasted the script, or `extract_youtube_script` was enough — skip and go to logos from **names they cited**.
- `<thumbnail_brief>` already has `research` — reuse it. Call again only if they ask to redo, or the subject **changed**; then `refresh: true`.
- `usage.research` is already **2** (limit for this miniature/conversation). Do not retry.
- No OpenRouter key — quote the error; do not fake a summary.
- YouTube packaging look / scored outliers → `find_competitor_thumbnails` then `analyze_thumbnails`. Open-web thumbs → `search_youtube`. Spoken words of one video → `extract_youtube_script`. Library logos → `list_logos`. Unsaved brands → `find_logos`.
- Do not dump the whole script into `query` (max **300** characters; `video.subject` is the same cap).
- Do not call “to have context”, to fill a slot, or as **journey step 2**. Never mention « Étape n/7 ». Never `update_brief.step` / `ask_user.step` for research.
- Do not pass `refresh: true` on the first call “just in case”.

## How

```
query: string          # required, trim, 1–300
language: "fr" | "en"  # required — no default
refresh?: boolean      # true only to replace stored research
```

**`query`** — a focused topic in the chosen language, with official product/brand names. Good: `"Claude Code vs Cursor"`, `"Miniatures YouTube Claude 4"`. Bad: `""`, the full script, a vague `"ma vidéo"`.

**`language`** — output language of summary / key points. Match the reply language and the topic. French user + French subject → `"fr"`. English-only product for an English thumb → `"en"`. Always pass it (`fr`|`en` only).

**`refresh`** — omit on the first successful research. If `brief.research` already exists and you omit it (or pass `false`), the handler **does not** call the model. After a **failed** first call there is no stored research, so a second call without `refresh` is allowed and still counts toward the cap.

The server sends `Langue: {language}. Sujet: {query}` to Sonar Pro (`temperature` 0, `response_format: json_object`). It asks for JSON `{ summary, keyPoints, entities: { name, kind } }` only — **no sources in that JSON**.

**Success (text, not an error)** — blank sections are omitted:

```
<summary>
Points clés : <a> · <b>
Entités : <Name1>, <Name2>
Sources : <title> · <title>
```

| Piece | Caps | Notes |
|---|---|---|
| `summary` | ≤1200 | Empty/whitespace summary → parse failure (error below), not success |
| `keyPoints` | ≤6, each ≤200 | Non-strings dropped |
| `entities` | ≤12, name ≤80 | `kind`: `company` \| `tool` \| `product` \| `other`. Unknown kind → `other`. Nameless rows dropped |
| `sources` | ≤8 | **API citations only** (`annotations` type `url_citation`, else `citations` URLs). The model's `"sources"` key is ignored. Titles in the tool text; URLs live on the Fiche. `<thumbnail_brief>` later shows **titles only** |

`usage.research` goes up **before** the HTTP call. A timeout or unreadable reply **keeps** that count even though `brief.research` stays empty.

**Cost (paid):** prefer OpenRouter `usage.cost` (tests: `0.012`). If missing: `$3 / M` prompt tokens + `$15 / M` completion tokens (`perplexity/sonar-pro`). Spec ballpark **0.01–0.03 $** per call, **2** calls max. Logged as endpoint `"research"`. Not YouTube quota. Not a sketch.

Do not put this call in `finish_turn.results`. Tell the user the gist and entity names, not the raw JSON.

## Errors

Quote the real strings. Schema failures (`query` empty or >300, missing/`language` not `fr`|`en`) happen **before** the handler — fix the args once; do not pad a fake query.

| When | `isError` | Request sent? | Text | What you do |
|---|---|---|---|---|
| Unknown or deleted conversation | yes | no | `Conversation introuvable.` | Stop. Do not invent research. |
| `brief.research` exists and `refresh` is not true | yes | no | `Une recherche existe déjà. Passe refresh: true pour la relancer.` | Reuse the Fiche. Retry with `refresh: true` **only** if they asked to redo or the subject changed. |
| `usage.research >= 2` | yes | no | `Limite de 2 recherches atteinte pour cette miniature.` | Say so. Continue to logos from names they cited. Never loop. |
| No `openrouterApiKey` (Réglages) | yes | no | `Clé API OpenRouter non configurée. Ajoute-la dans Réglages.` | One sentence: add the key. Do not fake a summary. |
| Fiche vanished between ensure and reserve | yes | no | `Pas de fiche pour cette conversation.` | Rare. Do not invent research. |
| Unreadable JSON / empty summary | yes | **yes** (counts as 1) | `La recherche a échoué. Continue avec les noms que l'utilisateur a cités.` | **Do not retry.** Use names they typed. Then `find_logos` if any. |
| Timeout / network / model throw (60 s, `maxRetries: 0`) | yes | **yes** (counts as 1) | `La recherche a échoué. Continue avec les noms que l'utilisateur a cités.` | Same. A failed call still burns one of the two slots. |

Never invent a summary, entities, or URLs. Never fall back to another paid model. Never loop. One corrected-args retry only for a Zod mistake.

## Chains

1. Subject known → `research_topic` `{ query, language }` (no `refresh`). Optional `update_brief` `video.subject` (≤300) if still empty — **not** `research` (the tool already wrote it; `sources` / `fetchedAt` are server-only).
2. Read `Entités :`. Prefer `company` / `tool` / `product` for marks on the thumb. Skip `other` unless it is clearly a logo.
3. `list_logos` `{}` first. Hits → keep (max 3) / `ask_user` with `image: stored:lg_<id>`. Misses → `find_logos` `{ names: ["…"] }` (max 12) → `add_logo` `{ candidate_id }` (never a URL). One obvious candidate: keep it and say so. Never wire `logo-candidate:` as `image_source`.
4. If research **failed** or hit the limit: skip this tool; `find_logos` from **names the user cited** only.
5. Optional later: `find_competitor_thumbnails` (`query_fr` + `query_en`) — different tool, different 2-call cap. Not a numbered step.
6. Continue `thumbnail-packaging` (packages, canvas). `finish_turn` last, **alone**: 1–2 sentences in the reply language (what it is, which brands). `results` empty. Cite source **titles** if you mention the web. `next_actions` can offer logos or packages.

Never the same step as `ask_user` or `finish_turn` when those pause or close the turn. No Étape n/7. No “step 2 of 7”.

## Example

User: « Miniature Claude Code vs Cursor. »

`<thumbnail_brief>` has no `research`. Reply language French.

```
research_topic
  query: "Claude Code vs Cursor"
  language: "fr"
```

Tool:

```
Claude Code (Anthropic) et Cursor sont deux assistants de code IA…
Points clés : Claude Code s'appuie sur Claude · Cursor est un IDE fork de VS Code
Entités : Claude, Anthropic, Cursor
Sources : Aide YouTube
```

Then `list_logos`. If no Claude/Cursor rows: `find_logos` `{ "names": ["Claude", "Cursor"] }` → `add_logo` on the kept `logo-candidate:` ids → `finish_turn` (no `results` from this tool).

If the tool had returned `La recherche a échoué. Continue avec les noms que l'utilisateur a cités.` → `find_logos` `{ "names": ["Claude", "Cursor"] }` immediately. Do not call `research_topic` again in that turn.

If it had returned `Une recherche existe déjà. Passe refresh: true pour la relancer.` → use the Fiche. `refresh: true` only if they said the subject changed.
