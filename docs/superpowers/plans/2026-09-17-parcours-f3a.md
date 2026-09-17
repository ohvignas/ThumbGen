# Parcours miniature — F3a « fiche et parcours de base » Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every thumbnail request runs a 7-step THUMBNAIL JOURNEY whose decisions (promise, packages title + thumbnail, A/B strategy, common elements, composition cards) are written into a server-side thumbnail brief (« fiche »), re-read by the agent every turn, visible and editable in a « Fiche » sheet — with server cost guards — while research (F3b) and brief-driven sketches/previews (F3c) are not built yet and the prompt says what to do until they land.

**Architecture:** A pure, client-safe brief module (`src/lib/brief/schema.ts`, `merge.ts`, `context.ts`, `steps.ts`, `brief-updated.ts`) holds the zod schema, the keyed merge, the validation rules, the warnings and the compact `<thumbnail_brief>` block. `src/lib/brief/store.ts` persists one brief per conversation in `thumbnail_briefs` (transactional merge, sketch attach/detach, usage reservations). The chat route builds `update_brief` per request (like F2's `place_node`), streams a transient `data-brief-updated` chunk, injects the brief block, drops `web_search_options` and trims more history images when a brief exists, and wraps `generate_sketch` with a brief guard. `GET|PATCH /api/briefs/[conversationId]` serve the « Fiche » sheet (zustand `brief-store`), whose badge and the live step line follow the chunk. The GUIDED INTERVIEW prompt, its fake scenario and « Question n/8 » disappear.

**Tech Stack:** Next.js 16.2 App Router (Node runtime), React 19.2 + React Compiler lint, TypeScript strict, Tailwind v4, shadcn `base-nova` on Base UI (`@base-ui/react` 1.8), Vercel AI SDK `ai` 7.0.99 (+ `ai/test` `MockLanguageModelV3`) + `@ai-sdk/react` 4.0.102, Zustand 5, zod 4.3, better-sqlite3, vitest 4 (+ happy-dom 20).

**Spec:** `docs/superpowers/specs/2026-09-17-parcours-miniature-complet-design.md` — the binding authority. This plan implements **only** its « Découpage → F3a » scope (plus the `generate_sketch` model fix, see ruling 20). Read the whole spec before starting any task: F3b and F3c constrain the names and shapes F3a must leave in place. Deviations and precisions are listed under « Code reality vs spec (rulings) ».

## Global Constraints

- **Base.** Code quoted here was read on `main` at `8b4ae78` (F1, F2, canvas-safety fix and chat payload fix merged). **Every task that edits an existing file starts by re-reading it on the latest `main`** and applies the described change to what is actually there; anchors are quoted code, never line numbers. When a task gives a full replacement for an existing file or function, first run `git diff 8b4ae78 -- <file>`: if something changed it, carry that change into the new version.
- **Out of scope (never implement here):** `research_topic`, `find_logos`, `add_logo`, the logo-candidate preview route, `find_competitor_thumbnails`, `analyze_thumbnails`, `import_youtube_thumbnail` deduplication, tables `youtube_thumbnail_copies` / `thumbnail_analyses` (F3b); `generate_sketch` `color_blocking` / `from_brief`, `preview_thumbnail`, the checklist, `place_node` variants / `sketch` type / `iv-*-a|b|c` ids, `INTERVIEW_NODE_ID` changes, the MULTI-SELECT reduction (F3c). The brief **schema** does contain the fields those tools will fill (ruling 1).
- **Paid-call safety (paramount).** No task adds an automatic model call, a retry loop or a new `sendAutomaticallyWhen` trigger. `update_brief`, the brief routes and the brief store are free (local DB). The sketch guard only ever **refuses** a paid call; it never starts one. « Générer » stays a user click on the `finish_turn` action. Tests never call a real model or the network: `streamText` mocked in route tests, `fetch` stubbed wherever a paid tool could run, the fake model (`MockLanguageModelV3`) elsewhere. The fake model stays impossible in production (`isFakeAgentEnabled()` unchanged); `THUMBGEN_FAKE_AGENT` never appears in `Dockerfile` or `docker-compose.yml`.
- **Spec values (verbatim):** table `thumbnail_briefs` (`conversation_id` primary key, `project_id`, `data` JSON, `updated_at` ISO), DDL in `AGENT_TABLES_DDL`, idempotent; `step: 1..7`; `video: { subject ≤300, workingTitle ≤120, script ≤8000, promise ≤90, audience ≤120 }`; variant `key "A"|"B"|"C"`, `direction ≤60`, `title ≤60`, `thumbnailText ≤20 car. et ≤4 mots, "" = aucun texte`, `visualIdea ≤120`, `titleRole ≤80`, `thumbRole ≤80`; card `elements 1..3`, exactly one `hero`, `sizePct 5..70`, sum of `sizePct ≤ 110`, `textZone { position: Grid9, heightPct 12..30 } | null` never on the hero's cell, `emotion` only if `common.persona` is not `none`, emotion default intensity 2 mouth closed; `logos ≤3`, `references ≤3`, `variants ≤3`, `logoCandidates ≤36`, `common.textMode` default `"rendered"`; overlap warning when more than one common word after normalization (lowercase, no accents, no FR/EN stop words, entities excluded); merge: objects field by field, `logos` and `references` replaced whole, variant merged by `key`, `composition` replaced whole; `usage`, `logoCandidates` and `research.sources` only written by server tools; PATCH = same merge without `step` nor `research`; `<thumbnail_brief>` after `<canvas_state>`, script truncated to **1 500** characters, sources reduced to titles, `logoCandidates` reduced to `id` + `name`, no base64; `ask_user` `step` 1..7, card « Étape n/7 », `ASK_USER_TOTAL_STEPS = 7`, **12** options, `max_selected ≤ 5`, image `generated:sk_<id>` → `/api/generated-sketches/<id>`; chunk `data-brief-updated`; routes `GET|PATCH /api/briefs/[conversationId]`, PATCH JSON only through `rejectNonJsonRequest`; `generate_sketch` with a brief refused while `step < 7`, at most `2 × variantes + 3` per conversation; `HISTORY_IMAGE_TRIMMED_TOOLS` += `import_youtube_thumbnail`, `generate_sketch`, `preview_thumbnail`; sketch model `gemini-3.1-flash-image` (0,02 $, same as `gemini-2.5-flash-image` in `src/lib/model-costs.ts`); live step line « Étape 3/7 — Concurrents »; `MODEL_SELECTION_GUIDE` without `ideogram` / `grok`; « 200×112 » → « 168×94 »; no « ~30% ».
- **shadcn here is `base-nova` on Base UI, not Radix.** Check `src/components/ui/*` before writing JSX (present: `sheet`, `badge`, `button`, `input`, `textarea`, `label`, `select`, `separator`, `toggle`, `tooltip`, `empty`, …). Triggers take `render={<Button … />}`. `Select` takes `items` + `value` + `onValueChange` (see `src/components/settings/AgentSection.tsx`). `cn` is imported from `"cn"`.
- **UI rules.** Only shadcn/Base UI components and Tailwind classes in new or rewritten code (no `style={{…}}`). UI copy is French; apostrophes in JSX text are written `&apos;` (plain `'` inside JS strings is fine). Animations respect `prefers-reduced-motion` (`motion-reduce:`). No synchronous `setState` inside effects (`react-hooks/set-state-in-effect`); React Compiler lint must stay clean on touched files: run eslint on them before and after, report pre-existing errors, never add one.
- **Commands.** Tests: `./node_modules/.bin/vitest run` (one file: `./node_modules/.bin/vitest run tests/path/file.test.ts`). Type-check: `./node_modules/.bin/tsc --noEmit` (errors only in `.next/types` / `.next/dev/types` → `rm -rf .next/types .next/dev/types` and re-run). Lint: `./node_modules/.bin/eslint <files>`. Node: `/opt/homebrew/bin/node` (`node` may be a broken shell function). No `npx` (broken), no install. The machine is loaded: a failing test is re-run alone before concluding it fails. Full suite after every 3 tasks and at the end.
- **Data.** Tests use the temp DB of `tests/setup.ts`. Never read `.env*` or key settings, never touch `data/thumbgen.db`.
- **Intermediate browser checks** use a throwaway dev server, never the Docker DB and never `localhost:3000`: `THUMBGEN_FAKE_AGENT=journey THUMBGEN_DB_PATH="<throwaway dir>/thumbgen.db" OPENROUTER_API_KEY= OPENAI_API_KEY= YOUTUBE_API_KEY= ./node_modules/.bin/next dev -p 3100`. Never click « Générer ». If a login page appears, stop and ask the user to log in; never type a password.
- **Docker.** The user is actively using `http://localhost:3000`. Exactly **one** rebuild, in Task 13: `docker compose build thumbgen && docker compose up -d thumbgen`, run from `/Users/antoinevigneau/thumbgen-real` (the `./data` bind mount is relative — never from a worktree). A real agent message there is paid and needs the user's explicit « oui » in the executing session; otherwise it is skipped and reported as skipped.
- **Commits.** One commit per task, explicit paths only (never `git add -A` / `git add .`), message ends with a blank line and `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` (the second `-m` of every commit command below). Never push.
- **Progress log.** `/Users/antoinevigneau/thumbgen-real/.superpowers/sdd/2026-09-17-parcours-f3a/progress.md`: one line per task (commit, tests, deviations as « Ruling: … — why — cost if wrong »). Not committed.

## Code reality vs spec (rulings)

1. **Schema completeness.** `src/lib/brief/schema.ts` defines the **whole** spec schema now (`research`, `logoCandidates`, `competition`, `references` with `ThumbAnalysis`, `sketch.review`, `usage`), so F3b/F3c add tools without migrating stored briefs. `ThumbAnalysis.type` uses `THUMB_TYPE_IDS` (`src/lib/youtube/thumb-types.ts`, client-safe), `layout` the card's `LAYOUTS`, `emotion` the card's `EMOTION_LABELS`. Unspecified string limits get conservative caps (entity/logo name 80, key point 200, source title 200, pattern 120, reference title 200, channel 120). F3b tables are not created.
2. **Step 1 is a free question, `ask_user` needed options.** `ask_user.options` becomes `0..12`: no option = a free question — the card shows only a text field « Ta réponse… » + « Envoyer »; `multiple: true` with no option is refused. The answer is `{ other }`; its folded line shows the text alone (no « Autre : »). The free text keeps the existing 300-character client cap: a pasted script goes through the composer (the prompt says so).
3. **Other `ask_user` details.** `max_selected` 1..5, default `min(5, options.length)`. Text options beyond 6 render in 2 columns. Image refs: `generated:sk_<id>` → `/api/generated-sketches/sk_<id>` (16:9); `logo-candidate:` and `preview:` are F3b/F3c and render as a placeholder until then.
4. **Brief lifecycle.** The first successful `update_brief` creates the brief (project from the conversation, never from the model). `GET` answers `404 « Conversation introuvable »` for an unknown or deleted conversation and `200 { brief: null, updatedAt: null }` when the conversation has no brief yet (the header asks for it on every conversation change). `PATCH` order: `415` → `404 « Conversation introuvable »` → `404 « Fiche introuvable »` → `400 « Corps JSON invalide »` → `400 « Champ non modifiable : <clés> »` (any top-level key outside the patch schema: `step`, `research`, `usage`, `logoCandidates`, …) → `400 { error: « Fiche invalide », issues }` → `200 { brief, updatedAt, warnings }`. Last write wins (no version check): the agent sees Antoine's edit on its next turn.
5. **Patch shapes.** Patch objects accept `null` on an optional field to remove it (`video`, `common`, `abStrategy`, `abVariable`, variant `composition` / `sketch`). Patch schemas are loose on string lengths; the final brief validation gives the French messages. `research` patches only `summary`, `keyPoints`, `entities` (`sources` / `fetchedAt` are kept from the stored research, default `[]` / now). `removeVariant` is applied before `variant`. Variants are always stored sorted A, B, C. A new variant needs its full package (`direction`, `title`, `thumbnailText`, `visualIdea`, `titleRole`, `thumbRole`).
6. **Issues.** `{ path, message }` with `path` joined by `.`, and a variant index replaced by its key (`variants.A.thumbnailText`), so the agent and the sheet read the same path. French messages on every spec rule; zod's own messages elsewhere.
7. **Warnings are scoped to the update.** The overlap warning is computed only for the variant this update touches; strategy warnings only when the update touches a variant, `abStrategy` or `abVariable` — otherwise an unrelated update would repeat old warnings and the agent would « reformulate » forever. Entities excluded from the overlap = `research.entities[].name` + `logos[].name`. FR/EN stop words: the fixed list in `merge.ts`.
8. **Strategy warnings.** Only between variants that both have a card. `concepts`: same `layout` and same normalized `focal`. `single-variable` (needs `abVariable`): B/C compared with A on `thumbnailText`, `layout`, `layoutNote`, `focal`, `elements`, `textZone`, `background`, `emotion`, `palette` (key-order-independent comparison); allowed differences: `text` → `thumbnailText`, `textZone`; `emotion` → `emotion`; `background` → `background`, `palette`; `hero` → `focal`, `elements`.
9. **Emotion without character.** Refused only when `common.persona === "none"`; an unset persona (step 5 not reached) does not refuse it.
10. **Sketch GC.** After each brief write (transaction): every `variants[].sketch.source` is `markAttached`; a source present before and gone after is detached (new `markDetached`) only if no brief (`thumbnail_briefs.data`) and no canvas (`projects.nodes`) still mentions its id. Deleting a brief does not detach its sketches.
11. **Deletion.** `softDeleteConversation` becomes a transaction that also deletes the conversation's brief; `deleteProject` deletes the project's briefs in its existing transaction (SQL on the table directly — no import from `src/lib/brief`, no cycle).
12. **Usage counters.** `reserveBriefUsage(conversationId, key, refusal)` checks and increments in one transaction; `releaseBriefUsage` decrements (never below 0) when the guarded call fails (`isError` or throw). Usage writes leave `updated_at` untouched (server bookkeeping, not a decision).
13. **Sketch guard.** `buildAiSdkTools({ wrapHandler })` (new option, `tool-adapter.ts`) lets the route wrap `generate_sketch` with `guardSketchHandler(conversationId, handler)`: no brief → unchanged behaviour (EXISTING WORKFLOW, MCP untouched); brief with `step < 7` → refused « Esquisse refusée : la fiche est à l'étape n/7, les esquisses viennent à l'étape 7. »; `usage.sketches ≥ 2 × max(1, variants) + 3` → refused « Esquisse refusée : limite de N esquisses atteinte pour cette miniature. ». The spec's « sans carte » refusal belongs to `from_brief` (F3c): F3a's provisional step 7 sketches from the agent's prompt, so it is not enforced here.
14. **Web search and image trimming.** The brief is read once at turn start (after `startRun`). With a brief: no `web_search_options`; the model-input trim start becomes `max(current turn start, index of the last stored row holding an ask_user tool-result)`. Without a brief: unchanged. The three added trimmed tools apply always (it is a constant list): an earlier turn's sketch image is no longer re-sent.
15. **Chunk and refresh.** `{ type: "data-brief-updated", id: conversationId, transient: true, data: { conversationId, step, updatedAt } }`, written by `update_brief` after a successful write through the route's UI stream writer (a throwing writer is logged and ignored). `ChatPanel.onData` → `applyBriefUpdatedPart` → `useBriefStore.onBriefUpdated`: sets the step at once, then re-GETs the brief (free, local). The store also loads on every active-conversation change and when the sheet opens.
16. **Step line.** `TurnProgress` gets `journeyStep`: the live label reads « Étape 3/7 — Concurrents · Lit le canvas » (step line, a middle dot, the current step label), in the visible line and the live region. Step names: 1 « Vidéo et promesse », 2 « Recherche et logos », 3 « Concurrents », 4 « Stratégie et directions », 5 « Éléments communs », 6 « Cartes de composition », 7 « Esquisses et workflow ».
17. **« Fiche » button.** `BriefButton` in `ChatHeader`, left of « Nouvelle conversation », shown whenever a conversation is active; the badge « Étape n/7 » only when that conversation has a brief. The sheet (right side, `sm:max-w-md`) shows « Aucune fiche pour cette conversation. » without a brief. Editable: promise, audience, variant `title` / `thumbnailText` / `visualIdea`, card `focal`, element `what` / `sizePct` / `position`, `textZone` position / height, background kind / color / note, emotion label / intensity / mouth, palette (3 hex), `common.textMode`. Text fields save on Enter or blur when changed; selects on change; the first issue message (else the error) shows under the field. Roles, direction, layout, sources, references and sketches are read-only. Colors are shown as hex badges (no inline style).
18. **Prompt.** THUMBNAIL JOURNEY replaces GUIDED INTERVIEW, the Mental checklist, PROPOSING ANGLES, WHEN THE USER PICKS AN ANGLE and the core-loop line; `trigger_generation` disappears (Rules and `<project_id>` block). Tools of F3b/F3c are named with an explicit « Until then » line each (they are not in the tool list yet, so the agent never calls them). **MULTI-SELECT FOR A/B TESTING is kept in F3a** (reworded from angles to brief variants) because provisional step 7 ships A/B with `apply_workflow`; its reduction is F3c. Both endings (one variant via `place_node`, A/B via `apply_workflow`) use `finish_turn` with `{ kind: "generate", node_id }`. `INTERVIEW_PRICE_TABLE` keeps its name and content, now used by step 7. `INTERVIEW_START_MESSAGE` keeps its text and `ChatEmptyState.tsx` is unchanged: the prompt starts the journey on it and on any thumbnail request. « Reprendre l'interview / Repartir de zéro » stays, only when `iv-*` nodes exist and there is no `<thumbnail_brief>`.
19. **Existing prompt tests** that asserted removed text are updated in Task 7 (`system-prompt-existing-workflow`, `system-prompt-finish-turn`); `tests/agent/system-prompt-interview.test.ts` is replaced by `tests/agent/system-prompt-journey.test.ts`. `system-prompt.test.ts` (« Personnages only », `face_source: "stored:persona_<id>"`) and `system-prompt-ab-test.test.ts` stay green unchanged.
20. **Sketch model now.** The spec lists the model switch under F3c; the F3a brief for this plan includes « sketch model fixes ». Ruling: `generate_sketch` moves to `gemini-3.1-flash-image` (slug `google/gemini-3.1-flash-image`) in Task 6 — same cost (0,02 $), `pencil_sketch` default kept, no other change.
21. **Fake scenario.** `THUMBGEN_FAKE_AGENT=journey` replaces `interview` (`fake-interview-script.ts` and its test are deleted). It plays steps 1, 4, 5, 6 and provisional step 7 (A/B `apply_workflow`, or `place_node` for one package), **never `generate_sketch`** (no fixtures before F3c). F3c extends the same scenario.
22. **`place_node` description.** Only its first line changes (« Thumbnail journey, one variant (step 7) only: … »); ids, types and behaviour are untouched until F3c.
23. **Tool label.** `update_brief` → « Met à jour la fiche ». `update_brief` is not registered in the tool registry (built per request like `place_node`), so MCP never lists it.

## File Structure

**Create**
- `src/lib/brief/schema.ts` — constants, zod schema, `thumbnailTextIssue`, `emptyBrief`, `briefIssues`, types (pure, client-safe).
- `src/lib/brief/merge.ts` — patch schemas, `mergeBrief`, `validateBrief`, `normalizeWords`, `titleTextOverlap`, `briefWarnings`, `applyBriefUpdate`, `BRIEF_PATCH_KEYS` (pure, client-safe).
- `src/lib/brief/store.ts` — `getBrief`, `updateBrief`, `reserveBriefUsage`, `releaseBriefUsage` (server).
- `src/lib/brief/context.ts` — `briefContextView`, `buildThumbnailBriefBlock`, `briefToolSummary` (pure).
- `src/lib/brief/brief-updated.ts` — `BRIEF_UPDATED_PART`, `BriefUpdatedData`, `isBriefUpdatedData` (pure).
- `src/lib/brief/steps.ts` — `BRIEF_STEP_NAMES`, `briefStepBadge`, `briefStepLine` (pure).
- `src/lib/brief/sketch-guard.ts` — `sketchLimit`, `sketchRefusal`, `guardSketchHandler` (server).
- `src/lib/agent/v2/update-brief-tool.ts` — `UPDATE_BRIEF_TOOL_NAME`, `executeUpdateBrief`, `buildUpdateBriefTool`.
- `src/app/api/briefs/[conversationId]/route.ts` — `GET`, `PATCH`.
- `src/store/brief-store.ts` — `useBriefStore`, `resetBriefStore`, `BriefPatchOutcome`.
- `src/components/panels/chat/brief-updated-part.ts` — `applyBriefUpdatedPart`.
- `src/components/brief/brief-view.ts` — labels, items, patch builders, `fieldSaver` (pure).
- `src/components/brief/BriefFields.tsx`, `src/components/brief/BriefComposition.tsx`, `src/components/brief/BriefPanel.tsx`, `src/components/brief/BriefButton.tsx`.
- `src/lib/agent/v2/fake-journey-script.ts`.
- Tests: `tests/brief/fixtures.ts`, `tests/brief/schema.test.ts`, `tests/brief/merge.test.ts`, `tests/brief/store.test.ts`, `tests/brief/context.test.ts`, `tests/agent/update-brief-tool.test.ts`, `tests/brief/brief-routes.test.ts`, `tests/agent/prompt-engineering.test.ts`, `tests/agent/system-prompt-journey.test.ts`, `tests/brief/sketch-guard.test.ts`, `tests/agent/v2-route-handler-brief.test.ts`, `tests/brief/brief-store.test.ts`, `tests/chat/chat-panel-brief.test.ts`, `tests/brief/brief-view.test.ts`, `tests/brief/brief-panel-render.test.tsx`, `tests/brief/brief-panel-edit.test.tsx`, `tests/brief/brief-button-render.test.tsx`, `tests/agent/fake-agent-journey.test.ts`.

**Modify**
- `src/lib/agent/migrations.ts`, `src/lib/agent/conversation/store.ts` (`softDeleteConversation`), `src/lib/local-storage.ts` (`deleteProject`), `src/lib/agent/tools/_helpers/image-source.ts` (`markDetached`).
- `src/lib/agent/tool-labels.ts`.
- `src/lib/agent/browser-tools/ask-user.ts`, `src/components/panels/chat/AskUserCard.tsx`.
- `src/lib/prompt-engineering.ts`, `src/lib/agent/tools/generate-sketch.ts`.
- `src/lib/agent/system-prompt.ts`, `src/lib/agent/v2/place-node-tool.ts` (description line).
- `src/lib/agent/v2/route-handler.ts`, `src/lib/agent/v2/history-images.ts`, `src/lib/agent/v2/tool-adapter.ts`.
- `src/components/panels/chat/TurnProgress.tsx`, `src/components/panels/chat/Message.tsx`, `src/components/panels/chat/MessageList.tsx`, `src/components/panels/ChatPanel.tsx`, `src/components/panels/chat/ChatHeader.tsx`.
- `src/lib/agent/v2/fake-agent-model.ts`.
- Tests updated: `tests/agent/ask-user.test.ts`, `tests/chat/ask-user-card.test.tsx`, `tests/agent/generate-sketch.test.ts`, `tests/agent/system-prompt-existing-workflow.test.ts`, `tests/agent/system-prompt-finish-turn.test.ts`, `tests/agent/system-prompt.test.ts`, `tests/agent/v2-history-image-trim.test.ts`, `tests/agent/v2-tool-adapter.test.ts`, `tests/chat/turn-progress-render.test.tsx`.

**Delete**
- `src/lib/agent/v2/fake-interview-script.ts`, `tests/agent/fake-agent-interview.test.ts`, `tests/agent/system-prompt-interview.test.ts`.

**Unchanged on purpose:** `place-node.ts`, `canvas-patch.ts` (`INTERVIEW_NODE_ID`), `run-registry.ts`, `browser-client-tools.ts`, `PendingUiAction.tsx`, `ChatEmptyState.tsx`, `apply-workflow.ts`, `gc.ts`, `web-search-tool.ts`, `Dockerfile`, `docker-compose.yml`.

## Execution lanes

Tasks in different lanes touch disjoint files and can run in parallel worktrees; merge each lane back before the tasks that depend on it.
- **Lane A (brief core):** Task 1 → Task 2 → Task 3 → Task 4.
- **Lane B (ask_user):** Task 5.
- **Lane C (prompt):** Task 6 → Task 7 (after Task 3 for the `update_brief` name only — no import).
- **Integration:** Task 8 (after Tasks 3 and 7: both edit around `system-prompt.ts` / the route).
- **Lane D (UI):** Task 9 (after Task 1) → Task 10 (after Tasks 4, 5 and 9).
- **Fake scenario:** Task 11 (after Tasks 1, 3 and 5).
- **Tail (sequential):** Task 12 (browser, after all) → Task 13 (last, the only Docker rebuild).

Between Task 5 (the card says « Étape n/7 ») and Task 7 (the prompt stops asking 8 questions) a real model would number questions oddly; nothing is deployed before Task 13.

| Task | Files |
| --- | --- |
| 1 | `brief/schema.ts`, `brief/merge.ts`, `tests/brief/fixtures.ts`, `tests/brief/schema.test.ts`, `tests/brief/merge.test.ts` |
| 2 | `migrations.ts`, `brief/store.ts`, `conversation/store.ts`, `local-storage.ts`, `image-source.ts`, `tests/brief/store.test.ts` |
| 3 | `brief/context.ts`, `brief/brief-updated.ts`, `v2/update-brief-tool.ts`, `tool-labels.ts`, `tests/brief/context.test.ts`, `tests/agent/update-brief-tool.test.ts` |
| 4 | `app/api/briefs/[conversationId]/route.ts`, `tests/brief/brief-routes.test.ts` |
| 5 | `ask-user.ts`, `AskUserCard.tsx`, `tests/agent/ask-user.test.ts`, `tests/chat/ask-user-card.test.tsx`, `tests/agent/fake-agent-interview.test.ts` (parked) |
| 6 | `prompt-engineering.ts`, `generate-sketch.ts`, `tests/agent/prompt-engineering.test.ts`, `tests/agent/generate-sketch.test.ts` |
| 7 | `system-prompt.ts`, `place-node-tool.ts`, `tests/agent/system-prompt-journey.test.ts` (new), 2 updated, 1 deleted |
| 8 | `route-handler.ts`, `history-images.ts`, `tool-adapter.ts`, `brief/sketch-guard.ts`, `system-prompt.ts` (`buildSystemMessages`), 5 tests |
| 9 | `brief/steps.ts`, `store/brief-store.ts`, `brief-updated-part.ts`, `TurnProgress.tsx`, `Message.tsx`, `MessageList.tsx`, `ChatPanel.tsx`, 3 tests |
| 10 | `components/brief/*`, `ChatHeader.tsx`, 4 tests |
| 11 | `fake-journey-script.ts`, `fake-agent-model.ts`, `tests/agent/fake-agent-journey.test.ts`, 2 deletions |
| 12 | none (browser check) |
| 13 | none (Docker + live checks) |

---

## Task 1: Brief schema, keyed merge, validation and warnings (pure)

**Files:**
- Create: `src/lib/brief/schema.ts`, `src/lib/brief/merge.ts`
- Test: `tests/brief/fixtures.ts`, `tests/brief/schema.test.ts`, `tests/brief/merge.test.ts`

**Interfaces:**
- Consumes: `THUMB_TYPE_IDS` from `@/lib/youtube/thumb-types`.
- Produces (`schema.ts`): `BRIEF_TOTAL_STEPS = 7`; `VARIANT_KEYS`, `type VariantKey`; `GRID9`, `type Grid9`; `LAYOUTS`, `type Layout`; `EMOTION_LABELS`; `BACKGROUND_KINDS`; `AB_STRATEGIES`; `AB_VARIABLES`, `type AbVariable`; `BRIEF_MODELS`; `TEXT_MODES`, `type TextMode`; `ENTITY_KINDS`; `HEX_PATTERN`; `thumbnailTextIssue(text: string): string | null`; schemas `compositionShape`, `compositionSchema`, `sketchSchema`, `variantSchema`, `logoSchema`, `referenceSchema`, `thumbnailBriefSchema`; types `Composition`, `BriefSketch`, `BriefVariant`, `ThumbnailBrief`, `BriefUsage`; `emptyBrief(): ThumbnailBrief`; `type BriefIssue = { path: string; message: string }`; `briefIssues(error: z.ZodError): BriefIssue[]`.
- Produces (`merge.ts`): `briefUpdateInputSchema`, `type BriefUpdateInput`; `briefPatchInputSchema`, `type BriefPatchInput`; `BRIEF_PATCH_KEYS: string[]`; `mergeBrief(current, input, now): Record<string, unknown>`; `validateBrief(candidate): { ok: true; brief: ThumbnailBrief } | { ok: false; issues: BriefIssue[] }`; `normalizeWords(text): string[]`; `titleTextOverlap(title, thumbnailText, entityNames): string[]`; `briefWarnings(brief, input): string[]`; `type BriefUpdateResult`; `applyBriefUpdate(current, input, now): BriefUpdateResult`.

- [ ] **Step 1: Write the test fixtures**

Create `tests/brief/fixtures.ts`:

```ts
/** A valid package (title + thumbnail) for variant tests. */
export const pkg = (overrides: Record<string, unknown> = {}) => ({
  direction: "Promesse chiffrée",
  title: "Ma méthode pour des miniatures qui cliquent",
  thumbnailText: "10 MIN",
  visualIdea: "Visage surpris à gauche, chronomètre à droite.",
  titleRole: "Promet la méthode",
  thumbRole: "Montre la rapidité",
  ...overrides,
});

/** A valid composition card: hero on the left, text zone top-right. */
export const card = (overrides: Record<string, unknown> = {}) => ({
  layout: "face-left_object-right",
  focal: "Visage surpris",
  elements: [
    { what: "Visage surpris", role: "hero", sizePct: 45, position: "left" },
    { what: "Chronomètre", role: "support", sizePct: 25, position: "right" },
  ],
  textZone: { position: "top-right", heightPct: 20 },
  background: { kind: "solid", color: "#0F172A" },
  emotion: { label: "surprise", intensity: 2, mouth: "closed" },
  palette: { dominant: "#0F172A", accent: "#F59E0B", highlight: "#FFFFFF" },
  ...overrides,
});

export const NOW = "2026-09-17T10:00:00.000Z";
```

- [ ] **Step 2: Write the failing schema test**

Create `tests/brief/schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { compositionSchema, emptyBrief, thumbnailBriefSchema, thumbnailTextIssue, variantSchema } from "@/lib/brief/schema";
import { card, pkg } from "./fixtures";

const messages = (result: { success: boolean; error?: { issues: Array<{ message: string }> } }) =>
  result.success ? [] : result.error!.issues.map((issue) => issue.message);

describe("thumbnail brief schema", () => {
  it("accepts the empty brief", () => {
    expect(thumbnailBriefSchema.safeParse(emptyBrief()).success).toBe(true);
    expect(emptyBrief()).toMatchObject({ step: 1, common: { textMode: "rendered" }, variants: [], usage: { sketches: 0 } });
  });

  it("enforces the video limits and the 7 steps", () => {
    expect(messages(thumbnailBriefSchema.safeParse({ ...emptyBrief(), video: { promise: "x".repeat(91) } }))).toEqual([
      "90 caractères maximum",
    ]);
    expect(thumbnailBriefSchema.safeParse({ ...emptyBrief(), video: { promise: "x".repeat(90) } }).success).toBe(true);
    expect(thumbnailBriefSchema.safeParse({ ...emptyBrief(), step: 7 }).success).toBe(true);
    expect(thumbnailBriefSchema.safeParse({ ...emptyBrief(), step: 8 }).success).toBe(false);
    expect(thumbnailBriefSchema.safeParse({ ...emptyBrief(), video: { script: "x".repeat(8001) } }).success).toBe(false);
  });

  it("limits the thumbnail text to 4 words and 20 characters, empty allowed", () => {
    expect(thumbnailTextIssue("")).toBeNull();
    expect(thumbnailTextIssue("IL A OSÉ ?")).toBeNull();
    expect(thumbnailTextIssue("a b c d e")).toBe("Texte de miniature : 4 mots maximum");
    expect(thumbnailTextIssue("x".repeat(21))).toBe("Texte de miniature : 20 caractères maximum");
    expect(messages(variantSchema.safeParse({ key: "A", ...pkg({ thumbnailText: "a b c d e" }) }))).toEqual([
      "Texte de miniature : 4 mots maximum",
    ]);
    expect(variantSchema.safeParse({ key: "A", ...pkg({ thumbnailText: "" }) }).success).toBe(true);
  });

  it("requires the whole package and caps its fields", () => {
    expect(variantSchema.safeParse({ key: "A", ...pkg({ title: "x".repeat(61) }) }).success).toBe(false);
    expect(variantSchema.safeParse({ key: "A", ...pkg({ visualIdea: "x".repeat(121) }) }).success).toBe(false);
    const withoutTitle: Record<string, unknown> = pkg();
    delete withoutTitle.title;
    expect(variantSchema.safeParse({ key: "A", ...withoutTitle }).success).toBe(false);
    expect(variantSchema.safeParse({ key: "D", ...pkg() }).success).toBe(false);
  });

  it("validates a composition card", () => {
    expect(compositionSchema.safeParse(card()).success).toBe(true);
    const hero = { what: "Héros", role: "hero", sizePct: 30, position: "left" };
    const support = (position: string) => ({ what: "Soutien", role: "support", sizePct: 10, position });
    expect(messages(compositionSchema.safeParse(card({ elements: [hero, support("right"), support("top"), support("bottom")] })))).toEqual([
      "3 éléments maximum : retire-en un",
    ]);
    expect(messages(compositionSchema.safeParse(card({ elements: [support("right")] })))).toEqual(["Exactement un élément héros"]);
    expect(messages(compositionSchema.safeParse(card({ elements: [hero, { ...hero, position: "right" }] })))).toEqual([
      "Exactement un élément héros",
    ]);
    expect(
      messages(compositionSchema.safeParse(card({ elements: [{ ...hero, sizePct: 70 }, { ...support("right"), sizePct: 45 }] }))),
    ).toEqual(["La somme des tailles (115 %) dépasse 110 %"]);
    expect(messages(compositionSchema.safeParse(card({ textZone: { position: "left", heightPct: 20 } })))).toEqual([
      "La zone de texte ne peut pas être sur la case du héros",
    ]);
    expect(compositionSchema.safeParse(card({ textZone: null })).success).toBe(true);
    expect(compositionSchema.safeParse(card({ textZone: { position: "top", heightPct: 31 } })).success).toBe(false);
    expect(compositionSchema.safeParse(card({ elements: [{ ...hero, sizePct: 71 }] })).success).toBe(false);
  });

  it("defaults the emotion to intensity 2, mouth closed", () => {
    const parsed = compositionSchema.parse(card({ emotion: { label: "curiosité" } }));
    expect(parsed.emotion).toEqual({ label: "curiosité", intensity: 2, mouth: "closed" });
  });

  it("refuses an emotion without a character and duplicated variants", () => {
    const withoutPersona = {
      ...emptyBrief(),
      common: { textMode: "rendered", persona: "none" },
      variants: [{ key: "A", ...pkg(), composition: card() }],
    };
    expect(messages(thumbnailBriefSchema.safeParse(withoutPersona))).toEqual(["Pas d'émotion sans personnage"]);
    const unset = { ...withoutPersona, common: { textMode: "rendered" } };
    expect(thumbnailBriefSchema.safeParse(unset).success).toBe(true);
    const twice = { ...emptyBrief(), variants: [{ key: "A", ...pkg() }, { key: "A", ...pkg() }] };
    expect(messages(thumbnailBriefSchema.safeParse(twice))).toEqual(["Variante A en double"]);
  });

  it("caps logos, references and variants at 3", () => {
    const logo = { name: "Claude", source: "stored:lg_1" };
    expect(thumbnailBriefSchema.safeParse({ ...emptyBrief(), logos: [logo, logo, logo] }).success).toBe(true);
    expect(messages(thumbnailBriefSchema.safeParse({ ...emptyBrief(), logos: [logo, logo, logo, logo] }))).toEqual(["3 logos maximum"]);
    expect(thumbnailBriefSchema.safeParse({ ...emptyBrief(), logos: [{ name: "X", source: "https://x" }] }).success).toBe(false);
    const variants = ["A", "B", "C", "A"].map((key) => ({ key, ...pkg() }));
    expect(thumbnailBriefSchema.safeParse({ ...emptyBrief(), variants }).success).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/brief/schema.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/brief/schema"`.

- [ ] **Step 4: Write `schema.ts`**

Create `src/lib/brief/schema.ts`:

```ts
import { z } from "zod";
import { THUMB_TYPE_IDS } from "@/lib/youtube/thumb-types";

/**
 * The thumbnail brief (« fiche miniature », chantier F3): every decision of the
 * thumbnail journey, one brief per conversation. Pure and client-safe — shared
 * by the store, the update_brief tool, the routes and the « Fiche » panel.
 * Fields filled by later tools (research, logo candidates, competition,
 * references, sketch review) are already defined so stored briefs never need
 * a migration.
 */

export const BRIEF_TOTAL_STEPS = 7;

export const VARIANT_KEYS = ["A", "B", "C"] as const;
export type VariantKey = (typeof VARIANT_KEYS)[number];

export const GRID9 = ["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"] as const;
export type Grid9 = (typeof GRID9)[number];

export const LAYOUTS = [
  "face-left_object-right",
  "face-right_object-left",
  "center-hero_text-top",
  "split-versus",
  "before-after",
  "screen-hero_face-corner",
  "object-hero_no-face",
  "other",
] as const;
export type Layout = (typeof LAYOUTS)[number];

export const EMOTION_LABELS = ["curiosité", "surprise", "satisfaction", "inquiétude", "concentration", "déterminé"] as const;
export const BACKGROUND_KINDS = ["solid", "gradient", "blurred-scene", "scene"] as const;
export const AB_STRATEGIES = ["concepts", "single-variable"] as const;
export const AB_VARIABLES = ["text", "emotion", "background", "hero"] as const;
export type AbVariable = (typeof AB_VARIABLES)[number];
export const BRIEF_MODELS = ["nano-banana", "openai", "seedream"] as const;
export const TEXT_MODES = ["rendered", "overlay"] as const;
export type TextMode = (typeof TEXT_MODES)[number];
export const ENTITY_KINDS = ["company", "tool", "product", "other"] as const;

export const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

const THUMBNAIL_TEXT_MAX_CHARS = 20;
const THUMBNAIL_TEXT_MAX_WORDS = 4;

const max = (limit: number) => z.string().trim().max(limit, `${limit} caractères maximum`);
const required = (limit: number) => max(limit).min(1, "Champ requis");
const hex = z.string().regex(HEX_PATTERN, "Couleur au format #RRGGBB");
const grid9 = z.enum(GRID9);
const oneToThree = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const count = z.number().int().min(0);

/** Why a thumbnail text is refused, or null: at most 4 words and 20 characters ("" = no text). */
export function thumbnailTextIssue(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length > THUMBNAIL_TEXT_MAX_CHARS) return "Texte de miniature : 20 caractères maximum";
  if (trimmed.split(/\s+/).filter(Boolean).length > THUMBNAIL_TEXT_MAX_WORDS) return "Texte de miniature : 4 mots maximum";
  return null;
}

const thumbnailText = z
  .string()
  .trim()
  .superRefine((text, ctx) => {
    const issue = thumbnailTextIssue(text);
    if (issue) ctx.addIssue({ code: "custom", message: issue });
  });

export const emotionSchema = z.object({
  label: z.enum(EMOTION_LABELS),
  intensity: oneToThree.default(2),
  mouth: z.enum(["closed", "open"]).default("closed"),
});

export const compositionElementSchema = z.object({
  what: required(80),
  role: z.enum(["hero", "support"]),
  sizePct: z.number().int("Taille entière en %").min(5, "Taille minimale : 5 %").max(70, "Taille maximale : 70 %"),
  position: grid9,
});

/** The card's shape without its cross-field rules (used by the patch schemas the model sees). */
export const compositionShape = z.object({
  layout: z.enum(LAYOUTS),
  layoutNote: max(120).optional(),
  focal: required(80),
  elements: z.array(compositionElementSchema).min(1, "Au moins un élément").max(3, "3 éléments maximum : retire-en un"),
  textZone: z
    .object({
      position: grid9,
      heightPct: z.number().int().min(12, "Zone de texte : 12 % minimum").max(30, "Zone de texte : 30 % maximum"),
    })
    .nullable(),
  background: z.object({ kind: z.enum(BACKGROUND_KINDS), color: hex.optional(), note: max(120).optional() }),
  emotion: emotionSchema.optional(),
  palette: z.object({ dominant: hex, accent: hex, highlight: hex }),
});

export const compositionSchema = compositionShape.superRefine((card, ctx) => {
  const heroes = card.elements.filter((element) => element.role === "hero");
  if (heroes.length !== 1) ctx.addIssue({ code: "custom", path: ["elements"], message: "Exactement un élément héros" });
  const sum = card.elements.reduce((total, element) => total + element.sizePct, 0);
  if (sum > 110) ctx.addIssue({ code: "custom", path: ["elements"], message: `La somme des tailles (${sum} %) dépasse 110 %` });
  if (heroes.length === 1 && card.textZone && card.textZone.position === heroes[0].position) {
    ctx.addIssue({ code: "custom", path: ["textZone", "position"], message: "La zone de texte ne peut pas être sur la case du héros" });
  }
});
export type Composition = z.output<typeof compositionSchema>;

export const SKETCH_SOURCE_PATTERN = /^generated:sk_[A-Za-z0-9]+$/;

export const sketchSchema = z.object({
  source: z.string().regex(SKETCH_SOURCE_PATTERN, "Esquisse au format generated:sk_<id>"),
  status: z.enum(["pending", "validated", "retouch"]),
  autoFixed: z.boolean().default(false),
  review: z
    .object({
      focal: z.boolean(),
      elementCount: count,
      textZoneOk: z.boolean(),
      faceOk: z.boolean().nullable(),
      standsOut: z.boolean(),
      matchesCard: z.boolean(),
      contrast: z.number().nullable(),
      note: max(200).optional(),
    })
    .optional(),
});
export type BriefSketch = z.output<typeof sketchSchema>;

export const variantSchema = z.object({
  key: z.enum(VARIANT_KEYS),
  direction: required(60),
  title: required(60),
  thumbnailText,
  visualIdea: required(120),
  titleRole: required(80),
  thumbRole: required(80),
  composition: compositionSchema.optional(),
  sketch: sketchSchema.optional(),
});

export const researchSchema = z.object({
  summary: max(1200),
  keyPoints: z.array(max(200)).max(6, "6 points clés maximum"),
  entities: z.array(z.object({ name: required(80), kind: z.enum(ENTITY_KINDS) })).max(12, "12 entités maximum"),
  sources: z.array(z.object({ title: max(200), url: z.url() })).max(8, "8 sources maximum"),
  fetchedAt: z.string(),
});

export const logoCandidateSchema = z.object({
  id: required(40),
  name: required(80),
  source: z.enum(["simple-icons", "svgl", "wikimedia"]),
  ref: z.string(),
  previewUrl: z.string(),
});

export const logoSchema = z.object({
  name: required(80),
  source: z.string().regex(/^stored:lg_[\w-]+$/, "Logo au format stored:lg_<id>"),
});

export const competitionSchema = z.object({
  patterns: z.array(max(120)).max(3),
  saturation: z.array(max(120)).max(3),
  dominantPalette: z.array(hex).max(3),
  analyzedAt: z.string(),
});

export const thumbAnalysisSchema = z.object({
  type: z.enum(THUMB_TYPE_IDS),
  faceCount: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  emotion: z.enum(EMOTION_LABELS).optional(),
  emotionIntensity: oneToThree.optional(),
  mouthOpen: z.boolean().optional(),
  textWords: count,
  text: max(60).optional(),
  elementCount: count,
  layout: z.enum(LAYOUTS),
  background: z.enum(["solid", "gradient", "scene", "screenshot"]),
  dominantColors: z.array(hex).max(3),
  hasLogo: z.boolean(),
  hasArrowOrCircle: z.boolean(),
});

export const referenceSchema = z.object({
  videoId: z.string().regex(/^[\w-]{6,20}$/, "Identifiant de vidéo invalide"),
  title: max(200),
  channel: max(120),
  lang: z.enum(["fr", "en"]),
  views: count,
  score: z.number().nullable(),
  ageDays: count,
  source: z.string().regex(/^stored:sf_[\w-]+$/, "Référence au format stored:sf_<id>"),
  analysis: thumbAnalysisSchema.optional(),
});

export const commonSchema = z.object({
  persona: z
    .union([z.string().regex(/^stored:persona_[\w-]+$/, "Personnage au format stored:persona_<id>"), z.literal("none")])
    .optional(),
  style: max(300).optional(),
  colors: z.array(hex).max(3, "3 couleurs maximum").optional(),
  textMode: z.enum(TEXT_MODES).default("rendered"),
  model: z.enum(BRIEF_MODELS).optional(),
});

export const usageSchema = z.object({ research: count, competitorSearches: count, analyses: count, sketches: count });

export const thumbnailBriefSchema = z
  .object({
    step: z.number().int().min(1).max(BRIEF_TOTAL_STEPS),
    video: z.object({
      subject: max(300).optional(),
      workingTitle: max(120).optional(),
      script: max(8000).optional(),
      promise: max(90).optional(),
      audience: max(120).optional(),
    }),
    research: researchSchema.optional(),
    logoCandidates: z.array(logoCandidateSchema).max(36),
    logos: z.array(logoSchema).max(3, "3 logos maximum"),
    competition: competitionSchema.optional(),
    references: z.array(referenceSchema).max(3, "3 références maximum"),
    abStrategy: z.enum(AB_STRATEGIES).optional(),
    abVariable: z.enum(AB_VARIABLES).optional(),
    common: commonSchema,
    variants: z.array(variantSchema).max(3, "3 variantes maximum"),
    usage: usageSchema,
  })
  .superRefine((brief, ctx) => {
    const seen = new Set<string>();
    brief.variants.forEach((variant, index) => {
      if (seen.has(variant.key)) {
        ctx.addIssue({ code: "custom", path: ["variants", index, "key"], message: `Variante ${variant.key} en double` });
      }
      seen.add(variant.key);
      if (variant.composition?.emotion && brief.common.persona === "none") {
        ctx.addIssue({ code: "custom", path: ["variants", index, "composition", "emotion"], message: "Pas d'émotion sans personnage" });
      }
    });
  });

export type ThumbnailBrief = z.output<typeof thumbnailBriefSchema>;
export type BriefVariant = ThumbnailBrief["variants"][number];
export type BriefUsage = ThumbnailBrief["usage"];

export function emptyBrief(): ThumbnailBrief {
  return {
    step: 1,
    video: {},
    logoCandidates: [],
    logos: [],
    references: [],
    common: { textMode: "rendered" },
    variants: [],
    usage: { research: 0, competitorSearches: 0, analyses: 0, sketches: 0 },
  };
}

export type BriefIssue = { path: string; message: string };

export function briefIssues(error: z.ZodError): BriefIssue[] {
  return error.issues.map((issue) => ({ path: issue.path.map(String).join("."), message: issue.message }));
}
```

- [ ] **Step 5: Run the schema test**

Run: `./node_modules/.bin/vitest run tests/brief/schema.test.ts`
Expected: PASS (8 tests). If a message array differs only because zod reports an extra issue (e.g. the refinement did not run after a base failure), fix the fixture used in that expectation so it isolates one rule — never loosen the schema.

- [ ] **Step 6: Write the failing merge test**

Create `tests/brief/merge.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  BRIEF_PATCH_KEYS,
  applyBriefUpdate,
  briefPatchInputSchema,
  briefUpdateInputSchema,
  normalizeWords,
  titleTextOverlap,
  type BriefUpdateInput,
} from "@/lib/brief/merge";
import { emptyBrief, type ThumbnailBrief } from "@/lib/brief/schema";
import { NOW, card, pkg } from "./fixtures";

const input = (value: unknown): BriefUpdateInput => briefUpdateInputSchema.parse(value);

function apply(current: ThumbnailBrief, value: unknown) {
  const result = applyBriefUpdate(current, input(value), NOW);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result;
}

describe("brief merge", () => {
  it("merges objects field by field; null removes a field", () => {
    let brief = apply(emptyBrief(), { video: { subject: "Les miniatures", promise: "Savoir cliquer" } }).brief;
    brief = apply(brief, { video: { promise: "Savoir créer une miniature" }, step: 4 }).brief;
    expect(brief.video).toEqual({ subject: "Les miniatures", promise: "Savoir créer une miniature" });
    expect(brief.step).toBe(4);
    brief = apply(brief, { video: { promise: null } }).brief;
    expect(brief.video).toEqual({ subject: "Les miniatures" });
    brief = apply(brief, { common: { style: "Aplats" } }).brief;
    expect(brief.common).toEqual({ textMode: "rendered", style: "Aplats" });
  });

  it("replaces logos and references whole", () => {
    let brief = apply(emptyBrief(), { logos: [{ name: "Claude", source: "stored:lg_1" }, { name: "Figma", source: "stored:lg_2" }] }).brief;
    brief = apply(brief, { logos: [{ name: "Notion", source: "stored:lg_3" }] }).brief;
    expect(brief.logos).toEqual([{ name: "Notion", source: "stored:lg_3" }]);
  });

  it("merges a variant by key, replaces its card whole, removes and sorts variants", () => {
    let brief = apply(emptyBrief(), { variant: { key: "B", set: pkg({ direction: "Avant / après" }) } }).brief;
    brief = apply(brief, { variant: { key: "A", set: pkg() } }).brief;
    expect(brief.variants.map((variant) => variant.key)).toEqual(["A", "B"]);

    brief = apply(brief, { variant: { key: "A", set: { title: "Un nouveau titre", composition: card({ layoutNote: "serré" }) } } }).brief;
    expect(brief.variants[0]).toMatchObject({ title: "Un nouveau titre", direction: "Promesse chiffrée", composition: { layoutNote: "serré" } });

    brief = apply(brief, { variant: { key: "A", set: { composition: card() } } }).brief;
    expect(brief.variants[0].composition).not.toHaveProperty("layoutNote");

    brief = apply(brief, { removeVariant: "B" }).brief;
    expect(brief.variants.map((variant) => variant.key)).toEqual(["A"]);
    brief = apply(brief, { variant: { key: "A", set: { composition: null } } }).brief;
    expect(brief.variants[0]).not.toHaveProperty("composition");
  });

  it("keeps research sources from the stored brief", () => {
    const current: ThumbnailBrief = {
      ...emptyBrief(),
      research: { summary: "old", keyPoints: [], entities: [], sources: [{ title: "Doc", url: "https://example.com/doc" }], fetchedAt: NOW },
    };
    const brief = apply(current, { research: { summary: "new", sources: [{ title: "x", url: "https://evil.example" }] } }).brief;
    expect(brief.research).toEqual({ ...current.research, summary: "new" });
  });

  it("refuses an invalid result with paths keyed by variant, and writes nothing", () => {
    const current = apply(emptyBrief(), { variant: { key: "A", set: pkg() } }).brief;
    const result = applyBriefUpdate(current, input({ variant: { key: "A", set: { thumbnailText: "a b c d e" } } }), NOW);
    expect(result).toEqual({ ok: false, issues: [{ path: "variants.A.thumbnailText", message: "Texte de miniature : 4 mots maximum" }] });
    const missing = applyBriefUpdate(emptyBrief(), input({ variant: { key: "B", set: { direction: "Seule" } } }), NOW);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.issues.map((issue) => issue.path)).toContain("variants.B.title");
    expect(current.variants[0].thumbnailText).toBe("10 MIN");
  });

  it("the PATCH input has neither step nor research", () => {
    expect(BRIEF_PATCH_KEYS).not.toContain("step");
    expect(BRIEF_PATCH_KEYS).not.toContain("research");
    expect(BRIEF_PATCH_KEYS).toEqual(expect.arrayContaining(["video", "common", "variant", "removeVariant", "logos", "references"]));
    expect(briefPatchInputSchema.safeParse({ video: { promise: "x" } }).success).toBe(true);
  });
});

describe("brief warnings", () => {
  it("normalizes words: lowercase, no accents, no stop words", () => {
    expect(normalizeWords("J'ai testé LES Miniatures à 10 €")).toEqual(["ai", "teste", "miniatures", "10"]);
  });

  it("warns when the thumbnail text repeats more than one word of the title, entities excluded", () => {
    expect(titleTextOverlap("Claude remplace Figma pour le design", "FIGMA DESIGN", [])).toEqual(["figma", "design"]);
    expect(titleTextOverlap("Claude remplace Figma pour le design", "FIGMA DESIGN", ["Figma"])).toEqual(["design"]);

    const overlapping = pkg({ title: "Claude remplace Figma pour le design", thumbnailText: "FIGMA DESIGN" });
    const warned = apply(emptyBrief(), { variant: { key: "A", set: overlapping } });
    expect(warned.warnings).toEqual([
      "Variante A : le texte « FIGMA DESIGN » répète le titre (figma, design). Reformule-le pour qu'il complète le titre.",
    ]);
    const withLogo = apply({ ...emptyBrief(), logos: [{ name: "Figma", source: "stored:lg_1" }] }, { variant: { key: "A", set: overlapping } });
    expect(withLogo.warnings).toEqual([]);
  });

  it("warns on concept variants with the same layout and focal subject, only for the update that touches them", () => {
    let brief = apply(emptyBrief(), { abStrategy: "concepts", variant: { key: "A", set: { ...pkg(), composition: card() } } }).brief;
    const same = apply(brief, { variant: { key: "B", set: { ...pkg({ direction: "Autre" }), composition: card() } } });
    expect(same.warnings).toEqual([
      "Variantes A et B : même mise en page et même sujet focal. Choisis des concepts vraiment différents.",
    ]);
    brief = same.brief;
    expect(apply(brief, { video: { promise: "Autre promesse" } }).warnings).toEqual([]);
    const different = apply(brief, { variant: { key: "B", set: { composition: card({ layout: "split-versus", focal: "Deux écrans" }) } } });
    expect(different.warnings).toEqual([]);
  });

  it("warns when a single-variable variant differs from A on another field", () => {
    let brief = apply(emptyBrief(), {
      abStrategy: "single-variable",
      abVariable: "text",
      variant: { key: "A", set: { ...pkg(), composition: card() } },
    }).brief;
    const textOnly = apply(brief, { variant: { key: "B", set: { ...pkg({ thumbnailText: "ENFIN" }), composition: card() } } });
    expect(textOnly.warnings).toEqual([]);
    brief = textOnly.brief;
    const background = apply(brief, {
      variant: { key: "B", set: { composition: card({ background: { kind: "gradient", color: "#111111" } }) } },
    });
    expect(background.warnings).toEqual(["Variante B : diffère de A sur le fond, alors que le test ne change que le texte."]);
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/brief/merge.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/brief/merge"`.

- [ ] **Step 8: Write `merge.ts`**

Create `src/lib/brief/merge.ts`:

```ts
import { z } from "zod";
import {
  AB_STRATEGIES,
  AB_VARIABLES,
  BRIEF_MODELS,
  BRIEF_TOTAL_STEPS,
  ENTITY_KINDS,
  TEXT_MODES,
  VARIANT_KEYS,
  compositionShape,
  logoSchema,
  referenceSchema,
  sketchSchema,
  thumbnailBriefSchema,
  type AbVariable,
  type BriefIssue,
  type BriefVariant,
  type Composition,
  type ThumbnailBrief,
  type VariantKey,
} from "./schema";

/**
 * Updates of the thumbnail brief (update_brief and PATCH /api/briefs/…): the
 * keyed merge, the final validation and the warnings. Pure and client-safe.
 * Patch schemas only check shapes; the brief schema gives the readable rules.
 */

const optionalText = z.string().nullable().optional();

export const videoPatchSchema = z.object({
  subject: optionalText,
  workingTitle: optionalText,
  script: optionalText,
  promise: optionalText,
  audience: optionalText,
});

export const researchPatchSchema = z.object({
  summary: z.string().optional(),
  keyPoints: z.array(z.string()).optional(),
  entities: z.array(z.object({ name: z.string(), kind: z.enum(ENTITY_KINDS) })).optional(),
});

export const commonPatchSchema = z.object({
  persona: optionalText.describe('stored:persona_<id> or "none"'),
  style: optionalText,
  colors: z.array(z.string()).nullable().optional().describe("Up to 3 #RRGGBB colors"),
  textMode: z.enum(TEXT_MODES).optional(),
  model: z.enum(BRIEF_MODELS).nullable().optional(),
});

export const competitionPatchSchema = z.object({
  patterns: z.array(z.string()).optional(),
  saturation: z.array(z.string()).optional(),
  dominantPalette: z.array(z.string()).optional(),
});

export const variantSetSchema = z.object({
  direction: z.string().optional(),
  title: z.string().optional(),
  thumbnailText: z.string().optional().describe('0 to 4 words, max 20 characters; "" = no text'),
  visualIdea: z.string().optional(),
  titleRole: z.string().optional(),
  thumbRole: z.string().optional(),
  composition: compositionShape.nullable().optional().describe("The whole composition card (replaces the previous one)"),
  sketch: sketchSchema.nullable().optional().describe("The whole sketch record (replaces the previous one)"),
});

export const briefUpdateInputSchema = z.object({
  step: z.number().int().min(1).max(BRIEF_TOTAL_STEPS).optional().describe("The journey step you are moving to (1-7)"),
  video: videoPatchSchema.optional(),
  research: researchPatchSchema.optional(),
  common: commonPatchSchema.optional(),
  competition: competitionPatchSchema.optional(),
  abStrategy: z.enum(AB_STRATEGIES).nullable().optional(),
  abVariable: z.enum(AB_VARIABLES).nullable().optional(),
  logos: z.array(logoSchema).optional().describe("Replaces all the logos (max 3)"),
  references: z.array(referenceSchema).optional().describe("Replaces all the references (max 3)"),
  variant: z.object({ key: z.enum(VARIANT_KEYS), set: variantSetSchema }).optional(),
  removeVariant: z.enum(VARIANT_KEYS).optional(),
});
export type BriefUpdateInput = z.output<typeof briefUpdateInputSchema>;

/** What the « Fiche » panel may change: the same merge, without step nor research. */
export const briefPatchInputSchema = briefUpdateInputSchema.omit({ step: true, research: true });
export type BriefPatchInput = z.output<typeof briefPatchInputSchema>;
export const BRIEF_PATCH_KEYS: string[] = Object.keys(briefPatchInputSchema.shape);

function mergeFields(base: object, patch: object): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}

/** The merged, NOT yet validated brief. */
export function mergeBrief(current: ThumbnailBrief, input: BriefUpdateInput, now: string): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current };
  if (input.step !== undefined) next.step = input.step;
  if (input.video) next.video = mergeFields(current.video, input.video);
  if (input.research) {
    const base = current.research ?? { summary: "", keyPoints: [], entities: [], sources: [], fetchedAt: now };
    next.research = { ...mergeFields(base, input.research), sources: base.sources, fetchedAt: base.fetchedAt };
  }
  if (input.common) next.common = mergeFields(current.common, input.common);
  if (input.competition) {
    next.competition = mergeFields(current.competition ?? { patterns: [], saturation: [], dominantPalette: [], analyzedAt: now }, input.competition);
  }
  for (const key of ["abStrategy", "abVariable"] as const) {
    const value = input[key];
    if (value === null) delete next[key];
    else if (value !== undefined) next[key] = value;
  }
  if (input.logos) next.logos = input.logos;
  if (input.references) next.references = input.references;

  let variants: Record<string, unknown>[] = current.variants.map((variant) => ({ ...variant }));
  if (input.removeVariant) variants = variants.filter((variant) => variant.key !== input.removeVariant);
  if (input.variant) {
    const { key, set } = input.variant;
    const index = variants.findIndex((variant) => variant.key === key);
    const merged = mergeFields(index >= 0 ? variants[index] : { key }, set);
    if (index >= 0) variants[index] = merged;
    else variants.push(merged);
  }
  next.variants = variants.sort((a, b) => String(a.key).localeCompare(String(b.key)));
  return next;
}

export function validateBrief(candidate: Record<string, unknown>): { ok: true; brief: ThumbnailBrief } | { ok: false; issues: BriefIssue[] } {
  const parsed = thumbnailBriefSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, brief: parsed.data };
  const variants = Array.isArray(candidate.variants) ? (candidate.variants as Array<{ key?: unknown }>) : [];
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path
        .map((segment, index) => {
          const key = typeof segment === "number" && index === 1 && issue.path[0] === "variants" ? variants[segment]?.key : undefined;
          return typeof key === "string" ? key : String(segment);
        })
        .join("."),
      message: issue.message,
    })),
  };
}

const STOP_WORDS = new Set([
  "le", "la", "les", "l", "un", "une", "des", "de", "du", "d", "et", "ou", "a", "au", "aux", "en", "dans", "pour", "par",
  "sur", "avec", "sans", "ce", "cet", "cette", "ces", "mon", "ma", "mes", "ton", "ta", "tes", "son", "sa", "ses", "je",
  "j", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles", "qui", "que", "qu", "quoi", "est", "sont", "pas", "ne",
  "n", "plus", "the", "an", "of", "to", "in", "for", "with", "and", "or", "is", "are", "it", "this", "that", "my",
  "your", "how", "what", "why", "vs",
]);

/** Lowercase words without accents and without FR/EN stop words. */
export function normalizeWords(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0 && !STOP_WORDS.has(word));
}

/** Words of the thumbnail text also in the title, ignoring the words of the given entity names. */
export function titleTextOverlap(title: string, thumbnailText: string, entityNames: string[]): string[] {
  const excluded = new Set(entityNames.flatMap(normalizeWords));
  const titleWords = new Set(normalizeWords(title));
  return [...new Set(normalizeWords(thumbnailText).filter((word) => titleWords.has(word) && !excluded.has(word)))];
}

const COMPARED_FIELDS = ["thumbnailText", "layout", "layoutNote", "focal", "elements", "textZone", "background", "emotion", "palette"] as const;
type ComparedField = (typeof COMPARED_FIELDS)[number];

const FIELD_LABELS: Record<ComparedField, string> = {
  thumbnailText: "le texte",
  layout: "la mise en page",
  layoutNote: "la note de mise en page",
  focal: "le sujet focal",
  elements: "les éléments",
  textZone: "la zone de texte",
  background: "le fond",
  emotion: "l'émotion",
  palette: "la palette",
};

/** What a single-variable test may change between A and B/C. */
export const AB_VARIABLE_FIELDS: Record<AbVariable, readonly ComparedField[]> = {
  text: ["thumbnailText", "textZone"],
  emotion: ["emotion"],
  background: ["background", "palette"],
  hero: ["focal", "elements"],
};

const AB_VARIABLE_LABELS: Record<AbVariable, string> = { text: "le texte", emotion: "l'émotion", background: "le fond", hero: "le héros" };

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

type CardVariant = BriefVariant & { composition: Composition };

function comparable(variant: CardVariant, field: ComparedField): unknown {
  return field === "thumbnailText" ? variant.thumbnailText.trim().toLowerCase() : (variant.composition[field] ?? null);
}

function strategyWarnings(brief: ThumbnailBrief, touched: VariantKey | undefined): string[] {
  const withCard = brief.variants.filter((variant): variant is CardVariant => Boolean(variant.composition));
  const warnings: string[] = [];
  if (brief.abStrategy === "concepts") {
    for (let i = 0; i < withCard.length; i++) {
      for (let j = i + 1; j < withCard.length; j++) {
        const [a, b] = [withCard[i], withCard[j]];
        if (touched && a.key !== touched && b.key !== touched) continue;
        const sameFocal = normalizeWords(a.composition.focal).join(" ") === normalizeWords(b.composition.focal).join(" ");
        if (a.composition.layout === b.composition.layout && sameFocal) {
          warnings.push(`Variantes ${a.key} et ${b.key} : même mise en page et même sujet focal. Choisis des concepts vraiment différents.`);
        }
      }
    }
  }
  const variable = brief.abVariable;
  if (brief.abStrategy === "single-variable" && variable) {
    const base = withCard.find((variant) => variant.key === "A");
    for (const other of base ? withCard : []) {
      if (other.key === "A" || (touched && touched !== "A" && other.key !== touched)) continue;
      const extra = COMPARED_FIELDS.filter(
        (field) => !AB_VARIABLE_FIELDS[variable].includes(field) && stableJson(comparable(base!, field)) !== stableJson(comparable(other, field)),
      );
      if (extra.length > 0) {
        warnings.push(
          `Variante ${other.key} : diffère de A sur ${extra.map((field) => FIELD_LABELS[field]).join(", ")}, alors que le test ne change que ${AB_VARIABLE_LABELS[variable]}.`,
        );
      }
    }
  }
  return warnings;
}

/** Warnings for what this update touched: the text/title overlap of its variant, and the A/B strategy. */
export function briefWarnings(brief: ThumbnailBrief, input: BriefUpdateInput): string[] {
  const touched = input.variant?.key;
  const warnings: string[] = [];
  const variant = touched ? brief.variants.find((candidate) => candidate.key === touched) : undefined;
  if (variant) {
    const entityNames = [...(brief.research?.entities.map((entity) => entity.name) ?? []), ...brief.logos.map((logo) => logo.name)];
    const words = titleTextOverlap(variant.title, variant.thumbnailText, entityNames);
    if (words.length > 1) {
      warnings.push(
        `Variante ${variant.key} : le texte « ${variant.thumbnailText} » répète le titre (${words.join(", ")}). Reformule-le pour qu'il complète le titre.`,
      );
    }
  }
  if (touched || input.abStrategy !== undefined || input.abVariable !== undefined) warnings.push(...strategyWarnings(brief, touched));
  return warnings;
}

