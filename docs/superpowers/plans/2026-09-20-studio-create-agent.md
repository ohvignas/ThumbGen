# Studio Create Agent Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le dialog titre+description de « Nouvelle vidéo » par un overlay plein écran dont la surface principale est le chat d’écriture : d’abord Document de chaîne + transcripts YouTube déjà ingérés + format de tournage, puis titres A/B, description YouTube et script, révélés en direct sur `/videos/[id]` pendant que le **même** chat se réduit au dock bas-droite. Sur la fiche, lier jusqu’à 3 projets canvas existants et les afficher comme miniatures A/B (pas d’API YouTube Test & Compare).

**Architecture:** Une fiche `vid_` est créée tout de suite en `Propositions` pour binder `studio:<videoId>`. Le même `ChatPanel` / la même conversation (`conversations.project_id`) vit dans un hôte `/videos` : overlay modal pendant le brainstorm, dock fixe après le premier `upsert_studio_script`. Les skills d’écriture (`write_video` + `studio_format` / `studio_titles` / `studio_description` / `studio_script`) sont un dossier à part des skills miniature. Un garde de surface refuse croquis/workflow sur `studio:*` et refuse les outils de remplissage studio sur le canvas. `upsert_studio_script` patche n’importe quel champ de la fiche et diffuse un `data-studio-draft-patch` transient. Les miniatures A/B sont des projets `proj_*` liés via `projects_meta.studio_video_id` (contrats Phase 2 du plan writing-studio, exécutés ici).

**Tech Stack:** Next.js 16.2 App Router, React 19.2, TypeScript strict, Tailwind v4, shadcn `base-nova` (`@base-ui/react` Dialog), Zustand 5, zod 4, better-sqlite3 (déjà là), `@ai-sdk/react` `useChat`, vitest 4. TypeSafe Jev déjà dans `src/lib/typesafe/rerank-titles.ts` — réutilisé pour un pré-test de titres **si** la clé existe, sans fetch sinon. Pas de nouvelle police, pas de dossier `design-system/`, pas de Notion, pas d’API payante dans les tests.

**Remplace :** le CTA Phase 1 « POST titre → `/videos/[id]` vide » décrit dans `docs/superpowers/plans/2026-09-20-youtube-writing-studio.md` (dialog `VideoFormDialog` mode create). Le kanban, l’éditeur typé, le store SQLite et `retrieve_own_corpus` restent. **In-scope ici :** Phase 2 miniature liée + affichage A/B sur la fiche (mêmes fichiers que writing-studio Tasks 13–14, plus picker et labels A/B/C). **Hors scope :** Phase 3 publish YouTube, Phase 4 expériences live Studio / `videos.update`.

## Global Constraints

- **AGENTS.md — APIs payantes.** Ne pas appeler OpenRouter, Perplexity, YouTube Data (quota), ni TypeSafe pendant les tests. Les tests mockent `fetch`. Un humain doit avoir dit oui dans le chat d’exécution avant tout appel réel payant. `write_video` / `studio_*` n’appellent **pas** `research_topic` sauf demande explicite (payant).
- **AGENTS.md — base live.** Ne jamais ouvrir ni écrire `data/thumbgen.db`. Les tests utilisent le DB temporaire de `tests/setup.ts` (`THUMBGEN_DB_PATH`).
- **AGENTS.md — Docker.** Rebuild uniquement depuis le **repo principal** (`git worktree list`), jamais depuis un worktree : `docker compose up -d --build`. Une seule rebuild, à la fin (Task 16).
- **AGENTS.md — tests.** `./node_modules/.bin/vitest run <fichier>` (pas `npx`). Node : `/opt/homebrew/bin/node` si `node` manque. Typecheck : `./node_modules/.bin/tsc --noEmit`. Lint : `./node_modules/.bin/eslint <files>`.
- **AGENTS.md — pas de wizard F3c.** Aucun « Étape n/7 », aucune Fiche / thumbnail brief, aucun stepper UI. L’arc corpus → format → écriture est **uniquement** dans les SKILL.md.
- **Pas de Notion runtime.** Interdit d’ajouter `notionApiKey`, un fetch `api.notion.com`, un bouton Synchroniser, ou `push_studio_video`.
- **Séparation métiers.** Skills / slash / outils d’écriture = **Vidéos / studio**. `generate_sketch`, `apply_workflow`, `/croquis`, `thumbnail-packaging`, `existing-workflow` = **canvas miniatures**. Ne pas les mélanger.
- **Étiquettes.** Uniquement `Propositions`, `Pas commencer`, `En cours`, `En prod`, `Terminer`.
- **UI.** Copy française ; apostrophes JSX en `&apos;`. shadcn `base-nova` (pas Radix). `cn` depuis `"cn"`. Tokens existants (`bg-background`, `text-muted-foreground`, `border-border`, `font-heading`). Pas de nouvelle identité visuelle.
- **Commits.** Un commit par task, uniquement les fichiers listés. Jamais `git add -A`.
- **Relire avant d’éditer.** Chaque task qui modifie un fichier existant le relit d’abord : le code cité ici est un ancrage, pas un numéro de ligne figé.

---

## Design system (dans ce plan — pas un dossier `design-system/`)

Skills utilisées pour cette section : **ui-ux-pro-max** (`--design-system` + domaines ux modal / empty / loading / chat / forms), **frontend-design**, **web-design-guidelines** (fetch `command.md` du 2026-09-20).

### Verdict ui-ux-pro-max

`--design-system` pour « YouTube writing studio / dark creator tool / French » a proposé **Video-First Hero + rose `#EC4899` + Inter**. **Rejeté.** C’est une landing streaming générique, pas ThumbGen. On ne persiste pas `design-system/MASTER.md` à la racine du repo.

Domaines ux retenus (règles, pas la palette) :

| Règle | Application ici |
|---|---|
| Focus visible, pas `outline-none` sans remplacement | `focus-visible:ring-3 focus-visible:ring-ring/50` (déjà le dock) |
| Overlay = focus trap + Escape + bouton Fermer | Dialog `base-ui`, `aria-modal` |
| Empty = message + action | Overlay : « Décris l’idée, ou envoie /ecrire » + CTA **C’est parti** |
| Loading >300 ms = skeleton, pas écran blanc | Coques Script / Description / 3 titres dès le premier paint |
| CLS | `min-h` réservés ; pas de montage tardif des sections |
| Labels visibles | Titre, Notes, Script, Description, A/B — jamais placeholder-only |
| `aria-live="polite"` | Phase agent + « L’agent prépare les données » |
| `prefers-reduced-motion` | Pas de zoom overlay, pas de `animate-ping` |
| Touch ≥44px | Fermer, C’est parti, composer send |
| Overlay scrim 40–60 % | `bg-black/60`, pas le `bg-black/10` du petit Dialog actuel |
| `overscroll-behavior: contain` | Overlay + dock |
| `min-h-dvh` + `env(safe-area-inset-*)` | Mobile |
| `autoFocus` desktop only | Composer overlay si `(pointer: fine)` |
| Loading copy se termine par `…` | « L’agent lit tes dernières vidéos… » |

### frontend-design — plan compact (cette app, pas un SaaS crème)

**Sujet :** overlay d’écriture YouTube pour un créateur FR qui vit déjà dans le canvas sombre + dock Brainstorm. Le moment mémorable est **le même chat qui occupe la page, puis se réduit en bas à droite** — continuité spatiale, pas une nouvelle marque.

**Color (tokens existants `.dark` dans `src/app/globals.css`, nommés pour l’équipe) :**

| Nom | Token | Valeur dark | Rôle |
|---|---|---|---|
| Ink | `--background` | `oklch(0.145 0 0)` | Fond app / scrim host |
| Panel | `--card` / `--popover` | `oklch(0.205 0 0)` | Carte chat, overlay |
| Recess | `--muted` | `oklch(0.269 0 0)` | Header overlay, skeletons |
| Paper | `--foreground` / `--primary` | `oklch(0.985 / 0.922 0 0)` | Texte, CTA primaire |
| Fog | `--muted-foreground` | `oklch(0.708 0 0)` | Phase, hints |
| Line | `--border` | `oklch(1 0 0 / 10%)` | Filets |
| Pulse | `violet-400` + `--sidebar-primary` | déjà le dock busy | Agent occupé |

**Type :** `--font-heading` + corps actuel (Arial/Helvetica via `body`). **Inter / serif display / mono labels interdits** (cliché landing). Measure chat et script ~65–75 car. (`max-w-[72ch]` déjà sur l’éditeur).

**Layout :**

- Overlay : sidebar **reste** ≥768px (on est encore dans Vidéos) ; le modal couvre l’inset. &lt;768px : overlay `inset-0` au-dessus de tout (`z-50`), safe-area.
- Colonne chat overlay : `mx-auto w-full max-w-3xl` (messages alignés à gauche, pas centrés comme un hero marketing).
- Révélation : `/videos/[id]` pleine largeur (plus de rail chat à droite). Chat = dock `fixed right-4 bottom-4` identique au canvas. `pb-24` sur l’éditeur pour ne pas cacher les champs.
- Une CTA primaire par surface : overlay = **C’est parti** ; kanban = **Nouvelle vidéo**.

**Principles :**

1. Même peau que ThumbGen — tokens, Lucide, `Card`, pas d’emoji structurants.
2. Un seul mouvement : overlay → dock (`transform` + `opacity`, origin bottom-right).
3. L’agent écrit dans des coques déjà dimensionnées.
4. Arc conversationnel dans les skills, jamais un stepper `01 / 02 / 03`.

**Revue clichés (frontend-design) — ce qui a été écarté :**

- Rose `#EC4899` + Inter + hero vidéo (sortie `--design-system`).
- Fond crème + serif + terracotta Claude.
- Noir + vert acide.
- Kit cartes SaaS identiques + ombre `rgba(0,0,0,.1)`.
- Eyebrows ALL CAPS, « WORD — fragment », flèches `→` sur les boutons.
- Stepper numéroté (interdit F3c de toute façon).

**Ce qu’on garde volontairement (déjà ThumbGen) :** pip violet busy, `font-heading text-2xl` des pages, Card `shadow-2xl` du dock.

### ASCII — overlay create

```
┌ sidebar ┬──────────────────────────────────────────────────────────┐
│ Vidéos  │ ░░░░░░░░░ scrim black/60 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ ●       │  ┌────────────────────────────────────────────────────┐ │
│ Miniat. │  │ Nouvelle vidéo              L’agent t’écoute [✕]  │ │
│ Biblio  │  │                                                    │ │
│         │  │  [avatar] Je vais d’abord lire tes dernières      │ │
│         │  │           fiches et tes textes de chaîne,         │ │
│         │  │           puis te demander le format de tournage. │ │
│         │  │                                                    │ │
│         │  │           [ C’est parti ]                          │ │
│         │  │                                                    │ │
│         │  │  ┌──────────────────────────────────────────────┐  │ │
│         │  │  │ /ecrire  Décris l’idée…                      │  │ │
│         │  │  └──────────────────────────────────────────────┘  │ │
│         │  └────────────────────────────────────────────────────┘ │
└─────────┴──────────────────────────────────────────────────────────┘
```

### ASCII — révélation fiche + dock

```
┌ sidebar ┬ titre éditable · Étiquettes · L’agent prépare les données ┐
│ Vidéos  ├────────────────────────────────────────────────────────────┤
│         │ Notes (min-h réservé)                                      │
│         │ Script ████████████  (coque min-h-64, pulse si vide)       │
│         │ Description ██████                                         │
│         │ A/B Titre — 3 lignes déjà là                               │
│         │                                              ┌──────────┐  │
│         │                                              │ dock 400 │  │
│         │                                              │ chat     │  │
│         │                                              └──────────┘  │
└─────────┴────────────────────────────────────────────────────────────┘
```

### Copy verrouillée (FR)

| Clé | Texte |
|---|---|
| Overlay title | Nouvelle vidéo |
| Phase `listening` | L’agent t’écoute |
| Phase `researching` | L’agent lit tes dernières vidéos… |
| Phase `asking_format` | L’agent précise le format de tournage |
| Phase `writing` | L’agent écrit titres, description et script… |
| Phase `filling` | L’agent prépare les données |
| Phase `done` | Brouillon prêt |
| CTA start | C’est parti |
| Hint composer | Décris l’idée, ou envoie /ecrire |
| Fermer | Fermer |
| Abandon title | Abandonner ce brouillon ? |
| Abandon body | La conversation sera perdue. La fiche vide sera supprimée. |
| Abandon confirm | Abandonner |
| Kanban hidden | (rien — pas de carte « En préparation ») |
| Empty board (inchangé) | Aucune vidéo pour l’instant |

---

## Product lock (comportement)

1. **Nouvelle vidéo** → `POST /api/studio/videos` `{ title: "Sans titre", etiquette: "Propositions" }` **immédiatement** → `router.replace("/videos?create=<videoId>")` → overlay chat `projectId=studio:<videoId>`.
2. Carte kanban **cachée** tant que `isStudioDraftVisible` est faux (titre encore `Sans titre`, summary vide, brouillon vide, pas d’URL).
3. Agent (corpus, ordre verrouillé) : **Document de chaîne** (`<channel_knowledge>` déjà injecté + `get_my_channel_knowledge` si le bloc compact est mince) → **vidéos / titres / descriptions / transcripts** déjà ingérés par Réglages → Connexion YouTube (`retrieve_own_corpus` hits `source: "channel"` **en premier**) → **fiches studio** (`list_studio_videos` + hits `source: "studio"`) → extras optionnels (chaînes suivies via `list_followed_videos`, seulement si le créateur le demande). Puis **une ou deux** questions format. Puis 3 titres A/B, description YouTube, script via upserts **incrémentaux**.
4. Premier `data-studio-draft-patch` → `router.push("/videos/<videoId>")`. Overlay se ferme. Chat **même conversation** (`conversations.project_id = studio:<videoId>`) → dock BR. Bannière `aria-live` : **L’agent prépare les données**. Champs se remplissent en live.
5. Après révélation, le dock peut **PATCH n’importe quel champ** de la fiche (`upsert_studio_script` : `title`, `summary`, `etiquette`, `script`, `description`, `title_variants`). Même conversation, pas un second agent.
6. Escape / Fermer : zéro message utilisateur → `DELETE` silencieux + `/videos`. Messages mais rien de visible → `ConfirmDialog` abandon. Déjà visible → aller sur `/videos/<id>`.
7. Edit kanban (« Modifier ») **garde** le petit dialog titre+notes. Seul le **create** change.
8. **Miniatures A/B (in-scope)** : sur la fiche, picker des projets canvas existants (`GET /api/miniatures`) + « Créer une miniature » (`createProject` → `proj_*`). Jusqu’à 3 liens `projects_meta.studio_video_id`. Afficher les covers 16:9 étiquetées A / B / C sous A/B Titre. Pas d’API YouTube « Tester et comparer ». TypeSafe : bouton pré-test des **titres** seulement si `typesafeApiKey` est set (sinon copy, zéro fetch).

---

## Orchestration verrouillée (create → dock)

Séquence unique. Pas un stepper UI. Les phases (`listening` → `done`) sont de la **copy** dérivée des noms d’outils.

1. Clic **Nouvelle vidéo** sur `/videos` → `POST /api/studio/videos` `{ title: "Sans titre", etiquette: "Propositions" }` (fiche `vid_` immédiate, carte kanban cachée).
2. `router.replace("/videos?create=<videoId>")` → `StudioCreateOverlay` + `ChatPanel` `layout="overlay"` `projectId=studio:<videoId>`.
3. CTA **C’est parti** (ou `/ecrire`) envoie le tour. `write_video` : ne **pas** `create_studio_video` (la fiche existe).
4. Agent lit `<channel_knowledge>` (Document de chaîne, déjà dans le system prompt). Si absent / trop mince : `get_my_channel_knowledge` et le dire (« corpus mince »).
5. `retrieve_own_corpus` sur le sujet (ou « dernières vidéos ») — hits **channel d’abord** (les ~N titres / descriptions / transcripts ingérés, ex. les 15/15 affichés sur la carte Réglages), puis drafts studio. `list_studio_videos` / `get_studio_video` pour les fiches locales. Interdit d’inventer d’anciennes vidéos. Interdit `research_topic` sauf demande (payant).
6. `read_skill studio_format` + `ask_user` (1–2 questions, face+écran / tuto / essai…). Attendre la réponse.
7. `studio_titles` → `upsert_studio_script` (`title` + `title_variants`). Premier patch → `router.push("/videos/<videoId>")`. Overlay unmount. **Même** `projectId` / conversation → `ChatPanel` `layout="dock"` (`fixed right-4 bottom-4`). `resumeStream` si le Dialog a démonté le panel.
8. `studio_description` puis `studio_script` → upserts incrémentaux. Bannière **L’agent prépare les données**. Coques déjà montées (pas de CLS).
9. `finish_turn` 1–2 phrases. Jamais le script entier dans le chat.
10. Tours suivants (dock) : même conversation. `upsert_studio_script` peut changer titre, notes, étiquette, script, description, lignes A/B. `link_studio_miniature` attache / détache un `proj_*` (jamais `generate_sketch` / `apply_workflow`).
11. Humain : **Lier une miniature** (picker `/api/miniatures`) ou **Créer une miniature** (nouveau canvas lié, navigation `/m/<id>`). La fiche montre jusqu’à 3 covers A/B/C.
12. Fermer le dock = minimize existant (`thumbgen.chat.open`). Escape ne quitte la fiche que depuis l’overlay.

---

## Skills — créer vs réutiliser

Ne **jamais** mélanger avec les skills miniature. `generate_sketch`, `apply_workflow`, `/croquis`, `thumbnail-packaging`, `existing-workflow`, `create-prompt` = canvas uniquement.

