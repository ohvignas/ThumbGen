# Page Bibliothèque (chantier C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sidebar's library flyout with a `/bibliotheque` page (Personnages, Logos, Inspirations tabs) that manages the library, add online logo search (Simple Icons, SVGL, Wikimedia Commons, optional Brandfetch) with SVG → PNG import and Brandfetch remote references, and let canvas nodes pick library items through a shared `LibraryPickerDialog`.

**Architecture:** Server logic is pure and unit-tested: one module per logo source under `src/lib/logos/providers/`, a merge with per-source timeout (`src/lib/logos/search.ts`), an import pipeline (`add-logo.ts` + `rasterize.ts` on `@resvg/resvg-js`), and a single logo loader (`logo-image.ts`) shared by `GET /api/logos/image` and the agent's `resolveImageSource`, so a Brandfetch logo (row with `remote_url`, empty `data`) is fetched on use and never stored. The page is a thin client shell (`LibraryView`, tab in `?onglet=`) over one component per tab plus small shared blocks; nodes reuse the same grids through `picker-tabs.tsx` / `LibraryPickerDialog.tsx`, the contract chantier D extends.

**Tech Stack:** Next.js 16.2.1 App Router (Turbopack build, `output: "standalone"`), React 19.2.4, TypeScript strict, Tailwind v4, shadcn `base-nova` on Base UI (`@base-ui/react` 1.8.0), `@xyflow/react` 12, Zustand 5, zod 4, better-sqlite3 12, vitest 4, lucide-react 1.46. New: `simple-icons` 16.31.0, `@resvg/resvg-js` 2.6.2 (exact versions).

**Spec:** `docs/superpowers/specs/2026-09-16-bibliotheque-page-design.md` — the binding authority; read it before any task. Deviations and clarifications are listed under « Code reality vs spec (rulings) ». Chantier D (`docs/superpowers/specs/2026-09-16-chaines-suivies-design.md`) is planned in parallel and builds on the files named in « Shared contract with chantier D ».

## Global Constraints

- **Preflight — Réglages, chantier A and chantier B are on `main`.** This plan was written against `main` at `be5f8ac`. Before Task 1, run:
  ```bash
  git log --oneline -1
  grep -n "export const SECRET_KEYS" src/lib/settings-schema.ts
  grep -n "export async function testProviderKey" src/lib/connection-tests.ts
  grep -n "useLibraryStore" src/components/nodes/FaceReferenceNode.tsx
  grep -n "export function catalogIdForNode" src/lib/canvas/node-catalog.ts
  test -f src/components/nodes/generator/GeneratorInputRow.tsx && echo "chantier B OK"
  test -f src/components/settings/ConfirmDialog.tsx && echo "ConfirmDialog OK"
  test ! -f src/components/ui/tabs.tsx && echo "no tabs.tsx yet (Task 8 adds it)"
  ```
  Expected: every grep prints a line and the three `echo` lines are printed. Otherwise STOP and report what is missing.
- **Shared files — re-read before editing, never trust line numbers.** Edits to existing files are anchored on quoted code. If an anchor is not found verbatim, locate the same code by its identifiers and apply the same change; if the code is gone, skip that sub-step and say so in the report.
- **Interfaces delivered earlier, used verbatim (never reimplemented):**
  - `src/components/settings/ConfirmDialog.tsx` — default export, props `open`, `onOpenChange`, `title`, `description`, `confirmLabel`, `busy?`, `destructive?` (default `true`), `onConfirm`, `contentClassName?`.
  - `src/components/panels/PersonaImportDialog.tsx` — props `onClose`, `prepareFile: (file: File) => Promise<string>`, `onSubmit: (photos: Partial<Record<PersonaAngle, string>>, name: string) => Promise<void>`, `saving`. `src/components/panels/WebcamCaptureModal.tsx` — props `onClose`, `onComplete: (photos: Record<"front" | "left" | "right", string>, name: string) => void | Promise<void>`.
  - `src/lib/personas.ts` — `type PersonaAngle`, `PERSONA_ANGLES`, `PERSONA_ANGLE_LABELS`, `type PersonaSummary = { id: string; label: string; angles: PersonaAngle[] }`, `personaImageUrl(personaId, angle)`, `personaNodeData(persona)`.
  - `src/lib/canvas/node-catalog.ts` — `catalogIdForNode(node: { type?: string; data?: Record<string, unknown> }): string | undefined` (`"logo"` / `"reference"` for a `swipeFile`). `src/store/canvas-store.ts` — `NodeData.kind?: "reference" | "logo"`, `updateNodeData(nodeId, data)` (shallow merge).
  - `src/lib/settings.ts` — `getTypedSettings()`, `setSetting(key, value)`; `src/lib/settings-schema.ts` — `SECRET_KEYS`, `ENV_FALLBACK`, `SettingsSchema`; `src/lib/connection-tests.ts` — `TESTABLE_PROVIDERS`, `testProviderKey(provider)`, private `failure(res, apiKey)` (masks the key).
  - `src/hooks/useGeneratorDefaults.ts` — consumed by `Canvas.tsx` for `NodePicker`; it must still be the source of generator defaults after Task 13.
