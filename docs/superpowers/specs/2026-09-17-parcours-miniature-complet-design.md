# Parcours miniature complet (chantier F3) — design

Date : 2026-09-17. Statut : validé en brainstorming avec Antoine (parcours, recherche, détails, fin, approche) ; corrigé après revue du code et critique de recherche le même jour. Prérequis en ligne : F1 (agent en arrière-plan), F2 (`ask_user`, `place_node`, canvas patches), correctif « agent qui respecte le canvas », correctif « payload du chat » (fusionné).

Le chantier se livre en trois sous-chantiers : **F3a** fiche et parcours de base, **F3b** recherche et contexte, **F3c** esquisses et workflow A/B (voir « Découpage »).

## Problème

Le parcours actuel est trop pauvre, et il ne produit pas un packaging :
- **Agent trop pressé.** Sur une demande libre, il lance des esquisses tout de suite.
- **Mauvaise vidéo.** L'interview F2 propose d'abord les anciennes vidéos, alors qu'Antoine prépare une **nouvelle** vidéo.
- **Formulaire au lieu de packaging.** Rien ne relie titre et miniature, aucune promesse n'est formulée, rien ne limite le nombre d'éléments ni ne vérifie la lisibilité sur mobile.
- **Aucun contexte.** Pas de recherche sur le sujet, pas de logos des outils cités, pas d'analyse des miniatures concurrentes.
- **Trop de questions** si l'on demande chaque détail un par un (environ 30 interactions au pire).

## Décisions

- Le parcours **remplace tout** : le bouton « Construire avec l'agent » et toute demande de création de miniature le lancent. L'interview F2 à 8 questions et le flux « esquisses immédiates » disparaissent. EXISTING WORKFLOW reste pour les demandes qui portent sur un workflow existant.
- **Packaging d'abord.** Une promesse en une phrase dès l'étape 1. Chaque variante est une paire **titre + miniature** : texte de miniature ≤ 4 mots et ≤ 20 caractères, complémentaire du titre (il ne le répète pas), sans rien promettre que la vidéo ne livre pas. Réf. : YouTube Help 13861714 (A/B jugé sur le temps de visionnage) ; vidIQ Thumbnail Study 2026 ; Overseeros (le texte complète le titre).
- **Recherche rapide et automatique** : Perplexity Sonar Pro via OpenRouter, sans confirmation.
- **Concurrents classés comme au chantier D** : vues ÷ médiane des vues de la chaîne, filtre d'âge, score plafonné, au moins 4 vidéos FR. Leurs miniatures sont **analysées par vision** (ce qui marche, ce que tout le monde fait) au lieu de demander « qu'est-ce qui te plaît ». Réf. : OutlierKit / 1of10 / vidIQ Outliers (médiane de chaîne), méthode Paddy Galloway.
- **Éléments communs, puis une carte de composition par variante.** L'agent propose la carte complète (layout, 1 sujet focal, ≤ 3 éléments, zone de texte réservée, émotion, fond, couleurs) ; Antoine valide ou modifie élément par élément. Réf. : consensus designers « un point focal, 2 à 3 éléments ».
- **A/B vraiment contrastées** : stratégie explicite (concepts différents ou une seule variable). Réf. : YouTube recommande d'éviter les variantes trop proches.
- **Esquisses d'abord, puis workflow.** Esquisses en **aplats de couleur**, sans texte ; le texte est posé en overlay dans l'aperçu. Chaque esquisse est vue à **168×94** et **au milieu des concurrents**, et l'agent la vérifie sur une checklist (une auto-correction au plus). Réf. : Hooksnap/Descript (168×94 en fil mobile), 1of10/YouTool (grille de test), guides Google Nano Banana (rôle des références, texte = point faible des modèles).
- **Approche C** : l'agent mène le parcours et reste conversationnel. Chaque décision est écrite dans une **fiche miniature** structurée, en base, relue à chaque tour, visible et éditable dans un `Sheet`.
- **Garde-fous côté serveur** : les limites de coût ne dépendent pas de la bonne volonté du modèle.

## Parcours

7 étapes. Les questions passent par `ask_user` (choix + « Autre » + « Passer » quand ça a du sens). Antoine peut toujours écrire librement : un message pendant une question abandonne la question, et l'agent reprend à l'étape indiquée par la fiche.

1. **Vidéo et promesse** (1 question libre). « De quoi parle la vidéo, et qu'est-ce que le spectateur saura faire ou comprendre à la fin ? ». Script ou intro optionnels. Aucune ancienne vidéo proposée. L'agent déduit sans autre question `video.promise` (≤ 90 car., orientée résultat) et `video.audience` (profil de chaîne, sinon déduit).
2. **Recherche et logos** (0 ou 1 question).
   - `research_topic` se lance tout seul : résumé, points clés, entités, sources.
   - `find_logos` sur les entités. Si chaque entité a un seul candidat fiable (Simple Icons ou SVGL exact), sélection automatique annoncée en une ligne. Sinon une grille multiple : « Quels logos garder ? » (3 au plus).
   - Logo introuvable : import manuel (dialogue Bibliothèque) ou Brandfetch en aperçu seulement (règle existante).