| Skill | Action | Quand | Outils | Never on canvas / never on studio |
|---|---|---|---|---|
| `write_video` | **Réécrire** le corps (existe) | Overlay **C’est parti**, `/ecrire`, « écris cette fiche » | `get_studio_video`, `get_my_channel_knowledge`, `retrieve_own_corpus`, `list_studio_videos`, `read_skill` studio_*, `ask_user`, `upsert_studio_script`, `finish_turn` | Never `generate_sketch` / `apply_workflow` / `create_studio_video` si `<studio_video>` est présent |
| `studio_format` | **Créer** | Après corpus, avant titres | `ask_user` | Never canvas |
| `studio_titles` | **Créer** | Après format | `upsert_studio_script` (`title`, `title_variants`) | Never canvas |
| `studio_description` | **Créer** | Après / avec titres | `upsert_studio_script` (`description`) | Never canvas |
| `studio_script` | **Créer** | Après format | `upsert_studio_script` (`script`) | Never canvas |
| `retrieve_own_corpus` | **Réutiliser** (frontmatter + priorité hits) | Avant de rédiger | outil homonyme | OK studio **et** canvas (lecture) |
| `upsert_studio_script` | **Réutiliser** (+ champs `title` / `summary` / `etiquette`) | Chaque bloc prêt + edits dock | outil homonyme | **Never on canvas** |
| `get_studio_video` / `list_studio_videos` | **Réutiliser** | Ouverture / corpus | outils homonymes | Lecture ; fill refusé hors `studio:` |
| `create_studio_video` | **Réutiliser** (skill : ne pas recréer) | Seulement si aucune fiche ouverte | outil homonyme | Overlay create ne l’appelle **pas**. **Never on canvas** |
| `get_my_channel_knowledge` | **Réutiliser** | Document de chaîne | outil homonyme | OK partout (lecture) |
| `search_my_channel` / `get_my_video` | **Réutiliser** | Zoom sur une des 15 vidéos / un transcript | outils homonymes | OK partout (lecture). Pas un ingest. |
| `extract_youtube_script` | **Réutiliser** | URL concurrente collée, pas le corpus maison | outil + cache `video_transcripts` | Studio + canvas. Ne remplace **pas** `retrieve_own_corpus`. |
| `list_projects` | **Réutiliser** | « Lie la miniature X » | outil homonyme | Lecture. Ne pas `apply_workflow` ensuite sur `studio:`. |
| `link_studio_miniature` | **Créer** (outil + SKILL.md) | Attacher / détacher / créer un `proj_*` | `link_studio_miniature` | **Never on canvas**. Interdit `generate_sketch`. |
| `generate_sketch` / `apply_workflow` / `place_node` / `get_canvas_state` / `view_canvas_images` / `list_past_generations` | **Réutiliser tels quels** | Canvas `/m/[id]` seulement | déjà là | **Never on studio** |
| `thumbnail-packaging` / `existing-workflow` / `create-prompt` | **Réutiliser tels quels** | Nouvelle miniature / canvas ouvert | déjà là | **Never on studio** (slash filtrés) |
| `research_topic` | **Réutiliser** | Seulement si le créateur le demande | payant | Studio + canvas, jamais auto dans `write_video` |

Slash (Task 4) : `/ecrire` `/format` `/titres` `/desc` `/scenario` = `surfaces: ["studio"]`. `/croquis` `/miniature` `/canvas` `/create-prompt` = `["canvas"]`.

---

## Templates (deux objets — ne pas les confondre)

### (a) Template d’écriture / Vibe Coding — **c’est celui que l’agent d’écriture respecte**

Déjà dans le code : `src/lib/studio/page-template.ts` (`emptyStudioDraft`, labels **Script Vidéo longue**, **Description** apprentissages + timestamps + hashtags, table **A/B Titre** 3 lignes Titre / Texte miniature / Concept visuel). Le markdown d’import a aussi une zone `## Miniature` + « Miniature A/B/C » (`renderStudioPageMarkdown`) — ce n’est **pas** un workflow canvas, ce sont des **emplacements** pour les 3 projets liés (Tasks 18–19).

`write_video` / `studio_*` calquent **cette forme** (structure de script selon `studio_format`, pas un wizard 9 étapes figé). Référence métier aussi dans writing-studio Chunk 1.

### (b) « Template de la miniature » — workflow canvas, **hors surface Vidéos**

C’est `thumbnail-packaging` (nouvelle miniature) + `existing-workflow` / `apply_workflow` (graphe ouvert, A/B/C sur **un** generator). Galerie `/miniatures`, canvas `/m/[id]`, `createProject` → `proj_*`. **Interdit** sur `studio:*`. On n’applique pas ce template depuis le chat d’écriture : on **lie** un projet canvas déjà créé (ou on en crée un vide et on envoie le créateur sur `/m/[id]`).

Si le chef dit « respecte le template de la miniature » en parlant de la **fiche** : il parle de la zone Miniature A/B/C du modèle Vibe Coding (a), pas du graphe React Flow (b).

---

## Corpus YouTube — ce qui existe déjà (pas un nouvel ingest)

La copy Réglages **« Document de chaîne — Produit après l'analyse. L'agent et le MCP s'en servent… N vidéos · N transcriptions · date »** est `ChannelKnowledgeCard` (`videoCount` / `transcriptCount` / `generatedAt`). Ce n’est **pas** un vœu : l’ingest tourne déjà après Connexion YouTube.

| Donnée | Déjà stockée ? | Où | Qui remplit |
|---|---|---|---|
| Titres | **Oui** | `channel_videos.title` | `syncChannel` → `upsertVideos` |
| Descriptions | **Oui** (tronquées API ~4000) | `channel_videos.description` | idem |
| Transcripts publics | **Oui, auto** | `video_transcripts` (`source=timedtext` ou `none`) | `runIngest` → `ingestTranscripts` (`youtube-transcript`, pas Whisper) |
| FTS titres / extraits | **Oui** | `video_knowledge_fts` | `indexTranscript` à chaque upsert |
| Document de chaîne | **Oui, après analyse** | `channel_knowledge` (md + json + counts) | `generateChannelKnowledge` (OpenRouter — déjà fait à l’analyse, **ne pas relancer** dans ce plan) |
| Injection agent | **Oui** | `<channel_knowledge>` via `loadAgentPromptPrefs` | chaque tour Brainstorm |
| Outils lecture | **Oui** | `get_my_channel_knowledge`, `search_my_channel`, `get_my_video` | déjà MCP |
| Drafts studio | **Oui, autre table** | `studio_videos` / `studio_drafts` / `studio_corpus_fts` | CRUD Vidéos, pas l’ingest YouTube |

**Pas de nouvelle tâche d’ingest.** Les 15 vidéos / 15 transcripts de la carte sont déjà en SQLite. Le trou aujourd’hui : `retrieveOwnCorpus` cherche **d’abord** les fiches studio puis Ma chaîne, et `write_video` ne nomme pas le Document de chaîne. Task 17 inverse la priorité et verrouille l’arc. Extras « Ma chaîne » (autres chaînes suivies, `list_followed_videos scope=all`) = optionnels, jamais un prérequis.

**Oui :** l’agent d’écriture **doit** se caler sur le Document de chaîne **et** sur ces transcripts / titres / descriptions. Pas un maybe.

---

## Miniatures A/B sur la fiche (in-scope, aligné Phase 2)

Deux métiers, un lien local :

| | Fiche Vidéos | Projet canvas |
|---|---|---|
| Id | `vid_…` / chat `studio:vid_…` | `proj_…` / route `/m/…` |
| A/B ici | 3 covers liées + 3 lignes de titres | Variantes image sur le generator (`abTest`) |

- **Lier** un projet existant (picker = `GET /api/miniatures`, déjà `coverImageUrl` + `imageCount`).
- **Créer** un canvas vide nommé d’après le titre de fiche (`createProject` actuel, id `proj_${Date.now()}`), poser `studio_video_id`, ouvrir `/m/<id>`.
- **Afficher** jusqu’à 3 cartes 16:9, badges A / B / C (ordre `updated_at` desc). Lien vers le canvas. Unlink.
- 4ᵉ lien → 400 « Trois miniatures maximum pour le test A/B ».
- **Pas** `videos.update`, pas d’API Studio Test & Compare, pas d’upload cloud.
- TypeSafe : pré-test **texte des titres** (`jevClickNouls` / wrapper local) si clé ; sinon message Réglages → Connexions, aucun `fetch`.
- L’agent dock : `link_studio_miniature` (link / unlink / create). Interdit de dessiner la miniature depuis Vidéos.

---

## File Structure

**Create**

- `src/lib/studio/visibility.ts` — `isEmptyStudioDraft`, `isStudioDraftVisible`
- `src/lib/studio/agent-surface.ts` — `AgentSurface`, sets d’outils, `agentSurfaceFromProjectId`, `refuseWrongSurface`
- `src/lib/studio/agent-phase.ts` — `StudioAgentPhase`, copy, `phaseFromToolName`, `advanceStudioPhase`
- `src/lib/studio/draft-patch.ts` — `STUDIO_DRAFT_PATCH_PART`, `StudioDraftPatch`, guards
- `src/store/studio-live-store.ts` — dernier patch + phase (client)
- `src/lib/agent/skills/studio_format/SKILL.md`
- `src/lib/agent/skills/studio_titles/SKILL.md`
- `src/lib/agent/skills/studio_description/SKILL.md`
- `src/lib/agent/skills/studio_script/SKILL.md`
- `src/components/studio/StudioChatHost.tsx`
- `src/components/studio/StudioCreateOverlay.tsx`
- `src/components/studio/StudioEditorChrome.tsx` — bannière + skeletons de section
- `src/app/videos/layout.tsx`
- `src/lib/studio/link-project.ts` — `linkProjectToStudio`, `unlinkProjectFromStudio`, `listProjectsForStudio`, `createMiniatureForStudio`
- `src/app/api/studio/videos/[videoId]/miniature/route.ts`
- `src/lib/agent/tools/link-studio-miniature.ts`
- `src/lib/agent/skills/link_studio_miniature/SKILL.md`
- `src/components/studio/LinkedThumbs.tsx`
- `src/lib/studio/title-pretest.ts` — wrapper TypeSafe local, zéro fetch sans clé
- Tests listés par task

**Modify**

- `src/lib/agent/skills/slash-catalog.ts` — `surfaces`, nouveaux slash, descriptions Vidéos
- `src/lib/agent/skills/slash-query.ts` — `filterSlashSkills(query, surface?)`
- `src/lib/agent/skills/invoked-skill.ts` — sujets ouverts studio
- `src/lib/agent/skills/write_video/SKILL.md` — orchestrateur
- `src/lib/agent/skills/retrieve_own_corpus/SKILL.md` — mention Vidéos / pas miniature
- `src/lib/agent/skills/upsert_studio_script/SKILL.md` — upserts incrémentaux + `title`
- `src/lib/agent/skills/create_studio_video/SKILL.md` — ne pas recréer si fiche ouverte
- `src/lib/agent/system-prompt.ts` — `buildAgentSurfaceBlock`
- `src/lib/agent/tool-labels.ts` — + `link_studio_miniature` ; les `studio_*` restent skills only
- `src/lib/agent/tools/upsert-studio-script.ts` — champs `title` / `summary` / `etiquette` optionnels
- `src/lib/studio/corpus.ts` — hits `channel` avant `studio` (Task 17)
- `src/lib/db.ts` — `ALTER projects_meta ADD studio_video_id` (même contrat writing-studio Task 13)
- `src/lib/agent/v2/route-handler.ts` — garde surface + broadcast patch
- `src/lib/agent/v2/place-node-tool.ts` — refuse si `studio:`
- `src/components/panels/ChatPanel.tsx` — `layout`, `onToolName`, surface composer
- `src/components/panels/chat/Composer.tsx` — `surface`
- `src/components/studio/VideosBoard.tsx` — create overlay URL ; filtre cartes
- `src/components/studio/VideoEditor.tsx` — plus de rail chat ; live patch ; chrome ; section Miniatures A/B
- `src/components/studio/TitleVariantsTable.tsx` — bouton pré-test titres (Task 20)
- `src/app/videos/page.tsx` — sidebar sorti vers layout
- `src/app/videos/[videoId]/page.tsx` — idem
- Tests existants : `videos-board`, `video-editor`, `slash-catalog`, `system-prompt-studio`, `invoked-skill`, `studio-tools`, `corpus`

**Do not create**

- `design-system/` à la racine
- Second agent / second ChatPanel
- Client Notion
- Stepper UI
- Nouvelle table SQLite (store Phase 1 + `ALTER` `studio_video_id` suffisent)
- Client YouTube Test & Compare / `videos.update`

---

## Types partagés (contrat pour toutes les tasks)

```ts
// src/lib/studio/agent-surface.ts
export type AgentSurface = "studio" | "canvas";

export const STUDIO_FILL_TOOLS = ["upsert_studio_script", "create_studio_video", "link_studio_miniature"] as const;
export const CANVAS_ONLY_TOOLS = [
  "generate_sketch",
  "apply_workflow",
  "place_node",
  "get_canvas_state",
  "view_canvas_images",
  "list_past_generations",
] as const;

// src/lib/studio/agent-phase.ts
export const STUDIO_AGENT_PHASES = [
  "listening",
  "researching",
  "asking_format",
  "writing",
  "filling",
  "done",
] as const;
export type StudioAgentPhase = (typeof STUDIO_AGENT_PHASES)[number];

// src/lib/studio/draft-patch.ts
export const STUDIO_DRAFT_PATCH_PART = "data-studio-draft-patch" as const;
export type StudioDraftPatch = {
  videoId: string;
  projectId: string;
  updatedAt: string;
  previousUpdatedAt: string;
  title: string;
  summary: string;
  script: string;
  description: string;
  titleVariants: StudioDraft["titleVariants"];
  phase: "filling";
};
```

`ChatPanel` : `layout?: "dock" | "overlay"` (défaut `"dock"`).  
Slash : `surfaces: readonly AgentSurface[]` sur chaque `SlashSkill`.

---

### Task 1: Visibilité des brouillons vides

**Files:**
- Create: `src/lib/studio/visibility.ts`
- Test: `tests/studio/visibility.test.ts`

**Interfaces:**
- Consumes: `UNTITLED_STUDIO_VIDEO`, `StudioDraft`, `StudioVideo` (`src/lib/studio/types.ts`)
- Produces: `isEmptyStudioDraft(draft: StudioDraft): boolean`, `isStudioDraftVisible(video: Pick<StudioVideo, "title" | "summary" | "draft" | "youtubeUrl">): boolean`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { emptyStudioDraft } from "@/lib/studio/page-template";
import { UNTITLED_STUDIO_VIDEO } from "@/lib/studio/types";
import { isEmptyStudioDraft, isStudioDraftVisible } from "@/lib/studio/visibility";

function video(overrides: Partial<Parameters<typeof isStudioDraftVisible>[0]> = {}) {
  return {
    title: UNTITLED_STUDIO_VIDEO,
    summary: "",
    youtubeUrl: null,
    draft: emptyStudioDraft(),
    ...overrides,
  };
}

