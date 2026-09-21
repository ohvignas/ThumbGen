---
name: write_video
description: Vidéos / studio orchestrator — corpus, production format, then titles, YouTube description and script on the open fiche. Never for canvas miniatures.
---

# write_video

You help write ONE ThumbGen fiche (`studio:<videoId>` in <studio_video> or <project_id>).

Not a thumbnail journey. Not apply_workflow.

## When

- First user message on the overlay or open fiche, /ecrire from the picker, or they ask to write the open video
- A fiche is already open — never create_studio_video

## When not

- Canvas / miniature → thumbnail-packaging
- Competitor URL only to package a thumb → extract_youtube_script

## How (loose arc, not a UI stepper)

1. FIRST TURN: if `<studio_first_turn>` is present, get_my_channel_knowledge + retrieve_own_corpus + list_studio_videos + get_studio_video already ran — quote those hits. Do not announce a later read of the channel or last videos. If the block is missing, CALL those four tools NOW, before any user-facing sentence. Then ask production format (face+écran, tuto, essai…) with ask_user, grounded in what you found. Channel hits first; studio drafts second. If empty: say the corpus is thin; use Document de chaîne + <channel_profile> only. Do not invent old videos. Do not call research_topic unless they ask (paid). Do not re-run channel ingest / generateChannelKnowledge.
2. read_skill studio_format only if format is not already asked this turn. Wait for the answer.
3. read_skill studio_titles then upsert_studio_script (title_variants + title). The editor will appear — do not dump titles in chat.
4. read_skill studio_description then upsert description.
5. read_skill studio_script then upsert script (structure = the format they chose, house shape from page-template — not a fixed 9-step wizard).
6. Later turns on this same conversation: upsert any field (title, summary/notes, etiquette, script, description, title_variants). link_studio_miniature to attach an existing proj_* for A/B. Never apply_workflow.
7. finish_turn last, alone: 1–2 sentences. Never paste the full script.

Upsert incrementally as soon as a block is ready so the fiche fills live.
