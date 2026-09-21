# Studio d’écriture YouTube Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformer ThumbGen en CMS + studio d’écriture YouTube : les fiches vidéo vivent dans SQLite, on écrit chaque nouvelle vidéo sur le modèle maison (Vibe Coding / 9 sections, titres A/B, description), en s’appuyant sur le corpus local (Document de chaîne + titres / descriptions / transcripts déjà ingérés, puis drafts studio) — le lien miniature A/B est dans le plan create-agent ; plus tard : publier sur YouTube, pré-tester les titres (TypeSafe) et afficher les stats déjà ingérées.

**Architecture:** Phase 1 crée un store SQLite (`studio_videos` + brouillons + FTS). ThumbGen est la source de vérité. Aucun client Notion dans le runtime : pas de sync, pas d’écriture bidirectionnelle, pas de clé API Notion. Un import one-shot (CSV ou collage markdown) peut migrer l’ancienne base, puis on n’y touche plus. L’agent réutilise Brainstorm (skills / `read_skill` / `finish_turn`, pas de parcours 7 étapes). Les conversations d’écriture utilisent `project_id = studio:<videoId>` sans créer de ligne `projects_meta`. Les phases 2–4 restent in-app : lien miniature, upload YouTube (scope OAuth incrémental), pré-test TypeSafe + deep-link Studio.

**Tech Stack:** Next.js 16.2 App Router, React 19.2, TypeScript strict, Tailwind v4, shadcn `base-nova` (`@base-ui/react`), Zustand 5, zod 4, better-sqlite3 + FTS5, vitest 4, YouTube Data API v3 + OAuth déjà présent, `youtube-transcript` / `src/lib/youtube/captions.ts` existants. **Pas de package ni de fetch `api.notion.com`.**

### Révision 2026-09-20 (chef)

ThumbGen **remplace** Notion, il ne s’y branche pas. Supprimé de ce plan : client HTTP Notion, sync périodique, `notionApiKey` / `notionDatabaseId` / `notionPropertyMap`, carte Intégrations, `push_studio_video`, upload de fichiers vers la propriété Notion `Miniatures`, écriture de l’URL YouTube dans Notion. Conservé comme *modèle de contenu* (pas comme intégration) : les 5 Étiquettes, la structure Vibe Coding, un import one-shot optionnel.

### Révision 2026-09-20 (create-agent — miniature A/B)

Le CTA « Nouvelle vidéo » + l’orchestration overlay → dock + le **lien miniature A/B sur la fiche** sont maintenant spécifiés dans `docs/superpowers/plans/2026-09-20-studio-create-agent.md` (Tasks 11–20). **Mêmes contrats** que ce plan : `projects_meta.studio_video_id`, `src/lib/studio/link-project.ts`, `LinkedThumbs`, max 3 covers, pas d’API YouTube Test & Compare, TypeSafe titres seulement si clé. Ne pas implémenter une seconde variante ici. Phases 3–4 (publish, stats live) restent dans **ce** fichier.

---

## UI/UX (contrat d’écrans)

Cette section verrouille l’IA. L’implémentation (Tasks 10–12) la suit ; elle ne réinvente pas une app « notes ».

### Navigation

Même shell que `/miniatures` et `/bibliotheque` : `AppSidebar` + `SidebarInset`. Nouvel item **Vidéos** (`Clapperboard`, Lucide) **entre** « Mes miniatures » et « Bibliothèque ». Pied inchangé (Usage, Réglages). Rail collapsed : +1 bouton (le test `collapsed-rail` passe de 4 à 5 `sidebar-menu-button`).

| Route | Rôle |
|---|---|
| `/videos` | Pipeline : kanban (défaut) ou liste compacte |
| `/videos/[videoId]` | Fiche d’écriture + chat docké |
| `/miniatures` | Galerie de projets canvas (inchangé) |
| `/m/[id]` | Canvas + `ChatPanel` (inchangé) |
| `/bibliotheque` | Personas / logos / inspirations (inchangé) |

`/` continue de rediriger vers `/miniatures`. Une vidéo n’est **pas** un projet canvas. `listProjects` / la galerie ignorent les ids `studio:`.

### `/videos` — kanban d’abord, liste en secours

Cinq colonnes, ordre figé (celui du kanban actuel) :

`Propositions` → `Pas commencer` → `En cours` → `En prod` → `Terminer`

- **Kanban (défaut).** Colonnes pleine hauteur, cartes denses : titre (2 lignes max), pastille URL YouTube si présente, rien d’autre. Clic → `/videos/[videoId]`. Drag de carte = `PATCH` `etiquette` (pas un modal).
- **Liste (toggle).** Une table titre / étiquette / URL / mis à jour — pour scanner les « Terminer » ou chercher. Pas un second produit.
- **CTA unique :** « Nouvelle vidéo » (haut droite, même place que « Nouvelle miniature »). Crée une fiche `Propositions` au modèle vide et ouvre l’éditeur.
- **Import (secondaire).** Menu ⋯ « Importer un export » (CSV ou collage markdown). Pas dans le hero. Pas de bouton « Synchroniser ».
- **Empty :** composant `Empty` déjà utilisé sur Miniatures. Titre : « Aucune vidéo pour l’instant ». Corps : « ThumbGen est ton studio d’écriture. Crée une fiche, ou importe un export une fois. » CTA : « Nouvelle vidéo ».
- Header comme Bibliothèque / Miniatures : `font-heading text-2xl`, sous-titre `text-sm text-muted-foreground`, `max-w` seulement en mode liste. Le kanban utilise toute la largeur de l’inset (pipeline, pas galerie 3 colonnes).

### `/videos/[videoId]` — éditeur + agent

Pas une page Notion. Pas un wizard. **Create-agent :** overlay chat au create, puis le **même** `ChatPanel` en dock bas-droite (`fixed right-4 bottom-4`, déjà le canvas). Plus de rail chat à droite sur la fiche.

```
┌ sidebar ┬ header: titre éditable · Étiquettes · [Enregistré] ┬──────────┐
│         ├────────────────────────────────────────────────────┤          │
│ Vidéos  │ Script (9 H2, measure ~65–75 car.)                            │
│ actife  │ Description (apprentissages / timestamps / tags)              │
│         │ A/B Titre — 3 lignes Titre | Texte min. | Concept             │
│         │ Miniatures A/B — jusqu’à 3 covers canvas (create-agent)       │
│         │                                              ┌──────────┐     │
│         │                                              │ dock BR  │     │
│         │                                              └──────────┘     │
└─────────┴───────────────────────────────────────────────────────────────┘
```

- **Une colonne scrollable** (pas trois panneaux égaux). Ordre : Script → Description → A/B Titre → Miniatures A/B. C’est le modèle Vibe Coding, pas une soupe de blocs.
- **Dock :** le **même** `ChatPanel` avec `projectId={writingProjectId(videoId)}` (create-agent : overlay puis dock). Pas un second agent, pas d’étapes 1/7. `/ecrire` en tête du picker studio. Autosave PATCH debounce 800 ms (comme un brouillon, pas un « Publish to Notion »).
- **Étiquettes :** un `Select`, pas une property database. Les 5 valeurs, rien d’inventé (`Status`, `Done` interdits).
- **404 :** « Vidéo introuvable » + lien vers `/videos`. Jamais « synchronise Notion ».
- Canvas store vide sur cette route : `snapshotCanvas` envoie des nodes vides. `buildStudioVideoBlock` suffit. La skill interdit `thumbnail-packaging` / `apply_workflow` sauf demande explicite de miniature.

### Relation Miniatures (Phase 1 = mention, Phase 2 = bouton)

Deux objets, deux métiers :

| | **Vidéos** | **Mes miniatures** |
|---|---|---|
| Quoi | Fiche éditoriale (script, titres, statut) | Projet canvas (workflow, variantes image) |
| Chat | Coach d’écriture (`write_video`) | Brainstorm packaging / croquis |
| Phase 1 | Aucun lien obligatoire | Inchangé |
| Phase 2 | « Lier une miniature » / « Créer une miniature » sur la fiche — **exécuté dans le plan create-agent** (picker `/api/miniatures`, 3 slots A/B/C) | Le projet créé apparaît dans la galerie, `studio_video_id` en meta |

On ne pousse **pas** de fichiers vers un cloud tiers. Les 3 variantes restent dans ThumbGen. Plus tard on choisit un projet canvas **depuis la fiche**, on n’inverse pas le modèle (la galerie ne devient pas un kanban d’écriture).

### Ce qu’on ne copie pas de Notion

- Pages-soupe (callouts, toggles imbriqués, bases dans des pages).
- Properties partout (on a 4 champs utiles : nom, URL, étiquette, + le brouillon structuré).
- Sync / « ouvrir dans Notion » / backlinks.
- Un éditeur bloc générique. Les zones sont **typées** : script, description, table A/B.

### Principes visuels (3)

1. **Même peau que l’app.** Tokens `bg-background` / `text-muted-foreground` / `border-border`, thème sombre par défaut (`layout.tsx`), `font-heading` pour les titres de page, Arial/Helvetica pour le corps (déjà sur `body`). Pas de nouvelle palette, pas de page blanche « docs ».
2. **Densité selon le métier.** Kanban = compact (titre + pastille). Éditeur = aéré, measure lisible, table A/B en données (chiffres tabulaires si scores Phase 4). Une CTA primaire par écran.
3. **L’agent est un dock, pas un parcours.** Même `ChatPanel` que le canvas ; ouvrir/fermer mémorisé (`thumbgen.chat.open`). Zéro « Étape n/7 ». Icons Lucide, pas d’emoji structurants.

Accessibilité (plancher, pas un discours) : contrastes tokens existants, labels visibles (pas placeholder-only), focus ring, `aria-label` sur les icon-only, cibles ≥44px, `prefers-reduced-motion` sur le drag kanban.

---

## Global Constraints

- **AGENTS.md — APIs payantes.** Ne pas appeler OpenRouter, Perplexity, YouTube Data (quota), ni TypeSafe pendant les tests automatisés. Les tests mockent `fetch` / `youtube-transcript`. Un humain doit avoir dit oui dans le chat d’exécution avant tout appel réel payant.
- **AGENTS.md — base live.** Ne jamais ouvrir ni écrire `data/thumbgen.db`. Les tests utilisent le DB temporaire de `tests/setup.ts` (`THUMBGEN_DB_PATH`).
- **AGENTS.md — Docker.** Rebuild uniquement depuis le **repo principal** (`git worktree list`), jamais depuis un worktree : `docker compose up -d --build`. Une seule rebuild, à la fin de la Phase 1 UI (Task 12).
- **AGENTS.md — tests.** `./node_modules/.bin/vitest run <fichier>` (pas `npx`). Node : `/opt/homebrew/bin/node` si `node` manque. Typecheck : `./node_modules/.bin/tsc --noEmit`. Lint : `./node_modules/.bin/eslint <files>`.
- **AGENTS.md — pas de wizard F3c.** Aucun « Étape n/7 », aucune Fiche / thumbnail brief. Skills Brainstorm uniquement (`src/lib/agent/skills/*/SKILL.md`, catalog + `read_skill`).
- **Pas de Notion runtime.** Interdit d’ajouter `notionApiKey`, un fetch `api.notion.com`, une carte Intégrations Notion, un bouton « Synchroniser Notion », ou un outil `push_studio_video`. `INSTALL.md` peut encore citer `NOTION_API_KEY` (swipe files historique) : ne pas le brancher ici.
- **Étiquettes.** Uniquement les cinq valeurs observées le 2026-09-20. Ne pas inventer `Status`, `Title`, `Done`.
- **UI.** Copy française ; apostrophes JSX en `&apos;`. shadcn `base-nova` (pas Radix). `cn` depuis `"cn"`.
- **Commits.** Un commit par task, uniquement les fichiers listés. Jamais `git add -A`.
- **Relire avant d’éditer.** Chaque task qui modifie un fichier existant le relit d’abord : le code cité ici est un ancrage, pas un numéro de ligne.