describe("studio draft visibility", () => {
  it("hides a freshly created Sans titre fiche", () => {
    expect(isEmptyStudioDraft(emptyStudioDraft())).toBe(true);
    expect(isStudioDraftVisible(video())).toBe(false);
  });

  it("shows a fiche once the title, notes, draft or URL exists", () => {
    expect(isStudioDraftVisible(video({ title: "OpenClaw est mort" }))).toBe(true);
    expect(isStudioDraftVisible(video({ summary: "Angle équipe AI" }))).toBe(true);
    expect(isStudioDraftVisible(video({ youtubeUrl: "https://youtu.be/abcdefghijk" }))).toBe(true);
    const draft = emptyStudioDraft();
    draft.script = "## 1. Introduction\nHook.";
    expect(isStudioDraftVisible(video({ draft }))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/studio/visibility.test.ts`

Expected: FAIL — `Cannot find module '@/lib/studio/visibility'`

- [ ] **Step 3: Write minimal implementation**

```ts
import { UNTITLED_STUDIO_VIDEO, type StudioDraft, type StudioVideo } from "./types";

export function isEmptyStudioDraft(draft: StudioDraft): boolean {
  return (
    draft.script.trim() === "" &&
    draft.description.trim() === "" &&
    draft.titleVariants.every(
      (row) => row.title.trim() === "" && row.thumbText.trim() === "" && row.visualConcept.trim() === "",
    )
  );
}

export function isStudioDraftVisible(
  video: Pick<StudioVideo, "title" | "summary" | "draft" | "youtubeUrl">,
): boolean {
  if (video.youtubeUrl) return true;
  if (video.summary.trim()) return true;
  if (!isEmptyStudioDraft(video.draft)) return true;
  const title = video.title.trim();
  return title.length > 0 && title !== UNTITLED_STUDIO_VIDEO;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/studio/visibility.test.ts`

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add tests/studio/visibility.test.ts src/lib/studio/visibility.ts
git commit -m "$(cat <<'EOF'
feat(studio): hide empty Sans titre fiches from the writing board

EOF
)"
```

---

### Task 2: Surface agent + refus d’outils

**Files:**
- Create: `src/lib/studio/agent-surface.ts`
- Test: `tests/agent/studio-surface-guard.test.ts`

**Interfaces:**
- Consumes: `isWritingProjectId`, `ToolResult`
- Produces: `agentSurfaceFromProjectId(projectId: string | undefined): AgentSurface`, `refuseWrongSurface(toolName: string, projectId: string | undefined): ToolResult | null`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { agentSurfaceFromProjectId, refuseWrongSurface } from "@/lib/studio/agent-surface";

describe("agent surface guard", () => {
  it("maps studio: ids to studio and everything else to canvas", () => {
    expect(agentSurfaceFromProjectId("studio:vid_abc")).toBe("studio");
    expect(agentSurfaceFromProjectId("proj_1")).toBe("canvas");
    expect(agentSurfaceFromProjectId(undefined)).toBe("canvas");
  });

  it("refuses croquis tools on a writing fiche and studio fill tools on a canvas", () => {
    const sketch = refuseWrongSurface("generate_sketch", "studio:vid_abc");
    expect(sketch?.isError).toBe(true);
    expect((sketch?.content[0] as { text: string }).text).toMatch(/Vidéos|studio|écriture/i);
    expect((sketch?.content[0] as { text: string }).text).not.toMatch(/Étape\s+\d/);

    const upsert = refuseWrongSurface("upsert_studio_script", "proj_1");
    expect(upsert?.isError).toBe(true);
    expect((upsert?.content[0] as { text: string }).text).toMatch(/miniature|canvas/i);

    expect(refuseWrongSurface("retrieve_own_corpus", "studio:vid_abc")).toBeNull();
    expect(refuseWrongSurface("retrieve_own_corpus", "proj_1")).toBeNull();
    expect(refuseWrongSurface("ask_user", "studio:vid_abc")).toBeNull();
    expect(refuseWrongSurface("get_my_channel_knowledge", "studio:vid_abc")).toBeNull();
    expect(refuseWrongSurface("link_studio_miniature", "proj_1")?.isError).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/agent/studio-surface-guard.test.ts`

Expected: FAIL — module missing

- [ ] **Step 3: Write minimal implementation**

```ts
import { isWritingProjectId } from "./types";
import type { ToolResult } from "@/lib/agent/tools/types";

export type AgentSurface = "studio" | "canvas";

export const STUDIO_FILL_TOOLS = ["upsert_studio_script", "create_studio_video", "link_studio_miniature"] as const;
export const CANVAS_ONLY_TOOLS = [
  "generate_sketch",
  "apply_workflow",
  "place_node",
  "get_canvas_state",
  "view_canvas_images",
  "list_past_generations",
] as const;

const STUDIO_FILL = new Set<string>(STUDIO_FILL_TOOLS);
const CANVAS_ONLY = new Set<string>(CANVAS_ONLY_TOOLS);

export function agentSurfaceFromProjectId(projectId: string | undefined): AgentSurface {
  return projectId && isWritingProjectId(projectId) ? "studio" : "canvas";
}

export function refuseWrongSurface(toolName: string, projectId: string | undefined): ToolResult | null {
  const surface = agentSurfaceFromProjectId(projectId);
  if (surface === "studio" && CANVAS_ONLY.has(toolName)) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Outil canvas (${toolName}) refusé sur une fiche Vidéos / studio. Reste sur write_video, studio_format, studio_titles, studio_description, studio_script. Pas de croquis ni de workflow miniature ici.`,
        },
      ],
    };
  }
  if (surface === "canvas" && STUDIO_FILL.has(toolName)) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Outil d’écriture studio (${toolName}) refusé sur le canvas miniature. Ouvre Vidéos / une fiche, ou utilise generate_sketch / apply_workflow ici.`,
        },
      ],
    };
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/agent/studio-surface-guard.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/studio/agent-surface.ts tests/agent/studio-surface-guard.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): refuse canvas tools on writing chats and studio fills on canvas

EOF
)"
```

---

### Task 3: Phases agent (copy + dérivation)

**Files:**
- Create: `src/lib/studio/agent-phase.ts`
- Test: `tests/studio/agent-phase.test.ts`

**Interfaces:**
- Consumes: `StudioAgentPhase`
- Produces: `STUDIO_PHASE_COPY`, `phaseFromToolName(name: string): StudioAgentPhase | null`, `advanceStudioPhase(current: StudioAgentPhase, toolName: string): StudioAgentPhase`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { STUDIO_PHASE_COPY, advanceStudioPhase, phaseFromToolName } from "@/lib/studio/agent-phase";

describe("studio agent phase", () => {
  it("uses the locked French copy and never a step index", () => {
    expect(STUDIO_PHASE_COPY.listening).toBe("L’agent t’écoute");
    expect(STUDIO_PHASE_COPY.researching).toBe("L’agent lit tes dernières vidéos…");
    expect(STUDIO_PHASE_COPY.asking_format).toBe("L’agent précise le format de tournage");
    expect(STUDIO_PHASE_COPY.writing).toBe("L’agent écrit titres, description et script…");
    expect(STUDIO_PHASE_COPY.filling).toBe("L’agent prépare les données");
    expect(STUDIO_PHASE_COPY.done).toBe("Brouillon prêt");
    for (const label of Object.values(STUDIO_PHASE_COPY)) {
      expect(label).not.toMatch(/Étape\s+\d/);
      expect(label).not.toMatch(/\/7/);
    }
  });

  it("advances listening → researching → asking_format → writing → filling → done", () => {
    expect(phaseFromToolName("retrieve_own_corpus")).toBe("researching");
    expect(phaseFromToolName("list_studio_videos")).toBe("researching");
    expect(phaseFromToolName("upsert_studio_script")).toBe("filling");
    expect(phaseFromToolName("finish_turn")).toBe("done");
    expect(advanceStudioPhase("listening", "retrieve_own_corpus")).toBe("researching");
    expect(advanceStudioPhase("researching", "ask_user")).toBe("asking_format");
    expect(advanceStudioPhase("asking_format", "read_skill")).toBe("writing");
    expect(advanceStudioPhase("writing", "upsert_studio_script")).toBe("filling");
    expect(advanceStudioPhase("filling", "finish_turn")).toBe("done");
    expect(advanceStudioPhase("filling", "retrieve_own_corpus")).toBe("filling");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/studio/agent-phase.test.ts`

Expected: FAIL — module missing

- [ ] **Step 3: Write minimal implementation**

```ts
export const STUDIO_AGENT_PHASES = [
  "listening",
  "researching",
  "asking_format",
  "writing",
  "filling",
  "done",
] as const;
export type StudioAgentPhase = (typeof STUDIO_AGENT_PHASES)[number];

export const STUDIO_PHASE_COPY: Record<StudioAgentPhase, string> = {
  listening: "L’agent t’écoute",
  researching: "L’agent lit tes dernières vidéos…",
  asking_format: "L’agent précise le format de tournage",
  writing: "L’agent écrit titres, description et script…",
  filling: "L’agent prépare les données",
  done: "Brouillon prêt",
};

const ORDER: readonly StudioAgentPhase[] = STUDIO_AGENT_PHASES;

function atLeast(current: StudioAgentPhase, next: StudioAgentPhase): StudioAgentPhase {
  return ORDER.indexOf(next) < ORDER.indexOf(current) ? current : next;
}

export function phaseFromToolName(name: string): StudioAgentPhase | null {
  if (name === "retrieve_own_corpus" || name === "list_studio_videos" || name === "get_studio_video") {
    return "researching";
  }
  if (name === "ask_user") return "asking_format";
  if (name === "read_skill") return "writing";
  if (name === "upsert_studio_script") return "filling";
  if (name === "finish_turn") return "done";
  return null;
}

export function advanceStudioPhase(current: StudioAgentPhase, toolName: string): StudioAgentPhase {
  const hinted = phaseFromToolName(toolName);
  if (!hinted) return current;
  return atLeast(current, hinted);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/studio/agent-phase.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/studio/agent-phase.ts tests/studio/agent-phase.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): map writing-tool names to agent phase copy

EOF
)"
```

---

### Task 4: Slash catalog par surface

**Files:**
- Modify: `src/lib/agent/skills/slash-catalog.ts`
- Modify: `src/lib/agent/skills/slash-query.ts` (`filterSlashSkills`)
- Test: `tests/agent/slash-catalog.test.ts`

**Interfaces:**
- Consumes: `AgentSurface`
- Produces: `SlashSkill.surfaces`, `slashSkillsForSurface(surface: AgentSurface): SlashSkill[]`, `filterSlashSkills(query: string, surface?: AgentSurface): SlashSkill[]`

Relire `slash-catalog.ts` et `slash-query.ts` avant d’éditer.

- [ ] **Step 1: Write the failing assertions** (ajouter à `tests/agent/slash-catalog.test.ts`, garder les tests croquis / create-prompt / ecrire)

```ts
import { slashSkillsForSurface } from "@/lib/agent/skills/slash-catalog";
import { filterSlashSkills } from "@/lib/agent/skills/slash-query";

it("keeps /ecrire studio-only and never offers croquis on Vidéos", () => {
  const studio = slashSkillsForSurface("studio");
  const canvas = slashSkillsForSurface("canvas");
  expect(studio.map((row) => row.slash)).toEqual(
    expect.arrayContaining(["ecrire", "format", "titres", "desc", "scenario"]),
  );
  expect(studio.some((row) => row.skill === "generate_sketch")).toBe(false);
  expect(studio.some((row) => row.slash === "croquis")).toBe(false);
  expect(studio.some((row) => row.slash === "canvas")).toBe(false);
  expect(canvas.some((row) => row.slash === "ecrire")).toBe(false);
  expect(canvas.some((row) => row.slash === "croquis")).toBe(true);
  expect(filterSlashSkills("", "studio").some((row) => row.slash === "croquis")).toBe(false);
  expect(filterSlashSkills("cro", "studio")).toHaveLength(0);
});

it("marks writing slashes as Vidéos / studio, never miniatures", () => {
  for (const slash of ["ecrire", "format", "titres", "desc", "scenario"]) {
    const row = SLASH_SKILLS.find((entry) => entry.slash === slash);
    expect(row, slash).toBeTruthy();
    expect(row!.description).toMatch(/Vidéos|studio/i);
    expect(row!.description).not.toMatch(/miniature|croquis|canvas/i);
    expect(row!.surfaces).toEqual(["studio"]);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/agent/slash-catalog.test.ts`

Expected: FAIL — `slashSkillsForSurface` / `surfaces` / nouveaux slash absents

- [ ] **Step 3: Write minimal implementation**

`SlashSkill` gagne `surfaces: readonly AgentSurface[]`.

Mapping verrouillé (ajouter les 4 lignes studio, annoter toutes les existantes) :

```ts
import type { AgentSurface } from "@/lib/studio/agent-surface";

export type SlashSkill = {
  slash: string;
  aliases?: readonly string[];
  skill: string;
  title: string;
  description: string;
  surfaces: readonly AgentSurface[];
};

export const SLASH_SKILLS: SlashSkill[] = [
  {
    slash: "ecrire",
    aliases: ["write"],
    skill: "write_video",
    title: "Écrire une vidéo",
    description: "Vidéos / studio : corpus, format, script, titres et description YouTube.",
    surfaces: ["studio"],
  },
  {
    slash: "format",
    skill: "studio_format",
    title: "Format de tournage",
    description: "Vidéos / studio : préciser la mise en forme (face + écran, tuto, essai…).",
    surfaces: ["studio"],
  },
  {
    slash: "titres",
    skill: "studio_titles",
    title: "Titres A/B",
    description: "Vidéos / studio : trois lignes Titre / texte miniature / concept.",
    surfaces: ["studio"],
  },
  {
    slash: "desc",
    skill: "studio_description",
    title: "Description YouTube",
    description: "Vidéos / studio : apprentissages, timestamps et hashtags.",
    surfaces: ["studio"],
  },
  {
    slash: "scenario",
    skill: "studio_script",
    title: "Script",
    description: "Vidéos / studio : texte long calé sur le format de tournage.",
    surfaces: ["studio"],
  },
  {
    slash: "croquis",
    skill: "generate_sketch",
    title: "Croquis",
    description: "Brainstorm puis dessine un croquis (pas la miniature finale).",
    surfaces: ["canvas"],
  },
  {
    slash: "create-prompt",
    aliases: ["create-propt"],
    skill: "create-prompt",
    title: "Create prompt",
    description: "Écrit un prompt image et le pose sur le nœud prompt.",
    surfaces: ["canvas"],
  },
  {
    slash: "miniature",
    skill: "thumbnail-packaging",
    title: "Nouvelle miniature",
    description: "Promesse, titres, textes miniature, packs A/B.",
    surfaces: ["canvas"],
  },
  {
    slash: "canvas",
    skill: "existing-workflow",
    title: "Workflow existant",
    description: "Analyse ou modifie le canvas ouvert.",
    surfaces: ["canvas"],
  },
  {
    slash: "recherche",
    skill: "research_topic",
    title: "Recherche",
    description: "Brief du sujet (Perplexity ou OpenRouter, payant).",
    surfaces: ["studio", "canvas"],
  },
  {
    slash: "concurrents",
    skill: "find_competitor_thumbnails",
    title: "Concurrents",
    description: "Miniatures qui performent dans la niche.",
    surfaces: ["canvas"],
  },
  {
    slash: "script",
    skill: "extract_youtube_script",
    title: "Script YouTube",
    description: "Transcription d'une vidéo collée.",
    surfaces: ["studio", "canvas"],
  },
  {
    slash: "youtube",
    skill: "search_youtube",
    title: "Chercher YouTube",
    description: "Recherche publique de vidéos.",
    surfaces: ["studio", "canvas"],
  },
  {
    slash: "logos",
    skill: "find_logos",
    title: "Logos",
    description: "Trouver des marques à coller sur la miniature.",
    surfaces: ["canvas"],
  },
];

export function slashSkillsForSurface(surface: AgentSurface): SlashSkill[] {
  return SLASH_SKILLS.filter((row) => row.surfaces.includes(surface));
}
```

`filterSlashSkills` :

```ts
export function filterSlashSkills(query: string, surface?: AgentSurface): SlashSkill[] {
  const pool = surface ? slashSkillsForSurface(surface) : [...SLASH_SKILLS];
  const needle = query.trim().toLowerCase();
  if (!needle) return [...pool];
  return pool.filter((row) => {
    return (
      row.slash.includes(needle) ||
      row.skill.toLowerCase().includes(needle) ||
      row.title.toLowerCase().includes(needle) ||
      row.description.toLowerCase().includes(needle) ||
      row.aliases?.some((alias) => alias.includes(needle))
    );
  });
}
```

Les tests existants `objectContaining` sur `/ecrire` restent valides (ils n’exigent pas l’absence de `surfaces`).

- [ ] **Step 4: Run tests**

Run: `./node_modules/.bin/vitest run tests/agent/slash-catalog.test.ts tests/chat/skill-picker-render.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/skills/slash-catalog.ts src/lib/agent/skills/slash-query.ts tests/agent/slash-catalog.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): split slash picker skills by Vidéos vs canvas surface

EOF
)"
```

---

### Task 5: Skills d’écriture (dossiers SKILL.md)

**Files:**
- Create: `src/lib/agent/skills/studio_format/SKILL.md`
- Create: `src/lib/agent/skills/studio_titles/SKILL.md`
- Create: `src/lib/agent/skills/studio_description/SKILL.md`
- Create: `src/lib/agent/skills/studio_script/SKILL.md`
- Modify: `src/lib/agent/skills/write_video/SKILL.md`
- Modify: `src/lib/agent/skills/retrieve_own_corpus/SKILL.md`
- Modify: `src/lib/agent/skills/upsert_studio_script/SKILL.md`
- Modify: `src/lib/agent/skills/create_studio_video/SKILL.md`
- Modify: `src/lib/agent/skills/invoked-skill.ts`
- Test: `tests/agent/invoked-skill.test.ts`, `tests/agent/slash-catalog.test.ts` (déjà : catalog ⊂ SKILL.md)

**Interfaces:**
- Consumes: `readSkillBody`, `listSkillCatalog` (scan dossiers)
- Produces: skills `studio_format`, `studio_titles`, `studio_description`, `studio_script` ; `skillHasOpenSubject` inclut ces noms + `write_video`

- [ ] **Step 1: Write the failing test** (ajouter dans `invoked-skill.test.ts`)

```ts
it("treats studio writing slashes as already having an open fiche", () => {
  for (const slash of ["/ecrire", "/format", "/titres", "/desc", "/scenario"]) {
    const invoked = resolveInvokedSkill(slash)!;
    expect(invoked, slash).toBeTruthy();
    const block = buildInvokedSkillBlock(invoked, { ideaEmpty: true });
    expect(block).not.toContain("The idea is EMPTY");
    expect(block).toMatch(/Vidéos|studio|write_video|format de tournage/i);
    expect(block).not.toMatch(/Étape\s+\d/);
    expect(block).not.toContain("generate_sketch");
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/agent/invoked-skill.test.ts`

Expected: FAIL — `studio_format` body missing / idea EMPTY for `/format`

- [ ] **Step 3: Write the skill files and invoked-skill update**

`src/lib/agent/skills/studio_format/SKILL.md` :

```md
---
name: studio_format
description: Vidéos / studio — interview the production format (face+screen-share, essay, tutorial…) before writing structure. Never for canvas miniatures.
---

# studio_format

You are clarifying **how this video will be shot**, not the thumbnail.

Not generate_sketch. Not apply_workflow. No « Étape n/7 ».

## When

- write_video after retrieve_own_corpus, before titles/script
- /format

## When not

- They only want a thumbnail → stop, they are on the wrong surface
- Format already answered in this conversation — do not re-ask

## How

1. Ask 1 or 2 questions with ask_user (not a list of 7). Examples of formats, in their language:
   - Face caméra puis partage d’écran (intro visage, puis outil)
   - Face caméra essai / opinion
   - Voix off + captures
   - Tuto étapes
   - Interview / invité
2. Remember the answer: it drives studio_script headings (a screen-share video is not 9 essay H2).
3. Do not upsert yet.
```

`src/lib/agent/skills/studio_titles/SKILL.md` :

```md
---
name: studio_titles
description: Vidéos / studio — write 3 A/B title rows (Titre, texte miniature, concept visuel) for the open fiche. Never for canvas miniatures.
---

# studio_titles

Open fiche only (`<studio_video>` / studio:<videoId>).

## How

1. Ground on retrieve_own_corpus hits already in the thread (call it if missing).
2. Propose 3 rows: title, thumbText, visualConcept.
3. upsert_studio_script with title_variants and title = the working fiche title (first row or a short working title). Do not paste all titles in finish_turn.summary.
```

`src/lib/agent/skills/studio_description/SKILL.md` :

```md
---
name: studio_description
description: Vidéos / studio — write the YouTube description (learnings, timestamps, hashtags) for the open fiche. Never for canvas miniatures.
---

# studio_description

House shape: apprentissages + timestamps + hashtags. Mirror their old descriptions from corpus hits. upsert_studio_script description only (or with other fields if already agreed). No Notion. No full dump in chat.
```

`src/lib/agent/skills/studio_script/SKILL.md` :

```md
---
name: studio_script
description: Vidéos / studio — write the spoken video text structured for the agreed production format. Never for canvas miniatures.
---

# studio_script

Structure follows **studio_format**, not a fixed 9-step wizard. Face+screen-share → short face intro, then screen sections. Essay → numbered H2 when it fits. Subscribe CTA in the intro if that is their habit in corpus hits.

upsert_studio_script script field. finish_turn 1–2 sentences, never the full script.
```

Remplacer le corps de `write_video/SKILL.md` par :

```md
---
name: write_video
description: Vidéos / studio orchestrator — corpus, production format, then titles, YouTube description and script on the open fiche. Never for canvas miniatures.
---

# write_video

You help write ONE ThumbGen fiche (`studio:<videoId>` in <studio_video> or <project_id>).

Not a thumbnail journey. Not generate_sketch. Not apply_workflow. No « Étape n/7 ».

## When

- /ecrire, overlay « C’est parti », or they ask to write the open video
- A fiche is already open — never create_studio_video

## When not

- Canvas / miniature → thumbnail-packaging
- Competitor URL only to package a thumb → extract_youtube_script

## How (loose arc, not a UI stepper)

1. get_studio_video + list_studio_videos (their last fiches). Read `<channel_knowledge>` (Document de chaîne from Réglages). If missing or too thin, call get_my_channel_knowledge. Then retrieve_own_corpus with the subject or « dernières vidéos » (3–8 hits). Channel hits (ingested titles / descriptions / transcripts — the same videos counted on Document de chaîne) come first; studio drafts second. Quote THOSE hits. Optional extras (followed channels, list_followed_videos) only if they ask. If empty: say the corpus is thin; use Document de chaîne + <channel_profile> only. Do not invent old videos. Do not call research_topic unless they ask (paid). Do not re-run channel ingest / generateChannelKnowledge.
2. read_skill studio_format. Ask production format (face+écran, tuto, essai…) with ask_user. Wait for the answer.
3. read_skill studio_titles then upsert_studio_script (title_variants + title). The editor will appear — do not dump titles in chat.
4. read_skill studio_description then upsert description.
5. read_skill studio_script then upsert script (structure = the format they chose, house shape from page-template — not a fixed 9-step wizard).
6. Later turns on this same conversation: upsert any field (title, summary/notes, etiquette, script, description, title_variants). link_studio_miniature to attach an existing proj_* for A/B. Never generate_sketch / apply_workflow.
7. finish_turn last, alone: 1–2 sentences. Never paste the full script.

Upsert incrementally as soon as a block is ready so the fiche fills live.
```

Mettre à jour les `description:` frontmatter de `retrieve_own_corpus`, `upsert_studio_script`, `create_studio_video` pour contenir `Vidéos / studio` et `Never for canvas miniatures` / `not a thumbnail tool`.

`invoked-skill.ts` — remplacer `skillHasOpenSubject` :

```ts
function skillHasOpenSubject(skill: string): boolean {
  return (
    skill === "write_video" ||
    skill === "studio_format" ||
    skill === "studio_titles" ||
    skill === "studio_description" ||
    skill === "studio_script"
  );
}
```

- [ ] **Step 4: Run tests**

Run: `./node_modules/.bin/vitest run tests/agent/invoked-skill.test.ts tests/agent/slash-catalog.test.ts`

Expected: PASS (`slash-catalog` « subset of SKILL.md catalog » devient vert grâce aux dossiers)

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/skills/studio_format/SKILL.md src/lib/agent/skills/studio_titles/SKILL.md src/lib/agent/skills/studio_description/SKILL.md src/lib/agent/skills/studio_script/SKILL.md src/lib/agent/skills/write_video/SKILL.md src/lib/agent/skills/retrieve_own_corpus/SKILL.md src/lib/agent/skills/upsert_studio_script/SKILL.md src/lib/agent/skills/create_studio_video/SKILL.md src/lib/agent/skills/invoked-skill.ts tests/agent/invoked-skill.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): add writing-only skills and keep them off the thumbnail journey

EOF
)"
```

---

### Task 6: Bloc system prompt de surface

**Files:**
- Modify: `src/lib/agent/system-prompt.ts`
- Test: `tests/agent/system-prompt-studio.test.ts`

**Interfaces:**
- Consumes: `agentSurfaceFromProjectId`, `buildStudioVideoBlock`
- Produces: `buildAgentSurfaceBlock(projectId?: string): string`

- [ ] **Step 1: Write the failing test** (ajouter dans `system-prompt-studio.test.ts`)

```ts
import { buildAgentSurfaceBlock } from "@/lib/agent/system-prompt";

it("forbids croquis on studio conversations and studio fills on canvas", () => {
  const studio = buildAgentSurfaceBlock("studio:vid_abc");
  expect(studio).toContain("<agent_surface>");
  expect(studio).toContain("studio");
  expect(studio).toMatch(/generate_sketch|croquis|apply_workflow/);
  expect(studio).toMatch(/Do not|Forbidden|interdit/i);
  expect(studio).not.toMatch(/Étape\s+\d/);
  const canvas = buildAgentSurfaceBlock("proj_1");
  expect(canvas).toContain("canvas");
  expect(canvas).toMatch(/upsert_studio_script|create_studio_video/);
  const messages = buildSystemMessages({ nodes: [], edges: [] }, "studio:vid_abc");
  expect(messages.some((m) => m.text.includes("<agent_surface>"))).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/agent/system-prompt-studio.test.ts`

Expected: FAIL — `buildAgentSurfaceBlock` not exported

- [ ] **Step 3: Write minimal implementation**

Ajouter et brancher dans `buildSystemMessages` **juste après** `buildStudioVideoBlock` (avant `<project_id>`) :

```ts
export function buildAgentSurfaceBlock(projectId?: string): string {
  if (projectId && isWritingProjectId(projectId)) {
    return [
      "<agent_surface>",
      "surface: studio (ThumbGen Vidéos / writing fiche).",
      "Forbidden: generate_sketch, apply_workflow, place_node, get_canvas_state, view_canvas_images, list_past_generations, thumbnail-packaging, existing-workflow, create-prompt, /croquis.",
      "Required loose arc via write_video: Document de chaîne (<channel_knowledge> / get_my_channel_knowledge) + retrieve_own_corpus (channel hits first) + list_studio_videos, then studio_format (ask_user), then studio_titles / studio_description / studio_script with incremental upsert_studio_script. Same conversation after reveal: upsert any fiche field; link_studio_miniature for canvas A/B. Never generate_sketch.",
      "Do not offer a 7-step journey. Do not mention Notion.",
      "</agent_surface>",
    ].join("\n");
  }
  return [
    "<agent_surface>",
    "surface: canvas (ThumbGen miniatures).",
    "Forbidden: upsert_studio_script, create_studio_video. Do not fill a Vidéos fiche from this conversation.",
    "Thumbnail skills (generate_sketch, apply_workflow, /croquis) are OK here.",
    "</agent_surface>",
  ].join("\n");
}
```

Dans `buildSystemMessages` :

```ts
  blocks.push({ type: "text", text: buildAgentSurfaceBlock(projectId) });
```

Renforcer `buildStudioVideoBlock` : la ligne « Do not run thumbnail-packaging unless they ask » reste ; ajouter « Prefer write_video over create_studio_video when video_id is present. »

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/agent/system-prompt-studio.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/system-prompt.ts tests/agent/system-prompt-studio.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): pin agent surface rules in the per-turn system prompt

EOF
)"
```

---

### Task 7: Garde surface dans le route handler + place_node

**Files:**
- Modify: `src/lib/agent/v2/route-handler.ts` (`wrapHandler`)
- Modify: `src/lib/agent/v2/place-node-tool.ts` (`executePlaceNode`)
- Test: `tests/agent/studio-surface-guard.test.ts` (déjà) + ajout `tests/agent/place-node-studio-guard.test.ts` si `executePlaceNode` est testable ; sinon étendre le guard test en important `executePlaceNode` avec un `projectId` studio mocké.

**Interfaces:**
- Consumes: `refuseWrongSurface`
- Produces: chaque outil registry + `place_node` refuse avant l’effet de bord

Relire `route-handler.ts` autour de `wrapHandler` et `executePlaceNode`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { executePlaceNode } from "@/lib/agent/v2/place-node-tool";

vi.mock("@/lib/agent/place-node", () => ({
  placeInterviewNode: vi.fn(async () => {
    throw new Error("must not place on studio");
  }),
  placeNodeInputSchema: { parse: (v: unknown) => v },
}));

describe("place_node on a writing fiche", () => {
  it("refuses before touching the canvas", async () => {
    const writePatch = vi.fn();
    const result = await executePlaceNode("studio:vid_abc", { node: { id: "iv-prompt" } } as never, writePatch);
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toMatch(/studio|Vidéos|écriture/i);
    expect(writePatch).not.toHaveBeenCalled();
  });
});
```

(Ajuster l’input au `PlaceNodeInput` réel après lecture de `place-node.ts`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/agent/place-node-studio-guard.test.ts`

Expected: FAIL — place_node still calls `placeInterviewNode`

- [ ] **Step 3: Write minimal implementation**

Au tout début de `executePlaceNode` :

```ts
import { refuseWrongSurface } from "@/lib/studio/agent-surface";

export async function executePlaceNode(...): Promise<ToolResult> {
  const refused = refuseWrongSurface(PLACE_NODE_TOOL_NAME, projectId);
  if (refused) return refused;
  // ... existing
}
```

Dans `wrapHandler`, **avant** `next(input)` :

```ts
import { refuseWrongSurface } from "@/lib/studio/agent-surface";

return async (input) => {
  const refused = refuseWrongSurface(name, run.projectId);
  if (refused) return refused;
  // existing timing + next(input)
};
```

- [ ] **Step 4: Run tests**

Run: `./node_modules/.bin/vitest run tests/agent/place-node-studio-guard.test.ts tests/agent/studio-surface-guard.test.ts tests/agent/v2-route-handler.test.ts`

Expected: PASS (v2 suite existante inchangée)

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/v2/route-handler.ts src/lib/agent/v2/place-node-tool.ts tests/agent/place-node-studio-guard.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): enforce writing vs canvas tool surfaces in the chat route

EOF
)"
```

---

### Task 8: Patch de brouillon (types purs)

**Files:**
- Create: `src/lib/studio/draft-patch.ts`
- Test: `tests/studio/draft-patch.test.ts`

**Interfaces:**
- Consumes: `StudioDraft`, `writingProjectId`
- Produces: `STUDIO_DRAFT_PATCH_PART`, `StudioDraftPatch`, `isStudioDraftPatch`, `shouldApplyStudioDraftPatch`

Même idée que `src/lib/canvas/canvas-patch.ts` : `updatedAt` plus récent gagne ; replay ignoré.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { emptyStudioDraft } from "@/lib/studio/page-template";
import {
  STUDIO_DRAFT_PATCH_PART,
  isStudioDraftPatch,
  shouldApplyStudioDraftPatch,
  type StudioDraftPatch,
} from "@/lib/studio/draft-patch";

const patch: StudioDraftPatch = {
  videoId: "vid_abc",
  projectId: "studio:vid_abc",
  updatedAt: "2026-09-20T10:00:01.000Z",
  previousUpdatedAt: "2026-09-20T10:00:00.000Z",
  title: "OpenClaw est mort",
  summary: "",
  script: "## 1. Introduction\nHook.",
  description: "",
  titleVariants: emptyStudioDraft().titleVariants,
  phase: "filling",
};

describe("studio draft patch", () => {
  it("accepts a newer patch for the open video and ignores replays", () => {
    expect(STUDIO_DRAFT_PATCH_PART).toBe("data-studio-draft-patch");
    expect(isStudioDraftPatch(patch)).toBe(true);
    expect(isStudioDraftPatch({ videoId: "x" })).toBe(false);
    expect(
      shouldApplyStudioDraftPatch(patch, { openVideoId: "vid_abc", knownUpdatedAt: "2026-09-20T10:00:00.000Z" }),
    ).toBe(true);
    expect(
      shouldApplyStudioDraftPatch(patch, { openVideoId: "vid_abc", knownUpdatedAt: "2026-09-20T10:00:01.000Z" }),
    ).toBe(false);
    expect(
      shouldApplyStudioDraftPatch(patch, { openVideoId: "vid_other", knownUpdatedAt: null }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/studio/draft-patch.test.ts`

Expected: FAIL — module missing

- [ ] **Step 3: Write minimal implementation**

Copier la logique `parseTimestamp` / comparaison de `canvas-patch.ts` (extraire n’est **pas** demandé : dupliquer les 15 lignes ISO strictes pour rester YAGNI).

```ts
import type { StudioDraft } from "./types";

export const STUDIO_DRAFT_PATCH_PART = "data-studio-draft-patch" as const;

export type StudioDraftPatch = {
  videoId: string;
  projectId: string;
  updatedAt: string;
  previousUpdatedAt: string;
  title: string;
  summary: string;
  script: string;
  description: string;
  titleVariants: StudioDraft["titleVariants"];
  phase: "filling";
};

export function isStudioDraftPatch(value: unknown): value is StudioDraftPatch {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<StudioDraftPatch>;
  return (
    typeof row.videoId === "string" &&
    typeof row.projectId === "string" &&
    typeof row.updatedAt === "string" &&
    typeof row.previousUpdatedAt === "string" &&
    typeof row.title === "string" &&
    typeof row.script === "string" &&
    typeof row.description === "string" &&
    Array.isArray(row.titleVariants) &&
    row.phase === "filling"
  );
}

function stamp(value: string): number | null {
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

export function shouldApplyStudioDraftPatch(
  patch: StudioDraftPatch,
  state: { openVideoId: string; knownUpdatedAt: string | null },
): boolean {
  if (patch.videoId !== state.openVideoId) return false;
  if (!state.knownUpdatedAt) return true;
  const next = stamp(patch.updatedAt);
  const known = stamp(state.knownUpdatedAt);
  if (next === null || known === null) return true;
  return next > known;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/studio/draft-patch.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/studio/draft-patch.ts tests/studio/draft-patch.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): add replay-safe live draft patches for the editor

EOF
)"
```

---

### Task 9: upsert peut poser le titre + broadcast stream

**Files:**
- Modify: `src/lib/agent/tools/upsert-studio-script.ts`
- Modify: `src/lib/agent/skills/upsert_studio_script/SKILL.md` (table `title`)
- Modify: `src/lib/agent/v2/route-handler.ts` (après succès upsert)
- Modify: `src/lib/studio/store.ts` seulement si `updateStudioVideo` ne suffit pas (il suffit)
- Test: `tests/agent/studio-tools.test.ts`, `tests/studio/studio-draft-broadcast.test.ts`

**Interfaces:**
- Consumes: `saveStudioDraft`, `updateStudioVideo`, `getStudioVideo`, `STUDIO_DRAFT_PATCH_PART`
- Produces: upsert accepte `title?: string` ; wrapHandler écrit un chunk transient après un upsert OK

- [ ] **Step 1: Write the failing tests**

Étendre `tests/agent/studio-tools.test.ts` :

```ts
  it("updates the fiche title so a Sans titre draft becomes visible", async () => {
    const { updateStudioVideo } = await import("@/lib/studio/store");
    updateStudioVideo(videoId, { title: "Sans titre" });
    const { upsertStudioScriptTool } = await import("@/lib/agent/tools/upsert-studio-script");
    await upsertStudioScriptTool.handler({
      video_id: videoId,
      title: "OpenClaw est mort",
      title_variants: [{ title: "OpenClaw est mort", thumbText: "OPENCLAW", visualConcept: "Face + UI" }],
    });
    const { getStudioVideo } = await import("@/lib/studio/store");
    const row = getStudioVideo(videoId);
    expect(row?.title).toBe("OpenClaw est mort");
    expect(row?.draft.titleVariants[0]?.title).toBe("OpenClaw est mort");
  });
```

`tests/studio/studio-draft-broadcast.test.ts` — tester une fonction extraite pour ne pas monter tout `postV2` :

Créer `src/lib/agent/v2/studio-draft-broadcast.ts` :

```ts
export function studioDraftPatchFromVideos(
  before: StudioVideo | null,
  after: StudioVideo,
): StudioDraftPatch { ... }
```

Test :

```ts
it("builds a filling patch from the row after upsert", () => {
  const after = { ...created, title: "OpenClaw est mort", updatedAt: "2026-09-20T10:00:01.000Z" };
  const patch = studioDraftPatchFromVideos(created, after);
  expect(patch.phase).toBe("filling");
  expect(patch.projectId).toBe(writingProjectId(after.videoId));
  expect(patch.previousUpdatedAt).toBe(created.updatedAt);
  expect(patch.title).toBe("OpenClaw est mort");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/agent/studio-tools.test.ts tests/studio/studio-draft-broadcast.test.ts`

Expected: FAIL — `title` not in upsert schema / module broadcast missing

- [ ] **Step 3: Write minimal implementation**

`InputSchema` upsert :

```ts
const InputSchema = z.object({
  video_id: z.string().min(8).max(80),
  title: z.string().trim().min(1).max(200).optional(),
  summary: z.string().trim().max(4_000).optional(),
  etiquette: z.enum(["Propositions", "Pas commencer", "En cours", "En prod", "Terminer"]).optional(),
  script: z.string().max(80_000).optional(),
  description: z.string().max(20_000).optional(),
  title_variants: z
    .array(z.object({ title: z.string(), thumbText: z.string(), visualConcept: z.string() }))
    .max(3)
    .optional(),
});
```

Dans le handler, après `saveStudioDraft` :

```ts
    if (title !== undefined || summary !== undefined || etiquette !== undefined) {
      updateStudioVideo(videoId, { title, summary, etiquette });
    }
```

`src/lib/agent/v2/studio-draft-broadcast.ts` :

```ts
import { writingProjectId, type StudioVideo } from "@/lib/studio/types";
import type { StudioDraftPatch } from "@/lib/studio/draft-patch";

export function studioDraftPatchFromVideos(before: StudioVideo | null, after: StudioVideo): StudioDraftPatch {
  return {
    videoId: after.videoId,
    projectId: writingProjectId(after.videoId),
    updatedAt: after.updatedAt,
    previousUpdatedAt: before?.updatedAt ?? after.updatedAt,
    title: after.title,
    summary: after.summary,
    script: after.draft.script,
    description: after.draft.description,
    titleVariants: after.draft.titleVariants,
    phase: "filling",
  };
}
```

Dans `wrapHandler` (lire le fichier : composer **avec** le `refuseWrongSurface` déjà ajouté) :

```ts
            return async (input) => {
              const refused = refuseWrongSurface(name, run.projectId);
              if (refused) return refused;
              const t0 = Date.now();
              const before =
                name === "upsert_studio_script" && input && typeof input === "object" && "video_id" in input
                  ? getStudioVideo(String((input as { video_id: string }).video_id).replace(/^studio:/, ""))
                  : null;
              try {
                const result = await next(input);
                if (name === "upsert_studio_script" && result.isError !== true && before) {
                  const after = getStudioVideo(before.videoId);
                  if (after && uiWriter) {
                    const patch = studioDraftPatchFromVideos(before, after);
                    uiWriter.write({
                      type: STUDIO_DRAFT_PATCH_PART,
                      id: patch.updatedAt,
                      transient: true,
                      data: patch,
                    });
                  }
                }
                // existing debugLog tool end
                return result;
              } catch (error) {
                // existing
                throw error;
              }
            };
```

Importer `getStudioVideo`, `STUDIO_DRAFT_PATCH_PART`, `studioDraftPatchFromVideos`.

- [ ] **Step 4: Run tests**

Run: `./node_modules/.bin/vitest run tests/agent/studio-tools.test.ts tests/studio/studio-draft-broadcast.test.ts tests/agent/v2-route-handler.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/upsert-studio-script.ts src/lib/agent/skills/upsert_studio_script/SKILL.md src/lib/agent/v2/studio-draft-broadcast.ts src/lib/agent/v2/route-handler.ts tests/agent/studio-tools.test.ts tests/studio/studio-draft-broadcast.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): stream fiche upserts into the open editor

EOF
)"
```

---

### Task 10: Store live client + ChatPanel layout / slash surface

**Files:**
- Create: `src/store/studio-live-store.ts`
- Modify: `src/lib/studio/agent-phase.ts` (`toolNameFromPart`)
- Modify: `src/components/panels/ChatPanel.tsx`
- Modify: `src/components/panels/chat/Composer.tsx`
- Test: `tests/studio/studio-live-store.test.ts`, `tests/studio/agent-phase.test.ts`, `tests/chat/chat-panel-safety.test.ts`

**Interfaces:**
- Consumes: `isStudioDraftPatch`, `shouldApplyStudioDraftPatch`, `advanceStudioPhase`, `agentSurfaceFromProjectId`
- Produces: `useStudioLiveStore`, ChatPanel `layout?: "dock" | "overlay"`, `onToolName?: (name: string) => void`, Composer `surface: AgentSurface`

- [ ] **Step 1: Write the failing store test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { emptyStudioDraft } from "@/lib/studio/page-template";
import { useStudioLiveStore } from "@/store/studio-live-store";

describe("studio live store", () => {
  beforeEach(() => {
    useStudioLiveStore.getState().reset();
  });

  it("keeps the newest patch for a video and advances phase", () => {
    useStudioLiveStore.getState().noteTool("retrieve_own_corpus");
    expect(useStudioLiveStore.getState().phase).toBe("researching");
    useStudioLiveStore.getState().applyPatch({
      videoId: "vid_abc",
      projectId: "studio:vid_abc",
      updatedAt: "2026-09-20T10:00:01.000Z",
      previousUpdatedAt: "2026-09-20T10:00:00.000Z",
      title: "OpenClaw",
      summary: "",
      script: "Hook",
      description: "",
      titleVariants: emptyStudioDraft().titleVariants,
      phase: "filling",
    });
    expect(useStudioLiveStore.getState().phase).toBe("filling");
    expect(useStudioLiveStore.getState().lastPatch?.script).toBe("Hook");
  });
});
```

Ajouter dans `tests/studio/agent-phase.test.ts` :

```ts
import { toolNameFromPart } from "@/lib/studio/agent-phase";

it("reads a tool name from an AI SDK part", () => {
  expect(toolNameFromPart({ toolName: "retrieve_own_corpus" })).toBe("retrieve_own_corpus");
  expect(toolNameFromPart({ type: "tool-retrieve_own_corpus" })).toBe("retrieve_own_corpus");
  expect(toolNameFromPart({ type: "text" })).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/studio/studio-live-store.test.ts`

Expected: FAIL — store missing

- [ ] **Step 3: Write store + ChatPanel/Composer wiring**

```ts
import { create } from "zustand";
import { advanceStudioPhase, type StudioAgentPhase } from "@/lib/studio/agent-phase";
import { shouldApplyStudioDraftPatch, type StudioDraftPatch } from "@/lib/studio/draft-patch";

type State = {
  phase: StudioAgentPhase;
  lastPatch: StudioDraftPatch | null;
  knownUpdatedAt: string | null;
  noteTool: (name: string) => void;
  applyPatch: (patch: StudioDraftPatch) => void;
  reset: () => void;
};

export const useStudioLiveStore = create<State>((set, get) => ({
  phase: "listening",
  lastPatch: null,
  knownUpdatedAt: null,
  noteTool: (name) => set({ phase: advanceStudioPhase(get().phase, name) }),
  applyPatch: (patch) => {
    const state = get();
    if (!shouldApplyStudioDraftPatch(patch, { openVideoId: patch.videoId, knownUpdatedAt: state.knownUpdatedAt })) {
      return;
    }
    set({
      lastPatch: patch,
      knownUpdatedAt: patch.updatedAt,
      phase: advanceStudioPhase(state.phase, "upsert_studio_script"),
    });
  },
  reset: () => set({ phase: "listening", lastPatch: null, knownUpdatedAt: null }),
}));
```

`ChatPanel` — ajouter les props (défauts = comportement canvas actuel). `pendingSend` est accepté dès cette task ; l’effet qui envoie le tour est Task 14.

```ts
export default function ChatPanel({
  projectId,
  layout = "dock",
  onToolName,
  pendingSend = null,
  onPendingSendConsumed,
}: {
  projectId: string;
  layout?: "dock" | "overlay";
  onToolName?: (name: string) => void;
  pendingSend?: string | null;
  onPendingSendConsumed?: () => void;
}) {
```

`aside` classes :

```ts
const overlay = layout === "overlay";
className={cn(
  overlay
    ? "relative z-10 h-full min-h-0 w-full max-w-none origin-bottom-right"
    : "fixed right-4 bottom-4 z-40 h-[min(640px,calc(100vh-2rem))] w-[400px] max-w-[calc(100vw-2rem)] origin-bottom-right",
  "animate-in fade-in zoom-in-95 duration-150 motion-reduce:animate-none",
)}
```

En overlay : **ne pas** rendre le bouton avatar minimisé (`{!open && !overlay && (…)}`). `hidden={!open}` seulement en dock. Overlay ignore `open` (toujours visible) — le parent ferme l’overlay.

`onData` existant : après `applyAgentCanvasStreamPart`,

```ts
import { STUDIO_DRAFT_PATCH_PART, isStudioDraftPatch } from "@/lib/studio/draft-patch";
import { useStudioLiveStore } from "@/store/studio-live-store";

onData: (dataPart) => {
  applyAgentCanvasStreamPart(dataPart, { openProjectId: projectId });
  if (dataPart.type === STUDIO_DRAFT_PATCH_PART && isStudioDraftPatch(dataPart.data)) {
    useStudioLiveStore.getState().applyPatch(dataPart.data);
  }
},
```

Extraire le nom d’outil depuis une part UI (AI SDK) — ajouter à `agent-phase.ts` + un cas dans `tests/studio/agent-phase.test.ts` :

```ts
export function toolNameFromPart(part: { type?: string; toolName?: string }): string | null {
  if (typeof part.toolName === "string" && part.toolName.length > 0) return part.toolName;
  const type = part.type ?? "";
  const prefixed = type.match(/^tool-(.+)$/);
  if (prefixed?.[1] && prefixed[1] !== "invocation") return prefixed[1];
  return null;
}
```

Dans ChatPanel, à chaque `chatMessages` change :

```ts
for (const message of chatMessages) {
  for (const part of message.parts ?? []) {
    const name = toolNameFromPart(part);
    if (name) {
      useStudioLiveStore.getState().noteTool(name);
      onToolName?.(name);
    }
  }
}
```

`Composer` : prop `surface: AgentSurface` ; `filterSlashSkills(slashQuery.query, surface)`.

`ChatPanel` passe `surface={agentSurfaceFromProjectId(projectId)}`.

Cacher `@mentions` canvas en studio n’est pas demandé : le catalogue d’images sera vide (canvas store vide sur /videos) — OK.

- [ ] **Step 4: Run tests**

Run: `./node_modules/.bin/vitest run tests/studio/studio-live-store.test.ts tests/chat/chat-panel-safety.test.ts tests/agent/slash-catalog.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/store/studio-live-store.ts src/lib/studio/agent-phase.ts src/components/panels/ChatPanel.tsx src/components/panels/chat/Composer.tsx tests/studio/studio-live-store.test.ts tests/studio/agent-phase.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): stream draft patches into chat and size the panel as overlay or dock

EOF
)"
```

---

### Task 11: Overlay create (dialog + hôte)

**Files:**
- Create: `src/components/studio/StudioCreateOverlay.tsx`
- Create: `src/components/studio/StudioChatHost.tsx`
- Create: `src/store/studio-create-store.ts`
- Create: `src/app/videos/layout.tsx`
- Modify: `src/app/videos/page.tsx`
- Modify: `src/app/videos/[videoId]/page.tsx`
- Modify: `src/components/ui/dialog.tsx` (`overlayClassName`)
- Test: `tests/studio/studio-create-overlay.test.tsx`

**Interfaces:**
- Consumes: `writingProjectId`, `STUDIO_PHASE_COPY`, `useStudioLiveStore`, `ChatPanel`, Dialog `base-ui`
- Produces: overlay `role="dialog"` nommé « Nouvelle vidéo » ; CTA **C’est parti** envoie `/ecrire` via `useChatStore.setDraft` + callback `onStart` ; Fermer / Escape → `onDismiss`

Règles web-guidelines à coder dans l’overlay :

- `role="dialog"` + `aria-modal="true"` + `aria-labelledby`
- Focus trap (Dialog `base-ui` déjà)
- Escape → `onDismiss`
- Overlay `bg-black/60`, `overscroll-contain`, `min-h-dvh`, `pt-[env(safe-area-inset-top)]`
- Bouton Fermer `aria-label="Fermer"`, cible ≥44px, `focus-visible:ring-*`
- Phase : `aria-live="polite"`
- Motion : `duration-150` transform/opacity ; `motion-reduce:animate-none`
- `autoFocus` composer seulement si `window.matchMedia("(pointer: fine)").matches`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import StudioCreateOverlay from "@/components/studio/StudioCreateOverlay";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/components/panels/ChatPanel", () => ({
  default: ({ projectId, layout }: { projectId: string; layout?: string }) => (
    <div>
      chat:{projectId}:{layout}
    </div>
  ),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("StudioCreateOverlay", () => {
  it("is a full-page writing chat, not a titre + description form", async () => {
    const onStart = vi.fn();
    const onDismiss = vi.fn();
    await act(async () => {
      root.render(
        <StudioCreateOverlay
          videoId="vid_new"
          phase="listening"
          onStart={onStart}
          onDismiss={onDismiss}
        />,
      );
    });
    const dialog = document.body.querySelector("[role='dialog']");
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.textContent).toContain("Nouvelle vidéo");
    expect(dialog?.textContent).toContain("L’agent t’écoute");
    expect(dialog?.textContent).toContain("C’est parti");
    expect(dialog?.textContent).toContain("Décris l’idée, ou envoie /ecrire");
    expect(dialog?.textContent).toContain("chat:studio:vid_new:overlay");
    expect(dialog?.textContent).not.toContain("Créer et ouvrir");
    expect(dialog?.querySelector("#studio-video-title")).toBeNull();
    expect(dialog?.querySelector("#studio-video-description")).toBeNull();
    const start = Array.from(dialog!.querySelectorAll("button")).find((el) => el.textContent?.includes("C’est parti"));
    expect(start).toBeTruthy();
    await act(async () => start!.click());
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/studio/studio-create-overlay.test.tsx`

Expected: FAIL — `StudioCreateOverlay` missing

- [ ] **Step 3: Write overlay, host, and videos layout**

`StudioCreateOverlay.tsx` — Dialog `base-ui` avec `DialogContent` overridé en plein inset (pas `sm:max-w-sm`) :

```tsx
"use client";

import { X } from "lucide-react";
import ChatPanel from "@/components/panels/ChatPanel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { STUDIO_PHASE_COPY, type StudioAgentPhase } from "@/lib/studio/agent-phase";
import { writingProjectId } from "@/lib/studio/types";

export default function StudioCreateOverlay({
  videoId,
  phase,
  onStart,
  onDismiss,
  pendingSend = null,
  onPendingSendConsumed,
}: {
  videoId: string;
  phase: StudioAgentPhase;
  onStart: () => void;
  onDismiss: () => void;
  pendingSend?: string | null;
  onPendingSendConsumed?: () => void;
}) {
  const showStart = phase === "listening";
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onDismiss(); }}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/60"
        className="top-0 left-0 flex h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none p-0 ring-0 sm:inset-3 sm:h-[calc(100dvh-1.5rem)] sm:w-[calc(100vw-1.5rem)] sm:max-w-none sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="min-w-0">
            <DialogTitle className="font-heading text-2xl font-medium text-pretty">Nouvelle vidéo</DialogTitle>
            <DialogDescription className="sr-only">
              Chat avec l&apos;agent d&apos;écriture. Pas un formulaire titre et description.
            </DialogDescription>
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {STUDIO_PHASE_COPY[phase]}
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Fermer" className="size-11" onClick={onDismiss}>
            <X />
          </Button>
        </div>
        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {showStart && (
            <div className="flex flex-col items-start gap-3 py-6">
              <p className="text-sm text-muted-foreground">
                Je vais d&apos;abord lire tes dernières fiches et tes textes de chaîne, puis te demander le format de tournage.
              </p>
              <Button type="button" onClick={onStart}>
                C&apos;est parti
              </Button>
              <p className="text-sm text-muted-foreground">Décris l&apos;idée, ou envoie /ecrire</p>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-hidden overscroll-contain">
            <ChatPanel
              projectId={writingProjectId(videoId)}
              layout="overlay"
              pendingSend={pendingSend}
              onPendingSendConsumed={onPendingSendConsumed}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

`DialogContent` hardcode aujourd’hui `<DialogOverlay />` (`bg-black/10`). Ajouter **une** prop optionnelle, défaut inchangé :

```tsx
function DialogContent({
  className,
  children,
  showCloseButton = true,
  overlayClassName,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
  overlayClassName?: string;
}) {
  return (
    <DialogPortal>
      <DialogOverlay className={overlayClassName} />
      {/* popup inchangé */}
```

`StudioCreateOverlay` passe `overlayClassName="bg-black/60"`. Le dialog « Modifier la vidéo » ne passe rien → `bg-black/10`.

`StudioChatHost.tsx` :

Task 11 : l’overlay appelle seulement `onStart` / `onDismiss` (test overlay). Le host relie ces callbacks **sans** `window` events — `pendingSend` (Task 14 câble l’envoi réel) et `useStudioCreateStore.requestAbandon` (Task 12) :

```tsx
"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ChatPanel from "@/components/panels/ChatPanel";
import StudioCreateOverlay from "@/components/studio/StudioCreateOverlay";
import { useStudioCreateStore } from "@/store/studio-create-store";
import { useStudioLiveStore } from "@/store/studio-live-store";
import { writingProjectId } from "@/lib/studio/types";

const VIDEO_PATH = /^\/videos\/(vid_[a-z0-9]+)$/;

export default function StudioChatHost() {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const createId = params.get("create");
  const editId = pathname.match(VIDEO_PATH)?.[1] ?? null;
  const videoId = createId ?? editId;
  const phase = useStudioLiveStore((s) => s.phase);
  const lastPatch = useStudioLiveStore((s) => s.lastPatch);
  const [pendingSend, setPendingSend] = useState<string | null>(null);

  useEffect(() => {
    useStudioLiveStore.getState().reset();
  }, [videoId]);

  useEffect(() => {
    if (!createId) return;
    if (lastPatch && lastPatch.videoId === createId) {
      router.push(`/videos/${createId}`);
    }
  }, [createId, lastPatch, router]);

  if (!videoId) return null;

  if (createId) {
    return (
      <StudioCreateOverlay
        videoId={createId}
        phase={phase}
        pendingSend={pendingSend}
        onPendingSendConsumed={() => setPendingSend(null)}
        onStart={() => setPendingSend("/ecrire")}
        onDismiss={() => useStudioCreateStore.getState().requestAbandon(createId)}
      />
    );
  }

  return (
    <ChatPanel
      key={writingProjectId(videoId)}
      projectId={writingProjectId(videoId)}
      layout="dock"
    />
  );
}
```

`StudioCreateOverlay` transmet `pendingSend` / `onPendingSendConsumed` à `ChatPanel`. Le test overlay n’a pas à les passer (props optionnelles). `studio-create-store.ts` est créé dans **cette** task ; VideosBoard le consomme Task 12.

```ts
import { create } from "zustand";

type State = {
  abandonRequest: string | null;
  requestAbandon: (videoId: string) => void;
  clearAbandon: () => void;
};

export const useStudioCreateStore = create<State>((set) => ({
  abandonRequest: null,
  requestAbandon: (videoId) => set({ abandonRequest: videoId }),
  clearAbandon: () => set({ abandonRequest: null }),
}));
```

Ajouter `src/store/studio-create-store.ts` aux Files de Task 11. Le test overlay ne l’importe pas.

`src/app/videos/layout.tsx` :

```tsx
import { Suspense } from "react";
import AppSidebar from "@/components/panels/AppSidebar";
import StudioChatHost from "@/components/studio/StudioChatHost";
import { SidebarInset } from "@/components/ui/sidebar";

export default function VideosLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppSidebar />
      <SidebarInset className="h-svh overflow-y-auto">
        {children}
        <Suspense fallback={null}>
          <StudioChatHost />
        </Suspense>
      </SidebarInset>
    </>
  );
}
```

`page.tsx` et `[videoId]/page.tsx` : **retirer** `AppSidebar` + `SidebarInset` (déjà dans le layout). `videos/page.tsx` ne rend plus que `<VideosBoard />`. `[videoId]/page.tsx` ne rend plus que `<VideoEditor videoId={videoId} />`.

- [ ] **Step 4: Run tests**

Run: `./node_modules/.bin/vitest run tests/studio/studio-create-overlay.test.tsx tests/studio/video-editor.test.tsx tests/sidebar/collapsed-rail.test.tsx`

Expected: PASS (VideoEditor test encore vert tant que ChatPanel y est — retiré Task 13)

- [ ] **Step 5: Commit**

```bash
git add src/components/studio/StudioCreateOverlay.tsx src/components/studio/StudioChatHost.tsx src/store/studio-create-store.ts src/app/videos/layout.tsx src/app/videos/page.tsx src/app/videos/[videoId]/page.tsx src/components/ui/dialog.tsx tests/studio/studio-create-overlay.test.tsx
git commit -m "$(cat <<'EOF'
feat(studio): open Nouvelle vidéo as a full-page writing chat overlay

EOF
)"
```

---

### Task 12: Kanban — create immédiat + cartes cachées + abandon

**Files:**
- Modify: `src/components/studio/VideosBoard.tsx`
- Test: `tests/studio/videos-board.test.tsx`

**Interfaces:**
- Consumes: `isStudioDraftVisible`, `UNTITLED_STUDIO_VIDEO`, `?create=`
- Produces: clic **Nouvelle vidéo** → POST immédiat `{ title: "Sans titre", etiquette: "Propositions" }` → `router.replace("/videos?create="+id)` ; plus de dialog titre+description en create ; edit dialog inchangé ; cartes filtrées ; listener dismiss → DELETE si encore invisible

Relire `VideosBoard.tsx` (le `VideoFormDialog` reste pour `mode === "edit"` seulement).

- [ ] **Step 1: Remplacer le test create** dans `videos-board.test.tsx`

Supprimer le test `"opens a titre + description dialog and only creates after confirm"`. Ajouter :

```ts
  it("creates a hidden Propositions draft immediately and opens the writing overlay", async () => {
    await act(async () => {
      root.render(<VideosBoard />);
    });
    await flush();

    const create = button("Nouvelle vidéo", container);
    await act(async () => create!.click());
    await flush();

    const post = fetchMock.mock.calls.find((call) => {
      const method = (call[0] instanceof Request ? call[0].method : call[1]?.method) ?? "GET";
      return method === "POST";
    });
    expect(post).toBeTruthy();
    expect(JSON.parse(String(post![1]?.body))).toMatchObject({
      title: "Sans titre",
      etiquette: "Propositions",
    });
    expect(push).not.toHaveBeenCalledWith("/videos/vid_new");
    expect(replace).toHaveBeenCalledWith("/videos?create=vid_new");
    expect(container.textContent).not.toContain("Sans titre");
    expect(document.body.querySelector("#studio-video-title")).toBeNull();
  });
```

Le mock `useRouter` doit exposer `replace` en plus de `push` :

```ts
const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/videos",
}));
```

Ajouter un test empty-state : le second **Nouvelle vidéo** fait le même POST.

Garder les tests edit / delete / colonnes.

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/studio/videos-board.test.tsx`

Expected: FAIL — still opens titre+description dialog ; POST only after confirm

- [ ] **Step 3: Write minimal implementation**

Dans `VideosBoard` :

```ts
  const visibleVideos = videos?.filter((row) =>
    isStudioDraftVisible({
      title: row.title,
      summary: row.summary,
      youtubeUrl: row.youtubeUrl,
      draft: emptyStudioDraft(), // le GET liste n’envoie pas toujours le draft : voir ci-dessous
    }),
  );
```

Le GET `/api/studio/videos` renvoie déjà l’objet `StudioVideo` complet (`listStudioVideos`). Étendre `BoardVideo` :

```ts
type BoardVideo = {
  videoId: string;
  title: string;
  summary: string;
  etiquette: Etiquette | null;
  youtubeUrl: string | null;
  updatedAt?: string;
  draft?: StudioDraft;
};
```

`asBoardVideos` parse `draft` en recopiant `asDraft` / `asVariant` de `VideoEditor.tsx` (15 lignes). Pas d’extraction tant que Task 13 n’y touche pas.

`isStudioDraftVisible({ ..., draft: row.draft ?? emptyStudioDraft() })`.

`startCreate` :

```ts
  const startCreate = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/studio/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: UNTITLED_STUDIO_VIDEO, etiquette: "Propositions" }),
      });
      if (!res.ok) {
        setError("Impossible de créer la vidéo.");
        return;
      }
      const body = (await res.json()) as { videoId?: string };
      if (!body.videoId) {
        setError("Impossible de créer la vidéo.");
        return;
      }
      router.replace(`/videos?create=${encodeURIComponent(body.videoId)}`);
    } catch {
      setError("Impossible de créer la vidéo.");
    } finally {
      setCreating(false);
    }
  };
```

Boutons header + empty : `onClick={() => void startCreate()}` — plus `setForm({ mode: "create" })`.

`VideoFormDialog` : n’ouvrir que `form?.mode === "edit"`.

Abandon (store Task 11, pas d’event `window`) :

```ts
  const abandonRequest = useStudioCreateStore((s) => s.abandonRequest);
  const [abandonBusy, setAbandonBusy] = useState(false);

  const dropCreate = async (videoId: string, remove: boolean) => {
    if (remove) {
      await fetch(`/api/studio/videos/${encodeURIComponent(videoId)}`, { method: "DELETE" });
    }
    useStudioCreateStore.getState().clearAbandon();
    router.replace("/videos");
    await load();
  };

  useEffect(() => {
    if (!abandonRequest) return;
    const row = videos?.find((item) => item.videoId === abandonRequest);
    const visible = row
      ? isStudioDraftVisible({
          title: row.title,
          summary: row.summary,
          youtubeUrl: row.youtubeUrl,
          draft: row.draft ?? emptyStudioDraft(),
        })
      : false;
    if (visible) {
      void dropCreate(abandonRequest, false);
      return;
    }
    if (!useChatStore.getState().activeConversationId) {
      void dropCreate(abandonRequest, true);
    }
  }, [abandonRequest, videos]);
```

Si `abandonRequest` est set **et** une conversation existe **et** la fiche est invisible : garder `abandonRequest` et montrer le `ConfirmDialog` déjà importé :

- title : `Abandonner ce brouillon ?`
- description : `La conversation sera perdue. La fiche vide sera supprimée.`
- confirmLabel : `Abandonner`
- `onConfirm` → `void dropCreate(abandonRequest, true)` avec `abandonBusy`

Empty : `visibleVideos.length === 0` (pas `videos.length`). Une fiche cachée seule → empty state + CTA.

`creating` : `disabled={creating}` sur les deux boutons **Nouvelle vidéo**.

- [ ] **Step 4: Run tests**

Run: `./node_modules/.bin/vitest run tests/studio/videos-board.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/studio/VideosBoard.tsx tests/studio/videos-board.test.tsx
git commit -m "$(cat <<'EOF'
feat(studio): mint a hidden draft as soon as Nouvelle vidéo opens

EOF
)"
```

---

### Task 13: Éditeur — coques, live fill, plus de rail chat

**Files:**
- Create: `src/components/studio/StudioEditorChrome.tsx`
- Modify: `src/components/studio/VideoEditor.tsx`
- Test: `tests/studio/video-editor.test.tsx`, `tests/studio/studio-editor-chrome.test.tsx`

**Interfaces:**
- Consumes: `useStudioLiveStore`, `STUDIO_PHASE_COPY`, `asDraft`
- Produces: sections toujours montées (Notes, Script, Description, 3 titres) ; bannière filling ; application patch sans CLS ni boucle autosave

- [ ] **Step 1: Write the failing tests**

`tests/studio/studio-editor-chrome.test.tsx` :

```tsx
it("reserves script, description and three title rows and announces filling", () => {
  // render StudioEditorChrome filling=true script="" 
  expect(container.querySelector("#studio-script")).toBeTruthy();
  expect(container.querySelector("#studio-description")).toBeTruthy();
  expect(container.textContent).toContain("L’agent prépare les données");
  expect(container.querySelector("[aria-live='polite']")?.textContent).toContain("L’agent prépare les données");
  expect(container.querySelectorAll("[data-studio-skeleton]").length).toBeGreaterThan(0);
});
```

Étendre `video-editor.test.tsx` :

```ts
  it("shows every editor section before the GET resolves — no blank jump", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    await act(async () => {
      root.render(<VideoEditor videoId="vid_3db7d7d1139d809baaa3f455a1e8162d" />);
    });
    expect(container.textContent).toContain("Script Vidéo longue");
    expect(container.textContent).toContain("Description");
    expect(container.textContent).toContain("A/B Titre");
    expect(container.textContent).not.toContain("chat:studio:");
  });

  it("applies a live draft patch without POSTing a user save", async () => {
    // after load, push a patch via useStudioLiveStore.getState().applyPatch(...)
    await act(async () => {
      useStudioLiveStore.getState().applyPatch({
        videoId: "vid_3db7d7d1139d809baaa3f455a1e8162d",
        projectId: "studio:vid_3db7d7d1139d809baaa3f455a1e8162d",
        updatedAt: "2026-09-20T11:00:01.000Z",
        previousUpdatedAt: "2026-09-20T11:00:00.000Z",
        title: "OpenClaw est mort",
        summary: "",
        script: "## 1. Introduction\nHook live.",
        description: "👉 apprendre",
        titleVariants: [
          { title: "A", thumbText: "a", visualConcept: "x" },
          { title: "B", thumbText: "b", visualConcept: "y" },
          { title: "C", thumbText: "c", visualConcept: "z" },
        ],
        phase: "filling",
      });
    });
    expect(container.textContent).toContain("Hook live");
    expect(container.textContent).toContain("L’agent prépare les données");
    const patches = fetchMock.mock.calls.filter((call) => {
      const method = (call[0] instanceof Request ? call[0].method : call[1]?.method) ?? "GET";
      return method === "PATCH";
    });
    expect(patches).toHaveLength(0);
  });
```

Retirer l’assertion `chat:studio:` du premier test existant (le chat est dans `StudioChatHost`). Le mock `ChatPanel` dans ce fichier peut rester inoffensif ou être supprimé.

- [ ] **Step 2: Run tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/studio/video-editor.test.tsx tests/studio/studio-editor-chrome.test.tsx`

Expected: FAIL — blank load state ; ChatPanel still in editor ; no live patch

- [ ] **Step 3: Write minimal implementation**

`StudioEditorChrome` : wrapper des zones existantes (ne pas réécrire les inputs). Props : `filling: boolean`, `scriptEmpty: boolean`, `descriptionEmpty: boolean`, `titlesEmpty: boolean`. Si filling && empty : `div[data-studio-skeleton]` en `absolute inset-0 animate-pulse bg-muted/60 motion-reduce:animate-none` **par-dessus** le textarea déjà dimensionné (`min-h-64` / `min-h-40` / table 3 rows). Le textarea reste dans le flux (CLS = 0).

`VideoEditor` :

1. Toujours rendre le header + sections (même si `!loaded`). Inputs disabled tant que `!loaded`.
2. Retirer le `<ChatPanel />` droit et le wrapper `flex` rail (`sticky top-0 min-w-[20rem]`). Colonne unique `px-6 py-6 pb-24`.
3. `useStudioLiveStore` : si `lastPatch?.videoId === videoId`, `skipSave.current = true` puis `setTitle` / `setScript` / `setDescription` / `setTitleVariants` / `setSummary`.
4. Bannière si `phase === "filling" || phase === "writing"` : `<p aria-live="polite" className="text-sm text-muted-foreground">{STUDIO_PHASE_COPY.filling}</p>` uniquement quand `filling` (copy verrouillée **L’agent prépare les données** dès que les champs se remplissent). Pendant `writing` sans patch : afficher `STUDIO_PHASE_COPY.writing`.
5. `knownUpdatedAt` du store sert au replay ; au GET initial, `useStudioLiveStore.setState({ knownUpdatedAt: body.updatedAt })` si l’API le renvoie (le GET actuel n’expose pas `updatedAt` au client — le JSON `StudioVideo` l’a déjà via `list` ; `GET [videoId]` doit renvoyer `updatedAt`. Relire `src/app/api/studio/videos/[videoId]/route.ts` : s’il `NextResponse.json(video)`, `updatedAt` est déjà là. S’en servir.)

404 / delete inchangés.

- [ ] **Step 4: Run tests**

Run: `./node_modules/.bin/vitest run tests/studio/video-editor.test.tsx tests/studio/studio-editor-chrome.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/studio/StudioEditorChrome.tsx src/components/studio/VideoEditor.tsx tests/studio/video-editor.test.tsx tests/studio/studio-editor-chrome.test.tsx
git commit -m "$(cat <<'EOF'
feat(studio): fill the editor live from the agent without layout jump

EOF
)"
```

---

### Task 14: ChatPanel pendingSend + host start/reveal

**Files:**
- Modify: `src/components/panels/ChatPanel.tsx` (`pendingSend`, `onPendingSendConsumed`)
- Modify: `src/components/studio/StudioChatHost.tsx`
- Test: `tests/studio/studio-chat-host.test.tsx`

**Interfaces:**
- Consumes: `useChatStore.setDraft`, `onSend` interne
- Produces: CTA overlay déclenche un vrai tour `/ecrire` ; premier patch → `router.push(/videos/id)`

- [ ] **Step 1: Write the failing test**

```tsx
vi.mock("next/navigation", () => ({
  usePathname: () => "/videos",
  useSearchParams: () => new URLSearchParams("create=vid_new"),
  useRouter: () => ({ push, replace }),
}));
vi.mock("@/components/panels/ChatPanel", () => ({
  default: (props: { pendingSend?: string | null }) => (
    <div>pending:{props.pendingSend ?? "none"}</div>
  ),
}));