3. **Concurrents** (1 question).
   - `find_competitor_thumbnails` puis `analyze_thumbnails`, automatiquement.
   - L'agent résume en 2 lignes : « Ce qui marche : … / Ce que tout le monde fait (à éviter) : … ».
   - Grille multiple, 3 au plus, « Passer » autorisé : « Lesquelles garder en référence ? ». Chaque option affiche son score (« ×8,2 ») et son type. Les références retenues sont copiées dans la bibliothèque.
4. **Stratégie et directions** (2 questions).
   - Stratégie : « Trouver le meilleur concept » (par défaut) ou « Optimiser un détail ».
   - L'agent propose 2 ou 3 packages au format `Direction | Titre (≤ 60) | Texte miniature (≤ 4 mots, ≤ 20 car., ou aucun) | Idée visuelle (1 phrase) | Rôle du titre | Rôle de la miniature`, déduits de la promesse, de la recherche et de l'analyse concurrente. Antoine en garde 1 à 3, les modifie ou colle son propre tableau.
5. **Éléments communs** (1 question). Personnage (grille des personnages, ou « Aucun »). Style et couleurs : repris de `channelProfile.brandColors` s'il est rempli (annoncé en une ligne), sinon proposés dans la même question.
6. **Cartes de composition** (1 question par variante). L'agent remplit la carte, l'écrit dans la fiche, puis demande « Variante A : [résumé en 1 ligne] » avec « Valider », « Changer l'émotion », « Changer le fond », « Changer le texte », « Changer le sujet focal », « Autre ». Seul le champ visé est reposé (3 options). Jamais de 4ᵉ élément : si Antoine en demande un, l'agent propose lequel retirer.
7. **Esquisses, aperçus, puis workflow** (1 question, plus les retouches).
   - Pour chaque variante : `generate_sketch` (prompt construit par l'app depuis la carte), `preview_thumbnail`, puis checklist. Si le point focal, le nombre d'éléments ou la zone de texte échoue, l'agent corrige la carte et régénère **une fois**, en le disant en une phrase.
   - Question : esquisses + aperçus mobile + grille, options « Valider avec <modèle recommandé> (<coût>) », « Valider avec un autre modèle », « Retoucher A », « Retoucher B »… Une retouche regénère seulement la variante visée.
   - Après validation, `place_node` pose en direct personnage, logos, références partagées, prompt et esquisse de chaque variante, générateur (`abTest` si 2 ou 3 variantes). Fin : `finish_turn` avec l'action « Générer » (libellé et coût calculés par l'app).

**Nombre de questions** : 8 en usage typique (2 variantes, logos évidents), de 7 à 9 selon les logos et le style ; 10 à 11 avec 3 variantes. Les retouches s'ajoutent.

## Fiche miniature

### Stockage

- Table `thumbnail_briefs` : `conversation_id` (clé primaire), `project_id`, `data` (JSON), `updated_at` ISO. DDL dans `AGENT_TABLES_DDL` (`src/lib/agent/migrations.ts`), idempotente.
- Table `youtube_thumbnail_copies` : `video_id` (clé primaire), `swipe_file_id`. Une miniature YouTube n'est copiée qu'une fois dans la bibliothèque.
- Table `thumbnail_analyses` : `video_id` (clé primaire), `data` (JSON), `analyzed_at`. Cache de l'analyse vision, réutilisable par le chantier D.
- Une fiche par conversation. `softDeleteConversation` (`src/lib/agent/conversation/store.ts`) supprime la fiche dans la même transaction ; `deleteProject` (`src/lib/local-storage.ts`) supprime les fiches du projet.

### Schéma (zod, `src/lib/brief/schema.ts`)

