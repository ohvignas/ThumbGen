# Interview guidée (chantier F2) — design

Date : 2026-09-17. Statut : sections 1 et 2 validées en brainstorming avec Antoine. La révision « nœuds posés par le serveur » a été approuvée avec le découpage F1/F2. La section 3 (erreurs, tests) a été rédigée par Claude sur l'instruction « enchaîne sans moi » : ce sont des rulings à relire. **Prérequis : F1** (`docs/superpowers/specs/2026-09-17-agent-arriere-plan-design.md`) est fusionné.

## Objectif

L'agent construit le workflow d'une miniature avec Antoine au fil d'une **interview guidée fixe** :
- une question à choix à la fois ;
- chaque réponse pose ou complète **son nœud sur le canvas, en direct**.

L'interview se termine par un récap, avec le coût estimé et un bouton « Générer ». Aucune génération ne part sans ce clic.

## Décisions validées

- **Déroulé :** interview guidée fixe, une question à la fois.
- **Étapes :**
  - vidéo et angle ;
  - personnage ;
  - références et logos ;
  - texte, style et modèle.
- **Fin :** récap avec le coût estimé et une action « Générer » à cliquer.
- **Réponses possibles :**
  - choix avec vignettes quand c'est visuel ;
  - « Autre » en texte libre, toujours proposé ;
  - « Passer ».
  - Revenir en arrière n'est pas un contrôle dédié : il suffit de le demander dans le chat.
- **Approche :** l'agent pilote l'interview. Les nœuds sont posés par un **outil serveur** et diffusés en direct au canvas ouvert, pour que l'interview continue même si Antoine quitte la page (F1).

## Parcours

1. **Vidéo** — « De quoi parle la vidéo ? »
   - Choix : les 5 dernières vidéos longues de « Ma chaîne », avec leurs vignettes, via les données des chaînes suivies.
   - « Autre » accepte un lien YouTube ou une description.
   - L'agent peut lire le titre ou le script avec les outils existants (`extract_youtube_script`, `get_channel_videos`).
2. **Angle** — l'agent propose 3 angles, en texte (titre + une phrase). Après le choix, `place_node` pose le nœud **Prompt** (id `prompt`) avec un premier jet.
3. **Personnage** — vignettes des personnages (`list_personas`), plus « Aucun » (= Passer). Pose **faceReference** (id `persona`).
4. **Références** — choix multiple, vignettes :
   - les miniatures les mieux notées des chaînes suivies, filtrées sur le type de miniature le plus performant (`types-summary`) ;
   - les images de la bibliothèque (`list_swipe_files`).
   - Pose un nœud **swipeFile** `kind: "reference"` par choix (ids `ref-1`…`ref-3`, au plus 3).
5. **Logos** — choix multiple, vignettes (`list_logos`). « Autre » = un nom de marque, que l'agent traduit en recherche de logo. Pose **swipeFile** `kind: "logo"` (ids `logo-1`…`logo-3`).
6. **Texte et style** :
   - une question « Texte sur la miniature » avec 3 propositions, « Autre » et « Passer » (pas de texte) ;
   - puis une question « Ambiance » avec 3 à 4 propositions.
   - Met à jour **Prompt**.
7. **Modèle** — options texte, avec le coût estimé par option (tarifs existants de la page Usage) :
   - modèle (nano-banana / openai / seedream) ;
   - format (16x9 par défaut) ;
   - A/B test (aucun / A-B / A-B-C).
   - Pose **generator** (id `generator`) et tous les liens vers ses poignées (`face-in`, `ref-in`, `logo-in`, `prompt-in`).
8. **Récap** — `finish_turn` :
   - `summary` : ce qui a été construit et le coût estimé ;
   - `next_actions` : `{ kind: "generate", label: "Générer (~X $)", node_id: "generator" }`, plus éventuellement `focus_node`.

## Lancement

- **Miniature vide + conversation vide :** l'état vide du chat propose un bouton « Construire avec l'agent ». Il envoie le message « Aide-moi à construire la miniature de ma vidéo. » et démarre l'interview. C'est un clic, donc un seul envoi payant.
- **Sinon :** l'interview démarre quand Antoine le demande en texte, par exemple « aide-moi à faire la miniature… ». Le prompt système décrit le parcours et quand l'utiliser.

## Outils

### `ask_user` (outil client, pause)

Déclaré comme `request_user_image` dans `V2_CLIENT_TOOLS` : pas d'`execute`, le tour se met en pause jusqu'à `addToolOutput`.

**Entrée :**

```
{
  question: string (1–200),
  step: { index: 1–8, total: 8 },
  multiple: boolean (défaut false),
  options: 2–6 × {
    id: string,
    label: string (≤ 60),
    description?: string (≤ 140),
    image?: string   // référence, voir « Images des options »
    badge?: string   // ex. « ×21,4 »
  },
  allow_skip: boolean (défaut true)
}
```

