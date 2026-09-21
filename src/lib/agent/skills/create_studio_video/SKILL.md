---
name: create_studio_video
description: Vidéos / studio — creates a local fiche and returns studio:<videoId> only when no fiche is already open. Never for canvas miniatures.
---

# create_studio_video

Inserts one fiche in ThumbGen. Local SQLite, no YouTube call, no Notion. Chat label: « Crée une fiche vidéo ». Also on MCP.

## When

- They named a new video topic and `<studio_video>` is empty
- `list_studio_videos` is empty and they want to start writing

## When not

- A fiche is already open in `<studio_video>` — write that one
- They only want a thumbnail → thumbnail-packaging
- They pasted a competitor URL to package a thumb → extract_youtube_script

## Fields

| Field | Required | Schema |
|---|---|---|
| `title` | yes | trimmed string 1–200 |
| `etiquette` | no | Propositions / Pas commencer / En cours / En prod / Terminer |

Then `get_studio_video` + `retrieve_own_corpus` if they asked to write. Do not invent a script before they confirm.