---

## Chunk 1: Recherche, décisions, carte des fichiers

### Modèle d’écriture (lu le 2026-09-20 — contenu, pas une intégration)

L’ancienne base « 📹 Vidéo Youtube » sert de **référence de métier** (statuts + squelette de page). Elle n’est plus une source de vérité ni un backend.

**Étiquettes (kanban, ne pas en inventer) :** `Propositions`, `Pas commencer`, `En cours`, `En prod`, `Terminer`.

**Champs utiles à migrer une fois :** titre (`Nom`), URL YouTube (`URL`, souvent vide sur les brouillons), étiquette. Les fichiers « Miniatures » Notion sont ignorés (les images vivent déjà dans ThumbGen).

**Squelette « Nouvelle vidéo » / page Vibe Coding** — c’est le style maison, pas le sujet à recopier :

1. Script long — 9 sections numérotées (Introduction → Conclusion), CTA d’abonnement dans l’intro.
2. Description — apprentissages (`👉` / `✅`) + timestamps (`⌚️`) + hashtags.
3. Table **A/B Titre** — 3 lignes : `Titre` | `Texte miniature` | `Concept visuel`.
4. Zone Miniature — 3 variantes (Phase 2 = projet canvas, pas des fichiers cloud).

Pages plus anciennes (ex. n8n, headings `Introduction` / `Solution N` / `Outro`) : à l’import, script brut, sans forcer le nouveau squelette.

Kanban observé (19 lignes, pour l’import de démo / fixtures) : En prod = Grok Bot ; En cours = Vibe Coding ; Terminer avec URL = LM Studio `67TPSTL0NsA`, RAG n8n `xWSj6rDwb8M`, MCP `O-qkHPAcpMw`, WhatsApp `uUL1eE7R9KI`, n8n install `Dv74NSS_zJo`, No Code `cKTpxLpMXew`.

### Enquête outils (inspirer, ne pas cloner)

| Famille | Pattern à voler | Déjà dans ThumbGen | Hors v1 |
|---|---|---|---|
| Écriture | Outline → script → description / chapitres ; voix de marque depuis *leurs* transcripts | `extract_youtube_script`, cache `video_transcripts`, `search_my_channel` FTS | Éditeur Descript, Whisper, embeddings |
| Croissance YT | 3 variantes titre ; stats | TypeSafe/Jev, analytics OAuth readonly, snapshots | Rotation TubeBuddy, scrape Social Blade |
| CMS | Kanban + fiche structurée. **ThumbGen = SoT** | Rien aujourd’hui | Buffer / Make / sync Notion |
| Thumb A/B | 3 variantes titre+visuel | Canvas A/B/C | API Studio expériences (n’existe pas) |

### ThumbGen aujourd’hui (lu dans le code)

- Agent : `src/lib/agent/v2/route-handler.ts`, `system-prompt.ts` (Brainstorm + catalog `read_skill`), `ChatPanel` lié à `project_id` (monté depuis `Canvas.tsx` ligne ~269), conversations `src/lib/agent/conversation/store.ts`.
- Skills : `src/lib/agent/skills/` + slash `slash-catalog.ts` (`/script` = `extract_youtube_script`).
- Transcripts : `extract-youtube-script.ts`, `captions.ts`, `knowledge-store.ts` FTS.
- YouTube : clé Data API + OAuth **readonly**. Pas d’`videos.insert` / `thumbnails.set`.
- Miniatures : `createProject(name, description)` → id `proj_${Date.now()}` ; galerie `/miniatures` ; canvas `/m/[id]`.
- Nav : Miniatures, Bibliothèque ; footer Usage + Réglages. Home = redirect `/miniatures`.
- Interdit : F3c 7 étapes (rappel système « Never mention step 3 of 7 »).

### Décisions (qualité de design, une reco)

1. **Persistance.** A) pages markdown sur disque. **B) SQLite + FTS (choisi)** — même famille que Ma chaîne. C) embeddings — payant, hors v1. D) Notion live / sync — **rejeté** (le chef remplace Notion).
2. **Agent d’écriture.** A) second agent. **B) même Brainstorm + skill `write_video` (choisi)**. C) wizard — interdit.
3. **Conversations.** `project_id = studio:<videoId>` via `writingProjectId`. Pas d’`ALTER` conversations en Phase 1. `listProjects` / `/miniatures` ignorent ces ids.
4. **Import.** One-shot CSV (colonnes `Nom,URL,Étiquettes`) ou collage markdown. Génère de **nouveaux** `videoId` ThumbGen. Pas de fetch Notion. Pas de re-import automatique.
5. **Écriture.** Toujours le store local. Pages legacy importées = script brut ; les nouvelles fiches naissent sur le modèle Vibe Coding.
6. **Phase 4 A/B live.** Pas d’API Test & Compare. 3 variantes + score TypeSafe (si clé, clic utilisateur) + lien Studio. Pas de rotation `videos.update`.

### Périmètre par phase

| Phase | Livre tout seul | Dépend de |
|---|---|---|
| **1 — NOW** | Store vidéos, `/videos` kanban, éditeur modèle, agent RAG local, import optionnel | Rien d’autre |
| **2** | Lier un projet canvas à une fiche ; afficher les couvertures A/B/C — **spécifié + exécuté dans create-agent** | Phase 1 |
| **3** | Publier brouillon YouTube (titre, description, miniature) ; écrire `youtube_url` **dans SQLite** | Phase 1 (+ 2 si une miniature existe) |
| **4** | Pré-tester 3 titres (TypeSafe) ; surface stats déjà ingérées ; deep-link Studio | Phase 1 ; 3 pour les tests post-upload |

---

### File Structure

**Create — Phase 1**

- `src/lib/studio/types.ts` — `Etiquette`, `TitleVariant`, `StudioDraft`, `StudioVideo`, `CorpusHit`, `newStudioVideoId`, `writingProjectId`, `isWritingProjectId`, `videoIdFromWritingProject`.
- `src/lib/studio/page-template.ts` — `emptyStudioDraft`, `parseStudioPageMarkdown`, `renderStudioPageMarkdown`, `isNewTemplateMarkdown` (format d’import + modèle vide).
- `src/lib/studio/migrations.ts` — `STUDIO_TABLES_DDL` + FTS + `migrateStudioTables`.
- `src/lib/studio/store.ts` — CRUD `studio_videos` / `studio_drafts` + index FTS.
- `src/lib/studio/import.ts` — `parseStudioCsv`, `importStudioCsv`, `importStudioMarkdown` (one-shot, pas de réseau).
- `src/lib/studio/corpus.ts` — ingest captions + `retrieveOwnCorpus`.
- `src/lib/agent/tools/list-studio-videos.ts`, `get-studio-video.ts`, `retrieve-own-corpus.ts`, `upsert-studio-script.ts`, `create-studio-video.ts`.
- `src/lib/agent/skills/write_video/SKILL.md`, `retrieve_own_corpus/SKILL.md`, `list_studio_videos/SKILL.md`, `get_studio_video/SKILL.md`, `upsert_studio_script/SKILL.md`, `create_studio_video/SKILL.md`.
- `src/app/api/studio/videos/route.ts`, `src/app/api/studio/videos/[videoId]/route.ts`, `src/app/api/studio/import/route.ts`.
- `src/app/videos/page.tsx`, `src/app/videos/[videoId]/page.tsx`.
- `src/components/studio/VideosBoard.tsx`, `VideoEditor.tsx`, `TitleVariantsTable.tsx`.
- Tests listés dans chaque task.

**Create — Phases 2–4**

- `src/lib/studio/link-project.ts`.
- `src/lib/studio/youtube-publish.ts`, `youtube-publish-auth.ts`.
- `src/lib/studio/title-pretest.ts`, `stats-copy.ts`.
- `src/app/api/studio/videos/[videoId]/miniature/route.ts`, `.../publish/route.ts`, `.../pretest/route.ts`.
- `src/components/studio/VideoStats.tsx`.
- Tests correspondants.

**Modify**

- `src/lib/db.ts` — appeler `migrateStudioTables` après `migrateChannelTables`.
- `src/lib/agent/tools/all.ts`, `tool-labels.ts`, `skills/slash-catalog.ts`, `system-prompt.ts` (`buildStudioVideoBlock` après `channelKnowledge`).
- `src/lib/local-storage.ts` — `listProjects` ignore les ids `studio:`.
- `src/lib/agent/tools/list-projects.ts` — même filtre SQL.
- `src/lib/youtube/oauth.ts` — scope upload Phase 3.
- `src/components/panels/AppSidebar.tsx`.
- Tests registry / MCP / slash / sidebar cités dans les tasks.

**Ne pas créer**

- `src/lib/studio/notion-client.ts`, `sync.ts`, `notion-files.ts`
- `src/components/settings/NotionIntegrationCard.tsx`
- `src/app/api/studio/sync/route.ts`
- `src/lib/agent/tools/push-studio-video.ts` ni skill `push_studio_video`
- clés `notionApiKey` / `notionDatabaseId` / `notionPropertyMap` dans `settings-schema.ts`

---

## Chunk 2: Phase 1 — fondations

### Task 1: Types, Étiquettes, project_id d’écriture

**Files:**
- Create: `src/lib/studio/types.ts`
- Test: `tests/studio/types.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ETIQUETTES`, `Etiquette`, `isEtiquette`, `newStudioVideoId`, `TitleVariant`, `StudioDraft`, `StudioVideo`, `writingProjectId`, `isWritingProjectId`, `videoIdFromWritingProject`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  ETIQUETTES,
  isEtiquette,
  isWritingProjectId,
  newStudioVideoId,
  videoIdFromWritingProject,
  writingProjectId,
} from "@/lib/studio/types";

