# Interview guidée (chantier F2) — design

Date : 2026-09-17. Statut : parcours et écran validés en brainstorming avec Antoine ; nœuds posés par le serveur approuvés avec le découpage F1/F2 ; erreurs et tests rédigés par Claude sur l'instruction « enchaîne sans moi » (rulings). **Prérequis : F1** (`docs/superpowers/specs/2026-09-17-agent-arriere-plan-design.md`) fusionné.

## Objectif

L'agent construit le workflow d'une miniature avec Antoine au fil d'une **interview guidée fixe** : une question à choix à la fois, et chaque réponse pose ou complète **son nœud sur le canvas, en direct**. L'interview se termine par un récap avec un bouton « Générer » : aucune génération ne part sans ce clic.

## Décisions validées

- Interview guidée fixe : **8 questions** (vidéo, angle, personnage, références, logos, texte, ambiance, modèle), puis un **récap**.
- Réponses : choix avec vignettes quand c'est visuel ; « Autre » en texte libre, toujours proposé ; « Passer ».
- Le composer reste visible pendant une question : écrire un message **abandonne la question** (comportement existant `skipped/abandoned`) et ouvre un nouveau tour. C'est la façon de revenir en arrière (« reviens au personnage ») ou d'arrêter l'interview.
- Fin : récap + bouton « Générer » dont le libellé et le coût sont calculés par l'app, jamais par le modèle.
- Les nœuds sont posés par un **outil serveur** et diffusés en direct au canvas ouvert, pour que l'interview avance même si Antoine quitte la page (F1).

## Parcours

Compteur affiché « Question n/8 ».

1. **Vidéo** — « De quoi parle la vidéo ? ». Options : les 5 dernières vidéos longues de « Ma chaîne » (`list_followed_videos`), vignettes `youtube:<videoId>`. « Autre » : lien YouTube ou description. L'agent peut lire le script avec `extract_youtube_script`.
2. **Angle** — 3 angles en texte (titre + une phrase). Après le choix : `place_node` pose **`iv-prompt`** (premier jet du prompt).
3. **Personnage** — vignettes des personnages (`list_personas`). Passer = aucun. Pose **`iv-persona`** (`faceReference`).
4. **Références** — `multiple`, `max_selected: 3`. Options : miniatures les mieux notées des chaînes suivies sur le type le plus performant (`list_followed_videos` avec `sort: "score"`, `best_type: true`) et images de la bibliothèque (`list_swipe_files`). Pour une miniature YouTube choisie, l'agent obtient une copie en bibliothèque via `import_youtube_thumbnail` (dédoublonné, voir « Réutilisation »), puis pose **`iv-ref-1..3`** (`swipeFile` `kind: "reference"`).
5. **Logos** — `multiple`, `max_selected: 3`, vignettes (`list_logos`). « Autre » = nom de marque que l'agent cherche. Pose **`iv-logo-1..3`** (`swipeFile` `kind: "logo"`).
6. **Texte** — 3 propositions de texte sur la miniature, Passer = pas de texte. Met à jour `iv-prompt`.
7. **Ambiance** — 3 à 4 propositions (couleurs, émotion). Met à jour `iv-prompt`.
8. **Modèle** — options combinant modèle et prix, ex. « Nano Banana · ~0,02 $ / image » (prix issus de la table statique du prompt, générée depuis `MODEL_COSTS`). Format 16x9 par défaut, modifiable via « Autre ». Pose **`iv-generator`** et relie les nœuds d'interview.

**Récap** (pas une question) — `finish_turn` : `summary` court (ce qui a été construit) et `next_actions: [{ kind: "generate", node_id: "iv-generator" }]`.

Liste vide (pas de vidéo, de personnage ou de logo) : l'agent saute la question et le dit à l'étape suivante.

L'A/B test est **hors F2** (il reste disponible via `apply_workflow` ou dans le nœud Générateur).

## Lancement

- État vide du chat (conversation vide) : bouton « Construire avec l'agent » qui envoie « Aide-moi à construire la miniature de ma vidéo. » — un clic, un envoi.
- Sinon : une demande explicite de construction guidée en texte lance l'interview. « Propose-moi des idées » garde le brainstorm existant avec croquis.