it("reveals the fiche on the first draft patch", async () => {
  await act(async () => root.render(<StudioChatHost />));
  expect(document.body.textContent).toContain("Nouvelle vidéo");
  await act(async () => {
    useStudioLiveStore.getState().applyPatch({
      videoId: "vid_new",
      projectId: "studio:vid_new",
      updatedAt: "2026-09-20T12:00:01.000Z",
      previousUpdatedAt: "2026-09-20T12:00:00.000Z",
      title: "OpenClaw",
      summary: "",
      script: "Hook",
      description: "",
      titleVariants: emptyStudioDraft().titleVariants,
      phase: "filling",
    });
  });
  expect(push).toHaveBeenCalledWith("/videos/vid_new");
});
```

Pour `pendingSend`, tester `ChatPanel` est lourd (useChat). Extraire `consumePendingSend(pending: string | null, setDraft: (s: string) => void): string | null` dans `src/lib/studio/pending-send.ts` :

```ts
export function consumePendingSend(pending: string | null): { draft: string } | null {
  const text = pending?.trim();
  if (!text) return null;
  return { draft: text.endsWith(" ") ? text : `${text} ` };
}
```

Test unitaire + ChatPanel `useEffect` : si `pendingSend`, `setDraft(consumePendingSend(...).draft)` puis appelle `onSend` puis `onPendingSendConsumed()`.

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/studio/studio-chat-host.test.tsx tests/studio/pending-send.test.ts`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Host state :

