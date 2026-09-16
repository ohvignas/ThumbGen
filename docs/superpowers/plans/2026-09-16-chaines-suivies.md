# Chaînes suivies et performance des miniatures (chantier D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Follow « Ma chaîne » and other YouTube channels, import their whole long-form history with views, score every thumbnail against its channel's median, keep channels up to date in the background, classify thumbnails by type (AI + manual), and use any of them as a reference image — from the Bibliothèque page and from a node's library picker.

**Architecture:** Pure, unit-tested logic lives in `src/lib/youtube/` (`performance.ts` for the median/score/band maths, `thumb-types.ts` for the fixed type list and the « types qui marchent » summary, `types.ts` for client-safe shapes and query parsing). A thin YouTube Data API v3 client (`api.ts`) feeds a sync service (`sync.ts`: incremental walk, backfill resume, stats refresh, removals, median, per-channel lock, quota stop) and an OpenRouter vision classifier (`classify.ts`). Background work runs in-process: `runtime.ts` keeps locks, queues and caches on `globalThis`, `jobs.ts` starts fire-and-forget promises from route handlers, SQLite keeps every resumable state. Ten route handlers under `/api/channels` serve the rewritten `FollowedChannelsSection` (chantier C's Inspirations tab), a « Chaînes suivies » tab in chantier C's `LibraryPickerDialog`, and a canvas hand-off (`/m/<id>?reference=<swipeFileId>`) that adds a reference node through the store.

**Tech Stack:** Next.js 16.2 App Router (standalone output, single Node process in Docker), React 19.2, TypeScript strict, Tailwind v4, shadcn `base-nova` on Base UI (`@base-ui/react` 1.8), Zustand 5, zod 4, better-sqlite3 12 (SQLite 3.53), `openai` 6 SDK pointed at OpenRouter, vitest 4, lucide-react 1.46.

**Spec:** `docs/superpowers/specs/2026-09-16-chaines-suivies-design.md` — the binding authority. Read it before starting any task. Deviations are listed under « Code reality vs spec » with the ruling taken. Chantier C's spec (`docs/superpowers/specs/2026-09-16-bibliotheque-page-design.md`) describes the page this plan fills.

## Global Constraints

- **Sequencing — chantier C must be merged into `main` first.** This plan starts only after the chantier C plan (Bibliothèque page) is fully executed and merged. The code quoted here was read on `main` at `be5f8ac`, before C. Task 1 Step 1 checks C's contract; if anything is missing, STOP and report that chantier C has not landed.
- **Files created or reshaped by chantier C — always re-read before editing.** `src/components/library/FollowedChannelsSection.tsx` (rewritten by Task 12), `src/components/library/picker-tabs.tsx` (Task 15), plus every shared file C may have touched: `src/lib/db.ts`, `src/lib/settings-schema.ts`, `tests/settings/settings.test.ts`, `src/components/Canvas.tsx`, `src/app/layout.tsx`, `src/lib/youtube/channel.ts`, `src/app/api/swipe-files/route.ts`. Every task that edits one of them starts by re-reading the whole file on the latest `main`. Edits are anchored on quoted code, never line numbers; if an anchor is not found verbatim, find the equivalent code by its identifiers and apply the same change, and say so in your report.
- **Shared contract from chantier C (consumed verbatim, never reimplemented):**
  - Page `src/app/bibliotheque/page.tsx`; tab from `?onglet=personnages|logos|inspirations`.
  - The Inspirations tab renders `<FollowedChannelsSection />` from `src/components/library/FollowedChannelsSection.tsx` (default export, no props). In C it is a « Bientôt » placeholder that also shows the read-only « Ma chaîne » feed (`/api/youtube/playlist`) and owns the `youtube-channel-saved` window listener. **This plan rewrites that file entirely** and keeps reacting to `youtube-channel-saved`.
  - `src/components/library/picker-tabs.tsx` exports `type LibraryKind = "personnages" | "logos" | "inspirations"`, `type LibraryPick = { imageUrl: string; label: string }`, `type PickerTab = { id: string; label: string; render: (props: { query: string; onPick: (item: LibraryPick) => void }) => React.ReactNode }`, `const PICKER_TABS: Record<LibraryKind, PickerTab[]>`. Task 15 appends a « Chaînes suivies » tab to `PICKER_TABS.inspirations`; picking copies the thumbnail into `swipe_files` first and passes the library image URL (`/api/swipe-files/image?f=…`).
  - `src/components/library/LibraryPickerDialog.tsx` default export `{ open, onOpenChange, kind, onPick }` — not modified by this plan.
- **Interfaces already on `main` (used as-is):** `src/lib/youtube/channel.ts` `parseChannelInput(input)`; `src/lib/agent/llm-client.ts` `getOpenRouterClient(): OpenAI | null`; `src/lib/settings.ts` `getTypedSettings()`, `setSetting(key, value)`; `src/lib/generations-log.ts` `logGeneration(input)`; `src/store/canvas-store.ts` `addNode(type, position, data)`, `selectOnly(ids)`, `loadProject(projectId): Promise<void>`, `recentOwnSaveUpdatedAts`; `src/lib/canvas/placement.ts` `viewportCenterPosition(size, transform)`; `src/components/settings/ConfirmDialog.tsx` (props `open`, `onOpenChange`, `title`, `description`, `confirmLabel`, `busy?`, `destructive?`, `onConfirm`); `GET /api/miniatures` → `Array<{ id, name, description, createdAt, updatedAt, imageCount }>` sorted by `updatedAt` desc; `GET /api/swipe-files` → `Array<{ filename, title, size }>`.
- **Commands.** Tests: `./node_modules/.bin/vitest run` (one file: `./node_modules/.bin/vitest run tests/channels/file.test.ts`). Types: `./node_modules/.bin/tsc --noEmit`. Lint (touched files only): `./node_modules/.bin/eslint <files>` — no new **errors** (existing `@next/next/no-img-element` warnings are fine). `npx` is broken in this shell; `node` is a broken shell function — use `/opt/homebrew/bin/node`. If `tsc` errors appear only under `.next/types` or `.next/dev/types`, run `rm -rf .next/types .next/dev/types` and re-run it.
- **Tests.** They run against the isolated temp DB set by `tests/setup.ts` (`THUMBGEN_DB_PATH`). New tests go in **new files** under `tests/channels/` (one canvas helper test under `tests/canvas/`). Every test that touches channel tables starts with `getDb().exec("DELETE FROM followed_channels")` (videos cascade). **No test ever calls YouTube or OpenRouter:** YouTube goes through the in-memory fake `tests/channels/fake-youtube.ts` installed with `vi.stubGlobal("fetch", fake.fetch)` (it answers 404 to every other host); the classifier receives an injected fake client. Tests needing « no key » also stub the environment fallback: `vi.stubEnv("YOUTUBE_API_KEY", "")` / `vi.stubEnv("OPENROUTER_API_KEY", "")`, restored with `vi.unstubAllEnvs()`. Tests that start background syncs set `setSetting("inspirationAutoClassify", "false")`. Never read or print an API key.
- **The repository's `.env` holds real keys.** `/Users/antoinevigneau/thumbgen-real/.env` defines `YOUTUBE_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY` and `SITE_PASSWORD`, and `next dev` loads it. Next never overrides a variable already present in the environment (even empty), so every throwaway dev server of this plan blanks them.
- **Intermediate browser checks** use a throwaway dev server on port 3100, never the Docker app or `data/thumbgen.db`:
  ```bash
  mktemp -d   # prints a directory, called <CHECK_DIR> below — reuse that literal path in later commands
  YOUTUBE_API_KEY= OPENROUTER_API_KEY= OPENAI_API_KEY= SITE_PASSWORD= THUMBGEN_DB_PATH="<CHECK_DIR>/thumbgen.db" ./node_modules/.bin/next dev -p 3100
  ```
  Run it in the background, browse `http://localhost:3100`, stop it when the check is done. Demo data comes from `scripts/seed-followed-channels.mjs` (Task 11), which stores **fake** keys and more than 200 unclassified thumbnails so nothing is sent to OpenRouter. In those checks never click « Lancer le classement », never click « Chercher » in the follow dialog, never click « Actualiser » / « Réessayer » / « Tout actualiser » unless a step says so. The only outbound request allowed is the one Task 11 describes (a sync attempt rejected by Google because the key is fake).
- **Docker.** The user is actively using `http://localhost:3000`. Exactly **one** rebuild, in Task 16: `docker compose build thumbgen && docker compose up -d thumbgen`, run from `/Users/antoinevigneau/thumbgen-real` (the `./data` bind mount is relative — never from a worktree). Live checks there may use the YouTube API (free quota). AI classification of real thumbnails costs money: it happens only after the user's explicit consent in the executing session (Task 16 Step 2).
- **Database changes** follow `src/lib/db.ts`'s pattern: `CREATE TABLE IF NOT EXISTS` + defensive `PRAGMA table_info` column adds, idempotent, tested (Task 3).
- **Background work** is in-process only (no external queue, no cron): state on `globalThis` like `src/lib/data-admin.ts`'s `__thumbgen_backup_running` and `src/lib/db.ts`'s `__thumbgen_db`; progress that must survive a restart lives in SQLite (see ruling 1).
- **shadcn here is `base-nova` on Base UI, not Radix.** Check `src/components/ui/*.tsx` before writing JSX. `DropdownMenuItem` has no `onSelect` (use `onClick`); `DropdownMenuLabel` must sit inside `DropdownMenuGroup`; `DropdownMenuCheckboxItem` uses `checked` / `onCheckedChange(checked)`; `Select`'s `onValueChange` receives `string | null` and takes `items={[{ value, label }]}` so `<SelectValue />` shows labels; `ToggleGroup` uses arrays (`value={[x]}`, `onValueChange={(v) => { const next = OPTIONS.find((o) => o === v[0]); if (next) setX(next); }}`); triggers use `render={<Button … />}`; `Switch` uses `checked` / `onCheckedChange`; `Alert` variants `default | destructive`; `Avatar` sizes `sm | default | lg`. There is no `Tabs`, `Checkbox`, `Popover` or `Progress` on `main` (chantier C may add `Tabs`; this plan does not need it). Link-styled buttons use `className={buttonVariants({ … })}` on `next/link` or `<a>`.
- **`cn` is imported from the npm package `"cn"`** (`import { cn } from "cn"`, tailwind-merge compatible).
- **UI rules.** Only shadcn components and Tailwind classes (no `style={{…}}`). UI copy is French; JSX text apostrophes as `&apos;`.
- **Spec values (verbatim):** types `face_text` « Visage + texte », `reaction` « Réaction sans texte », `before_after` « Avant / Après », `versus` « Versus / comparaison », `screenshot` « Capture d'écran / interface », `object` « Objet ou produit central », `text_only` « Texte seul », `scene` « Scène / illustration », `other` « Autre »; unclassified « Non classée »; median = 50 latest long videos published more than 7 days ago; score `view_count ÷ median_views` rounded to 1 decimal shown « ×0,4 »; bands ≥ ×3 « Surperforme » (green), < ×0,5 « Sous-performe » (red); recent « Récente · 850 vues/j »; views « 12 k vues »; statuses « Synchronisation… 320 vidéos », « À jour il y a 2 h », « Erreur », « Quota YouTube atteint — reprise demain »; stale after 12 hours; confirmation above 200 thumbnails; ranking needs ≥ 3 scored thumbnails, else « peu de données »; sort score (default) / vues / date; filters type (multi) / chaîne / période 30 jours / 12 mois / tout; pages of 60; setting « Classer automatiquement les miniatures (IA) » in Réglages → Génération d'images, on by default; log endpoint `classify-thumbnail`.
- **Commits.** Commit only the files a task lists — never `git add -A` / `git add .`; deletions with `git rm`. Every commit message ends with a blank line and `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` (use two `-m` flags as shown in each task).

## Verified external facts (read on 2026-09-16)

- **`channels.list`** (<https://developers.google.com/youtube/v3/docs/channels/list>): 1 quota unit whatever the parts; `forHandle` takes a handle with or without `@`; `id` takes comma-separated channel ids; resource fields `snippet.title`, `snippet.customUrl`, `snippet.thumbnails.{default,medium,high}.url`, `statistics.subscriberCount`, `statistics.hiddenSubscriberCount`, `statistics.videoCount`, `contentDetails.relatedPlaylists.uploads`. An unknown handle returns 200 without `items`.
- **`playlistItems.list`** (<https://developers.google.com/youtube/v3/docs/playlistItems/list>): 1 unit; `maxResults` up to 50; `nextPageToken`; `items[].contentDetails.videoId`; error `playlistNotFound` (404).
- **`videos.list`** (<https://developers.google.com/youtube/v3/docs/videos/list>, <https://developers.google.com/youtube/v3/docs/videos>): 1 unit; comma-separated `id` (the page states no hard maximum; the spec's 50 per call matches the API's `maxResults` ceiling, and `maxResults` itself is not allowed with `id`); ids of private or deleted videos are simply absent from `items`; `snippet.publishedAt`, `snippet.title`, `snippet.liveBroadcastContent` (`live` / `none` / `upcoming`), `snippet.thumbnails` (`default`, `medium` = mqdefault 320×180, `high`, `standard`, `maxres`); `statistics.viewCount` / `likeCount` are unsigned longs sent as strings, `likeCount` may be absent; `contentDetails.duration` is ISO 8601 (`PT15M33S`, `PT#H#M#S`, `P#DT#H#M#S`; live streams report `P0D`).
- **Errors** (<https://developers.google.com/youtube/v3/docs/errors>): `quotaExceeded (403)`; Google APIs return `{ "error": { "code": 403, "message": "…", "errors": [{ "message": "…", "domain": "youtube.quota", "reason": "quotaExceeded" }] } }`. Daily quota is 10 000 units and resets at midnight Pacific Time.
- **Long-form playlist `UULF` + `channelId.slice(2)`** is an undocumented community convention (`UU` = `UULF` long videos + `UUSH` Shorts + `UULV` lives): <https://github.com/anxdpanic/plugin.video.youtube/issues/988>, <https://zegnat.bearblog.dev/the-rss-world-of-youtube/>. Google does not document it, so its absence (404 `playlistNotFound`) is handled by the spec's fallback.
- **OpenRouter model** `google/gemini-2.5-flash-lite` (from <https://openrouter.ai/api/v1/models>): input $0.10 / M tokens, image $0.10 / M, output $0.40 / M, `supported_parameters` includes `structured_outputs` and `response_format`, no expiration date. Structured outputs request shape `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`, answer in `choices[0].message.content` (<https://openrouter.ai/docs/guides/features/structured-outputs>). `usage` (with `prompt_tokens`, `completion_tokens`, `total_tokens`, `cost`) is always included in responses (<https://openrouter.ai/docs/guides/guides/usage-accounting>).
- **Gemini image tokens** (<https://ai.google.dev/gemini-api/docs/image-understanding>): an image whose both dimensions are ≤ 384 px costs 258 tokens — `mqdefault.jpg` (320×180) qualifies.

## Code reality vs spec (rulings)

1. **Background job runner.** Production runs one long-lived Node process (Docker `node server.js`, Next standalone output — equivalent to `next start`). Ruling: `src/lib/youtube/runtime.ts` keeps per-channel locks, running sync promises, the stale-sync queue, the quota block, the classification worker promise and the « Ma chaîne » resolution cache on `globalThis.__thumbgen_channel_runtime` (same technique as `data-admin.ts`), so all route bundles share it and dev hot reloads keep it. Route handlers start fire-and-forget promises (not `after()`: jobs must outlive the request and be observable by later requests). Nothing needed after a restart lives only in memory: backfill position, classification approvals and attempts are columns; a `syncing` status left by a restart is reset to `idle` by `reconcileSyncStatuses()` on the next `GET /api/channels`, and the channel, still stale, is picked up by the next trigger.
2. **Columns beyond the spec.** Resuming after a quota stop needs state the spec's columns do not hold. Ruling: `followed_channels` gains `playlist_id` (chosen playlist), `backfill_page_token`, `backfill_done`; `channel_videos` gains `classify_attempts` (max 3), `classify_approved` (the > 200 confirmation) and `swipe_file_id` (« Utiliser comme référence » reuses its library copy instead of duplicating it). All are also added defensively.
3. **Incremental walk vs interrupted import.** « Parcours … jusqu'à rencontrer une vidéo déjà connue » alone would never import the older videos of an import cut by the quota. Ruling: a first import saves `backfill_page_token` after every page; later syncs walk from the newest video until a known one, then resume the backfill from the saved token until the end (`backfill_done = 1`).
4. **Quota.** Ruling: on `quotaExceeded` the sync stops, keeps imported rows, sets `sync_status = 'error'` and `sync_error = "Quota YouTube atteint — reprise demain"`, leaves `last_synced_at` unchanged (the channel stays stale) and blocks automatic syncs until the next 08:00 UTC (YouTube resets at midnight Pacific: 08:00 UTC in winter, one hour after it in summer). « Actualiser » still tries.
5. **Long-form playlist probe.** Ruling: the first sync probes `UULF…` once (1 unit) and stores the chosen playlist; a 404 switches to `UU…` keeping only videos longer than 180 s. In both cases videos whose `liveBroadcastContent` is not `none` are skipped. Channel title, avatar and subscribers are refreshed at the end of each successful sync (1 unit, errors ignored) because avatar URLs change.
6. **Channel resolution.** The spec says `resolveChannelId` then `channels.list(snippet,statistics)`. Ruling: one `channels.list(part=snippet,statistics,contentDetails)` call with `forHandle` or `id`, built from `parseChannelInput` (reused) — one unit saved. It also accepts a raw `UC…` id, the uploads playlist id `UU…` and a `PL…` playlist (Réglages → Ma chaîne accepts « id de playlist »; one extra `playlists.list` call), and a bare handle without `@`. `handle` = `snippet.customUrl`.
7. **« Ma chaîne ».** Ruling: reconciled lazily by `reconcileMyChannel()` on `GET /api/channels` and on the app-open trigger; `UC…`, `/channel/UC…` and `UU…` inputs resolve locally, handles and playlists once per server process (cached by input). Its chip has no « Ne plus suivre » and `DELETE` answers 409 (it would come straight back).
8. **Stale trigger.** Ruling: `src/components/ChannelSyncTrigger.tsx`, rendered once in the root layout, POSTs `/api/channels/sync-stale` once per document load (module-level guard against StrictMode double effects); the server throttles the automatic trigger to once per 10 minutes and skips it while the quota is blocked. The same route with `{ all: true }` is « Tout actualiser ». It also kicks the classification worker so an interrupted classification resumes.
9. **Classification model and cost.** Ruling: `google/gemini-2.5-flash-lite` (fixed constant, see verified facts). Estimate per thumbnail = 700 input tokens (258 image + prompt and schema) and 20 output tokens → $0.000078, about $0.08 per 1 000. The logged cost is OpenRouter's `usage.cost`, falling back to tokens × price. `logGeneration` gains an optional `costEstimate` and the `endpoint` union gains `"classify-thumbnail"`; rows have `provider = "openrouter"`, `image_count = 0`, `project_id = NULL` (so `list_past_generations`, which filters by project, never lists them) and appear in Usage and in `/api/agent/usage` totals.
10. **« Avant un premier lot de plus de 200 miniatures ».** Ruling: a « lot » is the set of pending thumbnails not yet approved when the worker looks; 200 or fewer are approved automatically, more wait for « Lancer le classement » (`POST /api/channels/classification`, a route the spec's §7 does not list). Invalid model output → `other` (source `ai`); a failed request leaves the thumbnail unclassified with `classify_attempts + 1`, retried by a later run, never more than 3 times. The AI writes only when `thumb_type_source IS NULL`, so a manual type (even one set while the model was answering) is never overwritten.
11. **« Ouvrir dans une miniature… ».** Rejected: updating the project JSON server-side — an open tab with a pending debounced autosave would overwrite the added node, and an external change makes `useCanvasSync` reload the canvas and reset its undo history. Ruling: navigate to `/m/<projectId>?reference=<swipeFileId>`; after `loadProject` resolves, `Canvas.tsx` removes the parameter with `history.replaceState`, looks the image up in `GET /api/swipe-files`, and adds a `swipeFile` node (`kind: "reference"`) at the view centre through the store's `addNode` — one undo step, saved by the normal debounced autosave whose `updated_at` lands in `recentOwnSaveUpdatedAts`, so the sync poll does not reload.
12. **Score sort and « Récente ».** Ruling: SQL sorts by `view_count / median_views` for videos published at least 7 days ago (nulls last, then newest first); each row's displayed performance comes from `performance.ts`. Views per day divide by at least one day (a video published 3 hours ago shows its views, not ×8).
13. **Pagination.** Ruling: « Voir plus » loads 60 more (the spec allows pagination); the list is refetched with the same limit when the channels poll shows progress; at most 1 200 are loaded, then the grid asks to refine the filters.
14. **« Les types qui marchent ».** Ruling: « nombre de miniatures » = classified thumbnails of the type; median score and best thumbnail use its scored ones (not recent, known median); types with fewer than 3 scored rows show « peu de données » after the ranked ones; types without any thumbnail are omitted; unclassified thumbnails are not listed. The type filter also offers « Non classée » (useful for manual correction when the AI is off).
15. **Picker tab « même grille ».** Ruling: same data, score sort and performance badges as the page grid, rendered as compact clickable tiles (no type menu inside a node's dialog); the dialog's search box filters titles through `q`.
16. **Thumbnail download.** Ruling: `fetchBestThumbnail` moves from the agent tool to `src/lib/youtube/thumbnails.ts` with `saveThumbnailToLibrary`; the tool keeps its behaviour and « YT — » label; the `use` route titles the copy with the video title (spec).
17. **Error visibility.** Ruling: a channel in error (other than quota) shows « Erreur » with the message as tooltip and an inline « Réessayer » button; its menu item reads « Réessayer ».
18. **Legacy feed.** After the rewrite nothing calls `/api/youtube/playlist` or `resolveUploadsPlaylistId`. Ruling: Task 12 deletes both when a grep confirms no other caller.

## File Structure

**Create**
- `src/lib/youtube/performance.ts` — median, recent cutoff, score, band, views per day, per-video performance (pure).
- `src/lib/youtube/thumb-types.ts` — fixed type list, labels, AI answer parsing, « types qui marchent » summary (pure, client-safe).
- `src/lib/youtube/classification-pricing.ts` — model id/label, prices, cost estimate, confirmation threshold (pure, client-safe).
- `src/lib/youtube/types.ts` — client-safe DTOs, constants, video query parsing, URL helpers.
- `src/lib/youtube/migrations.ts` — channel tables DDL + defensive column adds.
- `src/lib/youtube/channel-store.ts` — every SQL read/write on channels and videos used by sync, jobs, classification and routes.
- `src/lib/youtube/api.ts` — YouTube Data API v3 client (resolution, playlists, videos, durations, errors).
- `src/lib/youtube/thumbnails.ts` — best thumbnail download + library copy (shared with the agent tool).
- `src/lib/youtube/runtime.ts` — `globalThis` runtime state, locks, quota block.
- `src/lib/youtube/sync.ts` — one channel's synchronisation.
- `src/lib/youtube/classify.ts` — OpenRouter classifier, queue worker, status.
- `src/lib/youtube/jobs.ts` — background sync starts, stale queue, classification kick, status reconciliation.
- `src/lib/youtube/my-channel.ts` — « Ma chaîne » reconciliation.
- `src/lib/youtube/video-queries.ts` — video list (filters, sort, pagination) and types summary queries.
- `src/lib/youtube/route-errors.ts` — shared JSON error responses for the routes.
- `src/lib/canvas/pending-reference.ts` — `/m/<id>?reference=` link, parsing, node data.
- Routes: `src/app/api/channels/route.ts`, `src/app/api/channels/[id]/route.ts`, `src/app/api/channels/[id]/sync/route.ts`, `src/app/api/channels/sync-stale/route.ts`, `src/app/api/channels/preview/route.ts`, `src/app/api/channels/classification/route.ts`, `src/app/api/channels/videos/route.ts`, `src/app/api/channels/videos/[videoId]/route.ts`, `src/app/api/channels/videos/[videoId]/use/route.ts`, `src/app/api/channels/types-summary/route.ts`.
- `src/components/ChannelSyncTrigger.tsx`
- `src/components/library/followed-channels/`: `view.ts`, `api.ts`, `useFollowedChannels.ts`, `ChannelBar.tsx`, `FollowChannelDialog.tsx`, `ClassificationNotice.tsx`, `TypesSummary.tsx`, `VideoGrid.tsx`, `VideoCard.tsx`, `ThumbTypeMenu.tsx`, `UseAsReferenceDialog.tsx`, `FollowedChannelsPickerTab.tsx`.
- `scripts/seed-followed-channels.mjs` — dev-only demo data for throwaway databases.
- Tests: `tests/channels/performance.test.ts`, `tests/channels/thumb-types.test.ts`, `tests/channels/video-query-params.test.ts`, `tests/channels/channel-tables.test.ts`, `tests/channels/channel-store.test.ts`, `tests/channels/fake-youtube.ts` (helper), `tests/channels/youtube-api.test.ts`, `tests/channels/thumbnails.test.ts`, `tests/channels/runtime.test.ts`, `tests/channels/sync.test.ts`, `tests/channels/classify.test.ts`, `tests/channels/jobs.test.ts`, `tests/channels/my-channel.test.ts`, `tests/channels/video-queries.test.ts`, `tests/channels/channels-routes.test.ts`, `tests/channels/videos-routes.test.ts`, `tests/channels/view.test.ts`, `tests/canvas/pending-reference.test.ts`.

**Modify**
- `src/lib/db.ts`, `src/lib/settings-schema.ts`, `src/lib/generations-log.ts`, `src/lib/agent/tools/import-youtube-thumbnail.ts`, `src/lib/youtube/channel.ts`, `src/components/settings/GenerationSection.tsx`, `src/app/layout.tsx`, `src/components/Canvas.tsx`, `src/components/library/FollowedChannelsSection.tsx` (full rewrite of C's file), `src/components/library/picker-tabs.tsx` (C's file), `tests/settings/settings.test.ts`.

**Delete**
- `src/app/api/youtube/playlist/route.ts` (Task 12, after a grep).

## Execution lanes

Tasks touching disjoint files may run in parallel worktrees, merged in task order:
- **Lane A:** Task 1 → Task 2. **Lane B (from the start):** Task 5.
- After Task 2: Task 3 ∥ Task 4.
- After Tasks 3 and 4: Task 6 ∥ Task 7 ∥ Task 9.
- Then Task 8 (needs 6 and 7) → Task 10 (needs 5, 8, 9) → Task 11.
- After Task 11: Task 12 → Task 13 → Task 14 (they share the section files) ∥ Task 15.
- Task 16 last, alone.

---
## Task 1: Performance maths (`performance.ts`)

**Files:**
- Create: `src/lib/youtube/performance.ts`
- Test: `tests/channels/performance.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces (`src/lib/youtube/performance.ts`):
  - `RECENT_DAYS = 7`, `MEDIAN_SAMPLE_SIZE = 50`, `OVERPERFORM_SCORE = 3`, `UNDERPERFORM_SCORE = 0.5`
  - `type PerformanceBand = "over" | "neutral" | "under"`
  - `type ViewSample = { publishedAt: string; viewCount: number }`
  - `type VideoPerformance = { kind: "scored"; score: number; band: PerformanceBand } | { kind: "recent"; viewsPerDay: number } | { kind: "none" }`
  - `median(values: readonly number[]): number | null`
  - `ageInDays(publishedAt: string, now: Date): number`
  - `isRecent(publishedAt: string, now: Date): boolean`
  - `recentCutoffIso(now: Date): string`
  - `channelMedianViews(videos: readonly ViewSample[], now: Date): number | null`
  - `performanceScore(viewCount: number, medianViews: number | null): number | null`
  - `performanceBand(score: number): PerformanceBand`
  - `viewsPerDay(viewCount: number, publishedAt: string, now: Date): number`
  - `videoPerformance(video: ViewSample, medianViews: number | null, now: Date): VideoPerformance`

- [ ] **Step 1: Check that chantier C is merged**

```bash
cd /Users/antoinevigneau/thumbgen-real
git checkout main && git log --oneline -1
test -f src/app/bibliotheque/page.tsx && test -f src/components/library/FollowedChannelsSection.tsx && test -f src/components/library/picker-tabs.tsx && test -f src/components/library/LibraryPickerDialog.tsx && echo "chantier C present"
grep -n "export type LibraryKind\|export type LibraryPick\|export type PickerTab\|export const PICKER_TABS" src/components/library/picker-tabs.tsx
grep -n "youtube-channel-saved" src/components/library/FollowedChannelsSection.tsx
grep -n "export function getOpenRouterClient" src/lib/agent/llm-client.ts
grep -n "selectOnly:\|loadProject:" src/store/canvas-store.ts
grep -n "export function viewportCenterPosition" src/lib/canvas/placement.ts
```

Expected: « chantier C present » and every grep prints at least one line. If not, STOP and report that chantier C has not landed.

- [ ] **Step 2: Write the failing tests**

Create `tests/channels/performance.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ageInDays,
  channelMedianViews,
  isRecent,
  median,
  performanceBand,
  performanceScore,
  recentCutoffIso,
  videoPerformance,
  viewsPerDay,
} from "@/lib/youtube/performance";

const NOW = new Date("2026-09-16T12:00:00.000Z");
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

describe("median", () => {
  it("takes the middle value of an odd list", () => {
    expect(median([30, 10, 20])).toBe(20);
  });

  it("averages the two middle values of an even list", () => {
    expect(median([40, 10, 30, 20])).toBe(25);
  });

  it("is null for an empty list", () => {
    expect(median([])).toBeNull();
  });

  it("leaves the caller's array untouched", () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe("recent videos", () => {
  it("counts fractional days since publication", () => {
    expect(ageInDays(daysAgo(1.5), NOW)).toBeCloseTo(1.5);
  });

  it("is recent under 7 days and old from 7 days on", () => {
    expect(isRecent(daysAgo(6.9), NOW)).toBe(true);
    expect(isRecent(daysAgo(7), NOW)).toBe(false);
  });

  it("exposes the cutoff 7 days back as an ISO date", () => {
    expect(recentCutoffIso(NOW)).toBe("2026-09-09T12:00:00.000Z");
  });
});

describe("channelMedianViews", () => {
  it("ignores videos published less than 7 days ago", () => {
    const videos = [
      { publishedAt: daysAgo(1), viewCount: 1_000_000 },
      { publishedAt: daysAgo(10), viewCount: 100 },
      { publishedAt: daysAgo(20), viewCount: 300 },
    ];
    expect(channelMedianViews(videos, NOW)).toBe(200);
  });

  it("keeps only the 50 most recent old videos, whatever the input order", () => {
    const videos = Array.from({ length: 60 }, (_, index) => ({
      publishedAt: daysAgo(8 + index),
      viewCount: 1000 + index,
    })).reverse();
    // The 50 most recent are indexes 0..49 → views 1000..1049 → median 1024.5
    expect(channelMedianViews(videos, NOW)).toBe(1024.5);
  });

  it("uses every old video when there are fewer than 50", () => {
    const videos = [
      { publishedAt: daysAgo(9), viewCount: 10 },
      { publishedAt: daysAgo(30), viewCount: 30 },
    ];
    expect(channelMedianViews(videos, NOW)).toBe(20);
  });

  it("is null when every video is recent", () => {
    expect(channelMedianViews([{ publishedAt: daysAgo(2), viewCount: 50 }], NOW)).toBeNull();
  });
});

describe("performanceScore", () => {
  it("divides by the channel median and rounds to one decimal", () => {
    expect(performanceScore(1_234, 1_000)).toBe(1.2);
    expect(performanceScore(400, 1_000)).toBe(0.4);
    expect(performanceScore(8_460, 1_000)).toBe(8.5);
  });

  it("has no score without a positive median", () => {
    expect(performanceScore(500, null)).toBeNull();
    expect(performanceScore(500, 0)).toBeNull();
  });
});

describe("performanceBand", () => {
  it("splits at ×3 and ×0.5", () => {
    expect(performanceBand(3)).toBe("over");
    expect(performanceBand(8.5)).toBe("over");
    expect(performanceBand(2.9)).toBe("neutral");
    expect(performanceBand(0.5)).toBe("neutral");
    expect(performanceBand(0.4)).toBe("under");
  });
});

describe("viewsPerDay", () => {
  it("divides views by the days since publication", () => {
    expect(viewsPerDay(1_700, daysAgo(2), NOW)).toBe(850);
  });

  it("counts at least one day for a video published a few hours ago", () => {
    expect(viewsPerDay(300, daysAgo(0.1), NOW)).toBe(300);
  });
});

describe("videoPerformance", () => {
  it("shows views per day for a recent video", () => {
    expect(videoPerformance({ publishedAt: daysAgo(2), viewCount: 1_700 }, 1_000, NOW)).toEqual({
      kind: "recent",
      viewsPerDay: 850,
    });
  });

  it("scores an older video with its band", () => {
    expect(videoPerformance({ publishedAt: daysAgo(30), viewCount: 3_000 }, 1_000, NOW)).toEqual({
      kind: "scored",
      score: 3,
      band: "over",
    });
  });

  it("has nothing to show when the median is unknown", () => {
    expect(videoPerformance({ publishedAt: daysAgo(30), viewCount: 3_000 }, null, NOW)).toEqual({ kind: "none" });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/channels/performance.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/youtube/performance"`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/youtube/performance.ts`:

```ts
/**
 * Performance maths for followed-channel videos (chantier D §3), pure and
 * client-safe. A score compares a video's views with the median views of its
 * channel's recent long-form videos, like vidIQ / OutlierKit / 1of10.
 */

export const RECENT_DAYS = 7;
export const MEDIAN_SAMPLE_SIZE = 50;
export const OVERPERFORM_SCORE = 3;
export const UNDERPERFORM_SCORE = 0.5;

const DAY_MS = 24 * 60 * 60 * 1000;

export type PerformanceBand = "over" | "neutral" | "under";

export type ViewSample = { publishedAt: string; viewCount: number };

export type VideoPerformance =
  | { kind: "scored"; score: number; band: PerformanceBand }
  | { kind: "recent"; viewsPerDay: number }
  | { kind: "none" };

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function ageInDays(publishedAt: string, now: Date): number {
  const published = Date.parse(publishedAt);
  if (Number.isNaN(published)) return 0;
  return Math.max(0, (now.getTime() - published) / DAY_MS);
}

/** Published less than 7 days ago: too early for a score. */
export function isRecent(publishedAt: string, now: Date): boolean {
  return ageInDays(publishedAt, now) < RECENT_DAYS;
}

/** Videos published at or before this instant are old enough to be scored. */
export function recentCutoffIso(now: Date): string {
  return new Date(now.getTime() - RECENT_DAYS * DAY_MS).toISOString();
}

/** Median views of the 50 latest videos published more than 7 days ago (all of them if fewer). */
export function channelMedianViews(videos: readonly ViewSample[], now: Date): number | null {
  const sample = videos
    .filter((video) => !isRecent(video.publishedAt, now))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, MEDIAN_SAMPLE_SIZE)
    .map((video) => video.viewCount);
  return median(sample);
}

export function performanceScore(viewCount: number, medianViews: number | null): number | null {
  if (medianViews === null || !(medianViews > 0)) return null;
  return Math.round((viewCount / medianViews) * 10) / 10;
}

export function performanceBand(score: number): PerformanceBand {
  if (score >= OVERPERFORM_SCORE) return "over";
  if (score < UNDERPERFORM_SCORE) return "under";
  return "neutral";
}

/** Views divided by days online, counting at least one day. */
export function viewsPerDay(viewCount: number, publishedAt: string, now: Date): number {
  return Math.round(viewCount / Math.max(1, ageInDays(publishedAt, now)));
}

export function videoPerformance(video: ViewSample, medianViews: number | null, now: Date): VideoPerformance {
  if (isRecent(video.publishedAt, now)) {
    return { kind: "recent", viewsPerDay: viewsPerDay(video.viewCount, video.publishedAt, now) };
  }
  const score = performanceScore(video.viewCount, medianViews);
  if (score === null) return { kind: "none" };
  return { kind: "scored", score, band: performanceBand(score) };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/channels/performance.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Type-check and lint**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/lib/youtube/performance.ts tests/channels/performance.test.ts
```

Expected: `tsc` exits 0; no ESLint errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/youtube/performance.ts tests/channels/performance.test.ts
git commit -m "feat(channels): median, score, bands and views per day" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Thumbnail types, classification pricing and shared shapes

**Files:**
- Create: `src/lib/youtube/thumb-types.ts`, `src/lib/youtube/classification-pricing.ts`, `src/lib/youtube/types.ts`
- Test: `tests/channels/thumb-types.test.ts`, `tests/channels/video-query-params.test.ts`

**Interfaces:**
- Consumes: Task 1 — `median`, `type VideoPerformance`.
- Produces (`src/lib/youtube/thumb-types.ts`):
  - `THUMB_TYPES: readonly { id; label }[]` (the 9 spec types), `type ThumbType`, `THUMB_TYPE_IDS: [ThumbType, ...ThumbType[]]`
  - `UNCLASSIFIED_FILTER = "none"`, `UNCLASSIFIED_LABEL = "Non classée"`, `type ThumbTypeFilter = ThumbType | "none"`
  - `isThumbType(value: unknown): value is ThumbType`, `thumbTypeLabel(type: string | null | undefined): string`
  - `parseClassification(content: string | null | undefined): ThumbType`
  - `MIN_SCORED_FOR_RANKING = 3`, `type TypeSummaryInput = { videoId: string; title: string; thumbnailUrl: string; thumbType: ThumbType; score: number | null }`
  - `type TypeSummaryRow = { type: ThumbType; label: string; totalCount: number; scoredCount: number; enoughData: boolean; medianScore: number | null; best: { videoId: string; title: string; thumbnailUrl: string; score: number } | null }`
  - `summarizeTypes(videos: readonly TypeSummaryInput[]): TypeSummaryRow[]`
- Produces (`src/lib/youtube/classification-pricing.ts`): `CLASSIFY_MODEL = "google/gemini-2.5-flash-lite"`, `CLASSIFY_MODEL_LABEL = "Gemini 2.5 Flash Lite"`, `CLASSIFY_PRICING = { inputPerM: 0.1, outputPerM: 0.4 }`, `CLASSIFY_ESTIMATED_TOKENS = { input: 700, output: 20 }`, `CLASSIFY_CONFIRM_THRESHOLD = 200`, `tokenCostUsd(inputTokens: number, outputTokens: number): number`, `estimateClassificationCostUsd(count: number): number`.
- Produces (`src/lib/youtube/types.ts`):
  - `QUOTA_SYNC_ERROR = "Quota YouTube atteint — reprise demain"`, `MISSING_YOUTUBE_KEY_ERROR = "Ajoute ta clé YouTube dans Réglages → Connexions"`
  - `VIDEO_SORTS = ["score", "views", "date"]`, `type VideoSort`, `VIDEO_PERIODS = ["30d", "12m", "all"]`, `type VideoPeriod`, `VIDEO_PAGE_SIZE = 60`, `VIDEO_MAX_LIMIT = 1200`
  - `type SyncStatus = "idle" | "syncing" | "error"`
  - `type ChannelDetails = { youtubeChannelId: string; title: string; handle: string | null; avatarUrl: string | null; subscriberCount: number | null; videoCount: number | null }`, `type ChannelPreview = ChannelDetails & { alreadyFollowed: boolean }`
  - `type VideoDetails = { videoId: string; title: string; publishedAt: string; durationSeconds: number; viewCount: number; likeCount: number | null; thumbnailUrl: string; liveBroadcastContent: string }`
  - `type ChannelListItem = { id; youtubeChannelId; title; handle: string | null; avatarUrl: string | null; subscriberCount: number | null; isMine: boolean; medianViews: number | null; lastSyncedAt: string | null; syncStatus: SyncStatus; syncError: string | null; videoCount: number; createdAt: string }`
  - `type VideoListItem = { videoId; channelId; channelTitle; title; publishedAt; durationSeconds: number; viewCount: number; thumbnailUrl; thumbType: ThumbType | null; thumbTypeSource: "ai" | "manual" | null; performance: VideoPerformance }`
  - `type VideoListResponse = { items: VideoListItem[]; total: number; offset: number; limit: number }`
  - `type ClassificationStatus = { enabled: boolean; hasKey: boolean; pending: number; awaitingConfirmation: number; estimatedCostUsd: number; running: boolean; modelLabel: string }`
  - `type ChannelsResponse = { youtubeConfigured: boolean; channels: ChannelListItem[]; classification: ClassificationStatus }`, `type TypesSummaryResponse = { rows: TypeSummaryRow[] }`, `type UseVideoResponse = { swipeFileId: string; imageUrl: string; label: string }`
  - `type VideoQuery = { sort: VideoSort; types: ThumbTypeFilter[]; channelId: string | null; period: VideoPeriod; q: string; offset: number; limit: number }`, `DEFAULT_VIDEO_QUERY`
  - `parseVideoQuery(params: URLSearchParams): VideoQuery`, `videoQueryToSearch(query: Partial<VideoQuery>): string`
  - `youtubeThumbnailUrl(videoId: string, size?: "mqdefault" | "hqdefault" | "maxresdefault"): string`, `youtubeWatchUrl(videoId: string): string`, `libraryImageUrl(swipeFileId: string): string`

- [ ] **Step 1: Write the failing tests**

Create `tests/channels/thumb-types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  CLASSIFY_CONFIRM_THRESHOLD,
  CLASSIFY_MODEL,
  estimateClassificationCostUsd,
  tokenCostUsd,
} from "@/lib/youtube/classification-pricing";
import {
  THUMB_TYPES,
  isThumbType,
  parseClassification,
  summarizeTypes,
  thumbTypeLabel,
  type TypeSummaryInput,
} from "@/lib/youtube/thumb-types";

describe("thumbnail types", () => {
  it("lists the spec's nine types in order", () => {
    expect(THUMB_TYPES.map((type) => [type.id, type.label])).toEqual([
      ["face_text", "Visage + texte"],
      ["reaction", "Réaction sans texte"],
      ["before_after", "Avant / Après"],
      ["versus", "Versus / comparaison"],
      ["screenshot", "Capture d'écran / interface"],
      ["object", "Objet ou produit central"],
      ["text_only", "Texte seul"],
      ["scene", "Scène / illustration"],
      ["other", "Autre"],
    ]);
  });

  it("recognises ids and labels unclassified thumbnails", () => {
    expect(isThumbType("versus")).toBe(true);
    expect(isThumbType("none")).toBe(false);
    expect(isThumbType(42)).toBe(false);
    expect(thumbTypeLabel("scene")).toBe("Scène / illustration");
    expect(thumbTypeLabel(null)).toBe("Non classée");
    expect(thumbTypeLabel("none")).toBe("Non classée");
  });
});

describe("parseClassification", () => {
  it("reads the type from the model's JSON answer", () => {
    expect(parseClassification('{"type":"before_after"}')).toBe("before_after");
    expect(parseClassification('```json\n{"type":"versus"}\n```')).toBe("versus");
  });

  it("files every invalid answer under « other »", () => {
    expect(parseClassification('{"type":"banana"}')).toBe("other");
    expect(parseClassification('{"kind":"versus"}')).toBe("other");
    expect(parseClassification("visage + texte")).toBe("other");
    expect(parseClassification("")).toBe("other");
    expect(parseClassification(null)).toBe("other");
  });
});

describe("summarizeTypes", () => {
  const row = (videoId: string, thumbType: TypeSummaryInput["thumbType"], score: number | null): TypeSummaryInput => ({
    videoId,
    title: `Titre ${videoId}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    thumbType,
    score,
  });

  it("ranks types with at least 3 scored thumbnails by median score", () => {
    const rows = summarizeTypes([
      row("f1", "face_text", 1),
      row("f2", "face_text", 2),
      row("f3", "face_text", 9),
      row("r1", "reaction", 4),
      row("r2", "reaction", 5),
      row("r3", "reaction", 6),
      row("r4", "reaction", null),
      row("v1", "versus", 7),
      row("v2", "versus", 8),
      row("s1", "scene", null),
    ]);

    expect(rows.map((summary) => summary.type)).toEqual(["reaction", "face_text", "versus", "scene"]);
    expect(rows[0]).toEqual({
      type: "reaction",
      label: "Réaction sans texte",
      totalCount: 4,
      scoredCount: 3,
      enoughData: true,
      medianScore: 5,
      best: { videoId: "r3", title: "Titre r3", thumbnailUrl: "https://i.ytimg.com/vi/r3/mqdefault.jpg", score: 6 },
    });
    expect(rows[1]).toMatchObject({ type: "face_text", medianScore: 2, best: { videoId: "f3", score: 9 } });
    expect(rows[2]).toMatchObject({ type: "versus", totalCount: 2, scoredCount: 2, enoughData: false, medianScore: null, best: null });
    expect(rows[3]).toMatchObject({ type: "scene", totalCount: 1, scoredCount: 0, enoughData: false });
  });

  it("returns nothing without classified thumbnails", () => {
    expect(summarizeTypes([])).toEqual([]);
  });
});

describe("classification pricing", () => {
  it("prices tokens with Gemini 2.5 Flash Lite's OpenRouter rates", () => {
    expect(CLASSIFY_MODEL).toBe("google/gemini-2.5-flash-lite");
    expect(tokenCostUsd(1_000_000, 0)).toBeCloseTo(0.1);
    expect(tokenCostUsd(0, 1_000_000)).toBeCloseTo(0.4);
  });

  it("estimates about 8 cents per 1 000 thumbnails and asks above 200", () => {
    expect(estimateClassificationCostUsd(1000)).toBeCloseTo(0.078, 6);
    expect(estimateClassificationCostUsd(0)).toBe(0);
    expect(CLASSIFY_CONFIRM_THRESHOLD).toBe(200);
  });
});
```

Create `tests/channels/video-query-params.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIDEO_QUERY,
  libraryImageUrl,
  parseVideoQuery,
  videoQueryToSearch,
  youtubeThumbnailUrl,
  youtubeWatchUrl,
  type VideoQuery,
} from "@/lib/youtube/types";

describe("parseVideoQuery", () => {
  it("falls back to score, every type, every channel, all time, first 60", () => {
    expect(parseVideoQuery(new URLSearchParams())).toEqual(DEFAULT_VIDEO_QUERY);
    expect(DEFAULT_VIDEO_QUERY).toEqual({ sort: "score", types: [], channelId: null, period: "all", q: "", offset: 0, limit: 60 });
  });

  it("ignores unknown values and clamps the page window", () => {
    const query = parseVideoQuery(
      new URLSearchParams("sort=likes&period=week&types=versus,banana,none,versus&offset=-5&limit=5000&channel=%20&q=%20%20"),
    );
    expect(query).toEqual({ sort: "score", types: ["versus", "none"], channelId: null, period: "all", q: "", offset: 0, limit: 1200 });
    expect(parseVideoQuery(new URLSearchParams("limit=0")).limit).toBe(1);
    expect(parseVideoQuery(new URLSearchParams("limit=abc")).limit).toBe(60);
  });

  it("round-trips through videoQueryToSearch", () => {
    const query: VideoQuery = {
      sort: "date",
      types: ["face_text", "none"],
      channelId: "channel-1",
      period: "12m",
      q: "avant après",
      offset: 60,
      limit: 120,
    };
    expect(parseVideoQuery(new URLSearchParams(videoQueryToSearch(query)))).toEqual(query);
    expect(videoQueryToSearch({})).toBe("");
  });
});

describe("URL helpers", () => {
  it("builds YouTube and library URLs", () => {
    expect(youtubeThumbnailUrl("abcdefghijk")).toBe("https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg");
    expect(youtubeThumbnailUrl("abcdefghijk", "maxresdefault")).toBe("https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg");
    expect(youtubeWatchUrl("abcdefghijk")).toBe("https://www.youtube.com/watch?v=abcdefghijk");
    expect(libraryImageUrl("0f5c2c1e-4b1d-4a5e-9d7e-1b2c3d4e5f60")).toBe(
      "/api/swipe-files/image?f=0f5c2c1e-4b1d-4a5e-9d7e-1b2c3d4e5f60",
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/channels/thumb-types.test.ts tests/channels/video-query-params.test.ts`
Expected: FAIL — unresolved imports `@/lib/youtube/classification-pricing`, `@/lib/youtube/thumb-types`, `@/lib/youtube/types`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/youtube/thumb-types.ts`:

```ts
import { z } from "zod";
import { median } from "./performance";

/** The fixed thumbnail types of chantier D §5 (client-safe). */
export const THUMB_TYPES = [
  { id: "face_text", label: "Visage + texte" },
  { id: "reaction", label: "Réaction sans texte" },
  { id: "before_after", label: "Avant / Après" },
  { id: "versus", label: "Versus / comparaison" },
  { id: "screenshot", label: "Capture d'écran / interface" },
  { id: "object", label: "Objet ou produit central" },
  { id: "text_only", label: "Texte seul" },
  { id: "scene", label: "Scène / illustration" },
  { id: "other", label: "Autre" },
] as const;

export type ThumbType = (typeof THUMB_TYPES)[number]["id"];

export const THUMB_TYPE_IDS = THUMB_TYPES.map((type) => type.id) as [ThumbType, ...ThumbType[]];

/** Filter value for thumbnails without a type. */
export const UNCLASSIFIED_FILTER = "none";
export const UNCLASSIFIED_LABEL = "Non classée";
export type ThumbTypeFilter = ThumbType | typeof UNCLASSIFIED_FILTER;

export function isThumbType(value: unknown): value is ThumbType {
  return typeof value === "string" && (THUMB_TYPE_IDS as readonly string[]).includes(value);
}

export function thumbTypeLabel(type: string | null | undefined): string {
  return THUMB_TYPES.find((entry) => entry.id === type)?.label ?? UNCLASSIFIED_LABEL;
}

const ClassificationSchema = z.object({ type: z.enum(THUMB_TYPE_IDS) });

/** The model must answer {"type": "<id>"}; anything else counts as « other ». */
export function parseClassification(content: string | null | undefined): ThumbType {
  if (!content) return "other";
  const unfenced = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    const parsed = ClassificationSchema.safeParse(JSON.parse(unfenced));
    return parsed.success ? parsed.data.type : "other";
  } catch {
    return "other";
  }
}

export const MIN_SCORED_FOR_RANKING = 3;

export type TypeSummaryInput = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  thumbType: ThumbType;
  score: number | null;
};

export type TypeSummaryRow = {
  type: ThumbType;
  label: string;
  totalCount: number;
  scoredCount: number;
  enoughData: boolean;
  medianScore: number | null;
  best: { videoId: string; title: string; thumbnailUrl: string; score: number } | null;
};

type ScoredInput = TypeSummaryInput & { score: number };

/**
 * « Les types qui marchent »: one row per type that has thumbnails. Types with
 * at least 3 scored thumbnails are ranked by median score; the others follow,
 * flagged as not having enough data.
 */
export function summarizeTypes(videos: readonly TypeSummaryInput[]): TypeSummaryRow[] {
  const byType = new Map<ThumbType, TypeSummaryInput[]>();
  for (const video of videos) {
    const list = byType.get(video.thumbType) ?? [];
    list.push(video);
    byType.set(video.thumbType, list);
  }

  const rows: TypeSummaryRow[] = [];
  for (const { id, label } of THUMB_TYPES) {
    const list = byType.get(id);
    if (!list || list.length === 0) continue;
    const scored = list.filter((video): video is ScoredInput => video.score !== null);
    const enoughData = scored.length >= MIN_SCORED_FOR_RANKING;
    const best = enoughData ? scored.reduce((top, video) => (video.score > top.score ? video : top)) : null;
    const middle = enoughData ? median(scored.map((video) => video.score)) : null;
    rows.push({
      type: id,
      label,
      totalCount: list.length,
      scoredCount: scored.length,
      enoughData,
      medianScore: middle === null ? null : Math.round(middle * 10) / 10,
      best: best ? { videoId: best.videoId, title: best.title, thumbnailUrl: best.thumbnailUrl, score: best.score } : null,
    });
  }

  return rows.sort((a, b) => {
    if (a.enoughData !== b.enoughData) return a.enoughData ? -1 : 1;
    if (a.enoughData) return (b.medianScore ?? 0) - (a.medianScore ?? 0) || b.scoredCount - a.scoredCount;
    return b.totalCount - a.totalCount;
  });
}
```

Create `src/lib/youtube/classification-pricing.ts`:

```ts
/**
 * Thumbnail classification model and cost estimate (client-safe).
 *
 * Prices read from https://openrouter.ai/api/v1/models on 2026-09-16:
 * google/gemini-2.5-flash-lite costs $0.10 per million input tokens (images
 * included) and $0.40 per million output tokens, and supports structured
 * outputs. A 320×180 mqdefault thumbnail is 258 Gemini tokens; with the
 * instructions and the JSON schema a call is about 700 input tokens and the
 * answer about 20 output tokens.
 */

export const CLASSIFY_MODEL = "google/gemini-2.5-flash-lite";
export const CLASSIFY_MODEL_LABEL = "Gemini 2.5 Flash Lite";
export const CLASSIFY_PRICING = { inputPerM: 0.1, outputPerM: 0.4 } as const;
export const CLASSIFY_ESTIMATED_TOKENS = { input: 700, output: 20 } as const;

/** A first batch larger than this waits for the user's confirmation. */
export const CLASSIFY_CONFIRM_THRESHOLD = 200;

export function tokenCostUsd(inputTokens: number, outputTokens: number): number {
  return (inputTokens * CLASSIFY_PRICING.inputPerM + outputTokens * CLASSIFY_PRICING.outputPerM) / 1_000_000;
}

export function estimateClassificationCostUsd(count: number): number {
  return count * tokenCostUsd(CLASSIFY_ESTIMATED_TOKENS.input, CLASSIFY_ESTIMATED_TOKENS.output);
}
```

Create `src/lib/youtube/types.ts`:

```ts
import type { VideoPerformance } from "./performance";
import {
  UNCLASSIFIED_FILTER,
  isThumbType,
  type ThumbType,
  type ThumbTypeFilter,
  type TypeSummaryRow,
} from "./thumb-types";

/**
 * Shapes and constants shared by the followed-channels routes and the UI.
 * Client-safe: no database or Node import here.
 */

export const QUOTA_SYNC_ERROR = "Quota YouTube atteint — reprise demain";
export const MISSING_YOUTUBE_KEY_ERROR = "Ajoute ta clé YouTube dans Réglages → Connexions";

export const VIDEO_SORTS = ["score", "views", "date"] as const;
export type VideoSort = (typeof VIDEO_SORTS)[number];

export const VIDEO_PERIODS = ["30d", "12m", "all"] as const;
export type VideoPeriod = (typeof VIDEO_PERIODS)[number];

export const VIDEO_PAGE_SIZE = 60;
export const VIDEO_MAX_LIMIT = 1200;

export type SyncStatus = "idle" | "syncing" | "error";

export type ChannelDetails = {
  youtubeChannelId: string;
  title: string;
  handle: string | null;
  avatarUrl: string | null;
  subscriberCount: number | null;
  videoCount: number | null;
};

export type ChannelPreview = ChannelDetails & { alreadyFollowed: boolean };

export type VideoDetails = {
  videoId: string;
  title: string;
  publishedAt: string;
  durationSeconds: number;
  viewCount: number;
  likeCount: number | null;
  thumbnailUrl: string;
  liveBroadcastContent: string;
};

export type ChannelListItem = {
  id: string;
  youtubeChannelId: string;
  title: string;
  handle: string | null;
  avatarUrl: string | null;
  subscriberCount: number | null;
  isMine: boolean;
  medianViews: number | null;
  lastSyncedAt: string | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  videoCount: number;
  createdAt: string;
};

export type VideoListItem = {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  publishedAt: string;
  durationSeconds: number;
  viewCount: number;
  thumbnailUrl: string;
  thumbType: ThumbType | null;
  thumbTypeSource: "ai" | "manual" | null;
  performance: VideoPerformance;
};

export type VideoListResponse = { items: VideoListItem[]; total: number; offset: number; limit: number };

export type ClassificationStatus = {
  enabled: boolean;
  hasKey: boolean;
  pending: number;
  awaitingConfirmation: number;
  estimatedCostUsd: number;
  running: boolean;
  modelLabel: string;
};

export type ChannelsResponse = {
  youtubeConfigured: boolean;
  channels: ChannelListItem[];
  classification: ClassificationStatus;
};

export type TypesSummaryResponse = { rows: TypeSummaryRow[] };

export type UseVideoResponse = { swipeFileId: string; imageUrl: string; label: string };

export type VideoQuery = {
  sort: VideoSort;
  types: ThumbTypeFilter[];
  channelId: string | null;
  period: VideoPeriod;
  q: string;
  offset: number;
  limit: number;
};

export const DEFAULT_VIDEO_QUERY: VideoQuery = {
  sort: "score",
  types: [],
  channelId: null,
  period: "all",
  q: "",
  offset: 0,
  limit: VIDEO_PAGE_SIZE,
};

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const value = raw === null || raw.trim() === "" ? Number.NaN : Number(raw);
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function parseVideoQuery(params: URLSearchParams): VideoQuery {
  const types = (params.get("types") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is ThumbTypeFilter => value === UNCLASSIFIED_FILTER || isThumbType(value));
  return {
    sort: VIDEO_SORTS.find((sort) => sort === params.get("sort")) ?? DEFAULT_VIDEO_QUERY.sort,
    types: [...new Set(types)],
    channelId: params.get("channel")?.trim() || null,
    period: VIDEO_PERIODS.find((period) => period === params.get("period")) ?? DEFAULT_VIDEO_QUERY.period,
    q: (params.get("q") ?? "").trim().slice(0, 100),
    offset: clampInt(params.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER),
    limit: clampInt(params.get("limit"), VIDEO_PAGE_SIZE, 1, VIDEO_MAX_LIMIT),
  };
}

export function videoQueryToSearch(query: Partial<VideoQuery>): string {
  const params = new URLSearchParams();
  if (query.sort) params.set("sort", query.sort);
  if (query.types && query.types.length > 0) params.set("types", query.types.join(","));
  if (query.channelId) params.set("channel", query.channelId);
  if (query.period) params.set("period", query.period);
  if (query.q) params.set("q", query.q);
  if (query.offset) params.set("offset", String(query.offset));
  if (query.limit) params.set("limit", String(query.limit));
  return params.toString();
}

export function youtubeThumbnailUrl(
  videoId: string,
  size: "mqdefault" | "hqdefault" | "maxresdefault" = "mqdefault",
): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/${size}.jpg`;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

/** URL of an image stored in the library's swipe_files table (chantier C contract). */
export function libraryImageUrl(swipeFileId: string): string {
  return `/api/swipe-files/image?f=${encodeURIComponent(swipeFileId)}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/channels/thumb-types.test.ts tests/channels/video-query-params.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check and lint**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/lib/youtube/thumb-types.ts src/lib/youtube/classification-pricing.ts src/lib/youtube/types.ts tests/channels/thumb-types.test.ts tests/channels/video-query-params.test.ts
```

Expected: `tsc` exits 0; no ESLint errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/youtube/thumb-types.ts src/lib/youtube/classification-pricing.ts src/lib/youtube/types.ts tests/channels/thumb-types.test.ts tests/channels/video-query-params.test.ts
git commit -m "feat(channels): thumbnail types, classification pricing and shared shapes" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Channel tables and channel store

**Files:**
- Create: `src/lib/youtube/migrations.ts`, `src/lib/youtube/channel-store.ts`
- Modify: `src/lib/db.ts` (chantier C may have edited it — re-read first)
- Test: `tests/channels/channel-tables.test.ts`, `tests/channels/channel-store.test.ts`

**Interfaces:**
- Consumes: Task 1 — `type ViewSample`; Task 2 — `type ThumbType`, `type ChannelDetails`, `type ChannelListItem`, `type SyncStatus`, `type VideoDetails`.
- Produces (`src/lib/youtube/migrations.ts`): `CHANNEL_TABLES_DDL: string`, `migrateChannelTables(database: Database.Database): void`.
- Produces (`src/lib/youtube/channel-store.ts`):
  - `MAX_CLASSIFY_ATTEMPTS = 3`, `type ChannelRow` (snake_case columns of `followed_channels`), `type VideoRow` (snake_case columns of `channel_videos`)
  - `insertChannel(details: ChannelDetails, options?: { isMine?: boolean; syncStatus?: SyncStatus }): { channel: ChannelRow; inserted: boolean }`
  - `getChannel(id: string): ChannelRow | null`, `getChannelByYoutubeId(youtubeChannelId: string): ChannelRow | null`, `channelExists(id: string): boolean`
  - `listChannelItems(): ChannelListItem[]` (« Ma chaîne » first, then oldest follow first), `getChannelListItem(id: string): ChannelListItem | null`
  - `deleteChannel(id: string): boolean`, `updateChannelDetails(id: string, details: ChannelDetails): void`
  - `setSyncState(id: string, state: { status: SyncStatus; error?: string | null }): void`, `setPlaylistId(id: string, playlistId: string): void`, `setBackfill(id: string, state: { pageToken: string | null; done: boolean }): void`, `finishSync(id: string, result: { medianViews: number | null; syncedAt: string }): void`
  - `setMineChannel(channelId: string | null): boolean` (true when the « Ma chaîne » flag moved)
  - `allChannelIds(): string[]`, `staleChannelIds(cutoffIso: string): string[]`, `syncingChannelIds(): string[]`
  - `knownVideoIds(channelId: string): Set<string>`, `upsertVideos(channelId: string, videos: readonly VideoDetails[], stampIso: string): void`, `videoIdsToRefresh(channelId: string, stampIso: string): string[]`, `updateVideoStats(videos: readonly VideoDetails[], stampIso: string): void`, `deleteVideos(videoIds: readonly string[]): void`, `viewSamples(channelId: string): ViewSample[]`
  - `getVideo(videoId: string): VideoRow | null`, `setManualThumbType(videoId: string, type: ThumbType): boolean`, `setAiThumbType(videoId: string, type: ThumbType): boolean`, `incrementClassifyAttempts(videoId: string): void`, `setVideoSwipeFile(videoId: string, swipeFileId: string): void`
  - `countPendingClassification(): { pending: number; unapproved: number }`, `approvePendingClassification(): number`, `nextClassificationBatch(limit: number): string[]` (video ids, newest first)

- [ ] **Step 1: Re-read `src/lib/db.ts` on the latest `main`**

Run: `git log --oneline -1 -- src/lib/db.ts && grep -n "AGENT_TABLES_DDL\|pruneRemovedSettingsKeys(database)" src/lib/db.ts`
Expected: the import `import { AGENT_TABLES_DDL } from "./agent/migrations";`, the line `database.exec(AGENT_TABLES_DDL);` inside `init`, and `pruneRemovedSettingsKeys(database);`.

- [ ] **Step 2: Write the failing tests**

Create `tests/channels/channel-tables.test.ts`:

```ts
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { migrateChannelTables } from "@/lib/youtube/migrations";

const columns = (database: Database.Database, table: string) =>
  (database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((column) => column.name);

describe("channel tables", () => {
  it("exist in the app database with every column and index", () => {
    const db = getDb();
    expect(columns(db, "followed_channels")).toEqual(
      expect.arrayContaining([
        "id",
        "youtube_channel_id",
        "title",
        "handle",
        "avatar_url",
        "subscriber_count",
        "is_mine",
        "median_views",
        "last_synced_at",
        "sync_status",
        "sync_error",
        "playlist_id",
        "backfill_page_token",
        "backfill_done",
        "created_at",
      ]),
    );
    expect(columns(db, "channel_videos")).toEqual(
      expect.arrayContaining([
        "video_id",
        "channel_id",
        "title",
        "published_at",
        "duration_seconds",
        "view_count",
        "like_count",
        "thumbnail_url",
        "stats_updated_at",
        "thumb_type",
        "thumb_type_source",
        "classify_attempts",
        "classify_approved",
        "swipe_file_id",
        "created_at",
      ]),
    );
    const indexes = (db.prepare("PRAGMA index_list(channel_videos)").all() as { name: string }[]).map((index) => index.name);
    expect(indexes).toEqual(
      expect.arrayContaining(["idx_channel_videos_channel_id", "idx_channel_videos_published_at", "idx_channel_videos_thumb_type"]),
    );
  });

  it("adds the resume and classification columns to tables created without them", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE followed_channels (
        id TEXT PRIMARY KEY, youtube_channel_id TEXT NOT NULL UNIQUE, title TEXT NOT NULL, handle TEXT,
        avatar_url TEXT, subscriber_count INTEGER, is_mine INTEGER NOT NULL DEFAULT 0, median_views REAL,
        last_synced_at TEXT, sync_status TEXT NOT NULL DEFAULT 'idle', sync_error TEXT, created_at TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE channel_videos (
        video_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, title TEXT NOT NULL, published_at TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL DEFAULT 0, view_count INTEGER NOT NULL DEFAULT 0, like_count INTEGER,
        thumbnail_url TEXT NOT NULL, stats_updated_at TEXT NOT NULL, thumb_type TEXT, thumb_type_source TEXT,
        created_at TEXT NOT NULL DEFAULT ''
      );
    `);
    migrateChannelTables(db);
    expect(columns(db, "followed_channels")).toEqual(expect.arrayContaining(["playlist_id", "backfill_page_token", "backfill_done"]));
    expect(columns(db, "channel_videos")).toEqual(expect.arrayContaining(["classify_attempts", "classify_approved", "swipe_file_id"]));
    db.close();
  });

  it("can run twice", () => {
    const db = new Database(":memory:");
    migrateChannelTables(db);
    migrateChannelTables(db);
    expect(columns(db, "channel_videos")).toContain("swipe_file_id");
    db.close();
  });

  it("deletes a channel's videos with the channel", () => {
    const db = getDb();
    db.prepare("DELETE FROM followed_channels WHERE id = 'cascade-channel'").run();
    db.prepare(
      "INSERT INTO followed_channels (id, youtube_channel_id, title) VALUES ('cascade-channel', 'UCcascadecascadecascade01', 'Cascade')",
    ).run();
    db.prepare(
      `INSERT INTO channel_videos (video_id, channel_id, title, published_at, thumbnail_url, stats_updated_at)
       VALUES ('cascadevid1', 'cascade-channel', 'V', '2026-01-01T00:00:00.000Z', 'https://i.ytimg.com/vi/cascadevid1/mqdefault.jpg', '2026-01-01T00:00:00.000Z')`,
    ).run();
    db.prepare("DELETE FROM followed_channels WHERE id = 'cascade-channel'").run();
    expect(db.prepare("SELECT COUNT(*) AS n FROM channel_videos WHERE video_id = 'cascadevid1'").get()).toEqual({ n: 0 });
  });
});
```

Create `tests/channels/channel-store.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import * as store from "@/lib/youtube/channel-store";
import type { ChannelDetails, VideoDetails } from "@/lib/youtube/types";

const details = (letter: string, overrides: Partial<ChannelDetails> = {}): ChannelDetails => ({
  youtubeChannelId: `UC${letter.repeat(22)}`,
  title: `Chaîne ${letter}`,
  handle: `@chaine${letter}`,
  avatarUrl: `https://yt3.example/${letter}.jpg`,
  subscriberCount: 1000,
  videoCount: 10,
  ...overrides,
});

const video = (videoId: string, overrides: Partial<VideoDetails> = {}): VideoDetails => ({
  videoId,
  title: `Vidéo ${videoId}`,
  publishedAt: "2026-08-01T10:00:00.000Z",
  durationSeconds: 600,
  viewCount: 100,
  likeCount: 5,
  thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
  liveBroadcastContent: "none",
  ...overrides,
});

const STAMP_1 = "2026-09-01T00:00:00.000Z";
const STAMP_2 = "2026-09-02T00:00:00.000Z";

beforeEach(() => {
  getDb().exec("DELETE FROM followed_channels");
});

describe("channels", () => {
  it("inserts once per YouTube channel and lists video counts", () => {
    const first = store.insertChannel(details("a"), { syncStatus: "syncing" });
    const again = store.insertChannel(details("a", { title: "Autre titre" }));
    expect(first.inserted).toBe(true);
    expect(again.inserted).toBe(false);
    expect(again.channel.id).toBe(first.channel.id);

    store.upsertVideos(first.channel.id, [video("vid-a1"), video("vid-a2")], STAMP_1);
    expect(store.listChannelItems()).toEqual([
      {
        id: first.channel.id,
        youtubeChannelId: `UC${"a".repeat(22)}`,
        title: "Chaîne a",
        handle: "@chainea",
        avatarUrl: "https://yt3.example/a.jpg",
        subscriberCount: 1000,
        isMine: false,
        medianViews: null,
        lastSyncedAt: null,
        syncStatus: "syncing",
        syncError: null,
        videoCount: 2,
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      },
    ]);
    expect(store.getChannelListItem(first.channel.id)?.videoCount).toBe(2);
    expect(store.getChannelListItem("nope")).toBeNull();
    expect(store.channelExists(first.channel.id)).toBe(true);
  });

  it("lists « Ma chaîne » first and moves the flag when it changes", () => {
    const a = store.insertChannel(details("a")).channel;
    const b = store.insertChannel(details("b")).channel;

    expect(store.setMineChannel(b.id)).toBe(true);
    expect(store.listChannelItems().map((item) => [item.id, item.isMine])).toEqual([
      [b.id, true],
      [a.id, false],
    ]);
    expect(store.setMineChannel(b.id)).toBe(false);
    expect(store.setMineChannel(a.id)).toBe(true);
    expect(store.getChannel(b.id)?.is_mine).toBe(0);
    expect(store.setMineChannel(null)).toBe(true);
    expect(store.listChannelItems().every((item) => !item.isMine)).toBe(true);
  });

  it("finds stale channels: never synced or synced before the cutoff", () => {
    const never = store.insertChannel(details("a")).channel;
    const old = store.insertChannel(details("b")).channel;
    const fresh = store.insertChannel(details("c")).channel;
    store.finishSync(old.id, { medianViews: 10, syncedAt: "2026-09-01T00:00:00.000Z" });
    store.finishSync(fresh.id, { medianViews: 10, syncedAt: "2026-09-10T00:00:00.000Z" });

    expect(store.staleChannelIds("2026-09-05T00:00:00.000Z")).toEqual([never.id, old.id]);
    expect(store.allChannelIds().sort()).toEqual([never.id, old.id, fresh.id].sort());
  });

  it("records sync progress and results", () => {
    const { channel } = store.insertChannel(details("a"));
    const playlistId = `UULF${"a".repeat(22)}`;
    store.setPlaylistId(channel.id, playlistId);
    store.setBackfill(channel.id, { pageToken: "100", done: false });
    store.setSyncState(channel.id, { status: "syncing" });
    expect(store.syncingChannelIds()).toEqual([channel.id]);
    store.setSyncState(channel.id, { status: "error", error: "Quota YouTube atteint — reprise demain" });
    expect(store.getChannel(channel.id)).toMatchObject({
      playlist_id: playlistId,
      backfill_page_token: "100",
      backfill_done: 0,
      sync_status: "error",
      sync_error: "Quota YouTube atteint — reprise demain",
    });

    store.setBackfill(channel.id, { pageToken: null, done: true });
    store.finishSync(channel.id, { medianViews: 1234.5, syncedAt: STAMP_2 });
    store.updateChannelDetails(channel.id, details("a", { title: "Nouveau nom", subscriberCount: 2000 }));
    expect(store.getChannel(channel.id)).toMatchObject({
      backfill_page_token: null,
      backfill_done: 1,
      median_views: 1234.5,
      last_synced_at: STAMP_2,
      sync_status: "idle",
      sync_error: null,
      title: "Nouveau nom",
      subscriber_count: 2000,
    });
    expect(store.syncingChannelIds()).toEqual([]);
  });

  it("deletes a channel with its videos", () => {
    const { channel } = store.insertChannel(details("a"));
    store.upsertVideos(channel.id, [video("vid-1")], STAMP_1);
    expect(store.deleteChannel(channel.id)).toBe(true);
    expect(store.getVideo("vid-1")).toBeNull();
    expect(store.deleteChannel(channel.id)).toBe(false);
  });
});

describe("videos", () => {
  let channelId: string;

  beforeEach(() => {
    channelId = store.insertChannel(details("v")).channel.id;
  });

  it("updates stats on re-import without touching the thumbnail type", () => {
    store.upsertVideos(channelId, [video("vid-1")], STAMP_1);
    store.setManualThumbType("vid-1", "versus");
    store.upsertVideos(channelId, [video("vid-1", { viewCount: 999, title: "Nouveau titre" })], STAMP_2);
    expect(store.getVideo("vid-1")).toMatchObject({
      view_count: 999,
      title: "Nouveau titre",
      thumb_type: "versus",
      thumb_type_source: "manual",
      stats_updated_at: STAMP_2,
    });
  });

  it("lists videos to refresh, refreshes and deletes them", () => {
    store.upsertVideos(channelId, [video("vid-1"), video("vid-2")], STAMP_1);
    store.upsertVideos(channelId, [video("vid-3")], STAMP_2);
    expect(store.videoIdsToRefresh(channelId, STAMP_2).sort()).toEqual(["vid-1", "vid-2"]);

    store.updateVideoStats([video("vid-1", { viewCount: 42, likeCount: null })], STAMP_2);
    store.deleteVideos(["vid-2"]);

    expect(store.getVideo("vid-1")).toMatchObject({ view_count: 42, like_count: null, stats_updated_at: STAMP_2 });
    expect(store.getVideo("vid-2")).toBeNull();
    expect([...store.knownVideoIds(channelId)].sort()).toEqual(["vid-1", "vid-3"]);
    expect(store.viewSamples(channelId)).toEqual(
      expect.arrayContaining([
        { publishedAt: "2026-08-01T10:00:00.000Z", viewCount: 42 },
        { publishedAt: "2026-08-01T10:00:00.000Z", viewCount: 100 },
      ]),
    );
  });

  it("never lets the AI overwrite a type once set", () => {
    store.upsertVideos(channelId, [video("vid-1"), video("vid-2")], STAMP_1);
    expect(store.setManualThumbType("vid-1", "face_text")).toBe(true);
    expect(store.setManualThumbType("missing", "face_text")).toBe(false);

    expect(store.setAiThumbType("vid-1", "scene")).toBe(false);
    expect(store.setAiThumbType("vid-2", "scene")).toBe(true);
    expect(store.setAiThumbType("vid-2", "object")).toBe(false);

    expect(store.getVideo("vid-1")).toMatchObject({ thumb_type: "face_text", thumb_type_source: "manual" });
    expect(store.getVideo("vid-2")).toMatchObject({ thumb_type: "scene", thumb_type_source: "ai" });
  });

  it("queues pending thumbnails with approval and at most 3 attempts", () => {
    store.upsertVideos(
      channelId,
      [
        video("old", { publishedAt: "2026-01-01T00:00:00.000Z" }),
        video("new", { publishedAt: "2026-06-01T00:00:00.000Z" }),
        video("done"),
      ],
      STAMP_1,
    );
    store.setManualThumbType("done", "other");

    expect(store.countPendingClassification()).toEqual({ pending: 2, unapproved: 2 });
    expect(store.nextClassificationBatch(10)).toEqual([]);
    expect(store.approvePendingClassification()).toBe(2);
    expect(store.nextClassificationBatch(10)).toEqual(["new", "old"]);

    for (let attempt = 0; attempt < 3; attempt += 1) store.incrementClassifyAttempts("old");
    expect(store.nextClassificationBatch(10)).toEqual(["new"]);
    expect(store.countPendingClassification()).toEqual({ pending: 1, unapproved: 0 });
  });

  it("remembers the library copy of a thumbnail", () => {
    store.upsertVideos(channelId, [video("vid-1")], STAMP_1);
    store.setVideoSwipeFile("vid-1", "swipe-123");
    expect(store.getVideo("vid-1")?.swipe_file_id).toBe("swipe-123");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/channels/channel-tables.test.ts tests/channels/channel-store.test.ts`
Expected: FAIL — unresolved `@/lib/youtube/migrations` and `@/lib/youtube/channel-store`.

- [ ] **Step 4: Write the migration**

Create `src/lib/youtube/migrations.ts`:

```ts
import type Database from "better-sqlite3";

/**
 * Followed channels and their long-form videos (chantier D §2). Imported by
 * src/lib/db.ts at boot. Timestamps are ISO 8601 strings written by the app.
 */
export const CHANNEL_TABLES_DDL = `
  CREATE TABLE IF NOT EXISTS followed_channels (
    id                  TEXT PRIMARY KEY,
    youtube_channel_id  TEXT NOT NULL UNIQUE,
    title               TEXT NOT NULL,
    handle              TEXT,
    avatar_url          TEXT,
    subscriber_count    INTEGER,
    is_mine             INTEGER NOT NULL DEFAULT 0,
    median_views        REAL,
    last_synced_at      TEXT,
    sync_status         TEXT NOT NULL DEFAULT 'idle',
    sync_error          TEXT,
    playlist_id         TEXT,
    backfill_page_token TEXT,
    backfill_done       INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS channel_videos (
    video_id          TEXT PRIMARY KEY,
    channel_id        TEXT NOT NULL REFERENCES followed_channels(id) ON DELETE CASCADE,
    title             TEXT NOT NULL,
    published_at      TEXT NOT NULL,
    duration_seconds  INTEGER NOT NULL DEFAULT 0,
    view_count        INTEGER NOT NULL DEFAULT 0,
    like_count        INTEGER,
    thumbnail_url     TEXT NOT NULL,
    stats_updated_at  TEXT NOT NULL,
    thumb_type        TEXT,
    thumb_type_source TEXT,
    classify_attempts INTEGER NOT NULL DEFAULT 0,
    classify_approved INTEGER NOT NULL DEFAULT 0,
    swipe_file_id     TEXT,
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_channel_videos_channel_id   ON channel_videos(channel_id);
  CREATE INDEX IF NOT EXISTS idx_channel_videos_published_at ON channel_videos(published_at);
  CREATE INDEX IF NOT EXISTS idx_channel_videos_thumb_type   ON channel_videos(thumb_type);
`;

// Columns the plan added on top of the spec's list (sync resume, classification
// queue, library copy). CREATE TABLE IF NOT EXISTS never alters an existing
// table, so a table created before one of them existed gets it here.
const ADDED_COLUMNS: ReadonlyArray<{ table: string; column: string; definition: string }> = [
  { table: "followed_channels", column: "playlist_id", definition: "TEXT" },
  { table: "followed_channels", column: "backfill_page_token", definition: "TEXT" },
  { table: "followed_channels", column: "backfill_done", definition: "INTEGER NOT NULL DEFAULT 0" },
  { table: "channel_videos", column: "classify_attempts", definition: "INTEGER NOT NULL DEFAULT 0" },
  { table: "channel_videos", column: "classify_approved", definition: "INTEGER NOT NULL DEFAULT 0" },
  { table: "channel_videos", column: "swipe_file_id", definition: "TEXT" },
];

export function migrateChannelTables(database: Database.Database): void {
  database.exec(CHANNEL_TABLES_DDL);
  for (const { table, column, definition } of ADDED_COLUMNS) {
    const existing = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!existing.some((entry) => entry.name === column)) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
}
```

- [ ] **Step 5: Wire the migration into `src/lib/db.ts`**

Add the import next to the agent one:

```ts
import { AGENT_TABLES_DDL } from "./agent/migrations";
import { migrateChannelTables } from "./youtube/migrations";
```

In `init`, right after `database.exec(AGENT_TABLES_DDL);`:

```ts
  database.exec(AGENT_TABLES_DDL);
  migrateChannelTables(database);
```

- [ ] **Step 6: Write the channel store**

Create `src/lib/youtube/channel-store.ts`:

```ts
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import type { ViewSample } from "./performance";
import type { ThumbType } from "./thumb-types";
import type { ChannelDetails, ChannelListItem, SyncStatus, VideoDetails } from "./types";

/** Every SQL statement on followed_channels / channel_videos lives here. */

export const MAX_CLASSIFY_ATTEMPTS = 3;

export type ChannelRow = {
  id: string;
  youtube_channel_id: string;
  title: string;
  handle: string | null;
  avatar_url: string | null;
  subscriber_count: number | null;
  is_mine: number;
  median_views: number | null;
  last_synced_at: string | null;
  sync_status: SyncStatus;
  sync_error: string | null;
  playlist_id: string | null;
  backfill_page_token: string | null;
  backfill_done: number;
  created_at: string;
};

export type VideoRow = {
  video_id: string;
  channel_id: string;
  title: string;
  published_at: string;
  duration_seconds: number;
  view_count: number;
  like_count: number | null;
  thumbnail_url: string;
  stats_updated_at: string;
  thumb_type: string | null;
  thumb_type_source: "ai" | "manual" | null;
  classify_attempts: number;
  classify_approved: number;
  swipe_file_id: string | null;
  created_at: string;
};

type ChannelRowWithCount = ChannelRow & { video_count: number };

const PENDING_WHERE = `thumb_type IS NULL AND thumb_type_source IS NULL AND classify_attempts < ${MAX_CLASSIFY_ATTEMPTS}`;

const CHANNEL_WITH_COUNT = `
  SELECT c.*, (SELECT COUNT(*) FROM channel_videos v WHERE v.channel_id = c.id) AS video_count
  FROM followed_channels c
`;

function toChannelListItem(row: ChannelRowWithCount): ChannelListItem {
  return {
    id: row.id,
    youtubeChannelId: row.youtube_channel_id,
    title: row.title,
    handle: row.handle,
    avatarUrl: row.avatar_url,
    subscriberCount: row.subscriber_count,
    isMine: row.is_mine === 1,
    medianViews: row.median_views,
    lastSyncedAt: row.last_synced_at,
    syncStatus: row.sync_status,
    syncError: row.sync_error,
    videoCount: row.video_count,
    createdAt: row.created_at,
  };
}

// ── Channels ────────────────────────────────────────────────────────────────

/** Inserts a followed channel; an already followed YouTube channel is returned untouched. */
export function insertChannel(
  details: ChannelDetails,
  options: { isMine?: boolean; syncStatus?: SyncStatus } = {},
): { channel: ChannelRow; inserted: boolean } {
  const result = getDb()
    .prepare(
      `INSERT INTO followed_channels (id, youtube_channel_id, title, handle, avatar_url, subscriber_count, is_mine, sync_status)
       VALUES (@id, @youtubeChannelId, @title, @handle, @avatarUrl, @subscriberCount, @isMine, @syncStatus)
       ON CONFLICT(youtube_channel_id) DO NOTHING`,
    )
    .run({
      id: uuid(),
      youtubeChannelId: details.youtubeChannelId,
      title: details.title,
      handle: details.handle,
      avatarUrl: details.avatarUrl,
      subscriberCount: details.subscriberCount,
      isMine: options.isMine ? 1 : 0,
      syncStatus: options.syncStatus ?? "idle",
    });
  const channel = getChannelByYoutubeId(details.youtubeChannelId);
  if (!channel) throw new Error(`Followed channel ${details.youtubeChannelId} missing after insert`);
  return { channel, inserted: result.changes > 0 };
}

export function getChannel(id: string): ChannelRow | null {
  return (getDb().prepare("SELECT * FROM followed_channels WHERE id = ?").get(id) as ChannelRow | undefined) ?? null;
}

export function getChannelByYoutubeId(youtubeChannelId: string): ChannelRow | null {
  return (
    (getDb().prepare("SELECT * FROM followed_channels WHERE youtube_channel_id = ?").get(youtubeChannelId) as
      | ChannelRow
      | undefined) ?? null
  );
}

export function channelExists(id: string): boolean {
  return Boolean(getDb().prepare("SELECT 1 FROM followed_channels WHERE id = ?").get(id));
}

export function listChannelItems(): ChannelListItem[] {
  const rows = getDb()
    .prepare(`${CHANNEL_WITH_COUNT} ORDER BY c.is_mine DESC, c.created_at ASC`)
    .all() as ChannelRowWithCount[];
  return rows.map(toChannelListItem);
}

export function getChannelListItem(id: string): ChannelListItem | null {
  const row = getDb().prepare(`${CHANNEL_WITH_COUNT} WHERE c.id = ?`).get(id) as ChannelRowWithCount | undefined;
  return row ? toChannelListItem(row) : null;
}

export function deleteChannel(id: string): boolean {
  return getDb().prepare("DELETE FROM followed_channels WHERE id = ?").run(id).changes > 0;
}

export function updateChannelDetails(id: string, details: ChannelDetails): void {
  getDb()
    .prepare(
      "UPDATE followed_channels SET title = @title, handle = @handle, avatar_url = @avatarUrl, subscriber_count = @subscriberCount WHERE id = @id",
    )
    .run({ id, title: details.title, handle: details.handle, avatarUrl: details.avatarUrl, subscriberCount: details.subscriberCount });
}

export function setSyncState(id: string, state: { status: SyncStatus; error?: string | null }): void {
  getDb()
    .prepare("UPDATE followed_channels SET sync_status = ?, sync_error = ? WHERE id = ?")
    .run(state.status, state.error ?? null, id);
}

export function setPlaylistId(id: string, playlistId: string): void {
  getDb().prepare("UPDATE followed_channels SET playlist_id = ? WHERE id = ?").run(playlistId, id);
}

export function setBackfill(id: string, state: { pageToken: string | null; done: boolean }): void {
  getDb()
    .prepare("UPDATE followed_channels SET backfill_page_token = ?, backfill_done = ? WHERE id = ?")
    .run(state.pageToken, state.done ? 1 : 0, id);
}

export function finishSync(id: string, result: { medianViews: number | null; syncedAt: string }): void {
  getDb()
    .prepare(
      "UPDATE followed_channels SET median_views = ?, last_synced_at = ?, sync_status = 'idle', sync_error = NULL WHERE id = ?",
    )
    .run(result.medianViews, result.syncedAt, id);
}

/** Makes `channelId` the only « Ma chaîne » (null: none). Returns whether anything changed. */
export function setMineChannel(channelId: string | null): boolean {
  const db = getDb();
  const mineIds = () =>
    (db.prepare("SELECT id FROM followed_channels WHERE is_mine = 1 ORDER BY id").all() as { id: string }[])
      .map((row) => row.id)
      .join(",");
  const before = mineIds();
  db.transaction(() => {
    db.prepare("UPDATE followed_channels SET is_mine = 0 WHERE is_mine = 1 AND id IS NOT ?").run(channelId);
    if (channelId) db.prepare("UPDATE followed_channels SET is_mine = 1 WHERE id = ?").run(channelId);
  })();
  return mineIds() !== before;
}

export function allChannelIds(): string[] {
  return (
    getDb().prepare("SELECT id FROM followed_channels ORDER BY is_mine DESC, created_at ASC").all() as { id: string }[]
  ).map((row) => row.id);
}

/** Never synced first, then the oldest sync; « Ma chaîne » before the others. */
export function staleChannelIds(cutoffIso: string): string[] {
  return (
    getDb()
      .prepare(
        `SELECT id FROM followed_channels
         WHERE last_synced_at IS NULL OR last_synced_at < ?
         ORDER BY is_mine DESC, last_synced_at IS NOT NULL, last_synced_at ASC`,
      )
      .all(cutoffIso) as { id: string }[]
  ).map((row) => row.id);
}

export function syncingChannelIds(): string[] {
  return (
    getDb().prepare("SELECT id FROM followed_channels WHERE sync_status = 'syncing'").all() as { id: string }[]
  ).map((row) => row.id);
}

// ── Videos ──────────────────────────────────────────────────────────────────

export function knownVideoIds(channelId: string): Set<string> {
  const rows = getDb().prepare("SELECT video_id FROM channel_videos WHERE channel_id = ?").all(channelId) as {
    video_id: string;
  }[];
  return new Set(rows.map((row) => row.video_id));
}

/** Inserts new videos; known ones get fresh stats. The thumbnail type is never touched here. */
export function upsertVideos(channelId: string, videos: readonly VideoDetails[], stampIso: string): void {
  const db = getDb();
  const statement = db.prepare(
    `INSERT INTO channel_videos
       (video_id, channel_id, title, published_at, duration_seconds, view_count, like_count, thumbnail_url, stats_updated_at)
     VALUES (@videoId, @channelId, @title, @publishedAt, @durationSeconds, @viewCount, @likeCount, @thumbnailUrl, @stamp)
     ON CONFLICT(video_id) DO UPDATE SET
       title = excluded.title,
       duration_seconds = excluded.duration_seconds,
       view_count = excluded.view_count,
       like_count = excluded.like_count,
       thumbnail_url = excluded.thumbnail_url,
       stats_updated_at = excluded.stats_updated_at`,
  );
  db.transaction(() => {
    for (const video of videos) {
      statement.run({
        videoId: video.videoId,
        channelId,
        title: video.title,
        publishedAt: video.publishedAt,
        durationSeconds: video.durationSeconds,
        viewCount: video.viewCount,
        likeCount: video.likeCount,
        thumbnailUrl: video.thumbnailUrl,
        stamp: stampIso,
      });
    }
  })();
}

export function videoIdsToRefresh(channelId: string, stampIso: string): string[] {
  return (
    getDb()
      .prepare(
        "SELECT video_id FROM channel_videos WHERE channel_id = ? AND stats_updated_at < ? ORDER BY published_at DESC",
      )
      .all(channelId, stampIso) as { video_id: string }[]
  ).map((row) => row.video_id);
}

export function updateVideoStats(videos: readonly VideoDetails[], stampIso: string): void {
  const db = getDb();
  const statement = db.prepare(
    `UPDATE channel_videos SET
       title = @title, duration_seconds = @durationSeconds, view_count = @viewCount,
       like_count = @likeCount, thumbnail_url = @thumbnailUrl, stats_updated_at = @stamp
     WHERE video_id = @videoId`,
  );
  db.transaction(() => {
    for (const video of videos) {
      statement.run({
        videoId: video.videoId,
        title: video.title,
        durationSeconds: video.durationSeconds,
        viewCount: video.viewCount,
        likeCount: video.likeCount,
        thumbnailUrl: video.thumbnailUrl,
        stamp: stampIso,
      });
    }
  })();
}

export function deleteVideos(videoIds: readonly string[]): void {
  const db = getDb();
  const statement = db.prepare("DELETE FROM channel_videos WHERE video_id = ?");
  db.transaction(() => {
    for (const videoId of videoIds) statement.run(videoId);
  })();
}

export function viewSamples(channelId: string): ViewSample[] {
  return getDb()
    .prepare("SELECT published_at AS publishedAt, view_count AS viewCount FROM channel_videos WHERE channel_id = ?")
    .all(channelId) as ViewSample[];
}

export function getVideo(videoId: string): VideoRow | null {
  return (getDb().prepare("SELECT * FROM channel_videos WHERE video_id = ?").get(videoId) as VideoRow | undefined) ?? null;
}

export function setManualThumbType(videoId: string, type: ThumbType): boolean {
  return (
    getDb()
      .prepare("UPDATE channel_videos SET thumb_type = ?, thumb_type_source = 'manual' WHERE video_id = ?")
      .run(type, videoId).changes > 0
  );
}

/** Only writes a thumbnail nobody classified yet — a manual type always wins. */
export function setAiThumbType(videoId: string, type: ThumbType): boolean {
  return (
    getDb()
      .prepare(
        "UPDATE channel_videos SET thumb_type = ?, thumb_type_source = 'ai' WHERE video_id = ? AND thumb_type_source IS NULL",
      )
      .run(type, videoId).changes > 0
  );
}

export function incrementClassifyAttempts(videoId: string): void {
  getDb().prepare("UPDATE channel_videos SET classify_attempts = classify_attempts + 1 WHERE video_id = ?").run(videoId);
}

export function setVideoSwipeFile(videoId: string, swipeFileId: string): void {
  getDb().prepare("UPDATE channel_videos SET swipe_file_id = ? WHERE video_id = ?").run(swipeFileId, videoId);
}

// ── Classification queue ────────────────────────────────────────────────────

export function countPendingClassification(): { pending: number; unapproved: number } {
  return getDb()
    .prepare(
      `SELECT COUNT(*) AS pending, COALESCE(SUM(CASE WHEN classify_approved = 0 THEN 1 ELSE 0 END), 0) AS unapproved
       FROM channel_videos WHERE ${PENDING_WHERE}`,
    )
    .get() as { pending: number; unapproved: number };
}

export function approvePendingClassification(): number {
  return getDb()
    .prepare(`UPDATE channel_videos SET classify_approved = 1 WHERE ${PENDING_WHERE} AND classify_approved = 0`)
    .run().changes;
}

export function nextClassificationBatch(limit: number): string[] {
  return (
    getDb()
      .prepare(
        `SELECT video_id FROM channel_videos WHERE ${PENDING_WHERE} AND classify_approved = 1
         ORDER BY published_at DESC LIMIT ?`,
      )
      .all(limit) as { video_id: string }[]
  ).map((row) => row.video_id);
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/channels/channel-tables.test.ts tests/channels/channel-store.test.ts`
Expected: PASS.

- [ ] **Step 8: Run the whole suite, type-check and lint**

```bash
./node_modules/.bin/vitest run
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/lib/db.ts src/lib/youtube/migrations.ts src/lib/youtube/channel-store.ts tests/channels/channel-tables.test.ts tests/channels/channel-store.test.ts
```

Expected: every test passes (the new tables do not disturb existing tests); `tsc` exits 0; no ESLint errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/db.ts src/lib/youtube/migrations.ts src/lib/youtube/channel-store.ts tests/channels/channel-tables.test.ts tests/channels/channel-store.test.ts
git commit -m "feat(channels): followed_channels and channel_videos tables with their store" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
## Task 4: YouTube Data API client and the fake YouTube used by tests

**Files:**
- Create: `src/lib/youtube/api.ts`
- Create (test helper, not a test file): `tests/channels/fake-youtube.ts`
- Test: `tests/channels/youtube-api.test.ts`

**Interfaces:**
- Consumes: `parseChannelInput` from `src/lib/youtube/channel.ts` (on `main`); Task 2 — `type ChannelDetails`, `type VideoDetails`, `youtubeThumbnailUrl`.
- Produces (`src/lib/youtube/api.ts`):
  - `PLAYLIST_PAGE_SIZE = 50`, `VIDEOS_BATCH_SIZE = 50`
  - `class YouTubeApiError extends Error { readonly status: number; readonly reason: string | null; readonly isQuota: boolean; readonly isNotFound: boolean }` (`status` 0 + `reason` `"network"` when YouTube cannot be reached)
  - `parseIsoDuration(value: string | null | undefined): number`
  - `longFormPlaylistId(youtubeChannelId: string): string`, `uploadsPlaylistId(youtubeChannelId: string): string`
  - `localChannelId(input: string): string | null` (resolves `UC…`, `/channel/UC…` URLs and `UU…` without a request)
  - `fetchChannelDetails(apiKey: string, youtubeChannelId: string): Promise<ChannelDetails | null>`
  - `type ResolvedChannel = { status: "found"; channel: ChannelDetails } | { status: "not-found" }`, `resolveChannelInput(apiKey: string, input: string): Promise<ResolvedChannel>`
  - `type PlaylistPage = { videoIds: string[]; nextPageToken: string | null }`, `fetchPlaylistPage(apiKey: string, playlistId: string, pageToken?: string | null): Promise<PlaylistPage>`
  - `type VideosBatch = { videos: VideoDetails[]; foundIds: Set<string> }`, `fetchVideos(apiKey: string, videoIds: readonly string[]): Promise<VideosBatch>`
- Produces (`tests/channels/fake-youtube.ts`, used by Tasks 5–10):
  - `channelIdFor(letter: string): string` → `"UC" + letter × 22`
  - `type FakeChannel = { id: string; handle: string; title: string; subscribers?: number; hiddenSubscribers?: boolean; hasLongFormPlaylist?: boolean }`
  - `type FakeVideo = { id: string; channelId: string; publishedAt: string; title?: string; durationSeconds?: number; views?: number; likes?: number | null; live?: "none" | "live" | "upcoming"; short?: boolean }`
  - `type FakeCall = { resource: string; params: URLSearchParams }`
  - `type FakeYouTube = { fetch: Mock<(input: RequestInfo | URL) => Promise<Response>>; calls: FakeCall[]; count(resource: string): number; setQuotaAfter(calls: number | null): void; setNetworkDown(down: boolean): void; addVideo(video: FakeVideo): void; removeVideo(videoId: string): void; setViews(videoId: string, views: number): void }`
  - `createFakeYouTube(setup?: { channels?: FakeChannel[]; videos?: FakeVideo[]; playlists?: Record<string, string>; thumbnails?: Record<string, string[]> }): FakeYouTube`
  - `isoDuration(totalSeconds: number): string`

- [ ] **Step 1: Write the fake YouTube**

Create `tests/channels/fake-youtube.ts`:

```ts
import { vi, type Mock } from "vitest";

/**
 * In-memory YouTube for tests: www.googleapis.com/youtube/v3 (channels,
 * playlists, playlistItems, videos) and i.ytimg.com thumbnails. Every other
 * host answers 404, so no test can reach a real service through fetch.
 */

export function channelIdFor(letter: string): string {
  return `UC${letter.repeat(22)}`;
}

export type FakeChannel = {
  id: string;
  handle: string;
  title: string;
  subscribers?: number;
  hiddenSubscribers?: boolean;
  hasLongFormPlaylist?: boolean;
};

export type FakeVideo = {
  id: string;
  channelId: string;
  publishedAt: string;
  title?: string;
  durationSeconds?: number;
  views?: number;
  likes?: number | null;
  live?: "none" | "live" | "upcoming";
  short?: boolean;
};

export type FakeCall = { resource: string; params: URLSearchParams };

export type FakeYouTube = {
  fetch: Mock<(input: RequestInfo | URL) => Promise<Response>>;
  calls: FakeCall[];
  count: (resource: string) => number;
  setQuotaAfter: (calls: number | null) => void;
  setNetworkDown: (down: boolean) => void;
  addVideo: (video: FakeVideo) => void;
  removeVideo: (videoId: string) => void;
  setViews: (videoId: string, views: number) => void;
};

export function isoDuration(totalSeconds: number): string {
  if (totalSeconds === 0) return "P0D";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `PT${hours ? `${hours}H` : ""}${minutes ? `${minutes}M` : ""}${seconds ? `${seconds}S` : ""}`;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function apiError(status: number, reason: string, domain = "youtube.api"): Response {
  return json(status, { error: { code: status, message: `Fake ${reason}`, errors: [{ message: `Fake ${reason}`, domain, reason }] } });
}

export function createFakeYouTube(
  setup: {
    channels?: FakeChannel[];
    videos?: FakeVideo[];
    playlists?: Record<string, string>;
    thumbnails?: Record<string, string[]>;
  } = {},
): FakeYouTube {
  const channels = new Map((setup.channels ?? []).map((channel) => [channel.id, channel]));
  let videos = [...(setup.videos ?? [])];
  const calls: FakeCall[] = [];
  let quotaLeft: number | null = null;
  let networkDown = false;

  const playlistVideos = (playlistId: string): FakeVideo[] | null => {
    const longForm = playlistId.startsWith("UULF");
    if (!longForm && !playlistId.startsWith("UU")) return null;
    const channel = channels.get(`UC${playlistId.slice(longForm ? 4 : 2)}`);
    if (!channel || (longForm && channel.hasLongFormPlaylist === false)) return null;
    return videos
      .filter((video) => video.channelId === channel.id)
      .filter((video) => !longForm || (!video.short && (video.live ?? "none") === "none"))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  };

  const channelItem = (channel: FakeChannel) => ({
    id: channel.id,
    snippet: {
      title: channel.title,
      customUrl: channel.handle.toLowerCase(),
      thumbnails: {
        default: { url: `https://yt3.example/${channel.id}-small.jpg` },
        medium: { url: `https://yt3.example/${channel.id}.jpg` },
      },
    },
    statistics: {
      subscriberCount: String(channel.subscribers ?? 1000),
      hiddenSubscriberCount: channel.hiddenSubscribers ?? false,
      videoCount: String(videos.filter((video) => video.channelId === channel.id).length),
    },
    contentDetails: { relatedPlaylists: { uploads: `UU${channel.id.slice(2)}` } },
  });

  const fetchImpl = async (input: RequestInfo | URL): Promise<Response> => {
    if (networkDown) throw new TypeError("fetch failed");
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);

    if (url.hostname === "i.ytimg.com") {
      const [, , videoId = "", file = ""] = url.pathname.split("/");
      const size = file.replace(/\.jpg$/, "");
      if (!(setup.thumbnails?.[videoId] ?? []).includes(size)) return new Response("missing", { status: 404 });
      return new Response(new Uint8Array(5000).fill(7), { status: 200, headers: { "content-type": "image/jpeg" } });
    }
    if (url.hostname !== "www.googleapis.com") return new Response("not found", { status: 404 });

    const resource = url.pathname.split("/").pop() ?? "";
    const params = url.searchParams;
    calls.push({ resource, params });
    if (quotaLeft !== null) {
      if (quotaLeft <= 0) return apiError(403, "quotaExceeded", "youtube.quota");
      quotaLeft -= 1;
    }

    if (resource === "channels") {
      const handle = params.get("forHandle");
      const matches =
        handle !== null
          ? [...channels.values()].filter(
              (channel) => channel.handle.replace(/^@/, "").toLowerCase() === handle.replace(/^@/, "").toLowerCase(),
            )
          : (params.get("id") ?? "")
              .split(",")
              .map((id) => channels.get(id))
              .filter((channel): channel is FakeChannel => Boolean(channel));
      return json(200, {
        pageInfo: { totalResults: matches.length, resultsPerPage: 5 },
        ...(matches.length > 0 ? { items: matches.map(channelItem) } : {}),
      });
    }

    if (resource === "playlists") {
      const playlistId = params.get("id") ?? "";
      const channelId = setup.playlists?.[playlistId];
      return json(200, channelId ? { items: [{ id: playlistId, snippet: { channelId } }] } : { pageInfo: { totalResults: 0 } });
    }

    if (resource === "playlistItems") {
      const list = playlistVideos(params.get("playlistId") ?? "");
      if (!list) return apiError(404, "playlistNotFound");
      const offset = Number(params.get("pageToken") ?? "0");
      const pageSize = Number(params.get("maxResults") ?? "5");
      const page = list.slice(offset, offset + pageSize);
      const next = offset + pageSize < list.length ? String(offset + pageSize) : null;
      return json(200, {
        items: page.map((video) => ({ contentDetails: { videoId: video.id, videoPublishedAt: video.publishedAt } })),
        ...(next ? { nextPageToken: next } : {}),
        pageInfo: { totalResults: list.length, resultsPerPage: pageSize },
      });
    }

    if (resource === "videos") {
      const items = (params.get("id") ?? "")
        .split(",")
        .map((id) => videos.find((video) => video.id === id))
        .filter((video): video is FakeVideo => Boolean(video))
        .map((video) => ({
          id: video.id,
          snippet: {
            title: video.title ?? `Vidéo ${video.id}`,
            publishedAt: video.publishedAt,
            liveBroadcastContent: video.live ?? "none",
            thumbnails: { medium: { url: `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg` } },
          },
          statistics: {
            viewCount: String(video.views ?? 0),
            ...(video.likes === null ? {} : { likeCount: String(video.likes ?? 0) }),
          },
          contentDetails: {
            duration: isoDuration(video.live && video.live !== "none" ? 0 : (video.durationSeconds ?? 600)),
          },
        }));
      return json(200, { items });
    }

    return apiError(404, "notFound");
  };

  return {
    fetch: vi.fn(fetchImpl),
    calls,
    count: (resource) => calls.filter((call) => call.resource === resource).length,
    setQuotaAfter: (callsLeft) => {
      quotaLeft = callsLeft;
    },
    setNetworkDown: (down) => {
      networkDown = down;
    },
    addVideo: (video) => {
      videos.push(video);
    },
    removeVideo: (videoId) => {
      videos = videos.filter((video) => video.id !== videoId);
    },
    setViews: (videoId, views) => {
      videos = videos.map((video) => (video.id === videoId ? { ...video, views } : video));
    },
  };
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/channels/youtube-api.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchChannelDetails,
  fetchPlaylistPage,
  fetchVideos,
  localChannelId,
  longFormPlaylistId,
  parseIsoDuration,
  resolveChannelInput,
  uploadsPlaylistId,
  YouTubeApiError,
} from "@/lib/youtube/api";
import { channelIdFor, createFakeYouTube, type FakeYouTube } from "./fake-youtube";

const KEY = "test-yt-key";
const MINE = channelIdFor("m");
let fake: FakeYouTube;

function install(nextFake: FakeYouTube) {
  fake = nextFake;
  vi.stubGlobal("fetch", fake.fetch);
}

beforeEach(() => {
  install(
    createFakeYouTube({
      channels: [{ id: MINE, handle: "@MaChaine", title: "Ma chaîne", subscribers: 12_500 }],
      videos: [
        { id: "long0000001", channelId: MINE, publishedAt: "2026-09-01T10:00:00Z", durationSeconds: 754, views: 1_200, likes: 30 },
        { id: "hidden00001", channelId: MINE, publishedAt: "2026-08-01T10:00:00Z", views: 50, likes: null },
      ],
      playlists: { PLmaplaylist0001: MINE },
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseIsoDuration", () => {
  it.each([
    ["PT15M33S", 933],
    ["PT1H2M3S", 3723],
    ["PT45S", 45],
    ["P1DT2H", 93_600],
    ["P0D", 0],
    ["PT0S", 0],
    ["", 0],
    ["garbage", 0],
  ])("%s → %i s", (value, seconds) => {
    expect(parseIsoDuration(value)).toBe(seconds);
  });
});

describe("playlist and channel ids", () => {
  it("derives the long-form and uploads playlists from the channel id", () => {
    expect(longFormPlaylistId("UCabcdefghijklmnopqrstuv")).toBe("UULFabcdefghijklmnopqrstuv");
    expect(uploadsPlaylistId("UCabcdefghijklmnopqrstuv")).toBe("UUabcdefghijklmnopqrstuv");
  });

  it("reads channel ids that need no request", () => {
    expect(localChannelId(MINE)).toBe(MINE);
    expect(localChannelId(`https://www.youtube.com/channel/${MINE}`)).toBe(MINE);
    expect(localChannelId(`UU${MINE.slice(2)}`)).toBe(MINE);
    expect(localChannelId("@MaChaine")).toBeNull();
    expect(localChannelId("PLmaplaylist0001")).toBeNull();
  });
});

describe("resolveChannelInput", () => {
  it.each([
    ["https://www.youtube.com/@MaChaine"],
    ["@MaChaine"],
    ["MaChaine"],
    [`https://www.youtube.com/channel/${MINE}`],
    [MINE],
    [`UU${MINE.slice(2)}`],
    ["PLmaplaylist0001"],
  ])("resolves %s", async (input) => {
    expect(await resolveChannelInput(KEY, input)).toEqual({
      status: "found",
      channel: {
        youtubeChannelId: MINE,
        title: "Ma chaîne",
        handle: "@machaine",
        avatarUrl: `https://yt3.example/${MINE}.jpg`,
        subscriberCount: 12_500,
        videoCount: 2,
      },
    });
  });

  it("asks channels.list for snippet, statistics and contentDetails with the key", async () => {
    await resolveChannelInput(KEY, "@MaChaine");
    const call = fake.calls.find((entry) => entry.resource === "channels");
    expect(call?.params.get("part")).toBe("snippet,statistics,contentDetails");
    expect(call?.params.get("forHandle")).toBe("MaChaine");
    expect(call?.params.get("key")).toBe(KEY);
  });

  it("reports an unknown handle or an unusable input as not found", async () => {
    expect(await resolveChannelInput(KEY, "@inconnue")).toEqual({ status: "not-found" });
    expect(await resolveChannelInput(KEY, "https://example.com/pas/une/chaine")).toEqual({ status: "not-found" });
    expect(await resolveChannelInput(KEY, "   ")).toEqual({ status: "not-found" });
    expect(await resolveChannelInput(KEY, "PLinconnue000001")).toEqual({ status: "not-found" });
  });

  it("leaves the subscriber count out when the channel hides it", async () => {
    install(createFakeYouTube({ channels: [{ id: MINE, handle: "@MaChaine", title: "Ma chaîne", hiddenSubscribers: true }] }));
    const resolved = await resolveChannelInput(KEY, "@MaChaine");
    expect(resolved.status === "found" && resolved.channel.subscriberCount).toBeNull();
  });

  it("throws YouTube's quota error", async () => {
    fake.setQuotaAfter(0);
    const error = (await resolveChannelInput(KEY, "@MaChaine").catch((err: unknown) => err)) as YouTubeApiError;
    expect(error).toBeInstanceOf(YouTubeApiError);
    expect(error.status).toBe(403);
    expect(error.reason).toBe("quotaExceeded");
    expect(error.isQuota).toBe(true);
  });

  it("turns a network failure into an error that never contains the key", async () => {
    fake.setNetworkDown(true);
    const error = (await fetchChannelDetails(KEY, MINE).catch((err: unknown) => err)) as YouTubeApiError;
    expect(error).toBeInstanceOf(YouTubeApiError);
    expect(error.status).toBe(0);
    expect(error.reason).toBe("network");
    expect(error.message).toBe("YouTube injoignable");
  });
});

describe("fetchChannelDetails", () => {
  it("returns null for an unknown channel id", async () => {
    expect(await fetchChannelDetails(KEY, channelIdFor("x"))).toBeNull();
  });
});

describe("fetchPlaylistPage", () => {
  it("pages through a playlist 50 items at a time, newest first", async () => {
    install(
      createFakeYouTube({
        channels: [{ id: MINE, handle: "@MaChaine", title: "Ma chaîne" }],
        videos: Array.from({ length: 120 }, (_, index) => ({
          id: `vid${String(index).padStart(8, "0")}`,
          channelId: MINE,
          publishedAt: new Date(Date.UTC(2026, 0, 1) + index * 86_400_000).toISOString(),
        })),
      }),
    );
    const first = await fetchPlaylistPage(KEY, longFormPlaylistId(MINE));
    expect(first.videoIds).toHaveLength(50);
    expect(first.videoIds[0]).toBe("vid00000119");
    expect(first.nextPageToken).not.toBeNull();
    const second = await fetchPlaylistPage(KEY, longFormPlaylistId(MINE), first.nextPageToken);
    const third = await fetchPlaylistPage(KEY, longFormPlaylistId(MINE), second.nextPageToken);
    expect(third.videoIds).toHaveLength(20);
    expect(third.nextPageToken).toBeNull();
    expect(
      fake.calls
        .filter((call) => call.resource === "playlistItems")
        .every((call) => call.params.get("maxResults") === "50" && call.params.get("part") === "contentDetails"),
    ).toBe(true);
  });

  it("throws a not-found error for a missing playlist", async () => {
    install(createFakeYouTube({ channels: [{ id: MINE, handle: "@MaChaine", title: "Ma chaîne", hasLongFormPlaylist: false }] }));
    const error = (await fetchPlaylistPage(KEY, longFormPlaylistId(MINE)).catch((err: unknown) => err)) as YouTubeApiError;
    expect(error).toBeInstanceOf(YouTubeApiError);
    expect(error.status).toBe(404);
    expect(error.reason).toBe("playlistNotFound");
    expect(error.isNotFound).toBe(true);
    expect(error.isQuota).toBe(false);
  });
});

describe("fetchVideos", () => {
  it("reads title, date, duration, views, likes and thumbnail, and which ids still exist", async () => {
    const batch = await fetchVideos(KEY, ["long0000001", "hidden00001", "gone0000001"]);
    expect(batch.foundIds).toEqual(new Set(["long0000001", "hidden00001"]));
    expect(batch.videos[0]).toEqual({
      videoId: "long0000001",
      title: "Vidéo long0000001",
      publishedAt: "2026-09-01T10:00:00.000Z",
      durationSeconds: 754,
      viewCount: 1200,
      likeCount: 30,
      thumbnailUrl: "https://i.ytimg.com/vi/long0000001/mqdefault.jpg",
      liveBroadcastContent: "none",
    });
    expect(batch.videos[1].likeCount).toBeNull();
    const call = fake.calls.find((entry) => entry.resource === "videos");
    expect(call?.params.get("part")).toBe("snippet,statistics,contentDetails");
    expect(call?.params.get("id")).toBe("long0000001,hidden00001,gone0000001");
  });

  it("makes no request for an empty list and refuses more than 50 ids", async () => {
    expect(await fetchVideos(KEY, [])).toEqual({ videos: [], foundIds: new Set() });
    expect(fake.calls).toHaveLength(0);
    await expect(fetchVideos(KEY, Array.from({ length: 51 }, (_, index) => `v${index}`))).rejects.toThrow("50");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/channels/youtube-api.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/youtube/api"`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/youtube/api.ts`:

```ts
import { parseChannelInput } from "./channel";
import { youtubeThumbnailUrl, type ChannelDetails, type VideoDetails } from "./types";

/**
 * YouTube Data API v3 client for followed channels. Every call costs 1 quota
 * unit (channels.list, playlists.list, playlistItems.list, videos.list).
 * Errors never carry the API key: the request URL is not part of any message.
 */

const API_BASE = "https://www.googleapis.com/youtube/v3";
const CHANNEL_PARTS = "snippet,statistics,contentDetails";
const VIDEO_PARTS = "snippet,statistics,contentDetails";

export const PLAYLIST_PAGE_SIZE = 50;
export const VIDEOS_BATCH_SIZE = 50;

const CHANNEL_ID = /^UC[\w-]{20,}$/;
const UPLOADS_PLAYLIST_ID = /^UU[\w-]{20,}$/;
const PLAYLIST_ID = /^PL[\w-]{10,}$/;
const BARE_HANDLE = /^[\w.-]{3,30}$/;

export class YouTubeApiError extends Error {
  readonly status: number;
  readonly reason: string | null;
  readonly isQuota: boolean;
  readonly isNotFound: boolean;

  constructor(status: number, reason: string | null, message: string) {
    super(message);
    this.name = "YouTubeApiError";
    this.status = status;
    this.reason = reason;
    this.isQuota = status === 403 && (reason === "quotaExceeded" || reason === "dailyLimitExceeded");
    this.isNotFound = status === 404;
  }
}

async function youtubeGet<T>(apiKey: string, resource: string, params: Record<string, string>): Promise<T> {
  const search = new URLSearchParams({ ...params, key: apiKey });
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/${resource}?${search.toString()}`);
  } catch {
    throw new YouTubeApiError(0, "network", "YouTube injoignable");
  }
  if (!res.ok) {
    let reason: string | null = null;
    try {
      const body = (await res.json()) as { error?: { errors?: Array<{ reason?: unknown }> } };
      const raw = body.error?.errors?.[0]?.reason;
      reason = typeof raw === "string" ? raw : null;
    } catch {
      reason = null;
    }
    throw new YouTubeApiError(res.status, reason, `YouTube a refusé la requête (${res.status}${reason ? ` · ${reason}` : ""})`);
  }
  return (await res.json()) as T;
}

/** ISO 8601 duration (PT15M33S, P1DT2H, P0D…) to seconds; 0 when unreadable. */
export function parseIsoDuration(value: string | null | undefined): number {
  const match = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value ?? "");
  if (!match) return 0;
  const [, weeks, days, hours, minutes, seconds] = match;
  return Math.round(
    Number(weeks ?? 0) * 7 * 86_400 +
      Number(days ?? 0) * 86_400 +
      Number(hours ?? 0) * 3_600 +
      Number(minutes ?? 0) * 60 +
      Number(seconds ?? 0),
  );
}

/** Undocumented but widely used: UULF + channel id without "UC" lists long-form videos only. */
export function longFormPlaylistId(youtubeChannelId: string): string {
  return `UULF${youtubeChannelId.slice(2)}`;
}

export function uploadsPlaylistId(youtubeChannelId: string): string {
  return `UU${youtubeChannelId.slice(2)}`;
}

/** Channel ids readable without a request: UC…, a /channel/UC… URL, or the uploads playlist UU…. */
export function localChannelId(input: string): string | null {
  const raw = input.trim();
  const parsed = parseChannelInput(raw);
  if (parsed?.type === "channelId") return parsed.value;
  if (CHANNEL_ID.test(raw)) return raw;
  if (UPLOADS_PLAYLIST_ID.test(raw)) return `UC${raw.slice(2)}`;
  return null;
}

type ThumbnailSet = Record<string, { url?: string } | undefined>;

type ChannelsResponse = {
  items?: Array<{
    id: string;
    snippet?: { title?: string; customUrl?: string; thumbnails?: ThumbnailSet };
    statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string };
  }>;
};

function toCount(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const count = Number(value);
  return Number.isFinite(count) ? count : null;
}

function toChannelDetails(item: NonNullable<ChannelsResponse["items"]>[number]): ChannelDetails {
  const thumbnails = item.snippet?.thumbnails ?? {};
  const customUrl = item.snippet?.customUrl?.trim();
  return {
    youtubeChannelId: item.id,
    title: item.snippet?.title?.trim() || item.id,
    handle: customUrl ? (customUrl.startsWith("@") ? customUrl : `@${customUrl}`) : null,
    avatarUrl: thumbnails.medium?.url ?? thumbnails.high?.url ?? thumbnails.default?.url ?? null,
    subscriberCount: item.statistics?.hiddenSubscriberCount ? null : toCount(item.statistics?.subscriberCount),
    videoCount: toCount(item.statistics?.videoCount),
  };
}

export async function fetchChannelDetails(apiKey: string, youtubeChannelId: string): Promise<ChannelDetails | null> {
  const data = await youtubeGet<ChannelsResponse>(apiKey, "channels", { part: CHANNEL_PARTS, id: youtubeChannelId });
  const item = data.items?.[0];
  return item ? toChannelDetails(item) : null;
}

export type ResolvedChannel = { status: "found"; channel: ChannelDetails } | { status: "not-found" };

/** A channel URL, @handle, bare handle, UC… id, UU… uploads playlist or PL… playlist → channel details. */
export async function resolveChannelInput(apiKey: string, input: string): Promise<ResolvedChannel> {
  const raw = input.trim();
  if (!raw) return { status: "not-found" };

  let query: Record<string, string> | null = null;
  const local = localChannelId(raw);
  const parsed = parseChannelInput(raw);
  if (local) {
    query = { id: local };
  } else if (parsed?.type === "handle") {
    query = { forHandle: parsed.value.replace(/^@/, "") };
  } else if (PLAYLIST_ID.test(raw)) {
    const playlists = await youtubeGet<{ items?: Array<{ snippet?: { channelId?: string } }> }>(apiKey, "playlists", {
      part: "snippet",
      id: raw,
    });
    const channelId = playlists.items?.[0]?.snippet?.channelId;
    if (!channelId) return { status: "not-found" };
    query = { id: channelId };
  } else if (BARE_HANDLE.test(raw)) {
    query = { forHandle: raw };
  }
  if (!query) return { status: "not-found" };

  const data = await youtubeGet<ChannelsResponse>(apiKey, "channels", { part: CHANNEL_PARTS, ...query });
  const item = data.items?.[0];
  return item ? { status: "found", channel: toChannelDetails(item) } : { status: "not-found" };
}

export type PlaylistPage = { videoIds: string[]; nextPageToken: string | null };

export async function fetchPlaylistPage(apiKey: string, playlistId: string, pageToken?: string | null): Promise<PlaylistPage> {
  const params: Record<string, string> = { part: "contentDetails", playlistId, maxResults: String(PLAYLIST_PAGE_SIZE) };
  if (pageToken) params.pageToken = pageToken;
  const data = await youtubeGet<{ nextPageToken?: string; items?: Array<{ contentDetails?: { videoId?: string } }> }>(
    apiKey,
    "playlistItems",
    params,
  );
  return {
    videoIds: (data.items ?? [])
      .map((item) => item.contentDetails?.videoId)
      .filter((videoId): videoId is string => typeof videoId === "string" && videoId.length > 0),
    nextPageToken: data.nextPageToken || null,
  };
}

type VideosResponse = {
  items?: Array<{
    id?: string;
    snippet?: { title?: string; publishedAt?: string; liveBroadcastContent?: string; thumbnails?: ThumbnailSet };
    statistics?: { viewCount?: string; likeCount?: string };
    contentDetails?: { duration?: string };
  }>;
};

export type VideosBatch = { videos: VideoDetails[]; foundIds: Set<string> };

/** At most 50 ids. `foundIds` lists every id YouTube still returns (private or deleted videos are absent). */
export async function fetchVideos(apiKey: string, videoIds: readonly string[]): Promise<VideosBatch> {
  if (videoIds.length === 0) return { videos: [], foundIds: new Set() };
  if (videoIds.length > VIDEOS_BATCH_SIZE) throw new Error(`fetchVideos takes at most ${VIDEOS_BATCH_SIZE} ids`);
  const data = await youtubeGet<VideosResponse>(apiKey, "videos", { part: VIDEO_PARTS, id: videoIds.join(",") });

  const videos: VideoDetails[] = [];
  const foundIds = new Set<string>();
  for (const item of data.items ?? []) {
    if (!item.id) continue;
    foundIds.add(item.id);
    const published = Date.parse(item.snippet?.publishedAt ?? "");
    if (Number.isNaN(published)) continue;
    videos.push({
      videoId: item.id,
      title: item.snippet?.title?.trim() || item.id,
      publishedAt: new Date(published).toISOString(),
      durationSeconds: parseIsoDuration(item.contentDetails?.duration),
      viewCount: toCount(item.statistics?.viewCount) ?? 0,
      likeCount: toCount(item.statistics?.likeCount),
      thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? youtubeThumbnailUrl(item.id),
      liveBroadcastContent: item.snippet?.liveBroadcastContent ?? "none",
    });
  }
  return { videos, foundIds };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/channels/youtube-api.test.ts`
Expected: PASS.

- [ ] **Step 6: Type-check and lint**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/lib/youtube/api.ts tests/channels/fake-youtube.ts tests/channels/youtube-api.test.ts
```

Expected: `tsc` exits 0; no ESLint errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/youtube/api.ts tests/channels/fake-youtube.ts tests/channels/youtube-api.test.ts
git commit -m "feat(channels): YouTube Data API client with a fake YouTube for tests" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Shared thumbnail download and library copy

**Files:**
- Create: `src/lib/youtube/thumbnails.ts`
- Modify: `src/lib/agent/tools/import-youtube-thumbnail.ts`
- Test: `tests/channels/thumbnails.test.ts`

**Interfaces:**
- Consumes: `getDb` (`src/lib/db.ts`); the `swipe_files` table and `GET /api/swipe-files/image?f=` route (on `main`).
- Produces (`src/lib/youtube/thumbnails.ts`):
  - `THUMB_SIZES = ["maxresdefault", "sddefault", "hqdefault", "mqdefault", "default"] as const`
  - `type DownloadedThumbnail = { bytes: Buffer; mime: string }`
  - `fetchBestThumbnail(videoId: string): Promise<DownloadedThumbnail | null>`
  - `saveThumbnailToLibrary(title: string, thumbnail: DownloadedThumbnail): string` (returns the swipe file id)
  - `getSwipeFileTitle(swipeFileId: string): string | null`

- [ ] **Step 1: Write the failing tests**

Create `tests/channels/thumbnails.test.ts`:

```ts
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as swipeImage } from "@/app/api/swipe-files/image/route";
import { fetchBestThumbnail, getSwipeFileTitle, saveThumbnailToLibrary } from "@/lib/youtube/thumbnails";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubThumbnails(bytesBySize: Record<string, number>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const size = String(input).split("/").pop()?.replace(".jpg", "") ?? "";
    const bytes = bytesBySize[size];
    return bytes === undefined ? new Response("missing", { status: 404 }) : new Response(new Uint8Array(bytes).fill(1), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("fetchBestThumbnail", () => {
  it("takes the largest size YouTube really serves, skipping tiny placeholders", async () => {
    const fetchMock = stubThumbnails({ sddefault: 900, hqdefault: 40_000, mqdefault: 20_000 });
    const thumbnail = await fetchBestThumbnail("abcdefghijk");
    expect(thumbnail?.bytes.length).toBe(40_000);
    expect(thumbnail?.mime).toBe("image/jpeg");
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg",
      "https://i.ytimg.com/vi/abcdefghijk/sddefault.jpg",
      "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
    ]);
  });

  it("returns null when no size exists", async () => {
    stubThumbnails({});
    expect(await fetchBestThumbnail("abcdefghijk")).toBeNull();
  });
});

describe("saveThumbnailToLibrary", () => {
  it("stores the image as an inspiration served by the library image route", async () => {
    const id = saveThumbnailToLibrary("Ma meilleure vidéo", { bytes: Buffer.from([1, 2, 3, 4]), mime: "image/jpeg" });
    expect(getSwipeFileTitle(id)).toBe("Ma meilleure vidéo");
    expect(getSwipeFileTitle("does-not-exist")).toBeNull();

    const res = await swipeImage(new NextRequest(`http://localhost/api/swipe-files/image?f=${id}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(Buffer.from([1, 2, 3, 4]));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/channels/thumbnails.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/youtube/thumbnails"`.

- [ ] **Step 3: Write the helper**

Create `src/lib/youtube/thumbnails.ts`:

```ts
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";

/**
 * Downloads a video's published thumbnail and copies it into the library
 * (swipe_files). Shared by the agent tool import_youtube_thumbnail and by
 * « Utiliser comme référence » on followed-channel videos.
 */

// Largest first. maxresdefault only exists when the uploader sent a 1280×720 master.
export const THUMB_SIZES = ["maxresdefault", "sddefault", "hqdefault", "mqdefault", "default"] as const;

// YouTube answers some missing sizes with a tiny grey placeholder instead of a 404.
const PLACEHOLDER_MAX_BYTES = 2000;

export type DownloadedThumbnail = { bytes: Buffer; mime: string };

export async function fetchBestThumbnail(videoId: string): Promise<DownloadedThumbnail | null> {
  for (const size of THUMB_SIZES) {
    const res = await fetch(`https://i.ytimg.com/vi/${videoId}/${size}.jpg`);
    if (!res.ok) continue;
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength < PLACEHOLDER_MAX_BYTES) continue;
    return { bytes: Buffer.from(buffer), mime: "image/jpeg" };
  }
  return null;
}

/** Stores the image in swipe_files and returns its id (served by /api/swipe-files/image?f=<id>). */
export function saveThumbnailToLibrary(title: string, thumbnail: DownloadedThumbnail): string {
  const id = uuid();
  getDb()
    .prepare("INSERT INTO swipe_files (id, title, mime_type, size, data) VALUES (?, ?, ?, ?, ?)")
    .run(id, title, thumbnail.mime, thumbnail.bytes.length, thumbnail.bytes);
  return id;
}

export function getSwipeFileTitle(swipeFileId: string): string | null {
  const row = getDb().prepare("SELECT title FROM swipe_files WHERE id = ?").get(swipeFileId) as { title: string } | undefined;
  return row?.title ?? null;
}
```

- [ ] **Step 4: Make the agent tool use it**

Replace the whole content of `src/lib/agent/tools/import-youtube-thumbnail.ts` with (description, label logic and messages unchanged):

```ts
import { z } from "zod";
import { getSetting } from "@/lib/settings";
import { fetchBestThumbnail, saveThumbnailToLibrary } from "@/lib/youtube/thumbnails";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({
  video_id: z.string().min(1),
  label: z.string().optional(),
});

export const importYoutubeThumbnailTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "import_youtube_thumbnail",
  description:
    "Imports the published YouTube thumbnail of a video as a reference swipe-file in the user's library. Use this when the user wants to reuse one of THEIR OWN past video thumbnails (or any reference YT thumbnail) as visual inspiration in the workflow. Pass video_id (the 11-char ID, e.g. 'dQw4w9WgXcQ'). Returns a stored:sf_<id> reference you can immediately wire as a swipeFile (kind=\"reference\") in apply_workflow. Idempotent on the YouTube side (always fetches the current published thumbnail).",
  inputSchema: InputSchema,
  handler: async ({ video_id, label }) => {
    const apiKey = getSetting("youtubeApiKey");

    // Best-effort metadata lookup for a sensible label
    let derivedLabel = label || `YT ${video_id}`;
    if (apiKey && !label) {
      try {
        const meta = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${video_id}&key=${apiKey}`,
        );
        if (meta.ok) {
          const data = await meta.json();
          const title = data.items?.[0]?.snippet?.title;
          if (title) derivedLabel = `YT — ${title.slice(0, 60)}`;
        }
      } catch {
        // Metadata fetch is best-effort; failure is fine.
      }
    }

    const thumb = await fetchBestThumbnail(video_id);
    if (!thumb) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: `No thumbnail found for video_id=${video_id}` }],
      };
    }

    const id = saveThumbnailToLibrary(derivedLabel, thumb);

    return {
      content: [
        {
          type: "text" as const,
          text: `Thumbnail imported. Reference: stored:sf_${id} (label: "${derivedLabel}", ${Math.round(
            thumb.bytes.length / 1024,
          )} KB). Wire this as a swipeFile (kind="reference") in apply_workflow.`,
        },
        { type: "image" as const, mimeType: thumb.mime, data: thumb.bytes.toString("base64") },
      ],
    };
  },
};

registerTool(importYoutubeThumbnailTool);
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
./node_modules/.bin/vitest run tests/channels/thumbnails.test.ts tests/agent/registry-full.test.ts tests/agent/mcp-server.test.ts
```

Expected: PASS (the registry and MCP tests still list `import_youtube_thumbnail`).

- [ ] **Step 6: Type-check and lint**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/lib/youtube/thumbnails.ts src/lib/agent/tools/import-youtube-thumbnail.ts tests/channels/thumbnails.test.ts
```

Expected: `tsc` exits 0; no ESLint errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/youtube/thumbnails.ts src/lib/agent/tools/import-youtube-thumbnail.ts tests/channels/thumbnails.test.ts
git commit -m "refactor(youtube): share thumbnail download and library copy" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Sync service with runtime state

**Files:**
- Create: `src/lib/youtube/runtime.ts`, `src/lib/youtube/sync.ts`
- Test: `tests/channels/runtime.test.ts`, `tests/channels/sync.test.ts`

**Interfaces:**
- Consumes: Task 1 — `channelMedianViews`; Task 2 — `QUOTA_SYNC_ERROR`, `MISSING_YOUTUBE_KEY_ERROR`, `type VideoDetails`; Task 3 — `channel-store` (`getChannel`, `channelExists`, `setSyncState`, `setPlaylistId`, `setBackfill`, `finishSync`, `updateChannelDetails`, `knownVideoIds`, `upsertVideos`, `videoIdsToRefresh`, `updateVideoStats`, `deleteVideos`, `viewSamples`, `type ChannelRow`); Task 4 — `fetchChannelDetails`, `fetchPlaylistPage`, `fetchVideos`, `longFormPlaylistId`, `uploadsPlaylistId`, `VIDEOS_BATCH_SIZE`, `YouTubeApiError`, and `tests/channels/fake-youtube.ts`; `getTypedSettings` (`src/lib/settings.ts`).
- Produces (`src/lib/youtube/runtime.ts`):
  - `type ChannelRuntime = { locks: Set<string>; running: Map<string, Promise<void>>; staleQueue: string[]; staleDrain: Promise<void> | null; lastStaleTriggerAt: number; quotaBlockedUntil: number; classification: Promise<void> | null; classificationRequested: boolean; myChannel: { input: string; youtubeChannelId: string | null } | null }`
  - `channelRuntime(): ChannelRuntime`, `resetChannelRuntime(): void` (tests)
  - `acquireChannelLock(channelId: string): boolean`, `releaseChannelLock(channelId: string): void`, `isChannelLocked(channelId: string): boolean`
  - `nextQuotaReset(now: Date): Date`, `markQuotaBlocked(now: Date): void`, `isQuotaBlocked(now: Date): boolean`
- Produces (`src/lib/youtube/sync.ts`):
  - `SHORT_MAX_SECONDS = 180`
  - `keepVideo(video: VideoDetails, filterByDuration: boolean): boolean`
  - `type SyncOutcome = { status: "done"; imported: number; updated: number; removed: number } | { status: "busy" } | { status: "missing" } | { status: "no-key" } | { status: "quota" } | { status: "error"; message: string }`
  - `syncChannel(channelId: string, now?: () => Date): Promise<SyncOutcome>`

- [ ] **Step 1: Write the failing tests**

Create `tests/channels/runtime.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  acquireChannelLock,
  channelRuntime,
  isChannelLocked,
  isQuotaBlocked,
  markQuotaBlocked,
  nextQuotaReset,
  releaseChannelLock,
  resetChannelRuntime,
} from "@/lib/youtube/runtime";

beforeEach(() => {
  resetChannelRuntime();
});

describe("channel locks", () => {
  it("lets one sync hold a channel at a time", () => {
    expect(acquireChannelLock("c1")).toBe(true);
    expect(acquireChannelLock("c1")).toBe(false);
    expect(acquireChannelLock("c2")).toBe(true);
    expect(isChannelLocked("c1")).toBe(true);
    releaseChannelLock("c1");
    expect(isChannelLocked("c1")).toBe(false);
    expect(acquireChannelLock("c1")).toBe(true);
  });

  it("keeps its state on globalThis so every route bundle shares it", () => {
    acquireChannelLock("shared");
    expect(globalThis.__thumbgen_channel_runtime?.locks.has("shared")).toBe(true);
    expect(channelRuntime()).toBe(globalThis.__thumbgen_channel_runtime);
  });
});

describe("quota block", () => {
  it("lasts until the next 08:00 UTC", () => {
    expect(nextQuotaReset(new Date("2026-09-16T05:00:00.000Z")).toISOString()).toBe("2026-09-16T08:00:00.000Z");
    expect(nextQuotaReset(new Date("2026-09-16T08:00:00.000Z")).toISOString()).toBe("2026-09-17T08:00:00.000Z");
    expect(nextQuotaReset(new Date("2026-09-16T23:30:00.000Z")).toISOString()).toBe("2026-09-17T08:00:00.000Z");
  });

  it("blocks automatic syncs until then", () => {
    const now = new Date("2026-09-16T12:00:00.000Z");
    expect(isQuotaBlocked(now)).toBe(false);
    markQuotaBlocked(now);
    expect(isQuotaBlocked(new Date("2026-09-17T07:59:00.000Z"))).toBe(true);
    expect(isQuotaBlocked(new Date("2026-09-17T08:00:00.000Z"))).toBe(false);
  });
});
```

Create `tests/channels/sync.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import * as store from "@/lib/youtube/channel-store";
import { isQuotaBlocked, resetChannelRuntime } from "@/lib/youtube/runtime";
import { keepVideo, syncChannel } from "@/lib/youtube/sync";
import { MISSING_YOUTUBE_KEY_ERROR, QUOTA_SYNC_ERROR, type VideoDetails } from "@/lib/youtube/types";
import { channelIdFor, createFakeYouTube, type FakeVideo, type FakeYouTube } from "./fake-youtube";

const CHANNEL = channelIdFor("s");
const T0 = new Date("2026-09-16T12:00:00.000Z");
const at = (hours: number) => () => new Date(T0.getTime() + hours * 3_600_000);
const daysBefore = (days: number) => new Date(T0.getTime() - days * 86_400_000).toISOString();

let fake: FakeYouTube;

function longVideos(count: number): FakeVideo[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `lv${String(index).padStart(9, "0")}`,
    channelId: CHANNEL,
    publishedAt: daysBefore(8 + index),
    views: 1000 + index,
    durationSeconds: 900,
  }));
}

function useFake(videos: FakeVideo[], options: { hasLongFormPlaylist?: boolean } = {}) {
  fake = createFakeYouTube({
    channels: [{ id: CHANNEL, handle: "@suivie", title: "Chaîne suivie", hasLongFormPlaylist: options.hasLongFormPlaylist }],
    videos,
  });
  vi.stubGlobal("fetch", fake.fetch);
}

function follow(): string {
  return store.insertChannel(
    { youtubeChannelId: CHANNEL, title: "Chaîne suivie", handle: "@suivie", avatarUrl: null, subscriberCount: 10, videoCount: null },
    { syncStatus: "syncing" },
  ).channel.id;
}

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM followed_channels");
  db.exec("DELETE FROM settings");
  setSetting("youtubeApiKey", "test-yt-key");
  resetChannelRuntime();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("keepVideo", () => {
  const base: VideoDetails = {
    videoId: "x",
    title: "x",
    publishedAt: T0.toISOString(),
    durationSeconds: 600,
    viewCount: 1,
    likeCount: null,
    thumbnailUrl: "",
    liveBroadcastContent: "none",
  };

  it("keeps every long-form playlist entry except lives", () => {
    expect(keepVideo({ ...base, durationSeconds: 30 }, false)).toBe(true);
    expect(keepVideo({ ...base, liveBroadcastContent: "upcoming" }, false)).toBe(false);
    expect(keepVideo({ ...base, liveBroadcastContent: "live" }, true)).toBe(false);
  });

  it("drops uploads of 3 minutes or less when filtering by duration", () => {
    expect(keepVideo({ ...base, durationSeconds: 180 }, true)).toBe(false);
    expect(keepVideo({ ...base, durationSeconds: 181 }, true)).toBe(true);
  });
});

describe("syncChannel", () => {
  it("imports the whole long-form history page by page", async () => {
    useFake(longVideos(120));
    const channelId = follow();

    expect(await syncChannel(channelId, at(0))).toEqual({ status: "done", imported: 120, updated: 0, removed: 0 });

    expect(store.listChannelItems()[0]).toMatchObject({
      videoCount: 120,
      syncStatus: "idle",
      syncError: null,
      lastSyncedAt: T0.toISOString(),
      medianViews: 1024.5,
    });
    expect(store.getChannel(channelId)).toMatchObject({
      playlist_id: `UULF${CHANNEL.slice(2)}`,
      backfill_done: 1,
      backfill_page_token: null,
    });
    expect(fake.count("playlistItems")).toBe(4); // playlist probe + 3 pages
    expect(fake.count("videos")).toBe(3);
  });

  it("falls back to the uploads playlist without Shorts when the long-form playlist is missing", async () => {
    useFake(
      [
        { id: "long0000001", channelId: CHANNEL, publishedAt: daysBefore(10), durationSeconds: 600 },
        { id: "short000001", channelId: CHANNEL, publishedAt: daysBefore(11), durationSeconds: 45, short: true },
        { id: "edge0000180", channelId: CHANNEL, publishedAt: daysBefore(12), durationSeconds: 180 },
        { id: "edge0000181", channelId: CHANNEL, publishedAt: daysBefore(13), durationSeconds: 181 },
        { id: "live0000001", channelId: CHANNEL, publishedAt: daysBefore(1), live: "upcoming" },
      ],
      { hasLongFormPlaylist: false },
    );
    const channelId = follow();

    await syncChannel(channelId, at(0));

    expect([...store.knownVideoIds(channelId)].sort()).toEqual(["edge0000181", "long0000001"]);
    expect(store.getChannel(channelId)?.playlist_id).toBe(`UU${CHANNEL.slice(2)}`);
  });

  it("stops at the first known video, refreshes views and drops removed videos", async () => {
    useFake(longVideos(60));
    const channelId = follow();
    await syncChannel(channelId, at(0));

    fake.addVideo({ id: "new00000001", channelId: CHANNEL, publishedAt: daysBefore(2), views: 50 });
    fake.addVideo({ id: "new00000002", channelId: CHANNEL, publishedAt: daysBefore(1), views: 80 });
    fake.setViews("lv000000000", 99_999);
    fake.removeVideo("lv000000059");
    const playlistCallsBefore = fake.count("playlistItems");

    expect(await syncChannel(channelId, at(1))).toEqual({ status: "done", imported: 2, updated: 59, removed: 1 });

    expect(fake.count("playlistItems") - playlistCallsBefore).toBe(1);
    expect(store.getVideo("lv000000000")?.view_count).toBe(99_999);
    expect(store.getVideo("lv000000059")).toBeNull();
    expect(store.getVideo("new00000002")).toMatchObject({ view_count: 80, stats_updated_at: at(1)().toISOString() });
  });

  it("keeps a manual thumbnail type across syncs", async () => {
    useFake(longVideos(3));
    const channelId = follow();
    await syncChannel(channelId, at(0));
    store.setManualThumbType("lv000000001", "versus");

    await syncChannel(channelId, at(1));

    expect(store.getVideo("lv000000001")).toMatchObject({ thumb_type: "versus", thumb_type_source: "manual" });
  });

  it("stops cleanly on quota, keeps imported videos and resumes where it stopped", async () => {
    useFake(longVideos(120));
    const channelId = follow();
    fake.setQuotaAfter(5); // probe, page 1, videos, page 2, videos — page 3 hits the quota

    expect(await syncChannel(channelId, at(0))).toEqual({ status: "quota" });
    expect(store.listChannelItems()[0]).toMatchObject({
      videoCount: 100,
      syncStatus: "error",
      syncError: QUOTA_SYNC_ERROR,
      lastSyncedAt: null,
    });
    expect(store.getChannel(channelId)).toMatchObject({ backfill_page_token: "100", backfill_done: 0 });
    expect(isQuotaBlocked(at(0)())).toBe(true);

    fake.setQuotaAfter(null);
    expect(await syncChannel(channelId, at(24))).toMatchObject({ status: "done", imported: 20 });
    expect(store.listChannelItems()[0]).toMatchObject({ videoCount: 120, syncStatus: "idle", syncError: null });
    expect(store.getChannel(channelId)).toMatchObject({ backfill_page_token: null, backfill_done: 1 });
  });

  it("runs one sync at a time per channel", async () => {
    useFake(longVideos(3));
    const channelId = follow();

    const first = syncChannel(channelId, at(0));
    expect(await syncChannel(channelId, at(0))).toEqual({ status: "busy" });
    await expect(first).resolves.toMatchObject({ status: "done" });
    await expect(syncChannel(channelId, at(1))).resolves.toMatchObject({ status: "done" });
  });

  it("marks the channel in error when YouTube cannot be reached, keeping its videos", async () => {
    useFake(longVideos(3));
    const channelId = follow();
    await syncChannel(channelId, at(0));
    fake.setNetworkDown(true);

    expect(await syncChannel(channelId, at(1))).toEqual({ status: "error", message: "YouTube injoignable" });
    expect(store.listChannelItems()[0]).toMatchObject({ syncStatus: "error", syncError: "YouTube injoignable", videoCount: 3 });
  });

  it("needs a YouTube key", async () => {
    useFake(longVideos(3));
    const channelId = follow();
    getDb().exec("DELETE FROM settings");
    vi.stubEnv("YOUTUBE_API_KEY", "");

    expect(await syncChannel(channelId, at(0))).toEqual({ status: "no-key" });
    expect(store.getChannel(channelId)).toMatchObject({ sync_status: "error", sync_error: MISSING_YOUTUBE_KEY_ERROR });
    expect(fake.calls).toHaveLength(0);
  });

  it("ignores an unknown channel", async () => {
    useFake([]);
    expect(await syncChannel("unknown-channel", at(0))).toEqual({ status: "missing" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/channels/runtime.test.ts tests/channels/sync.test.ts`
Expected: FAIL — unresolved `@/lib/youtube/runtime` and `@/lib/youtube/sync`.

- [ ] **Step 3: Write the runtime**

Create `src/lib/youtube/runtime.ts`:

```ts
/**
 * In-process state for followed-channel background work.
 *
 * ThumbGen runs as one long-lived Node process (Docker, Next standalone
 * server). Plain module state is not guaranteed to be shared across route
 * bundles and is lost on dev hot reload, so — like src/lib/db.ts and
 * src/lib/data-admin.ts — everything lives on globalThis. Anything that must
 * survive a restart (backfill position, classification approvals/attempts)
 * is stored in SQLite instead.
 */

export type ChannelRuntime = {
  /** Channels with a sync in progress (one at a time per channel, across tabs). */
  locks: Set<string>;
  /** Background sync promises by channel id. */
  running: Map<string, Promise<void>>;
  /** Channels waiting for the one-after-the-other stale sync. */
  staleQueue: string[];
  staleDrain: Promise<void> | null;
  /** Last automatic trigger (ms since epoch), for the 10-minute throttle. */
  lastStaleTriggerAt: number;
  /** YouTube quota exhausted until this instant (ms since epoch). */
  quotaBlockedUntil: number;
  classification: Promise<void> | null;
  classificationRequested: boolean;
  /** « Ma chaîne » setting value last resolved, and the channel it points to. */
  myChannel: { input: string; youtubeChannelId: string | null } | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __thumbgen_channel_runtime: ChannelRuntime | undefined;
}

function createRuntime(): ChannelRuntime {
  return {
    locks: new Set(),
    running: new Map(),
    staleQueue: [],
    staleDrain: null,
    lastStaleTriggerAt: 0,
    quotaBlockedUntil: 0,
    classification: null,
    classificationRequested: false,
    myChannel: null,
  };
}

export function channelRuntime(): ChannelRuntime {
  if (!globalThis.__thumbgen_channel_runtime) globalThis.__thumbgen_channel_runtime = createRuntime();
  return globalThis.__thumbgen_channel_runtime;
}

/** Tests only: forget locks, queues, throttles and caches. */
export function resetChannelRuntime(): void {
  globalThis.__thumbgen_channel_runtime = createRuntime();
}

export function acquireChannelLock(channelId: string): boolean {
  const { locks } = channelRuntime();
  if (locks.has(channelId)) return false;
  locks.add(channelId);
  return true;
}

export function releaseChannelLock(channelId: string): void {
  channelRuntime().locks.delete(channelId);
}

export function isChannelLocked(channelId: string): boolean {
  return channelRuntime().locks.has(channelId);
}

/**
 * YouTube quotas reset at midnight Pacific Time: 08:00 UTC in winter, 07:00
 * UTC in summer. Waiting until 08:00 UTC is right in winter and one hour late
 * in summer.
 */
export function nextQuotaReset(now: Date): Date {
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8, 0, 0));
  if (reset.getTime() <= now.getTime()) reset.setUTCDate(reset.getUTCDate() + 1);
  return reset;
}

export function markQuotaBlocked(now: Date): void {
  channelRuntime().quotaBlockedUntil = nextQuotaReset(now).getTime();
}

export function isQuotaBlocked(now: Date): boolean {
  return now.getTime() < channelRuntime().quotaBlockedUntil;
}
```

- [ ] **Step 4: Write the sync service**

Create `src/lib/youtube/sync.ts`:

```ts
import { getTypedSettings } from "@/lib/settings";
import {
  fetchChannelDetails,
  fetchPlaylistPage,
  fetchVideos,
  longFormPlaylistId,
  uploadsPlaylistId,
  VIDEOS_BATCH_SIZE,
  YouTubeApiError,
} from "./api";
import * as store from "./channel-store";
import { channelMedianViews } from "./performance";
import { acquireChannelLock, markQuotaBlocked, releaseChannelLock } from "./runtime";
import { MISSING_YOUTUBE_KEY_ERROR, QUOTA_SYNC_ERROR, type VideoDetails } from "./types";

/** Shorts last up to 3 minutes: from the uploads playlist, only longer videos are kept. */
export const SHORT_MAX_SECONDS = 180;

export type SyncOutcome =
  | { status: "done"; imported: number; updated: number; removed: number }
  | { status: "busy" }
  | { status: "missing" }
  | { status: "no-key" }
  | { status: "quota" }
  | { status: "error"; message: string };

type PlaylistChoice = { id: string; filterByDuration: boolean };

class ChannelGoneError extends Error {}

export function keepVideo(video: VideoDetails, filterByDuration: boolean): boolean {
  if (video.liveBroadcastContent !== "none") return false;
  return !filterByDuration || video.durationSeconds > SHORT_MAX_SECONDS;
}

/** First sync: probe the long-form playlist (UULF…); a 404 falls back to the uploads playlist (UU…). */
async function choosePlaylist(apiKey: string, channel: store.ChannelRow): Promise<PlaylistChoice> {
  if (channel.playlist_id) {
    return { id: channel.playlist_id, filterByDuration: !channel.playlist_id.startsWith("UULF") };
  }
  const longForm = longFormPlaylistId(channel.youtube_channel_id);
  try {
    await fetchPlaylistPage(apiKey, longForm);
    store.setPlaylistId(channel.id, longForm);
    return { id: longForm, filterByDuration: false };
  } catch (err) {
    if (!(err instanceof YouTubeApiError) || !err.isNotFound) throw err;
    const uploads = uploadsPlaylistId(channel.youtube_channel_id);
    store.setPlaylistId(channel.id, uploads);
    return { id: uploads, filterByDuration: true };
  }
}

/**
 * Walks the playlist from the newest video until a known one (everything on
 * the first import), then resumes an import the quota interrupted from its
 * saved page token. Rows are written page by page so a stop keeps them.
 */
async function importNewVideos(
  apiKey: string,
  channel: store.ChannelRow,
  playlist: PlaylistChoice,
  stamp: string,
): Promise<number> {
  const known = store.knownVideoIds(channel.id);
  let imported = 0;

  const importPage = async (videoIds: string[]) => {
    const fresh = videoIds.filter((videoId) => !known.has(videoId));
    if (fresh.length === 0) return;
    const { videos } = await fetchVideos(apiKey, fresh);
    const kept = videos.filter((video) => keepVideo(video, playlist.filterByDuration));
    if (!store.channelExists(channel.id)) throw new ChannelGoneError();
    store.upsertVideos(channel.id, kept, stamp);
    for (const video of kept) known.add(video.videoId);
    imported += kept.length;
  };

  const firstImport = channel.backfill_done === 0 && channel.backfill_page_token === null;
  let pageToken: string | null = null;
  do {
    const page = await fetchPlaylistPage(apiKey, playlist.id, pageToken);
    const reachedKnown = !firstImport && page.videoIds.some((videoId) => known.has(videoId));
    await importPage(page.videoIds);
    pageToken = page.nextPageToken;
    if (firstImport) store.setBackfill(channel.id, { pageToken, done: pageToken === null });
    if (reachedKnown) break;
  } while (pageToken);

  if (!firstImport && channel.backfill_done === 0 && channel.backfill_page_token) {
    let resumeToken: string | null = channel.backfill_page_token;
    while (resumeToken) {
      const page = await fetchPlaylistPage(apiKey, playlist.id, resumeToken);
      await importPage(page.videoIds);
      resumeToken = page.nextPageToken;
      store.setBackfill(channel.id, { pageToken: resumeToken, done: resumeToken === null });
    }
  }

  return imported;
}

/** Fresh views for every video not fetched during this sync; videos YouTube no longer returns are removed. */
async function refreshStats(apiKey: string, channelId: string, stamp: string): Promise<{ updated: number; removed: number }> {
  const videoIds = store.videoIdsToRefresh(channelId, stamp);
  let updated = 0;
  let removed = 0;
  for (let start = 0; start < videoIds.length; start += VIDEOS_BATCH_SIZE) {
    const batch = videoIds.slice(start, start + VIDEOS_BATCH_SIZE);
    const { videos, foundIds } = await fetchVideos(apiKey, batch);
    store.updateVideoStats(videos, stamp);
    const gone = batch.filter((videoId) => !foundIds.has(videoId));
    store.deleteVideos(gone);
    updated += videos.length;
    removed += gone.length;
  }
  return { updated, removed };
}

/** Name, avatar and subscribers change over time; failing to refresh them never fails the sync. */
async function refreshChannelDetails(apiKey: string, channel: store.ChannelRow): Promise<void> {
  try {
    const details = await fetchChannelDetails(apiKey, channel.youtube_channel_id);
    if (details) store.updateChannelDetails(channel.id, details);
  } catch {
    // Cosmetic data: keep the previous values.
  }
}

export async function syncChannel(channelId: string, now: () => Date = () => new Date()): Promise<SyncOutcome> {
  if (!acquireChannelLock(channelId)) return { status: "busy" };
  try {
    const channel = store.getChannel(channelId);
    if (!channel) return { status: "missing" };
    const apiKey = getTypedSettings().youtubeApiKey;
    if (!apiKey) {
      store.setSyncState(channelId, { status: "error", error: MISSING_YOUTUBE_KEY_ERROR });
      return { status: "no-key" };
    }

    store.setSyncState(channelId, { status: "syncing", error: null });
    const stamp = now().toISOString();
    try {
      const playlist = await choosePlaylist(apiKey, channel);
      const imported = await importNewVideos(apiKey, channel, playlist, stamp);
      const { updated, removed } = await refreshStats(apiKey, channelId, stamp);
      await refreshChannelDetails(apiKey, channel);
      if (!store.channelExists(channelId)) return { status: "missing" };
      store.finishSync(channelId, {
        medianViews: channelMedianViews(store.viewSamples(channelId), now()),
        syncedAt: now().toISOString(),
      });
      return { status: "done", imported, updated, removed };
    } catch (err) {
      if (err instanceof ChannelGoneError) return { status: "missing" };
      if (err instanceof YouTubeApiError && err.isQuota) {
        markQuotaBlocked(now());
        store.setSyncState(channelId, { status: "error", error: QUOTA_SYNC_ERROR });
        return { status: "quota" };
      }
      const message = err instanceof Error ? err.message : "Synchronisation impossible";
      store.setSyncState(channelId, { status: "error", error: message });
      return { status: "error", message };
    }
  } finally {
    releaseChannelLock(channelId);
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/channels/runtime.test.ts tests/channels/sync.test.ts`
Expected: PASS.

- [ ] **Step 6: Type-check and lint**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/lib/youtube/runtime.ts src/lib/youtube/sync.ts tests/channels/runtime.test.ts tests/channels/sync.test.ts
```

Expected: `tsc` exits 0; no ESLint errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/youtube/runtime.ts src/lib/youtube/sync.ts tests/channels/runtime.test.ts tests/channels/sync.test.ts
git commit -m "feat(channels): incremental channel sync with quota stop, resume and lock" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
## Task 7: AI classification — setting, cost logging and queue worker

**Files:**
- Create: `src/lib/youtube/classify.ts`
- Modify: `src/lib/settings-schema.ts` (chantier C adds `brandfetchApiKey` — re-read first), `src/lib/generations-log.ts`, `src/components/settings/GenerationSection.tsx`, `tests/settings/settings.test.ts` (chantier C may have edited it — re-read first)
- Test: `tests/channels/classify.test.ts`

**Interfaces:**
- Consumes: Task 2 — `THUMB_TYPES`, `THUMB_TYPE_IDS`, `parseClassification`, `CLASSIFY_MODEL`, `CLASSIFY_MODEL_LABEL`, `CLASSIFY_CONFIRM_THRESHOLD`, `estimateClassificationCostUsd`, `tokenCostUsd`, `youtubeThumbnailUrl`, `type ClassificationStatus`; Task 3 — `channel-store` (`countPendingClassification`, `approvePendingClassification`, `nextClassificationBatch`, `setAiThumbType`, `incrementClassifyAttempts`); `getOpenRouterClient` (`src/lib/agent/llm-client.ts`); `getTypedSettings`.
- Produces:
  - Setting `inspirationAutoClassify: boolean` (default `true`) in `SettingsSchema` / `TypedSettings` / `SettingsValues`.
  - `src/lib/generations-log.ts`: `type LogEndpoint = "generate" | "edit" | "remix" | "classify-thumbnail"`; `LogInput.endpoint: LogEndpoint`; optional `LogInput.costEstimate?: number` (overrides the per-image estimate).
  - `src/lib/youtube/classify.ts`: `CLASSIFY_BATCH_SIZE = 20`, `CLASSIFY_CONCURRENCY = 4`, `CLASSIFY_SYSTEM_PROMPT: string`, `type ClassifierClient = Pick<OpenAI, "chat">`, `type ClassificationDeps = { getClient: () => ClassifierClient | null; isEnabled: () => boolean }`, `defaultClassificationDeps: ClassificationDeps`, `buildClassificationStatus(running: boolean, deps?: ClassificationDeps): ClassificationStatus`, `classifyVideo(client: ClassifierClient, videoId: string): Promise<"classified" | "failed">`, `runClassificationQueue(deps?: ClassificationDeps): Promise<{ classified: number; failed: number }>`.

- [ ] **Step 1: Re-read the shared files on the latest `main`**

```bash
grep -n "language: z.enum\|youtubePlaylistId:" src/lib/settings-schema.ts
grep -n "language: \"fr\"," tests/settings/settings.test.ts
grep -n "endpoint: \"generate\" | \"edit\" | \"remix\"\|const cost = " src/lib/generations-log.ts
grep -n "const KEYS = \|FieldError message={form.issues.language}" src/components/settings/GenerationSection.tsx
```

Expected: each grep prints its anchor. If chantier C moved one, apply the change below to the equivalent code.

- [ ] **Step 2: Write the failing tests**

Create `tests/channels/classify.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { logGeneration } from "@/lib/generations-log";
import { getTypedSettings, setSetting } from "@/lib/settings";
import * as store from "@/lib/youtube/channel-store";
import { CLASSIFY_MODEL } from "@/lib/youtube/classification-pricing";
import {
  buildClassificationStatus,
  classifyVideo,
  runClassificationQueue,
  type ClassificationDeps,
  type ClassifierClient,
} from "@/lib/youtube/classify";

type CreateArgs = {
  model: string;
  response_format: unknown;
  messages: Array<{ role: string; content: unknown }>;
};

function fakeClient(answer: (videoId: string) => unknown) {
  const create = vi.fn(async (args: CreateArgs) => {
    const user = args.messages.find((message) => message.role === "user");
    const parts = user?.content as Array<{ type: string; image_url?: { url: string } }>;
    const imageUrl = parts.find((part) => part.type === "image_url")?.image_url?.url ?? "";
    // https://i.ytimg.com/vi/<videoId>/mqdefault.jpg
    return answer(imageUrl.split("/")[4] ?? "");
  });
  return { client: { chat: { completions: { create } } } as unknown as ClassifierClient, create };
}

const completion = (
  content: string,
  usage: Record<string, number> = { prompt_tokens: 600, completion_tokens: 8, total_tokens: 608, cost: 0.0000632 },
) => ({ choices: [{ message: { content } }], usage });

const deps = (client: ClassifierClient | null, enabled = true): ClassificationDeps => ({
  getClient: () => client,
  isEnabled: () => enabled,
});

let channelId: string;

function seedVideos(videoIds: string[]) {
  store.upsertVideos(
    channelId,
    videoIds.map((videoId, index) => ({
      videoId,
      title: `Vidéo ${videoId}`,
      publishedAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
      durationSeconds: 600,
      viewCount: 10,
      likeCount: null,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      liveBroadcastContent: "none",
    })),
    "2026-09-01T00:00:00.000Z",
  );
}

const classifyLogs = () =>
  getDb()
    .prepare(
      `SELECT model, endpoint, status, cost_estimate, input_tokens, output_tokens, image_count
       FROM generations_log WHERE endpoint = 'classify-thumbnail' ORDER BY created_at`,
    )
    .all();

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM followed_channels");
  db.exec("DELETE FROM generations_log");
  db.exec("DELETE FROM settings");
  channelId = store.insertChannel({
    youtubeChannelId: `UC${"k".repeat(22)}`,
    title: "Classement",
    handle: null,
    avatarUrl: null,
    subscriberCount: null,
    videoCount: null,
  }).channel.id;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("inspirationAutoClassify setting", () => {
  it("is on by default and can be turned off", () => {
    expect(getTypedSettings().inspirationAutoClassify).toBe(true);
    setSetting("inspirationAutoClassify", "false");
    expect(getTypedSettings().inspirationAutoClassify).toBe(false);
  });
});

describe("logGeneration", () => {
  it("stores a token-priced cost for a thumbnail classification", () => {
    logGeneration({ provider: "openrouter", model: CLASSIFY_MODEL, endpoint: "classify-thumbnail", timeMs: 5, imageCount: 0, costEstimate: 0.00007 });
    expect(classifyLogs()).toEqual([
      { model: CLASSIFY_MODEL, endpoint: "classify-thumbnail", status: "success", cost_estimate: 0.00007, input_tokens: 0, output_tokens: 0, image_count: 0 },
    ]);
  });
});

describe("classifyVideo", () => {
  it("asks the vision model for one type with a JSON schema, stores it and logs the cost", async () => {
    seedVideos(["vid00000001"]);
    const { client, create } = fakeClient(() => completion('{"type":"before_after"}'));

    expect(await classifyVideo(client, "vid00000001")).toBe("classified");

    const args = create.mock.calls[0][0];
    expect(args.model).toBe("google/gemini-2.5-flash-lite");
    expect(args.response_format).toMatchObject({ type: "json_schema", json_schema: { name: "thumbnail_type", strict: true } });
    expect(JSON.stringify(args.messages)).toContain("https://i.ytimg.com/vi/vid00000001/mqdefault.jpg");
    expect(store.getVideo("vid00000001")).toMatchObject({ thumb_type: "before_after", thumb_type_source: "ai" });
    expect(classifyLogs()).toEqual([
      { model: CLASSIFY_MODEL, endpoint: "classify-thumbnail", status: "success", cost_estimate: 0.0000632, input_tokens: 600, output_tokens: 8, image_count: 0 },
    ]);
  });

  it("files an invalid answer under « other »", async () => {
    seedVideos(["vid00000001", "vid00000002"]);
    const { client } = fakeClient((videoId) => completion(videoId === "vid00000001" ? '{"type":"banana"}' : "pas du JSON"));

    await classifyVideo(client, "vid00000001");
    await classifyVideo(client, "vid00000002");

    expect(store.getVideo("vid00000001")?.thumb_type).toBe("other");
    expect(store.getVideo("vid00000002")?.thumb_type).toBe("other");
  });

  it("prices the call from its tokens when OpenRouter sends no cost", async () => {
    seedVideos(["vid00000001"]);
    const { client } = fakeClient(() => completion('{"type":"scene"}', { prompt_tokens: 1_000_000, completion_tokens: 0, total_tokens: 1_000_000 }));

    await classifyVideo(client, "vid00000001");

    expect((classifyLogs()[0] as { cost_estimate: number }).cost_estimate).toBeCloseTo(0.1);
  });

  it("leaves a failed thumbnail unclassified and counts the attempt", async () => {
    seedVideos(["vid00000001"]);
    const { client } = fakeClient(() => {
      throw new Error("OpenRouter 502");
    });

    expect(await classifyVideo(client, "vid00000001")).toBe("failed");

    expect(store.getVideo("vid00000001")).toMatchObject({ thumb_type: null, thumb_type_source: null, classify_attempts: 1 });
    expect(classifyLogs()).toMatchObject([{ status: "error", cost_estimate: 0 }]);
  });

  it("never overwrites a type corrected by hand while the model was answering", async () => {
    seedVideos(["vid00000001"]);
    const { client } = fakeClient(() => {
      store.setManualThumbType("vid00000001", "versus");
      return completion('{"type":"scene"}');
    });

    await classifyVideo(client, "vid00000001");

    expect(store.getVideo("vid00000001")).toMatchObject({ thumb_type: "versus", thumb_type_source: "manual" });
  });
});

describe("runClassificationQueue", () => {
  it("classifies every pending thumbnail and skips manual ones", async () => {
    seedVideos(["vid00000001", "vid00000002", "vid00000003"]);
    store.setManualThumbType("vid00000002", "text_only");
    const { client, create } = fakeClient(() => completion('{"type":"face_text"}'));

    expect(await runClassificationQueue(deps(client))).toEqual({ classified: 2, failed: 0 });

    expect(create).toHaveBeenCalledTimes(2);
    expect(store.getVideo("vid00000002")).toMatchObject({ thumb_type: "text_only", thumb_type_source: "manual" });
  });

  it("retries a failed thumbnail on later runs only, 3 times at most", async () => {
    seedVideos(["vid00000001"]);
    const { client, create } = fakeClient(() => {
      throw new Error("boom");
    });

    expect(await runClassificationQueue(deps(client))).toEqual({ classified: 0, failed: 1 });
    expect(create).toHaveBeenCalledTimes(1);
    await runClassificationQueue(deps(client));
    await runClassificationQueue(deps(client));
    expect(await runClassificationQueue(deps(client))).toEqual({ classified: 0, failed: 0 });
    expect(create).toHaveBeenCalledTimes(3);
  });

  it("does nothing when the setting is off or without an OpenRouter key", async () => {
    seedVideos(["vid00000001"]);
    const { client, create } = fakeClient(() => completion('{"type":"scene"}'));

    expect(await runClassificationQueue(deps(client, false))).toEqual({ classified: 0, failed: 0 });
    expect(await runClassificationQueue(deps(null))).toEqual({ classified: 0, failed: 0 });
    expect(create).not.toHaveBeenCalled();
  });

  it("waits for confirmation above 200 thumbnails, then classifies them all", async () => {
    seedVideos(Array.from({ length: 201 }, (_, index) => `big${String(index).padStart(8, "0")}`));
    const { client, create } = fakeClient(() => completion('{"type":"object"}'));

    expect(await runClassificationQueue(deps(client))).toEqual({ classified: 0, failed: 0 });
    expect(create).not.toHaveBeenCalled();
    const status = buildClassificationStatus(false, deps(client));
    expect(status).toMatchObject({ enabled: true, hasKey: true, pending: 201, awaitingConfirmation: 201, running: false, modelLabel: "Gemini 2.5 Flash Lite" });
    expect(status.estimatedCostUsd).toBeCloseTo(201 * 0.000078, 8);

    expect(store.approvePendingClassification()).toBe(201);
    expect(await runClassificationQueue(deps(client))).toEqual({ classified: 201, failed: 0 });
    expect(buildClassificationStatus(false, deps(client))).toMatchObject({ pending: 0, awaitingConfirmation: 0, estimatedCostUsd: 0 });
  });

  it("starts a batch of 200 or fewer without asking", async () => {
    seedVideos(Array.from({ length: 200 }, (_, index) => `ok${String(index).padStart(9, "0")}`));
    const { client } = fakeClient(() => completion('{"type":"object"}'));

    expect(buildClassificationStatus(false, deps(client)).awaitingConfirmation).toBe(0);
    expect(await runClassificationQueue(deps(client))).toEqual({ classified: 200, failed: 0 });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/channels/classify.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/youtube/classify"`.

- [ ] **Step 4: Add the setting**

In `src/lib/settings-schema.ts`, inside `SettingsSchema`, right after the `language` line:

```ts
  language: z.enum(LANGUAGE_CODES, { error: "Langue inconnue" }).default("fr"),
  inspirationAutoClassify: flag(true),
```

In `tests/settings/settings.test.ts`, in the expected object of « returns every default on an empty table », right after `language: "fr",`:

```ts
      language: "fr",
      inspirationAutoClassify: true,
```

- [ ] **Step 5: Let `logGeneration` take a classification cost**

In `src/lib/generations-log.ts`, replace:

```ts
export type LogInput = {
  provider: string;
  model: string;
  endpoint: "generate" | "edit" | "remix";
```

with:

```ts
export type LogEndpoint = "generate" | "edit" | "remix" | "classify-thumbnail";

export type LogInput = {
  provider: string;
  model: string;
  endpoint: LogEndpoint;
  /** Overrides the per-image estimate — token-priced calls such as thumbnail classification. */
  costEstimate?: number;
```

and replace:

```ts
  const cost = getCostPerImage(input.model) * (input.imageCount || 0);
```

with:

```ts
  const cost = input.costEstimate ?? getCostPerImage(input.model) * (input.imageCount || 0);
```

- [ ] **Step 6: Write the classifier and its queue**

Create `src/lib/youtube/classify.ts`:

```ts
import type OpenAI from "openai";
import { getOpenRouterClient } from "@/lib/agent/llm-client";
import { logGeneration } from "@/lib/generations-log";
import { getTypedSettings } from "@/lib/settings";
import * as store from "./channel-store";
import {
  CLASSIFY_CONFIRM_THRESHOLD,
  CLASSIFY_MODEL,
  CLASSIFY_MODEL_LABEL,
  estimateClassificationCostUsd,
  tokenCostUsd,
} from "./classification-pricing";
import { THUMB_TYPES, THUMB_TYPE_IDS, parseClassification } from "./thumb-types";
import { youtubeThumbnailUrl, type ClassificationStatus } from "./types";

export const CLASSIFY_BATCH_SIZE = 20;
export const CLASSIFY_CONCURRENCY = 4;

export const CLASSIFY_SYSTEM_PROMPT = [
  "Tu classes des miniatures YouTube selon leur composition visuelle.",
  'Réponds uniquement avec un objet JSON {"type": "<identifiant>"} où l\'identifiant est l\'un de :',
  ...THUMB_TYPES.map((type) => `- ${type.id} : ${type.label}`),
  "Choisis le type dominant. Si aucun ne convient, réponds other.",
].join("\n");

const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "thumbnail_type",
    strict: true,
    schema: {
      type: "object",
      properties: { type: { type: "string", enum: [...THUMB_TYPE_IDS] } },
      required: ["type"],
      additionalProperties: false,
    },
  },
} as const;

export type ClassifierClient = Pick<OpenAI, "chat">;

export type ClassificationDeps = {
  getClient: () => ClassifierClient | null;
  isEnabled: () => boolean;
};

export const defaultClassificationDeps: ClassificationDeps = {
  getClient: () => getOpenRouterClient(),
  isEnabled: () => getTypedSettings().inspirationAutoClassify,
};

type OpenRouterUsage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };

export function buildClassificationStatus(
  running: boolean,
  deps: ClassificationDeps = defaultClassificationDeps,
): ClassificationStatus {
  const { pending, unapproved } = store.countPendingClassification();
  const awaitingConfirmation = unapproved > CLASSIFY_CONFIRM_THRESHOLD ? unapproved : 0;
  return {
    enabled: deps.isEnabled(),
    hasKey: deps.getClient() !== null,
    pending,
    awaitingConfirmation,
    estimatedCostUsd: estimateClassificationCostUsd(awaitingConfirmation),
    running,
    modelLabel: CLASSIFY_MODEL_LABEL,
  };
}

/** One OpenRouter call per thumbnail; every call is logged in generations_log for Usage. */
export async function classifyVideo(client: ClassifierClient, videoId: string): Promise<"classified" | "failed"> {
  const start = Date.now();
  try {
    const completion = await client.chat.completions.create({
      model: CLASSIFY_MODEL,
      temperature: 0,
      max_tokens: 50,
      response_format: RESPONSE_FORMAT,
      messages: [
        { role: "system", content: CLASSIFY_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Quel est le type de cette miniature ?" },
            { type: "image_url", image_url: { url: youtubeThumbnailUrl(videoId, "mqdefault") } },
          ],
        },
      ],
    });
    const type = parseClassification(completion.choices[0]?.message?.content);
    const usage = (completion.usage ?? {}) as OpenRouterUsage;
    const inputTokens = usage.prompt_tokens ?? 0;
    const outputTokens = usage.completion_tokens ?? 0;
    store.setAiThumbType(videoId, type);
    logGeneration({
      provider: "openrouter",
      model: CLASSIFY_MODEL,
      endpoint: "classify-thumbnail",
      timeMs: Date.now() - start,
      imageCount: 0,
      inputTokens,
      outputTokens,
      totalTokens: usage.total_tokens ?? inputTokens + outputTokens,
      costEstimate: typeof usage.cost === "number" ? usage.cost : tokenCostUsd(inputTokens, outputTokens),
      prompt: `Miniature ${videoId} → ${type}`,
    });
    return "classified";
  } catch (err) {
    store.incrementClassifyAttempts(videoId);
    logGeneration({
      provider: "openrouter",
      model: CLASSIFY_MODEL,
      endpoint: "classify-thumbnail",
      timeMs: Date.now() - start,
      imageCount: 0,
      costEstimate: 0,
      prompt: `Miniature ${videoId}`,
      status: "error",
      errorMessage: err instanceof Error ? err.message.slice(0, 200) : "Classement impossible",
    });
    return "failed";
  }
}

async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await run(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Classifies pending thumbnails until none is left. 200 unapproved thumbnails
 * or fewer are approved on the spot; more wait for « Lancer le classement ».
 * A thumbnail that fails is not retried within the same run.
 */
export async function runClassificationQueue(
  deps: ClassificationDeps = defaultClassificationDeps,
): Promise<{ classified: number; failed: number }> {
  let classified = 0;
  let failed = 0;
  const attempted = new Set<string>();
  for (;;) {
    if (!deps.isEnabled()) break;
    const client = deps.getClient();
    if (!client) break;
    const { unapproved } = store.countPendingClassification();
    if (unapproved > 0 && unapproved <= CLASSIFY_CONFIRM_THRESHOLD) store.approvePendingClassification();
    const batch = store
      .nextClassificationBatch(CLASSIFY_BATCH_SIZE + attempted.size)
      .filter((videoId) => !attempted.has(videoId))
      .slice(0, CLASSIFY_BATCH_SIZE);
    if (batch.length === 0) break;
    for (const videoId of batch) attempted.add(videoId);
    const results = await mapWithConcurrency(batch, CLASSIFY_CONCURRENCY, (videoId) => classifyVideo(client, videoId));
    classified += results.filter((result) => result === "classified").length;
    failed += results.filter((result) => result === "failed").length;
  }
  return { classified, failed };
}
```

- [ ] **Step 7: Add the switch to Réglages → Génération d'images**

In `src/components/settings/GenerationSection.tsx`:

Add imports (next to the existing ones):

```ts
import { Switch } from "@/components/ui/switch";
import { CLASSIFY_MODEL_LABEL, estimateClassificationCostUsd } from "@/lib/youtube/classification-pricing";
```

Replace the `KEYS` constant:

```ts
const KEYS = [
  "favoriteModel",
  "defaultAspectRatio",
  "defaultImageCount",
  "defaultResolution",
  "language",
  "inspirationAutoClassify",
] as const;

const CLASSIFY_COST_PER_THOUSAND = `${estimateClassificationCostUsd(1000).toFixed(2).replace(".", ",")} $`;
```

Right after the language block's closing lines:

```tsx
            <FieldError message={form.issues.language} />
          </div>
```

insert:

```tsx

          <div className="flex items-start justify-between gap-4">
            <div className="grid gap-1">
              <Label htmlFor="generation-auto-classify">Classer automatiquement les miniatures (IA)</Label>
              <p className="text-sm text-muted-foreground">
                Range les miniatures des chaînes suivies par type avec {CLASSIFY_MODEL_LABEL} (environ{" "}
                {CLASSIFY_COST_PER_THOUSAND} pour 1 000 miniatures). Une correction faite à la main n&apos;est jamais
                remplacée.
              </p>
            </div>
            <Switch
              id="generation-auto-classify"
              checked={values.inspirationAutoClassify}
              onCheckedChange={(checked) => form.setValue("inspirationAutoClassify", checked)}
            />
          </div>
```

- [ ] **Step 8: Run the tests to verify they pass**

```bash
./node_modules/.bin/vitest run tests/channels/classify.test.ts tests/settings/settings.test.ts tests/settings/settings-route.test.ts tests/agent/usage.test.ts
```

Expected: PASS.

- [ ] **Step 9: Type-check and lint**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/lib/youtube/classify.ts src/lib/settings-schema.ts src/lib/generations-log.ts src/components/settings/GenerationSection.tsx tests/channels/classify.test.ts tests/settings/settings.test.ts
```

Expected: `tsc` exits 0; no ESLint errors. If `tsc` rejects `response_format` or the message parts, check the installed SDK's types (`node_modules/openai/resources/chat/completions/completions.d.ts`: `ResponseFormatJSONSchema`, `ChatCompletionContentPartImage`) and adjust the literal to them — never cast the call to `any`.

- [ ] **Step 10: Commit**

```bash
git add src/lib/youtube/classify.ts src/lib/settings-schema.ts src/lib/generations-log.ts src/components/settings/GenerationSection.tsx tests/channels/classify.test.ts tests/settings/settings.test.ts
git commit -m "feat(channels): classify thumbnails by type with Gemini 2.5 Flash Lite" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Background jobs and « Ma chaîne »

**Files:**
- Create: `src/lib/youtube/jobs.ts`, `src/lib/youtube/my-channel.ts`
- Test: `tests/channels/jobs.test.ts`, `tests/channels/my-channel.test.ts`

**Interfaces:**
- Consumes: Task 3 — `channel-store` (`allChannelIds`, `staleChannelIds`, `syncingChannelIds`, `channelExists`, `setSyncState`, `approvePendingClassification`, `getChannelByYoutubeId`, `insertChannel`, `setMineChannel`); Task 4 — `fetchChannelDetails`, `resolveChannelInput`, `localChannelId`, `YouTubeApiError`, fake YouTube; Task 6 — `channelRuntime`, `isChannelLocked`, `isQuotaBlocked`, `markQuotaBlocked`, `resetChannelRuntime`, `acquireChannelLock`, `releaseChannelLock`, `syncChannel`; Task 7 — `buildClassificationStatus`, `runClassificationQueue`.
- Produces (`src/lib/youtube/jobs.ts`): `STALE_AFTER_MS = 12 h`, `STALE_TRIGGER_THROTTLE_MS = 10 min`, `startChannelSync(channelId: string): boolean`, `queueChannelSyncs(options?: { all?: boolean; now?: Date }): { queued: number; throttled: boolean }`, `kickClassification(): void`, `getClassificationStatus(): ClassificationStatus`, `approveClassification(): number`, `reconcileSyncStatuses(): void`, `waitForChannelJobs(): Promise<void>`.
- Produces (`src/lib/youtube/my-channel.ts`): `type MyChannelResult = { changed: boolean; addedChannelId: string | null }`, `reconcileMyChannel(): Promise<MyChannelResult>`.

- [ ] **Step 1: Write the failing tests**

Create `tests/channels/jobs.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import * as store from "@/lib/youtube/channel-store";
import {
  STALE_AFTER_MS,
  approveClassification,
  getClassificationStatus,
  queueChannelSyncs,
  reconcileSyncStatuses,
  startChannelSync,
  waitForChannelJobs,
} from "@/lib/youtube/jobs";
import { acquireChannelLock, markQuotaBlocked, releaseChannelLock, resetChannelRuntime } from "@/lib/youtube/runtime";
import { channelIdFor, createFakeYouTube, type FakeYouTube } from "./fake-youtube";

const A = channelIdFor("a");
const B = channelIdFor("b");
const NOW = new Date("2026-09-16T12:00:00.000Z");
let fake: FakeYouTube;

function follow(youtubeChannelId: string, lastSyncedAt: string | null): string {
  const { channel } = store.insertChannel({
    youtubeChannelId,
    title: youtubeChannelId.slice(0, 6),
    handle: null,
    avatarUrl: null,
    subscriberCount: null,
    videoCount: null,
  });
  if (lastSyncedAt) store.finishSync(channel.id, { medianViews: null, syncedAt: lastSyncedAt });
  return channel.id;
}

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM followed_channels");
  db.exec("DELETE FROM settings");
  setSetting("youtubeApiKey", "test-yt-key");
  setSetting("inspirationAutoClassify", "false");
  vi.stubEnv("OPENROUTER_API_KEY", "");
  resetChannelRuntime();
  fake = createFakeYouTube({
    channels: [
      { id: A, handle: "@a", title: "A" },
      { id: B, handle: "@b", title: "B" },
    ],
    videos: [
      { id: "vida0000001", channelId: A, publishedAt: "2026-08-01T00:00:00Z" },
      { id: "vidb0000001", channelId: B, publishedAt: "2026-08-02T00:00:00Z" },
    ],
  });
  vi.stubGlobal("fetch", fake.fetch);
});

afterEach(async () => {
  await waitForChannelJobs();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("startChannelSync", () => {
  it("starts a background sync once and refuses a second while it runs", async () => {
    const channelId = follow(A, null);

    expect(startChannelSync(channelId)).toBe(true);
    expect(startChannelSync(channelId)).toBe(false);
    await waitForChannelJobs();

    expect(store.getChannelListItem(channelId)).toMatchObject({ syncStatus: "idle", videoCount: 1 });
    expect(startChannelSync(channelId)).toBe(true);
  });
});

describe("queueChannelSyncs", () => {
  it("syncs only channels older than 12 hours, one after the other", async () => {
    const stale = follow(A, new Date(NOW.getTime() - STALE_AFTER_MS - 60_000).toISOString());
    const never = follow(B, null);
    const freshSyncedAt = new Date(NOW.getTime() - 60_000).toISOString();
    const fresh = follow(channelIdFor("c"), freshSyncedAt);

    expect(queueChannelSyncs({ now: NOW })).toEqual({ queued: 2, throttled: false });
    await waitForChannelJobs();

    expect(store.getChannelListItem(stale)?.videoCount).toBe(1);
    expect(store.getChannelListItem(never)?.videoCount).toBe(1);
    expect(store.getChannel(fresh)?.last_synced_at).toBe(freshSyncedAt);
    // Never-synced channels go first; B's calls all happen before A's first one.
    const playlists = fake.calls.filter((call) => call.resource === "playlistItems").map((call) => call.params.get("playlistId") ?? "");
    const lastB = playlists.map((playlistId) => playlistId.endsWith(B.slice(2))).lastIndexOf(true);
    const firstA = playlists.findIndex((playlistId) => playlistId.endsWith(A.slice(2)));
    expect(lastB).toBeGreaterThanOrEqual(0);
    expect(lastB).toBeLessThan(firstA);
  });

  it("is throttled for 10 minutes, « Tout actualiser » is not", async () => {
    follow(A, null);
    const b = follow(B, NOW.toISOString());

    expect(queueChannelSyncs({ now: NOW })).toEqual({ queued: 1, throttled: false });
    expect(queueChannelSyncs({ now: new Date(NOW.getTime() + 60_000) })).toEqual({ queued: 0, throttled: true });
    await waitForChannelJobs();

    expect(queueChannelSyncs({ all: true, now: new Date(NOW.getTime() + 120_000) })).toEqual({ queued: 2, throttled: false });
    await waitForChannelJobs();
    expect(store.getChannel(b)?.last_synced_at).not.toBe(NOW.toISOString());
  });

  it("does nothing while the quota is exhausted or without a YouTube key", () => {
    follow(A, null);
    markQuotaBlocked(NOW);
    expect(queueChannelSyncs({ now: NOW })).toEqual({ queued: 0, throttled: true });

    getDb().exec("DELETE FROM settings");
    vi.stubEnv("YOUTUBE_API_KEY", "");
    expect(queueChannelSyncs({ all: true, now: NOW })).toEqual({ queued: 0, throttled: false });
    expect(fake.calls).toHaveLength(0);
  });
});

describe("reconcileSyncStatuses", () => {
  it("resets a « syncing » status left behind by a restart, not a running one", () => {
    const orphan = follow(A, null);
    store.setSyncState(orphan, { status: "syncing" });
    const running = follow(B, null);
    store.setSyncState(running, { status: "syncing" });
    acquireChannelLock(running);

    reconcileSyncStatuses();

    expect(store.getChannel(orphan)?.sync_status).toBe("idle");
    expect(store.getChannel(running)?.sync_status).toBe("syncing");
    releaseChannelLock(running);
  });
});

describe("classification status", () => {
  it("reports pending thumbnails and approves them", async () => {
    const channelId = follow(A, null);
    store.upsertVideos(
      channelId,
      [
        {
          videoId: "pending0001",
          title: "En attente",
          publishedAt: "2026-08-01T00:00:00.000Z",
          durationSeconds: 600,
          viewCount: 1,
          likeCount: null,
          thumbnailUrl: "https://i.ytimg.com/vi/pending0001/mqdefault.jpg",
          liveBroadcastContent: "none",
        },
      ],
      "2026-09-01T00:00:00.000Z",
    );

    expect(getClassificationStatus()).toMatchObject({ enabled: false, hasKey: false, pending: 1, awaitingConfirmation: 0, running: false });
    expect(approveClassification()).toBe(1);
    await waitForChannelJobs();
    expect(store.getVideo("pending0001")?.thumb_type).toBeNull();
  });
});
```

Create `tests/channels/my-channel.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import * as store from "@/lib/youtube/channel-store";
import { waitForChannelJobs } from "@/lib/youtube/jobs";
import { reconcileMyChannel } from "@/lib/youtube/my-channel";
import { resetChannelRuntime } from "@/lib/youtube/runtime";
import { channelIdFor, createFakeYouTube, type FakeYouTube } from "./fake-youtube";

const MINE = channelIdFor("m");
const OTHER = channelIdFor("o");
let fake: FakeYouTube;

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM followed_channels");
  db.exec("DELETE FROM settings");
  setSetting("youtubeApiKey", "test-yt-key");
  setSetting("inspirationAutoClassify", "false");
  vi.stubEnv("OPENROUTER_API_KEY", "");
  resetChannelRuntime();
  fake = createFakeYouTube({
    channels: [
      { id: MINE, handle: "@machaine", title: "Ma chaîne" },
      { id: OTHER, handle: "@autre", title: "Autre chaîne" },
    ],
    videos: [{ id: "minevideo01", channelId: MINE, publishedAt: "2026-08-01T00:00:00Z" }],
  });
  vi.stubGlobal("fetch", fake.fetch);
});

afterEach(async () => {
  await waitForChannelJobs();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("reconcileMyChannel", () => {
  it("follows the channel set in Réglages → Ma chaîne and imports it", async () => {
    setSetting("youtubePlaylistId", "https://www.youtube.com/@machaine");

    const result = await reconcileMyChannel();
    expect(result.changed).toBe(true);
    expect(result.addedChannelId).not.toBeNull();
    await waitForChannelJobs();

    expect(store.listChannelItems()).toMatchObject([{ youtubeChannelId: MINE, isMine: true, videoCount: 1, syncStatus: "idle" }]);
  });

  it("does not ask YouTube again while the setting is unchanged", async () => {
    setSetting("youtubePlaylistId", "@machaine");
    await reconcileMyChannel();
    await waitForChannelJobs();
    const channelCalls = fake.count("channels");

    expect(await reconcileMyChannel()).toEqual({ changed: false, addedChannelId: null });
    expect(fake.count("channels")).toBe(channelCalls);
  });

  it("moves « Ma chaîne » when the setting changes and keeps following the old one", async () => {
    setSetting("youtubePlaylistId", "@machaine");
    await reconcileMyChannel();
    await waitForChannelJobs();

    setSetting("youtubePlaylistId", "@autre");
    expect((await reconcileMyChannel()).changed).toBe(true);
    await waitForChannelJobs();

    expect(store.listChannelItems().map((item) => [item.youtubeChannelId, item.isMine])).toEqual([
      [OTHER, true],
      [MINE, false],
    ]);
  });

  it("marks an already followed channel as mine without asking YouTube or adding it twice", async () => {
    store.insertChannel({ youtubeChannelId: OTHER, title: "Autre chaîne", handle: "@autre", avatarUrl: null, subscriberCount: null, videoCount: null });
    setSetting("youtubePlaylistId", OTHER);

    expect(await reconcileMyChannel()).toEqual({ changed: true, addedChannelId: null });
    expect(store.listChannelItems()).toMatchObject([{ youtubeChannelId: OTHER, isMine: true }]);
    expect(fake.count("channels")).toBe(0);
  });

  it("accepts the uploads playlist id older settings may hold", async () => {
    setSetting("youtubePlaylistId", `UU${MINE.slice(2)}`);

    await reconcileMyChannel();
    await waitForChannelJobs();

    expect(store.listChannelItems()[0]).toMatchObject({ youtubeChannelId: MINE, isMine: true });
  });

  it("clears « Ma chaîne » when the setting is emptied", async () => {
    setSetting("youtubePlaylistId", "@machaine");
    await reconcileMyChannel();
    await waitForChannelJobs();

    setSetting("youtubePlaylistId", "");
    expect(await reconcileMyChannel()).toEqual({ changed: true, addedChannelId: null });
    expect(store.listChannelItems()).toMatchObject([{ youtubeChannelId: MINE, isMine: false }]);
  });

  it("does nothing without a YouTube key", async () => {
    getDb().exec("DELETE FROM settings");
    vi.stubEnv("YOUTUBE_API_KEY", "");
    setSetting("youtubePlaylistId", "@machaine");

    expect(await reconcileMyChannel()).toEqual({ changed: false, addedChannelId: null });
    expect(fake.calls).toHaveLength(0);
    expect(store.listChannelItems()).toEqual([]);
  });

  it("keeps things as they are when YouTube fails", async () => {
    setSetting("youtubePlaylistId", "@machaine");
    fake.setQuotaAfter(0);

    expect(await reconcileMyChannel()).toEqual({ changed: false, addedChannelId: null });
    expect(store.listChannelItems()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/channels/jobs.test.ts tests/channels/my-channel.test.ts`
Expected: FAIL — unresolved `@/lib/youtube/jobs` and `@/lib/youtube/my-channel`.

- [ ] **Step 3: Write the job runner**

Create `src/lib/youtube/jobs.ts`:

```ts
import { getTypedSettings } from "@/lib/settings";
import * as store from "./channel-store";
import { buildClassificationStatus, runClassificationQueue } from "./classify";
import { channelRuntime, isChannelLocked, isQuotaBlocked } from "./runtime";
import { syncChannel } from "./sync";
import type { ClassificationStatus } from "./types";

/**
 * Fire-and-forget background work started by route handlers. Promises live on
 * the globalThis runtime (see runtime.ts) so later requests can observe them.
 */

export const STALE_AFTER_MS = 12 * 60 * 60 * 1000;
export const STALE_TRIGGER_THROTTLE_MS = 10 * 60 * 1000;

function logFailure(what: string, err: unknown) {
  console.error(`[channels] ${what}:`, err instanceof Error ? err.message : err);
}

export function kickClassification(): void {
  const runtime = channelRuntime();
  runtime.classificationRequested = true;
  if (runtime.classification) return;
  runtime.classification = (async () => {
    while (runtime.classificationRequested) {
      runtime.classificationRequested = false;
      await runClassificationQueue();
    }
  })()
    .catch((err) => logFailure("classification failed", err))
    .finally(() => {
      runtime.classification = null;
      if (runtime.classificationRequested) kickClassification();
    });
}

function runSync(channelId: string): Promise<void> {
  const runtime = channelRuntime();
  const job: Promise<void> = syncChannel(channelId)
    .then((outcome) => {
      if (outcome.status === "done") kickClassification();
      if (outcome.status === "quota") runtime.staleQueue.length = 0;
    })
    .catch((err) => logFailure(`sync ${channelId} failed`, err))
    .finally(() => {
      if (runtime.running.get(channelId) === job) runtime.running.delete(channelId);
    });
  runtime.running.set(channelId, job);
  return job;
}

/** Starts a background sync; false when this channel is already syncing. */
export function startChannelSync(channelId: string): boolean {
  if (isChannelLocked(channelId)) return false;
  void runSync(channelId);
  return true;
}

function drainQueue(): void {
  const runtime = channelRuntime();
  if (runtime.staleDrain) return;
  runtime.staleDrain = (async () => {
    while (runtime.staleQueue.length > 0) {
      const channelId = runtime.staleQueue.shift() as string;
      if (isChannelLocked(channelId) || !store.channelExists(channelId)) continue;
      await runSync(channelId);
    }
  })().finally(() => {
    runtime.staleDrain = null;
  });
}

/**
 * App-open trigger: queues channels last synced more than 12 hours ago
 * (throttled to once per 10 minutes, skipped while the quota is exhausted).
 * `all` (« Tout actualiser ») queues every channel. Syncs run one after the other.
 */
export function queueChannelSyncs(options: { all?: boolean; now?: Date } = {}): { queued: number; throttled: boolean } {
  const runtime = channelRuntime();
  const now = options.now ?? new Date();
  if (!getTypedSettings().youtubeApiKey) return { queued: 0, throttled: false };
  if (!options.all) {
    if (now.getTime() - runtime.lastStaleTriggerAt < STALE_TRIGGER_THROTTLE_MS || isQuotaBlocked(now)) {
      return { queued: 0, throttled: true };
    }
    runtime.lastStaleTriggerAt = now.getTime();
  }
  const candidates = options.all
    ? store.allChannelIds()
    : store.staleChannelIds(new Date(now.getTime() - STALE_AFTER_MS).toISOString());
  const added = candidates.filter((channelId) => !isChannelLocked(channelId) && !runtime.staleQueue.includes(channelId));
  runtime.staleQueue.push(...added);
  if (added.length > 0) drainQueue();
  return { queued: added.length, throttled: false };
}

export function getClassificationStatus(): ClassificationStatus {
  return buildClassificationStatus(channelRuntime().classification !== null);
}

/** « Lancer le classement »: approves every pending thumbnail and starts the worker. */
export function approveClassification(): number {
  const approved = store.approvePendingClassification();
  kickClassification();
  return approved;
}

/** A « syncing » status with no sync behind it (server restarted mid-sync) goes back to idle. */
export function reconcileSyncStatuses(): void {
  const runtime = channelRuntime();
  for (const channelId of store.syncingChannelIds()) {
    if (!isChannelLocked(channelId) && !runtime.running.has(channelId)) {
      store.setSyncState(channelId, { status: "idle", error: null });
    }
  }
}

/** Tests: resolves once no sync, queue or classification is running. */
export async function waitForChannelJobs(): Promise<void> {
  const runtime = channelRuntime();
  for (;;) {
    const pending: Promise<unknown>[] = [...runtime.running.values()];
    if (runtime.staleDrain) pending.push(runtime.staleDrain);
    if (runtime.classification) pending.push(runtime.classification);
    if (pending.length === 0) return;
    await Promise.allSettled(pending);
  }
}
```

- [ ] **Step 4: Write the « Ma chaîne » reconciliation**

Create `src/lib/youtube/my-channel.ts`:

```ts
import { getTypedSettings } from "@/lib/settings";
import { fetchChannelDetails, localChannelId, resolveChannelInput, YouTubeApiError } from "./api";
import * as store from "./channel-store";
import { startChannelSync } from "./jobs";
import { channelRuntime } from "./runtime";
import type { ChannelDetails } from "./types";

export type MyChannelResult = { changed: boolean; addedChannelId: string | null };

const UNCHANGED: MyChannelResult = { changed: false, addedChannelId: null };

/**
 * Keeps « Ma chaîne » in line with Réglages → Ma chaîne (youtubePlaylistId):
 * follows that channel (is_mine = 1, background import) and removes the flag
 * from any previous one, which stays followed. Handles and playlists are
 * resolved once per server process; channel ids need no request.
 */
export async function reconcileMyChannel(): Promise<MyChannelResult> {
  const { youtubeApiKey, youtubePlaylistId } = getTypedSettings();
  const input = youtubePlaylistId.trim();
  if (!input) return { changed: store.setMineChannel(null), addedChannelId: null };
  if (!youtubeApiKey) return UNCHANGED;

  const runtime = channelRuntime();
  try {
    let details: ChannelDetails | null = null;
    let youtubeChannelId: string | null;
    if (runtime.myChannel?.input === input) {
      youtubeChannelId = runtime.myChannel.youtubeChannelId;
    } else {
      youtubeChannelId = localChannelId(input);
      if (!youtubeChannelId) {
        const resolved = await resolveChannelInput(youtubeApiKey, input);
        details = resolved.status === "found" ? resolved.channel : null;
        youtubeChannelId = details?.youtubeChannelId ?? null;
      }
      runtime.myChannel = { input, youtubeChannelId };
    }
    if (!youtubeChannelId) return { changed: store.setMineChannel(null), addedChannelId: null };

    const existing = store.getChannelByYoutubeId(youtubeChannelId);
    if (existing) return { changed: store.setMineChannel(existing.id), addedChannelId: null };

    details ??= await fetchChannelDetails(youtubeApiKey, youtubeChannelId);
    if (!details) return UNCHANGED;
    // A newly followed channel shows « Synchronisation… » straight away.
    const { channel, inserted } = store.insertChannel(details, { syncStatus: "syncing" });
    const moved = store.setMineChannel(channel.id);
    if (inserted) startChannelSync(channel.id);
    return { changed: moved || inserted, addedChannelId: inserted ? channel.id : null };
  } catch (err) {
    if (err instanceof YouTubeApiError) {
      console.warn(`[channels] « Ma chaîne » non résolue : ${err.message}`);
      return UNCHANGED;
    }
    throw err;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/channels/jobs.test.ts tests/channels/my-channel.test.ts`
Expected: PASS.

- [ ] **Step 6: Type-check and lint**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/lib/youtube/jobs.ts src/lib/youtube/my-channel.ts tests/channels/jobs.test.ts tests/channels/my-channel.test.ts
```

Expected: `tsc` exits 0; no ESLint errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/youtube/jobs.ts src/lib/youtube/my-channel.ts tests/channels/jobs.test.ts tests/channels/my-channel.test.ts
git commit -m "feat(channels): background sync queue, classification kick and « Ma chaîne » follow" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Video list and « types qui marchent » queries

**Files:**
- Create: `src/lib/youtube/video-queries.ts`
- Test: `tests/channels/video-queries.test.ts`

**Interfaces:**
- Consumes: Task 1 — `recentCutoffIso`, `videoPerformance`; Task 2 — `isThumbType`, `summarizeTypes`, `type ThumbType`, `type TypeSummaryRow`, `UNCLASSIFIED_FILTER`, `type VideoQuery`, `type VideoListItem`, `type VideoListResponse`, `type VideoPeriod`; Task 3 — tables and `channel-store` (tests only).
- Produces (`src/lib/youtube/video-queries.ts`): `listVideos(query: VideoQuery, now?: Date): VideoListResponse`, `typesSummary(scope: string, now?: Date): TypeSummaryRow[]` (`scope`: `"all"`, `"mine"` or a followed channel id).

- [ ] **Step 1: Write the failing tests**

Create `tests/channels/video-queries.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import * as store from "@/lib/youtube/channel-store";
import type { ThumbType } from "@/lib/youtube/thumb-types";
import { DEFAULT_VIDEO_QUERY, type VideoQuery } from "@/lib/youtube/types";
import { listVideos, typesSummary } from "@/lib/youtube/video-queries";

const NOW = new Date("2026-09-16T12:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

let mineId: string;
let otherId: string;

function addVideo(channelId: string, videoId: string, days: number, views: number, type: ThumbType | null) {
  store.upsertVideos(
    channelId,
    [
      {
        videoId,
        title: `Titre ${videoId}`,
        publishedAt: daysAgo(days),
        durationSeconds: 600,
        viewCount: views,
        likeCount: null,
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        liveBroadcastContent: "none",
      },
    ],
    NOW.toISOString(),
  );
  if (type) store.setAiThumbType(videoId, type);
}

const ids = (query: Partial<VideoQuery>) =>
  listVideos({ ...DEFAULT_VIDEO_QUERY, limit: 100, ...query }, NOW).items.map((item) => item.videoId);

beforeEach(() => {
  getDb().exec("DELETE FROM followed_channels");
  mineId = store.insertChannel({ youtubeChannelId: `UC${"q".repeat(22)}`, title: "Ma chaîne", handle: null, avatarUrl: null, subscriberCount: null, videoCount: null }).channel.id;
  otherId = store.insertChannel({ youtubeChannelId: `UC${"r".repeat(22)}`, title: "Autre", handle: null, avatarUrl: null, subscriberCount: null, videoCount: null }).channel.id;
  store.setMineChannel(mineId);
  store.finishSync(mineId, { medianViews: 1_000, syncedAt: NOW.toISOString() });
  store.finishSync(otherId, { medianViews: 10_000, syncedAt: NOW.toISOString() });

  addVideo(mineId, "m-old-hit", 40, 9_000, "face_text"); // ×9
  addVideo(mineId, "m-old-mid", 100, 1_200, "face_text"); // ×1.2
  addVideo(mineId, "m-old-low", 200, 300, "versus"); // ×0.3
  addVideo(mineId, "m-recent", 2, 5_000, null); // recent
  addVideo(mineId, "m-year", 500, 2_000, "reaction"); // ×2
  addVideo(otherId, "o-hit", 20, 50_000, "face_text"); // ×5
  addVideo(otherId, "o-mid", 60, 10_000, null); // ×1
  addVideo(otherId, "o-new", 1, 900, "scene"); // recent
});

describe("listVideos", () => {
  it("sorts by score, recent videos last, newest first among them", () => {
    expect(ids({ sort: "score" })).toEqual(["m-old-hit", "o-hit", "m-year", "m-old-mid", "o-mid", "m-old-low", "o-new", "m-recent"]);
  });

  it("sorts by views and by date", () => {
    expect(ids({ sort: "views" })).toEqual(["o-hit", "o-mid", "m-old-hit", "m-recent", "m-year", "m-old-mid", "o-new", "m-old-low"]);
    expect(ids({ sort: "date" })).toEqual(["o-new", "m-recent", "o-hit", "m-old-hit", "o-mid", "m-old-mid", "m-old-low", "m-year"]);
  });

  it("returns each video with its channel and performance", () => {
    const { items } = listVideos({ ...DEFAULT_VIDEO_QUERY, sort: "date", limit: 100 }, NOW);
    expect(items.find((item) => item.videoId === "m-old-hit")).toEqual({
      videoId: "m-old-hit",
      channelId: mineId,
      channelTitle: "Ma chaîne",
      title: "Titre m-old-hit",
      publishedAt: daysAgo(40),
      durationSeconds: 600,
      viewCount: 9_000,
      thumbnailUrl: "https://i.ytimg.com/vi/m-old-hit/mqdefault.jpg",
      thumbType: "face_text",
      thumbTypeSource: "ai",
      performance: { kind: "scored", score: 9, band: "over" },
    });
    expect(items.find((item) => item.videoId === "m-recent")?.performance).toEqual({ kind: "recent", viewsPerDay: 2_500 });
    expect(items.find((item) => item.videoId === "m-old-low")?.performance).toEqual({ kind: "scored", score: 0.3, band: "under" });
  });

  it("filters by types, unclassified included", () => {
    expect(ids({ sort: "date", types: ["face_text"] })).toEqual(["o-hit", "m-old-hit", "m-old-mid"]);
    expect(ids({ sort: "date", types: ["versus", "none"] })).toEqual(["m-recent", "o-mid", "m-old-low"]);
  });

  it("filters by channel, period and title, escaping LIKE wildcards", () => {
    expect(ids({ sort: "date", channelId: otherId })).toEqual(["o-new", "o-hit", "o-mid"]);
    expect(ids({ sort: "date", period: "30d" })).toEqual(["o-new", "m-recent", "o-hit"]);
    expect(ids({ sort: "date", period: "12m" })).not.toContain("m-year");
    expect(ids({ sort: "date", period: "12m" })).toHaveLength(7);
    expect(ids({ sort: "date", q: "hit" })).toEqual(["o-hit", "m-old-hit"]);
    expect(ids({ q: "_" })).toEqual([]);
    expect(ids({ q: "%" })).toEqual([]);
  });

  it("pages with offset and limit and reports the total", () => {
    const page = listVideos({ ...DEFAULT_VIDEO_QUERY, sort: "date", offset: 2, limit: 3 }, NOW);
    expect(page.items.map((item) => item.videoId)).toEqual(["o-hit", "m-old-hit", "o-mid"]);
    expect(page).toMatchObject({ total: 8, offset: 2, limit: 3 });
  });
});

describe("typesSummary", () => {
  it("ranks types with at least 3 scored thumbnails across every channel", () => {
    const rows = typesSummary("all", NOW);
    expect(rows.map((row) => row.type)).toEqual(["face_text", "reaction", "versus", "scene"]);
    expect(rows[0]).toMatchObject({ enoughData: true, scoredCount: 3, medianScore: 5, best: { videoId: "m-old-hit", score: 9 } });
    expect(rows[3]).toMatchObject({ type: "scene", totalCount: 1, scoredCount: 0, enoughData: false });
  });

  it("narrows to « Ma chaîne » or to one channel", () => {
    expect(typesSummary("mine", NOW).find((row) => row.type === "face_text")).toMatchObject({ totalCount: 2, enoughData: false });
    expect(typesSummary(otherId, NOW).map((row) => row.type)).toEqual(["face_text", "scene"]);
    expect(typesSummary("unknown-channel", NOW)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/channels/video-queries.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/youtube/video-queries"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/youtube/video-queries.ts`:

```ts
import { getDb } from "@/lib/db";
import { recentCutoffIso, videoPerformance } from "./performance";
import { UNCLASSIFIED_FILTER, isThumbType, summarizeTypes, type TypeSummaryRow } from "./thumb-types";
import type { VideoListItem, VideoListResponse, VideoPeriod, VideoQuery } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS: Record<Exclude<VideoPeriod, "all">, number> = { "30d": 30, "12m": 365 };

type VideoQueryRow = {
  video_id: string;
  channel_id: string;
  channel_title: string;
  title: string;
  published_at: string;
  duration_seconds: number;
  view_count: number;
  thumbnail_url: string;
  thumb_type: string | null;
  thumb_type_source: "ai" | "manual" | null;
  median_views: number | null;
};

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

const ORDER_BY: Record<VideoQuery["sort"], string> = {
  score: "score DESC NULLS LAST, v.published_at DESC",
  views: "v.view_count DESC, v.published_at DESC",
  date: "v.published_at DESC",
};

export function listVideos(query: VideoQuery, now: Date = new Date()): VideoListResponse {
  const where: string[] = [];
  const params: Record<string, string | number> = { recentCutoff: recentCutoffIso(now) };

  if (query.channelId) {
    where.push("v.channel_id = @channelId");
    params.channelId = query.channelId;
  }
  if (query.period !== "all") {
    where.push("v.published_at >= @periodStart");
    params.periodStart = new Date(now.getTime() - PERIOD_DAYS[query.period] * DAY_MS).toISOString();
  }
  if (query.q) {
    where.push("v.title LIKE @q ESCAPE '\\'");
    params.q = `%${escapeLike(query.q)}%`;
  }
  if (query.types.length > 0) {
    const clauses: string[] = [];
    const named = query.types.filter(isThumbType);
    named.forEach((type, index) => {
      params[`type${index}`] = type;
    });
    if (named.length > 0) clauses.push(`v.thumb_type IN (${named.map((_, index) => `@type${index}`).join(", ")})`);
    if (query.types.includes(UNCLASSIFIED_FILTER)) clauses.push("v.thumb_type IS NULL");
    where.push(`(${clauses.join(" OR ")})`);
  }

  const from = `FROM channel_videos v JOIN followed_channels c ON c.id = v.channel_id ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`;
  const db = getDb();
  const { total } = db.prepare(`SELECT COUNT(*) AS total ${from}`).get(params) as { total: number };
  const rows = db
    .prepare(
      `SELECT v.video_id, v.channel_id, c.title AS channel_title, v.title, v.published_at, v.duration_seconds,
              v.view_count, v.thumbnail_url, v.thumb_type, v.thumb_type_source, c.median_views,
              CASE WHEN c.median_views > 0 AND v.published_at <= @recentCutoff
                   THEN CAST(v.view_count AS REAL) / c.median_views END AS score
       ${from}
       ORDER BY ${ORDER_BY[query.sort]}
       LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit: query.limit, offset: query.offset }) as VideoQueryRow[];

  const items: VideoListItem[] = rows.map((row) => ({
    videoId: row.video_id,
    channelId: row.channel_id,
    channelTitle: row.channel_title,
    title: row.title,
    publishedAt: row.published_at,
    durationSeconds: row.duration_seconds,
    viewCount: row.view_count,
    thumbnailUrl: row.thumbnail_url,
    thumbType: isThumbType(row.thumb_type) ? row.thumb_type : null,
    thumbTypeSource: row.thumb_type_source,
    performance: videoPerformance({ publishedAt: row.published_at, viewCount: row.view_count }, row.median_views, now),
  }));
  return { items, total, offset: query.offset, limit: query.limit };
}

/** « Les types qui marchent » for every channel ("all"), « Ma chaîne » ("mine") or one followed channel id. */
export function typesSummary(scope: string, now: Date = new Date()): TypeSummaryRow[] {
  const where = ["v.thumb_type IS NOT NULL"];
  const params: Record<string, string> = {};
  if (scope === "mine") {
    where.push("c.is_mine = 1");
  } else if (scope !== "all") {
    where.push("c.id = @channelId");
    params.channelId = scope;
  }
  const rows = getDb()
    .prepare(
      `SELECT v.video_id, v.title, v.thumbnail_url, v.thumb_type, v.view_count, v.published_at, c.median_views
       FROM channel_videos v JOIN followed_channels c ON c.id = v.channel_id
       WHERE ${where.join(" AND ")}`,
    )
    .all(params) as Array<Pick<VideoQueryRow, "video_id" | "title" | "thumbnail_url" | "thumb_type" | "view_count" | "published_at" | "median_views">>;

  return summarizeTypes(
    rows.flatMap((row) => {
      if (!isThumbType(row.thumb_type)) return [];
      const performance = videoPerformance({ publishedAt: row.published_at, viewCount: row.view_count }, row.median_views, now);
      return [
        {
          videoId: row.video_id,
          title: row.title,
          thumbnailUrl: row.thumbnail_url,
          thumbType: row.thumb_type,
          score: performance.kind === "scored" ? performance.score : null,
        },
      ];
    }),
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/channels/video-queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check and lint**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/lib/youtube/video-queries.ts tests/channels/video-queries.test.ts
```

Expected: `tsc` exits 0; no ESLint errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/youtube/video-queries.ts tests/channels/video-queries.test.ts
git commit -m "feat(channels): video list filters, sorts, pages and types summary" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
## Task 10: API routes

**Files:**
- Create: `src/lib/youtube/route-errors.ts`
- Create: `src/app/api/channels/route.ts`, `src/app/api/channels/[id]/route.ts`, `src/app/api/channels/[id]/sync/route.ts`, `src/app/api/channels/sync-stale/route.ts`, `src/app/api/channels/preview/route.ts`, `src/app/api/channels/classification/route.ts`, `src/app/api/channels/videos/route.ts`, `src/app/api/channels/videos/[videoId]/route.ts`, `src/app/api/channels/videos/[videoId]/use/route.ts`, `src/app/api/channels/types-summary/route.ts`
- Test: `tests/channels/channels-routes.test.ts`, `tests/channels/videos-routes.test.ts`

**Interfaces:**
- Consumes: Task 2 — `THUMB_TYPE_IDS`, `parseVideoQuery`, `libraryImageUrl`, `MISSING_YOUTUBE_KEY_ERROR`, response types; Task 3 — `channel-store`; Task 4 — `fetchChannelDetails`, `resolveChannelInput`, `YouTubeApiError`; Task 5 — `fetchBestThumbnail`, `saveThumbnailToLibrary`, `getSwipeFileTitle`, `type DownloadedThumbnail`; Task 8 — `startChannelSync`, `queueChannelSyncs`, `kickClassification`, `getClassificationStatus`, `approveClassification`, `reconcileSyncStatuses`, `reconcileMyChannel`, `waitForChannelJobs` (tests); Task 9 — `listVideos`, `typesSummary`.
- Produces (HTTP contract used by Tasks 11–16):
  - `GET /api/channels` → `200 ChannelsResponse` (reconciles « Ma chaîne » when a YouTube key exists, resets orphan `syncing` statuses).
  - `POST /api/channels` body `{ youtubeChannelId: "UC…" }` → `201 { channel: ChannelListItem, alreadyFollowed: false }` (background import started) · `200 { channel, alreadyFollowed: true }` · `400 { error }` (no key / invalid id) · `404 { error: "Chaîne introuvable" }` · `429`/`502` YouTube errors.
  - `DELETE /api/channels/[id]` → `200 { success: true }` · `404` · `409 { error }` for « Ma chaîne ».
  - `POST /api/channels/[id]/sync` → `202 { started: true, channel: ChannelListItem }` · `400` no key · `404` · `409 { error: "Synchronisation déjà en cours" }`.
  - `POST /api/channels/sync-stale` body `{}` or `{ all: true }` (body optional) → `202 { queued: number, throttled: boolean }`.
  - `POST /api/channels/preview` body `{ input: string }` → `200 { channel: ChannelPreview }` · `400` (no key / empty input) · `404 { error: "Chaîne introuvable" }` · `429 { error: "Quota YouTube atteint — réessaie demain" }` · `502`.
  - `POST /api/channels/classification` body `{ action: "approve" }` → `200 { approved: number, classification: ClassificationStatus }` · `400`.
  - `GET /api/channels/videos?sort&types&channel&period&q&offset&limit` → `200 VideoListResponse`.
  - `PATCH /api/channels/videos/[videoId]` body `{ thumbType }` → `200 { videoId, thumbType, thumbTypeSource: "manual" }` · `400` · `404`.
  - `POST /api/channels/videos/[videoId]/use` → `201 UseVideoResponse` (new copy) · `200 UseVideoResponse` (existing copy reused) · `404` (unknown video, or « Miniature introuvable sur YouTube ») · `502`.
  - `GET /api/channels/types-summary?scope=all|mine|<channelId>` → `200 TypesSummaryResponse`.
  - `src/lib/youtube/route-errors.ts`: `missingYouTubeKeyResponse(): NextResponse`, `youtubeErrorResponse(err: unknown): NextResponse`.

- [ ] **Step 1: Check the route folder is free**

Run: `ls src/app/api/channels 2>/dev/null || echo "no channels routes yet"`
Expected: `no channels routes yet`.

- [ ] **Step 2: Write the failing tests**

Create `tests/channels/channels-routes.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE as unfollowChannel } from "@/app/api/channels/[id]/route";
import { POST as syncOne } from "@/app/api/channels/[id]/sync/route";
import { POST as classificationAction } from "@/app/api/channels/classification/route";
import { POST as previewChannel } from "@/app/api/channels/preview/route";
import { GET as listChannels, POST as followChannel } from "@/app/api/channels/route";
import { POST as syncStale } from "@/app/api/channels/sync-stale/route";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import * as store from "@/lib/youtube/channel-store";
import { waitForChannelJobs } from "@/lib/youtube/jobs";
import { acquireChannelLock, releaseChannelLock, resetChannelRuntime } from "@/lib/youtube/runtime";
import type { ChannelDetails, ChannelsResponse } from "@/lib/youtube/types";
import { channelIdFor, createFakeYouTube, type FakeYouTube } from "./fake-youtube";

const TIERCE = channelIdFor("t");
const TIERCE_DETAILS: ChannelDetails = {
  youtubeChannelId: TIERCE,
  title: "Chaîne tierce",
  handle: "@tierce",
  avatarUrl: null,
  subscriberCount: 4200,
  videoCount: 2,
};
let fake: FakeYouTube;

const jsonRequest = (url: string, method: string, body?: unknown) =>
  new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM followed_channels");
  db.exec("DELETE FROM settings");
  setSetting("youtubeApiKey", "test-yt-key");
  setSetting("inspirationAutoClassify", "false");
  vi.stubEnv("OPENROUTER_API_KEY", "");
  resetChannelRuntime();
  fake = createFakeYouTube({
    channels: [{ id: TIERCE, handle: "@tierce", title: "Chaîne tierce", subscribers: 4200 }],
    videos: [
      { id: "tiercevid01", channelId: TIERCE, publishedAt: "2026-08-01T00:00:00Z" },
      { id: "tiercevid02", channelId: TIERCE, publishedAt: "2026-08-10T00:00:00Z" },
    ],
  });
  vi.stubGlobal("fetch", fake.fetch);
});

afterEach(async () => {
  await waitForChannelJobs();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GET /api/channels", () => {
  it("says YouTube is not configured and calls nothing without a key", async () => {
    getDb().exec("DELETE FROM settings");
    vi.stubEnv("YOUTUBE_API_KEY", "");

    const res = await listChannels();

    expect(res.status).toBe(200);
    const body = (await res.json()) as ChannelsResponse;
    expect(body.youtubeConfigured).toBe(false);
    expect(body.channels).toEqual([]);
    expect(body.classification).toMatchObject({ pending: 0, awaitingConfirmation: 0, modelLabel: "Gemini 2.5 Flash Lite" });
    expect(fake.calls).toHaveLength(0);
  });
});

describe("POST /api/channels/preview", () => {
  const url = "http://localhost/api/channels/preview";

  it("previews a channel before following it", async () => {
    const res = await previewChannel(jsonRequest(url, "POST", { input: "https://www.youtube.com/@tierce" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      channel: {
        youtubeChannelId: TIERCE,
        title: "Chaîne tierce",
        handle: "@tierce",
        avatarUrl: `https://yt3.example/${TIERCE}.jpg`,
        subscriberCount: 4200,
        videoCount: 2,
        alreadyFollowed: false,
      },
    });
  });

  it("answers 404 for an unknown channel and 400 for an empty input", async () => {
    const unknown = await previewChannel(jsonRequest(url, "POST", { input: "@inconnue" }));
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: "Chaîne introuvable" });
    expect((await previewChannel(jsonRequest(url, "POST", { input: "   " }))).status).toBe(400);
  });

  it("answers 429 when the quota is exhausted and 400 without a key", async () => {
    fake.setQuotaAfter(0);
    const quota = await previewChannel(jsonRequest(url, "POST", { input: "@tierce" }));
    expect(quota.status).toBe(429);
    expect(await quota.json()).toEqual({ error: "Quota YouTube atteint — réessaie demain" });

    getDb().exec("DELETE FROM settings");
    vi.stubEnv("YOUTUBE_API_KEY", "");
    const noKey = await previewChannel(jsonRequest(url, "POST", { input: "@tierce" }));
    expect(noKey.status).toBe(400);
    expect(await noKey.json()).toEqual({ error: "Ajoute ta clé YouTube dans Réglages → Connexions" });
  });
});

describe("POST /api/channels", () => {
  const url = "http://localhost/api/channels";

  it("follows a channel, imports it in the background and never follows it twice", async () => {
    const res = await followChannel(jsonRequest(url, "POST", { youtubeChannelId: TIERCE }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      alreadyFollowed: false,
      channel: { youtubeChannelId: TIERCE, title: "Chaîne tierce", syncStatus: "syncing", isMine: false },
    });

    await waitForChannelJobs();
    const list = (await (await listChannels()).json()) as ChannelsResponse;
    expect(list.channels).toMatchObject([{ youtubeChannelId: TIERCE, syncStatus: "idle", videoCount: 2 }]);

    const again = await followChannel(jsonRequest(url, "POST", { youtubeChannelId: TIERCE }));
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ alreadyFollowed: true, channel: { youtubeChannelId: TIERCE } });
  });

  it("rejects an invalid id and an unknown channel", async () => {
    expect((await followChannel(jsonRequest(url, "POST", { youtubeChannelId: "@tierce" }))).status).toBe(400);
    expect((await followChannel(jsonRequest(url, "POST", { youtubeChannelId: channelIdFor("x") }))).status).toBe(404);
  });
});

describe("DELETE /api/channels/[id]", () => {
  it("unfollows a channel with its videos", async () => {
    const { channel } = store.insertChannel(TIERCE_DETAILS);
    const request = () => new Request(`http://localhost/api/channels/${channel.id}`, { method: "DELETE" });

    const res = await unfollowChannel(request(), idParams(channel.id));
    expect(res.status).toBe(200);
    expect(store.getChannel(channel.id)).toBeNull();
    expect((await unfollowChannel(request(), idParams(channel.id))).status).toBe(404);
  });

  it("refuses to unfollow « Ma chaîne »", async () => {
    const { channel } = store.insertChannel(TIERCE_DETAILS, { isMine: true });

    const res = await unfollowChannel(new Request(`http://localhost/api/channels/${channel.id}`, { method: "DELETE" }), idParams(channel.id));

    expect(res.status).toBe(409);
    expect(store.getChannel(channel.id)).not.toBeNull();
  });
});

describe("POST /api/channels/[id]/sync", () => {
  it("starts a sync, refuses one already running and ignores unknown channels", async () => {
    const { channel } = store.insertChannel(TIERCE_DETAILS);
    const request = () => new Request(`http://localhost/api/channels/${channel.id}/sync`, { method: "POST" });

    acquireChannelLock(channel.id);
    expect((await syncOne(request(), idParams(channel.id))).status).toBe(409);
    releaseChannelLock(channel.id);

    const started = await syncOne(request(), idParams(channel.id));
    expect(started.status).toBe(202);
    expect(await started.json()).toMatchObject({ started: true, channel: { id: channel.id, syncStatus: "syncing" } });
    await waitForChannelJobs();
    expect(store.getChannelListItem(channel.id)).toMatchObject({ syncStatus: "idle", videoCount: 2 });

    expect((await syncOne(request(), idParams("unknown-channel"))).status).toBe(404);
  });
});

describe("POST /api/channels/sync-stale", () => {
  const url = "http://localhost/api/channels/sync-stale";

  it("queues stale channels, is then throttled, and « all » is not", async () => {
    store.insertChannel(TIERCE_DETAILS);

    const first = await syncStale(jsonRequest(url, "POST", {}));
    expect(first.status).toBe(202);
    expect(await first.json()).toEqual({ queued: 1, throttled: false });
    expect(await (await syncStale(jsonRequest(url, "POST", {}))).json()).toEqual({ queued: 0, throttled: true });

    await waitForChannelJobs();
    expect(await (await syncStale(jsonRequest(url, "POST", { all: true }))).json()).toEqual({ queued: 1, throttled: false });
  });

  it("accepts a request without a body", async () => {
    expect((await syncStale(new Request(url, { method: "POST" }))).status).toBe(202);
  });
});

describe("POST /api/channels/classification", () => {
  it("approves every pending thumbnail", async () => {
    const { channel } = store.insertChannel(TIERCE_DETAILS);
    store.upsertVideos(
      channel.id,
      [
        {
          videoId: "pending0001",
          title: "En attente",
          publishedAt: "2026-08-01T00:00:00.000Z",
          durationSeconds: 600,
          viewCount: 1,
          likeCount: null,
          thumbnailUrl: "https://i.ytimg.com/vi/pending0001/mqdefault.jpg",
          liveBroadcastContent: "none",
        },
      ],
      "2026-09-01T00:00:00.000Z",
    );
    const url = "http://localhost/api/channels/classification";

    const res = await classificationAction(jsonRequest(url, "POST", { action: "approve" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ approved: 1, classification: { pending: 1 } });
    expect((await classificationAction(jsonRequest(url, "POST", { action: "nope" }))).status).toBe(400);
  });
});
```

Create `tests/channels/videos-routes.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as typesSummaryRoute } from "@/app/api/channels/types-summary/route";
import { PATCH as setVideoType } from "@/app/api/channels/videos/[videoId]/route";
import { POST as useVideo } from "@/app/api/channels/videos/[videoId]/use/route";
import { GET as listVideosRoute } from "@/app/api/channels/videos/route";
import { getDb } from "@/lib/db";
import * as store from "@/lib/youtube/channel-store";
import { getSwipeFileTitle } from "@/lib/youtube/thumbnails";
import type { TypesSummaryResponse, UseVideoResponse, VideoListResponse } from "@/lib/youtube/types";
import { createFakeYouTube, type FakeYouTube } from "./fake-youtube";

const DAY = 86_400_000;
let fake: FakeYouTube;

const videoParams = (videoId: string) => ({ params: Promise.resolve({ videoId }) });
const patch = (videoId: string, body: unknown) =>
  new Request(`http://localhost/api/channels/videos/${videoId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const use = (videoId: string) => new Request(`http://localhost/api/channels/videos/${videoId}/use`, { method: "POST" });

function video(videoId: string, days: number, viewCount: number) {
  return {
    videoId,
    title: `Vidéo ${videoId}`,
    publishedAt: new Date(Date.now() - days * DAY).toISOString(),
    durationSeconds: 600,
    viewCount,
    likeCount: null,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    liveBroadcastContent: "none",
  };
}

beforeEach(() => {
  getDb().exec("DELETE FROM followed_channels");
  const channelId = store.insertChannel(
    { youtubeChannelId: `UC${"w".repeat(22)}`, title: "Ma chaîne", handle: null, avatarUrl: null, subscriberCount: null, videoCount: null },
    { isMine: true },
  ).channel.id;
  store.finishSync(channelId, { medianViews: 1000, syncedAt: new Date().toISOString() });
  store.upsertVideos(channelId, [video("routevid001", 30, 5000), video("routevid002", 60, 800), video("routevid003", 90, 3000)], new Date().toISOString());
  store.setAiThumbType("routevid001", "face_text");
  fake = createFakeYouTube({ thumbnails: { routevid001: ["hqdefault", "mqdefault"] } });
  vi.stubGlobal("fetch", fake.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/channels/videos", () => {
  it("applies filters, sort and page window from the query string", async () => {
    const res = listVideosRoute(new Request("http://localhost/api/channels/videos?sort=views&types=face_text,none&limit=2"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as VideoListResponse;
    expect(body.total).toBe(3);
    expect(body.limit).toBe(2);
    expect(body.items.map((item) => item.videoId)).toEqual(["routevid001", "routevid003"]);
  });

  it("falls back to the defaults on unknown values", async () => {
    const res = listVideosRoute(new Request("http://localhost/api/channels/videos?sort=bogus&period=forever&limit=abc"));
    const body = (await res.json()) as VideoListResponse;
    expect(body.limit).toBe(60);
    expect(body.items.map((item) => item.videoId)).toEqual(["routevid001", "routevid003", "routevid002"]);
  });
});

describe("PATCH /api/channels/videos/[videoId]", () => {
  it("stores a manual type", async () => {
    const res = await setVideoType(patch("routevid001", { thumbType: "versus" }), videoParams("routevid001"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ videoId: "routevid001", thumbType: "versus", thumbTypeSource: "manual" });
    expect(store.getVideo("routevid001")).toMatchObject({ thumb_type: "versus", thumb_type_source: "manual" });
  });

  it("rejects an unknown type or video", async () => {
    expect((await setVideoType(patch("routevid001", { thumbType: "banana" }), videoParams("routevid001"))).status).toBe(400);
    expect((await setVideoType(patch("nope", { thumbType: "versus" }), videoParams("nope"))).status).toBe(404);
  });
});

describe("POST /api/channels/videos/[videoId]/use", () => {
  it("copies the best thumbnail into the library once, titled like the video", async () => {
    const first = await useVideo(use("routevid001"), videoParams("routevid001"));
    expect(first.status).toBe(201);
    const copy = (await first.json()) as UseVideoResponse;
    expect(copy).toEqual({
      swipeFileId: expect.any(String),
      imageUrl: `/api/swipe-files/image?f=${copy.swipeFileId}`,
      label: "Vidéo routevid001",
    });
    expect(getSwipeFileTitle(copy.swipeFileId)).toBe("Vidéo routevid001");
    expect(store.getVideo("routevid001")?.swipe_file_id).toBe(copy.swipeFileId);

    const downloads = fake.fetch.mock.calls.length;
    const second = await useVideo(use("routevid001"), videoParams("routevid001"));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(copy);
    expect(fake.fetch.mock.calls.length).toBe(downloads);
  });

  it("answers 404 for an unknown video or a thumbnail YouTube does not serve", async () => {
    expect((await useVideo(use("nope"), videoParams("nope"))).status).toBe(404);
    const missing = await useVideo(use("routevid002"), videoParams("routevid002"));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "Miniature introuvable sur YouTube" });
  });
});

describe("GET /api/channels/types-summary", () => {
  it("summarizes the requested scope", async () => {
    store.setAiThumbType("routevid002", "face_text");
    store.setAiThumbType("routevid003", "face_text");

    const mine = (await typesSummaryRoute(new Request("http://localhost/api/channels/types-summary?scope=mine")).json()) as TypesSummaryResponse;
    expect(mine.rows).toMatchObject([{ type: "face_text", totalCount: 3, scoredCount: 3, enoughData: true, medianScore: 3 }]);

    const unknown = (await typesSummaryRoute(new Request("http://localhost/api/channels/types-summary?scope=unknown")).json()) as TypesSummaryResponse;
    expect(unknown.rows).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/channels/channels-routes.test.ts tests/channels/videos-routes.test.ts`
Expected: FAIL — unresolved `@/app/api/channels/…` imports.

- [ ] **Step 4: Write the shared error responses**

Create `src/lib/youtube/route-errors.ts`:

```ts
import { NextResponse } from "next/server";
import { YouTubeApiError } from "./api";
import { MISSING_YOUTUBE_KEY_ERROR } from "./types";

export function missingYouTubeKeyResponse(): NextResponse {
  return NextResponse.json({ error: MISSING_YOUTUBE_KEY_ERROR }, { status: 400 });
}

/** YouTube failures as short French messages; never includes the API key. */
export function youtubeErrorResponse(err: unknown): NextResponse {
  if (err instanceof YouTubeApiError) {
    if (err.isQuota) return NextResponse.json({ error: "Quota YouTube atteint — réessaie demain" }, { status: 429 });
    if (err.status === 0) return NextResponse.json({ error: "YouTube injoignable, réessaie" }, { status: 502 });
    if (err.status === 400 || err.status === 403) {
      return NextResponse.json({ error: "YouTube a refusé la clé — vérifie-la dans Réglages → Connexions" }, { status: 502 });
    }
    return NextResponse.json({ error: "YouTube ne répond pas correctement, réessaie" }, { status: 502 });
  }
  console.error("[channels] unexpected error", err);
  return NextResponse.json({ error: "Erreur inattendue" }, { status: 500 });
}
```

- [ ] **Step 5: Write the channel routes**

Create `src/app/api/channels/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getTypedSettings } from "@/lib/settings";
import { fetchChannelDetails } from "@/lib/youtube/api";
import * as store from "@/lib/youtube/channel-store";
import { getClassificationStatus, reconcileSyncStatuses, startChannelSync } from "@/lib/youtube/jobs";
import { reconcileMyChannel } from "@/lib/youtube/my-channel";
import { missingYouTubeKeyResponse, youtubeErrorResponse } from "@/lib/youtube/route-errors";
import type { ChannelDetails, ChannelsResponse } from "@/lib/youtube/types";

export const runtime = "nodejs";

const FollowSchema = z.object({ youtubeChannelId: z.string().regex(/^UC[\w-]{20,}$/) });

export async function GET() {
  const youtubeConfigured = Boolean(getTypedSettings().youtubeApiKey);
  if (youtubeConfigured) {
    try {
      await reconcileMyChannel();
    } catch (err) {
      console.error("[channels] « Ma chaîne »:", err);
    }
  }
  reconcileSyncStatuses();
  const body: ChannelsResponse = {
    youtubeConfigured,
    channels: store.listChannelItems(),
    classification: getClassificationStatus(),
  };
  return NextResponse.json(body);
}

export async function POST(request: Request) {
  const apiKey = getTypedSettings().youtubeApiKey;
  if (!apiKey) return missingYouTubeKeyResponse();
  const parsed = FollowSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Identifiant de chaîne invalide" }, { status: 400 });

  const existing = store.getChannelByYoutubeId(parsed.data.youtubeChannelId);
  if (existing) return NextResponse.json({ channel: store.getChannelListItem(existing.id), alreadyFollowed: true });

  let details: ChannelDetails | null;
  try {
    details = await fetchChannelDetails(apiKey, parsed.data.youtubeChannelId);
  } catch (err) {
    return youtubeErrorResponse(err);
  }
  if (!details) return NextResponse.json({ error: "Chaîne introuvable" }, { status: 404 });

  const { channel, inserted } = store.insertChannel(details, { syncStatus: "syncing" });
  if (inserted) startChannelSync(channel.id);
  return NextResponse.json(
    { channel: store.getChannelListItem(channel.id), alreadyFollowed: !inserted },
    { status: inserted ? 201 : 200 },
  );
}
```

Create `src/app/api/channels/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import * as store from "@/lib/youtube/channel-store";

export const runtime = "nodejs";

/** « Ne plus suivre »: the channel and its videos go; library copies stay. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const channel = store.getChannel(id);
  if (!channel) return NextResponse.json({ error: "Chaîne inconnue" }, { status: 404 });
  if (channel.is_mine === 1) {
    return NextResponse.json({ error: "« Ma chaîne » se change dans Réglages → Ma chaîne" }, { status: 409 });
  }
  store.deleteChannel(id);
  return NextResponse.json({ success: true });
}
```

Create `src/app/api/channels/[id]/sync/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getTypedSettings } from "@/lib/settings";
import * as store from "@/lib/youtube/channel-store";
import { startChannelSync } from "@/lib/youtube/jobs";
import { missingYouTubeKeyResponse } from "@/lib/youtube/route-errors";

export const runtime = "nodejs";

/** « Actualiser » / « Réessayer ». */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getTypedSettings().youtubeApiKey) return missingYouTubeKeyResponse();
  if (!store.channelExists(id)) return NextResponse.json({ error: "Chaîne inconnue" }, { status: 404 });
  if (!startChannelSync(id)) return NextResponse.json({ error: "Synchronisation déjà en cours" }, { status: 409 });
  return NextResponse.json({ started: true, channel: store.getChannelListItem(id) }, { status: 202 });
}
```

Create `src/app/api/channels/sync-stale/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getTypedSettings } from "@/lib/settings";
import { kickClassification, queueChannelSyncs } from "@/lib/youtube/jobs";
import { reconcileMyChannel } from "@/lib/youtube/my-channel";

export const runtime = "nodejs";

const Schema = z.object({ all: z.boolean().optional() });

/** Called once per app load (ChannelSyncTrigger), and with { all: true } by « Tout actualiser ». */
export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => ({})));
  const all = parsed.success && parsed.data.all === true;
  if (getTypedSettings().youtubeApiKey) {
    try {
      await reconcileMyChannel();
    } catch (err) {
      console.error("[channels] « Ma chaîne »:", err);
    }
  }
  const result = queueChannelSyncs({ all });
  if (result.queued > 0) console.info(`[channels] ${result.queued} chaîne(s) en file de synchronisation`);
  kickClassification();
  return NextResponse.json(result, { status: 202 });
}
```

Create `src/app/api/channels/preview/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getTypedSettings } from "@/lib/settings";
import { resolveChannelInput } from "@/lib/youtube/api";
import * as store from "@/lib/youtube/channel-store";
import { missingYouTubeKeyResponse, youtubeErrorResponse } from "@/lib/youtube/route-errors";
import type { ChannelPreview } from "@/lib/youtube/types";

export const runtime = "nodejs";

const PreviewSchema = z.object({ input: z.string().trim().min(1).max(300) });

export async function POST(request: Request) {
  const apiKey = getTypedSettings().youtubeApiKey;
  if (!apiKey) return missingYouTubeKeyResponse();
  const parsed = PreviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Colle l'URL, le @handle ou l'identifiant d'une chaîne" }, { status: 400 });
  }
  try {
    const resolved = await resolveChannelInput(apiKey, parsed.data.input);
    if (resolved.status === "not-found") return NextResponse.json({ error: "Chaîne introuvable" }, { status: 404 });
    const channel: ChannelPreview = {
      ...resolved.channel,
      alreadyFollowed: store.getChannelByYoutubeId(resolved.channel.youtubeChannelId) !== null,
    };
    return NextResponse.json({ channel });
  } catch (err) {
    return youtubeErrorResponse(err);
  }
}
```

Create `src/app/api/channels/classification/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { approveClassification, getClassificationStatus } from "@/lib/youtube/jobs";

export const runtime = "nodejs";

const Schema = z.object({ action: z.literal("approve") });

/** « Lancer le classement » after the > 200 thumbnails confirmation. */
export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  const approved = approveClassification();
  return NextResponse.json({ approved, classification: getClassificationStatus() });
}
```

- [ ] **Step 6: Write the video routes**

Create `src/app/api/channels/videos/route.ts`:

```ts
import { NextResponse } from "next/server";
import { parseVideoQuery } from "@/lib/youtube/types";
import { listVideos } from "@/lib/youtube/video-queries";

export const runtime = "nodejs";

export function GET(request: Request) {
  return NextResponse.json(listVideos(parseVideoQuery(new URL(request.url).searchParams)));
}
```

Create `src/app/api/channels/videos/[videoId]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import * as store from "@/lib/youtube/channel-store";
import { THUMB_TYPE_IDS } from "@/lib/youtube/thumb-types";

export const runtime = "nodejs";

const Schema = z.object({ thumbType: z.enum(THUMB_TYPE_IDS) });

/** Manual type: thumb_type_source = manual, never rewritten by the AI. */
export async function PATCH(request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  const { videoId } = await params;
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Type de miniature inconnu" }, { status: 400 });
  if (!store.setManualThumbType(videoId, parsed.data.thumbType)) {
    return NextResponse.json({ error: "Vidéo inconnue" }, { status: 404 });
  }
  return NextResponse.json({ videoId, thumbType: parsed.data.thumbType, thumbTypeSource: "manual" });
}
```

Create `src/app/api/channels/videos/[videoId]/use/route.ts`:

```ts
import { NextResponse } from "next/server";
import * as store from "@/lib/youtube/channel-store";
import {
  fetchBestThumbnail,
  getSwipeFileTitle,
  saveThumbnailToLibrary,
  type DownloadedThumbnail,
} from "@/lib/youtube/thumbnails";
import { libraryImageUrl, type UseVideoResponse } from "@/lib/youtube/types";

export const runtime = "nodejs";

/** « Utiliser comme référence »: copies the thumbnail into the library (once) and returns its library URL. */
export async function POST(_request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  const { videoId } = await params;
  const video = store.getVideo(videoId);
  if (!video) return NextResponse.json({ error: "Vidéo inconnue" }, { status: 404 });

  if (video.swipe_file_id) {
    const title = getSwipeFileTitle(video.swipe_file_id);
    if (title !== null) {
      const existing: UseVideoResponse = {
        swipeFileId: video.swipe_file_id,
        imageUrl: libraryImageUrl(video.swipe_file_id),
        label: title,
      };
      return NextResponse.json(existing);
    }
  }

  let thumbnail: DownloadedThumbnail | null;
  try {
    thumbnail = await fetchBestThumbnail(videoId);
  } catch {
    return NextResponse.json({ error: "YouTube injoignable, réessaie" }, { status: 502 });
  }
  if (!thumbnail) return NextResponse.json({ error: "Miniature introuvable sur YouTube" }, { status: 404 });

  const swipeFileId = saveThumbnailToLibrary(video.title, thumbnail);
  store.setVideoSwipeFile(videoId, swipeFileId);
  const created: UseVideoResponse = { swipeFileId, imageUrl: libraryImageUrl(swipeFileId), label: video.title };
  return NextResponse.json(created, { status: 201 });
}
```

Create `src/app/api/channels/types-summary/route.ts`:

```ts
import { NextResponse } from "next/server";
import type { TypesSummaryResponse } from "@/lib/youtube/types";
import { typesSummary } from "@/lib/youtube/video-queries";

export const runtime = "nodejs";

export function GET(request: Request) {
  const scope = new URL(request.url).searchParams.get("scope")?.trim() || "all";
  const body: TypesSummaryResponse = { rows: typesSummary(scope) };
  return NextResponse.json(body);
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/channels/channels-routes.test.ts tests/channels/videos-routes.test.ts`
Expected: PASS.

- [ ] **Step 8: Run the whole suite, type-check and lint**

```bash
./node_modules/.bin/vitest run
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/lib/youtube/route-errors.ts src/app/api/channels tests/channels/channels-routes.test.ts tests/channels/videos-routes.test.ts
```

Expected: every test passes; `tsc` exits 0 (if errors appear only under `.next/types`, delete `.next/types .next/dev/types` and re-run); no ESLint errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/youtube/route-errors.ts src/app/api/channels tests/channels/channels-routes.test.ts tests/channels/videos-routes.test.ts
git commit -m "feat(channels): /api/channels routes for follow, sync, videos, types and library copy" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
## Task 11: Client foundations — formatting, API client, polling hook, app-open trigger, demo data

**Files:**
- Create: `src/components/library/followed-channels/view.ts`, `src/components/library/followed-channels/api.ts`, `src/components/library/followed-channels/useFollowedChannels.ts`, `src/components/ChannelSyncTrigger.tsx`, `scripts/seed-followed-channels.mjs`
- Modify: `src/app/layout.tsx` (re-read first)
- Test: `tests/channels/view.test.ts`

**Interfaces:**
- Consumes: Task 1 — `type VideoPerformance`; Task 2 — `thumbTypeLabel`, `type ThumbType`, `type ThumbTypeFilter`, `QUOTA_SYNC_ERROR`, `videoQueryToSearch`, response types; Task 10 — the HTTP contract.
- Produces (`src/components/library/followed-channels/view.ts`, pure):
  - `formatCount(value: number): string` (« 1 240 »), `formatCompact(value: number): string`, `formatViews(views: number): string` (« 12 k vues »), `formatViewsPerDay(views: number): string` (« 850 vues/j »), `formatSubscribers(count: number | null): string`, `formatScore(score: number): string` (« ×0,4 »), `formatUsd(amount: number): string` (« 0,10 $ »)
  - `formatRelativeTime(iso: string, now: Date): string` (« il y a 2 h »), `formatPublishedDate(iso: string): string` (« 12 sept. 2026 »)
  - `channelStatusLabel(channel: Pick<ChannelListItem, "syncStatus" | "syncError" | "lastSyncedAt" | "videoCount">, now: Date): string`
  - `type PerformanceBadge = { label: string; hint: string; tone: "over" | "neutral" | "under" | "recent" }`, `PERFORMANCE_BADGE_CLASSES: Record<PerformanceBadge["tone"], string>`, `performanceBadge(performance: VideoPerformance): PerformanceBadge | null`
  - `typesFilterLabel(types: readonly ThumbTypeFilter[]): string`, `toggleFilterValue<T extends string>(values: readonly T[], value: T, checked: boolean): T[]`
  - `channelsDataVersion(data: ChannelsResponse): string`
- Produces (`src/components/library/followed-channels/api.ts`): `class ApiError extends Error { status: number }`, `channelsApi` with `list()`, `preview(input)`, `follow(youtubeChannelId)`, `unfollow(channelId)`, `sync(channelId)`, `syncAll()`, `videos(query: Partial<VideoQuery>)`, `setType(videoId, thumbType)`, `use(videoId)`, `typesSummary(scope)`, `approveClassification()` — each resolves with the route's JSON body or throws `ApiError` with the route's French `error`.
- Produces (`src/components/library/followed-channels/useFollowedChannels.ts`): `CHANNELS_POLL_MS = 3000`, `useFollowedChannels(): { data: ChannelsResponse | null; error: string | null; reload: () => Promise<void>; version: string }` (polls while a channel syncs or the classification runs; reloads on `youtube-channel-saved`).
- Produces: `src/components/ChannelSyncTrigger.tsx` default export (renders nothing), mounted once in the root layout.
- Produces: `scripts/seed-followed-channels.mjs <throwaway-db-path>` — demo channels `seed-mine` (« Ma chaîne de test », « Ma chaîne », 150 videos, first five with real public video ids), `seed-other` (« Chaîne tierce », quota error, 150 videos), `seed-stale` (« Chaîne à rafraîchir », last sync 13 h ago, no video); 30 classified thumbnails per filled channel (every tenth manual), 240 unclassified; fake `youtubeApiKey` and `openrouterApiKey`; `youtubePlaylistId` = the id of `seed-mine`.

- [ ] **Step 1: Write the failing tests**

Create `tests/channels/view.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  channelStatusLabel,
  channelsDataVersion,
  formatCount,
  formatPublishedDate,
  formatRelativeTime,
  formatScore,
  formatSubscribers,
  formatUsd,
  formatViews,
  formatViewsPerDay,
  performanceBadge,
  toggleFilterValue,
  typesFilterLabel,
} from "@/components/library/followed-channels/view";
import { QUOTA_SYNC_ERROR, type ChannelsResponse } from "@/lib/youtube/types";

const NOW = new Date("2026-09-16T12:00:00.000Z");

describe("numbers", () => {
  it("formats counts and compact views the French way, with plain spaces", () => {
    expect(formatCount(1240)).toBe("1 240");
    expect(formatViews(0)).toBe("0 vue");
    expect(formatViews(1)).toBe("1 vue");
    expect(formatViews(850)).toBe("850 vues");
    expect(formatViews(12_000)).toBe("12 k vues");
    expect(formatViews(1_200_000)).toBe("1,2 M vues");
    expect(formatViewsPerDay(850)).toBe("850 vues/j");
    expect(formatSubscribers(12_500)).toBe("12,5 k abonnés");
    expect(formatSubscribers(1)).toBe("1 abonné");
    expect(formatSubscribers(null)).toBe("abonnés masqués");
  });

  it("formats scores and dollars", () => {
    expect(formatScore(0.4)).toBe("×0,4");
    expect(formatScore(8.5)).toBe("×8,5");
    expect(formatScore(3)).toBe("×3,0");
    expect(formatUsd(0.0975)).toBe("0,10 $");
    expect(formatUsd(0.004)).toBe("moins de 0,01 $");
    expect(formatUsd(0)).toBe("0,00 $");
  });
});

describe("dates", () => {
  it("says how long ago", () => {
    expect(formatRelativeTime("2026-09-16T11:59:30.000Z", NOW)).toBe("à l'instant");
    expect(formatRelativeTime("2026-09-16T11:55:00.000Z", NOW)).toBe("il y a 5 min");
    expect(formatRelativeTime("2026-09-16T10:00:00.000Z", NOW)).toBe("il y a 2 h");
    expect(formatRelativeTime("2026-09-13T12:00:00.000Z", NOW)).toBe("il y a 3 j");
  });

  it("prints a short French date", () => {
    expect(formatPublishedDate("2026-09-12T10:00:00.000Z")).toBe("12 sept. 2026");
    expect(formatPublishedDate("not a date")).toBe("");
  });
});

describe("channelStatusLabel", () => {
  const base = { syncStatus: "idle" as const, syncError: null, lastSyncedAt: "2026-09-16T10:00:00.000Z", videoCount: 320 };

  it.each([
    [{ ...base, syncStatus: "syncing" as const }, "Synchronisation… 320 vidéos"],
    [{ ...base, syncStatus: "syncing" as const, videoCount: 1 }, "Synchronisation… 1 vidéo"],
    [base, "À jour il y a 2 h"],
    [{ ...base, lastSyncedAt: null }, "En attente"],
    [{ ...base, syncStatus: "error" as const, syncError: "YouTube injoignable" }, "Erreur"],
    [{ ...base, syncStatus: "error" as const, syncError: QUOTA_SYNC_ERROR }, QUOTA_SYNC_ERROR],
  ])("%o → %s", (channel, label) => {
    expect(channelStatusLabel(channel, NOW)).toBe(label);
  });
});

describe("performanceBadge", () => {
  it("shows the score with its band, views per day for a recent video, nothing without a score", () => {
    expect(performanceBadge({ kind: "scored", score: 8.5, band: "over" })).toMatchObject({ label: "×8,5", tone: "over", hint: expect.stringContaining("Surperforme") });
    expect(performanceBadge({ kind: "scored", score: 0.4, band: "under" })).toMatchObject({ label: "×0,4", tone: "under", hint: expect.stringContaining("Sous-performe") });
    expect(performanceBadge({ kind: "scored", score: 1.2, band: "neutral" })).toMatchObject({ label: "×1,2", tone: "neutral" });
    expect(performanceBadge({ kind: "recent", viewsPerDay: 850 })).toMatchObject({ label: "Récente · 850 vues/j", tone: "recent" });
    expect(performanceBadge({ kind: "none" })).toBeNull();
  });
});

describe("filters", () => {
  it("labels the type filter", () => {
    expect(typesFilterLabel([])).toBe("Tous les types");
    expect(typesFilterLabel(["versus"])).toBe("Versus / comparaison");
    expect(typesFilterLabel(["none"])).toBe("Non classée");
    expect(typesFilterLabel(["versus", "none"])).toBe("2 types");
  });

  it("toggles a value in a multi-select", () => {
    expect(toggleFilterValue(["a", "b"], "c", true)).toEqual(["a", "b", "c"]);
    expect(toggleFilterValue(["a", "b"], "a", false)).toEqual(["b"]);
    expect(toggleFilterValue(["a"], "a", true)).toEqual(["a"]);
  });
});

describe("channelsDataVersion", () => {
  const data: ChannelsResponse = {
    youtubeConfigured: true,
    channels: [
      {
        id: "c1",
        youtubeChannelId: "UCx",
        title: "C1",
        handle: null,
        avatarUrl: null,
        subscriberCount: null,
        isMine: false,
        medianViews: null,
        lastSyncedAt: null,
        syncStatus: "syncing",
        syncError: null,
        videoCount: 10,
        createdAt: "2026-09-16T00:00:00.000Z",
      },
    ],
    classification: { enabled: true, hasKey: true, pending: 5, awaitingConfirmation: 0, estimatedCostUsd: 0, running: true, modelLabel: "Gemini 2.5 Flash Lite" },
  };

  it("changes with sync progress and classification progress only", () => {
    const version = channelsDataVersion(data);
    expect(channelsDataVersion({ ...data, classification: { ...data.classification, running: false } })).toBe(version);
    expect(channelsDataVersion({ ...data, channels: [{ ...data.channels[0], videoCount: 60 }] })).not.toBe(version);
    expect(channelsDataVersion({ ...data, classification: { ...data.classification, pending: 4 } })).not.toBe(version);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/channels/view.test.ts`
Expected: FAIL — `Failed to resolve import "@/components/library/followed-channels/view"`.

- [ ] **Step 3: Write the view helpers**

Create `src/components/library/followed-channels/view.ts`:

```ts
import type { VideoPerformance } from "@/lib/youtube/performance";
import { thumbTypeLabel, type ThumbTypeFilter } from "@/lib/youtube/thumb-types";
import { QUOTA_SYNC_ERROR, type ChannelListItem, type ChannelsResponse } from "@/lib/youtube/types";

/** Pure display helpers for « Chaînes suivies » (French formats, labels, badge tones). */

const plainSpaces = (text: string) => text.replace(/[  ]/g, " ");
const countFormat = new Intl.NumberFormat("fr-FR");
const compactFormat = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
const plural = (count: number, singular: string, pluralForm = `${singular}s`) => (count > 1 ? pluralForm : singular);

export function formatCount(value: number): string {
  return plainSpaces(countFormat.format(Math.round(value)));
}

export function formatCompact(value: number): string {
  return plainSpaces(compactFormat.format(value));
}

export function formatViews(views: number): string {
  return `${formatCompact(views)} ${plural(views, "vue")}`;
}

export function formatViewsPerDay(views: number): string {
  return `${formatCompact(views)} vues/j`;
}

export function formatSubscribers(count: number | null): string {
  if (count === null) return "abonnés masqués";
  return `${formatCompact(count)} ${plural(count, "abonné")}`;
}

export function formatScore(score: number): string {
  return `×${score.toFixed(1).replace(".", ",")}`;
}

export function formatUsd(amount: number): string {
  if (amount > 0 && amount < 0.005) return "moins de 0,01 $";
  return `${amount.toFixed(2).replace(".", ",")} $`;
}

export function formatRelativeTime(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.floor(hours / 24)} j`;
}

export function formatPublishedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export function channelStatusLabel(
  channel: Pick<ChannelListItem, "syncStatus" | "syncError" | "lastSyncedAt" | "videoCount">,
  now: Date,
): string {
  if (channel.syncStatus === "syncing") {
    return `Synchronisation… ${formatCount(channel.videoCount)} ${plural(channel.videoCount, "vidéo")}`;
  }
  if (channel.syncStatus === "error") return channel.syncError === QUOTA_SYNC_ERROR ? QUOTA_SYNC_ERROR : "Erreur";
  return channel.lastSyncedAt ? `À jour ${formatRelativeTime(channel.lastSyncedAt, now)}` : "En attente";
}

export type PerformanceBadge = { label: string; hint: string; tone: "over" | "neutral" | "under" | "recent" };

export const PERFORMANCE_BADGE_CLASSES: Record<PerformanceBadge["tone"], string> = {
  over: "border-transparent bg-emerald-600 text-white",
  neutral: "border-transparent bg-background/90 text-foreground",
  under: "border-transparent bg-red-600 text-white",
  recent: "border-transparent bg-sky-600 text-white",
};

const BAND_HINTS = {
  over: "Surperforme : au moins 3 fois la médiane de la chaîne",
  neutral: "Dans la moyenne de la chaîne",
  under: "Sous-performe : moins de la moitié de la médiane de la chaîne",
} as const;

export function performanceBadge(performance: VideoPerformance): PerformanceBadge | null {
  if (performance.kind === "none") return null;
  if (performance.kind === "recent") {
    return {
      label: `Récente · ${formatViewsPerDay(performance.viewsPerDay)}`,
      hint: "Publiée il y a moins de 7 jours : pas encore de score",
      tone: "recent",
    };
  }
  return { label: formatScore(performance.score), hint: BAND_HINTS[performance.band], tone: performance.band };
}

export function typesFilterLabel(types: readonly ThumbTypeFilter[]): string {
  if (types.length === 0) return "Tous les types";
  if (types.length === 1) return thumbTypeLabel(types[0]);
  return `${types.length} types`;
}

export function toggleFilterValue<T extends string>(values: readonly T[], value: T, checked: boolean): T[] {
  const without = values.filter((item) => item !== value);
  return checked ? [...without, value] : without;
}

/** Changes whenever a sync or the classification made progress: lists refetch on it. */
export function channelsDataVersion(data: ChannelsResponse): string {
  const channels = data.channels
    .map((channel) => `${channel.id}:${channel.syncStatus}:${channel.lastSyncedAt ?? ""}:${channel.videoCount}`)
    .join("|");
  return `${channels}#${data.classification.pending}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/channels/view.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the API client and the polling hook**

Create `src/components/library/followed-channels/api.ts`:

```ts
import type { ThumbType } from "@/lib/youtube/thumb-types";
import {
  videoQueryToSearch,
  type ChannelListItem,
  type ChannelPreview,
  type ChannelsResponse,
  type ClassificationStatus,
  type TypesSummaryResponse,
  type UseVideoResponse,
  type VideoListResponse,
  type VideoQuery,
} from "@/lib/youtube/types";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const body = (await res.json().catch(() => ({}))) as { error?: unknown };
  if (!res.ok) throw new ApiError(res.status, typeof body.error === "string" ? body.error : "Erreur inattendue");
  return body as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const channelsApi = {
  list: () => request<ChannelsResponse>("/api/channels"),
  preview: (input: string) => request<{ channel: ChannelPreview }>("/api/channels/preview", json("POST", { input })),
  follow: (youtubeChannelId: string) =>
    request<{ channel: ChannelListItem; alreadyFollowed: boolean }>("/api/channels", json("POST", { youtubeChannelId })),
  unfollow: (channelId: string) =>
    request<{ success: true }>(`/api/channels/${encodeURIComponent(channelId)}`, { method: "DELETE" }),
  sync: (channelId: string) =>
    request<{ started: true; channel: ChannelListItem }>(`/api/channels/${encodeURIComponent(channelId)}/sync`, { method: "POST" }),
  syncAll: () => request<{ queued: number; throttled: boolean }>("/api/channels/sync-stale", json("POST", { all: true })),
  videos: (query: Partial<VideoQuery>) => request<VideoListResponse>(`/api/channels/videos?${videoQueryToSearch(query)}`),
  setType: (videoId: string, thumbType: ThumbType) =>
    request<{ videoId: string; thumbType: ThumbType; thumbTypeSource: "manual" }>(
      `/api/channels/videos/${encodeURIComponent(videoId)}`,
      json("PATCH", { thumbType }),
    ),
  use: (videoId: string) =>
    request<UseVideoResponse>(`/api/channels/videos/${encodeURIComponent(videoId)}/use`, { method: "POST" }),
  typesSummary: (scope: string) =>
    request<TypesSummaryResponse>(`/api/channels/types-summary?scope=${encodeURIComponent(scope)}`),
  approveClassification: () =>
    request<{ approved: number; classification: ClassificationStatus }>(
      "/api/channels/classification",
      json("POST", { action: "approve" }),
    ),
};
```

Create `src/components/library/followed-channels/useFollowedChannels.ts`:

```ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChannelsResponse } from "@/lib/youtube/types";
import { channelsApi } from "./api";
import { channelsDataVersion } from "./view";

export const CHANNELS_POLL_MS = 3000;

/** Channels + classification status; polls while something runs in the background. */
export function useFollowedChannels() {
  const [data, setData] = useState<ChannelsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const next = await channelsApi.list();
      setData(next);
      setError(null);
    } catch {
      setError("Impossible de charger les chaînes suivies.");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const busy = Boolean(
    data && (data.channels.some((channel) => channel.syncStatus === "syncing") || data.classification.running),
  );

  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => void reload(), CHANNELS_POLL_MS);
    return () => clearInterval(timer);
  }, [busy, reload]);

  // Réglages → Ma chaîne fires this after a save; GET /api/channels then follows the new channel.
  useEffect(() => {
    const onSaved = () => void reload();
    window.addEventListener("youtube-channel-saved", onSaved);
    return () => window.removeEventListener("youtube-channel-saved", onSaved);
  }, [reload]);

  const version = useMemo(() => (data ? channelsDataVersion(data) : ""), [data]);

  return { data, error, reload, version };
}
```

- [ ] **Step 6: Add the app-open trigger**

Create `src/components/ChannelSyncTrigger.tsx`:

```tsx
"use client";

import { useEffect } from "react";

// Once per document load: StrictMode runs effects twice and the root layout
// never remounts on client navigation. The server throttles it as well.
let triggered = false;

/** Asks the server to refresh followed channels last synced more than 12 hours ago. */
export default function ChannelSyncTrigger() {
  useEffect(() => {
    if (triggered) return;
    triggered = true;
    fetch("/api/channels/sync-stale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => {});
  }, []);
  return null;
}
```

Re-read `src/app/layout.tsx`, then add the import next to the other component imports:

```tsx
import ChannelSyncTrigger from "@/components/ChannelSyncTrigger";
```

and render it first inside `TooltipProvider` — replace:

```tsx
        <TooltipProvider>
```

with:

```tsx
        <TooltipProvider>
          <ChannelSyncTrigger />
```

- [ ] **Step 7: Write the demo data script**

Create `scripts/seed-followed-channels.mjs`:

```js
/**
 * Dev-only helper for the « Chaînes suivies » UI checks.
 *
 * Fills a THROWAWAY ThumbGen database with followed channels and videos so
 * Bibliothèque → Inspirations can be exercised without calling YouTube or
 * OpenRouter. It stores FAKE keys so the UI shows its configured state, and
 * more than 200 unclassified thumbnails so the classifier waits for a
 * confirmation instead of sending anything.
 *
 *   /opt/homebrew/bin/node scripts/seed-followed-channels.mjs <throwaway-db-path>
 *
 * Refuses data/thumbgen.db. Run it once the dev server has created the tables
 * (a single GET /api/channels is enough). Safe to run again.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/seed-followed-channels.mjs <throwaway-db-path>");
  process.exit(1);
}
const realDb = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "thumbgen.db");
if (path.resolve(target) === realDb) {
  console.error("Refusing to seed the real database (data/thumbgen.db).");
  process.exit(1);
}

const db = new Database(target);
db.pragma("foreign_keys = ON");
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('followed_channels', 'channel_videos')")
  .all();
if (tables.length !== 2) {
  console.error("Channel tables missing: request /api/channels on the dev server once, then retry.");
  process.exit(1);
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.now();
const ago = (ms) => new Date(now - ms).toISOString();
const QUOTA = "Quota YouTube atteint — reprise demain";
const REAL_VIDEO_IDS = ["jNQXAC9IVRw", "dQw4w9WgXcQ", "9bZkp7q19f0", "kJQP7kiw5Fk", "OPf0YbXqDm0"];
const TYPES = ["face_text", "reaction", "before_after", "versus", "screenshot", "object", "text_only", "scene"];
const FACTORS = [0.3, 0.8, 1, 1.2, 2, 4.5, 9];

const channels = [
  { id: "seed-mine", letter: "m", title: "Ma chaîne de test", handle: "@machainedetest", subscribers: 12_500, mine: 1, median: 10_000, syncedAgo: 2 * HOUR, status: "idle", error: null, videos: 150 },
  { id: "seed-other", letter: "o", title: "Chaîne tierce", handle: "@chainetierce", subscribers: 250_000, mine: 0, median: 40_000, syncedAgo: 30 * 60_000, status: "error", error: QUOTA, videos: 150 },
  { id: "seed-stale", letter: "s", title: "Chaîne à rafraîchir", handle: "@arafraichir", subscribers: 900, mine: 0, median: null, syncedAgo: 13 * HOUR, status: "idle", error: null, videos: 0 },
];

const upsertSetting = db.prepare(
  "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
);
const insertChannel = db.prepare(
  `INSERT INTO followed_channels
     (id, youtube_channel_id, title, handle, avatar_url, subscriber_count, is_mine, median_views,
      last_synced_at, sync_status, sync_error, playlist_id, backfill_done)
   VALUES (@id, @youtubeChannelId, @title, @handle, NULL, @subscribers, @mine, @median,
      @syncedAt, @status, @error, @playlistId, 1)`,
);
const insertVideo = db.prepare(
  `INSERT INTO channel_videos
     (video_id, channel_id, title, published_at, duration_seconds, view_count, like_count, thumbnail_url,
      stats_updated_at, thumb_type, thumb_type_source)
   VALUES (@videoId, @channelId, @title, @publishedAt, 600, @views, NULL, @thumbnailUrl,
      @statsUpdatedAt, @thumbType, @thumbTypeSource)`,
);

db.transaction(() => {
  upsertSetting.run("youtubeApiKey", "fake-key-for-ui-check");
  upsertSetting.run("openrouterApiKey", "fake-key-for-ui-check");
  upsertSetting.run("youtubePlaylistId", `UC${"m".repeat(22)}`);
  db.prepare(`DELETE FROM followed_channels WHERE id IN (${channels.map(() => "?").join(", ")})`).run(
    ...channels.map((channel) => channel.id),
  );
  for (const channel of channels) {
    const youtubeChannelId = `UC${channel.letter.repeat(22)}`;
    insertChannel.run({
      id: channel.id,
      youtubeChannelId,
      title: channel.title,
      handle: channel.handle,
      subscribers: channel.subscribers,
      mine: channel.mine,
      median: channel.median,
      syncedAt: ago(channel.syncedAgo),
      status: channel.status,
      error: channel.error,
      playlistId: `UULF${youtubeChannelId.slice(2)}`,
    });
    for (let index = 0; index < channel.videos; index += 1) {
      const videoId =
        channel.mine && index < REAL_VIDEO_IDS.length ? REAL_VIDEO_IDS[index] : `${channel.letter}${String(index).padStart(10, "0")}`;
      const classified = index < 30;
      insertVideo.run({
        videoId,
        channelId: channel.id,
        title: `Vidéo test ${index + 1} — ${channel.title}`,
        publishedAt: ago((index * 3 + 1) * DAY),
        views: Math.round(channel.median * FACTORS[index % FACTORS.length]),
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        statsUpdatedAt: ago(channel.syncedAgo),
        thumbType: classified ? TYPES[index % TYPES.length] : null,
        thumbTypeSource: classified ? (index % 10 === 0 ? "manual" : "ai") : null,
      });
    }
  }
})();

const { pending } = db.prepare("SELECT COUNT(*) AS pending FROM channel_videos WHERE thumb_type IS NULL").get();
console.log(`Seeded ${channels.length} channels; ${pending} thumbnails wait for classification (over 200: nothing is sent).`);
db.close();
```

- [ ] **Step 8: Type-check and lint**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/components/library/followed-channels/view.ts src/components/library/followed-channels/api.ts src/components/library/followed-channels/useFollowedChannels.ts src/components/ChannelSyncTrigger.tsx src/app/layout.tsx scripts/seed-followed-channels.mjs tests/channels/view.test.ts
```

Expected: `tsc` exits 0; no ESLint errors.

- [ ] **Step 9: Check the trigger and the seeded API on a throwaway dev server**

```bash
mktemp -d   # → <CHECK_DIR>
YOUTUBE_API_KEY= OPENROUTER_API_KEY= OPENAI_API_KEY= SITE_PASSWORD= THUMBGEN_DB_PATH="<CHECK_DIR>/thumbgen.db" ./node_modules/.bin/next dev -p 3100
```

(run the second command in the background), then:

```bash
until curl -s -o /dev/null http://localhost:3100/api/channels; do sleep 2; done
curl -s http://localhost:3100/api/channels
/opt/homebrew/bin/node scripts/seed-followed-channels.mjs "<CHECK_DIR>/thumbgen.db"
curl -s http://localhost:3100/api/channels | head -c 1500
curl -s "http://localhost:3100/api/channels/videos?limit=2" | head -c 800
```

Expected: the first `/api/channels` answers `{"youtubeConfigured":false,"channels":[],…}` (tables created, nothing sent anywhere). The seed prints « 240 thumbnails wait for classification ». Then `youtubeConfigured` is `true`, three channels with « Ma chaîne de test » first and `"isMine":true`, `classification` shows `"pending":240,"awaitingConfirmation":240` and `"estimatedCostUsd"` ≈ `0.0187`; the videos call returns two items with `performance`.

Open `http://localhost:3100/miniatures` in the browser pane, then read the network requests filtered on `sync-stale`: one `POST /api/channels/sync-stale` answered `{"queued":1,"throttled":false}` (« Chaîne à rafraîchir » is 13 h old). That queued sync is the one outbound request of this check: Google rejects the fake key and nothing is imported. After ~5 s, `curl -s http://localhost:3100/api/channels` shows `seed-stale` with `"syncStatus":"error"` and a `"syncError"` starting « YouTube a refusé la requête (400 ». Reload the page: the new `sync-stale` call answers `{"queued":0,"throttled":true}`. Stop the dev server; keep `<CHECK_DIR>` for Task 12 if it runs right after (the seed can be re-run at any time).

- [ ] **Step 10: Commit**

```bash
git add src/components/library/followed-channels/view.ts src/components/library/followed-channels/api.ts src/components/library/followed-channels/useFollowedChannels.ts src/components/ChannelSyncTrigger.tsx src/app/layout.tsx scripts/seed-followed-channels.mjs tests/channels/view.test.ts
git commit -m "feat(channels): client helpers, polling hook, app-open sync trigger and demo seed" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 12: « Chaînes suivies » section — channel bar, follow dialog, classification notice

**Files:**
- Modify (full rewrite of chantier C's file): `src/components/library/FollowedChannelsSection.tsx`
- Create: `src/components/library/followed-channels/ChannelBar.tsx`, `src/components/library/followed-channels/FollowChannelDialog.tsx`, `src/components/library/followed-channels/ClassificationNotice.tsx`
- Modify: `src/lib/youtube/channel.ts` (header comment; remove `resolveUploadsPlaylistId` if unused)
- Delete: `src/app/api/youtube/playlist/route.ts` (if unused)

**Interfaces:**
- Consumes: Task 11 — `channelsApi`, `ApiError`, `useFollowedChannels`, `channelStatusLabel`, `formatCount`, `formatSubscribers`, `formatUsd`; Task 2 — `QUOTA_SYNC_ERROR`, `type ChannelListItem`, `type ChannelPreview`, `type ClassificationStatus`; `ConfirmDialog` (`src/components/settings/ConfirmDialog.tsx`).
- Produces:
  - `FollowedChannelsSection` — default export, no props (chantier C contract). Renders the heading, the « Ajoute ta clé YouTube (gratuite) » card without a key, otherwise `ChannelBar`, `ClassificationNotice` and the empty state; Task 13 adds the summary and the grid in place of the empty state's `else` branch.
  - `ChannelBar` default export `{ channels: ChannelListItem[]; onFollow: () => void; onChanged: () => void }`.
  - `FollowChannelDialog` default export `{ open: boolean; onOpenChange: (open: boolean) => void; onFollowed: () => void }`.
  - `ClassificationNotice` default export `{ status: ClassificationStatus; onChanged: () => void }`.

- [ ] **Step 1: Re-read chantier C's section and its callers**

```bash
cat src/components/library/FollowedChannelsSection.tsx
grep -rn "FollowedChannelsSection" src --include=*.tsx
grep -rn "youtube/playlist\|resolveUploadsPlaylistId" src tests
```

Expected: C's placeholder (feed from `/api/youtube/playlist`, `youtube-channel-saved` listener); `InspirationsTab.tsx` renders `<FollowedChannelsSection />` without a heading of its own (if it does wrap it in a « Chaînes suivies » heading, drop the `<h2>` block below and say so in the report). Note every hit of the last grep for Step 6.

- [ ] **Step 2: Write the channel bar**

Create `src/components/library/followed-channels/ChannelBar.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Loader2, MoreHorizontal, Plus, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "cn";
import ConfirmDialog from "@/components/settings/ConfirmDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QUOTA_SYNC_ERROR, type ChannelListItem } from "@/lib/youtube/types";
import { ApiError, channelsApi } from "./api";
import { channelStatusLabel } from "./view";

type Props = { channels: ChannelListItem[]; onFollow: () => void; onChanged: () => void };

export default function ChannelBar({ channels, onFollow, onChanged }: Props) {
  const [now, setNow] = useState(() => new Date());
  const [message, setMessage] = useState<string | null>(null);
  const [toUnfollow, setToUnfollow] = useState<ChannelListItem | null>(null);
  const [unfollowing, setUnfollowing] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const refresh = async (channel: ChannelListItem) => {
    setMessage(null);
    try {
      await channelsApi.sync(channel.id);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Actualisation impossible");
    }
    onChanged();
  };

  const refreshAll = async () => {
    setMessage(null);
    try {
      await channelsApi.syncAll();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Actualisation impossible");
    }
    onChanged();
  };

  const unfollow = async () => {
    if (!toUnfollow) return;
    setUnfollowing(true);
    try {
      await channelsApi.unfollow(toUnfollow.id);
      setToUnfollow(null);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Impossible de ne plus suivre cette chaîne");
      setToUnfollow(null);
    } finally {
      setUnfollowing(false);
      onChanged();
    }
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {channels.map((channel) => {
          const failed = channel.syncStatus === "error" && channel.syncError !== QUOTA_SYNC_ERROR;
          return (
            <div key={channel.id} className="flex items-center gap-2 rounded-full border bg-card py-1 pr-1 pl-1.5">
              <Avatar size="sm">
                {channel.avatarUrl && <AvatarImage src={channel.avatarUrl} alt="" />}
                <AvatarFallback>{channel.title.slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="grid leading-tight">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {channel.title}
                  {channel.isMine && <Badge variant="secondary">Ma chaîne</Badge>}
                </span>
                <span
                  className={cn(
                    "flex items-center gap-1 text-xs text-muted-foreground",
                    channel.syncStatus === "error" && "text-destructive",
                  )}
                  title={channel.syncStatus === "error" ? (channel.syncError ?? undefined) : undefined}
                >
                  {channel.syncStatus === "syncing" && <Loader2 className="size-3 animate-spin" />}
                  {channelStatusLabel(channel, now)}
                </span>
              </div>
              {failed && (
                <Button variant="ghost" size="xs" onClick={() => void refresh(channel)}>
                  Réessayer
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${channel.title}`}>
                      <MoreHorizontal />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuItem disabled={channel.syncStatus === "syncing"} onClick={() => void refresh(channel)}>
                      <RefreshCw />
                      {failed ? "Réessayer" : "Actualiser"}
                    </DropdownMenuItem>
                    {!channel.isMine && (
                      <DropdownMenuItem variant="destructive" onClick={() => setToUnfollow(channel)}>
                        <Trash2 />
                        Ne plus suivre
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
        <Button variant="outline" size="sm" onClick={onFollow}>
          <Plus />
          Suivre une chaîne
        </Button>
        {channels.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => void refreshAll()}>
            <RefreshCw />
            Tout actualiser
          </Button>
        )}
      </div>
      {message && <p className="text-sm text-destructive">{message}</p>}
      <ConfirmDialog
        open={toUnfollow !== null}
        onOpenChange={(open) => {
          if (!open) setToUnfollow(null);
        }}
        title={`Ne plus suivre « ${toUnfollow?.title ?? ""} » ?`}
        description="La chaîne et ses vidéos disparaissent de ThumbGen. Les miniatures déjà copiées dans ta bibliothèque restent."
        confirmLabel="Ne plus suivre"
        busy={unfollowing}
        onConfirm={() => void unfollow()}
      />
    </div>
  );
}
```

- [ ] **Step 3: Write the follow dialog**

Create `src/components/library/followed-channels/FollowChannelDialog.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { Loader2, Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import type { ChannelPreview } from "@/lib/youtube/types";
import { ApiError, channelsApi } from "./api";
import { formatCount, formatSubscribers } from "./view";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; onFollowed: () => void };

export default function FollowChannelDialog({ open, onOpenChange, onFollowed }: Props) {
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState<ChannelPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [following, setFollowing] = useState(false);

  const close = () => {
    setInput("");
    setPreview(null);
    setError(null);
    setSearching(false);
    setFollowing(false);
    onOpenChange(false);
  };

  const search = async (event: FormEvent) => {
    event.preventDefault();
    const value = input.trim();
    if (!value) return;
    setSearching(true);
    setError(null);
    setPreview(null);
    try {
      const { channel } = await channelsApi.preview(value);
      setPreview(channel);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Recherche impossible");
    } finally {
      setSearching(false);
    }
  };

  const follow = async () => {
    if (!preview) return;
    setFollowing(true);
    setError(null);
    try {
      await channelsApi.follow(preview.youtubeChannelId);
      onFollowed();
      close();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible de suivre cette chaîne");
      setFollowing(false);
    }
  };

  const details = preview
    ? [
        preview.handle,
        formatSubscribers(preview.subscriberCount),
        preview.videoCount !== null ? `${formatCount(preview.videoCount)} vidéos` : null,
      ].filter(Boolean)
    : [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suivre une chaîne</DialogTitle>
          <DialogDescription>
            Colle l&apos;URL de la chaîne, son @handle ou son identifiant (UC…). Toutes ses vidéos longues seront importées
            avec leurs vues.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void search(event)} className="flex gap-2">
          <Input
            autoFocus
            aria-label="Chaîne YouTube"
            placeholder="https://youtube.com/@chaine"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setPreview(null);
            }}
          />
          <Button type="submit" variant="outline" disabled={searching || !input.trim()}>
            {searching ? <Loader2 className="animate-spin" /> : <Search />}
            Chercher
          </Button>
        </form>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {preview && (
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <Avatar size="lg">
              {preview.avatarUrl && <AvatarImage src={preview.avatarUrl} alt="" />}
              <AvatarFallback>{preview.title.slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 flex-1">
              <span className="truncate font-medium">{preview.title}</span>
              <span className="truncate text-sm text-muted-foreground">{details.join(" · ")}</span>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Annuler
          </Button>
          <Button type="button" disabled={!preview || preview.alreadyFollowed || following} onClick={() => void follow()}>
            {preview?.alreadyFollowed ? "Déjà suivie" : following ? "Ajout…" : "Suivre"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Write the classification notice**

Create `src/components/library/followed-channels/ClassificationNotice.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ClassificationStatus } from "@/lib/youtube/types";
import { ApiError, channelsApi } from "./api";
import { formatCount, formatUsd } from "./view";

type Props = { status: ClassificationStatus; onChanged: () => void };

export default function ClassificationNotice({ status, onChanged }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!status.enabled || !status.hasKey) return null;

  if (status.awaitingConfirmation > 0 && !dismissed) {
    const approve = async () => {
      setApproving(true);
      setError(null);
      try {
        await channelsApi.approveClassification();
        onChanged();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Lancement impossible");
      } finally {
        setApproving(false);
      }
    };

    return (
      <Alert>
        <Sparkles />
        <AlertTitle>Classer {formatCount(status.awaitingConfirmation)} miniatures par type ?</AlertTitle>
        <AlertDescription className="grid gap-2">
          <span>
            {status.modelLabel} range chaque miniature par type (visage + texte, avant / après…). Coût estimé : environ{" "}
            {formatUsd(status.estimatedCostUsd)}. Tu pourras corriger chaque type à la main.
          </span>
          {error && <span className="text-destructive">{error}</span>}
          <span className="flex flex-wrap gap-2">
            <Button size="sm" disabled={approving} onClick={() => void approve()}>
              {approving ? "Lancement…" : "Lancer le classement"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
              Plus tard
            </Button>
          </span>
        </AlertDescription>
      </Alert>
    );
  }

  if (status.running) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Classement IA en cours · {formatCount(status.pending)}{" "}
        {status.pending > 1 ? "miniatures restantes" : "miniature restante"}
      </p>
    );
  }

  return null;
}
```

- [ ] **Step 5: Rewrite the section**

Replace the whole content of `src/components/library/FollowedChannelsSection.tsx` with:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound, Tv } from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import ChannelBar from "./followed-channels/ChannelBar";
import ClassificationNotice from "./followed-channels/ClassificationNotice";
import FollowChannelDialog from "./followed-channels/FollowChannelDialog";
import { useFollowedChannels } from "./followed-channels/useFollowedChannels";

const GOOGLE_KEY_HELP = "https://console.cloud.google.com/apis/credentials";

/** Inspirations → « Chaînes suivies » (chantier D). Default export without props: chantier C's contract. */
export default function FollowedChannelsSection() {
  const { data, error, reload } = useFollowedChannels();
  const [followOpen, setFollowOpen] = useState(false);

  return (
    <section aria-labelledby="followed-channels-title" className="grid gap-4">
      <div className="grid gap-1">
        <h2 id="followed-channels-title" className="text-lg font-semibold">
          Chaînes suivies
        </h2>
        <p className="text-sm text-muted-foreground">
          Les miniatures de ta chaîne et des chaînes que tu suis, avec leurs vues et leur score de surperformance.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      )}

      {data === null ? (
        <Skeleton className="h-24 w-full" />
      ) : !data.youtubeConfigured ? (
        <YouTubeKeyCard />
      ) : (
        <>
          <ChannelBar channels={data.channels} onFollow={() => setFollowOpen(true)} onChanged={() => void reload()} />
          <ClassificationNotice status={data.classification} onChanged={() => void reload()} />
          {data.channels.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Tv />
                </EmptyMedia>
                <EmptyTitle>Aucune chaîne suivie</EmptyTitle>
                <EmptyDescription>
                  Suis une chaîne pour importer ses vidéos longues, leurs vues et leurs miniatures. Renseigne aussi « Ma
                  chaîne » dans Réglages pour l&apos;ajouter automatiquement.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
        </>
      )}

      <FollowChannelDialog open={followOpen} onOpenChange={setFollowOpen} onFollowed={() => void reload()} />
    </section>
  );
}

function YouTubeKeyCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" />
          Ajoute ta clé YouTube (gratuite)
        </CardTitle>
        <CardDescription>
          Elle sert à importer les vidéos des chaînes suivies avec leurs vues. Sans clé, ThumbGen n&apos;envoie aucune
          requête à YouTube.
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex flex-wrap gap-2">
        <Link href="/reglages/connexions" className={buttonVariants()}>
          Ajouter ma clé
        </Link>
        <a href={GOOGLE_KEY_HELP} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline" })}>
          Créer une clé dans Google Cloud
        </a>
      </CardFooter>
    </Card>
  );
}
```

- [ ] **Step 6: Remove the legacy « Ma chaîne » feed**

Run: `grep -rn "youtube/playlist\|resolveUploadsPlaylistId" src tests`
Expected: only `src/app/api/youtube/playlist/route.ts` itself and the definition in `src/lib/youtube/channel.ts`. If anything else still uses them, skip this step and report the callers.

```bash
git rm src/app/api/youtube/playlist/route.ts
```

In `src/lib/youtube/channel.ts`, delete the whole `export async function resolveUploadsPlaylistId(…) { … }` function and replace the header comment:

```ts
/**
 * Shared YouTube channel utilities.
 *
 * Used by:
 *  - src/app/api/youtube/playlist/route.ts
 *  - src/lib/agent/tools/search-youtube-channel.ts
 *  - src/lib/agent/tools/get-channel-videos.ts
 */
```

with:

```ts
/**
 * Shared YouTube channel utilities.
 *
 * Used by:
 *  - src/lib/youtube/api.ts (followed channels)
 *  - src/lib/agent/tools/search-youtube-channel.ts
 *  - src/lib/agent/tools/get-channel-videos.ts
 */
```

If `.next/types` still references the deleted route, `rm -rf .next/types .next/dev/types`.

- [ ] **Step 7: Type-check, lint, run the suite**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/components/library/FollowedChannelsSection.tsx src/components/library/followed-channels/ChannelBar.tsx src/components/library/followed-channels/FollowChannelDialog.tsx src/components/library/followed-channels/ClassificationNotice.tsx src/lib/youtube/channel.ts
./node_modules/.bin/vitest run
```

Expected: `tsc` exits 0; no ESLint errors; every test passes.

- [ ] **Step 8: Check the section in the browser (throwaway dev server, seeded, no outbound action)**

If no seeded `<CHECK_DIR>` is left from Task 11: `mktemp -d`, start the server as in Task 11 Step 9, `curl -s http://localhost:3100/api/channels`, then `/opt/homebrew/bin/node scripts/seed-followed-channels.mjs "<CHECK_DIR>/thumbgen.db"`. Otherwise start the server on the existing `<CHECK_DIR>` and re-run the seed.

Open `http://localhost:3100/bibliotheque?onglet=inspirations` and check, without clicking « Chercher », « Actualiser », « Réessayer », « Tout actualiser » or « Lancer le classement »:
1. Heading « Chaînes suivies » under chantier C's « Mes images ».
2. Chips: « Ma chaîne de test » with the « Ma chaîne » badge and « À jour il y a 2 h »; « Chaîne tierce » with « Quota YouTube atteint — reprise demain » in red; « Chaîne à rafraîchir » (its app-open sync failed on the fake key) with « Erreur », an inline « Réessayer » button and the error message as tooltip. A fallback letter shows in each avatar.
3. The « … » menu of « Ma chaîne de test » only offers « Actualiser »; the one of « Chaîne tierce » offers « Actualiser » and « Ne plus suivre ».
4. Notice « Classer 240 miniatures par type ? » mentioning « Gemini 2.5 Flash Lite » and « environ 0,02 $ »; « Plus tard » hides it.
5. « Suivre une chaîne » opens the dialog; type `@test`; « Chercher » becomes enabled; « Suivre » stays disabled; « Annuler » closes and clears it.
6. « Ne plus suivre » on « Chaîne à rafraîchir » → dialog « Ne plus suivre « Chaîne à rafraîchir » ? » → « Ne plus suivre » → the chip disappears; `curl -s http://localhost:3100/api/channels` lists two channels.
7. `curl -s -X DELETE "http://localhost:3100/api/settings?key=youtubeApiKey"`, reload: the card « Ajoute ta clé YouTube (gratuite) » with « Ajouter ma clé » (→ `/reglages/connexions`) and « Créer une clé dans Google Cloud » (new tab). Re-run the seed script to restore the demo data.
8. At 375 px wide (`resize_window` preset `mobile`), the chips wrap without horizontal scroll; reset the viewport to `desktop`.

Stop the dev server.

- [ ] **Step 9: Commit**

```bash
git add src/components/library/FollowedChannelsSection.tsx src/components/library/followed-channels/ChannelBar.tsx src/components/library/followed-channels/FollowChannelDialog.tsx src/components/library/followed-channels/ClassificationNotice.tsx src/lib/youtube/channel.ts
git commit -m "feat(channels): followed channels bar, follow dialog and classification notice" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

(The `git rm` of Step 6 is already staged and goes into this commit.)

---
## Task 13: « Les types qui marchent » and the thumbnail grid

**Files:**
- Create: `src/components/library/followed-channels/TypesSummary.tsx`, `src/components/library/followed-channels/VideoGrid.tsx`, `src/components/library/followed-channels/VideoCard.tsx`, `src/components/library/followed-channels/ThumbTypeMenu.tsx`
- Modify: `src/components/library/FollowedChannelsSection.tsx` (as written by Task 12)

**Interfaces:**
- Consumes: Task 11 — `channelsApi`, `formatCount`, `formatPublishedDate`, `formatScore`, `formatViews`, `performanceBadge`, `PERFORMANCE_BADGE_CLASSES`, `typesFilterLabel`, `toggleFilterValue`, `useFollowedChannels().version`; Task 2 — `THUMB_TYPES`, `UNCLASSIFIED_FILTER`, `UNCLASSIFIED_LABEL`, `isThumbType`, `thumbTypeLabel`, `VIDEO_SORTS`, `VIDEO_PERIODS`, `VIDEO_PAGE_SIZE`, `VIDEO_MAX_LIMIT`, `youtubeWatchUrl`, types.
- Produces:
  - `TypesSummary` default export `{ channels: ChannelListItem[]; version: string }`.
  - `VideoGrid` default export `{ channels: ChannelListItem[]; version: string }` (Task 14 adds `onUse`).
  - `VideoCard` default export `{ video: VideoListItem; onTypeChanged: (videoId: string, thumbType: ThumbType) => void }` (Task 14 adds `onUse`).
  - `ThumbTypeMenu` default export `{ video: VideoListItem; onChanged: (videoId: string, thumbType: ThumbType) => void }`.

- [ ] **Step 1: Write the types summary**

Create `src/components/library/followed-channels/TypesSummary.tsx`:

```tsx
"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TypeSummaryRow } from "@/lib/youtube/thumb-types";
import { youtubeWatchUrl, type ChannelListItem } from "@/lib/youtube/types";
import { channelsApi } from "./api";
import { formatCount, formatScore } from "./view";

type Props = { channels: ChannelListItem[]; version: string };

export default function TypesSummary({ channels, version }: Props) {
  const [scope, setScope] = useState("all");
  const [rows, setRows] = useState<TypeSummaryRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  const scopeItems = [
    { value: "all", label: "Toutes les chaînes" },
    ...(channels.some((channel) => channel.isMine) ? [{ value: "mine", label: "Ma chaîne" }] : []),
    ...channels.filter((channel) => !channel.isMine).map((channel) => ({ value: channel.id, label: channel.title })),
  ];
  const effectiveScope = scopeItems.some((item) => item.value === scope) ? scope : "all";

  useEffect(() => {
    let cancelled = false;
    channelsApi
      .typesSummary(effectiveScope)
      .then((response) => {
        if (cancelled) return;
        setRows(response.rows);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveScope, version]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Les types qui marchent</CardTitle>
        <CardDescription>
          Score médian des miniatures de chaque type. Un type est classé à partir de 3 miniatures notées.
        </CardDescription>
        <CardAction>
          <Select
            items={scopeItems}
            value={effectiveScope}
            onValueChange={(value) => {
              if (value) setScope(value);
            }}
          >
            <SelectTrigger size="sm" className="w-48" aria-label="Portée">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {scopeItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent>
        {failed ? (
          <p className="text-sm text-destructive">Impossible de charger le classement des types.</p>
        ) : rows === null ? (
          <Skeleton className="h-32 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune miniature classée pour l&apos;instant.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Score médian</TableHead>
                <TableHead className="text-right">Miniatures</TableHead>
                <TableHead>Meilleure miniature</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.type}>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.enoughData && row.medianScore !== null ? (
                      formatScore(row.medianScore)
                    ) : (
                      <span className="text-muted-foreground">peu de données</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCount(row.totalCount)}</TableCell>
                  <TableCell>
                    {row.best ? (
                      <a
                        href={youtubeWatchUrl(row.best.videoId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-w-0 items-center gap-2"
                      >
                        <img src={row.best.thumbnailUrl} alt="" className="aspect-video w-20 shrink-0 rounded object-cover" />
                        <span className="line-clamp-1 max-w-56 text-sm">{row.best.title}</span>
                        <Badge variant="outline">{formatScore(row.best.score)}</Badge>
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Write the type menu and the card**

Create `src/components/library/followed-channels/ThumbTypeMenu.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { THUMB_TYPES, thumbTypeLabel, type ThumbType } from "@/lib/youtube/thumb-types";
import type { VideoListItem } from "@/lib/youtube/types";
import { channelsApi } from "./api";

const SOURCE_HINTS = { ai: "Classée par l'IA — clique pour corriger", manual: "Corrigée à la main" } as const;

type Props = { video: VideoListItem; onChanged: (videoId: string, thumbType: ThumbType) => void };

export default function ThumbTypeMenu({ video, onChanged }: Props) {
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const choose = async (thumbType: ThumbType) => {
    setSaving(true);
    setFailed(false);
    try {
      await channelsApi.setType(video.videoId, thumbType);
      onChanged(video.videoId, thumbType);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const label = thumbTypeLabel(video.thumbType);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="xs"
            disabled={saving}
            aria-invalid={failed || undefined}
            aria-label={`Type de miniature : ${label}`}
            title={video.thumbTypeSource ? SOURCE_HINTS[video.thumbTypeSource] : "Choisir le type de miniature"}
          >
            {label}
            <ChevronDown data-icon="inline-end" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Type de miniature</DropdownMenuLabel>
          {THUMB_TYPES.map((type) => (
            <DropdownMenuItem key={type.id} onClick={() => void choose(type.id)}>
              {type.label}
              {video.thumbType === type.id && <Check className="ml-auto" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

Create `src/components/library/followed-channels/VideoCard.tsx`:

```tsx
"use client";

/* eslint-disable @next/next/no-img-element */

import { ExternalLink, MoreHorizontal } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ThumbType } from "@/lib/youtube/thumb-types";
import { youtubeWatchUrl, type VideoListItem } from "@/lib/youtube/types";
import ThumbTypeMenu from "./ThumbTypeMenu";
import { PERFORMANCE_BADGE_CLASSES, formatPublishedDate, formatViews, performanceBadge } from "./view";

type Props = {
  video: VideoListItem;
  onTypeChanged: (videoId: string, thumbType: ThumbType) => void;
};

export default function VideoCard({ video, onTypeChanged }: Props) {
  const badge = performanceBadge(video.performance);
  const watchUrl = youtubeWatchUrl(video.videoId);

  return (
    <Card className="gap-0 py-0">
      <a
        href={watchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block aspect-video overflow-hidden bg-muted"
        aria-label={`Voir « ${video.title} » sur YouTube`}
      >
        <img src={video.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover" />
        {badge && (
          <Badge className={cn("absolute top-2 left-2", PERFORMANCE_BADGE_CLASSES[badge.tone])} title={badge.hint}>
            {badge.label}
          </Badge>
        )}
      </a>
      <div className="grid gap-2 p-3">
        <p className="line-clamp-2 min-h-10 text-sm font-medium" title={video.title}>
          {video.title}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {video.channelTitle} · {formatPublishedDate(video.publishedAt)} · {formatViews(video.viewCount)}
        </p>
        <div className="flex items-center justify-between gap-2">
          <ThumbTypeMenu video={video} onChanged={onTypeChanged} />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${video.title}`}>
                  <MoreHorizontal />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => window.open(watchUrl, "_blank", "noopener,noreferrer")}>
                  <ExternalLink />
                  Voir sur YouTube
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 3: Write the grid with sort, filters and « Voir plus »**

Create `src/components/library/followed-channels/VideoGrid.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { ListFilter } from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  THUMB_TYPES,
  UNCLASSIFIED_FILTER,
  UNCLASSIFIED_LABEL,
  type ThumbType,
  type ThumbTypeFilter,
} from "@/lib/youtube/thumb-types";
import {
  VIDEO_MAX_LIMIT,
  VIDEO_PAGE_SIZE,
  VIDEO_PERIODS,
  VIDEO_SORTS,
  type ChannelListItem,
  type VideoListResponse,
  type VideoPeriod,
  type VideoSort,
} from "@/lib/youtube/types";
import { channelsApi } from "./api";
import VideoCard from "./VideoCard";
import { formatCount, toggleFilterValue, typesFilterLabel } from "./view";

type Filters = { sort: VideoSort; types: ThumbTypeFilter[]; channelId: string | null; period: VideoPeriod };

const SORT_LABELS: Record<VideoSort, string> = { score: "Score", views: "Vues", date: "Date" };
const PERIOD_LABELS: Record<VideoPeriod, string> = { "30d": "30 jours", "12m": "12 mois", all: "Tout" };
const ALL_CHANNELS = "__all__";
const TYPE_OPTIONS: Array<{ id: ThumbTypeFilter; label: string }> = [
  ...THUMB_TYPES.map((type) => ({ id: type.id, label: type.label })),
  { id: UNCLASSIFIED_FILTER, label: UNCLASSIFIED_LABEL },
];
const GRID = "grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4";

type Props = { channels: ChannelListItem[]; version: string };

export default function VideoGrid({ channels, version }: Props) {
  const [filters, setFilters] = useState<Filters>({ sort: "score", types: [], channelId: null, period: "all" });
  const [pages, setPages] = useState(1);
  const [result, setResult] = useState<VideoListResponse | null>(null);
  const [failed, setFailed] = useState(false);

  const limit = Math.min(VIDEO_PAGE_SIZE * pages, VIDEO_MAX_LIMIT);
  const channelId = filters.channelId && channels.some((channel) => channel.id === filters.channelId) ? filters.channelId : null;

  useEffect(() => {
    let cancelled = false;
    channelsApi
      .videos({ sort: filters.sort, types: filters.types, channelId, period: filters.period, offset: 0, limit })
      .then((next) => {
        if (cancelled) return;
        setResult(next);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [filters.sort, filters.types, filters.period, channelId, limit, version]);

  const update = (patch: Partial<Filters>) => {
    setFilters((previous) => ({ ...previous, ...patch }));
    setPages(1);
  };

  const onTypeChanged = (videoId: string, thumbType: ThumbType) =>
    setResult((previous) =>
      previous && {
        ...previous,
        items: previous.items.map((item) => (item.videoId === videoId ? { ...item, thumbType, thumbTypeSource: "manual" } : item)),
      },
    );

  const channelItems = [
    { value: ALL_CHANNELS, label: "Toutes les chaînes" },
    ...channels.map((channel) => ({ value: channel.id, label: channel.title })),
  ];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          variant="outline"
          size="sm"
          aria-label="Trier par"
          value={[filters.sort]}
          onValueChange={(value) => {
            const next = VIDEO_SORTS.find((sort) => sort === value[0]);
            if (next) update({ sort: next });
          }}
        >
          {VIDEO_SORTS.map((sort) => (
            <ToggleGroupItem key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm">
                <ListFilter />
                {typesFilterLabel(filters.types)}
              </Button>
            }
          />
          <DropdownMenuContent align="start" className="min-w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Types de miniature</DropdownMenuLabel>
              {TYPE_OPTIONS.map((option) => (
                <DropdownMenuCheckboxItem
                  key={option.id}
                  checked={filters.types.includes(option.id)}
                  onCheckedChange={(checked) => update({ types: toggleFilterValue(filters.types, option.id, checked) })}
                >
                  {option.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Select
          items={channelItems}
          value={channelId ?? ALL_CHANNELS}
          onValueChange={(value) => update({ channelId: !value || value === ALL_CHANNELS ? null : value })}
        >
          <SelectTrigger size="sm" className="w-48" aria-label="Chaîne">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {channelItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ToggleGroup
          variant="outline"
          size="sm"
          aria-label="Période"
          value={[filters.period]}
          onValueChange={(value) => {
            const next = VIDEO_PERIODS.find((period) => period === value[0]);
            if (next) update({ period: next });
          }}
        >
          {VIDEO_PERIODS.map((period) => (
            <ToggleGroupItem key={period} value={period}>
              {PERIOD_LABELS[period]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {result && (
          <span className="ml-auto text-sm text-muted-foreground">
            {formatCount(result.total)} {result.total > 1 ? "miniatures" : "miniature"}
          </span>
        )}
      </div>

      {failed && (
        <Alert variant="destructive">
          <AlertTitle>Impossible de charger les miniatures.</AlertTitle>
        </Alert>
      )}

      {result === null ? (
        <div className={GRID}>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="aspect-video w-full" />
          ))}
        </div>
      ) : result.items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Aucune miniature</EmptyTitle>
            <EmptyDescription>Rien ne correspond à ces filtres pour l&apos;instant.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className={GRID}>
          {result.items.map((video) => (
            <VideoCard key={video.videoId} video={video} onTypeChanged={onTypeChanged} />
          ))}
        </div>
      )}

      {result && result.items.length < result.total ? (
        limit < VIDEO_MAX_LIMIT ? (
          <Button variant="outline" className="justify-self-center" onClick={() => setPages((count) => count + 1)}>
            Voir plus
          </Button>
        ) : (
          <p className="text-center text-sm text-muted-foreground">Affine les filtres pour voir les autres miniatures.</p>
        )
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Mount them in the section**

In `src/components/library/FollowedChannelsSection.tsx`, add the imports after the `FollowChannelDialog` import:

```tsx
import TypesSummary from "./followed-channels/TypesSummary";
import VideoGrid from "./followed-channels/VideoGrid";
```

Replace:

```tsx
  const { data, error, reload } = useFollowedChannels();
```

with:

```tsx
  const { data, error, reload, version } = useFollowedChannels();
```

Replace:

```tsx
          ) : null}
```

with:

```tsx
          ) : (
            <>
              <TypesSummary channels={data.channels} version={version} />
              <VideoGrid channels={data.channels} version={version} />
            </>
          )}
```

- [ ] **Step 5: Type-check, lint, run the suite**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/components/library/FollowedChannelsSection.tsx src/components/library/followed-channels/TypesSummary.tsx src/components/library/followed-channels/VideoGrid.tsx src/components/library/followed-channels/VideoCard.tsx src/components/library/followed-channels/ThumbTypeMenu.tsx
./node_modules/.bin/vitest run
```

Expected: `tsc` exits 0; no ESLint errors; every test passes.

- [ ] **Step 6: Check in the browser (throwaway dev server, seeded, no outbound action)**

Start a throwaway dev server and seed it exactly as in Task 12 Step 8 (fresh `mktemp -d`, blanked keys, `curl /api/channels`, seed script). Open `http://localhost:3100/bibliotheque?onglet=inspirations`; never click « Lancer le classement », « Actualiser », « Réessayer » or « Tout actualiser ».
1. « Les types qui marchent »: rows ranked by score médian with « ×… » values, « Miniatures » counts and a best thumbnail (the five real video ids of « Ma chaîne de test » show real images, the others YouTube's grey placeholder); types with fewer than 3 scored rows show « peu de données » after the ranked ones. Portée « Ma chaîne » and « Chaîne tierce » change the rows.
2. Grid: 60 cards sorted by score (green badges « ×9,0 » / « ×4,5 » first, red « ×0,3 » later, then « Récente · … vues/j » in blue), each with title, « Ma chaîne de test · 12 sept. 2026 · 90 k vues »-style line and a type button (« Non classée » for unclassified ones). The counter reads « 300 miniatures ».
3. « Voir plus » → 120 cards. Sort « Vues » → highest views first; « Date » → newest first (two « Récente » cards per channel on top).
4. Type filter: tick « Visage + texte » → only that type; also tick « Non classée » → label « 2 types »; untick both. Chaîne « Chaîne tierce » → only its cards (counter 150). Période « 30 jours » → only videos of the last 30 days.
5. On an unclassified card, type button → « Avant / Après » → the button reads « Avant / Après » right away; reload the page → still « Avant / Après » (tooltip « Corrigée à la main »).
6. Card « … » → « Voir sur YouTube » opens a new tab (close it).
7. At 375 px wide (`resize_window` preset `mobile`), filters wrap, the grid shows one column, no horizontal scroll; reset to `desktop`.

Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add src/components/library/FollowedChannelsSection.tsx src/components/library/followed-channels/TypesSummary.tsx src/components/library/followed-channels/VideoGrid.tsx src/components/library/followed-channels/VideoCard.tsx src/components/library/followed-channels/ThumbTypeMenu.tsx
git commit -m "feat(channels): types that work, thumbnail grid with sort, filters and manual types" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 14: « Utiliser comme référence » and « Ouvrir dans une miniature… »

**Files:**
- Create: `src/lib/canvas/pending-reference.ts`, `src/components/library/followed-channels/UseAsReferenceDialog.tsx`
- Modify: `src/components/library/followed-channels/VideoCard.tsx`, `src/components/library/followed-channels/VideoGrid.tsx`, `src/components/library/FollowedChannelsSection.tsx` (as written by Tasks 12–13), `src/components/Canvas.tsx` (chantier C edited it — re-read first)
- Test: `tests/canvas/pending-reference.test.ts`

**Interfaces:**
- Consumes: Task 2 — `libraryImageUrl`, `type UseVideoResponse`, `type VideoListItem`; Task 11 — `channelsApi.use`, `ApiError`; `GET /api/miniatures`, `GET /api/swipe-files`; canvas store `addNode`, `selectOnly`, `loadProject`; `viewportCenterPosition` (`src/lib/canvas/placement.ts`); `useStoreApi` (`@xyflow/react`).
- Produces:
  - `src/lib/canvas/pending-reference.ts`: `PENDING_REFERENCE_PARAM = "reference"`, `referenceLinkFor(projectId: string, swipeFileId: string): string`, `readPendingReference(search: string): string | null`, `referenceNodeData(swipeFileId: string, label: string): { kind: "reference"; imageUrl: string; label: string }`.
  - `UseAsReferenceDialog` default export `{ video: VideoListItem; onClose: () => void }` (mounted with `key={video.videoId}` while a video is chosen).
  - `VideoCard` gains `onUse: (video: VideoListItem) => void`; `VideoGrid` gains `onUse: (video: VideoListItem) => void`.
  - `/m/<projectId>?reference=<swipeFileId>` adds one « Image de référence » node with that library image after the canvas loads, as one undo step, then removes the parameter.

- [ ] **Step 1: Write the failing tests**

Create `tests/canvas/pending-reference.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readPendingReference, referenceLinkFor, referenceNodeData } from "@/lib/canvas/pending-reference";

describe("pending reference", () => {
  it("links to a miniature with the library image to add", () => {
    expect(referenceLinkFor("proj_1726480000000", "0f5c2c1e-4b1d-4a5e-9d7e-1b2c3d4e5f60")).toBe(
      "/m/proj_1726480000000?reference=0f5c2c1e-4b1d-4a5e-9d7e-1b2c3d4e5f60",
    );
    expect(referenceLinkFor("a b", "c")).toBe("/m/a%20b?reference=c");
  });

  it("reads only a plausible library id from the query string", () => {
    expect(readPendingReference("?reference=0f5c2c1e-4b1d-4a5e-9d7e-1b2c3d4e5f60")).toBe("0f5c2c1e-4b1d-4a5e-9d7e-1b2c3d4e5f60");
    expect(readPendingReference("?other=1&reference=abc_123.png")).toBe("abc_123.png");
    expect(readPendingReference("?reference=../secret")).toBeNull();
    expect(readPendingReference("?reference=")).toBeNull();
    expect(readPendingReference("")).toBeNull();
  });

  it("builds the reference node data the library picker also uses", () => {
    expect(referenceNodeData("abc", "Ma vidéo")).toEqual({
      kind: "reference",
      imageUrl: "/api/swipe-files/image?f=abc",
      label: "Ma vidéo",
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/canvas/pending-reference.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/canvas/pending-reference"`.

- [ ] **Step 3: Write the helper**

Create `src/lib/canvas/pending-reference.ts`:

```ts
import { libraryImageUrl } from "@/lib/youtube/types";

/**
 * « Ouvrir dans une miniature… »: the library opens /m/<id>?reference=<swipeFileId>
 * and the canvas adds the image as a reference node once the project is loaded
 * (through the store, so it is one undo step and a normal autosave).
 */

export const PENDING_REFERENCE_PARAM = "reference";

const LIBRARY_ID = /^[\w.-]{1,100}$/;

export function referenceLinkFor(projectId: string, swipeFileId: string): string {
  return `/m/${encodeURIComponent(projectId)}?${PENDING_REFERENCE_PARAM}=${encodeURIComponent(swipeFileId)}`;
}

export function readPendingReference(search: string): string | null {
  const value = new URLSearchParams(search).get(PENDING_REFERENCE_PARAM);
  return value && LIBRARY_ID.test(value) && !value.includes("..") ? value : null;
}

export function referenceNodeData(swipeFileId: string, label: string): { kind: "reference"; imageUrl: string; label: string } {
  return { kind: "reference", imageUrl: libraryImageUrl(swipeFileId), label };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/canvas/pending-reference.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the dialog**

Create `src/components/library/followed-channels/UseAsReferenceDialog.tsx`:

```tsx
"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2 } from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { referenceLinkFor } from "@/lib/canvas/pending-reference";
import type { UseVideoResponse, VideoListItem } from "@/lib/youtube/types";
import { ApiError, channelsApi } from "./api";

type CopyState = { status: "copying" } | { status: "copied"; copy: UseVideoResponse } | { status: "error"; message: string };
type ProjectOption = { id: string; name: string };

type Props = { video: VideoListItem; onClose: () => void };

/** Copies the thumbnail into the library, then offers to open a miniature with it as a reference. */
export default function UseAsReferenceDialog({ video, onClose }: Props) {
  const router = useRouter();
  const [state, setState] = useState<CopyState>({ status: "copying" });
  const [projects, setProjects] = useState<ProjectOption[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    channelsApi
      .use(video.videoId)
      .then((copy) => {
        if (!cancelled) setState({ status: "copied", copy });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: "error", message: err instanceof ApiError ? err.message : "Copie impossible" });
      });
    fetch("/api/miniatures", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<ProjectOption[]>) : []))
      .then((list) => {
        if (!cancelled) setProjects(list);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [video.videoId]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Utiliser comme référence</DialogTitle>
          <DialogDescription className="line-clamp-2">{video.title}</DialogDescription>
        </DialogHeader>

        {state.status === "copying" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Copie dans ta bibliothèque…
          </p>
        )}

        {state.status === "error" && (
          <Alert variant="destructive">
            <AlertTitle>{state.message}</AlertTitle>
          </Alert>
        )}

        {state.status === "copied" && (
          <div className="grid gap-4">
            <div className="flex items-center gap-3">
              <img src={state.copy.imageUrl} alt="" className="aspect-video w-32 shrink-0 rounded-md object-cover" />
              <p className="text-sm">Ajoutée à ta bibliothèque (Inspirations → Mes images).</p>
            </div>
            <div className="grid gap-2">
              <p className="text-sm font-medium">Ouvrir dans une miniature…</p>
              {projects === null ? (
                <Skeleton className="h-9 w-full" />
              ) : projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune miniature pour l&apos;instant : crée-en une dans « Mes miniatures ».</p>
              ) : (
                <div className="grid max-h-64 gap-1 overflow-y-auto">
                  {projects.map((project) => (
                    <Button
                      key={project.id}
                      variant="ghost"
                      className="justify-start"
                      onClick={() => router.push(referenceLinkFor(project.id, state.copy.swipeFileId))}
                    >
                      <ImagePlus />
                      <span className="truncate">{project.name}</span>
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Thread « Utiliser comme référence » through the card, the grid and the section**

In `src/components/library/followed-channels/VideoCard.tsx`:
- replace `import { ExternalLink, MoreHorizontal } from "lucide-react";` with `import { ExternalLink, ImagePlus, MoreHorizontal } from "lucide-react";`
- replace

```tsx
  onTypeChanged: (videoId: string, thumbType: ThumbType) => void;
};

export default function VideoCard({ video, onTypeChanged }: Props) {
```

with

```tsx
  onTypeChanged: (videoId: string, thumbType: ThumbType) => void;
  onUse: (video: VideoListItem) => void;
};

export default function VideoCard({ video, onTypeChanged, onUse }: Props) {
```

- right after the « Voir sur YouTube » item:

```tsx
                  Voir sur YouTube
                </DropdownMenuItem>
```

insert

```tsx
                <DropdownMenuItem onClick={() => onUse(video)}>
                  <ImagePlus />
                  Utiliser comme référence
                </DropdownMenuItem>
```

In `src/components/library/followed-channels/VideoGrid.tsx`:
- replace `type VideoListResponse,` in the `@/lib/youtube/types` import with `type VideoListItem,\n  type VideoListResponse,`
- replace

```tsx
type Props = { channels: ChannelListItem[]; version: string };

export default function VideoGrid({ channels, version }: Props) {
```

with

```tsx
type Props = { channels: ChannelListItem[]; version: string; onUse: (video: VideoListItem) => void };

export default function VideoGrid({ channels, version, onUse }: Props) {
```

- replace `<VideoCard key={video.videoId} video={video} onTypeChanged={onTypeChanged} />` with `<VideoCard key={video.videoId} video={video} onTypeChanged={onTypeChanged} onUse={onUse} />`

In `src/components/library/FollowedChannelsSection.tsx`:
- add the imports

```tsx
import type { VideoListItem } from "@/lib/youtube/types";
import UseAsReferenceDialog from "./followed-channels/UseAsReferenceDialog";
```

- replace

```tsx
  const [followOpen, setFollowOpen] = useState(false);
```

with

```tsx
  const [followOpen, setFollowOpen] = useState(false);
  const [referenceVideo, setReferenceVideo] = useState<VideoListItem | null>(null);
```

- replace `<VideoGrid channels={data.channels} version={version} />` with `<VideoGrid channels={data.channels} version={version} onUse={setReferenceVideo} />`
- replace

```tsx
      <FollowChannelDialog open={followOpen} onOpenChange={setFollowOpen} onFollowed={() => void reload()} />
```

with

```tsx
      <FollowChannelDialog open={followOpen} onOpenChange={setFollowOpen} onFollowed={() => void reload()} />
      {referenceVideo && (
        <UseAsReferenceDialog key={referenceVideo.videoId} video={referenceVideo} onClose={() => setReferenceVideo(null)} />
      )}
```

- [ ] **Step 7: Add the pending reference in the canvas**

Re-read `src/components/Canvas.tsx` on the latest `main` (chantier C removed its drag-and-drop handlers). Then:

1. In the `@xyflow/react` import, add `useStoreApi` next to `useReactFlow`.
2. Add the imports:

```tsx
import { readPendingReference, referenceNodeData } from "@/lib/canvas/pending-reference";
import { viewportCenterPosition } from "@/lib/canvas/placement";
```

3. In the `useCanvasStore()` destructuring of `CanvasInner`, add `selectOnly,` after `loadProject,`.
4. Right after `const { screenToFlowPosition } = useReactFlow();`, add:

```tsx
  const flowStore = useStoreApi();

  // « Ouvrir dans une miniature… » from the library: /m/<id>?reference=<swipeFileId>.
  // Runs once the project is loaded, so the node goes through addNode (one undo
  // step, normal autosave that the sync poll recognises as our own save).
  const addPendingReference = useCallback(
    async (id: string) => {
      const swipeFileId = readPendingReference(window.location.search);
      if (!swipeFileId) return;
      window.history.replaceState(null, "", `/m/${encodeURIComponent(id)}`);
      try {
        const res = await fetch("/api/swipe-files", { cache: "no-store" });
        const files = (res.ok ? await res.json() : []) as Array<{ filename: string; title: string }>;
        const file = files.find((entry) => entry.filename === swipeFileId);
        if (!file) return;
        const { width, height, transform } = flowStore.getState();
        const nodeId = addNode("swipeFile", viewportCenterPosition({ width, height }, transform), referenceNodeData(file.filename, file.title));
        selectOnly([nodeId]);
      } catch {
        // The library image could not be looked up: open the miniature unchanged.
      }
    },
    [addNode, flowStore, selectOnly],
  );
```

If chantier C changed the shape of `GET /api/swipe-files` (re-read `src/app/api/swipe-files/route.ts`), use its id and title fields instead of `filename` / `title`.

5. In the load effect, replace:

```tsx
          loadProject(projectId);
```

with:

```tsx
          loadProject(projectId).then(() => {
            if (!cancelled) void addPendingReference(projectId);
          });
```

and its dependency list `}, [loadProject, projectId, router]);` with `}, [loadProject, projectId, router, addPendingReference]);`.

- [ ] **Step 8: Type-check, lint, run the suite**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/lib/canvas/pending-reference.ts src/components/library/followed-channels/UseAsReferenceDialog.tsx src/components/library/followed-channels/VideoCard.tsx src/components/library/followed-channels/VideoGrid.tsx src/components/library/FollowedChannelsSection.tsx src/components/Canvas.tsx tests/canvas/pending-reference.test.ts
./node_modules/.bin/vitest run
```

Expected: `tsc` exits 0; no new ESLint errors; every test passes.

- [ ] **Step 9: Check in the browser (throwaway dev server, seeded)**

Start and seed a throwaway dev server as in Task 12 Step 8, then create a test project: `curl -s -X POST http://localhost:3100/api/projects -H 'content-type: application/json' -d '{"name":"Test référence"}'`. Downloading a public thumbnail from `i.ytimg.com` is allowed here (not an API call); never click « Lancer le classement ».
1. `/bibliotheque?onglet=inspirations`, sort « Date », on a « Ma chaîne de test » card showing a real image (« Vidéo test 1 » … « Vidéo test 5 ») → « … » → « Utiliser comme référence ». The dialog shows « Copie dans ta bibliothèque… », then the copied image, « Ajoutée à ta bibliothèque (Inspirations → Mes images). » and « Test référence » under « Ouvrir dans une miniature… ».
2. « Fermer », reopen « Utiliser comme référence » on the same card: same image, and « Mes images » (chantier C's section above) lists it only once.
3. On a card with a fake id (for example « Vidéo test 20 — Chaîne tierce ») → « Miniature introuvable sur YouTube ».
4. Back on a real-image card → « Test référence »: the canvas `/m/<id>` opens, the URL no longer contains `?reference=`, one « Image » reference node titled « Vidéo test … — Ma chaîne de test » sits at the view centre, selected, showing the thumbnail.
5. Wait 5 s (autosave + sync poll): the node stays and the canvas does not flash. ⌘Z removes it, ⇧⌘Z brings it back. Reload the page: the node is still there and no second node was added.

Stop the dev server.

- [ ] **Step 10: Commit**

```bash
git add src/lib/canvas/pending-reference.ts src/components/library/followed-channels/UseAsReferenceDialog.tsx src/components/library/followed-channels/VideoCard.tsx src/components/library/followed-channels/VideoGrid.tsx src/components/library/FollowedChannelsSection.tsx src/components/Canvas.tsx tests/canvas/pending-reference.test.ts
git commit -m "feat(channels): use a followed thumbnail as reference and open it in a miniature" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 15: « Chaînes suivies » tab in the library picker

**Files:**
- Create: `src/components/library/followed-channels/FollowedChannelsPickerTab.tsx`
- Modify: `src/components/library/picker-tabs.tsx` (chantier C's file — re-read first)

**Interfaces:**
- Consumes: chantier C — `type LibraryPick`, `PICKER_TABS` (`src/components/library/picker-tabs.tsx`); Task 11 — `channelsApi`, `ApiError`, `formatViews`, `performanceBadge`, `PERFORMANCE_BADGE_CLASSES`; Task 2 — `VIDEO_PAGE_SIZE`, `VIDEO_MAX_LIMIT`, types.
- Produces: `FollowedChannelsPickerTab` default export `{ query: string; onPick: (item: LibraryPick) => void }`; `PICKER_TABS.inspirations` ends with `{ id: "chaines-suivies", label: "Chaînes suivies", render }`. Picking copies the thumbnail through `POST /api/channels/videos/[videoId]/use` and calls `onPick({ imageUrl: "/api/swipe-files/image?f=…", label })`.

- [ ] **Step 1: Re-read chantier C's picker files**

```bash
cat src/components/library/picker-tabs.tsx
grep -n "PICKER_TABS\|query\|onPick" src/components/library/LibraryPickerDialog.tsx
```

Expected: `PICKER_TABS` with an `inspirations` array of `PickerTab` objects whose `render({ query, onPick })` returns JSX; the dialog passes its search box value as `query`.

- [ ] **Step 2: Write the tab**

Create `src/components/library/followed-channels/FollowedChannelsPickerTab.tsx`:

```tsx
"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "cn";
import type { LibraryPick } from "@/components/library/picker-tabs";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  VIDEO_MAX_LIMIT,
  VIDEO_PAGE_SIZE,
  type ChannelsResponse,
  type VideoListItem,
  type VideoListResponse,
} from "@/lib/youtube/types";
import { ApiError, channelsApi } from "./api";
import { PERFORMANCE_BADGE_CLASSES, formatViews, performanceBadge } from "./view";

type Props = { query: string; onPick: (item: LibraryPick) => void };

/** Followed-channel thumbnails sorted by score, for a reference-image node. Picking copies into the library first. */
export default function FollowedChannelsPickerTab({ query, onPick }: Props) {
  const [search, setSearch] = useState(query.trim());
  const [pages, setPages] = useState(1);
  const [channels, setChannels] = useState<ChannelsResponse | null>(null);
  const [result, setResult] = useState<VideoListResponse | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const limit = Math.min(VIDEO_PAGE_SIZE * pages, VIDEO_MAX_LIMIT);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setPages(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    channelsApi
      .list()
      .then((data) => {
        if (!cancelled) setChannels(data);
      })
      .catch(() => {
        if (!cancelled) setError("Impossible de charger les chaînes suivies.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    channelsApi
      .videos({ sort: "score", q: search, offset: 0, limit })
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch(() => {
        if (!cancelled) setError("Impossible de charger les miniatures.");
      });
    return () => {
      cancelled = true;
    };
  }, [search, limit]);

  const pick = async (video: VideoListItem) => {
    setPicking(video.videoId);
    setError(null);
    try {
      const copy = await channelsApi.use(video.videoId);
      onPick({ imageUrl: copy.imageUrl, label: copy.label });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Copie impossible");
    } finally {
      setPicking(null);
    }
  };

  if (channels && !channels.youtubeConfigured) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Clé YouTube manquante</EmptyTitle>
          <EmptyDescription>Ajoute ta clé YouTube (gratuite) pour retrouver ici les miniatures des chaînes que tu suis.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/reglages/connexions" target="_blank" className={buttonVariants({ variant: "outline" })}>
            Ouvrir Réglages → Connexions
          </Link>
        </EmptyContent>
      </Empty>
    );
  }

  if (channels && channels.channels.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Aucune chaîne suivie</EmptyTitle>
          <EmptyDescription>Suis une chaîne dans la Bibliothèque pour choisir parmi ses miniatures.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/bibliotheque?onglet=inspirations" target="_blank" className={buttonVariants({ variant: "outline" })}>
            Suivre une chaîne
          </Link>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="grid gap-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {result === null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="aspect-video w-full" />
          ))}
        </div>
      ) : result.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {search ? `Aucune miniature ne correspond à « ${search} ».` : "Aucune miniature importée pour l'instant."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {result.items.map((video) => {
            const badge = performanceBadge(video.performance);
            return (
              <Button
                key={video.videoId}
                variant="ghost"
                disabled={picking !== null}
                onClick={() => void pick(video)}
                className="h-auto w-full min-w-0 flex-col items-stretch gap-1 p-1 text-left whitespace-normal"
              >
                <span className="relative block aspect-video overflow-hidden rounded-md bg-muted">
                  <img src={video.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover" />
                  {badge && (
                    <Badge className={cn("absolute top-1.5 left-1.5", PERFORMANCE_BADGE_CLASSES[badge.tone])}>{badge.label}</Badge>
                  )}
                  {picking === video.videoId && (
                    <span className="absolute inset-0 flex items-center justify-center bg-background/70">
                      <Loader2 className="size-5 animate-spin" />
                    </span>
                  )}
                </span>
                <span className="line-clamp-2 text-xs font-medium">{video.title}</span>
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {video.channelTitle} · {formatViews(video.viewCount)}
                </span>
              </Button>
            );
          })}
        </div>
      )}
      {result && result.items.length < result.total && limit < VIDEO_MAX_LIMIT && (
        <Button variant="outline" size="sm" className="justify-self-center" onClick={() => setPages((count) => count + 1)}>
          Voir plus
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Append the tab to `PICKER_TABS.inspirations`**

In `src/components/library/picker-tabs.tsx`, add the import next to the other component imports:

```tsx
import FollowedChannelsPickerTab from "./followed-channels/FollowedChannelsPickerTab";
```

and add this object as the **last** element of the `inspirations: [ … ]` array (after chantier C's own tab objects):

```tsx
    {
      id: "chaines-suivies",
      label: "Chaînes suivies",
      render: ({ query, onPick }) => <FollowedChannelsPickerTab query={query} onPick={onPick} />,
    },
```

- [ ] **Step 4: Type-check, lint, run the suite**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/components/library/followed-channels/FollowedChannelsPickerTab.tsx src/components/library/picker-tabs.tsx
./node_modules/.bin/vitest run
```

Expected: `tsc` exits 0; no ESLint errors; every test passes (chantier C's picker tests, if any, still pass).

- [ ] **Step 5: Check in the browser (throwaway dev server, seeded)**

Start and seed a throwaway dev server as in Task 12 Step 8; create a project with `curl -s -X POST http://localhost:3100/api/projects -H 'content-type: application/json' -d '{"name":"Test picker"}'` and open it from `/miniatures`. Never click « Générer ».
1. Add an « Image de référence » step (« Ajouter une étape » panel) → « Choisir dans la bibliothèque » → the dialog on Inspirations shows chantier C's tab(s) and a last tab « Chaînes suivies ».
2. « Chaînes suivies »: tiles sorted by score with the same coloured badges as the page grid (« ×9,0 » first), title and « channel · views » line; « Voir plus » adds 60.
3. Type `test 3` in the dialog's search box: after ~0,3 s only titles containing « test 3 » remain; clear it.
4. Click a tile with a real image (search `Vidéo test 1 — Ma chaîne`): spinner on the tile, the dialog closes, the node shows the thumbnail with label « Vidéo test 1 — Ma chaîne de test ».
5. Click a tile with a fake id: the tab shows « Miniature introuvable sur YouTube » and the node is unchanged.
6. Delete the YouTube key (`curl -s -X DELETE "http://localhost:3100/api/settings?key=youtubeApiKey"`), reopen the dialog's « Chaînes suivies » tab: « Clé YouTube manquante » with the Réglages link.

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/components/library/followed-channels/FollowedChannelsPickerTab.tsx src/components/library/picker-tabs.tsx
git commit -m "feat(channels): « Chaînes suivies » tab in the library picker" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
## Task 16: Docker rebuild and live verification

**Files:** none modified (verification only). If a check fails, fix it in the file owned by the relevant task, re-run `tsc` + `vitest`, commit with a `fix(channels): …` message (with the co-author trailer), and only then continue — the single rebuild of this plan happens once every check that does not need the container passes locally.

**Safety rules for this task.** The container serves the user's real database and real API keys.
- Never modify or delete existing projects; open one only to look at it. Canvas checks happen in a new project named `Chaînes suivies (vérification)`; leave it in place and mention it in the report.
- Never change Réglages → Ma chaîne. Never click « Générer ».
- YouTube API calls are free (daily quota 10 000 units); keep them small: follow **one** third-party channel whose preview shows fewer than 150 videos.
- **AI classification costs money** and happens only with the user's explicit answer in this session (Step 2). Never click « Lancer le classement » without a new explicit yes that quotes the displayed count and cost.
- If a login page appears (`SITE_PASSWORD`), stop and ask the user to log in; never type a password.

- [ ] **Step 1: Make sure the branch is green and checked out in the main repository**

```bash
cd /Users/antoinevigneau/thumbgen-real
git status --short
git log --oneline -20
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
```

Expected: the commits of Tasks 1–15 are on the checked-out branch of `/Users/antoinevigneau/thumbgen-real` (if the work lives in another worktree, stop and ask the user to merge or check it out here — Docker's `./data` bind mount is relative); no uncommitted change to this plan's files; `tsc` exits 0; all tests pass.

- [ ] **Step 2: Ask the user about paid classification (wait for the answer)**

Send the user this question and wait:

> Après la reconstruction, ouvrir ThumbGen importera « Ma chaîne » (gratuit, quota YouTube) puis classera automatiquement ses miniatures par type avec Gemini 2.5 Flash Lite — c'est payant (environ 0,08 $ pour 1 000 miniatures ; au-delà de 200 miniatures une confirmation s'affiche d'abord). Pour la vérification, tu préfères :
> **A.** garder le classement automatique (payant, quelques centimes) ;
> **B.** le désactiver pendant la vérification (rien n'est envoyé à OpenRouter ; tu pourras le réactiver dans Réglages → Génération d'images).

Record the answer. Without a clear A or B, do not continue.

- [ ] **Step 3: Rebuild and restart the container (the only rebuild)**

```bash
docker compose build thumbgen
```

If the answer was **B**, write the setting while the container is stopped (no other process holds the database), before the new version starts:

```bash
docker compose stop thumbgen
/opt/homebrew/bin/node -e 'const Database = require("better-sqlite3"); const db = new Database("data/thumbgen.db"); db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run("inspirationAutoClassify", "false"); db.close(); console.log("inspirationAutoClassify=false");'
```

Then (both answers):

```bash
docker compose up -d thumbgen
docker compose ps
until curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/miniatures | grep -qE "^(200|307|308|401)$"; do sleep 2; done
docker compose logs --tail 50 thumbgen
```

Expected: the build succeeds, `thumbgen` is « Up », no error in the logs (the channel tables are created at the first database access). `curl` never runs client JavaScript, so nothing is synced yet.

- [ ] **Step 4: Réglages and « Ma chaîne »**

1. `http://localhost:3000/reglages/generation`: the switch « Classer automatiquement les miniatures (IA) » with « Gemini 2.5 Flash Lite (environ 0,08 $ pour 1 000 miniatures) »; it is off with answer B, on with answer A. Do not change it.
2. `http://localhost:3000/reglages/chaine`: note whether « Chaîne YouTube » is filled (read only). If it is empty, report that the auto-follow could not be checked live and skip items 3–4.
3. `http://localhost:3000/bibliotheque?onglet=inspirations`: « Chaînes suivies » shows the user's channel with the « Ma chaîne » badge and « Synchronisation… N vidéos » counting up, then « À jour à l'instant ». `docker compose logs --tail 30 thumbgen` shows no error.
4. In the browser pane, run in the page (JavaScript tool):

```js
const data = await fetch("/api/channels").then((r) => r.json());
const mine = data.channels.find((c) => c.isMine);
const videos = await fetch(`/api/channels/videos?channel=${mine.id}&sort=date&limit=1200`).then((r) => r.json());
({ total: videos.total, videoCount: mine.videoCount, medianViews: mine.medianViews, shortest: Math.min(...videos.items.map((v) => v.durationSeconds)), newest: videos.items.slice(0, 3).map((v) => [v.videoId, v.title, v.viewCount, v.performance]) })
```

   Expected: `total` equals `videoCount`; `medianViews` is a number. Open `https://www.youtube.com/@<handle>/shorts` (handle from the chip's channel) in a new tab: the first Short's id (from its URL) is not in the list (`videos.items.some((v) => v.videoId === "<id>")` is false). For two of the newest videos, open « Voir sur YouTube »: the view counts match YouTube's within its rounding; for a scored one, `viewCount ÷ medianViews` rounded to one decimal equals its badge.

- [ ] **Step 5: Follow a third-party channel**

1. « Suivre une chaîne » → type a handle → « Chercher »: preview with avatar, name, « … abonnés · N vidéos ». Repeat with other handles (each preview costs 1 unit) until one shows fewer than 150 videos; ask the user for a handle if three tries fail.
2. « Suivre »: the dialog closes, the chip appears at once with « Synchronisation… », then « À jour à l'instant »; `docker compose logs --tail 30 thumbgen` shows no error.
3. « Suivre une chaîne » with the same handle → « Déjà suivie », disabled.
4. The chip's « … » → « Actualiser »: status goes through « Synchronisation… » back to « À jour à l'instant ». « Tout actualiser »: every chip does the same, one after the other.
5. Unknown handle `@cette-chaine-nexiste-pas-thumbgen` → « Chaîne introuvable ».

- [ ] **Step 6: Grid, types and manual correction**

1. Sort « Score » / « Vues » / « Date », filters type / chaîne / période, « Voir plus » behave as in Task 13 Step 6 on real data; recent videos show « Récente · … vues/j ».
2. On a card of the third-party channel, type button → « Versus / comparaison »; « Actualiser » that channel; after the sync the card still reads « Versus / comparaison ».
3. With answer B only: set the same type by hand on 3 cards of that channel; « Les types qui marchent », portée on that channel, ranks « Versus / comparaison » with a median score; the other types read « peu de données » or are absent.

- [ ] **Step 7: Reference image and library picker**

1. « Nouvelle miniature » in `/miniatures` → name `Chaînes suivies (vérification)`.
2. Back in `/bibliotheque?onglet=inspirations`, a card → « Utiliser comme référence » → « Ajoutée à ta bibliothèque » → « Chaînes suivies (vérification) » → the canvas opens with one reference node showing the thumbnail, URL without `?reference=`; wait 5 s, reload: the node is still there, alone.
3. In that canvas, add an « Image de référence » step → « Choisir dans la bibliothèque » → tab « Chaînes suivies » → search part of a title → pick a tile → the node shows it.
4. « Mes images » lists each copied thumbnail once.

- [ ] **Step 8: App-open trigger**

Reload any page and read the network requests filtered on `sync-stale`: `POST /api/channels/sync-stale` answered `{"queued":0,"throttled":true}` (the first load of the session already triggered it; everything is fresh). The 12-hour rule itself is covered by `tests/channels/jobs.test.ts` and was exercised on the throwaway server in Task 11 — `last_synced_at` is never forced in the real database.

- [ ] **Step 9 (PAID — only with answer A): AI classification of the small channel**

1. After the third-party channel's sync, « Classement IA en cours · N miniatures restantes » appears, then disappears; cards get types (tooltip « Classée par l'IA — clique pour corriger »). If a « Classer N miniatures par type ? » notice appears instead (more than 200 pending, e.g. from « Ma chaîne »), stop and ask the user whether to click « Lancer le classement » for that exact count and « environ X $ »; without a yes, click « Plus tard » and continue.
2. `http://localhost:3000/usage`: log rows `google/gemini-2.5-flash-lite` with `/classify-thumbnail` and small costs; the totals include them.
3. The card corrected by hand in Step 6 still shows its manual type.
4. « Les types qui marchent » with portée « Toutes les chaînes » ranks types with at least 3 scored thumbnails.

- [ ] **Step 10: Clean up and report**

1. « Ne plus suivre » the third-party channel → confirm → its chip and cards disappear; the thumbnails copied in Step 7 remain in « Mes images ». Leave « Ma chaîne » and the project `Chaînes suivies (vérification)` in place.
2. `docker compose logs --tail 100 thumbgen | grep -i "error\|warn" || echo "no errors"`
3. With answer B, ask the user whether to turn « Classer automatiquement les miniatures (IA) » back on in Réglages → Génération d'images (do not toggle it without their answer).
4. Report every check above with pass/fail, the paid choice (A/B) and its outcome, the handle followed, the project left in the gallery, and any fix commits.

---

## Self-review against the spec

- §1 Données YouTube: key from `youtubeApiKey`, card without key and no request → Tasks 10, 12 (`YouTubeKeyCard`, `GET /api/channels` skips YouTube); resolution URL / @handle / UC… then `channels.list` → Task 4 (ruling 6); long-form playlist `UULF` + fallback `UU` with ≤ 3 min excluded → Tasks 4, 6 (ruling 5); paging 50 + `videos.list` by 50 → Tasks 4, 6; quota stop, keep data, « Quota YouTube atteint — reprise demain », resume → Task 6 (rulings 3, 4).
- §2 Stockage: both tables with every spec column, cascade, three indexes, thumbnails kept as `i.ytimg.com` URLs and copied only on use → Task 3 (+ ruling 2 columns), Task 10 `use`.
- §3 Score: median of the 50 latest > 7 days, score rounded « ×0,4 », « Récente » + vues/jour, bands, no score without median, pure tested module → Tasks 1, 11 (`formatScore`, `performanceBadge`), 9 (SQL sort, ruling 12).
- §4 Suivre et synchroniser: preview → « Suivre » → immediate `syncing` + background import → Tasks 10, 12; « Ma chaîne » auto-follow with `is_mine`, setting change moves the flag → Task 8 (ruling 7); sync steps 1–5 (walk until known, stats of all videos by 50, removals, median / `last_synced_at` / status, new thumbnails queued) → Task 6 + Task 8 kick; per-channel lock across tabs → Task 6 (ruling 1); app-open trigger for > 12 h, one after the other, « Actualiser », « Tout actualiser » → Tasks 8, 10, 11, 12 (ruling 8); « Ne plus suivre » with confirmation, library copies kept → Tasks 10, 12.
- §5 Classement: fixed type list → Task 2; cheap vision model via `getOpenRouterClient`, mqdefault, structured output validated, invalid → `other`, batches in background, concurrency, resume → Tasks 7, 8 (ruling 9); setting in Réglages → Génération d'images, default on → Task 7; confirmation above 200 with count and cost → Tasks 7, 8, 10, 12 (ruling 10); `generations_log` endpoint `classify-thumbnail` in Usage → Task 7; manual correction via the type badge, never overwritten → Tasks 3, 7, 10, 13; without key or setting off: « Non classée » + manual only → Tasks 7, 12, 13.
- §6 Interface: channel bar (avatar, name, « Ma chaîne », statuses, menu, « Suivre une chaîne », « Tout actualiser ») → Task 12; « Les types qui marchent » (median score, count, best thumbnail, scope, ≥ 3 threshold, « peu de données ») → Tasks 9, 13 (ruling 14); grid (16:9, 2-line title, channel, date, « 12 k vues », score or « Récente · 850 vues/j », editable type badge), sorts, filters, pages of 60 → Tasks 9, 13 (ruling 13); « Voir sur YouTube » → Task 13; « Utiliser comme référence » (best resolution copy titled like the video) + « Ouvrir dans une miniature… » adding a reference node → Tasks 5, 10, 14 (ruling 11); node picker tab sorted by score, copy then fill → Task 15 (ruling 15).
- §7 Routes: all nine listed routes → Task 10, plus `POST /api/channels/classification` (ruling 10).
- §8 Agent: out of scope — `get_channel_videos` untouched; `import_youtube_thumbnail` only switches to the shared helper (Task 5, ruling 16).
- Gestion des erreurs: no key → card, no request (Tasks 10, 12); unknown channel → preview message (Tasks 10, 12); quota (Task 6); network failure → `error` + message + « Réessayer », data kept (Tasks 6, 12, ruling 17); classification failure → « Non classée », retried, at most 3 tries (Task 7).
- Tests list: `performance.ts` (Task 1); sync with fake fetch — paged import, UULF missing → duration filter, stop on known, views update, removals, quota then resume, lock (Task 6); « Ma chaîne » auto-follow and setting change (Task 8); classification valid / invalid → `other`, manual never rewritten, cost estimate, logging (Tasks 2, 7); routes filters / sort / pagination / summary threshold (Tasks 9, 10); no test calls YouTube or OpenRouter (fake YouTube, injected client, Global Constraints).
- Vérifications manuelles: follow « Ma chaîne » and a third-party channel, no Shorts, views and scores → Task 16 Steps 4–5; update after 12 h / « Actualiser » → Task 11 Step 9 (throwaway) + Task 16 Steps 5, 8; small-channel AI classification with cost, manual correction kept after a sync → Task 16 Steps 6, 9 (paid, with consent); « Les types qui marchent » by scope → Tasks 13, 16; « Utiliser comme référence » and the node picker tab → Tasks 14, 15, 16.
- Hors champ respected: no OAuth, no private statistics, no Shorts, no new agent tool.
