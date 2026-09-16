# Canvas — ajout d'étapes et Personnages partout (chantier A)

Date : 2026-09-16
Statut : approuvé en brainstorming
Repo : `/Users/antoinevigneau/thumbgen-real`
Ordre d'exécution : après le chantier Réglages (`2026-09-16-reglages-page-design.md`), avant le chantier B (`2026-09-16-generateur-ab-design.md`).

## Problème

- Ajouter un nœud passe par un menu contextuel maison peu lisible (`src/components/panels/ContextMenu.tsx`, sections « Entrées » : Prompt, Croquis, Visage de référence, Image / logo ; puis Générateur, Texte overlay). Un second menu presque identique s'ouvre quand on lâche un fil dans le vide (`edgeDropMenu` dans `src/components/Canvas.tsx`).
- Canvas vide : aucune invitation à commencer.
- « Visage de référence » est ambigu : le nœud `faceReference` accepte soit une photo seule, soit un Personnage multi-angles. L'utilisateur ne veut plus que des Personnages ; une photo de visage est une image comme une autre.
- Le menu « fil lâché dans le vide » relie parfois à la mauvaise entrée : un Logo ou un Croquis tiré vers un Générateur arrive sur `ref-in` au lieu de `logo-in` / `sketch-in` (logique codée en dur dans `addConnectedNode`).

Référence d'interaction fournie par l'utilisateur : n8n (état vide « Add first step… », clic droit sobre avec raccourcis affichés, panneau latéral droit avec recherche et liste icône / titre / description).

## Carte des poignées existantes

| Nœud (`type`) | Entrées (target) | Sorties (source) |
|---|---|---|
| `prompt` | — | `prompt` |
| `faceReference` | — | `face` |
| `swipeFile` (`data.kind` = `reference` ou `logo`) | — | `image` |
| `sketch` | — | `image` |
| `generator` | `prompt-in`, `face-in`, `ref-in`, `logo-in`, `sketch-in` | `result` |
| `preview` | `preview-in` | `preview-out` |
| `textOverlay` | `image-in` | `result` |

## Design

### 1. Catalogue de nœuds en données

Nouveau module `src/lib/canvas/node-catalog.ts`, source unique de ce que l'UI peut ajouter :

```ts
type CatalogEntry = {
  id: string;                  // ex. "logo"
  category: "entrees" | "generation" | "finition";
  title: string;               // ex. "Logo"
  description: string;         // une ligne
  keywords: string[];          // recherche : synonymes FR/EN
  icon: LucideIcon;
  nodeType: AppNodeType;       // ex. "swipeFile"
  initialData?: Record<string, unknown>; // ex. { kind: "logo" }
  inputs: { handle: string; accepts: string[] }[];   // ids d'entrées catalogue acceptés
  output?: { handle: string };
};
```

