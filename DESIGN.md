# DESIGN — ThumbGen / Illith Studio

> Référence visuelle, architecturale et opérationnelle. Toute nouvelle page,
> composant ou ajustement doit s'y conformer. Si on s'en écarte volontairement,
> on documente ici **pourquoi**.
>
> Lecture : ~10 minutes pour la première fois, 30 secondes pour la checklist `§17`.

---

## Sommaire

1. [Direction artistique — "Atelier Nocturne"](#1-direction-artistique--atelier-nocturne)
2. [Palette](#2-palette)
3. [Typographie](#3-typographie)
4. [Échelle dimensionnelle](#4-échelle-dimensionnelle)
5. [Layout & navigation](#5-layout--navigation)
6. [Composants partagés](#6-composants-partagés)
7. [Animation](#7-animation)
8. [Iconographie](#8-iconographie)
9. [Accessibilité](#9-accessibilité)
10. [Architecture du code](#10-architecture-du-code)
11. [Conventions API & routes](#11-conventions-api--routes)
12. [Persistance & schéma BDD](#12-persistance--schéma-bdd)
13. [Logging des générations](#13-logging-des-générations)
14. [Modèles d'IA — coûts & couleurs](#14-modèles-dia--coûts--couleurs)
15. [Conventions de code](#15-conventions-de-code)
16. [Anti-patterns](#16-anti-patterns)
17. [Checklist nouvelle page](#17-checklist-nouvelle-page)
18. [Smoke tests & dev](#18-smoke-tests--dev)

---

## 1. Direction artistique — "Atelier Nocturne"

Studio de créateur, fin de soirée. Base sombre raffinée, ivoire chaud, accent
magenta ponctuel. Pas une UI "dev tool" générique, pas un dashboard Bloomberg
clone non plus — le ton est **éditorial mais discret, instrumental mais pas
froid**.

**Inspirations admises** : éditions limitées de magazines design, panneaux de
contrôle de studios analogiques, ouvrages typographiques en couleurs limitées.

**Inspirations rejetées** : portfolio designer junior 2023, dashboards SaaS
"glassmorphic", AI tools type Midjourney UI, pages marketing "purple gradient".

**Mots clés** : précis, considéré, ivoire, hairline, italique, mono, asymétrie,
calme.

---

## 2. Palette

Toutes les couleurs sont des CSS variables dans `src/app/globals.css`.
**Jamais de hex en dur** dans les composants. Toujours `var(--token)`.

### 2.1 Fonds — du plus profond au plus haut

| Token       | Hex       | Usage                                                    |
| ----------- | --------- | -------------------------------------------------------- |
| `--ink-0`   | `#08080C` | Sentinelle, jamais utilisée seule                        |
| `--ink-1`   | `#0F0F14` | **Fond de page principal** (canvas, /usage, sidebar)    |
| `--ink-2`   | `#15151B` | Surfaces : cartes, panneaux, nodes du canvas            |
| `--ink-3`   | `#1E1E25` | Surfaces survolées / overlay                            |

**Règle** : la même page utilise au plus 2 niveaux de fond. Plus, et l'écran
devient un patchwork.

### 2.2 Texte — ivoire chaud

| Token          | Valeur                       | Usage                              |
| -------------- | ---------------------------- | ---------------------------------- |
| `--bone`       | `#F4F0E5`                    | Texte principal, big numbers       |
| `--bone-soft`  | `rgba(244,240,229,0.78)`     | Corps de texte secondaire          |
| `--bone-muted` | `rgba(244,240,229,0.48)`     | Labels, méta, hints                |
| `--bone-faint` | `rgba(244,240,229,0.28)`     | Placeholders, états désactivés     |

**Pourquoi pas `#FFFFFF`** : trop dur, fait "écran d'ordinateur". L'ivoire
légèrement teinté chaud fait "papier de qualité" — meilleur sur des sessions
longues.

### 2.3 Lignes

| Token             | Valeur                  | Usage                                   |
| ----------------- | ----------------------- | --------------------------------------- |
| `--line-faint`    | `rgba(255,255,255,0.06)`| Séparateurs intra-section, table rows   |
| `--line`          | `rgba(255,255,255,0.10)`| Séparateurs entre sections              |
| `--line-strong`   | `rgba(255,255,255,0.16)`| Sous header, sous totaux, focus discret |

### 2.4 Accents

| Token             | Hex / valeur                | Usage strict                                       |
| ----------------- | --------------------------- | -------------------------------------------------- |
| `--brand`         | `#E6007E`                   | Magenta Illith — accent ponctuel uniquement       |
| `--brand-tint`    | `rgba(230,0,126,0.14)`      | Fond actif d'icône sidebar (très subtil)          |
| `--mint`          | `#6EDDB3`                   | **Canvas uniquement** : handles, accent générateur|
| `--accent-yellow` | `#F7FFA8`                   | **Canvas uniquement** : bouton "Générer"          |
| `--ember`         | `#FF6B5B`                   | Erreurs, destructif, alertes                       |

### 2.5 Règle d'or sur le magenta `--brand`

Le rose magenta `#E6007E` est la couleur de marque (vient du logo Illith).
Trop de rose = "trop fille". Il doit **rester rare pour rester signifiant**.
Maximum **3 apparitions par écran**, et toujours en petite surface :

- ✅ Le `.` du big number (`$0[.]10`) — 1 caractère
- ✅ La numérotation `01 / 02` des sections (mono small caps)
- ✅ L'underline d'un pill actif (1 trait fin de 1px)
- ✅ Le bord/tint d'une icône sidebar active (très discret)
- ✅ Le logo Illith lui-même (qui contient `#e6007e` et `#f60086`)
- ❌ Bouton plein rose
- ❌ Bandeau / hero rose
- ❌ Fond de carte rose
- ❌ Plus de 3 éléments rose visibles à l'écran simultanément

### 2.6 Règle sur mint et yellow

`--mint` et `--accent-yellow` sont **réservés au canvas** (React Flow). Ce sont
des affordances fonctionnelles : "ceci est interactif, ceci est l'action
principale du nœud". Ils ne doivent **jamais** apparaître hors du canvas.

Les couleurs des modèles dans `PROVIDER_COLORS` (gemini, ideogram, openai, grok)
sont une exception : elles servent à identifier visuellement un fournisseur dans
les badges / swatches. Surface limitée (un point de 5-6px), pas d'aplat.

### 2.7 Exceptions documentées (canvas-only fonctionnel)

Trois constantes dans `src/lib/model-costs.ts` portent des hex non-tokenisés :

- `PROVIDER_COLORS` — pastilles de fournisseur dans badges (5-6px max)
- `AXIS_COLORS` — différencier des axes de prompts comparés (badges sur preview)
- `INPUT_TYPE_COLORS` — labels des handles `Prompt / Visage / Référence /
  Logo / Croquis` du `GeneratorNode` (texte 12px, canvas-only)

**Ces fichiers sont la seule source de vérité pour ces couleurs**. Aucun
composant ne doit redéfinir ses propres hex de modèle/type. Si tu ajoutes un
nouveau modèle ou un nouveau type d'input, ajoute-le ici, pas inline.

### 2.8 Hex de bibliothèques externes

- `viewBackgroundColor` d'Excalidraw dans `SketchEditor.tsx` doit rester un hex
  (la lib n'accepte pas les CSS variables). Mettre à jour si on change `--ink-3`.
- Logo YouTube tiers (`#FF0000` + `#fff`) dans `Sidebar.tsx` — couleurs de
  marque externe, à ne pas modifier.

---

## 3. Typographie

Trois familles, chacune avec un rôle précis. Toutes via `next/font/google` dans
`src/app/layout.tsx`.

| Famille            | Variable           | Usage                                         |
| ------------------ | ------------------ | --------------------------------------------- |
| **Fraunces**       | `--font-display`   | Titres, big numbers, **toujours italique**    |
| **DM Sans**        | `--font-dm-sans`   | Corps, boutons, navigation, labels            |
| **JetBrains Mono** | `--font-mono`      | Données numériques, timestamps, eyebrows      |

### 3.1 Échelle — dans l'ordre où on l'utilise

| Niveau    | Font          | Taille                  | Détails                             |
| --------- | ------------- | ----------------------- | ----------------------------------- |
| Big       | Fraunces      | clamp(96, 14vw, 200px) | italic 300, -0.045em letter-spacing |
| Page H1   | Fraunces      | 96px                    | italic 300, -0.04em                 |
| Section H2| Fraunces      | 28px                    | italic 400, -0.015em                |
| Body      | DM Sans       | 14px                    | 400                                 |
| Label     | DM Sans       | 12-13px                 | 400, 0.04-0.06em letter-spacing     |
| Eyebrow   | JetBrains Mono| 11px                    | 400, 0.18-0.22em, **uppercase**     |
| Data      | JetBrains Mono| 12-13px                 | 400, tabular-nums                   |
| Tiny meta | JetBrains Mono| 9-10px                  | 400, 0.16em, uppercase              |

### 3.2 Règles

- **Fraunces TOUJOURS en italique**. La droite perd son caractère.
- **Tabular nums** sur tout chiffre en mono : `font-variant-numeric: tabular-nums`
  pour aligner les colonnes et éviter le ballottement.
- **Pas plus de 3 niveaux de hiérarchie** par écran (sinon ça devient illisible).
- **Letter-spacing négatif uniquement pour Fraunces** grandes tailles (-0.04em).
  Le reste est positif ou nul.

---

## 4. Échelle dimensionnelle

### 4.1 Border-radius

| Contexte                | Radius |
| ----------------------- | ------ |
| Petits éléments (badge) | `3-4px`|
| Inputs, pills, boutons  | `8-10px` |
| Cartes, surfaces        | `12px` |
| Avatar, logo wrapper    | `12px` |
| Cercle parfait          | `50%`  |

**Pas de border-radius > 12px** sauf cercles. On reste précis.

### 4.2 Paddings standards

| Élément                 | Padding                             |
| ----------------------- | ----------------------------------- |
| Bouton compact          | `6px 12px`                          |
| Bouton standard         | `8px 14px`                          |
| Input                   | `8px 12px`                          |
| Carte                   | `20-24px`                           |
| Section page            | `48-72px` vertical, `56-64px` horizontal |
| Stat cell               | `22px 24px`                         |

### 4.3 Espacements (gap)

| Contexte                | Gap   |
| ----------------------- | ----- |
| Items d'une liste dense | `0`   |
| Items inline (meta)     | `24-32px` |
| Sections                | `56-80px` |
| Dans un bouton          | `6-8px` |
| Grille de cartes        | `16-24px` |

### 4.4 Sidebar

- **Largeur rail** : `64px` exactement, fixe, immuable.
- **Largeur panneau extensible** : `240px` (modèles), `300px` (faces, swipe,
  logos, settings — les listes nécessitent plus de place).
- **Padding logo** : `44px × 44px` wrapper, `30px × 30px` mark inside.

---

## 5. Layout & navigation

### 5.1 Layout pattern (très important)

Toute page de l'app suit la même structure :

```
┌─────────────────────────────────────────────┐
│ <body bg=ink-1>                             │
│   <Page-shell relative min-h-screen>        │
│     <Sidebar absolute left-0 top-0>         │  ← rail 64px + panels expand
│     <main padding-left:128px>               │  ← 64 (rail) + 64 (gutter)
│       contenu de la page                    │
│     </main>                                 │
│   </Page-shell>                             │
│ </body>                                     │
└─────────────────────────────────────────────┘
```

- La Sidebar est **toujours rendue** sur chaque page applicative.
- Elle est **toujours la même composante** (`<Sidebar />`), pas un rail spécifique.
- Le main a `padding-left: 128px` minimum (64 rail + 64 gutter).
- Cassure sur `1024px` : padding-left réduit à `96px`.

### 5.2 Navigation entre pages

**Règle cardinale** : ajouter une page ne doit **jamais** changer la sidebar.
L'icône correspondante prend l'état "actif", c'est tout.

L'icône Usage utilise `usePathname()` dans `Sidebar.tsx` pour savoir si elle
doit être marquée active (`pathname !== "/"` → on est sur /usage).

**Si une page hors `/` ouvre un panneau qui veut ajouter un node au canvas**
(ex: cliquer une face depuis /usage), le handler navigue vers `/` automatiquement
(géré dans `addAtCenter`). On ne tente pas d'ajouter un node si on n'est pas sur
le canvas.

### 5.3 Routes existantes

| Route       | Composant               | Rôle                              |
| ----------- | ----------------------- | --------------------------------- |
| `/`         | `Canvas`                | Workspace ReactFlow               |
| `/usage`    | `UsageView`             | Suivi coûts, log des générations  |

Les routes API sont sous `/api/*` (cf. §11).

### 5.4 ReactFlowProvider

Chaque page applicative est wrappée dans `<ReactFlowProvider>` parce que la
Sidebar partagée utilise `useReactFlow()`. Sur /usage il n'y a pas de
`<ReactFlow />` rendu — le provider sert juste à fournir le contexte vide.

---

## 6. Composants partagés

### 6.1 `<SidebarRail>` (`src/components/panels/SidebarRail.tsx`)

Présentation pure, sans dépendance ReactFlow. Utilisée par `<Sidebar>` mais
exportée pour usage standalone si besoin futur.

```tsx
<SidebarRail footer={<>...</>}>
  <RailIcon active={...} onClick={...}>{RailIcons.faces}</RailIcon>
</SidebarRail>
```

`RailIcon` accepte `href` (Link) **ou** `onClick` (button). Pas les deux.

`RailIcons` exporte les SVG inline standards :
`faces`, `models`, `swipe`, `logos`, `usage`, `settings`, `workspace`.

Pour ajouter une icône : éditer `SidebarRail.tsx` et ajouter à l'objet
`RailIcons`. Toutes : `width=20, height=20, viewBox="0 0 24 24",
strokeWidth="1.5"`.

### 6.2 `<Sidebar>` (`src/components/panels/Sidebar.tsx`)

Sidebar complète : rail + panneaux extensibles. Utilisée sur **toutes** les
pages applicatives. Ne pas créer de variante simplifiée.

### 6.3 Pills (filtres temporels)

Pas de fond. Texte uniquement. Underline 1px magenta sur l'actif.

```css
.pill          { background: transparent; color: var(--bone-muted); padding: 8px 14px; }
.pill:hover    { color: var(--bone); }
.pill[data-active="true"]         { color: var(--bone); }
.pill[data-active="true"]::after  { content: ""; position: absolute;
                                     left: 14px; right: 14px; bottom: -4px;
                                     height: 1px; background: var(--magenta-glow); }
```

### 6.4 Badges (modèle / endpoint)

Hairline border `--line`, fond très léger, swatch ronde du provider color.

```css
.badge { display: inline-flex; align-items: center; gap: 6px;
         padding: 3px 9px; border-radius: 3px;
         background: rgba(255,255,255,0.03); border: 1px solid var(--line);
         font-size: 11px; font-family: var(--font-mono); }
.b-swatch { width: 5px; height: 5px; border-radius: 50%; }
```

### 6.5 Tableaux denses (log)

Mono partout, hairlines uniquement, hover row très léger.

```css
table        { border-collapse: collapse; width: 100%;
               font-family: var(--font-mono); font-size: 12px; }
thead th     { padding: 12px; font-size: 10px; letter-spacing: 0.18em;
               text-transform: uppercase; color: var(--bone-muted);
               border-bottom: 1px solid var(--line); }
tbody td     { padding: 12px; border-bottom: 1px solid var(--line-faint); }
tbody tr:hover { background: rgba(255,255,255,0.02); }
.num         { text-align: right; font-variant-numeric: tabular-nums; }
```

### 6.6 Sections numérotées

```
01    By model                          5 models · sorted by cost
─────────────────────────────────────────────────────────────────
```

- Numéro mono magenta `--magenta-glow`
- Titre Fraunces italic 28px `--bone`
- Méta mono à droite `--bone-muted`
- Border bottom `--line`

### 6.7 Hero number

Big serif italique. `$` et `USD` en mono petit `--bone-muted`. Le point décimal
en magenta (signature de marque).

```jsx
<div className="big-number">
  <span className="ccy">$</span>
  <span>{int}</span>
  <span className="bn-dot">.</span>{/* magenta */}
  <span>{dec}</span>
  <span className="unit">USD</span>
</div>
```

### 6.8 Empty states

Bordure dashée `--line-faint`, mono 12px, padding généreux.

```css
.empty { padding: 60px 24px; text-align: center;
         border: 1px dashed var(--line-faint);
         color: var(--bone-muted); font-family: var(--font-mono);
         font-size: 12px; letter-spacing: 0.1em; }
```

Texte format : `— Description courte —` (avec tirets em).

---

## 7. Animation

| Cas                        | Durée        | Easing                                |
| -------------------------- | ------------ | ------------------------------------- |
| Hover (color, background)  | `0.15-0.18s` | `ease`                                |
| Toggle d'état              | `0.2s`       | `ease`                                |
| Ouverture panneau          | `0.25s`      | `ease-out`                            |
| Bar in (graphique)         | `0.6-0.7s`   | `cubic-bezier(0.16, 1, 0.3, 1)`       |
| Skeleton shimmer           | `1.4s`       | `linear infinite`                     |

**Règles** :
- Jamais > 0.3s pour une interaction utilisateur (sensation de lourdeur).
- Jamais d'animation sur scale/translate sauf cas exceptionnel justifié.
- Pas de bounce, pas d'overshoot sauf pour la "bar in" (cubic-bezier ci-dessus).

---

## 8. Iconographie

Système : **SVG inline 20×20 sur viewBox 24×24, stroke 1.5, sans fill** (sauf
indication explicite). Stroke `currentColor` pour hériter de la couleur du parent.

```jsx
<svg width="20" height="20" viewBox="0 0 24 24" fill="none"
     stroke="currentColor" strokeWidth="1.5"
     strokeLinecap="round" strokeLinejoin="round">
  {/* chemin */}
</svg>
```

**Icônes existantes** : `RailIcons` dans `SidebarRail.tsx`.

**Pour ajouter** : éditer `RailIcons`. Source d'icônes recommandée :
[Phosphor Icons](https://phosphoricons.com/) ou
[Lucide](https://lucide.dev/) (style cohérent avec ce qu'on a).

**Exception** : le logo Illith (`/illith.svg`) garde ses couleurs roses
d'origine. Il est l'unique élément de l'UI qui utilise du rose/magenta — c'est
sa signature.

---

## 9. Accessibilité

- **Contraste** : `--bone` sur `--ink-1` = ratio AAA. `--bone-muted` sur
  `--ink-1` = AA. `--bone-faint` est uniquement décoratif.
- **Tous les inputs** ont un `aria-label` ou un `<label>` explicite.
- **Pills filtres** : `data-active="true"` (qu'on lit aussi en CSS).
- **Icônes purement décoratives** : `aria-hidden="true"`.
- **Boutons à icône seule** : `title` + `aria-label`.
- **Logo** : `alt=""` (décoratif, le contexte texte adjacent suffit).
- **Focus visible** : par défaut le browser. Pas de `:focus { outline: none }`
  sans alternative.

---

## 10. Architecture du code

```
src/
├── app/
│   ├── layout.tsx           # root <html>/<body>, fonts, favicon
│   ├── globals.css          # CSS tokens, ReactFlow overrides
│   ├── page.tsx             # / → <Canvas>
│   ├── api/                 # routes API (§11)
│   └── usage/
│       ├── page.tsx         # /usage → <UsageView>
│       └── UsageView.tsx    # client component
├── components/
│   ├── Canvas.tsx           # workspace ReactFlow
│   ├── nodes/               # types de nodes ReactFlow
│   ├── edges/               # styles d'edges
│   └── panels/
│       ├── Sidebar.tsx      # sidebar partagée toutes pages
│       ├── SidebarRail.tsx  # rail seul (réutilisable)
│       ├── ProjectBar.tsx   # sélecteur projet
│       ├── SettingsPanel.tsx# panneau settings
│       └── (autres)
├── lib/
│   ├── db.ts                # SQLite — getDb(), schema, helpers
│   ├── settings.ts          # KV settings (clés API, prefs)
│   ├── local-storage.ts     # CRUD projets
│   ├── generated-images.ts  # save/get images en BLOB
│   ├── generations-log.ts   # log + agrégations stats
│   ├── model-costs.ts       # MODEL_COSTS, PROVIDER_COLORS
│   └── remove-bg.ts         # background removal client-side
├── store/
│   └── canvas-store.ts      # Zustand : nodes, edges, projets
├── middleware.ts            # auth simple par mot de passe
└── scripts/
    └── migrate-to-sqlite.ts # one-shot migration JSON → SQLite
```

### 10.1 Conventions de nommage

| Type                    | Convention                          |
| ----------------------- | ----------------------------------- |
| Composants React        | PascalCase (`UsageView.tsx`)        |
| Lib utilitaires         | kebab-case (`local-storage.ts`)     |
| Routes API              | kebab-case (`/api/face-reactions`)  |
| CSS classes locales     | kebab-case (`.usage-shell`)         |
| CSS variables           | `--kebab-case`                      |
| Tables SQLite           | snake_case (`generations_log`)      |
| Colonnes SQLite         | snake_case (`created_at`)           |
| Hooks                   | `useXxx`                            |

---

## 11. Conventions API & routes

### 11.1 Structure d'une route

```ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const param = request.nextUrl.searchParams.get("foo");
    // logique métier via lib/
    return NextResponse.json({ data });
  } catch (err) {
    console.error("Route error:", err);
    return NextResponse.json({ error: "..." }, { status: 500 });
  }
}
```

### 11.2 Réponses

- **Succès** : `200` + `{ data | success: true }`
- **Erreur client** : `400` + `{ error: "message" }`
- **Erreur serveur** : `500` + `{ error: "message" }` + `console.error`

### 11.3 Génération d'images (généralisable)

Les routes `/api/generate/*`, `/api/edit/*`, `/api/remix/*` suivent toutes le
même pattern :

```ts
const start = Date.now();
let promptForLog: string | null = null;
try {
  // 1. récupérer la clé API via getSetting("xxxApiKey")
  // 2. parser le body
  // 3. appeler le provider
  // 4. sur erreur HTTP → logGeneration({ status: "error", ... }) + return
  // 5. sur succès → saveGeneratedImage() pour chaque image, collecter ids
  // 6. logGeneration({ status: "success", imageCount, prompt, ... })
  // 7. return { images, stats }
} catch (err) {
  // logGeneration({ status: "error", errorMessage: ..., ... })
  // return 500
}
```

**Toute nouvelle route de génération doit logger.** Sinon les coûts sont
incomplets sur /usage.

---

## 12. Persistance & schéma BDD

Tout est dans `data/thumbgen.db` (SQLite). Format unique, portable, atomique.

### 12.1 Tables

| Table              | Rôle                                                  |
| ------------------ | ----------------------------------------------------- |
| `projects_meta`    | id, name, created_at, updated_at                      |
| `projects`         | id, nodes (JSON), edges (JSON), updated_at            |
| `settings`         | key, value (KV, ex: clés API, currentProjectId)       |
| `generated_images` | id, mime_type, data (BLOB), created_at                |
| `swipe_files`      | id, title, mime_type, size, data (BLOB), created_at   |
| `logos`            | id, label, mime_type, size, data (BLOB), created_at   |
| `face_reactions`   | id, label, mime_type, size, data (BLOB), created_at   |
| `generations_log`  | id, created_at, provider, model, endpoint, cost_estimate, time_ms, tokens, image_count, prompt, status, error_message, generated_image_ids |

### 12.2 Indexes

```sql
CREATE INDEX idx_generations_log_created_at ON generations_log(created_at);
CREATE INDEX idx_generations_log_model      ON generations_log(model);
CREATE INDEX idx_generations_log_provider   ON generations_log(provider);
```

### 12.3 Évolutions

- **Nouvelle colonne** : ajouter dans `getDb().init()` avec
  `ALTER TABLE ... ADD COLUMN ... IF NOT EXISTS` (ou via une migration explicite).
- **Nouvelle table** : ajouter au `CREATE TABLE IF NOT EXISTS` dans `db.ts`.
- **Migration de données** : créer un script `scripts/migrate-XXX.ts` qu'on
  lance manuellement. Ne pas exécuter au démarrage.

### 12.4 Backup

Un seul fichier à sauvegarder : `data/thumbgen.db`. Recommandation : copier
chaque jour vers un drive externe.

```bash
cp data/thumbgen.db data/backups/thumbgen-$(date +%Y%m%d).db
```

---

## 13. Logging des générations

Chaque appel API qui génère une image **doit** appeler `logGeneration()` depuis
`src/lib/generations-log.ts`, en succès **et** en erreur.

```ts
logGeneration({
  provider: "gemini" | "ideogram" | "openai" | "grok",
  model: "<id du modèle>",
  endpoint: "generate" | "edit" | "remix",
  timeMs: Date.now() - start,
  imageCount: images.length,            // 0 sur erreur
  inputTokens, outputTokens, totalTokens, // si fournis par l'API
  prompt: promptForLog,                 // texte original sans préfixe
  status: "success" | "error",
  errorMessage: ...,
  generatedImageIds: [...uuids],        // pour relier au log
});
```

Le coût est calculé automatiquement via `getCostPerImage(model) * imageCount`.

---

## 14. Modèles d'IA — coûts & couleurs

`src/lib/model-costs.ts` est la **source de vérité** pour :
- Coûts par image (`MODEL_COSTS`)
- Couleurs de provider (`PROVIDER_COLORS`)

**Une seule règle** : si un nouveau modèle est ajouté côté API, il doit être
ajouté ici **dans le même PR**. Sinon le coût sera 0 dans /usage.

Tarifs actuels (estimations début 2026) :

| Modèle                              | $/image |
| ----------------------------------- | ------- |
| `gemini-2.5-flash-image`            | 0.02    |
| `gemini-3.1-flash-image-preview`    | 0.02    |
| `gemini-3-pro-image-preview`        | 0.04    |
| `ideogram`                          | 0.08    |
| `gpt-image-2`                       | 0.04    |
| `gpt-image-1.5`                     | 0.02    |
| `gpt-image-1`                       | 0.02    |
| `grok-imagine-image`                | 0.03    |

À mettre à jour si les fournisseurs changent leurs tarifs.

---

## 15. Conventions de code

### 15.1 TypeScript

- `strict: true` (cf `tsconfig.json`)
- Pas de `any` sans commentaire justifiant
- Préférer `Record<string, T>` à `{ [k: string]: T }`
- Types explicites pour les exports (`export type X = ...`)

### 15.2 React

- Composants client : `"use client"` en première ligne
- Pas d'`useEffect` sans cleanup quand il y a une subscription / event listener
- Pas de `useMemo` / `useCallback` premature ; ajouter quand profilable
- Toujours `key` stable sur `.map()` (pas l'index si possible)

### 15.3 Styles

- **CSS variables** ou **styled-jsx** dans le composant. Pas de styled-components.
- **Pas de Tailwind class soup** dans les composants éditoriaux (la page
  /usage). Tailwind reste utilisé dans Sidebar/Canvas pour la rapidité.
- Les pages "design" (usage, futurs dashboards) utilisent du CSS sémantique
  scoped via `<style jsx>`.

### 15.4 Commits

Format `<type>: <description courte>`. Types : `feat`, `fix`, `refactor`,
`chore`, `docs`, `style`. Exemple :

```
feat(usage): add cost-per-image stat
fix(sidebar): unify rail across /usage and /
docs: expand DESIGN.md with API patterns
```

---

## 16. Anti-patterns

| À éviter                                  | Pourquoi                                                     |
| ----------------------------------------- | ------------------------------------------------------------ |
| `#FFFFFF` blanc pur en texte              | Trop dur en dark mode. Utiliser `--bone`.                   |
| Couleur en hex inline                     | Casse la cohérence. Toujours via tokens.                    |
| Émoji dans l'UI                           | Bruit visuel, pas dans la direction artistique.             |
| Bouton/CTA en magenta plein                | Le magenta doit rester signal, pas surface.                  |
| Sidebar absente sur une page              | Cohérence de navigation rompue.                             |
| Sidebar différente sur une page           | Encore pire — l'utilisateur perd ses repères.               |
| Fond différent du canvas sur une page     | Cassure visuelle entre /pages.                              |
| Police de titre en non-italique           | Fraunces droite perd son caractère.                         |
| Animation > 0.3s pour interaction         | Sensation de lourdeur, frustration.                         |
| Border-radius > 12px (hors cercle)        | On reste précis, pas "soft / friendly".                     |
| Ombre portée                              | On utilise des inset shadows pour les états actifs.         |
| Tailwind class soup dans pages éditoriales| Illisible, pas mainenable.                                  |
| `addNode` côté lib appelé sans contexte RF| Crash. Toujours guarder via `pathname === "/"`.             |
| Hex de model dans un composant            | Source de vérité = `lib/model-costs.ts`.                    |
| Génération sans `logGeneration()`         | Le coût n'apparaît pas dans /usage.                         |

---

## 17. Checklist nouvelle page

À cocher avant de considérer la page "prête" :

- [ ] Composant client (`"use client"`) si interactivité
- [ ] Page wrappée dans `<ReactFlowProvider>` (pour héberger `<Sidebar>`)
- [ ] `<Sidebar />` rendu (pas un rail différent)
- [ ] Fond `--ink-1` (continuité)
- [ ] Wrapper `position: relative; min-height: 100vh`
- [ ] Main avec `padding-left: 128px` (96px en `<= 1024px`)
- [ ] Eyebrow mono uppercase + trait `--magenta-glow` 28px
- [ ] H1 en Fraunces italic
- [ ] Sections numérotées `01 / 02 …` avec mono magenta
- [ ] Données numériques en JetBrains Mono tabular-nums
- [ ] Texte principal en `--bone`, jamais `#FFFFFF`
- [ ] Pas plus de 3 magenta visibles à un instant
- [ ] Pas de mint / yellow hors canvas
- [ ] Hairlines (1px, `--line` ou `--line-faint`), pas d'ombres lourdes
- [ ] Hover < 0.18s
- [ ] `aria-label` sur les boutons à icône seule
- [ ] `title` sur tout élément cliquable porteur d'info
- [ ] Empty state stylé `— Texte —`
- [ ] Loading state (skeleton ou shimmer)
- [ ] Responsive testé à 1024px et 768px
- [ ] Build prod (`npm run build`) sans warning ni erreur

---

## 18. Smoke tests & dev

### 18.1 Démarrer en local

```bash
npm run dev      # http://localhost:3000 (ou 3001 si occupé)
```

### 18.2 Migrer JSON → SQLite (one-shot)

```bash
npm run migrate
```

### 18.3 Tester l'API en CLI

```bash
# Stats
curl -s "http://localhost:3001/api/generations?period=all" | jq

# Générer un thumbnail (Gemini par défaut)
curl -s -X POST http://localhost:3001/api/generate/nano-banana \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test","aspectRatio":"16x9","model":"gemini-3-pro-image-preview"}' | jq
```

### 18.4 Build de production

```bash
npm run build
npm start
```

### 18.5 Inspecter la base

```bash
# Tables et tailles
sqlite3 data/thumbgen.db "
  SELECT name FROM sqlite_master WHERE type='table';
"

# Dernières générations
sqlite3 data/thumbgen.db "
  SELECT created_at, model, status, cost_estimate
  FROM generations_log ORDER BY created_at DESC LIMIT 10;
"

# Coût total cumulé
sqlite3 data/thumbgen.db "
  SELECT SUM(cost_estimate) FROM generations_log;
"
```

### 18.6 Variables d'environnement

```
GEMINI_API_KEY     # requis pour la génération (modèles Gemini)
IDEOGRAM_API_KEY   # optionnel
OPENAI_API_KEY     # optionnel
GROK_API_KEY       # optionnel
YOUTUBE_API_KEY    # optionnel (récupération de playlists)
SITE_PASSWORD      # optionnel (auth simple par middleware)
```

Toutes peuvent être surchargées via la table `settings` (priorité au paramètre
DB sur la variable d'environnement, cf. `lib/settings.ts:getSetting`).

---

_Dernière révision : 2026-04-25._