## Outils

### Noms des outils client

Nouveau module `src/lib/agent/client-tools.ts` : `CLIENT_TOOL_NAMES = ["request_user_image", "request_user_sketch", "ask_user"]`. Importé par `route-handler.ts` (abandon et filtre de reprise), `should-auto-continue.ts`, `turn-model.ts`, `ChatPanel.tsx`, `PendingUiAction.tsx` et le registre F1 (`pendingClientRequest`), à la place des noms codés en dur.

### `ask_user` (outil client, pause)

Déclaré dans `V2_CLIENT_TOOLS` sans `execute`.

Entrée :
```
{
  question: string (1–200),
  step: 1–8,
  multiple: boolean (défaut false),
  max_selected?: 1–3 (si multiple),
  options: 1–6 × { id: string, label: string (≤ 60), description?: string (≤ 140), image?: string },
  allow_skip: boolean (défaut true)
}
```

Sortie envoyée par l'UI : `{ selected: string[] }`, `{ other: string }` ou `{ skipped: true }`. La reprise automatique existante relance le tour ; c'est la seule reprise et elle suit un clic. `ask_user` est seul dans son step (jamais avec `place_node` ni `finish_turn`).

À la réouverture, la sortie persistée est `{ type: "json", value: {…} }` : la ligne repliée lit les deux formes.

### `list_followed_videos` (outil serveur, `chatOnly`)

Entrée : `{ scope: "mine" | "all", sort: "date" | "score", best_type?: boolean, limit ≤ 12 }`. Implémentation : `listVideos` et `typesSummary` de `src/lib/youtube/video-queries.ts` ; « Ma chaîne » = chaîne suivie `is_mine = 1`. Sortie texte : une ligne par vidéo avec `youtube:<videoId>`, titre, type de miniature, ratio de performance. Aucun appel à l'API YouTube.

### `place_node` (outil serveur, par requête)

Construit par requête dans `route-handler.ts` : `buildPlaceNodeTool({ projectId: run.projectId, writer })`. Il n'est pas dans le registre et n'est pas exposé en MCP ; `project_id` vient de la requête, jamais du modèle.

La route enveloppe `streamText` dans `createUIMessageStream({ execute: ({ writer }) => writer.merge(result.toUIMessageStream(...)) })` ; c'est ce flux composé que la boucle F1 lit chunk par chunk. Les erreurs de l'outil deviennent `error-text` comme dans `tool-adapter.ts`.

Entrée : `{ node: { id: "iv-prompt" | "iv-persona" | "iv-ref-1..3" | "iv-logo-1..3" | "iv-generator", type, data } }`, `data` validé par le schéma blueprint du type (`generator` sans `abTest`).

Comportement :
1. Validation et existence des `image_source`.
2. Résolution asynchrone des images (helper extrait de `apply_workflow`). Pour `swipeFile`, `data` porte `imageUrl` (`/api/swipe-files/image?f=<uuid>` ou `/api/logos/image?f=<uuid>`) plutôt que du base64 ; `faceReference` garde `personaAngles`.
3. Lecture, fusion et écriture **synchrones** dans `db.transaction` :
   - `updatedAt = new Date().toISOString()` écrit dans `projects.updated_at`, `projects_meta.updated_at` et `data.placedByAgentAt` ;
   - nœud existant : `data = { ...ancien, ...nouveau, placedByAgentAt }`, position conservée, aucun autre champ supprimé ;
   - nouveau nœud : colonnes relatives au bord droit du canvas existant (`maxX + 200`) : entrées (personnage, références, logos) empilées, prompt à +420, générateur à +840, espacement vertical 240 ;
   - liens : poignée déduite du type (`faceReference` → `face-in`, `swipeFile` logo → `logo-in`, référence → `ref-in`, `prompt` → `prompt-in`). Quand `iv-generator` existe, tous les nœuds d'interview présents lui sont reliés, dédupliqués sur `(source, target, targetHandle)`.
4. Diffusion : `writer.write({ type: "data-canvas-patch", id: node.id, transient: true, data: { projectId, updatedAt, node, edges } })`. Transient : pas dans `message.parts`, pas persisté, pas renvoyé au serveur.
5. Retour au modèle : `node id: <id>` et, le cas échéant, `linked to iv-generator`.