```ts
  const [pendingSend, setPendingSend] = useState<string | null>(null);
  const onStart = () => setPendingSend("/ecrire");
```

Passe à overlay → ChatPanel. Overlay ne mocke plus tout le ChatPanel dans le test host (déjà mocké).

Reveal effect déjà décrit Task 11.

Quand `pathname` devient `/videos/vid_new`, host rend le dock (overlay unmount). **Continuité stream :** `key={writingProjectId(videoId)}` **identique** overlay→dock. Ne pas changer la `key` entre overlay et dock. Si l’unmount overlay démonte ChatPanel, `resumeStream` existant reprend le tour (déjà dans ChatPanel). Documenter dans un commentaire host : préfère ne pas remonter ; si Dialog démonte, resumeStream est le filet.

- [ ] **Step 4: Run tests**

Run: `./node_modules/.bin/vitest run tests/studio/studio-chat-host.test.tsx tests/studio/pending-send.test.ts tests/studio/studio-create-overlay.test.tsx tests/chat/chat-panel-safety.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/studio/pending-send.ts src/components/panels/ChatPanel.tsx src/components/studio/StudioChatHost.tsx tests/studio/studio-chat-host.test.tsx tests/studio/pending-send.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): start /ecrire from the overlay and reveal the fiche on first upsert

EOF
)"
```

