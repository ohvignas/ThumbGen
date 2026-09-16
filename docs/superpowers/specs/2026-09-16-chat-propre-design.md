# Chat propre : étapes repliées et réponse organisée (chantier E)

Date : 2026-09-16
Statut : approuvé en brainstorming
Repo : `/Users/antoinevigneau/thumbgen-real`
Ordre d'exécution : après les chantiers C (`2026-09-16-bibliotheque-page-design.md`) et D (`2026-09-16-chaines-suivies-design.md`). Suivi par F (construction guidée, questions à choix, canvas construit en direct) puis G (mode vocal Gemini Live), conçus séparément.

## Problème

Le chat de l'agent (`src/components/panels/ChatPanel.tsx`, `src/components/panels/chat/*`) affiche tout en direct et à plat, dans l'ordre des parties du message : le texte qui s'écrit mot à mot, chaque bloc « a réfléchi », chaque carte d'outil (`ToolCallCard`), les textes intermédiaires (« Parfait, je construis… », « workflow appliqué », « Le workflow est en place… »), et une ligne « Assistant · réfléchit… » (`AgentActivity`). L'utilisateur veut la réponse, propre et organisée ; le détail seulement s'il le demande.

## Décisions prises en brainstorming

- Pendant le travail : **une seule ligne d'étape** qui change, avec chrono, dépliable vers le détail.
- À la fin : **résumé + résultats + « Et maintenant »** (1 à 3 actions), détail replié au-dessus.
- Utiliser et compléter les composants shadcn de conversation : `Message` (avec `MessageAvatar`, `MessageHeader`, `MessageContent`, `MessageFooter`, `MessageGroup`), `Bubble`, `MessageScroller` (provider, viewport, content, item, bouton), `Marker` avec `Spinner` pour l'état en cours.

## Design

### 1. Structure d'un tour assistant

Un message assistant est découpé par une fonction pure `splitAssistantTurn(message)` (`src/components/panels/chat/turn-model.ts`) en :

