# Chaînes suivies et performance des miniatures (chantier D)

Date : 2026-09-16
Statut : approuvé en brainstorming
Repo : `/Users/antoinevigneau/thumbgen-real`
Ordre d'exécution : après le chantier C (`2026-09-16-bibliotheque-page-design.md`), dont il remplit la section « Chaînes suivies » de l'onglet Inspirations.

## Problème

Pour savoir quel style de miniature marche, Antoine veut voir ses miniatures et celles d'autres chaînes, avec leurs vues et une mesure de performance, rangées par type. Aujourd'hui seul le fil « Ma chaîne » existe (liste simple des vidéos via `/api/youtube/playlist`), sans vues, sans score, sans autres chaînes, sans mise à jour ni classement.

## Décisions prises en brainstorming

- Suivre sa chaîne et d'autres chaînes ; importer **tout l'historique des vidéos longues** (pas de Shorts).
- Afficher les **vues** et un **score de surperformance** = vues ÷ médiane des vues de la chaîne, comme vidIQ / OutlierKit / 1of10.
- **Mise à jour automatique** des chaînes (nouvelles vidéos, vues).
- **Classement par type de miniature** : IA automatique + correction manuelle.

## Design

### 1. Données YouTube

- Source : YouTube Data API v3 avec la clé `youtubeApiKey` existante (Réglages → Connexions). Sans clé : l'onglet affiche une carte « Ajoute ta clé YouTube (gratuite) » avec lien vers Réglages → Connexions et un lien d'aide Google Cloud.
- Résolution d'une chaîne : `resolveChannelId` (`src/lib/youtube/channel.ts`) sur une URL, un `@handle` ou un identifiant `UC…` ; puis `channels.list` (`snippet,statistics`) pour le nom, l'avatar, le handle, le nombre d'abonnés.
- Vidéos longues uniquement : playlist « vidéos longues » de la chaîne, identifiant `UULF` + `channelId.slice(2)`. Si cette playlist n'existe pas (404), repli sur la playlist des mises en ligne `UU…` en excluant les vidéos de 3 minutes ou moins (durée ISO 8601 via `contentDetails`).
- Pagination `playlistItems.list` (50 par page, 1 unité) puis `videos.list` (`statistics,contentDetails,snippet`, 50 identifiants par appel, 1 unité). Environ 40 unités pour 1 000 vidéos.
- Quota (403 `quotaExceeded`) : la synchronisation s'arrête proprement, garde ce qui est déjà importé, marque la chaîne « Quota YouTube atteint — reprise demain » et reprend là où elle en était au passage suivant.

### 2. Stockage (SQLite, `src/lib/db.ts`)

- `followed_channels` : `id`, `youtube_channel_id` (unique), `title`, `handle`, `avatar_url`, `subscriber_count`, `is_mine` (0/1), `median_views` (nullable), `last_synced_at`, `sync_status` (`idle` / `syncing` / `error`), `sync_error` (nullable), `created_at`.
- `channel_videos` : `video_id` (clé), `channel_id` → `followed_channels.id` (cascade à la suppression), `title`, `published_at`, `duration_seconds`, `view_count`, `like_count` (nullable), `thumbnail_url`, `stats_updated_at`, `thumb_type` (nullable), `thumb_type_source` (`ai` / `manual`, nullable), `created_at`. Index sur `channel_id`, `published_at`, `thumb_type`.
- Les miniatures ne sont pas téléchargées : on garde l'URL `i.ytimg.com`. Elles ne sont copiées en bibliothèque que lorsqu'on les utilise (§6).

### 3. Score de surperformance