---

### Task 15: Composer surface + labels + descriptions existantes

**Files:**
- Modify: `src/components/panels/chat/Composer.tsx` (si Task 10 incomplet)
- Modify: `src/lib/agent/skills/list_studio_videos/SKILL.md`
- Modify: `src/lib/agent/skills/get_studio_video/SKILL.md`
- Modify: `src/lib/agent/tool-labels.ts` (inchangé sauf si un label manque)
- Test: `tests/agent/slash-catalog.test.ts` déjà ; ajouter dans `tests/agent/system-prompt-studio.test.ts` que le catalog statique contient les nouvelles descriptions `Vidéos / studio` (via `listSkillCatalog()`)

- [ ] **Step 1: Write the failing test**

```ts
it("catalog descriptions for writing skills mention Vidéos / studio and not miniatures", () => {
  const catalog = listSkillCatalog();
  for (const name of ["write_video", "studio_format", "studio_titles", "studio_description", "studio_script", "retrieve_own_corpus", "upsert_studio_script"]) {
    const row = catalog.find((skill) => skill.name === name);
    expect(row, name).toBeTruthy();
    expect(row!.description).toMatch(/Vidéos|studio/i);
    expect(row!.description).not.toMatch(/generate_sketch|croquis/i);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/agent/system-prompt-studio.test.ts`