- `steps` : la liste ordonnée du travail — réflexions (`reasoning`), textes intermédiaires (toute partie `text` suivie plus loin d'un outil), outils (`tool-*`, hors `finish_turn` et hors outils d'interaction client en attente).
- `answer` : le résumé final. Priorité : l'entrée de l'outil `finish_turn` s'il a été appelé ; sinon les parties `text` après le dernier outil ; sinon le dernier texte du message.
- `results` : les résultats à montrer. Priorité : les identifiants donnés à `finish_turn.results` (appels d'outils) ; sinon, en repli, les sorties des outils ayant un rendu visuel (`generate_sketch`, `import_youtube_thumbnail`, `search_youtube`).
- `nextActions` : 0 à 3 actions de `finish_turn.next_actions` (vide en repli).
- `pending` : les demandes client en attente (`request_user_image`, `request_user_sketch`, et les futures questions de F) — toujours affichées hors du détail.
- `durationMs` et `stepCount` pour la ligne repliée.

La fonction est pure, testée, et sert aussi aux conversations rouvertes (`history-to-ui-messages.ts`).

### 2. Outil `finish_turn`

- Nouvel outil agent (serveur, sans effet de bord) `finish_turn` enregistré comme les autres (`src/lib/agent/tools/`), entrée validée par zod :
  - `summary` : 1 à 400 caractères, 1 à 2 phrases.
  - `results` : 0 à 6 identifiants d'appels d'outils de ce tour dont la sortie doit être montrée.
  - `next_actions` : 0 à 3 objets `{ label (≤ 40 car.), kind: "ask_agent" | "focus_node", message? (si ask_agent, ≤ 300 car.), node_id? (si focus_node) }`.
- Sortie : `{ ok: true }`. Il n'apparaît jamais comme étape.
- Le prompt système (`src/lib/agent/system-prompt.ts`, bloc statique mis en cache) demande de terminer **chaque** tour par `finish_turn`, de ne pas écrire de longue réponse en texte libre, et d'utiliser `focus_node` pour les actions que l'utilisateur fait lui-même (lancer « Générer », qui coûte de l'argent). Les blocs dynamiques (`<response_language>`, `<channel_profile>`, `<project_id>`, `<canvas_state>`) et leur ordre ne changent pas.
- L'outil n'est pas exposé aux clients MCP externes s'il n'a pas de sens hors du chat (à vérifier dans le registre ; sinon il reste inoffensif).

### 3. Pendant le travail (tour en cours)

- Le message assistant affiche un `Marker` (`role="status"`) : `Spinner` + libellé de l'étape courante + chrono `m:ss` + chevron. Le texte ne s'écrit pas mot à mot.
- Libellé calculé par une fonction pure `currentStepLabel(message, status)` à partir de la dernière partie : raisonnement → « Réfléchit » ; outil en cours → libellé humain de l'outil (`src/lib/agent/tool-labels.ts`, complété : « Lit le canvas », « Cherche sur YouTube », « Dessine le croquis », « Construit le workflow », « Importe la miniature », « Liste tes personnages »…) ; texte → « Rédige la réponse » ; soumis sans partie → « Réfléchit ».
- Clic sur la ligne : `Collapsible` qui déroule le détail des étapes (§5), mis à jour en direct.
- `AgentActivity` (bandeau sous la liste) est supprimé : l'état vit dans le message.
- Demande client en attente (`PendingUiAction`) : rendue sous la ligne, visible, au-dessus du composer comme aujourd'hui.

### 4. Tour terminé

Dans le `Message` assistant (aligné à gauche, `MessageAvatar` = `AgentAvatar`) :

1. `MessageHeader` : bouton `Collapsible` « ▸ 12 s · 4 étapes » (replié par défaut ; « 1 étape » au singulier).
2. **Résumé** : `answer` rendu avec `TextMarkdown` dans la surface du message, apparition d'un bloc (fondu court, désactivé si `prefers-reduced-motion`).
3. **Résultats** : cartes des outils listés dans `results`, rendues par les renderers existants (`GeneratedImagePreview`, `SearchYoutubeGallery`) dans une grille compacte.
4. **« Et maintenant »** : 1 à 3 `Button` `variant="outline"` `size="sm"`.
   - `ask_agent` : envoie `message` comme message utilisateur (même chemin que le composer).
   - `focus_node` : sélectionne le nœud (`selectOnly`) et centre la vue dessus (`fitView` sur ce nœud) ; si le nœud n'existe plus, le bouton est désactivé avec l'infobulle « Élément introuvable ».
   - Les actions ne sont cliquables que sur le **dernier** tour ; sur les tours plus anciens elles sont masquées.
5. `MessageFooter` : bouton icône « Copier la réponse » (`aria-label`), copie le résumé.

Erreur du tour (erreur réseau, arrêt) : le résumé devient l'erreur (`Alert` compact) avec « Réessayer », le détail reste disponible.

### 5. Détail des étapes

- Liste verticale compacte, dans l'ordre : icône + libellé.
  - Réflexion : « Réflexion (3 s) », contenu repliable (composant `Reasoning` existant).
  - Texte intermédiaire : texte en `text-muted-foreground`, petit.
  - Outil : libellé humain, statut (`Spinner` en cours, ✓ ok, ✗ erreur + message), entrée et sortie JSON repliables (`ToolCallCard` / `SimpleToolPart` réutilisés en variante compacte).
- Aucun résultat visuel n'est dupliqué : un outil déjà montré dans « Résultats » affiche seulement « voir les résultats ci-dessous » dans le détail.

### 6. Défilement et liste

- `MessageList.tsx` garde `MessageScrollerProvider` et le configure : `scrollAnchor` sur les messages utilisateur, `autoScroll`, `defaultScrollPosition="last-anchor"`, `scrollPreviousItemPeek` modéré, `MessageScrollerContent aria-busy` pendant un tour, `MessageScrollerButton` visible.
- Messages consécutifs du même auteur regroupés avec `MessageGroup` quand c'est le cas (reprise après une demande client par exemple).
- Message utilisateur inchangé fonctionnellement : `Message align="end"` + `Bubble` teintée, images annotables.

### 7. Composants à ajouter

- `marker` et `spinner` depuis le registre shadcn (style `base-nova`), dans `src/components/ui/`, via la CLI shadcn locale ou copie manuelle conforme au registre ; vérifier `message.tsx`, `bubble.tsx`, `message-scroller.tsx` existants contre le registre actuel (sous-composants `MessageAvatar`, `MessageHeader`, `MessageFooter`, `MessageGroup` présents, sinon les mettre à jour).

## Gestion des erreurs

- `finish_turn` absent ou entrée invalide → repli (§1) sans erreur visible.
- Identifiant de résultat inconnu → ignoré.
- Outil en erreur → ✗ dans le détail ; si le tour s'arrête sur cette erreur sans `finish_turn`, le résumé indique l'échec.

## Tests

- `splitAssistantTurn` : tour avec `finish_turn` ; sans (repli texte après dernier outil, repli dernier texte) ; résultats par identifiants et en repli ; demande client en attente jamais dans `steps` ; `finish_turn` jamais dans `steps` ; durée et nombre d'étapes.
- `currentStepLabel` : chaque cas.
- Outil `finish_turn` : validation (longueurs, 3 actions max, `message` requis pour `ask_agent`, `node_id` pour `focus_node`).
- Prompt système : consigne `finish_turn` présente, blocs dynamiques et ordre inchangés (tests existants toujours verts).
- Rendu : une conversation rouverte sans `finish_turn` s'affiche avec résumé + détail replié.
- Aucun test n'appelle un modèle réel.

## Vérifications manuelles

- Pendant un tour : une seule ligne d'étape avec chrono, aucun texte qui s'écrit, détail déroulable en direct.
- Fin de tour : « ▸ n s · k étapes », résumé, résultats (croquis, recherche YouTube), boutons « Et maintenant » (message à l'agent, centrage du générateur).
- Demande d'image ou de croquis : visible sans ouvrir le détail.
- Conversation ancienne rouverte : affichage propre.
- Défilement : nouveau message ancré en haut, bouton « aller au dernier », pas de saut en lisant.

## Hors champ

- Questions à choix de l'agent et construction nœud par nœud en direct (chantier F).
- Mode vocal Gemini Live (chantier G).