Entrées v1 (ordre d'affichage) :

| Catégorie | id | Titre | Description | nodeType / initialData | Poignées |
|---|---|---|---|---|---|
| Entrées | `prompt` | Prompt | Décris la miniature en texte. | `prompt` | out `prompt` |
| Entrées | `personnage` | Personnage | Ton visage sous plusieurs angles, depuis ta bibliothèque. | `faceReference` | out `face` |
| Entrées | `reference` | Image de référence | Une image d'inspiration pour le style ou la composition. | `swipeFile` `{ kind: "reference" }` | out `image` |
| Entrées | `logo` | Logo | Un logo à intégrer dans la miniature. | `swipeFile` `{ kind: "logo" }` | out `image` |
| Entrées | `croquis` | Croquis | Dessine la composition à la main. | `sketch` | out `image` |
| Génération | `generateur` | Générateur | Génère la miniature à partir des entrées branchées. | `generator` (modèle = réglage `favoriteModel`, et les autres défauts de génération du chantier Réglages) | in `prompt-in`←prompt, `face-in`←personnage, `ref-in`←reference/aperçu/texte, `logo-in`←logo, `sketch-in`←croquis ; out `result` |
| Finition | `texte` | Texte overlay | Ajoute un texte par-dessus une image générée. | `textOverlay` | in `image-in`←generateur/aperçu ; out `result` |
| Finition | `apercu` | Aperçu | Affiche et sélectionne un résultat. | `preview` | in `preview-in`←generateur/texte ; out `preview-out` |

Fonctions pures exportées et testées :
- `searchCatalog(query)` : filtre insensible à la casse et aux accents sur titre, description, mots-clés ; conserve l'ordre du catalogue.
- `compatibleEntries(from: { nodeType, handleId, handleType })` : entrées pouvant être reliées à la poignée d'où part le fil, avec pour chacune la poignée à utiliser sur le nouveau nœud. Remplace la logique codée en dur de `addConnectedNode`.

La taxonomie longue (section « Feuille de route ») n'est pas dans le catalogue v1.

### 2. Panneau « Ajouter une étape »

Nouveau composant `src/components/panels/NodePicker.tsx`, `Sheet` shadcn côté droit (au-dessus du chat, `z` supérieur), largeur ~380 px.

- En-tête : titre « Ajouter une étape », sous-titre contextuel (« Choisis ce qui démarre ta miniature » quand le canvas est vide, sinon « Choisis l'élément à ajouter » ; en mode fil : « Compatible avec <nom de la poignée> »).
- Champ de recherche (`InputGroup` + icône loupe), focus automatique.
- Liste groupée par catégorie (titre de catégorie discret), chaque ligne : icône dans une pastille, titre, description sur une ligne, flèche au survol. Mise en évidence de la ligne active (barre colorée à gauche comme n8n).
- Clavier : ↑/↓ déplace la ligne active (à travers les catégories), Entrée ajoute, Échap ferme.
- Aucun résultat : état `Empty` « Aucune étape ne correspond ».
- Ajout :
  - ouvert depuis le clic droit : nœud posé à la position du clic ;
  - ouvert depuis l'état vide, le raccourci `N` ou le menu : nœud posé au centre de la vue visible ;
  - ouvert depuis un fil lâché dans le vide : liste restreinte à `compatibleEntries`, nœud posé à la position du lâcher et relié via `addNodeAndConnect` avec la poignée calculée.
  - Le panneau se ferme après l'ajout.
- Un seul état d'ouverture dans le store du canvas (`nodePicker: null | { mode: "free", flowPos? } | { mode: "connect", flowPos, from }`), qui remplace `contextMenu` pour l'ajout et `edgeDropMenu`.

### 3. État vide du canvas

Quand le projet chargé n'a aucun nœud : au centre de la vue (overlay non bloquant pour le pan/zoom), un bouton carré en pointillés avec `Plus` et le libellé « Ajouter une première étape » dessous. Clic → panneau en mode libre. Disparaît dès qu'un nœud existe.

### 4. Menus contextuels

`src/components/panels/ContextMenu.tsx` est réécrit sur `DropdownMenu` (même positionnement ancré au point de clic que la version actuelle) avec `DropdownMenuShortcut` pour les raccourcis.

Clic droit sur le fond :

| Item | Raccourci | Action | Désactivé si |
|---|---|---|---|
| Ajouter une étape | `N` | ouvre le panneau (mode libre, position du clic) | — |
| Ranger le workflow | `⇧⌥T` | même action que le bouton de la ZoomBar (dagre) | aucun nœud |
| — séparateur — | | | |
| Tout sélectionner | `⌘A` | sélectionne tous les nœuds | aucun nœud |
| Tout désélectionner | `Échap` | vide la sélection | rien de sélectionné |

Clic droit sur un nœud (`onNodeContextMenu`, nouveau) :

| Item | Raccourci | Action |
|---|---|---|
| Dupliquer | `⌘D` | copie du nœud (nouvel id, décalage +40/+40, sans les arêtes, `data` cloné en profondeur sans `isGenerating`) — nouvelle action `duplicateNode` du store, historisée |
| — séparateur — | | |
| Supprimer | `⌫` | `removeNode` |

La logique de rangement est extraite de `ZoomBar.tsx` dans un hook partagé (`useAutoLayout`) utilisé par la ZoomBar et le menu.

### 5. Raccourcis clavier

Un hook `useCanvasShortcuts` monté dans `Canvas.tsx` (ignorer si la cible est un `input`, `textarea`, `select` ou `contenteditable`, ou si un dialogue / le panneau est ouvert pour les raccourcis autres qu'Échap) :

- `N` → panneau mode libre (centre de la vue)
- `⇧⌥T` → ranger
- `⌘A` / `Ctrl+A` → tout sélectionner (`preventDefault`)
- `⌘D` / `Ctrl+D` → dupliquer les nœuds sélectionnés (`preventDefault`)
- `Échap` → ferme le panneau s'il est ouvert, sinon désélectionne
- Les raccourcis existants (`⌘Z`, `⇧⌘Z`, suppression) restent inchangés.

### 6. Personnages partout

**Nœud Personnage** (`src/components/nodes/FaceReferenceNode.tsx`, type `faceReference` conservé pour ne pas casser les données) :
- Plus d'upload de photo seule ni de détourage de photo seule.
- Vide : `Select` des personnages (`GET /api/personas`) + lien « Créer un personnage » qui ouvre la bibliothèque sur l'onglet Personnages.
- Rempli : les angles du personnage (comportement actuel) + possibilité de changer de personnage.
- Titre par défaut « Personnage ».

**Conversion des anciens nœuds** : au chargement d'un projet (`loadProject` du store), tout nœud `faceReference` sans personnage mais avec une image (`imageBase64` ou `imageUrl`) devient un `swipeFile` `{ kind: "reference" }` gardant image et libellé ; ses arêtes `face` → `face-in` deviennent `image` → `ref-in`. La conversion est sauvegardée par l'autosave normal.

**Bibliothèque** (`AppSidebar.tsx`, onglet Personnages) :
- La grille n'affiche plus que les Personnages (plus les entrées `face_reactions` « 1 photo »).
- « Nouveau visage » devient « Nouveau personnage » et ne propose que la capture webcam multi-angles et l'import de photos par angle (face / gauche / droite) ; plus d'import de photo seule.

**Agent** :
- Outil `list_face_reactions` retiré (`src/lib/agent/tools/list-face-reactions.ts`, son enregistrement dans l'index des outils, son libellé dans `tool-labels.ts`).
- `src/lib/agent/system-prompt.ts` : l'arbre de décision visage ne parle plus que des Personnages ; sans personnage, l'agent propose d'en créer un au lieu d'utiliser une photo seule.
- `src/lib/agent/blueprint/schema.ts` : `faceReference.image_source` n'accepte plus que `stored:persona_<id>`.
- `src/lib/agent/tools/_helpers/image-source.ts` et `get-canvas-state.ts` : chemins `stored:fr_` retirés là où ils servaient aux visages.

**Code et données `face_reactions`** : routes API (`src/app/api/face-reactions/**`, y compris l'auto-tagging et `analyze-untagged`), types et helpers deviennent orphelins → supprimés, après vérification qu'aucun appelant ne subsiste. La table SQLite est laissée en place (vide, sans risque) ; pas de migration destructive.

## Tests

Vitest :
- `node-catalog` : `searchCatalog` (accents, casse, mots-clés, ordre) ; `compatibleEntries` pour chaque poignée du tableau (Logo tiré depuis `logo-in` → `logo`, Croquis → `sketch-in`, fil depuis `result` → Aperçu / Texte / Générateur via `ref-in`, etc.).
- Store : `duplicateNode` (nouvel id, décalage, pas d'arêtes, historique) ; conversion des anciens `faceReference` photo seule et de leurs arêtes au chargement.
- Blueprint : `faceReference` refuse `stored:fr_…`, accepte `stored:persona_…`.
- Outils agent : `list_face_reactions` absent de la liste enregistrée.

Vérification manuelle dans le navigateur : état vide → panneau → ajout au centre ; clic droit fond et nœud, chaque item et raccourci ; recherche et navigation clavier ; fil lâché dans le vide → liste filtrée → nœud relié sur la bonne entrée (en particulier Logo et Croquis) ; nœud Personnage (choix, changement) ; bibliothèque sans photo seule ; conversation agent qui construit un workflow avec un Personnage.

## Feuille de route (hors v1, ne pas afficher)

Taxonomie discutée, à ajouter plus tard comme nouvelles entrées du catalogue :
- Entrées : Miniature YouTube (URL → référence, outil agent `import_youtube_thumbnail` existant), Palette de couleurs.
- IA & idéation : Script YouTube → idées (`extract_youtube_script` existant), Améliorer le prompt (bouton existant), Angles créatifs, Analyse de miniature.
- Génération : Détourage (existant en bouton), Retouche par zone, Agrandissement.
- Finition : Éléments YouTube (flèche, cercle, emoji, badge), Étalonnage, Formats (16:9, 9:16, 1:1).
- Évaluation & export : Aperçu fil YouTube mobile, Export YouTube (PNG 1280×720 < 2 Mo), Score de miniature, Comparaison A/B, Publier sur YouTube (après la connexion YouTube).
- Organisation : Note, Groupe.
- Modèles pré-câblés : Miniature avec personnage, Test A/B, Réaction + logo.
- Éléments de bibliothèque dans la recherche du panneau.

## Hors périmètre

- Générateur et mode A/B (chantier B).
- Refonte visuelle des autres nœuds.
- Suppression de la table `face_reactions`.