- **Commands.** Tests: `./node_modules/.bin/vitest run` (one file: `./node_modules/.bin/vitest run tests/path/file.test.ts`). Types: `./node_modules/.bin/tsc --noEmit`. Lint (touched files only): `./node_modules/.bin/eslint <files>` — no new **errors** (existing `@next/next/no-img-element` warnings are fine). `npx` is broken in this shell; `node` may be a broken shell function — use `/opt/homebrew/bin/node` if needed. If `tsc` errors appear only under `.next/types` or `.next/dev/types`, run `rm -rf .next/types .next/dev/types` and re-run it.
- **Tests** run against the isolated temp DB created by `tests/setup.ts` (`THUMBGEN_DB_PATH`). New tests go in **new files** (the only edit to an existing test file is Task 2's one-line fixture fix, and Task 13 deletes `tests/canvas/library-store.test.ts`). **No test touches the network:** every request to SVGL, Wikimedia, Brandfetch goes through `vi.stubGlobal("fetch", fetchMock)`. Tests that read `brandfetchApiKey` delete `process.env.BRANDFETCH_API_KEY` first and restore it after. Never read or print a real API key.
- **Dependencies.** Added with exact versions by the task that needs them: Task 6 `npm install --save-exact simple-icons@16.31.0`, Task 7 `npm install --save-exact @resvg/resvg-js@2.6.2`. Commit `package.json` and `package-lock.json` in that task.
- **Intermediate browser checks** use a throwaway dev server on port 3100, never the Docker DB: `THUMBGEN_DB_PATH="$(mktemp -d)/thumbgen.db" ./node_modules/.bin/next dev -p 3100` (run in the background, stop it after the check). Never click « Générer », never send an agent chat message. Free public APIs (SVGL, Wikimedia) may be called from the page during these checks. If a login page appears, stop and ask the user; never type a password. If the browser tool cannot choose a local file, seed the item with the `curl` commands given in the task and check everything else.
- **Docker.** The user is actively using `http://localhost:3000`. Exactly **one** rebuild, in Task 14: `docker compose build thumbgen && docker compose up -d thumbgen`, run from `/Users/antoinevigneau/thumbgen-real` (the `./data` bind mount is relative — never from a worktree).
- **shadcn here is `base-nova` on Base UI, not Radix.** Check `src/components/ui/*.tsx` before writing JSX. `DropdownMenuItem` has `onClick` (no `onSelect`); `DropdownMenuLabel` must sit inside `DropdownMenuGroup`; `Select`'s `onValueChange` receives `string | null` and takes `items`; `ToggleGroup` uses arrays; triggers use `render={<Button … />}` (children inside the rendered `Button`, as in `MiniaturesView.tsx`); `Tabs` is the Base UI API of `src/components/ui/tabs.tsx` added in Task 8 (`value`, `onValueChange(value)`, `TabsList`, `TabsTrigger value`, `TabsContent value`; inactive panels unmount). `Card` has `size="sm"`; `Button` sizes include `xs`, `sm`, `icon-sm`.
- **`cn` is imported from the npm package `"cn"`** (`import { cn } from "cn"`; it merges Tailwind classes).
- **UI rules.** Only shadcn components and Tailwind classes in new or rewritten code — no `style={{…}}`. Inside canvas nodes, new lines use the node tokens through Tailwind (`border-(--line)`, `text-(--text-secondary)`, `text-(--canvas-accent)`). UI copy is French; JSX text apostrophes are written `&apos;`.
- **Spec values (verbatim):** sidebar entry « Bibliothèque » (icon `Library`) under « Mes miniatures », active on `/bibliotheque`; tabs **Personnages**, **Logos**, **Inspirations**; `?onglet=personnages|logos|inspirations`, default `personnages`; persona card « n/3 », empty angle « — »; menus « Renommer », « Remplacer un angle », « Supprimer »; « Nouveau personnage » → « Capturer avec la webcam » / « Importer une photo par angle »; logo search « Chercher un logo », ≥ 2 characters, ~300 ms debounce, ~4 s per source, notice « SVGL indisponible », all sources down « Recherche indisponible, importe une image »; variant badges Clair / Sombre / Couleur; « Ajouter »; SVG → **PNG 1024 px wide, transparent background**; Brandfetch = remote reference, column `logos.remote_url` (nullable); « Importer une image »; section « Mes logos », badge « Brandfetch », « Logo indisponible » with « Supprimer »; `brandfetchApiKey` in `SECRET_KEYS`, env `BRANDFETCH_API_KEY`, link « Obtenir une clé gratuite », « Tester »; Inspirations « Mes images », « Importer des images », rename route `POST /api/swipe-files/rename`; « Chaînes suivies » « Bientôt »; node button « Choisir dans la bibliothèque », logo tab « Chercher en ligne »; « Créer un personnage » opens `/bibliotheque?onglet=personnages` in a new browser tab, list reloads on window focus.
- **Commit only the files a task lists** — never `git add -A` / `git add .`; deleted files are staged with `git rm`. Every commit message ends with a blank line and `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` (the plan uses a second `-m` for it).

## Shared contract with chantier D

Chantier D's plan depends on these exact names — do not rename, do not change signatures:

- Page `src/app/bibliotheque/page.tsx`; tab from `?onglet=personnages|logos|inspirations` (default `personnages`).
- Inspirations tab renders `<FollowedChannelsSection />` from `src/components/library/FollowedChannelsSection.tsx` (default export, no props). Chantier C creates it as the « Chaînes suivies — Bientôt » section that also shows the current read-only « Ma chaîne » feed (`/api/youtube/playlist`) and owns the `youtube-channel-saved` window listener. Chantier D rewrites this file entirely.
- `src/components/library/LibraryPickerDialog.tsx` default export, props `{ open: boolean; onOpenChange: (open: boolean) => void; kind: LibraryKind; onPick: (item: LibraryPick) => void }`.
- `src/components/library/picker-tabs.tsx` exports `type LibraryKind = "personnages" | "logos" | "inspirations"`, `type LibraryPick = { imageUrl: string; label: string }`, `type PickerTab = { id: string; label: string; render: (props: { query: string; onPick: (item: LibraryPick) => void }) => React.ReactNode }`, and `const PICKER_TABS: Record<LibraryKind, PickerTab[]>`. The dialog renders one shadcn `Tabs` entry per `PICKER_TABS[kind]` item with a shared search input passed as `query`. Chantier D appends a « Chaînes suivies » tab to `PICKER_TABS.inspirations`.
- Library item image URLs stay the existing routes (`/api/personas/image…`, `/api/logos/image?f=…`, `/api/swipe-files/image?f=…`).

## Code reality vs spec (rulings)

External APIs were checked on 2026-09-16 (docs + one read-only request each, no key used):

1. **SVGL** (`https://svgl.app/docs/api`, live `GET https://api.svgl.app?search=notion|vercel|youtube|nike`): array of `{ id, title, category: string | string[], route: string | { light, dark }, wordmark?: string | { light, dark }, url, brandUrl? }`; asset URLs are `https://svgl.app/library/*.svg`. **No match answers HTTP 404 `{"error":"❌ (SVGL - API) SVG not found"}`** → treated as zero results, not as an unavailable source. SVGL asks clients to cache for a few minutes → 5-minute in-memory cache per normalised query. `route.light` (logo for light backgrounds) → variant « Clair », `route.dark` → « Sombre »; wordmarks are separate results named « <title> (logo texte) ».
2. **Wikimedia Commons** (MediaWiki API, live): `action=query&generator=search&gsrnamespace=6&prop=imageinfo&iiprop=url|mime&iiurlwidth=256&formatversion=2` returns `query.pages[]` **unordered** with an `index` field → sorted by `index`. The query `intitle:"<q>" intitle:logo` gives brand files (plain `<q> logo` returned unrelated « Design » files for « notion »). Only `image/svg+xml` and `image/png` are kept. **Commons thumbnails snap to standard widths** (`iiurlwidth=1024` is served from a 1280 px file, 512 from 960 px), so the spec's « rendu PNG via les vignettes Commons à la largeur voulue » is used for previews only (`thumburl`); « Ajouter » downloads the original (query string stripped): SVG rasterised locally at exactly 1024 px, PNG stored as is. Requests carry `User-Agent: ThumbGen/1.0 (+https://github.com/ohvignas/ThumbGen)` (no email address).
3. **Brandfetch authenticates with a client ID** passed as `?c=` for both the Brand Search API (`GET https://api.brandfetch.io/v2/search/{name}?c=…`, response `[{ brandId, claimed, domain, name, icon, _score, qualityScore, verified }]`, `icon` = hotlinkable CDN URL signed by Brandfetch, valid 24 h) and the Logo CDN (`https://cdn.brandfetch.io/<identifier>/w/…/fallback/…/icon.png?c=…`). The setting keeps the spec's name `brandfetchApiKey` / `BRANDFETCH_API_KEY`; the Réglages card calls it « Client ID ».
4. **The Brand Search endpoint accepted a fake client ID** (live probe returned results) while the CDN answered `403` with `x-bf-error: client_id_invalid_signature`. So « Tester » runs the spec's minimal search **and** one small CDN icon request (`redirect: "manual"`) to tell a valid ID apart.
5. **Brandfetch forbids programmatic access to logo images** (Logo API usage guidelines: server fetches may be answered `302` with `x-bf-error: automated_traffic`). The spec requires `GET /api/logos/image` to fetch remote logos server-side; this plan implements the spec with an honest `User-Agent` (no browser spoofing), `redirect: "manual"`, and turns any refusal into `404` → the card shows « Logo indisponible ». « Tester » reports `automated_traffic` explicitly and Task 14 records what the CDN does with the user's key. If Brandfetch refuses server access, remote logos cannot reach the model — flag it to the user (the fix would be a spec change, e.g. browser hotlinking).
6. **Remote reference format.** `remote_url` stores `https://cdn.brandfetch.io/<brandId>/w/1024/fallback/404/icon.png` **without** `?c=`; the current client ID is appended at fetch time, so removing the key makes the route answer 404 (spec) and the key never lands in the DB or backups. `.png` because the CDN defaults to WebP. Search result previews hotlink the `icon` URL returned by the search (Brandfetch requires hotlinking; never stored).
7. **`logos.data`, `mime_type`, `size` are `NOT NULL`.** SQLite cannot relax that without rebuilding the table, so a remote row stores an empty BLOB, `size = 0`, `mime_type = "image/png"`; the migration only adds `remote_url TEXT`, via exported, idempotent `ensureLogosRemoteUrlColumn(database)` called from `init()`.
8. **The agent reads logos outside the image route.** `apply_workflow` and `generate_sketch` resolve `stored:lg_<id>` through `resolveImageSource`, which reads `logos.data` directly (0 bytes for a remote logo). It now goes through the same `loadLogoImage(id)` as `GET /api/logos/image`. `list_logos` keeps its line format and `stored:lg_` reference; a remote row says « Brandfetch logo, fetched when used » instead of a byte size.
9. **simple-icons 16.31.0** (npm metadata + `types.d.ts` + `index.mjs` read on jsDelivr): named exports `siNike`, … of type `SimpleIcon = { title, slug, svg, path, source, hex, guidelines?, license? }` — **no aliases**. Aliases live only in the `simple-icons/icons.json` export (`aliases.aka[]`, `aliases.dup[].title`, `aliases.loc{}`), e.g. `X` has `aka: ["Twitter"]`. Both are imported; that export's `types` entry is a `.d.ts` without a default export, so it is imported as a namespace and read through a runtime `Array.isArray` guard. The icon SVG has no `fill` → the brand colour is injected (`fill="#<hex>"`), variant « Couleur ».
10. **SVG → PNG rasteriser: `@resvg/resvg-js` 2.6.2.** Prebuilt N-API binaries for `linux-arm64-gnu` / `linux-x64-gnu` / `darwin-arm64`, no system library — the Docker image is `node:20-slim` (Debian, glibc). `new Resvg(svg, { fitTo: { mode: "width", value: 1024 } }).render().asPng()` gives an 8-bit RGBA PNG with a transparent background. `sharp` (an optional dependency of `next`) was rejected: its SVG support depends on the libvips build and its `@img/*` platform packages plus their dependencies would all need manual copying into the standalone image. `@resvg/resvg-js` is **not** in Next 16.2.1's built-in server-external list (`node_modules/next/dist/lib/server-external-packages.jsonc`) and loads its platform package with a runtime `require` → Task 7 adds `serverExternalPackages: ["@resvg/resvg-js"]` to `next.config.ts` and copies `node_modules/@resvg` in the Dockerfile, like `better-sqlite3`. System fonts are not loaded (`loadSystemFonts: false`): the slim image has none and logo SVGs are paths.
11. **`src/components/ui/tabs.tsx` does not exist.** `npx shadcn add` is unavailable; Task 8 writes the `base-nova` registry file verbatim (fetched from `https://ui.shadcn.com/r/styles/base-nova/tabs.json`, only dependency `cn`).
12. **Sidebar leftovers not in the spec.** The flyout also listed « Miniatures enregistrées » from `public/swipe-file/manifest.json` (tracked, content `[]`) and added items on click. Both disappear with the flyout; the manifest file stays untouched. `AppSidebar` called `useReactFlow()` only for those add-to-canvas helpers, which is why `/miniatures`, `/reglages` and `/usage` wrapped it in a `ReactFlowProvider`. Task 8 gives `/bibliotheque` the same provider so each task stays runnable; Task 13 removes it from those four pages (kept on `/m/[id]`, where the canvas needs it).
13. **Store and drag-and-drop consumers** (grep on `be5f8ac`): `useLibraryStore` is used only by `AppSidebar.tsx`, `FaceReferenceNode.tsx` and `tests/canvas/library-store.test.ts` → the store and its test are deleted. `application/reactflow-type` is only written by the sidebar → `Canvas.tsx`'s `onDragOver` / `onDrop` are removed. The only UI path that created generators with defaults besides the removed drop is `NodePicker` (empty state, `N`, context menu, wire drop, generator « + Ajouter »), still fed by `useGeneratorDefaults()` in `Canvas.tsx`; the sidebar's « Modèles d'image » click-to-add is removed with the tab (spec).
14. **Chat picker.** `src/components/panels/chat/LibraryPickerModal.tsx` returns `stored:` sources (agent contract) while nodes need image URLs, so it stays unchanged for the chat; `LibraryPickerDialog` is its node-side successor built on the same list endpoints (the spec's « évolution »).
15. **Persona creation.** `POST /api/personas` accepted `photos: {}`; it now answers 400 when no valid photo is sent. `tests/agent/rename-persona-route.test.ts` created its fixture with `photos: {}` → its fixture now sends a front photo (one-line change).
16. **Tab state.** `?onglet=` is read with `useSearchParams()` (the page wraps the view in `Suspense`) and written with `window.history.replaceState`, which Next.js syncs into `useSearchParams` — switching tabs does not refetch the page.
17. **Search fields.** Logos tab: the single « Chercher un logo » field drives the online search (≥ 2 characters) **and** filters « Mes logos » (the spec's local search). Inspirations tab: the local search filters « Mes images »; `FollowedChannelsSection` has no props (contract), so its feed is not filtered. Personnages: its own field.
18. **Merged grid order and caps.** Simple Icons (8), SVGL (8), Brandfetch (6), Wikimedia (8): local and curated sources first, the noisiest last; duplicates dropped by `key`. The route returns `{ results, queried, unavailable }`; « Recherche indisponible, importe une image » shows when every queried source failed or the request itself failed.
19. **`POST /api/logos/add` never downloads a client-supplied URL it has not validated** (SSRF guard): SVGL refs must match `https://svgl.app/…svg`, Wikimedia refs `https://upload.wikimedia.org/wikipedia/commons/…(svg|png)`, Simple Icons refs are slugs, Brandfetch refs are brand IDs. Downloads: 10 s timeout, 5 MB cap.
20. **Manual import** keeps today's flows: logos converted client-side to PNG (512 px max) then `POST /api/logos`; images to JPEG (1600 px max) then `POST /api/swipe-files`; persona photos to JPEG (1600 px max).
21. **« Le nœud affiche son état vide » after a deletion.** `SwipeFileNode`: a `404` on its `imageUrl` sets a local « missing » state that renders the empty state and the picker button, without rewriting node data (a Brandfetch logo whose key comes back reappears). `FaceReferenceNode`: a `personaId` absent from a successfully loaded list renders the empty state with « Personnage supprimé de la bibliothèque. ». While editing `SwipeFileNode`, importing a file now also clears `imageUrl` (otherwise `saveProject` strips the new `imageBase64` because an `imageUrl` is still set).
22. **Feed polling.** The sidebar refetched `/api/youtube/playlist` (the whole uploads playlist) every 5 minutes on every page; `FollowedChannelsSection` loads it when displayed and on `youtube-channel-saved` only. `ChaineSection`'s comment about the sidebar is updated; `list_personas`'s empty-library text (« l'onglet Personnages de la sidebar ») now points to the Bibliothèque page — text only, the tool contract is unchanged.
23. **`GET /api/logos`** rows gain `remote: boolean`; `GET /api/logos/image` answers `Cache-Control: private, max-age=300` for remote logos (stored logos keep `public, max-age=31536000, immutable`). `PICKER_TABS.personnages` exists because the contract requires every kind; nodes do not use it (the Personnage node keeps its select, spec §6).

## Execution lanes

Task 1 first. Server lane: 2 and 3 anytime; 4 → (5 ∥ 6) → 7 (6 and 7 both run `npm install`, never at the same time). UI lane: 8 after 1 → (9 ∥ 10) → 13; 11 after 7 and 8; 12 after 11 (12 and 13 touch disjoint files). Task 14 last, alone. Files are disjoint inside each parallel group; Task 7's local `next build` must not run while another lane's dev server uses the same checkout.

## File Structure

**Create**
- `src/lib/search-text.ts` — `normalizeSearchText`, `matchesSearch`.
- `src/lib/library/library-tabs.ts` — tab ids, labels, `parseLibraryTab`, `libraryTabHref`.
- `src/lib/library/library-items.ts` — `LibraryLogo`, `LibrarySwipe`, image URL builders, `filterBySearch`, `fileBaseName`.
- `src/lib/library/image-file.ts` — browser-only `fileToDataUrl` + import presets.
- `src/lib/user-agent.ts` — `THUMBGEN_USER_AGENT`.
- `src/lib/logos/shared.ts` — client-safe logo search types, labels, notices.
- `src/lib/logos/providers/simple-icons.ts`, `svgl.ts`, `wikimedia.ts`, `brandfetch.ts` — one source each.
- `src/lib/logos/search.ts` — providers list, merge with timeout.
- `src/lib/logos/rasterize.ts` — `svgToPng`.
- `src/lib/logos/add-logo.ts` — `addLogoFromSearch`, `LogoAddError`.
- `src/lib/logos/logo-image.ts` — `loadLogoImage`.
- `src/app/api/logos/search/route.ts`, `src/app/api/logos/add/route.ts`, `src/app/api/swipe-files/rename/route.ts`.
- `src/components/ui/tabs.tsx` — shadcn base-nova Tabs.
- `src/app/bibliotheque/page.tsx`.
- `src/components/library/`: `LibraryView.tsx`, `PersonasTab.tsx`, `ReplaceAngleDialog.tsx`, `LogosTab.tsx`, `MyLogosSection.tsx`, `LogoSearchResults.tsx`, `LogoPreview.tsx`, `useLogoSearch.ts`, `InspirationsTab.tsx`, `MyImagesSection.tsx`, `FollowedChannelsSection.tsx`, `LibraryPickerDialog.tsx`, `picker-tabs.tsx`, `picker-grids.tsx`, `LibrarySearchInput.tsx`, `ItemActionsMenu.tsx`, `RenameDialog.tsx`, `LibraryGrid.tsx`, `useLibraryList.ts`.
- Tests: `tests/library/library-helpers.test.ts`, `tests/library/personas-routes.test.ts`, `tests/library/swipe-files-rename.test.ts`, `tests/settings/brandfetch-settings.test.ts`, `tests/logos/logos-remote-url-migration.test.ts`, `tests/logos/remote-logos.test.ts`, `tests/logos/logo-search-providers.test.ts`, `tests/logos/logo-search.test.ts`, `tests/logos/add-logo.test.ts`.

**Modify**
- `src/app/bibliotheque/page.tsx` (created by Task 8, provider removed by Task 13), `src/app/api/personas/route.ts`, `src/lib/settings-schema.ts`, `src/lib/connection-tests.ts`, `src/components/settings/SecretKeyCard.tsx`, `src/components/settings/ConnexionsSection.tsx`, `src/lib/db.ts`, `src/app/api/logos/image/route.ts`, `src/app/api/logos/route.ts`, `src/lib/agent/tools/_helpers/image-source.ts`, `src/lib/agent/tools/list-logos.ts`, `next.config.ts`, `Dockerfile`, `package.json`, `package-lock.json`, `src/components/nodes/SwipeFileNode.tsx`, `src/components/panels/AppSidebar.tsx` (rewrite), `src/components/Canvas.tsx`, `src/components/nodes/FaceReferenceNode.tsx`, `src/app/miniatures/page.tsx`, `src/app/reglages/layout.tsx`, `src/app/usage/UsageView.tsx`, `src/components/settings/ChaineSection.tsx` (comment), `src/lib/agent/tools/list-personas.ts` (text).
- Test: `tests/agent/rename-persona-route.test.ts` (fixture).

**Delete**
- `src/store/library-store.ts`, `tests/canvas/library-store.test.ts`.

---

## Task 1: Search text, library tabs and item helpers

**Files:**
- Create: `src/lib/search-text.ts`
- Create: `src/lib/library/library-tabs.ts`
- Create: `src/lib/library/library-items.ts`
- Test: `tests/library/library-helpers.test.ts`

**Interfaces:**
- Consumes: nothing (pure modules).
- Produces:
  - `src/lib/search-text.ts`: `normalizeSearchText(text: string): string`, `matchesSearch(text: string, query: string): boolean`
  - `src/lib/library/library-tabs.ts`: `LIBRARY_TAB_IDS = ["personnages", "logos", "inspirations"] as const`, `type LibraryTabId`, `DEFAULT_LIBRARY_TAB: LibraryTabId`, `LIBRARY_TAB_LABELS: Record<LibraryTabId, string>`, `isLibraryTab(value: unknown): value is LibraryTabId`, `parseLibraryTab(value: string | null | undefined): LibraryTabId`, `libraryTabHref(tab: LibraryTabId): string`
  - `src/lib/library/library-items.ts`: `type LibraryLogo = { filename: string; label: string; size: number; remote: boolean }`, `type LibrarySwipe = { filename: string; title: string; size: number }`, `logoImageUrl(filename: string): string`, `swipeImageUrl(filename: string): string`, `filterBySearch<T>(items: readonly T[], label: (item: T) => string, query: string): T[]`, `fileBaseName(fileName: string): string`

- [ ] **Step 1: Write the failing tests**

Create `tests/library/library-helpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { matchesSearch, normalizeSearchText } from "@/lib/search-text";
import {
  DEFAULT_LIBRARY_TAB,
  LIBRARY_TAB_IDS,
  LIBRARY_TAB_LABELS,
  isLibraryTab,
  libraryTabHref,
  parseLibraryTab,
} from "@/lib/library/library-tabs";
import { fileBaseName, filterBySearch, logoImageUrl, swipeImageUrl } from "@/lib/library/library-items";

describe("search text", () => {
  it("ignores case, accents and surrounding spaces", () => {
    expect(normalizeSearchText("  Élodie À la Plage ")).toBe("elodie a la plage");
    expect(matchesSearch("Réaction choquée", "REACTION")).toBe(true);
    expect(matchesSearch("Réaction choquée", "choque reac")).toBe(true);
    expect(matchesSearch("Réaction choquée", "surprise")).toBe(false);
  });

  it("matches everything on a blank query", () => {
    expect(matchesSearch("Logo", "   ")).toBe(true);
    expect(matchesSearch("", "")).toBe(true);
  });
});

describe("library tabs", () => {
  it("lists the three tabs in order with French labels", () => {
    expect(LIBRARY_TAB_IDS).toEqual(["personnages", "logos", "inspirations"]);
    expect(LIBRARY_TAB_LABELS).toEqual({ personnages: "Personnages", logos: "Logos", inspirations: "Inspirations" });
    expect(DEFAULT_LIBRARY_TAB).toBe("personnages");
  });

  it("reads ?onglet= and falls back to personnages", () => {
    expect(parseLibraryTab("logos")).toBe("logos");
    expect(parseLibraryTab("inspirations")).toBe("inspirations");
    expect(parseLibraryTab("personnages")).toBe("personnages");
    expect(parseLibraryTab("Logos")).toBe("personnages");
    expect(parseLibraryTab("modeles")).toBe("personnages");
    expect(parseLibraryTab(null)).toBe("personnages");
    expect(parseLibraryTab(undefined)).toBe("personnages");
    expect(isLibraryTab("logos")).toBe(true);
    expect(isLibraryTab(3)).toBe(false);
  });

  it("builds the page link of a tab", () => {
    expect(libraryTabHref("personnages")).toBe("/bibliotheque?onglet=personnages");
    expect(libraryTabHref("logos")).toBe("/bibliotheque?onglet=logos");
  });
});

describe("library items", () => {
  it("builds image URLs from the stored id", () => {
    expect(logoImageUrl("3f2c")).toBe("/api/logos/image?f=3f2c");
    expect(swipeImageUrl("a b")).toBe("/api/swipe-files/image?f=a%20b");
  });

  it("filters by label, accent-insensitive, keeping the order", () => {
    const items = [{ label: "Notion" }, { label: "YouTube" }, { label: "Nötion clair" }];
    expect(filterBySearch(items, (item) => item.label, "notion")).toEqual([{ label: "Notion" }, { label: "Nötion clair" }]);
    expect(filterBySearch(items, (item) => item.label, "")).toEqual(items);
  });

  it("drops the extension of an imported file name", () => {
    expect(fileBaseName("logo.final.png")).toBe("logo.final");
    expect(fileBaseName("sans-extension")).toBe("sans-extension");
    expect(fileBaseName(".png")).toBe("Image");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/library/library-helpers.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/search-text"`.

- [ ] **Step 3: Write the modules**

Create `src/lib/search-text.ts`:

```ts
/** Lowercase, accents removed, trimmed — for case- and accent-insensitive search. */
export function normalizeSearchText(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** True when every word of `query` appears in `text`. A blank query matches everything. */
export function matchesSearch(text: string, query: string): boolean {
  const words = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeSearchText(text);
  return words.every((word) => haystack.includes(word));
}
```

Create `src/lib/library/library-tabs.ts`:

```ts
/** Tabs of the /bibliotheque page, kept in the URL as ?onglet=. */
export const LIBRARY_TAB_IDS = ["personnages", "logos", "inspirations"] as const;

export type LibraryTabId = (typeof LIBRARY_TAB_IDS)[number];

export const DEFAULT_LIBRARY_TAB: LibraryTabId = "personnages";

export const LIBRARY_TAB_LABELS: Record<LibraryTabId, string> = {
  personnages: "Personnages",
  logos: "Logos",
  inspirations: "Inspirations",
};

export function isLibraryTab(value: unknown): value is LibraryTabId {
  return typeof value === "string" && (LIBRARY_TAB_IDS as readonly string[]).includes(value);
}

export function parseLibraryTab(value: string | null | undefined): LibraryTabId {
  return isLibraryTab(value) ? value : DEFAULT_LIBRARY_TAB;
}

export function libraryTabHref(tab: LibraryTabId): string {
  return `/bibliotheque?onglet=${tab}`;
}
```

Create `src/lib/library/library-items.ts`:

```ts
/** Client-safe shapes and helpers for the library lists. */
import { matchesSearch } from "@/lib/search-text";

/** One row of GET /api/logos. `remote`: a Brandfetch reference fetched when used. */
export type LibraryLogo = { filename: string; label: string; size: number; remote: boolean };

/** One row of GET /api/swipe-files. */
export type LibrarySwipe = { filename: string; title: string; size: number };

export function logoImageUrl(filename: string): string {
  return `/api/logos/image?f=${encodeURIComponent(filename)}`;
}

export function swipeImageUrl(filename: string): string {
  return `/api/swipe-files/image?f=${encodeURIComponent(filename)}`;
}

/** Items whose label matches the query (case- and accent-insensitive), in their original order. */
export function filterBySearch<T>(items: readonly T[], label: (item: T) => string, query: string): T[] {
  return items.filter((item) => matchesSearch(label(item), query));
}

/** Default title of an imported file: its name without the extension. */
export function fileBaseName(fileName: string): string {
  return fileName.replace(/\.[^./\\]*$/, "").trim() || "Image";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/library/library-helpers.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Type-check, lint, commit**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/lib/search-text.ts src/lib/library/library-tabs.ts src/lib/library/library-items.ts tests/library/library-helpers.test.ts
git add src/lib/search-text.ts src/lib/library/library-tabs.ts src/lib/library/library-items.ts tests/library/library-helpers.test.ts
git commit -m "feat(library): search text, library tabs and item helpers" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Expected: `tsc` exits 0, no eslint error.

---

## Task 2: Personnages — the server refuses a Personnage without photos

**Files:**
- Modify: `src/app/api/personas/route.ts`
- Modify: `tests/agent/rename-persona-route.test.ts` (fixture only)
- Test: `tests/library/personas-routes.test.ts`

**Interfaces:**
- Consumes: existing routes `POST/GET /api/personas`, `PATCH/DELETE /api/personas/[id]`, `POST /api/personas/[id]/photos`.
- Produces: `POST /api/personas` answers `400 { error: "Ajoute au moins une photo du personnage." }` when `photos` holds no photo. Everything else unchanged (Task 9's UI relies on `PATCH` for « Renommer », `POST …/photos` `{ angle, dataUrl }` for « Remplacer un angle », `DELETE` for « Supprimer »).

- [ ] **Step 1: Write the failing tests**

Create `tests/library/personas-routes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { GET as listPersonas, POST as createPersona } from "@/app/api/personas/route";
import { DELETE as deletePersona, PATCH as renamePersona } from "@/app/api/personas/[id]/route";
import { POST as savePhoto } from "@/app/api/personas/[id]/photos/route";
import { getDb } from "@/lib/db";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZkqfO0AAAAASUVORK5CYII=";

function jsonRequest(url: string, method: string, body?: unknown): never {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as never;
}

const withId = (id: string) => ({ params: Promise.resolve({ id }) });

type PersonaRow = { id: string; label: string; angles: string[] };

async function personas(): Promise<PersonaRow[]> {
  return (await (await listPersonas()).json()) as PersonaRow[];
}

async function create(label: string, photos: Record<string, string>): Promise<Response> {
  return createPersona(jsonRequest("http://localhost/api/personas", "POST", { label, photos }));
}

describe("POST /api/personas", () => {
  it("refuses a Personnage without any photo", async () => {
    const before = (getDb().prepare("SELECT COUNT(*) AS n FROM personas").get() as { n: number }).n;
    const res = await create("Sans photo", {});
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("Ajoute au moins une photo du personnage.");
    const noPhotosKey = await createPersona(jsonRequest("http://localhost/api/personas", "POST", { label: "Rien" }));
    expect(noPhotosKey.status).toBe(400);
    const after = (getDb().prepare("SELECT COUNT(*) AS n FROM personas").get() as { n: number }).n;
    expect(after).toBe(before);
  });

  it("creates a Personnage from the front photo alone", async () => {
    const res = await create("Face seule", { front: PNG });
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: string };
    expect((await personas()).find((persona) => persona.id === id)?.angles).toEqual(["front"]);
  });
});

describe("managing a Personnage", () => {
  it("renames, replaces an angle and deletes with its photos", async () => {
    const { id } = (await (await create("Avant", { front: PNG })).json()) as { id: string };

    const renamed = await renamePersona(jsonRequest(`http://localhost/api/personas/${id}`, "PATCH", { label: "Après" }), withId(id));
    expect(renamed.status).toBe(200);
    expect((await personas()).find((persona) => persona.id === id)?.label).toBe("Après");

    const left = await savePhoto(jsonRequest(`http://localhost/api/personas/${id}/photos`, "POST", { angle: "left", dataUrl: PNG }), withId(id));
    expect(left.status).toBe(200);
    const front = await savePhoto(jsonRequest(`http://localhost/api/personas/${id}/photos`, "POST", { angle: "front", dataUrl: PNG }), withId(id));
    expect(front.status).toBe(200);
    expect((await personas()).find((persona) => persona.id === id)?.angles).toEqual(["front", "left"]);
    const frontRows = getDb().prepare("SELECT COUNT(*) AS n FROM persona_photos WHERE persona_id = ? AND angle = 'front'").get(id) as { n: number };
    expect(frontRows.n).toBe(1);

    const removed = await deletePersona(jsonRequest(`http://localhost/api/personas/${id}`, "DELETE"), withId(id));
    expect(removed.status).toBe(200);
    expect((await personas()).some((persona) => persona.id === id)).toBe(false);
    const photos = getDb().prepare("SELECT COUNT(*) AS n FROM persona_photos WHERE persona_id = ?").get(id) as { n: number };
    expect(photos.n).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify the refusal fails**

Run: `./node_modules/.bin/vitest run tests/library/personas-routes.test.ts`
Expected: FAIL in « refuses a Personnage without any photo » (`expected 200 to be 400`); the other tests pass.

- [ ] **Step 3: Refuse zero photos**

In `src/app/api/personas/route.ts`, find:

```ts
      decoded.push({ angle, buffer, mimeType });
    }

    const id = uuid();
```

Replace with:

```ts
      decoded.push({ angle, buffer, mimeType });
    }

    // The UI always sends at least the front photo; a Personnage without any
    // photo is useless to the generator, so the API refuses it too.
    if (decoded.length === 0) {
      return NextResponse.json({ error: "Ajoute au moins une photo du personnage." }, { status: 400 });
    }

    const id = uuid();
```

- [ ] **Step 4: Fix the rename test fixture that created an empty Personnage**

In `tests/agent/rename-persona-route.test.ts`, replace:

```ts
      await call(POST as never, { method: "POST", url: "http://localhost/api/personas", body: { label: "Old name", photos: {} } })
```

with:

```ts
      await call(POST as never, { method: "POST", url: "http://localhost/api/personas", body: { label: "Old name", photos: { front: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZkqfO0AAAAASUVORK5CYII=" } } })
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/library/personas-routes.test.ts tests/agent/rename-persona-route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
./node_modules/.bin/eslint src/app/api/personas/route.ts tests/library/personas-routes.test.ts tests/agent/rename-persona-route.test.ts
git add src/app/api/personas/route.ts tests/library/personas-routes.test.ts tests/agent/rename-persona-route.test.ts
git commit -m "fix(personas): refuse creating a Personnage without any photo" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Inspirations — `POST /api/swipe-files/rename`

**Files:**
- Create: `src/app/api/swipe-files/rename/route.ts`
- Test: `tests/library/swipe-files-rename.test.ts`

**Interfaces:**
- Consumes: table `swipe_files (id, title, …)`.
- Produces: `POST /api/swipe-files/rename` body `{ filename: string; title: string }` → `200 { success: true }`; `400 { error }` when `filename` or `title` is missing/blank, not JSON, or `title` is longer than 200 characters; `404 { error: "Image introuvable" }` for an unknown id. `filename` may be legacy `<id>.<ext>`. The title is trimmed.

- [ ] **Step 1: Write the failing tests**

Create `tests/library/swipe-files-rename.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import { POST } from "@/app/api/swipe-files/rename/route";

let id: string;

function rename(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/swipe-files/rename", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const titleOf = (swipeId: string) =>
  (getDb().prepare("SELECT title FROM swipe_files WHERE id = ?").get(swipeId) as { title: string }).title;

beforeEach(() => {
  getDb().exec("DELETE FROM swipe_files");
  id = uuid();
  getDb()
    .prepare("INSERT INTO swipe_files (id, title, mime_type, size, data) VALUES (?, ?, ?, ?, ?)")
    .run(id, "Ancien titre", "image/jpeg", 3, Buffer.from([1, 2, 3]));
});

describe("POST /api/swipe-files/rename", () => {
  it("renames an image with a trimmed title", async () => {
    const res = await rename({ filename: id, title: "  Nouveau titre  " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(titleOf(id)).toBe("Nouveau titre");
  });

  it("accepts a legacy <id>.<ext> filename", async () => {
    expect((await rename({ filename: `${id}.jpg`, title: "Avec extension" })).status).toBe(200);
    expect(titleOf(id)).toBe("Avec extension");
  });

  it("rejects a missing, blank or too long title and a bad body", async () => {
    expect((await rename({ filename: id })).status).toBe(400);
    expect((await rename({ filename: id, title: "   " })).status).toBe(400);
    expect((await rename({ title: "Sans fichier" })).status).toBe(400);
    expect((await rename({ filename: id, title: "x".repeat(201) })).status).toBe(400);
    expect((await rename("pas du json")).status).toBe(400);
    expect(titleOf(id)).toBe("Ancien titre");
  });

  it("answers 404 for an unknown image", async () => {
    const res = await rename({ filename: "inconnu", title: "Titre" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Image introuvable" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/library/swipe-files-rename.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/api/swipe-files/rename/route"`.

- [ ] **Step 3: Write the route**

Create `src/app/api/swipe-files/rename/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

const MAX_TITLE_LENGTH = 200;

export async function POST(request: Request) {
  let body: { filename?: unknown; title?: unknown };
  try {
    body = (await request.json()) as { filename?: unknown; title?: unknown };
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const filename = typeof body.filename === "string" ? body.filename.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!filename || !title) {
    return NextResponse.json({ error: "Nom de fichier ou titre manquant" }, { status: 400 });
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return NextResponse.json({ error: `Titre trop long (${MAX_TITLE_LENGTH} caractères maximum)` }, { status: 400 });
  }

  // Legacy clients sent "<id>.<ext>".
  const id = filename.split(".")[0];
  const result = getDb().prepare("UPDATE swipe_files SET title = ? WHERE id = ?").run(title, id);
  if (result.changes === 0) return NextResponse.json({ error: "Image introuvable" }, { status: 404 });
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/library/swipe-files-rename.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
./node_modules/.bin/eslint src/app/api/swipe-files/rename/route.ts tests/library/swipe-files-rename.test.ts
git add src/app/api/swipe-files/rename/route.ts tests/library/swipe-files-rename.test.ts
git commit -m "feat(library): rename route for inspiration images" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Brandfetch key in Réglages, with its connection test

**Files:**
- Create: `src/lib/user-agent.ts`
- Modify: `src/lib/settings-schema.ts`
- Modify: `src/lib/connection-tests.ts`
- Modify: `src/components/settings/SecretKeyCard.tsx`
- Modify: `src/components/settings/ConnexionsSection.tsx`
- Test: `tests/settings/brandfetch-settings.test.ts`

**Interfaces:**
- Consumes: `SECRET_KEYS`, `ENV_FALLBACK`, `SettingsSchema` (`secret()` helper), `testProviderKey`, `failure()` from the Réglages chantier.
- Produces:
  - `src/lib/user-agent.ts`: `THUMBGEN_USER_AGENT = "ThumbGen/1.0 (+https://github.com/ohvignas/ThumbGen)"`
  - `TypedSettings.brandfetchApiKey: string | undefined` (secret, masked by `GET /api/settings`, env fallback `BRANDFETCH_API_KEY`) — read by Tasks 5, 6, 7 through `getTypedSettings().brandfetchApiKey`.
  - `TESTABLE_PROVIDERS` includes `"brandfetch"`; `testProviderKey("brandfetch")` → `{ ok: true, detail: "Clé valide · recherche et logos disponibles" }` or a failure detail.
  - `ProviderKeyConfig.key` accepts `"brandfetchApiKey"`; optional `helpLabel?: string`.

- [ ] **Step 1: Write the failing tests**

Create `tests/settings/brandfetch-settings.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getDb } from "@/lib/db";
import { getTypedSettings, setSetting } from "@/lib/settings";
import { ENV_FALLBACK, SECRET_KEYS } from "@/lib/settings-schema";
import { TESTABLE_PROVIDERS, testProviderKey } from "@/lib/connection-tests";
import { GET as getSettings } from "@/app/api/settings/route";
import { POST as testRoute } from "@/app/api/settings/test/route";

const KEY = "bf-client-secret-1234";
const fetchMock = vi.fn<typeof fetch>();
let savedEnv: string | undefined;

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

const pngResponse = () =>
  new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { status: 200, headers: { "content-type": "image/png" } });

beforeEach(() => {
  getDb().exec("DELETE FROM settings");
  savedEnv = process.env.BRANDFETCH_API_KEY;
  delete process.env.BRANDFETCH_API_KEY;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (savedEnv === undefined) delete process.env.BRANDFETCH_API_KEY;
  else process.env.BRANDFETCH_API_KEY = savedEnv;
});

describe("brandfetchApiKey setting", () => {
  it("is a secret with an environment fallback", () => {
    expect(SECRET_KEYS).toContain("brandfetchApiKey");
    expect(ENV_FALLBACK.brandfetchApiKey).toBe("BRANDFETCH_API_KEY");
    expect(getTypedSettings().brandfetchApiKey).toBeUndefined();
    process.env.BRANDFETCH_API_KEY = "bf-from-env-9999";
    expect(getTypedSettings().brandfetchApiKey).toBe("bf-from-env-9999");
  });

  it("is masked by GET /api/settings", async () => {
    setSetting("brandfetchApiKey", KEY);
    const body = await (await getSettings()).json();
    expect(body.brandfetchApiKey).toEqual({ configured: true, preview: "…1234", source: "settings" });
    expect(JSON.stringify(body)).not.toContain(KEY);
  });
});

describe("Brandfetch connection test", () => {
  it("is testable and reports a missing key without any request", async () => {
    expect(TESTABLE_PROVIDERS).toContain("brandfetch");
    expect(await testProviderKey("brandfetch")).toEqual({ ok: false, detail: "Aucune clé configurée" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("runs a minimal search, then checks the client ID on the logo CDN", async () => {
    setSetting("brandfetchApiKey", KEY);
    fetchMock
      .mockResolvedValueOnce(json([{ brandId: "id_x", name: "Brandfetch", domain: "brandfetch.com", icon: "https://cdn.brandfetch.io/id_x/icon.webp" }]))
      .mockResolvedValueOnce(pngResponse());
    expect(await testProviderKey("brandfetch")).toEqual({ ok: true, detail: "Clé valide · recherche et logos disponibles" });
    const [searchUrl, searchInit] = fetchMock.mock.calls[0];
    expect(String(searchUrl)).toBe(`https://api.brandfetch.io/v2/search/brandfetch?c=${KEY}`);
    expect((searchInit?.headers as Record<string, string>)["User-Agent"]).toMatch(/^ThumbGen\//);
    const [logoUrl, logoInit] = fetchMock.mock.calls[1];
    expect(String(logoUrl)).toBe(`https://cdn.brandfetch.io/brandfetch.com/w/64/fallback/404/icon.png?c=${KEY}`);
    expect(logoInit?.redirect).toBe("manual");
    expect(logoInit?.signal).toBeInstanceOf(AbortSignal);
  });

  it("reports a client ID the CDN rejects", async () => {
    setSetting("brandfetchApiKey", KEY);
    fetchMock
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json({ error: "client_id_invalid_signature" }, 403, { "x-bf-error": "client_id_invalid_signature" }));
    expect(await testProviderKey("brandfetch")).toEqual({
      ok: false,
      detail: "Clé refusée par Brandfetch (client_id_invalid_signature)",
    });
  });

  it("says when Brandfetch refuses server access to logos", async () => {
    setSetting("brandfetchApiKey", KEY);
    fetchMock
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { "x-bf-error": "automated_traffic", location: "https://brandfetch.com/developers" } }));
    const result = await testProviderKey("brandfetch");
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("automated_traffic");
  });

  it("masks the key in a search error and stops there", async () => {
    setSetting("brandfetchApiKey", KEY);
    fetchMock.mockResolvedValueOnce(json({ error: { message: `Invalid client ${KEY}` } }, 401));
    const result = await testProviderKey("brandfetch");
    expect(result).toEqual({ ok: false, detail: "HTTP 401 · Invalid client …" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("is accepted by POST /api/settings/test", async () => {
    const res = await testRoute(new Request("http://localhost/api/settings/test?provider=brandfetch", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, detail: "Aucune clé configurée" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/settings/brandfetch-settings.test.ts`
Expected: FAIL (`SECRET_KEYS` does not contain `brandfetchApiKey`; `setSetting("brandfetchApiKey", …)` is also a type error for `tsc`).

- [ ] **Step 3: Add the setting**

Create `src/lib/user-agent.ts`:

```ts
/** Identifies ThumbGen to public APIs that ask for it (Wikimedia, SVGL, Brandfetch). */
export const THUMBGEN_USER_AGENT = "ThumbGen/1.0 (+https://github.com/ohvignas/ThumbGen)";
```

In `src/lib/settings-schema.ts`, replace:

```ts
export const SECRET_KEYS = ["openrouterApiKey", "openaiApiKey", "youtubeApiKey", "mcpApiKey"] as const;
```

with:

```ts
export const SECRET_KEYS = ["openrouterApiKey", "openaiApiKey", "youtubeApiKey", "mcpApiKey", "brandfetchApiKey"] as const;
```

Replace:

```ts
  youtubeApiKey: "YOUTUBE_API_KEY",
  mcpApiKey: "MCP_API_KEY",
};
```

with:

```ts
  youtubeApiKey: "YOUTUBE_API_KEY",
  mcpApiKey: "MCP_API_KEY",
  brandfetchApiKey: "BRANDFETCH_API_KEY",
};
```

In `SettingsSchema`, replace:

```ts
  mcpApiKey: secret(),
```

with:

```ts
  mcpApiKey: secret(),
  // Brandfetch « Client ID » (sent as ?c=), optional: adds Brandfetch to the logo search.
  brandfetchApiKey: secret(),
```

- [ ] **Step 4: Add the connection test**

In `src/lib/connection-tests.ts`, replace:

```ts
import { getTypedSettings } from "@/lib/settings";

export const TESTABLE_PROVIDERS = ["openrouter", "openai", "youtube"] as const;
```

with:

```ts
import { getTypedSettings } from "@/lib/settings";
import { THUMBGEN_USER_AGENT } from "@/lib/user-agent";

export const TESTABLE_PROVIDERS = ["openrouter", "openai", "youtube", "brandfetch"] as const;
```

Replace:

```ts
const KEY_FOR: Record<TestableProvider, "openrouterApiKey" | "openaiApiKey" | "youtubeApiKey"> = {
  openrouter: "openrouterApiKey",
  openai: "openaiApiKey",
  youtube: "youtubeApiKey",
};
```

with:

```ts
const KEY_FOR: Record<TestableProvider, "openrouterApiKey" | "openaiApiKey" | "youtubeApiKey" | "brandfetchApiKey"> = {
  openrouter: "openrouterApiKey",
  openai: "openaiApiKey",
  youtube: "youtubeApiKey",
  brandfetch: "brandfetchApiKey",
};
```

Right after the `testYouTube` function, add:

```ts
async function testBrandfetch(clientId: string, signal: AbortSignal): Promise<ConnectionTestResult> {
  const c = encodeURIComponent(clientId);
  const search = await fetch(`https://api.brandfetch.io/v2/search/brandfetch?c=${c}`, {
    headers: { "User-Agent": THUMBGEN_USER_AGENT },
    signal,
  });
  if (!search.ok) return failure(search, clientId);
  // The search endpoint also answers unknown client IDs (checked 2026-09-16);
  // the logo CDN verifies the ID's signature, so one small icon tells them apart.
  const logo = await fetch(`https://cdn.brandfetch.io/brandfetch.com/w/64/fallback/404/icon.png?c=${c}`, {
    headers: { "User-Agent": THUMBGEN_USER_AGENT },
    redirect: "manual",
    signal,
  });
  if (logo.status === 200) return { ok: true, detail: "Clé valide · recherche et logos disponibles" };
  const reason = logo.headers.get("x-bf-error");
  if (reason === "automated_traffic") {
    return {
      ok: false,
      detail:
        "Recherche disponible, mais Brandfetch refuse l'accès serveur aux logos (automated_traffic) : les logos Brandfetch enregistrés ne pourront pas s'afficher.",
    };
  }
  if (reason) return { ok: false, detail: `Clé refusée par Brandfetch (${reason})` };
  return { ok: false, detail: `Logos Brandfetch : HTTP ${logo.status}` };
}
```

In `testProviderKey`, replace:

```ts
    if (provider === "openai") return await testOpenAi(apiKey, signal);
    return await testYouTube(apiKey, signal);
```

with:

```ts
    if (provider === "openai") return await testOpenAi(apiKey, signal);
    if (provider === "youtube") return await testYouTube(apiKey, signal);
    return await testBrandfetch(apiKey, signal);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/settings/brandfetch-settings.test.ts tests/settings/connection-tests.test.ts tests/settings/settings.test.ts tests/settings/settings-route.test.ts`
Expected: PASS (all).

- [ ] **Step 6: Show the card in Réglages → Connexions**

In `src/components/settings/SecretKeyCard.tsx`, replace:

```ts
export type ProviderKeyConfig = {
  key: "openrouterApiKey" | "openaiApiKey" | "youtubeApiKey";
  provider: TestableProvider;
  title: string;
  usage: string;
  placeholder: string;
  helpHref: string;
};
```

with:

```ts
export type ProviderKeyConfig = {
  key: "openrouterApiKey" | "openaiApiKey" | "youtubeApiKey" | "brandfetchApiKey";
  provider: TestableProvider;
  title: string;
  usage: string;
  placeholder: string;
  helpHref: string;
  /** Text of the help link, « Obtenir une clé » when absent. */
  helpLabel?: string;
};
```

and replace the link text:

```tsx
              Obtenir une clé
            </a>
```

with:

```tsx
              {config.helpLabel ?? "Obtenir une clé"}
            </a>
```

In `src/components/settings/ConnexionsSection.tsx`, replace:

```ts
    helpHref: "https://console.cloud.google.com/apis/credentials",
  },
];
```

with:

```ts
    helpHref: "https://console.cloud.google.com/apis/credentials",
  },
  {
    key: "brandfetchApiKey",
    provider: "brandfetch",
    title: "Brandfetch",
    usage:
      "Optionnelle. Ajoute les logos Brandfetch à la recherche de la Bibliothèque : colle le « Client ID » de ton compte développeur gratuit. Sans clé, la recherche utilise Simple Icons, SVGL et Wikimedia.",
    placeholder: "Client ID",
    helpHref: "https://developers.brandfetch.com/register",
    helpLabel: "Obtenir une clé gratuite",
  },
];
```

- [ ] **Step 7: Type-check, lint, full suite**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/lib/user-agent.ts src/lib/settings-schema.ts src/lib/connection-tests.ts src/components/settings/SecretKeyCard.tsx src/components/settings/ConnexionsSection.tsx tests/settings/brandfetch-settings.test.ts
./node_modules/.bin/vitest run
```

Expected: `tsc` exits 0, no eslint error, all tests pass.

- [ ] **Step 8: Check in the browser (throwaway dev server, port 3100)**

Start the dev server (Global Constraints). Open `http://localhost:3100/reglages/connexions`:
- A « Brandfetch » card follows « YouTube Data API », red badge « Non configurée », placeholder « Client ID », link « Obtenir une clé gratuite » → `developers.brandfetch.com/register` in a new tab; « Tester » disabled.
- Type `test-client-id` → « Enregistrer » → the badge shows the masked preview; « Tester » → an alert « Clé refusée par Brandfetch (client_id_invalid_signature) » (a fake ID; free call). « Supprimer la clé » → confirm → back to unconfigured. Stop the dev server.

- [ ] **Step 9: Commit**

```bash
git add src/lib/user-agent.ts src/lib/settings-schema.ts src/lib/connection-tests.ts src/components/settings/SecretKeyCard.tsx src/components/settings/ConnexionsSection.tsx tests/settings/brandfetch-settings.test.ts
git commit -m "feat(settings): optional Brandfetch client ID with a connection test" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Remote logos — `logos.remote_url`, one loader for the image route and the agent

**Files:**
- Create: `src/lib/logos/logo-image.ts`
- Modify: `src/lib/db.ts`
- Modify: `src/app/api/logos/image/route.ts` (rewrite)
- Modify: `src/app/api/logos/route.ts` (`GET` only)
- Modify: `src/lib/agent/tools/_helpers/image-source.ts`
- Modify: `src/lib/agent/tools/list-logos.ts`
- Test: `tests/logos/logos-remote-url-migration.test.ts`
- Test: `tests/logos/remote-logos.test.ts`

**Interfaces:**
- Consumes: `getTypedSettings().brandfetchApiKey` (Task 4), `THUMBGEN_USER_AGENT` (Task 4).
- Produces:
  - `src/lib/db.ts`: `ensureLogosRemoteUrlColumn(database: Database.Database): void` (idempotent, called by `init()`); column `logos.remote_url TEXT` (null = stored file).
  - `src/lib/logos/logo-image.ts`: `type LogoImage = { mimeType: string; bytes: Buffer; remote: boolean }`, `loadLogoImage(id: string): Promise<LogoImage | null>` — stored row → its bytes; remote row → `fetch(remote_url + "?c=" + clientId, { redirect: "manual" })`, never stored; null when unknown, no key, refused, not an image, empty, > 5 MB or network error.
  - `GET /api/logos/image?f=<id>` → 200 image (`Cache-Control: private, max-age=300` for remote, `public, max-age=31536000, immutable` for stored), `404 { error: "Logo indisponible" }`, `400` without `f`.
  - `GET /api/logos` rows: `{ filename: string; label: string; size: number; remote: boolean }` (= `LibraryLogo`, Task 1).
  - `resolveImageSource("stored:lg_<id>")` works for remote logos; `list_logos` line for a remote logo: ``- stored:lg_<id> — "<label>" (Brandfetch logo, fetched when used, added <created_at>)``.
  - Remote row shape used by Task 7: `INSERT INTO logos (id, label, mime_type, size, data, remote_url) VALUES (?, ?, 'image/png', 0, <empty BLOB>, ?)`.

- [ ] **Step 1: Write the failing migration test**

Create `tests/logos/logos-remote-url-migration.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { ensureLogosRemoteUrlColumn, getDb } from "@/lib/db";

const LOGOS_TABLE_BEFORE = `CREATE TABLE logos (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL DEFAULT 'Logo',
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  data BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

function columns(database: Database.Database): string[] {
  return (database.prepare("PRAGMA table_info(logos)").all() as { name: string }[]).map((column) => column.name);
}

describe("ensureLogosRemoteUrlColumn", () => {
  it("adds a nullable remote_url to a logos table created before it, keeping the rows", () => {
    const database = new Database(":memory:");
    database.exec(LOGOS_TABLE_BEFORE);
    database.prepare("INSERT INTO logos (id, label, mime_type, size, data) VALUES (?, ?, ?, ?, ?)").run("old", "Ancien", "image/png", 1, Buffer.from([1]));

    ensureLogosRemoteUrlColumn(database);

    expect(columns(database)).toContain("remote_url");
    expect(database.prepare("SELECT label, remote_url FROM logos WHERE id = 'old'").get()).toEqual({ label: "Ancien", remote_url: null });
    database.close();
  });

  it("is idempotent", () => {
    const database = new Database(":memory:");
    database.exec(LOGOS_TABLE_BEFORE);
    ensureLogosRemoteUrlColumn(database);
    ensureLogosRemoteUrlColumn(database);
    expect(columns(database).filter((name) => name === "remote_url")).toHaveLength(1);
    database.close();
  });

  it("already ran on the app database", () => {
    expect(columns(getDb())).toContain("remote_url");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/logos/logos-remote-url-migration.test.ts`
Expected: FAIL — `ensureLogosRemoteUrlColumn` is not exported (`is not a function`).

- [ ] **Step 3: Add the migration**

In `src/lib/db.ts`, replace:

```ts
  if (!projectMetaColumns.some((c) => c.name === "description")) {
    database.exec("ALTER TABLE projects_meta ADD COLUMN description TEXT NOT NULL DEFAULT ''");
  }

  pruneRemovedSettingsKeys(database);
}
```

with:

```ts
  if (!projectMetaColumns.some((c) => c.name === "description")) {
    database.exec("ALTER TABLE projects_meta ADD COLUMN description TEXT NOT NULL DEFAULT ''");
  }

  ensureLogosRemoteUrlColumn(database);
  pruneRemovedSettingsKeys(database);
}

/**
 * Brandfetch does not allow storing its logos: such a logo is saved as a
 * remote reference, `remote_url` holding its CDN address (without the client
 * ID) and `data` staying an empty BLOB (the column is NOT NULL). Null for
 * every stored file. Idempotent — runs on every startup.
 */
export function ensureLogosRemoteUrlColumn(database: Database.Database): void {
  const columns = database.prepare("PRAGMA table_info(logos)").all() as { name: string }[];
  if (!columns.some((column) => column.name === "remote_url")) {
    database.exec("ALTER TABLE logos ADD COLUMN remote_url TEXT");
  }
}
```

Run: `./node_modules/.bin/vitest run tests/logos/logos-remote-url-migration.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 4: Write the failing remote logo tests**

Create `tests/logos/remote-logos.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import { loadLogoImage } from "@/lib/logos/logo-image";
import { GET as logoImage } from "@/app/api/logos/image/route";
import { GET as listLogos } from "@/app/api/logos/route";
import { resolveImageSource } from "@/lib/agent/tools/_helpers/image-source";
import { listLogosTool } from "@/lib/agent/tools/list-logos";

const CLIENT_ID = "bf-client-1234";
const REMOTE_URL = "https://cdn.brandfetch.io/id_0dwKPKT/w/1024/fallback/404/icon.png";
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZkqfO0AAAAASUVORK5CYII=",
  "base64",
);
const fetchMock = vi.fn<typeof fetch>();
let savedEnv: string | undefined;

function insertStored(label = "Stocké"): string {
  const id = uuid();
  getDb()
    .prepare("INSERT INTO logos (id, label, mime_type, size, data) VALUES (?, ?, ?, ?, ?)")
    .run(id, label, "image/png", PNG_BYTES.length, PNG_BYTES);
  return id;
}

function insertRemote(label = "Nike"): string {
  const id = uuid();
  getDb()
    .prepare("INSERT INTO logos (id, label, mime_type, size, data, remote_url) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, label, "image/png", 0, Buffer.alloc(0), REMOTE_URL);
  return id;
}

const imageResponse = () =>
  new Response(new Uint8Array(PNG_BYTES), { status: 200, headers: { "content-type": "image/png" } });

const getImage = (f: string) => logoImage(new Request(`http://localhost/api/logos/image?f=${encodeURIComponent(f)}`));

beforeEach(() => {
  getDb().exec("DELETE FROM logos; DELETE FROM settings;");
  savedEnv = process.env.BRANDFETCH_API_KEY;
  delete process.env.BRANDFETCH_API_KEY;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (savedEnv === undefined) delete process.env.BRANDFETCH_API_KEY;
  else process.env.BRANDFETCH_API_KEY = savedEnv;
});

describe("GET /api/logos/image", () => {
  it("serves a stored logo from the database without any request", async () => {
    const id = insertStored();
    const res = await getImage(id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG_BYTES)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches a Brandfetch logo with the saved client ID and stores nothing", async () => {
    setSetting("brandfetchApiKey", CLIENT_ID);
    const id = insertRemote();
    fetchMock.mockResolvedValue(imageResponse());

    const res = await getImage(id);

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, max-age=300");
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG_BYTES)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${REMOTE_URL}?c=${CLIENT_ID}`);
    expect(init?.redirect).toBe("manual");
    expect((init?.headers as Record<string, string>)["User-Agent"]).toMatch(/^ThumbGen\//);
    const row = getDb().prepare("SELECT size, data FROM logos WHERE id = ?").get(id) as { size: number; data: Buffer };
    expect(row.size).toBe(0);
    expect(row.data.length).toBe(0);
  });

  it("answers 404 without a client ID and does not call Brandfetch", async () => {
    const id = insertRemote();
    const res = await getImage(id);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Logo indisponible" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 404 when Brandfetch refuses the request", async () => {
    setSetting("brandfetchApiKey", CLIENT_ID);
    const id = insertRemote();
    fetchMock.mockResolvedValue(
      new Response(null, { status: 302, headers: { "x-bf-error": "automated_traffic", location: "https://brandfetch.com/developers" } }),
    );
    expect((await getImage(id)).status).toBe(404);
  });

  it("answers 404 when the CDN does not send an image or the network fails", async () => {
    setSetting("brandfetchApiKey", CLIENT_ID);
    const id = insertRemote();
    fetchMock.mockResolvedValueOnce(new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }));
    expect((await getImage(id)).status).toBe(404);
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await loadLogoImage(id)).toBeNull();
  });

  it("answers 404 for an unknown logo and 400 without a name", async () => {
    expect((await getImage("inconnu")).status).toBe(404);
    expect((await logoImage(new Request("http://localhost/api/logos/image"))).status).toBe(400);
  });
});

describe("remote logos elsewhere", () => {
  it("GET /api/logos flags remote logos", async () => {
    const stored = insertStored("Stocké");
    const remote = insertRemote("Nike");
    const rows = (await (await listLogos()).json()) as { filename: string; label: string; size: number; remote: boolean }[];
    expect(rows.find((row) => row.filename === stored)).toEqual({ filename: stored, label: "Stocké", size: PNG_BYTES.length, remote: false });
    expect(rows.find((row) => row.filename === remote)).toEqual({ filename: remote, label: "Nike", size: 0, remote: true });
  });

  it("resolveImageSource fetches a remote logo for the agent", async () => {
    setSetting("brandfetchApiKey", CLIENT_ID);
    const id = insertRemote();
    fetchMock.mockResolvedValue(imageResponse());
    const resolved = await resolveImageSource(`stored:lg_${id}`);
    expect(resolved.mimeType).toBe("image/png");
    expect(resolved.bytes.equals(PNG_BYTES)).toBe(true);
  });

  it("resolveImageSource rejects a remote logo that cannot be fetched", async () => {
    const id = insertRemote();
    await expect(resolveImageSource(`stored:lg_${id}`)).rejects.toThrow(`Image not found: stored:lg_${id}`);
  });

  it("list_logos keeps the stored: reference and says the logo is remote", async () => {
    const stored = insertStored("Stocké");
    const remote = insertRemote("Nike");
    const text = ((await listLogosTool.handler({})).content[0] as { text: string }).text;
    expect(text).toContain(`- stored:lg_${remote} — "Nike" (Brandfetch logo, fetched when used, added `);
    expect(text).toContain(`- stored:lg_${stored} — "Stocké" (${PNG_BYTES.length} bytes, added `);
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/logos/remote-logos.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/logos/logo-image"`.

- [ ] **Step 6: Write the loader and the route**

Create `src/lib/logos/logo-image.ts`:

```ts
import { getDb } from "@/lib/db";
import { getTypedSettings } from "@/lib/settings";
import { THUMBGEN_USER_AGENT } from "@/lib/user-agent";

export type LogoImage = { mimeType: string; bytes: Buffer; remote: boolean };

const REMOTE_TIMEOUT_MS = 10_000;
const MAX_REMOTE_BYTES = 5 * 1024 * 1024;

type LogoRow = { mime_type: string; data: Buffer; remote_url: string | null };

/**
 * A logo's image: the stored bytes, or — for a Brandfetch remote reference —
 * the image fetched now with the saved client ID and never stored.
 * Null when the logo is unknown or its remote image is unavailable.
 */
export async function loadLogoImage(id: string): Promise<LogoImage | null> {
  const row = getDb().prepare("SELECT mime_type, data, remote_url FROM logos WHERE id = ?").get(id) as
    | LogoRow
    | undefined;
  if (!row) return null;
  if (!row.remote_url) return { mimeType: row.mime_type, bytes: row.data, remote: false };

  const clientId = getTypedSettings().brandfetchApiKey;
  if (!clientId) return null;
  try {
    const separator = row.remote_url.includes("?") ? "&" : "?";
    const res = await fetch(`${row.remote_url}${separator}c=${encodeURIComponent(clientId)}`, {
      headers: { "User-Agent": THUMBGEN_USER_AGENT },
      // A refusal from Brandfetch is a redirect (x-bf-error): never follow it.
      redirect: "manual",
      signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
    });
    if (res.status !== 200) return null;
    const mimeType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!mimeType.startsWith("image/")) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_REMOTE_BYTES) return null;
    return { mimeType, bytes, remote: true };
  } catch {
    return null;
  }
}
```

Replace the whole content of `src/app/api/logos/image/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { loadLogoImage } from "@/lib/logos/logo-image";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const f = new URL(request.url).searchParams.get("f");
  if (!f) return NextResponse.json({ error: "Missing filename" }, { status: 400 });

  const image = await loadLogoImage(f.split(".")[0]);
  if (!image) return NextResponse.json({ error: "Logo indisponible" }, { status: 404 });

  return new NextResponse(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": image.mimeType,
      "X-Content-Type-Options": "nosniff",
      // A remote (Brandfetch) logo is fetched on each use and must not be kept.
      "Cache-Control": image.remote ? "private, max-age=300" : "public, max-age=31536000, immutable",
    },
  });
}
```

In `src/app/api/logos/route.ts`, replace the `GET` function:

```ts
export async function GET() {
  const rows = getDb()
    .prepare("SELECT id, label, size FROM logos ORDER BY created_at ASC")
    .all() as { id: string; label: string; size: number }[];
  return NextResponse.json(rows.map((r) => ({ filename: r.id, label: r.label, size: r.size })));
}
```

with:

```ts
export async function GET() {
  const rows = getDb()
    .prepare("SELECT id, label, size, remote_url FROM logos ORDER BY created_at ASC")
    .all() as { id: string; label: string; size: number; remote_url: string | null }[];
  return NextResponse.json(
    rows.map((r) => ({ filename: r.id, label: r.label, size: r.size, remote: r.remote_url !== null })),
  );
}
```

- [ ] **Step 7: Route the agent's logo reads through the loader**

In `src/lib/agent/tools/_helpers/image-source.ts`, replace:

```ts
import { getDb } from "@/lib/db";
```

with:

```ts
import { getDb } from "@/lib/db";
import { loadLogoImage } from "@/lib/logos/logo-image";
```

and, inside `resolveImageSource`, replace:

```ts
    const [, prefix, id] = m as [string, StoredPrefix, string];
    const table = TABLE_BY_PREFIX[prefix];
    const row = getDb()
      .prepare(`SELECT mime_type, data FROM ${table} WHERE id = ?`)
      .get(id) as { mime_type: string; data: Buffer } | undefined;
    if (!row) throw new Error(`Image not found: ${source}`);
    return { mimeType: row.mime_type, bytes: row.data };
```

with:

```ts
    const [, prefix, id] = m as [string, StoredPrefix, string];
    if (prefix === "lg") {
      // Same loader as GET /api/logos/image: a Brandfetch logo is a remote
      // reference with no stored bytes.
      const logo = await loadLogoImage(id);
      if (!logo) throw new Error(`Image not found: ${source}`);
      return { mimeType: logo.mimeType, bytes: logo.bytes };
    }
    const table = TABLE_BY_PREFIX[prefix];
    const row = getDb()
      .prepare(`SELECT mime_type, data FROM ${table} WHERE id = ?`)
      .get(id) as { mime_type: string; data: Buffer } | undefined;
    if (!row) throw new Error(`Image not found: ${source}`);
    return { mimeType: row.mime_type, bytes: row.data };
```

(`imageExists` stays row-based: a remote logo row exists.)

In `src/lib/agent/tools/list-logos.ts`, replace:

```ts
    const rows = getDb()
      .prepare("SELECT id, label, size, created_at FROM logos ORDER BY created_at DESC")
      .all() as { id: string; label: string; size: number; created_at: string }[];
```

with:

```ts
    const rows = getDb()
      .prepare("SELECT id, label, size, created_at, remote_url FROM logos ORDER BY created_at DESC")
      .all() as { id: string; label: string; size: number; created_at: string; remote_url: string | null }[];
```

and replace:

```ts
    const lines = rows.map(
      (r) => `- stored:lg_${r.id} — "${r.label}" (${r.size} bytes, added ${r.created_at})`
    );
```

with:

```ts
    const lines = rows.map((r) =>
      r.remote_url
        ? `- stored:lg_${r.id} — "${r.label}" (Brandfetch logo, fetched when used, added ${r.created_at})`
        : `- stored:lg_${r.id} — "${r.label}" (${r.size} bytes, added ${r.created_at})`,
    );
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/logos tests/agent/list-logos.test.ts tests/agent/image-source.test.ts`
Expected: PASS (all).

- [ ] **Step 9: Type-check, lint, full suite, commit**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/lib/db.ts src/lib/logos/logo-image.ts src/app/api/logos/image/route.ts src/app/api/logos/route.ts src/lib/agent/tools/_helpers/image-source.ts src/lib/agent/tools/list-logos.ts tests/logos/logos-remote-url-migration.test.ts tests/logos/remote-logos.test.ts
./node_modules/.bin/vitest run
git add src/lib/db.ts src/lib/logos/logo-image.ts src/app/api/logos/image/route.ts src/app/api/logos/route.ts src/lib/agent/tools/_helpers/image-source.ts src/lib/agent/tools/list-logos.ts tests/logos/logos-remote-url-migration.test.ts tests/logos/remote-logos.test.ts
git commit -m "feat(logos): remote Brandfetch references served on the fly by the image route and the agent" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Expected: `tsc` exits 0, no eslint error, all tests pass.

---

## Task 6: Logo search — four sources, merge with timeout, `GET /api/logos/search`

**Files:**
- Modify: `package.json`, `package-lock.json` (add `simple-icons@16.31.0`)
- Create: `src/lib/logos/shared.ts`
- Create: `src/lib/logos/providers/simple-icons.ts`
- Create: `src/lib/logos/providers/svgl.ts`
- Create: `src/lib/logos/providers/wikimedia.ts`
- Create: `src/lib/logos/providers/brandfetch.ts`
- Create: `src/lib/logos/search.ts`
- Create: `src/app/api/logos/search/route.ts`
- Test: `tests/logos/logo-search-providers.test.ts`
- Test: `tests/logos/logo-search.test.ts`

**Interfaces:**
- Consumes: `normalizeSearchText` (Task 1), `THUMBGEN_USER_AGENT` and `getTypedSettings().brandfetchApiKey` (Task 4).
- Produces:
  - `src/lib/logos/shared.ts` (client-safe): `LOGO_SOURCES = ["simple-icons", "svgl", "brandfetch", "wikimedia"] as const`, `type LogoSource`, `isLogoSource(value: unknown): value is LogoSource`, `LOGO_SOURCE_LABELS: Record<LogoSource, string>`, `type LogoVariant = "light" | "dark" | "color"`, `LOGO_VARIANT_LABELS: Record<LogoVariant, string>`, `LOGO_SEARCH_MIN_CHARS = 2`, `SEARCH_UNAVAILABLE_MESSAGE = "Recherche indisponible, importe une image"`, `type LogoSearchResult = { key: string; source: LogoSource; name: string; detail: string | null; variant: LogoVariant | null; previewUrl: string; ref: string }`, `type LogoSearchResponse = { results: LogoSearchResult[]; queried: LogoSource[]; unavailable: LogoSource[] }`, `type AddedLogo = { filename: string; label: string; remote: boolean }`, `unavailableNotice(unavailable: readonly LogoSource[]): string | null`, `searchEmptyMessage(response: LogoSearchResponse, query: string): string | null`.
  - `providers/simple-icons.ts`: `SIMPLE_ICONS_LIMIT = 8`, `searchSimpleIcons(query: string, limit?: number): LogoSearchResult[]`, `simpleIconSvg(slug: string): string | null` (brand-coloured SVG).
  - `providers/svgl.ts`: `SVGL_LIMIT = 8`, `SVGL_CACHE_TTL_MS = 300_000`, `isSvglAssetUrl(url: string): boolean`, `clearSvglCache(): void`, `searchSvgl(query: string, signal: AbortSignal, now?: number): Promise<LogoSearchResult[]>`.
  - `providers/wikimedia.ts`: `WIKIMEDIA_LIMIT = 8`, `isCommonsFileUrl(url: string): boolean`, `commonsSearchUrl(query: string): string`, `searchWikimedia(query: string, signal: AbortSignal): Promise<LogoSearchResult[]>`.
  - `providers/brandfetch.ts`: `BRANDFETCH_LIMIT = 6`, `isBrandfetchBrandId(value: string): boolean`, `brandfetchLogoUrl(brandId: string): string` (= `https://cdn.brandfetch.io/<brandId>/w/1024/fallback/404/icon.png`), `searchBrandfetch(query: string, clientId: string, signal: AbortSignal): Promise<LogoSearchResult[]>`.
  - `search.ts`: `LOGO_SEARCH_TIMEOUT_MS = 4_000`, `type LogoProvider = { source: LogoSource; search: (query: string, signal: AbortSignal) => Promise<LogoSearchResult[]> }`, `defaultLogoProviders(brandfetchClientId?: string): LogoProvider[]`, `searchLogos(query: string, options: { providers: LogoProvider[]; timeoutMs?: number }): Promise<LogoSearchResponse>`.
  - `GET /api/logos/search?q=` → `200 LogoSearchResponse`; `400 { error }` when `q` is shorter than 2 or longer than 100 characters.
  - Result `ref` per source (what Task 7 re-downloads): Simple Icons slug, SVGL asset URL, Wikimedia original file URL (no query string), Brandfetch `brandId`.

- [ ] **Step 1: Install simple-icons and check its export shape**

```bash
npm install --save-exact simple-icons@16.31.0
grep -n '"simple-icons"' package.json
sed -n '/export type SimpleIcon/,/};/p' node_modules/simple-icons/types.d.ts
grep -n '"./icons.json"' -A 6 node_modules/simple-icons/package.json
grep -o '"title":"X","slug":"x"[^}]*}' node_modules/simple-icons/data/simple-icons.json
```

Expected: `"simple-icons": "16.31.0"`; `SimpleIcon` = `title`, `slug`, `svg`, `path`, `source`, `hex`, `guidelines?`, `license?` (no aliases); the `./icons.json` export maps to `./data/simple-icons.json`; the X entry contains `"aliases":{"aka":["Twitter"]}`. If any differs, adapt `providers/simple-icons.ts` below to what is installed and say so in the report.

- [ ] **Step 2: Write the failing provider tests**

Create `tests/logos/logo-search-providers.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { searchSimpleIcons, simpleIconSvg } from "@/lib/logos/providers/simple-icons";
import { SVGL_CACHE_TTL_MS, clearSvglCache, isSvglAssetUrl, searchSvgl } from "@/lib/logos/providers/svgl";
import { commonsSearchUrl, isCommonsFileUrl, searchWikimedia } from "@/lib/logos/providers/wikimedia";
import { brandfetchLogoUrl, isBrandfetchBrandId, searchBrandfetch } from "@/lib/logos/providers/brandfetch";

const fetchMock = vi.fn<typeof fetch>();
const signal = new AbortController().signal;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  clearSvglCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Simple Icons (local package)", () => {
  it("finds a brand by title, coloured, without any request", () => {
    const [first] = searchSimpleIcons("nike");
    expect(first).toMatchObject({
      key: "simple-icons:nike",
      source: "simple-icons",
      name: "Nike",
      detail: null,
      variant: "color",
      ref: "nike",
    });
    expect(first.previewUrl.startsWith("data:image/svg+xml;base64,")).toBe(true);
    const svg = Buffer.from(first.previewUrl.split(",")[1], "base64").toString("utf8");
    expect(svg).toContain('fill="#111111"');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("finds a brand by alias", () => {
    expect(searchSimpleIcons("twitter").map((result) => result.ref)).toContain("x");
  });

  it("ranks the exact title first, ignores case and accents, caps the list", () => {
    expect(searchSimpleIcons("YOUTUBE")[0].ref).toBe("youtube");
    expect(searchSimpleIcons("Nîke")[0].ref).toBe("nike");
    expect(searchSimpleIcons("go").length).toBeLessThanOrEqual(8);
    expect(searchSimpleIcons("   ")).toEqual([]);
  });

  it("gives the brand-coloured SVG of a slug", () => {
    expect(simpleIconSvg("youtube")).toContain('fill="#FF0000"');
    expect(simpleIconSvg("does-not-exist")).toBeNull();
  });
});

describe("SVGL", () => {
  it("maps plain routes, light/dark routes and wordmarks", async () => {
    fetchMock.mockResolvedValue(
      json([
        { id: 416, title: "Notion", category: "Software", route: "https://svgl.app/library/notion.svg", url: "https://notion.so/" },
        {
          id: 555,
          title: "Vercel",
          category: ["Hosting", "Vercel"],
          route: { light: "https://svgl.app/library/vercel.svg", dark: "https://svgl.app/library/vercel_dark.svg" },
          wordmark: { light: "https://svgl.app/library/vercel_wordmark.svg", dark: "https://svgl.app/library/vercel_wordmark_dark.svg" },
          url: "https://vercel.com/",
        },
      ]),
    );

    const results = await searchSvgl("ver", signal);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.svgl.app?search=ver");
    expect((init?.headers as Record<string, string>)["User-Agent"]).toMatch(/^ThumbGen\//);
    expect(results.map((result) => [result.name, result.variant, result.ref])).toEqual([
      ["Notion", null, "https://svgl.app/library/notion.svg"],
      ["Vercel", "light", "https://svgl.app/library/vercel.svg"],
      ["Vercel", "dark", "https://svgl.app/library/vercel_dark.svg"],
      ["Vercel (logo texte)", "light", "https://svgl.app/library/vercel_wordmark.svg"],
      ["Vercel (logo texte)", "dark", "https://svgl.app/library/vercel_wordmark_dark.svg"],
    ]);
    expect(results[0]).toEqual({
      key: "svgl:https://svgl.app/library/notion.svg",
      source: "svgl",
      name: "Notion",
      detail: null,
      variant: null,
      previewUrl: "https://svgl.app/library/notion.svg",
      ref: "https://svgl.app/library/notion.svg",
    });
  });

  it("treats SVGL's 404 « SVG not found » as no result", async () => {
    fetchMock.mockResolvedValue(json({ error: "❌ (SVGL - API) SVG not found" }, 404));
    expect(await searchSvgl("zzzz", signal)).toEqual([]);
  });

  it("throws on other errors so the source is reported unavailable", async () => {
    fetchMock.mockResolvedValue(json({ error: "boom" }, 500));
    await expect(searchSvgl("nike", signal)).rejects.toThrow("SVGL HTTP 500");
  });

  it("caches answers for a few minutes per normalised query", async () => {
    fetchMock.mockImplementation(async () =>
      json([{ id: 416, title: "Notion", route: "https://svgl.app/library/notion.svg" }]),
    );
    await searchSvgl("Notion", signal, 1_000);
    await searchSvgl("notion", signal, 1_000 + SVGL_CACHE_TTL_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await searchSvgl("notion", signal, 1_000 + SVGL_CACHE_TTL_MS + 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores assets outside svgl.app", async () => {
    fetchMock.mockResolvedValue(json([{ id: 1, title: "Piège", route: "https://evil.example/logo.svg" }]));
    expect(await searchSvgl("piege", signal)).toEqual([]);
    expect(isSvglAssetUrl("https://svgl.app/library/notion.svg")).toBe(true);
    expect(isSvglAssetUrl("https://svgl.app.evil.example/notion.svg")).toBe(false);
    expect(isSvglAssetUrl("https://svgl.app/library/notion.png")).toBe(false);
  });
});

describe("Wikimedia Commons", () => {
  it("builds the Commons file search", () => {
    const url = new URL(commonsSearchUrl('ni"ke'));
    expect(`${url.origin}${url.pathname}`).toBe("https://commons.wikimedia.org/w/api.php");
    expect(url.searchParams.get("gsrsearch")).toBe('intitle:"nike" intitle:logo');
    expect(url.searchParams.get("generator")).toBe("search");
    expect(url.searchParams.get("gsrnamespace")).toBe("6");
    expect(url.searchParams.get("prop")).toBe("imageinfo");
    expect(url.searchParams.get("iiprop")).toBe("url|mime");
    expect(url.searchParams.get("iiurlwidth")).toBe("256");
    expect(url.searchParams.get("formatversion")).toBe("2");
  });

  it("keeps SVG and PNG files in search order, with clean names and original URLs", async () => {
    fetchMock.mockResolvedValue(
      json({
        batchcomplete: true,
        query: {
          pages: [
            {
              pageid: 3,
              ns: 6,
              title: "File:Logo nike principal.jpg",
              index: 2,
              imageinfo: [{ url: "https://upload.wikimedia.org/wikipedia/commons/3/36/Logo_nike_principal.jpg?utm_source=commons.wikimedia.org", thumburl: "https://upload.wikimedia.org/wikipedia/commons/3/36/Logo_nike_principal.jpg", mime: "image/jpeg" }],
            },
            {
              pageid: 2,
              ns: 6,
              title: "File:Niké logo.png",
              index: 3,
              imageinfo: [{ url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Nik%C3%A9_logo.png?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original", thumburl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Nik%C3%A9_logo.png/330px-Nik%C3%A9_logo.png", mime: "image/png" }],
            },
            {
              pageid: 1,
              ns: 6,
              title: "File:Logo NIKE.svg",
              index: 1,
              imageinfo: [{ url: "https://upload.wikimedia.org/wikipedia/commons/a/a6/Logo_NIKE.svg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original", thumburl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a6/Logo_NIKE.svg/330px-Logo_NIKE.svg.png", mime: "image/svg+xml" }],
            },
          ],
        },
      }),
    );

    const results = await searchWikimedia("nike", signal);

    expect(results.map((result) => [result.name, result.detail, result.ref])).toEqual([
      ["Logo NIKE", "SVG", "https://upload.wikimedia.org/wikipedia/commons/a/a6/Logo_NIKE.svg"],
      ["Niké logo", "PNG", "https://upload.wikimedia.org/wikipedia/commons/a/ab/Nik%C3%A9_logo.png"],
    ]);
    expect(results[0]).toMatchObject({
      key: "wikimedia:https://upload.wikimedia.org/wikipedia/commons/a/a6/Logo_NIKE.svg",
      source: "wikimedia",
      variant: null,
      previewUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a6/Logo_NIKE.svg/330px-Logo_NIKE.svg.png",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(commonsSearchUrl("nike"));
    expect((init?.headers as Record<string, string>)["User-Agent"]).toMatch(/^ThumbGen\//);
  });

  it("returns nothing when Commons finds nothing, and throws on HTTP errors", async () => {
    fetchMock.mockResolvedValueOnce(json({ batchcomplete: true }));
    expect(await searchWikimedia("zzzz", signal)).toEqual([]);
    fetchMock.mockResolvedValueOnce(json({}, 503));
    await expect(searchWikimedia("nike", signal)).rejects.toThrow("Wikimedia HTTP 503");
  });

  it("accepts only Commons upload URLs of SVG or PNG files", () => {
    expect(isCommonsFileUrl("https://upload.wikimedia.org/wikipedia/commons/a/a6/Logo_NIKE.svg")).toBe(true);
    expect(isCommonsFileUrl("https://upload.wikimedia.org/wikipedia/commons/3/36/Logo.jpg")).toBe(false);
    expect(isCommonsFileUrl("https://upload.wikimedia.org/wikipedia/en/a/a6/Logo.svg")).toBe(false);
    expect(isCommonsFileUrl("https://evil.example/wikipedia/commons/a/a6/Logo.svg")).toBe(false);
  });
});

describe("Brandfetch", () => {
  it("searches by name with the client ID and keeps hotlinkable icons", async () => {
    fetchMock.mockResolvedValue(
      json([
        { brandId: "id_0dwKPKT", claimed: true, domain: "nike.com", name: "Nike", icon: "https://cdn.brandfetch.io/id_0dwKPKT/w/128/h/128/fallback/lettermark/icon.webp?c=1axSIGNED", _score: 98.2, qualityScore: 0.99, verified: true },
        { brandId: "idQiyUiVWb", claimed: false, domain: "nikeplus.com", name: "", icon: "https://cdn.brandfetch.io/idQiyUiVWb/w/128/h/128/fallback/lettermark/icon.webp?c=1axSIGNED" },
        { brandId: "bad id!", domain: "x.com", name: "Bad", icon: "https://cdn.brandfetch.io/x/icon.webp" },
        { brandId: "idNoIcon1", domain: "noicon.com", name: "No icon" },
      ]),
    );

    const results = await searchBrandfetch("nike", "bf-client-1234", signal);

    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.brandfetch.io/v2/search/nike?c=bf-client-1234");
    expect(results).toEqual([
      {
        key: "brandfetch:id_0dwKPKT",
        source: "brandfetch",
        name: "Nike",
        detail: "nike.com",
        variant: null,
        previewUrl: "https://cdn.brandfetch.io/id_0dwKPKT/w/128/h/128/fallback/lettermark/icon.webp?c=1axSIGNED",
        ref: "id_0dwKPKT",
      },
      {
        key: "brandfetch:idQiyUiVWb",
        source: "brandfetch",
        name: "nikeplus.com",
        detail: "nikeplus.com",
        variant: null,
        previewUrl: "https://cdn.brandfetch.io/idQiyUiVWb/w/128/h/128/fallback/lettermark/icon.webp?c=1axSIGNED",
        ref: "idQiyUiVWb",
      },
    ]);
  });

  it("throws on HTTP errors", async () => {
    fetchMock.mockResolvedValue(json({ message: "Unauthorized" }, 401));
    await expect(searchBrandfetch("nike", "bf-client-1234", signal)).rejects.toThrow("Brandfetch HTTP 401");
  });

  it("builds the CDN address of a brand icon without the client ID", () => {
    expect(brandfetchLogoUrl("id_0dwKPKT")).toBe("https://cdn.brandfetch.io/id_0dwKPKT/w/1024/fallback/404/icon.png");
    expect(isBrandfetchBrandId("id_0dwKPKT")).toBe(true);
    expect(isBrandfetchBrandId("../etc")).toBe(false);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `./node_modules/.bin/vitest run tests/logos/logo-search-providers.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/logos/providers/simple-icons"`.

- [ ] **Step 4: Write the shared module and the four providers**

Create `src/lib/logos/shared.ts`:

```ts
/** Logo search types and wording shared by the API and the UI (client-safe). */

/** Also the order of the merged result grid. */
export const LOGO_SOURCES = ["simple-icons", "svgl", "brandfetch", "wikimedia"] as const;

export type LogoSource = (typeof LOGO_SOURCES)[number];

export function isLogoSource(value: unknown): value is LogoSource {
  return typeof value === "string" && (LOGO_SOURCES as readonly string[]).includes(value);
}

export const LOGO_SOURCE_LABELS: Record<LogoSource, string> = {
  "simple-icons": "Simple Icons",
  svgl: "SVGL",
  brandfetch: "Brandfetch",
  wikimedia: "Wikimedia",
};

export type LogoVariant = "light" | "dark" | "color";

export const LOGO_VARIANT_LABELS: Record<LogoVariant, string> = {
  light: "Clair",
  dark: "Sombre",
  color: "Couleur",
};

export const LOGO_SEARCH_MIN_CHARS = 2;

export const SEARCH_UNAVAILABLE_MESSAGE = "Recherche indisponible, importe une image";

/** One search hit. `ref` is what POST /api/logos/add needs to fetch it again. */
export type LogoSearchResult = {
  key: string;
  source: LogoSource;
  name: string;
  detail: string | null;
  variant: LogoVariant | null;
  previewUrl: string;
  ref: string;
};

export type LogoSearchResponse = {
  results: LogoSearchResult[];
  queried: LogoSource[];
  unavailable: LogoSource[];
};

/** Answer of POST /api/logos/add. */
export type AddedLogo = { filename: string; label: string; remote: boolean };

function joinFrench(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

/** « SVGL indisponible », « SVGL et Wikimedia indisponibles »; null when every source answered. */
export function unavailableNotice(unavailable: readonly LogoSource[]): string | null {
  const labels = LOGO_SOURCES.filter((source) => unavailable.includes(source)).map((source) => LOGO_SOURCE_LABELS[source]);
  if (labels.length === 0) return null;
  return `${joinFrench(labels)} ${labels.length > 1 ? "indisponibles" : "indisponible"}`;
}

/** What to show instead of the grid: nothing when there are results. */
export function searchEmptyMessage(response: LogoSearchResponse, query: string): string | null {
  if (response.queried.length > 0 && response.queried.every((source) => response.unavailable.includes(source))) {
    return SEARCH_UNAVAILABLE_MESSAGE;
  }
  if (response.results.length === 0) return `Aucun logo trouvé pour « ${query} ».`;
  return null;
}
```

Create `src/lib/logos/providers/simple-icons.ts`:

```ts
import * as simpleIcons from "simple-icons";
import * as simpleIconsJson from "simple-icons/icons.json";
import type { SimpleIcon } from "simple-icons";
import { normalizeSearchText } from "@/lib/search-text";
import type { LogoSearchResult } from "../shared";

export const SIMPLE_ICONS_LIMIT = 8;

type IconAliases = { aka?: unknown[]; dup?: { title?: unknown }[]; loc?: Record<string, unknown> };
type IconDataEntry = { slug?: unknown; aliases?: IconAliases };
type IndexedIcon = { icon: SimpleIcon; names: string[] };

let iconsBySlug: Map<string, SimpleIcon> | null = null;
let searchIndex: IndexedIcon[] | null = null;

function isSimpleIcon(value: unknown): value is SimpleIcon {
  return (
    typeof value === "object" && value !== null && "slug" in value && "title" in value && "hex" in value && "svg" in value
  );
}

function icons(): Map<string, SimpleIcon> {
  if (!iconsBySlug) {
    iconsBySlug = new Map();
    for (const value of Object.values(simpleIcons) as unknown[]) {
      if (isSimpleIcon(value)) iconsBySlug.set(value.slug, value);
    }
  }
  return iconsBySlug;
}

/** Aliases (aka, duplicates, localised names) by slug — only data/simple-icons.json has them. */
function aliasesBySlug(): Map<string, string[]> {
  // The icons.json export is typed by a .d.ts without a default export; at
  // runtime (Next and Vitest) the JSON array is the module's default.
  const moduleValue = simpleIconsJson as unknown as { default?: unknown };
  const data = Array.isArray(moduleValue) ? moduleValue : moduleValue.default;
  const aliases = new Map<string, string[]>();
  for (const entry of Array.isArray(data) ? (data as IconDataEntry[]) : []) {
    if (typeof entry.slug !== "string" || !entry.aliases) continue;
    const names = [
      ...(entry.aliases.aka ?? []),
      ...(entry.aliases.dup ?? []).map((duplicate) => duplicate.title),
      ...Object.values(entry.aliases.loc ?? {}),
    ].filter((name): name is string => typeof name === "string" && name.length > 0);
    if (names.length > 0) aliases.set(entry.slug, names);
  }
  return aliases;
}

function index(): IndexedIcon[] {
  if (!searchIndex) {
    const aliases = aliasesBySlug();
    searchIndex = [...icons().values()].map((icon) => ({
      icon,
      names: [icon.title, ...(aliases.get(icon.slug) ?? [])].map(normalizeSearchText),
    }));
  }
  return searchIndex;
}

function colouredSvg(icon: SimpleIcon): string {
  return icon.svg.replace("<svg ", `<svg fill="#${icon.hex}" `);
}

/** The brand-coloured SVG of an icon (Simple Icons SVGs have no fill), or null. */
export function simpleIconSvg(slug: string): string | null {
  const icon = icons().get(slug);
  return icon ? colouredSvg(icon) : null;
}

function toResult(icon: SimpleIcon): LogoSearchResult {
  return {
    key: `simple-icons:${icon.slug}`,
    source: "simple-icons",
    name: icon.title,
    detail: null,
    variant: "color",
    previewUrl: `data:image/svg+xml;base64,${Buffer.from(colouredSvg(icon)).toString("base64")}`,
    ref: icon.slug,
  };
}

/** Local search on title, slug and aliases: exact match, then prefix, then substring. No network. */
export function searchSimpleIcons(query: string, limit: number = SIMPLE_ICONS_LIMIT): LogoSearchResult[] {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];
  const compact = normalized.replace(/[^a-z0-9]/g, "");
  const matches: { icon: SimpleIcon; rank: number }[] = [];
  for (const { icon, names } of index()) {
    let rank = -1;
    if (names.includes(normalized) || (compact !== "" && icon.slug === compact)) rank = 0;
    else if (names.some((name) => name.startsWith(normalized)) || (compact !== "" && icon.slug.startsWith(compact))) rank = 1;
    else if (names.some((name) => name.includes(normalized))) rank = 2;
    if (rank >= 0) matches.push({ icon, rank });
  }
  matches.sort((a, b) => a.rank - b.rank || a.icon.title.localeCompare(b.icon.title));
  return matches.slice(0, limit).map(({ icon }) => toResult(icon));
}
```

Create `src/lib/logos/providers/svgl.ts`:

```ts
import { normalizeSearchText } from "@/lib/search-text";
import { THUMBGEN_USER_AGENT } from "@/lib/user-agent";
import type { LogoSearchResult, LogoVariant } from "../shared";

export const SVGL_LIMIT = 8;
/** SVGL asks API clients to cache answers for a few minutes. */
export const SVGL_CACHE_TTL_MS = 5 * 60 * 1000;

const SVGL_ASSET_PATTERN = /^https:\/\/svgl\.app\/[^?#\s]+\.svg$/;

export function isSvglAssetUrl(url: string): boolean {
  return SVGL_ASSET_PATTERN.test(url);
}

const cache = new Map<string, { at: number; results: LogoSearchResult[] }>();

export function clearSvglCache(): void {
  cache.clear();
}

type SvglEntry = { title?: unknown; route?: unknown; wordmark?: unknown };

/** `route` / `wordmark` are one URL, or `{ light, dark }` (light = for light backgrounds). */
function assets(value: unknown): { url: string; variant: LogoVariant | null }[] {
  if (typeof value === "string") return isSvglAssetUrl(value) ? [{ url: value, variant: null }] : [];
  if (typeof value !== "object" || value === null) return [];
  const themed = value as { light?: unknown; dark?: unknown };
  const out: { url: string; variant: LogoVariant | null }[] = [];
  if (typeof themed.light === "string" && isSvglAssetUrl(themed.light)) out.push({ url: themed.light, variant: "light" });
  if (typeof themed.dark === "string" && isSvglAssetUrl(themed.dark)) out.push({ url: themed.dark, variant: "dark" });
  return out;
}

function toResult(name: string, url: string, variant: LogoVariant | null): LogoSearchResult {
  return { key: `svgl:${url}`, source: "svgl", name, detail: null, variant, previewUrl: url, ref: url };
}

export async function searchSvgl(query: string, signal: AbortSignal, now: number = Date.now()): Promise<LogoSearchResult[]> {
  const cacheKey = normalizeSearchText(query);
  const cached = cache.get(cacheKey);
  if (cached && now - cached.at < SVGL_CACHE_TTL_MS) return cached.results;

  const res = await fetch(`https://api.svgl.app?search=${encodeURIComponent(query)}`, {
    headers: { "User-Agent": THUMBGEN_USER_AGENT },
    signal,
  });
  // SVGL answers 404 {"error": "… SVG not found"} when nothing matches.
  if (res.status === 404) {
    cache.set(cacheKey, { at: now, results: [] });
    return [];
  }
  if (!res.ok) throw new Error(`SVGL HTTP ${res.status}`);

  const body = (await res.json()) as unknown;
  const results: LogoSearchResult[] = [];
  for (const entry of Array.isArray(body) ? (body as SvglEntry[]) : []) {
    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    if (!title) continue;
    for (const { url, variant } of assets(entry.route)) results.push(toResult(title, url, variant));
    for (const { url, variant } of assets(entry.wordmark)) results.push(toResult(`${title} (logo texte)`, url, variant));
  }
  const limited = results.slice(0, SVGL_LIMIT);
  cache.set(cacheKey, { at: now, results: limited });
  return limited;
}
```

Create `src/lib/logos/providers/wikimedia.ts`:

```ts
import { THUMBGEN_USER_AGENT } from "@/lib/user-agent";
import type { LogoSearchResult } from "../shared";

export const WIKIMEDIA_LIMIT = 8;

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const COMMONS_FILE_PATTERN = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/[^?#\s]+\.(svg|png)$/i;

export function isCommonsFileUrl(url: string): boolean {
  return COMMONS_FILE_PATTERN.test(url);
}

/** File namespace search; « intitle » on both the brand and « logo » keeps unrelated files out. */
export function commonsSearchUrl(query: string): string {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: `intitle:"${query.replace(/"/g, "")}" intitle:logo`,
    gsrnamespace: "6",
    gsrlimit: "20",
    prop: "imageinfo",
    iiprop: "url|mime",
    iiurlwidth: "256",
  });
  return `${COMMONS_API}?${params.toString()}`;
}

type CommonsPage = {
  index?: unknown;
  title?: unknown;
  imageinfo?: { url?: unknown; thumburl?: unknown; mime?: unknown }[];
};

function fileTitle(title: string): string {
  return title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "").replace(/_/g, " ").trim();
}

export async function searchWikimedia(query: string, signal: AbortSignal): Promise<LogoSearchResult[]> {
  const res = await fetch(commonsSearchUrl(query), { headers: { "User-Agent": THUMBGEN_USER_AGENT }, signal });
  if (!res.ok) throw new Error(`Wikimedia HTTP ${res.status}`);
  const body = (await res.json()) as { query?: { pages?: CommonsPage[] } };
  // formatversion=2 returns pages unordered, with their rank in `index`.
  const pages = [...(body.query?.pages ?? [])].sort((a, b) => Number(a.index ?? 0) - Number(b.index ?? 0));

  const results: LogoSearchResult[] = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info || typeof page.title !== "string") continue;
    if (info.mime !== "image/svg+xml" && info.mime !== "image/png") continue;
    if (typeof info.url !== "string" || typeof info.thumburl !== "string") continue;
    const fileUrl = info.url.split("?")[0];
    if (!isCommonsFileUrl(fileUrl)) continue;
    results.push({
      key: `wikimedia:${fileUrl}`,
      source: "wikimedia",
      name: fileTitle(page.title),
      detail: info.mime === "image/svg+xml" ? "SVG" : "PNG",
      variant: null,
      previewUrl: info.thumburl,
      ref: fileUrl,
    });
    if (results.length >= WIKIMEDIA_LIMIT) break;
  }
  return results;
}
```

Create `src/lib/logos/providers/brandfetch.ts`:

```ts
import { THUMBGEN_USER_AGENT } from "@/lib/user-agent";
import type { LogoSearchResult } from "../shared";

export const BRANDFETCH_LIMIT = 6;

const BRAND_ID_PATTERN = /^[A-Za-z0-9_-]{2,64}$/;

export function isBrandfetchBrandId(value: string): boolean {
  return BRAND_ID_PATTERN.test(value);
}

/** CDN address of a brand icon as PNG, without the client ID (appended when fetched). */
export function brandfetchLogoUrl(brandId: string): string {
  return `https://cdn.brandfetch.io/${brandId}/w/1024/fallback/404/icon.png`;
}

type BrandfetchBrand = { brandId?: unknown; name?: unknown; domain?: unknown; icon?: unknown };

/** Brand Search API. The `icon` URLs are signed by Brandfetch and must be hotlinked, never stored. */
export async function searchBrandfetch(query: string, clientId: string, signal: AbortSignal): Promise<LogoSearchResult[]> {
  const url = `https://api.brandfetch.io/v2/search/${encodeURIComponent(query)}?c=${encodeURIComponent(clientId)}`;
  const res = await fetch(url, { headers: { "User-Agent": THUMBGEN_USER_AGENT }, signal });
  if (!res.ok) throw new Error(`Brandfetch HTTP ${res.status}`);
  const body = (await res.json()) as unknown;

  const results: LogoSearchResult[] = [];
  for (const brand of Array.isArray(body) ? (body as BrandfetchBrand[]) : []) {
    if (typeof brand.brandId !== "string" || !isBrandfetchBrandId(brand.brandId)) continue;
    if (typeof brand.icon !== "string" || !brand.icon.startsWith("https://cdn.brandfetch.io/")) continue;
    const domain = typeof brand.domain === "string" && brand.domain ? brand.domain : null;
    const name = typeof brand.name === "string" && brand.name.trim() ? brand.name.trim() : (domain ?? "Logo");
    results.push({
      key: `brandfetch:${brand.brandId}`,
      source: "brandfetch",
      name,
      detail: domain,
      variant: null,
      previewUrl: brand.icon,
      ref: brand.brandId,
    });
    if (results.length >= BRANDFETCH_LIMIT) break;
  }
  return results;
}
```

- [ ] **Step 5: Run the provider tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/logos/logo-search-providers.test.ts`
Expected: PASS (16 tests). If only the alias test fails, print `aliasesBySlug().get("x")` in a scratch test: the JSON module shape differs from the ruling — fix the `moduleValue` read, not the test.

- [ ] **Step 6: Write the failing merge and route tests**

Create `tests/logos/logo-search.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { defaultLogoProviders, searchLogos, type LogoProvider } from "@/lib/logos/search";
import {
  SEARCH_UNAVAILABLE_MESSAGE,
  searchEmptyMessage,
  unavailableNotice,
  type LogoSearchResponse,
  type LogoSearchResult,
  type LogoSource,
} from "@/lib/logos/shared";
import { clearSvglCache } from "@/lib/logos/providers/svgl";
import { GET } from "@/app/api/logos/search/route";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";

function hit(source: LogoSource, ref: string): LogoSearchResult {
  return { key: `${source}:${ref}`, source, name: ref, detail: null, variant: null, previewUrl: `https://example.test/${ref}.svg`, ref };
}

describe("searchLogos", () => {
  it("merges sources in a fixed order and drops duplicates", async () => {
    const providers: LogoProvider[] = [
      { source: "wikimedia", search: async () => [hit("wikimedia", "w1")] },
      { source: "svgl", search: async () => [hit("svgl", "s1"), hit("svgl", "s1")] },
      { source: "simple-icons", search: async () => [hit("simple-icons", "i1")] },
    ];
    const response = await searchLogos("nike", { providers });
    expect(response.results.map((result) => result.key)).toEqual(["simple-icons:i1", "svgl:s1", "wikimedia:w1"]);
    expect(response.queried).toEqual(["simple-icons", "svgl", "wikimedia"]);
    expect(response.unavailable).toEqual([]);
  });

  it("ignores a failing source and reports it", async () => {
    const providers: LogoProvider[] = [
      { source: "simple-icons", search: async () => [hit("simple-icons", "i1")] },
      { source: "svgl", search: async () => { throw new Error("SVGL HTTP 500"); } },
    ];
    const response = await searchLogos("nike", { providers });
    expect(response.results.map((result) => result.key)).toEqual(["simple-icons:i1"]);
    expect(response.unavailable).toEqual(["svgl"]);
  });

  it("gives up on a slow source after the timeout and aborts its request", async () => {
    let aborted = false;
    const providers: LogoProvider[] = [
      { source: "simple-icons", search: async () => [hit("simple-icons", "i1")] },
      {
        source: "wikimedia",
        search: (_query, signal) =>
          new Promise<LogoSearchResult[]>(() => {
            signal.addEventListener("abort", () => {
              aborted = true;
            });
          }),
      },
    ];
    const started = Date.now();
    const response = await searchLogos("nike", { providers, timeoutMs: 50 });
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(response.unavailable).toEqual(["wikimedia"]);
    expect(response.results.map((result) => result.key)).toEqual(["simple-icons:i1"]);
    expect(aborted).toBe(true);
  });

  it("queries Brandfetch only with a client ID", () => {
    expect(defaultLogoProviders().map((provider) => provider.source)).toEqual(["simple-icons", "svgl", "wikimedia"]);
    expect(defaultLogoProviders("bf-client-1234").map((provider) => provider.source)).toEqual([
      "simple-icons",
      "svgl",
      "wikimedia",
      "brandfetch",
    ]);
  });
});

describe("search wording", () => {
  it("names the unavailable sources", () => {
    expect(unavailableNotice([])).toBeNull();
    expect(unavailableNotice(["svgl"])).toBe("SVGL indisponible");
    expect(unavailableNotice(["wikimedia", "svgl"])).toBe("SVGL et Wikimedia indisponibles");
    expect(unavailableNotice(["wikimedia", "svgl", "brandfetch"])).toBe("SVGL, Brandfetch et Wikimedia indisponibles");
  });

  it("explains an empty grid", () => {
    const base: LogoSearchResponse = { results: [], queried: ["simple-icons", "svgl"], unavailable: [] };
    expect(searchEmptyMessage({ ...base, unavailable: ["simple-icons", "svgl"] }, "nike")).toBe(SEARCH_UNAVAILABLE_MESSAGE);
    expect(searchEmptyMessage(base, "zzz")).toBe("Aucun logo trouvé pour « zzz ».");
    expect(searchEmptyMessage({ ...base, results: [hit("svgl", "s1")] }, "nike")).toBeNull();
  });
});

describe("GET /api/logos/search", () => {
  const fetchMock = vi.fn<typeof fetch>();
  let savedEnv: string | undefined;

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }

  beforeEach(() => {
    getDb().exec("DELETE FROM settings");
    savedEnv = process.env.BRANDFETCH_API_KEY;
    delete process.env.BRANDFETCH_API_KEY;
    clearSvglCache();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("https://api.svgl.app")) return json({ error: "❌ (SVGL - API) SVG not found" }, 404);
      if (url.startsWith("https://commons.wikimedia.org")) return json({ batchcomplete: true });
      if (url.startsWith("https://api.brandfetch.io")) return json([]);
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (savedEnv === undefined) delete process.env.BRANDFETCH_API_KEY;
    else process.env.BRANDFETCH_API_KEY = savedEnv;
  });

  const search = (q: string) => GET(new Request(`http://localhost/api/logos/search?q=${encodeURIComponent(q)}`));

  it("rejects a query shorter than 2 characters", async () => {
    expect((await search("y")).status).toBe(400);
    expect((await search(" ")).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns merged results and never calls Brandfetch without a key", async () => {
    const res = await search("youtube");
    expect(res.status).toBe(200);
    const body = (await res.json()) as LogoSearchResponse;
    expect(body.results[0]).toMatchObject({ source: "simple-icons", ref: "youtube" });
    expect(body.queried).toEqual(["simple-icons", "svgl", "wikimedia"]);
    expect(body.unavailable).toEqual([]);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("brandfetch"))).toBe(false);
  });

  it("adds Brandfetch when a client ID is saved", async () => {
    setSetting("brandfetchApiKey", "bf-client-1234");
    const body = (await (await search("youtube")).json()) as LogoSearchResponse;
    expect(body.queried).toEqual(["simple-icons", "svgl", "brandfetch", "wikimedia"]);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain("https://api.brandfetch.io/v2/search/youtube?c=bf-client-1234");
  });
});
```

- [ ] **Step 7: Run them to verify they fail**

Run: `./node_modules/.bin/vitest run tests/logos/logo-search.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/logos/search"`.

- [ ] **Step 8: Write the merge and the route**

Create `src/lib/logos/search.ts`:

```ts
import { searchBrandfetch } from "./providers/brandfetch";
import { searchSimpleIcons } from "./providers/simple-icons";
import { searchSvgl } from "./providers/svgl";
import { searchWikimedia } from "./providers/wikimedia";
import { LOGO_SOURCES, type LogoSearchResponse, type LogoSearchResult, type LogoSource } from "./shared";

/** Longest wait for one source; a slower source is dropped and reported unavailable. */
export const LOGO_SEARCH_TIMEOUT_MS = 4_000;

export type LogoProvider = {
  source: LogoSource;
  search: (query: string, signal: AbortSignal) => Promise<LogoSearchResult[]>;
};

export function defaultLogoProviders(brandfetchClientId?: string): LogoProvider[] {
  const providers: LogoProvider[] = [
    { source: "simple-icons", search: async (query) => searchSimpleIcons(query) },
    { source: "svgl", search: (query, signal) => searchSvgl(query, signal) },
    { source: "wikimedia", search: (query, signal) => searchWikimedia(query, signal) },
  ];
  if (brandfetchClientId) {
    providers.push({ source: "brandfetch", search: (query, signal) => searchBrandfetch(query, brandfetchClientId, signal) });
  }
  return providers;
}

type Settled = { source: LogoSource; ok: boolean; results: LogoSearchResult[] };

async function runProvider(provider: LogoProvider, query: string, timeoutMs: number): Promise<Settled> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`${provider.source} timed out`));
    }, timeoutMs);
  });
  try {
    const results = await Promise.race([provider.search(query, controller.signal), timeout]);
    return { source: provider.source, ok: true, results };
  } catch {
    return { source: provider.source, ok: false, results: [] };
  } finally {
    clearTimeout(timer);
  }
}

/** Queries every provider in parallel; a failing or slow source never fails the search. */
export async function searchLogos(
  query: string,
  options: { providers: LogoProvider[]; timeoutMs?: number },
): Promise<LogoSearchResponse> {
  const timeoutMs = options.timeoutMs ?? LOGO_SEARCH_TIMEOUT_MS;
  const settled = await Promise.all(options.providers.map((provider) => runProvider(provider, query, timeoutMs)));

  const seen = new Set<string>();
  const results: LogoSearchResult[] = [];
  for (const source of LOGO_SOURCES) {
    for (const entry of settled.filter((item) => item.source === source)) {
      for (const result of entry.results) {
        if (seen.has(result.key)) continue;
        seen.add(result.key);
        results.push(result);
      }
    }
  }

  return {
    results,
    queried: LOGO_SOURCES.filter((source) => settled.some((item) => item.source === source)),
    unavailable: LOGO_SOURCES.filter((source) => settled.some((item) => item.source === source && !item.ok)),
  };
}
```

Create `src/app/api/logos/search/route.ts`:

```ts
import { NextResponse } from "next/server";
import { defaultLogoProviders, searchLogos } from "@/lib/logos/search";
import { LOGO_SEARCH_MIN_CHARS } from "@/lib/logos/shared";
import { getTypedSettings } from "@/lib/settings";

export const runtime = "nodejs";

const MAX_QUERY_LENGTH = 100;

export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (query.length < LOGO_SEARCH_MIN_CHARS) {
    return NextResponse.json({ error: `Au moins ${LOGO_SEARCH_MIN_CHARS} caractères` }, { status: 400 });
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: "Recherche trop longue" }, { status: 400 });
  }
  const providers = defaultLogoProviders(getTypedSettings().brandfetchApiKey);
  return NextResponse.json(await searchLogos(query, { providers }));
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/logos/logo-search.test.ts tests/logos/logo-search-providers.test.ts`
Expected: PASS (all).

- [ ] **Step 10: Type-check, lint, full suite, commit**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/lib/logos src/app/api/logos/search/route.ts tests/logos/logo-search.test.ts tests/logos/logo-search-providers.test.ts
./node_modules/.bin/vitest run
git add package.json package-lock.json src/lib/logos/shared.ts src/lib/logos/providers/simple-icons.ts src/lib/logos/providers/svgl.ts src/lib/logos/providers/wikimedia.ts src/lib/logos/providers/brandfetch.ts src/lib/logos/search.ts src/app/api/logos/search/route.ts tests/logos/logo-search.test.ts tests/logos/logo-search-providers.test.ts
git commit -m "feat(logos): search Simple Icons, SVGL, Wikimedia and Brandfetch with per-source timeout" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Expected: `tsc` exits 0 (if it reports `simple-icons/icons.json` as unresolvable, check `grep -n resolveJsonModule tsconfig.json` is `true` and that Step 1's export exists), no eslint error, all tests pass.

---

## Task 7: Add a search result to the library — SVG → PNG, Brandfetch reference, `POST /api/logos/add`

**Files:**
- Modify: `package.json`, `package-lock.json` (add `@resvg/resvg-js@2.6.2`)
- Create: `src/lib/logos/rasterize.ts`
- Create: `src/lib/logos/add-logo.ts`
- Create: `src/app/api/logos/add/route.ts`
- Modify: `next.config.ts`
- Modify: `Dockerfile`
- Test: `tests/logos/add-logo.test.ts`

**Interfaces:**
- Consumes: `simpleIconSvg`, `isSvglAssetUrl`, `isCommonsFileUrl`, `isBrandfetchBrandId`, `brandfetchLogoUrl`, `LOGO_SOURCES`, `type LogoSource`, `type AddedLogo` (Task 6); column `logos.remote_url` (Task 5); `getTypedSettings().brandfetchApiKey`, `THUMBGEN_USER_AGENT` (Task 4).
- Produces:
  - `src/lib/logos/rasterize.ts`: `LOGO_PNG_WIDTH = 1024`, `class SvgRasterizeError extends Error`, `svgToPng(svg: string, width?: number): Buffer` (8-bit RGBA PNG, transparent background, exact width).
  - `src/lib/logos/add-logo.ts`: `class LogoAddError extends Error { readonly status: number }`, `type AddLogoInput = { source: LogoSource; ref: string; name: string }`, `type AddedLogoRow = { id: string; label: string; remote: boolean }`, `addLogoFromSearch(input: AddLogoInput, options?: { brandfetchClientId?: string }): Promise<AddedLogoRow>`.
  - `POST /api/logos/add` body `{ source, ref, name }` → `200 AddedLogo` (`{ filename, label, remote }`); `400` malformed body / refused ref / Brandfetch without key; `404` unknown Simple Icons slug; `413` file > 5 MB; `422` invalid SVG or non-PNG; `502` download failure — always `{ error: string }` in French.

- [ ] **Step 1: Install the rasteriser and check its API**

```bash
npm install --save-exact @resvg/resvg-js@2.6.2
grep -n '"@resvg/resvg-js"' package.json
grep -n "fitTo\|loadSystemFonts\|asPng" node_modules/@resvg/resvg-js/index.d.ts
ls node_modules/@resvg
grep -n '"node_modules/@resvg/resvg-js-linux-arm64-gnu"\|"node_modules/@resvg/resvg-js-linux-x64-gnu"' package-lock.json
```

Expected: `"@resvg/resvg-js": "2.6.2"`; `index.d.ts` declares `fitTo`, `loadSystemFonts` and `asPng(): Buffer`; `node_modules/@resvg` holds `resvg-js` and `resvg-js-darwin-arm64`; the lock file lists the Linux gnu packages (installed by `npm ci` in Docker).

- [ ] **Step 2: Write the failing tests**

Create `tests/logos/add-logo.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { inflateSync } from "zlib";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import { LOGO_PNG_WIDTH, SvgRasterizeError, svgToPng } from "@/lib/logos/rasterize";
import { LogoAddError, addLogoFromSearch } from "@/lib/logos/add-logo";
import { POST } from "@/app/api/logos/add/route";

const CIRCLE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><circle cx="50" cy="25" r="20" fill="#ff0000"/></svg>';
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZkqfO0AAAAASUVORK5CYII=",
  "base64",
);
const fetchMock = vi.fn<typeof fetch>();
let savedEnv: string | undefined;

/** Minimal decoder for the 8-bit RGBA, non-interlaced PNGs resvg writes. */
function decodePng(png: Buffer) {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const colorType = png[25];
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset);
    if (png.toString("ascii", offset + 4, offset + 8) === "IDAT") chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x];
      const a = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = a;
      else if (filter === 2) predictor = b;
      else if (filter === 3) predictor = Math.floor((a + b) / 2);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[y * stride + x] = (value + predictor) & 0xff;
    }
  }
  const pixel = (x: number, y: number) => [...pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)];
  return { width, height, colorType, pixel };
}

type LogoRow = { label: string; mime_type: string; size: number; data: Buffer; remote_url: string | null };
const row = (id: string) =>
  getDb().prepare("SELECT label, mime_type, size, data, remote_url FROM logos WHERE id = ?").get(id) as LogoRow;
const logoCount = () => (getDb().prepare("SELECT COUNT(*) AS n FROM logos").get() as { n: number }).n;
const svgResponse = (svg: string) => new Response(svg, { status: 200, headers: { "content-type": "image/svg+xml" } });

beforeEach(() => {
  getDb().exec("DELETE FROM logos; DELETE FROM settings;");
  savedEnv = process.env.BRANDFETCH_API_KEY;
  delete process.env.BRANDFETCH_API_KEY;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (savedEnv === undefined) delete process.env.BRANDFETCH_API_KEY;
  else process.env.BRANDFETCH_API_KEY = savedEnv;
});

describe("svgToPng", () => {
  it("renders a 1024 px wide PNG with a transparent background", () => {
    const png = decodePng(svgToPng(CIRCLE_SVG));
    expect(LOGO_PNG_WIDTH).toBe(1024);
    expect(png.width).toBe(1024);
    expect(png.height).toBe(512);
    expect(png.colorType).toBe(6);
    expect(png.pixel(0, 0)[3]).toBe(0);
    expect(png.pixel(512, 256)).toEqual([255, 0, 0, 255]);
  });

  it("rejects what is not a valid SVG", () => {
    expect(() => svgToPng("<svg><<<")).toThrow(SvgRasterizeError);
    expect(() => svgToPng("bonjour")).toThrow(SvgRasterizeError);
  });
});

describe("addLogoFromSearch", () => {
  it("Simple Icons: stores the coloured icon as a 1024 px PNG without any request", async () => {
    const logo = await addLogoFromSearch({ source: "simple-icons", ref: "youtube", name: " YouTube " });
    expect(logo).toMatchObject({ label: "YouTube", remote: false });
    const saved = row(logo.id);
    expect(saved.mime_type).toBe("image/png");
    expect(saved.remote_url).toBeNull();
    expect(saved.size).toBe(saved.data.length);
    expect(decodePng(saved.data).width).toBe(1024);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("SVGL: downloads the SVG and stores a transparent PNG", async () => {
    fetchMock.mockResolvedValue(svgResponse(CIRCLE_SVG));
    const logo = await addLogoFromSearch({ source: "svgl", ref: "https://svgl.app/library/notion.svg", name: "Notion" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://svgl.app/library/notion.svg");
    expect((init?.headers as Record<string, string>)["User-Agent"]).toMatch(/^ThumbGen\//);
    const png = decodePng(row(logo.id).data);
    expect(png.width).toBe(1024);
    expect(png.pixel(0, 0)[3]).toBe(0);
    expect(png.pixel(512, 256)).toEqual([255, 0, 0, 255]);
  });

  it("Wikimedia: rasterises an SVG and keeps a PNG as is", async () => {
    fetchMock.mockResolvedValueOnce(svgResponse(CIRCLE_SVG));
    const svgLogo = await addLogoFromSearch({ source: "wikimedia", ref: "https://upload.wikimedia.org/wikipedia/commons/a/a6/Logo_NIKE.svg", name: "Logo NIKE" });
    expect(decodePng(row(svgLogo.id).data).width).toBe(1024);

    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array(TINY_PNG), { status: 200, headers: { "content-type": "image/png" } }));
    const pngLogo = await addLogoFromSearch({ source: "wikimedia", ref: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Nik%C3%A9_logo.png", name: "Niké logo" });
    expect(row(pngLogo.id).data.equals(TINY_PNG)).toBe(true);
    expect(row(pngLogo.id).mime_type).toBe("image/png");
  });

  it("refuses an invalid SVG and saves nothing", async () => {
    fetchMock.mockResolvedValue(svgResponse("<svg><<<"));
    await expect(addLogoFromSearch({ source: "svgl", ref: "https://svgl.app/library/broken.svg", name: "Cassé" })).rejects.toMatchObject({
      name: "LogoAddError",
      status: 422,
    });
    expect(logoCount()).toBe(0);
  });

  it("refuses a Wikimedia file that is not a PNG despite its name", async () => {
    fetchMock.mockResolvedValue(new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }));
    await expect(
      addLogoFromSearch({ source: "wikimedia", ref: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Faux.png", name: "Faux" }),
    ).rejects.toMatchObject({ status: 422 });
    expect(logoCount()).toBe(0);
  });

  it("refuses addresses outside each source without downloading", async () => {
    await expect(addLogoFromSearch({ source: "svgl", ref: "https://evil.example/logo.svg", name: "x" })).rejects.toBeInstanceOf(LogoAddError);
    await expect(addLogoFromSearch({ source: "wikimedia", ref: "http://169.254.169.254/latest.png", name: "x" })).rejects.toMatchObject({ status: 400 });
    await expect(addLogoFromSearch({ source: "simple-icons", ref: "does-not-exist", name: "x" })).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logoCount()).toBe(0);
  });

  it("reports a failed download", async () => {
    fetchMock.mockResolvedValue(new Response("oops", { status: 500 }));
    await expect(addLogoFromSearch({ source: "svgl", ref: "https://svgl.app/library/notion.svg", name: "Notion" })).rejects.toMatchObject({
      status: 502,
      message: "Téléchargement du logo impossible (HTTP 500).",
    });
  });

  it("Brandfetch: saves a remote reference without any file or request", async () => {
    const logo = await addLogoFromSearch({ source: "brandfetch", ref: "id_0dwKPKT", name: "Nike" }, { brandfetchClientId: "bf-client-1234" });
    expect(logo.remote).toBe(true);
    const saved = row(logo.id);
    expect(saved.remote_url).toBe("https://cdn.brandfetch.io/id_0dwKPKT/w/1024/fallback/404/icon.png");
    expect(saved.size).toBe(0);
    expect(saved.data.length).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Brandfetch: needs a client ID and a valid brand ID", async () => {
    await expect(addLogoFromSearch({ source: "brandfetch", ref: "id_0dwKPKT", name: "Nike" })).rejects.toMatchObject({
      status: 400,
      message: "Ajoute ta clé Brandfetch dans Réglages → Connexions.",
    });
    await expect(
      addLogoFromSearch({ source: "brandfetch", ref: "../etc", name: "Nike" }, { brandfetchClientId: "bf-client-1234" }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("POST /api/logos/add", () => {
  const add = (body: unknown) =>
    POST(new Request("http://localhost/api/logos/add", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

  it("rejects a malformed body", async () => {
    expect((await add({ source: "google", ref: "x", name: "x" })).status).toBe(400);
    expect((await add({ source: "svgl", name: "x" })).status).toBe(400);
  });

  it("adds a Simple Icons logo and returns its filename", async () => {
    const res = await add({ source: "simple-icons", ref: "nike", name: "Nike" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { filename: string; label: string; remote: boolean };
    expect(body).toMatchObject({ label: "Nike", remote: false });
    expect(row(body.filename).mime_type).toBe("image/png");
  });

  it("uses the saved Brandfetch client ID", async () => {
    setSetting("brandfetchApiKey", "bf-client-1234");
    const res = await add({ source: "brandfetch", ref: "id_0dwKPKT", name: "Nike" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { remote: boolean }).remote).toBe(true);
  });

  it("passes a LogoAddError through with its status and French message", async () => {
    const res = await add({ source: "brandfetch", ref: "id_0dwKPKT", name: "Nike" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Ajoute ta clé Brandfetch dans Réglages → Connexions." });
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `./node_modules/.bin/vitest run tests/logos/add-logo.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/logos/rasterize"`.

- [ ] **Step 4: Write the rasteriser, the import pipeline and the route**

Create `src/lib/logos/rasterize.ts`:

```ts
import { Resvg } from "@resvg/resvg-js";

export const LOGO_PNG_WIDTH = 1024;

export class SvgRasterizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SvgRasterizeError";
  }
}

/** SVG → PNG of exactly `width` pixels, height following the ratio, transparent background. */
export function svgToPng(svg: string, width: number = LOGO_PNG_WIDTH): Buffer {
  if (!/<svg[\s>]/i.test(svg)) throw new SvgRasterizeError("Ce fichier n'est pas un SVG.");
  try {
    // No system fonts: the Docker image has none and logo SVGs are paths.
    const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: false } });
    return resvg.render().asPng();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "conversion impossible";
    throw new SvgRasterizeError(`SVG invalide : ${detail}`);
  }
}
```

Create `src/lib/logos/add-logo.ts`:

```ts
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import { THUMBGEN_USER_AGENT } from "@/lib/user-agent";
import { brandfetchLogoUrl, isBrandfetchBrandId } from "./providers/brandfetch";
import { simpleIconSvg } from "./providers/simple-icons";
import { isSvglAssetUrl } from "./providers/svgl";
import { isCommonsFileUrl } from "./providers/wikimedia";
import { SvgRasterizeError, svgToPng } from "./rasterize";
import type { LogoSource } from "./shared";

export class LogoAddError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "LogoAddError";
    this.status = status;
  }
}

export type AddLogoInput = { source: LogoSource; ref: string; name: string };
export type AddedLogoRow = { id: string; label: string; remote: boolean };

const DOWNLOAD_TIMEOUT_MS = 10_000;
const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function download(url: string): Promise<Buffer> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": THUMBGEN_USER_AGENT }, signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  } catch {
    throw new LogoAddError("Téléchargement du logo impossible — réessaie.", 502);
  }
  if (!res.ok) throw new LogoAddError(`Téléchargement du logo impossible (HTTP ${res.status}).`, 502);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length === 0) throw new LogoAddError("Le fichier du logo est vide.", 502);
  if (bytes.length > MAX_DOWNLOAD_BYTES) throw new LogoAddError("Fichier trop lourd (5 Mo maximum).", 413);
  return bytes;
}

function rasterize(svg: string): Buffer {
  try {
    return svgToPng(svg);
  } catch (error) {
    if (error instanceof SvgRasterizeError) throw new LogoAddError(error.message, 422);
    throw error;
  }
}

function insertLogo(label: string, png: Buffer | null, remoteUrl: string | null): AddedLogoRow {
  const id = uuid();
  const data = png ?? Buffer.alloc(0);
  getDb()
    .prepare("INSERT INTO logos (id, label, mime_type, size, data, remote_url) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, label, "image/png", data.length, data, remoteUrl);
  return { id, label, remote: remoteUrl !== null };
}

/**
 * Saves a search result in the library. Simple Icons / SVGL / Wikimedia: the
 * file is downloaded (validated address only) and an SVG becomes a 1024 px
 * transparent PNG. Brandfetch: a remote reference only (its logos may not be stored).
 */
export async function addLogoFromSearch(
  input: AddLogoInput,
  options: { brandfetchClientId?: string } = {},
): Promise<AddedLogoRow> {
  const label = input.name.trim().slice(0, 100) || "Logo";
  switch (input.source) {
    case "simple-icons": {
      const svg = simpleIconSvg(input.ref);
      if (!svg) throw new LogoAddError("Logo Simple Icons introuvable.", 404);
      return insertLogo(label, rasterize(svg), null);
    }
    case "svgl": {
      if (!isSvglAssetUrl(input.ref)) throw new LogoAddError("Adresse SVGL refusée.", 400);
      const svg = (await download(input.ref)).toString("utf8");
      return insertLogo(label, rasterize(svg), null);
    }
    case "wikimedia": {
      if (!isCommonsFileUrl(input.ref)) throw new LogoAddError("Adresse Wikimedia refusée.", 400);
      const bytes = await download(input.ref);
      if (/\.svg$/i.test(input.ref)) return insertLogo(label, rasterize(bytes.toString("utf8")), null);
      if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
        throw new LogoAddError("Ce fichier n'est pas un PNG.", 422);
      }
      return insertLogo(label, bytes, null);
    }
    case "brandfetch": {
      if (!options.brandfetchClientId) throw new LogoAddError("Ajoute ta clé Brandfetch dans Réglages → Connexions.", 400);
      if (!isBrandfetchBrandId(input.ref)) throw new LogoAddError("Identifiant Brandfetch refusé.", 400);
      return insertLogo(label, null, brandfetchLogoUrl(input.ref));
    }
  }
  throw new LogoAddError("Source de logo inconnue.", 400);
}
```

Create `src/app/api/logos/add/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { LogoAddError, addLogoFromSearch } from "@/lib/logos/add-logo";
import { LOGO_SOURCES, type AddedLogo } from "@/lib/logos/shared";
import { getTypedSettings } from "@/lib/settings";

export const runtime = "nodejs";

const AddLogoBodySchema = z.object({
  source: z.enum(LOGO_SOURCES),
  ref: z.string().min(1).max(1000),
  name: z.string().max(200),
});

export async function POST(request: Request) {
  const parsed = AddLogoBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Résultat de recherche invalide." }, { status: 400 });

  try {
    const logo = await addLogoFromSearch(parsed.data, { brandfetchClientId: getTypedSettings().brandfetchApiKey });
    const body: AddedLogo = { filename: logo.id, label: logo.label, remote: logo.remote };
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof LogoAddError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[logos/add] failed", error);
    return NextResponse.json({ error: "Ajout du logo impossible." }, { status: 500 });
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/logos/add-logo.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 6: Keep the native rasteriser out of the bundle and in the Docker image**

In `next.config.ts`, replace:

```ts
  output: "standalone",
```

with:

```ts
  output: "standalone",
  // @resvg/resvg-js (library logos, SVG → PNG) loads a platform-specific native
  // binary with a runtime require(): it must not be bundled. Next only knows
  // sharp, better-sqlite3, … by default.
  serverExternalPackages: ["@resvg/resvg-js"],
```

In `Dockerfile`, replace:

```dockerfile
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path
```

with:

```dockerfile
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path
# resvg (logo SVG → PNG) loads @resvg/resvg-js-linux-*-gnu through a runtime
# require the standalone trace can miss — same reason as better-sqlite3 above
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@resvg ./node_modules/@resvg
```

- [ ] **Step 7: Production build smoke test (local, throwaway DB)**

Do not run this while a dev server from the same checkout is running (another lane): both write under `.next`.

```bash
./node_modules/.bin/tsc --noEmit
rm -rf .next/standalone
THUMBGEN_DB_PATH="$(mktemp -d)/thumbgen.db" ./node_modules/.bin/next build
ls .next/standalone/node_modules/@resvg 2>/dev/null || echo "not traced: the Dockerfile COPY provides it"
```

Expected: `tsc` exits 0; the build succeeds (no « Module not found » for `simple-icons/icons.json` or `@resvg/resvg-js`, no `.node` loader error). The `ls` line is informational. Remove nothing else in `.next`; the next dev server rebuilds its own files.

- [ ] **Step 8: Lint, full suite, commit**

```bash
./node_modules/.bin/eslint src/lib/logos/rasterize.ts src/lib/logos/add-logo.ts src/app/api/logos/add/route.ts next.config.ts tests/logos/add-logo.test.ts
./node_modules/.bin/vitest run
git add package.json package-lock.json src/lib/logos/rasterize.ts src/lib/logos/add-logo.ts src/app/api/logos/add/route.ts next.config.ts Dockerfile tests/logos/add-logo.test.ts
git commit -m "feat(logos): add search results to the library as 1024 px PNG or Brandfetch reference" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Expected: no eslint error, all tests pass.

---

## Task 8: `/bibliotheque` page shell, Tabs component and shared library blocks

**Files:**
- Create: `src/components/ui/tabs.tsx`
- Create: `src/lib/library/image-file.ts`
- Create: `src/components/library/useLibraryList.ts`
- Create: `src/components/library/LibrarySearchInput.tsx`
- Create: `src/components/library/ItemActionsMenu.tsx`
- Create: `src/components/library/RenameDialog.tsx`
- Create: `src/components/library/LibraryGrid.tsx`
- Create: `src/components/library/LibraryView.tsx`
- Create: `src/components/library/PersonasTab.tsx`, `src/components/library/LogosTab.tsx`, `src/components/library/InspirationsTab.tsx` (temporary — fully replaced by Tasks 9, 11, 10)
- Create: `src/app/bibliotheque/page.tsx`

**Interfaces:**
- Consumes: `LIBRARY_TAB_IDS`, `LIBRARY_TAB_LABELS`, `parseLibraryTab`, `libraryTabHref` (Task 1); `AppSidebar` (unchanged until Task 13).
- Produces (used by Tasks 9–12):
  - `src/components/ui/tabs.tsx`: `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `tabsListVariants` (shadcn base-nova).
  - `src/lib/library/image-file.ts`: `type ImageImportPreset = { maxSize: number; type: "image/jpeg" | "image/png" }`, `PHOTO_IMPORT` (1600, JPEG), `LOGO_IMPORT` (512, PNG), `fileToDataUrl(file: File, preset: ImageImportPreset): Promise<string>` (browser only).
  - `useLibraryList<T>(url: string): { items: T[] | null; error: string | null; reload: () => Promise<void> }`.
  - `LibrarySearchInput` default export, props `{ value: string; onChange: (value: string) => void; placeholder: string; label: string; className?: string }`.
  - `ItemActionsMenu` default export, props `{ itemLabel: string; actions: ItemAction[] }`, `type ItemAction = { label: string; icon: LucideIcon; onClick: () => void; destructive?: boolean }`.
  - `RenameDialog` default export, props `{ open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; initialValue: string; maxLength: number; onSubmit: (value: string) => Promise<string | null> }` (resolve an error message to keep it open, `null` to close; mount it with a `key` per item).
  - `LibraryGrid` `{ className?: string; children: React.ReactNode }`, `LibraryGridSkeleton` `{ count?: number; aspect?: string }` (named exports).
  - `LibraryView` default export (no props); tab components are default exports with no props: `PersonasTab`, `LogosTab`, `InspirationsTab`.
  - Route `/bibliotheque` (server page with `metadata`, `ReactFlowProvider` > `AppSidebar` + `SidebarInset`, view in `Suspense`; Task 13 removes the provider).

- [ ] **Step 1: Add the shadcn Tabs component (base-nova registry source, verbatim)**

Create `src/components/ui/tabs.tsx`:

```tsx
"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        "data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
```

Run: `grep -n "onValueChange" node_modules/@base-ui/react/tabs/root/TabsRoot.d.ts`
Expected: `onValueChange?: ((value: TabsTab.Value, eventDetails: TabsRoot.ChangeEventDetails) => void)`.

- [ ] **Step 2: Shared hooks and blocks**

Create `src/lib/library/image-file.ts`:

```ts
/** Browser only: downscales an image file into a data URL before upload. */

export type ImageImportPreset = { maxSize: number; type: "image/jpeg" | "image/png" };

/** Persona photos and inspiration images (same as the former sidebar). */
export const PHOTO_IMPORT: ImageImportPreset = { maxSize: 1600, type: "image/jpeg" };

/** Manually imported logos keep transparency (same as the former sidebar). */
export const LOGO_IMPORT: ImageImportPreset = { maxSize: 512, type: "image/png" };

export function fileToDataUrl(file: File, preset: ImageImportPreset): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = image;
      if (width > preset.maxSize || height > preset.maxSize) {
        const ratio = Math.min(preset.maxSize / width, preset.maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Canvas indisponible"));
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      resolve(preset.type === "image/jpeg" ? canvas.toDataURL("image/jpeg", 0.8) : canvas.toDataURL("image/png"));
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Image illisible"));
    };
    image.src = objectUrl;
  });
}
```

Create `src/components/library/useLibraryList.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";

/** Loads a library list (JSON array). `items` stays null until the first answer. */
export function useLibraryList<T>(url: string): { items: T[] | null; error: string | null; reload: () => Promise<void> } {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as unknown;
      setItems(Array.isArray(body) ? (body as T[]) : []);
      setError(null);
    } catch {
      setItems((previous) => previous ?? []);
      setError("Chargement impossible — vérifie ta connexion et réessaie.");
    }
  }, [url]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { items, error, reload };
}
```

Create `src/components/library/LibrarySearchInput.tsx`:

```tsx
"use client";

import { Search } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";

export default function LibrarySearchInput({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  return (
    <InputGroup className={className}>
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
      />
    </InputGroup>
  );
}
```

Create `src/components/library/ItemActionsMenu.tsx`:

```tsx
"use client";

import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ItemAction = { label: string; icon: LucideIcon; onClick: () => void; destructive?: boolean };

/** The « … » menu of a library card. */
export default function ItemActionsMenu({ itemLabel, actions }: { itemLabel: string; actions: ItemAction[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${itemLabel}`}>
            <MoreHorizontal />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          {actions.map(({ label, icon: Icon, onClick, destructive }) => (
            <DropdownMenuItem key={label} variant={destructive ? "destructive" : "default"} onClick={onClick}>
              <Icon />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

Create `src/components/library/RenameDialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Rename form. Mount it with a `key` per item so the field starts from
 * `initialValue`. `onSubmit` resolves an error message (dialog stays open) or null.
 */
export default function RenameDialog({
  open,
  onOpenChange,
  title,
  description,
  initialValue,
  maxLength,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  initialValue: string;
  maxLength: number;
  onSubmit: (value: string) => Promise<string | null>;
}) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const trimmed = value.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!trimmed || saving) return;
            setSaving(true);
            setError(null);
            try {
              const message = await onSubmit(trimmed);
              if (message) setError(message);
              else onOpenChange(false);
            } finally {
              setSaving(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="library-rename">Nom</Label>
            <Input
              id="library-rename"
              value={value}
              maxLength={maxLength}
              autoFocus
              aria-invalid={Boolean(error)}
              onChange={(event) => setValue(event.target.value)}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!trimmed || saving}>
              {saving ? "Enregistrement…" : "Renommer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

Create `src/components/library/LibraryGrid.tsx`:

```tsx
import type { ReactNode } from "react";
import { cn } from "cn";
import { Skeleton } from "@/components/ui/skeleton";

export function LibraryGrid({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", className)}>{children}</div>;
}

export function LibraryGridSkeleton({ count = 4, aspect = "aspect-video" }: { count?: number; aspect?: string }) {
  return (
    <LibraryGrid>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className={cn("w-full rounded-xl", aspect)} />
      ))}
    </LibraryGrid>
  );
}
```

- [ ] **Step 3: The view, three temporary tabs and the page**

Create `src/components/library/LibraryView.tsx`:

```tsx
"use client";

import { useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LIBRARY_TAB_IDS, LIBRARY_TAB_LABELS, libraryTabHref, parseLibraryTab } from "@/lib/library/library-tabs";
import InspirationsTab from "./InspirationsTab";
import LogosTab from "./LogosTab";
import PersonasTab from "./PersonasTab";

export default function LibraryView() {
  const searchParams = useSearchParams();
  const tab = parseLibraryTab(searchParams.get("onglet"));

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-medium">Bibliothèque</h1>
        <p className="text-sm text-muted-foreground">
          Tes personnages, logos et images d&apos;inspiration, prêts à être utilisés dans tes miniatures.
        </p>
      </header>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          // Next.js syncs history.replaceState into useSearchParams: no page refetch.
          window.history.replaceState(null, "", libraryTabHref(parseLibraryTab(String(value))));
        }}
      >
        <TabsList>
          {LIBRARY_TAB_IDS.map((id) => (
            <TabsTrigger key={id} value={id}>
              {LIBRARY_TAB_LABELS[id]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="personnages" className="pt-4">
          <PersonasTab />
        </TabsContent>
        <TabsContent value="logos" className="pt-4">
          <LogosTab />
        </TabsContent>
        <TabsContent value="inspirations" className="pt-4">
          <InspirationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

Create `src/components/library/PersonasTab.tsx` (temporary, Task 9 replaces the whole file):

```tsx
"use client";

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export default function PersonasTab() {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyTitle>Personnages</EmptyTitle>
        <EmptyDescription>Cet onglet arrive bientôt.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
```

Create `src/components/library/LogosTab.tsx` (temporary, Task 11 replaces the whole file):

```tsx
"use client";

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export default function LogosTab() {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyTitle>Logos</EmptyTitle>
        <EmptyDescription>Cet onglet arrive bientôt.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
```

Create `src/components/library/InspirationsTab.tsx` (temporary, Task 10 replaces the whole file):

```tsx
"use client";

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export default function InspirationsTab() {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyTitle>Inspirations</EmptyTitle>
        <EmptyDescription>Cet onglet arrive bientôt.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
```

Create `src/app/bibliotheque/page.tsx`:

```tsx
import { Suspense } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import AppSidebar from "@/components/panels/AppSidebar";
import LibraryView from "@/components/library/LibraryView";
import { SidebarInset } from "@/components/ui/sidebar";

export const metadata = { title: "Bibliothèque · ThumbGen" };

/** Same shell as /miniatures; the body never scrolls, so the inset does. */
export default function BibliothequePage() {
  return (
    // AppSidebar still calls useReactFlow() until Task 13 removes it (and this provider).
    <ReactFlowProvider>
      <AppSidebar />
      <SidebarInset className="h-svh overflow-y-auto">
        {/* useSearchParams (?onglet=) needs a Suspense boundary. */}
        <Suspense fallback={null}>
          <LibraryView />
        </Suspense>
      </SidebarInset>
    </ReactFlowProvider>
  );
}
```

`@xyflow/react` ships with a `"use client"` directive, so this server page (which keeps its `metadata`) can render `ReactFlowProvider` like the other pages do today.

- [ ] **Step 4: Type-check and lint**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/components/ui/tabs.tsx src/lib/library/image-file.ts src/components/library src/app/bibliotheque/page.tsx
```

Expected: `tsc` exits 0, no eslint error.

- [ ] **Step 5: Check in the browser (throwaway dev server, port 3100)**

Start the dev server. Open `http://localhost:3100/bibliotheque`:
- Title « Bibliothèque », three tabs « Personnages », « Logos », « Inspirations »; « Personnages » active; the sidebar is still the old one (Task 13).
- Click « Logos » → the URL becomes `/bibliotheque?onglet=logos` without a page reload (network panel: no document request); the placeholder « Logos » shows.
- Open `http://localhost:3100/bibliotheque?onglet=inspirations` directly → « Inspirations » active; `?onglet=zzz` → « Personnages ». Reload keeps the tab. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/tabs.tsx src/lib/library/image-file.ts src/components/library/useLibraryList.ts src/components/library/LibrarySearchInput.tsx src/components/library/ItemActionsMenu.tsx src/components/library/RenameDialog.tsx src/components/library/LibraryGrid.tsx src/components/library/LibraryView.tsx src/components/library/PersonasTab.tsx src/components/library/LogosTab.tsx src/components/library/InspirationsTab.tsx src/app/bibliotheque/page.tsx
git commit -m "feat(library): /bibliotheque page shell with tabs in the URL" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Personnages tab — create, rename, replace an angle, delete

**Files:**
- Modify: `src/components/library/PersonasTab.tsx` (replace the whole file)
- Create: `src/components/library/ReplaceAngleDialog.tsx`

**Interfaces:**
- Consumes: `useLibraryList`, `LibrarySearchInput`, `ItemActionsMenu`, `RenameDialog`, `LibraryGrid`, `LibraryGridSkeleton`, `fileToDataUrl`, `PHOTO_IMPORT` (Task 8); `filterBySearch` (Task 1); `ConfirmDialog`, `PersonaImportDialog`, `WebcamCaptureModal`, `lib/personas` helpers (earlier chantiers); routes `GET/POST /api/personas`, `PATCH/DELETE /api/personas/[id]`, `POST /api/personas/[id]/photos` (Task 2 refuses zero photos).
- Produces: `PersonasTab` default export (no props); `ReplaceAngleDialog` default export, props `{ persona: PersonaSummary; photoVersion: number; onClose: () => void; onReplaced: () => Promise<void> }`.

- [ ] **Step 1: Write the replace-angle dialog**

Create `src/components/library/ReplaceAngleDialog.tsx`:

```tsx
"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PHOTO_IMPORT, fileToDataUrl } from "@/lib/library/image-file";
import { PERSONA_ANGLES, PERSONA_ANGLE_LABELS, personaImageUrl, type PersonaAngle, type PersonaSummary } from "@/lib/personas";

/** « Remplacer un angle »: pick the angle's tile, then a photo — uploaded right away. */
export default function ReplaceAngleDialog({
  persona,
  photoVersion,
  onClose,
  onReplaced,
}: {
  persona: PersonaSummary;
  photoVersion: number;
  onClose: () => void;
  onReplaced: () => Promise<void>;
}) {
  const [busyAngle, setBusyAngle] = useState<PersonaAngle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const replace = async (angle: PersonaAngle, file: File | undefined) => {
    if (!file) return;
    setBusyAngle(angle);
    setError(null);
    try {
      const dataUrl = await fileToDataUrl(file, PHOTO_IMPORT);
      const res = await fetch(`/api/personas/${encodeURIComponent(persona.id)}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ angle, dataUrl }),
      });
      if (!res.ok) {
        setError(`Remplacement impossible (HTTP ${res.status}).`);
        return;
      }
      await onReplaced();
      onClose();
    } catch {
      setError("Remplacement impossible — vérifie l'image et ta connexion.");
    } finally {
      setBusyAngle(null);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remplacer un angle</DialogTitle>
          <DialogDescription>Choisis l&apos;angle de « {persona.label} » à remplacer, puis sa nouvelle photo.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2">
          {PERSONA_ANGLES.map((angle) => (
            <label key={angle} className="group flex cursor-pointer flex-col gap-1.5">
              <span className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted/40 transition-colors group-hover:border-primary">
                {persona.angles.includes(angle) ? (
                  <img
                    src={`${personaImageUrl(persona.id, angle)}&v=${photoVersion}`}
                    alt={PERSONA_ANGLE_LABELS[angle]}
                    className="size-full object-cover"
                  />
                ) : (
                  <ImagePlus className="size-5 text-muted-foreground" />
                )}
              </span>
              <span className="text-center text-xs text-muted-foreground">
                {busyAngle === angle ? "Envoi…" : PERSONA_ANGLE_LABELS[angle]}
              </span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={busyAngle !== null}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void replace(angle, file);
                }}
              />
            </label>
          ))}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Write the tab**

Replace the whole content of `src/components/library/PersonasTab.tsx` with:

```tsx
"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { Camera, ImagePlus, Pencil, Plus, Trash2, Upload, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import PersonaImportDialog from "@/components/panels/PersonaImportDialog";
import WebcamCaptureModal from "@/components/panels/WebcamCaptureModal";
import ConfirmDialog from "@/components/settings/ConfirmDialog";
import { PHOTO_IMPORT, fileToDataUrl } from "@/lib/library/image-file";
import { filterBySearch } from "@/lib/library/library-items";
import { PERSONA_ANGLES, PERSONA_ANGLE_LABELS, personaImageUrl, type PersonaAngle, type PersonaSummary } from "@/lib/personas";
import ItemActionsMenu from "./ItemActionsMenu";
import { LibraryGrid, LibraryGridSkeleton } from "./LibraryGrid";
import LibrarySearchInput from "./LibrarySearchInput";
import RenameDialog from "./RenameDialog";
import ReplaceAngleDialog from "./ReplaceAngleDialog";
import { useLibraryList } from "./useLibraryList";

type CreationStep = "choice" | "webcam" | "import";

export default function PersonasTab() {
  const { items, error: loadError, reload } = useLibraryList<PersonaSummary>("/api/personas");
  const [query, setQuery] = useState("");
  const [creation, setCreation] = useState<CreationStep | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<PersonaSummary | null>(null);
  const [replacing, setReplacing] = useState<PersonaSummary | null>(null);
  const [deleting, setDeleting] = useState<PersonaSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  // Appended to image URLs: a replaced angle keeps the same URL (60 s browser cache).
  const [photoVersion, setPhotoVersion] = useState(0);

  const visible = items ? filterBySearch(items, (persona) => persona.label, query) : null;

  // Webcam wizard (3 angles + name) and per-angle import (front required) share this.
  const savePersona = async (photos: Partial<Record<PersonaAngle, string>>, name: string) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: name || `Personnage ${(items?.length ?? 0) + 1}`, photos }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Échec de l'enregistrement du personnage — réessaie.");
        setCreation(null);
        return;
      }
      setCreation(null);
      await reload();
    } catch {
      setError("Échec de l'enregistrement du personnage — vérifie ta connexion et réessaie.");
      setCreation(null);
    } finally {
      setSaving(false);
    }
  };

  const rename = async (persona: PersonaSummary, label: string): Promise<string | null> => {
    const res = await fetch(`/api/personas/${encodeURIComponent(persona.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    }).catch(() => null);
    if (!res?.ok) return "Renommage impossible — réessaie.";
    await reload();
    return null;
  };

  const remove = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/personas/${encodeURIComponent(deleting.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDeleting(null);
      await reload();
    } catch {
      setError("Suppression impossible — réessaie.");
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <LibrarySearchInput
          value={query}
          onChange={setQuery}
          placeholder="Rechercher un personnage"
          label="Rechercher un personnage"
          className="max-w-sm flex-1"
        />
        <Button onClick={() => setCreation("choice")} disabled={saving}>
          <Plus />
          {saving ? "Enregistrement…" : "Nouveau personnage"}
        </Button>
      </div>

      {(error || loadError) && (
        <Alert variant="destructive">
          <AlertDescription>{error ?? loadError}</AlertDescription>
        </Alert>
      )}

      {visible === null && <LibraryGridSkeleton aspect="aspect-[3/1]" />}

      {items?.length === 0 && (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>Aucun personnage</EmptyTitle>
            <EmptyDescription>
              Crée ton personnage (ton visage sous trois angles) pour des miniatures qui te ressemblent.
            </EmptyDescription>
          </EmptyHeader>
          <Button onClick={() => setCreation("choice")}>
            <Plus />
            Nouveau personnage
          </Button>
        </Empty>
      )}

      {items && items.length > 0 && visible?.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucun personnage ne correspond à « {query.trim()} ».</p>
      )}

      {visible && visible.length > 0 && (
        <LibraryGrid>
          {visible.map((persona) => (
            <Card key={persona.id} className="gap-3 pt-0">
              <div className="grid grid-cols-3 gap-px bg-border">
                {PERSONA_ANGLES.map((angle) =>
                  persona.angles.includes(angle) ? (
                    <img
                      key={angle}
                      src={`${personaImageUrl(persona.id, angle)}&v=${photoVersion}`}
                      alt={`${persona.label} — ${PERSONA_ANGLE_LABELS[angle]}`}
                      loading="lazy"
                      className="aspect-square w-full bg-muted object-cover"
                    />
                  ) : (
                    <div
                      key={angle}
                      title={PERSONA_ANGLE_LABELS[angle]}
                      className="flex aspect-square w-full items-center justify-center bg-muted text-sm text-muted-foreground"
                    >
                      —
                    </div>
                  ),
                )}
              </div>
              <CardHeader>
                <CardTitle className="truncate" title={persona.label}>
                  {persona.label}
                </CardTitle>
                <CardAction className="flex items-center gap-1">
                  <Badge variant="secondary">{persona.angles.length}/3</Badge>
                  <ItemActionsMenu
                    itemLabel={persona.label}
                    actions={[
                      { label: "Renommer", icon: Pencil, onClick: () => setRenaming(persona) },
                      { label: "Remplacer un angle", icon: ImagePlus, onClick: () => setReplacing(persona) },
                      { label: "Supprimer", icon: Trash2, onClick: () => setDeleting(persona), destructive: true },
                    ]}
                  />
                </CardAction>
              </CardHeader>
            </Card>
          ))}
        </LibraryGrid>
      )}

      <Dialog open={creation === "choice"} onOpenChange={(open) => setCreation(open ? "choice" : null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nouveau personnage</DialogTitle>
            <DialogDescription>
              Ton visage sous trois angles (face, profil gauche, profil droit) pour des miniatures qui te ressemblent.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button variant="outline" className="justify-start" onClick={() => setCreation("webcam")}>
              <Camera />
              Capturer avec la webcam
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => setCreation("import")}>
              <Upload />
              Importer une photo par angle
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {creation === "webcam" && <WebcamCaptureModal onClose={() => setCreation(null)} onComplete={savePersona} />}

      {creation === "import" && (
        <PersonaImportDialog
          onClose={() => setCreation(null)}
          prepareFile={(file) => fileToDataUrl(file, PHOTO_IMPORT)}
          onSubmit={savePersona}
          saving={saving}
        />
      )}

      {renaming && (
        <RenameDialog
          key={renaming.id}
          open
          onOpenChange={(open) => {
            if (!open) setRenaming(null);
          }}
          title="Renommer le personnage"
          description="Le nouveau nom apparaît dans la bibliothèque et dans les nœuds Personnage."
          initialValue={renaming.label}
          maxLength={100}
          onSubmit={(label) => rename(renaming, label)}
        />
      )}

      {replacing && (
        <ReplaceAngleDialog
          key={replacing.id}
          persona={replacing}
          photoVersion={photoVersion}
          onClose={() => setReplacing(null)}
          onReplaced={async () => {
            setPhotoVersion((version) => version + 1);
            await reload();
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Supprimer « ${deleting?.label ?? ""} » ?`}
        description="Ses photos sont effacées. Les miniatures qui l'utilisent afficheront un nœud Personnage vide."
        confirmLabel="Supprimer"
        busy={deleteBusy}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
```

- [ ] **Step 3: Type-check and lint**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/components/library/PersonasTab.tsx src/components/library/ReplaceAngleDialog.tsx
```

Expected: `tsc` exits 0, no eslint error.

- [ ] **Step 4: Check in the browser (throwaway dev server, port 3100)**

Start the dev server, then seed one Personnage (1×1 PNG):

```bash
PNG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZkqfO0AAAAASUVORK5CYII="
curl -s -X POST http://localhost:3100/api/personas -H 'content-type: application/json' \
  -d "{\"label\":\"Élodie test\",\"photos\":{\"front\":\"data:image/png;base64,$PNG\",\"left\":\"data:image/png;base64,$PNG\"}}"
```

Open `http://localhost:3100/bibliotheque` and check:
- Card « Élodie test »: Face and Profil gauche images, « — » for Profil droit, badge « 2/3 ».
- Search `elodie` keeps the card; `zzz` shows « Aucun personnage ne correspond à « zzz ». ».
- « … » → « Renommer » → `Élodie renommée` → « Renommer » → the card updates.
- « … » → « Remplacer un angle » → the dialog shows the 3 angle tiles; choose any small image for « Profil droit » → dialog closes, badge « 3/3 » (skip the file pick if the browser tool cannot choose files).
- « Nouveau personnage » → the dialog offers « Capturer avec la webcam » and « Importer une photo par angle »; « Importer une photo par angle » → « Créer le personnage » stays disabled without a Face photo; cancel. « Capturer avec la webcam » opens the wizard; close it without capturing.
- `curl -s -X POST http://localhost:3100/api/personas -H 'content-type: application/json' -d '{"label":"Vide","photos":{}}'` → `{"error":"Ajoute au moins une photo du personnage."}`.
- « … » → « Supprimer » → « Supprimer « Élodie renommée » ? » → « Supprimer » → the empty state « Aucun personnage » with its « Nouveau personnage » button. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/components/library/PersonasTab.tsx src/components/library/ReplaceAngleDialog.tsx
git commit -m "feat(library): Personnages tab — create, rename, replace an angle, delete" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: Inspirations tab — « Mes images » and the « Chaînes suivies » section

**Files:**
- Modify: `src/components/library/InspirationsTab.tsx` (replace the whole file)
- Create: `src/components/library/MyImagesSection.tsx`
- Create: `src/components/library/FollowedChannelsSection.tsx`

**Interfaces:**
- Consumes: `useLibraryList`, `LibrarySearchInput`, `ItemActionsMenu`, `RenameDialog`, `LibraryGrid`, `LibraryGridSkeleton`, `fileToDataUrl`, `PHOTO_IMPORT` (Task 8); `filterBySearch`, `swipeImageUrl`, `fileBaseName`, `type LibrarySwipe` (Task 1); `POST /api/swipe-files/rename` (Task 3); existing `GET/POST/DELETE /api/swipe-files`, `GET /api/youtube/playlist` (`{ items: { videoId, title, thumbnailUrl, addedAt }[], configured?: boolean, error?: string }`); `ConfirmDialog`.
- Produces (shared contract with chantier D):
  - `src/components/library/FollowedChannelsSection.tsx` — **default export, no props**. « Chaînes suivies » + badge « Bientôt », read-only « Ma chaîne » feed from `/api/youtube/playlist`, owns the `window` listener for `youtube-channel-saved` (refetches the feed). Chantier D rewrites this file entirely.
  - `InspirationsTab` renders `<MyImagesSection />` then `<FollowedChannelsSection />`.
  - `MyImagesSection` default export (no props).

- [ ] **Step 1: « Mes images »**

Create `src/components/library/MyImagesSection.tsx`:

```tsx
"use client";

/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from "react";
import { ImagePlus, Pencil, Trash2, Upload } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import ConfirmDialog from "@/components/settings/ConfirmDialog";
import { PHOTO_IMPORT, fileToDataUrl } from "@/lib/library/image-file";
import { fileBaseName, filterBySearch, swipeImageUrl, type LibrarySwipe } from "@/lib/library/library-items";
import ItemActionsMenu from "./ItemActionsMenu";
import { LibraryGrid, LibraryGridSkeleton } from "./LibraryGrid";
import LibrarySearchInput from "./LibrarySearchInput";
import RenameDialog from "./RenameDialog";
import { useLibraryList } from "./useLibraryList";

export default function MyImagesSection() {
  const { items, error: loadError, reload } = useLibraryList<LibrarySwipe>("/api/swipe-files");
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<LibrarySwipe | null>(null);
  const [deleting, setDeleting] = useState<LibrarySwipe | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const visible = items ? filterBySearch(items, (image) => image.title, query) : null;

  const importFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    let failed = 0;
    for (const file of files) {
      try {
        const dataUrl = await fileToDataUrl(file, PHOTO_IMPORT);
        const res = await fetch("/api/swipe-files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl, title: fileBaseName(file.name) }),
        });
        if (!res.ok) failed += 1;
      } catch {
        failed += 1;
      }
    }
    setUploading(false);
    if (failed > 0) setError(failed === 1 ? "Une image n'a pas pu être importée." : `${failed} images n'ont pas pu être importées.`);
    await reload();
  };

  const rename = async (image: LibrarySwipe, title: string): Promise<string | null> => {
    const res = await fetch("/api/swipe-files/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: image.filename, title }),
    }).catch(() => null);
    if (!res?.ok) return "Renommage impossible — réessaie.";
    await reload();
    return null;
  };

  const remove = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/swipe-files?filename=${encodeURIComponent(deleting.filename)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await reload();
    } catch {
      setError("Suppression impossible — réessaie.");
    } finally {
      setDeleting(null);
      setDeleteBusy(false);
    }
  };

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-heading text-lg font-medium">Mes images</h2>
          <p className="text-sm text-muted-foreground">Miniatures et visuels importés, à utiliser comme images de référence.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LibrarySearchInput value={query} onChange={setQuery} placeholder="Rechercher une image" label="Rechercher une image" className="w-64" />
          <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
            <Upload />
            {uploading ? "Import…" : "Importer des images"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              void importFiles(files);
            }}
          />
        </div>
      </div>

      {(error || loadError) && (
        <Alert variant="destructive">
          <AlertDescription>{error ?? loadError}</AlertDescription>
        </Alert>
      )}

      {visible === null && <LibraryGridSkeleton />}

      {items?.length === 0 && (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ImagePlus />
            </EmptyMedia>
            <EmptyTitle>Aucune image importée</EmptyTitle>
            <EmptyDescription>Importe des miniatures qui t&apos;inspirent pour t&apos;en servir comme références.</EmptyDescription>
          </EmptyHeader>
          <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
            <Upload />
            Importer des images
          </Button>
        </Empty>
      )}

      {items && items.length > 0 && visible?.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucune image ne correspond à « {query.trim()} ».</p>
      )}

      {visible && visible.length > 0 && (
        <LibraryGrid>
          {visible.map((image) => (
            <Card key={image.filename} size="sm" className="gap-2 pt-0">
              <img
                src={swipeImageUrl(image.filename)}
                alt={image.title}
                loading="lazy"
                className="aspect-video w-full bg-muted object-cover"
              />
              <CardHeader>
                <CardTitle className="truncate text-sm" title={image.title}>
                  {image.title}
                </CardTitle>
                <CardAction>
                  <ItemActionsMenu
                    itemLabel={image.title}
                    actions={[
                      { label: "Renommer", icon: Pencil, onClick: () => setRenaming(image) },
                      { label: "Supprimer", icon: Trash2, onClick: () => setDeleting(image), destructive: true },
                    ]}
                  />
                </CardAction>
              </CardHeader>
            </Card>
          ))}
        </LibraryGrid>
      )}

      {renaming && (
        <RenameDialog
          key={renaming.filename}
          open
          onOpenChange={(open) => {
            if (!open) setRenaming(null);
          }}
          title="Renommer l'image"
          description="Le nom sert à la retrouver dans la bibliothèque et dans les nœuds."
          initialValue={renaming.title}
          maxLength={200}
          onSubmit={(title) => rename(renaming, title)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Supprimer « ${deleting?.title ?? ""} » ?`}
        description="L'image est effacée de la bibliothèque. Les nœuds qui l'utilisent afficheront leur état vide."
        confirmLabel="Supprimer"
        busy={deleteBusy}
        onConfirm={() => void remove()}
      />
    </section>
  );
}
```

- [ ] **Step 2: « Chaînes suivies — Bientôt » with the read-only « Ma chaîne » feed**

Create `src/components/library/FollowedChannelsSection.tsx`:

```tsx
"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Tv } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type PlaylistItem = { videoId: string; title: string; thumbnailUrl: string; addedAt: string };
type PlaylistResponse = { items?: PlaylistItem[]; configured?: boolean; error?: string };
type FeedState =
  | { status: "loading" }
  | { status: "unconfigured" }
  | { status: "error" }
  | { status: "ready"; items: PlaylistItem[] };

/**
 * « Chaînes suivies » of the Inspirations tab. Until chantier D ships it, the
 * section shows the read-only « Ma chaîne » feed that used to live in the sidebar.
 */
export default function FollowedChannelsSection() {
  const [feed, setFeed] = useState<FeedState>({ status: "loading" });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/youtube/playlist", { cache: "no-store" });
      const body = (await res.json()) as PlaylistResponse;
      if (body.configured === false) setFeed({ status: "unconfigured" });
      else if (body.error || !res.ok) setFeed({ status: "error" });
      else setFeed({ status: "ready", items: body.items ?? [] });
    } catch {
      setFeed({ status: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Saving « Ma chaîne » in Réglages (ChaineSection) dispatches this event.
  useEffect(() => {
    const handler = () => {
      void load();
    };
    window.addEventListener("youtube-channel-saved", handler);
    return () => window.removeEventListener("youtube-channel-saved", handler);
  }, [load]);

  return (
    <section className="grid gap-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-heading text-lg font-medium">Chaînes suivies</h2>
          <Badge variant="secondary">Bientôt</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Bientôt : suis ta chaîne et d&apos;autres chaînes, avec les vues et les miniatures qui marchent. En attendant, voici
          les vidéos de ta chaîne.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tv className="size-4" />
            Ma chaîne
          </CardTitle>
          <CardDescription>Lecture seule. La chaîne se règle dans Réglages → Ma chaîne.</CardDescription>
        </CardHeader>
        <CardContent>
          {feed.status === "loading" && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((index) => (
                <Skeleton key={index} className="aspect-video w-full rounded-lg" />
              ))}
            </div>
          )}
          {feed.status === "unconfigured" && (
            <p className="text-sm text-muted-foreground">
              Ajoute ta clé YouTube et ta chaîne pour voir tes vidéos ici :{" "}
              <Link href="/reglages/chaine" className="underline underline-offset-4 hover:text-foreground">
                Réglages → Ma chaîne
              </Link>
              .
            </p>
          )}
          {feed.status === "error" && (
            <p className="text-sm text-destructive">Impossible de charger les vidéos de ta chaîne pour l&apos;instant.</p>
          )}
          {feed.status === "ready" && feed.items.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucune vidéo trouvée sur ta chaîne.</p>
          )}
          {feed.status === "ready" && feed.items.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {feed.items.map((item) => (
                <figure key={item.videoId} className="grid gap-1.5">
                  <img src={item.thumbnailUrl} alt={item.title} loading="lazy" className="aspect-video w-full rounded-lg bg-muted object-cover" />
                  <figcaption className="line-clamp-2 text-xs text-muted-foreground">{item.title}</figcaption>
                </figure>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
```

- [ ] **Step 3: The tab**

Replace the whole content of `src/components/library/InspirationsTab.tsx` with:

```tsx
"use client";

import FollowedChannelsSection from "./FollowedChannelsSection";
import MyImagesSection from "./MyImagesSection";

export default function InspirationsTab() {
  return (
    <div className="grid gap-10">
      <MyImagesSection />
      <FollowedChannelsSection />
    </div>
  );
}
```

- [ ] **Step 4: Type-check and lint**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/components/library/InspirationsTab.tsx src/components/library/MyImagesSection.tsx src/components/library/FollowedChannelsSection.tsx
```

Expected: `tsc` exits 0, no eslint error.

- [ ] **Step 5: Check in the browser (throwaway dev server, port 3100)**

Start the dev server and seed one image:

```bash
PNG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZkqfO0AAAAASUVORK5CYII="
curl -s -X POST http://localhost:3100/api/swipe-files -H 'content-type: application/json' \
  -d "{\"dataUrl\":\"data:image/png;base64,$PNG\",\"title\":\"Réaction choquée\"}"
```

Open `http://localhost:3100/bibliotheque?onglet=inspirations` and check:
- « Mes images » shows « Réaction choquée »; search `reaction` keeps it, `zzz` shows « Aucune image ne correspond à « zzz ». ».
- « … » → « Renommer » → `Réaction test` → the card updates (and `curl -s http://localhost:3100/api/swipe-files` shows the new title).
- « Importer des images » → pick two small images → both appear (skip if files cannot be chosen).
- « … » → « Supprimer » → confirm → the card disappears; when none is left, the empty state « Aucune image importée » shows.
- « Chaînes suivies » with badge « Bientôt »; the throwaway DB has no YouTube key → « Ma chaîne » says « Ajoute ta clé YouTube et ta chaîne… » with the link to Réglages → Ma chaîne. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/components/library/InspirationsTab.tsx src/components/library/MyImagesSection.tsx src/components/library/FollowedChannelsSection.tsx
git commit -m "feat(library): Inspirations tab — my images and the upcoming followed channels section" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 11: Logos tab — online search with « Ajouter », import, « Mes logos »

**Files:**
- Modify: `src/components/library/LogosTab.tsx` (replace the whole file)
- Create: `src/components/library/useLogoSearch.ts`
- Create: `src/components/library/LogoPreview.tsx`
- Create: `src/components/library/LogoSearchResults.tsx`
- Create: `src/components/library/MyLogosSection.tsx`

**Interfaces:**
- Consumes: `LOGO_SEARCH_MIN_CHARS`, `SEARCH_UNAVAILABLE_MESSAGE`, `LOGO_SOURCE_LABELS`, `LOGO_VARIANT_LABELS`, `unavailableNotice`, `searchEmptyMessage`, `type LogoSearchResponse`, `type LogoSearchResult`, `type AddedLogo` (Task 6); `GET /api/logos/search` (Task 6), `POST /api/logos/add` (Task 7), `GET /api/logos` with `remote` (Task 5), existing `POST /api/logos`, `POST /api/logos/rename` (`{ filename, label }`), `DELETE /api/logos?filename=`; Task 8 blocks; `logoImageUrl`, `filterBySearch`, `fileBaseName`, `type LibraryLogo` (Task 1).
- Produces (Task 12 reuses them in the node picker):
  - `useLogoSearch(rawQuery: string): LogoSearchState`, `type LogoSearchState = { status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "done"; response: LogoSearchResponse }`, `LOGO_SEARCH_DEBOUNCE_MS = 300`.
  - `LogoPreview` default export, props `{ src: string; alt: string; className?: string; onError?: () => void }` (logo on a transparency checkerboard, `aspect-[4/3]`).
  - `LogoSearchResults` default export, props `{ query: string; onAdded: (logo: AddedLogo) => void; compact?: boolean }`.
  - `MyLogosSection` default export, props `{ logos: LibraryLogo[] | null; loadError: string | null; query: string; onChanged: () => Promise<void>; onImport: () => void }`.
  - `LogosTab` default export (no props).

- [ ] **Step 1: The debounced search hook and the preview frame**

Create `src/components/library/useLogoSearch.ts`:

```ts
"use client";

import { useEffect, useState } from "react";
import { LOGO_SEARCH_MIN_CHARS, SEARCH_UNAVAILABLE_MESSAGE, type LogoSearchResponse } from "@/lib/logos/shared";

export const LOGO_SEARCH_DEBOUNCE_MS = 300;

export type LogoSearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; response: LogoSearchResponse };

type Settled = { query: string; response: LogoSearchResponse | null };

/** GET /api/logos/search after a pause in typing; the answer is kept per query. */
export function useLogoSearch(rawQuery: string): LogoSearchState {
  const query = rawQuery.trim();
  const active = query.length >= LOGO_SEARCH_MIN_CHARS;
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/logos/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const response = (await res.json()) as LogoSearchResponse;
        setSettled({ query, response });
      } catch {
        if (controller.signal.aborted) return;
        setSettled({ query, response: null });
      }
    }, LOGO_SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [active, query]);

  if (!active) return { status: "idle" };
  if (!settled || settled.query !== query) return { status: "loading" };
  if (!settled.response) return { status: "error", message: SEARCH_UNAVAILABLE_MESSAGE };
  return { status: "done", response: settled.response };
}
```

Create `src/components/library/LogoPreview.tsx`:

```tsx
"use client";

/* eslint-disable @next/next/no-img-element */

import { cn } from "cn";

/** A logo on a transparency checkerboard, so light and dark logos both stay visible. */
export default function LogoPreview({
  src,
  alt,
  className,
  onError,
}: {
  src: string;
  alt: string;
  className?: string;
  onError?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex aspect-[4/3] w-full items-center justify-center bg-background bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-size-[16px_16px] p-4",
        className,
      )}
    >
      <img src={src} alt={alt} loading="lazy" onError={onError} className="max-h-full max-w-full object-contain" />
    </div>
  );
}
```

- [ ] **Step 2: Search results with « Ajouter »**

Create `src/components/library/LogoSearchResults.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  LOGO_SOURCE_LABELS,
  LOGO_VARIANT_LABELS,
  searchEmptyMessage,
  unavailableNotice,
  type AddedLogo,
  type LogoSearchResult,
} from "@/lib/logos/shared";
import { LibraryGrid, LibraryGridSkeleton } from "./LibraryGrid";
import LogoPreview from "./LogoPreview";
import { useLogoSearch } from "./useLogoSearch";

/** Merged online results; « Ajouter » saves one in the library (PNG or Brandfetch reference). */
export default function LogoSearchResults({
  query,
  onAdded,
  compact = false,
}: {
  query: string;
  onAdded: (logo: AddedLogo) => void;
  compact?: boolean;
}) {
  const search = useLogoSearch(query);
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, AddedLogo>>({});
  const [error, setError] = useState<string | null>(null);

  const add = async (result: LogoSearchResult) => {
    setAdding(result.key);
    setError(null);
    try {
      const res = await fetch("/api/logos/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: result.source, ref: result.ref, name: result.name }),
      });
      const body = (await res.json().catch(() => ({}))) as Partial<AddedLogo> & { error?: string };
      if (!res.ok || typeof body.filename !== "string") {
        setError(body.error ?? `Ajout impossible (HTTP ${res.status}).`);
        return;
      }
      const logo: AddedLogo = { filename: body.filename, label: body.label ?? result.name, remote: Boolean(body.remote) };
      setAdded((previous) => ({ ...previous, [result.key]: logo }));
      onAdded(logo);
    } catch {
      setError("Ajout impossible — vérifie ta connexion.");
    } finally {
      setAdding(null);
    }
  };

  const gridClass = compact ? "sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3" : undefined;

  if (search.status === "idle") {
    return <p className="text-sm text-muted-foreground">Tape au moins 2 caractères pour chercher un logo en ligne.</p>;
  }
  if (search.status === "loading") return <LibraryGridSkeleton count={compact ? 3 : 4} aspect="aspect-[4/3]" />;
  if (search.status === "error") {
    return (
      <Alert variant="destructive">
        <AlertDescription>{search.message}</AlertDescription>
      </Alert>
    );
  }

  const { response } = search;
  const notice = unavailableNotice(response.unavailable);
  const empty = searchEmptyMessage(response, query.trim());

  return (
    <div className="grid gap-3">
      {notice && !empty && <p className="text-xs text-muted-foreground">{notice}</p>}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {empty ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <LibraryGrid className={gridClass}>
          {response.results.map((result) => {
            const done = added[result.key];
            return (
              <Card key={result.key} size="sm" className="gap-2 pt-0">
                <LogoPreview src={result.previewUrl} alt={result.name} />
                <CardContent className="grid gap-1.5">
                  <p className="truncate text-sm font-medium" title={result.name}>
                    {result.name}
                  </p>
                  {result.detail && <p className="truncate text-xs text-muted-foreground">{result.detail}</p>}
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline">{LOGO_SOURCE_LABELS[result.source]}</Badge>
                    {result.variant && <Badge variant="secondary">{LOGO_VARIANT_LABELS[result.variant]}</Badge>}
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    size="sm"
                    variant={done ? "secondary" : "default"}
                    className="w-full"
                    disabled={Boolean(done) || adding !== null}
                    onClick={() => void add(result)}
                  >
                    {done ? <Check /> : <Plus />}
                    {done ? "Ajouté" : adding === result.key ? "Ajout…" : "Ajouter"}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </LibraryGrid>
      )}
    </div>
  );
}
```

- [ ] **Step 3: « Mes logos »**

Create `src/components/library/MyLogosSection.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ImageOff, Pencil, Shapes, Trash2, Upload } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import ConfirmDialog from "@/components/settings/ConfirmDialog";
import { filterBySearch, logoImageUrl, type LibraryLogo } from "@/lib/library/library-items";
import ItemActionsMenu from "./ItemActionsMenu";
import { LibraryGrid, LibraryGridSkeleton } from "./LibraryGrid";
import LogoPreview from "./LogoPreview";
import RenameDialog from "./RenameDialog";

function LogoCard({ logo, onRename, onDelete }: { logo: LibraryLogo; onRename: () => void; onDelete: () => void }) {
  // A remote logo whose key was removed, or that Brandfetch refuses, answers 404.
  const [unavailable, setUnavailable] = useState(false);
  return (
    <Card size="sm" className="gap-2 pt-0">
      {unavailable ? (
        <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-muted p-4 text-center">
          <ImageOff className="size-5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Logo indisponible</p>
          <Button size="xs" variant="destructive" onClick={onDelete}>
            Supprimer
          </Button>
        </div>
      ) : (
        <LogoPreview src={logoImageUrl(logo.filename)} alt={logo.label} onError={() => setUnavailable(true)} />
      )}
      <CardHeader>
        <CardTitle className="truncate text-sm" title={logo.label}>
          {logo.label}
        </CardTitle>
        <CardAction className="flex items-center gap-1">
          {logo.remote && <Badge variant="outline">Brandfetch</Badge>}
          <ItemActionsMenu
            itemLabel={logo.label}
            actions={[
              { label: "Renommer", icon: Pencil, onClick: onRename },
              { label: "Supprimer", icon: Trash2, onClick: onDelete, destructive: true },
            ]}
          />
        </CardAction>
      </CardHeader>
    </Card>
  );
}

export default function MyLogosSection({
  logos,
  loadError,
  query,
  onChanged,
  onImport,
}: {
  logos: LibraryLogo[] | null;
  loadError: string | null;
  query: string;
  onChanged: () => Promise<void>;
  onImport: () => void;
}) {
  const [renaming, setRenaming] = useState<LibraryLogo | null>(null);
  const [deleting, setDeleting] = useState<LibraryLogo | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = logos ? filterBySearch(logos, (logo) => logo.label, query) : null;

  const rename = async (logo: LibraryLogo, label: string): Promise<string | null> => {
    const res = await fetch("/api/logos/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: logo.filename, label }),
    }).catch(() => null);
    if (!res?.ok) return "Renommage impossible — réessaie.";
    await onChanged();
    return null;
  };

  const remove = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/logos?filename=${encodeURIComponent(deleting.filename)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await onChanged();
    } catch {
      setError("Suppression impossible — réessaie.");
    } finally {
      setDeleting(null);
      setDeleteBusy(false);
    }
  };

  return (
    <section className="grid gap-3">
      <h2 className="font-heading text-lg font-medium">Mes logos</h2>

      {(error || loadError) && (
        <Alert variant="destructive">
          <AlertDescription>{error ?? loadError}</AlertDescription>
        </Alert>
      )}

      {visible === null && <LibraryGridSkeleton aspect="aspect-[4/3]" />}

      {logos?.length === 0 && (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Shapes />
            </EmptyMedia>
            <EmptyTitle>Aucun logo enregistré</EmptyTitle>
            <EmptyDescription>Cherche un logo ci-dessus et clique « Ajouter », ou importe une image.</EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" onClick={onImport}>
            <Upload />
            Importer une image
          </Button>
        </Empty>
      )}

      {logos && logos.length > 0 && visible?.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucun de tes logos ne correspond à « {query.trim()} ».</p>
      )}

      {visible && visible.length > 0 && (
        <LibraryGrid>
          {visible.map((logo) => (
            <LogoCard key={logo.filename} logo={logo} onRename={() => setRenaming(logo)} onDelete={() => setDeleting(logo)} />
          ))}
        </LibraryGrid>
      )}

      {renaming && (
        <RenameDialog
          key={renaming.filename}
          open
          onOpenChange={(open) => {
            if (!open) setRenaming(null);
          }}
          title="Renommer le logo"
          description="Le nom sert à le retrouver et indique au modèle quelle marque placer."
          initialValue={renaming.label}
          maxLength={100}
          onSubmit={(label) => rename(renaming, label)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Supprimer « ${deleting?.label ?? ""} » ?`}
        description="Le logo est retiré de la bibliothèque. Les nœuds Logo qui l'utilisent afficheront leur état vide."
        confirmLabel="Supprimer"
        busy={deleteBusy}
        onConfirm={() => void remove()}
      />
    </section>
  );
}
```

- [ ] **Step 4: The tab**

Replace the whole content of `src/components/library/LogosTab.tsx` with:

```tsx
"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LOGO_IMPORT, fileToDataUrl } from "@/lib/library/image-file";
import { fileBaseName, type LibraryLogo } from "@/lib/library/library-items";
import { LOGO_SEARCH_MIN_CHARS } from "@/lib/logos/shared";
import LibrarySearchInput from "./LibrarySearchInput";
import LogoSearchResults from "./LogoSearchResults";
import MyLogosSection from "./MyLogosSection";
import { useLibraryList } from "./useLibraryList";

export default function LogosTab() {
  const { items, error: loadError, reload } = useLibraryList<LibraryLogo>("/api/logos");
  // One field: online search (≥ 2 characters) and filter of « Mes logos ».
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const searching = query.trim().length >= LOGO_SEARCH_MIN_CHARS;

  const importFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setImporting(true);
    setImportError(null);
    let failed = 0;
    for (const file of files) {
      try {
        const dataUrl = await fileToDataUrl(file, LOGO_IMPORT);
        const res = await fetch("/api/logos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl, label: fileBaseName(file.name) }),
        });
        if (!res.ok) failed += 1;
      } catch {
        failed += 1;
      }
    }
    setImporting(false);
    if (failed > 0) setImportError(failed === 1 ? "Un logo n'a pas pu être importé." : `${failed} logos n'ont pas pu être importés.`);
    await reload();
  };

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center gap-2">
        <LibrarySearchInput
          value={query}
          onChange={setQuery}
          placeholder="Chercher un logo (ex. notion, youtube)"
          label="Chercher un logo"
          className="max-w-md flex-1"
        />
        <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={importing}>
          <Upload />
          {importing ? "Import…" : "Importer une image"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            void importFiles(files);
          }}
        />
      </div>

      {importError && (
        <Alert variant="destructive">
          <AlertDescription>{importError}</AlertDescription>
        </Alert>
      )}

      {searching && (
        <section className="grid gap-3">
          <h2 className="font-heading text-lg font-medium">Résultats en ligne</h2>
          <LogoSearchResults query={query} onAdded={() => void reload()} />
        </section>
      )}

      <MyLogosSection logos={items} loadError={loadError} query={query} onChanged={reload} onImport={() => inputRef.current?.click()} />
    </div>
  );
}
```

- [ ] **Step 5: Type-check and lint**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/components/library/LogosTab.tsx src/components/library/useLogoSearch.ts src/components/library/LogoPreview.tsx src/components/library/LogoSearchResults.tsx src/components/library/MyLogosSection.tsx
```

Expected: `tsc` exits 0, no eslint error.

- [ ] **Step 6: Check in the browser (throwaway dev server, port 3100)**

Start the dev server with a named temp DB (the page calls the free SVGL and Wikimedia APIs):

```bash
DEV_DB="$(mktemp -d)/thumbgen.db"; echo "$DEV_DB"
THUMBGEN_DB_PATH="$DEV_DB" ./node_modules/.bin/next dev -p 3100
```

Open `http://localhost:3100/bibliotheque?onglet=logos`:
- Empty « Mes logos » state « Aucun logo enregistré » with « Importer une image ».
- Type `n` → nothing searched; type `nike` → skeletons, then « Résultats en ligne »: Simple Icons « Nike » (badge « Simple Icons », « Couleur ») first, then SVGL and Wikimedia results with their badges; no Brandfetch (no key). If a source is down, the line « SVGL indisponible » (or similar) appears above the grid.
- Search `notion` and `youtube`: SVGL results show « Clair » / « Sombre » badges when both variants exist, and « … (logo texte) » wordmarks.
- « Ajouter » on Simple Icons « YouTube » → button « Ajouté », the logo appears in « Mes logos » (filtered by the same query); `L="$(mktemp -d)/logo.png"; curl -s "http://localhost:3100/api/logos/image?f=<filename from curl -s http://localhost:3100/api/logos>" -o "$L" && file "$L"` → `PNG image data, 1024 x …, 8-bit/color RGBA`.
- « Ajouter » on one SVGL result and one Wikimedia result → both added.
- Search `zzzzqqq` → « Aucun logo trouvé pour « zzzzqqq ». ».
- Clear the field → the online section disappears, « Mes logos » lists everything. « … » → « Renommer » → `Logo test` → updated. « … » → « Supprimer » → confirm → removed.
- « Importer une image » → pick a PNG → it appears in « Mes logos » (skip if files cannot be chosen).
- Seed a remote logo without key to see the unavailable card: `sqlite3 "$DEV_DB" "INSERT INTO logos (id,label,mime_type,size,data,remote_url) VALUES ('remote-test','Nike distant','image/png',0,x'','https://cdn.brandfetch.io/id_0dwKPKT/w/1024/fallback/404/icon.png')"` (the path printed above; skip if `sqlite3` is missing) → reload → card « Nike distant » with badge « Brandfetch », « Logo indisponible » and a « Supprimer » button that deletes it. Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add src/components/library/LogosTab.tsx src/components/library/useLogoSearch.ts src/components/library/LogoPreview.tsx src/components/library/LogoSearchResults.tsx src/components/library/MyLogosSection.tsx
git commit -m "feat(library): Logos tab — online search, add, import, rename and delete" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 12: « Choisir dans la bibliothèque » from Image de référence and Logo nodes

**Files:**
- Create: `src/components/library/picker-grids.tsx`
- Create: `src/components/library/picker-tabs.tsx`
- Create: `src/components/library/LibraryPickerDialog.tsx`
- Modify: `src/components/nodes/SwipeFileNode.tsx`

**Interfaces:**
- Consumes: `useLibraryList`, `LibrarySearchInput` (Task 8); `LogoPreview`, `LogoSearchResults` (Task 11); `filterBySearch`, `logoImageUrl`, `swipeImageUrl`, `type LibraryLogo`, `type LibrarySwipe` (Task 1); `personaImageUrl`, `type PersonaSummary`; `catalogIdForNode` (chantier A); `Tabs` (Task 8).
- Produces — **shared contract with chantier D, verbatim:**
  - `src/components/library/picker-tabs.tsx` exports `type LibraryKind = "personnages" | "logos" | "inspirations"`, `type LibraryPick = { imageUrl: string; label: string }`, `type PickerTab = { id: string; label: string; render: (props: { query: string; onPick: (item: LibraryPick) => void }) => React.ReactNode }`, and `const PICKER_TABS: Record<LibraryKind, PickerTab[]>` — `personnages`: `[{ id: "personnages", label: "Personnages" }]`; `logos`: `[{ id: "mes-logos", label: "Mes logos" }, { id: "chercher-en-ligne", label: "Chercher en ligne" }]`; `inspirations`: `[{ id: "mes-images", label: "Mes images" }]` (chantier D appends « Chaînes suivies » here).
  - `src/components/library/LibraryPickerDialog.tsx` default export, props `{ open: boolean; onOpenChange: (open: boolean) => void; kind: LibraryKind; onPick: (item: LibraryPick) => void }`. It renders one shadcn `Tabs` entry per `PICKER_TABS[kind]` item with a shared search input passed as `query`; picking calls `onPick` then closes; closing resets the query and the tab.
  - `src/components/library/picker-grids.tsx`: `PersonaPickerGrid`, `LogoPickerGrid`, `SwipePickerGrid`, `LogoSearchPicker` (named exports), each with props `{ query: string; onPick: (item: LibraryPick) => void }`. `LogoSearchPicker` adds the result to the library first, then picks `{ imageUrl: logoImageUrl(filename), label }`.
  - `SwipeFileNode`: button « Choisir dans la bibliothèque » opens the dialog on `"logos"` when `catalogIdForNode({ type: "swipeFile", data }) === "logo"`, else `"inspirations"`; a pick sets `{ imageUrl, imageBase64: undefined, label, kind }` (no file duplicated). A `404` on `imageUrl` shows the empty state without rewriting data.

- [ ] **Step 1: The picker grids**

Create `src/components/library/picker-grids.tsx`:

```tsx
"use client";

/* eslint-disable @next/next/no-img-element */

import { cn } from "cn";
import { Skeleton } from "@/components/ui/skeleton";
import { filterBySearch, logoImageUrl, swipeImageUrl, type LibraryLogo, type LibrarySwipe } from "@/lib/library/library-items";
import { personaImageUrl, type PersonaSummary } from "@/lib/personas";
import LogoPreview from "./LogoPreview";
import LogoSearchResults from "./LogoSearchResults";
import type { LibraryPick } from "./picker-tabs";
import { useLibraryList } from "./useLibraryList";

type PickerGridProps = { query: string; onPick: (item: LibraryPick) => void };
type PickerItem = { key: string; imageUrl: string; label: string };

function PickerItemsGrid({
  items,
  query,
  emptyLabel,
  aspect,
  logo = false,
  onPick,
}: {
  items: PickerItem[] | null;
  query: string;
  emptyLabel: string;
  aspect: string;
  logo?: boolean;
  onPick: (item: LibraryPick) => void;
}) {
  if (items === null) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className={cn("w-full rounded-lg", aspect)} />
        ))}
      </div>
    );
  }
  const visible = filterBySearch(items, (item) => item.label, query);
  if (visible.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {items.length === 0 ? emptyLabel : `Aucun résultat pour « ${query.trim()} ».`}
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {visible.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onPick({ imageUrl: item.imageUrl, label: item.label })}
          className="overflow-hidden rounded-lg border text-left transition-colors hover:border-ring focus-visible:border-ring focus-visible:outline-none"
        >
          {logo ? (
            <LogoPreview src={item.imageUrl} alt={item.label} />
          ) : (
            <img src={item.imageUrl} alt={item.label} loading="lazy" className={cn("w-full bg-muted object-cover", aspect)} />
          )}
          <span className="block truncate px-2 py-1.5 text-xs">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

export function PersonaPickerGrid({ query, onPick }: PickerGridProps) {
  const { items } = useLibraryList<PersonaSummary>("/api/personas");
  const pickerItems =
    items === null
      ? null
      : items.flatMap((persona) =>
          persona.angles[0]
            ? [{ key: persona.id, imageUrl: personaImageUrl(persona.id, persona.angles[0]), label: persona.label || "Personnage" }]
            : [],
        );
  return (
    <PickerItemsGrid items={pickerItems} query={query} emptyLabel="Aucun personnage dans ta bibliothèque." aspect="aspect-square" onPick={onPick} />
  );
}

export function LogoPickerGrid({ query, onPick }: PickerGridProps) {
  const { items } = useLibraryList<LibraryLogo>("/api/logos");
  const pickerItems =
    items === null ? null : items.map((logo) => ({ key: logo.filename, imageUrl: logoImageUrl(logo.filename), label: logo.label }));
  return (
    <PickerItemsGrid
      items={pickerItems}
      query={query}
      emptyLabel="Aucun logo enregistré — cherche-le dans l'onglet « Chercher en ligne »."
      aspect="aspect-[4/3]"
      logo
      onPick={onPick}
    />
  );
}

export function SwipePickerGrid({ query, onPick }: PickerGridProps) {
  const { items } = useLibraryList<LibrarySwipe>("/api/swipe-files");
  const pickerItems =
    items === null ? null : items.map((image) => ({ key: image.filename, imageUrl: swipeImageUrl(image.filename), label: image.title }));
  return (
    <PickerItemsGrid
      items={pickerItems}
      query={query}
      emptyLabel="Aucune image importée — ajoute-en depuis la page Bibliothèque."
      aspect="aspect-video"
      onPick={onPick}
    />
  );
}

/** « Chercher en ligne »: the result is added to the library, then placed in the node. */
export function LogoSearchPicker({ query, onPick }: PickerGridProps) {
  return (
    <LogoSearchResults
      query={query}
      compact
      onAdded={(logo) => onPick({ imageUrl: logoImageUrl(logo.filename), label: logo.label })}
    />
  );
}
```

- [ ] **Step 2: The tabs registry (chantier D contract)**

Create `src/components/library/picker-tabs.tsx`:

```tsx
import { LogoPickerGrid, LogoSearchPicker, PersonaPickerGrid, SwipePickerGrid } from "./picker-grids";

export type LibraryKind = "personnages" | "logos" | "inspirations";

export type LibraryPick = { imageUrl: string; label: string };

export type PickerTab = {
  id: string;
  label: string;
  render: (props: { query: string; onPick: (item: LibraryPick) => void }) => React.ReactNode;
};

/** Tabs of LibraryPickerDialog per library kind. Chantier D appends « Chaînes suivies » to `inspirations`. */
export const PICKER_TABS: Record<LibraryKind, PickerTab[]> = {
  personnages: [
    {
      id: "personnages",
      label: "Personnages",
      render: ({ query, onPick }) => <PersonaPickerGrid query={query} onPick={onPick} />,
    },
  ],
  logos: [
    {
      id: "mes-logos",
      label: "Mes logos",
      render: ({ query, onPick }) => <LogoPickerGrid query={query} onPick={onPick} />,
    },
    {
      id: "chercher-en-ligne",
      label: "Chercher en ligne",
      render: ({ query, onPick }) => <LogoSearchPicker query={query} onPick={onPick} />,
    },
  ],
  inspirations: [
    {
      id: "mes-images",
      label: "Mes images",
      render: ({ query, onPick }) => <SwipePickerGrid query={query} onPick={onPick} />,
    },
  ],
};
```

- [ ] **Step 3: The dialog**

Create `src/components/library/LibraryPickerDialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LibrarySearchInput from "./LibrarySearchInput";
import { PICKER_TABS, type LibraryKind, type LibraryPick } from "./picker-tabs";

const COPY: Record<LibraryKind, { title: string; description: string }> = {
  personnages: { title: "Choisir un personnage", description: "Un personnage de ta bibliothèque." },
  logos: {
    title: "Choisir un logo",
    description: "Un logo de ta bibliothèque, ou cherche-le en ligne : il sera ajouté à ta bibliothèque.",
  },
  inspirations: { title: "Choisir une image de référence", description: "Une image de ta bibliothèque." },
};

export default function LibraryPickerDialog({
  open,
  onOpenChange,
  kind,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: LibraryKind;
  onPick: (item: LibraryPick) => void;
}) {
  const tabs = PICKER_TABS[kind];
  const [query, setQuery] = useState("");
  const [tabId, setTabId] = useState<string | null>(null);
  const activeTab = tabs.find((tab) => tab.id === tabId)?.id ?? tabs[0]?.id;

  const changeOpen = (next: boolean) => {
    if (!next) {
      setQuery("");
      setTabId(null);
    }
    onOpenChange(next);
  };

  const pick = (item: LibraryPick) => {
    onPick(item);
    changeOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      {/* nokey: React Flow's delete-key handler ignores Backspace pressed in here. */}
      <DialogContent className="nokey flex max-h-[85vh] flex-col gap-4 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{COPY[kind].title}</DialogTitle>
          <DialogDescription>{COPY[kind].description}</DialogDescription>
        </DialogHeader>
        <LibrarySearchInput value={query} onChange={setQuery} placeholder="Rechercher" label="Rechercher dans la bibliothèque" />
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            if (typeof value === "string") setTabId(value);
          }}
          className="min-h-0 flex-1"
        >
          <TabsList>
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="min-h-0 overflow-y-auto pr-1">
              {tab.render({ query, onPick: pick })}
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Wire it into `SwipeFileNode`**

In `src/components/nodes/SwipeFileNode.tsx`, replace:

```ts
import { Handle, Position, NodeProps } from "@xyflow/react";
import { useCanvasStore, AppNode } from "@/store/canvas-store";
import { useCallback, useRef, useEffect, useState } from "react";
import NodeShell from "./NodeShell";
```

with:

```ts
import { Handle, Position, NodeProps } from "@xyflow/react";
import { useCanvasStore, AppNode } from "@/store/canvas-store";
import { useCallback, useRef, useEffect, useState } from "react";
import { Library } from "lucide-react";
import LibraryPickerDialog from "@/components/library/LibraryPickerDialog";
import type { LibraryPick } from "@/components/library/picker-tabs";
import { catalogIdForNode } from "@/lib/canvas/node-catalog";
import NodeShell from "./NodeShell";
```

Replace:

```ts
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (data.imageUrl && !data.imageBase64) {
      fetch(data.imageUrl)
        .then((r) => r.blob())
        .then((blob) => {
          const reader = new FileReader();
          reader.onload = () => {
            updateNodeData(id, { imageBase64: reader.result as string });
          };
          reader.readAsDataURL(blob);
        })
        .catch(() => {});
    }
  }, [data.imageUrl, data.imageBase64, id, updateNodeData]);
```

with:

```ts
  const inputRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // imageUrl answered 404: its library item was deleted (or a Brandfetch logo
  // is unavailable). Shown as empty, the saved data is left untouched.
  const [missingUrl, setMissingUrl] = useState<string | null>(null);

  useEffect(() => {
    if (data.imageUrl && !data.imageBase64) {
      const url = data.imageUrl;
      fetch(url)
        .then((r) => {
          if (r.status === 404) {
            setMissingUrl(url);
            return null;
          }
          return r.ok ? r.blob() : null;
        })
        .then((blob) => {
          if (!blob) return;
          const reader = new FileReader();
          reader.onload = () => {
            updateNodeData(id, { imageBase64: reader.result as string });
          };
          reader.readAsDataURL(blob);
        })
        .catch(() => {});
    }
  }, [data.imageUrl, data.imageBase64, id, updateNodeData]);
```

Replace:

```ts
        updateNodeData(id, {
          imageBase64: reader.result as string,
          label: file.name,
        });
```

with:

```ts
        // Drop any library URL: saveProject strips imageBase64 while imageUrl is set.
        updateNodeData(id, {
          imageBase64: reader.result as string,
          imageUrl: undefined,
          label: file.name,
        });
```

Replace:

```ts
  const isLogo = data.kind === "logo";
```

with:

```ts
  const isLogo = catalogIdForNode({ type: "swipeFile", data }) === "logo";
  const hasImage = Boolean(data.imageBase64 || (data.imageUrl && data.imageUrl !== missingUrl));

  // Same data as a drag from the former sidebar: the library route, no copy of the file.
  const pickFromLibrary = (item: LibraryPick) => {
    setMissingUrl(null);
    updateNodeData(id, {
      imageUrl: item.imageUrl,
      imageBase64: undefined,
      label: item.label,
      kind: isLogo ? "logo" : "reference",
    });
  };
```

Replace:

```tsx
      onRemoveBg={(data.imageBase64 || data.imageUrl) ? handleRemoveBg : undefined}
```

with:

```tsx
      onRemoveBg={hasImage ? handleRemoveBg : undefined}
```

Replace:

```tsx
      {data.imageBase64 || data.imageUrl ? (
```

with:

```tsx
      {hasImage ? (
```

Replace:

```tsx
      {(data.imageBase64 || data.imageUrl) && (
```

with:

```tsx
      {hasImage && (
```

Replace:

```tsx
      <Handle type="source" position={Position.Right} id="image" />
    </NodeShell>
```

with:

```tsx
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="nodrag nopan mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-(--line) py-1.5 text-xs text-(--text-secondary) transition-colors hover:border-(--canvas-accent) hover:text-(--text-primary)"
      >
        <Library className="size-3.5" />
        Choisir dans la bibliothèque
      </button>
      <LibraryPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        kind={isLogo ? "logos" : "inspirations"}
        onPick={pickFromLibrary}
      />
      <Handle type="source" position={Position.Right} id="image" />
    </NodeShell>
```

- [ ] **Step 5: Type-check, lint, full suite**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/components/library/picker-grids.tsx src/components/library/picker-tabs.tsx src/components/library/LibraryPickerDialog.tsx src/components/nodes/SwipeFileNode.tsx
./node_modules/.bin/vitest run
```

Expected: `tsc` exits 0; no new eslint error in `SwipeFileNode.tsx` (its existing warnings stay); all tests pass.

- [ ] **Step 6: Check in the browser (throwaway dev server, port 3100)**

Start the dev server, then seed a logo, an image and a canvas with an empty Logo node and an empty Image de référence node:

```bash
PNG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZkqfO0AAAAASUVORK5CYII="
curl -s -X POST http://localhost:3100/api/logos -H 'content-type: application/json' -d "{\"dataUrl\":\"data:image/png;base64,$PNG\",\"label\":\"Logo seed\"}"
curl -s -X POST http://localhost:3100/api/swipe-files -H 'content-type: application/json' -d "{\"dataUrl\":\"data:image/png;base64,$PNG\",\"title\":\"Image seed\"}"
PROJECT=$(curl -s -X POST http://localhost:3100/api/projects -H 'content-type: application/json' -d '{"name":"Picker test"}' | /opt/homebrew/bin/node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>console.log(JSON.parse(s).id))')
curl -s -X POST http://localhost:3100/api/project -H 'content-type: application/json' \
  -d "{\"projectId\":\"$PROJECT\",\"nodes\":[{\"id\":\"logo\",\"type\":\"swipeFile\",\"position\":{\"x\":0,\"y\":0},\"data\":{\"kind\":\"logo\"}},{\"id\":\"ref\",\"type\":\"swipeFile\",\"position\":{\"x\":0,\"y\":420},\"data\":{\"kind\":\"reference\"}}],\"edges\":[]}"
echo "http://localhost:3100/m/$PROJECT"
```

Open the printed URL and check:
- Both nodes show « Choisir dans la bibliothèque » under their empty zone.
- Logo node → dialog « Choisir un logo », tabs « Mes logos » / « Chercher en ligne »; « Mes logos » lists « Logo seed »; typing `zzz` → « Aucun résultat pour « zzz ». »; Backspace in the search field does not delete a node; clear it, click « Logo seed » → dialog closes, node titled « Logo seed » with its image.
- Logo node → « Chercher en ligne » → type `notion` → results with badges → « Ajouter » on Simple Icons « Notion » → dialog closes, node shows Notion; `curl -s http://localhost:3100/api/logos` now lists « Notion ».
- Image de référence node → dialog « Choisir une image de référence », one tab « Mes images » → « Image seed » → node filled.
- Wait 3 s (autosave), reload → both nodes keep their images. Delete « Image seed » (`curl -s -X DELETE "http://localhost:3100/api/swipe-files?filename=<its filename from curl -s http://localhost:3100/api/swipe-files>"`), reload the canvas → the reference node shows its empty state and the button again.
- No « Générer » click. Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add src/components/library/picker-grids.tsx src/components/library/picker-tabs.tsx src/components/library/LibraryPickerDialog.tsx src/components/nodes/SwipeFileNode.tsx
git commit -m "feat(library): pick library items and online logos from Logo and reference nodes" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 13: One « Bibliothèque » entry in the sidebar; library store and sidebar drag-and-drop removed; Personnage node opens the page

**Files:**
- Modify: `src/components/panels/AppSidebar.tsx` (replace the whole file)
- Modify: `src/components/Canvas.tsx`
- Modify: `src/components/nodes/FaceReferenceNode.tsx`
- Modify: `src/app/bibliotheque/page.tsx`, `src/app/miniatures/page.tsx`, `src/app/reglages/layout.tsx` (replace the whole files)
- Modify: `src/app/usage/UsageView.tsx`
- Modify: `src/components/settings/ChaineSection.tsx` (comment only)
- Modify: `src/lib/agent/tools/list-personas.ts` (text only)
- Delete: `src/store/library-store.ts`, `tests/canvas/library-store.test.ts`

**Interfaces:**
- Consumes: `/bibliotheque` page (Task 8) with `FollowedChannelsSection` owning `youtube-channel-saved` (Task 10); `libraryTabHref` (Task 1); `useGeneratorDefaults` → `NodePicker` in `Canvas.tsx` (unchanged).
- Produces: sidebar = « Mes miniatures », « Bibliothèque » (icon `Library`, active on `/bibliotheque*`), footer « Usage », « Réglages », collapse trigger unchanged; no `useLibraryStore`, no `application/reactflow-type` drop; `AppSidebar` no longer needs a `ReactFlowProvider` (kept only on `/m/[id]`); Personnage node « Créer un personnage » → `window.open("/bibliotheque?onglet=personnages", "_blank", "noopener")`, list reloaded on window `focus`, a deleted Personnage shows the empty state.

- [ ] **Step 1: Confirm the consumers (ruling 13)**

```bash
grep -rn "useLibraryStore\|library-store" src tests
grep -rn "reactflow-type\|reactflow-data" src
grep -rn "useReactFlow" src/components/panels/AppSidebar.tsx
```

Expected: `useLibraryStore` only in `AppSidebar.tsx`, `FaceReferenceNode.tsx`, `src/store/library-store.ts`, `tests/canvas/library-store.test.ts`; `reactflow-type` / `reactflow-data` only in `AppSidebar.tsx` and `Canvas.tsx`; `useReactFlow` in `AppSidebar.tsx`. Anything else: stop and report.

- [ ] **Step 2: Rewrite the sidebar**

Replace the whole content of `src/components/panels/AppSidebar.tsx` with:

```tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { BarChart3, Film, Library, Settings as SettingsIcon } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export default function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:flex-col">
          <Link href="/" className="flex size-9 shrink-0 items-center justify-center rounded-xl" aria-label="ThumbGen home">
            <Image src="/illith.svg" alt="" width={24} height={24} priority />
          </Link>
          <div className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-medium leading-tight">ThumbGen</span>
            <span className="truncate text-xs text-sidebar-foreground/60 leading-tight">Illith Studio</span>
          </div>
          <SidebarTrigger className="shrink-0" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Mes miniatures"
                  isActive={pathname === "/miniatures"}
                  onClick={() => router.push("/miniatures")}
                >
                  <Film />
                  <span>Mes miniatures</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Bibliothèque"
                  isActive={pathname.startsWith("/bibliotheque")}
                  onClick={() => router.push("/bibliotheque")}
                >
                  <Library />
                  <span>Bibliothèque</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Usage et coûts" isActive={pathname === "/usage"} onClick={() => router.push("/usage")}>
              <BarChart3 />
              <span>Usage</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Réglages"
              isActive={pathname.startsWith("/reglages")}
              onClick={() => router.push("/reglages")}
            >
              <SettingsIcon />
              <span>Réglages</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
```

- [ ] **Step 3: Remove the library store and the sidebar drop**

```bash
git rm src/store/library-store.ts tests/canvas/library-store.test.ts
```

In `src/components/Canvas.tsx`, replace:

```ts
import { useCallback, useState, useEffect } from "react";
import { DragEvent } from "react";
```

with:

```ts
import { useCallback, useState, useEffect } from "react";
```

Replace:

```ts
    onConnect,
    addNode,
    removeNode,
```

with:

```ts
    onConnect,
    removeNode,
```

Delete this whole block (the empty line after it included):

```ts
  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow-type");
      if (!type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const rawData = event.dataTransfer.getData("application/reactflow-data");
      const data = rawData ? JSON.parse(rawData) : {};

      // A generator dragged from the sidebar carries only its model; the
      // Génération settings fill in format, count and resolution.
      addNode(type, position, type === "generator" ? { ...generatorDefaults, ...data } : data);
    },
    [screenToFlowPosition, addNode, generatorDefaults],
  );

```

Replace:

```tsx
        defaultEdgeOptions={defaultEdgeOptions}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onConnectEnd={onConnectEnd}
```

with:

```tsx
        defaultEdgeOptions={defaultEdgeOptions}
        onConnectEnd={onConnectEnd}
```

Replace the comment above `export default function Canvas`:

```ts
// NOTE: this used to wrap CanvasInner in its own <ReactFlowProvider> here.
// AppSidebar (Task 3) now mounts as a page-level sibling of <Canvas /> instead
// of nesting inside <ReactFlow> — since it also calls useReactFlow(), it needs
// to share the same ReactFlowProvider/store as the actual <ReactFlow> instance
// below (a phantom, unshared provider around AppSidebar alone would either
// crash — no provider at all — or silently desync screenToFlowPosition from
// the canvas's real pan/zoom). The provider is therefore lifted one level up,
// to page.tsx, wrapping both AppSidebar and Canvas together.
```

with:

```ts
// The ReactFlowProvider lives in app/m/[id]/page.tsx, around AppSidebar and
// Canvas. Library items reach the canvas from the nodes (« Choisir dans la
// bibliothèque »), not by dragging from the sidebar.
```

Then check that the generator defaults still feed every creation path:

```bash
grep -rn "useGeneratorDefaults" src --include="*.ts" --include="*.tsx"
grep -n "generatorDefaults" src/components/Canvas.tsx
```

Expected: `useGeneratorDefaults` is defined in `src/hooks/useGeneratorDefaults.ts` and used only in `Canvas.tsx`, which still passes `generatorDefaults` to `<NodePicker generatorDefaults={generatorDefaults} />`.

- [ ] **Step 4: The Personnage node opens the Bibliothèque in a new tab**

In `src/components/nodes/FaceReferenceNode.tsx`, replace:

```ts
import { useCanvasStore, AppNode } from "@/store/canvas-store";
import { useLibraryStore } from "@/store/library-store";
```

with:

```ts
import { useCanvasStore, AppNode } from "@/store/canvas-store";
import { libraryTabHref } from "@/lib/library/library-tabs";
```

Replace:

```ts
  const setLibraryTab = useLibraryStore((s) => s.setActiveTab);
  const [personas, setPersonas] = useState<PersonaSummary[] | null>(null);

  const loadPersonas = useCallback(() => {
    fetch("/api/personas")
      .then((res) => (res.ok ? (res.json() as Promise<PersonaSummary[]>) : []))
      .then((rows) => setPersonas(rows))
      .catch(() => setPersonas([]));
  }, []);

  useEffect(() => {
    loadPersonas();
  }, [loadPersonas]);

  const angles = data.personaAngles;
  const hasPersona = Boolean(data.personaId || (angles && (angles.front || angles.left || angles.right)));

  const items = (personas ?? []).map((persona) => ({ value: persona.id, label: persona.label }));
  if (data.personaId && !items.some((item) => item.value === data.personaId)) {
    items.unshift({ value: data.personaId, label: data.label || "Personnage" });
  }
```

with:

```ts
  // null until a list was loaded successfully (a failed load never counts as « deleted »).
  const [personas, setPersonas] = useState<PersonaSummary[] | null>(null);

  const loadPersonas = useCallback(() => {
    fetch("/api/personas", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<PersonaSummary[]>) : null))
      .then((rows) => {
        if (rows) setPersonas(rows);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadPersonas();
  }, [loadPersonas]);

  // « Créer un personnage » opens the Bibliothèque in another browser tab:
  // coming back to this one refreshes the list.
  useEffect(() => {
    window.addEventListener("focus", loadPersonas);
    return () => window.removeEventListener("focus", loadPersonas);
  }, [loadPersonas]);

  const angles = data.personaAngles;
  const personaDeleted = Boolean(
    data.personaId && personas && !personas.some((persona) => persona.id === data.personaId),
  );
  const hasPersona =
    !personaDeleted && Boolean(data.personaId || (angles && (angles.front || angles.left || angles.right)));

  const items = (personas ?? []).map((persona) => ({ value: persona.id, label: persona.label }));
  if (data.personaId && !personaDeleted && !items.some((item) => item.value === data.personaId)) {
    items.unshift({ value: data.personaId, label: data.label || "Personnage" });
  }
```

Replace:

```tsx
          value={data.personaId ?? null}
```

with:

```tsx
          value={personaDeleted ? null : (data.personaId ?? null)}
```

Replace:

```tsx
        {!hasPersona && (
          <>
            {personas?.length === 0 && (
              <p className="text-[11px] text-(--text-muted)">Aucun personnage dans ta bibliothèque.</p>
            )}
            <button
              type="button"
              onClick={() => setLibraryTab("faces")}
              className="nodrag nopan self-start text-xs text-(--canvas-accent) hover:underline"
            >
              Créer un personnage
            </button>
          </>
        )}
```

with:

```tsx
        {!hasPersona && (
          <>
            {personaDeleted && (
              <p className="text-[11px] text-(--text-muted)">Personnage supprimé de la bibliothèque.</p>
            )}
            {personas?.length === 0 && (
              <p className="text-[11px] text-(--text-muted)">Aucun personnage dans ta bibliothèque.</p>
            )}
            <button
              type="button"
              onClick={() => window.open(libraryTabHref("personnages"), "_blank", "noopener")}
              className="nodrag nopan self-start text-xs text-(--canvas-accent) hover:underline"
            >
              Créer un personnage
            </button>
          </>
        )}
```

- [ ] **Step 5: Drop the providers that only served the old sidebar**

Replace the whole content of `src/app/bibliotheque/page.tsx` with:

```tsx
import { Suspense } from "react";
import AppSidebar from "@/components/panels/AppSidebar";
import LibraryView from "@/components/library/LibraryView";
import { SidebarInset } from "@/components/ui/sidebar";

export const metadata = { title: "Bibliothèque · ThumbGen" };

/** Same shell as /miniatures; the body never scrolls, so the inset does. */
export default function BibliothequePage() {
  return (
    <>
      <AppSidebar />
      <SidebarInset className="h-svh overflow-y-auto">
        {/* useSearchParams (?onglet=) needs a Suspense boundary. */}
        <Suspense fallback={null}>
          <LibraryView />
        </Suspense>
      </SidebarInset>
    </>
  );
}
```

Replace the whole content of `src/app/miniatures/page.tsx` with:

```tsx
"use client";

import AppSidebar from "@/components/panels/AppSidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import MiniaturesView from "./MiniaturesView";

export default function MiniaturesPage() {
  return (
    <>
      <AppSidebar />
      <SidebarInset>
        <MiniaturesView />
      </SidebarInset>
    </>
  );
}
```

Replace the whole content of `src/app/reglages/layout.tsx` with:

```tsx
"use client";

import AppSidebar from "@/components/panels/AppSidebar";
import SettingsNav from "@/components/settings/SettingsNav";
import { SidebarInset } from "@/components/ui/sidebar";

// The body never scrolls (globals.css), so the inset is the scroll container.
export default function ReglagesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppSidebar />
      <SidebarInset className="h-svh overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-6 py-8">
          <header className="mb-8">
            <h1 className="font-heading text-2xl font-medium">Réglages</h1>
            <p className="text-sm text-muted-foreground">
              Clés des modèles, agent, génération, chaîne, intégrations, données et apparence de ThumbGen.
            </p>
          </header>
          <div className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
            <SettingsNav />
            <div className="grid min-w-0 content-start gap-6">{children}</div>
          </div>
        </div>
      </SidebarInset>
    </>
  );
}
```

(Re-read `src/app/reglages/layout.tsx` first: if its header text or grid differ from the version quoted in this plan, keep what is on `main` and only remove the `ReactFlowProvider` import, its comment and its wrapper.)

In `src/app/usage/UsageView.tsx`, delete the line:

```ts
import { ReactFlowProvider } from "@xyflow/react";
```

and replace:

```tsx
export default function UsageView() {
  // ReactFlowProvider lets AppSidebar mount safely on this page (it calls
  // useReactFlow() internally for its addAtCenter helper).
  return (
    <ReactFlowProvider>
      <UsageInner />
    </ReactFlowProvider>
  );
}
```

with:

```tsx
export default function UsageView() {
  return <UsageInner />;
}
```

- [ ] **Step 6: Stale wording elsewhere**

In `src/components/settings/ChaineSection.tsx`, replace:

```ts
  // AppSidebar stays mounted across every /reglages section and only
  // refetches the Inspirations feed on its own 5-minute timer, so saving the
  // YouTube channel here would otherwise leave that feed stale for up to
  // 5 minutes. Every save from this form includes youtubePlaylistId (it's
  // always in KEYS), so nudge the sidebar to refresh right away.
```

with:

```ts
  // Every save from this form includes youtubePlaylistId (it's always in
  // KEYS): tell listeners — the Bibliothèque's « Chaînes suivies » section
  // (FollowedChannelsSection) — to refetch the channel feed.
```

In `src/lib/agent/tools/list-personas.ts`, replace:

```ts
propose-lui d'en créer un depuis l'onglet Personnages de la sidebar (capture webcam en 3 angles ou une photo par angle)
```

with:

```ts
propose-lui d'en créer un depuis la page Bibliothèque, onglet Personnages (capture webcam en 3 angles ou une photo par angle)
```

- [ ] **Step 7: Type-check, lint, full suite, leftovers**

```bash
rm -rf .next/types .next/dev/types
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/components/panels/AppSidebar.tsx src/components/Canvas.tsx src/components/nodes/FaceReferenceNode.tsx src/app/bibliotheque/page.tsx src/app/miniatures/page.tsx src/app/reglages/layout.tsx src/app/usage/UsageView.tsx src/components/settings/ChaineSection.tsx src/lib/agent/tools/list-personas.ts
./node_modules/.bin/vitest run
grep -rn "useLibraryStore\|library-store\|reactflow-type\|reactflow-data\|Modèles d'image\|Modèles d&apos;image" src tests || echo "clean"
grep -rn "ReactFlowProvider" src/app
```

Expected: `tsc` exits 0; no eslint error; all tests pass (the library-store test is gone); `clean`; `ReactFlowProvider` only in `src/app/m/[id]/page.tsx`.

- [ ] **Step 8: Check in the browser (throwaway dev server, port 3100)**

Start the dev server and seed one Personnage (Task 9 Step 4 `curl`, label « Perso A »). Check:
- Sidebar on `/miniatures`, `/bibliotheque`, `/reglages/connexions`, `/usage`: « Mes miniatures », « Bibliothèque » (Library icon, active only on `/bibliotheque`), footer « Usage », « Réglages »; no « Personnages », « Modèles d'image », « Inspirations », « Logos » entries and no flyout; the collapse trigger still collapses to the icon rail and the tooltips show. Each page renders without a console error.
- Create a miniature in `/miniatures` and open it: dragging anything from the sidebar is no longer possible; « N » → « Générateur » still gets the Réglages generation defaults (Format / Images / Résolution rows).
- Add a « Personnage » node: the select lists « Perso A ». With it empty, « Créer un personnage » opens `/bibliotheque?onglet=personnages` in a new browser tab (the canvas tab stays open). In a terminal, seed « Perso B » with the same `curl`; switch back to the canvas tab → open the select → « Perso B » is listed without reloading.
- Choose « Perso B » in the node, then delete it (`curl -s -X DELETE http://localhost:3100/api/personas/<id>` — id from `curl -s http://localhost:3100/api/personas`), focus the canvas tab → the node shows « Personnage supprimé de la bibliothèque. », the empty select and « Créer un personnage ». Stop the dev server.

- [ ] **Step 9: Commit**

```bash
git add src/components/panels/AppSidebar.tsx src/components/Canvas.tsx src/components/nodes/FaceReferenceNode.tsx src/app/bibliotheque/page.tsx src/app/miniatures/page.tsx src/app/reglages/layout.tsx src/app/usage/UsageView.tsx src/components/settings/ChaineSection.tsx src/lib/agent/tools/list-personas.ts
git commit -m "feat(library): single Bibliothèque entry in the sidebar; Personnage node opens the page" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

(`git rm` in Step 3 already staged the two deletions; they are part of this commit.)

---

## Task 14: Docker rebuild and live verification

**Files:** none modified (verification only). If a check fails, fix it in the file owned by the relevant task, re-run `tsc` + `vitest`, commit with a `fix(library): …` message listing only the touched files — before the rebuild whenever the problem can be reproduced on the dev server.

**Interfaces:**
- Consumes: everything above.
- Produces: the running app at `http://localhost:3000` with chantier C, checked against the spec's « Vérifications manuelles ».

**Safety rules for this task.** The container serves the user's real database and keys.
- No paid call: never click « Générer », never send an agent chat message, never « Améliorer » a prompt.
- Create or modify nothing of the user's except dedicated, clearly named test items: the miniature « Test bibliothèque (vérification) », the Personnage « Test personnage (vérification) », and logos renamed « Test logo <source> (vérification) » right after they are added. Delete all of them at the end (Step 8). Never rename, replace or delete an existing item of the user's.
- Never type an API key or a password. If a login page appears (`SITE_PASSWORD`), stop and ask the user to log in. If a camera permission prompt appears, dismiss it without granting and leave the webcam capture to the user.
- Free public calls are fine: SVGL, Wikimedia, Brandfetch search/« Tester » with a key the user already saved.

- [ ] **Step 1: Final static checks in the main repository**

```bash
cd /Users/antoinevigneau/thumbgen-real
git status --short
git log --oneline -15
rm -rf .next/types .next/dev/types
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
./node_modules/.bin/eslint src/components/library src/lib/logos src/lib/library src/lib/search-text.ts src/lib/user-agent.ts src/app/bibliotheque src/app/api/logos src/app/api/swipe-files/rename src/components/panels/AppSidebar.tsx src/components/Canvas.tsx src/components/nodes/SwipeFileNode.tsx src/components/nodes/FaceReferenceNode.tsx src/components/settings/SecretKeyCard.tsx src/components/settings/ConnexionsSection.tsx src/lib/connection-tests.ts src/lib/settings-schema.ts src/lib/db.ts
```

Expected: the commits of Tasks 1–13 are on the checked-out branch of `/Users/antoinevigneau/thumbgen-real` (if the work lives in another worktree, stop and ask the user to merge or check it out there — Docker's `./data` bind mount is relative to this repository); no uncommitted change to this plan's files; `tsc` exits 0; all tests pass; no eslint error.

- [ ] **Step 2: Rebuild and restart the container — the only rebuild of this plan**

```bash
docker compose build thumbgen && docker compose up -d thumbgen
for i in $(seq 1 60); do code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/bibliotheque); [ "$code" = "200" ] && break; sleep 2; done; echo "HTTP $code"
docker compose logs --tail 40 thumbgen
docker compose exec thumbgen ls node_modules/@resvg
```

Expected: the build succeeds; `HTTP 200` (a `401` means `SITE_PASSWORD` is set: ask the user to log in in the browser, then continue in the browser only); no error in the logs; `node_modules/@resvg` inside the container lists `resvg-js` and `resvg-js-linux-arm64-gnu` (or `-x64-gnu`). If the build fails, fix the cause, commit, rebuild once more and report that a second build was needed.

- [ ] **Step 3: Sidebar and page (spec « Sidebar », « Page »)**

In `http://localhost:3000`:
- [ ] Sidebar on `/miniatures`, a canvas, `/reglages`, `/usage`: one « Bibliothèque » entry under « Mes miniatures », active on `/bibliotheque`; no library flyout, no « Personnages » / « Modèles d'image » / « Inspirations » / « Logos » entries; collapse to the icon rail still works.
- [ ] `/bibliotheque` → « Personnages » tab by default; clicking « Logos » / « Inspirations » updates `?onglet=` without reloading; opening `/bibliotheque?onglet=logos` directly lands on Logos; a reload keeps the tab.
- [ ] Local search: in each tab, typing a word that matches nothing shows « Aucun … ne correspond à « … ». »; typing part of an existing name without accents or capitals keeps it. (Empty states are only visible on an empty library: check them in the report as covered by Tasks 9–11 on the dev server if the user's library is not empty.)

- [ ] **Step 4: Personnages (spec « Personnages »)**

- [ ] « Nouveau personnage » → « Capturer avec la webcam » opens the wizard (close it; the capture itself is for the user) and « Importer une photo par angle » opens the import dialog, « Créer le personnage » disabled without a Face photo.
- [ ] Import: create a small test image `F="$(mktemp -d)/face.png"; /opt/homebrew/bin/node -e 'require("fs").writeFileSync(process.argv[1], Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZkqfO0AAAAASUVORK5CYII=","base64"))' "$F"; echo "$F"`, pick it as Face, name « Test personnage (vérification) », create → card « 1/3 ». If the browser tool cannot choose a file, create it with `curl -s -X POST http://localhost:3000/api/personas -H 'content-type: application/json' -d '{"label":"Test personnage (vérification)","photos":{"front":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZkqfO0AAAAASUVORK5CYII="}}'` and say so.
- [ ] On the test Personnage only: « Renommer » → « Test personnage (vérification, renommé) »; « Remplacer un angle » → Profil gauche with the same test file → « 2/3 » (skip if files cannot be chosen).

- [ ] **Step 5: Logos (spec « Logos »)**

- [ ] Search `nike`, `notion`, `youtube`: merged grid with source badges (Simple Icons, SVGL, Wikimedia, and Brandfetch only if the user has a key), variant badges « Couleur » / « Clair » / « Sombre », no global failure; note any « … indisponible » line.
- [ ] « Ajouter » one result of each available source (e.g. Simple Icons « YouTube », SVGL « Notion », one Wikimedia file); right after each add, rename it in « Mes logos » to « Test logo Simple Icons (vérification) », « Test logo SVGL (vérification) », « Test logo Wikimedia (vérification) ». Check one stored PNG: `curl -s "http://localhost:3000/api/logos/image?f=<filename>" -o "$(mktemp -d)/l.png"` then `file` on it → `PNG image data, 1024 x …, 8-bit/color RGBA` (the `filename` is in `curl -s http://localhost:3000/api/logos`).
- [ ] « Importer une image » with the test file from Step 4 → rename it « Test logo import (vérification) » (skip if files cannot be chosen).
- [ ] Réglages → Connexions: the « Brandfetch » card with « Obtenir une clé gratuite ». **Only if the user already saved a Brandfetch key:** « Tester » → note the exact message (valid, `client_id_invalid_signature`, or `automated_traffic`); then add one Brandfetch result, rename it « Test logo Brandfetch (vérification) », and note whether its card shows the logo or « Logo indisponible » (ruling 5). Without a key: skip and say so.

- [ ] **Step 6: Nodes (spec « Nœuds »)**

In `/miniatures`, « Nouvelle miniature » named « Test bibliothèque (vérification) », open it:
- [ ] Add a « Logo » step → « Choisir dans la bibliothèque » → « Mes logos » → « Test logo Simple Icons (vérification) » → the node shows it. « Chercher en ligne » on a second Logo node → search `vercel` → « Ajouter » on one result → the node shows it; rename that new library logo « Test logo picker (vérification) » in the Bibliothèque afterwards.
- [ ] If a Brandfetch test logo exists: place it in a Logo node and note whether the node shows the image.
- [ ] Add an « Image de référence » step → « Choisir dans la bibliothèque » → « Mes images » → pick any existing image (read-only use of the user's image) → the node shows it.
- [ ] Add a « Personnage » step → « Créer un personnage » opens `/bibliotheque?onglet=personnages` in a new tab; back on the canvas tab, the select lists the user's Personnages including « Test personnage (vérification, renommé) ».
- [ ] Chat panel → attach → « Bibliothèque » still opens the chat picker (close it; send nothing).

- [ ] **Step 7: Logs**

```bash
docker compose logs --tail 150 thumbgen | grep -i "error\|warn" || echo "no errors"
```

- [ ] **Step 8: Clean up the test items**

- In `/bibliotheque?onglet=logos`: delete every logo named « Test logo … (vérification) » with « … » → « Supprimer ».
- In « Personnages »: delete « Test personnage (vérification, renommé) ».
- In `/miniatures`: delete « Test bibliothèque (vérification) » (« … » → « Supprimer », confirm).
- `curl -s http://localhost:3000/api/logos` and `curl -s http://localhost:3000/api/personas` no longer list any « (vérification) » item.

- [ ] **Step 9: Report**

Report to the user: build result (and whether `@resvg` was present in the image), each checklist item (pass / fail / skipped with reason), the Brandfetch « Tester » message and remote-logo behaviour if a key exists (ruling 5), confirmation that every test item was deleted, and any fix commit made during verification.

---

## Self-review against the spec

- §1 Sidebar: panel, its state and loads removed, « Bibliothèque » entry with `Library` icon under « Mes miniatures », active on `/bibliotheque`, other entries and collapse trigger unchanged → Task 13 (rulings 12–13); `library-store` deleted, node no longer uses it → Task 13; sidebar → canvas drop removed, other creation paths keep generator defaults (grep in Task 13 Step 3) → Task 13.
- §2 Page: route, same shell and title, three `Tabs`, `?onglet=` with default → Tasks 1, 8 (ruling 16); per-tab local search (accent/case-insensitive), responsive grid, empty state with main action → Tasks 1, 9, 10, 11 (ruling 17); shadcn components only, French copy → Tasks 8–12.
- §3 Personnages: card with 3 angles, « — », « n/3 » → Task 9; « Nouveau personnage » with webcam / per-angle import, `POST /api/personas` → Task 9; « Renommer » `PATCH`, « Remplacer un angle » `POST …/photos`, « Supprimer » with `ConfirmDialog` + `DELETE` → Task 9; front photo required in the UI, server refuses zero photos → Task 2 (ruling 15).
- §4 Logos — search: ≥ 2 characters, ~300 ms debounce, merged grid with source and variant badges → Tasks 6, 11; `GET /api/logos/search` in parallel with ~4 s per source, failing source ignored and named → Task 6 (ruling 18); Simple Icons local with aliases and brand colour → Task 6 (ruling 9); SVGL without key with light/dark and server cache → Task 6 (ruling 1); Wikimedia with `User-Agent`, SVG/PNG, Commons thumbnails → Task 6 (ruling 2); Brandfetch only with a key → Task 6 (rulings 3, 6).
- §4 Logos — add: download + SVG → 1024 px transparent PNG into `logos` with brand name as label → Task 7 (ruling 10); Brandfetch remote reference with `remote_url` defensive migration → Tasks 5, 7 (ruling 7); `GET /api/logos/image` fetches remote on the fly without storing, generation goes through the same route → Task 5 (and `SwipeFileNode` still fetches `imageUrl` into `imageBase64`); manual « Importer une image » → Task 11 (ruling 20).
- §4 Logos — « Mes logos » grid, badge « Brandfetch », « Renommer » (`POST /api/logos/rename`) / « Supprimer » (confirmation, `DELETE /api/logos`) → Task 11; « Logo indisponible » + « Supprimer » → Task 11.
- §4 Réglages: `brandfetchApiKey` in `SECRET_KEYS`, masked, `BRANDFETCH_API_KEY` fallback, Connexions card with « Obtenir une clé gratuite » and « Tester » via `connection-tests.ts` → Task 4 (rulings 3–4).
- §5 Inspirations: « Mes images » grid, « Importer des images », « Renommer » (new `POST /api/swipe-files/rename`) / « Supprimer » → Tasks 3, 10; « Chaînes suivies » « Bientôt » with read-only « Ma chaîne » feed and the `youtube-channel-saved` listener → Task 10 (ruling 22, D contract).
- §6 From a node: `LibraryPickerDialog` (Dialog, search, grid, kind) with the D contract, chat picker kept → Task 12 (ruling 14); `SwipeFileNode` « Choisir dans la bibliothèque » on `inspirations` / `logos` by kind, « Chercher en ligne » adds then places → Task 12; fills `imageUrl` + `label` without duplicating → Task 12; Personnage node keeps its select, « Créer un personnage » opens the page in a new tab, reload on focus → Task 13.
- §7 Agent: tools unchanged; `list_logos` exposes remote logos with the same `stored:` form, image served by the route that fetches remote (and `resolveImageSource` for `apply_workflow` / `generate_sketch`) → Task 5 (ruling 8).
- Error handling: per-source timeout and notice, « Recherche indisponible, importe une image » → Tasks 6, 11; invalid SVG → clear error, nothing saved → Task 7; Brandfetch missing / key removed → 404 → « Logo indisponible » → Tasks 5, 11; deleted item used by a node → empty state at next load, no cascade → Tasks 12, 13 (ruling 21).
- Tests list: merge/normalisation with simulated fetch, failing source, timeout → Task 6; SVG → 1024 px transparent PNG, Brandfetch without file with `remote_url`, remote image route without storage → Tasks 5, 7; idempotent migration → Task 5; personas refuse zero photos, rename / replace angle / delete → Task 2; swipe-files rename → Task 3; Brandfetch key masked and connection test with simulated fetch → Task 4; no test calls a real service → every test stubs `fetch` (Global Constraints).
- Manual checks → Task 14 Steps 3–6 (plus dev-server checks in Tasks 4, 8–13).
- Out of scope respected: no followed channels, views, scores or thumbnail types (chantier D), no YouTube OAuth, no new agent tool.
- Shared contract with chantier D: `src/app/bibliotheque/page.tsx` + `?onglet=` (Tasks 1, 8, 13), `FollowedChannelsSection` default export without props owning the listener (Task 10), `LibraryPickerDialog` props and `picker-tabs.tsx` exports with the exact types quoted in « Shared contract with chantier D » (Task 12), library image routes unchanged (Tasks 1, 5).
