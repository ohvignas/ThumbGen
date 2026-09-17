# Parcours miniature complet (chantier F3) — design

Date : 2026-09-17. Statut : validé en brainstorming avec Antoine (choix de parcours, recherche, détails, fin, approche, sections 1 et 2). Prérequis en ligne : F1 (agent en arrière-plan), F2 (ask_user, place_node, canvas patches), correctif « agent qui respecte le canvas », correctif « payload du chat » (branche `fix/chat-payload-library`, à fusionner avant F3).

## Problème

Le parcours actuel est trop pauvre :
- **Agent trop pressé.** Sur une demande libre, il lance des esquisses tout de suite sans poser de questions.
- **Mauvaise vidéo.** L'interview F2 commence par proposer les anciennes vidéos d'Antoine, alors qu'il veut faire une **nouvelle** vidéo.
- **Rien de demandé sur la miniature.** Aucune question sur le fond, l'émotion du personnage, les éléments, le texte ou les couleurs.
- **Aucun contexte.** Pas de recherche sur le sujet, pas de logos des outils cités, pas d'analyse des miniatures concurrentes.

## Décisions validées

- Ce parcours **remplace tout** : le bouton « Construire avec l'agent » et toute demande de création de miniature le lancent. Le flux « esquisses directes » et l'interview F2 à 8 questions disparaissent.
- Recherche **rapide, automatique** : Perplexity Sonar Pro via OpenRouter, sans demande de confirmation.
- Détails : **éléments communs, puis détails par variante**.
- Fin : **esquisses d'abord** (une par variante), puis workflow.
- Approche **C** : l'agent mène le parcours et reste conversationnel. Chaque décision est écrite dans une **fiche miniature** structurée, enregistrée en base, relue à chaque tour, visible et corrigeable.

## Parcours

Chaque étape passe par `ask_user` (choix + « Autre » + « Passer » quand ça a du sens). Antoine peut toujours écrire librement : un message pendant une question abandonne la question, et l'agent reprend à l'étape indiquée par la fiche.

1. **Nouvelle vidéo.** Sujet, titre provisoire ou idée, intro ou script (texte libre). Aucune proposition d'anciennes vidéos.
2. **Recherche.** `research_topic` : résumé, points clés, entités (entreprises, outils, produits), sources. Lancée automatiquement après l'étape 1.
3. **Logos.** `find_logos` sur les entités, puis une question en grille, multiple : « Quels logos peuvent servir ? ». Les logos retenus sont ajoutés à la bibliothèque (sources stockables uniquement : Simple Icons, SVGL, Wikimedia). Logo introuvable : proposition d'import ou de recherche Brandfetch (aperçu seulement, règle existante).
4. **Miniatures concurrentes.** `find_competitor_thumbnails` en anglais et en français, classées par vues ÷ abonnés. Grille multiple (jusqu'à 5) : « Lesquelles te plaisent ? ». Pour chaque choix, une question : « Qu'est-ce qui te plaît ? » (composition, texte, couleurs, émotion, style, autre). Les choix sont copiés dans la bibliothèque (chemin « Utiliser comme référence » existant).
5. **Variantes A/B.** L'agent propose 2 ou 3 directions au format Direction | Titre | Texte miniature | Concept visuel, déduites de la recherche et des références. Antoine choisit, modifie ou colle son propre tableau (l'agent le lit en texte libre).
6. **Éléments communs.** Personnage (grille des personnages, ou « Aucun »), style général et couleurs de la chaîne.
7. **Détails par variante.** Pour A, puis B (puis C), une question par élément :
   - fond ;
   - émotion ou sensation du personnage ;
   - éléments présents (logos retenus, objets, captures) ;
   - texte exact et placement ;
   - couleurs dominantes.

   Les options sont construites à partir de la fiche (recherche, références, concept de la variante).
8. **Récap par variante** (`finish_turn`) : Antoine valide ou demande une correction ciblée.
9. **Esquisses.** `generate_sketch`, une par variante, à partir des détails de la fiche. Question : « Valider / retoucher A / retoucher B… ». Une retouche regénère seulement la variante concernée.
10. **Workflow.** Via `place_node`, en direct :
    - le personnage ;
    - les logos retenus ;
    - les références choisies ;
    - l'esquisse et le prompt détaillé de chaque variante ;
    - le générateur avec `abTest` (A/B ou A/B/C) et tous les liens (entrées partagées `face-in`/`logo-in`, entrées par variante `prompt-in[-b|-c]`, `sketch-in[-b|-c]`, `ref-in[-b|-c]`).

    Fin : `finish_turn` avec l'action « Générer » (libellé et coût calculés par l'app).

