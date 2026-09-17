# Page Réglages — design

Date : 2026-09-16
Statut : approuvé (architecture validée en brainstorming, plan demandé)
Repo : `/Users/antoinevigneau/thumbgen-real` (Next.js 16 App Router, shadcn base-nova / Base UI, SQLite)

## Contexte

« Réglages » ouvre aujourd'hui un Dialog (`src/components/panels/SettingsPanel.tsx` + `settings/McpSettingsSection.tsx`) monté depuis `AppSidebar.tsx`. Il n'expose que des clés API, le modèle de l'agent, la recherche web, une chaîne YouTube et une langue. L'utilisateur veut une vraie page qui règle tout l'outil.

Ce document couvre le **chantier 1** d'un découpage en trois :

1. **Page Réglages** (ce document).
2. Connexion YouTube (OAuth Google, jetons, synchro locale chaîne / vidéos / analytics dont CTR) — spec séparée. Ajoutera une carte « Connexion YouTube » en haut de `/reglages/chaine` et les champs du client OAuth Google dans `/reglages/connexions`.
3. Page « Ma chaîne » (tableau de bord stats + historique, exploitation par l'agent) — spec séparée.

Rien de ce qui relève des chantiers 2 et 3 n'apparaît dans ce chantier, pas même désactivé.

## Constats de départ (vérifiés dans le code)

| Réglage actuel | Réalité |
|---|---|
| `anthropicApiKey` | Affiché, lu nulle part. |
| `geminiApiKey` | Lu seulement par `/api/generate/nano-banana` (0 appelant). |
| `ideogramApiKey` | Lu seulement par `/api/generate/ideogram`, `/api/edit/ideogram`, `/api/remix/ideogram` (0 appelant chacun). |
| `grokApiKey` | Lu seulement par `/api/generate/grok` (0 appelant). |
| `openaiApiKey` | Vivant : dictée vocale (`src/lib/agent/transcribe.ts`, gpt-4o-mini-transcribe). Aussi lu par `/api/generate/openai` (0 appelant). Libellé actuel trompeur (« Clé API OpenAI » sans préciser l'usage). |
| `sitePassword` | Dans la liste des clés, mais `src/middleware.ts` ne lit que `process.env.SITE_PASSWORD`. Sans effet. |
| `language` | Lu seulement par `/api/enhance-prompt`. Le prompt système de l'agent dit en dur « French is the user's preferred language ». |
| `favoriteModel` | Vivant : modèle des nouveaux nœuds générateur (`Canvas.tsx`). |
| `youtubePlaylistId` | Vivant : flux d'inspirations (`/api/youtube/playlist`). |
| `agentModel`, `agentWebSearch`, `mcpApiKey`, `openrouterApiKey`, `youtubeApiKey`, `currentProjectId` | Vivants. |
| Sélecteur 1K/2K/4K du nœud générateur | Sans effet : `/api/generate/openrouter` envoie `resolution: "2K"` en dur. |
| Effort de réflexion de l'agent | En dur `"medium"` (`src/lib/agent/v2/route-handler.ts`, `providerOptions`). |
| Étapes max de l'agent | En dur `MAX_STEPS = 25` (`route-handler.ts`). |
| Titre auto des conversations | Toujours actif (`generateAndPersistTitle`). |
| Thème | `<html className="dark">` en dur dans `src/app/layout.tsx`. Les tokens du canvas (`--ink-*`, `--canvas-*`, `--node-*`) n'ont que des valeurs sombres. |
| État ouvert/replié de la sidebar | Écrit dans le cookie `sidebar_state` par `ui/sidebar.tsx`, jamais relu : `SidebarProvider` repart toujours de sa valeur par défaut. |

## Principe directeur

Chaque réglage affiché change un comportement réel, vérifiable. Aucun interrupteur décoratif, aucun champ « bientôt ». Les réglages morts listés ci-dessus sont retirés avec le code orphelin qui les lisait.

## Architecture

### Routes et layout

- `src/app/reglages/page.tsx` : redirection serveur vers `/reglages/connexions`.
- `src/app/reglages/layout.tsx` (client) : `ReactFlowProvider` (requis par `AppSidebar`, qui appelle `useReactFlow`) + `AppSidebar` + `SidebarInset`. Dans l'inset : titre « Réglages », sous-titre, puis une grille deux colonnes — menu des sections à gauche (liste de liens, item actif selon le pathname), contenu à droite. Sous `md`, le menu devient un `Select` qui navigue vers la section choisie.
- Une sous-page par section : `connexions`, `agent`, `generation`, `chaine`, `integrations`, `donnees`, `apparence`. Chaque `page.tsx` rend un composant client de formulaire.
- `AppSidebar` : l'item « Réglages » fait `router.push("/reglages")` et est actif quand le pathname commence par `/reglages`. L'état `settingsOpen`, le `Dialog` et l'import de `SettingsPanel` disparaissent.
- Supprimés : `src/components/panels/SettingsPanel.tsx`. `McpSettingsSection.tsx` est réutilisé tel quel par `/reglages/integrations`.

Ordre et libellés du menu :

| Slug | Libellé | Icône lucide |
|---|---|---|
| `connexions` | Connexions des modèles | `KeyRound` |
| `agent` | Agent IA | `Bot` |
| `generation` | Génération d'images | `ImagePlus` |
| `chaine` | Ma chaîne | `Youtube` |
| `integrations` | Intégrations | `Plug` |
| `donnees` | Données & sauvegardes | `Database` |
| `apparence` | Apparence | `Palette` |

### Schéma de réglages typé

Nouveau module `src/lib/settings-schema.ts`, source unique de vérité :

- Un objet zod par réglage avec type, bornes et défaut.
- Un marqueur `secret: true` pour les clés (`openrouterApiKey`, `openaiApiKey`, `youtubeApiKey`, `mcpApiKey`).
- Une table `ENV_FALLBACK` (clé → variable d'environnement) conservée pour les secrets existants.
- `getTypedSettings()` : lit la table `settings`, applique le repli d'environnement pour les secrets, parse avec le schéma, renvoie des valeurs typées avec défauts. Une valeur stockée invalide retombe sur le défaut (et est journalisée) au lieu de faire planter la lecture.
- `updateSettings(partial)` : valide le sous-ensemble fourni avec le schéma (`.partial().strict()`), écrit en transaction. Les booléens et nombres sont stockés en texte (`"true"`/`"false"`, décimal) et reparsés à la lecture via `z.coerce` / transformation explicite.
- `clearSetting(key)` : supprime la ligne (utilisé par « Supprimer la clé »).

`src/lib/settings.ts` conserve `getSetting(key)` pour les appelants existants, réimplémenté au-dessus de `getTypedSettings()` pour les clés encore présentes. Les clés retirées (`geminiApiKey`, `ideogramApiKey`, `grokApiKey`, `anthropicApiKey`, `sitePassword`) sortent du type et de la table de repli.

Réglages du schéma (clé → type → défaut) :

| Clé | Type | Défaut |
|---|---|---|
| `openrouterApiKey` | string secret | — |
| `openaiApiKey` | string secret | — |
| `youtubeApiKey` | string secret | — |
| `mcpApiKey` | string secret | — (géré par la section MCP existante) |
| `agentModel` | enum des ids de `AGENT_MODELS` | `DEFAULT_AGENT_MODEL` |
| `agentWebSearch` | boolean | `true` |
| `agentReasoningEffort` | `"low" \| "medium" \| "high"` | `"medium"` |
| `agentMaxSteps` | int 5–50 | `25` |
| `agentAutoTitle` | boolean | `true` |
| `agentResponseLanguage` | `"fr" \| "en" \| "es" \| "de" \| "pt" \| "it"` | `"fr"` |
| `favoriteModel` | enum des ids de `MODEL_SLUGS` | `"gemini-3.1-flash-image"` |
| `defaultAspectRatio` | `"16x9" \| "9x16" \| "1x1"` | `"16x9"` |
| `defaultImageCount` | int 1–4 | `1` |
| `defaultResolution` | `"1K" \| "2K" \| "4K"` | `"2K"` |
| `language` (texte des miniatures) | mêmes 6 langues | `"fr"` |
| `youtubePlaylistId` | string (URL de chaîne, @handle ou id de playlist) | `""` |
| `channelProfile` | objet JSON (voir « Ma chaîne ») | profil vide |
| `theme` | `"dark" \| "light" \| "system"` | `"dark"` |
| `currentProjectId` | string | — (interne, non affiché) |

`agentWebSearch` est aujourd'hui stocké `"1"`/`"0"` : la lecture accepte `"1"`, `"0"`, `"true"`, `"false"` ; l'écriture normalise en `"true"`/`"false"`.

### API

- `GET /api/settings` : valeurs typées. Chaque secret est remplacé par `{ configured: boolean, preview: "…a107" | null, source: "settings" | "env" | null }`.
- `POST /api/settings` : corps = sous-ensemble de clés. Validation par le schéma ; 400 avec `{ error, issues: [{ path, message }] }` si invalide. Pour un secret, chaîne vide = ignoré (inchangé).
- `DELETE /api/settings?key=<cle>` : efface un secret stocké (`clearSetting`). 400 si la clé n'est pas un secret. Si la valeur venait de l'environnement, la réponse l'indique (`source: "env"`) et l'UI explique qu'elle ne peut pas être effacée depuis la page.
- `POST /api/settings/test?provider=openrouter|openai|youtube` : teste la clé stockée côté serveur, renvoie `{ ok, detail }`. La clé ne transite jamais vers le navigateur.

Tous les lecteurs actuels de `/api/settings` (`Canvas.tsx`, `GeneratorNode.tsx`, `ProjectBar`, `AppSidebar`, `UsageBadge` le cas échéant, `SettingsPanel` supprimé) sont adaptés à la nouvelle forme de réponse.

### Enregistrement dans l'UI

- Chaque section est une `Card` contenant un `<form>`. État initial chargé via `GET /api/settings` ; état courant local ; « Enregistrer » (`Button`) activé seulement si l'état diffère de l'initial.
- À l'envoi : `POST` des seules clés de la section. Succès → l'état initial devient l'état courant, texte « Enregistré » à côté du bouton pendant 2 s. Erreur 400 → messages par champ (`issues`) sous les champs concernés ; autre erreur → `Alert` destructive dans la carte.
- Champs secrets : `Input type="password"` vide avec placeholder ; badge d'état (« Configurée · …a107 », « Via variable d'environnement », « Non configurée ») ; boutons « Tester » et « Supprimer la clé ». Un secret saisi puis enregistré est vidé du champ.
- Composants : `Card`, `Input`, `Textarea`, `Select`, `Switch`, `ToggleGroup`, `Label`, `Button`, `Badge`, `Alert`, `Table`, `Skeleton`, `Separator`. Aucun style maison.

## Contenu des sections

### 1. Connexions des modèles (`/reglages/connexions`)

Une carte par fournisseur, avec son usage écrit en clair :

- **OpenRouter** — « Requise. Génère les images, fait tourner l'agent et améliore les prompts. » Test : `GET https://openrouter.ai/api/v1/key` avec la clé ; succès → affiche la consommation et la limite renvoyées par OpenRouter (vérifier la forme exacte de la réponse à l'implémentation et n'afficher que les champs présents).
- **OpenAI** — « Utilisée uniquement pour la dictée vocale du chat. » Test : `GET https://api.openai.com/v1/models`.
- **YouTube Data API** — « Recherche de vidéos et de miniatures par l'agent, flux d'inspirations. » Test : `GET https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=@YouTube&key=…` (coût quota 1).

Retrait du code mort qui lisait les clés supprimées : `src/app/api/generate/nano-banana/`, `src/app/api/generate/openai/`, `src/app/api/generate/ideogram/`, `src/app/api/generate/grok/`, `src/app/api/edit/ideogram/`, `src/app/api/remix/ideogram/` (0 appelant chacun, re-vérifier au moment de supprimer), ainsi que la logique `providers` / `hasGemini` / `hasIdeogram` / `hasGrok` dans `Canvas.tsx` et `GeneratorNode.tsx`, et les champs correspondants de `docker-compose.yml` (`args` et `environment`) et du `Dockerfile` s'ils y figurent.

### 2. Agent IA (`/reglages/agent`)

| Champ | Composant | Effet |
|---|---|---|
| Modèle | `Select` (libellé + prix d'`AGENT_MODELS`) | `agentModel`, déjà lu par `route-handler.ts`. |
| Recherche web automatique | `Switch` | `agentWebSearch`, déjà lu. |
| Effort de réflexion | `ToggleGroup` Faible / Moyen / Élevé | Remplace `"medium"` en dur dans `providerOptions` de `route-handler.ts`. Désactivé avec explication si le modèle choisi n'a pas `supportsThinking`. |
| Étapes max par réponse | `Input type="number"` 5–50 | Remplace `MAX_STEPS`. |
| Titre automatique des conversations | `Switch` | Si `false`, `route-handler.ts` n'appelle pas `generateAndPersistTitle`. |
| Langue des réponses | `Select` 6 langues | Nouveau bloc système `<response_language>` ajouté par `buildSystemMessages` ; la ligne « French is the user's preferred language unless they switch » du prompt statique est retirée. |

### 3. Génération d'images (`/reglages/generation`)

| Champ | Composant | Effet |
|---|---|---|
| Modèle par défaut | `Select` des modèles de `MODEL_SLUGS` avec libellés d'`ALL_MODELS` | `favoriteModel` : modèle des nouveaux nœuds générateur (menu contextuel et connexion de nœud dans `Canvas.tsx`). L'étoile « favori » du nœud continue d'écrire ce même réglage. |
| Format par défaut | `ToggleGroup` 16:9 / 9:16 / 1:1 | `aspectRatio` initial des nouveaux nœuds générateur. |
| Nombre d'images par défaut | `ToggleGroup` 1 / 2 / 3 / 4 | `numImages` initial des nouveaux nœuds générateur. |
| Résolution par défaut | `ToggleGroup` 1K / 2K / 4K | `imageSize` initial des nouveaux nœuds ; `GeneratorNode` envoie `imageSize` dans le corps de `/api/generate/openrouter`, qui l'utilise pour `resolution` (repli sur `defaultResolution` si absent) au lieu de `"2K"` en dur. Corrige le sélecteur sans effet. |
| Langue du texte sur les miniatures | `Select` 6 langues | `language` : déjà lu par `/api/enhance-prompt` ; ajouté au bloc `<response_language>` de l'agent comme langue du texte à placer dans les miniatures. |

Les défauts s'appliquent aux nœuds créés depuis l'UI du canvas. `apply_workflow` (agent) garde ses propres choix explicites par nœud.

### 4. Ma chaîne (`/reglages/chaine`)

Profil stocké dans `channelProfile` (JSON validé par zod) :

| Champ | Composant | Limite |
|---|---|---|
| Nom de la chaîne | `Input` | 100 car. |
| Chaîne YouTube (URL, @handle ou id de playlist) | `Input` | écrit `youtubePlaylistId` (clé séparée, déjà lue par le flux d'inspirations) |
| Thématique / niche | `Input` | 200 car. |
| Public cible | `Textarea` | 500 car. |
| Ton et style | `Textarea` | 500 car. |
| Couleurs de marque | jusqu'à 3 `Input type="color"` + valeur hex, ajout / retrait | 3 max, `#RRGGBB` |
| Personnage par défaut | `Select` alimenté par `GET /api/personas` + option « Aucun » | id de persona existant ou `null` |
| Consignes pour l'agent | `Textarea` | 2000 car. |

Effet : `buildSystemMessages` (`src/lib/agent/system-prompt.ts`) ajoute, quand au moins un champ est renseigné, un bloc `<channel_profile>` placé après le prompt statique mis en cache et avant `<project_id>`, contenant les champs renseignés en clair et, si un personnage par défaut est défini, la consigne d'utiliser `stored:persona_<id>` comme `faceReference` par défaut sauf indication contraire de l'utilisateur. Si le personnage référencé n'existe plus, la ligne est omise.

### 5. Intégrations (`/reglages/integrations`)

- **Serveur MCP** : `McpSettingsSection` existant, sans changement fonctionnel.
- **Accès protégé par mot de passe** : ligne en lecture seule — « Activé » / « Désactivé » selon la présence de `SITE_PASSWORD` côté serveur (exposé comme booléen par `GET /api/settings`), avec la phrase « Se configure via la variable d'environnement SITE_PASSWORD. »

### 6. Données & sauvegardes (`/reglages/donnees`)

**Stockage** (`GET /api/data/stats`) : taille du fichier base (+ WAL), nombre de projets, conversations, messages, images générées, personnages, logos, inspirations, croquis, uploads de chat. Rendu en `Table`.

**Sauvegardes** :
- `POST /api/data/backups` : sauvegarde en ligne via `db.backup()` de better-sqlite3 vers `data/backups/thumbgen-YYYYMMDD-HHMMSS.db` (dossier créé au besoin).
- `GET /api/data/backups` : liste `data/backups/*.db` et les anciennes copies manuelles `data/thumbgen.db.*` (hors `-wal`/`-shm`), avec nom, date, taille, et un marqueur « ancienne copie ».
- `GET /api/data/backups/download?name=<fichier>` : envoi du fichier en pièce jointe.
- `DELETE /api/data/backups?name=<fichier>` : suppression après confirmation dans l'UI.
- Sécurité des noms : `name` doit correspondre exactement à un fichier renvoyé par la liste (pas de chemin, pas de `..`) ; sinon 400.
- Pas de restauration depuis la page dans ce chantier (remplacer la base en cours d'exécution est risqué) ; la carte indique la procédure manuelle : arrêter le container, remplacer `data/thumbgen.db` par la copie, supprimer `thumbgen.db-wal` et `thumbgen.db-shm`, redémarrer.

**Nettoyage** (`POST /api/data/cleanup`) :
- Supprime les lignes de `generated_sketches` et `chat_uploads` avec `attached = 0` créées il y a plus de 24 h.
- Puis `VACUUM`.
- Renvoie le nombre de lignes supprimées et la taille du fichier avant/après. L'UI affiche d'abord le nombre d'éléments concernés (`GET /api/data/cleanup` → comptes) et demande confirmation.

### 7. Apparence (`/reglages/apparence`)

- **Thème** : `ToggleGroup` Sombre / Clair / Système.
  - `src/app/layout.tsx` (serveur) lit `theme` via `getTypedSettings()` : `dark` → classe `dark` sur `<html>` ; `light` → pas de classe ; `system` → pas de classe côté serveur + petit script inline dans `<head>` qui ajoute `dark` si `prefers-color-scheme: dark` et suit les changements du média.
  - Après enregistrement, la page applique la classe immédiatement côté client (sans rechargement).
  - Texte d'aide : « Le canvas et ses nœuds restent sombres. »
- **Sidebar** : pas de réglage. `layout.tsx` lit le cookie `sidebar_state` et le passe en `defaultOpen` à `SidebarProvider` (ouvert si absent), pour que la sidebar retrouve son dernier état au rechargement.

## Gestion d'erreurs

- Lecture de réglages : valeur invalide → défaut + `console.warn` (clé, valeur tronquée), jamais d'exception.
- Écriture : validation zod stricte ; clés inconnues refusées (400).
- Tests de connexion : délai de 10 s ; réponse `{ ok: false, detail }` avec le statut HTTP et un message court, sans jamais renvoyer la clé.
- Routes de données : noms de fichiers liste blanche ; erreurs disque → 500 avec message ; sauvegarde concurrente → 409 si une sauvegarde est déjà en cours.

## Tests

Vitest (base temporaire isolée par `tests/setup.ts`) :
- `settings-schema` : défauts, bornes (5/50 étapes, 1–4 images), coercition `"1"`/`"0"`/`"true"`/`"false"`, valeur invalide stockée → défaut, repli d'environnement des secrets, `strict()` refuse les clés inconnues.
- `POST /api/settings` : 400 avec `issues`, secret vide ignoré ; `DELETE` refusé pour une clé non secrète.
- `buildSystemMessages` : bloc `<channel_profile>` absent si profil vide, présent et ordonné sinon ; personnage inexistant omis ; bloc `<response_language>`.
- `route-handler` : effort de réflexion, étapes max et titre auto lus depuis les réglages.
- `/api/generate/openrouter` : `resolution` suit `imageSize` puis `defaultResolution`.
- Données : `name` hors liste → 400 ; nettoyage ne supprime que `attached = 0` de plus de 24 h ; sauvegarde crée un fichier SQLite valide (`PRAGMA integrity_check`).

Vérification manuelle dans le navigateur : chaque section enregistre et recharge sa valeur ; bouton « Enregistrer » inactif sans changement ; tests de connexion ; création / téléchargement / suppression d'une sauvegarde ; nettoyage ; bascule de thème sans rechargement ; menu en `Select` sous `md`.

## Hors périmètre

- Connexion OAuth YouTube, synchro et page « Ma chaîne » (chantiers 2 et 3).
- Budget / plafond de dépenses (écarté par l'utilisateur).
- Restauration de sauvegarde depuis l'UI.
- Mot de passe du site modifiable depuis la page.
- Thème clair du canvas et des nœuds.
