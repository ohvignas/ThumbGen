# Agent qui respecte et comprend le canvas (correctif urgent) — design

Date : 2026-09-17. Origine : retour d'Antoine sur le projet « Nouveau projet ».

## Ce qui s'est passé

Antoine a :
- ajouté une étape au workflow (un 2e générateur, une image importée « images (3).png », un prompt) ;
- choisi une image générée pour l'améliorer ;
- demandé à l'agent de regarder le prompt et d'analyser l'image.

L'agent a répondu ainsi :
1. `get_canvas_state` ne donne qu'un résumé (`hasImage: true`) : l'agent ne voit **aucune image** du workflow.
2. `apply_workflow` **remplace tout le canvas** par le blueprint : « 0 created, 4 updated, 10 deleted ».
   - Le 2e générateur, ses liens et l'image importée ont été supprimés.
   - Une image posée directement sur le canvas n'a pas de `image_source`, donc elle ne peut pas être recréée.
   - Les données du générateur (images générées) sont remplacées par le mapping minimal.
3. Le prompt système pousse à agir immédiatement (« IMMEDIATELY call apply_workflow with the COMPLETE blueprint (don't ask first) », « call apply_workflow with a new blueprint ») au lieu d'analyser et de poser des questions.

## Objectif

1. **Plus jamais de perte de travail** : aucun appel d'agent ne supprime ou n'écrase un nœud que la demande ne vise pas, et chaque écriture de l'agent est réversible.
2. **L'agent voit le workflow** : il peut regarder toutes les images du canvas (croquis, images importées, logos, visage, images générées) pour comprendre ce qu'Antoine a fait.
3. **Brainstorming léger avant de modifier un workflow existant** : l'agent analyse, reformule en 1–2 phrases, pose 1 à 3 questions courtes, puis modifie seulement les nœuds concernés.

Hors périmètre : l'interview guidée et `ask_user` (F2), les questions à choix cliquables. Ici, les questions sont posées en texte et, au besoin, via les actions `ask_agent` existantes de « Et maintenant ».

## Design

### 1. `apply_workflow` non destructif

Nouvelle entrée : `{ project_id, blueprint, remove_node_ids?: string[] }`.

**Nœuds du blueprint dont l'id existe déjà sur le canvas** (même type) : mise à jour.
- `data = { ...ancien, ...mappé }`, où `mappé` ne contient que les champs fournis. Aucun champ existant n'est effacé (images générées, `imageBase64` importé, `personaAngles`, réglages du générateur…).
- Position conservée.
- Pour ces nœuds, les champs d'image sont facultatifs (`image_source` peut manquer : l'image existante est gardée). Pour cela, les schémas du blueprint acceptent un nœud existant partiel. La validation se fait après la fusion avec l'existant, ou avec un schéma « mise à jour ».

**Nœuds du blueprint nouveaux** : création comme aujourd'hui (validation complète, résolution d'image). Placement : auto-layout des seuls nouveaux nœuds, décalé à droite du canvas existant (`maxX + 200`). Le canvas existant n'est jamais re-disposé.

**Nœuds absents du blueprint** : **conservés**. Seuls les ids de `remove_node_ids` sont supprimés, avec leurs liens. L'id `remove_node_ids` inconnu est ignoré et signalé dans le résumé.

**Liens** :
- liens existants conservés si leurs deux extrémités existent encore ;
- liens du blueprint ajoutés, dédupliqués sur `(source, target, targetHandle)` ;
- nouvelle entrée facultative `remove_edges?: { source, target, targetHandle }[]`.