**Sortie** (renvoyée par l'UI) : `{ selected: string[] }`, ou `{ other: string }`, ou `{ skipped: true }`.

Quand la sortie arrive, la reprise automatique existante (`sendAutomaticallyWhen` / `should-auto-continue`) relance le tour. C'est la seule reprise, et elle suit toujours un clic.

### `place_node` (outil serveur)

**Entrée :**

```
{
  project_id: string,
  node: { id: string, type: "faceReference" | "swipeFile" | "prompt" | "generator", data: <même schéma par type que BlueprintSchema> },
  connect_to_generator?: string   // poignée : face-in | ref-in | logo-in | prompt-in (et variantes -b/-c)
}
```

**Comportement :**
- **Validation :** schéma du blueprint pour ce type, et existence de `image_source`.
- **Résolution :** même mapping que `apply_workflow` (`blueprintToCanvasData`, à extraire dans un helper partagé).
- **Écriture en base** dans une transaction, en fusion :
  - le nœud du même id est remplacé (données seules : sa `position` actuelle est **conservée**), sinon il est ajouté ;
  - le nœud porte `data.placedByAgentAt` = horodatage ISO ;
  - si `connect_to_generator` est fourni et que le generator existe, un lien est ajouté (sans doublon) ;
  - si le generator est posé après les autres nœuds, les liens des nœuds déjà présents qui déclarent une poignée sont créés à ce moment.
- **Position d'un nouveau nœud :** disposition fixe par colonnes :
  - x = 0 pour Personnage, Références et Logos (empilés), 420 pour Prompt, 840 pour Generator ;
  - y selon l'ordre d'arrivée dans la colonne, espacement 240 ;
  - avec un décalage si l'emplacement est occupé.
- **Diffusion en direct :** un chunk de données UI-message `data-canvas-patch` `{ projectId, node, edges }` est écrit dans le flux du tour (registre F1). Il est donc aussi rediffusé à une reconnexion.
- **Retour au modèle :** `node id: <id>` (+ `generator linked` le cas échéant). Erreurs en `isError` → `error-text` (chantier E).

### Canvas : appliquer les patchs

- `ChatPanel` écoute les parts `data-canvas-patch` des messages live.
- Si `projectId` est la miniature ouverte, il applique le patch via une nouvelle action `applyAgentPatch(node, edges)` du store :
  - ajout ou mise à jour des données d'un nœud existant, **idempotent** ;
  - les liens sont ajoutés s'ils n'existent pas ;
  - une étape d'historique, donc ⌘Z possible ;
  - centrage animé : `fitView` sur le nœud, `duration` 400, `motion-reduce` = sans animation ;
  - le nœud apparaît en fondu.
- **Conflit avec l'autosave** : la sauvegarde envoie maintenant `baseUpdatedAt`, l'`updated_at` connu du client au dernier chargement ou à la dernière sauvegarde. La route de sauvegarde **réinjecte** tout nœud de la base :
  - dont `data.placedByAgentAt` est postérieur à `baseUpdatedAt` ;
  - et absent du payload ;
  - avec ses liens.
  - Conséquence : un nœud posé par l'agent ne peut pas être effacé par une sauvegarde partie d'un état antérieur.
  - Une suppression volontaire par Antoine vient d'un état qui contenait déjà le nœud (base plus récente), donc elle est respectée.
- `useCanvasSync` ne traite pas une écriture de `place_node` comme un rechargement complet pendant un tour actif sur ce projet, car les patchs suffisent. S'il n'y a pas de tour actif (Antoine revient plus tard), le rechargement existant s'applique.

### Action « Générer »

- `finish_turn.next_actions` accepte un nouveau `kind: "generate"` avec `node_id` (label ≤ 40).
- Dans `TurnActions` :
  - le bouton est désactivé avec l'infobulle « Élément introuvable » si le nœud n'existe pas ;
  - au clic : `selectOnly` + `fitView`, puis un événement `thumbgen:generate-node` `{ nodeId }` que `GeneratorNode` écoute. `GeneratorNode` exécute exactement son action « Générer » normale, sans raccourci qui éviterait ses propres contrôles (clé manquante, etc.).
  - Ce bouton n'est jamais auto-cliqué.

## Écran : la carte de question

`PendingUiAction` gagne un rendu `ask_user` :
- **En-tête :** la question, et « Étape n/8 » en petit.
- **Options avec image :** grille de 2 à 3 colonnes de cartes (vignette 16:9 ou carré pour personnage et logo, libellé, description sur une ligne, badge). Clic = choix (simple) ou case à cocher (multiple) + « Valider ».
- **Options sans image :** liste de boutons `variant="outline"`, description en dessous.
- **Pied :**
  - champ « Autre… » + « Envoyer » (actif si non vide) ;
  - « Passer » si `allow_skip`.
- Le composer est masqué tant que la question est ouverte (comme `request_user_image`).
- **Après réponse :** dans le détail des étapes, le tool part s'affiche replié « <question> : <réponse> » avec le libellé du choix, « Autre : … » ou « Passé ».
- **Conversation rouverte :** une question sans sortie réapparaît et peut être répondue ; les répondues restent repliées.

### Images des options

`option.image` est une référence :
- `persona:<id>` → `/api/personas/<id>/photo?angle=front` (route existante ou à ajouter si absente) ;
- `library:sf_<id>` → route image des swipe files ;
- `logo:lg_<id>` → route image des logos ;
- `youtube:<videoId>` → `https://i.ytimg.com/vi/<videoId>/mqdefault.jpg` (miniatures publiques, autorisées par la page Bibliothèque).

Toute autre valeur → option sans image. Une image qui ne charge pas → placeholder.

Pour poser une miniature YouTube choisie, l'agent appelle d'abord le même chemin que « Utiliser comme référence » : un nouvel outil serveur `use_followed_thumbnail(video_id)` qui réutilise la route `use` des chaînes suivies et renvoie `stored:sf_<id>`. Il utilise ensuite `place_node`.

## Prompt système

Nouvelle section statique « GUIDED INTERVIEW » dans `AGENT_SYSTEM_PROMPT` :
- les 8 étapes, dans l'ordre ;
- une seule question `ask_user` par étape, jamais deux dans le même step ;
- `place_node` immédiatement après chaque réponse qui produit un nœud ;
- ne jamais appeler `finish_turn` pendant l'interview avant l'étape 8, sauf abandon demandé ;
- étapes 4 et 5 : `multiple: true` ;
- « Passer » = pas de nœud ;
- l'étape 8 inclut l'action `generate` ;
- hors interview (demande libre), le comportement actuel est inchangé.

La section A/B et les blocs par tour restent inchangés. `apply_workflow` reste disponible pour les demandes « fais-moi tout d'un coup ».

## Erreurs (rulings)

- **`place_node` en erreur** (image introuvable, schéma invalide) : l'agent reçoit l'`error-text`, s'excuse en une phrase et repose la question de l'étape. Le nœud n'est pas posé.
- **Question ouverte et Antoine qui écrit dans le chat au lieu de répondre :** impossible, car le composer est masqué. « Arrêter » reste disponible : il abandonne l'interview et le tour est interrompu.
- **Antoine quitte la page pendant une question :** le tour est en pause (F1), un point d'attention apparaît et une notification « L'agent te pose une question » s'affiche.
- **Antoine quitte la page pendant la pose de nœuds :** le tour continue (F1) et les nœuds sont écrits en base. Au retour, le canvas les charge, et les patchs rediffusés sont idempotents.
- **Antoine supprime un nœud posé par l'agent pendant l'interview :** respecté. Si l'agent le met à jour ensuite, `place_node` le recrée à sa position de colonne.
- **Aucune vidéo sur « Ma chaîne », aucun personnage, aucun logo :** l'étape affiche seulement « Autre » et « Passer », avec une option texte « Aucun ».

## Coût

- Une interview ≈ 8 à 12 étapes de modèle (questions + poses), soit quelques centimes avec le modèle de chat actuel.
- Aucun appel payant sans action d'Antoine, en dehors de la reprise qui suit chaque réponse.
- La génération d'images reste un clic explicite sur « Générer ».

## Tests

- **Schémas :** `ask_user` (limites) et `place_node`.
- **`place_node` :**
  - fusion en base : ajout, mise à jour qui conserve la position, liens sans doublon, liens créés à l'arrivée du generator ;
  - chunk `data-canvas-patch` émis ;
  - erreurs.
- **Route de sauvegarde :** réinjection des nœuds agent postérieurs à `baseUpdatedAt`, et suppression respectée sinon.
- **Store :** `applyAgentPatch` idempotent, une entrée d'historique, ⌘Z retire le nœud.
- **Rendu `PendingUiAction` ask_user :** grille d'images, liste texte, multiple + Valider, Autre, Passer, étape n/8. Et la ligne repliée dans `TurnSteps`.
- **turn-model :** `ask_user` en pause (compté comme requête en attente, pas comme étape), l'action `generate` passe.
- **TurnActions :** `generate` désactivé si le nœud est absent, et l'événement est émis au clic (test du handler).
- **Prompt :** la section GUIDED INTERVIEW est présente, les tests existants restent verts.
- **Navigateur** (fixtures étendues : scénario « interview » scripté, sans modèle) :
  - carte image puis réponse → nœud posé en direct ;
  - navigation vers la Bibliothèque pendant une question → notification ;
  - retour → question toujours là ;
  - fin → « Générer » visible ;
  - aucune génération ni aucun appel modèle réel.

## Vérification live

Payante, à faire seulement avec l'accord explicite d'Antoine : une interview réelle courte, en passant les étapes 4 et 5, sans cliquer « Générer ».