describe("studio types", () => {
  it("lists the five observed Étiquettes and rejects invented statuses", () => {
    expect([...ETIQUETTES]).toEqual(["Propositions", "Pas commencer", "En cours", "En prod", "Terminer"]);
    expect(isEtiquette("En cours")).toBe(true);
    expect(isEtiquette("Status")).toBe(false);
    expect(isEtiquette("Done")).toBe(false);
  });

  it("mints a local video id and a writing project id that is not a canvas project", () => {
    const videoId = newStudioVideoId();
    expect(videoId.startsWith("vid_")).toBe(true);
    expect(videoId.length).toBeGreaterThan(8);
    expect(writingProjectId(videoId)).toBe(`studio:${videoId}`);
    expect(isWritingProjectId(`studio:${videoId}`)).toBe(true);
    expect(isWritingProjectId("default")).toBe(false);
    expect(isWritingProjectId("proj_123")).toBe(false);
    expect(videoIdFromWritingProject(`studio:${videoId}`)).toBe(videoId);
    expect(videoIdFromWritingProject("default")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/studio/types.test.ts`

Expected: FAIL — `Cannot find module '@/lib/studio/types'`

- [ ] **Step 3: Write minimal implementation**

```ts
export const ETIQUETTES = ["Propositions", "Pas commencer", "En cours", "En prod", "Terminer"] as const;
export type Etiquette = (typeof ETIQUETTES)[number];

export function isEtiquette(value: string): value is Etiquette {
  return (ETIQUETTES as readonly string[]).includes(value);
}

export const WRITING_PROJECT_PREFIX = "studio:";
export const STUDIO_VIDEO_ID_PREFIX = "vid_";

export function newStudioVideoId(): string {
  return `${STUDIO_VIDEO_ID_PREFIX}${crypto.randomUUID().replace(/-/g, "")}`;
}

export type TitleVariant = {
  title: string;
  thumbText: string;
  visualConcept: string;
};

export type StudioDraft = {
  script: string;
  description: string;
  titleVariants: [TitleVariant, TitleVariant, TitleVariant];
};

export type StudioVideo = {
  videoId: string;
  title: string;
  youtubeUrl: string | null;
  youtubeVideoId: string | null;
  etiquette: Etiquette | null;
  createdAt: string;
  updatedAt: string;
  draft: StudioDraft;
};

export type CorpusHit = {
  source: "studio" | "channel";
  videoId?: string;
  youtubeVideoId?: string;
  title: string;
  snippet: string;
  kind: "script" | "description" | "transcript" | "title";
};

export function writingProjectId(videoId: string): string {
  return `${WRITING_PROJECT_PREFIX}${videoId}`;
}

export function isWritingProjectId(projectId: string): boolean {
  return projectId.startsWith(WRITING_PROJECT_PREFIX);
}

export function videoIdFromWritingProject(projectId: string): string | null {
  if (!isWritingProjectId(projectId)) return null;
  return projectId.slice(WRITING_PROJECT_PREFIX.length);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/studio/types.test.ts`

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/studio/types.ts tests/studio/types.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): lock Étiquettes and local writing project ids

EOF
)"
```

---

### Task 2: Modèle de brouillon « Nouvelle vidéo »

**Files:**
- Create: `src/lib/studio/page-template.ts`
- Test: `tests/studio/page-template.test.ts`

**Interfaces:**
- Consumes: `StudioDraft`, `TitleVariant` from Task 1.
- Produces: `emptyStudioDraft()`, `parseStudioPageMarkdown(markdown: string): StudioDraft`, `renderStudioPageMarkdown(draft: StudioDraft): string`, `isNewTemplateMarkdown(markdown: string): boolean`.

Le markdown est le **format d’import / fixture**, plus le modèle vide des nouvelles fiches. Ce n’est pas un document Notion qu’on réécrit.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { emptyStudioDraft, isNewTemplateMarkdown, parseStudioPageMarkdown, renderStudioPageMarkdown } from "@/lib/studio/page-template";

const NEW_TEMPLATE = `SCRIPT
<details>
<summary>Script Vidéo longue</summary>
\`\`\`javascript
## 1. Introduction

Hook maison.
\`\`\`
</details>
<details>
<summary>Description</summary>
\`\`\`javascript
Pitch.

👉 Ce que vous allez apprendre :
✅ Point A

⌚️ Les temps forts de la vidéo :
00:00 Introduction
\`\`\`
</details>
---
## A/B Titre
| Titre | Texte miniature | Concept visuel |
| --- | --- | --- |
| Titre A | TEXTE A | Concept A |
| Titre B | TEXTE B | Concept B |
| Titre C | TEXTE C | Concept C |
---
## Miniature
`;

describe("page-template", () => {
  it("parses the house script, description and A/B table", () => {
    const draft = parseStudioPageMarkdown(NEW_TEMPLATE);
    expect(isNewTemplateMarkdown(NEW_TEMPLATE)).toBe(true);
    expect(draft.script).toContain("## 1. Introduction");
    expect(draft.description).toContain("Ce que vous allez apprendre");
    expect(draft.titleVariants[0]).toEqual({ title: "Titre A", thumbText: "TEXTE A", visualConcept: "Concept A" });
    expect(draft.titleVariants[2].title).toBe("Titre C");
  });

  it("treats a legacy n8n-style page as raw script and does not claim the new template", () => {
    const legacy = "## 🎬 Introduction (15-30 sec)\nInstaller n8n.\n## 📢 Outro\nAbonne-toi.";
    const draft = parseStudioPageMarkdown(legacy);
    expect(isNewTemplateMarkdown(legacy)).toBe(false);
    expect(draft.script).toContain("Installer n8n");
    expect(draft.description).toBe("");
    expect(draft.titleVariants).toEqual(emptyStudioDraft().titleVariants);
  });

  it("round-trips a draft through render then parse", () => {
    const draft = emptyStudioDraft();
    draft.script = "## 1. Introduction\nBonjour.";
    draft.description = "Pitch\n👉 Ce que vous allez apprendre :\n✅ Un point";
    draft.titleVariants[1] = { title: "Vibe Coding : c’est quoi ?", thumbText: "LE GUIDE DÉBUTANT", visualConcept: "" };
    const again = parseStudioPageMarkdown(renderStudioPageMarkdown(draft));
    expect(again.script).toContain("Bonjour.");
    expect(again.description).toContain("Un point");
    expect(again.titleVariants[1].title).toBe("Vibe Coding : c’est quoi ?");
    expect(again.titleVariants[1].thumbText).toBe("LE GUIDE DÉBUTANT");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/studio/page-template.test.ts`

Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
import type { StudioDraft, TitleVariant } from "./types";

const EMPTY_VARIANT: TitleVariant = { title: "", thumbText: "", visualConcept: "" };

export function emptyStudioDraft(): StudioDraft {
  return {
    script: "",
    description: "",
    titleVariants: [{ ...EMPTY_VARIANT }, { ...EMPTY_VARIANT }, { ...EMPTY_VARIANT }],
  };
}

export function isNewTemplateMarkdown(markdown: string): boolean {
  return markdown.includes("Script Vidéo longue") && markdown.includes("## A/B Titre");
}

function extractToggleCode(markdown: string, summary: string): string {
  const escaped = summary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<summary>\\s*${escaped}\\s*</summary>\\s*\`\`\`(?:javascript|markdown|text)?\\s*([\\s\\S]*?)\`\`\``,
    "i",
  );
  return markdown.match(re)?.[1]?.trim() ?? "";
}

function parseAbTable(markdown: string): StudioDraft["titleVariants"] {
  const variants = emptyStudioDraft().titleVariants;
  const section = markdown.split("## A/B Titre")[1] ?? "";
  const rows = [...section.matchAll(/^\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/gm)]
    .map((match) => ({
      title: match[1].trim(),
      thumbText: match[2].trim(),
      visualConcept: match[3].trim(),
    }))
    .filter((row) => !/^titre$/i.test(row.title) && !/^---/.test(row.title));
  for (let i = 0; i < 3; i += 1) variants[i] = rows[i] ?? { ...EMPTY_VARIANT };
  return variants;
}

export function parseStudioPageMarkdown(markdown: string): StudioDraft {
  if (!isNewTemplateMarkdown(markdown)) {
    return { ...emptyStudioDraft(), script: markdown.trim() };
  }
  return {
    script: extractToggleCode(markdown, "Script Vidéo longue"),
    description: extractToggleCode(markdown, "Description"),
    titleVariants: parseAbTable(markdown),
  };
}

export function renderStudioPageMarkdown(draft: StudioDraft): string {
  const rows = draft.titleVariants
    .map((row) => `| ${row.title} | ${row.thumbText} | ${row.visualConcept} |`)
    .join("\n");
  return [
    "SCRIPT",
    "<details>",
    "<summary>Script Vidéo longue</summary>",
    "",
    "```javascript",
    draft.script.trim() || "{Script complet}",
    "```",
    "",
    "</details>",
    "<details>",
    "<summary>Description</summary>",
    "",
    "```javascript",
    draft.description.trim() ||
      "{description}\n👉 Ce que vous allez apprendre :\n✅ {Point clés}\n\n⌚️ Les temps forts de la vidéo :\n00:00 {Titre moments}",
    "```",
    "",
    "</details>",
    "---",
    "## A/B Titre",
    "| Titre | Texte miniature | Concept visuel |",
    "| --- | --- | --- |",
    rows,
    "---",
    "## Miniature",
    "",
    "Miniature A",
    "",
    "Miniature B",
    "",
    "Miniature C",
    "",
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/studio/page-template.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/studio/page-template.ts tests/studio/page-template.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): parse and render the house Nouvelle vidéo draft model

EOF
)"
```

---

### Task 3: Tables SQLite studio + store

**Files:**
- Create: `src/lib/studio/migrations.ts`
- Create: `src/lib/studio/store.ts`
- Modify: `src/lib/db.ts` (appeler `migrateStudioTables` après `migrateChannelTables`)
- Test: `tests/studio/store.test.ts`

**Interfaces:**
- Consumes: `StudioVideo`, `StudioDraft`, `emptyStudioDraft`, `newStudioVideoId`, `isEtiquette`.
- Produces:
  - `createStudioVideo(input: { title: string; etiquette?: Etiquette | null; youtubeUrl?: string | null }): StudioVideo`
  - `upsertStudioVideo(video: Omit<StudioVideo, "draft"> & { draft?: StudioDraft }): void`
  - `getStudioVideo(videoId: string): StudioVideo | null`
  - `listStudioVideos(): StudioVideo[]`
  - `saveStudioDraft(videoId: string, draft: StudioDraft): void`
  - `updateStudioVideo(videoId: string, patch: { title?: string; etiquette?: Etiquette | null; youtubeUrl?: string | null }): StudioVideo | null`

Pas de colonne `notion_url`. Pas de `synced_at`. `updated_at` est local.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "@/lib/db";
import { emptyStudioDraft } from "@/lib/studio/page-template";
import {
  createStudioVideo,
  getStudioVideo,
  listStudioVideos,
  saveStudioDraft,
  updateStudioVideo,
} from "@/lib/studio/store";

beforeEach(() => {
  getDb().exec("DELETE FROM studio_drafts");
  getDb().exec("DELETE FROM studio_videos");
});

describe("studio store", () => {
  it("creates a local video with an empty house draft", () => {
    const created = createStudioVideo({ title: "Vibe Coding : c’est quoi ?", etiquette: "En cours" });
    expect(created.videoId.startsWith("vid_")).toBe(true);
    expect(created.youtubeUrl).toBeNull();
    expect(created.draft.script).toBe("");
    expect(created.draft.titleVariants).toHaveLength(3);
    const row = getStudioVideo(created.videoId);
    expect(row?.title).toContain("Vibe Coding");
    expect(row?.etiquette).toBe("En cours");
    expect(listStudioVideos()).toHaveLength(1);
  });

  it("saves a draft and patches metadata without a remote write", () => {
    const created = createStudioVideo({ title: "Grok Bot" });
    const draft = emptyStudioDraft();
    draft.script = "## 1. Introduction\nTexte.";
    saveStudioDraft(created.videoId, draft);
    const updated = updateStudioVideo(created.videoId, { etiquette: "En prod", youtubeUrl: "https://youtu.be/abcdefghijk" });
    expect(updated?.etiquette).toBe("En prod");
    expect(updated?.youtubeVideoId).toBe("abcdefghijk");
    expect(getStudioVideo(created.videoId)?.draft.script).toContain("Introduction");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/studio/store.test.ts`

Expected: FAIL — store / table missing

- [ ] **Step 3: Write minimal implementation**

`src/lib/studio/migrations.ts` :

```ts
import type Database from "better-sqlite3";

export const STUDIO_TABLES_DDL = `
  CREATE TABLE IF NOT EXISTS studio_videos (
    video_id          TEXT PRIMARY KEY,
    title             TEXT NOT NULL DEFAULT '',
    youtube_url       TEXT,
    youtube_video_id  TEXT,
    etiquette         TEXT,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS studio_drafts (
    video_id        TEXT PRIMARY KEY REFERENCES studio_videos(video_id) ON DELETE CASCADE,
    script          TEXT NOT NULL DEFAULT '',
    description     TEXT NOT NULL DEFAULT '',
    title_variants  TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );
`;

const STUDIO_FTS_DDL = `
  CREATE VIRTUAL TABLE IF NOT EXISTS studio_corpus_fts USING fts5(
    video_id UNINDEXED,
    title,
    script,
    description,
    transcript
  );
`;

export function migrateStudioTables(database: Database.Database): void {
  database.exec(STUDIO_TABLES_DDL);
  try {
    database.exec(STUDIO_FTS_DDL);
  } catch (err) {
    console.warn("[studio] FTS5 indisponible, retrieve_own_corpus utilisera LIKE :", err);
  }
}
```

Store : `createStudioVideo` mint `newStudioVideoId()`, horodatage ISO, `saveStudioDraft` avec `emptyStudioDraft()` si aucun brouillon. `youtubeVideoId` via `youtubeVideoIdFromUrl` (`src/lib/youtube/video-id.ts`). `title_variants` = `JSON.stringify`. `getStudioVideo` retombe sur `emptyStudioDraft()` si JSON invalide. `listStudioVideos` : `ORDER BY updated_at DESC`. `updateStudioVideo` refuse une étiquette hors `isEtiquette` (throw `Error("Étiquette inconnue")`).

Dans `src/lib/db.ts`, importer `migrateStudioTables` et l’appeler juste après `migrateChannelTables(database)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/studio/store.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/studio/migrations.ts src/lib/studio/store.ts src/lib/db.ts tests/studio/store.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): persist video fiches and drafts in local SQLite

EOF
)"
```

---

### Task 4: Import one-shot (CSV + markdown) — migration, pas un pilier

**Files:**
- Create: `src/lib/studio/import.ts`
- Test: `tests/studio/import.test.ts`

**Interfaces:**
- Consumes: `createStudioVideo`, `saveStudioDraft`, `parseStudioPageMarkdown`, `isEtiquette`, `youtubeVideoIdFromUrl`.
- Produces:
  - `parseStudioCsv(csv: string): Array<{ title: string; youtubeUrl: string | null; etiquette: Etiquette | null }>`
  - `importStudioCsv(csv: string): { imported: number; errors: string[] }`
  - `importStudioMarkdown(input: { title: string; markdown: string; etiquette?: Etiquette | null; youtubeUrl?: string | null }): { videoId: string }`

Aucun `fetch`. Aucune clé. En-têtes CSV acceptés : `Nom` ou `Title` ou `title` ; `URL` ou `youtubeUrl` ; `Étiquettes` ou `Etiquettes` ou `status`. Lignes sans titre → `errors`. Étiquette inconnue → `null` (la fiche est quand même créée).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "@/lib/db";
import { listStudioVideos, getStudioVideo } from "@/lib/studio/store";
import { importStudioCsv, importStudioMarkdown, parseStudioCsv } from "@/lib/studio/import";

beforeEach(() => {
  getDb().exec("DELETE FROM studio_drafts");
  getDb().exec("DELETE FROM studio_videos");
});

describe("studio import", () => {
  it("parses a Notion-style CSV export without calling a network", () => {
    const rows = parseStudioCsv("Nom,URL,Étiquettes\nVibe Coding,,En cours\nLM Studio,https://youtu.be/67TPSTL0NsA,Terminer\n");
    expect(rows).toEqual([
      { title: "Vibe Coding", youtubeUrl: null, etiquette: "En cours" },
      { title: "LM Studio", youtubeUrl: "https://youtu.be/67TPSTL0NsA", etiquette: "Terminer" },
    ]);
  });

  it("imports CSV rows into the local store", () => {
    const result = importStudioCsv("Nom,URL,Étiquettes\nGrok Bot,,En prod\n");
    expect(result).toEqual({ imported: 1, errors: [] });
    expect(listStudioVideos()[0]?.title).toBe("Grok Bot");
    expect(listStudioVideos()[0]?.etiquette).toBe("En prod");
  });

  it("imports a pasted house-template markdown as a draft", () => {
    const { videoId } = importStudioMarkdown({
      title: "Vibe Coding : c’est quoi ?",
      etiquette: "En cours",
      markdown: "SCRIPT\n<details>\n<summary>Script Vidéo longue</summary>\n```javascript\n## 1. Introduction\nCoucou\n```\n</details>\n## A/B Titre\n",
    });
    expect(getStudioVideo(videoId)?.draft.script).toContain("Coucou");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/studio/import.test.ts`

Expected: FAIL — module missing

- [ ] **Step 3: Write minimal implementation**

Parser CSV naïf (pas de dépendance) : split lignes, détecter en-têtes case-insensitive, colonnes par index. `importStudioCsv` boucle `createStudioVideo` + `saveStudioDraft(emptyStudioDraft())` (le CSV n’a pas le corps). `importStudioMarkdown` crée puis `saveStudioDraft(parseStudioPageMarkdown(markdown))`. Catch par ligne → `errors.push`.

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/studio/import.test.ts tests/studio/store.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/studio/import.ts tests/studio/import.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): add a one-shot CSV and markdown import for migration

EOF
)"
```

---

## Chunk 3: Phase 1 — corpus

### Task 5: Corpus FTS (scripts studio + transcripts YouTube + Ma chaîne)

**Files:**
- Create: `src/lib/studio/corpus.ts`
- Modify: `src/lib/studio/store.ts` (`saveStudioDraft` / `createStudioVideo` appellent `indexStudioCorpus`)
- Test: `tests/studio/corpus.test.ts`

**Interfaces:**
- Consumes: `getStudioVideo`, `listStudioVideos`, `searchMyChannel` (déjà là), `getTranscript` / `upsertTranscript`, `YoutubeTranscript.fetchTranscript`, `youtubeVideoIdFromUrl`.
- Produces:
  - `indexStudioCorpus(videoId: string, transcript?: string | null): void`
  - `ingestYoutubeTranscript(videoId: string): Promise<{ ok: boolean; reason?: string }>` — **pas d’OpenRouter**, pas de Whisper
  - `retrieveOwnCorpus(query: string, limit?: number): CorpusHit[]` — fusion studio FTS + `searchMyChannel`, dédup par `youtubeVideoId`

Ingest seulement si `youtubeUrl` est une watch URL publique. Échec captions → `reason` texte. Réutiliser le cache `getTranscript` quand `source === "timedtext"`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { getDb } from "@/lib/db";
import { emptyStudioDraft } from "@/lib/studio/page-template";
import { createStudioVideo, saveStudioDraft } from "@/lib/studio/store";
import { indexStudioCorpus, retrieveOwnCorpus } from "@/lib/studio/corpus";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => [{ text: "Installer n8n", offset: 0, duration: 1 }]) },
});

beforeEach(() => {
  getDb().exec("DELETE FROM studio_drafts");
  getDb().exec("DELETE FROM studio_videos");
  try {
    getDb().exec("DELETE FROM studio_corpus_fts");
  } catch {
    /* FTS table may be empty */
  }
});

describe("retrieveOwnCorpus", () => {
  it("finds a studio script by keyword without calling a paid API", () => {
    const created = createStudioVideo({
      title: "Comment installer et utiliser n8n gratuitement en 2 min !",
      etiquette: "Terminer",
      youtubeUrl: "https://youtu.be/Dv74NSS_zJo",
    });
    const draft = emptyStudioDraft();
    draft.script = "Dans cette vidéo, je vais te montrer comment installer N8N.";
    saveStudioDraft(created.videoId, draft);
    indexStudioCorpus(created.videoId);
    const hits = retrieveOwnCorpus("installer n8n", 5);
    expect(hits.some((hit) => hit.videoId === created.videoId && hit.source === "studio")).toBe(true);
    expect(hits[0]?.snippet.toLowerCase()).toContain("n8n");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/studio/corpus.test.ts`

Expected: FAIL — corpus module missing

- [ ] **Step 3: Write minimal implementation**

`indexStudioCorpus` : `DELETE FROM studio_corpus_fts WHERE video_id = ?` puis `INSERT` title/script/description/transcript.

`retrieveOwnCorpus` : FTS `MATCH` (même échappement `ftsQuery` que `knowledge-store.ts` : tokens quotés joints par `AND`), fallback `LIKE`. Puis `searchMyChannel(query, limit)` mappé en `CorpusHit` `source: "channel"`, `kind: "transcript"`. Dédup : si `youtubeVideoId` déjà vu, garder le hit studio.

`ingestYoutubeTranscript` : si pas d’URL → `{ ok: false, reason: "Pas d’URL YouTube sur cette fiche" }` ; si cache timedtext → indexer ce texte ; sinon `YoutubeTranscript.fetchTranscript(url)`, joindre les cues, `upsertTranscript` seulement si la vidéo existe déjà dans `channel_videos` (sinon stocker le texte uniquement dans `studio_corpus_fts.transcript` — **ne pas** inventer une ligne `channel_videos`).

Après `saveStudioDraft` / `createStudioVideo`, appeler `indexStudioCorpus` (une ligne). Relancer `tests/studio/store.test.ts` si le store change.

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/studio/corpus.test.ts tests/studio/store.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/studio/corpus.ts src/lib/studio/store.ts tests/studio/corpus.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): retrieve writing examples from the local video and channel corpus

EOF
)"
```

---

## Chunk 4: Phase 1 — agent d’écriture

### Task 6: Outils agent (liste, fiche, RAG, upsert, create)

**Files:**
- Create: les 5 fichiers `src/lib/agent/tools/{list-studio-videos,get-studio-video,retrieve-own-corpus,upsert-studio-script,create-studio-video}.ts`
- Modify: `src/lib/agent/tools/all.ts` (imports side-effect)
- Modify: `src/lib/agent/tool-labels.ts`
- Modify: `tests/agent/registry-full.test.ts`, `tests/agent/mcp-server.test.ts`
- Test: `tests/agent/studio-tools.test.ts`

**Interfaces:**
- Consumes: store, `retrieveOwnCorpus`, `createStudioVideo`.
- Produces: tools MCP (pas `chatOnly`) :
  - `list_studio_videos` `{}` → lignes `- studio:<videoId> — "titre" — Étiquette`
  - `get_studio_video` `{ video_id }` → titre, étiquette, URL, script/description tronqués 4000
  - `retrieve_own_corpus` `{ query, limit? }` → hits
  - `upsert_studio_script` `{ video_id, script?, description?, title_variants? }` → sauve local
  - `create_studio_video` `{ title, etiquette? }` → crée + id

**Pas** de `push_studio_video`.

Schemas zod :

```ts
z.object({ video_id: z.string().min(8).max(80) })
z.object({ query: z.string().min(1).max(200), limit: z.number().int().min(1).max(20).default(8) })
z.object({
  video_id: z.string().min(8).max(80),
  script: z.string().max(80_000).optional(),
  description: z.string().max(20_000).optional(),
  title_variants: z.array(z.object({ title: z.string(), thumbText: z.string(), visualConcept: z.string() })).max(3).optional(),
})
z.object({
  title: z.string().trim().min(1).max(200),
  etiquette: z.enum(["Propositions", "Pas commencer", "En cours", "En prod", "Terminer"]).optional(),
})
```

Labels FR :

```ts
  list_studio_videos: "Liste tes fiches vidéo",
  get_studio_video: "Lit une fiche vidéo",
  retrieve_own_corpus: "Cherche dans tes anciennes vidéos",
  upsert_studio_script: "Met à jour le brouillon",
  create_studio_video: "Crée une fiche vidéo",
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { getDb } from "@/lib/db";
import { emptyStudioDraft } from "@/lib/studio/page-template";
import { createStudioVideo, saveStudioDraft } from "@/lib/studio/store";

vi.mock("youtube-transcript", () => ({ YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) } }));

let videoId = "";

beforeEach(() => {
  getDb().exec("DELETE FROM studio_drafts");
  getDb().exec("DELETE FROM studio_videos");
  const created = createStudioVideo({ title: "Vibe Coding : c’est quoi ?", etiquette: "En cours" });
  videoId = created.videoId;
  saveStudioDraft(videoId, emptyStudioDraft());
});

describe("studio tools", () => {
  it("lists local videos and reads one fiche", async () => {
    const { listStudioVideosTool } = await import("@/lib/agent/tools/list-studio-videos");
    const { getStudioVideoTool } = await import("@/lib/agent/tools/get-studio-video");
    const listed = await listStudioVideosTool.handler({});
    expect((listed.content[0] as { text: string }).text).toContain(`studio:${videoId}`);
    const one = await getStudioVideoTool.handler({ video_id: `studio:${videoId}` });
    expect((one.content[0] as { text: string }).text).toContain("Vibe Coding");
  });

  it("upserts a script locally without calling any HTTP API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { upsertStudioScriptTool } = await import("@/lib/agent/tools/upsert-studio-script");
    await upsertStudioScriptTool.handler({
      video_id: videoId,
      script: "## 1. Introduction\nNouveau hook.",
    });
    const { getStudioVideo } = await import("@/lib/studio/store");
    expect(getStudioVideo(videoId)?.draft.script).toContain("Nouveau hook");
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
```

`get-studio-video` et `upsert` acceptent `studio:<id>` ou l’id nu (`replace(/^studio:/, "")`).

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/agent/studio-tools.test.ts`

Expected: FAIL — tools missing

- [ ] **Step 3: Write minimal implementation**

Chaque fichier suit `extract-youtube-script.ts` : `ToolDefinition`, `registerTool`. Importer les 5 dans `all.ts`. Ajouter les noms dans `registry-full.test.ts` `expected` et `mcp-server.test.ts` (ils sont MCP). Relire ces deux tests avant d’éditer.

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/agent/studio-tools.test.ts tests/agent/registry-full.test.ts tests/agent/mcp-server.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/list-studio-videos.ts src/lib/agent/tools/get-studio-video.ts src/lib/agent/tools/retrieve-own-corpus.ts src/lib/agent/tools/upsert-studio-script.ts src/lib/agent/tools/create-studio-video.ts src/lib/agent/tools/all.ts src/lib/agent/tool-labels.ts tests/agent/studio-tools.test.ts tests/agent/registry-full.test.ts tests/agent/mcp-server.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): add Brainstorm tools for local video fiches and corpus retrieval

EOF
)"
```

---

### Task 7: Skills `write_video` + slash `/ecrire`

**Files:**
- Create: les 6 `SKILL.md` listés dans File Structure
- Modify: `src/lib/agent/skills/slash-catalog.ts`
- Modify: `tests/agent/slash-catalog.test.ts`
- Test: le catalog se charge tout seul via `listSkillCatalog()` (frontmatter `name` + `description`)

**Interfaces:**
- Consumes: noms d’outils Task 6.
- Produces: skill workflow `write_video` ; slash `ecrire` (alias `écrire` **interdit** dans `slash` — ASCII only, déjà `^[a-z][a-z0-9-]{0,40}$`). Alias `write` → même row.

- [ ] **Step 1: Write the failing test** (ajouter dans `slash-catalog.test.ts`)

```ts
  it("exposes /ecrire mapped to write_video", () => {
    const row = SLASH_SKILLS.find((entry) => entry.slash === "ecrire");
    expect(row).toEqual(
      expect.objectContaining({
        slash: "ecrire",
        skill: "write_video",
        title: "Écrire une vidéo",
        aliases: ["write"],
      }),
    );
    expect(lookupSlashToken("ecrire")?.skill).toBe("write_video");
    expect(lookupSlashToken("write")?.slash).toBe("ecrire");
  });
```

Ce test échoue d’abord parce que `write_video` n’est pas dans le catalog skills (le test « subset of SKILL.md catalog » casse aussi).

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/agent/slash-catalog.test.ts`

Expected: FAIL — `/ecrire` absent

- [ ] **Step 3: Write minimal implementation**

`src/lib/agent/skills/write_video/SKILL.md` (frontmatter + corps, **pas** de 7 étapes) :

```md
---
name: write_video
description: Writes a long-form YouTube script, description and 3 title/thumb-text rows for the open ThumbGen video fiche, grounded on the creator's own older videos. Chat-only workflow.
---

# write_video

You help write ONE video that already exists as a ThumbGen fiche (studio:<videoId> in <studio_video> or <project_id>).

Not a thumbnail journey. Not generate_sketch. No « Étape n/7 ». ThumbGen is the CMS — do not mention Notion, sync, or pushing a page elsewhere.

## When

- /ecrire, or they ask to write/structure/hook the open video.
- A fiche is in <studio_video>. If missing, list_studio_videos and ask which one, or create_studio_video if they named a new topic.

## When not

- They want a thumbnail on the canvas → thumbnail-packaging.
- They pasted a competitor URL only to package a thumb → extract_youtube_script, not this skill.

## How

1. get_studio_video on the open video_id.
2. retrieve_own_corpus with the subject (3–8 hits). Quote patterns (hooks, section rhythm, CTA) from THOSE hits. Do not invent a generic MrBeast voice.
3. Follow the house model: numbered H2 sections, subscribe CTA in the intro, description with apprentissages + timestamps + hashtags. Mirror the Vibe Coding *shape* (9-ish sections when the topic supports it), never its topic.
4. Propose 3 A/B Titre rows (Titre | Texte miniature | Concept visuel).
5. upsert_studio_script with the agreed draft. The editor already has it — do not also dump the full script in chat.
6. finish_turn last, alone: 1–2 sentences, do not paste the full script in summary.

If retrieve_own_corpus is empty: say the corpus is thin (import old scripts / connect Ma chaîne) and write from <channel_profile> only. Do not hallucinate old videos.
```

Pour chaque tool, un `SKILL.md` court (quand / quand pas / champs), calqué sur `extract_youtube_script/SKILL.md` mais plus court (40 lignes max). `retrieve_own_corpus/SKILL.md` : local, gratuit, pas d’OpenRouter.

Ajouter le row slash en **tête** de `SLASH_SKILLS` :

```ts
  {
    slash: "ecrire",
    aliases: ["write"],
    skill: "write_video",
    title: "Écrire une vidéo",
    description: "Script, description et titres, calés sur tes anciennes vidéos.",
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/agent/slash-catalog.test.ts tests/agent/skills-runtime.test.ts`

Expected: PASS — `write_video` est dans le catalog disque

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/skills/write_video src/lib/agent/skills/retrieve_own_corpus src/lib/agent/skills/list_studio_videos src/lib/agent/skills/get_studio_video src/lib/agent/skills/upsert_studio_script src/lib/agent/skills/create_studio_video src/lib/agent/skills/slash-catalog.ts tests/agent/slash-catalog.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): add /ecrire write_video skill without a numbered wizard

EOF
)"
```

---

### Task 8: Bloc `<studio_video>` + route chat

**Files:**
- Modify: `src/lib/agent/system-prompt.ts`
- Test: `tests/agent/system-prompt-studio.test.ts`

**Interfaces:**
- Consumes: `isWritingProjectId`, `videoIdFromWritingProject`, `getStudioVideo`.
- Produces: `buildStudioVideoBlock(projectId: string): string | null` ; `buildSystemMessages` l’insère après `<channel_knowledge>` et **avant** `<project_id>` / `<canvas_state>`. Quand le bloc est présent : l’agent est coach d’écriture, `read_skill write_video` si on écrit, interdit d’inventer le corpus, interdit de parler de Notion/sync.

Ne **pas** réécrire `AGENT_SYSTEM_PROMPT` (cache). Une règle courte dans le bloc dynamique suffit. `route-handler.ts` n’a pas besoin d’un nouveau champ body : il passe déjà `conversation.project_id`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "@/lib/db";
import { emptyStudioDraft } from "@/lib/studio/page-template";
import { createStudioVideo, saveStudioDraft } from "@/lib/studio/store";
import { writingProjectId } from "@/lib/studio/types";
import { buildStudioVideoBlock, buildSystemMessages } from "@/lib/agent/system-prompt";

beforeEach(() => {
  getDb().exec("DELETE FROM studio_drafts");
  getDb().exec("DELETE FROM studio_videos");
});

describe("studio video prompt block", () => {
  it("is omitted for a canvas project", () => {
    expect(buildStudioVideoBlock("default")).toBeNull();
  });

  it("grounds the writing agent on the open fiche without a 7-step journey", () => {
    const created = createStudioVideo({ title: "Vibe Coding : c’est quoi ?", etiquette: "En cours" });
    const draft = emptyStudioDraft();
    draft.script = "## 1. Introduction\nDéjà écrit.";
    saveStudioDraft(created.videoId, draft);
    const projectId = writingProjectId(created.videoId);
    const block = buildStudioVideoBlock(projectId);
    expect(block).toContain("<studio_video>");
    expect(block).toContain("Vibe Coding");
    expect(block).toContain("En cours");
    expect(block).toContain("retrieve_own_corpus");
    expect(block).not.toMatch(/Étape\s+\d/);
    expect(block).not.toMatch(/Notion/i);
    const messages = buildSystemMessages({ nodes: [], edges: [] }, projectId);
    expect(messages.some((m) => m.text.includes("<studio_video>"))).toBe(true);
    expect(messages[0].text).toContain("Never mention \"step 3 of 7\"");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/agent/system-prompt-studio.test.ts`

Expected: FAIL — `buildStudioVideoBlock` not exported

- [ ] **Step 3: Write minimal implementation**

Relire `buildSystemMessages` et `neutralizeTags` avant d’éditer.

```ts
export function buildStudioVideoBlock(projectId?: string): string | null {
  if (!projectId || !isWritingProjectId(projectId)) return null;
  const videoId = videoIdFromWritingProject(projectId);
  if (!videoId) return null;
  const video = getStudioVideo(videoId);
  if (!video) {
    return [
      "<studio_video>",
      `Open writing project ${neutralizeTags(projectId)} has no fiche. Call list_studio_videos or create_studio_video. Do not invent videos.`,
      "You are the writing coach for this conversation. Do not run thumbnail-packaging unless they ask for a thumbnail. No 7-step journey.",
      "</studio_video>",
    ].join("\n");
  }
  return [
    "<studio_video>",
    `video_id: ${video.videoId}`,
    `title: ${neutralizeTags(video.title)}`,
    `etiquette: ${video.etiquette ?? "—"}`,
    `youtube_url: ${video.youtubeUrl ?? ""}`,
    `script_chars: ${video.draft.script.length}`,
    `description_chars: ${video.draft.description.length}`,
    "Follow write_video: retrieve_own_corpus before drafting; upsert_studio_script to save. Do not paste the full script into finish_turn.summary.",
    "You are the writing coach for this fiche. Do not run thumbnail-packaging unless they ask for a thumbnail. No 7-step journey.",
    "</studio_video>",
  ].join("\n");
}
```

Dans `buildSystemMessages`, après `channelKnowledge` :

```ts
  const studio = buildStudioVideoBlock(projectId);
  if (studio) blocks.push({ type: "text", text: studio });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/agent/system-prompt-studio.test.ts tests/agent/system-prompt.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/system-prompt.ts tests/agent/system-prompt-studio.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): ground Brainstorm on the open ThumbGen video fiche

EOF
)"
```

---

### Task 9: API HTTP studio

**Files:**
- Create: `src/app/api/studio/videos/route.ts`
- Create: `src/app/api/studio/videos/[videoId]/route.ts`
- Create: `src/app/api/studio/import/route.ts`
- Test: `tests/studio/studio-routes.test.ts`

**Interfaces:**
- `GET /api/studio/videos` → `listStudioVideos()`
- `POST /api/studio/videos` body `{ title, etiquette? }` → `createStudioVideo` (415 si pas JSON via `rejectNonJsonRequest`)
- `GET /api/studio/videos/:videoId` → 404 si absent
- `PATCH /api/studio/videos/:videoId` body `{ script?, description?, titleVariants?, etiquette?, title?, youtubeUrl? }`
- `POST /api/studio/import` body `{ csv?: string; title?: string; markdown?: string; etiquette?: string; youtubeUrl?: string }` — CSV **ou** un markdown, pas les deux. 400 si les deux / si aucun.

Pas de route `/api/studio/sync`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "@/lib/db";
import { createStudioVideo } from "@/lib/studio/store";
import { GET as listVideos, POST as createVideo } from "@/app/api/studio/videos/route";
import { GET as getVideo, PATCH as patchVideo } from "@/app/api/studio/videos/[videoId]/route";
import { POST as importVideos } from "@/app/api/studio/import/route";

beforeEach(() => {
  getDb().exec("DELETE FROM studio_drafts");
  getDb().exec("DELETE FROM studio_videos");
  createStudioVideo({ title: "Grok Bot", etiquette: "En prod" });
});

describe("studio routes", () => {
  it("lists videos, creates one, and patches a draft", async () => {
    const listed = await (await listVideos()).json();
    expect(listed).toHaveLength(1);
    expect(listed[0].etiquette).toBe("En prod");
    expect(listed[0].videoId).toMatch(/^vid_/);

    const createdRes = await createVideo(
      new Request("http://localhost/api/studio/videos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Nouvelle idée", etiquette: "Propositions" }),
      }),
    );
    const created = await createdRes.json();
    expect(created.title).toBe("Nouvelle idée");

    const req = new Request(`http://localhost/api/studio/videos/${created.videoId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ script: "## 1. Introduction\nHook." }),
    });
    const patched = await (await patchVideo(req, { params: Promise.resolve({ videoId: created.videoId }) })).json();
    expect(patched.draft.script).toContain("Hook");
  });

  it("imports a CSV once", async () => {
    const res = await importVideos(
      new Request("http://localhost/api/studio/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv: "Nom,URL,Étiquettes\nImportée,,Pas commencer\n" }),
      }),
    );
    const body = await res.json();
    expect(body.imported).toBe(1);
  });
});
```

Adapter `params` au style Next 16 du repo (relire `src/app/api/agent/conversations/[id]/route.ts`).

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/studio/studio-routes.test.ts`

Expected: FAIL — routes missing

- [ ] **Step 3: Write minimal implementation**

JSON only, `rejectNonJsonRequest` sur POST/PATCH. 400 si `etiquette` n’est pas `isEtiquette`. GET 404 `{ error: "Vidéo introuvable" }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/studio/studio-routes.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/studio tests/studio/studio-routes.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): expose list, create, draft and one-shot import APIs

EOF
)"
```

---

## Chunk 5: Phase 1 — UI

### Task 10: Kanban `/videos`

**Files:**
- Create: `src/app/videos/page.tsx`
- Create: `src/components/studio/VideosBoard.tsx`
- Test: `tests/studio/videos-board.test.tsx`

**Interfaces:**
- Consumes: `GET /api/studio/videos`, `POST /api/studio/videos`, `ETIQUETTES`, `StudioVideo`.
- Produces: page « Vidéos » groupée en 5 colonnes. Clic → `/videos/[videoId]`. Bouton « Nouvelle vidéo ». Toggle Kanban / Liste. Empty state. Menu ⋯ « Importer un export » (dialog CSV, `POST /api/studio/import`) — pas un bouton primaire.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import VideosBoard from "@/components/studio/VideosBoard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo) => {
      if (String(input).includes("/api/studio/videos") && !String(input).includes("import")) {
        return new Response(
          JSON.stringify([
            {
              videoId: "vid_aaa",
              title: "Vibe Coding : c’est quoi ?",
              etiquette: "En cours",
              youtubeUrl: null,
              draft: { script: "", description: "", titleVariants: [] },
            },
          ]),
        );
      }
      return new Response("[]");
    }),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("VideosBoard", () => {
  it("renders the five Étiquettes columns, the En cours card, and Nouvelle vidéo — not a Notion sync", async () => {
    await act(async () => {
      root.render(<VideosBoard />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain("En cours");
    expect(container.textContent).toContain("Propositions");
    expect(container.textContent).toContain("Vibe Coding");
    expect(container.textContent).toContain("Nouvelle vidéo");
    expect(container.textContent).not.toMatch(/Synchroniser Notion/i);
    expect(container.textContent).not.toMatch(/fiches Notion/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/studio/videos-board.test.tsx`

Expected: FAIL — `VideosBoard` missing

- [ ] **Step 3: Write minimal implementation**

`VideosBoard` : `useEffect` fetch GET, state `videos` / `error` / `creating`. Colonnes = `[...ETIQUETTES]`. Cartes : `title` + badge URL si `youtubeUrl`. « Nouvelle vidéo » → `POST { title: "Sans titre", etiquette: "Propositions" }` puis `router.push(/videos/${id})`. Toggle `view: "kanban" | "liste"` (boutons, pas des tabs Bibliothèque). Dialog import : `Label` « Export CSV », `Textarea`, submit `POST /api/studio/import`.

`src/app/videos/page.tsx` — même shell que `/bibliotheque` :

```tsx
import AppSidebar from "@/components/panels/AppSidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import VideosBoard from "@/components/studio/VideosBoard";

export const metadata = { title: "Vidéos · ThumbGen" };

export default function VideosPage() {
  return (
    <>
      <AppSidebar />
      <SidebarInset className="h-svh overflow-y-auto">
        <VideosBoard />
      </SidebarInset>
    </>
  );
}
```

Copy : titre « Vidéos », sous-titre « Scripts, titres et pipeline — le studio d&apos;écriture. ». Empty : « Aucune vidéo pour l&apos;instant » + « ThumbGen est ton studio d&apos;écriture. Crée une fiche, ou importe un export une fois. »

Kanban : `flex` colonnes, pas `max-w-6xl`. Liste : `max-w-6xl` comme Miniatures.

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/studio/videos-board.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/videos/page.tsx src/components/studio/VideosBoard.tsx tests/studio/videos-board.test.tsx
git commit -m "$(cat <<'EOF'
feat(studio): show the local YouTube video kanban in ThumbGen

EOF
)"
```

---

### Task 11: Éditeur `/videos/[videoId]` + ChatPanel

**Files:**
- Create: `src/app/videos/[videoId]/page.tsx`
- Create: `src/components/studio/VideoEditor.tsx`
- Create: `src/components/studio/TitleVariantsTable.tsx`
- Test: `tests/studio/video-editor.test.tsx`

**Interfaces:**
- Consumes: `GET/PATCH /api/studio/videos/:videoId`, `writingProjectId`, `ChatPanel`, `emptyStudioDraft`.
- Produces: éditeur script / description / table A/B (3 lignes) + `ChatPanel` `projectId={writingProjectId(videoId)}`. **Create-agent remplace le rail droit par le dock BR** et ajoute Miniatures A/B. Sauvegarde PATCH debounce 800 ms. Select `Étiquettes`. Titre éditable. **Pas** de lien « Ouvrir dans Notion ».

`ChatPanel` n’est pas dupliqué. Le canvas store reste vide (pas de `projects_meta`).

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import VideoEditor from "@/components/studio/VideoEditor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/components/panels/ChatPanel", () => ({
  default: ({ projectId }: { projectId: string }) => <div>chat:{projectId}</div>,
}));

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        videoId: "vid_3db7d7d1139d809baaa3f455a1e8162d",
        title: "Vibe Coding : c’est quoi ?",
        etiquette: "En cours",
        youtubeUrl: null,
        draft: {
          script: "## 1. Introduction\nHook.",
          description: "Pitch",
          titleVariants: [
            { title: "A", thumbText: "a", visualConcept: "" },
            { title: "B", thumbText: "b", visualConcept: "" },
            { title: "C", thumbText: "c", visualConcept: "" },
          ],
        },
      }),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("VideoEditor", () => {
  it("loads the fiche and mounts chat on studio:<videoId>", async () => {
    await act(async () => {
      root.render(<VideoEditor videoId="vid_3db7d7d1139d809baaa3f455a1e8162d" />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Vibe Coding");
    expect(container.textContent).toContain("Script Vidéo longue");
    expect(container.textContent).toContain("Description");
    expect(container.textContent).toContain("A/B Titre");
    expect(container.textContent).toContain("chat:studio:vid_3db7d7d1139d809baaa3f455a1e8162d");
    expect(container.textContent).not.toMatch(/Ouvrir dans Notion/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/studio/video-editor.test.tsx`

Expected: FAIL — `VideoEditor` missing

- [ ] **Step 3: Write minimal implementation**

`TitleVariantsTable` : 3 rows, inputs `Titre` / `Texte miniature` / `Concept visuel`, `onChange(next: StudioDraft["titleVariants"])`.

`VideoEditor` : fetch GET ; textareas Script + Description (labels du modèle maison) ; table ; `<Select>` Étiquettes (`items={ETIQUETTES.map(v => ({ value: v, label: v }))}`) ; titre en `Input` ; `ChatPanel projectId={writingProjectId(videoId)}` dans une colonne `min-w-[20rem]`. Layout `flex h-svh` : éditeur scrollable, chat sticky. Debounce 800 ms sur PATCH. 404 : « Vidéo introuvable » + lien `/videos`.

Page :

```tsx
import AppSidebar from "@/components/panels/AppSidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import VideoEditor from "@/components/studio/VideoEditor";

export default async function VideoPage({ params }: { params: Promise<{ videoId: string }> }) {
  const { videoId } = await params;
  return (
    <>
      <AppSidebar />
      <SidebarInset>
        <VideoEditor videoId={videoId} />
      </SidebarInset>
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/studio/video-editor.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/videos/[videoId]/page.tsx src/components/studio/VideoEditor.tsx src/components/studio/TitleVariantsTable.tsx tests/studio/video-editor.test.tsx
git commit -m "$(cat <<'EOF'
feat(studio): edit a video fiche beside Brainstorm

EOF
)"
```

---

### Task 12: Sidebar + filtre miniatures

**Files:**
- Modify: `src/components/panels/AppSidebar.tsx`
- Modify: `src/lib/local-storage.ts` (`listProjects` filtre `isWritingProjectId`)
- Modify: `src/lib/agent/tools/list-projects.ts` (même filtre)
- Modify: `tests/sidebar/collapsed-rail.test.tsx`
- Test: `tests/studio/list-projects-filter.test.ts`

**Interfaces:**
- Consumes: `isWritingProjectId`.
- Produces: nav « Vidéos » (`Clapperboard` lucide) entre Mes miniatures et Bibliothèque. **Pas** de carte Notion.

- [ ] **Step 1: Write the failing tests**

`tests/studio/list-projects-filter.test.ts` :

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "@/lib/db";
import { createProject, listProjects } from "@/lib/local-storage";
import { isWritingProjectId } from "@/lib/studio/types";

beforeEach(() => {
  getDb().exec("DELETE FROM projects");
  getDb().exec("DELETE FROM projects_meta");
});

describe("listProjects", () => {
  it("never lists writing studio ids even if someone inserted one", () => {
    const created = createProject("Démo");
    getDb()
      .prepare("INSERT INTO projects_meta (id, name) VALUES (?, ?)")
      .run("studio:vid_3db7d7d1139d809baaa3f455a1e8162d", "Ne pas montrer");
    expect(listProjects().map((p) => p.id)).toEqual([created.id]);
    expect(isWritingProjectId("studio:vid_3db7d7d1139d809baaa3f455a1e8162d")).toBe(true);
  });
});
```

Dans `collapsed-rail.test.tsx`, après `renderSidebar(true)` : `expect(container.textContent).toContain("Vidéos")`. Relire le test qui compte les `sidebar-menu-button` : passer de `4` à `5`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/studio/list-projects-filter.test.ts tests/sidebar/collapsed-rail.test.tsx`

Expected: FAIL — filtre absent / libellé Vidéos absent / count encore à 4

- [ ] **Step 3: Write minimal implementation**

Sidebar : nouvel `SidebarMenuItem` **entre** Miniatures et Bibliothèque, `pathname.startsWith("/videos")` → `router.push("/videos")`, tooltip « Vidéos », icône `Clapperboard`.

`listProjects` :

```ts
  return rows
    .filter((r) => !isWritingProjectId(r.id))
    .map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      coverImageUrl: coverUrlFromId(r.cover_image_id),
    }));
```

Filtrer **avant** le `map` existant (`coverUrlFromId` est déjà là). Ne pas réécrire le mapping.

`list-projects` tool : ajouter `AND id NOT LIKE 'studio:%'` à la requête.

- [ ] **Step 4: Run tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/studio/list-projects-filter.test.ts tests/sidebar/collapsed-rail.test.tsx tests/studio/types.test.ts tests/studio/page-template.test.ts tests/studio/store.test.ts tests/studio/import.test.ts tests/studio/corpus.test.ts tests/agent/studio-tools.test.ts tests/agent/slash-catalog.test.ts tests/agent/system-prompt-studio.test.ts tests/studio/studio-routes.test.ts tests/studio/videos-board.test.tsx tests/studio/video-editor.test.tsx`

Expected: PASS

Puis, **depuis le repo principal** (pas un worktree) :

```bash
docker compose up -d --build
```

Vérifier à la main sur un DB de dev **throwaway** (`THUMBGEN_DB_PATH="$(mktemp -d)/thumbgen.db" ./node_modules/.bin/next dev -p 3100`) : `/videos` empty state, « Nouvelle vidéo », éditeur + chat. Ne pas coller de clé live ni toucher `data/thumbgen.db`. Ne pas cliquer de génération d’image. Ne pas appeler YouTube Data.

- [ ] **Step 5: Commit**

```bash
git add src/components/panels/AppSidebar.tsx src/lib/local-storage.ts src/lib/agent/tools/list-projects.ts tests/studio/list-projects-filter.test.ts tests/sidebar/collapsed-rail.test.tsx
git commit -m "$(cat <<'EOF'
feat(studio): add Vidéos nav and hide writing ids from the miniature gallery

EOF
)"
```

**Phase 1 est livrable seule.** Les tasks suivantes n’empêchent pas d’écrire des scripts.

---

## Chunk 6: Phase 2 — lier une miniature

> **Exécution :** Tasks 18–19 de `2026-09-20-studio-create-agent.md` (plus pré-test titres Task 20). Les steps ci-dessous restent le contrat — ne pas les recoder à part, ne pas les contredire (max 3, `createProject` réel, pas de Notion).

### Task 13: `projects_meta.studio_video_id`

**Files:**
- Modify: `src/lib/db.ts` (ALTER défensif, comme `description`)
- Create: `src/lib/studio/link-project.ts`
- Create: `src/app/api/studio/videos/[videoId]/miniature/route.ts`
- Modify: `src/components/studio/VideoEditor.tsx`
- Test: `tests/studio/link-project.test.ts`

**Interfaces:**
- Consumes: `getStudioVideo`, `createProject` (`createProject(name, description)` — relire la signature, l’id est `proj_${Date.now()}`).
- Produces:
  - `linkProjectToStudio(projectId: string, videoId: string): void`
  - `listProjectsForStudio(videoId: string): Array<{ id: string; name: string }>`
  - `createMiniatureForStudio(videoId: string): { id: string; name: string }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "@/lib/db";
import { listProjects } from "@/lib/local-storage";
import { isWritingProjectId } from "@/lib/studio/types";
import { createStudioVideo } from "@/lib/studio/store";
import { createMiniatureForStudio, linkProjectToStudio, listProjectsForStudio } from "@/lib/studio/link-project";

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

  it("rejects an unknown fiche", () => {
    expect(() => linkProjectToStudio("proj_1", "vid_unknownunknownunknownunknown")).toThrow(/fiche/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/studio/link-project.test.ts`

Expected: FAIL — column / module missing

- [ ] **Step 3: Write minimal implementation**

Dans `init()` de `db.ts`, à côté des ALTER `projects_meta` :

```ts
  if (!projectMetaColumns.some((c) => c.name === "studio_video_id")) {
    database.exec("ALTER TABLE projects_meta ADD COLUMN studio_video_id TEXT");
    database.exec("CREATE INDEX IF NOT EXISTS idx_projects_meta_studio ON projects_meta(studio_video_id)");
  }
```

`link-project.ts` :

```ts
export function linkProjectToStudio(projectId: string, videoId: string): void {
  if (!getStudioVideo(videoId)) throw new Error("Fiche vidéo introuvable.");
  const result = getDb().prepare("UPDATE projects_meta SET studio_video_id = ?, updated_at = ? WHERE id = ?").run(
    videoId,
    new Date().toISOString(),
    projectId,
  );
  if (result.changes === 0) throw new Error("Miniature introuvable");
}

export function listProjectsForStudio(videoId: string): Array<{ id: string; name: string }> {
  return getDb()
    .prepare("SELECT id, name FROM projects_meta WHERE studio_video_id = ? ORDER BY updated_at DESC")
    .all(videoId) as Array<{ id: string; name: string }>;
}

export function createMiniatureForStudio(videoId: string): { id: string; name: string } {
  const video = getStudioVideo(videoId);
  if (!video) throw new Error("Fiche vidéo introuvable.");
  const created = createProject(video.title.slice(0, 80));
  linkProjectToStudio(created.id, videoId);
  return created;
}
```

Relire `createProject` et l’appeler avec la signature réelle. Route `POST /api/studio/videos/[videoId]/miniature` → `createMiniatureForStudio`. Bouton éditeur : « Créer une miniature » puis naviguer comme `MiniaturesView` vers `/m/${id}`. Second bouton « Lier une miniature existante » : liste `listProjects()` (déjà filtrée), `PATCH` ou POST body `{ projectId }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/studio/link-project.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts src/lib/studio/link-project.ts src/app/api/studio/videos/[videoId]/miniature/route.ts src/components/studio/VideoEditor.tsx tests/studio/link-project.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): link a canvas miniature to a video fiche

EOF
)"
```

---

### Task 14: Afficher les miniatures liées sur la fiche (in-app)

**Files:**
- Create: `src/components/studio/LinkedThumbs.tsx`
- Modify: `src/components/studio/VideoEditor.tsx`
- Test: `tests/studio/linked-thumbs.test.tsx`

**Interfaces:**
- Consumes: `listProjectsForStudio`, couvertures déjà exposées par `listProjects` / `/api/miniatures`.
- Produces: section « Miniature » sous A/B Titre : jusqu’à 3 cartes 16:9 (cover du projet lié). Pas d’upload cloud. Si aucun lien : le bouton Phase 2 de Task 13 suffit.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import LinkedThumbs from "@/components/studio/LinkedThumbs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("LinkedThumbs", () => {
  it("renders linked project names and does not mention Notion", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <LinkedThumbs
          projects={[{ id: "proj_1", name: "Vibe Coding", coverImageUrl: "/api/generated-images/image?id=abc" }]}
        />,
      );
    });
    expect(container.textContent).toContain("Vibe Coding");
    expect(container.textContent).not.toMatch(/Notion/i);
    await act(async () => root.unmount());
    container.remove();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/studio/linked-thumbs.test.tsx`

Expected: FAIL — module missing

- [ ] **Step 3: Write minimal implementation**

Grille 3 colonnes `aspect-video`, `img` ou placeholder `ImagePlus` comme `ProjectTile`. Lien `/m/${id}`. Montage dans `VideoEditor` sous le heading « Miniature ».

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/studio/linked-thumbs.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/studio/LinkedThumbs.tsx src/components/studio/VideoEditor.tsx tests/studio/linked-thumbs.test.tsx
git commit -m "$(cat <<'EOF'
feat(studio): show linked canvas thumbnails on the video fiche

EOF
)"
```

---

## Chunk 7: Phase 3 — publier sur YouTube

### Task 15: Scope OAuth `youtube.upload` (incrémental)

**Files:**
- Modify: `src/lib/youtube/oauth.ts`
- Modify: `src/app/api/youtube/oauth/route.ts` — relire le chemin réel (`oauth/start` vs `oauth`) avant d’éditer
- Modify: `src/components/settings/YoutubeConnectCard.tsx`
- Test: `tests/youtube/oauth-scopes.test.ts`

**Interfaces:**
- Consumes: `YOUTUBE_OAUTH_SCOPES`, `include_granted_scopes: true` déjà présent.
- Produces: `buildGoogleAuthUrl` accepte `{ upload?: boolean }` et ajoute `https://www.googleapis.com/auth/youtube.upload` seulement si `upload`. Pas de `youtube.force-ssl`. Bouton « Autoriser la publication » → `?publish=1`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { YOUTUBE_OAUTH_SCOPES, buildGoogleAuthUrl } from "@/lib/youtube/oauth";

describe("youtube oauth scopes", () => {
  it("keeps the existing readonly connection by default", () => {
    expect(YOUTUBE_OAUTH_SCOPES).toEqual([
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/yt-analytics.readonly",
    ]);
    const url = buildGoogleAuthUrl({
      clientId: "cid",
      redirectUri: "http://localhost:3000/api/youtube/oauth/callback",
      state: "s",
    });
    expect(url).not.toContain("youtube.upload");
    expect(url).toContain("include_granted_scopes=true");
  });

  it("adds youtube.upload only when publishing is requested", () => {
    const url = buildGoogleAuthUrl({
      clientId: "cid",
      redirectUri: "http://localhost:3000/api/youtube/oauth/callback",
      state: "s",
      upload: true,
    });
    expect(decodeURIComponent(url)).toContain("https://www.googleapis.com/auth/youtube.upload");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/youtube/oauth-scopes.test.ts`

Expected: FAIL — `upload` n’existe pas **ou** `buildGoogleAuthUrl` a une autre signature (relire et adapter le test à la fonction réelle, ne pas inventer l’export)

- [ ] **Step 3: Write minimal implementation**

```ts
export function buildGoogleAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  upload?: boolean;
}): string {
  const scopes = input.upload
    ? [...YOUTUBE_OAUTH_SCOPES, "https://www.googleapis.com/auth/youtube.upload"]
    : [...YOUTUBE_OAUTH_SCOPES];
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: input.state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}
```

Relire la route OAuth et passer `upload` depuis `?publish=1`. Ne pas changer l’échange de code.

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/youtube/oauth-scopes.test.ts tests/channels/oauth-routes.test.ts`

Expected: PASS (si `oauth-routes.test.ts` casse à cause de la signature, l’adapter dans le même commit)

- [ ] **Step 5: Commit**

```bash
git add src/lib/youtube/oauth.ts src/app/api/youtube/oauth/start/route.ts src/components/settings/YoutubeConnectCard.tsx tests/youtube/oauth-scopes.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): request youtube.upload only when the creator wants to publish

EOF
)"
```

Les fichiers `git add` doivent être ceux réellement touchés après relecture (`oauth/route.ts` vs `oauth/start/route.ts`).

---

### Task 16: `videos.insert` brouillon + URL dans SQLite

**Files:**
- Create: `src/lib/studio/youtube-publish-auth.ts` — `getPublishAccessToken(): Promise<string>`
- Create: `src/lib/studio/youtube-publish.ts`
- Create: `src/app/api/studio/videos/[videoId]/publish/route.ts`
- Modify: `src/components/studio/VideoEditor.tsx`
- Test: `tests/studio/youtube-publish.test.ts`

**Interfaces:**
- Consumes: fiche, tokens OAuth (`oauth-store` / `tokens.ts`), `updateStudioVideo`.
- Produces: `publishStudioVideo(videoId, { privacy: "private" | "unlisted"; videoBytes: Uint8Array; filename: string }): Promise<{ videoId: string }>`
  - jamais `public`
  - `videos.insert` + `thumbnails.set` optionnel (cover du projet lié)
  - ensuite SQLite : `youtubeUrl=https://youtu.be/{id}`, `etiquette=En prod`
  - scope manquant → throw `Autorise la publication dans Réglages → Ma chaîne`
  - `MAX_PUBLISH_BYTES = 256 * 1024 * 1024`

Tests : mock `fetch` et `getPublishAccessToken`. Aucun appel réseau réel.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getDb } from "@/lib/db";
import { emptyStudioDraft } from "@/lib/studio/page-template";
import { createStudioVideo, saveStudioDraft } from "@/lib/studio/store";

vi.mock("@/lib/studio/youtube-publish-auth", () => ({
  getPublishAccessToken: vi.fn(async () => {
    throw new Error("Autorise la publication dans Réglages → Ma chaîne");
  }),
}));

let videoId = "";

beforeEach(() => {
  getDb().exec("DELETE FROM studio_drafts");
  getDb().exec("DELETE FROM studio_videos");
  videoId = createStudioVideo({ title: "Vibe Coding : c’est quoi ?", etiquette: "En cours" }).videoId;
  const draft = emptyStudioDraft();
  draft.description = "Pitch description";
  saveStudioDraft(videoId, draft);
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("publishStudioVideo", () => {
  it("refuses to publish without the upload scope", async () => {
    const { publishStudioVideo } = await import("@/lib/studio/youtube-publish");
    await expect(
      publishStudioVideo(videoId, {
        privacy: "unlisted",
        videoBytes: new Uint8Array([1]),
        filename: "a.mp4",
      }),
    ).rejects.toThrow(/Autorise la publication/);
  });
});
```

Second test dans le même fichier : mock `getPublishAccessToken` → `"ya29.upload"`, stub `fetch` insert 200 `{ id: "abcdefghijk" }`, assert `getStudioVideo(videoId)?.youtubeUrl === "https://youtu.be/abcdefghijk"` et `etiquette === "En prod"`. **Aucun** appel Notion.

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/studio/youtube-publish.test.ts`

Expected: FAIL — module missing

- [ ] **Step 3: Write minimal implementation**

`getPublishAccessToken` : relire le token stocké ; si `scope` ne contient pas `youtube.upload`, throw le message FR.

`publishStudioVideo` : POST `https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status` avec titre (`titleVariants[0].title` ou `title`) et description. Puis `updateStudioVideo` local seulement.

UI : `ConfirmDialog` « Publier en non répertorié ». Jamais public.

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/studio/youtube-publish.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/studio/youtube-publish.ts src/lib/studio/youtube-publish-auth.ts src/app/api/studio/videos/[videoId]/publish/route.ts tests/studio/youtube-publish.test.ts src/components/studio/VideoEditor.tsx
git commit -m "$(cat <<'EOF'
feat(studio): publish an unlisted draft to YouTube and store the watch URL locally

EOF
)"
```

---

## Chunk 8: Phase 4 — pré-tests + stats

### Task 17: Pré-tester 3 titres (TypeSafe, pas d’API Studio)

**Files:**
- Create: `src/lib/studio/title-pretest.ts`
- Create: `src/app/api/studio/videos/[videoId]/pretest/route.ts`
- Modify: `src/components/studio/TitleVariantsTable.tsx`
- Test: `tests/studio/title-pretest.test.ts`

**Interfaces:**
- Consumes: `draft.titleVariants`, helpers `src/lib/typesafe/rerank-titles.ts` (relire, réutiliser).
- Produces: `pretestTitleVariants(videoId: string): Promise<Array<TitleVariant & { score: number | null; reason: string }>>`
  - sans clé TypeSafe : `score: null`, `reason = "Ajoute TypeSafe dans Réglages → Connexions pour un pré-test Jev"`, **aucun fetch**
  - avec clé : un batch mockable `rankStudioTitles(titles: string[]): Promise<number[]>`

YouTube Studio Test & Compare n’a pas d’API publique. Lien `https://studio.youtube.com/video/{youtubeVideoId}/edit` si l’id existe.

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

Sans clé → 3 rows `score: null`. Avec clé → `rankStudioTitles` (wrapper autour du client existant). UI : bouton « Pré-tester les titres » sous la table ; lien Studio si `youtubeVideoId`.

Second test : mock `rankStudioTitles` → scores numériques.

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/studio/title-pretest.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/studio/title-pretest.ts src/app/api/studio/videos/[videoId]/pretest/route.ts src/components/studio/TitleVariantsTable.tsx tests/studio/title-pretest.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): pretest three titles with TypeSafe and deep-link Studio experiments

EOF
)"
```

---

### Task 18: Surface stats (données déjà ingérées)

**Files:**
- Create: `src/lib/studio/stats-copy.ts`
- Create: `src/components/studio/VideoStats.tsx`
- Modify: `src/components/studio/VideoEditor.tsx`
- Test: `tests/studio/video-stats.test.ts`

**Interfaces:**
- Consumes: `getVideo` + `getVideoAnalytics` quand `youtubeVideoId` est set (relire les helpers Ma chaîne, ne pas inventer de scraper).
- Produces: `studioStatsCopy(input: StudioStatsInput | null): string`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { studioStatsCopy } from "@/lib/studio/stats-copy";

describe("studioStatsCopy", () => {
  it("explains a missing channel ingest without inventing numbers", () => {
    expect(studioStatsCopy(null)).toBe("Connecte Ma chaîne et synchronise pour voir les stats Studio.");
  });

  it("formats ingested analytics", () => {
    expect(
      studioStatsCopy({
        views: 1200,
        averageViewDuration: 90,
        averageViewPercentage: 42,
        subscribersGained: 8,
      }),
    ).toBe("1 200 vues · AVD 90 s · rétention 42 % · +8 abo");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/studio/video-stats.test.ts`

Expected: FAIL — `stats-copy` missing

- [ ] **Step 3: Write minimal implementation**

```ts
export type StudioStatsInput = {
  views: number | null;
  averageViewDuration: number | null;
  averageViewPercentage: number | null;
  subscribersGained: number | null;
};

export function studioStatsCopy(input: StudioStatsInput | null): string {
  if (!input) return "Connecte Ma chaîne et synchronise pour voir les stats Studio.";
  const views = input.views == null ? "?" : input.views.toLocaleString("fr-FR");
  return `${views} vues · AVD ${input.averageViewDuration ?? "?"} s · rétention ${input.averageViewPercentage ?? "?"} % · +${input.subscribersGained ?? "?"} abo`;
}
```

`VideoStats` : si `youtubeVideoId`, lire analytics local et afficher `studioStatsCopy`. Texte seulement, ou deep-link vers l’UI existante si une route est déjà là (relire, ne pas recréer).

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/studio/video-stats.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/studio/stats-copy.ts src/components/studio/VideoStats.tsx src/components/studio/VideoEditor.tsx tests/studio/video-stats.test.ts
git commit -m "$(cat <<'EOF'
feat(studio): show already ingested Studio stats on the video fiche

EOF
)"
```

---

## Hors scope (volontaire, même produit plus tard)

- Whisper / `captions.download`
- Embeddings vectoriels
- Wizard F3c / Fiche thumbnail
- Rotation TubeBuddy / API fantôme Test & Compare
- Publication `public` automatique, Shorts, multi-comptes
- Buffer / Typefully / Make
- **Toute sync Notion** (API, webhook, bidirectionnel, « ouvrir dans Notion »)
- Import swipe files via `NOTION_API_KEY` (`INSTALL.md` historique — ne pas le réactiver ici)
- Base « Partenariats YouTube » (autre outil, autre jour)
- Éditeur blocs générique type Notion

---

## Self-review

### 1. Spec coverage

| Exigence | Task |
|---|---|
| ThumbGen = CMS (SQLite SoT, pas Notion) | 1, 3, 9, 10, 12 |
| Import one-shot optionnel (CSV / markdown) | 4, 9, 10 |
| Écrire une nouvelle vidéo sur le modèle Vibe Coding | 2, 7, 11 |
| RAG sur *leurs* vieux titres / descriptions / transcripts | 5, 6, 7 |
| Agent in-app d’écriture (skills, pas wizard) | 6–8, 11 |
| Lien miniature ↔ fiche (in-app) | 13, 14 |
| Publier sur YouTube | 15, 16 |
| Tests titre / miniature | 17 (pré-test + deep-link ; pas d’API Studio) |
| Stats | 18 (analytics déjà là) |
| Phase 1 livrable seule | Tasks 1–12 |
| UI/UX verrouillée (routes, kanban, chat docké) | section UI/UX + 10–12 |

### 2. Placeholder scan

Aucun TBD / TODO / « implement later » / « add validation » / « similar to Task N » sans code. Messages d’erreur FR écrits en entier. Commandes vitest exactes.

### 3. Type consistency

| Nom | Défini | Réutilisé |
|---|---|---|
| `Etiquette` / `ETIQUETTES` | Task 1 | 3–4, 6, 9–11, 16 |
| `StudioDraft` / `TitleVariant` | Task 1 | 2, 3, 5–6, 9, 11, 17 |
| `StudioVideo` / `videoId` | Task 1 | 3–16 |
| `CorpusHit` | Task 1 | 5, 6 |
| `newStudioVideoId` | Task 1 | 3 |
| `writingProjectId` / `isWritingProjectId` / `videoIdFromWritingProject` | Task 1 | 8, 11, 12, 13 |
| `emptyStudioDraft` / `parseStudioPageMarkdown` | Task 2 | 3, 4, 5, 16 |
| `createStudioVideo` / `getStudioVideo` / `saveStudioDraft` / `updateStudioVideo` | Task 3 | 4–11, 13, 16, 17 |
| `importStudioCsv` / `importStudioMarkdown` | Task 4 | 9, 10 |
| `retrieveOwnCorpus` | Task 5 | 6, 7 |
| `buildStudioVideoBlock` | Task 8 | `project_id` déjà passé au route-handler |
| `createMiniatureForStudio` | Task 13 | 14 |
| `publishStudioVideo` | Task 16 | route publish |
| `pretestTitleVariants` | Task 17 | table A/B |
| `studioStatsCopy` | Task 18 | `VideoStats` |

**Supprimé (ne plus réintroduire) :** `NotionPropertyMap`, `DEFAULT_NOTION_DATABASE_ID`, `notionApiKey`, `syncStudioVideos`, `push_studio_video`, `notionUrl`, `syncedAt`, `pageId`, `pushProjectThumbsToNotion`.

### 4. Scan « Notion source de vérité »

Passé sur le fichier : Notion n’apparaît plus que comme (a) décision **rejetée**, (b) format CSV d’export historique pour l’import one-shot, (c) interdits / hors scope. Aucune task n’exige une clé Notion, un client HTTP, ou une écriture vers Notion.

### Risques restants

- Import CSV mince (titres + URL + étiquette, pas le corps) : le markdown collé couvre les fiches riches ; sinon le script se réécrit dans ThumbGen.
- Corpus mince (quelques URLs Terminer + Ma chaîne). `write_video` doit le dire.
- Test & Compare : pas d’API ; Phase 4 = pré-test + deep-link.
- Quota `videos.insert` : un clic = un insert ; fichier ≤ 256 Mo en v1.
- `ChatPanel` + canvas vide : la skill interdit les tools canvas ; `apply_workflow` sur un projet inexistant ne doit pas créer de miniature fantôme.
- `createProject` génère `proj_${Date.now()}` — ne pas passer un id à la main.
- Rebuild Docker une seule fois, repo principal, fin de Task 12.