```
Grid9 = "top-left"|"top"|"top-right"|"left"|"center"|"right"|"bottom-left"|"bottom"|"bottom-right"
Hex   = "#RRGGBB"

{
  step: 1..7,
  video: { subject?: ≤300, workingTitle?: ≤120, script?: ≤8000, promise?: ≤90, audience?: ≤120 },
  research?: { summary: ≤1200, keyPoints: string[≤6], entities: { name, kind: "company"|"tool"|"product"|"other" }[≤12],
               sources: { title, url }[≤8], fetchedAt },
  logoCandidates: { id, name, source: "simple-icons"|"svgl"|"wikimedia", ref, previewUrl }[≤36],
  logos: { name, source: "stored:lg_<id>" }[≤3],
  competition?: { patterns: string[≤3], saturation: string[≤3], dominantPalette: Hex[≤3], analyzedAt },
  references: { videoId, title, channel, lang: "fr"|"en", views, score: number|null, ageDays,
                source: "stored:sf_<id>", analysis?: ThumbAnalysis }[≤3],
  abStrategy?: "concepts"|"single-variable",
  abVariable?: "text"|"emotion"|"background"|"hero",
  common: { persona?: "stored:persona_<id>"|"none", style?: ≤300, colors?: Hex[≤3],
            textMode: "rendered"|"overlay" (défaut "rendered"), model?: "nano-banana"|"openai"|"seedream" },
  variants: {
    key: "A"|"B"|"C", direction: ≤60, title: ≤60,
    thumbnailText: ≤20 car. et ≤4 mots, "" = aucun texte,
    visualIdea: ≤120, titleRole: ≤80, thumbRole: ≤80,
    composition?: {
      layout: "face-left_object-right"|"face-right_object-left"|"center-hero_text-top"|"split-versus"
              |"before-after"|"screen-hero_face-corner"|"object-hero_no-face"|"other",
      layoutNote?: ≤120,
      focal: ≤80,
      elements: { what: ≤80, role: "hero"|"support", sizePct: 5..70, position: Grid9 }[1..3],
      textZone: { position: Grid9, heightPct: 12..30 } | null,
      background: { kind: "solid"|"gradient"|"blurred-scene"|"scene", color?: Hex, note?: ≤120 },
      emotion?: { label: "curiosité"|"surprise"|"satisfaction"|"inquiétude"|"concentration"|"déterminé",
                  intensity: 1|2|3, mouth: "closed"|"open" },
      palette: { dominant: Hex, accent: Hex, highlight: Hex }
    },
    sketch?: { source: "generated:sk_<id>", status: "pending"|"validated"|"retouch", autoFixed: boolean,
               review?: { focal: boolean, elementCount: number, textZoneOk: boolean, faceOk: boolean|null,
                          standsOut: boolean, matchesCard: boolean, contrast: number|null, note?: ≤200 } }
  }[≤3],
  usage: { research: n, competitorSearches: n, analyses: n, sketches: n }   // serveur uniquement
}

ThumbAnalysis = { type: ThumbType, faceCount: 0|1|2|3, emotion?, emotionIntensity?: 1|2|3, mouthOpen?: boolean,
                  textWords: number, text?: ≤60, elementCount: number, layout: <catalogue>|"other",
                  background: "solid"|"gradient"|"scene"|"screenshot", dominantColors: Hex[≤3],
                  hasLogo: boolean, hasArrowOrCircle: boolean }
```

**Règles de validation** (refus avec message lisible, sauf mention) :
- `thumbnailText` : ≤ 4 mots et ≤ 20 caractères.
- Recouvrement titre / texte : après normalisation (minuscules, sans accents, sans mots vides FR/EN, hors entités de la fiche), plus d'un mot commun → **avertissement** renvoyé à l'agent, qui reformule une fois.
- Carte : 1 à 3 éléments, exactement un `hero`, somme des `sizePct` ≤ 110, `textZone` jamais sur la case du héros (grille 3×3), `emotion` seulement si `common.persona` n'est pas `none`. Défaut d'émotion : intensité 2, bouche fermée.
- `abStrategy = "concepts"` : deux variantes avec le même `layout` et le même `focal` → avertissement. `"single-variable"` : une carte B/C qui diffère de A sur autre chose que `abVariable` → avertissement.
- Toute chaîne `generated:sk_<id>` écrite dans la fiche est marquée attachée (`markAttached`) ; une esquisse remplacée par une retouche est détachée (le GC de `src/lib/agent/gc.ts` supprime les esquisses non attachées après 1 h).

### Fusion (`update_brief` et `PATCH`)

Entrée : `{ step?, video?, research?, common?, competition?, abStrategy?, abVariable?, logos?, references?, variant?: { key, set }, removeVariant?: key }`.
- Les objets sont fusionnés champ par champ ; `logos` et `references` sont remplacés en entier ; une variante est fusionnée par `key` (`composition` remplacée en entier quand elle est fournie).
- Écriture dans une transaction avec relecture. `usage`, `logoCandidates` et `research.sources` ne sont écrits que par les outils serveur.
- La route `PATCH` utilise la même fusion, sans `step` ni `research`.

## Outils

Tous sont construits par requête avec `conversationId`, réservés au chat (non exposés en MCP), avec un libellé dans `src/lib/agent/tool-labels.ts`.

