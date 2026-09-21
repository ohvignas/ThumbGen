---
name: upsert_studio_script
description: Vidéos / studio — saves fiche metadata, script, description and up to 3 title/thumb-text rows. Never for canvas miniatures.
---

# upsert_studio_script

Local write. No HTTP, no Notion, no sync. Chat label: « Met à jour le brouillon ». Also on MCP.

## When

- During write_video (or a studio writing skill): upsert incrementally as titles, description, or script are ready — not only after the full draft is agreed
- A small fix to script, description, or the 3 A/B title rows

## When not

- No fiche yet → `create_studio_video` first
- They only asked to discuss the hook — wait until they want it saved
- Thumbnail on the canvas → apply_workflow / generate_sketch, not this tool

## Fields

| Field | Required | Schema |
|---|---|---|
| `video_id` | yes | string 8–80, `studio:<id>` or bare id |
| `title` | no | trimmed string 1–200 |
| `summary` | no | trimmed string max 4_000 |
| `etiquette` | no | Propositions / Pas commencer / En cours / En prod / Terminer |
| `script` | no | string max 80_000 |
| `description` | no | string max 20_000 |
| `title_variants` | no | max 3 `{ title, thumbText, visualConcept }` |

`finish_turn` last, 1–2 sentences. Do not paste the full script in `summary`.