export type BriefUpdateResult = { ok: true; brief: ThumbnailBrief; warnings: string[] } | { ok: false; issues: BriefIssue[] };

export function applyBriefUpdate(current: ThumbnailBrief, input: BriefUpdateInput, now: string): BriefUpdateResult {
  const validated = validateBrief(mergeBrief(current, input, now));
  if (!validated.ok) return validated;
  return { ok: true, brief: validated.brief, warnings: briefWarnings(validated.brief, input) };
}
```

- [ ] **Step 9: Run both tests**

Run: `./node_modules/.bin/vitest run tests/brief/schema.test.ts tests/brief/merge.test.ts`
Expected: PASS. `normalizeWords("J'ai testé LES Miniatures à 10 €")` must give `["ai", "teste", "miniatures", "10"]` (« j », « les », « a » are stop words, « € » is not a letter).

- [ ] **Step 10: Type-check, lint, commit**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/lib/brief/schema.ts src/lib/brief/merge.ts tests/brief/fixtures.ts tests/brief/schema.test.ts tests/brief/merge.test.ts
git add src/lib/brief/schema.ts src/lib/brief/merge.ts tests/brief/fixtures.ts tests/brief/schema.test.ts tests/brief/merge.test.ts
git commit -m "feat(brief): thumbnail brief schema, keyed merge, rules and warnings" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Expected: `tsc` exits 0, eslint prints nothing.

---
## Task 2: Brief storage, deletion hooks, sketch attachment, usage reservations

**Files:**
- Modify: `src/lib/agent/migrations.ts`, `src/lib/agent/conversation/store.ts` (`softDeleteConversation`), `src/lib/local-storage.ts` (`deleteProject`), `src/lib/agent/tools/_helpers/image-source.ts` (add `markDetached`)
- Create: `src/lib/brief/store.ts`
- Test: `tests/brief/store.test.ts`

**Interfaces:**
- Consumes: Task 1 — `applyBriefUpdate`, `BriefUpdateInput`, `emptyBrief`, `thumbnailBriefSchema`, `ThumbnailBrief`, `BriefUsage`, `BriefIssue`; `markAttached` from `image-source.ts`.
- Produces (`store.ts`, server): `type StoredBrief = { conversationId: string; projectId: string; brief: ThumbnailBrief; updatedAt: string }`; `type BriefWriteResult = { ok: true; stored: StoredBrief; warnings: string[] } | { ok: false; issues: BriefIssue[] }`; `getBrief(conversationId: string): StoredBrief | null`; `updateBrief(conversationId: string, projectId: string, input: BriefUpdateInput): BriefWriteResult`; `type UsageReservation = { status: "no-brief" } | { status: "refused"; reason: string } | { status: "reserved" }`; `reserveBriefUsage(conversationId: string, key: keyof BriefUsage, refusal: (brief: ThumbnailBrief) => string | null): UsageReservation`; `releaseBriefUsage(conversationId: string, key: keyof BriefUsage): void`.
- Produces (`image-source.ts`): `markDetached(source: string): void`.

- [ ] **Step 1: Write the failing test**

Create `tests/brief/store.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import { AGENT_TABLES_DDL } from "@/lib/agent/migrations";
import { createConversation, softDeleteConversation } from "@/lib/agent/conversation/store";
import { deleteProject } from "@/lib/local-storage";
import { briefUpdateInputSchema } from "@/lib/brief/merge";
import { getBrief, releaseBriefUsage, reserveBriefUsage, updateBrief } from "@/lib/brief/store";
import { pkg } from "./fixtures";

const input = (value: unknown) => briefUpdateInputSchema.parse(value);

function insertSketch(): string {
  const id = `sk_${uuid().replace(/-/g, "")}`;
  getDb()
    .prepare("INSERT INTO generated_sketches (id, prompt, mime_type, data, attached) VALUES (?, 'p', 'image/png', ?, 0)")
    .run(id, Buffer.from("png"));
  return id;
}
const attached = (id: string) =>
  (getDb().prepare("SELECT attached FROM generated_sketches WHERE id = ?").get(id) as { attached: number }).attached;
const sketch = (id: string) => ({ source: `generated:${id}`, status: "pending", autoFixed: false });