Expected: FAIL only if une description n’a pas été mise à jour — corriger le frontmatter (pas de nouveau comportement)

- [ ] **Step 3: Write minimal implementation**

Vérifier `Composer` appelle `filterSlashSkills(query, surface)` avec `surface` depuis ChatPanel. Lire `SkillPicker` : `aria-label="Skills"` OK.

`list_studio_videos` / `get_studio_video` frontmatter : préfixer `Vidéos / studio —`.

- [ ] **Step 4: Run tests**

Run: `./node_modules/.bin/vitest run tests/agent/system-prompt-studio.test.ts tests/agent/slash-catalog.test.ts tests/chat/skill-picker-render.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/skills/list_studio_videos/SKILL.md src/lib/agent/skills/get_studio_video/SKILL.md src/components/panels/chat/Composer.tsx tests/agent/system-prompt-studio.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): keep writing skill catalog copy on the Vidéos surface

EOF
)"
```

---

### Task 16: Filet de vérif + rebuild Docker (main repo)

**Files:** aucun nouveau fichier produit. Relire les diffs. Lancer la suite ciblée puis le typecheck.

**Interfaces:** aucune.

- [ ] **Step 1: Run the focused suites**

```bash
./node_modules/.bin/vitest run \
  tests/studio/visibility.test.ts \
  tests/studio/agent-phase.test.ts \
  tests/studio/draft-patch.test.ts \
  tests/studio/studio-draft-broadcast.test.ts \
  tests/studio/studio-live-store.test.ts \
  tests/studio/visibility.test.ts \
  tests/studio/videos-board.test.tsx \
  tests/studio/video-editor.test.tsx \
  tests/studio/studio-editor-chrome.test.tsx \
  tests/studio/studio-create-overlay.test.tsx \
  tests/studio/studio-chat-host.test.tsx \
  tests/studio/pending-send.test.ts \
  tests/agent/studio-surface-guard.test.ts \
  tests/agent/place-node-studio-guard.test.ts \
  tests/agent/slash-catalog.test.ts \
  tests/agent/invoked-skill.test.ts \
  tests/agent/system-prompt-studio.test.ts \
  tests/agent/studio-tools.test.ts \
  tests/agent/registry-full.test.ts \
  tests/agent/v2-route-handler.test.ts \
  tests/chat/chat-panel-safety.test.ts \
  tests/sidebar/collapsed-rail.test.tsx
```

Expected: PASS. `studio_format` / `studio_titles` / `studio_description` / `studio_script` restent **skills only** (pas d’outil). `link_studio_miniature` est le seul nouvel outil (Task 18) — `registry-full` et `mcp-server` doivent le lister après cette task, pas avant.

- [ ] **Step 2: Typecheck + lint the touched files**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint \
  src/lib/studio \
  src/lib/agent/skills/slash-catalog.ts \
  src/lib/agent/skills/slash-query.ts \
  src/lib/agent/skills/invoked-skill.ts \
  src/lib/agent/system-prompt.ts \
  src/lib/agent/v2/route-handler.ts \
  src/lib/agent/v2/place-node-tool.ts \
  src/lib/agent/v2/studio-draft-broadcast.ts \
  src/lib/agent/tools/upsert-studio-script.ts \
  src/components/studio \
  src/components/panels/ChatPanel.tsx \
  src/components/panels/chat/Composer.tsx \
  src/app/videos \
  src/store/studio-live-store.ts \
  src/store/studio-create-store.ts
```

Expected: 0 errors

- [ ] **Step 3: Docker from the main repo only**

```bash
git worktree list
```

Si ce checkout n’est **pas** le repo principal (chemin sans suffixe worktree, celui qui sert `:3000`), `cd` vers ce repo puis :

```bash
docker compose up -d --build
```

Ne pas rebuild depuis un worktree. Ne pas toucher `data/thumbgen.db`. Ne pas appeler d’API payante.

Vérif manuelle (humain, DB throwaway si besoin : `THUMBGEN_DB_PATH="$(mktemp -d)/thumbgen.db"` seulement sur un `next dev` local, **pas** sur le volume Docker live) :

1. `/videos` → **Nouvelle vidéo** → overlay chat (pas de form titre).
2. Escape sans message → retour kanban, pas de carte Sans titre.
3. **C’est parti** → phase « lit tes dernières vidéos… » (si l’agent tourne ; sans clé, ne pas forcer un appel payant).
4. Quand un upsert arrive → `/videos/vid_…`, bannière **L’agent prépare les données**, sections déjà là, chat en dock BR.
5. `/m/[id]` picker `/` → croquis présent, `/ecrire` absent.
6. Overlay `/` → `/ecrire` présent, croquis absent.
7. `prefers-reduced-motion` : overlay sans zoom, pas de ping.

- [ ] **Step 4: No extra commit unless lint/typecheck edited files** — s’il a fallu un fix, commit **nouveau** (pas amend) :

```bash
git add <fichiers du fix>
git commit -m "$(cat <<'EOF'
fix(studio): close create-agent overlay regressions found in verification

EOF
)"
```

- [ ] **Step 5: Commit only if Step 4 produced a fix.** Sinon s’arrêter : la Task 16 n’ajoute pas de commit vide.

---

### Task 17: Corpus — Document de chaîne + transcripts YouTube d’abord

**Files:**
- Modify: `src/lib/studio/corpus.ts` (`retrieveOwnCorpus`)
- Modify: `src/lib/agent/skills/retrieve_own_corpus/SKILL.md`
- Modify: `src/lib/agent/skills/write_video/SKILL.md` (si Task 5 n’a pas déjà l’arc Document de chaîne)
- Modify: `src/lib/agent/system-prompt.ts` (`buildChannelKnowledgeBlock`)
- Modify: `src/lib/agent/tools/get-my-channel-knowledge.ts` (description : writing + thumbnails)
- Test: `tests/studio/corpus.test.ts`, `tests/agent/system-prompt-studio.test.ts`

**Interfaces:**
- Consumes: `searchMyChannel`, `getKnowledge` (déjà injecté — ne pas relancer `runIngest` / `generateChannelKnowledge`)
- Produces: `retrieveOwnCorpus` retourne hits `source: "channel"` **avant** `source: "studio"` ; le prompt dit que le Document de chaîne ground aussi l’écriture

Pas de nouvel ingest. Les titres / descriptions / transcripts sont déjà dans `channel_videos` + `video_transcripts` après Connexion YouTube (`src/lib/youtube/ingest.ts`).

- [ ] **Step 1: Write the failing tests**

Ajouter dans `tests/studio/corpus.test.ts` :

```ts
it("ranks Ma chaîne ingested transcripts before studio drafts", () => {
  const { insertChannel, upsertVideos } = require("@/lib/youtube/channel-store") as typeof import("@/lib/youtube/channel-store");
  const { upsertTranscript, saveKnowledge } = require("@/lib/youtube/knowledge-store") as typeof import("@/lib/youtube/knowledge-store");
  const mine = insertChannel(
    {
      youtubeChannelId: "UC_corpus_mine",
      title: "Ma chaîne test",
      handle: "@mine",
      avatarUrl: null,
      subscriberCount: 1,
      videoCount: 15,
      description: null,
    },
    { isMine: true },
  ).channel;
  upsertVideos(
    mine.id,
    [
      {
        videoId: "dQw4w9WgXcQ",
        channelId: mine.youtube_channel_id,
        title: "Installer n8n depuis Ma chaîne",
        publishedAt: "2026-01-01T00:00:00.000Z",
        durationSeconds: 120,
        viewCount: 99,
        likeCount: 1,
        thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg",
        liveBroadcastContent: "none",
        description: "Desc n8n chaîne",
      },
    ],
    "2026-01-01T00:00:00.000Z",
  );
  upsertTranscript({
    videoId: "dQw4w9WgXcQ",
    source: "timedtext",
    language: "fr",
    text: "Dans cette vidéo YouTube je montre installer n8n sur Ma chaîne.",
    fetchedAt: "2026-01-01T00:00:00.000Z",
  });
  saveKnowledge({
    channel_id: mine.id,
    generated_at: "2026-09-18T08:44:00.000Z",
    document_md: "# Ma chaîne\nNiche n8n",
    json: "{}",
    video_count: 15,
    transcript_count: 15,
  });

  const created = createStudioVideo({
    title: "Brouillon studio n8n",
    etiquette: "Propositions",
  });
  const draft = emptyStudioDraft();
  draft.script = "Hook studio installer n8n.";
  saveStudioDraft(created.videoId, draft);
  indexStudioCorpus(created.videoId);

  const hits = retrieveOwnCorpus("installer n8n", 8);
  expect(hits[0]?.source).toBe("channel");
  expect(hits[0]?.youtubeVideoId).toBe("dQw4w9WgXcQ");
  expect(hits.some((hit) => hit.source === "studio" && hit.videoId === created.videoId)).toBe(true);
});
```

Adapter les types `ChannelDetails` / `VideoDetails` **après lecture** de `src/lib/youtube/types.ts` (ne pas inventer de champs). Cleanup `beforeEach` : `DELETE FROM channel_videos` / `followed_channels` / `video_transcripts` / `channel_knowledge` sur le DB de test seulement.

Dans `tests/agent/system-prompt-studio.test.ts` :

```ts
it("tells the writing agent to ground on Document de chaîne, not only thumbnails", () => {
  const block = buildChannelKnowledgeBlock({ channelKnowledge: "- Niche: n8n" });
  expect(block).toMatch(/écriture|writing|script/i);
  expect(block).toMatch(/get_my_channel_knowledge|search_my_channel|get_my_video/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/studio/corpus.test.ts tests/agent/system-prompt-studio.test.ts`

Expected: FAIL — channel hit after studio, or prompt still « Ground thumbnails » only

- [ ] **Step 3: Write minimal implementation**

`retrieveOwnCorpus` : d’abord `searchMyChannel`, puis `searchStudioCorpus`, dédup `youtubeVideoId`, `slice(0, limit)`.

`buildChannelKnowledgeBlock` — remplacer la ligne « Ground thumbnails in this » par :

```
Analysed from the creator's connected YouTube channel (Réglages → Ma chaîne / Document de chaîne). Ground writing (hooks, titles, descriptions, spoken rhythm) and thumbnails in this. For a specific video, a transcript or a search, call get_my_channel_knowledge, search_my_channel, get_my_video or retrieve_own_corpus — do not invent stats or old videos. Explicit requests in the conversation take precedence.
```

`get-my-channel-knowledge` description : ajouter « and writing (scripts, titles) ».

`retrieve_own_corpus/SKILL.md` How : « Channel ingested videos first (titles, descriptions, transcripts from YouTube connect), then studio drafts. Document de chaîne is already in <channel_knowledge> — quote it. Do not call generateChannelKnowledge. »

Ne pas appeler YouTube Data, OpenRouter, ni `startChannelIngest`.

- [ ] **Step 4: Run tests**

Run: `./node_modules/.bin/vitest run tests/studio/corpus.test.ts tests/agent/system-prompt-studio.test.ts tests/agent/my-channel-tools.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/studio/corpus.ts src/lib/agent/skills/retrieve_own_corpus/SKILL.md src/lib/agent/skills/write_video/SKILL.md src/lib/agent/system-prompt.ts src/lib/agent/tools/get-my-channel-knowledge.ts tests/studio/corpus.test.ts tests/agent/system-prompt-studio.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): ground writing on the channel document and ingested transcripts first

EOF
)"
```

---

### Task 18: Lier un projet canvas à la fiche (`studio_video_id`)

**Files:**
- Modify: `src/lib/db.ts` (`ALTER` défensif, à côté de `cover_image_id`)
- Create: `src/lib/studio/link-project.ts`
- Create: `src/app/api/studio/videos/[videoId]/miniature/route.ts`
- Create: `src/lib/agent/tools/link-studio-miniature.ts`
- Create: `src/lib/agent/skills/link_studio_miniature/SKILL.md`
- Modify: `src/lib/agent/tools/all.ts`, `src/lib/agent/tool-labels.ts`
- Modify: `tests/agent/registry-full.test.ts`, `tests/agent/mcp-server.test.ts`
- Test: `tests/studio/link-project.test.ts`, `tests/agent/studio-tools.test.ts`

**Interfaces:**
- Consumes: `getStudioVideo`, `createProject(name, description?)` → `{ id, name }` id `proj_${Date.now()}`, `listProjects`, `getProjectCoverUrl`
- Produces: `linkProjectToStudio`, `unlinkProjectFromStudio`, `listProjectsForStudio` (max 3, cover URL), `createMiniatureForStudio` ; HTTP GET/POST/DELETE ; outil agent

Même contrat que writing-studio Tasks 13–14 — **un seul** `link-project.ts`, pas une seconde table.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "@/lib/db";
import { createProject, listProjects } from "@/lib/local-storage";
import { isWritingProjectId } from "@/lib/studio/types";
import { createStudioVideo } from "@/lib/studio/store";
import {
  createMiniatureForStudio,
  linkProjectToStudio,
  listProjectsForStudio,
  unlinkProjectFromStudio,
} from "@/lib/studio/link-project";

let videoId = "";

beforeEach(() => {
  getDb().exec("DELETE FROM projects");
  getDb().exec("DELETE FROM projects_meta");
  getDb().exec("DELETE FROM studio_drafts");
  getDb().exec("DELETE FROM studio_videos");
  videoId = createStudioVideo({ title: "Vibe Coding : c’est quoi ?", etiquette: "En cours" }).videoId;
});

describe("link project", () => {
  it("creates a real canvas project linked to the fiche", () => {
    const created = createMiniatureForStudio(videoId);
    expect(isWritingProjectId(created.id)).toBe(false);
    expect(created.id.startsWith("proj_")).toBe(true);
    expect(created.name).toContain("Vibe Coding");
    expect(listProjectsForStudio(videoId).map((p) => p.id)).toEqual([created.id]);
    expect(listProjects().some((p) => p.id === created.id)).toBe(true);
  });

  it("links an existing miniature and refuses a fourth A/B slot", () => {
    const a = createProject("Mini A");
    const b = createProject("Mini B");
    const c = createProject("Mini C");
    const d = createProject("Mini D");
    linkProjectToStudio(a.id, videoId);
    linkProjectToStudio(b.id, videoId);
    linkProjectToStudio(c.id, videoId);
    expect(() => linkProjectToStudio(d.id, videoId)).toThrow(/trois|3|A\/B/i);
    unlinkProjectFromStudio(b.id, videoId);
    expect(listProjectsForStudio(videoId).map((p) => p.id)).toEqual([c.id, a.id]);
  });

  it("rejects an unknown fiche", () => {
    expect(() => linkProjectToStudio("proj_1", "vid_unknownunknownunknownunknown")).toThrow(/fiche/i);
  });
});
```

Étendre `tests/agent/studio-tools.test.ts` : `linkStudioMiniatureTool.handler({ video_id, project_id, action: "link" })` lie ; `action: "create"` mint un `proj_` ; `action: "unlink"` détache. `vi.stubGlobal("fetch")` ne doit pas être appelé.

- [ ] **Step 2: Run tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/studio/link-project.test.ts tests/agent/studio-tools.test.ts`

Expected: FAIL — module / colonne / outil manquants

- [ ] **Step 3: Write minimal implementation**

Dans `init()` de `db.ts`, après `cover_image_id` :

```ts
  if (!projectMetaColumns.some((c) => c.name === "studio_video_id")) {
    database.exec("ALTER TABLE projects_meta ADD COLUMN studio_video_id TEXT");
    database.exec("CREATE INDEX IF NOT EXISTS idx_projects_meta_studio ON projects_meta(studio_video_id)");
  }
```

`src/lib/studio/link-project.ts` :

```ts
import { getDb } from "@/lib/db";
import { createProject, getProjectCoverUrl, type ProjectMeta } from "@/lib/local-storage";
import { getStudioVideo } from "./store";

export const MAX_STUDIO_THUMBS = 3;

export type LinkedStudioProject = {
  id: string;
  name: string;
  coverImageUrl: string | null;
  slot: "A" | "B" | "C";
};

function assertFiche(videoId: string): void {
  if (!getStudioVideo(videoId)) throw new Error("Fiche vidéo introuvable.");
}

export function listProjectsForStudio(videoId: string): LinkedStudioProject[] {
  const rows = getDb()
    .prepare("SELECT id, name FROM projects_meta WHERE studio_video_id = ? ORDER BY updated_at DESC")
    .all(videoId) as Array<{ id: string; name: string }>;
  return rows.slice(0, MAX_STUDIO_THUMBS).map((row, index) => ({
    id: row.id,
    name: row.name,
    coverImageUrl: getProjectCoverUrl(row.id),
    slot: (["A", "B", "C"] as const)[index],
  }));
}

export function linkProjectToStudio(projectId: string, videoId: string): void {
  assertFiche(videoId);
  const existing = listProjectsForStudio(videoId);
  if (existing.some((row) => row.id === projectId)) return;
  if (existing.length >= MAX_STUDIO_THUMBS) {
    throw new Error("Trois miniatures maximum pour le test A/B.");
  }
  const result = getDb()
    .prepare("UPDATE projects_meta SET studio_video_id = ?, updated_at = ? WHERE id = ?")
    .run(videoId, new Date().toISOString(), projectId);
  if (result.changes === 0) throw new Error("Miniature introuvable");
}

export function unlinkProjectFromStudio(projectId: string, videoId: string): void {
  getDb()
    .prepare("UPDATE projects_meta SET studio_video_id = NULL, updated_at = ? WHERE id = ? AND studio_video_id = ?")
    .run(new Date().toISOString(), projectId, videoId);
}

export function createMiniatureForStudio(videoId: string): { id: string; name: string } {
  const video = getStudioVideo(videoId);
  if (!video) throw new Error("Fiche vidéo introuvable.");
  const created = createProject(video.title.slice(0, 80) || "Miniature");
  linkProjectToStudio(created.id, videoId);
  return created;
}
```

Route `src/app/api/studio/videos/[videoId]/miniature/route.ts` :

- `GET` → `{ projects: listProjectsForStudio(videoId) }` ou 404 fiche
- `POST` JSON `{ projectId?: string }` — sans id → `createMiniatureForStudio` ; avec id → `linkProjectToStudio`. 400 si 4ᵉ. `rejectNonJsonRequest` sur POST.
- `DELETE` JSON `{ projectId }` → `unlinkProjectFromStudio`

Outil `link_studio_miniature` :

```ts
z.object({
  video_id: z.string().min(8).max(80),
  action: z.enum(["link", "unlink", "create"]),
  project_id: z.string().min(4).max(80).optional(),
})
```

`video_id` accepte `studio:` nu. `link` / `unlink` exigent `project_id`. Label FR : `"Lie une miniature à la fiche"`. SKILL.md : Vidéos / studio ; never `generate_sketch` / `apply_workflow` ; `list_projects` pour choisir un id.

Importer dans `all.ts`. Ajouter le nom dans `registry-full` et `mcp-server`.

Relire `refuseWrongSurface` : `link_studio_miniature` déjà dans `STUDIO_FILL_TOOLS` (Task 2).

- [ ] **Step 4: Run tests**

Run: `./node_modules/.bin/vitest run tests/studio/link-project.test.ts tests/agent/studio-tools.test.ts tests/agent/registry-full.test.ts tests/agent/mcp-server.test.ts tests/agent/studio-surface-guard.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts src/lib/studio/link-project.ts src/app/api/studio/videos/[videoId]/miniature/route.ts src/lib/agent/tools/link-studio-miniature.ts src/lib/agent/skills/link_studio_miniature/SKILL.md src/lib/agent/tools/all.ts src/lib/agent/tool-labels.ts tests/studio/link-project.test.ts tests/agent/studio-tools.test.ts tests/agent/registry-full.test.ts tests/agent/mcp-server.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): attach up to three canvas projects to a video fiche for A/B