- **`update_brief`** : applique la fusion ci-dessus, renvoie la fiche résumée (sans le script complet) et les avertissements, émet un chunk transient `data-brief-updated`.
- **Contexte par tour** : bloc `<thumbnail_brief>` compact après `<canvas_state>` (script tronqué à 1 500 caractères, sources réduites aux titres, `logoCandidates` réduits à `id` + `name`, aucun base64). Le prompt système dit de s'y fier plutôt qu'à l'historique.
- **`ask_user`** (`src/lib/agent/browser-tools/ask-user.ts`) :
  - `step` 1..7 = étape de la fiche (plusieurs questions par étape) ; la carte affiche « Étape n/7 » (aujourd'hui `ASK_USER_TOTAL_STEPS = 8`, « Question n/8 ») ;
  - limites : 12 options (aujourd'hui 6), `max_selected` ≤ 5 (aujourd'hui 3) ;
  - nouvelles images acceptées : `generated:sk_<id>` (→ `/api/generated-sketches/<id>`), `logo-candidate:<id>` (→ route d'aperçu ci-dessous), `preview:<id>` (aperçu mobile ou grille).
- **`research_topic`** :
  - entrée `{ query, language: "fr"|"en", refresh?: boolean }` ;
  - modèle `perplexity/sonar-pro`, même schéma que `src/lib/youtube/classify.ts` (client OpenAI pointé sur OpenRouter), timeout 60 s ;
  - le modèle rend du JSON (summary, keyPoints, entities), extrait et validé avec tolérance par zod ;
  - les **sources viennent uniquement des citations de l'API** (`annotations` `url_citation` / `citations`), jamais du JSON du modèle ;
  - coût depuis `usage.cost`, sinon estimation ; journalisé avec un nouvel `LogEndpoint` `"research"` (`src/lib/generations-log.ts`).
- **`find_logos`** : entrée `{ names: string[≤12] }` ; réutilise `src/lib/logos/search.ts` ; au plus 3 candidats par nom, stockés dans `brief.logoCandidates` ; renvoie à l'agent des lignes `logo-candidate:<id> | nom | source`, **jamais de base64**.
  - Route `GET /api/briefs/[conversationId]/logo-candidates/[id]` : décode le SVG Simple Icons, ou redirige vers l'URL SVGL/Wikimedia. Brandfetch ne passe jamais par le serveur.
  - **`add_logo`** prend un id de candidat (jamais une URL fournie par le modèle), réutilise `src/lib/logos/add-logo.ts` et renvoie `stored:lg_<id>`.
- **`find_competitor_thumbnails`** : entrée `{ query_fr, query_en }`.
  1. Une `search.list` par langue : `type=video`, `order=relevance`, `publishedAfter` = 18 mois, `relevanceLanguage` + `regionCode=FR` pour le français, `maxResults=25`.
  2. `videos.list` (`fetchVideos`) : exclut Shorts (durée ≤ `SHORT_MAX_SECONDS`, `src/lib/youtube/sync.ts`), directs et vidéos de moins de 14 jours.
  3. Ligne de base par chaîne distincte (24 au plus) : si la chaîne est suivie, `median_views` en base ; sinon `fetchPlaylistPage(longFormPlaylistId)` (repli `UU…`) puis `fetchVideos`, et `channelMedianViews` de `src/lib/youtube/performance.ts` (50 dernières, plus de 7 jours), vidéo candidate exclue. Cache 24 h par chaîne.
  4. Score = `performanceScore(vues, médiane)`. Pas de score si la ligne de base compte moins de 8 vidéos ou vaut moins de 500 vues (« peu de données », en fin de liste). Au-delà de ×30 : plafonné pour le tri, marqué « viral atypique ».
  5. Tri = `log2(score) × pertinence × fraîcheur` (pertinence 1 dans le top 10 de la recherche, 0,8 ensuite ; fraîcheur `max(0,5 ; 1 − âge_mois / 36)`). Dédoublonnage.
  6. Sortie : 12 vidéos au plus, **dont au moins 4 FR** si elles existent, en lignes `youtube:<videoId> | chaîne | vues | ×score | âge | langue`, **sans image**. Les résultats sont gardés côté serveur pour `analyze_thumbnails` et `preview_thumbnail`.
  - À ajouter dans `src/lib/youtube/api.ts` : `searchVideos` (`youtubeGet` n'est pas exporté) et `channelId` dans `VideoDetails` (`src/lib/youtube/types.ts`).
- **`analyze_thumbnails`** : entrée `{ video_ids: string[≤12] }` (issus de la dernière recherche).
  - Modèle `CLASSIFY_MODEL` (`src/lib/youtube/classification-pricing.ts`), image `mqdefault`, sortie structurée `ThumbAnalysis`, cache `thumbnail_analyses`. Sortie invalide : miniature ignorée.
  - Résumé **calculé par le serveur, sans LLM**, pondéré par le score : `patterns` (3 traits les plus fréquents chez les ×3 et plus), `saturation` (traits présents chez plus de 70 % des miniatures FR, à ne pas copier), `dominantPalette` (3 couleurs dominantes du fil FR). Écrit dans `brief.competition`.
  - Coût journalisé (`LogEndpoint` `"classify-thumbnail"`).
- **Copie des références** : `import_youtube_thumbnail`, dédoublonné par `youtube_thumbnail_copies` pour toutes les vidéos (`copyVideoThumbnailToLibrary` ne couvre que les chaînes suivies ; les autres passent par `saveThumbnailToLibrary`). Renvoie `stored:sf_<id>`.
- **`generate_sketch`** (`src/lib/agent/tools/generate-sketch.ts`) :
  - nouveau style `color_blocking` : aplats de couleur, formes simples, sans texture, vraies couleurs de la palette ; `pencil_sketch` reste disponible hors parcours ;
  - nouvelle entrée `from_brief: { variant: "A"|"B"|"C" }` : l'app construit le prompt depuis la carte (layout en clair, grille 3×3, héros avec taille et position, supports, « leave the <zone> area (<n>% of height) completely empty », fond, palette 60/30/10, émotion décrite physiquement, « Image N is … » pour chaque référence, « Nothing else in the frame ») ; **aucun texte dans l'esquisse** ; persona et logos de la carte passés en références ;
  - modèle `gemini-3.1-flash-image` (aujourd'hui `gemini-2.5-flash-image`, l. 25-26, même coût de 0,02 $ dans `src/lib/model-costs.ts`).
- **`preview_thumbnail`** (gratuit, sans IA, `sharp`) : entrée `{ variant }`.
  - (a) l'esquisse à **168×94**, avec `thumbnailText` simulé en overlay dans `textZone` (police grasse système, contour) ;
  - (b) une **grille 4×2** à 168×94 : l'esquisse en position 2 parmi 7 miniatures FR de la dernière recherche (sinon aperçu (a) seul) ;
  - contrôles calculés : contraste WCAG entre texte et couleur moyenne de la zone (seuil 4,5:1), couleur dominante comparée à celle des voisines ;
  - renvoie les deux images à l'agent et leurs refs `preview:<id>` pour `ask_user`.
- **Checklist de l'agent** (écrite dans `sketch.review`) : 1. point focal identifiable en moins d'une seconde à 168×94 ; 2. au plus 3 éléments visibles (compte réel) ; 3. zone de texte vide et contraste suffisant (valeur de l'app) ; 4. visage lisible s'il y a un personnage ; 5. ressort dans la grille (valeur de l'app) ; 6. conforme à la carte. Échec de 1, 2 ou 3 : correction de la carte et **une** régénération (`autoFixed = true`), jamais deux.
- **Prompt final par variante** : écrit par l'agent depuis la carte. `textMode = "rendered"` : texte exact entre guillemets, avec police, couleur, contour et taille en % de la hauteur. `textMode = "overlay"` : zone réservée et vide, texte posé ensuite par Antoine. Modèle recommandé en `rendered` : `openai` (GPT Image) si le texte a des accents ou plus de 2 mots, sinon `nano-banana` ; `seedream` s'il y a un personnage et aucun texte.
- **`place_node`** (`src/lib/agent/place-node.ts`, `src/lib/canvas/canvas-patch.ts`) :
  - ids : `iv-persona`, `iv-logo-1..3`, `iv-ref-1..3` (références partagées sur `ref-in`, héritées par B/C), `iv-prompt-a|b|c`, `iv-sketch-a|b|c`, `iv-generator`. L'id F2 `iv-prompt` reste reconnu : `INTERVIEW_NODE_ID` (l. 10, aussi utilisé par `src/lib/local-storage.ts:190`) est étendu, jamais réduit ;
  - nouveau type `sketch` (`image_source generated:sk_<id>`) ; aujourd'hui seuls prompt/faceReference/swipeFile/generator sont acceptés (l. 35) ;
  - poignée déduite de l'id : `iv-prompt-x` / `iv-sketch-x` → `inputHandle(slot, X)` (`src/lib/canvas/generator-variants.ts`) ; persona → `face-in` ; logos → `logo-in` ; références → `ref-in` ;
  - `iv-generator` accepte `abTest`, normalisé par `normalizeVariants` (aujourd'hui refusé, l. 234-235) ;
  - un lien vers une poignée `-b`/`-c` n'est posé que si la variante est active sur le générateur ; sinon il attend la pose ou la mise à jour du générateur ;
  - retirer une variante retire ses liens (`edgesToRemoveForVariants`) dans le même snapshot et le même patch ;
  - une seule direction : pas d'`abTest`, ids `-a` seulement, générateur normal ;
  - disposition en colonnes : entrées partagées | prompts A/B/C empilés | esquisses | générateur ;
  - règles existantes inchangées (`agentLinks`, snapshots, patches, `previousUpdatedAt`).

### Prompt système et guidance (`src/lib/agent/system-prompt.ts`, `src/lib/prompt-engineering.ts`)

- Une section **THUMBNAIL JOURNEY** (7 étapes, fiche, outils, règles packaging, carte, checklist) remplace GUIDED INTERVIEW, Mental checklist, PROPOSING ANGLES, WHEN THE USER PICKS AN ANGLE et la ligne « core loop ».
- MULTI-SELECT FOR A/B TESTING est réduit aux règles de poignées appliquées par `place_node`.
- EXISTING WORKFLOW reste pour les demandes sur un workflow existant ; toute autre demande de miniature lance le parcours. « Reprendre / Repartir de zéro » reste proposé quand des nœuds `iv-*` existent sans fiche de cette conversation.
- `INTERVIEW_PRICE_TABLE` sert à l'option « Valider avec <modèle> » de l'étape 7 (16x9, 1 image par variante).
- Mentions de `trigger_generation` (outil inexistant) retirées.
- `list_followed_videos` reste disponible mais n'est plus proposé à l'étape 1.
- `MODEL_SELECTION_GUIDE` : retirer `ideogram` et `grok`, garder nano-banana, GPT Image et Seedream.
- `YOUTUBE_THUMBNAIL_PATTERNS` : « 200×112 » → « 168×94 » ; supprimer « lifts CTR ~30% » (non sourcé) au profit de « visage selon les motifs concurrents » ; texte « 0 à 4 mots, complémentaire du titre ».
- `PROMPT_ANATOMY` : plan moyen « avec action » optionnel, 3 éléments au plus héros compris, « leave <zone> empty » en mode overlay. `WORKED_EXAMPLE` réécrit avec 3 éléments, bouche fermée, intensité 2.

## Écran

- **Bouton « Fiche »** dans `ChatHeader.tsx`, avec un badge « Étape n/7 ». Il ouvre un `Sheet` latéral (`src/components/ui/sheet.tsx`) avec une section par bloc, remplie au fil du parcours :
  - Vidéo et promesse ; Recherche (résumé, liens des sources) ; Logos (vignettes) ;
  - Concurrents : « ce qui marche », « à éviter », références avec score ;
  - Stratégie A/B et éléments communs ;
  - Variantes : package (titre, texte, idée, rôles), carte de composition, esquisse, aperçu mobile, grille et checklist.
- **Champs éditables** : promesse, public, textes des variantes, champs de carte (focal, éléments, émotion, fond, palette, zone de texte), `textMode`. Enregistrés par `PATCH /api/briefs/[conversationId]` (JSON uniquement via `rejectNonJsonRequest`, même fusion et mêmes validations, erreurs affichées sous le champ). L'agent voit les modifications au tour suivant.
- **Lecture** : `GET /api/briefs/[conversationId]`. Rafraîchissement du panneau par le chunk `data-brief-updated` (`onData` du chat), sinon rechargement à l'ouverture.
- **Ligne d'étape** : `TurnProgress` affiche « Étape 3/7 — Concurrents » quand une fiche est active (chunk ou GET).
- **État vide** : `INTERVIEW_START_MESSAGE` (`ChatEmptyState.tsx:8`) lance le parcours.

## Coût

Estimation par parcours (2 variantes), hors génération finale :

| Poste | Coût |
|---|---|
| Recherche Sonar Pro | 0,01 à 0,03 $ (2 au plus par conversation) |
| Analyse vision (12 miniatures, cache par vidéo) | environ 0,002 $ |
| Esquisses | 0,04 $ ; 0,08 $ au pire avec une auto-correction par variante ; +0,02 $ par retouche |
| Aperçus `sharp` | 0 $ ; environ 0,5 à 1 k jetons d'image par variante pour l'agent |
| Tours d'agent | environ 20 à 30 appels, contexte porté par la fiche ; à mesurer en live |
| Quota YouTube | environ 250 unités par recherche (2 × 100 + environ 50 pour les lignes de base), 2 recherches au plus, sur 10 000 par jour |
| Génération finale | seulement au clic sur « Générer » ; coût affiché par l'app (GPT Image 0,02 à 0,05 $ par image selon la version) |

Total hors tours d'agent : environ 0,05 à 0,11 $.

**Réductions de contexte quand une fiche existe** (`src/lib/agent/v2/route-handler.ts` reconstruit tout l'historique à chaque appel) :
1. pas de `web_search_options` (`src/lib/agent/v2/web-search-tool.ts`, `agentWebSearch` vaut `true` par défaut) : la recherche passe par `research_topic` ;
2. les images sont retirées de toutes les lignes antérieures au dernier `ask_user` résolu (aujourd'hui seulement avant le dernier message utilisateur, alors que chaque réponse est une continuation) ;
3. `import_youtube_thumbnail`, `generate_sketch` et `preview_thumbnail` rejoignent `HISTORY_IMAGE_TRIMMED_TOOLS` (`src/lib/agent/v2/history-images.ts`) ;
4. `find_competitor_thumbnails` ne renvoie aucune image et n'entre pas dans `VISUAL_RESULT_TOOLS`.

## Sécurité coût et garde-fous serveur

Compteurs dans `brief.usage`, vérifiés par les outils eux-mêmes :
- `research_topic` : refusé si `brief.research` existe, sauf `refresh: true` ; 2 appels au plus par conversation.
- `find_competitor_thumbnails` : 2 au plus par conversation.
- `analyze_thumbnails` : 12 images par appel, 2 appels au plus ; les miniatures en cache ne coûtent rien.
- `generate_sketch` avec fiche : refusé tant que `step < 7` ou sans carte pour la variante ; au plus `2 × variantes + 3` par conversation (auto-corrections et retouches comprises).
- `preview_thumbnail` : 2 au plus par esquisse.
- « Générer » reste uniquement un bouton `finish_turn` ; aucun outil de génération finale pour l'agent.
- **Mode simulé** : quand `isFakeAgentEnabled()` (jamais en production), `research_topic`, `find_logos`, `find_competitor_thumbnails`, `analyze_thumbnails` et `generate_sketch` renvoient des fixtures locales : aucun réseau, aucun `logGeneration`. `preview_thumbnail` tourne sur les fixtures.
- Vérification live payante : uniquement avec l'accord explicite d'Antoine.

## Erreurs

- Pas de clé OpenRouter : parcours bloqué avec le message existant.
- Recherche en échec, vide ou limite atteinte : l'agent le dit et passe aux logos à partir des noms cités par Antoine.
- Pas de clé YouTube ou quota épuisé : étape 3 sautée avec message ; `competition` vide, les cartes s'appuient sur la recherche.
- Analyse vision en échec : références proposées sans résumé « ce qui marche ».
- Logo introuvable : import manuel (dialogue Bibliothèque) ou Brandfetch en aperçu.
- Fiche invalide (patch refusé) : `error-text`, l'agent corrige et réessaie une fois. Avertissement (recouvrement, variantes trop proches) : l'agent reformule une fois, puis continue.
- Esquisse refusée par le garde-fou : l'agent le dit et propose de valider en l'état.
- Checklist toujours en échec après l'auto-correction : l'esquisse est montrée avec la note, sans nouvelle régénération.
- Conversation rouverte : fiche rechargée, l'agent reprend à `step`.

## Découpage

### F3a — Fiche et parcours de base

- **Périmètre** :
  - tables `thumbnail_briefs` et hooks de suppression ; schéma zod avec fusions par clé et validations (packaging, carte, stratégie A/B) ; `update_brief` ; bloc `<thumbnail_brief>` ; routes GET et PATCH ;
  - `ask_user` : étapes 1..7, 12 options, `max_selected` ≤ 5, refs `generated:sk_` ;
  - protection GC des esquisses (`markAttached`/détachement) ;
  - réductions de contexte (1 à 3) et compteurs de garde-fous ;
  - section THUMBNAIL JOURNEY et nettoyage du prompt système ; corrections de `prompt-engineering.ts` ;
  - `Sheet` Fiche, badge, ligne d'étape, édition ;
  - retrait des restes F2 : scénario simulé `interview` (`fake-agent-model.ts`, `fake-interview-script.ts`), tests « étape 8 », description de `place_node` (`place-node-tool.ts:41`).
- **Comportement livré** : étapes 1, 4, 5 et 6 complètes (y compris packaging, stratégie A/B et cartes). Étapes 2 et 3 sautées (l'agent s'appuie sur ce qu'Antoine a dit). Étape 7 provisoire : `generate_sketch` actuel sur prompt de l'agent et pose via `place_node` F2 (une direction) ou `apply_workflow` (A/B), jusqu'à F3c.
- **Interfaces** : `src/lib/brief/schema.ts`, `src/lib/brief/store.ts`, `update_brief`, `GET|PATCH /api/briefs/[conversationId]`, `ASK_USER_TOTAL_STEPS = 7`, chunk `data-brief-updated`.
- **Tests** :
  - schéma : limites, `thumbnailText` > 4 mots ou > 20 car. refusé, avertissement de recouvrement (entités exclues), carte (4 éléments, 0 ou 2 héros, somme > 110, zone sur le héros) refusée, avertissements de stratégie ;
  - fusion : champ par champ, tableaux remplacés, variante par clé, `removeVariant`, transaction ;
  - stockage : migration idempotente, CRUD, suppression douce de conversation et suppression de projet ;
  - routes : 415, 404, validation, champs serveur non patchables ;
  - `update_brief` : écriture, chunk transient, `markAttached` et détachement ;
  - bloc `<thumbnail_brief>` : compact, tronqué, aucun base64 ;
  - `ask_user` : étape 7 acceptée, 8 refusée, 12 options, ref `generated:sk_` ;
  - historique : images retirées avant le dernier `ask_user` résolu, pas de `web_search_options` avec fiche ;
  - prompt : THUMBNAIL JOURNEY présent ; GUIDED INTERVIEW, PROPOSING ANGLES, core loop et `trigger_generation` absents ; `ideogram`, `grok`, « 200×112 » et « ~30% » absents de la guidance ;
  - UI : bouton et badge, sections du `Sheet`, édition enregistrée et erreur affichée, rafraîchissement sur chunk.

### F3b — Recherche et contexte

- **Périmètre** : `research_topic` ; `find_logos`, route d'aperçu des candidats, `add_logo` par id ; `find_competitor_thumbnails` avec score médiane ; `analyze_thumbnails` et table `thumbnail_analyses` ; dédoublonnage `youtube_thumbnail_copies` ; fixtures du mode simulé pour ces outils ; libellés d'outils ; étapes 2 et 3 activées dans le prompt.
- **Interfaces** : `LogEndpoint` `"research"` ; `searchVideos` et `VideoDetails.channelId` dans `src/lib/youtube/api.ts` / `types.ts` ; `GET /api/briefs/[conversationId]/logo-candidates/[id]` ; refs `logo-candidate:<id>` dans `ask_user` ; `brief.competition`, `references[].score`.
- **Tests** :
  - `research_topic` : OpenRouter mocké, JSON tolérant, sources prises des citations seulement, timeout, coût journalisé, refus sans `refresh`, limite de 2 ;
  - `find_logos` / `add_logo` : providers mockés, 3 candidats par nom, aucun base64 renvoyé, id inconnu refusé, URL fournie refusée ; route d'aperçu : SVG décodé, redirection, 404 ;
  - `find_competitor_thumbnails` : fake YouTube, Shorts/directs/moins de 14 jours exclus, médiane candidate exclue, chaîne suivie sans appel, « peu de données », plafond ×30, tri, au moins 4 FR, aucune image, pas de clé, limite de 2, calcul des unités ;
  - `analyze_thumbnails` : modèle mocké, cache, sortie invalide ignorée, résumé `patterns`/`saturation`/`dominantPalette` déterministe ;
  - copie : même vidéo importée deux fois → un seul `sf_` ;
  - mode simulé : aucun `fetch` appelé, aucun `logGeneration`.

### F3c — Esquisses et workflow A/B

- **Périmètre** : `generate_sketch` `color_blocking` + `from_brief` + modèle 3.1 ; `preview_thumbnail` et checklist ; garde-fous d'esquisse ; `place_node` en variantes ; étape 7 définitive dans le prompt (MULTI-SELECT réduit) ; recommandation de modèle et `textMode` ; fixtures d'esquisse ; scénario simulé `THUMBGEN_FAKE_AGENT=journey` de bout en bout.
- **Interfaces** : `generate_sketch({ from_brief })`, `preview_thumbnail({ variant })`, refs `preview:<id>`, type de nœud `sketch`, ids `iv-*-a|b|c`, `INTERVIEW_NODE_ID` étendu, `sketch.review`.
- **Tests** :
  - prompt d'esquisse construit depuis la carte : zone vide, aucun texte, rôles « Image N », « Nothing else in the frame » ; modèle 3.1 ;
  - garde-fous : refus avant l'étape 7, sans carte, au-delà de `2 × variantes + 3` ;
  - `preview_thumbnail` : dimensions 168×94 et grille 4×2, overlay du texte, contraste calculé, repli sans concurrents, limite de 2 ;
  - auto-correction : une seule régénération, `autoFixed` ;
  - `place_node` : ids anciens et nouveaux, type `sketch`, poignées par variante, `abTest` normalisé, lien différé vers une variante inactive, liens retirés avec la variante (même patch), une direction sans `abTest`, disposition en colonnes ;
  - navigateur (modèle simulé, fixtures côté serveur de dev) : parcours complet jusqu'au workflow A/B posé en direct, fiche remplie, aucun appel réel, « Générer » non cliqué.

## Ordre et dépendances

1. **F3a** d'abord : fiche, `ask_user` et garde-fous sont utilisés par tout le reste. Livrable seul (parcours sans recherche ni aperçus).
2. **F3b** ensuite : dépend de la fiche (`logoCandidates`, `competition`, compteurs) et des refs `ask_user`.
3. **F3c** en dernier : dépend de la carte (F3a) et utilise les concurrents de F3b pour la grille d'aperçu (repli sur l'aperçu mobile seul si F3b manque).
4. Chaque sous-chantier fusionne avec ses tests verts ; la vérification live se fait après F3c.

## Tests transverses

- Aucun outil payant appelé en mode simulé (assertion sur `fetch` et `logGeneration`).
- Cohérence du prompt système après chaque sous-chantier : aucune section ne relance des esquisses immédiates ni `apply_workflow` pendant un parcours.
- Reprise : conversation rouverte à chaque étape, l'agent repart de `step`.

## Vérification live

Payante : seulement avec l'accord explicite d'Antoine. Parcours réel court (2 variantes) sans cliquer « Générer ». Relever dans Usage le coût de la recherche, de l'analyse et des esquisses, le nombre d'appels d'agent et le nombre de questions ; contrôler la lisibilité des aperçus et la pertinence des scores concurrents.

## Plus tard

- **Visage selon les données de la niche** : recommander « avec / sans visage » à partir de `competition.patterns` et de `summarizeTypes` (Ma chaîne, seuil `MIN_SCORED_FOR_RANKING`), avec l'option « A avec, B sans ». Réf. : 1of10 via Search Engine Journal, vidIQ 2026.
- **Suivi après publication** : vidéo publiée et variante gagnante saisies dans la fiche, score à J+7 et J+28 via la synchro du chantier D, bloc `<past_packaging>` réinjecté au parcours suivant.
- **Nœud Texte** (overlay rendu par `sharp` sur l'image finale, `textMode = "overlay"` par défaut).
- **Signature de chaîne** (police, couleur et placement du texte dans Réglages), pour supprimer la question de style.
- **Couleurs mesurées** : écart ΔE avec la palette dominante du fil, alerte de luminance contre l'interface YouTube.
- **Recherche orientée packaging** : `hooks`, `stakes`, `visualAnchors` sourcés.
- **Titre testé** dans l'A/B YouTube.

## Historique

- 2026-09-17 : validée en brainstorming avec Antoine.
- 2026-09-17 : corrigée après revue du code et critique de recherche (packaging d'abord, cartes de composition, classement médiane et analyse vision des concurrents, esquisses en aplats avec aperçus et checklist, A/B contrastées, garde-fous serveur, découpage F3a/F3b/F3c).
