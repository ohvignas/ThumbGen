# Générateur clarifié et Test A/B/C (chantier B)

Date : 2026-09-16
Statut : approuvé en brainstorming
Repo : `/Users/antoinevigneau/thumbgen-real`
Ordre d'exécution : après le chantier Réglages puis le chantier A (`2026-09-16-canvas-ajout-etapes-design.md`), dont il réutilise le panneau d'ajout, le catalogue et le nœud Personnage.

## Problème

`src/components/nodes/GeneratorNode.tsx` (~680 lignes) est bruyant et ne permet pas un vrai test A/B :

- Cinq boutons-entrées empilés contre le bord gauche (Prompt, Personnage, Référence, Logo, Croquis) dont les poignées ne sont pas alignées avec un contenu lisible.
- Réglages Ideogram morts toujours présents dans le code depuis la migration OpenRouter : `ideogramMode` (générer / remix / edit), `renderingSpeed`, `styleType`, `imageWeight`, `maskDataUrl`.
- Modèle + étoile favori, format, résolution, « Images par modèle », « Comparer avec » en cases à cocher, bouton « → Générer N images (M modèles × n) ».
- Une seule sortie `result`. Le seul comparatif possible est « mêmes entrées, modèles différents ». Tester deux miniatures qui diffèrent par leurs entrées (autre prompt, autre croquis) exige deux chaînes séparées.

YouTube Studio (« Tester et comparer ») accepte jusqu'à 3 miniatures par vidéo.

## Design

### 1. Nettoyage

- Suppression dans `GeneratorNode.tsx` de tout ce qui concerne `ideogramMode`, `renderingSpeed`, `styleType`, `imageWeight`, `maskDataUrl` (état, dépendances de `useCallback`, champs envoyés, UI).
- Suppression des mêmes champs du type de données du nœud dans `src/store/canvas-store.ts` s'ils y sont déclarés.

### 2. Nouvelle structure du nœud

Le nœud est reconstruit avec les composants shadcn (`Select`, `ToggleGroup`, `Switch`, `Collapsible`, `Button`, `Badge`, `Tooltip`) à l'intérieur de la coque de nœud existante (bordure, en-tête, renommage). Largeur fixe ~340 px.

De haut en bas :