## Fiche miniature

### Stockage

- Nouvelle table `thumbnail_briefs` : `conversation_id` (clé primaire), `project_id`, `data` (JSON), `updated_at` ISO. Migration idempotente.
- Une fiche par conversation. La suppression de la conversation supprime la fiche.

### Schéma (zod, `src/lib/brief/schema.ts`)

```
{
  step: 1..10,
  video: { subject?: string, workingTitle?: string, script?: string },
  research?: { summary: string, keyPoints: string[], entities: { name: string, kind: "company"|"tool"|"product"|"other" }[], sources: { title: string, url: string }[], fetchedAt: string },
  logos: { name: string, source: "stored:lg_<id>" }[],
  references: { videoId: string, title: string, channel: string, views: number, subscribers: number | null, ratio: number | null, source: "stored:sf_<id>", liked: string[] }[],
  variants: { key: "A"|"B"|"C", direction: string, title: string, thumbnailText: string, concept: string,
              details?: { background?: string, emotion?: string, elements?: string[], text?: { content: string, placement: string }, colors?: string[] },
              sketch?: { source: "generated:sk_<id>", status: "pending"|"validated"|"retouch" } }[],
  common: { persona?: "stored:persona_<id>" | "none", style?: string, colors?: string[] }
}
```

Toutes les chaînes ont des longueurs bornées (titre ≤ 120, texte miniature ≤ 60, champs de détail ≤ 300, script ≤ 8 000). Au plus 3 variantes et 5 références.

### Outils

- **`update_brief`** (serveur, par requête, non exposé en MCP) :
  - entrée : un patch partiel validé (`{ path-free merge }`, les tableaux étant remplacés entièrement) ;
  - écrit la fiche de la conversation courante ;
  - renvoie la fiche résumée (sans le script complet) ;
  - émet un chunk transient `data-brief-updated` pour rafraîchir le panneau.
- **Contexte par tour** : un bloc `<thumbnail_brief>` compact (script tronqué à 1 500 caractères, sources limitées aux titres) est injecté après `<canvas_state>`. Le prompt système dit de s'y fier plutôt qu'à l'historique.
- **`research_topic`** :
  - entrée : `{ query: string, language: "fr"|"en" }`, avec un appel OpenRouter `perplexity/sonar-pro` (id réel à vérifier) et un timeout de 60 s ;
  - sortie : JSON structuré (summary, keyPoints, entities, sources) ;
  - coût journalisé dans `generations_log` / Usage comme les autres appels ;
  - pas de clé OpenRouter : erreur claire, l'agent continue.
- **`find_logos`** :
  - entrée : `{ names: string[] ≤ 12 }` ;
  - réutilise `src/lib/logos/search` (Simple Icons, SVGL, Wikimedia) ;
  - renvoie au plus 3 candidats par nom avec une image d'aperçu utilisable dans `ask_user` ;
  - après le choix, l'agent appelle **`add_logo`** (réutilise `add-logo`), qui renvoie `stored:lg_<id>`.
