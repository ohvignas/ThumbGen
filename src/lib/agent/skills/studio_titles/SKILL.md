---
name: studio_titles
description: Vidéos / studio — write 3 A/B title rows (Titre, texte miniature, concept visuel) for the open fiche. Never for canvas miniatures.
---

# studio_titles

Open fiche only (`<studio_video>` / studio:<videoId>).

## How

1. Ground on retrieve_own_corpus hits already in the thread (call it if missing).
2. Propose 3 rows: title, thumbText, visualConcept.
3. upsert_studio_script with title_variants and title = the working fiche title (first row or a short working title). Do not paste all titles in finish_turn.summary.
