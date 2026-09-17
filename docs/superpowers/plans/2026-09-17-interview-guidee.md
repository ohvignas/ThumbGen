# Interview guidée (chantier F2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The agent builds a thumbnail workflow with Antoine through a fixed guided interview — one clickable question at a time (`ask_user`), each answer placing or completing its `iv-*` node on the canvas live (`place_node`, server-side, broadcast as a transient `data-canvas-patch`) — ending on a recap whose « Générer » button (label and cost computed by the app) is the only way a generation starts.

**Architecture:** Two lanes. The **independent lane** (this plan's Tasks 1–12) builds everything that does not need chantier F1's run registry: a single client-tools module, the `ask_user` schema and its card, `list_followed_videos`, the shared « use a YouTube thumbnail » logic, a `place_node` core exposed as `buildPlaceNodeTool({ projectId, writePatch })` with an injected broadcast callback, the canvas store's `applyAgentPatch` / `knownUpdatedAt` and the save route's reinjection of agent nodes, the `generate` next action, the chat empty-state button and the GUIDED INTERVIEW prompt section. The **integration lane** (Tasks N1–N6, **not implemented until F1 is merged**) wires those pieces into F1's rewritten `route-handler.ts` (a `createUIMessageStream` writer), F1's `ChatPanel.tsx` (`useChat({ onData })`), F1's registry (`pendingClientRequest`) and F1's fake server model (« interview » scenario), then runs the browser check and the Docker rebuild.

**Tech Stack:** Next.js 16.2 App Router (Node runtime), React 19.2 + React Compiler lint, TypeScript strict, Tailwind v4, shadcn `base-nova` on Base UI (`@base-ui/react` 1.8), Vercel AI SDK `ai` 7.0.99 + `@ai-sdk/react` 4.0.102, `@xyflow/react` 12, Zustand 5, zod 4, better-sqlite3, vitest 4 (+ happy-dom 20).

**Spec:** `docs/superpowers/specs/2026-09-17-interview-guidee-design.md` — the binding authority. Prerequisite contracts: `docs/superpowers/specs/2026-09-17-agent-arriere-plan-design.md` and `docs/superpowers/plans/2026-09-17-agent-arriere-plan.md` (F1), `docs/superpowers/specs/2026-09-17-agent-canvas-sur-design.md` (urgent fix, merged in `795530b`). Deviations and precisions are listed under « Code reality vs spec (rulings) ».

## Global Constraints

- **Base and sequencing.** Code quoted here was read on `main` at `795530b` (urgent canvas-safe fix merged). F1 is implemented in parallel in `.worktrees/f1` and rewrites `src/lib/agent/v2/route-handler.ts` (imports + `postV2`), replaces `src/components/panels/ChatPanel.tsx` wholesale (its Task 9), and edits `chat-view-model.ts`, `Message.tsx`, `MessageList.tsx`, `useConversations.ts`, `local-storage.ts` (adds `getProjectName`), `layout.tsx`, `AppSidebar.tsx`, `MiniaturesView.tsx`. The independent lane therefore **never edits `route-handler.ts`, `ChatPanel.tsx` or `chat-view-model.ts`**, keeps its `MessageList.tsx` change to the empty-state block and its `local-storage.ts` change to `getProject` / `saveProject`. Every integration task starts by re-reading the F1 versions of the files it touches on the latest `main`.
- **Intermediate state is never merged or deployed.** Between Task 2 (ask_user declared to the model) and Task N1 (route resumes `ask_user`), a real model could call `ask_user` and the route would answer 400 on the resume. `feat/f2` is merged to `main` only after the integration lane is done; nothing of this lane is deployed before.
- **Paid-call safety (paramount).** No task adds an automatic model call: no new `sendAutomaticallyWhen` trigger beyond the existing client-tool resume (which follows a click on an answer), no retry loop, no call to `/api/generate/*` outside a click. The `thumbgen:generate-node` event is dispatched **only inside an `onClick` handler** and is never stored, replayed or dispatched from an effect. `ask_user` resumes only after `addToolOutput`, which only a click in the card calls. Tests never call a real model or the network (`fetch` stubbed, `fetchBestThumbnail` mocked).
- **Spec values (verbatim):** 8 questions, counter « Question n/8 »; `ask_user` input `question` 1–200, `step` 1–8, `multiple` (défaut false), `max_selected` 1–3 (si multiple), `options` 1–6 × `{ id, label ≤ 60, description? ≤ 140, image? }`, `allow_skip` (défaut true); outputs `{ selected: string[] }` | `{ other: string }` | `{ skipped: true }`; ids `iv-prompt`, `iv-persona`, `iv-ref-1..3`, `iv-logo-1..3`, `iv-generator`; columns right of the canvas at `maxX + 200`, prompt `+420`, generator `+840`, vertical spacing `240`; handles `faceReference → face-in`, logo → `logo-in`, reference → `ref-in`, `prompt → prompt-in`; chunk `{ type: "data-canvas-patch", id: node.id, transient: true, data: { projectId, updatedAt, node, edges } }`; model output `node id: <id>` and `linked to iv-generator`; fitView `duration` 400 (0 if reduced motion); history debounce 300 ms accepted; save response `{ updatedAt, reinjected, reinjectedEdges }`; next action `{ kind: "generate", node_id }`; tooltip « Élément introuvable »; event `thumbgen:generate-node` `{ nodeId }`; button « Construire avec l'agent » sends « Aide-moi à construire la miniature de ma vidéo. »; card copy « Autre… », « Envoyer », « Passer », « Valider »; folded line « <question> : <libellé choisi> », « Autre : … », « Passé »; images `stored:persona_<id>` → `/api/personas/image?id=<id>&angle=front`, `stored:sf_<uuid>` → `/api/swipe-files/image?f=<uuid>`, `stored:lg_<uuid>` → `/api/logos/image?f=<uuid>`, `youtube:<videoId>` → `https://i.ytimg.com/vi/<videoId>/mqdefault.jpg`.
- **shadcn here is `base-nova` on Base UI, not Radix.** Check `src/components/ui/*` before writing JSX (present: `button`, `input`, `toggle`, `tooltip`, `empty`, `card`, `badge`, `alert`, `collapsible`, `spinner`, … — no checkbox). Triggers take `render={<Button … />}`. A disabled `Button` with a tooltip uses `disabled focusableWhenDisabled` + `data-disabled:opacity-50`. `cn` from `"cn"`.
- **UI rules.** Only shadcn components and Tailwind classes (no `style={{…}}`). French copy; apostrophes in JSX text are `&apos;`. Animations respect `prefers-reduced-motion` (`motion-reduce:`). No synchronous `setState` inside effects (`react-hooks/set-state-in-effect`); React Compiler lint must stay clean on touched files (run eslint before/after, report pre-existing errors, never add one).
- **Commands.** Tests: `./node_modules/.bin/vitest run` (one file: `./node_modules/.bin/vitest run tests/path/file.test.ts`). Type-check: `./node_modules/.bin/tsc --noEmit` (errors only in `.next/types` / `.next/dev/types` → `rm -rf .next/types .next/dev/types` and re-run). Lint: `./node_modules/.bin/eslint <files>`. Node: `/opt/homebrew/bin/node`. No `npx`, no install (`node_modules` is a symlink). The machine is loaded: a failing test is re-run alone before concluding it fails. Full suite after every 3 tasks and at the end.
- **Data.** Tests use the temp DB of `tests/setup.ts`. Never read `.env*` or key settings, never touch `data/thumbgen.db`, no dev server needed in the independent lane.
- **Commits.** One commit per task, explicit paths only (never `git add -A` / `.`), message ends with a blank line and `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Never push.
- **Progress log.** `/Users/antoinevigneau/thumbgen-real/.superpowers/sdd/2026-09-17-interview-guidee/progress.md`: one line per task (commit, tests, deviations as « Ruling: … — why — cost if wrong »).

## Code reality vs spec (rulings)

1. **Client-tools module and existing importers.** `turn-model.ts` exports a `CLIENT_TOOL_NAMES` Set that `chat-view-model.ts` (an F1 file) imports. Ruling: `src/lib/agent/client-tools.ts` owns the list; `turn-model.ts` re-exports `CLIENT_TOOL_NAMES` as that module's Set so `chat-view-model.ts` is untouched. `should-auto-continue.ts`, `turn-model.ts`, `PendingUiAction.tsx` import it now; `route-handler.ts` (abandon scan + resume filter), `ChatPanel.tsx` (pending part detection, `respondToUiTool` tool name) and F1's `run-registry.ts` (`pendingClientRequest`) switch in the integration lane (N1–N3), because F1 rewrites those files.
2. **`ask_user` declared now.** Spec: « Déclaré dans `V2_CLIENT_TOOLS` ». Ruling: declared in Task 2 (the model can see it on `feat/f2`), with the intermediate-state constraint above. The route's resume filter and abandon scan learn `ask_user` in N1.
3. **`ask_user` validation details.** `max_selected` given while `multiple` is false is rejected; option `id`s must be unique (1–40 chars); `multiple` without `max_selected` allows up to `min(3, options.length)` selections. `other` text is trimmed, 1–300 characters (client-side `maxLength`). The abandon row `{ skipped: true, reason: "abandoned" }` reads « sans réponse » in the folded line (the user wrote a message instead of answering), a click on « Passer » reads « Passé ».
4. **Image shapes.** Persona and logo images are square tiles (3 columns), swipe files and YouTube thumbnails 16:9 (2 columns). A question mixing both uses the first image's shape. Options with an unrecognised `image` render as text options inside the grid tile (label only, placeholder area). A tile image that fails to load swaps to a muted placeholder (`onError` → state set from the event handler, not an effect).
5. **Folded line.** Built in `turn-model.ts`: the `ToolStep.label` of a completed `ask_user` is « <question> : <réponse> », so `SimpleToolPart` (and the live step line) need no change. Selected ids are mapped to their option labels, joined « , »; an unknown id is shown as is.
6. **`list_followed_videos` output.** Lines `- youtube:<videoId> — "<title>" — <channel> — type: <label> — perf: ×<score> | récente | n/a`, header « N vidéo(s) (<scope>, tri <sort>[, type <label>]) : ». « Ma chaîne » = `followed_channels.is_mine = 1`; none → a text answer saying so (not an error). `best_type: true` filters on the first `typesSummary(scope)` row with `enoughData`; none → no type filter and the header says « pas assez de données pour un meilleur type ». `limit` 1–12, default 5; `sort` default `date`; `scope` default `mine`. `channel_videos` already holds long videos only (sync drops shorts). Registered `chatOnly: true`.
7. **Use-thumbnail naming.** A function starting with `use` would be flagged by the hooks lint inside a route handler. Ruling: `src/lib/youtube/use-thumbnail.ts` exports `copyVideoThumbnailToLibrary(videoId)` returning `{ status: "existing" | "created"; swipeFileId; imageUrl; label } | { status: "unknown-video" | "not-found" | "unreachable" }`. The route maps them to 200 / 201 / 404 « Vidéo inconnue » / 404 « Miniature introuvable sur YouTube » / 502 « YouTube injoignable, réessaie » (unchanged responses). `import_youtube_thumbnail` uses it when the video is in `channel_videos` (label = video title, like the UI; the `label` argument is ignored there) and keeps its current path for other videos. Both answer with the same text (`Reference: stored:sf_<id>`) and image content (bytes read from `swipe_files`).
8. **Shared image resolution.** `blueprintToCanvasData`, `blueprintUpdateToCanvasData`, `resolveToDataUrl` and `MODEL_ID_MAP` move out of `apply-workflow.ts` into `src/lib/agent/tools/_helpers/blueprint-canvas-data.ts` (server) and `src/lib/agent/blueprint/models.ts` (pure: `BLUEPRINT_MODELS`, `MODEL_ID_MAP`), unchanged for `apply_workflow`. A new option `{ libraryUrls: true }` makes a `swipeFile` whose `image_source` is `stored:sf_<id>` / `stored:lg_<id>` carry `imageUrl` (`/api/swipe-files/image?f=<id>` / `/api/logos/image?f=<id>`) plus `image_source`, and no `imageBase64`; any other source still becomes `imageBase64`. When a node switches to an `imageUrl`, stale `imageBase64`, `sketchElements`, `sketchFiles` are dropped; when it switches to `imageBase64`, a stale `imageUrl` is dropped (the canvas shows `imageUrl` first).
9. **`place_node` node ids and types.** Ids are exactly `iv-prompt` (prompt), `iv-persona` (faceReference), `iv-ref-1..3` (swipeFile `kind: "reference"`), `iv-logo-1..3` (swipeFile `kind: "logo"`), `iv-generator` (generator, no `abTest`). Another id, a type/kind that does not match the id, or an existing canvas node with that id and another type → error, nothing written. The input accepts the flattened shape `apply_workflow` tolerates (`normalizeNode`). A new node is validated with the full blueprint schema, an existing one with the partial update schema (`image_source` optional). `kind` is forced from the id when missing.
10. **Transaction.** Existence checks and image resolution happen before; inside `db.transaction` the canvas is **re-read** and the merge is computed against that fresh read (no conflict refusal: the merge only touches `iv-*` nodes and adds edges). Unknown project → error « Project not found ». Before writing, a snapshot with a new reason `place_node` (own quota 20, deduplicated like the others; label « Avant un nœud de l'interview ») keeps the write reversible from « Historique de l'agent ». `writeProjectCanvas` gains an optional `now` so `projects.updated_at`, `projects_meta.updated_at` and `data.placedByAgentAt` are the exact same ISO string.
11. **Column placement.** The anchor is computed from the canvas nodes whose id does **not** start with `iv-` (so the interview columns do not drift as they grow): `left = maxRight + 200` (`maxRight` = max of `x + (measured.width ?? width ?? 320)`, `left = 0` on an empty canvas), `top` = min `y` of those nodes (0 if none). Inputs (persona, references, logos) go in column `left`, at `top + 240 × i` for the first free slot `i` (a slot is taken when an `iv-*` input node sits within 120 px of it in that column); prompt at `(left + 420, top)`; generator at `(left + 840, top)`. A recreated node (deleted by Antoine, updated again by the agent) takes the first free slot.
12. **Edges.** When `iv-generator` is on the merged canvas, every interview node present gets an edge to it on its deduced handle (swipeFile handle from its merged `kind`), deduplicated on `(source, target, targetHandle)` against all existing edges; ids `e-<uuid8>`, `sourceHandle: null` (same shape as `apply_workflow`). The patch's `edges` are **the edges added by this call** only. `linked to iv-generator` is appended when the placed node ends up connected to `iv-generator` (it is the generator, or an edge from it exists).
13. **Where the core lives.** `src/lib/agent/place-node.ts` (server, DB) exports the schema and `placeInterviewNode(projectId, input)`; `src/lib/agent/v2/place-node-tool.ts` exports `buildPlaceNodeTool({ projectId, writePatch })` (an AI SDK `tool()`, never registered, so never listed by MCP) and calls `writePatch(patch)` after a successful write; a throwing `writePatch` is logged and ignored (the DB is already written, the canvas reloads from it). Model output goes through the adapter's error-text/content mapping, exported from `tool-adapter.ts` as `toolResultToModelOutput` (not an F1 file). Client-safe patch types and guards live in `src/lib/canvas/canvas-patch.ts`.
14. **Timestamps compare as instants.** Old rows may hold SQLite `datetime('now')` values (`YYYY-MM-DD HH:MM:SS`, UTC). `compareUpdatedAt(a, b)` parses both forms (like `parseStoredTimestamp`) and falls back to string comparison when a value is unparsable. Used by the save route (`placedByAgentAt > baseUpdatedAt`), `shouldApplyCanvasPatch` and the store's max of known timestamps.
15. **Save route.** `saveProject(id, nodes, edges, baseUpdatedAt?)` returns `{ updatedAt, reinjected, reinjectedEdges }`. With a `baseUpdatedAt` (non-empty string), inside the same transaction, every DB node with `placedByAgentAt` after it and absent from the payload is appended, with its DB edges whose two ends exist in the final node list and that are not already in the payload (same `(source, target, targetHandle)`). Without it: nothing reinjected (old callers, other tabs on an old build). `GET /api/project` adds `updatedAt` (`null` when the project does not exist).
16. **Store.** `knownUpdatedAt: string | null` is set on load (`data.updatedAt ?? null`), on a successful save (max of current and response) and by `applyAgentPatch` (max). `saveProject` reads it when it builds the payload and sends `baseUpdatedAt` only when non-null. Reinjected nodes/edges whose id (edge: `(source, target, targetHandle)`) is not already local are appended without a history entry and without `dirty`. `applyAgentPatch(node, edges, updatedAt)`: no-op when `!loaded`; merges `data` over an existing node (position kept) or appends the node; dedupes edges; `pushHistory` (one debounced entry); never `dirty`, never saves; pushes `updatedAt` into `recentOwnSaveUpdatedAts`. The acceptance rule (`projectId` open, `loaded`, `updatedAt > knownUpdatedAt`) is the pure `shouldApplyCanvasPatch` so `ChatPanel` (N3) and tests share it. Known limitation accepted: a node Antoine deletes during the few ms between a save payload and its response can come back through `reinjected` (the next save then respects the deletion in the DB).
17. **Poller.** `createProjectSyncPoller` treats `updated_at === knownUpdatedAt` like one of `recentOwnSaveUpdatedAts` (re-baseline, no reload), after the existing `dirty` check.
18. **`generate` action.** `finish_turn.next_actions[].label` becomes optional in the schema, still required (1–40) for `ask_agent` / `focus_node`; `generate` requires `node_id` and ignores a label. `NextAction` gains `{ kind: "generate"; nodeId }`. The existing test asserting that `kind: "generate"` is rejected is updated. The button label is computed at render by `generateActionState(nodeId, nodes, edges)` (`src/lib/canvas/generate-action.ts`): `planGeneration({ model, numImages, abTest, compareModels: [] }, inputsByVariant)` → « Générer · <generationSummary> · ~0,02 $ » (cost = Σ `MODEL_COSTS[task.model] × task.count`, French decimal comma; the cost part is omitted when 0). Missing node or not a generator → disabled with tooltip « Élément introuvable »; `data.isGenerating` → disabled « Génération en cours… ». `compareModels: []` matches what the event runs (`run([])`).
19. **Event helper.** `src/lib/canvas/generate-node-event.ts`: `requestNodeGeneration(nodeId)` (dispatch) and `subscribeNodeGeneration(nodeId, onRequest)` (returns the unsubscribe). `GeneratorNode` subscribes in an effect whose callback calls `run([])` — no state is set in the effect body itself. A test proves the button dispatches only on click and that rendering never dispatches.
20. **Empty-state button.** In the chat's empty state (`MessageList` when there is no message and no trailing row), extracted to `chat/ChatEmptyState.tsx`; the button calls `controls.onAskAgent(INTERVIEW_START_MESSAGE)` (existing path: creates the conversation if needed, ignored while busy).
21. **Prompt.** New static section « GUIDED INTERVIEW » in `AGENT_SYSTEM_PROMPT`, placed right after EXISTING WORKFLOW. While an interview runs it takes priority over EXISTING WORKFLOW, PROPOSING ANGLES and WHEN THE USER PICKS AN ANGLE (an angle pick at step 2 places `iv-prompt`, it never calls `apply_workflow`); on a non-empty canvas the interview only adds `iv-*` nodes to the right and never removes anything. The price table is built once at module load from `BLUEPRINT_MODELS` × `MODEL_COSTS` × `imageModelLabel` (static text → cache-safe). « ENDING EVERY TURN » gains: a turn paused on `ask_user` is not ended — no `finish_turn` in that step. Existing prompt tests stay green untouched; new tests go in `tests/agent/system-prompt-interview.test.ts`.
22. **Question numbering.** `step` is the fixed question number: a skipped question (empty list) does not renumber the next ones (« Question 4/8 » can follow « Question 2/8 »).

## File Structure

**Create (independent lane)**
- `src/lib/agent/client-tools.ts` — `CLIENT_TOOL_NAMES`, `ClientToolName`, `CLIENT_TOOL_NAME_SET`, `isClientToolName`, `clientToolNameOfPartType`.
- `src/lib/agent/browser-tools/ask-user.ts` — schema, limits, output readers, answer line, option images (pure, client-safe).
- `src/components/panels/chat/AskUserCard.tsx` — the question card.
- `src/lib/youtube/use-thumbnail.ts` — `copyVideoThumbnailToLibrary`.
- `src/lib/agent/tools/list-followed-videos.ts` — `list_followed_videos` (chat-only).
- `src/lib/agent/blueprint/models.ts` — `BLUEPRINT_MODELS`, `MODEL_ID_MAP` (pure).
- `src/lib/agent/tools/_helpers/blueprint-canvas-data.ts` — shared blueprint → canvas data mapping.
- `src/lib/canvas/canvas-patch.ts` — patch types, `isCanvasPatch`, `compareUpdatedAt`, `shouldApplyCanvasPatch` (pure, client-safe).
- `src/lib/agent/place-node.ts` — `placeNodeInputSchema`, `placeInterviewNode`, layout/handle helpers.
- `src/lib/agent/v2/place-node-tool.ts` — `PLACE_NODE_TOOL_NAME`, `buildPlaceNodeTool`.
- `src/lib/canvas/generate-action.ts`, `src/lib/canvas/generate-node-event.ts`.
- `src/components/panels/chat/ChatEmptyState.tsx`.
- Tests: `tests/agent/client-tools.test.ts`, `tests/agent/ask-user.test.ts`, `tests/chat/ask-user-card.test.tsx`, `tests/chat/ask-user-turn.test.ts`, `tests/channels/use-thumbnail.test.ts`, `tests/agent/import-youtube-thumbnail-reuse.test.ts`, `tests/agent/list-followed-videos.test.ts`, `tests/agent/blueprint-canvas-data.test.ts`, `tests/agent/place-node.test.ts`, `tests/canvas/canvas-patch.test.ts`, `tests/agent/project-save-reinject.test.ts`, `tests/canvas/canvas-store-agent-patch.test.ts`, `tests/canvas/generate-action.test.ts`, `tests/chat/turn-actions-generate.test.tsx`, `tests/chat/chat-empty-state.test.tsx`, `tests/agent/system-prompt-interview.test.ts`.

**Modify (independent lane)**
- `src/components/panels/chat/should-auto-continue.ts`, `src/components/panels/chat/turn-model.ts`, `src/components/panels/chat/PendingUiAction.tsx`, `src/components/panels/chat/TurnActions.tsx`, `src/components/panels/chat/MessageList.tsx` (empty-state block only).
- `src/lib/agent/v2/browser-client-tools.ts`, `src/lib/agent/v2/tool-adapter.ts` (export `toolResultToModelOutput`), `src/lib/agent/tool-labels.ts`, `src/lib/agent/finish-turn.ts`, `src/lib/agent/system-prompt.ts`, `src/lib/agent/blueprint/schema.ts` (export `normalizeNode`, `validateBlueprintNodeData`), `src/lib/agent/tools/apply-workflow.ts`, `src/lib/agent/tools/import-youtube-thumbnail.ts`, `src/lib/agent/tools/all.ts`.
- `src/app/api/channels/videos/[videoId]/use/route.ts`, `src/app/api/project/route.ts`, `src/lib/local-storage.ts` (`getProject`, `saveProject`), `src/lib/canvas-snapshots.ts` (reason `place_node`, `writeProjectCanvas(now?)`), `src/lib/canvas/agent-history.ts` (label).
- `src/store/canvas-store.ts`, `src/hooks/useCanvasSync.ts`, `src/components/nodes/GeneratorNode.tsx` (listener only).
- Tests updated: `tests/agent/finish-turn-tool.test.ts` (generate now accepted with `node_id`).

**Integration lane (after F1)** — `src/lib/agent/v2/route-handler.ts`, `src/components/panels/ChatPanel.tsx`, `src/lib/agent/v2/run-registry.ts`, `src/lib/agent/v2/fake-agent-model.ts`, tests `tests/agent/v2-route-handler-interview.test.ts`, `tests/agent/run-registry.test.ts`, `tests/chat/chat-panel-canvas-patch.test.ts`, `tests/agent/fake-agent-model.test.ts`.

## Execution lanes

| Lane | Tasks | Needs |
| --- | --- | --- |
| INDEPENDENT | 1 → 2 → 3 (client tools, `ask_user`, card) · 4 → 5 (thumbnail reuse, followed videos) · 6 → 7 (shared mapping, `place_node`) · 8 → 9 (save route, store/poller) · 10 (generate action) · 11 (empty state) · 12 (prompt, after 2, 5, 7, 10) | `main` at `795530b` |
| INTEGRATION | N1 → N2 → N3 → N4 → N5 → N6 | F1 merged into `main`, then `feat/f2` rebased or merged on it |

The independent tasks are executed in numeric order in one worktree (`.worktrees/f2`).

| Task | Files |
| --- | --- |
| 1 | `client-tools.ts`, `should-auto-continue.ts`, `turn-model.ts`, `PendingUiAction.tsx`, `tests/agent/client-tools.test.ts` |
| 2 | `browser-tools/ask-user.ts`, `browser-client-tools.ts`, `tool-labels.ts`, `tests/agent/ask-user.test.ts` |
| 3 | `AskUserCard.tsx`, `PendingUiAction.tsx`, `turn-model.ts`, `tests/chat/ask-user-card.test.tsx`, `tests/chat/ask-user-turn.test.ts` |
| 4 | `use-thumbnail.ts`, `use/route.ts`, `import-youtube-thumbnail.ts`, 2 tests |
| 5 | `list-followed-videos.ts`, `all.ts`, `tool-labels.ts`, 1 test |
| 6 | `blueprint/models.ts`, `_helpers/blueprint-canvas-data.ts`, `apply-workflow.ts`, `blueprint/schema.ts`, 1 test |
| 7 | `canvas-patch.ts`, `place-node.ts`, `v2/place-node-tool.ts`, `tool-adapter.ts`, `canvas-snapshots.ts`, `agent-history.ts`, `tool-labels.ts`, 2 tests |
| 8 | `local-storage.ts`, `api/project/route.ts`, 1 test |
| 9 | `canvas-store.ts`, `useCanvasSync.ts`, 1 test (+ `canvas-sync` cases) |
| 10 | `finish-turn.ts`, `turn-model.ts`, `generate-action.ts`, `generate-node-event.ts`, `TurnActions.tsx`, `GeneratorNode.tsx`, 2 tests + `finish-turn-tool.test.ts` |
| 11 | `ChatEmptyState.tsx`, `MessageList.tsx`, 1 test |
| 12 | `system-prompt.ts`, 1 test |

---

## Task 1: Client tools module

**Files:**
- Create: `src/lib/agent/client-tools.ts`
- Modify: `src/components/panels/chat/should-auto-continue.ts`, `src/components/panels/chat/turn-model.ts`, `src/components/panels/chat/PendingUiAction.tsx`
- Test: `tests/agent/client-tools.test.ts`

**Interfaces:**
- Produces (pure, client-safe):
  - `CLIENT_TOOL_NAMES = ["request_user_image", "request_user_sketch", "ask_user"] as const`
  - `type ClientToolName = (typeof CLIENT_TOOL_NAMES)[number]`
  - `CLIENT_TOOL_NAME_SET: ReadonlySet<string>`
  - `isClientToolName(name: string): name is ClientToolName`
  - `clientToolNameOfPartType(type: string): ClientToolName | null` (`"tool-ask_user"` → `"ask_user"`, anything else → `null`)
- `turn-model.ts` keeps `export const CLIENT_TOOL_NAMES: ReadonlySet<string>` (now `= CLIENT_TOOL_NAME_SET`).
- `PendingUiAction.tsx`: `toolName` typed `ClientToolName` via `clientToolNameOfPartType`.

- [ ] **Step 1: Write the failing test** — `tests/agent/client-tools.test.ts`:
  - the list is exactly the three names; `isClientToolName("ask_user")` true, `("finish_turn")` false; `clientToolNameOfPartType("tool-ask_user") === "ask_user"`, `("tool-list_logos") === null`, `("text") === null`;
  - `lastAssistantMessageIsCompleteWithClientToolCalls` returns true for a last step `{ type: "tool-ask_user", state: "output-available" }` and false for `state: "input-available"`;
  - `splitAssistantTurn` puts an `input-available` `tool-ask_user` part in `pending`, not in `steps`;
  - `turn-model`'s `CLIENT_TOOL_NAMES.has("ask_user")` is true.
- [ ] **Step 2: Run it** — fails (module missing).
- [ ] **Step 3: Implement** the module; in `should-auto-continue.ts` replace `CLIENT_TOOL_PART_TYPES` by `clientToolNameOfPartType(part.type) !== null`; in `turn-model.ts` replace the literal Set by the re-export; in `PendingUiAction.tsx` derive the name with `clientToolNameOfPartType` (behaviour unchanged for the two existing tools).
- [ ] **Step 4: Run** the new test and `tests/agent/should-auto-continue.test.ts`, `tests/chat/turn-model.test.ts`, `tests/chat/chat-view-model.test.ts`; `tsc`; eslint on touched files.
- [ ] **Step 5: Commit** — `feat(agent): single client-tools module (adds ask_user)`.

## Task 2: `ask_user` schema and client tool declaration

**Files:**
- Create: `src/lib/agent/browser-tools/ask-user.ts`
- Modify: `src/lib/agent/v2/browser-client-tools.ts`, `src/lib/agent/tool-labels.ts`
- Test: `tests/agent/ask-user.test.ts`

**Interfaces:**
- Consumes: `zod`.
- Produces (pure, client-safe):
  - `ASK_USER_TOOL_NAME = "ask_user"`, `ASK_USER_TOTAL_STEPS = 8`
  - `ASK_USER_LIMITS = { question: 200, options: 6, label: 60, description: 140, maxSelected: 3, other: 300, optionId: 40 }`
  - `askUserInputSchema` (zod) and `type AskUserInput = { question: string; step: number; multiple: boolean; max_selected?: number; options: AskUserOption[]; allow_skip: boolean }`, `type AskUserOption = { id: string; label: string; description?: string; image?: string }`
  - `type AskUserOutput = { selected: string[] } | { other: string } | { skipped: true; reason?: string }`
  - `parseAskUserInput(input: unknown): AskUserInput | null`
  - `readAskUserOutput(output: unknown): AskUserOutput | null` — raw form or persisted `{ type: "json", value }`
  - `askUserMaxSelected(input: AskUserInput): number` (1 when single; `max_selected ?? min(3, options.length)` when multiple)
  - `askUserAnswerText(input: AskUserInput | null, output: AskUserOutput | null): string | null` — « A, B » (labels), « Autre : … », « Passé », « sans réponse » (abandoned); null when unreadable
  - `askUserStepLabel(input: unknown, output: unknown): string | null` — « <question> : <answer> »
  - `type AskUserOptionImage = { src: string; shape: "wide" | "square" }`, `askUserOptionImage(image: string | undefined): AskUserOptionImage | null`
- `V2_CLIENT_TOOLS.ask_user = aiTool({ description, inputSchema: askUserInputSchema })` (no `execute`).
- `TOOL_LABELS.ask_user = "Te pose une question"`.

- [ ] **Step 1: Write the failing tests** — `tests/agent/ask-user.test.ts`:
  - accepts a minimal input and applies defaults (`multiple: false`, `allow_skip: true`);
  - rejects: empty / 201-char question, step 0 and 9, 0 and 7 options, label 61, description 141, duplicate option ids, `max_selected` 0 / 4, `max_selected` with `multiple: false`;
  - `readAskUserOutput` reads `{ selected: ["a"] }`, `{ type: "json", value: { other: "x" } }`, `{ skipped: true }`, rejects `{ selected: "a" }`;
  - `askUserAnswerText`: labels joined, unknown id kept, « Autre : Ma vidéo », « Passé », « sans réponse » for `reason: "abandoned"`;
  - `askUserStepLabel` on the persisted json form;
  - `askUserOptionImage` for the four prefixes (URLs and shapes, ids URL-encoded) and `null` for `https://…`, `stored:gi_x`, `undefined`;
  - `V2_CLIENT_TOOLS.ask_user.execute` is undefined, its schema rejects `{}`; `TOOL_LABELS.ask_user` is set.
- [ ] **Step 2: Run** — fails.
- [ ] **Step 3: Implement** the module and the declaration. Tool description (English, for the model): one question with 1–6 clickable options (thumbnails via `image` refs from the list tools), `step` = the interview question number (1–8), the user answers `{ selected }`, `{ other }` or `{ skipped }`, the turn pauses until then; call it alone in its step.
- [ ] **Step 4: Run** the test + `tests/agent/v2-browser-client-tools.test.ts` + `tests/agent/tool-labels.test.ts`; `tsc`; eslint.
- [ ] **Step 5: Commit** — `feat(agent): ask_user client tool schema`.

## Task 3: The question card and its folded line

**Files:**
- Create: `src/components/panels/chat/AskUserCard.tsx`
- Modify: `src/components/panels/chat/PendingUiAction.tsx` (render `AskUserCard` for `ask_user`), `src/components/panels/chat/turn-model.ts` (step label)
- Test: `tests/chat/ask-user-card.test.tsx` (happy-dom, `createRoot` + `act`), `tests/chat/ask-user-turn.test.ts`

**Interfaces:**
- `AskUserCard({ input: unknown; onAnswer: (output: AskUserOutput) => void })` — default export.
- `PendingUiAction` for `ask_user`: `onResolve(toolCallId, output)` with the card's output.
- `splitAssistantTurn`: a done `ask_user` step has `label = askUserStepLabel(part.input, part.output) ?? toolLabel("ask_user")`.

Card rules (spec « Écran : la carte de question » + rulings 3–5):
- Header: question (`text-sm font-medium`), « Question n/8 » (`text-xs text-muted-foreground`).
- Options with images → grid (`grid-cols-2` wide, `grid-cols-3` square), each tile a `<button type="button">` with `aria-pressed` in multiple mode, image `aspect-video` or `aspect-square` `object-cover`, label (truncate), description one line (`line-clamp-1`). Single: click answers `{ selected: [id] }`. Multiple: click toggles; when `max_selected` is reached the unselected tiles are disabled; « Valider » (`Button size="sm"`) enabled with ≥ 1 selection answers `{ selected }` in option order.
- Options without image → vertical list of `Button variant="outline"` (single) or `Toggle variant="outline"` (multiple) with the description in a `text-xs text-muted-foreground` line.
- Footer: `Input` placeholder « Autre… » (`maxLength` 300) + « Envoyer » (disabled while the trimmed value is empty; Enter submits) → `{ other }`; « Passer » (`variant="ghost"`) when `allow_skip` → `{ skipped: true }`.
- After the first answer every control is disabled (a double click can never resolve twice).
- Invalid input → a short card « Question illisible » with « Passer ».
- Transitions `transition-colors motion-reduce:transition-none`.

- [ ] **Step 1: Write the failing tests**
  - `tests/chat/ask-user-card.test.tsx`: grid of 5 YouTube options → `grid-cols-2`, 5 `img` with `https://i.ytimg.com/vi/<id>/mqdefault.jpg`, « Question 1/8 »; click one → `onAnswer({ selected: ["v2"] })` once, second click ignored; persona options → `grid-cols-3` and `/api/personas/image?id=p1&angle=front`; list mode (no images) → outline buttons with descriptions; multiple + `max_selected: 2` → third tile disabled after two picks, « Valider » disabled at 0 then answers `{ selected: [...] }` in option order; « Autre… » typed + « Envoyer » → `{ other: "Mon lien" }`, « Envoyer » disabled when blank; « Passer » → `{ skipped: true }` and absent with `allow_skip: false`; image error → placeholder shown.
  - `tests/chat/ask-user-turn.test.ts`: live message with an answered `tool-ask_user` part → step label « Quel angle ? : Choc » ; reopened rows (`rowsToUIMessages`) with the persisted `{ type: "json", value: { selected: ["b"] } }` → same label; abandoned output → « … : sans réponse »; an unanswered reopened `ask_user` → in `pending`.
- [ ] **Step 2: Run** — fails.
- [ ] **Step 3: Implement** `AskUserCard`, the branch in `PendingUiAction` (placed before the other branches, inside the same `mx-3 my-2 rounded-xl p-3 bg-primary/10 border border-border` frame) and the label in `turn-model.ts`.
- [ ] **Step 4: Run** the two tests + `tests/chat/turn-model.test.ts`, `tests/chat/turn-steps-render.test.tsx`; `tsc`; eslint (touched files).
- [ ] **Step 5: Commit** — `feat(chat): ask_user question card and folded answer line`.
- [ ] **Step 6: Full suite** (after Tasks 1–3).

## Task 4: Reuse of « Utiliser comme référence » for `import_youtube_thumbnail`

**Files:**
- Create: `src/lib/youtube/use-thumbnail.ts`
- Modify: `src/app/api/channels/videos/[videoId]/use/route.ts`, `src/lib/agent/tools/import-youtube-thumbnail.ts`
- Test: `tests/channels/use-thumbnail.test.ts`, `tests/agent/import-youtube-thumbnail-reuse.test.ts`

**Interfaces:**
- Consumes: `store.getVideo`, `store.setVideoSwipeFile`, `channelRuntime().thumbnailCopies`, `fetchBestThumbnail`, `saveThumbnailToLibrary`, `getSwipeFileTitle`, `libraryImageUrl`.
- Produces: `type UseThumbnailOutcome = { status: "existing" | "created"; swipeFileId: string; imageUrl: string; label: string } | { status: "unknown-video" } | { status: "not-found" } | { status: "unreachable" }`, `copyVideoThumbnailToLibrary(videoId: string): Promise<UseThumbnailOutcome>`.
- `import_youtube_thumbnail`: tracked video → outcome (text `Thumbnail imported. Reference: stored:sf_<id> (label: "<title>", <n> KB). Wire this as a swipeFile (kind="reference") in apply_workflow.` + image from `swipe_files`); `not-found` / `unreachable` → `isError`; untracked video → unchanged path.

- [ ] **Step 1: Write the failing tests** (mock `@/lib/youtube/thumbnails`' `fetchBestThumbnail`; insert a followed channel + video with the store helpers used by `tests/channels/videos-routes.test.ts`):
  - outcome `unknown-video`; first call `created` (one fetch), second `existing` (no fetch); two concurrent calls → one fetch, same id; fetch `null` → `not-found`; fetch throws → `unreachable`; a stale `swipe_file_id` whose library row was deleted → copies again.
  - the route still answers 201 / 200 / 404 / 502 with the same bodies (existing `tests/channels/videos-routes.test.ts` stays green).
  - `import_youtube_thumbnail` on a tracked video already used from the UI → no fetch, returns `stored:sf_<same id>` and an image; called twice → one library row; untracked video → fetch + save as before; no network (`fetch` stubbed to throw).
- [ ] **Step 2: Run** — fails.
- [ ] **Step 3: Implement** (move the route's logic verbatim into the function; the route becomes a thin mapping).
- [ ] **Step 4: Run** tests + `tests/channels/videos-routes.test.ts`; `tsc`; eslint.
- [ ] **Step 5: Commit** — `refactor(youtube): share use-thumbnail between route and agent tool`.

## Task 5: `list_followed_videos`

**Files:**
- Create: `src/lib/agent/tools/list-followed-videos.ts`
- Modify: `src/lib/agent/tools/all.ts`, `src/lib/agent/tool-labels.ts`
- Test: `tests/agent/list-followed-videos.test.ts`

**Interfaces:**
- Consumes: `listVideos`, `typesSummary`, `thumbTypeLabel`, `getDb` (is_mine channel id).
- Produces: `listFollowedVideosTool: ToolDefinition<{ scope: "mine" | "all"; sort: "date" | "score"; best_type?: boolean; limit: number }>` registered, `chatOnly: true`; `TOOL_LABELS.list_followed_videos = "Liste les vidéos suivies"`.

- [ ] **Step 1: Write the failing tests** (seed two followed channels, one `is_mine`, videos with `thumb_type`, `median_views`, dates older than 7 days):
  - `scope: "mine"` lists only my channel's videos, `sort: "date"` newest first, `limit` respected, lines contain `youtube:<id>` and the title and `perf: ×`;
  - `scope: "all", sort: "score"` highest ratio first;
  - `best_type: true` keeps only the best type (≥ 3 scored) and names it in the header; without enough data → header mentions it and no filter;
  - no « Ma chaîne » → text answer « Aucune chaîne n'est marquée « Ma chaîne » … » (not `isError`);
  - schema rejects `limit: 13`; `fetch` stubbed to throw is never called;
  - `chatOnly` true and the MCP server does not list it (`buildMcpServer` tools list, as `tests/agent/mcp-server.test.ts` does).
- [ ] **Step 2: Run** — fails. **Step 3: Implement.** **Step 4: Run** + `tests/agent/registry-full.test.ts`, `tests/agent/tool-labels.test.ts`, `tests/agent/mcp-server.test.ts`; `tsc`; eslint.
- [ ] **Step 5: Commit** — `feat(agent): list_followed_videos tool`.

## Task 6: Shared blueprint → canvas data mapping

**Files:**
- Create: `src/lib/agent/blueprint/models.ts`, `src/lib/agent/tools/_helpers/blueprint-canvas-data.ts`
- Modify: `src/lib/agent/tools/apply-workflow.ts` (imports the helpers, behaviour unchanged), `src/lib/agent/blueprint/schema.ts` (exports)
- Test: `tests/agent/blueprint-canvas-data.test.ts`

**Interfaces:**
- `models.ts` (pure): `BLUEPRINT_MODELS: readonly { id: "nano-banana" | "openai" | "seedream"; canvasModel: string; name: string }[]` (`Nano Banana` → `gemini-3.1-flash-image`, `GPT Image` → `gpt-image-2.5-sunburst`, `Seedream` → `bytedance-seed/seedream-4.5`), `MODEL_ID_MAP: Record<string, string>`.
- `blueprint-canvas-data.ts` (server): `type CanvasDataOptions = { libraryUrls?: boolean }`, `blueprintToCanvasData(type, data, options?)`, `blueprintUpdateToCanvasData(type, data, options?): Promise<{ patch; replacesImage }>`, `resolveToDataUrl(source)`, `libraryImageUrlForSource(source): string | null`, `dropStaleImageFields(data, patch)`.
- `schema.ts`: `export function normalizeNode(raw)`, `export function validateBlueprintNodeData(type: string, data: Record<string, unknown>, { existing }: { existing: boolean }): { success: true } | { success: false; issues: string[] }`.

- [ ] **Step 1: Write the failing tests**: `MODEL_ID_MAP` values exist in `IMAGE_MODELS`; `blueprintToCanvasData("swipeFile", { kind: "logo", image_source: "stored:lg_<id>" }, { libraryUrls: true })` → `imageUrl` `/api/logos/image?f=<id>`, no `imageBase64`; same without the option → `imageBase64` data URL (seeded logo row); `stored:sf_` → `/api/swipe-files/image?f=`; `generated:<sketch>` with the option → still `imageBase64`; faceReference persona → `personaAngles` + `personaId`; generator maps `nano-banana` and `count`; `validateBlueprintNodeData` rejects a new swipeFile without `image_source` and accepts it when `existing`.
- [ ] **Step 2: Run** — fails. **Step 3: Move the code** (no logic change for `apply_workflow`). **Step 4: Run** + every `tests/agent/apply-workflow*.test.ts`, `tests/agent/blueprint-schema.test.ts`; `tsc`; eslint.
- [ ] **Step 5: Commit** — `refactor(agent): share blueprint-to-canvas mapping, library image urls`.
- [ ] **Step 6: Full suite** (after Tasks 4–6).

## Task 7: `place_node` core and tool builder

**Files:**
- Create: `src/lib/canvas/canvas-patch.ts`, `src/lib/agent/place-node.ts`, `src/lib/agent/v2/place-node-tool.ts`
- Modify: `src/lib/agent/v2/tool-adapter.ts` (export `toolResultToModelOutput`, used by the adapter itself), `src/lib/canvas-snapshots.ts` (`SnapshotReason` + `place_node`, quota 20, `writeProjectCanvas(…, db, now?)`), `src/lib/canvas/agent-history.ts` (label « Avant un nœud de l'interview »), `src/lib/agent/tool-labels.ts` (`place_node: "Pose un nœud sur le canvas"`)
- Test: `tests/canvas/canvas-patch.test.ts`, `tests/agent/place-node.test.ts`

**Interfaces:**
- `canvas-patch.ts` (pure, client-safe):
  - `CANVAS_PATCH_PART = "data-canvas-patch"`
  - `type CanvasPatchNode = { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }`
  - `type CanvasPatchEdge = { id: string; source: string; target: string; sourceHandle: string | null; targetHandle: string }`
  - `type CanvasPatch = { projectId: string; updatedAt: string; node: CanvasPatchNode; edges: CanvasPatchEdge[] }`
  - `isCanvasPatch(value: unknown): value is CanvasPatch`
  - `compareUpdatedAt(a: string, b: string): number`
  - `shouldApplyCanvasPatch(patch: CanvasPatch, state: { openProjectId: string; loaded: boolean; knownUpdatedAt: string | null }): boolean`
- `place-node.ts` (server):
  - `INTERVIEW_NODE_ID = /^iv-(prompt|persona|generator|ref-[1-3]|logo-[1-3])$/`
  - `placeNodeInputSchema` — `{ node: { id, type: "prompt" | "faceReference" | "swipeFile" | "generator", data } }` (with `normalizeNode` preprocessing)
  - `type PlaceNodeInput = z.infer<typeof placeNodeInputSchema>`
  - `interviewNodeType(id): { type; kind?: "reference" | "logo" } | null`
  - `interviewHandle(node: { type: string; data: Record<string, unknown> }): string | null`
  - `interviewPosition(id: string, canvasNodes: StoredNode[]): { x: number; y: number }`
  - `type PlaceNodeOutcome = { ok: true; patch: CanvasPatch; created: boolean; linkedToGenerator: boolean } | { ok: false; error: string }`
  - `placeInterviewNode(projectId: string, input: PlaceNodeInput): Promise<PlaceNodeOutcome>`
- `place-node-tool.ts` (server):
  - `PLACE_NODE_TOOL_NAME = "place_node"`
  - `type WritePatch = (patch: CanvasPatch) => void`
  - `buildPlaceNodeTool({ projectId, writePatch }: { projectId: string; writePatch: WritePatch }): Tool` — `execute(input)` → `placeInterviewNode`; success → `writePatch(patch)` (try/catch, logged) and `{ content: [{ type: "text", text: "node id: <id>" + ("\nlinked to iv-generator") }] }`; failure → `{ isError: true, content: [{ type: "text", text: error }] }`; `toModelOutput: toolResultToModelOutput` (error → `error-text`).

- [ ] **Step 1: Write the failing tests**
  - `tests/canvas/canvas-patch.test.ts`: `compareUpdatedAt` with ISO vs ISO, SQLite vs ISO (`"2026-09-17 10:00:00"` < `"2026-09-17T10:00:01.000Z"`); `shouldApplyCanvasPatch` false for another project, not loaded, `updatedAt` equal or older than known, true when newer or known is null; `isCanvasPatch` rejects missing fields.
  - `tests/agent/place-node.test.ts` (seed a project with `createProject`, a persona, a logo and a swipe file rows as the apply-workflow tests do):
    - new `iv-prompt` on a canvas with one user node at x=100 (width 320) → position `(100+320+200+420, top)`; DB `updated_at` = meta `updated_at` = `data.placedByAgentAt` = `patch.updatedAt` (ISO); the user node untouched; a snapshot with reason `place_node` exists;
    - update `iv-prompt` after Antoine moved it and added `negativePrompt` → position kept, `negativePrompt` kept, `prompt` replaced, `placedByAgentAt` refreshed; `created: false`;
    - `iv-persona` → `personaAngles`, column `left`, slot 0; `iv-ref-1` → slot 1, `imageUrl` `/api/swipe-files/image?f=…`; `iv-logo-1` → `imageUrl` `/api/logos/image?f=…`, kind `logo`;
    - `iv-generator` arriving last → edges `iv-persona→face-in`, `iv-ref-1→ref-in`, `iv-logo-1→logo-in`, `iv-prompt→prompt-in` created once; the patch carries those edges; output says `linked to iv-generator`; placing `iv-ref-2` afterwards adds exactly one edge;
    - calling twice with the same generator → no duplicate edge; an existing identical edge drawn by Antoine is not duplicated;
    - a deleted `iv-ref-1` updated again → recreated at the first free slot;
    - errors (nothing written, `updated_at` unchanged): id `prompt-1`, `iv-ref-1` with `kind: "logo"`, `iv-prompt` with type `generator`, generator with `abTest`, unknown `image_source` (`stored:sf_missing`), canvas already holding `iv-prompt` of another type, unknown project;
    - `buildPlaceNodeTool`: `execute` calls `writePatch` once with the patch on success and never on failure; a throwing `writePatch` still returns the success text; `toModelOutput` of a failure is `{ type: "error-text" }`; the registry (`listTools()` after `import "@/lib/agent/tools/all"`) has no `place_node` and the MCP server does not list it.
- [ ] **Step 2: Run** — fails. **Step 3: Implement** (rulings 9–13). **Step 4: Run** + `tests/agent/canvas-snapshots.test.ts`, `tests/canvas/agent-history*.test.ts`, `tests/agent/v2-tool-adapter.test.ts`; `tsc`; eslint.
- [ ] **Step 5: Commit** — `feat(agent): place_node core with injected canvas patch writer`.

## Task 8: Save route — `updatedAt` on load, reinjection of agent nodes

**Files:**
- Modify: `src/lib/local-storage.ts` (`getProject` also returns `updatedAt`; `saveProject(id, nodes, edges, baseUpdatedAt?)`), `src/app/api/project/route.ts`
- Test: `tests/agent/project-save-reinject.test.ts`

**Interfaces:**
- `type ProjectData = { nodes; edges; updatedAt?: string }` (`getProject` fills it).
- `type SaveProjectResult = { updatedAt: string; reinjected: FlowNode[]; reinjectedEdges: FlowEdge[] }`; `saveProject(id: string, nodes: FlowNode[], edges: FlowEdge[], baseUpdatedAt?: string | null): SaveProjectResult`.
- `GET /api/project?id=` → `{ nodes, edges, updatedAt: string | null }`; `POST /api/project` body `{ projectId, nodes, edges, baseUpdatedAt? }` → `{ success: true, updatedAt, reinjected, reinjectedEdges }`.

- [ ] **Step 1: Write the failing tests** (call the route handlers with `Request` objects; place nodes with `placeInterviewNode`):
  - GET returns `updatedAt` equal to `projects.updated_at`; unknown project → `updatedAt: null`;
  - base before the agent node + payload without it → the node and its edges are in the DB and in `reinjected` / `reinjectedEdges`;
  - base after (or equal to) `placedByAgentAt` + payload without it → not reinjected (Antoine's deletion or ⌘Z respected) — « ⌘Z puis sauvegarde : le nœud reste absent en base »;
  - no `baseUpdatedAt` → nothing reinjected;
  - an agent node present in the payload → not duplicated;
  - a reinjected edge whose other end is absent from the final node list is dropped;
  - legacy `baseUpdatedAt` in SQLite format older than the agent write → reinjected.
- [ ] **Step 2: Run** — fails. **Step 3: Implement** (single transaction: read DB canvas, compute reinjection, write, meta). **Step 4: Run** + `tests/canvas/*` using `/api/project`; `tsc`; eslint.
- [ ] **Step 5: Commit** — `feat(canvas): save route reinjects agent-placed nodes newer than the client base`.

## Task 9: Canvas store — `knownUpdatedAt`, `applyAgentPatch`, poller

**Files:**
- Modify: `src/store/canvas-store.ts`, `src/hooks/useCanvasSync.ts`
- Test: `tests/canvas/canvas-store-agent-patch.test.ts`, new cases in `tests/canvas/canvas-sync.test.ts`

**Interfaces:**
- `CanvasState.knownUpdatedAt: string | null`
- `CanvasState.applyAgentPatch(node: CanvasPatchNode, edges: CanvasPatchEdge[], updatedAt: string): void`
- `saveProject` payload `{ projectId, nodes, edges, baseUpdatedAt? }`; response merge of `reinjected` / `reinjectedEdges`.
- `createProjectSyncPoller`: known `updated_at` never reloads.

- [ ] **Step 1: Write the failing tests** (fake timers, stubbed `fetch`, `seed()` like `canvas-sync.test.ts`):
  - `loadProject` sets `knownUpdatedAt` from the GET body;
  - `applyAgentPatch` adds a node and edges, `dirty` stays false, no POST after 3 s, exactly one new history entry after 300 ms, `knownUpdatedAt` = patch, `recentOwnSaveUpdatedAts` contains it; a second patch on the same node merges `data` and keeps the local position; duplicate edges ignored; not loaded → no-op;
  - a replayed patch (`updatedAt` ≤ known) is refused by `shouldApplyCanvasPatch` with the store state;
  - save sends `baseUpdatedAt` = the known value **at payload time**; response `reinjected` nodes are appended without history entry and without `dirty`; a reinjected node already present locally is not duplicated; `knownUpdatedAt` becomes the max of current and response;
  - poller: `updated_at === knownUpdatedAt` → no `loadProject`; unknown value → reload (existing behaviour).
- [ ] **Step 2: Run** — fails. **Step 3: Implement.** **Step 4: Run** + `tests/canvas/canvas-store*.test.ts`, `tests/canvas/canvas-sync.test.ts`, `tests/canvas/agent-history*.test.ts`; `tsc`; eslint.
- [ ] **Step 5: Commit** — `feat(canvas): apply agent patches and send the known base on save`.
- [ ] **Step 6: Full suite** (after Tasks 7–9).

## Task 10: `generate` next action

**Files:**
- Create: `src/lib/canvas/generate-action.ts`, `src/lib/canvas/generate-node-event.ts`
- Modify: `src/lib/agent/finish-turn.ts`, `src/components/panels/chat/turn-model.ts`, `src/components/panels/chat/TurnActions.tsx`, `src/components/nodes/GeneratorNode.tsx`
- Test: `tests/canvas/generate-action.test.ts`, `tests/chat/turn-actions-generate.test.tsx` (happy-dom), `tests/agent/finish-turn-tool.test.ts` (update)

**Interfaces:**
- `finish-turn.ts`: next action `kind: "ask_agent" | "focus_node" | "generate"`, `label` optional (required for the first two).
- `turn-model.ts`: `NextAction |= { kind: "generate"; nodeId: string }`.
- `generate-action.ts` (pure): `type GenerateActionState = { status: "missing" } | { status: "generating" } | { status: "ready"; label: string; costUsd: number }`, `generateActionState(nodeId: string, nodes: NodeLike[], edges: EdgeLike[]): GenerateActionState`, `formatUsdEstimate(value: number): string` (`~0,02 $`).
- `generate-node-event.ts`: `GENERATE_NODE_EVENT = "thumbgen:generate-node"`, `type GenerateNodeEventDetail = { nodeId: string }`, `requestNodeGeneration(nodeId: string): void`, `subscribeNodeGeneration(nodeId: string, onRequest: () => void): () => void`.
- `TurnActions`: `GenerateNodeButton({ nodeId })` — `selectOnly([nodeId])`, `fitView({ nodes: [{ id }], padding: 0.4, maxZoom: 1, duration: reducedMotion ? 0 : 400 })`, then `requestNodeGeneration(nodeId)`, all inside `onClick`.
- `GeneratorNode`: `useEffect(() => subscribeNodeGeneration(id, () => void run([])), [id, run])`.

- [ ] **Step 1: Write the failing tests**
  - `finish-turn-tool.test.ts`: `{ kind: "generate", node_id: "iv-generator" }` accepted without label; `{ kind: "generate" }` rejected; `ask_agent` without label rejected.
  - `generate-action.test.ts`: generator `gemini-3.1-flash-image`, 1 image → « Générer · 1 image · ~0,02 $ »; `numImages: 3` → « 3 images · ~0,06 $ »; A/B 2 variants × 1 → « 2 variantes × 1 image · 2 images · ~0,04 $ »; missing node / non-generator → `missing`; `isGenerating` → `generating`; model without cost → no cost part.
  - `turn-actions-generate.test.tsx`: rendered under `ReactFlowProvider` with a seeded store → button text with the computed label; changing the generator's `numImages` in the store updates the label; missing node → disabled + « Élément introuvable » tooltip trigger; generating → disabled; a `window` listener sees **no** event after render and re-render, exactly one after a click (with `{ nodeId }`); `splitAssistantTurn` maps a `generate` action.
  - `subscribeNodeGeneration` calls back only for its node id and stops after unsubscribe.
- [ ] **Step 2: Run** — fails. **Step 3: Implement.** **Step 4: Run** + `tests/chat/assistant-turn-render.test.tsx`, `tests/agent/system-prompt-finish-turn.test.ts`; `tsc`; eslint (`GeneratorNode.tsx` before/after).
- [ ] **Step 5: Commit** — `feat(chat): generate next action with app-computed label and cost`.

## Task 11: « Construire avec l'agent »

**Files:**
- Create: `src/components/panels/chat/ChatEmptyState.tsx`
- Modify: `src/components/panels/chat/MessageList.tsx` (empty-state block only)
- Test: `tests/chat/chat-empty-state.test.tsx`

**Interfaces:**
- `INTERVIEW_START_MESSAGE = "Aide-moi à construire la miniature de ma vidéo."` (exported by `ChatEmptyState.tsx`).
- `ChatEmptyState({ onStart: () => void })`; `MessageList` passes `() => controls.onAskAgent(INTERVIEW_START_MESSAGE)`.

- [ ] **Step 1: Write the failing test**: static render shows the existing title/description and a button « Construire avec l'agent »; happy-dom click calls `onAskAgent` once with the exact message; `MessageList` with messages does not render it.
- [ ] **Step 2: Run** — fails. **Step 3: Implement** (`Button size="sm"` with a `SparklesIcon data-icon="inline-start"` inside `EmptyContent`… use `Empty`'s existing slots). **Step 4: Run** + `tests/chat/message-list-render.test.tsx`; `tsc`; eslint.
- [ ] **Step 5: Commit** — `feat(chat): start a guided interview from the empty chat`.

## Task 12: GUIDED INTERVIEW prompt section

**Files:**
- Modify: `src/lib/agent/system-prompt.ts`
- Test: `tests/agent/system-prompt-interview.test.ts`

**Interfaces:**
- `export const INTERVIEW_PRICE_TABLE: string` (built from `BLUEPRINT_MODELS`, `MODEL_COSTS`, `imageModelLabel`).
- `AGENT_SYSTEM_PROMPT` contains « GUIDED INTERVIEW ».

Section content (English, for the model; French examples in quotes):
- Trigger: the start button message or an explicit request to build the thumbnail with guidance; « propose-moi des idées » keeps the brainstorming flow.
- The 8 questions in order with their `step`, sources and nodes (spec « Parcours »), `ask_user` alone in its step, `place_node` right after each answer that produces a node, ids `iv-*`; `import_youtube_thumbnail` for a chosen YouTube reference before `iv-ref-n`; empty list → skip the question and say so at the next step; step numbers never renumbered.
- No `finish_turn` before the recap unless Antoine stops; recap = `finish_turn` with a short summary and `next_actions: [{ kind: "generate", node_id: "iv-generator" }]`; never mention a price in text other than the model options.
- During the interview: never `generate_sketch`, never `apply_workflow`, never remove a node; a user message during a question (question abandoned) → resume at the requested step or stop.
- `place_node` error → apologise in one sentence and ask the same step again.
- Priority: while the interview runs it overrides EXISTING WORKFLOW, PROPOSING ANGLES and WHEN THE USER PICKS AN ANGLE; on a non-empty canvas the `iv-*` nodes are added to the right, the rest is kept.
- The price table (one line per blueprint model: `- nano-banana — Gemini 3.1 Flash — ~0,02 $ / image`) and the option label format « Nano Banana · ~0,02 $ / image »; format 16x9 by default, another format via « Autre ».
- « ENDING EVERY TURN »: « When you call request_user_image or ask_user, don't call finish_turn in the same step » (keeps the existing phrase « don't call finish_turn in the same step »).

- [ ] **Step 1: Write the failing test**: the section exists once, after EXISTING WORKFLOW; mentions `ask_user`, `place_node`, all ids, « Question », `kind: "generate"`, never `generate_sketch` / `apply_workflow` during the interview; the price table lines equal `MODEL_COSTS` values for the three mapped models; the section is in the cached first block and no per-turn block mentions `place_node`; existing prompt tests untouched.
- [ ] **Step 2: Run** — fails. **Step 3: Implement.** **Step 4: Run** every `tests/agent/system-prompt*.test.ts`; `tsc`; eslint.
- [ ] **Step 5: Commit** — `feat(agent): guided interview section in the system prompt`.
- [ ] **Step 6: Full suite, tsc, eslint on every touched file** (end of the independent lane).

---

# Integration lane (after F1 is merged — not implemented now)

Start: merge `main` (with F1) into `feat/f2`, resolve, full suite green. Re-read F1's `route-handler.ts`, `run-registry.ts`, `fake-agent-model.ts`, `ChatPanel.tsx`.

## Task N1: Route wiring — composed stream, `place_node`, `ask_user` resume

**Files:** Modify `src/lib/agent/v2/route-handler.ts`; Test `tests/agent/v2-route-handler-interview.test.ts` (with F1's `tests/agent/helpers/chat-route.ts`).

- Replace the helper constant `CLIENT_TOOL_NAMES` by `CLIENT_TOOL_NAME_SET` (abandon scan) and the resume filter `(p.type === "tool-request_user_image" || …)` by `clientToolNameOfPartType(p.type) !== null`.
- Build the UI stream as `createUIMessageStream({ execute: ({ writer }) => { const result = streamText({ …, tools: { ...buildAiSdkTools(), ...V2_CLIENT_TOOLS, [PLACE_NODE_TOOL_NAME]: buildPlaceNodeTool({ projectId: run.projectId, writePatch: (patch) => writer.write({ type: CANVAS_PATCH_PART, id: patch.node.id, transient: true, data: patch }) }) } }); writer.merge(result.toUIMessageStream({ onError, onEnd })); } })` and hand **that** stream to F1's `pumpRunStream` (the `onEnd` outcome/persistence logic of F1 moves to this inner `toUIMessageStream` unchanged). Verify in `node_modules/ai/dist/index.js` that `createUIMessageStream` closes only after merged streams end, and that transient chunks reach the run buffer and subscribers (they are not persisted in `message.parts`).
- Tests: resume after an `ask_user` answer persists the tool row and calls `streamText` (no 400); a user message sent during a pending `ask_user` writes the `abandoned` skip row; `place_node` execution writes a `data-canvas-patch` chunk with `transient: true` into the run buffer; `project_id` comes from the conversation (a model-supplied id is ignored — `place_node` has no `project_id` input); `place_node` failure → `tool-output-error` / error-text, run continues; no real model (`streamText` mocked).
- Commit — `feat(agent): wire place_node and ask_user into the chat route`.

## Task N2: F1 registry — questions count as client requests

**Files:** Modify `src/lib/agent/v2/run-registry.ts` (its local `CLIENT_TOOL_NAMES` → `CLIENT_TOOL_NAME_SET`); Test `tests/agent/run-registry.test.ts` (+ `ask_user` pending → `pendingClientRequest` true → runs route `kind: "question"`).
- Commit — `feat(agent): ask_user pauses count as questions in the runs registry`.

## Task N3: ChatPanel — card detection and live canvas patches

**Files:** Modify `src/components/panels/ChatPanel.tsx`; Test `tests/chat/chat-panel-canvas-patch.test.ts` (pure handler extracted if F1's panel structure allows: `handleChatData(part, { projectId, fitView, reducedMotion })`).
- Pending part detection: `clientToolNameOfPartType(p.type) !== null && p.state === "input-available"`; `respondToUiTool`'s `tool` from `clientToolNameOfPartType`.
- `useChat({ onData })`: when `part.type === CANVAS_PATCH_PART && isCanvasPatch(part.data)` and `shouldApplyCanvasPatch(part.data, { openProjectId: projectId, loaded, knownUpdatedAt })` → `applyAgentPatch(node, edges, updatedAt)`, then `fitView({ nodes: [{ id: node.id }], padding: 0.4, maxZoom: 1, duration: reducedMotion ? 0 : 400 })` (`window.matchMedia("(prefers-reduced-motion: reduce)")`, read in the handler). Transient parts are never added to messages. A reconnection replay (F1 `resumeStream`) re-delivers patches: the `updatedAt` rule ignores them.
- Tests: patch for another project ignored; replay ignored; applied patch → store updated, no POST `/api/project`, fitView called once; no `sendMessage` / `addToolOutput` triggered by `onData`.
- Commit — `feat(chat): apply live canvas patches and show ask_user cards`.

## Task N4: Fake server model — « interview » scenario

**Files:** Modify `src/lib/agent/v2/fake-agent-model.ts` (F1); Test `tests/agent/fake-agent-model.test.ts`.
- Selected by the user text containing « construire la miniature » (the start button) while `THUMBGEN_FAKE_AGENT` is set (same production guard). Script: step 1 `ask_user` (step 2, 3 text options) → pause; on the continuation after `{ selected }`: `place_node iv-prompt` then `ask_user` (step 8, model options) → pause; after the answer: `place_node iv-generator`, then `finish_turn` with `next_actions: [{ kind: "generate", node_id: "iv-generator" }]`. The fake model reads the last tool result in its prompt to pick the stage. No network; `place_node` hits the throwaway DB only.
- Tests: the script's tool calls in order, pauses on `ask_user`, never calls a generation tool; impossible in production (existing guard test extended).
- Commit — `test(agent): fake interview scenario for browser checks`.

## Task N5: Browser check (fake model, no paid call)

Throwaway dev server exactly as F1 Task 10 (`THUMBGEN_FAKE_AGENT=1 THUMBGEN_DB_PATH=<tmp>/thumbgen.db OPENROUTER_API_KEY= OPENAI_API_KEY= YOUTUBE_API_KEY= ./node_modules/.bin/next dev -p 3100`). Never click « Générer ». Checks:
1. Empty chat → « Construire avec l'agent » → card « Question 2/8 » (options) → click → `iv-prompt` appears live and is centred; the dev log shows no request to OpenRouter or `/api/generate`.
2. Navigate to « Bibliothèque » during the next question → F1 toast « L'agent te pose une question — … » → back: the card is still there and answerable.
3. Answer → `iv-generator` placed and linked; recap shows « Générer · 1 image · ~0,02 $ »; change « Images » to 2 on the node → the label updates. Do not click it.
4. Delete `iv-prompt`, wait for autosave, reload: it stays deleted.
5. Reduced motion (emulated): fitView without animation.

## Task N6: Docker rebuild and consent-gated live check

One rebuild from `/Users/antoinevigneau/thumbgen-real`: `docker compose build thumbgen && docker compose up -d thumbgen`; `THUMBGEN_FAKE_AGENT` absent from `Dockerfile`/`docker-compose.yml` (F1 test). The live interview (spec « Vérification live »: short, skipping questions 4 and 5, **without clicking « Générer »**, cost read in `UsageSummary`) runs only after Antoine's explicit « oui » in that session; otherwise reported as not done.

---

## Self-review against the spec

- **Objectif / Décisions**: 8 fixed questions + recap → Task 12 (prompt), card counter → Task 3; choices with thumbnails, « Autre », « Passer » → Tasks 2–3; composer stays visible and a message abandons the question → existing behaviour + N1 (abandon scan learns `ask_user`); « Générer » label/cost by the app → Task 10; nodes placed server-side and broadcast → Task 7 + N1 + N3.
- **Parcours**: `list_followed_videos` (scope, sort, best type) → Task 5; `import_youtube_thumbnail` dedup → Task 4; `iv-*` nodes, library URLs, persona angles → Tasks 6–7; model options with prices from `MODEL_COSTS` → Task 12 (ruling 21); recap `generate` action → Tasks 10, 12.
- **Lancement**: empty-state button → Task 11; explicit request vs « propose-moi des idées » → Task 12.
- **Outils**: client-tools module → Task 1 (+ N1–N3 for F1 files, ruling 1); `ask_user` schema/outputs/json form → Tasks 2–3; `list_followed_videos` chatOnly, no YouTube API → Task 5; `place_node` per request, not registry, not MCP, `project_id` from the request, composed stream, error-text, validation, image resolution helper, synchronous transactional merge, `updatedAt` triple, merge semantics, column layout, handle deduction and generator linking, transient chunk, model output → Tasks 6–7 (rulings 8–13) + N1.
- **Canvas**: `onData` acceptance rule → `shouldApplyCanvasPatch` (Task 7) + N3; `applyAgentPatch` (one history entry, no dirty/save, `knownUpdatedAt`, `recentOwnSaveUpdatedAts`) → Task 9; fitView 400/0 → Task 10 (button) and N3 (patch); autosave conflict: GET `updatedAt`, `baseUpdatedAt` at payload time, reinjection in the same transaction, `{ updatedAt, reinjected, reinjectedEdges }`, client merge without history, poller known value → Tasks 8–9 (rulings 14–17).
- **Action « Générer »** → Task 10 (rulings 18–19).
- **Écran** (grid/list, multiple + limit + Valider, Autre, Passer, folded line live and reopened, images mapping, placeholder, no new route) → Tasks 2–3.
- **Réutilisation** → Task 4. **Prompt système** → Task 12.
- **Erreurs**: `place_node` error-text and re-ask → Tasks 7, 12; leaving the page during a question or a placement → F1 + N2 + N5; deleted interview node respected / recreated → Tasks 7–9.
- **Coût**: no automatic call beyond the click-driven resume; no sketch or generation during the interview → Global Constraints, Tasks 10, 12, N4–N6.
- **Tests** listed by the spec: schemas → Tasks 2, 7; `place_node` → Task 7; `list_followed_videos` → Task 5; save route → Task 8; store → Task 9; chat route resume/abandon → N1; card rendering → Task 3; turn-model → Tasks 1, 3, 10; TurnActions → Task 10; prompt → Task 12; browser → N5.
