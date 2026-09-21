---
name: retrieve_own_corpus
description: Vidéos / studio — local full-text search over the creator's own scripts and Ma chaîne transcripts. Free grounding for writing; not a thumbnail tool.
---

# retrieve_own_corpus

Search **their** older videos (studio drafts + connected channel). Local SQLite FTS. Chat label: « Cherche dans tes anciennes vidéos ». Also on MCP. No paid API.

## When

- /ecrire or write_video, before drafting a hook, outline, or CTA
- They ask how they usually open, structure, or close a video

## When not

- Competitor or public YouTube search → search_youtube / extract_youtube_script
- One open fiche they already have → get_studio_video
- Thumbnail packaging with no writing ask → thumbnail-packaging

## How

Channel ingested videos first (titles, descriptions, transcripts from YouTube connect), then studio drafts. Document de chaîne is already in `<channel_knowledge>` — quote it. Do not call generateChannelKnowledge.

## Fields

| Field | Required | Schema |
|---|---|---|
| `query` | yes | string 1–200 (subject, hook words) |
| `limit` | no | int 1–20, default 8 |

Quote patterns from the hits. Empty list = thin corpus: say so, use `<channel_profile>` only. Do not invent old videos.