**Instantané avant chaque écriture** : nouvelle table `canvas_snapshots` (`id`, `project_id`, `created_at` ISO, `nodes`, `edges`, `reason` = « apply_workflow »), les 20 derniers conservés par projet. Nouvelle route `GET /api/project/[id]/snapshots` (liste) et `POST /api/project/[id]/snapshots/[snapshotId]/restore` (restaure : crée d'abord un instantané de l'état courant, puis écrit l'instantané, `updated_at` ISO). Dans le canvas, un menu « Historique de l'agent » (bouton dans la barre du canvas) liste les instantanés (« avant modification de l'agent — 08:32 ») avec « Restaurer » et une confirmation.

**Écriture** : `updated_at` en ISO (`new Date().toISOString()`), comme `saveProject`.

**Résumé renvoyé** : `Applied: X created, Y updated, Z removed (kept N untouched).`

L'outil reste exposé en MCP avec la même sémantique.

### 2. `get_canvas_state` plus riche

Le résumé par nœud ajoute :
- `swipeFile`/`sketch` : `label`, `kind`, `source` (`library:<id>` si `image_source`/`imageUrl` connu, sinon `canvas-upload`), `hasImage` ;
- `generator` : `model`, `aspectRatio`, `count`, `abTest`, `generatedCount` (nombre d'images générées sur le nœud), et l'image choisie si le nœud en marque une (lire les vrais champs de `GeneratorNode`/`useGeneratorRun`) ;
- `preview` : `hasOutput`, `label` ;
- `textOverlay` : texte et style résumés (champs réels).

La description de l'outil mentionne `view_canvas_images` pour voir les images.

### 3. Nouvel outil `view_canvas_images`

Entrée : `{ project_id, node_ids?: string[] }`. Sans `node_ids` : tous les nœuds qui portent une image, **8 images au plus**.

Pour chaque nœud (ordre du canvas), l'outil rassemble ses images :
- `sketch`/`swipeFile` : `imageBase64` ou `imageUrl` (résolu localement en lisant la base ou le fichier, jamais par HTTP) ;
- `faceReference` : l'angle `front` ;
- `generator` : les images générées du nœud, **au plus 2** (les plus récentes, ou celle marquée choisie en premier) ;
- `preview` : sa sortie.

Chaque image est réduite avec `sharp` à **768 px** de côté maximum, en JPEG qualité 80.

Sortie : un bloc texte `node <id> (<type>, <label>) — image k/n` avant chaque image, puis la part `image`. Nœud sans image lisible : ligne texte « pas d'image lisible ».

L'adaptateur (`toModelOutput`) transmet déjà les images au modèle comme `file`. L'outil n'est pas un « résultat visuel » du chat : ses images restent dans le détail replié.

### 4. Prompt système

Ajout d'une section statique « EXISTING WORKFLOW », prioritaire sur le flux de brainstorming quand `<canvas_state>` contient des nœuds.

Quand Antoine demande de regarder, analyser, compléter, améliorer ou modifier le workflow :
1. **Comprendre** :
   - appeler `view_canvas_images` sur les nœuds concernés (tous si la demande est générale) ;
   - lire les prompts dans `<canvas_state>` ;
   - repérer ce qu'Antoine a ajouté (nœuds, liens, image importée) ;
   - si une image générée est marquée choisie, la considérer comme le point de départ à améliorer.
2. **Reformuler et questionner** :
   - un `finish_turn` avec, en `summary`, ce qu'il a compris en 1–2 phrases, puis 1 à 3 questions courtes ;
   - des `next_actions` `ask_agent` qui proposent les réponses probables (ex. « Garder la composition, changer le fond ») ;
   - **ne rien modifier dans ce tour**, sauf si la demande est déjà précise et sans ambiguïté (ex. « remplace le texte par X »).
3. **Modifier seulement ce qui est visé** : `apply_workflow` avec uniquement les nœuds modifiés ou ajoutés (ids existants réutilisés). Jamais de `remove_node_ids` sans demande explicite d'Antoine. Pour repartir d'une image générée, la brancher en référence (`generated:gi_<id>` en `swipeFile` `kind: "reference"` → `ref-in`) plutôt que de reconstruire.
4. Ne jamais dire « tout est restauré » sans l'avoir vérifié.

Lignes à retirer ou corriger dans le prompt :
- « IMMEDIATELY call apply_workflow with the COMPLETE blueprint (don't ask first) » : limité au cas d'un canvas vide ;
- « call apply_workflow with a new blueprint that retains existing node IDs you want to keep » : devient « modifier seulement les nœuds visés, les autres sont conservés automatiquement ».

Les blocs par tour, la section A/B et `finish_turn` restent inchangés.

## Coût

`view_canvas_images` ajoute des images d'entrée au modèle, au plus 8 × 768 px par appel. L'appel n'est fait que sur une demande d'analyse ou de modification d'un workflow existant. Aucune génération payante n'est ajoutée.

## Tests

- **`apply_workflow`** :
  - nœuds absents conservés ;
  - `remove_node_ids` ;
  - mise à jour qui garde position, `imageBase64` importé et images générées ;
  - nœud existant sans `image_source` accepté ;
  - nouveaux nœuds placés à droite sans re-disposer l'existant ;
  - liens conservés, ajoutés, dédupliqués, retirés ;
  - instantané créé et purge au-delà de 20 ;
  - `updated_at` ISO ;
  - le scénario réel du 2026-09-17 : un blueprint à 4 nœuds sur un canvas à 14 nœuds n'en supprime aucun.
- **Routes d'instantanés** : liste, restauration (avec l'instantané de l'état courant), 404.
- **`get_canvas_state`** : nouveaux champs.
- **`view_canvas_images`** : limite de 8, réduction à 768 px (dimensions vérifiées), images de nœud importées, générées et de personnage, nœud sans image.
- **Prompt** : section EXISTING WORKFLOW présente, anciennes consignes retirées, tests existants verts (en ajustant ceux qui citent le texte retiré).
- **Rendu** : le menu « Historique de l'agent » liste et confirme la restauration.

## Données déjà perdues

L'image importée « images (3).png » du 2026-09-17 n'est pas récupérable par l'app : elle n'était ni en bibliothèque ni en base ailleurs que dans le nœud supprimé. Les images générées restent dans `generated_images` (historique des générations).
