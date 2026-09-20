# YouTube inspiration search + swipe rank

**Status:** implemented (user approved approach 2 on 2026-09-19).

## Goal

In Bibliothèque → Inspirations, search all of YouTube by keywords and show the thumbnails most likely to be worth copying: videos that over-perform versus *that channel’s* typical views. The same sort replaces the old raw `views / median` grid on followed channels.

## Why not TypeSafe alone

[TypeSafe / Jev](https://docs.typesafe.ai/introduction) is a text decision API (`POST /v1/systemone`). It does not search YouTube, return thumbnails, or compute views. Official jaggedness: keep arithmetic in code.

## Pipeline

1. `search.list` (`order=relevance`, last 18 months, FR bias) + `videos.list` + `channels.list`.
2. Drop Shorts (≤180s) and lives.
3. Baseline = followed/cached channel median (min 8 samples, median ≥ 500) else `0.25 × subscribers` (subs ≥ 1000).
4. Display badge = `views / baseline` (`×N`).
5. Sort key = `log2(min(score, 20)) × 1/(1 + ageDays/90) × views/(views+20000) × pertinence`.
6. Optional TypeSafe Jev: Noul “does this title make people click for this query?” on the top 20; `rank × (0.55 + 0.45 × noul)`. Failure → numeric order.

## Surfaces

- Inspirations page: **Chercher sur YouTube** (own search bar).
- Picker: tab **YouTube**.
- Réglages: optional `typesafeApiKey` / `TYPESAFE_API_KEY`. YouTube key still required.

## Out of scope

- True CTR (owner-only).
- Jev looking at pixels (text only).
- Per-keystroke playlist median crawls (quota).