## Canvas

### Appliquer les patchs

- `ChatPanel` applique via `useChat({ onData })`. Un patch est appliqué seulement si `projectId` est la miniature ouverte, `canvasStore.loaded` et `updatedAt > knownUpdatedAt` ; sinon il est ignoré (rejeu à la reconnexion, ou canvas déjà rechargé depuis la base).
- Action du store `applyAgentPatch(node, edges, updatedAt)` : ajout ou fusion des données, liens dédupliqués, **une entrée d'historique**, ne marque pas `dirty` et ne sauvegarde pas (la base est à jour) ; met `knownUpdatedAt = updatedAt` et ajoute `updatedAt` à `recentOwnSaveUpdatedAts`. Centrage `fitView` sur le nœud (`duration` 400, 0 si reduced motion).
- `pushHistory` est anti-rebond de 300 ms : un patch et une édition à moins de 300 ms forment un seul ⌘Z. Accepté.

### Conflit avec l'autosave

- `GET /api/project` renvoie aussi `updatedAt` ; le store garde `knownUpdatedAt` (chargement, sauvegarde réussie, patch appliqué).
- La sauvegarde envoie `baseUpdatedAt = knownUpdatedAt` lu au moment de construire le payload. Sans `baseUpdatedAt`, la route ne réinjecte rien (anciens appelants).
- La route réinjecte dans la même transaction tout nœud de la base dont `placedByAgentAt > baseUpdatedAt` (dates ISO) et absent du payload, avec ses liens dont les deux extrémités existent.
- Réponse : `{ updatedAt, reinjected, reinjectedEdges }`. Le client les fusionne sans entrée d'historique.
- Conséquence : une suppression ou un ⌘Z faits après réception du patch partent d'une base ≥ `placedByAgentAt` ; la base respecte la suppression. Un nœud posé pendant qu'Antoine était ailleurs ne peut pas être effacé par une sauvegarde partie d'un état antérieur.
- `useCanvasSync` : un `updated_at` connu (sauvegarde propre ou patch appliqué) ne recharge jamais ; un `updated_at` inconnu recharge comme aujourd'hui, et les patchs rediffusés ensuite sont ignorés par la règle `updatedAt > knownUpdatedAt`.

## Action « Générer »

- `finish_turn.next_actions` accepte `{ kind: "generate", node_id }`, sans libellé.
- `TurnActions` calcule le libellé au rendu : `generationSummary(planGeneration(...))` du nœud (coût à jour même si Antoine a changé le générateur). Désactivé avec l'infobulle « Élément introuvable » si le nœud n'existe pas, et pendant `data.isGenerating`.
- Clic : `selectOnly` + `fitView`, puis événement `thumbgen:generate-node` `{ nodeId }` émis **uniquement dans `onClick`**. `GeneratorNode` l'écoute et appelle `run([])` de `useGeneratorRun`, avec tous ses garde-fous. Jamais auto-cliqué, jamais rejoué.

## Écran : la carte de question

`PendingUiAction` gagne un rendu `ask_user` :
- En-tête : la question, « Question n/8 » en petit.
- Options avec image : grille de 2–3 colonnes (vignette 16:9, carrée pour personnage et logo ; libellé ; description sur une ligne). Simple : clic = choix. Multiple : cases à cocher, limite `max_selected`, bouton « Valider ».
- Options sans image : boutons `variant="outline"`, description en dessous.
- Pied : champ « Autre… » + « Envoyer » (actif si non vide) ; « Passer » si `allow_skip`.
- Le composer reste visible (voir Décisions).
- Après réponse, dans le détail des étapes : ligne repliée « <question> : <libellé choisi> », « Autre : … » ou « Passé ».
- Conversation rouverte : une question sans sortie réapparaît et peut être répondue.

### Images des options

`option.image` accepte les références des outils de liste : `stored:persona_<id>` → `/api/personas/image?id=<id>&angle=front` ; `stored:sf_<uuid>` → `/api/swipe-files/image?f=<uuid>` ; `stored:lg_<uuid>` → `/api/logos/image?f=<uuid>` ; `youtube:<videoId>` → `https://i.ytimg.com/vi/<videoId>/mqdefault.jpg`. Toute autre valeur : option sans image. Image en échec : placeholder. Aucune nouvelle route.