1. **En-tête** : titre du nœud (renommable, comportement actuel) + `Badge` du modèle courant.
2. **Entrées**, en lignes compactes. Chaque ligne porte sa poignée d'entrée alignée verticalement sur la ligne (poignée placée dans la ligne, pas dans une pile en haut du nœud) :
   - icône + libellé de l'entrée ;
   - branchée : aperçu (vignette pour Personnage / Image / Logo / Croquis, extrait d'une ligne pour Prompt) ;
   - non branchée : bouton discret « + Ajouter » qui ouvre le panneau d'ajout du chantier A en mode connexion vers cette poignée (liste filtrée, nœud créé et relié) ;
   - héritée (mode A/B, voir §3) : `Badge` « hérité de A » et aperçu atténué de l'entrée de A.
3. **Réglages** :
   - Modèle : `Select` groupé (Gemini / OpenAI / ByteDance) + étoile favori (écrit `favoriteModel`, comportement actuel).
   - Format : `ToggleGroup` 16:9 / 9:16 / 1:1.
   - Résolution : `ToggleGroup` 1K / 2K / 4K (valeur envoyée à la génération — branchée par le chantier Réglages).
   - Images : `ToggleGroup` 1 / 2 / 3 / 4 (« par variante » en mode A/B).
   - Test A/B : `Switch` (voir §3).
   - « Avancé » (`Collapsible`, replié par défaut) : Comparer des modèles (cases à cocher existantes, restylées). Désactivé avec explication en mode A/B.
4. **Bouton principal** « Générer » pleine largeur avec résumé calculé : « 1 image », « 3 images », « 2 modèles × 2 images », « 2 variantes × 2 images · 4 images ». Pendant la génération : état chargement + « Arrêter » si l'annulation existe déjà, sinon bouton désactivé.
5. **Erreur** : `Alert` compacte existante (inchangée).

### 3. Mode Test A/B/C

Données du nœud : `abTest?: { variants: ("A" | "B" | "C")[] }`. Absent ou `variants.length < 2` = mode normal. Activer l'interrupteur crée `["A", "B"]`.

**Entrées communes** (une seule poignée, utilisée par toutes les variantes) : Personnage `face-in`, Logo `logo-in`.

**Entrées par variante** :

| Entrée | Variante A | Variante B | Variante C |
|---|---|---|---|
| Prompt | `prompt-in` | `prompt-in-b` | `prompt-in-c` |
| Croquis | `sketch-in` | `sketch-in-b` | `sketch-in-c` |
| Image de référence | `ref-in` | `ref-in-b` | `ref-in-c` |

Les identifiants de A sont ceux d'aujourd'hui : un générateur existant est un générateur « A seule », sans migration.

**Héritage** : pour B et C, une entrée par variante non branchée reprend l'entrée branchée sur A (même poignée côté A). Indiqué dans la ligne par « hérité de A ». Si A n'a rien non plus, l'entrée est vide pour cette variante.

**Sorties** :

| Variante | Poignée de sortie |
|---|---|
| A | `result` (existante) |
| B | `result-b` |
| C | `result-c` |

**Affichage en mode A/B** : section « Commun » (Personnage, Logo), puis une section par variante active, titrée « Variante A », « Variante B », « Variante C », empilées (toutes les poignées restent montées pour que les fils restent visibles et valides). Chaque section de variante porte sa poignée de sortie alignée sur son titre, côté droit. Sous la dernière section : « + Variante C » si seulement A et B ; « Retirer » sur la section C.

**Désactiver l'interrupteur ou retirer C** : si des arêtes sont branchées sur les poignées supprimées (`*-b`, `*-c`, `result-b`, `result-c`), confirmation (« Désactiver le test A/B retire N branchement(s) des variantes B et C ») puis suppression de ces arêtes avant de retirer les poignées.

**Génération** :
- Fonction pure `planGeneration(nodeData, connectedInputs)` → liste de tâches `{ variant, model, count, inputs }`. Mode normal : une tâche par modèle (modèle principal + modèles comparés). Mode A/B : une tâche par variante active, modèle principal uniquement.
- Fonction pure `resolveVariantInputs(edges, nodes, generatorId, variant)` → entrées de la variante (communes + par variante avec héritage de A) et, pour chaque entrée par variante, un indicateur `inherited`.
- `store.getConnectedInputs` est étendu (ou complété) pour accepter la variante et s'appuyer sur `resolveVariantInputs`.
- Les tâches s'exécutent en parallèle ; chaque résultat crée ou met à jour son nœud Aperçu relié depuis la sortie de sa variante, titré « Variante A » / « B » / « C » (mode normal : comportement actuel, titres actuels).
- Résultats stockés par variante : `generatedImagesByVariant?: { A?: string[]; B?: string[]; C?: string[] }` ; `generatedImages` reste alimenté pour A (compatibilité avec le code qui le lit).
- Chaque appel envoie `projectId` (déjà en place) pour que les images comptent dans la galerie.

### 4. Agent

- `src/lib/agent/blueprint/schema.ts` : `generator.data` accepte `abTest: { variants: ["A","B"] | ["A","B","C"] }` (optionnel). Validation du blueprint : une arête vers `prompt-in-b` / `sketch-in-b` / `ref-in-b` exige que B soit active sur le générateur cible, idem pour C ; message d'erreur explicite sinon.
- `src/lib/agent/tools/apply-workflow.ts` : `blueprintToCanvasData` recopie `abTest` dans les données du nœud canvas.
- `src/lib/agent/tools/get-canvas-state.ts` et `snapshotCanvas` / `summarizeNode` de `ChatPanel.tsx` : le résumé d'un générateur inclut `abTest.variants`.
- `src/lib/agent/system-prompt.ts`, section « MULTI-SELECT FOR A/B TESTING » réécrite : quand l'utilisateur retient 2 ou 3 angles, construire **un** générateur avec `abTest`, brancher une seule fois le Personnage et le Logo, un Prompt (et si utile un Croquis ou une Image de référence) par variante sur les poignées `-b` / `-c`. 4 angles ou plus : plusieurs générateurs A/B/C de 3 variantes max. Rappeler que YouTube Studio teste jusqu'à 3 miniatures.

## Tests

Vitest :
- `resolveVariantInputs` : communes partagées ; B hérite de A pour chaque entrée non branchée ; B branchée prime ; C sans A → vide ; indicateurs `inherited`.
- `planGeneration` : mode normal (1 modèle, N modèles comparés), mode A/B à 2 et 3 variantes, comparaison de modèles ignorée en mode A/B, `count` par variante.
- Retrait de poignées : fonction qui liste les arêtes à supprimer quand on désactive le mode ou retire C.
- Blueprint : `abTest` accepté ; arête vers `prompt-in-c` refusée si C inactive ; `apply_workflow` recopie `abTest`.
- `summarizeNode` / `get_canvas_state` exposent `abTest`.

Vérification manuelle dans le navigateur : générateur existant inchangé à l'ouverture ; activation A/B, ajout et retrait de C avec confirmation ; « + Ajouter » depuis une ligne ouvre le panneau filtré et relie sur la bonne poignée de variante ; badges « hérité de A » ; génération A/B produisant un Aperçu par variante titré ; résumé du bouton ; conversation agent où l'utilisateur choisit 2 angles → un seul générateur A/B construit.

## Hors périmètre

- Nœud « Comparaison A/B » et publication du test sur YouTube (feuille de route, après la connexion YouTube).
- Refonte visuelle des autres nœuds.
- Variation du modèle par variante.
