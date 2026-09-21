---
name: get_studio_video
description: Vidéos / studio — reads one local ThumbGen video fiche (title, etiquette, URL, script and description truncated to 4000). Accepts studio:<id> or the bare id.
---

# get_studio_video

Read one **already created** fiche. Local, no quota. Chat label: « Lit une fiche vidéo ». Also on MCP.

## When

- write_video step 1: load the open `video_id` from `<studio_video>` or `<project_id>`
- They named a fiche from `list_studio_videos`

## When not

- Unknown which fiche → `list_studio_videos` first
- They want a new topic that has no fiche → `create_studio_video`
- Spoken captions of a public YouTube URL → `extract_youtube_script`

## Fields

| Field | Required | Schema |
|---|---|---|
| `video_id` | yes | string 8–80, `studio:<id>` or bare id |

Script and description are truncated at 4000 characters. Do not paste the full script into `finish_turn.summary`.