### Réutilisation

La logique de `api/channels/videos/[videoId]/use/route.ts` (dédoublonnage via `swipe_file_id` et copies en cours) est extraite dans `src/lib/youtube/use-thumbnail.ts`, utilisée par la route et par `import_youtube_thumbnail`. Pas de nouvel outil.

## Prompt système

Nouvelle section statique « GUIDED INTERVIEW » dans `AGENT_SYSTEM_PROMPT` :
- les 8 questions et le récap, dans l'ordre, ids `iv-*` ;
- `ask_user` seul dans son step ; `place_node` juste après chaque réponse qui produit un nœud ;
- pas de `finish_turn` avant le récap, sauf si Antoine arrête ;
- pendant l'interview : jamais `generate_sketch` ni `apply_workflow` ;
- message d'Antoine pendant une question (question abandonnée) : reprendre à l'étape demandée ou arrêter ;
- table des prix générée depuis `MODEL_COSTS` (bloc statique) ;
- l'interview démarre sur le bouton ou une demande explicite de construction guidée ; « propose-moi des idées » garde le flux existant.

La section A/B et les blocs par tour ne changent pas.

## Erreurs

- `place_node` en erreur (image introuvable, schéma invalide) : `error-text`, l'agent s'excuse en une phrase et repose la question de l'étape ; nœud non posé.
- Antoine quitte la page pendant une question : tour en pause (F1), attention « question » et toast.
- Antoine quitte la page pendant la pose : le tour continue (F1), nœuds en base ; au retour le canvas charge depuis la base et les patchs rejoués sont ignorés.
- Antoine supprime un nœud d'interview : respecté ; si l'agent le met à jour ensuite, `place_node` le recrée à sa position de colonne.

## Coût

- Chaque reprise est une requête complète (historique, prompt système, recherche web si activée). Le coût réel d'une interview est mesuré lors de la vérification live via `UsageSummary`.
- Aucun appel payant sans action d'Antoine en dehors de la reprise qui suit chaque réponse ; ni croquis ni génération pendant l'interview sans clic.

## Tests

- Schémas `ask_user` (limites, `max_selected`) et entrée `place_node`.
- `place_node` : fusion en base (ajout, mise à jour qui conserve position et champs, liens déduits et dédupliqués, liens créés à l'arrivée du générateur), chunk transient émis, erreurs, pas exposé en MCP.
- `list_followed_videos` : scope, tri, meilleur type, aucun appel réseau.
- Route de sauvegarde : réinjection des nœuds agent postérieurs à `baseUpdatedAt` et réponse `reinjected` ; aucune réinjection sans `baseUpdatedAt` ; « ⌘Z puis sauvegarde : le nœud reste absent en base ».
- Store : `applyAgentPatch` (une entrée d'historique, pas de dirty, `knownUpdatedAt`), patch rejoué avec `updatedAt ≤ knownUpdatedAt` ignoré, fusion de `reinjected`.
- Route chat : reprise après `ask_user` sans 400 ; message envoyé pendant une question → `abandoned`.
- Rendu `PendingUiAction` ask_user : grille, liste, multiple + limite + Valider, Autre, Passer, « Question n/8 » ; ligne repliée live et rouverte.
- turn-model : `ask_user` en requête en attente, action `generate` acceptée.
- TurnActions : `generate` désactivé si nœud absent ou génération en cours ; événement émis seulement au clic ; libellé calculé.
- Prompt : section GUIDED INTERVIEW présente, tests existants verts.
- Navigateur (modèle simulé côté serveur de F1, scénario « interview » scripté, sans modèle réel) : carte image → réponse → nœud posé en direct ; navigation vers la Bibliothèque pendant une question → toast ; retour → question toujours là ; fin → « Générer » avec libellé calculé ; aucune génération ni appel modèle réel.

## Vérification live

Payante : seulement avec l'accord explicite d'Antoine — interview réelle courte en passant les questions 4 et 5, sans cliquer « Générer », coût relevé dans `UsageSummary`.

Historique : corrigée après revue du code le 2026-09-17.