- Médiane de la chaîne : vues des **50 dernières vidéos longues publiées depuis plus de 7 jours** (toutes s'il y en a moins). Recalculée à chaque synchronisation, stockée dans `median_views`.
- Score d'une vidéo = `view_count ÷ median_views`, arrondi à 1 décimale, affiché « ×0,4 », « ×1,2 », « ×8,5 ».
- Vidéo de moins de 7 jours : pas de score ; badge « Récente » + vues par jour (`view_count ÷ jours depuis publication`).
- Bandes : ≥ ×3 « Surperforme » (vert), ×0,5 à ×3 neutre, < ×0,5 « Sous-performe » (rouge). Médiane nulle ou inconnue → pas de score.
- Logique pure et testée dans `src/lib/youtube/performance.ts` (médiane, score, bande, vues/jour).

### 4. Suivre et synchroniser

- « Suivre une chaîne » : champ URL / @handle / ID → prévisualisation (avatar, nom, abonnés) → « Suivre ». La chaîne apparaît immédiatement avec `sync_status = syncing` et l'import complet démarre en arrière-plan côté serveur.
- « Ma chaîne » : la chaîne de `youtubePlaylistId` (Réglages → Ma chaîne) est suivie automatiquement avec `is_mine = 1` et un badge « Ma chaîne ». Si le réglage change, l'ancienne perd `is_mine` (elle reste suivie) et la nouvelle est ajoutée.
- Synchronisation d'une chaîne (`src/lib/youtube/sync.ts`) :
  1. Parcours de la playlist depuis la plus récente jusqu'à rencontrer une vidéo déjà connue (import complet la première fois).
  2. Mise à jour des statistiques de **toutes** les vidéos de la chaîne (par lots de 50).
  3. Suppression des vidéos devenues privées ou supprimées (absentes de `videos.list`).
  4. Recalcul de la médiane, `last_synced_at`, statut.
  5. Mise en file des nouvelles miniatures à classer (§5).
- Verrou par chaîne (une seule synchronisation à la fois, protégé contre deux onglets).
- Déclenchement automatique : à l'ouverture de l'app (appel léger depuis la coque client), toutes les chaînes dont `last_synced_at` date de plus de 12 heures sont synchronisées en arrière-plan, l'une après l'autre. Bouton « Actualiser » par chaîne et « Tout actualiser ».
- « Ne plus suivre » : confirmation, suppression de la chaîne et de ses vidéos (les miniatures déjà copiées en bibliothèque restent).

### 5. Classement par type (IA + manuel)

- Liste fixe de types (identifiant → libellé) :
  `face_text` « Visage + texte », `reaction` « Réaction sans texte », `before_after` « Avant / Après », `versus` « Versus / comparaison », `screenshot` « Capture d'écran / interface », `object` « Objet ou produit central », `text_only` « Texte seul », `scene` « Scène / illustration », `other` « Autre ».
- Classement automatique : un modèle vision peu coûteux via OpenRouter (`getOpenRouterClient`, modèle fixé dans le plan) reçoit la miniature (URL `mqdefault` suffisante) et répond **uniquement** par un identifiant de la liste (sortie structurée validée ; réponse invalide → `other`). Traitement par lots en arrière-plan, quelques requêtes en parallèle, reprise après interruption.
- Réglage « Classer automatiquement les miniatures (IA) » dans Réglages → Génération d'images, activé par défaut. Avant un premier lot de plus de 200 miniatures, confirmation affichant le nombre et le coût estimé (« 1 240 miniatures, environ 0,15 $ »). Chaque appel est journalisé dans `generations_log` (endpoint `classify-thumbnail`) pour apparaître dans Usage.
- Correction manuelle : clic sur le badge du type → menu des types → `thumb_type_source = manual`. L'IA ne réécrit jamais un type manuel.
- Sans clé OpenRouter ou réglage désactivé : types vides (« Non classée ») et correction manuelle seule.

### 6. Interface (onglet Inspirations → « Chaînes suivies »)

- **Barre des chaînes** : puces (avatar, nom, badge « Ma chaîne », statut : « Synchronisation… 320 vidéos », « À jour il y a 2 h », « Erreur »), menu « … » Actualiser / Ne plus suivre ; bouton « Suivre une chaîne » ; « Tout actualiser ».
- **« Les types qui marchent »** : tableau compact par type — score médian, nombre de miniatures, meilleure miniature — trié par score médian ; portée « Toutes les chaînes » / « Ma chaîne » / une chaîne ; seuls les types avec au moins 3 miniatures notées sont classés, les autres affichés « peu de données ».
- **Grille des miniatures** : image 16:9, titre (2 lignes), chaîne, date, vues abrégées (« 12 k vues »), badge score (bande de couleur) ou « Récente · 850 vues/j », badge type (modifiable).
- Tri : score (défaut), vues, date. Filtres : type (multi), chaîne, période (30 jours / 12 mois / tout). Pagination ou défilement infini par 60.
- Actions sur une miniature :
  - « Voir sur YouTube » (nouvel onglet).
  - « Utiliser comme référence » : copie la miniature en meilleure résolution dans la bibliothèque (`swipe_files`, même logique que l'outil agent `import_youtube_thumbnail`, titre = titre de la vidéo) puis propose « Ouvrir dans une miniature… » (liste des miniatures) qui ajoute un nœud Image de référence avec cette image.
- **Depuis un nœud** : le `LibraryPickerDialog` du chantier C gagne, pour les nœuds Image de référence, un onglet « Chaînes suivies » (même grille, tri par score) ; choisir copie la miniature en bibliothèque puis remplit le nœud.

### 7. Routes API

- `GET/POST /api/channels` (liste ; suivre), `DELETE /api/channels/[id]`, `POST /api/channels/[id]/sync`, `POST /api/channels/sync-stale`.
- `GET /api/channels/videos` (filtres, tri, pagination), `PATCH /api/channels/videos/[videoId]` (type manuel), `POST /api/channels/videos/[videoId]/use` (copie en bibliothèque).
- `GET /api/channels/types-summary` (portée).
- `POST /api/channels/preview` (résolution avant de suivre).

### 8. Agent

- Hors champ de ce chantier : l'outil existant `get_channel_videos` reste. (Une évolution « l'agent consulte les types qui marchent » pourra venir plus tard.)

## Gestion des erreurs

- Pas de clé YouTube → carte d'appel à l'action, aucune requête.
- Chaîne introuvable → message dans la prévisualisation.
- Quota atteint → arrêt propre, reprise ultérieure, statut visible.
- Échec réseau pendant une synchronisation → `sync_status = error` + message, bouton « Réessayer » ; les données déjà importées restent.
- Classement IA en échec pour une miniature → reste « Non classée », nouvel essai au lot suivant (au plus 3 essais).

## Tests

- `performance.ts` : médiane (pair / impair / vide), exclusion des vidéos de moins de 7 jours, score, bandes, vues/jour.
- Synchronisation avec `fetch` simulé : import complet paginé, playlist `UULF` absente → repli avec filtre de durée, arrêt sur vidéo connue, mise à jour des vues, suppression des vidéos disparues, quota atteint puis reprise, verrou.
- « Ma chaîne » : suivi auto, changement de réglage.
- Classement : sortie valide / invalide → `other`, type manuel jamais réécrit, estimation de coût, journalisation.
- Routes : filtres, tri, pagination, résumé par type (seuil de 3).
- Aucun test n'appelle YouTube ni OpenRouter réellement.

## Vérifications manuelles

- Suivre « Ma chaîne » et une chaîne tierce ; import complet sans Shorts ; vues et scores cohérents avec YouTube.
- Mise à jour à la réouverture après 12 h (ou en forçant `last_synced_at`), « Actualiser ».
- Classement IA d'une petite chaîne (coût affiché), correction manuelle conservée après une nouvelle synchro.
- « Les types qui marchent » selon la portée.
- « Utiliser comme référence » et l'onglet « Chaînes suivies » dans le dialog d'un nœud Image de référence.

## Hors champ

- Connexion OAuth YouTube, statistiques privées (taux de clic, rétention), publication.
- Shorts.
- Nouveaux outils agent.
