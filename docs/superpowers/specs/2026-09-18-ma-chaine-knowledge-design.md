# Ma chaîne — connexion Google, ingest et bible

Date : 2026-09-18
Repo : ThumbGen (Next.js 16, SQLite, agent + MCP)

## Problème

`/reglages/chaine` est un formulaire manuel. Les vidéos publiques sont déjà importées (chaînes suivies + clé API). Il manque : le compte propriétaire (OAuth), les stats Studio, les transcriptions, un document de chaîne, et des outils MCP pour les relire.

## Décisions

1. **OAuth minimal** : `youtube.readonly` + `yt-analytics.readonly`. Pas de `youtube.force-ssl` (scope sensible, `captions.download` à 200 unités).
2. **Catalogue** : réutiliser `syncChannel`. Avec OAuth, « Ma chaîne » voit aussi les non listées. Toujours les vidéos longues (pas de Shorts).
3. **Transcriptions** : timedtext public (`youtube-transcript`), file d’attente en arrière-plan, toutes les vidéos. Échec → `source = none`, pas de Whisper.
4. **Analytics** : YouTube Analytics v2 `reports.query` (28 j + 365 j chaîne ; top 200 vidéos / 365 j). Le CTR miniature n’est fiable que via Reporting API (fichiers, 48 h) : hors v1, colonnes laissées nulles.
5. **Bible** : un JSON + markdown générés par le modèle cheap déjà utilisé pour classer les miniatures. Résumés LLM seulement pour les ~40 vidéos les plus vues qui ont un transcript. Les champs vides de `channelProfile` sont remplis, jamais écrasés.
6. **Agent** : bloc compact `<channel_knowledge>` (pas les transcripts). Outils MCP `get_my_channel_knowledge`, `search_my_channel`, `get_my_video`. `extract_youtube_script` lit d’abord le cache local.
7. **UI** : carte connexion en haut de `/reglages/chaine` ; Client ID / secret Google dans Connexions ; progression d’ingest ; document éditable en lecture.

## Hors champ

Whisper, Reporting API / CTR, Shorts, plusieurs comptes Google, publication YouTube.