- **`find_competitor_thumbnails`** :
  - entrée : `{ query_fr: string, query_en: string, limit ≤ 12 }` ;
  - YouTube `search.list` (vidéos longues via durée, récentes d'abord puis vues), puis `videos.list` (vues), puis `channels.list` (abonnés) ;
  - `ratio = vues / max(abonnés, 1)` ;
  - tri par ratio, dédoublonnage, Shorts exclus ;
  - sortie en lignes `youtube:<videoId>` + chiffres ;
  - pas de clé YouTube : erreur claire, étape sautée.
- **Copie des références choisies** : `import_youtube_thumbnail` (dédoublonné via `copyVideoThumbnailToLibrary`), qui renvoie `stored:sf_<id>`.
- **`place_node`** étend les ids d'interview aux variantes : `iv-prompt-a|b|c`, `iv-sketch-a|b|c`, `iv-ref-a-1..3` (références par variante) ou `iv-ref-1..5` (partagées), `iv-logo-1..5`, `iv-persona`, `iv-generator` (avec `abTest`).
  - Déduction des poignées : prompt/sketch/ref de la variante X vers `prompt-in[-x]` / `sketch-in[-x]` / `ref-in[-x]` (A sans suffixe). Persona vers `face-in`, logos vers `logo-in`.
  - Les règles existantes (`agentLinks`, snapshots, patches, `previousUpdatedAt`) s'appliquent.

### Retrait de l'existant

- La section GUIDED INTERVIEW (8 questions) est remplacée par une section « THUMBNAIL JOURNEY » décrivant les 10 étapes, l'usage de la fiche et les outils.
- Le « CORE LOOP » (esquisses immédiates) ne s'applique plus à la création : il devient l'étape 9.
- `list_followed_videos` reste disponible, mais n'est plus proposé à l'étape 1.
- EXISTING WORKFLOW, A/B, `finish_turn` et les règles de sécurité canvas restent en vigueur.

## Écran

- **Bouton « Fiche »** dans l'en-tête du chat, avec un badge « Étape n/10 ». Il ouvre un `Sheet` latéral (shadcn) :
  - une section par bloc de la fiche, remplie progressivement ;
  - vignettes pour logos, références et esquisses ;
  - liens des sources ;
  - tableau des variantes.
- **Champs éditables** (texte des variantes et détails) : enregistrés via `PATCH /api/briefs/[conversationId]` (JSON-only, validation zod). L'agent voit les modifications au tour suivant.
- **Rafraîchissement** du panneau : chunk `data-brief-updated` en direct, sinon rechargement à l'ouverture.
- **Ligne d'étape** : le libellé live inclut l'étape de la fiche (« Étape 4/10 — Miniatures concurrentes ») quand une fiche est active.

## Coût

- **Recherche** : environ 0,01 à 0,03 $ par parcours (Sonar Pro), journalisée.
- **Tours d'agent** : courts. Le contexte repose sur la fiche. Le payload du chat n'envoie que le dernier message, et les images anciennes sont retirées de ce que l'IA reçoit.
- **Esquisses** : environ 0,02 $ par variante. Chaque retouche coûte une esquisse.
- **Génération finale** : uniquement au clic sur « Générer ».
- **Quota YouTube** : environ 250 unités par recherche de concurrents (gratuit, 10 000 par jour).

## Erreurs

- Pas de clé YouTube : étape 4 sautée avec message. Pas de clé OpenRouter : parcours bloqué avec le message existant.
- Recherche en échec ou vide : l'agent le dit et passe aux logos à partir des noms cités par Antoine.
- Logo introuvable : proposer l'import manuel (dialogue Bibliothèque) ou Brandfetch en aperçu.
- Fiche invalide (patch refusé) : `error-text`, l'agent reformule et réessaie une fois.
- Conversation rouverte : la fiche est rechargée, et l'agent reprend à `step`.

## Tests

- **Schéma de fiche** : limites, merge partiel, tableaux remplacés.
- **Stockage** : migration idempotente, CRUD, suppression avec la conversation.
- **Route PATCH** : 415, 404, validation.
- **`update_brief`** : écriture, chunk transient, non exposé en MCP.
- **Bloc `<thumbnail_brief>`** : compact, tronqué, aucun base64.
- **`research_topic`** : appel OpenRouter mocké, parsing, timeout, erreurs, journalisation du coût.
- **`find_logos` / `add_logo`** : réutilisation des providers (mockés), limite par nom.
- **`find_competitor_thumbnails`** : fake YouTube (3 appels), ratio, tri, Shorts exclus, dédoublonnage, pas de clé.
- **`place_node` variantes** : ids, poignées par variante, `abTest` du générateur.
- **Prompt** : THUMBNAIL JOURNEY présent, GUIDED INTERVIEW et CORE LOOP immédiat retirés, sections existantes cohérentes.
- **UI** : bouton Fiche + badge, `Sheet` rendu par section, édition enregistrée, rafraîchissement sur chunk.
- **Navigateur** (modèle simulé serveur, nouveau scénario `THUMBGEN_FAKE_AGENT=journey`, recherche / YouTube / logos mockés côté serveur de dev uniquement) :
  - parcours complet jusqu'au workflow A/B posé en direct ;
  - fiche remplie ;
  - aucun appel réel ;
  - « Générer » non cliqué.

## Vérification live

Payante : seulement avec l'accord explicite d'Antoine. Parcours réel court (2 variantes), sans cliquer « Générer ». Coût relevé dans Usage.