describe("brief store", () => {
  it("creates the table idempotently", () => {
    expect(() => {
      getDb().exec(AGENT_TABLES_DDL);
      getDb().exec(AGENT_TABLES_DDL);
    }).not.toThrow();
    expect(getDb().prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'thumbnail_briefs'").get()).toBeTruthy();
  });

  it("creates the brief on the first update, then merges into it", () => {
    const conversationId = uuid();
    expect(getBrief(conversationId)).toBeNull();
    const first = updateBrief(conversationId, "proj-store", input({ step: 4, video: { promise: "Savoir cliquer" } }));
    expect(first.ok).toBe(true);
    const second = updateBrief(conversationId, "proj-other", input({ video: { audience: "Débutants" } }));
    if (!second.ok) throw new Error("second update refused");
    expect(second.stored).toMatchObject({
      conversationId,
      projectId: "proj-store",
      brief: { step: 4, video: { promise: "Savoir cliquer", audience: "Débutants" } },
    });
    expect(second.stored.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(getBrief(conversationId)?.brief.video).toEqual({ promise: "Savoir cliquer", audience: "Débutants" });
  });

  it("writes nothing when the update is refused", () => {
    const conversationId = uuid();
    const ok = updateBrief(conversationId, "proj-store", input({ variant: { key: "A", set: pkg() } }));
    if (!ok.ok) throw new Error("setup refused");
    const refused = updateBrief(conversationId, "proj-store", input({ step: 5, variant: { key: "A", set: { thumbnailText: "a b c d e" } } }));
    expect(refused).toEqual({ ok: false, issues: [{ path: "variants.A.thumbnailText", message: "Texte de miniature : 4 mots maximum" }] });
    const stored = getBrief(conversationId)!;
    expect(stored.brief.step).toBe(1);
    expect(stored.brief.variants[0].thumbnailText).toBe("10 MIN");
    expect(stored.updatedAt).toBe(ok.stored.updatedAt);
  });

  it("deletes the brief with its conversation, and a project's briefs with the project", () => {
    const conversation = createConversation("proj-delete-conv");
    updateBrief(conversation.id, conversation.project_id, input({ step: 2 }));
    softDeleteConversation(conversation.id);
    expect(getBrief(conversation.id)).toBeNull();

    const kept = uuid();
    const [a, b] = [uuid(), uuid()];
    updateBrief(a, "proj-delete", input({ step: 2 }));
    updateBrief(b, "proj-delete", input({ step: 3 }));
    updateBrief(kept, "proj-keep", input({ step: 3 }));
    deleteProject("proj-delete");
    expect(getBrief(a)).toBeNull();
    expect(getBrief(b)).toBeNull();
    expect(getBrief(kept)).not.toBeNull();
  });

  it("attaches the brief's sketches and detaches a replaced one no longer used anywhere", () => {
    const conversationId = uuid();
    const [first, second, onCanvas] = [insertSketch(), insertSketch(), insertSketch()];
    updateBrief(conversationId, "proj-sketch", input({ variant: { key: "A", set: { ...pkg(), sketch: sketch(first) } } }));
    expect(attached(first)).toBe(1);

    updateBrief(conversationId, "proj-sketch", input({ variant: { key: "A", set: { sketch: sketch(second) } } }));
    expect(attached(second)).toBe(1);
    expect(attached(first)).toBe(0);

    getDb()
      .prepare("INSERT INTO projects (id, nodes, edges, updated_at) VALUES (?, ?, '[]', ?)")
      .run(`proj-${uuid()}`, JSON.stringify([{ id: "s", type: "sketch", data: { image_source: `generated:${onCanvas}` } }]), new Date().toISOString());
    updateBrief(conversationId, "proj-sketch", input({ variant: { key: "A", set: { sketch: sketch(onCanvas) } } }));
    updateBrief(conversationId, "proj-sketch", input({ variant: { key: "A", set: { sketch: null } } }));
    expect(attached(onCanvas)).toBe(1);
  });

  it("reserves and releases usage in the brief", () => {
    const conversationId = uuid();
    expect(reserveBriefUsage(conversationId, "sketches", () => null)).toEqual({ status: "no-brief" });
    updateBrief(conversationId, "proj-usage", input({ step: 7 }));
    expect(reserveBriefUsage(conversationId, "sketches", () => "non")).toEqual({ status: "refused", reason: "non" });
    expect(getBrief(conversationId)!.brief.usage.sketches).toBe(0);
    const before = getBrief(conversationId)!.updatedAt;
    expect(reserveBriefUsage(conversationId, "sketches", (brief) => (brief.usage.sketches >= 2 ? "limite" : null))).toEqual({ status: "reserved" });
    expect(reserveBriefUsage(conversationId, "sketches", (brief) => (brief.usage.sketches >= 2 ? "limite" : null))).toEqual({ status: "reserved" });
    expect(reserveBriefUsage(conversationId, "sketches", (brief) => (brief.usage.sketches >= 2 ? "limite" : null))).toEqual({
      status: "refused",
      reason: "limite",
    });
    expect(getBrief(conversationId)!.brief.usage.sketches).toBe(2);
    expect(getBrief(conversationId)!.updatedAt).toBe(before);
    releaseBriefUsage(conversationId, "sketches");
    releaseBriefUsage(conversationId, "sketches");
    releaseBriefUsage(conversationId, "sketches");
    expect(getBrief(conversationId)!.brief.usage.sketches).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/brief/store.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/brief/store"`.

- [ ] **Step 3: Add the table to `AGENT_TABLES_DDL`**

In `src/lib/agent/migrations.ts`, right after the `idx_canvas_snapshots_project` index line (before the closing backtick), add:

```sql

  -- Thumbnail brief (« fiche », chantier F3): one per conversation, the
  -- decisions of the thumbnail journey as JSON (src/lib/brief/schema.ts).
  -- updated_at is ISO. Deleted with its conversation or its project.
  CREATE TABLE IF NOT EXISTS thumbnail_briefs (
    conversation_id TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL,
    data            TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_thumbnail_briefs_project ON thumbnail_briefs(project_id);
```

- [ ] **Step 4: Add `markDetached`**

In `src/lib/agent/tools/_helpers/image-source.ts`, after `markAttached`, add:

```ts
/**
 * The opposite of markAttached, for a generated sketch nothing uses any more
 * (e.g. replaced in a thumbnail brief): the GC may delete it after its TTL.
 */
export function markDetached(source: string): void {
  if (!source.startsWith("generated:")) return;
  getDb().prepare("UPDATE generated_sketches SET attached = 0 WHERE id = ?").run(source.slice("generated:".length));
}
```

- [ ] **Step 5: Delete briefs with their conversation and their project**

In `src/lib/agent/conversation/store.ts`, replace `softDeleteConversation` with:

```ts
export function softDeleteConversation(id: string): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE conversations SET deleted_at = datetime('now') WHERE id = ?").run(id);
    // Its thumbnail brief (chantier F3) goes with it.
    db.prepare("DELETE FROM thumbnail_briefs WHERE conversation_id = ?").run(id);
  })();
}
```

In `src/lib/local-storage.ts`, inside `deleteProject`'s transaction, after the `canvas_snapshots` delete, add:

```ts
    db.prepare("DELETE FROM thumbnail_briefs WHERE project_id = ?").run(id);
```

- [ ] **Step 6: Write the store**

Create `src/lib/brief/store.ts`:

```ts
import { getDb } from "@/lib/db";
import { markAttached, markDetached } from "@/lib/agent/tools/_helpers/image-source";
import { applyBriefUpdate, type BriefUpdateInput } from "./merge";
import { emptyBrief, thumbnailBriefSchema, type BriefIssue, type BriefUsage, type ThumbnailBrief } from "./schema";

/**
 * Thumbnail briefs in the database (chantier F3): one row per conversation.
 * Every write merges, validates and re-reads inside one transaction.
 */

export type StoredBrief = { conversationId: string; projectId: string; brief: ThumbnailBrief; updatedAt: string };
export type BriefWriteResult = { ok: true; stored: StoredBrief; warnings: string[] } | { ok: false; issues: BriefIssue[] };
export type UsageReservation = { status: "no-brief" } | { status: "refused"; reason: string } | { status: "reserved" };

type Row = { conversation_id: string; project_id: string; data: string; updated_at: string };

function readData(json: string): ThumbnailBrief {
  let raw: unknown = null;
  try {
    raw = JSON.parse(json);
  } catch {
    raw = null;
  }
  const parsed = thumbnailBriefSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  // Never lose a brief over a schema change: keep what can be read.
  console.error("[brief] a stored brief does not match the schema:", parsed.error.issues.slice(0, 3));
  return { ...emptyBrief(), ...(raw && typeof raw === "object" ? (raw as Partial<ThumbnailBrief>) : {}) };
}

export function getBrief(conversationId: string): StoredBrief | null {
  const row = getDb()
    .prepare("SELECT conversation_id, project_id, data, updated_at FROM thumbnail_briefs WHERE conversation_id = ?")
    .get(conversationId) as Row | undefined;
  if (!row) return null;
  return { conversationId: row.conversation_id, projectId: row.project_id, brief: readData(row.data), updatedAt: row.updated_at };
}

const sketchSources = (brief: ThumbnailBrief) =>
  new Set(brief.variants.flatMap((variant) => (variant.sketch ? [variant.sketch.source] : [])));

/** A sketch id still mentioned by a brief or a canvas must stay attached. */
function stillReferenced(source: string): boolean {
  const like = `%${source.slice("generated:".length)}%`;
  const db = getDb();
  return (
    Boolean(db.prepare("SELECT 1 FROM thumbnail_briefs WHERE data LIKE ? LIMIT 1").get(like)) ||
    Boolean(db.prepare("SELECT 1 FROM projects WHERE nodes LIKE ? LIMIT 1").get(like))
  );
}

export function updateBrief(conversationId: string, projectId: string, input: BriefUpdateInput): BriefWriteResult {
  const db = getDb();
  return db.transaction((): BriefWriteResult => {
    const existing = getBrief(conversationId);
    const current = existing?.brief ?? emptyBrief();
    const now = new Date().toISOString();
    const result = applyBriefUpdate(current, input, now);
    if (!result.ok) return result;
    db.prepare(
      `INSERT INTO thumbnail_briefs (conversation_id, project_id, data, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(conversation_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    ).run(conversationId, existing?.projectId ?? projectId, JSON.stringify(result.brief), now);

    const before = sketchSources(current);
    const after = sketchSources(result.brief);
    for (const source of after) markAttached(source);
    for (const source of before) {
      if (!after.has(source) && !stillReferenced(source)) markDetached(source);
    }

    const stored = getBrief(conversationId);
    if (!stored) throw new Error("the brief was not written");
    return { ok: true, stored, warnings: result.warnings };
  })();
}

function writeUsage(conversationId: string, brief: ThumbnailBrief): void {
  // Server bookkeeping, not a decision: updated_at is left alone.
  getDb().prepare("UPDATE thumbnail_briefs SET data = ? WHERE conversation_id = ?").run(JSON.stringify(brief), conversationId);
}

/** Checks `refusal` and counts one more `key` use, atomically. */
export function reserveBriefUsage(
  conversationId: string,
  key: keyof BriefUsage,
  refusal: (brief: ThumbnailBrief) => string | null,
): UsageReservation {
  return getDb().transaction((): UsageReservation => {
    const existing = getBrief(conversationId);
    if (!existing) return { status: "no-brief" };
    const reason = refusal(existing.brief);
    if (reason) return { status: "refused", reason };
    const usage = { ...existing.brief.usage, [key]: existing.brief.usage[key] + 1 };
    writeUsage(conversationId, { ...existing.brief, usage });
    return { status: "reserved" };
  })();
}

/** Gives back a reservation whose call failed (never below 0). */
export function releaseBriefUsage(conversationId: string, key: keyof BriefUsage): void {
  getDb().transaction(() => {
    const existing = getBrief(conversationId);
    if (!existing) return;
    const usage = { ...existing.brief.usage, [key]: Math.max(0, existing.brief.usage[key] - 1) };
    writeUsage(conversationId, { ...existing.brief, usage });
  })();
}
```

- [ ] **Step 7: Run the store test and the tests around the touched files**

Run: `./node_modules/.bin/vitest run tests/brief/store.test.ts tests/agent/conversation-store.test.ts tests/agent/conversation-routes.test.ts tests/agent/image-source.test.ts tests/agent/gc.test.ts`
Expected: PASS.

- [ ] **Step 8: Type-check, lint, commit**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/lib/brief/store.ts src/lib/agent/migrations.ts src/lib/agent/conversation/store.ts src/lib/local-storage.ts src/lib/agent/tools/_helpers/image-source.ts tests/brief/store.test.ts
git add src/lib/brief/store.ts src/lib/agent/migrations.ts src/lib/agent/conversation/store.ts src/lib/local-storage.ts src/lib/agent/tools/_helpers/image-source.ts tests/brief/store.test.ts
git commit -m "feat(brief): store thumbnail briefs, delete them with their conversation or project, keep their sketches" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: `<thumbnail_brief>` block and the `update_brief` tool

**Files:**
- Create: `src/lib/brief/context.ts`, `src/lib/brief/brief-updated.ts`, `src/lib/agent/v2/update-brief-tool.ts`
- Modify: `src/lib/agent/tool-labels.ts`
- Test: `tests/brief/context.test.ts`, `tests/agent/update-brief-tool.test.ts`

**Interfaces:**
- Consumes: Task 1 (`ThumbnailBrief`, `briefUpdateInputSchema`, `BriefUpdateInput`), Task 2 (`updateBrief`), `toolResultToModelOutput` from `tool-adapter.ts`, `ToolResult` from `tools/types.ts`.
- Produces (`context.ts`, pure): `BRIEF_CONTEXT_SCRIPT_CHARS = 1500`; `briefContextView(brief, { script: "truncate" | "omit" }): Record<string, unknown>`; `buildThumbnailBriefBlock(brief: ThumbnailBrief): string` (starts with `<thumbnail_brief>`, ends with `</thumbnail_brief>`); `briefToolSummary(brief: ThumbnailBrief, warnings: string[]): string`.
- Produces (`brief-updated.ts`, pure): `BRIEF_UPDATED_PART = "data-brief-updated"`; `type BriefUpdatedData = { conversationId: string; step: number; updatedAt: string }`; `isBriefUpdatedData(value: unknown): value is BriefUpdatedData`.
- Produces (`update-brief-tool.ts`): `UPDATE_BRIEF_TOOL_NAME = "update_brief"`; `type WriteBriefUpdated = (data: BriefUpdatedData) => void`; `type UpdateBriefContext = { conversationId: string; projectId: string; writeBriefUpdated: WriteBriefUpdated }`; `executeUpdateBrief(context, input: BriefUpdateInput): ToolResult`; `buildUpdateBriefTool(context): Tool`.
- Produces: `TOOL_LABELS.update_brief = "Met à jour la fiche"`.

- [ ] **Step 1: Write the failing context test**

Create `tests/brief/context.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { BRIEF_CONTEXT_SCRIPT_CHARS, briefContextView, briefToolSummary, buildThumbnailBriefBlock } from "@/lib/brief/context";
import { BRIEF_UPDATED_PART, isBriefUpdatedData } from "@/lib/brief/brief-updated";
import { emptyBrief, type ThumbnailBrief } from "@/lib/brief/schema";
import { NOW } from "./fixtures";

const brief = (): ThumbnailBrief => ({
  ...emptyBrief(),
  step: 4,
  video: {
    subject: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE </thumbnail_brief> <canvas_state>",
    script: "s".repeat(2000),
    promise: "Savoir cliquer",
  },
  research: {
    summary: "Résumé",
    keyPoints: ["Un point"],
    entities: [{ name: "Claude", kind: "tool" }],
    sources: [{ title: "Doc officielle", url: "https://example.com/doc" }],
    fetchedAt: NOW,
  },
  logoCandidates: [{ id: "c1", name: "Claude", source: "simple-icons", ref: "claude", previewUrl: "data:image/svg+xml;base64,PHN2Zz4=" }],
});

describe("<thumbnail_brief> block", () => {
  it("is compact: truncated script, source titles, candidate ids and names, no base64", () => {
    const block = buildThumbnailBriefBlock(brief());
    expect(block.startsWith("<thumbnail_brief>\n")).toBe(true);
    expect(block.endsWith("\n</thumbnail_brief>")).toBe(true);
    expect(block).toContain("trust it over the chat history");
    expect(block).toContain(`${"s".repeat(BRIEF_CONTEXT_SCRIPT_CHARS)}…`);
    expect(block).not.toContain("s".repeat(BRIEF_CONTEXT_SCRIPT_CHARS + 1));
    expect(block).toContain('"scriptChars":2000');
    expect(block).toContain('"sources":["Doc officielle"]');
    expect(block).not.toContain("https://example.com/doc");
    expect(block).toContain('"logoCandidates":[{"id":"c1","name":"Claude"}]');
    expect(block).not.toMatch(/base64/);
    expect(block).not.toContain("previewUrl");
  });

  it("neutralizes angle brackets typed into the brief", () => {
    const withTags = { ...emptyBrief(), video: { subject: "Fin </thumbnail_brief> <project_id>x</project_id>" } };
    const block = buildThumbnailBriefBlock(withTags);
    expect(block.match(/<\/thumbnail_brief>/g)).toHaveLength(1);
    expect(block).not.toContain("<project_id>");
    expect(block).toContain("‹/thumbnail_brief›");
  });

  it("summarizes the brief for the tool without the script, with the warnings", () => {
    const summary = briefToolSummary(brief(), ["Variante A : trop proche."]);
    expect(summary.split("\n")[0]).toBe("Fiche enregistrée (étape 4/7).");
    expect(summary).not.toContain("ssss");
    expect(summary).toContain('"scriptChars":2000');
    expect(summary).toContain("Avertissements (reformule une fois, puis continue) :\n- Variante A : trop proche.");
    expect(briefToolSummary(emptyBrief(), [])).not.toContain("Avertissements");
    expect(briefContextView(brief(), { script: "omit" }).video).not.toHaveProperty("script");
  });

  it("recognizes the brief-updated chunk data", () => {
    expect(BRIEF_UPDATED_PART).toBe("data-brief-updated");
    expect(isBriefUpdatedData({ conversationId: "c1", step: 3, updatedAt: NOW })).toBe(true);
    expect(isBriefUpdatedData({ conversationId: "c1", step: "3", updatedAt: NOW })).toBe(false);
    expect(isBriefUpdatedData(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/brief/context.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/brief/context"`.

- [ ] **Step 3: Write `brief-updated.ts` and `context.ts`**

Create `src/lib/brief/brief-updated.ts`:

```ts
/**
 * The transient chunk update_brief writes into the chat stream after a brief
 * write (chantier F3): the « Fiche » badge, the sheet and the live step line
 * refresh from it. Pure and client-safe.
 */
export const BRIEF_UPDATED_PART = "data-brief-updated" as const;

export type BriefUpdatedData = { conversationId: string; step: number; updatedAt: string };

export function isBriefUpdatedData(value: unknown): value is BriefUpdatedData {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return typeof data.conversationId === "string" && typeof data.step === "number" && typeof data.updatedAt === "string";
}
```

Create `src/lib/brief/context.ts`:

```ts
import { BRIEF_TOTAL_STEPS, type ThumbnailBrief } from "./schema";

/**
 * What the agent reads of the thumbnail brief: the per-turn `<thumbnail_brief>`
 * block and update_brief's answer. Compact — the script is truncated (or
 * omitted), research sources become their titles, logo candidates their id and
 * name — and never any base64. Pure.
 */

export const BRIEF_CONTEXT_SCRIPT_CHARS = 1500;

function scrubImages(value: unknown): unknown {
  if (typeof value === "string") return /^data:[^,]*;base64,/i.test(value) ? "[image]" : value;
  if (Array.isArray(value)) return value.map(scrubImages);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrubImages(item)]));
  }
  return value;
}

export function briefContextView(brief: ThumbnailBrief, { script }: { script: "truncate" | "omit" }): Record<string, unknown> {
  const { script: fullScript, ...video } = brief.video;
  const videoView: Record<string, unknown> = { ...video };
  if (fullScript) {
    if (script === "truncate") {
      videoView.script =
        fullScript.length > BRIEF_CONTEXT_SCRIPT_CHARS ? `${fullScript.slice(0, BRIEF_CONTEXT_SCRIPT_CHARS)}…` : fullScript;
    }
    videoView.scriptChars = fullScript.length;
  }
  const view = {
    ...brief,
    video: videoView,
    research: brief.research ? { ...brief.research, sources: brief.research.sources.map((source) => source.title) } : undefined,
    logoCandidates: brief.logoCandidates.map(({ id, name }) => ({ id, name })),
  };
  // JSON round trip: drops undefined fields, then no data URL survives.
  return scrubImages(JSON.parse(JSON.stringify(view))) as Record<string, unknown>;
}

/** The per-turn system block, after <canvas_state>. Angle brackets typed by the creator can't fake a tag. */
export function buildThumbnailBriefBlock(brief: ThumbnailBrief): string {
  const json = JSON.stringify(briefContextView(brief, { script: "truncate" }))
    .replace(/</g, "‹")
    .replace(/>/g, "›");
  return [
    "<thumbnail_brief>",
    "The thumbnail brief of this conversation (THUMBNAIL JOURNEY): every decision so far. It is the source of truth — trust it over the chat history, and resume at its step.",
    json,
    "</thumbnail_brief>",
  ].join("\n");
}

/** update_brief's answer: the saved brief without the full script, then the warnings. */
export function briefToolSummary(brief: ThumbnailBrief, warnings: string[]): string {
  const lines = [`Fiche enregistrée (étape ${brief.step}/${BRIEF_TOTAL_STEPS}).`, JSON.stringify(briefContextView(brief, { script: "omit" }))];
  if (warnings.length > 0) lines.push("Avertissements (reformule une fois, puis continue) :", ...warnings.map((warning) => `- ${warning}`));
  return lines.join("\n");
}
```

- [ ] **Step 4: Run the context test**

Run: `./node_modules/.bin/vitest run tests/brief/context.test.ts`
Expected: PASS. (The `subject` fixture starts with `data:image/png;base64,` so the whole string becomes `[image]` — that is why the `</thumbnail_brief>` it contains never reaches the first assertion; the second test covers the neutralization.)

- [ ] **Step 5: Write the failing tool test**

Create `tests/agent/update-brief-tool.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { v4 as uuid } from "uuid";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

import { getDb } from "@/lib/db";
import { createConversation } from "@/lib/agent/conversation/store";
import { briefUpdateInputSchema } from "@/lib/brief/merge";
import { getBrief } from "@/lib/brief/store";
import { TOOL_LABELS } from "@/lib/agent/tool-labels";
import { UPDATE_BRIEF_TOOL_NAME, buildUpdateBriefTool, executeUpdateBrief } from "@/lib/agent/v2/update-brief-tool";
import { pkg } from "../brief/fixtures";

const text = (result: { content: Array<{ type: string; text?: string }> }) => result.content.map((c) => c.text ?? "").join("\n");

function context() {
  const conversation = createConversation("proj-update-brief");
  const writeBriefUpdated = vi.fn();
  return { conversationId: conversation.id, projectId: conversation.project_id, writeBriefUpdated };
}

describe("update_brief", () => {
  it("writes the brief, answers its summary and broadcasts the new step", () => {
    const ctx = context();
    const result = executeUpdateBrief(ctx, briefUpdateInputSchema.parse({ step: 4, video: { promise: "Savoir cliquer", script: "long script" } }));
    expect(result.isError).toBeFalsy();
    expect(text(result)).toMatch(/^Fiche enregistrée \(étape 4\/7\)\./);
    expect(text(result)).not.toContain("long script");
    const stored = getBrief(ctx.conversationId)!;
    expect(stored.brief.video.promise).toBe("Savoir cliquer");
    expect(ctx.writeBriefUpdated).toHaveBeenCalledWith({ conversationId: ctx.conversationId, step: 4, updatedAt: stored.updatedAt });
  });

  it("refuses an invalid brief with readable reasons, without writing nor broadcasting", () => {
    const ctx = context();
    const result = executeUpdateBrief(ctx, briefUpdateInputSchema.parse({ variant: { key: "A", set: pkg({ thumbnailText: "a b c d e" }) } }));
    expect(result.isError).toBe(true);
    expect(text(result)).toBe("Fiche refusée, rien n'a été enregistré :\n- variants.A.thumbnailText : Texte de miniature : 4 mots maximum");
    expect(getBrief(ctx.conversationId)).toBeNull();
    expect(ctx.writeBriefUpdated).not.toHaveBeenCalled();
  });

  it("keeps the write when the broadcast fails", () => {
    const ctx = context();
    ctx.writeBriefUpdated.mockImplementation(() => {
      throw new Error("stream closed");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = executeUpdateBrief(ctx, briefUpdateInputSchema.parse({ step: 2 }));
    errorSpy.mockRestore();
    expect(result.isError).toBeFalsy();
    expect(getBrief(ctx.conversationId)?.brief.step).toBe(2);
  });

  it("returns the warnings to rephrase", () => {
    const ctx = context();
    const result = executeUpdateBrief(
      ctx,
      briefUpdateInputSchema.parse({ variant: { key: "A", set: pkg({ title: "Claude remplace Figma pour le design", thumbnailText: "FIGMA DESIGN" }) } }),
    );
    expect(text(result)).toContain("- Variante A : le texte « FIGMA DESIGN » répète le titre (figma, design).");
  });

  it("attaches a recorded sketch", () => {
    const ctx = context();
    const id = `sk_${uuid().replace(/-/g, "")}`;
    getDb().prepare("INSERT INTO generated_sketches (id, prompt, mime_type, data) VALUES (?, 'p', 'image/png', ?)").run(id, Buffer.from("x"));
    executeUpdateBrief(ctx, briefUpdateInputSchema.parse({ variant: { key: "A", set: { ...pkg(), sketch: { source: `generated:${id}`, status: "pending" } } } }));
    expect((getDb().prepare("SELECT attached FROM generated_sketches WHERE id = ?").get(id) as { attached: number }).attached).toBe(1);
  });

  it("is an AI SDK tool with the update schema and a label", async () => {
    const ctx = context();
    const tool = buildUpdateBriefTool(ctx);
    const schema = tool.inputSchema as { safeParse: (value: unknown) => { success: boolean } };
    expect(schema.safeParse({ variant: { key: "A", set: pkg() } }).success).toBe(true);
    expect(schema.safeParse({ step: 8 }).success).toBe(false);
    const output = await tool.execute!({ step: 3 }, { toolCallId: "u1", messages: [] } as never);
    expect(text(output as never)).toMatch(/étape 3\/7/);
    expect(UPDATE_BRIEF_TOOL_NAME).toBe("update_brief");
    expect(TOOL_LABELS.update_brief).toBe("Met à jour la fiche");
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/agent/update-brief-tool.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/agent/v2/update-brief-tool"`.

- [ ] **Step 7: Write the tool and its label**

Create `src/lib/agent/v2/update-brief-tool.ts`:

```ts
import { tool as aiTool, type Tool } from "ai";
import { briefUpdateInputSchema, type BriefUpdateInput } from "@/lib/brief/merge";
import { updateBrief } from "@/lib/brief/store";
import { briefToolSummary } from "@/lib/brief/context";
import type { BriefUpdatedData } from "@/lib/brief/brief-updated";
import type { ToolResult } from "@/lib/agent/tools/types";
import { toolResultToModelOutput } from "./tool-adapter";

export const UPDATE_BRIEF_TOOL_NAME = "update_brief";

/** Tells the open chat that the brief changed (the chat route writes a transient `data-brief-updated` chunk). */
export type WriteBriefUpdated = (data: BriefUpdatedData) => void;
export type UpdateBriefContext = { conversationId: string; projectId: string; writeBriefUpdated: WriteBriefUpdated };

export function executeUpdateBrief(context: UpdateBriefContext, input: BriefUpdateInput): ToolResult {
  const result = updateBrief(context.conversationId, context.projectId, input);
  if (!result.ok) {
    const lines = ["Fiche refusée, rien n'a été enregistré :", ...result.issues.map((issue) => `- ${issue.path || "fiche"} : ${issue.message}`)];
    return { isError: true, content: [{ type: "text", text: lines.join("\n") }] };
  }
  try {
    context.writeBriefUpdated({ conversationId: context.conversationId, step: result.stored.brief.step, updatedAt: result.stored.updatedAt });
  } catch (error) {
    // The brief is saved: the panel picks it up on its next load.
    console.error("[agent v2] update_brief: could not broadcast the brief update:", error);
  }
  return { content: [{ type: "text", text: briefToolSummary(result.stored.brief, result.warnings) }] };
}

/**
 * The thumbnail journey's `update_brief`, built for ONE chat request: the
 * conversation and its project come from the request, never from the model.
 * Not in the tool registry, so never listed to MCP clients.
 */
export function buildUpdateBriefTool(context: UpdateBriefContext): Tool {
  return aiTool({
    description: [
      "Thumbnail journey: writes decisions into this conversation's thumbnail brief (the « Fiche » the user sees and edits). Send only what changes.",
      "step: the journey step you are moving to (1-7). video, common, competition: merged field by field (null clears a field). research: summary, keyPoints, entities (sources come from the research tool). abStrategy, abVariable. logos and references: replaced whole. variant: { key: A|B|C, set } merged by key — set.composition and set.sketch replace the whole card or sketch. removeVariant: A|B|C.",
      "Refused with the reasons when the brief would break a rule (thumbnail text over 4 words or 20 characters, a card without exactly one hero, 4 elements, sizes over 110 %, a text zone on the hero's cell, an emotion without a character): fix what it names and retry once.",
      "Returns the saved brief (without the full script) and warnings to rephrase once (a thumbnail text repeating the title, variants too close for the strategy).",
    ].join("\n"),
    inputSchema: briefUpdateInputSchema,
    execute: async (input: BriefUpdateInput) => executeUpdateBrief(context, input),
    toModelOutput: ({ output }: { output: unknown }) => toolResultToModelOutput(output),
  }) as Tool;
}
```

In `src/lib/agent/tool-labels.ts`, add after `place_node: "Pose un nœud sur le canvas",`:

```ts
  update_brief: "Met à jour la fiche",
```

- [ ] **Step 8: Run the tool test and the label test**

Run: `./node_modules/.bin/vitest run tests/agent/update-brief-tool.test.ts tests/agent/tool-labels.test.ts tests/brief/context.test.ts`
Expected: PASS.

- [ ] **Step 9: Type-check, lint, commit**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/lib/brief/context.ts src/lib/brief/brief-updated.ts src/lib/agent/v2/update-brief-tool.ts src/lib/agent/tool-labels.ts tests/brief/context.test.ts tests/agent/update-brief-tool.test.ts
git add src/lib/brief/context.ts src/lib/brief/brief-updated.ts src/lib/agent/v2/update-brief-tool.ts src/lib/agent/tool-labels.ts tests/brief/context.test.ts tests/agent/update-brief-tool.test.ts
git commit -m "feat(brief): update_brief tool and the compact thumbnail_brief block" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: `GET` and `PATCH /api/briefs/[conversationId]`

**Files:**
- Create: `src/app/api/briefs/[conversationId]/route.ts`
- Test: `tests/brief/brief-routes.test.ts`

**Interfaces:**
- Consumes: Task 1 (`briefPatchInputSchema`, `BRIEF_PATCH_KEYS`, `briefIssues`), Task 2 (`getBrief`, `updateBrief`), `getConversation`, `rejectNonJsonRequest`.
- Produces: `GET` → `200 { brief: ThumbnailBrief | null, updatedAt: string | null }` | `404 { error: "Conversation introuvable" }`; `PATCH` (body `BriefPatchInput`) → `200 { brief, updatedAt, warnings: string[] }` | `400 { error, issues?: BriefIssue[] }` | `404 { error }` | `415 { error: "Requête JSON attendue" }` (ruling 4).

- [ ] **Step 1: Write the failing test**

Create `tests/brief/brief-routes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { v4 as uuid } from "uuid";
import { GET, PATCH } from "@/app/api/briefs/[conversationId]/route";
import { createConversation, softDeleteConversation } from "@/lib/agent/conversation/store";
import { briefUpdateInputSchema } from "@/lib/brief/merge";
import { getBrief, updateBrief } from "@/lib/brief/store";
import { pkg } from "./fixtures";

const url = (id: string) => `http://localhost/api/briefs/${id}`;
const ctx = (conversationId: string) => ({ params: Promise.resolve({ conversationId }) });

function patch(conversationId: string, body: unknown, contentType: string | null = "application/json") {
  const headers: Record<string, string> = {};
  if (contentType) headers["Content-Type"] = contentType;
  return PATCH(new Request(url(conversationId), { method: "PATCH", headers, body: typeof body === "string" ? body : JSON.stringify(body) }) as never, ctx(conversationId));
}

function withBrief() {
  const conversation = createConversation("proj-brief-routes");
  updateBrief(conversation.id, conversation.project_id, briefUpdateInputSchema.parse({ step: 6, variant: { key: "A", set: pkg() } }));
  return conversation.id;
}

describe("GET /api/briefs/[conversationId]", () => {
  it("answers 404 for an unknown or deleted conversation", async () => {
    expect((await GET(new Request(url("nope")) as never, ctx(uuid()))).status).toBe(404);
    const conversation = createConversation("proj-brief-routes");
    softDeleteConversation(conversation.id);
    const res = await GET(new Request(url(conversation.id)) as never, ctx(conversation.id));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Conversation introuvable" });
  });

  it("answers null without a brief, and the brief when there is one", async () => {
    const empty = createConversation("proj-brief-routes");
    expect(await (await GET(new Request(url(empty.id)) as never, ctx(empty.id))).json()).toEqual({ brief: null, updatedAt: null });
    const id = withBrief();
    const body = await (await GET(new Request(url(id)) as never, ctx(id))).json();
    expect(body.brief).toMatchObject({ step: 6, variants: [{ key: "A", title: pkg().title }] });
    expect(body.updatedAt).toBe(getBrief(id)!.updatedAt);
  });
});

describe("PATCH /api/briefs/[conversationId]", () => {
  it("accepts JSON only", async () => {
    const id = withBrief();
    const res = await patch(id, { video: { promise: "x" } }, null);
    expect(res.status).toBe(415);
    expect(getBrief(id)!.brief.video.promise).toBeUndefined();
  });

  it("answers 404 without a conversation or without a brief", async () => {
    expect((await patch(uuid(), { video: { promise: "x" } })).status).toBe(404);
    const empty = createConversation("proj-brief-routes");
    const res = await patch(empty.id, { video: { promise: "x" } });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Fiche introuvable" });
  });

  it("refuses a broken body and the fields only the agent or the server write", async () => {
    const id = withBrief();
    expect((await patch(id, "{not json")).status).toBe(400);
    for (const body of [{ step: 7 }, { research: { summary: "x" } }, { usage: { sketches: 0 } }, { logoCandidates: [] }]) {
      const res = await patch(id, body);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(`Champ non modifiable : ${Object.keys(body)[0]}`);
    }
    expect(getBrief(id)!.brief.step).toBe(6);
  });

  it("validates with the brief rules and names the field", async () => {
    const id = withBrief();
    const res = await patch(id, { variant: { key: "A", set: { thumbnailText: "a b c d e" } } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Fiche invalide",
      issues: [{ path: "variants.A.thumbnailText", message: "Texte de miniature : 4 mots maximum" }],
    });
    expect(getBrief(id)!.brief.variants[0].thumbnailText).toBe("10 MIN");
  });

  it("saves an edit with the same merge", async () => {
    const id = withBrief();
    const res = await patch(id, { video: { promise: "Savoir créer une miniature" }, common: { textMode: "overlay" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.brief).toMatchObject({ step: 6, video: { promise: "Savoir créer une miniature" }, common: { textMode: "overlay" } });
    expect(body.warnings).toEqual([]);
    expect(getBrief(id)!.brief.video.promise).toBe("Savoir créer une miniature");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/brief/brief-routes.test.ts`
Expected: FAIL — cannot resolve `@/app/api/briefs/[conversationId]/route`.

- [ ] **Step 3: Write the route**

Create `src/app/api/briefs/[conversationId]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getConversation } from "@/lib/agent/conversation/store";
import { BRIEF_PATCH_KEYS, briefPatchInputSchema } from "@/lib/brief/merge";
import { briefIssues } from "@/lib/brief/schema";
import { getBrief, updateBrief } from "@/lib/brief/store";
import { rejectNonJsonRequest } from "@/lib/youtube/route-errors";

export const runtime = "nodejs";

type Context = { params: Promise<{ conversationId: string }> };

/** The conversation's thumbnail brief (« Fiche »), or null before the journey wrote one. */
export async function GET(_req: NextRequest, { params }: Context) {
  const { conversationId } = await params;
  if (!getConversation(conversationId)) return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 });
  const stored = getBrief(conversationId);
  return NextResponse.json({ brief: stored?.brief ?? null, updatedAt: stored?.updatedAt ?? null });
}

/** An edit from the « Fiche » panel: the agent's merge and rules, without step nor research. */
export async function PATCH(req: NextRequest, { params }: Context) {
  const notJson = rejectNonJsonRequest(req);
  if (notJson) return notJson;
  const { conversationId } = await params;
  const conversation = getConversation(conversationId);
  if (!conversation) return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 });
  if (!getBrief(conversationId)) return NextResponse.json({ error: "Fiche introuvable" }, { status: 404 });

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }
  const locked = Object.keys(body).filter((key) => !BRIEF_PATCH_KEYS.includes(key));
  if (locked.length > 0) return NextResponse.json({ error: `Champ non modifiable : ${locked.join(", ")}` }, { status: 400 });

  const parsed = briefPatchInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Fiche invalide", issues: briefIssues(parsed.error) }, { status: 400 });
  const result = updateBrief(conversationId, conversation.project_id, parsed.data);
  if (!result.ok) return NextResponse.json({ error: "Fiche invalide", issues: result.issues }, { status: 400 });
  return NextResponse.json({ brief: result.stored.brief, updatedAt: result.stored.updatedAt, warnings: result.warnings });
}
```

- [ ] **Step 4: Run the test**

Run: `./node_modules/.bin/vitest run tests/brief/brief-routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check, lint, commit**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint "src/app/api/briefs/[conversationId]/route.ts" tests/brief/brief-routes.test.ts
git add "src/app/api/briefs/[conversationId]/route.ts" tests/brief/brief-routes.test.ts
git commit -m "feat(brief): GET and PATCH /api/briefs/[conversationId]" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
## Task 5: `ask_user` for the journey — steps 1..7, free questions, 12 options, 5 picks, sketch images

**Files:**
- Modify: `src/lib/agent/browser-tools/ask-user.ts` (full replacement below), `src/components/panels/chat/AskUserCard.tsx` (three targeted changes below)
- Test: `tests/agent/ask-user.test.ts`, `tests/chat/ask-user-card.test.tsx`; `tests/agent/fake-agent-interview.test.ts` parked (`describe.skip`, deleted in Task 11)

**Interfaces:**
- Consumes: nothing new.
- Produces: `ASK_USER_TOTAL_STEPS = 7`; `ASK_USER_LIMITS = { question: 200, options: 12, label: 60, description: 140, maxSelected: 5, other: 300, optionId: 40 }`; `askUserInputSchema` (`options` 0..12, `multiple` needs ≥ 1 option, `max_selected` 1..5); `askUserMaxSelected(input): number` (default `min(5, options.length)`); `askUserAnswerText` (free question → the text alone); `askUserOptionImage("generated:sk_<id>") → { src: "/api/generated-sketches/sk_<id>", shape: "wide" }`. Card: « Étape n/7 », free question field « Ta réponse… ». All other exports unchanged.

- [ ] **Step 1: Update the schema tests (failing)**

In `tests/agent/ask-user.test.ts`:

1. In « enforces the limits », replace the lines

```ts
    expect(accepts({ ...base, step: 9 })).toBe(false);
```
with
```ts
    expect(accepts({ ...base, step: 7 })).toBe(true);
    expect(accepts({ ...base, step: 8 })).toBe(false);
```
and replace
```ts
    expect(accepts({ ...base, options: [] })).toBe(false);
    expect(accepts({ ...base, options: ["1", "2", "3", "4", "5", "6"].map((id) => option(id)) })).toBe(true);
    expect(accepts({ ...base, options: ["1", "2", "3", "4", "5", "6", "7"].map((id) => option(id)) })).toBe(false);
```
with
```ts
    expect(accepts({ ...base, options: [] })).toBe(true);
    expect(accepts({ ...base, multiple: true, options: [] })).toBe(false);
    const ids = (n: number) => Array.from({ length: n }, (_, i) => option(String(i + 1)));
    expect(accepts({ ...base, options: ids(12) })).toBe(true);
    expect(accepts({ ...base, options: ids(13) })).toBe(false);
```

2. Replace the test « only allows max_selected 1 to 3 on a multiple question » with:

```ts
  it("only allows max_selected 1 to 5 on a multiple question", () => {
    expect(accepts({ ...base, multiple: true, max_selected: 5 })).toBe(true);
    expect(accepts({ ...base, multiple: true, max_selected: 0 })).toBe(false);
    expect(accepts({ ...base, multiple: true, max_selected: 6 })).toBe(false);
    expect(accepts({ ...base, multiple: false, max_selected: 2 })).toBe(false);
    expect(accepts({ ...base, max_selected: 2 })).toBe(false);
  });
```

3. In « computes how many options can be selected », replace
```ts
    const many = { ...base, multiple: true, options: ["1", "2", "3", "4", "5"].map((id) => option(id)) };
    expect(askUserMaxSelected(parseAskUserInput(many) as AskUserInput)).toBe(3);
```
with
```ts
    const many = { ...base, multiple: true, options: ["1", "2", "3", "4", "5", "6", "7"].map((id) => option(id)) };
    expect(askUserMaxSelected(parseAskUserInput(many) as AskUserInput)).toBe(5);
```

4. In « describes the answer », add at the end:

```ts
    const free = parseAskUserInput({ question: "De quoi parle la vidéo ?", step: 1, options: [] });
    expect(askUserAnswerText(free, { other: "Les miniatures" })).toBe("Les miniatures");
```

5. In « maps the list tools' references to app routes and thumbnails », add:

```ts
    expect(askUserOptionImage("generated:sk_abc123")).toEqual({ src: "/api/generated-sketches/sk_abc123", shape: "wide" });
```
and in « ignores anything else », add:
```ts
    expect(askUserOptionImage("generated:sk_../x")).toBeNull();
    expect(askUserOptionImage("generated:gi_1")).toBeNull();
```

6. Add to « ask_user rejection paths »:

```ts
  it("names a multiple question without options", () => {
    expect(issues({ ...base, multiple: true, options: [] })).toEqual([{ path: "multiple", message: "multiple requires at least one option" }]);
  });
```

- [ ] **Step 2: Update the card tests (failing)**

In `tests/chat/ask-user-card.test.tsx`:
- replace `expect(container.textContent).toContain("Question 1/8");` with `expect(container.textContent).toContain("Étape 1/7");`
- replace `expect(container.textContent).toContain("Question 2/8");` with `expect(container.textContent).toContain("Étape 2/7");`
- add this `describe` block before `describe("PendingUiAction — ask_user", …)`:

```tsx
describe("AskUserCard — thumbnail journey", () => {
  it("asks a free question with a text field only", async () => {
    const onAnswer = await render({ question: "De quoi parle la vidéo ?", step: 1, options: [], allow_skip: false });
    expect(container.textContent).toContain("Étape 1/7");
    expect(container.querySelector("input[placeholder='Autre…']")).toBeNull();
    const input = container.querySelector<HTMLInputElement>("input[placeholder='Ta réponse…']")!;
    expect(input).not.toBeNull();
    expect(input.getAttribute("aria-label")).toBe("Ta réponse");
    expect(buttons().map((el) => el.textContent)).toEqual(["Envoyer"]);
    await typeInto(input, "Une vidéo sur les miniatures");
    await click(button("Envoyer"));
    expect(onAnswer).toHaveBeenCalledWith({ other: "Une vidéo sur les miniatures" });
  });

  it("lays out more than 6 text options in two columns and allows 5 picks", async () => {
    const options = Array.from({ length: 12 }, (_, i) => ({ id: `o${i}`, label: `Option ${i}` }));
    await render({ question: "Lesquelles ?", step: 3, multiple: true, max_selected: 5, options });
    expect(container.querySelectorAll("[aria-pressed]")).toHaveLength(12);
    expect(container.querySelector(".grid-cols-2")).not.toBeNull();
    expect(container.textContent).toContain("Jusqu'à 5 choix");
  });

  it("shows generated sketches as 16:9 images", async () => {
    await render({
      question: "Variante A : valider l'esquisse ?",
      step: 7,
      options: [{ id: "ok", label: "Valider", image: "generated:sk_abc123" }],
    });
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/api/generated-sketches/sk_abc123");
    expect(container.querySelector(".aspect-video")).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `./node_modules/.bin/vitest run tests/agent/ask-user.test.ts tests/chat/ask-user-card.test.tsx`
Expected: FAIL — `step: 7` accepted/`8` refused mismatch, « Étape 1/7 » not found, no « Ta réponse… » field.

- [ ] **Step 4: Replace `ask-user.ts`**

Replace `src/lib/agent/browser-tools/ask-user.ts` with:

```ts
import { z } from "zod";

/**
 * `ask_user` (chantiers F2, F3): one clickable question of the thumbnail
 * journey. A client tool — no `execute`: the turn pauses until the chat card
 * answers `{ selected }`, `{ other }` or `{ skipped }`. With no option it is a
 * free question answered with `{ other }`. Pure — shared by the chat route's
 * tool declaration, the question card and the turn model.
 */
export const ASK_USER_TOOL_NAME = "ask_user";

/** The thumbnail journey's number of steps (« Étape n/7 »). */
export const ASK_USER_TOTAL_STEPS = 7;

export const ASK_USER_LIMITS = {
  question: 200,
  options: 12,
  label: 60,
  description: 140,
  maxSelected: 5,
  other: 300,
  optionId: 40,
} as const;

const optionSchema = z.object({
  id: z.string().trim().min(1).max(ASK_USER_LIMITS.optionId).describe("Stable id returned in `selected`."),
  label: z.string().trim().min(1).max(ASK_USER_LIMITS.label).describe("Short option text, max 60 characters."),
  description: z
    .string()
    .trim()
    .max(ASK_USER_LIMITS.description)
    .optional()
    .describe("One short line under the label, max 140 characters."),
  image: z
    .string()
    .optional()
    .describe(
      "Optional thumbnail: stored:persona_<id>, stored:sf_<id>, stored:lg_<id>, youtube:<videoId> or generated:sk_<id> (a sketch).",
    ),
});

export const askUserInputSchema = z
  .object({
    question: z.string().trim().min(1).max(ASK_USER_LIMITS.question).describe("The question, max 200 characters."),
    step: z
      .number()
      .int()
      .min(1)
      .max(ASK_USER_TOTAL_STEPS)
      .describe("The thumbnail journey step (1 to 7) this question belongs to; several questions may share a step."),
    multiple: z.boolean().default(false).describe("true lets the user pick several options, then « Valider »."),
    max_selected: z
      .number()
      .int()
      .min(1)
      .max(ASK_USER_LIMITS.maxSelected)
      .optional()
      .describe("Only with multiple: at most this many picks (1 to 5)."),
    options: z
      .array(optionSchema)
      .max(ASK_USER_LIMITS.options)
      .describe("0 to 12 options. No option = a free question: the user types the answer."),
    allow_skip: z.boolean().default(true).describe("Shows « Passer »."),
  })
  .superRefine((input, ctx) => {
    if (input.max_selected !== undefined && !input.multiple) {
      ctx.addIssue({ code: "custom", path: ["max_selected"], message: "max_selected requires multiple: true" });
    }
    if (input.multiple && input.options.length === 0) {
      ctx.addIssue({ code: "custom", path: ["multiple"], message: "multiple requires at least one option" });
    }
    const seen = new Set<string>();
    input.options.forEach((option, index) => {
      if (seen.has(option.id)) {
        ctx.addIssue({ code: "custom", path: ["options", index, "id"], message: `Duplicate option id: ${option.id}` });
      }
      seen.add(option.id);
    });
  });

export type AskUserInput = z.output<typeof askUserInputSchema>;
export type AskUserOption = AskUserInput["options"][number];

export type AskUserOutput = { selected: string[] } | { other: string } | { skipped: true; reason?: string };

export function parseAskUserInput(input: unknown): AskUserInput | null {
  const parsed = askUserInputSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

/** How many options the card lets the user pick. */
export function askUserMaxSelected(input: AskUserInput): number {
  if (!input.multiple) return 1;
  return input.max_selected ?? Math.min(ASK_USER_LIMITS.maxSelected, input.options.length);
}

/** The answer, live (`{ selected }`) or reopened (`{ type: "json", value: { selected } }`); null when unreadable. */
export function readAskUserOutput(output: unknown): AskUserOutput | null {
  if (!output || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;
  const value = record.type === "json" && "value" in record ? record.value : output;
  if (!value || typeof value !== "object") return null;
  const answer = value as Record<string, unknown>;
  if (Array.isArray(answer.selected) && answer.selected.every((id) => typeof id === "string")) {
    return { selected: answer.selected as string[] };
  }
  if (typeof answer.other === "string") return { other: answer.other };
  if (answer.skipped === true) {
    return typeof answer.reason === "string" ? { skipped: true, reason: answer.reason } : { skipped: true };
  }
  return null;
}

/** « Choc, Démo », « Autre : … » (the text alone for a free question), « Passé », « sans réponse »; null without a readable answer. */
export function askUserAnswerText(input: AskUserInput | null, output: AskUserOutput | null): string | null {
  if (!output) return null;
  if ("selected" in output) {
    return output.selected.map((id) => input?.options.find((option) => option.id === id)?.label ?? id).join(", ");
  }
  if ("other" in output) return input && input.options.length === 0 ? output.other : `Autre : ${output.other}`;
  return output.reason === "abandoned" ? "sans réponse" : "Passé";
}

/** Folded step line « <question> : <réponse> », or null when the input or the answer can't be read. */
export function askUserStepLabel(input: unknown, output: unknown): string | null {
  const parsed = parseAskUserInput(input);
  if (!parsed) return null;
  const answer = askUserAnswerText(parsed, readAskUserOutput(output));
  return answer === null ? null : `${parsed.question} : ${answer}`;
}

export type AskUserOptionImage = { src: string; shape: "wide" | "square" };

const SAFE_ID = /^[\w-]+$/;

/** URL and tile shape of an option image; null for anything that is not a known reference. */
export function askUserOptionImage(image: string | undefined): AskUserOptionImage | null {
  if (!image) return null;
  const match = image.match(/^(stored:persona_|stored:sf_|stored:lg_|youtube:|generated:sk_)(.+)$/);
  if (!match || !SAFE_ID.test(match[2])) return null;
  const id = encodeURIComponent(match[2]);
  switch (match[1]) {
    case "stored:persona_":
      return { src: `/api/personas/image?id=${id}&angle=front`, shape: "square" };
    case "stored:sf_":
      return { src: `/api/swipe-files/image?f=${id}`, shape: "wide" };
    case "stored:lg_":
      return { src: `/api/logos/image?f=${id}`, shape: "square" };
    case "generated:sk_":
      return { src: `/api/generated-sketches/sk_${id}`, shape: "wide" };
    default:
      return { src: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`, shape: "wide" };
  }
}
```

- [ ] **Step 5: Replace `AskUserCard.tsx`**

In `src/components/panels/chat/AskUserCard.tsx` only these parts change (everything else — `TILE_CLASS`, `ROW_CLASS`, `OptionText`, `OptionThumbnail`, the focus effect, `unlock`, `answer`, `skipButton`, the unreadable branch, `toggle`, `renderOption`, `sendOther`, `submitOther` — stays byte for byte):

1. The doc comment above `export default function AskUserCard` becomes:

```tsx
/**
 * One thumbnail-journey question (`ask_user`): options as a thumbnail grid or a
 * list, « Autre… » free text and « Passer »; with no option, only the free text
 * field (« Ta réponse… »). Answers exactly once — every control is disabled
 * after the first answer, and enabled again only when `onAnswer` throws or its
 * promise rejects (the answer was not sent).
 */
```

2. After `const shape = firstImage?.shape ?? null;` add:

```tsx
  const freeQuestion = question.options.length === 0;
```

3. The returned JSX becomes:

```tsx
  return (
    <div ref={groupRef} tabIndex={-1} role="group" aria-label={question.question} className="flex flex-col gap-2.5 outline-none">
      <div className="flex flex-col gap-0.5">
        <p className="text-xs text-muted-foreground">
          Étape {question.step}/{ASK_USER_TOTAL_STEPS}
        </p>
        <p className="text-sm leading-snug font-medium text-foreground">{question.question}</p>
      </div>

      {!freeQuestion && (
        <div
          className={cn(
            shape ? "grid gap-1.5" : question.options.length > 6 ? "grid grid-cols-2 gap-1.5" : "flex flex-col gap-1.5",
            shape === "wide" && "grid-cols-2",
            shape === "square" && "grid-cols-3",
          )}
        >
          {question.options.map(renderOption)}
        </div>
      )}

      {question.multiple && (
        <p className="-mt-1 text-xs text-muted-foreground">
          Jusqu&apos;à {maxSelected} choix
        </p>
      )}

      {question.multiple && (
        <Button
          size="sm"
          className="self-start"
          disabled={answered || selected.length === 0}
          onClick={() =>
            answer({ selected: question.options.map((option) => option.id).filter((id) => selected.includes(id)) })
          }
        >
          Valider
        </Button>
      )}

      <form onSubmit={submitOther} className="flex gap-1.5">
        <Input
          value={other}
          onChange={(event) => setOther(event.target.value)}
          // Explicit Enter (not only the form's implicit submission, which some key events skip).
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            sendOther();
          }}
          maxLength={ASK_USER_LIMITS.other}
          placeholder={freeQuestion ? "Ta réponse…" : "Autre…"}
          aria-label={freeQuestion ? "Ta réponse" : "Autre réponse"}
          disabled={answered}
          className="h-7 text-xs md:text-xs"
        />
        <Button type="submit" variant="outline" size="sm" disabled={answered || other.trim() === ""}>
          Envoyer
        </Button>
      </form>

      {question.allow_skip && <div className="flex justify-end">{skipButton}</div>}
    </div>
  );
```

- [ ] **Step 6: Run the tests around `ask_user`**

Run: `./node_modules/.bin/vitest run tests/agent/ask-user.test.ts tests/chat/ask-user-card.test.tsx tests/chat/ask-user-turn.test.ts tests/agent/run-registry.test.ts tests/agent/v2-route-handler-interview.test.ts tests/agent/client-tools.test.ts`
Expected: PASS.

- [ ] **Step 7: Park the F2 interview fake-model test**

`tests/agent/fake-agent-interview.test.ts` plays F2's 8-question script, whose last question (`step: 8`) is now refused by the schema. The scenario and this test are replaced in Task 11; until then, keep the suite green: change its line `describe("fake agent — interview scenario", () => {` to

```ts
// F2 interview (step 8) — replaced by the « journey » scenario in Task 11 of the F3a plan.
describe.skip("fake agent — interview scenario", () => {
```

Run: `./node_modules/.bin/vitest run tests/agent/fake-agent-interview.test.ts`
Expected: all tests skipped.

- [ ] **Step 8: Type-check, lint, commit**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/lib/agent/browser-tools/ask-user.ts src/components/panels/chat/AskUserCard.tsx tests/agent/ask-user.test.ts tests/chat/ask-user-card.test.tsx
git add src/lib/agent/browser-tools/ask-user.ts src/components/panels/chat/AskUserCard.tsx tests/agent/ask-user.test.ts tests/chat/ask-user-card.test.tsx tests/agent/fake-agent-interview.test.ts
git commit -m "feat(chat): ask_user for the thumbnail journey — steps 1-7, free questions, 12 options, 5 picks, sketch images" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Prompt-engineering guidance fixes and the sketch model

**Files:**
- Modify: `src/lib/prompt-engineering.ts`, `src/lib/agent/tools/generate-sketch.ts`
- Test: `tests/agent/prompt-engineering.test.ts` (new), `tests/agent/generate-sketch.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: the same exports of `prompt-engineering.ts` (`PROMPT_ANATOMY`, `ANTI_CONTRADICTION_RULES`, `YOUTUBE_THUMBNAIL_PATTERNS`, `MODEL_SELECTION_GUIDE`, `WORKED_EXAMPLE`, `STANDARD_NEGATIVE_PROMPT`, `buildAgentRubric`, `buildEnhanceRubric`, `LANG_NAMES`, `langName`) with new text; `generate_sketch` calls `google/gemini-3.1-flash-image` and logs/costs `gemini-3.1-flash-image`.

- [ ] **Step 1: Write the failing guidance test**

Create `tests/agent/prompt-engineering.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  MODEL_SELECTION_GUIDE,
  PROMPT_ANATOMY,
  WORKED_EXAMPLE,
  YOUTUBE_THUMBNAIL_PATTERNS,
  buildAgentRubric,
  buildEnhanceRubric,
} from "@/lib/prompt-engineering";

describe("thumbnail guidance", () => {
  const rubrics = [buildAgentRubric(), buildEnhanceRubric("fr")];

  it("only names the models the app has", () => {
    for (const text of rubrics) expect(text).not.toMatch(/ideogram|grok/i);
    for (const model of ["nano-banana", "openai", "seedream"]) expect(MODEL_SELECTION_GUIDE).toContain(model);
  });

  it("uses the 168×94 mobile size and no unsourced CTR figure", () => {
    for (const text of rubrics) {
      expect(text).not.toContain("200×112");
      expect(text).not.toContain("~30%");
      expect(text).toContain("168×94");
    }
  });

  it("asks for 0 to 4 words complementing the title and at most 3 elements", () => {
    expect(YOUTUBE_THUMBNAIL_PATTERNS).toContain("0 to 4 words");
    expect(YOUTUBE_THUMBNAIL_PATTERNS).toMatch(/complement(s|ing) the (video )?title/);
    expect(PROMPT_ANATOMY).toContain("At most 3 elements in total, the hero included");
    expect(PROMPT_ANATOMY).toContain("medium shot with action");
    expect(PROMPT_ANATOMY).toContain("completely empty");
    expect(buildEnhanceRubric("fr")).toContain("0 à 4 mots");
  });

  it("shows a worked example with 3 elements, a closed mouth and a moderate emotion", () => {
    expect(WORKED_EXAMPLE).toContain("mouth closed");
    expect(WORKED_EXAMPLE).toContain("exactly 3 elements");
    expect(WORKED_EXAMPLE).not.toMatch(/mouth wide open|extreme shock/);
  });
});
```

- [ ] **Step 2: Add the failing sketch-model test**

In `tests/agent/generate-sketch.test.ts`, add inside `describe("generate_sketch", …)`:

```ts
  it("draws with Gemini 3.1 Flash Image at the same cost", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ b64_json: onePxPng, media_type: "image/png" }] }),
    });
    const { generateSketchTool } = await import("@/lib/agent/tools/generate-sketch");
    const r = await generateSketchTool.handler({ prompt: "model check" });
    expect(r.isError).toBeFalsy();
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.model).toBe("google/gemini-3.1-flash-image");
    const id = (r.content[0] as { text: string }).text.match(/generated:(sk_\w+)/)![1];
    const row = getDb().prepare("SELECT cost_estimate FROM generated_sketches WHERE id = ?").get(id) as { cost_estimate: number };
    expect(row.cost_estimate).toBe(0.02);
  });
```

- [ ] **Step 3: Run both to verify they fail**

Run: `./node_modules/.bin/vitest run tests/agent/prompt-engineering.test.ts tests/agent/generate-sketch.test.ts`
Expected: FAIL — `ideogram` found, `200×112` found, model `google/gemini-2.5-flash-image`.

- [ ] **Step 4: Rewrite the guidance**

In `src/lib/prompt-engineering.ts`:

1. In `PROMPT_ANATOMY`, replace the `COMPOSITION`, `OBJECTS` and `TEXT` lines with:

```
  COMPOSITION  — Pick ONE valid framing: extreme close-up | close-up | medium close-up | medium shot | medium full shot | full shot | wide shot. Optionally a medium shot with action (the subject doing something with the hero object). Then position of the subject in the frame (left third / centered / right third) using the rule of thirds. State explicitly that the midground is "behind subject, slightly out of focus" and background is "deep, blurred to bokeh" if you want depth-of-field separation between the 3 planes.
  OBJECTS      — At most 3 elements in total, the hero included. Each object with relative size as a % of frame + exact position + which plane (foreground / midground / background). Ex: "Claude logo (orange 8-pointed star, 14% frame) center-left, foreground, glowing with soft halo."
  TEXT         — 0 to 4 words (max 20 characters) in the requested language, ALL CAPS, bold sans-serif, color + position + "thick black outline" + size as % frame height. Omit ENTIRELY if no text overlay. When the text is added afterwards (overlay mode), write instead: "leave the <zone> area (<n>% of height) completely empty".
```

2. Replace `YOUTUBE_THUMBNAIL_PATTERNS` with:

```ts
export const YOUTUBE_THUMBNAIL_PATTERNS = `YOUTUBE-THUMBNAIL-SPECIFIC PATTERNS:

COLOR PALETTE
- High saturation + high contrast. Mobile preview is 168×94 px — subtle gradients vanish.
- Background should differ STRONGLY from white (YouTube's default UI). Dark backgrounds (deep navy #0F172A, charcoal #1A1A1A, deep purple #2E1065) make warm subjects pop.
- 1 dominant color (60% of frame) + 1 accent (30%) + 1 highlight (10%). Don't list 5 colors — pick a hierarchy.
- Branded thumbnails: anchor on the brand's signature color (Claude orange ~#D97706, Figma's purple ~#7C3AED, etc.).

COMPOSITION
- One focal subject, identifiable in under a second at 168×94 px, and at most 3 elements, the hero included.
- Subject occupies 50-70% of frame for face-forward thumbnails — leave room for context but the face must dominate.
- Rule of thirds: subject on left third or right third with text/objects on the opposite third creates tension. Centered subject = static, less click.
- Empty/blurred space behind the subject so text is legible without competing with the background.

TEXT
- 0 to 4 words (max 20 characters), legible at 168×94 px. It complements the video title — never repeats it — and never promises what the video doesn't deliver.
- Bold sans-serif (Anton, Bebas Neue, Inter Black, Bangers feel). Italic / thin / serif = unreadable small.
- Thick black outline (3-5% of text height). Yellow/white/red are the highest-contrast colors against dark backgrounds.
- Position: top-left or bottom-right (avoid YouTube's UI overlays in bottom-right).

FACE PRESENCE
- Use a face when the competing thumbnails of this topic show faces working; go faceless when they are dominantly faceless.
- Match the emotion to the promise: surprise for "this changes everything", concentration for "I tested it", curiosity for "the hidden feature". Keep it moderate by default (mouth closed); an open-mouth shock only when the angle really calls for it.`;
```

3. Replace `MODEL_SELECTION_GUIDE` with:

```ts
export const MODEL_SELECTION_GUIDE = `MODEL SELECTION — pick deliberately based on the dominant element of your design:

  nano-banana (Gemini 3.1 Flash Image) — DEFAULT. Fast, cheap (~$0.02/image), natural composition, good with faces. Use unless another model fits better.
  openai (GPT Image)                    — Most reliable TEXT rendering (accents, more than 2 words) and clean tech / product / UI compositions.
  seedream (Seedream 4.5)               — Best identity consistency when a Personnage is connected and the thumbnail has no text.

Thumbnail text with accents or more than 2 words → openai. A Personnage and no text → seedream. Otherwise → nano-banana. Don't agonize.`;
```

4. Replace `WORKED_EXAMPLE` with:

```ts
export const WORKED_EXAMPLE = `WORKED EXAMPLE — package "Claude remplace Figma ?" (title "J'ai remplacé Figma par Claude pendant 7 jours", thumbnail text "FIGMA ?"), with the user's Personnage connected. 3 elements: the man (hero), the Claude logo, the cracked Figma logo.

Young man in the right third of the foreground, eyebrows raised and eyes slightly narrowed in skeptical surprise, mouth closed, head tilted slightly left, holding a tablet toward the camera.
Behind him in the midground, a large Figma logo cracks into a few glowing orange shards; further back, a dark design studio with purple wall accents fades into bokeh.
Medium shot with action, subject occupies the right 45% of the frame; midground slightly out of focus; background blurred to soft bokeh.
Claude logo (orange 8-pointed star, 14% frame) glowing on the tablet screen, foreground. Cracked Figma logo (18% frame) midground left, behind the subject's shoulder.
"FIGMA ?" in white bold sans-serif, top-left corner, thick black outline, 18% frame height.
Warm orange key light on the subject from the left, cool blue rim light from behind, background deep navy.
photorealistic, cinematic.

Notice: 7 sentences, no labels, exactly 3 elements (hero included), a moderate emotion with the mouth closed, a 2-word text that complements the title instead of repeating it, lighting layered per plane, style is 2 words. THIS is the bar.`;
```

5. In `buildEnhanceRubric`, replace `(Gemini, Ideogram, GPT Image, Midjourney)` with `(Gemini, GPT Image, Seedream)` and the `## TEXTE OVERLAY` bullet `- Si demandé : 2-3 mots en ${lang}, MAJUSCULES, couleur + position + "thick black outline" + taille en % de l'image.` with:

```
- Si demandé : 0 à 4 mots (20 caractères au plus) en ${lang}, MAJUSCULES, complémentaires du titre de la vidéo, couleur + position + "thick black outline" + taille en % de l'image.
```

- [ ] **Step 5: Switch the sketch model**

In `src/lib/agent/tools/generate-sketch.ts`, replace

```ts
const SKETCH_MODEL = "gemini-2.5-flash-image"; // fastest/cheapest variant for drafts
const OPENROUTER_SKETCH_SLUG = "google/gemini-2.5-flash-image";
```
with
```ts
// Gemini 3.1 Flash Image: same price as 2.5 (MODEL_COSTS), better layouts and references.
const SKETCH_MODEL = "gemini-3.1-flash-image";
const OPENROUTER_SKETCH_SLUG = "google/gemini-3.1-flash-image";
```

- [ ] **Step 6: Run the tests**

Run: `./node_modules/.bin/vitest run tests/agent/prompt-engineering.test.ts tests/agent/generate-sketch.test.ts tests/agent/system-prompt.test.ts tests/agent/system-prompt-ab-test.test.ts`
Expected: PASS. (`system-prompt-interview.test.ts` and `system-prompt-existing-workflow.test.ts` are rewritten in Task 7; if one of them fails here only because of guidance text, note it and continue.)

- [ ] **Step 7: Type-check, lint, commit**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/lib/prompt-engineering.ts src/lib/agent/tools/generate-sketch.ts tests/agent/prompt-engineering.test.ts tests/agent/generate-sketch.test.ts
git add src/lib/prompt-engineering.ts src/lib/agent/tools/generate-sketch.ts tests/agent/prompt-engineering.test.ts tests/agent/generate-sketch.test.ts
git commit -m "fix(agent): thumbnail guidance without ideogram/grok, 168x94, 0-4 words, 3 elements; sketches on Gemini 3.1 Flash Image" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
## Task 7: THUMBNAIL JOURNEY in the system prompt

**Files:**
- Modify: `src/lib/agent/system-prompt.ts` (the static prompt and the `<project_id>` block text), `src/lib/agent/v2/place-node-tool.ts` (first description line)
- Test: `tests/agent/system-prompt-journey.test.ts` (new); update `tests/agent/system-prompt-existing-workflow.test.ts`, `tests/agent/system-prompt-finish-turn.test.ts`; delete `tests/agent/system-prompt-interview.test.ts`

**Interfaces:**
- Consumes: `INTERVIEW_PRICE_TABLE` (unchanged), tool names `update_brief` (Task 3), `ask_user` (Task 5), `place_node`, `apply_workflow`, `generate_sketch`, `list_personas`, `list_logos`, `finish_turn`.
- Produces: `AGENT_SYSTEM_PROMPT` with sections, in order: persona, EXISTING WORKFLOW, THUMBNAIL JOURNEY, Rules, rubric, ENDING EVERY TURN, MULTI-SELECT FOR A/B TESTING. `buildSystemMessages` signature unchanged in this task (Task 8 adds the brief).

- [ ] **Step 1: Write the failing journey test**

Create `tests/agent/system-prompt-journey.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { AGENT_SYSTEM_PROMPT, INTERVIEW_PRICE_TABLE, buildSystemMessages } from "@/lib/agent/system-prompt";
import { MODEL_COSTS } from "@/lib/model-costs";

function section(): string {
  const start = AGENT_SYSTEM_PROMPT.indexOf("THUMBNAIL JOURNEY —");
  expect(start).toBeGreaterThanOrEqual(0);
  return AGENT_SYSTEM_PROMPT.slice(start, AGENT_SYSTEM_PROMPT.indexOf("\nRules:", start));
}

describe("system prompt — thumbnail journey", () => {
  it("has one THUMBNAIL JOURNEY section, after EXISTING WORKFLOW and before the rules", () => {
    expect(AGENT_SYSTEM_PROMPT.split("THUMBNAIL JOURNEY —").length - 1).toBe(1);
    const heading = AGENT_SYSTEM_PROMPT.indexOf("THUMBNAIL JOURNEY —");
    expect(heading).toBeGreaterThan(AGENT_SYSTEM_PROMPT.indexOf("EXISTING WORKFLOW —"));
    expect(heading).toBeLessThan(AGENT_SYSTEM_PROMPT.indexOf("\nRules:"));
    expect(AGENT_SYSTEM_PROMPT.indexOf("MULTI-SELECT FOR A/B TESTING —")).toBeGreaterThan(AGENT_SYSTEM_PROMPT.indexOf("ENDING EVERY TURN"));
  });

  it("replaces the F2 interview, the checklist, the angles flow and the core loop", () => {
    for (const gone of [
      "GUIDED INTERVIEW",
      "Mental checklist",
      "PROPOSING ANGLES",
      "WHEN THE USER PICKS AN ANGLE",
      "This is the core loop",
      "trigger_generation",
      "8 fixed clickable questions",
      "IMMEDIATELY call apply_workflow",
    ]) {
      expect(AGENT_SYSTEM_PROMPT, gone).not.toContain(gone);
    }
    expect(AGENT_SYSTEM_PROMPT).not.toMatch(/ideogram|grok/i);
    expect(AGENT_SYSTEM_PROMPT).not.toContain("200×112");
    expect(AGENT_SYSTEM_PROMPT).not.toContain("~30%");
    const projectBlock = buildSystemMessages({ nodes: [], edges: [] }, "proj_1").find((block) => block.text.includes("<project_id>"))!;
    expect(projectBlock.text).not.toContain("trigger_generation");
  });

  it("starts on the button and on any thumbnail request", () => {
    const text = section();
    expect(text).toContain("Aide-moi à construire la miniature de ma vidéo.");
    expect(text).toMatch(/every request to create or design a thumbnail/);
    expect(text).toMatch(/Never jump to sketches/);
  });

  it("lists the 7 steps in order", () => {
    const text = section();
    const order = [
      "1. Video and promise",
      "2. Research and logos",
      "3. Competitors",
      "4. Strategy and directions",
      "5. Common elements",
      "6. Composition cards",
      "7. Sketches, previews, then workflow",
    ].map((label) => text.indexOf(label));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("writes every decision to the brief and trusts <thumbnail_brief>", () => {
    const text = section();
    expect(text).toContain("update_brief");
    expect(text).toContain("<thumbnail_brief>");
    expect(text).toContain("trust it over the chat history");
    expect(text).toMatch(/ask_user alone in (its|their) step/);
    expect(text).toMatch(/fix what it names and retry once/);
    expect(text).toMatch(/rephrase once/);
  });

  it("states the packaging rules", () => {
    const text = section();
    expect(text).toContain("0 to 4 words and ≤ 20 characters");
    expect(text).toMatch(/complements the title, never repeats it/);
    expect(text).toContain('abStrategy "concepts"');
    expect(text).toContain('"single-variable"');
    expect(text).toMatch(/Never a 4th element/);
    expect(text).toMatch(/never on the hero's cell/);
  });

  it("asks a free first question and never offers old videos", () => {
    const text = section();
    expect(text).toMatch(/ask_user with no options/);
    expect(text).toContain("Never offer old videos");
  });

  it("degrades gracefully: tools of the next sub-projects are named with what to do until then", () => {
    const text = section();
    expect(text).toMatch(/do not exist yet/);
    for (const tool of ["research_topic", "find_logos", "find_competitor_thumbnails", "analyze_thumbnails", "preview_thumbnail"]) {
      expect(text).toContain(tool);
    }
    expect(text.match(/Until then:/g)!.length).toBeGreaterThanOrEqual(3);
    expect(text).toContain("list_logos");
    expect(text).toContain("list_personas");
  });

  it("ends on place_node for one variant or apply_workflow for A/B, with the generate action", () => {
    const text = section();
    expect(text).toContain("place_node iv-prompt");
    expect(text).toContain("MULTI-SELECT FOR A/B TESTING");
    expect(text).toContain('next_actions [{ kind: "generate", node_id: "iv-generator" }]');
    expect(text).toMatch(/Never generate an image yourself/);
    expect(text).toContain('face_source: "stored:persona_<id>"');
    expect(text).toContain("Personnages only");
  });

  it("offers to resume or restart F2 interview nodes only without a brief", () => {
    const text = section();
    expect(text).toContain("iv-* nodes and there is no <thumbnail_brief>");
    expect(text).toContain("Reprendre l'interview");
    expect(text).toContain("Repartir de zéro");
    expect(text).toMatch(/apply_workflow with an empty blueprint and remove_node_ids listing the existing iv-\* nodes/);
  });

  it("prices the step 7 model options from MODEL_COSTS", () => {
    expect(INTERVIEW_PRICE_TABLE).toContain(`nano-banana — Gemini 3.1 Flash — "Nano Banana · ~0,02 $ / image"`);
    expect(INTERVIEW_PRICE_TABLE).toContain(`openai — GPT Image 2.5 Sunburst (précis) — "GPT Image · ~0,05 $ / image"`);
    expect(INTERVIEW_PRICE_TABLE).toContain(`seedream — Seedream 4.5 (ByteDance) — "Seedream · ~0,02 $ / image"`);
    expect(MODEL_COSTS["gemini-3.1-flash-image"]).toBe(0.02);
    expect(section()).toContain(INTERVIEW_PRICE_TABLE);
  });

  it("stays in the cached block: no per-turn block names the journey tools", () => {
    const blocks = buildSystemMessages({ nodes: [], edges: [] }, "proj_1");
    expect(blocks[0].text).toContain("THUMBNAIL JOURNEY");
    expect(blocks.slice(1).some((block) => /update_brief|ask_user|place_node/.test(block.text))).toBe(false);
  });
});
```

- [ ] **Step 2: Update the two existing prompt tests**

In `tests/agent/system-prompt-existing-workflow.test.ts`:
1. In the first test replace `expect(text).toMatch(/An angle pick, or any other precise request/);` with `expect(text).toMatch(/A precise request/);` and `expect(AGENT_SYSTEM_PROMPT.indexOf("EXISTING WORKFLOW")).toBeLessThan(AGENT_SYSTEM_PROMPT.indexOf("Mental checklist"));` with `expect(AGENT_SYSTEM_PROMPT.indexOf("EXISTING WORKFLOW")).toBeLessThan(AGENT_SYSTEM_PROMPT.indexOf("THUMBNAIL JOURNEY —"));`.
2. Replace the whole test « builds right away on an angle pick, sending only new or changed nodes on a non-empty canvas » with:

```ts
  it("acts right away on a precise request, sending only new or changed nodes", () => {
    const text = section();
    expect(text).toContain("act on it right away, sending only new or changed nodes");
    expect(text).toContain("priority over the THUMBNAIL JOURNEY");
  });
```

In `tests/agent/system-prompt-finish-turn.test.ts`, replace the test « sends the generator hand-off through finish_turn with a focus_node action » with:

```ts
  it("ends the journey on the generate action, never on a generation the agent starts", () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('next_actions [{ kind: "generate", node_id: "iv-generator" }]');
    expect(AGENT_SYSTEM_PROMPT).not.toContain("one ask_agent button per angle");
  });
```

Delete `tests/agent/system-prompt-interview.test.ts`:

```bash
git rm tests/agent/system-prompt-interview.test.ts
```

- [ ] **Step 3: Run them to verify they fail**

Run: `./node_modules/.bin/vitest run tests/agent/system-prompt-journey.test.ts tests/agent/system-prompt-existing-workflow.test.ts tests/agent/system-prompt-finish-turn.test.ts`
Expected: FAIL — « THUMBNAIL JOURNEY — » not found.

- [ ] **Step 4: Rewrite the static prompt**

In `src/lib/agent/system-prompt.ts`, replace everything from the doc comment `/**\n * Prices of the guided interview's model options (question 8), …` down to the end of the `AGENT_SYSTEM_PROMPT` template literal (the line ending `… user clicks Générer.\`;`) with:

```ts
/**
 * Prices of the model options at step 7 of the thumbnail journey (16x9, one
 * image per variant), built once from MODEL_COSTS so the static prompt (and
 * its cache) only changes when a price does.
 */
export const INTERVIEW_PRICE_TABLE = BLUEPRINT_MODELS.map(
  (model) =>
    `- ${model.id} — ${imageModelLabel(model.canvasModel)} — "${model.name} · ${formatUsdEstimate(MODEL_COSTS[model.canvasModel] ?? 0)} / image"`,
).join("\n");

const THUMBNAIL_JOURNEY_SECTION = `THUMBNAIL JOURNEY — every request to create or design a thumbnail (the start button's message "Aide-moi à construire la miniature de ma vidéo.", "fais-moi une miniature", "propose-moi des idées"…) runs this journey; only requests about an existing workflow follow EXISTING WORKFLOW. Never jump to sketches: the journey builds a packaging — a promise, then title + thumbnail pairs — before anything is drawn.
THE BRIEF — every decision goes into the thumbnail brief with update_brief: step, video, common, abStrategy, abVariable, logos, references, one variant per call as { key, set }, removeVariant. The user sees and edits it in the « Fiche » panel. It comes back every turn in <thumbnail_brief>: trust it over the chat history, and resume at its step.
- Call update_brief right after each answer, before the next question, with step set to the step you are moving to.
- update_brief refuses an invalid brief (error-text): fix what it names and retry once. It may answer warnings (a thumbnail text repeating the title, variants too close for the strategy): rephrase once, then go on.
- Questions go through ask_user alone in their step, step = the journey step (1 to 7; several questions may share a step). Offer "Passer" (allow_skip) only when skipping makes sense. The user may write a message instead of answering: the question is abandoned; resume at the step the brief says, or the one they ask for. A long script is pasted as a normal message.
- Before step 1: if <canvas_state> has iv-* nodes and there is no <thumbnail_brief>, first ask_user (step 1) "Une interview a déjà construit des nœuds sur ce canvas." with "Reprendre l'interview" (keep every iv-* node, start the journey) and "Repartir de zéro" (the user's explicit request to delete them: apply_workflow with an empty blueprint and remove_node_ids listing the existing iv-* nodes, then step 1).
- Tools named below that are not in your tool list do not exist yet (research_topic, find_logos, find_competitor_thumbnails, analyze_thumbnails, preview_thumbnail, generate_sketch with from_brief): never mention them to the user; do what the "Until then:" line says.
PACKAGING RULES — each variant is a title + thumbnail pair:
- title ≤ 60 characters; thumbnailText 0 to 4 words and ≤ 20 characters ("" = no text); the text complements the title, never repeats it, and never promises what the video doesn't deliver.
- direction ≤ 60 characters, visualIdea one sentence ≤ 120, titleRole and thumbRole ≤ 80 (what each one does for the click).
- A/B variants must really differ: abStrategy "concepts" = different concepts (never the same layout and focal subject); "single-variable" = B and C change only abVariable (text, emotion, background or hero) from A.
STEPS
1. Video and promise — ask_user with no options (a free question): "De quoi parle la vidéo, et qu'est-ce que le spectateur saura faire ou comprendre à la fin ?". Never offer old videos (list_followed_videos is not for this step). Then, without another question, update_brief: video.subject, video.promise (≤ 90 characters, result-oriented), video.audience (from <channel_profile>, else deduced) and step 2.
2. Research and logos — research_topic runs by itself (summary, key points, entities), then find_logos on the entities: when each entity has one obvious logo, keep it and say so in one line; else one multiple ask_user "Quels logos garder ?" (max_selected 3).
   Until then: no research, rely on what the user said. If the user named brands or tools, call list_logos and, when some match, one multiple ask_user "Quels logos garder ?" (max_selected 3, image stored:lg_<id>); write logos with update_brief. Then go to step 4 (skip step 3).
3. Competitors — find_competitor_thumbnails then analyze_thumbnails, a two-line summary ("Ce qui marche : … / Ce que tout le monde fait (à éviter) : …"), then one multiple ask_user "Lesquelles garder en référence ?" (max_selected 3, "Passer" allowed).
   Until then: skip this step.
4. Strategy and directions — two questions.
   a. ask_user "Quelle stratégie pour le test A/B ?": "Trouver le meilleur concept" (abStrategy "concepts", the default) or "Optimiser un détail" (abStrategy "single-variable", then ask which abVariable).
   b. Deduce 2 or 3 packages from the promise (and the research and competitors when present). ask_user multiple (max_selected 3) "Quels packages garder ?", one option per package: label = direction, description = "Titre | Texte miniature"; "Autre" lets the user rewrite one or paste their own table. Write each kept package as variant A, B, C: update_brief variant { key, set: { direction, title, thumbnailText, visualIdea, titleRole, thumbRole } }.
5. Common elements — one question. Character: the user's Personnages (list_personas, image stored:persona_<id>) plus "Aucun" → common.persona "stored:persona_<id>" or "none". Faces are Personnages only: never a single photo, an upload or a reference image as the user's face. Style and colors: take the brand colors of <channel_profile> when filled (say so in one line), else propose them in the same question; write common.style and common.colors.
6. Composition cards — one question per variant. Fill the card yourself and write it (update_brief variant set.composition): layout, one focal subject, 1 to 3 elements (exactly one hero; sizes in % of the frame, sum ≤ 110; a position on the 3×3 grid), textZone (never on the hero's cell; null without text), background, emotion (only with a character: label, intensity 1-3, default 2, mouth closed by default), palette { dominant, accent, highlight }. Then ask_user "Variante A : <the card in one line>" with "Valider", "Changer l'émotion", "Changer le fond", "Changer le texte", "Changer le sujet focal". A change re-asks only that field, with 3 options. Never a 4th element: if the user asks for one, propose which one to remove. When every card is validated, update_brief step 7.
7. Sketches, previews, then workflow — generate_sketch with from_brief for each variant, preview_thumbnail, the checklist, one validation question, then place_node for every node of each variant and finish_turn with the generate action.
   Until then:
   - For each variant, one generate_sketch with a prompt you write from its card (PROMPT ANATOMY below; face_source: "stored:persona_<id>" when common.persona is a Personnage; its logos in reference_sources). Record it with update_brief (variant set.sketch: { source: "generated:sk_<id>", status: "pending", autoFixed: false }). The app refuses sketches before step 7 and past its limit: then say so in one sentence and offer to validate without a sketch.
   - One ask_user with the sketches as images (generated:sk_<id>): "Valider avec <model> (<price>)", "Valider avec un autre modèle", "Retoucher A", "Retoucher B"… A retouch regenerates only that variant. Recommend "openai" when the thumbnail text has accents or more than 2 words, "seedream" with a character and no text, else "nano-banana". Prices (16x9, one image per variant), labels exactly as below:
${INTERVIEW_PRICE_TABLE}
   - One variant: place_node iv-prompt (the final prompt: with common.textMode "rendered", the exact text in quotes with font, color, outline and size in % of the height; with "overlay", the reserved empty zone), place_node iv-persona and iv-logo-1..3 when used, then place_node iv-generator (model, aspectRatio 16x9, count 1). End with finish_turn and next_actions [{ kind: "generate", node_id: "iv-generator" }].
   - Two or three variants: one apply_workflow following MULTI-SELECT FOR A/B TESTING below (one prompt node per variant written from its card, its sketch, the shared Personnage and logos), then finish_turn with next_actions [{ kind: "generate", node_id: "<the generator's id>" }].
Never generate an image yourself: « Générer » is the user's click, and it costs money.`;

const MULTI_SELECT_SECTION = `MULTI-SELECT FOR A/B TESTING — used at step 7 of the THUMBNAIL JOURNEY when the brief has 2 or 3 variants: ship them as ONE A/B/C test, not as separate workflows. YouTube Studio's "Tester et comparer" tests up to 3 thumbnails per video, and a single ThumbGen generator holds up to 3 variants:
- Build a SINGLE apply_workflow call with ONE generator whose data includes abTest: { variants: ["A","B"] } for 2 variants, or abTest: { variants: ["A","B","C"] } for 3 variants. The brief's variant A is variant A, B is B, C is C.
- Wire the shared inputs ONCE, on the handles every variant uses: the Personnage faceReference (image_source stored:persona_<id>) on "face-in" and each logo swipeFile (kind "logo", image_source stored:lg_<id>) on "logo-in". Never duplicate them per variant.
- Give each variant its own prompt node: variant A's on "prompt-in", B's on "prompt-in-b", C's on "prompt-in-c". Each variant's sketch (image_source generated:sk_<id>) goes on "sketch-in" / "sketch-in-b" / "sketch-in-c", and a reference image only one variant uses on "ref-in" / "ref-in-b" / "ref-in-c". Use unique node ids per variant (e.g. prompt-a, prompt-b, sketch-b).
- A variant with nothing wired on one of its own handles reuses variant A's input on that handle, so wire only what differs between variants — but always give every variant its own prompt.
- Edges to "-b" handles require "B" in abTest.variants and edges to "-c" handles require "C"; apply_workflow rejects them otherwise.
- Every variant uses the generator's model (the one validated at step 7: "nano-banana", "openai" or "seedream") and its count, which is PER VARIANT — keep count 1 unless the user asks for more.
- A test holds at most 3 variants, and the brief never has more.
After apply_workflow succeeds, tell the user the A/B test is on the canvas: one click on "Générer" produces one Aperçu per variant, titled "Variante A", "Variante B" (and "Variante C"), ready to compare and to test in YouTube Studio. Don't silently pick a "best" one for them — A/B testing means they compare the real outputs themselves.`;

export const AGENT_SYSTEM_PROMPT = `You are ThumbGen Brainstorm, an expert YouTube thumbnail strategist embedded in a node-based canvas editor.

Your job: collaborate with the creator to design and produce the best thumbnail for their video by progressively building the workflow on their canvas.

EXISTING WORKFLOW — applies when <canvas_state> contains nodes AND the user asks you to look at, analyse, complete, improve or modify that existing workflow; for those requests it takes priority over the THUMBNAIL JOURNEY. A precise request (e.g. "remplace le texte par X") is not a request to analyse: act on it right away, sending only new or changed nodes. For a request about the existing workflow:
1. Understand first:
   - call view_canvas_images on the nodes concerned (all of them, without node_ids, when the request is general);
   - read the prompts in <canvas_state>;
   - spot what the user added themselves (nodes, edges, an imported image — source "canvas-upload");
   - if a generated image is marked as chosen (a generator's or preview's selectedImage), treat it as the starting point to improve.
2. Reformulate and ask — end the turn with finish_turn:
   - summary: what you understood in 1 to 2 sentences, then 1 to 3 short questions (all within the 400 characters);
   - next_actions: ask_agent buttons offering the likely answers (e.g. label "Garder la compo", message "Garde la composition, change seulement le fond.");
   - modify NOTHING in this turn, unless the request is already precise and unambiguous (e.g. "remplace le texte par X").
3. Modify only what is targeted: call apply_workflow with only the nodes you change or add, reusing the existing node ids; every node you leave out is kept as it is. Never pass remove_node_ids unless the user explicitly asked to delete those nodes. To start again from a generated image, wire it as a reference — a swipeFile kind "reference" with image_source "stored:gi_<id>" (the selectedImage ref) on the generator's "ref-in" — instead of rebuilding the workflow.
4. Never say something is restored, fixed or back in place without having checked it (view_canvas_images or <canvas_state>).
5. If apply_workflow answers that the canvas changed meanwhile, call get_canvas_state and retry once with the same targeted change; if it fails again, tell the user in one sentence.

${THUMBNAIL_JOURNEY_SECTION}

Rules:
- Always read the current canvas state at the start of each turn (it's injected in <canvas_state>)
- If the canvas already has a workflow and the user wants to "modify" or "iterate", follow EXISTING WORKFLOW: modify only the targeted nodes with apply_workflow — the other nodes are kept automatically
- Before a tool call, write at most one short sentence (or nothing): it only appears in the collapsed step list, never as your answer
- Be concise. The user is creative, not technical. Don't dump JSON in chat.
- Cost-aware: sketches only at step 7 of the THUMBNAIL JOURNEY; a final generation only ever starts from the user's click on "Générer"
- Cite web sources when web results are attached to your context

${buildAgentRubric()}

ENDING EVERY TURN — finish_turn (mandatory):
- End EVERY turn by calling finish_turn exactly once, as your LAST tool call, alone in its own step, once every other tool result is back. The chat shows the user only its summary, its results and its next_actions; everything else you wrote or called during the turn is folded into a collapsed step list.
- summary: 1 to 2 short sentences, max 400 characters, in the reply language — what you did, what you found, or what you need from the user. Never write a long answer in free text: no headings, no walls of text, no JSON. **Bold** on one key phrase is fine.
- results: the result_id values of this turn's tool calls whose visual output the user should see, in display order, max 6. Only generate_sketch, import_youtube_thumbnail and search_youtube produce a visual output; each successful one ends with a line "result_id: <id>" — copy that id exactly. Leave results empty when nothing visual is worth showing.
- next_actions: 0 to 3 buttons, label max 40 characters, in the reply language.
  - kind "ask_agent" + message (max 300 characters): a reply the user sends you in one click, written in the user's voice (label "Garder la compo", message "Garde la composition, change seulement le fond.").
  - kind "focus_node" + node_id (an id from <canvas_state> or from your apply_workflow blueprint): selects and centers that node, for something the USER does themselves — above all clicking "Générer" on a generator, which costs money. Never offer an ask_agent action that would start a paid generation.
  - kind "generate" + node_id (a generator): the « Générer » button whose label and cost the app writes; only the user's click starts the generation.
- When you call request_user_image or ask_user, don't call finish_turn in the same step: the turn resumes once the user answers, and you finish it then.

${MULTI_SELECT_SECTION}`;
```

Before replacing, re-read the current ENDING EVERY TURN block on `main`: if its bullets differ from the ones above (other than the two lines this task changes — the `ask_agent` example now uses « Garder la compo » instead of « Angle B », and the new `generate` bullet), keep `main`'s wording for the others. The `system-prompt-finish-turn.test.ts` strings (`exactly once, as your LAST tool call`, `max 400 characters`, `"result_id: <id>"`, `kind "ask_agent" + message (max 300 characters)`, `kind "focus_node" + node_id`, `label max 40 characters`, `which costs money`, `don't call finish_turn in the same step`) must all remain.

In the same file, in `buildSystemMessages`, replace the `<project_id>` block text

```ts
      text: `<project_id>${projectId}</project_id>\n\nThe project_id above identifies the current canvas. Pass it as the \`project_id\` argument to any tool that takes one (apply_workflow, get_canvas_state, list_past_generations, trigger_generation, etc.).`,
```
with
```ts
      text: `<project_id>${projectId}</project_id>\n\nThe project_id above identifies the current canvas. Pass it as the \`project_id\` argument to any tool that takes one (apply_workflow, get_canvas_state, list_past_generations, etc.).`,
```

- [ ] **Step 5: Update `place_node`'s first description line**

In `src/lib/agent/v2/place-node-tool.ts`, replace

```ts
      "Guided interview only: places or completes ONE interview node on the user's canvas, live. Call it right after the answer that produces the node, never in the same step as ask_user.",
```
with
```ts
      "Thumbnail journey, one variant (step 7) only: places or completes ONE node on the user's canvas, live. Never in the same step as ask_user.",
```

- [ ] **Step 6: Run the prompt tests**

Run: `./node_modules/.bin/vitest run tests/agent/system-prompt-journey.test.ts tests/agent/system-prompt-existing-workflow.test.ts tests/agent/system-prompt-finish-turn.test.ts tests/agent/system-prompt.test.ts tests/agent/system-prompt-ab-test.test.ts tests/agent/place-node.test.ts tests/agent/prompt-engineering.test.ts`
Expected: PASS.

- [ ] **Step 7: Type-check, lint, commit**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/lib/agent/system-prompt.ts src/lib/agent/v2/place-node-tool.ts tests/agent/system-prompt-journey.test.ts tests/agent/system-prompt-existing-workflow.test.ts tests/agent/system-prompt-finish-turn.test.ts
git add src/lib/agent/system-prompt.ts src/lib/agent/v2/place-node-tool.ts tests/agent/system-prompt-journey.test.ts tests/agent/system-prompt-existing-workflow.test.ts tests/agent/system-prompt-finish-turn.test.ts tests/agent/system-prompt-interview.test.ts
git commit -m "feat(agent): THUMBNAIL JOURNEY replaces the guided interview, the checklist and the angles flow" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

(`git add` on the deleted test file stages its removal, already done by `git rm`.)

---
## Task 8: Chat route — brief block, `update_brief`, cost reductions and the sketch guard

**Files:**
- Create: `src/lib/brief/sketch-guard.ts`
- Modify: `src/lib/agent/v2/route-handler.ts`, `src/lib/agent/v2/history-images.ts`, `src/lib/agent/v2/tool-adapter.ts`, `src/lib/agent/system-prompt.ts` (`buildSystemMessages` only)
- Test: `tests/brief/sketch-guard.test.ts`, `tests/agent/v2-route-handler-brief.test.ts` (new); update `tests/agent/v2-history-image-trim.test.ts`, `tests/agent/v2-tool-adapter.test.ts`, `tests/agent/system-prompt.test.ts`

**Interfaces:**
- Consumes: Task 2 (`getBrief`, `reserveBriefUsage`, `releaseBriefUsage`), Task 3 (`buildThumbnailBriefBlock`, `BRIEF_UPDATED_PART`, `buildUpdateBriefTool`, `UPDATE_BRIEF_TOOL_NAME`), Task 1 (`BRIEF_TOTAL_STEPS`, `ThumbnailBrief`), `ToolHandler` / `ToolResult` from `tools/types.ts`.
- Produces:
  - `sketch-guard.ts`: `sketchLimit(brief): number` (`2 × max(1, variants) + 3`), `sketchRefusal(brief): string | null`, `guardSketchHandler(conversationId: string, handler: ToolHandler<unknown>): ToolHandler<unknown>`.
  - `tool-adapter.ts`: `type HandlerWrapper = (toolName: string, handler: ToolHandler<unknown>) => ToolHandler<unknown>`; `buildAiSdkTools(options?: { wrapHandler?: HandlerWrapper })`.
  - `history-images.ts`: `HISTORY_IMAGE_TRIMMED_TOOLS` = `["view_canvas_images", "search_youtube", "import_youtube_thumbnail", "generate_sketch", "preview_thumbnail"]`; `lastResolvedAskUserRowIndex(rows: ReadonlyArray<{ content_json: string }>): number`.
  - `system-prompt.ts`: `buildSystemMessages(canvasSnapshot, projectId?, prefs?, brief: ThumbnailBrief | null = null)` — a last block `<thumbnail_brief>` when `brief` is given.
  - Route: tools include `update_brief`; transient chunk `{ type: "data-brief-updated", id: conversationId, transient: true, data: BriefUpdatedData }`.

- [ ] **Step 1: Write the failing sketch-guard test**

Create `tests/brief/sketch-guard.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { v4 as uuid } from "uuid";
import { briefUpdateInputSchema } from "@/lib/brief/merge";
import { emptyBrief } from "@/lib/brief/schema";
import { getBrief, updateBrief } from "@/lib/brief/store";
import { guardSketchHandler, sketchLimit, sketchRefusal } from "@/lib/brief/sketch-guard";
import { pkg } from "./fixtures";

const ok = { content: [{ type: "text" as const, text: "Sketch generated. Reference: generated:sk_1" }] };

function briefAt(step: number, variants: Array<"A" | "B" | "C"> = ["A"]) {
  const conversationId = uuid();
  for (const key of variants) updateBrief(conversationId, "proj-guard", briefUpdateInputSchema.parse({ variant: { key, set: pkg() } }));
  updateBrief(conversationId, "proj-guard", briefUpdateInputSchema.parse({ step }));
  return conversationId;
}

describe("sketch guard", () => {
  it("computes the limit and the refusals", () => {
    expect(sketchLimit(emptyBrief())).toBe(5);
    expect(sketchLimit({ ...emptyBrief(), variants: [{ key: "A", ...pkg() }, { key: "B", ...pkg() }] })).toBe(7);
    expect(sketchRefusal({ ...emptyBrief(), step: 4 })).toBe("Esquisse refusée : la fiche est à l'étape 4/7, les esquisses viennent à l'étape 7.");
    expect(sketchRefusal({ ...emptyBrief(), step: 7 })).toBeNull();
    expect(sketchRefusal({ ...emptyBrief(), step: 7, usage: { research: 0, competitorSearches: 0, analyses: 0, sketches: 5 } })).toBe(
      "Esquisse refusée : limite de 5 esquisses atteinte pour cette miniature.",
    );
  });

  it("leaves a conversation without a brief alone", async () => {
    const handler = vi.fn(async () => ok);
    expect(await guardSketchHandler(uuid(), handler)({ prompt: "x" })).toBe(ok);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("refuses before step 7 without calling the image model", async () => {
    const conversationId = briefAt(4);
    const handler = vi.fn(async () => ok);
    const result = await guardSketchHandler(conversationId, handler)({ prompt: "x" });
    expect(result).toEqual({ isError: true, content: [{ type: "text", text: "Esquisse refusée : la fiche est à l'étape 4/7, les esquisses viennent à l'étape 7." }] });
    expect(handler).not.toHaveBeenCalled();
  });

  it("counts sketches at step 7 and refuses past 2 × variants + 3", async () => {
    const conversationId = briefAt(7, ["A", "B"]);
    const handler = vi.fn(async () => ok);
    const guarded = guardSketchHandler(conversationId, handler);
    for (let i = 0; i < 7; i++) expect((await guarded({ prompt: `s${i}` })).isError).toBeFalsy();
    expect((await guarded({ prompt: "one too many" })).isError).toBe(true);
    expect(handler).toHaveBeenCalledTimes(7);
    expect(getBrief(conversationId)!.brief.usage.sketches).toBe(7);
  });

  it("gives the reservation back when the sketch fails", async () => {
    const conversationId = briefAt(7);
    const failed = { isError: true, content: [{ type: "text" as const, text: "OpenRouter API error 500" }] };
    expect(await guardSketchHandler(conversationId, vi.fn(async () => failed))({ prompt: "x" })).toBe(failed);
    const boom = guardSketchHandler(conversationId, vi.fn(async () => {
      throw new Error("network");
    }));
    await expect(boom({ prompt: "x" })).rejects.toThrow("network");
    expect(getBrief(conversationId)!.brief.usage.sketches).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/brief/sketch-guard.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/brief/sketch-guard"`.

- [ ] **Step 3: Write the guard**

Create `src/lib/brief/sketch-guard.ts`:

```ts
import type { ToolHandler, ToolResult } from "@/lib/agent/tools/types";
import { BRIEF_TOTAL_STEPS, type ThumbnailBrief } from "./schema";
import { releaseBriefUsage, reserveBriefUsage } from "./store";

/**
 * Server-side cost guard of generate_sketch during a thumbnail journey
 * (chantier F3): the limits never depend on the model's goodwill. A
 * conversation without a brief is not guarded (EXISTING WORKFLOW, MCP).
 */

export function sketchLimit(brief: ThumbnailBrief): number {
  return 2 * Math.max(1, brief.variants.length) + 3;
}

export function sketchRefusal(brief: ThumbnailBrief): string | null {
  if (brief.step < BRIEF_TOTAL_STEPS) {
    return `Esquisse refusée : la fiche est à l'étape ${brief.step}/${BRIEF_TOTAL_STEPS}, les esquisses viennent à l'étape ${BRIEF_TOTAL_STEPS}.`;
  }
  const limit = sketchLimit(brief);
  if (brief.usage.sketches >= limit) return `Esquisse refusée : limite de ${limit} esquisses atteinte pour cette miniature.`;
  return null;
}

export function guardSketchHandler(conversationId: string, handler: ToolHandler<unknown>): ToolHandler<unknown> {
  return async (input) => {
    const reservation = reserveBriefUsage(conversationId, "sketches", sketchRefusal);
    if (reservation.status === "no-brief") return handler(input);
    if (reservation.status === "refused") return { isError: true, content: [{ type: "text", text: reservation.reason }] };
    let result: ToolResult;
    try {
      result = await handler(input);
    } catch (error) {
      releaseBriefUsage(conversationId, "sketches");
      throw error;
    }
    if (result.isError) releaseBriefUsage(conversationId, "sketches");
    return result;
  };
}
```

Run: `./node_modules/.bin/vitest run tests/brief/sketch-guard.test.ts`
Expected: PASS.

- [ ] **Step 4: Update the history and adapter tests (failing)**

In `tests/agent/v2-history-image-trim.test.ts`:
1. Import `lastResolvedAskUserRowIndex` next to `HISTORY_IMAGE_PLACEHOLDER, trimToolResultImages`.
2. Replace the test « leaves other tools' images alone » with:

```ts
  it("leaves other tools' images alone", () => {
    const messages = JSON.parse(toolRow("b", "list_past_generations", "générations").content_json);
    expect(trimToolResultImages(messages)).toEqual(messages);
  });

  it("also trims imported thumbnails, sketches and previews", () => {
    for (const tool of ["import_youtube_thumbnail", "generate_sketch", "preview_thumbnail"]) {
      const trimmed = trimToolResultImages(JSON.parse(toolRow("c", tool, "header").content_json)) as Array<{
        content: Array<{ output: { value: unknown[] } }>;
      }>;
      expect(trimmed[1].content[0].output.value).toEqual([
        { type: "text", text: "header" },
        { type: "text", text: HISTORY_IMAGE_PLACEHOLDER },
      ]);
    }
  });

  it("finds the last row holding an answered ask_user", () => {
    const answer = (id: string) => ({
      id: "",
      conversation_id: "c1",
      role: "assistant" as const,
      content_json: JSON.stringify([
        { role: "tool", content: [{ type: "tool-result", toolCallId: id, toolName: "ask_user", output: { type: "json", value: { selected: ["a"] } } }] },
      ]),
      interrupted: 0,
    });
    expect(lastResolvedAskUserRowIndex([userRow("x"), toolRow("v", "view_canvas_images", "h")])).toBe(-1);
    expect(lastResolvedAskUserRowIndex([userRow("x"), answer("q1"), toolRow("v", "view_canvas_images", "h"), answer("q2"), userRow("y")])).toBe(3);
    expect(lastResolvedAskUserRowIndex([{ content_json: "not json" }])).toBe(-1);
  });
```

3. In « trims view_canvas_images and search_youtube images of prior turns… », replace `toolRow("g1", "generate_sketch", "croquis"),` with `toolRow("g1", "list_past_generations", "générations"),` and `expect(resultValue("generate_sketch").map((p) => p.type)).toEqual(["text", "file"]);` with `expect(resultValue("list_past_generations").map((p) => p.type)).toEqual(["text", "file"]);`.

In `tests/agent/v2-tool-adapter.test.ts`, add inside `describe("buildAiSdkTools", …)`:

```ts
  it("lets the caller wrap a tool's handler", async () => {
    const tools = buildAiSdkTools({
      wrapHandler: (name, handler) => (name === "list_logos" ? async () => ({ content: [{ type: "text", text: "wrapped" }] }) : handler),
    });
    const result = (await tools.list_logos.execute!({}, { toolCallId: "t2" } as never)) as { content: Array<{ text: string }> };
    expect(result.content[0].text).toBe("wrapped");
    const untouched = (await tools.list_personas.execute!({}, { toolCallId: "t3" } as never)) as { content: unknown[] };
    expect(Array.isArray(untouched.content)).toBe(true);
  });
```

In `tests/agent/system-prompt.test.ts`, add `import { emptyBrief } from "@/lib/brief/schema";` and, inside the first `describe`, add:

```ts
  it("appends the thumbnail brief after canvas_state when the conversation has one", () => {
    const blocks = buildSystemMessages({ nodes: [], edges: [] }, "proj-abc", DEFAULT_AGENT_PROMPT_PREFS, { ...emptyBrief(), step: 3 });
    expect(blocks.at(-2)!.text).toContain("<canvas_state>");
    expect(blocks.at(-1)!.text.startsWith("<thumbnail_brief>")).toBe(true);
    expect(blocks.at(-1)!.text).toContain('"step":3');
    expect(blocks.at(-1)!.cache_control).toBeUndefined();
    expect(buildSystemMessages({ nodes: [], edges: [] }, "proj-abc").some((block) => block.text.includes("<thumbnail_brief>"))).toBe(false);
  });
```

(If `DEFAULT_AGENT_PROMPT_PREFS` is not imported there yet, add it to the existing `@/lib/agent/system-prompt` import.)

- [ ] **Step 5: Write the failing route test**

Create `tests/agent/v2-route-handler-brief.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ThumbnailBrief } from "@/lib/brief/schema";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

type Row = { id: string; conversation_id: string; role: "user" | "assistant"; content_json: string; interrupted: number };

const state = vi.hoisted(() => ({
  rows: [] as Row[],
  brief: null as ThumbnailBrief | null,
  reserve: null as null | ((...args: unknown[]) => unknown),
  briefToolBuilds: [] as Array<{ conversationId: string; projectId: string; writeBriefUpdated: (data: unknown) => void }>,
}));

vi.mock("@/lib/agent/conversation/store", () => ({
  appendMessage: (input: Omit<Row, "id">) => {
    const row = { ...input, id: `r${state.rows.length}` } as Row;
    state.rows.push(row);
    return row;
  },
  listMessages: () => state.rows.map((row) => ({ ...row })),
  getConversation: (id: string) => ({ id, project_id: "proj_brief", title: "t", created_at: "", updated_at: "" }),
}));
vi.mock("@/lib/agent/v2/persist-turn", () => ({ persistAssistantTurn: vi.fn() }));
vi.mock("@/lib/agent/conversation/auto-title", () => ({ generateAndPersistTitle: vi.fn(async () => {}) }));
vi.mock("@/lib/brief/store", () => ({
  getBrief: (conversationId: string) =>
    state.brief ? { conversationId, projectId: "proj_brief", brief: state.brief, updatedAt: "2026-09-17T10:00:00.000Z" } : null,
  reserveBriefUsage: (...args: unknown[]) => (state.reserve ? state.reserve(...args) : { status: "no-brief" }),
  releaseBriefUsage: vi.fn(),
  updateBrief: vi.fn(),
}));
vi.mock("@/lib/agent/v2/update-brief-tool", () => ({
  UPDATE_BRIEF_TOOL_NAME: "update_brief",
  buildUpdateBriefTool: (options: { conversationId: string; projectId: string; writeBriefUpdated: (data: unknown) => void }) => {
    state.briefToolBuilds.push(options);
    return { description: "update_brief (test)", inputSchema: {}, execute: async () => ({ content: [] }) };
  },
}));

const streamTextMock = vi.fn();
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, streamText: (opts: unknown) => streamTextMock(opts) };
});

import { setSetting } from "@/lib/settings";
import { emptyBrief } from "@/lib/brief/schema";
import { HISTORY_IMAGE_PLACEHOLDER } from "@/lib/agent/v2/history-images";
import { postV2 } from "@/lib/agent/v2/route-handler";
import { getRun, resetRunRegistry } from "@/lib/agent/v2/run-registry";
import { chatRequest, fakeStreamResult, waitForRunEnd } from "./helpers/chat-route";

const FILE = { type: "file", mediaType: "image/png", data: { type: "data", data: "U0tFVENI" } };
const T = "2026-09-17T10:00:00.000Z";
const question = { question: "Quelle stratégie ?", step: 4, options: [{ id: "a", label: "Concepts" }] };

const userRow = (text: string): Row => ({
  id: "",
  conversation_id: "c",
  role: "user",
  content_json: JSON.stringify([{ role: "user", content: [{ type: "text", text }] }]),
  interrupted: 0,
});
const sketchRow = (): Row => ({
  id: "",
  conversation_id: "c",
  role: "assistant",
  content_json: JSON.stringify([
    { role: "assistant", content: [{ type: "tool-call", toolCallId: "g1", toolName: "generate_sketch", input: {} }] },
    { role: "tool", content: [{ type: "tool-result", toolCallId: "g1", toolName: "generate_sketch", output: { type: "content", value: [{ type: "text", text: "Sketch" }, FILE] } }] },
  ]),
  interrupted: 0,
});
const askCallRow = (id: string): Row => ({
  id: "",
  conversation_id: "c",
  role: "assistant",
  content_json: JSON.stringify([{ role: "assistant", content: [{ type: "tool-call", toolCallId: id, toolName: "ask_user", input: question }] }]),
  interrupted: 0,
});
const askResultRow = (id: string): Row => ({
  id: "",
  conversation_id: "c",
  role: "assistant",
  content_json: JSON.stringify([
    { role: "tool", content: [{ type: "tool-result", toolCallId: id, toolName: "ask_user", output: { type: "json", value: { selected: ["a"] } } }] },
  ]),
  interrupted: 0,
});

const lastCall = () =>
  streamTextMock.mock.calls.at(-1)![0] as {
    system: string;
    tools: Record<string, { execute?: (input: unknown, options: unknown) => Promise<unknown> }>;
    providerOptions: { openrouter: Record<string, unknown> };
    messages: Array<{ role: string; content: Array<{ type: string; toolName?: string; output?: { value: Array<{ type: string }> } }> }>;
  };

const newTurn = (conversationId: string) => ({ conversation_id: conversationId, messages: [{ role: "user", parts: [{ type: "text", text: "Continue" }] }] });

describe("chat route — thumbnail brief", () => {
  let fake: ReturnType<typeof fakeStreamResult>;
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetRunRegistry();
    state.rows = [];
    state.brief = null;
    state.reserve = null;
    state.briefToolBuilds.length = 0;
    setSetting("openrouterApiKey", "test-key");
    setSetting("agentWebSearch", "");
    fake = fakeStreamResult();
    streamTextMock.mockReset();
    streamTextMock.mockImplementation(() => fake);
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("without a brief: web search stays on and no brief block is sent", async () => {
    await postV2(chatRequest(newTurn("c-none")));
    expect(lastCall().providerOptions.openrouter.web_search_options).toEqual({});
    expect(lastCall().system).not.toContain("<thumbnail_brief>");
    await fake.end();
    await waitForRunEnd("c-none");
  });

  it("with a brief: no web search, and the brief block after canvas_state", async () => {
    state.brief = { ...emptyBrief(), step: 4 };
    await postV2(chatRequest({ ...newTurn("c-brief"), canvas_snapshot: { nodes: [], edges: [] } }));
    const { system, providerOptions } = lastCall();
    expect(providerOptions.openrouter).not.toHaveProperty("web_search_options");
    expect(system).toContain("<thumbnail_brief>");
    expect(system.indexOf("<thumbnail_brief>")).toBeGreaterThan(system.indexOf("<canvas_state>"));
    await fake.end();
    await waitForRunEnd("c-brief");
  });

  it("gives the model update_brief for this conversation and streams brief updates as transient chunks", async () => {
    await postV2(chatRequest(newTurn("c-chunk")));
    expect(Object.keys(lastCall().tools)).toEqual(expect.arrayContaining(["update_brief", "ask_user", "place_node", "generate_sketch"]));
    expect(state.briefToolBuilds).toHaveLength(1);
    expect(state.briefToolBuilds[0]).toMatchObject({ conversationId: "c-chunk", projectId: "proj_brief" });
    fake.push({ type: "tool-input-available", toolCallId: "u1", toolName: "update_brief", input: {} });
    await new Promise((resolve) => setTimeout(resolve, 0));
    state.briefToolBuilds[0].writeBriefUpdated({ conversationId: "c-chunk", step: 4, updatedAt: T });
    await fake.end();
    await waitForRunEnd("c-chunk");
    expect(getRun("c-chunk")!.chunks).toContainEqual({
      type: "data-brief-updated",
      id: "c-chunk",
      transient: true,
      data: { conversationId: "c-chunk", step: 4, updatedAt: T },
    });
  });

  it("guards generate_sketch through the brief: a refused sketch never reaches the image API", async () => {
    state.reserve = () => ({ status: "refused", reason: "Esquisse refusée : test" });
    await postV2(chatRequest(newTurn("c-guard")));
    const output = (await lastCall().tools.generate_sketch.execute!({ prompt: "x" }, { toolCallId: "s1", messages: [] })) as {
      isError: boolean;
      content: Array<{ text: string }>;
    };
    expect(output.isError).toBe(true);
    expect(output.content[0].text).toBe("Esquisse refusée : test");
    expect(fetchMock).not.toHaveBeenCalled();
    await fake.end();
    await waitForRunEnd("c-guard");
  });

  it("with a brief, trims images older than the last answered question, even within the turn", async () => {
    const continuation = (conversationId: string) => ({
      conversation_id: conversationId,
      messages: [
        {
          role: "assistant",
          parts: [{ type: "tool-ask_user", toolCallId: "q2", state: "output-available", input: question, output: { selected: ["a"] } }],
        },
      ],
    });
    const sketchParts = () => {
      for (const message of lastCall().messages) {
        for (const part of message.content) if (part.type === "tool-result" && part.toolName === "generate_sketch") return part.output!.value;
      }
      throw new Error("no sketch result");
    };

    state.rows = [userRow("Aide-moi"), sketchRow(), askCallRow("q1"), askResultRow("q1"), askCallRow("q2")];
    await postV2(chatRequest(continuation("c-trim-none")));
    expect(sketchParts().map((part) => part.type)).toEqual(["text", "file"]);
    await fake.end();
    await waitForRunEnd("c-trim-none");

    fake = fakeStreamResult();
    streamTextMock.mockImplementation(() => fake);
    state.brief = { ...emptyBrief(), step: 7 };
    state.rows = [userRow("Aide-moi"), sketchRow(), askCallRow("q1"), askResultRow("q1"), askCallRow("q2")];
    await postV2(chatRequest(continuation("c-trim-brief")));
    expect(sketchParts()).toEqual([
      { type: "text", text: "Sketch" },
      { type: "text", text: HISTORY_IMAGE_PLACEHOLDER },
    ]);
    await fake.end();
    await waitForRunEnd("c-trim-brief");
  });
});
```

- [ ] **Step 6: Run the updated and new tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/agent/v2-history-image-trim.test.ts tests/agent/v2-tool-adapter.test.ts tests/agent/system-prompt.test.ts tests/agent/v2-route-handler-brief.test.ts`
Expected: FAIL — `lastResolvedAskUserRowIndex` not exported, no `wrapHandler`, no brief block, no `update_brief` tool.

- [ ] **Step 7: Extend `history-images.ts`**

In `src/lib/agent/v2/history-images.ts`:
1. Replace the doc sentence `For the tools whose images only serve the turn that looked at them (view_canvas_images, search_youtube),` with `For the tools whose images only serve the turn that looked at them (view_canvas_images, search_youtube, import_youtube_thumbnail, generate_sketch, preview_thumbnail),`.
2. Replace the constant:

```ts
export const HISTORY_IMAGE_TRIMMED_TOOLS: readonly string[] = [
  "view_canvas_images",
  "search_youtube",
  "import_youtube_thumbnail",
  "generate_sketch",
  "preview_thumbnail",
];
```

3. Append at the end of the file:

```ts
/**
 * Index of the last stored row holding an ask_user tool-result — an answered
 * question of the thumbnail journey — or -1. During a journey every answer is
 * a continuation of the same turn: images before it are no longer re-sent.
 */
export function lastResolvedAskUserRowIndex(rows: ReadonlyArray<{ content_json: string }>): number {
  for (let index = rows.length - 1; index >= 0; index--) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rows[index].content_json);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    const answered = parsed.some(
      (message) =>
        isObject(message) &&
        message.role === "tool" &&
        Array.isArray(message.content) &&
        message.content.some((part) => isObject(part) && part.type === "tool-result" && part.toolName === "ask_user"),
    );
    if (answered) return index;
  }
  return -1;
}
```

- [ ] **Step 8: Add `wrapHandler` to the adapter**

In `src/lib/agent/v2/tool-adapter.ts`:
1. Change the types import to `import type { ToolContent, ToolHandler, ToolResult } from "@/lib/agent/tools/types";`.
2. Before `function toAiSdkTool`, add:

```ts
/** Lets the chat route wrap a registered tool's handler for one request (e.g. the brief's sketch guard). */
export type HandlerWrapper = (toolName: string, handler: ToolHandler<unknown>) => ToolHandler<unknown>;
```

3. Change `function toAiSdkTool(name: string): Tool {` to `function toAiSdkTool(name: string, wrapHandler?: HandlerWrapper): Tool {`, add right after the `if (!def) throw …` line:

```ts
  const handler = wrapHandler ? wrapHandler(name, def.handler) : def.handler;
```

and in `execute`, replace `const result: ToolResult = await def.handler(input);` with `const result: ToolResult = await handler(input);`.
4. Replace `buildAiSdkTools` with:

```ts
/** Builds the full { [toolName]: Tool } map streamText expects, from every tool currently in the registry. */
export function buildAiSdkTools({ wrapHandler }: { wrapHandler?: HandlerWrapper } = {}): Record<string, Tool> {
  const out: Record<string, Tool> = {};
  for (const def of listTools()) {
    out[def.name] = toAiSdkTool(def.name, wrapHandler);
  }
  return out;
}
```

- [ ] **Step 9: Add the brief to `buildSystemMessages`**

In `src/lib/agent/system-prompt.ts`:
1. Add imports: `import { buildThumbnailBriefBlock } from "@/lib/brief/context";` and `import type { ThumbnailBrief } from "@/lib/brief/schema";`.
2. Update the doc comment of `buildSystemMessages` to end with `…project id, canvas snapshot, and the thumbnail brief when the conversation has one.`
3. Add the parameter `brief: ThumbnailBrief | null = null,` after `prefs: AgentPromptPrefs = DEFAULT_AGENT_PROMPT_PREFS,`.
4. After the `<canvas_state>` push, before `return blocks;`, add:

```ts
  if (brief) blocks.push({ type: "text", text: buildThumbnailBriefBlock(brief) });
```

- [ ] **Step 10: Wire the route**

In `src/lib/agent/v2/route-handler.ts`:

1. Imports — change `import { trimToolResultImages } from "./history-images";` to `import { lastResolvedAskUserRowIndex, trimToolResultImages } from "./history-images";` and add:

```ts
import { UPDATE_BRIEF_TOOL_NAME, buildUpdateBriefTool } from "./update-brief-tool";
import { getBrief } from "@/lib/brief/store";
import { guardSketchHandler } from "@/lib/brief/sketch-guard";
import { BRIEF_UPDATED_PART } from "@/lib/brief/brief-updated";
import type { ThumbnailBrief } from "@/lib/brief/schema";
```

2. Next to `let priorMessages: unknown[];`, add:

```ts
  // The conversation's thumbnail brief, read once per turn (chantier F3): sent
  // to the model, and it switches the cost reductions below on.
  let brief: ThumbnailBrief | null = null;
```

3. At the very start of the `try {` block that follows (right before `userParts = [];`), add:

```ts
    brief = getBrief(conversationId)?.brief ?? null;
```

4. Replace

```ts
    const currentTurnStart =
      isNewUserTurn && retriedUserRowIndex === -1
        ? priorRows.length
        : Math.max(0, priorRows.map((row) => row.role).lastIndexOf("user"));
```
with
```ts
    const turnStart =
      isNewUserTurn && retriedUserRowIndex === -1
        ? priorRows.length
        : Math.max(0, priorRows.map((row) => row.role).lastIndexOf("user"));
    // During a thumbnail journey every answer is a continuation: images older
    // than the last answered question are not re-sent either.
    const currentTurnStart = brief ? Math.max(turnStart, lastResolvedAskUserRowIndex(priorRows)) : turnStart;
```

5. Replace `const systemBlocks = buildSystemMessages(body.canvas_snapshot, projectId, loadAgentPromptPrefs());` with `const systemBlocks = buildSystemMessages(body.canvas_snapshot, projectId, loadAgentPromptPrefs(), brief);`.

6. Rename the stream writer: replace

```ts
    let patchWriter: UIMessageStreamWriter | null = null;
    const placeNode = buildPlaceNodeTool({
      projectId: run.projectId,
      writePatch: (patch) => {
        if (!patchWriter) throw new Error("canvas patch stream not ready");
        patchWriter.write({ type: CANVAS_PATCH_PART, id: patch.node.id, transient: true, data: patch });
      },
    });
```
with
```ts
    let uiWriter: UIMessageStreamWriter | null = null;
    const placeNode = buildPlaceNodeTool({
      projectId: run.projectId,
      writePatch: (patch) => {
        if (!uiWriter) throw new Error("canvas patch stream not ready");
        uiWriter.write({ type: CANVAS_PATCH_PART, id: patch.node.id, transient: true, data: patch });
      },
    });
    // update_brief (thumbnail journey) tells the open chat the brief changed, on the same stream.
    const updateBriefTool = buildUpdateBriefTool({
      conversationId,
      projectId: run.projectId,
      writeBriefUpdated: (data) => {
        if (!uiWriter) throw new Error("brief stream not ready");
        uiWriter.write({ type: BRIEF_UPDATED_PART, id: data.conversationId, transient: true, data });
      },
    });
```
and in the `createUIMessageStream` `execute`, replace `patchWriter = writer;` with `uiWriter = writer;`. Update the comment above (`place_node (guided interview) broadcasts…`) to say `place_node and update_brief broadcast to the open chat as transient chunks of this turn's stream…`.

7. Replace the `tools:` line with:

```ts
      tools: {
        // generate_sketch is guarded by the thumbnail brief when there is one (step 7, sketch limit).
        ...buildAiSdkTools({
          wrapHandler: (name, handler) => (name === "generate_sketch" ? guardSketchHandler(conversationId, handler) : handler),
        }),
        ...V2_CLIENT_TOOLS,
        [PLACE_NODE_TOOL_NAME]: placeNode,
        [UPDATE_BRIEF_TOOL_NAME]: updateBriefTool,
      },
```

8. Replace `...webSearchProviderOptions(),` with:

```ts
          // With a brief the journey does its own research (research_topic): no web search on every call.
          ...(brief ? {} : webSearchProviderOptions()),
```

- [ ] **Step 11: Run the route and history tests, then every route test**

Run: `./node_modules/.bin/vitest run tests/agent/v2-route-handler-brief.test.ts tests/agent/v2-history-image-trim.test.ts tests/agent/v2-tool-adapter.test.ts tests/agent/system-prompt.test.ts tests/brief/sketch-guard.test.ts`
Expected: PASS.

Run: `./node_modules/.bin/vitest run tests/agent/v2-route-handler.test.ts tests/agent/v2-route-handler-retry.test.ts tests/agent/v2-route-handler-settings.test.ts tests/agent/v2-route-handler-runs.test.ts tests/agent/v2-route-handler-interview.test.ts tests/agent/finish-turn-wiring.test.ts tests/agent/system-prompt-finish-turn.test.ts tests/agent/system-prompt-journey.test.ts`
Expected: PASS (these conversations have no brief: nothing changes for them).

- [ ] **Step 12: Full suite, type-check, lint, commit**

```bash
./node_modules/.bin/vitest run
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/lib/brief/sketch-guard.ts src/lib/agent/v2/route-handler.ts src/lib/agent/v2/history-images.ts src/lib/agent/v2/tool-adapter.ts src/lib/agent/system-prompt.ts tests/brief/sketch-guard.test.ts tests/agent/v2-route-handler-brief.test.ts tests/agent/v2-history-image-trim.test.ts tests/agent/v2-tool-adapter.test.ts tests/agent/system-prompt.test.ts
git add src/lib/brief/sketch-guard.ts src/lib/agent/v2/route-handler.ts src/lib/agent/v2/history-images.ts src/lib/agent/v2/tool-adapter.ts src/lib/agent/system-prompt.ts tests/brief/sketch-guard.test.ts tests/agent/v2-route-handler-brief.test.ts tests/agent/v2-history-image-trim.test.ts tests/agent/v2-tool-adapter.test.ts tests/agent/system-prompt.test.ts
git commit -m "feat(agent): the chat route reads the thumbnail brief — brief block, update_brief, no web search, trimmed images, sketch guard" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Expected: the full suite passes.

---
## Task 9: Brief store on the client, chunk refresh and the live step line

**Files:**
- Create: `src/lib/brief/steps.ts`, `src/store/brief-store.ts`, `src/components/panels/chat/brief-updated-part.ts`
- Modify: `src/components/panels/chat/TurnProgress.tsx`, `src/components/panels/chat/Message.tsx`, `src/components/panels/chat/MessageList.tsx`, `src/components/panels/ChatPanel.tsx`
- Test: `tests/brief/brief-store.test.ts`, `tests/chat/chat-panel-brief.test.ts` (new); update `tests/chat/turn-progress-render.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`BRIEF_TOTAL_STEPS`, `ThumbnailBrief`, `BriefIssue`, `BriefPatchInput`), Task 3 (`BRIEF_UPDATED_PART`, `isBriefUpdatedData`, `BriefUpdatedData`), Task 4 (routes).
- Produces:
  - `steps.ts`: `BRIEF_STEP_NAMES: Record<number, string>`, `briefStepBadge(step): string` (« Étape 3/7 »), `briefStepLine(step): string` (« Étape 3/7 — Concurrents »).
  - `brief-store.ts`: `type BriefPatchOutcome = { ok: true; warnings: string[] } | { ok: false; error: string; issues: BriefIssue[] }`; `useBriefStore` with state `{ conversationId: string | null; brief: ThumbnailBrief | null; updatedAt: string | null }` and actions `load(conversationId: string | null): Promise<void>`, `onBriefUpdated(data: BriefUpdatedData): void`, `patch(body: BriefPatchInput): Promise<BriefPatchOutcome>`; `resetBriefStore(): void`.
  - `brief-updated-part.ts`: `applyBriefUpdatedPart(part: { type: string; data?: unknown }): boolean`.
  - `ChatTurnControls.journeyStep?: number | null`; `TurnProgress` prop `journeyStep?: number | null`.

- [ ] **Step 1: Write the failing store test**

Create `tests/brief/brief-store.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { emptyBrief } from "@/lib/brief/schema";
import { briefStepBadge, briefStepLine } from "@/lib/brief/steps";
import { resetBriefStore, useBriefStore } from "@/store/brief-store";
import { applyBriefUpdatedPart } from "@/components/panels/chat/brief-updated-part";

const T = "2026-09-17T10:00:00.000Z";
const fetchMock = vi.fn();
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

beforeEach(() => {
  resetBriefStore();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("journey steps", () => {
  it("names the badge and the step line", () => {
    expect(briefStepBadge(3)).toBe("Étape 3/7");
    expect(briefStepLine(3)).toBe("Étape 3/7 — Concurrents");
    expect(briefStepLine(1)).toBe("Étape 1/7 — Vidéo et promesse");
    expect(briefStepLine(7)).toBe("Étape 7/7 — Esquisses et workflow");
  });
});

describe("brief store", () => {
  it("loads the brief of a conversation, and clears on a change of conversation", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { brief: { ...emptyBrief(), step: 4 }, updatedAt: T }));
    await useBriefStore.getState().load("c1");
    expect(fetchMock).toHaveBeenCalledWith("/api/briefs/c1");
    expect(useBriefStore.getState()).toMatchObject({ conversationId: "c1", brief: { step: 4 }, updatedAt: T });

    fetchMock.mockResolvedValueOnce(json(200, { brief: null, updatedAt: null }));
    const loading = useBriefStore.getState().load("c2");
    expect(useBriefStore.getState()).toMatchObject({ conversationId: "c2", brief: null });
    await loading;
    await useBriefStore.getState().load(null);
    expect(useBriefStore.getState()).toMatchObject({ conversationId: null, brief: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores an answer that arrives after a newer load", async () => {
    let answerFirst: (value: unknown) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (answerFirst = resolve)));
    fetchMock.mockResolvedValueOnce(json(200, { brief: { ...emptyBrief(), step: 5 }, updatedAt: T }));
    const first = useBriefStore.getState().load("c1");
    await useBriefStore.getState().load("c1");
    answerFirst(json(200, { brief: { ...emptyBrief(), step: 2 }, updatedAt: T }));
    await first;
    expect(useBriefStore.getState().brief?.step).toBe(5);
  });

  it("follows the brief-updated chunk of the open conversation only", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { brief: { ...emptyBrief(), step: 1 }, updatedAt: T }));
    await useBriefStore.getState().load("c1");

    fetchMock.mockResolvedValueOnce(json(200, { brief: { ...emptyBrief(), step: 4, video: { promise: "P" } }, updatedAt: T }));
    expect(applyBriefUpdatedPart({ type: "data-brief-updated", data: { conversationId: "c1", step: 4, updatedAt: T } })).toBe(true);
    expect(useBriefStore.getState().brief?.step).toBe(4);
    await vi.waitFor(() => expect(useBriefStore.getState().brief?.video.promise).toBe("P"));

    expect(applyBriefUpdatedPart({ type: "data-brief-updated", data: { conversationId: "other", step: 6, updatedAt: T } })).toBe(true);
    expect(useBriefStore.getState().brief?.step).toBe(4);
    expect(applyBriefUpdatedPart({ type: "data-canvas-patch", data: {} })).toBe(false);
    expect(applyBriefUpdatedPart({ type: "data-brief-updated", data: { step: 2 } })).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("saves an edit with PATCH and returns the issues of a refusal", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { brief: { ...emptyBrief(), step: 6 }, updatedAt: T }));
    await useBriefStore.getState().load("c1");

    fetchMock.mockResolvedValueOnce(json(200, { brief: { ...emptyBrief(), step: 6, video: { promise: "Nouvelle" } }, updatedAt: T, warnings: [] }));
    expect(await useBriefStore.getState().patch({ video: { promise: "Nouvelle" } })).toEqual({ ok: true, warnings: [] });
    expect(fetchMock).toHaveBeenLastCalledWith("/api/briefs/c1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video: { promise: "Nouvelle" } }),
    });
    expect(useBriefStore.getState().brief?.video.promise).toBe("Nouvelle");

    const issues = [{ path: "variants.A.thumbnailText", message: "Texte de miniature : 4 mots maximum" }];
    fetchMock.mockResolvedValueOnce(json(400, { error: "Fiche invalide", issues }));
    expect(await useBriefStore.getState().patch({ variant: { key: "A", set: { thumbnailText: "a b c d e" } } })).toEqual({
      ok: false,
      error: "Fiche invalide",
      issues,
    });
    expect(useBriefStore.getState().brief?.video.promise).toBe("Nouvelle");

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await useBriefStore.getState().patch({ video: { promise: "x" } })).toEqual({ ok: false, error: "Enregistrement impossible, réessaie", issues: [] });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/brief/brief-store.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/brief/steps"`.

- [ ] **Step 3: Write `steps.ts`, the store and the chunk handler**

Create `src/lib/brief/steps.ts`:

```ts
import { BRIEF_TOTAL_STEPS } from "./schema";

/** The thumbnail journey's steps as the chat names them (« Étape 3/7 — Concurrents »). Pure. */
export const BRIEF_STEP_NAMES: Record<number, string> = {
  1: "Vidéo et promesse",
  2: "Recherche et logos",
  3: "Concurrents",
  4: "Stratégie et directions",
  5: "Éléments communs",
  6: "Cartes de composition",
  7: "Esquisses et workflow",
};

export function briefStepBadge(step: number): string {
  return `Étape ${step}/${BRIEF_TOTAL_STEPS}`;
}

export function briefStepLine(step: number): string {
  const name = BRIEF_STEP_NAMES[step];
  return name ? `${briefStepBadge(step)} — ${name}` : briefStepBadge(step);
}
```

Create `src/store/brief-store.ts`:

```ts
import { create } from "zustand";
import type { BriefPatchInput } from "@/lib/brief/merge";
import type { BriefIssue, ThumbnailBrief } from "@/lib/brief/schema";
import type { BriefUpdatedData } from "@/lib/brief/brief-updated";

/**
 * The open conversation's thumbnail brief on the client (« Fiche » badge and
 * sheet, live step line). Reads and edits go through /api/briefs/… (free,
 * local); the agent's writes arrive as `data-brief-updated` chunks.
 */

export type BriefPatchOutcome = { ok: true; warnings: string[] } | { ok: false; error: string; issues: BriefIssue[] };

type BriefState = {
  conversationId: string | null;
  brief: ThumbnailBrief | null;
  updatedAt: string | null;
  load: (conversationId: string | null) => Promise<void>;
  onBriefUpdated: (data: BriefUpdatedData) => void;
  patch: (body: BriefPatchInput) => Promise<BriefPatchOutcome>;
};

// Only the latest request may write: an older answer never overwrites a newer one.
let requestSeq = 0;

const briefUrl = (conversationId: string) => `/api/briefs/${encodeURIComponent(conversationId)}`;

export const useBriefStore = create<BriefState>((set, get) => ({
  conversationId: null,
  brief: null,
  updatedAt: null,

  load: async (conversationId) => {
    const seq = ++requestSeq;
    if (get().conversationId !== conversationId) set({ conversationId, brief: null, updatedAt: null });
    if (!conversationId) return;
    try {
      const res = await fetch(briefUrl(conversationId));
      if (seq !== requestSeq || get().conversationId !== conversationId) return;
      if (!res.ok) {
        set({ brief: null, updatedAt: null });
        return;
      }
      const body = (await res.json()) as { brief: ThumbnailBrief | null; updatedAt: string | null };
      if (seq !== requestSeq || get().conversationId !== conversationId) return;
      set({ brief: body.brief, updatedAt: body.updatedAt });
    } catch {
      // Keep what is shown; the next update or opening loads again.
    }
  },

  onBriefUpdated: (data) => {
    const state = get();
    if (state.conversationId !== data.conversationId) return;
    if (state.brief) set({ brief: { ...state.brief, step: data.step } });
    void state.load(data.conversationId);
  },

  patch: async (body) => {
    const conversationId = get().conversationId;
    if (!conversationId) return { ok: false, error: "Aucune conversation ouverte", issues: [] };
    let res: Response;
    try {
      res = await fetch(briefUrl(conversationId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      return { ok: false, error: "Enregistrement impossible, réessaie", issues: [] };
    }
    const payload = (await res.json().catch(() => ({}))) as {
      brief?: ThumbnailBrief;
      updatedAt?: string;
      warnings?: string[];
      error?: string;
      issues?: BriefIssue[];
    };
    if (!res.ok || !payload.brief) {
      return { ok: false, error: payload.error ?? "Enregistrement impossible, réessaie", issues: payload.issues ?? [] };
    }
    requestSeq++;
    if (get().conversationId === conversationId) set({ brief: payload.brief, updatedAt: payload.updatedAt ?? null });
    return { ok: true, warnings: payload.warnings ?? [] };
  },
}));

/** Tests only. */
export function resetBriefStore(): void {
  requestSeq++;
  useBriefStore.setState({ conversationId: null, brief: null, updatedAt: null });
}
```

Create `src/components/panels/chat/brief-updated-part.ts`:

```ts
import { BRIEF_UPDATED_PART, isBriefUpdatedData } from "@/lib/brief/brief-updated";
import { useBriefStore } from "@/store/brief-store";

/**
 * A `data-brief-updated` part received by the chat (update_brief, chantier F3):
 * the open conversation's badge and step line move at once, and the brief is
 * read again. Never sends anything to the agent.
 */
export function applyBriefUpdatedPart(part: { type: string; data?: unknown }): boolean {
  if (part.type !== BRIEF_UPDATED_PART || !isBriefUpdatedData(part.data)) return false;
  useBriefStore.getState().onBriefUpdated(part.data);
  return true;
}
```

- [ ] **Step 4: Run the store test**

Run: `./node_modules/.bin/vitest run tests/brief/brief-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing step-line and wiring tests**

In `tests/chat/turn-progress-render.test.tsx`, add inside `describe("TurnProgress", …)`:

```tsx
  it("prefixes the live line with the journey step when the conversation has a brief", () => {
    const html = renderToStaticMarkup(<TurnProgress message={undefined} status="submitted" startedAt={null} steps={[]} journeyStep={3} />);
    expect(html).toContain('<span role="status" aria-live="polite" class="sr-only">Étape 3/7 — Concurrents · Réfléchit</span>');
    const without = renderToStaticMarkup(<TurnProgress message={undefined} status="submitted" startedAt={null} steps={[]} journeyStep={null} />);
    expect(without).not.toContain("Étape");
  });
```

Create `tests/chat/chat-panel-brief.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("ChatPanel — thumbnail brief wiring", () => {
  const source = read("src/components/panels/ChatPanel.tsx");

  it("follows brief updates from useChat's onData only, without sending anything", () => {
    const start = source.indexOf("onData: (dataPart) =>");
    const handler = source.slice(start, source.indexOf("onError:", start));
    expect(handler).toContain("applyCanvasPatchPart(dataPart,");
    expect(handler).toContain("applyBriefUpdatedPart(dataPart);");
    expect(handler).not.toMatch(/sendMessage|addToolOutput|regenerate|resumeStream/);
  });

  it("loads the open conversation's brief and passes its step to the turn rows", () => {
    expect(source).toContain("useBriefStore.getState().load(activeConversationId)");
    expect(source).toMatch(/journeyStep,/);
  });

  it("shows the step on both live lines", () => {
    expect(read("src/components/panels/chat/Message.tsx")).toContain("journeyStep={controls.journeyStep ?? null}");
    expect(read("src/components/panels/chat/MessageList.tsx")).toContain("journeyStep={controls.journeyStep ?? null}");
  });
});
```

Run: `./node_modules/.bin/vitest run tests/chat/turn-progress-render.test.tsx tests/chat/chat-panel-brief.test.ts`
Expected: FAIL — no `journeyStep` prop, no `applyBriefUpdatedPart` in ChatPanel.

- [ ] **Step 6: Step line in `TurnProgress`, `Message`, `MessageList`**

In `src/components/panels/chat/TurnProgress.tsx`:
1. Add `import { briefStepLine } from "@/lib/brief/steps";`.
2. Add the prop: in the destructuring add `journeyStep = null,` after `steps,`, and in the props type add `/** The conversation's thumbnail journey step, when it has a brief. */ journeyStep?: number | null;`.
3. Replace `const label = currentStepLabel(message, status);` with:

```tsx
  const stepLabel = currentStepLabel(message, status);
  const label = journeyStep ? `${briefStepLine(journeyStep)} · ${stepLabel}` : stepLabel;
```

In `src/components/panels/chat/Message.tsx`:
1. In `ChatTurnControls`, after `orphanUserTurn?: boolean;`, add:

```ts
  /** The open conversation's thumbnail journey step (« Étape n/7 — … » on the live line); null without a brief. */
  journeyStep?: number | null;
```
2. Replace `<TurnProgress message={message} status={controls.status} startedAt={controls.turnStartedAt} steps={turn.steps} />` with `<TurnProgress message={message} status={controls.status} startedAt={controls.turnStartedAt} steps={turn.steps} journeyStep={controls.journeyStep ?? null} />`.

In `src/components/panels/chat/MessageList.tsx`, replace `<TurnProgress message={undefined} status={controls.status} startedAt={controls.turnStartedAt} steps={[]} />` with `<TurnProgress message={undefined} status={controls.status} startedAt={controls.turnStartedAt} steps={[]} journeyStep={controls.journeyStep ?? null} />`.

- [ ] **Step 7: Wire `ChatPanel`**

In `src/components/panels/ChatPanel.tsx`:
1. Imports: add `import { useBriefStore } from "@/store/brief-store";` and `import { applyBriefUpdatedPart } from "./chat/brief-updated-part";`.
2. In `onData`, after the `applyCanvasPatchPart(dataPart, { … });` call, add:

```tsx
      // Thumbnail journey: the brief changed (badge, sheet, step line).
      applyBriefUpdatedPart(dataPart);
```
and update the comment above `onData` to: `// Guided journey: a node place_node wrote in the database, shown live and centered, and brief updates (transient parts: never in the messages, never sent back).`
3. After the effect `// When project changes, clear active conv …` add:

```tsx
  // The open conversation's thumbnail brief (« Fiche », step line): a free local GET.
  useEffect(() => {
    void useBriefStore.getState().load(activeConversationId);
  }, [activeConversationId]);

  const journeyStep = useBriefStore((s) => (s.conversationId === activeConversationId ? (s.brief?.step ?? null) : null));
```
4. In the `controls` `useMemo`, add `journeyStep,` after `orphanUserTurn: …,` and add `journeyStep` to its dependency array.

- [ ] **Step 8: Run the chat tests**

Run: `./node_modules/.bin/vitest run tests/chat/turn-progress-render.test.tsx tests/chat/chat-panel-brief.test.ts tests/chat/chat-panel-canvas-patch.test.ts tests/chat/chat-panel-safety.test.ts tests/chat/message-list-render.test.tsx tests/chat/message-render.test.tsx tests/chat/chat-empty-state.test.tsx tests/brief/brief-store.test.ts`
Expected: PASS. If `chat-panel-canvas-patch.test.ts`'s 400-character `onData` slice now cuts before the end of the handler, it still only asserts `applyCanvasPatchPart(dataPart,` is inside and that no send happens — leave it.

- [ ] **Step 9: Type-check, lint (before/after), commit**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/lib/brief/steps.ts src/store/brief-store.ts src/components/panels/chat/brief-updated-part.ts src/components/panels/chat/TurnProgress.tsx src/components/panels/chat/Message.tsx src/components/panels/chat/MessageList.tsx src/components/panels/ChatPanel.tsx tests/brief/brief-store.test.ts tests/chat/chat-panel-brief.test.ts tests/chat/turn-progress-render.test.tsx
git add src/lib/brief/steps.ts src/store/brief-store.ts src/components/panels/chat/brief-updated-part.ts src/components/panels/chat/TurnProgress.tsx src/components/panels/chat/Message.tsx src/components/panels/chat/MessageList.tsx src/components/panels/ChatPanel.tsx tests/brief/brief-store.test.ts tests/chat/chat-panel-brief.test.ts tests/chat/turn-progress-render.test.tsx
git commit -m "feat(chat): follow the thumbnail brief — client store, brief-updated chunks, « Étape n/7 » on the live line" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Run eslint on `ChatPanel.tsx` before Step 7 too and compare: no new error.

---
## Task 10: « Fiche » button, badge and the editable sheet

**Files:**
- Create: `src/components/brief/brief-view.ts`, `src/components/brief/BriefFields.tsx`, `src/components/brief/BriefComposition.tsx`, `src/components/brief/BriefPanel.tsx`, `src/components/brief/BriefButton.tsx`
- Modify: `src/components/panels/chat/ChatHeader.tsx`
- Test: `tests/brief/brief-view.test.ts`, `tests/brief/brief-panel-render.test.tsx`, `tests/brief/brief-panel-edit.test.tsx`, `tests/brief/brief-button-render.test.tsx`

**Interfaces:**
- Consumes: Task 1 (schema types and constants, `BriefPatchInput`), Task 5 (`askUserOptionImage` handles `stored:persona_`, `stored:sf_`, `stored:lg_`, `generated:sk_`), Task 9 (`useBriefStore`, `BriefPatchOutcome`, `briefStepBadge`, `briefStepLine`).
- Produces:
  - `brief-view.ts`: `type PatchBrief = (body: BriefPatchInput) => Promise<BriefPatchOutcome>`; `type SaveField = (value: string) => Promise<string | null>`; `fieldSaver(onPatch: PatchBrief, build: (value: string) => BriefPatchInput | string): SaveField`; `videoFieldPatch(field: "promise" | "audience", value): BriefPatchInput`; `variantFieldPatch(key, field: "title" | "thumbnailText" | "visualIdea", value): BriefPatchInput`; `compositionPatch(key, composition): BriefPatchInput`; `textModePatch(value): BriefPatchInput | string`; `formatScore(score: number | null): string`; `imageUrlOf(source: string | undefined): string | null`; `strategyLabel(brief): string`; item lists `GRID_ITEMS`, `BACKGROUND_ITEMS`, `EMOTION_ITEMS`, `INTENSITY_ITEMS`, `MOUTH_ITEMS`, `TEXT_MODE_ITEMS` (`{ value: string; label: string }[]`), `LAYOUT_LABELS`, `SKETCH_STATUS_LABELS`.
  - `BriefFields.tsx`: `BriefTextField({ id, label, value, maxLength?, multiline?, onSave })`, `BriefSelectField({ id, label, value, items, onSave })`.
  - `BriefPanel.tsx`: default `BriefPanel({ brief: ThumbnailBrief; onPatch: PatchBrief })`.
  - `BriefButton.tsx`: default `BriefButton({ conversationId: string | null })`.

- [ ] **Step 1: Write the failing pure test**

Create `tests/brief/brief-view.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import {
  compositionPatch,
  fieldSaver,
  formatScore,
  imageUrlOf,
  strategyLabel,
  textModePatch,
  variantFieldPatch,
  videoFieldPatch,
} from "@/components/brief/brief-view";
import { briefPatchInputSchema } from "@/lib/brief/merge";
import { compositionSchema, emptyBrief } from "@/lib/brief/schema";
import { card } from "./fixtures";

describe("brief view helpers", () => {
  it("builds PATCH bodies the route accepts", () => {
    expect(videoFieldPatch("promise", "  Savoir cliquer ")).toEqual({ video: { promise: "Savoir cliquer" } });
    expect(videoFieldPatch("audience", "   ")).toEqual({ video: { audience: null } });
    expect(variantFieldPatch("B", "thumbnailText", " ENFIN ")).toEqual({ variant: { key: "B", set: { thumbnailText: "ENFIN" } } });
    const composition = compositionSchema.parse(card());
    expect(compositionPatch("A", composition)).toEqual({ variant: { key: "A", set: { composition } } });
    expect(textModePatch("overlay")).toEqual({ common: { textMode: "overlay" } });
    expect(textModePatch("nope")).toBe("Mode de texte inconnu");
    for (const body of [videoFieldPatch("promise", "x"), variantFieldPatch("A", "title", "x"), compositionPatch("A", composition)]) {
      expect(briefPatchInputSchema.safeParse(body).success).toBe(true);
    }
  });

  it("turns a patch outcome into the message under the field", async () => {
    const onPatch = vi.fn();
    onPatch.mockResolvedValueOnce({ ok: true, warnings: [] });
    expect(await fieldSaver(onPatch, (value) => videoFieldPatch("promise", value))("x")).toBeNull();
    onPatch.mockResolvedValueOnce({ ok: false, error: "Fiche invalide", issues: [{ path: "video.promise", message: "90 caractères maximum" }] });
    expect(await fieldSaver(onPatch, (value) => videoFieldPatch("promise", value))("x")).toBe("90 caractères maximum");
    onPatch.mockResolvedValueOnce({ ok: false, error: "Enregistrement impossible, réessaie", issues: [] });
    expect(await fieldSaver(onPatch, (value) => videoFieldPatch("promise", value))("x")).toBe("Enregistrement impossible, réessaie");
    expect(await fieldSaver(onPatch, () => "Nombre entier attendu")("x")).toBe("Nombre entier attendu");
    expect(onPatch).toHaveBeenCalledTimes(3);
  });

  it("formats scores, images and the strategy", () => {
    expect(formatScore(8.2)).toBe("×8,2");
    expect(formatScore(null)).toBe("peu de données");
    expect(imageUrlOf("generated:sk_abc")).toBe("/api/generated-sketches/sk_abc");
    expect(imageUrlOf("stored:lg_1")).toBe("/api/logos/image?f=1");
    expect(imageUrlOf(undefined)).toBeNull();
    expect(strategyLabel(emptyBrief())).toBe("Stratégie pas encore choisie.");
    expect(strategyLabel({ ...emptyBrief(), abStrategy: "concepts" })).toBe("Trouver le meilleur concept");
    expect(strategyLabel({ ...emptyBrief(), abStrategy: "single-variable", abVariable: "emotion" })).toBe("Optimiser un détail : l'émotion");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/brief/brief-view.test.ts`
Expected: FAIL — cannot resolve `@/components/brief/brief-view`.

- [ ] **Step 3: Write `brief-view.ts`**

Create `src/components/brief/brief-view.ts`:

```ts
import { askUserOptionImage } from "@/lib/agent/browser-tools/ask-user";
import type { BriefPatchInput } from "@/lib/brief/merge";
import { TEXT_MODES, type AbVariable, type Composition, type Grid9, type Layout, type ThumbnailBrief, type VariantKey } from "@/lib/brief/schema";
import type { BriefPatchOutcome } from "@/store/brief-store";

/** Labels, select items and PATCH builders of the « Fiche » panel. Pure. */

export type PatchBrief = (body: BriefPatchInput) => Promise<BriefPatchOutcome>;
/** Saves one field; resolves to the message shown under it, or null once saved. */
export type SaveField = (value: string) => Promise<string | null>;
type Item = { value: string; label: string };

type VideoPatch = NonNullable<BriefPatchInput["video"]>;
type VariantSet = NonNullable<BriefPatchInput["variant"]>["set"];

export function fieldSaver(onPatch: PatchBrief, build: (value: string) => BriefPatchInput | string): SaveField {
  return async (value) => {
    const body = build(value);
    if (typeof body === "string") return body;
    const outcome = await onPatch(body);
    return outcome.ok ? null : (outcome.issues[0]?.message ?? outcome.error);
  };
}

export function videoFieldPatch(field: "promise" | "audience", value: string): BriefPatchInput {
  const video: VideoPatch = {};
  video[field] = value.trim() === "" ? null : value.trim();
  return { video };
}

export function variantFieldPatch(key: VariantKey, field: "title" | "thumbnailText" | "visualIdea", value: string): BriefPatchInput {
  const set: VariantSet = {};
  set[field] = value.trim();
  return { variant: { key, set } };
}

/** The whole card: the merge replaces a composition as a whole. */
export function compositionPatch(key: VariantKey, composition: Composition): BriefPatchInput {
  return { variant: { key, set: { composition } } };
}

export function textModePatch(value: string): BriefPatchInput | string {
  const textMode = TEXT_MODES.find((mode) => mode === value);
  return textMode ? { common: { textMode } } : "Mode de texte inconnu";
}

export function formatScore(score: number | null): string {
  return score === null ? "peu de données" : `×${score.toFixed(1).replace(".", ",")}`;
}

export function imageUrlOf(source: string | undefined): string | null {
  return askUserOptionImage(source)?.src ?? null;
}

const AB_VARIABLE_LABELS: Record<AbVariable, string> = { text: "le texte", emotion: "l'émotion", background: "le fond", hero: "le héros" };

export function strategyLabel(brief: ThumbnailBrief): string {
  if (brief.abStrategy === "concepts") return "Trouver le meilleur concept";
  if (brief.abStrategy === "single-variable") {
    return brief.abVariable ? `Optimiser un détail : ${AB_VARIABLE_LABELS[brief.abVariable]}` : "Optimiser un détail";
  }
  return "Stratégie pas encore choisie.";
}

const GRID_LABELS: Record<Grid9, string> = {
  "top-left": "Haut gauche",
  top: "Haut",
  "top-right": "Haut droite",
  left: "Gauche",
  center: "Centre",
  right: "Droite",
  "bottom-left": "Bas gauche",
  bottom: "Bas",
  "bottom-right": "Bas droite",
};
export const GRID_ITEMS: Item[] = Object.entries(GRID_LABELS).map(([value, label]) => ({ value, label }));

export const LAYOUT_LABELS: Record<Layout, string> = {
  "face-left_object-right": "Visage à gauche, objet à droite",
  "face-right_object-left": "Visage à droite, objet à gauche",
  "center-hero_text-top": "Héros au centre, texte en haut",
  "split-versus": "Duel côte à côte",
  "before-after": "Avant / après",
  "screen-hero_face-corner": "Écran en héros, visage dans un coin",
  "object-hero_no-face": "Objet en héros, sans visage",
  other: "Autre mise en page",
};

export const BACKGROUND_ITEMS: Item[] = [
  { value: "solid", label: "Aplat" },
  { value: "gradient", label: "Dégradé" },
  { value: "blurred-scene", label: "Scène floutée" },
  { value: "scene", label: "Scène" },
];

export const EMOTION_ITEMS: Item[] = ["curiosité", "surprise", "satisfaction", "inquiétude", "concentration", "déterminé"].map((value) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
}));

export const INTENSITY_ITEMS: Item[] = [
  { value: "1", label: "Légère" },
  { value: "2", label: "Moyenne" },
  { value: "3", label: "Forte" },
];

export const MOUTH_ITEMS: Item[] = [
  { value: "closed", label: "Bouche fermée" },
  { value: "open", label: "Bouche ouverte" },
];

export const TEXT_MODE_ITEMS: Item[] = [
  { value: "rendered", label: "Écrit par le modèle" },
  { value: "overlay", label: "Zone vide, texte ajouté ensuite" },
];

export const SKETCH_STATUS_LABELS: Record<"pending" | "validated" | "retouch", string> = {
  pending: "Esquisse à valider",
  validated: "Esquisse validée",
  retouch: "Esquisse à retoucher",
};
```

Run: `./node_modules/.bin/vitest run tests/brief/brief-view.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the failing render and edit tests**

Create `tests/brief/brief-panel-render.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BriefPanel from "@/components/brief/BriefPanel";
import { compositionSchema, emptyBrief, type ThumbnailBrief } from "@/lib/brief/schema";
import { NOW, card, pkg } from "./fixtures";

const full = (): ThumbnailBrief => ({
  ...emptyBrief(),
  step: 7,
  video: { subject: "Les miniatures YouTube", promise: "Savoir créer une miniature", audience: "Débutants" },
  research: {
    summary: "Les miniatures comptent.",
    keyPoints: [],
    entities: [],
    sources: [{ title: "Aide YouTube", url: "https://support.google.com/youtube" }],
    fetchedAt: NOW,
  },
  logos: [{ name: "Claude", source: "stored:lg_l1" }],
  competition: { patterns: ["Visage + objet"], saturation: ["Flèche rouge"], dominantPalette: ["#FF0000"], analyzedAt: NOW },
  references: [
    { videoId: "abcdefghijk", title: "Top miniature", channel: "Chaîne", lang: "fr", views: 1000, score: 8.2, ageDays: 30, source: "stored:sf_s1" },
  ],
  abStrategy: "concepts",
  common: { textMode: "rendered", persona: "stored:persona_p1", style: "Aplats", colors: ["#0F172A"] },
  variants: [
    {
      key: "A",
      ...pkg(),
      composition: compositionSchema.parse(card()),
      sketch: { source: "generated:sk_abc", status: "pending", autoFixed: false },
    },
  ],
});

describe("BriefPanel", () => {
  it("shows every section of a filled brief", () => {
    const html = renderToStaticMarkup(<BriefPanel brief={full()} onPatch={vi.fn()} />);
    for (const title of ["Vidéo et promesse", "Recherche", "Logos", "Concurrents", "Stratégie et éléments communs", "Variantes"]) {
      expect(html).toContain(title);
    }
    expect(html).toContain('value="Savoir créer une miniature"');
    expect(html).toContain('href="https://support.google.com/youtube"');
    expect(html).toContain("/api/logos/image?f=l1");
    expect(html).toContain("Ce qui marche");
    expect(html).toContain("Flèche rouge");
    expect(html).toContain("×8,2");
    expect(html).toContain("Trouver le meilleur concept");
    expect(html).toContain("#0F172A");
    expect(html).toContain("Variante A — Promesse chiffrée");
    expect(html).toContain('id="brief-A-thumbnailText"');
    expect(html).toContain('id="brief-A-focal"');
    expect(html).toContain("Visage à gauche, objet à droite");
    expect(html).toContain("/api/generated-sketches/sk_abc");
    expect(html).toContain("Esquisse à valider");
  });

  it("says what is not there yet", () => {
    const html = renderToStaticMarkup(<BriefPanel brief={emptyBrief()} onPatch={vi.fn()} />);
    expect(html).toContain("Pas encore de recherche.");
    expect(html).toContain("Aucun logo.");
    expect(html).toContain("Pas encore d&#x27;analyse des concurrents.");
    expect(html).toContain("Pas encore de variante.");
  });
});
```

Create `tests/brief/brief-panel-edit.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import BriefPanel from "@/components/brief/BriefPanel";
import { compositionSchema, emptyBrief, type ThumbnailBrief } from "@/lib/brief/schema";
import { card, pkg } from "./fixtures";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const brief = (): ThumbnailBrief => ({
  ...emptyBrief(),
  step: 6,
  video: { promise: "Savoir cliquer" },
  variants: [{ key: "A", ...pkg(), composition: compositionSchema.parse(card()) }],
});

async function typeAndEnter(id: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`#${id}`)!;
  expect(input).not.toBeNull();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
}

describe("BriefPanel — editing", () => {
  it("saves the promise", async () => {
    const onPatch = vi.fn(async () => ({ ok: true as const, warnings: [] }));
    await act(async () => root.render(<BriefPanel brief={brief()} onPatch={onPatch} />));
    await typeAndEnter("brief-video-promise", "Savoir créer une miniature");
    expect(onPatch).toHaveBeenCalledWith({ video: { promise: "Savoir créer une miniature" } });
    expect(container.querySelector(".text-destructive")).toBeNull();
  });

  it("shows the refusal under the field", async () => {
    const onPatch = vi.fn(async () => ({
      ok: false as const,
      error: "Fiche invalide",
      issues: [{ path: "variants.A.thumbnailText", message: "Texte de miniature : 4 mots maximum" }],
    }));
    await act(async () => root.render(<BriefPanel brief={brief()} onPatch={onPatch} />));
    await typeAndEnter("brief-A-thumbnailText", "a b c d e");
    expect(onPatch).toHaveBeenCalledWith({ variant: { key: "A", set: { thumbnailText: "a b c d e" } } });
    const field = container.querySelector("#brief-A-thumbnailText")!.closest("div")!;
    expect(field.textContent).toContain("Texte de miniature : 4 mots maximum");
    expect(container.querySelector("#brief-A-thumbnailText")!.getAttribute("aria-invalid")).toBe("true");
  });

  it("edits one field of the card and sends the whole card", async () => {
    const onPatch = vi.fn(async () => ({ ok: true as const, warnings: [] }));
    await act(async () => root.render(<BriefPanel brief={brief()} onPatch={onPatch} />));
    await typeAndEnter("brief-A-focal", "Le chronomètre");
    const composition = compositionSchema.parse(card());
    expect(onPatch).toHaveBeenCalledWith({ variant: { key: "A", set: { composition: { ...composition, focal: "Le chronomètre" } } } });
  });

  it("refuses a size that is not a number without calling the server", async () => {
    const onPatch = vi.fn(async () => ({ ok: true as const, warnings: [] }));
    await act(async () => root.render(<BriefPanel brief={brief()} onPatch={onPatch} />));
    await typeAndEnter("brief-A-element-0-size", "grand");
    expect(onPatch).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Nombre entier attendu");
  });

  it("does not save an unchanged field", async () => {
    const onPatch = vi.fn(async () => ({ ok: true as const, warnings: [] }));
    await act(async () => root.render(<BriefPanel brief={brief()} onPatch={onPatch} />));
    await typeAndEnter("brief-video-promise", "Savoir cliquer");
    expect(onPatch).not.toHaveBeenCalled();
  });
});
```

Create `tests/brief/brief-button-render.test.tsx` (a real client render: zustand serves its initial state to server rendering, so `renderToStaticMarkup` would never see the store):

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import BriefButton from "@/components/brief/BriefButton";
import { emptyBrief } from "@/lib/brief/schema";
import { resetBriefStore, useBriefStore } from "@/store/brief-store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  resetBriefStore();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

describe("BriefButton", () => {
  it("shows « Fiche » with the step badge of the open conversation's brief, and follows the store", async () => {
    useBriefStore.setState({ conversationId: "c1", brief: { ...emptyBrief(), step: 3 }, updatedAt: null });
    await act(async () => root.render(<BriefButton conversationId="c1" />));
    const button = container.querySelector("button")!;
    expect(button.textContent).toContain("Fiche");
    expect(button.textContent).toContain("Étape 3/7");
    expect(button.getAttribute("aria-label")).toBe("Fiche, Étape 3/7");
    await act(async () => useBriefStore.setState({ brief: { ...emptyBrief(), step: 5 } }));
    expect(container.querySelector("button")!.textContent).toContain("Étape 5/7");
  });

  it("has no badge without a brief for this conversation, and nothing without a conversation", async () => {
    useBriefStore.setState({ conversationId: "c1", brief: { ...emptyBrief(), step: 3 }, updatedAt: null });
    await act(async () => root.render(<BriefButton conversationId="c2" />));
    expect(container.querySelector("button")!.textContent).toContain("Fiche");
    expect(container.textContent).not.toContain("Étape");
    await act(async () => root.render(<BriefButton conversationId={null} />));
    expect(container.innerHTML).toBe("");
  });
});
```

Run: `./node_modules/.bin/vitest run tests/brief/brief-panel-render.test.tsx tests/brief/brief-panel-edit.test.tsx tests/brief/brief-button-render.test.tsx`
Expected: FAIL — cannot resolve `@/components/brief/BriefPanel`.

- [ ] **Step 5: Write the fields**

Create `src/components/brief/BriefFields.tsx`:

```tsx
"use client";
import { useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { SaveField } from "./brief-view";

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

/**
 * A text field of the « Fiche »: saved on Enter or blur when it changed; the
 * refusal shows under it. The caller keys it by its value, so a new brief
 * resets the draft.
 */
export function BriefTextField({
  id,
  label,
  value,
  maxLength,
  multiline = false,
  onSave,
}: {
  id: string;
  label: string;
  value: string;
  maxLength?: number;
  multiline?: boolean;
  onSave: SaveField;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving || draft.trim() === value.trim()) return;
    setSaving(true);
    const message = await onSave(draft);
    setSaving(false);
    setError(message);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void save();
  };

  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      {multiline ? (
        <Textarea
          id={id}
          value={draft}
          maxLength={maxLength}
          rows={2}
          aria-invalid={error ? true : undefined}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void save()}
          className="min-h-0 text-sm"
        />
      ) : (
        <Input
          id={id}
          value={draft}
          maxLength={maxLength}
          aria-invalid={error ? true : undefined}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => void save()}
          className="h-8 text-sm"
        />
      )}
      <FieldError message={error} />
    </div>
  );
}

/** A select of the « Fiche »: saved on change. */
export function BriefSelectField({
  id,
  label,
  value,
  items,
  onSave,
}: {
  id: string;
  label: string;
  value: string;
  items: { value: string; label: string }[];
  onSave: SaveField;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      <Select
        items={items}
        value={value}
        onValueChange={(next) => {
          if (typeof next === "string" && next !== value) void onSave(next).then(setError);
        }}
      >
        <SelectTrigger id={id} size="sm" className="w-full" aria-invalid={error ? true : undefined}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError message={error} />
    </div>
  );
}
```

- [ ] **Step 6: Write the card editor**

Create `src/components/brief/BriefComposition.tsx`:

```tsx
"use client";
import { Badge } from "@/components/ui/badge";
import type { BriefPatchInput } from "@/lib/brief/merge";
import type { BriefVariant, Composition } from "@/lib/brief/schema";
import { BriefSelectField, BriefTextField } from "./BriefFields";
import {
  BACKGROUND_ITEMS,
  EMOTION_ITEMS,
  GRID_ITEMS,
  INTENSITY_ITEMS,
  LAYOUT_LABELS,
  MOUTH_ITEMS,
  compositionPatch,
  type SaveField,
} from "./brief-view";

type Save = (build: (value: string) => BriefPatchInput | string) => SaveField;
type Change = (card: Composition, value: string) => Composition | string;

const integer = (value: string): number | null => {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isInteger(parsed) ? parsed : null;
};

/** The composition card of one variant; every edit sends the whole card (the merge replaces it). */
export default function BriefComposition({ variant, card, save }: { variant: BriefVariant; card: Composition; save: Save }) {
  const edit = (change: Change) =>
    save((value) => {
      const next = change(structuredClone(card), value);
      return typeof next === "string" ? next : compositionPatch(variant.key, next);
    });
  const id = (field: string) => `brief-${variant.key}-${field}`;

  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted/40 p-2">
      <p className="text-xs text-muted-foreground">
        {LAYOUT_LABELS[card.layout]}
        {card.layoutNote ? ` — ${card.layoutNote}` : ""}
      </p>
      <BriefTextField key={`focal-${card.focal}`} id={id("focal")} label="Sujet focal" value={card.focal} maxLength={80} onSave={edit((c, v) => ({ ...c, focal: v.trim() }))} />

      {card.elements.map((element, index) => (
        <div key={index} className="grid grid-cols-[1fr_4.5rem_7rem] items-end gap-1.5">
          <BriefTextField
            key={`what-${element.what}`}
            id={id(`element-${index}-what`)}
            label={element.role === "hero" ? "Héros" : "Élément"}
            value={element.what}
            maxLength={80}
            onSave={edit((c, v) => {
              c.elements[index] = { ...c.elements[index], what: v.trim() };
              return c;
            })}
          />
          <BriefTextField
            key={`size-${element.sizePct}`}
            id={id(`element-${index}-size`)}
            label="Taille %"
            value={String(element.sizePct)}
            onSave={edit((c, v) => {
              const size = integer(v);
              if (size === null) return "Nombre entier attendu";
              c.elements[index] = { ...c.elements[index], sizePct: size };
              return c;
            })}
          />
          <BriefSelectField
            id={id(`element-${index}-position`)}
            label="Position"
            value={element.position}
            items={GRID_ITEMS}
            onSave={edit((c, v) => {
              const position = GRID_ITEMS.find((item) => item.value === v)?.value as Composition["elements"][number]["position"] | undefined;
              if (!position) return "Position inconnue";
              c.elements[index] = { ...c.elements[index], position };
              return c;
            })}
          />
        </div>
      ))}
      <div className="flex flex-wrap gap-1">
        {card.elements.map((element, index) => (
          <Badge key={index} variant={element.role === "hero" ? "default" : "secondary"}>
            {element.role === "hero" ? "Héros" : "Soutien"} · {element.sizePct} %
          </Badge>
        ))}
      </div>

      {card.textZone ? (
        <div className="grid grid-cols-2 gap-1.5">
          <BriefSelectField
            id={id("text-zone-position")}
            label="Zone de texte"
            value={card.textZone.position}
            items={GRID_ITEMS}
            onSave={edit((c, v) => {
              const position = GRID_ITEMS.find((item) => item.value === v)?.value as Composition["elements"][number]["position"] | undefined;
              if (!position || !c.textZone) return "Position inconnue";
              return { ...c, textZone: { ...c.textZone, position } };
            })}
          />
          <BriefTextField
            key={`zone-${card.textZone.heightPct}`}
            id={id("text-zone-height")}
            label="Hauteur %"
            value={String(card.textZone.heightPct)}
            onSave={edit((c, v) => {
              const height = integer(v);
              if (height === null || !c.textZone) return "Nombre entier attendu";
              return { ...c, textZone: { ...c.textZone, heightPct: height } };
            })}
          />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Pas de zone de texte.</p>
      )}

      <div className="grid grid-cols-2 gap-1.5">
        <BriefSelectField
          id={id("background-kind")}
          label="Fond"
          value={card.background.kind}
          items={BACKGROUND_ITEMS}
          onSave={edit((c, v) => {
            const kind = BACKGROUND_ITEMS.find((item) => item.value === v)?.value as Composition["background"]["kind"] | undefined;
            return kind ? { ...c, background: { ...c.background, kind } } : "Fond inconnu";
          })}
        />
        <BriefTextField
          key={`bg-color-${card.background.color ?? ""}`}
          id={id("background-color")}
          label="Couleur du fond"
          value={card.background.color ?? ""}
          maxLength={7}
          onSave={edit((c, v) => ({ ...c, background: { ...c.background, color: v.trim() || undefined } }))}
        />
      </div>
      <BriefTextField
        key={`bg-note-${card.background.note ?? ""}`}
        id={id("background-note")}
        label="Note sur le fond"
        value={card.background.note ?? ""}
        maxLength={120}
        onSave={edit((c, v) => ({ ...c, background: { ...c.background, note: v.trim() || undefined } }))}
      />

      {card.emotion && (
        <div className="grid grid-cols-3 gap-1.5">
          <BriefSelectField
            id={id("emotion-label")}
            label="Émotion"
            value={card.emotion.label}
            items={EMOTION_ITEMS}
            onSave={edit((c, v) => {
              const label = EMOTION_ITEMS.find((item) => item.value === v)?.value as NonNullable<Composition["emotion"]>["label"] | undefined;
              return label && c.emotion ? { ...c, emotion: { ...c.emotion, label } } : "Émotion inconnue";
            })}
          />
          <BriefSelectField
            id={id("emotion-intensity")}
            label="Intensité"
            value={String(card.emotion.intensity)}
            items={INTENSITY_ITEMS}
            onSave={edit((c, v) => {
              const intensity = v === "1" ? 1 : v === "2" ? 2 : v === "3" ? 3 : null;
              return intensity && c.emotion ? { ...c, emotion: { ...c.emotion, intensity } } : "Intensité inconnue";
            })}
          />
          <BriefSelectField
            id={id("emotion-mouth")}
            label="Bouche"
            value={card.emotion.mouth}
            items={MOUTH_ITEMS}
            onSave={edit((c, v) => (c.emotion && (v === "open" || v === "closed") ? { ...c, emotion: { ...c.emotion, mouth: v } } : "Choix inconnu"))}
          />
        </div>
      )}

      <div className="grid grid-cols-3 gap-1.5">
        {(["dominant", "accent", "highlight"] as const).map((slot) => (
          <BriefTextField
            key={`${slot}-${card.palette[slot]}`}
            id={id(`palette-${slot}`)}
            label={slot === "dominant" ? "Dominante" : slot === "accent" ? "Accent" : "Rehaut"}
            value={card.palette[slot]}
            maxLength={7}
            onSave={edit((c, v) => ({ ...c, palette: { ...c.palette, [slot]: v.trim() } }))}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Write the panel**

Create `src/components/brief/BriefPanel.tsx`:

```tsx
"use client";
import type { ReactNode } from "react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import type { BriefPatchInput } from "@/lib/brief/merge";
import type { BriefVariant, ThumbnailBrief } from "@/lib/brief/schema";
import BriefComposition from "./BriefComposition";
import { BriefSelectField, BriefTextField } from "./BriefFields";
import {
  SKETCH_STATUS_LABELS,
  TEXT_MODE_ITEMS,
  fieldSaver,
  formatScore,
  imageUrlOf,
  strategyLabel,
  textModePatch,
  variantFieldPatch,
  videoFieldPatch,
  type PatchBrief,
  type SaveField,
} from "./brief-view";

type Save = (build: (value: string) => BriefPatchInput | string) => SaveField;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 py-3 first:pt-0">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function Thumb({ source, label, square = false }: { source: string; label: string; square?: boolean }) {
  const src = imageUrlOf(source);
  const shape = square ? "aspect-square" : "aspect-video";
  return (
    <figure className="flex w-28 flex-col gap-1">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label} loading="lazy" className={cn("w-full rounded-md border object-cover", shape)} />
      ) : (
        <span className={cn("block w-full rounded-md bg-muted", shape)} />
      )}
      <figcaption className="truncate text-xs text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

function VariantCard({ variant, save }: { variant: BriefVariant; save: Save }) {
  const text = (field: "title" | "thumbnailText" | "visualIdea", label: string, maxLength: number, multiline = false) => (
    <BriefTextField
      key={`${field}-${variant[field]}`}
      id={`brief-${variant.key}-${field}`}
      label={label}
      value={variant[field]}
      maxLength={maxLength}
      multiline={multiline}
      onSave={save((value) => variantFieldPatch(variant.key, field, value))}
    />
  );
  return (
    <article className="flex flex-col gap-2 rounded-lg border p-3">
      <h4 className="text-sm font-medium">
        Variante {variant.key} — {variant.direction}
      </h4>
      {text("title", "Titre", 60)}
      {text("thumbnailText", "Texte de la miniature", 20)}
      {text("visualIdea", "Idée visuelle", 120, true)}
      <p className="text-xs text-muted-foreground">
        Rôle du titre : {variant.titleRole} · Rôle de la miniature : {variant.thumbRole}
      </p>
      {variant.composition ? (
        <BriefComposition variant={variant} card={variant.composition} save={save} />
      ) : (
        <Muted>Carte de composition pas encore remplie.</Muted>
      )}
      {variant.sketch && (
        <div className="flex flex-col gap-1">
          <Thumb source={variant.sketch.source} label={SKETCH_STATUS_LABELS[variant.sketch.status]} />
          {variant.sketch.review?.note && <p className="text-xs text-muted-foreground">{variant.sketch.review.note}</p>}
        </div>
      )}
    </article>
  );
}

/** The thumbnail brief, section by section; the editable fields save through `onPatch`. */
export default function BriefPanel({ brief, onPatch }: { brief: ThumbnailBrief; onPatch: PatchBrief }) {
  const save: Save = (build) => fieldSaver(onPatch, build);
  const persona = brief.common.persona;

  return (
    <div className="flex flex-col divide-y">
      <Section title="Vidéo et promesse">
        {brief.video.subject ? <p className="text-sm">{brief.video.subject}</p> : <Muted>Sujet pas encore décrit.</Muted>}
        <BriefTextField
          key={`promise-${brief.video.promise ?? ""}`}
          id="brief-video-promise"
          label="Promesse"
          value={brief.video.promise ?? ""}
          maxLength={90}
          onSave={save((value) => videoFieldPatch("promise", value))}
        />
        <BriefTextField
          key={`audience-${brief.video.audience ?? ""}`}
          id="brief-video-audience"
          label="Public"
          value={brief.video.audience ?? ""}
          maxLength={120}
          onSave={save((value) => videoFieldPatch("audience", value))}
        />
      </Section>

      <Section title="Recherche">
        {brief.research ? (
          <>
            <p className="text-sm">{brief.research.summary}</p>
            {brief.research.sources.length > 0 && (
              <ul className="flex flex-col gap-1">
                {brief.research.sources.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noreferrer" className="text-sm text-primary underline-offset-4 hover:underline">
                      {source.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <Muted>Pas encore de recherche.</Muted>
        )}
      </Section>

      <Section title="Logos">
        {brief.logos.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {brief.logos.map((logo) => (
              <Thumb key={logo.source} source={logo.source} label={logo.name} square />
            ))}
          </div>
        ) : (
          <Muted>Aucun logo.</Muted>
        )}
      </Section>

      <Section title="Concurrents">
        {brief.competition && (
          <div className="flex flex-col gap-1 text-sm">
            <p>
              <span className="font-medium">Ce qui marche : </span>
              {brief.competition.patterns.join(" · ") || "—"}
            </p>
            <p>
              <span className="font-medium">À éviter : </span>
              {brief.competition.saturation.join(" · ") || "—"}
            </p>
          </div>
        )}
        {brief.references.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {brief.references.map((reference) => (
              <Thumb key={reference.videoId} source={reference.source} label={`${formatScore(reference.score)} · ${reference.title}`} />
            ))}
          </div>
        )}
        {!brief.competition && brief.references.length === 0 && <Muted>Pas encore d&apos;analyse des concurrents.</Muted>}
      </Section>

      <Section title="Stratégie et éléments communs">
        <p className="text-sm">{strategyLabel(brief)}</p>
        {persona === "none" && <Muted>Sans personnage.</Muted>}
        {persona && persona !== "none" && <Thumb source={persona} label="Personnage" square />}
        {!persona && <Muted>Personnage pas encore choisi.</Muted>}
        {brief.common.style && <p className="text-sm">{brief.common.style}</p>}
        {brief.common.colors && brief.common.colors.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {brief.common.colors.map((color) => (
              <Badge key={color} variant="outline" className="font-mono">
                {color}
              </Badge>
            ))}
          </div>
        )}
        <BriefSelectField
          id="brief-text-mode"
          label="Texte de la miniature"
          value={brief.common.textMode}
          items={TEXT_MODE_ITEMS}
          onSave={save(textModePatch)}
        />
      </Section>

      <Section title="Variantes">
        {brief.variants.length === 0 ? (
          <Muted>Pas encore de variante.</Muted>
        ) : (
          brief.variants.map((variant) => <VariantCard key={variant.key} variant={variant} save={save} />)
        )}
      </Section>
    </div>
  );
}
```

- [ ] **Step 8: Write the button and put it in the header**

Create `src/components/brief/BriefButton.tsx`:

```tsx
"use client";
import { useState } from "react";
import { NotebookTextIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { briefStepBadge, briefStepLine } from "@/lib/brief/steps";
import { useBriefStore } from "@/store/brief-store";
import BriefPanel from "./BriefPanel";

/** « Fiche » in the chat header: the step badge, and the sheet with the editable brief. */
export default function BriefButton({ conversationId }: { conversationId: string | null }) {
  const [open, setOpen] = useState(false);
  const brief = useBriefStore((s) => (conversationId !== null && s.conversationId === conversationId ? s.brief : null));
  const patch = useBriefStore((s) => s.patch);
  if (!conversationId) return null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void useBriefStore.getState().load(conversationId);
      }}
    >
      <SheetTrigger
        render={
          <Button variant="ghost" size="sm" className="gap-1.5 px-2" aria-label={brief ? `Fiche, ${briefStepBadge(brief.step)}` : "Fiche"} />
        }
      >
        <NotebookTextIcon data-icon="inline-start" />
        Fiche
        {brief && <Badge variant="secondary">{briefStepBadge(brief.step)}</Badge>}
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Fiche miniature</SheetTitle>
          <SheetDescription>
            {brief ? `${briefStepLine(brief.step)} · modifiable, l'agent la relit à chaque tour.` : "Elle se remplit pendant le parcours avec l'agent."}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          {brief ? <BriefPanel brief={brief} onPatch={patch} /> : <p className="text-sm text-muted-foreground">Aucune fiche pour cette conversation.</p>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

In `src/components/panels/chat/ChatHeader.tsx`:
1. Add `import BriefButton from "@/components/brief/BriefButton";`.
2. In `<div className="flex items-center gap-0.5">`, before `<HeaderButton label="Nouvelle conversation" onClick={create}>`, add `<BriefButton conversationId={activeConversationId} />`.

- [ ] **Step 9: Run the UI tests**

Run: `./node_modules/.bin/vitest run tests/brief/brief-view.test.ts tests/brief/brief-panel-render.test.tsx tests/brief/brief-panel-edit.test.tsx tests/brief/brief-button-render.test.tsx`
Expected: PASS. If the edit test's `closest("div")` lands on the input's own wrapper rather than the field `div`, walk up to the element with class `grid gap-1` (`closest(".grid")`) — do not change the component to fit.

- [ ] **Step 10: Type-check, lint (before/after on `ChatHeader.tsx`), commit**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/components/brief src/components/panels/chat/ChatHeader.tsx tests/brief/brief-view.test.ts tests/brief/brief-panel-render.test.tsx tests/brief/brief-panel-edit.test.tsx tests/brief/brief-button-render.test.tsx
git add src/components/brief/brief-view.ts src/components/brief/BriefFields.tsx src/components/brief/BriefComposition.tsx src/components/brief/BriefPanel.tsx src/components/brief/BriefButton.tsx src/components/panels/chat/ChatHeader.tsx tests/brief/brief-view.test.ts tests/brief/brief-panel-render.test.tsx tests/brief/brief-panel-edit.test.tsx tests/brief/brief-button-render.test.tsx
git commit -m "feat(brief): « Fiche » button with the step badge and the editable brief sheet" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
## Task 11: Fake « journey » scenario replaces the F2 « interview » scenario

**Files:**
- Create: `src/lib/agent/v2/fake-journey-script.ts`
- Modify: `src/lib/agent/v2/fake-agent-model.ts`
- Delete: `src/lib/agent/v2/fake-interview-script.ts`, `tests/agent/fake-agent-interview.test.ts`
- Test: `tests/agent/fake-agent-journey.test.ts`

**Interfaces:**
- Consumes: `ask_user` schema (Task 5: free question, `step` 1..7), `update_brief` input (Task 1: `briefUpdateInputSchema`, `applyBriefUpdate`), tool names `update_brief`, `apply_workflow`, `place_node`, `finish_turn`.
- Produces: `FAKE_JOURNEY_SCENARIO = "journey"`; `type FakeAgentScenario = "slow" | "journey"`; `FAKE_JOURNEY_CHUNK_DELAY_MS = 150`; `fakeAgentScenario()`; `createFakeAgentModel({ chunkDelayMs?, scenario?, personas?: () => FakePersona[] })`; `journeyScript(options: LanguageModelV3CallOptions, personas: FakePersona[]): LanguageModelV3StreamPart[]`; `type FakePersona = { id: string; label: string }`. `isFakeAgentEnabled`, `FAKE_CHUNK_DELAY_MS` and the slow scenario are unchanged.

- [ ] **Step 1: Write the failing scenario test**

Create `tests/agent/fake-agent-journey.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { hasToolCall, isStepCount, streamText, tool, type ModelMessage } from "ai";
import { z } from "zod";
import { askUserInputSchema } from "@/lib/agent/browser-tools/ask-user";
import { finishTurnInputSchema } from "@/lib/agent/finish-turn";
import { applyBriefUpdate, briefUpdateInputSchema } from "@/lib/brief/merge";
import { emptyBrief } from "@/lib/brief/schema";
import { FAKE_JOURNEY_SCENARIO, createFakeAgentModel, fakeAgentScenario, isFakeAgentEnabled } from "@/lib/agent/v2/fake-agent-model";
import { resolveAgentLanguageModel } from "@/lib/agent/v2/agent-model";
import { setSetting } from "@/lib/settings";

const SYSTEM = (canvas: unknown, brief = "") =>
  `<project_id>proj_fake</project_id>\n\n<canvas_state>\n${JSON.stringify(canvas, null, 2)}\n</canvas_state>${brief}`;

type Call = { toolName: string; input: Record<string, unknown> };
type Options = Array<{ id: string }>;

/** Plays the journey like the chat does: each ask_user pauses the turn, the "user" answers, the turn resumes. */
async function playJourney(
  answer: (input: Record<string, unknown>) => unknown,
  { canvas = { nodes: [], edges: [] }, personas = [{ id: "p1", label: "Antoine" }], system }: { canvas?: unknown; personas?: Array<{ id: string; label: string }>; system?: string } = {},
): Promise<Call[]> {
  const calls: Call[] = [];
  const messages: ModelMessage[] = [{ role: "user", content: "Aide-moi à construire la miniature de ma vidéo." }];
  const tools = {
    ask_user: tool({ inputSchema: askUserInputSchema }),
    update_brief: tool({ inputSchema: z.looseObject({}), execute: async () => "Fiche enregistrée." }),
    place_node: tool({ inputSchema: z.looseObject({ node: z.looseObject({ id: z.string() }) }), execute: async ({ node }) => `node id: ${node.id}` }),
    apply_workflow: tool({ inputSchema: z.looseObject({ project_id: z.string() }), execute: async () => "Applied" }),
    finish_turn: tool({ inputSchema: finishTurnInputSchema, execute: async () => ({ ok: true }) }),
  };
  for (let turn = 0; turn < 12; turn++) {
    const result = streamText({
      model: createFakeAgentModel({ chunkDelayMs: 0, scenario: FAKE_JOURNEY_SCENARIO, personas: () => personas }),
      system: system ?? SYSTEM(canvas),
      messages,
      tools,
      stopWhen: [isStepCount(20), hasToolCall("finish_turn")],
    });
    for await (const chunk of result.toUIMessageStream()) {
      if (chunk.type === "tool-input-available") calls.push({ toolName: chunk.toolName, input: chunk.input as Record<string, unknown> });
    }
    const response = await result.response;
    messages.push(...(response.messages as ModelMessage[]));
    const last = calls.at(-1)!;
    if (last.toolName === "finish_turn") return calls;
    expect(last.toolName).toBe("ask_user");
    const toolCallId = (response.messages.at(-1)!.content as Array<{ type: string; toolCallId: string }>).find((c) => c.type === "tool-call")!.toolCallId;
    messages.push({
      role: "tool",
      content: [{ type: "tool-result", toolCallId, toolName: "ask_user", output: { type: "json", value: answer(last.input) as never } }],
    });
  }
  throw new Error("the journey never finished");
}

const answers = (packages: string[]) => (input: Record<string, unknown>) => {
  const options = input.options as Options;
  if (options.length === 0) return { other: "Une vidéo sur les miniatures YouTube" };
  if (options.some((option) => option.id === "pkg-a")) return { selected: packages };
  return { selected: [options[0].id] };
};

/** Every update_brief of the scenario, applied in order, must give a valid brief without warnings. */
function foldBrief(calls: Call[]) {
  let brief = emptyBrief();
  for (const call of calls.filter((c) => c.toolName === "update_brief")) {
    const result = applyBriefUpdate(brief, briefUpdateInputSchema.parse(call.input), "2026-09-17T10:00:00.000Z");
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.warnings).toEqual([]);
    brief = result.brief;
  }
  return brief;
}

afterEach(() => vi.unstubAllEnvs());

describe("fake agent — journey scenario", () => {
  it("is selected by THUMBGEN_FAKE_AGENT=journey only", () => {
    vi.stubEnv("THUMBGEN_FAKE_AGENT", "journey");
    expect(fakeAgentScenario()).toBe("journey");
    vi.stubEnv("THUMBGEN_FAKE_AGENT", "interview");
    expect(fakeAgentScenario()).toBe("slow");
  });

  it("stays impossible in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("THUMBGEN_FAKE_AGENT", "journey");
    const previousKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    setSetting("openrouterApiKey", "");
    expect(isFakeAgentEnabled()).toBe(false);
    expect(resolveAgentLanguageModel("anthropic/claude-sonnet-4.6")).toBeNull();
    if (previousKey !== undefined) process.env.OPENROUTER_API_KEY = previousKey;
  });

  it("plays steps 1, 4, 5, 6 then ships an A/B workflow, never sketching nor generating", async () => {
    const calls = await playJourney(answers(["pkg-a", "pkg-b"]));
    expect(calls.map((c) => c.toolName)).toEqual([
      "ask_user",
      "update_brief",
      "ask_user",
      "update_brief",
      "ask_user",
      "update_brief",
      "update_brief",
      "ask_user",
      "update_brief",
      "update_brief",
      "ask_user",
      "update_brief",
      "ask_user",
      "update_brief",
      "apply_workflow",
      "finish_turn",
    ]);
    const asks = calls.filter((c) => c.toolName === "ask_user").map((c) => c.input);
    expect(asks.map((a) => a.step)).toEqual([1, 4, 4, 5, 6, 6]);
    for (const ask of asks) expect(askUserInputSchema.safeParse(ask).success).toBe(true);
    expect(asks[0]).toMatchObject({ options: [], allow_skip: false });
    expect(asks[2]).toMatchObject({ multiple: true, max_selected: 3 });
    expect(asks[3].options).toEqual([
      { id: "p1", label: "Antoine", image: "stored:persona_p1" },
      { id: "none", label: "Aucun" },
    ]);

    const brief = foldBrief(calls);
    expect(brief.step).toBe(7);
    expect(brief.video.subject).toBe("Une vidéo sur les miniatures YouTube");
    expect(brief.abStrategy).toBe("concepts");
    expect(brief.common.persona).toBe("stored:persona_p1");
    expect(brief.variants.map((v) => v.key)).toEqual(["A", "B"]);
    expect(brief.variants.every((v) => v.composition)).toBe(true);

    const workflow = calls.find((c) => c.toolName === "apply_workflow")!.input as {
      blueprint: { nodes: Array<{ id: string; data: Record<string, unknown> }>; edges: Array<{ targetHandle: string }> };
    };
    expect(workflow.blueprint.nodes.find((n) => n.id === "journey-generator")!.data.abTest).toEqual({ variants: ["A", "B"] });
    expect(workflow.blueprint.edges.map((e) => e.targetHandle)).toEqual(["prompt-in", "prompt-in-b"]);
    expect(calls.at(-1)!.input.next_actions).toEqual([{ kind: "generate", node_id: "journey-generator" }]);
    expect(calls.some((c) => /generate_sketch|trigger|generation/.test(c.toolName))).toBe(false);
  });

  it("places one prompt and the generator for a single package, and writes no emotion without a character", async () => {
    const calls = await playJourney(answers(["pkg-c"]), { personas: [] });
    expect(calls.filter((c) => c.toolName === "place_node").map((c) => (c.input.node as { id: string }).id)).toEqual(["iv-prompt", "iv-generator"]);
    expect(calls.at(-1)!.input.next_actions).toEqual([{ kind: "generate", node_id: "iv-generator" }]);
    const brief = foldBrief(calls);
    expect(brief.common.persona).toBe("none");
    expect(brief.variants).toHaveLength(1);
    expect(brief.variants[0].composition?.emotion).toBeUndefined();
  });

  it("asks to resume or restart F2 interview nodes without a brief, and restarts on request", async () => {
    const canvas = { nodes: [{ id: "iv-prompt", type: "prompt" }, { id: "user-1", type: "prompt" }], edges: [] };
    const calls = await playJourney(
      (input) =>
        (input.options as Options).some((o) => o.id === "restart") ? { selected: ["restart"] } : { skipped: true },
      { canvas },
    );
    // The skipped free question then ends the simulated journey.
    const started = calls;
    expect(started[0]).toMatchObject({ toolName: "ask_user", input: { step: 1, options: [{ id: "resume" }, { id: "restart" }] } });
    expect(started[1]).toEqual({
      toolName: "apply_workflow",
      input: { project_id: "proj_fake", blueprint: { nodes: [], edges: [] }, remove_node_ids: ["iv-prompt"] },
    });
    expect(started[2]).toMatchObject({ toolName: "ask_user", input: { step: 1, options: [] } });
  });

  it("does not offer the restart when the conversation already has a brief", async () => {
    const canvas = { nodes: [{ id: "iv-prompt", type: "prompt" }], edges: [] };
    const calls = await playJourney(() => ({ skipped: true }), { system: SYSTEM(canvas, '\n\n<thumbnail_brief>\n{"step":4}\n</thumbnail_brief>') });
    expect(calls.map((c) => c.toolName)).toEqual(["finish_turn"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/agent/fake-agent-journey.test.ts`
Expected: FAIL — `FAKE_JOURNEY_SCENARIO` is not exported.

- [ ] **Step 3: Write the journey script**

Create `src/lib/agent/v2/fake-journey-script.ts`:

```ts
import type { LanguageModelV3CallOptions, LanguageModelV3StreamPart } from "@ai-sdk/provider";

/**
 * DEV ONLY (chantier F3a): the thumbnail journey played by the fake agent
 * model (THUMBGEN_FAKE_AGENT=journey) — steps 1, 4, 5, 6 and the provisional
 * step 7 (apply_workflow for an A/B test, place_node for one package) — so the
 * question cards, the brief (« Fiche », badge, step line) and the live canvas
 * can be checked in a browser without any model call. Never generate_sketch
 * (no fixtures before F3c). Stateless like a model: every decision comes from
 * the prompt (the last tool result and earlier answers).
 */

export type FakePersona = { id: string; label: string };

const USAGE = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

const PACKAGES = [
  {
    id: "pkg-a",
    direction: "Promesse chiffrée",
    title: "Ma méthode pour des miniatures qui cliquent",
    thumbnailText: "10 MIN",
    visualIdea: "Visage surpris à gauche, chronomètre géant à droite.",
    titleRole: "Promet la méthode",
    thumbRole: "Montre la rapidité",
  },
  {
    id: "pkg-b",
    direction: "Avant / après",
    title: "J'ai refait toutes mes miniatures",
    thumbnailText: "AVANT/APRÈS",
    visualIdea: "Deux miniatures côte à côte, l'ancienne grisée.",
    titleRole: "Raconte l'expérience",
    thumbRole: "Prouve le résultat",
  },
  {
    id: "pkg-c",
    direction: "Erreur fréquente",
    title: "L'erreur qui tue tes clics",
    thumbnailText: "STOP",
    visualIdea: "Une miniature barrée d'une croix rouge.",
    titleRole: "Nomme le problème",
    thumbRole: "Montre le danger",
  },
];

const KEYS = ["A", "B", "C"] as const;
const PALETTE = { dominant: "#0F172A", accent: "#F59E0B", highlight: "#FFFFFF" };

function cardFor(index: number, withFace: boolean) {
  const cards = [
    {
      layout: "face-left_object-right",
      focal: "Le visage surpris",
      elements: [
        { what: "Visage surpris", role: "hero", sizePct: 45, position: "left" },
        { what: "Chronomètre géant", role: "support", sizePct: 30, position: "right" },
      ],
      textZone: { position: "top-right", heightPct: 20 },
      background: { kind: "solid", color: "#0F172A" },
    },
    {
      layout: "before-after",
      focal: "La nouvelle miniature",
      elements: [
        { what: "Nouvelle miniature", role: "hero", sizePct: 40, position: "right" },
        { what: "Ancienne miniature grisée", role: "support", sizePct: 35, position: "left" },
      ],
      textZone: { position: "top", heightPct: 18 },
      background: { kind: "gradient", color: "#1E293B" },
    },
    {
      layout: "object-hero_no-face",
      focal: "La croix rouge",
      elements: [{ what: "Miniature barrée d'une croix", role: "hero", sizePct: 55, position: "center" }],
      textZone: { position: "bottom", heightPct: 20 },
      background: { kind: "solid", color: "#111111" },
    },
  ];
  const card = { ...cards[index], palette: PALETTE };
  return withFace && index === 0 ? { ...card, emotion: { label: "surprise", intensity: 2, mouth: "closed" } } : card;
}

let counter = 0;

function systemText(options: LanguageModelV3CallOptions): string {
  return options.prompt
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n");
}

/** One model step: a short sentence, then one tool call whose id carries `key`. */
function step(sentence: string, toolName: string, input: unknown, key: string): LanguageModelV3StreamPart[] {
  const stamp = `${Date.now().toString(36)}${(counter++).toString(36)}`;
  const id = `fake-text-${stamp}`;
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id },
    ...sentence.split(/(?<= )/).map((delta) => ({ type: "text-delta" as const, id, delta })),
    { type: "text-end", id },
    { type: "tool-call", toolCallId: `fake-${key}-${stamp}`, toolName, input: JSON.stringify(input) },
    { type: "finish", usage: USAGE, finishReason: { unified: "tool-calls", raw: "tool-calls" } },
  ];
}

const ask = (key: string, input: Record<string, unknown>) => step("Question suivante.", "ask_user", { allow_skip: false, ...input }, `ask-${key}`);
const brief = (key: string, input: Record<string, unknown>) => step("J'écris la fiche.", "update_brief", input, `brief-${key}`);
const finish = (summary: string, nextActions: unknown[] = []) =>
  step("Je résume.", "finish_turn", { summary, results: [], next_actions: nextActions }, "finish");

type ToolResultPart = { type: "tool-result"; toolCallId: string; toolName: string; output: unknown };
type Answer = { selected?: string[]; other?: string; skipped?: boolean };

const keyOf = (toolCallId: string) => toolCallId.match(/^fake-(.+)-[a-z0-9]+$/)?.[1] ?? "";

function toolResults(options: LanguageModelV3CallOptions): ToolResultPart[] {
  return options.prompt.flatMap((message) =>
    message.role === "tool" ? (message.content as Array<{ type: string }>).filter((part): part is ToolResultPart => part.type === "tool-result") : [],
  );
}

function answerOf(results: ToolResultPart[], key: string): Answer | null {
  const result = [...results].reverse().find((candidate) => keyOf(candidate.toolCallId) === key);
  const value = (result?.output as { value?: unknown } | undefined)?.value;
  return value && typeof value === "object" ? (value as Answer) : null;
}

export function journeyScript(options: LanguageModelV3CallOptions, personas: FakePersona[]): LanguageModelV3StreamPart[] {
  const system = systemText(options);
  const results = toolResults(options);
  const last = options.prompt.at(-1);
  const interviewIds = () => [...new Set([...system.matchAll(/"id":\s*"(iv-[\w-]+)"/g)].map((match) => match[1]))];

  const askPromise = () =>
    ask("promise", { question: "De quoi parle la vidéo, et qu'est-ce que le spectateur saura faire ou comprendre à la fin ?", step: 1, options: [] });
  const packages = () =>
    (answerOf(results, "ask-packages")?.selected ?? []).flatMap((id) => PACKAGES.filter((pkg) => pkg.id === id)).slice(0, 3);
  const persona = () => {
    const selected = answerOf(results, "ask-persona")?.selected?.[0];
    return selected && selected !== "none" ? `stored:persona_${selected}` : "none";
  };
  const writePackage = (index: number) => {
    const kept = packages();
    if (kept.length === 0) return finish("Aucun package gardé : le parcours simulé s'arrête.");
    const { direction, title, thumbnailText, visualIdea, titleRole, thumbRole } = kept[index];
    return brief(`package-${index}`, {
      ...(index === kept.length - 1 ? { step: 5 } : {}),
      variant: { key: KEYS[index], set: { direction, title, thumbnailText, visualIdea, titleRole, thumbRole } },
    });
  };
  const writeCard = (index: number) =>
    brief(`card-${index}`, { variant: { key: KEYS[index], set: { composition: cardFor(index, persona() !== "none") } } });

  if (last?.role !== "tool") {
    if (system.includes("<thumbnail_brief>")) return finish("On reprend là où la fiche s'est arrêtée.");
    if (interviewIds().length > 0) {
      return ask("resume", {
        question: "Une interview a déjà construit des nœuds sur ce canvas.",
        step: 1,
        options: [
          { id: "resume", label: "Reprendre l'interview" },
          { id: "restart", label: "Repartir de zéro" },
        ],
      });
    }
    return askPromise();
  }

  const result = (last.content as Array<{ type: string }>).find((part): part is ToolResultPart => part.type === "tool-result");
  if (!result) return finish("Parcours simulé interrompu.");
  if ((result.output as { type?: string } | null)?.type === "error-text") return finish("Désolé, cette étape n'a pas pu être enregistrée.");
  const key = keyOf(result.toolCallId);
  const answer = answerOf(results, key);
  if (answer?.skipped) return finish("Question passée : le parcours simulé s'arrête.");

  const cardMatch = key.match(/^(brief|ask)-card-(\d)$/);
  const packageMatch = key.match(/^brief-package-(\d)$/);
  if (packageMatch) {
    const index = Number(packageMatch[1]);
    if (index + 1 < packages().length) return writePackage(index + 1);
    return ask("persona", {
      question: "Quel personnage sur la miniature ?",
      step: 5,
      options: [
        ...personas.slice(0, 4).map((p) => ({ id: p.id, label: p.label.slice(0, 60), image: `stored:persona_${p.id}` })),
        { id: "none", label: "Aucun" },
      ],
    });
  }
  if (cardMatch) {
    const index = Number(cardMatch[2]);
    if (cardMatch[1] === "brief") {
      const pkg = packages()[index];
      return ask(`card-${index}`, {
        question: `Variante ${KEYS[index]} : ${pkg?.direction ?? "carte"}, ${cardFor(index, false).focal.toLowerCase()} — on valide la carte ?`,
        step: 6,
        options: [
          { id: "validate", label: "Valider" },
          { id: "background", label: "Changer le fond" },
        ],
      });
    }
    return index + 1 < packages().length ? writeCard(index + 1) : brief("step7", { step: 7 });
  }

  switch (key) {
    case "ask-resume":
      if (!answer?.selected?.includes("restart")) return askPromise();
      return step(
        "Je repars de zéro.",
        "apply_workflow",
        { project_id: system.match(/<project_id>([^<]+)<\/project_id>/)?.[1] ?? "", blueprint: { nodes: [], edges: [] }, remove_node_ids: interviewIds() },
        "restart",
      );
    case "restart":
      return askPromise();
    case "ask-promise":
      return brief("video", {
        step: 4,
        video: {
          subject: (answer?.other ?? "Une vidéo sur les miniatures YouTube").slice(0, 300),
          promise: "Savoir créer une miniature qui donne envie de cliquer",
          audience: "Créateurs YouTube débutants",
        },
      });
    case "brief-video":
      return ask("strategy", {
        question: "Quelle stratégie pour le test A/B ?",
        step: 4,
        options: [
          { id: "concepts", label: "Trouver le meilleur concept" },
          { id: "single-variable", label: "Optimiser un détail" },
        ],
      });
    case "ask-strategy":
      return brief(
        "strategy",
        answer?.selected?.[0] === "single-variable" ? { abStrategy: "single-variable", abVariable: "text" } : { abStrategy: "concepts" },
      );
    case "brief-strategy":
      return ask("packages", {
        question: "Quels packages garder ?",
        step: 4,
        multiple: true,
        max_selected: 3,
        options: PACKAGES.map((pkg) => ({ id: pkg.id, label: pkg.direction, description: `${pkg.title} | ${pkg.thumbnailText}` })),
      });
    case "ask-packages":
      return writePackage(0);
    case "ask-persona":
      return brief("common", {
        step: 6,
        common: { persona: persona(), style: "Aplats contrastés, contour épais", colors: ["#0F172A", "#F59E0B", "#FFFFFF"] },
      });
    case "brief-common":
      return writeCard(0);
    case "brief-step7": {
      const kept = packages();
      const promptOf = (pkg: (typeof PACKAGES)[number]) => `Miniature « ${pkg.direction} » : ${pkg.visualIdea} Texte "${pkg.thumbnailText}".`;
      if (kept.length === 1) {
        return step("Je pose le prompt.", "place_node", { node: { id: "iv-prompt", type: "prompt", data: { prompt: promptOf(kept[0]) } } }, "place-prompt");
      }
      const handles = ["prompt-in", "prompt-in-b", "prompt-in-c"];
      return step(
        "Je pose le test A/B.",
        "apply_workflow",
        {
          project_id: system.match(/<project_id>([^<]+)<\/project_id>/)?.[1] ?? "",
          blueprint: {
            nodes: [
              ...kept.map((pkg, index) => ({ id: `journey-prompt-${KEYS[index].toLowerCase()}`, type: "prompt", data: { prompt: promptOf(pkg) } })),
              {
                id: "journey-generator",
                type: "generator",
                data: { model: "nano-banana", aspectRatio: "16x9", count: 1, abTest: { variants: KEYS.slice(0, kept.length) } },
              },
            ],
            edges: kept.map((_, index) => ({ source: `journey-prompt-${KEYS[index].toLowerCase()}`, target: "journey-generator", targetHandle: handles[index] })),
          },
        },
        "workflow",
      );
    }
    case "place-prompt":
      return step(
        "Je pose le générateur.",
        "place_node",
        { node: { id: "iv-generator", type: "generator", data: { model: "nano-banana", aspectRatio: "16x9", count: 1 } } },
        "place-generator",
      );
    case "place-generator":
      return finish("Le workflow de ta miniature est prêt : le prompt et le générateur.", [{ kind: "generate", node_id: "iv-generator" }]);
    case "workflow":
      return finish("Le test A/B est sur le canvas : un prompt par variante et le générateur.", [{ kind: "generate", node_id: "journey-generator" }]);
    default:
      return finish("Parcours simulé terminé.");
  }
}
```

- [ ] **Step 4: Switch the fake model to the journey**

In `src/lib/agent/v2/fake-agent-model.ts`:
1. Replace `import { interviewScript, type FakeLibraryItem } from "./fake-interview-script";` with `import { journeyScript, type FakePersona } from "./fake-journey-script";`.
2. Replace the block from `/** THUMBGEN_FAKE_AGENT=interview plays the guided interview …` down to the end of `libraryFromDb` with:

```ts
/** THUMBGEN_FAKE_AGENT=journey plays the thumbnail journey (chantier F3a); any other value the slow F1 turn. */
export const FAKE_JOURNEY_SCENARIO = "journey";
export type FakeAgentScenario = "slow" | typeof FAKE_JOURNEY_SCENARIO;
/** The journey's delay between chunks: quick enough to click through, slow enough to watch. */
export const FAKE_JOURNEY_CHUNK_DELAY_MS = 150;

export function fakeAgentScenario(): FakeAgentScenario {
  return process.env.THUMBGEN_FAKE_AGENT === FAKE_JOURNEY_SCENARIO ? FAKE_JOURNEY_SCENARIO : "slow";
}

/** Personnages offered by the fake character question (local DB, newest first). */
function personasFromDb(): FakePersona[] {
  return getDb().prepare("SELECT id, label FROM personas ORDER BY created_at DESC LIMIT 4").all() as FakePersona[];
}
```

3. Replace `createFakeAgentModel` with:

```ts
export function createFakeAgentModel({
  chunkDelayMs,
  scenario = "slow",
  personas = personasFromDb,
}: { chunkDelayMs?: number; scenario?: FakeAgentScenario; personas?: () => FakePersona[] } = {}) {
  const delay = chunkDelayMs ?? (scenario === FAKE_JOURNEY_SCENARIO ? FAKE_JOURNEY_CHUNK_DELAY_MS : FAKE_CHUNK_DELAY_MS);
  return new MockLanguageModelV3({
    provider: "thumbgen-fake",
    modelId: scenario === FAKE_JOURNEY_SCENARIO ? "fake-agent-journey" : "fake-agent",
    doStream: async (options) => {
      const parts = scenario === FAKE_JOURNEY_SCENARIO ? journeyScript(options, personas()) : script(options);
      let index = 0;
      return {
        stream: new ReadableStream<LanguageModelV3StreamPart>({
          async pull(controller) {
            if (index >= parts.length) {
              controller.close();
              return;
            }
            // Rejects with an AbortError on stop: streamText then emits its `abort` chunk.
            if (index > 0) await sleep(delay, options.abortSignal);
            controller.enqueue(parts[index++]);
          },
        }),
      };
    },
  });
}
```

4. Delete the F2 files:

```bash
git rm src/lib/agent/v2/fake-interview-script.ts tests/agent/fake-agent-interview.test.ts
```

- [ ] **Step 5: Run the fake-model tests**

Run: `./node_modules/.bin/vitest run tests/agent/fake-agent-journey.test.ts tests/agent/fake-agent-model.test.ts`
Expected: PASS. `grep -rn "fake-interview-script\|FAKE_INTERVIEW_SCENARIO\|interviewScript" src tests` must print nothing (older plans under `docs/` may still mention them — that is history, leave them).

- [ ] **Step 6: Full suite, type-check, lint, commit**

```bash
./node_modules/.bin/vitest run
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/lib/agent/v2/fake-journey-script.ts src/lib/agent/v2/fake-agent-model.ts tests/agent/fake-agent-journey.test.ts
git add src/lib/agent/v2/fake-journey-script.ts src/lib/agent/v2/fake-agent-model.ts tests/agent/fake-agent-journey.test.ts src/lib/agent/v2/fake-interview-script.ts tests/agent/fake-agent-interview.test.ts
git commit -m "test(agent): fake « journey » scenario replaces the F2 interview scenario" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Expected: the full suite passes.

---
## Task 12: Browser check with the fake « journey » model (no model call)

**Files:** none modified (verification only). If a check fails, fix it in the file owned by the relevant task, re-run that task's tests, `tsc` and the checks below, and commit the fix separately (`fix(brief): …` / `fix(chat): …` / `fix(agent): …`) with that task's file list.

**Interfaces:**
- Consumes: everything from Tasks 1–11; `THUMBGEN_FAKE_AGENT=journey` (Task 11).
- Produces: a pass/fail report for each numbered check below.

**Safety rules for this task.** Only the throwaway dev server on port **3100** with blank keys and `THUMBGEN_FAKE_AGENT=journey`; never `localhost:3000`, never `data/thumbgen.db`. Never click « Générer ». Every accepted chat turn must be answered by the fake model — its warning line appears once per accepted turn in the server log. The journey never calls `generate_sketch`.

- [ ] **Step 1: Start the throwaway server**

```bash
FIXTURE_DIR="$(mktemp -d)"; echo "$FIXTURE_DIR"
```

Use the printed directory literally below (shell variables do not survive between tool calls). Start in the background:

```bash
THUMBGEN_FAKE_AGENT=journey THUMBGEN_DB_PATH="<FIXTURE_DIR>/thumbgen.db" OPENROUTER_API_KEY= OPENAI_API_KEY= YOUTUBE_API_KEY= ./node_modules/.bin/next dev -p 3100 > "<FIXTURE_DIR>/next.log" 2>&1
```

Wait, then create a project:

```bash
until curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/miniatures | grep -qE "^(200|307|308)$"; do sleep 2; done
curl -s -X POST http://localhost:3100/api/projects -H "Content-Type: application/json" -d '{"name":"F3a vérification"}'
```

Expected: JSON with `"id":"proj_…"`. Note `<PROJECT_ID>`.

- [ ] **Step 2: Free route guards (curl)**

```bash
curl -s -w "\n%{http_code}\n" http://localhost:3100/api/briefs/unknown
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH http://localhost:3100/api/briefs/unknown -d '{"video":{"promise":"x"}}'
```

Expected: `{"error":"Conversation introuvable"}` then `404`; then `415` (curl sends a form content type).

- [ ] **Step 3: Steps 1 and 4 — free question, strategy, packages**

In the browser tool, open `http://localhost:3100/m/<PROJECT_ID>`, open the agent panel if minimised, click « Construire avec l'agent ».
1. A question card shows « Étape 1/7 », the question « De quoi parle la vidéo, et qu'est-ce que le spectateur saura faire ou comprendre à la fin ? », **no option button**, a field with placeholder « Ta réponse… » and « Envoyer » (no « Passer »).
2. The header shows « Fiche » **without** a badge.
3. Type `Une vidéo sur les miniatures YouTube` and click « Envoyer ». While the turn runs, read the live line (`document.querySelector('[role="status"][aria-live="polite"]')?.textContent`): once the brief is written it reads `Étape 4/7 — Stratégie et directions · …`.
4. The next card shows « Étape 4/7 », « Quelle stratégie pour le test A/B ? »; the header badge reads « Étape 4/7 ». Click « Trouver le meilleur concept ».
5. The packages card: « Étape 4/7 », three text options (« Promesse chiffrée », « Avant / après », « Erreur fréquente ») with their « Titre | Texte » descriptions, « Jusqu'à 3 choix ». Select « Promesse chiffrée » and « Avant / après », click « Valider ».

- [ ] **Step 4: Steps 5 and 6 — character, cards**

1. The character card shows « Étape 5/7 » and « Aucun » (plus the Personnages of the throwaway DB, usually none). Click « Aucun ».
2. Card « Variante A : Promesse chiffrée, le visage surpris — on valide la carte ? » with « Étape 6/7 »: click « Valider ». Then the same for « Variante B : Avant / après, … »: click « Valider ».
3. The turn ends with the summary « Le test A/B est sur le canvas : un prompt par variante et le générateur. » and a « Générer · … » button — **do not click it**. The header badge reads « Étape 7/7 ».
4. The canvas shows two prompt nodes and one generator with variants A and B:

```bash
curl -s "http://localhost:3100/api/project?id=<PROJECT_ID>" | /opt/homebrew/bin/node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s);console.log(p.nodes.map(n=>n.id).sort().join(","));console.log(JSON.stringify(p.nodes.find(n=>n.id==="journey-generator")?.data?.abTest))})'
```

Expected: `journey-generator,journey-prompt-a,journey-prompt-b` and `{"variants":["A","B"]}`.

- [ ] **Step 5: The « Fiche » sheet**

Find the conversation id:

```bash
curl -s "http://localhost:3100/api/agent/conversations?project_id=<PROJECT_ID>"
```

Note `<CID>` (the first `id`). Then:
1. Click « Fiche » in the chat header. A right-side sheet « Fiche miniature » opens, its description starts with « Étape 7/7 — Esquisses et workflow ». Sections: « Vidéo et promesse » (subject `Une vidéo sur les miniatures YouTube`, promise field `Savoir créer une miniature qui donne envie de cliquer`), « Recherche » (« Pas encore de recherche. »), « Logos » (« Aucun logo. »), « Concurrents » (« Pas encore d'analyse des concurrents. »), « Stratégie et éléments communs » (« Trouver le meilleur concept », « Sans personnage. », the style and three hex badges, the « Texte de la miniature » select), « Variantes » (« Variante A — Promesse chiffrée » and « Variante B — Avant / après » with their title, text, idea fields and their cards: layout label, focal, elements, text zone, background, palette; no emotion fields since there is no character).
2. Edit the promise: select the « Promesse » field, replace with `Savoir faire une miniature en 10 minutes`, press Enter. No error under the field, and:

```bash
curl -s http://localhost:3100/api/briefs/<CID> | /opt/homebrew/bin/node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).brief.video.promise))'
```

Expected: `Savoir faire une miniature en 10 minutes`.
3. In « Variante A », replace « Texte de la miniature » with `a b c d e` and press Enter: « Texte de miniature : 4 mots maximum » appears under the field, the field is marked invalid, and the same curl on `.brief.variants[0].thumbnailText` still prints `10 MIN`.
4. In « Variante B », change the focal subject to `La miniature refaite`, press Enter: no error; `curl … .brief.variants[1].composition.focal` prints `La miniature refaite` and `.brief.variants[1].composition.elements.length` still prints `2`.
5. Change « Texte de la miniature » (select) to « Zone vide, texte ajouté ensuite »: `curl … .brief.common.textMode` prints `overlay`.
6. Close the sheet, reload the page: the badge « Étape 7/7 » comes back (GET), the ended conversation shows its folded steps; the folded question lines read « De quoi parle la vidéo… : Une vidéo sur les miniatures YouTube » (no « Autre : »).

- [ ] **Step 6: The agent sees the edit; deletion removes the brief**

1. Send `Où en est la fiche ?` in the composer. The fake model answers « On reprend là où la fiche s'est arrêtée. » — it only says that when the turn received a `<thumbnail_brief>` block. Count the accepted turns:

```bash
grep -c "THUMBGEN_FAKE_AGENT: simulated model, no real call" "<FIXTURE_DIR>/next.log"
```

Expected: one line per accepted turn so far (1 + 6 answers + this message = **8**).
2. Delete the conversation through the API and check the brief is gone:

```bash
curl -s -X DELETE http://localhost:3100/api/agent/conversations/<CID>
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3100/api/briefs/<CID>
/opt/homebrew/bin/node -e 'const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(process.argv[1]);console.log(db.prepare("SELECT COUNT(*) AS n FROM thumbnail_briefs WHERE conversation_id = ?").get(process.argv[2]))' "<FIXTURE_DIR>/thumbgen.db" "<CID>"
```

Expected: `{"success":true}`, `404`, `{ n: 0 }` (an `ExperimentalWarning` is normal).

- [ ] **Step 7: One package (place_node path)**

Click « Nouvelle conversation », then « Construire avec l'agent ». Answer: `Test une seule direction` → « Trouver le meilleur concept » → select only « Erreur fréquente » + « Valider » → « Aucun » → « Valider ». Expected: the canvas gets `iv-prompt` and `iv-generator` live (each centered as it lands), the turn ends with « Le workflow de ta miniature est prêt : le prompt et le générateur. » and a « Générer · … » button (not clicked); the badge reads « Étape 7/7 ».

- [ ] **Step 8: No real call, no console error**

```bash
grep -c "POST /api/agent/chat 200" "<FIXTURE_DIR>/next.log"
grep -c "THUMBGEN_FAKE_AGENT: simulated model, no real call" "<FIXTURE_DIR>/next.log"
grep -ci "openrouter.ai" "<FIXTURE_DIR>/next.log"
grep -c "generate_sketch" "<FIXTURE_DIR>/next.log"
```

Expected: the first two counts are equal; the last two are `0`. Read the browser console errors: none from the chat, the question card, the sheet or the store. Emulate `prefers-reduced-motion: reduce` if the tool allows it and check the sheet still opens and closes.

- [ ] **Step 9: Stop the server**

Stop the background `next dev`. Leave `<FIXTURE_DIR>` alone (throwaway). Report each check above with pass/fail and any fix commits.

---

## Task 13: Docker rebuild and live checks without paid calls

**Files:** none modified (verification only). If a check fails, fix it in the owning task's files, re-run `tsc` + `vitest`, commit (`fix(…): …`), and only then rebuild — this plan's single rebuild happens once every local check passes.

**Interfaces:**
- Consumes: Tasks 1–12 merged in the branch checked out at `/Users/antoinevigneau/thumbgen-real`.
- Produces: the deployed container and a report (paid check: done after « oui », or « skipped »).

**Safety rules for this task.** The container serves the user's real database and keys. Do not modify or delete projects, conversations or briefs; open them only to look. No message is sent to the agent without the user's explicit « oui » in this session. If a login page appears (`SITE_PASSWORD`), stop and ask the user to log in; never type a password.

- [ ] **Step 1: Green branch in the main repository**

```bash
cd /Users/antoinevigneau/thumbgen-real
git status --short
git log --oneline -15
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
grep -c "THUMBGEN_FAKE_AGENT" Dockerfile docker-compose.yml
```

Expected: the commits of Tasks 1–11 (and any fix commits of Task 12) are in the checked-out branch (if the work lives in another worktree, stop and ask the user to merge or check it out here — Docker's `./data` bind mount is relative); `tsc` exits 0; all tests pass; the grep prints `Dockerfile:0` and `docker-compose.yml:0`.

- [ ] **Step 2: Rebuild and restart (the only rebuild)**

```bash
docker compose build thumbgen && docker compose up -d thumbgen
docker compose ps
until curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/miniatures | grep -qE "^(200|307|308)$"; do sleep 2; done
docker compose logs --tail 50 thumbgen
```

Expected: build succeeds, `thumbgen` is « Up », no error in the logs (the `thumbnail_briefs` table is created at boot by `AGENT_TABLES_DDL`).

- [ ] **Step 3: Free live checks**

With curl (if they answer 307/401 because of `SITE_PASSWORD`, run the same requests with `fetch` from the browser tool on a logged-in `http://localhost:3000` page):

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/briefs/unknown
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH http://localhost:3000/api/briefs/unknown -d '{}'
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/agent/chat -d '{}'
```

Expected: `404`, `415`, `415`.

In the browser tool (look only, send nothing): open an existing miniature with a conversation. The chat header shows « Fiche » without a badge (older conversations have no brief); clicking it opens the sheet with « Aucune fiche pour cette conversation. »; close it. An old F2 interview conversation still renders its history (its folded question lines may fall back to the generic « Te pose une question » label for the old step 8 — expected). Console errors: none from the chat, the header or the sheet.

- [ ] **Step 4: Ask before the paid check**

Ask the user in chat, and wait for a clear answer:

> Pour vérifier le parcours F3a en vrai, je crée une miniature de test « F3a parcours (vérification) », je clique « Construire avec l'agent », je réponds à la première question (la vidéo) puis au choix de stratégie, et je m'arrête quand l'agent propose les packages (étape 4) — sans esquisse, sans génération. Je regarde la fiche et le badge. Coût estimé : quelques centimes (3 à 4 appels du modèle de l'agent). Je le fais ?

If the answer is not a clear yes, skip Step 5 and report « vérification payante : non faite (pas d'accord) ».

- [ ] **Step 5: A short real journey (paid, only after « oui »)**

« Nouvelle miniature » → `F3a parcours (vérification)` → open it → agent panel → « Construire avec l'agent ».
1. The first question is a free question « Étape 1/7 » (no old videos offered). Answer: `Une vidéo qui explique comment tester deux miniatures avec YouTube Studio, pour savoir laquelle garder.`
2. The agent writes the brief (badge « Étape 4/7 » or « Étape 2/7 » then 4 — step 2 is skipped without logos), then asks the A/B strategy. Answer « Trouver le meilleur concept ».
3. When the packages question appears (« Étape 4/7 », 2 or 3 packages « Titre | Texte »), **stop**: do not answer. Open « Fiche »: promise ≤ 90 characters, audience filled, strategy « Trouver le meilleur concept ».
4. In « Usage », note the agent calls and cost of this conversation. Do not click « Générer » or anything that starts a generation. Leave the project in place and mention it in the report.

- [ ] **Step 6: Logs and report**

```bash
docker compose logs --tail 100 thumbgen | grep -i "error\|warn" || echo "no errors"
```

Report every check with pass/fail, whether the paid check ran (calls, cost, the project left), and any fix commits.

---

## Self-review against the spec

- **F3a périmètre — tables et hooks de suppression:** `thumbnail_briefs` in `AGENT_TABLES_DDL`, idempotent; `softDeleteConversation` transaction; `deleteProject` → Task 2 (ruling 11). F3b tables not created (Global Constraints).
- **Schéma zod avec fusions par clé et validations:** full schema incl. later fields → Task 1 (ruling 1); packaging limits, `thumbnailText` ≤ 4 mots / ≤ 20 car., overlap warning with entities excluded (ruling 7), card rules (1–3 elements, one hero, sum ≤ 110, text zone not on the hero cell, emotion defaults, emotion without character — ruling 9), strategy warnings (ruling 8); merge field by field, arrays replaced, variant by key, composition replaced, `removeVariant` (ruling 5), server-only fields (`usage`, `logoCandidates`, `research.sources`) → Tasks 1, 2, 4.
- **`update_brief`:** writes in a transaction with re-read, returns the summary without the script and the warnings, emits the transient `data-brief-updated` chunk, built per request, chat-only, labelled → Tasks 2, 3, 8 (rulings 15, 23).
- **Bloc `<thumbnail_brief>`:** after `<canvas_state>`, script 1 500, sources as titles, candidates id + name, no base64, tags neutralized; the prompt says to trust it → Tasks 3, 7, 8.
- **Routes GET et PATCH:** 415, 404, validation, non-patchable fields, same merge → Task 4 (ruling 4).
- **`ask_user`:** steps 1..7 and « Étape n/7 », 12 options, `max_selected` ≤ 5, `generated:sk_` images; free question for step 1 → Task 5 (rulings 2, 3).
- **Protection GC des esquisses:** attach on write, detach replaced sketches not referenced elsewhere → Task 2 (ruling 10), through `update_brief` → Task 3.
- **Réductions de contexte 1 à 3:** no `web_search_options` with a brief; images trimmed before the last answered `ask_user`; three tools added to `HISTORY_IMAGE_TRIMMED_TOOLS` → Task 8 (ruling 14). Point 4 (`find_competitor_thumbnails` without images) is F3b.
- **Compteurs de garde-fous:** `usage` counters with atomic reservation / release → Task 2 (ruling 12); `generate_sketch` refused before step 7 and past `2 × variantes + 3` → Task 8 (ruling 13). Research / competitors / analyses / previews counters are used by F3b/F3c tools.
- **THUMBNAIL JOURNEY et nettoyage du prompt:** replaces GUIDED INTERVIEW, Mental checklist, PROPOSING ANGLES, WHEN THE USER PICKS AN ANGLE, core loop; `trigger_generation` removed; EXISTING WORKFLOW kept for existing workflows; resume/restart only without a brief; `INTERVIEW_PRICE_TABLE` for step 7; `list_followed_videos` not offered at step 1; steps 2, 3 and 7 degrade with « Until then » → Task 7 (rulings 18, 19). MULTI-SELECT reduction deferred to F3c (ruling 18).
- **Corrections de `prompt-engineering.ts`:** no ideogram/grok, 168×94, no « ~30% », 0–4 words complementing the title, medium shot with action, 3 elements, overlay « leave … empty », worked example rewritten → Task 6. Sketch model 3.1 → Task 6 (ruling 20).
- **`Sheet` Fiche, badge, ligne d'étape, édition:** « Fiche » button + « Étape n/7 » badge, sheet sections, editable fields with errors under the field, refresh on the chunk and on opening → Tasks 9, 10 (rulings 15, 16, 17). Aperçu mobile / grille / checklist sections show only what exists (F3c fills them).
- **Retrait des restes F2:** fake `interview` scenario and its script/test → Task 11 (ruling 21); « étape 8 » tests → Tasks 5, 7; `place_node` description → Task 7 (ruling 22).
- **Comportement livré:** steps 1, 4, 5, 6 complete; 2 and 3 skipped (with the `list_logos` fallback for step 2); provisional step 7 with current `generate_sketch` and `place_node` (one direction) or `apply_workflow` (A/B) → Task 7; exercised end to end with the fake model → Tasks 11, 12.
- **Tests listed by the spec for F3a:** schema → Task 1; merge → Task 1; storage (idempotent migration, CRUD, soft delete, project delete, transaction) → Task 2; routes → Task 4; `update_brief` (write, transient chunk, attach/detach) → Tasks 2, 3, 8; brief block → Task 3; `ask_user` (7 ok, 8 refused, 12 options, `generated:sk_`) → Task 5; history (trim before the last resolved `ask_user`, no `web_search_options` with a brief) → Task 8; prompt (journey present; interview, angles, core loop, `trigger_generation` absent; ideogram, grok, 200×112, ~30% absent) → Tasks 6, 7; UI (button and badge, sheet sections, saved edit and displayed error, refresh on chunk) → Tasks 9, 10.
- **Transverses:** no paid tool in the fake scenario (no `generate_sketch`, log checks) → Tasks 11, 12; prompt coherence (no immediate sketches, `apply_workflow` only at step 7 or for existing workflows) → Task 7; reopening a conversation reloads the brief and resumes at `step` → Tasks 9, 12 (Step 5.6, Step 6.1).
- **Vérification live** (paid, consent-gated, stops before sketches) → Task 13 Steps 4–5.
- **Type consistency checked:** `BriefUpdateInput` / `BriefPatchInput` (Task 1) used by Tasks 2, 3, 4, 9, 10; `StoredBrief`, `updateBrief`, `reserveBriefUsage`, `releaseBriefUsage` (Task 2) used by Tasks 3, 4, 8; `BriefUpdatedData`, `BRIEF_UPDATED_PART` (Task 3) used by Tasks 8, 9; `buildUpdateBriefTool({ conversationId, projectId, writeBriefUpdated })` (Task 3) mocked with the same shape in Task 8; `briefStepBadge` / `briefStepLine` (Task 9) used by Task 10; `BriefPatchOutcome` (Task 9) used by Task 10; `askUserOptionImage` with `generated:sk_` (Task 5) used by Task 10; `FAKE_JOURNEY_SCENARIO` / `createFakeAgentModel({ personas })` (Task 11) used by `agent-model.ts` unchanged (`fakeAgentScenario()`).