EOF
)"
```

---

### Task 19: Afficher et picker les miniatures A/B sur la fiche

**Files:**
- Create: `src/components/studio/LinkedThumbs.tsx`
- Modify: `src/components/studio/VideoEditor.tsx` (section sous A/B Titre)
- Test: `tests/studio/linked-thumbs.test.tsx`, `tests/studio/video-editor.test.tsx`

**Interfaces:**
- Consumes: `GET /api/studio/videos/:id/miniature`, `GET /api/miniatures` (déjà `coverImageUrl`), POST/DELETE miniature
- Produces: section « Miniatures A/B » — 3 emplacements 16:9, badges A/B/C, picker Dialog, CTA « Créer une miniature »

Copy FR verrouillée : titre de section `Miniatures A/B` ; bouton `Lier une miniature` ; bouton `Créer une miniature` ; empty `Aucune miniature liée — lie un projet canvas pour tester A/B.` ; picker title `Choisir une miniature`. Jamais « Notion » / « Tester et comparer » YouTube.

- [ ] **Step 1: Write the failing tests**

```tsx
// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import LinkedThumbs from "@/components/studio/LinkedThumbs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("LinkedThumbs", () => {
  it("renders A/B/C slots from linked canvas covers and does not mention Notion or Studio experiments", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onLink = vi.fn();
    const onCreate = vi.fn();
    await act(async () => {
      root.render(
        <LinkedThumbs
          projects={[
            { id: "proj_1", name: "Vibe Coding", coverImageUrl: "/api/generated-images/image?id=abc", slot: "A" },
          ]}
          onLinkClick={onLink}
          onCreateClick={onCreate}
        />,
      );
    });
    expect(container.textContent).toContain("Miniatures A/B");
    expect(container.textContent).toContain("Vibe Coding");
    expect(container.textContent).toMatch(/\bA\b/);
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/m/proj_1");
    expect(container.textContent).toContain("Lier une miniature");
    expect(container.textContent).toContain("Créer une miniature");
    expect(container.textContent).not.toMatch(/Notion|Tester et comparer/i);
    await act(async () => root.unmount());
    container.remove();
  });
});
```

(`vi` : importer depuis `vitest`.) Étendre `video-editor.test.tsx` : après load, la page contient `Miniatures A/B` (même sans projet lié).

- [ ] **Step 2: Run tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/studio/linked-thumbs.test.tsx tests/studio/video-editor.test.tsx`

Expected: FAIL — module / section absents

- [ ] **Step 3: Write minimal implementation**

`LinkedThumbs` : grille 3 colonnes `aspect-video`, `img` ou placeholder Lucide `ImagePlus` (même esprit que `ProjectTile` dans `MiniaturesView.tsx`, **sans extraire** ce composant). Lien `/m/${id}`. Boutons ≥44px. `prefers-reduced-motion` : pas de zoom.

Picker : Dialog `base-ui` qui `GET /api/miniatures`, liste nom + cover, clic → `POST /api/studio/videos/${videoId}/miniature` `{ projectId }`, puis refetch. Ignore les ids déjà liés. Si la liste est vide : « Crée d’abord une miniature dans Mes miniatures. »

`Créer une miniature` : `POST` sans `projectId`, puis `router.push(/m/${id})` (même navigation que `MiniaturesView`).

Monter dans `VideoEditor` **sous** « A/B Titre », au-dessus du dock (`pb-24` déjà). `GET` miniature en parallèle du GET fiche (pas de CLS : 3 emplacements toujours montés, empty state dans les slots).

- [ ] **Step 4: Run tests**

Run: `./node_modules/.bin/vitest run tests/studio/linked-thumbs.test.tsx tests/studio/video-editor.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/studio/LinkedThumbs.tsx src/components/studio/VideoEditor.tsx tests/studio/linked-thumbs.test.tsx tests/studio/video-editor.test.tsx
git commit -m "$(cat <<'EOF'
feat(studio): show linked canvas thumbnails as A/B slots on the video fiche

EOF
)"
```

---

### Task 20: Pré-test titres TypeSafe (optionnel) + filet miniature

**Files:**
- Create: `src/lib/studio/title-pretest.ts`
- Create: `src/app/api/studio/videos/[videoId]/pretest/route.ts`
- Modify: `src/components/studio/TitleVariantsTable.tsx`
- Test: `tests/studio/title-pretest.test.ts`
- Filet : relancer les suites Tasks 17–19 + `tsc` / eslint des fichiers touchés

**Interfaces:**
- Consumes: `draft.titleVariants`, `typesafeApiKey`, `jevClickNouls` (`src/lib/typesafe/rerank-titles.ts`) — relire la signature réelle
- Produces: `pretestTitleVariants(videoId: string): Promise<Array<TitleVariant & { score: number | null; reason: string }>>`

Sans clé : `score: null`, `reason = "Ajoute TypeSafe dans Réglages → Connexions pour un pré-test Jev"`, **aucun fetch**. Avec clé : wrapper `rankStudioTitles` mockable. **Pas** d’API YouTube Studio, pas de `videos.update`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { getDb } from "@/lib/db";
import { emptyStudioDraft } from "@/lib/studio/page-template";
import { createStudioVideo, saveStudioDraft } from "@/lib/studio/store";
import { pretestTitleVariants } from "@/lib/studio/title-pretest";

let videoId = "";

beforeEach(() => {
  getDb().exec("DELETE FROM studio_drafts");
  getDb().exec("DELETE FROM studio_videos");
  getDb().exec("DELETE FROM settings");
  videoId = createStudioVideo({ title: "Vibe Coding", etiquette: "En cours" }).videoId;
  const draft = emptyStudioDraft();
  draft.titleVariants[0] = { title: "Créer une app sans coder", thumbText: "vibe coding", visualConcept: "" };
  draft.titleVariants[1] = { title: "Vibe Coding : c’est quoi ?", thumbText: "LE GUIDE DÉBUTANT", visualConcept: "" };
  saveStudioDraft(videoId, draft);
});

describe("pretestTitleVariants", () => {
  it("does not call TypeSafe when the key is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const rows = await pretestTitleVariants(videoId);
    expect(rows[0]?.score).toBeNull();
    expect(rows[0]?.reason).toMatch(/TypeSafe/);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/studio/title-pretest.test.ts`

Expected: FAIL — module missing

- [ ] **Step 3: Write minimal implementation**

```ts
export async function pretestTitleVariants(videoId: string): Promise<Array<TitleVariant & { score: number | null; reason: string }>> {
  const video = getStudioVideo(videoId);
  if (!video) throw new Error("Fiche vidéo introuvable.");
  if (!typesafeApiKey()) {
    return video.draft.titleVariants.map((row) => ({
      ...row,
      score: null,
      reason: "Ajoute TypeSafe dans Réglages → Connexions pour un pré-test Jev",
    }));
  }
  const ranked = await rankStudioTitles(
    video.draft.titleVariants.map((row, index) => ({ videoId: `row_${index}`, title: row.title })),
  );
  return video.draft.titleVariants.map((row, index) => ({
    ...row,
    score: ranked.get(`row_${index}`) ?? null,
    reason: ranked.get(`row_${index}`) == null ? "Jev n’a pas noté cette ligne" : "",
  }));
}

export async function rankStudioTitles(
  titles: Array<{ videoId: string; title: string }>,
): Promise<Map<string, number>> {
  return jevClickNouls("studio-pretest", titles, "followed");
}
```

Relire `jevClickNouls` : si le 3ᵉ arg ou le type `TitleCandidate` diffère, adapter le test/impl, ne pas inventer un second client HTTP.

Route `POST /api/studio/videos/[videoId]/pretest` → `pretestTitleVariants`. UI : bouton « Pré-tester les titres » sous la table (disabled si les 3 titres sont vides). Afficher `score` à côté de la ligne. Deep-link Studio **uniquement** si `youtubeVideoId` existe déjà : `https://studio.youtube.com/video/${id}/edit` — pas un appel API.

- [ ] **Step 4: Run tests + filet**

Run:

```bash
./node_modules/.bin/vitest run \
  tests/studio/title-pretest.test.ts \
  tests/studio/link-project.test.ts \
  tests/studio/linked-thumbs.test.tsx \
  tests/studio/corpus.test.ts \
  tests/studio/video-editor.test.tsx \
  tests/agent/studio-tools.test.ts \
  tests/agent/registry-full.test.ts
./node_modules/.bin/tsc --noEmit
```

Expected: PASS / 0 errors

Rebuild Docker **une fois** depuis le repo principal (pas un worktree) si le checkout sert `:3000` et que les Tasks 11–20 doivent être visibles. Ne pas toucher `data/thumbgen.db`. Ne pas appeler TypeSafe / YouTube / OpenRouter.

- [ ] **Step 5: Commit**

```bash
git add src/lib/studio/title-pretest.ts src/app/api/studio/videos/[videoId]/pretest/route.ts src/components/studio/TitleVariantsTable.tsx tests/studio/title-pretest.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): pretest A/B titles with TypeSafe when a key exists

EOF
)"
```

---

## Mobile, a11y, reduced-motion (contrat transversal)

Déjà exigé dans les tasks UI. Check final (Task 16 manuelle) :

| Sujet | Règle verrouillée |
|---|---|
| Overlay phone | `inset-0`, `h-dvh`, safe-area, composer 16px, pas de `autoFocus` |
| Dock phone | `max-w-[calc(100vw-2rem)]`, `right-4 bottom-4`, déjà ChatPanel |
| Focus | trap overlay ; Fermer / C’est parti / textarea tabulables |
| Escape | overlay only (dock : minimize existant, pas Escape=quitter la fiche) |
| Labels | Fermer, Titre, Notes, Script, Description, A/B colonnes (déjà) |
| Live | phase + filling `aria-live="polite"` — les toasts ne volent pas le focus |
| Motion | `transform`/`opacity` 150ms ; `motion-reduce:animate-none` ; pas de `transition-all` |
| CLS | coques montées avant le GET et avant l’upsert |
| Unsaved | abandon confirm si conversation commencée et fiche encore invisible |

---

## Self-review

### Spec coverage

| Exigence chef | Task |
|---|---|
| Overlay chat, pas form titre+desc | 11, 12 |
| Agent d’abord brainstorm | 5 (`write_video`), 14 (`/ecrire`) |
| Document de chaîne + 15 transcripts **puis** studio | 5, 17 (`retrieveOwnCorpus` channel-first) |
| Questions format production | 5 `studio_format` |
| Titres A/B + description + script | 5, 9 |
| Dock = même conversation, PATCH tout champ | 9, 10, 11, 14 |
| « L’agent prépare les données » + fill live | 3, 8, 9, 13 |
| Skills écriture séparées des miniatures | 2, 4, 5, 6, 7 |
| `/ecrire` + slash format | 4 |
| Template Vibe Coding (pas workflow canvas) | 5 + `page-template.ts` |
| System prompt surface | 6, 7 |
| Pas F3c / pas Notion | constraints + skills |
| Draft `vid_` immédiat, carte cachée | 1, 12 |
| Miniatures A/B liées (picker + covers) | 18, 19 |
| TypeSafe titres si clé / pas d’API Studio | 20 |
| Focus / Escape / reduced-motion | 11, 16 |
| Skeleton sans CLS | 13 |
| Mobile dock + overlay | 11, 13, 16 |
| Commits par task | Steps 5 |

### Placeholder scan

Pas de TBD / TODO / « similar to Task N » / « add validation later ». Create overlay : `studio-create-store` + `pendingSend` (aucun `window` CustomEvent).

### Type consistency

| Nom | Défini | Réutilisé |
|---|---|---|
| `AgentSurface` | Task 2 | 4, 6, 10 |
| `refuseWrongSurface` | Task 2 | 7 |
| `StudioAgentPhase` / `STUDIO_PHASE_COPY` | Task 3 | 11, 13 |
| `advanceStudioPhase` | Task 3 | 10 |
| `slashSkillsForSurface` | Task 4 | 10 Composer |
| `StudioDraftPatch` / `STUDIO_DRAFT_PATCH_PART` | Task 8 | 9, 10, 13, 14 |
| `studioDraftPatchFromVideos` | Task 9 | route-handler |
| `isStudioDraftVisible` | Task 1 | 12 |
| `pendingSend` | Task 10 (prop) / 14 (send effect) | ChatPanel + host |
| `useStudioCreateStore` | Task 11 | 12 |
| `toolNameFromPart` | Task 10 | ChatPanel |
| `layout: "dock" \| "overlay"` | Task 10 | 11 |
| `linkProjectToStudio` / `MAX_STUDIO_THUMBS` | Task 18 | 19, outil |
| `LinkedStudioProject.slot` | Task 18 | 19 |
| `pretestTitleVariants` / `rankStudioTitles` | Task 20 | table A/B |

### Risques restants

- Transcripts `source=none` (pas de sous-titres publics) : l’agent doit le dire, pas inventer le parlé. L’ingest existe déjà — ne pas ajouter Whisper.
- `generateChannelKnowledge` est payant et **déjà** passé à l’analyse Réglages. Ne pas le relancer dans `write_video`.
- Overlay → dock : si `Dialog` démonte `ChatPanel`, `resumeStream` est le filet (commenter dans le host). Même `projectId` obligatoire.
- 4ᵉ miniature : erreur FR, pas de file d’attente silencieuse.
- TypeSafe sans clé = zéro réseau. Ne pas « tester » Jev en CI.
- Phase 3 publish YouTube et expériences live Studio restent hors de ce plan.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-20-studio-create-agent.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints. REQUIRED SUB-SKILL: superpowers:executing-plans.

Which approach?
