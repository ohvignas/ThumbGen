---
name: list_studio_videos
description: Vidéos / studio — lists local ThumbGen video fiches (studio:<videoId>, title, etiquette). Use when no fiche is open or they ask which video to write. Not a YouTube search.
---

# list_studio_videos

Read-only catalog of **ThumbGen writing fiches**. Local SQLite, no args, no quota. Chat label: « Liste tes fiches vidéo ». Also on MCP.

## When

- /ecrire and `<studio_video>` is missing
- They ask « mes vidéos », « quelle fiche », « ce que j'ai en cours »

## When not

- The open fiche is already in `<studio_video>` — use that `video_id`
- Public YouTube / Ma chaîne catalog → search_youtube / list_followed_videos
- Canvas miniatures → list_projects

## How

Call with `{}`. Lines look like `- studio:<videoId> — "titre" — Étiquette`.

Pass `studio:<videoId>` or the bare id to `get_studio_video`. Do not invent ids. Empty list: offer `create_studio_video` if they named a topic.
