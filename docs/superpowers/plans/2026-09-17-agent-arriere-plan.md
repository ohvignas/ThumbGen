# Agent en arrière-plan (chantier F1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An agent turn keeps running on the server whatever page is open (even with the tab closed); the chat reconnects to it live when the miniature is reopened, and the rest of the app shows an activity dot and a toast when a turn ends, fails or asks a question — one turn per conversation.

**Architecture:** A process-wide run registry on `globalThis` (`src/lib/agent/v2/run-registry.ts`) owns each turn: `startRun` is a synchronous lock per conversation, the chat route reads `streamText(...).toUIMessageStream()` to the end itself (`pumpRunStream`) into the run's chunk buffer, and every HTTP response — the sender's and any reconnection — is only a subscriber (`subscribe(run)`). The model is aborted only by `run.abort` (route `POST …/stop`), never by a browser disconnect. The client reconnects through AI SDK's `resumeStream()` (`GET /api/agent/chat/<id>/stream`, 204 when nothing runs); an `AgentRunsProvider` in the root layout polls `GET /api/agent/runs` to drive dots and Base UI toasts. A dev-only fake language model (`THUMBGEN_FAKE_AGENT`, impossible when `NODE_ENV === "production"`) lets the browser check run slow turns without any model call.

**Tech Stack:** Next.js 16.2 App Router (Node runtime), React 19.2, TypeScript strict, Tailwind v4, shadcn `base-nova` on Base UI (`@base-ui/react` 1.8, incl. `@base-ui/react/toast`), Vercel AI SDK `ai` 7.0.99 (+ `ai/test` `MockLanguageModelV3`) and `@ai-sdk/react` 4.0.102, Zustand 5, zod 4, better-sqlite3, vitest 4 (+ happy-dom 20).

**Spec:** `docs/superpowers/specs/2026-09-17-agent-arriere-plan-design.md` — the binding authority. Read it before starting any task. Deviations and precisions are listed under « Code reality vs spec (rulings) » with the ruling taken.

## Global Constraints

- **Sequencing.** Code quoted here was read on `main` at `2815807` (spec commit `098ec36` + later docs-only commits). The spec `docs/superpowers/specs/2026-09-17-agent-canvas-sur-design.md` (« correctif urgent ») may be executed before this plan; it touches `apply_workflow`, the system prompt and the canvas, not the files of this plan except possibly `route-handler.ts`. **Every task that edits an existing file starts by re-reading it on the latest `main`** and applies the described change to what is actually there; anchors are quoted code, never line numbers. When a task gives a full replacement for an existing file or function, first run `git diff 2815807 -- <file>`: if something changed it, carry that change into the new version.
- **Paid-call safety (paramount).** No task adds an automatic model call: no `resume: true`, no new `sendAutomaticallyWhen` trigger, no retry loop that re-posts to `/api/agent/chat`. The only way to start a turn stays a user action (send, « Et maintenant », « Réessayer », answering a client request). The 409 is decided before any DB write, auto-title or model call. The fake model is reachable only when `process.env.NODE_ENV !== "production"` **and** `THUMBGEN_FAKE_AGENT` is set; `THUMBGEN_FAKE_AGENT` never appears in `Dockerfile` or `docker-compose.yml` (a test enforces it, Task 11 proves it on the built image).
- **Spec values (verbatim):** buffer soft cap **2 000 chunks**; retention **5 minutes**; polling **3 s** while `running` is non-empty, else **30 s**; 409 body `L'agent travaille déjà ici` (plain text); stop fallback **10 s**; stop response `{ stopped: boolean }`; toasts « L'agent a fini — <nom> », « L'agent s'est arrêté sur une erreur — <nom> », « L'agent te pose une question — <nom> » with a button « Ouvrir » to `/m/<projectId>`; kinds `finished` | `error` | `question`; statuses `running` | `done` | `error` | `stopped`; dot `animate-pulse motion-reduce:animate-none` when running, fixed when an attention is unseen.
- **shadcn here is `base-nova` on Base UI, not Radix.** Check `src/components/ui/*` before writing JSX. Triggers take `render={<Button … />}`. `cn` is imported from the npm package `"cn"` (`import { cn } from "cn"`). `buttonVariants` is exported by `@/components/ui/button`.
- **UI rules.** Only shadcn/Base UI components and Tailwind classes in new or rewritten code (no `style={{…}}`). UI copy is French; apostrophes in JSX text are written `&apos;` (plain `'` inside JS strings is fine). Animations respect `prefers-reduced-motion` (`motion-reduce:` variants).
- **Commands.** Tests: `./node_modules/.bin/vitest run` (one file: `./node_modules/.bin/vitest run tests/path/file.test.ts`). Type-check: `./node_modules/.bin/tsc --noEmit`. Lint: `./node_modules/.bin/eslint <files>`. shadcn CLI: `./node_modules/.bin/shadcn`. `npx` is broken in this shell; `node` may be a broken shell function — use `/opt/homebrew/bin/node`. If `tsc` reports errors only inside `.next/types` or `.next/dev/types`, run `rm -rf .next/types .next/dev/types` and re-run it.
- **Lint baseline.** Some existing files already fail `react-hooks/set-state-in-effect` (e.g. `src/app/miniatures/MiniaturesView.tsx`, the `load()` effect). A task must not add lint errors: run eslint on the touched files before and after, and compare. Pre-existing errors are reported, not fixed.
- **Tests never call a real model**: `streamText` is mocked in route tests, the fake model (`MockLanguageModelV3`) is used everywhere else, the auto-title is mocked in route tests, rendering tests use `renderToStaticMarkup` (`.test.tsx`) or React `createRoot` + `act` under `// @vitest-environment happy-dom` (no testing-library in this repo). Tests run against the isolated temp DB created by `tests/setup.ts`. Never read `.env*` or key settings.
- **Intermediate browser checks** use a throwaway dev server, never the Docker DB and never `localhost:3000`: `THUMBGEN_FAKE_AGENT=1 THUMBGEN_DB_PATH="<throwaway dir>/thumbgen.db" OPENROUTER_API_KEY= OPENAI_API_KEY= YOUTUBE_API_KEY= ./node_modules/.bin/next dev -p 3100`. Never click « Générer ». If a login page appears, stop and ask the user to log in; never type a password. Never touch `data/thumbgen.db`.
- **Docker.** The user is actively using `http://localhost:3000`. Exactly **one** rebuild, in Task 11: `docker compose build thumbgen && docker compose up -d thumbgen`, run from `/Users/antoinevigneau/thumbgen-real` (the `./data` bind mount is relative — never from a worktree). A real agent message there is paid and needs the user's explicit « oui » in the executing session; otherwise it is skipped and reported as skipped.
- **Commits.** Commit only the files a task lists — never `git add -A` / `git add .`. Every commit message ends with a blank line and `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` (the second `-m` in each commit command below does exactly that).

## Code reality vs spec (rulings)

1. **Toast component.** No `<Toaster />` exists yet and `./node_modules/.bin/shadcn add toast` needs the network registry (its output cannot be checked offline, and later tasks need fixed exports). Ruling: a hand-written wrapper `src/components/ui/toast.tsx` on `@base-ui/react/toast` (installed, 1.8): a global `toastManager` (`Toast.createToastManager()`), `toast({ id?, title, description?, action?, timeout? })`, and `<Toaster />` (viewport **top-right**, so it never covers the chat panel fixed bottom-right). No `sonner`, no `next-themes`.
2. **The sidebar has no project list.** `AppSidebar` only has « Mes miniatures », « Bibliothèque », « Usage », « Réglages ». Ruling: the sidebar shows **one aggregated dot** on « Mes miniatures » (running anywhere → animated; else unseen attention anywhere → fixed); the per-project dots are on the « Mes miniatures » cards (`MiniaturesView`).
3. **Project id.** `postV2` takes `projectId` from `getConversation(conversationId).project_id`, and uses it **also** for the `<project_id>` block of the system prompt. `body.project_id` is ignored (the client keeps sending it, harmless); the 400 becomes « Missing conversation_id ».
4. **Validation order.** `415` (`rejectNonJsonRequest`) → `400` body → `400` key → `404` « Conversation introuvable » → `409`. `getConversation` is the only DB read before `startRun`, as in the spec's own order.
5. **Model resolution and the fake model.** New `resolveAgentLanguageModel(modelId)` (`src/lib/agent/v2/agent-model.ts`): fake model if `isFakeAgentEnabled()`, else the OpenRouter provider, else `null` (the existing 400). `isFakeAgentEnabled()` tests the literal `process.env.NODE_ENV === "production"` first (inlined by Next at build, so a production bundle always returns `false`). With the fake model: no key is needed, the auto-title is skipped (it would call a model), and a `console.warn("[agent v2] THUMBGEN_FAKE_AGENT: simulated model, no real call")` is logged per turn. The fake script is two steps, one chunk per second: reasoning then `get_canvas_state` (free, local DB), then text then `finish_turn` — ≈ 22 s, stoppable (its delays reject with an `AbortError`).
6. **Run end status.** `toUIMessageStream({ onEnd })` outcome: `completed` → `done`, `aborted` → `stopped`, `failed` → `error`, `unknown` → `done`; an exception while reading → `error`. `finishRun` is idempotent (only the first call counts).
7. **`pendingClientRequest`** is computed over all chunks of the run (one assistant message per run): a `tool-input-available` of `request_user_image` / `request_user_sketch` not followed by `tool-output-available`, `tool-output-error` or `tool-output-denied` for the same `toolCallId`.
8. **Delta merge.** Past 2 000 chunks, an incoming `text-delta` / `reasoning-delta` merges into the **immediately previous** chunk if it has the same type and `id`; `tool-input-delta` merges on the same `toolCallId` (it has no `id`). Subscribers still receive every original chunk live; only the buffer (rediffusion) is merged.
9. **`discardRun`** removes the entry immediately, marks the run `error` with `endedAt`, clears its timer and closes subscribers; nothing is listed, no toast.
10. **Runs route.** Runs whose conversation no longer exists (`getConversation` null, soft-deleted) are skipped. `projectName` = `projects_meta.name` (new `getProjectName`), fallback « Miniature sans nom ». `startedAt` / `endedAt` are epoch milliseconds.
11. **« Vu » memory.** One localStorage key `thumbgen.agentRuns.v1` = `{ seen: {conversationId: endedAt}, toasted: {conversationId: endedAt} }` (try/catch). `toasted` is persisted too so a reload does not toast again. Entries whose conversation is absent from the latest successful snapshot's `attention` are pruned. Seen-marking and toasting happen in `refreshRuns()` right after a successful fetch (not in an effect — lint rule `set-state-in-effect`), reading the open project from a ref.
12. **Conversation chosen on opening a miniature.** `pickConversationId(conversations, freshSnapshot, projectId)`: a `running` conversation of this project (newest `startedAt`), else the newest `attention` of this project **seen or not** (the open page marks them seen at once, so « non vue » cannot be tested without a race), else the most recent conversation. `useConversations` calls `refreshRuns()` first.
13. **Detecting 204 vs replay.** `useChat.resumeStream()` resolves the same way in both cases. The transport's `fetch` wrapper reports the HTTP status of GET requests (`onReconnectStatus`). After a 204: `refreshRuns()`; refetch the history if the conversation was listed `running` before the reconnection **or** appears (running or attention) in the fresh snapshot; then « Tour interrompu » + « Réessayer » (`orphanUserTurn`) iff the last message is a user message and the conversation is not running now. The orphan flag is ChatPanel state, cleared by the next send/resume/answer. It is never computed before the reconnection answered, so a running turn never flashes « Tour interrompu ».
14. **409 at send.** After the refusal: drop the optimistic user message, `clearError()`, restore the draft **and the attachments** (cleared by `onSend` before sending), toast « L'agent travaille déjà ici », then reload the history and reconnect (so the live-turn baseline is the stored history). `onError` recognizes the 409 by its message (`DefaultChatTransport` throws `new Error(await response.text())`).
15. **`refreshRuns()` from ChatPanel** runs whenever `status` becomes `streaming`, `ready` or `error` (covers send, client-request answer and reconnection, start and end).
16. **« Arrêter ».** `stopAgentRun` returns `"stopped" | "not-running" | "failed"`. `failed` → local `stop()` at once. `not-running` while the request is still `submitted` (the server has not registered the run yet) → the stop is re-sent when the status becomes `streaming`; the pending intent is dropped when the status stops being busy. A local `stop()` also fires after 10 s if the stream has not ended. A local `stop()` alone would **not** stop a server turn any more (paid), hence the re-send.
17. **Leaving the page.** ChatPanel's unmount aborts only the local stream (`stop()`), never the stop route.
18. **Resumed message.** A reconnection pushes a new assistant message (verified in `node_modules/ai/dist/index.js`: `lastMessage` is `undefined` for `resume-stream`); two consecutive assistant messages are already grouped by `groupConsecutiveMessages`. Nothing to change there; a test pins it.
19. **Existing route tests.** `tests/agent/v2-route-handler*.test.ts` and `tests/agent/finish-turn-wiring.test.ts` build requests without `Content-Type` and mock `toUIMessageStreamResponse` / `consumeStream`: they move to a shared helper (`tests/agent/helpers/chat-route.ts`: `chatRequest`, `fakeStreamResult`, `waitForRunEnd`) and mock `getConversation`. `tests/agent/v2-route-handler.test.ts` did not mock the auto-title (it could attempt a real title request with the fake key `test-key`); it now mocks it. The `consumeStream` test is replaced by the disconnect tests.
20. **Browser check.** Uses the server fake model (Task 10), not chantier E's in-page fetch stub (which fakes `/api/agent/chat` in the page and cannot exercise the registry). The stub and seed script stay unchanged.
21. **Indicator element.** `RunIndicator` = `<span data-slot="run-indicator" data-state="running|attention" role="img" aria-label=…>`, violet like the chat's busy dot; labels « L'agent travaille » / « L'agent a du nouveau ».

## File Structure

**Create**
- `src/lib/agent/v2/run-types.ts` — client-safe shared types (`RunStatus`, `EndedRunStatus`, `RunSummary`, `AttentionKind`, `RunningEntry`, `AttentionEntry`, `AgentRunsSnapshot`) and `AGENT_BUSY_MESSAGE`.
- `src/lib/agent/v2/run-registry.ts` — the registry (`startRun`, `discardRun`, `appendChunk`, `subscribe`, `stopRun`, `finishRun`, `getRun`, `listRuns`, `hasPendingClientRequest`, `pumpRunStream`, `runStatusForOutcome`, `resetRunRegistry`).
- `src/lib/agent/v2/fake-agent-model.ts` — `isFakeAgentEnabled`, `createFakeAgentModel`.
- `src/lib/agent/v2/agent-model.ts` — `resolveAgentLanguageModel`.
- `src/lib/agent/v2/runs-snapshot.ts` — `attentionKind`, `buildRunsSnapshot`.
- `src/app/api/agent/chat/[conversationId]/stream/route.ts`, `src/app/api/agent/chat/[conversationId]/stop/route.ts`, `src/app/api/agent/runs/route.ts`.
- `src/components/ui/toast.tsx` — Base UI toast wrapper.
- `src/components/agent-runs/agent-runs-model.ts`, `src/components/agent-runs/AgentRunsProvider.tsx`, `src/components/agent-runs/RunIndicator.tsx`.
- `src/components/panels/chat/chat-transport.ts`, `src/components/panels/chat/resume-model.ts`.
- Tests: `tests/agent/run-registry.test.ts`, `tests/agent/fake-agent-model.test.ts`, `tests/agent/helpers/chat-route.ts`, `tests/agent/v2-route-handler-runs.test.ts`, `tests/agent/run-routes.test.ts`, `tests/chat/toast.test.tsx`, `tests/agent-runs/agent-runs-model.test.ts`, `tests/agent-runs/agent-runs-provider.test.tsx`, `tests/agent-runs/run-indicator-render.test.tsx`, `tests/chat/resume.test.ts`, `tests/chat/orphan-turn-render.test.tsx`, `tests/chat/chat-panel-safety.test.ts`.

**Modify**
- `src/lib/agent/v2/route-handler.ts` (`postV2` rewritten), `src/app/api/agent/conversations/[id]/route.ts` (DELETE stops the run), `src/lib/local-storage.ts` (`getProjectName`).
- `src/app/layout.tsx`, `src/components/panels/AppSidebar.tsx`, `src/app/miniatures/MiniaturesView.tsx`.
- `src/components/panels/chat/chat-view-model.ts` (`trailingAssistantRow` orphan flag), `src/components/panels/chat/Message.tsx` (`ChatTurnControls.orphanUserTurn`), `src/components/panels/chat/MessageList.tsx`, `src/components/panels/chat/useConversations.ts`, `src/components/panels/ChatPanel.tsx`.
- Tests: `tests/agent/v2-route-handler.test.ts`, `tests/agent/v2-route-handler-retry.test.ts`, `tests/agent/v2-route-handler-settings.test.ts`, `tests/agent/finish-turn-wiring.test.ts`.

**Unchanged on purpose:** `persist-turn.ts`, `tool-adapter.ts`, `browser-client-tools.ts`, `should-auto-continue.ts`, `openrouter-provider.ts`, `PendingUiAction.tsx`, `ChatHeader.tsx`, `turn-model.ts`, `history-to-ui-messages.ts`, `scripts/chat-fixtures/*`, `Dockerfile`, `docker-compose.yml`.

## Execution lanes

Tasks in different lanes touch disjoint files and can run in parallel worktrees; merge each lane back before the tasks that depend on it.
- **Lane A (server):** Task 1 → Task 2 → Task 3 → Task 4.
- **Lane B (app shell):** Task 5 → Task 6 (after Task 1: `run-types.ts`) → Task 7.
- **Lane C (chat model):** Task 8 (after Task 1).
- **Tail (sequential):** Task 9 (after Tasks 3, 4, 6, 8) → Task 10 (browser, fake model) → Task 11 (last, the only Docker rebuild).

Between Task 3 and Task 9 the old ChatPanel still works against the new route (same POST stream; it just never reconnects). That intermediate state is never deployed.

| Task | Files |
| --- | --- |
| 1 | `run-types.ts`, `run-registry.ts`, `tests/agent/run-registry.test.ts` |
| 2 | `fake-agent-model.ts`, `agent-model.ts`, `tests/agent/fake-agent-model.test.ts` |
| 3 | `route-handler.ts`, `tests/agent/helpers/chat-route.ts`, `tests/agent/v2-route-handler-runs.test.ts`, the 4 existing route test files |
| 4 | 3 new routes, `runs-snapshot.ts`, `conversations/[id]/route.ts`, `local-storage.ts`, `tests/agent/run-routes.test.ts` |
| 5 | `ui/toast.tsx`, `layout.tsx`, `tests/chat/toast.test.tsx` |
| 6 | `agent-runs-model.ts`, `AgentRunsProvider.tsx`, `layout.tsx`, 2 tests |
| 7 | `RunIndicator.tsx`, `AppSidebar.tsx`, `MiniaturesView.tsx`, 1 test |
| 8 | `chat-transport.ts`, `resume-model.ts`, `chat-view-model.ts`, `Message.tsx`, `MessageList.tsx`, 2 tests |
| 9 | `ChatPanel.tsx`, `useConversations.ts`, `tests/chat/chat-panel-safety.test.ts` |
| 10 | none (browser check) |
| 11 | none (Docker + live checks) |

---

## Task 1: Run registry

**Files:**
- Create: `src/lib/agent/v2/run-types.ts`, `src/lib/agent/v2/run-registry.ts`
- Test: `tests/agent/run-registry.test.ts`

**Interfaces:**
- Consumes: `UIMessageChunk` from `ai`.
- Produces (`run-types.ts`, client-safe, no import): `type RunStatus = "running" | "done" | "error" | "stopped"`, `type EndedRunStatus = Exclude<RunStatus, "running">`, `type AttentionKind = "finished" | "error" | "question"`, `type RunSummary = { conversationId: string; projectId: string; startedAt: number; status: RunStatus; endedAt: number | null; pendingClientRequest: boolean }`, `type RunningEntry = { conversationId; projectId; projectName; startedAt: number }`, `type AttentionEntry = { conversationId; projectId; projectName; kind: AttentionKind; endedAt: number }`, `type AgentRunsSnapshot = { running: RunningEntry[]; attention: AttentionEntry[] }`, `const AGENT_BUSY_MESSAGE = "L'agent travaille déjà ici"`.
- Produces (`run-registry.ts`, server): `RUN_RETENTION_MS = 300_000`, `RUN_CHUNK_SOFT_CAP = 2_000`, `type AgentRun`, `startRun(conversationId, projectId): AgentRun | null`, `discardRun(run): void`, `appendChunk(run, chunk): void`, `subscribe(run): ReadableStream<UIMessageChunk>`, `stopRun(conversationId): boolean`, `finishRun(run, status: EndedRunStatus): void`, `getRun(conversationId): AgentRun | null`, `listRuns(): RunSummary[]`, `hasPendingClientRequest(chunks): boolean`, `runStatusForOutcome(status: "completed" | "failed" | "aborted" | "unknown"): EndedRunStatus`, `pumpRunStream(run, stream, endStatus: () => EndedRunStatus): Promise<void>`, `resetRunRegistry(): void` (tests).

- [ ] **Step 1: Write the failing test**

Create `tests/agent/run-registry.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { UIMessageChunk } from "ai";
import {
  RUN_CHUNK_SOFT_CAP,
  RUN_RETENTION_MS,
  appendChunk,
  discardRun,
  finishRun,
  getRun,
  hasPendingClientRequest,
  listRuns,
  pumpRunStream,
  resetRunRegistry,
  runStatusForOutcome,
  startRun,
  stopRun,
  subscribe,
} from "@/lib/agent/v2/run-registry";

async function readAll(stream: ReadableStream<UIMessageChunk>): Promise<UIMessageChunk[]> {
  const out: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out.push(value);
  }
}

const text = (delta: string, id = "t"): UIMessageChunk => ({ type: "text-delta", id, delta });

beforeEach(() => resetRunRegistry());
afterEach(() => {
  vi.useRealTimers();
  resetRunRegistry();
});

describe("run registry", () => {
  it("allows one running run per conversation", () => {
    const run = startRun("c1", "p1");
    expect(run?.status).toBe("running");
    expect(startRun("c1", "p1")).toBeNull();
    expect(startRun("c2", "p1")).not.toBeNull();
  });

  it("replaces a finished run", () => {
    const first = startRun("c1", "p1")!;
    finishRun(first, "done");
    const second = startRun("c1", "p1");
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    expect(getRun("c1")).toBe(second);
  });

  it("removes a finished run after 5 minutes, but never a newer run", () => {
    vi.useFakeTimers();
    const first = startRun("c1", "p1")!;
    finishRun(first, "done");
    vi.advanceTimersByTime(RUN_RETENTION_MS - 1);
    expect(getRun("c1")).toBe(first);
    vi.advanceTimersByTime(1);
    expect(getRun("c1")).toBeNull();

    const older = startRun("c2", "p1")!;
    finishRun(older, "done");
    const newer = startRun("c2", "p1")!;
    vi.advanceTimersByTime(RUN_RETENTION_MS * 2);
    expect(getRun("c2")).toBe(newer);
  });

  it("replays the whole buffer to a late subscriber, then the live chunks, and closes at the end", async () => {
    const run = startRun("c1", "p1")!;
    appendChunk(run, { type: "start" });
    appendChunk(run, text("Bon"));
    const reading = readAll(subscribe(run));
    appendChunk(run, text("jour"));
    finishRun(run, "done");
    expect(await reading).toEqual([{ type: "start" }, text("Bon"), text("jour")]);
    // A subscriber arriving after the end gets the buffer and an immediate close.
    expect(await readAll(subscribe(run))).toHaveLength(3);
  });

  it("cancelling a subscriber never touches the run", async () => {
    const run = startRun("c1", "p1")!;
    const reader = subscribe(run).getReader();
    await reader.cancel();
    expect(run.subscribers.size).toBe(0);
    expect(run.abort.signal.aborted).toBe(false);
    expect(run.status).toBe("running");
    appendChunk(run, text("encore"));
    expect(run.chunks).toHaveLength(1);
  });

  it("stopRun aborts a running run only", () => {
    const run = startRun("c1", "p1")!;
    expect(stopRun("c1")).toBe(true);
    expect(run.abort.signal.aborted).toBe(true);
    finishRun(run, "stopped");
    expect(stopRun("c1")).toBe(false);
    expect(stopRun("unknown")).toBe(false);
  });

  it("finishRun counts only once and ignores later chunks", () => {
    const run = startRun("c1", "p1")!;
    finishRun(run, "error");
    finishRun(run, "done");
    appendChunk(run, text("late"));
    expect(run.status).toBe("error");
    expect(run.endedAt).toBeTypeOf("number");
    expect(run.chunks).toHaveLength(0);
  });

  it("discardRun removes the entry at once and frees the lock", async () => {
    const run = startRun("c1", "p1")!;
    const reading = readAll(subscribe(run));
    discardRun(run);
    expect(await reading).toEqual([]);
    expect(getRun("c1")).toBeNull();
    expect(listRuns()).toEqual([]);
    expect(startRun("c1", "p1")).not.toBeNull();
  });

  it("merges consecutive deltas past the soft cap without dropping a structural chunk", () => {
    const run = startRun("c1", "p1")!;
    appendChunk(run, { type: "start" });
    for (let i = 1; i < RUN_CHUNK_SOFT_CAP; i++) appendChunk(run, text("a"));
    expect(run.chunks).toHaveLength(RUN_CHUNK_SOFT_CAP);
    for (let i = 0; i < 500; i++) appendChunk(run, text("b"));
    expect(run.chunks).toHaveLength(RUN_CHUNK_SOFT_CAP);
    appendChunk(run, { type: "tool-input-start", toolCallId: "x", toolName: "get_canvas_state" });
    appendChunk(run, { type: "tool-input-delta", toolCallId: "x", inputTextDelta: "{" });
    appendChunk(run, { type: "tool-input-delta", toolCallId: "x", inputTextDelta: "}" });
    appendChunk(run, { type: "tool-input-available", toolCallId: "x", toolName: "get_canvas_state", input: {} });
    appendChunk(run, { type: "finish" });
    expect(run.chunks).toHaveLength(RUN_CHUNK_SOFT_CAP + 4);
    const joined = run.chunks.map((c) => (c.type === "text-delta" ? c.delta : "")).join("");
    expect(joined).toBe("a".repeat(RUN_CHUNK_SOFT_CAP - 1) + "b".repeat(500));
    expect(run.chunks.find((c) => c.type === "tool-input-delta")).toEqual({ type: "tool-input-delta", toolCallId: "x", inputTextDelta: "{}" });
    expect(run.chunks.at(-1)).toEqual({ type: "finish" });
  });

  it("detects a pending client request", () => {
    const ask: UIMessageChunk = { type: "tool-input-available", toolCallId: "r1", toolName: "request_user_image", input: {} };
    expect(hasPendingClientRequest([ask])).toBe(true);
    expect(hasPendingClientRequest([ask, { type: "tool-output-available", toolCallId: "r1", output: {} }])).toBe(false);
    expect(hasPendingClientRequest([{ type: "tool-input-available", toolCallId: "s1", toolName: "list_logos", input: {} }])).toBe(false);
    const run = startRun("c1", "p1")!;
    appendChunk(run, ask);
    finishRun(run, "done");
    expect(listRuns()).toEqual([
      { conversationId: "c1", projectId: "p1", startedAt: run.startedAt, status: "done", endedAt: run.endedAt, pendingClientRequest: true },
    ]);
  });

  it("maps stream outcomes to run statuses", () => {
    expect(runStatusForOutcome("completed")).toBe("done");
    expect(runStatusForOutcome("aborted")).toBe("stopped");
    expect(runStatusForOutcome("failed")).toBe("error");
    expect(runStatusForOutcome("unknown")).toBe("done");
  });

  it("pumps a stream into the run and ends it with the reported status, or error on a read failure", async () => {
    const ok = startRun("c1", "p1")!;
    await pumpRunStream(
      ok,
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ type: "start" });
          controller.close();
        },
      }),
      () => "stopped",
    );
    expect(ok.chunks).toEqual([{ type: "start" }]);
    expect(ok.status).toBe("stopped");

    const broken = startRun("c2", "p1")!;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await pumpRunStream(
      broken,
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.error(new Error("provider down"));
        },
      }),
      () => "done",
    );
    errorSpy.mockRestore();
    expect(broken.status).toBe("error");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/agent/run-registry.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/agent/v2/run-registry"`.

- [ ] **Step 3: Shared types**

Create `src/lib/agent/v2/run-types.ts`:

```ts
/**
 * Agent runs (chantier F1): types shared by the server registry and the
 * client (chat, indicators, toasts). No import here, so client code can use it.
 */

export type RunStatus = "running" | "done" | "error" | "stopped";
export type EndedRunStatus = Exclude<RunStatus, "running">;

/** What an ended run asks of the user elsewhere in the app. */
export type AttentionKind = "finished" | "error" | "question";

export type RunSummary = {
  conversationId: string;
  projectId: string;
  /** Epoch milliseconds. */
  startedAt: number;
  status: RunStatus;
  endedAt: number | null;
  /** The run paused on request_user_image / request_user_sketch. */
  pendingClientRequest: boolean;
};

export type RunningEntry = { conversationId: string; projectId: string; projectName: string; startedAt: number };
export type AttentionEntry = {
  conversationId: string;
  projectId: string;
  projectName: string;
  kind: AttentionKind;
  endedAt: number;
};

/** Body of GET /api/agent/runs. */
export type AgentRunsSnapshot = { running: RunningEntry[]; attention: AttentionEntry[] };

/** Plain-text body of the 409 answered while a turn already runs in the conversation. */
export const AGENT_BUSY_MESSAGE = "L'agent travaille déjà ici";
```

- [ ] **Step 4: The registry**

Create `src/lib/agent/v2/run-registry.ts`:

```ts
import type { UIMessageChunk } from "ai";
import type { EndedRunStatus, RunStatus, RunSummary } from "./run-types";

/**
 * In-process registry of agent turns (chantier F1). A turn belongs to its run,
 * not to an HTTP request: the chat route reads the model's UI stream to the end
 * into `chunks`, and every response (the sender's, a reconnection) is only a
 * subscriber. Like src/lib/youtube/runtime.ts it lives on globalThis (route
 * bundles and dev hot reloads must share it). Nothing survives a restart.
 */

/** An ended run stays listed (attention, late reconnection) this long. */
export const RUN_RETENTION_MS = 5 * 60_000;
/** Soft cap of the buffer: past it, consecutive deltas of one part are merged. */
export const RUN_CHUNK_SOFT_CAP = 2_000;

const CLIENT_TOOL_NAMES: ReadonlySet<string> = new Set(["request_user_image", "request_user_sketch"]);

export type AgentRun = {
  conversationId: string;
  projectId: string;
  startedAt: number;
  status: RunStatus;
  abort: AbortController;
  chunks: UIMessageChunk[];
  subscribers: Set<ReadableStreamDefaultController<UIMessageChunk>>;
  endedAt?: number;
  cleanupTimer?: ReturnType<typeof setTimeout>;
};

declare global {
  var __thumbgen_agent_runs: Map<string, AgentRun> | undefined;
}

function runs(): Map<string, AgentRun> {
  if (!globalThis.__thumbgen_agent_runs) globalThis.__thumbgen_agent_runs = new Map();
  return globalThis.__thumbgen_agent_runs;
}

function closeSubscribers(run: AgentRun): void {
  for (const subscriber of run.subscribers) {
    try {
      subscriber.close();
    } catch {
      // Already cancelled by its reader.
    }
  }
  run.subscribers.clear();
}

/** Tests only: forget every run and its timer. */
export function resetRunRegistry(): void {
  for (const run of runs().values()) {
    if (run.cleanupTimer) clearTimeout(run.cleanupTimer);
    closeSubscribers(run);
  }
  globalThis.__thumbgen_agent_runs = new Map();
}

export function getRun(conversationId: string): AgentRun | null {
  return runs().get(conversationId) ?? null;
}

/**
 * Registers a turn, or returns null when one already runs for the conversation.
 * Check and registration are synchronous (no await in between): two requests,
 * even from two tabs, can never both start a paid turn.
 */
export function startRun(conversationId: string, projectId: string): AgentRun | null {
  const registry = runs();
  const existing = registry.get(conversationId);
  if (existing?.status === "running") return null;
  if (existing?.cleanupTimer) clearTimeout(existing.cleanupTimer);
  const run: AgentRun = {
    conversationId,
    projectId,
    startedAt: Date.now(),
    status: "running",
    abort: new AbortController(),
    chunks: [],
    subscribers: new Set(),
  };
  registry.set(conversationId, run);
  return run;
}

/** Early exit before streamText (a 400): removed at once, never listed, no toast. */
export function discardRun(run: AgentRun): void {
  if (runs().get(run.conversationId) === run) runs().delete(run.conversationId);
  if (run.cleanupTimer) clearTimeout(run.cleanupTimer);
  run.status = "error";
  run.endedAt = Date.now();
  closeSubscribers(run);
}

function mergeDelta(previous: UIMessageChunk | undefined, chunk: UIMessageChunk): UIMessageChunk | null {
  if (!previous) return null;
  if (chunk.type === "text-delta" && previous.type === "text-delta" && previous.id === chunk.id) {
    return { ...previous, delta: previous.delta + chunk.delta };
  }
  if (chunk.type === "reasoning-delta" && previous.type === "reasoning-delta" && previous.id === chunk.id) {
    return { ...previous, delta: previous.delta + chunk.delta };
  }
  if (chunk.type === "tool-input-delta" && previous.type === "tool-input-delta" && previous.toolCallId === chunk.toolCallId) {
    return { ...previous, inputTextDelta: previous.inputTextDelta + chunk.inputTextDelta };
  }
  return null;
}

/** Buffers a chunk (merging deltas past the soft cap) and sends it to every subscriber. */
export function appendChunk(run: AgentRun, chunk: UIMessageChunk): void {
  if (run.status !== "running") return;
  const merged = run.chunks.length >= RUN_CHUNK_SOFT_CAP ? mergeDelta(run.chunks.at(-1), chunk) : null;
  if (merged) run.chunks[run.chunks.length - 1] = merged;
  else run.chunks.push(chunk);
  for (const subscriber of run.subscribers) {
    try {
      subscriber.enqueue(chunk);
    } catch {
      run.subscribers.delete(subscriber);
    }
  }
}

/**
 * The whole buffer from the start, then the live chunks, closed at the end of
 * the run. Cancelling it (Next cancels a response whose client left) only
 * unsubscribes: the run goes on.
 */
export function subscribe(run: AgentRun): ReadableStream<UIMessageChunk> {
  let own: ReadableStreamDefaultController<UIMessageChunk> | null = null;
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of run.chunks) controller.enqueue(chunk);
      if (run.status !== "running") {
        controller.close();
        return;
      }
      own = controller;
      run.subscribers.add(controller);
    },
    cancel() {
      if (own) run.subscribers.delete(own);
    },
  });
}

/** « Arrêter »: aborts the model call of a running run. */
export function stopRun(conversationId: string): boolean {
  const run = runs().get(conversationId);
  if (!run || run.status !== "running") return false;
  run.abort.abort();
  return true;
}

/**
 * Ends a run once (later calls are ignored), after its turn was saved: closes
 * the subscribers and removes the entry 5 minutes later — only if it is still
 * this run, never a newer one.
 */
export function finishRun(run: AgentRun, status: EndedRunStatus): void {
  if (run.status !== "running") return;
  run.status = status;
  run.endedAt = Date.now();
  closeSubscribers(run);
  const timer = setTimeout(() => {
    if (runs().get(run.conversationId) === run) runs().delete(run.conversationId);
  }, RUN_RETENTION_MS);
  timer.unref?.();
  run.cleanupTimer = timer;
}

/** A client request (request_user_image / request_user_sketch) still waiting for the user. */
export function hasPendingClientRequest(chunks: readonly UIMessageChunk[]): boolean {
  const pending = new Set<string>();
  for (const chunk of chunks) {
    if (chunk.type === "tool-input-available" && CLIENT_TOOL_NAMES.has(chunk.toolName)) pending.add(chunk.toolCallId);
    else if (chunk.type === "tool-output-available" || chunk.type === "tool-output-error" || chunk.type === "tool-output-denied") {
      pending.delete(chunk.toolCallId);
    }
  }
  return pending.size > 0;
}

export function listRuns(): RunSummary[] {
  return [...runs().values()].map((run) => ({
    conversationId: run.conversationId,
    projectId: run.projectId,
    startedAt: run.startedAt,
    status: run.status,
    endedAt: run.endedAt ?? null,
    pendingClientRequest: hasPendingClientRequest(run.chunks),
  }));
}

/** toUIMessageStream's onEnd outcome → the run's final status. */
export function runStatusForOutcome(status: "completed" | "failed" | "aborted" | "unknown"): EndedRunStatus {
  if (status === "aborted") return "stopped";
  if (status === "failed") return "error";
  return "done";
}

/**
 * Reads the model's UI stream to its end into the run, then ends the run —
 * exactly once, after onEnd/onAbort saved the turn (they run before the stream
 * closes). A read failure ends it as "error".
 */
export async function pumpRunStream(
  run: AgentRun,
  stream: ReadableStream<UIMessageChunk>,
  endStatus: () => EndedRunStatus,
): Promise<void> {
  let failed = false;
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      appendChunk(run, value);
    }
  } catch (error) {
    failed = true;
    console.error("[agent v2] run stream failed:", error);
  } finally {
    finishRun(run, failed ? "error" : endStatus());
  }
}
```

If `tsc` rejects `chunk.toolCallId` on `tool-output-denied` (check `node_modules/ai/dist/index.d.ts`, `type: 'tool-output-denied'`), keep the branch for the two other types and handle `tool-output-denied` only if it carries `toolCallId`.

- [ ] **Step 5: Run the tests, type-check, lint**

Run: `./node_modules/.bin/vitest run tests/agent/run-registry.test.ts` — expected: PASS (12 tests).
Run: `./node_modules/.bin/tsc --noEmit` — expected: exit 0.
Run: `./node_modules/.bin/eslint src/lib/agent/v2/run-types.ts src/lib/agent/v2/run-registry.ts tests/agent/run-registry.test.ts` — expected: no error.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/v2/run-types.ts src/lib/agent/v2/run-registry.ts tests/agent/run-registry.test.ts
git commit -m "feat(agent): in-process registry of agent runs" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Dev-only fake agent model and model resolution

**Files:**
- Create: `src/lib/agent/v2/fake-agent-model.ts`, `src/lib/agent/v2/agent-model.ts`
- Test: `tests/agent/fake-agent-model.test.ts`

**Interfaces:**
- Consumes: (Task 1) `startRun`, `stopRun`, `pumpRunStream`, `runStatusForOutcome`, `resetRunRegistry`, `EndedRunStatus`; `getOpenRouterProvider()` from `./openrouter-provider`.
- Produces: `isFakeAgentEnabled(): boolean`, `FAKE_CHUNK_DELAY_MS = 1_000`, `createFakeAgentModel({ chunkDelayMs? }): MockLanguageModelV3` (`fake-agent-model.ts`); `type ResolvedAgentModel = { model: LanguageModel; fake: boolean }`, `resolveAgentLanguageModel(modelId: string): ResolvedAgentModel | null` (`agent-model.ts`).

- [ ] **Step 1: Write the failing test**

Create `tests/agent/fake-agent-model.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { hasToolCall, isStepCount, streamText, tool, type UIMessageChunk } from "ai";
import { z } from "zod";
import { setSetting } from "@/lib/settings";
import { createFakeAgentModel, isFakeAgentEnabled } from "@/lib/agent/v2/fake-agent-model";
import { resolveAgentLanguageModel } from "@/lib/agent/v2/agent-model";
import { pumpRunStream, resetRunRegistry, runStatusForOutcome, startRun, stopRun } from "@/lib/agent/v2/run-registry";
import type { EndedRunStatus } from "@/lib/agent/v2/run-types";

// Local stand-ins for the two registry tools the fake script calls: no DB, no network.
const fakeTools = () => ({
  get_canvas_state: tool({
    inputSchema: z.object({ project_id: z.string() }),
    execute: async ({ project_id }) => `canvas ${project_id}`,
  }),
  finish_turn: tool({
    inputSchema: z.looseObject({ summary: z.string() }),
    execute: async () => ({ ok: true }),
  }),
});

const SYSTEM = "<project_id>proj_fake</project_id>";

let previousKeyEnv: string | undefined;
beforeEach(() => {
  resetRunRegistry();
  previousKeyEnv = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  setSetting("openrouterApiKey", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  if (previousKeyEnv !== undefined) process.env.OPENROUTER_API_KEY = previousKeyEnv;
  resetRunRegistry();
});

describe("isFakeAgentEnabled", () => {
  it("needs THUMBGEN_FAKE_AGENT outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("THUMBGEN_FAKE_AGENT", "");
    expect(isFakeAgentEnabled()).toBe(false);
    vi.stubEnv("THUMBGEN_FAKE_AGENT", "1");
    expect(isFakeAgentEnabled()).toBe(true);
  });

  it("is impossible in production, whatever the environment says", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("THUMBGEN_FAKE_AGENT", "1");
    expect(isFakeAgentEnabled()).toBe(false);
  });

  it("is never configured in the Docker image", () => {
    for (const file of ["Dockerfile", "docker-compose.yml"]) {
      expect(fs.readFileSync(path.join(process.cwd(), file), "utf8")).not.toContain("THUMBGEN_FAKE_AGENT");
    }
    expect(fs.readFileSync(path.join(process.cwd(), "Dockerfile"), "utf8")).toContain("ENV NODE_ENV=production");
  });
});

describe("resolveAgentLanguageModel", () => {
  it("returns the fake model without any key when enabled", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("THUMBGEN_FAKE_AGENT", "1");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const resolved = resolveAgentLanguageModel("anthropic/claude-sonnet-4.6");
    warn.mockRestore();
    expect(resolved?.fake).toBe(true);
  });

  it("returns null without a key in production even with THUMBGEN_FAKE_AGENT, and the real provider with a key", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("THUMBGEN_FAKE_AGENT", "1");
    expect(resolveAgentLanguageModel("anthropic/claude-sonnet-4.6")).toBeNull();
    setSetting("openrouterApiKey", "test-key");
    expect(resolveAgentLanguageModel("anthropic/claude-sonnet-4.6")?.fake).toBe(false);
  });
});

describe("fake agent model", () => {
  it("plays a two-step turn — reasoning + get_canvas_state, then text + finish_turn — with no network", async () => {
    const model = createFakeAgentModel({ chunkDelayMs: 0 });
    const result = streamText({
      model,
      system: SYSTEM,
      messages: [{ role: "user", content: "Salut" }],
      tools: fakeTools(),
      stopWhen: [isStepCount(5), hasToolCall("finish_turn")],
    });
    const chunks: UIMessageChunk[] = [];
    for await (const chunk of result.toUIMessageStream()) chunks.push(chunk);
    const calls = chunks.flatMap((c) => (c.type === "tool-input-available" ? [c] : []));
    expect(calls.map((c) => c.toolName)).toEqual(["get_canvas_state", "finish_turn"]);
    expect(calls[0].input).toEqual({ project_id: "proj_fake" });
    expect(chunks.some((c) => c.type === "reasoning-delta")).toBe(true);
    expect(chunks.some((c) => c.type === "text-delta")).toBe(true);
    expect(model.doStreamCalls).toHaveLength(2);
    expect(chunks.at(-1)?.type).toBe("finish");
  });

  it("saves the turn (onEnd) while the run is still running, then ends it as done", async () => {
    const run = startRun("conv-order", "proj_fake")!;
    const statusAtSave: string[] = [];
    const result = streamText({
      model: createFakeAgentModel({ chunkDelayMs: 0 }),
      system: SYSTEM,
      messages: [{ role: "user", content: "Salut" }],
      tools: fakeTools(),
      stopWhen: [isStepCount(5), hasToolCall("finish_turn")],
      abortSignal: run.abort.signal,
      onEnd: () => {
        statusAtSave.push(run.status);
      },
    });
    let endStatus: EndedRunStatus = "done";
    await pumpRunStream(
      run,
      result.toUIMessageStream({ onEnd: ({ outcome }) => { endStatus = runStatusForOutcome(outcome.status); } }),
      () => endStatus,
    );
    expect(statusAtSave).toEqual(["running"]);
    expect(run.status).toBe("done");
  });

  it("stops on the run's abort: onAbort saves first, the stream ends with an abort chunk, the run is stopped", async () => {
    const run = startRun("conv-stop", "proj_fake")!;
    const statusAtAbort: string[] = [];
    const result = streamText({
      model: createFakeAgentModel({ chunkDelayMs: 20 }),
      system: SYSTEM,
      messages: [{ role: "user", content: "Salut" }],
      tools: fakeTools(),
      stopWhen: [isStepCount(5), hasToolCall("finish_turn")],
      abortSignal: run.abort.signal,
      onAbort: () => {
        statusAtAbort.push(run.status);
      },
    });
    let endStatus: EndedRunStatus = "done";
    const pumping = pumpRunStream(
      run,
      result.toUIMessageStream({ onEnd: ({ outcome }) => { endStatus = runStatusForOutcome(outcome.status); } }),
      () => endStatus,
    );
    await vi.waitFor(() => expect(run.chunks.some((c) => c.type === "reasoning-delta")).toBe(true));
    expect(stopRun("conv-stop")).toBe(true);
    await pumping;
    expect(statusAtAbort).toEqual(["running"]);
    expect(run.chunks.at(-1)?.type).toBe("abort");
    expect(run.status).toBe("stopped");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/agent/fake-agent-model.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/agent/v2/fake-agent-model"`.

- [ ] **Step 3: The fake model**

Create `src/lib/agent/v2/fake-agent-model.ts`:

```ts
import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3CallOptions, LanguageModelV3StreamPart } from "@ai-sdk/provider";

/**
 * DEV ONLY (chantier F1): a scripted, slow agent turn with no network call, so
 * the background-run flow can be checked in a browser without paying a model.
 * Enabled by THUMBGEN_FAKE_AGENT on a dev server; impossible in production.
 */

/** Delay between two chunks of the script (≈ 22 s for the whole turn). */
export const FAKE_CHUNK_DELAY_MS = 1_000;

export function isFakeAgentEnabled(): boolean {
  // Literal `process.env.NODE_ENV`: Next inlines it at build time, so a
  // production bundle compiles this to `return false` whatever the env says.
  if (process.env.NODE_ENV === "production") return false;
  return Boolean(process.env.THUMBGEN_FAKE_AGENT);
}

const USAGE = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

function abortError(): Error {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function projectIdOf(options: LanguageModelV3CallOptions): string {
  for (const message of options.prompt) {
    if (message.role !== "system") continue;
    const match = message.content.match(/<project_id>([^<]+)<\/project_id>/);
    if (match) return match[1];
  }
  return "";
}

function script(options: LanguageModelV3CallOptions): LanguageModelV3StreamPart[] {
  const stamp = Date.now().toString(36);
  const finish: LanguageModelV3StreamPart = { type: "finish", usage: USAGE, finishReason: { unified: "tool-calls", raw: "tool-calls" } };
  // Second step: the previous step's tool result is the last prompt message.
  if (options.prompt.at(-1)?.role === "tool") {
    const id = `fake-text-${stamp}`;
    return [
      { type: "stream-start", warnings: [] },
      { type: "text-start", id },
      ...["Tour ", "simulé : ", "aucun ", "modèle ", "n'a ", "été ", "appelé."].map((delta) => ({ type: "text-delta" as const, id, delta })),
      { type: "text-end", id },
      {
        type: "tool-call",
        toolCallId: `fake-finish-${stamp}`,
        toolName: "finish_turn",
        input: JSON.stringify({ summary: "Tour simulé terminé, sans appel de modèle.", results: [], next_actions: [] }),
      },
      finish,
    ];
  }
  const id = `fake-reasoning-${stamp}`;
  return [
    { type: "stream-start", warnings: [] },
    { type: "reasoning-start", id },
    ...["Je ", "regarde ", "le ", "canvas ", "avant ", "de ", "répondre."].map((delta) => ({ type: "reasoning-delta" as const, id, delta })),
    { type: "reasoning-end", id },
    {
      type: "tool-call",
      toolCallId: `fake-canvas-${stamp}`,
      toolName: "get_canvas_state",
      input: JSON.stringify({ project_id: projectIdOf(options) }),
    },
    finish,
  ];
}

export function createFakeAgentModel({ chunkDelayMs = FAKE_CHUNK_DELAY_MS }: { chunkDelayMs?: number } = {}) {
  return new MockLanguageModelV3({
    provider: "thumbgen-fake",
    modelId: "fake-agent",
    doStream: async (options) => {
      const parts = script(options);
      let index = 0;
      return {
        stream: new ReadableStream<LanguageModelV3StreamPart>({
          async pull(controller) {
            if (index >= parts.length) {
              controller.close();
              return;
            }
            // Rejects with an AbortError on stop: streamText then emits its `abort` chunk.
            if (index > 0) await sleep(chunkDelayMs, options.abortSignal);
            controller.enqueue(parts[index++]);
          },
        }),
      };
    },
  });
}
```

`@ai-sdk/provider` is a dependency of `ai` (hoisted in `node_modules`); the import is type-only. If `tsc` cannot resolve it, replace both types with `Parameters<InstanceType<typeof MockLanguageModelV3>["doStream"]>[0]` and a local `type StreamPart = Record<string, unknown>` cast with `as never` at `enqueue`.

- [ ] **Step 4: Model resolution**

Create `src/lib/agent/v2/agent-model.ts`:

```ts
import type { LanguageModel } from "ai";
import { getOpenRouterProvider } from "./openrouter-provider";
import { createFakeAgentModel, isFakeAgentEnabled } from "./fake-agent-model";

export type ResolvedAgentModel = { model: LanguageModel; fake: boolean };

/**
 * The agent's language model for one turn: the dev-only fake model when
 * THUMBGEN_FAKE_AGENT is set outside production, else OpenRouter, else null
 * (no key: the chat route answers its existing 400).
 */
export function resolveAgentLanguageModel(modelId: string): ResolvedAgentModel | null {
  if (isFakeAgentEnabled()) {
    console.warn("[agent v2] THUMBGEN_FAKE_AGENT: simulated model, no real call");
    return { model: createFakeAgentModel(), fake: true };
  }
  const provider = getOpenRouterProvider();
  return provider ? { model: provider(modelId), fake: false } : null;
}
```

- [ ] **Step 5: Run the tests, type-check, lint**

Run: `./node_modules/.bin/vitest run tests/agent/fake-agent-model.test.ts` — expected: PASS (8 tests). If the abort test ends with `error` instead of `abort`, check that `sleep` rejects with an `Error` whose `name` is `"AbortError"` (streamText's `isAbortError`) — do not weaken the assertion.
Run: `./node_modules/.bin/tsc --noEmit` — expected: exit 0.
Run: `./node_modules/.bin/eslint src/lib/agent/v2/fake-agent-model.ts src/lib/agent/v2/agent-model.ts tests/agent/fake-agent-model.test.ts` — expected: no error.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/v2/fake-agent-model.ts src/lib/agent/v2/agent-model.ts tests/agent/fake-agent-model.test.ts
git commit -m "feat(agent): dev-only fake agent model, impossible in production" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Chat route backed by a run

**Files:**
- Modify: `src/lib/agent/v2/route-handler.ts` (imports + `postV2` replaced; helpers above it unchanged)
- Create: `tests/agent/helpers/chat-route.ts`, `tests/agent/v2-route-handler-runs.test.ts`
- Modify (tests): `tests/agent/v2-route-handler.test.ts`, `tests/agent/v2-route-handler-retry.test.ts`, `tests/agent/v2-route-handler-settings.test.ts`, `tests/agent/finish-turn-wiring.test.ts`

**Interfaces:**
- Consumes: (Task 1) `startRun`, `discardRun`, `subscribe`, `pumpRunStream`, `runStatusForOutcome`, `getRun`, `listRuns`, `stopRun`, `resetRunRegistry`, `AGENT_BUSY_MESSAGE`, `EndedRunStatus`; (Task 2) `resolveAgentLanguageModel`; `getConversation` from `@/lib/agent/conversation/store`; `rejectNonJsonRequest` from `@/lib/youtube/route-errors`; `createUIMessageStreamResponse` from `ai`.
- Produces: `postV2(req)` — 415 without JSON, 400 « Missing conversation_id », 400 key, 404 « Conversation introuvable », 409 `AGENT_BUSY_MESSAGE` (text/plain), else a UI-message SSE response subscribed to the run. Test helpers: `chatRequest(body, { signal?, contentType? })`, `fakeStreamResult({ autoEnd? })` (`{ options, cancelled, toUIMessageStream, push, end, fail }`), `waitForRunEnd(conversationId)`.

- [ ] **Step 1: The test helper**

Create `tests/agent/helpers/chat-route.ts`:

```ts
import { vi } from "vitest";
import type { UIMessageChunk } from "ai";
import { listRuns } from "@/lib/agent/v2/run-registry";

/** POST /api/agent/chat as the browser sends it (JSON). contentType: null sends a text/plain body. */
export function chatRequest(body: unknown, init: { signal?: AbortSignal; contentType?: string | null } = {}) {
  const headers: Record<string, string> = {};
  if (init.contentType !== null) headers["Content-Type"] = init.contentType ?? "application/json";
  return new Request("http://localhost/api/agent/chat", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: init.signal,
  }) as never;
}

type Outcome = { status: "completed" | "failed" | "aborted" };
type UIStreamOptions = {
  onError?: (error: unknown) => string;
  onEnd?: (event: { outcome: Outcome }) => void | Promise<void>;
};

/**
 * What postV2 uses of a streamText() result: toUIMessageStream(). The test
 * drives the stream (push / end / fail); end() calls the route's onEnd first,
 * like the real SDK does before closing the stream.
 */
export function fakeStreamResult({ autoEnd = false }: { autoEnd?: boolean } = {}) {
  let controller: ReadableStreamDefaultController<UIMessageChunk> | null = null;
  const fake = {
    options: {} as UIStreamOptions,
    cancelled: false,
    toUIMessageStream(options?: UIStreamOptions) {
      fake.options = options ?? {};
      return new ReadableStream<UIMessageChunk>({
        start(c) {
          controller = c;
          c.enqueue({ type: "start" });
          if (autoEnd) queueMicrotask(() => void fake.end());
        },
        cancel() {
          fake.cancelled = true;
        },
      });
    },
    push(chunk: UIMessageChunk) {
      controller?.enqueue(chunk);
    },
    async end(outcome: Outcome = { status: "completed" }) {
      await fake.options.onEnd?.({ outcome });
      controller?.close();
    },
    fail(error: Error) {
      controller?.error(error);
    },
  };
  return fake;
}

/** Waits until the conversation has no running run (the route pumps the stream asynchronously). */
export async function waitForRunEnd(conversationId: string): Promise<void> {
  await vi.waitFor(() => {
    if (listRuns().some((run) => run.conversationId === conversationId && run.status === "running")) {
      throw new Error(`run ${conversationId} still running`);
    }
  });
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/agent/v2-route-handler-runs.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

const appendMessageMock = vi.fn((..._args: unknown[]) => undefined);
const listMessagesMock = vi.fn((..._args: unknown[]) => [] as unknown[]);
const getConversationMock = vi.fn(
  (id: string) => ({ id, project_id: "p1", title: "t", created_at: "", updated_at: "" }) as unknown,
);
vi.mock("@/lib/agent/conversation/store", () => ({
  appendMessage: (...args: unknown[]) => appendMessageMock(...args),
  listMessages: (...args: unknown[]) => listMessagesMock(...args),
  getConversation: (id: string) => getConversationMock(id),
}));

const persistAssistantTurnMock = vi.fn((..._args: unknown[]) => undefined);
vi.mock("@/lib/agent/v2/persist-turn", () => ({
  persistAssistantTurn: (...args: unknown[]) => persistAssistantTurnMock(...args),
}));

const generateAndPersistTitleMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@/lib/agent/conversation/auto-title", () => ({
  generateAndPersistTitle: (...args: unknown[]) => generateAndPersistTitleMock(...args),
}));

vi.mock("@/lib/agent/tools/_helpers/image-source", () => ({
  resolveImageSource: async (..._args: unknown[]) => {
    throw new Error("Image not found: stored:nope");
  },
}));

// Never call a real model: streamText is replaced, everything else in "ai" stays real.
const streamTextMock = vi.fn();
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, streamText: (opts: unknown) => streamTextMock(opts) };
});

import { setSetting } from "@/lib/settings";
import { getRun, listRuns, resetRunRegistry, stopRun } from "@/lib/agent/v2/run-registry";
import { AGENT_BUSY_MESSAGE } from "@/lib/agent/v2/run-types";
import { chatRequest, fakeStreamResult, waitForRunEnd } from "./helpers/chat-route";

type StreamArgs = {
  system: string;
  abortSignal: AbortSignal;
  onEnd: (e: { responseMessages: unknown[]; usage: Record<string, number>; finishReason: string }) => Promise<void>;
};
const streamArgs = () => streamTextMock.mock.calls.at(-1)![0] as StreamArgs;

const userTurn = (conversationId: string, text = "Salut", extra: Record<string, unknown> = {}) => ({
  conversation_id: conversationId,
  project_id: "ignored-by-the-server",
  messages: [{ role: "user", parts: [{ type: "text", text }] }],
  canvas_snapshot: { nodes: [], edges: [] },
  ...extra,
});

async function post(body: unknown, init?: Parameters<typeof chatRequest>[1]) {
  const { postV2 } = await import("@/lib/agent/v2/route-handler");
  return postV2(chatRequest(body, init));
}

describe("postV2 runs the turn in the background", () => {
  let fake: ReturnType<typeof fakeStreamResult>;

  beforeEach(() => {
    resetRunRegistry();
    setSetting("openrouterApiKey", "test-key");
    appendMessageMock.mockClear();
    listMessagesMock.mockReset();
    listMessagesMock.mockReturnValue([]);
    getConversationMock.mockClear();
    persistAssistantTurnMock.mockReset();
    generateAndPersistTitleMock.mockClear();
    fake = fakeStreamResult();
    streamTextMock.mockReset();
    streamTextMock.mockImplementation(() => fake);
  });

  it("answers 415 to a non-JSON request before reading anything", async () => {
    const res = await post(userTurn("c-415"), { contentType: null });
    expect(res.status).toBe(415);
    expect(getConversationMock).not.toHaveBeenCalled();
    expect(appendMessageMock).not.toHaveBeenCalled();
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown or deleted conversation", async () => {
    getConversationMock.mockReturnValueOnce(null);
    const res = await post(userTurn("c-404"));
    expect(res.status).toBe(404);
    expect(getRun("c-404")).toBeNull();
    expect(appendMessageMock).not.toHaveBeenCalled();
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("takes the project from the stored conversation, not from the body", async () => {
    getConversationMock.mockReturnValueOnce({ id: "c-proj", project_id: "proj_real", title: "t", created_at: "", updated_at: "" });
    await post(userTurn("c-proj"));
    expect(streamArgs().system).toContain("<project_id>proj_real</project_id>");
    expect(listRuns()[0]).toMatchObject({ conversationId: "c-proj", projectId: "proj_real", status: "running" });
  });

  it("keeps the model call alive when the browser disconnects", async () => {
    const browser = new AbortController();
    const res = await post(userTurn("c-leave"), { signal: browser.signal });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    browser.abort();
    await res.body!.cancel();
    expect(streamArgs().abortSignal.aborted).toBe(false);
    fake.push({ type: "text-delta", id: "t", delta: "toujours là" });
    expect(fake.cancelled).toBe(false);
    await fake.end();
    await waitForRunEnd("c-leave");
    const run = getRun("c-leave")!;
    expect(run.status).toBe("done");
    expect(run.chunks).toContainEqual({ type: "text-delta", id: "t", delta: "toujours là" });
  });

  it("answers 409 while a turn runs, without writing, titling or calling the model", async () => {
    expect((await post(userTurn("c-busy", "Premier"))).status).toBe(200);
    const listCalls = listMessagesMock.mock.calls.length;
    const res = await post(userTurn("c-busy", "Second"));
    expect(res.status).toBe(409);
    expect(await res.text()).toBe(AGENT_BUSY_MESSAGE);
    expect(appendMessageMock).toHaveBeenCalledTimes(1);
    expect(listMessagesMock.mock.calls.length).toBe(listCalls);
    expect(generateAndPersistTitleMock).toHaveBeenCalledTimes(1);
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });

  it("frees the conversation on every 400 before streamText", async () => {
    const attachment = await post(userTurn("c-400", "Regarde", { attachments: [{ type: "image", source: "stored:nope" }] }));
    expect(attachment.status).toBe(400);
    expect(getRun("c-400")).toBeNull();

    const continuation = await post({
      conversation_id: "c-400",
      messages: [{ role: "assistant", parts: [{ type: "tool-list_logos", state: "output-available", toolCallId: "x", output: {} }] }],
    });
    expect(continuation.status).toBe(400);
    expect(getRun("c-400")).toBeNull();

    listMessagesMock.mockReturnValue([{ id: "old", role: "assistant", content_json: JSON.stringify([{ type: "text", text: "v1" }]) }, { id: "new", role: "user", content_json: "[]" }]);
    const oldFormat = await post(userTurn("c-400"));
    expect(oldFormat.status).toBe(400);
    expect(getRun("c-400")).toBeNull();

    listMessagesMock.mockReturnValue([]);
    expect((await post(userTurn("c-400"))).status).toBe(200);
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });

  it("does not end the run on a tool-error the turn recovers from", async () => {
    await post(userTurn("c-tool-error"));
    fake.push({ type: "tool-output-error", toolCallId: "t1", errorText: "YouTube a refusé" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(fake.options.onError?.(new Error("YouTube a refusé"))).toBe("An error occurred.");
    errorSpy.mockRestore();
    await Promise.resolve();
    expect(getRun("c-tool-error")!.status).toBe("running");
    fake.push({ type: "text-delta", id: "t", delta: "J'ai contourné." });
    await fake.end();
    await waitForRunEnd("c-tool-error");
    expect(getRun("c-tool-error")!.status).toBe("done");
    expect(persistAssistantTurnMock).not.toHaveBeenCalled();
  });

  it("ends the run as stopped, error or done, after the turn is saved", async () => {
    const statusAtSave: Array<string | undefined> = [];
    persistAssistantTurnMock.mockImplementation((info) => {
      statusAtSave.push(getRun((info as { conversationId: string }).conversationId)?.status);
    });

    await post(userTurn("c-done"));
    await streamArgs().onEnd({ responseMessages: [{ role: "assistant", content: [] }], usage: { inputTokens: 1, outputTokens: 1 }, finishReason: "stop" });
    await fake.end({ status: "completed" });
    await waitForRunEnd("c-done");
    expect(getRun("c-done")!.status).toBe("done");

    fake = fakeStreamResult();
    await post(userTurn("c-failed"));
    await fake.end({ status: "failed" });
    await waitForRunEnd("c-failed");
    expect(getRun("c-failed")!.status).toBe("error");
    expect(persistAssistantTurnMock).toHaveBeenLastCalledWith(expect.objectContaining({ conversationId: "c-failed", interrupted: true, finishReason: "error" }));

    fake = fakeStreamResult();
    await post(userTurn("c-stopped"));
    expect(stopRun("c-stopped")).toBe(true);
    expect(streamArgs().abortSignal.aborted).toBe(true);
    await fake.end({ status: "aborted" });
    await waitForRunEnd("c-stopped");
    expect(getRun("c-stopped")!.status).toBe("stopped");

    fake = fakeStreamResult();
    await post(userTurn("c-broken"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fake.fail(new Error("socket closed"));
    await waitForRunEnd("c-broken");
    errorSpy.mockRestore();
    expect(getRun("c-broken")!.status).toBe("error");

    expect(statusAtSave).toEqual(["running", "running"]);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/agent/v2-route-handler-runs.test.ts`
Expected: FAIL — the 415 test gets 400 (no JSON check yet), the others fail on `toUIMessageStream`/`getRun`.

- [ ] **Step 4: Rewrite the route's imports and `postV2`**

In `src/lib/agent/v2/route-handler.ts`, replace the import block (from `import { NextRequest } from "next/server";` to `import { startGcLoop } from "@/lib/agent/gc";`) with:

```ts
import { NextRequest } from "next/server";
import { streamText, isStepCount, hasToolCall, createUIMessageStreamResponse, type ModelMessage } from "ai";
import { resolveAgentLanguageModel } from "./agent-model";
import { buildAiSdkTools } from "./tool-adapter";
import { V2_CLIENT_TOOLS } from "./browser-client-tools";
import { webSearchProviderOptions } from "./web-search-tool";
import { persistAssistantTurn } from "./persist-turn";
import { discardRun, pumpRunStream, runStatusForOutcome, startRun, subscribe } from "./run-registry";
import { AGENT_BUSY_MESSAGE, type EndedRunStatus } from "./run-types";
import { FINISH_TURN_TOOL_NAME } from "@/lib/agent/finish-turn";
import { buildSystemMessages } from "@/lib/agent/system-prompt";
import { appendMessage, getConversation, listMessages } from "@/lib/agent/conversation/store";
import { generateAndPersistTitle } from "@/lib/agent/conversation/auto-title";
import { resolveImageSource } from "@/lib/agent/tools/_helpers/image-source";
import { getTypedSettings } from "@/lib/settings";
import { getModelById } from "@/lib/agent/models";
import { loadAgentPromptPrefs } from "@/lib/agent/prompt-prefs";
import { startGcLoop } from "@/lib/agent/gc";
import { rejectNonJsonRequest } from "@/lib/youtube/route-errors";
```

Keep everything between the imports and `export async function postV2` unchanged (`normalizeStaleToolResultFileData`, `CLIENT_TOOL_NAMES`, `collectResolvedToolCallIds`, `findAbandonedClientToolCalls`, `StoredRow`, `storedUserText`, `isAbandonedSkipRow`, `findRetriedUserRowIndex`). Replace `export async function postV2 … }` (to the end of the file) with the code below. It keeps the preparation logic of the current function line for line; the differences are: JSON check, conversation lookup, `startRun` before any read/write, `discardRun` on every early 400, `projectId` from the conversation, no auto-title with the fake model, `abortSignal: run.abort.signal`, the server-side pump and the subscriber response. If `git diff 2815807 -- src/lib/agent/v2/route-handler.ts` shows a change inside the preparation, carry it over.

```ts
type ChatRequestBody = {
  conversation_id?: string;
  /** Ignored: the project comes from the stored conversation. */
  project_id?: string;
  // The wire shape useChat/DefaultChatTransport sends: the full UIMessage[] the
  // client holds. Only the LAST entry (the new turn) is read; prior history is
  // rebuilt from the DB. `attachments` carries this app's own `stored:<id>`
  // references (AttachButton.tsx / resolveImageSource), not AI SDK file parts.
  messages?: Array<{
    role: string;
    parts?: Array<{
      type: string;
      text?: string;
      // Tool parts only — read on the tool-continuation path, where the last
      // message is the ASSISTANT message whose client tool was just resolved.
      toolCallId?: string;
      state?: string;
      output?: unknown;
      errorText?: string;
    }>;
  }>;
  attachments?: Array<{ type: "image"; source: string }>;
  canvas_snapshot?: unknown;
};

export async function postV2(req: NextRequest): Promise<Response> {
  // A cross-site form or no-cors fetch cannot send JSON without a preflight:
  // another site open in the browser can never start a paid turn.
  const notJson = rejectNonJsonRequest(req);
  if (notJson) return notJson;

  const body = (await req.json().catch(() => null)) as ChatRequestBody | null;
  if (!body?.conversation_id) {
    return new Response("Missing conversation_id", { status: 400 });
  }

  const settings = getTypedSettings();
  const modelId = settings.agentModel;
  const agentModel = resolveAgentLanguageModel(modelId);
  if (!agentModel) {
    return new Response(
      "Clé OpenRouter non configurée. Ajoute-la dans Réglages → Connexions des modèles.",
      { status: 400 },
    );
  }
  const modelInfo = getModelById(modelId);
  const conversationId = body.conversation_id;

  const conversation = getConversation(conversationId);
  if (!conversation) return new Response("Conversation introuvable", { status: 404 });
  const projectId = conversation.project_id;

  // One turn per conversation. Checked and registered synchronously, BEFORE any
  // read or write of messages, the auto-title and the model call: a second
  // request (another tab, a double click) can never start a second paid turn.
  const run = startRun(conversationId, projectId);
  if (!run) {
    return new Response(AGENT_BUSY_MESSAGE, { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  let priorMessages: unknown[];
  let systemText: string;
  let userParts: Array<
    { type: "text"; text: string } | { type: "file"; mediaType: string; data: string }
  >;

  // `body.messages.at(-1)` is a fresh user turn for a normal send, but NOT for
  // the auto-continuation sendAutomaticallyWhen fires once PendingUiAction.tsx
  // resolves a client tool: there it is the ASSISTANT message whose tool part
  // was just resolved (see the tool-continuation branch below).
  const lastMessage = body.messages?.at(-1);
  const isNewUserTurn = lastMessage?.role === "user";
  // A retry reuses its stored user row (index in the rows read before this
  // turn), so the model and the DB never see the message twice; -1 otherwise.
  let retriedUserRowIndex = -1;

  try {
    userParts = [];
    if (isNewUserTurn) {
      const lastMessageText = (lastMessage?.parts ?? [])
        .filter((p): p is { type: "text"; text: string } => p.type === "text" && typeof p.text === "string")
        .map((p) => p.text)
        .join("");

      if (lastMessageText) userParts.push({ type: "text", text: lastMessageText });
      for (const a of body.attachments ?? []) {
        if (a.type !== "image") continue;
        const img = await resolveImageSource(a.source);
        userParts.push({ type: "file", mediaType: img.mimeType, data: img.bytes.toString("base64") });
      }

      // Checked BEFORE appending the new user row: an empty conversation gets
      // exactly one auto-title attempt, on its first turn.
      const priorRowsForThisTurn = listMessages(conversationId);
      const isFirstTurn = priorRowsForThisTurn.length === 0;
      if ((body.attachments ?? []).length === 0) {
        retriedUserRowIndex = findRetriedUserRowIndex(priorRowsForThisTurn, lastMessageText);
      }

      // Auto-resolve a pending request_user_image/request_user_sketch the user is
      // sending a new message past — see findAbandonedClientToolCalls. Persisted
      // BEFORE the new user row so tool-call/tool-result pairing stays valid.
      const abandoned = findAbandonedClientToolCalls(priorRowsForThisTurn);
      if (abandoned.length > 0) {
        appendMessage({
          conversation_id: conversationId,
          role: "assistant",
          content_json: JSON.stringify([
            {
              role: "tool",
              content: abandoned.map((a) => ({
                type: "tool-result" as const,
                toolCallId: a.toolCallId,
                toolName: a.toolName,
                output: { type: "json" as const, value: { skipped: true, reason: "abandoned" } },
              })),
            },
          ]),
          interrupted: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
          cost_estimate: 0,
        });
      }

      if (retriedUserRowIndex === -1) {
        appendMessage({
          conversation_id: conversationId,
          role: "user",
          content_json: JSON.stringify([{ role: "user", content: userParts }]),
          interrupted: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
          cost_estimate: 0,
        });
      }

      // Fire-and-forget. Never with the fake model: the title is a model call.
      if (isFirstTurn && lastMessageText.trim() && settings.agentAutoTitle && !agentModel.fake) {
        void generateAndPersistTitle(conversationId, lastMessageText);
      }
    } else {
      // Tool-continuation: persist the client's resolution as its own
      // `role:"tool"` row (rowsToUIMessages folds it back by toolCallId), in the
      // wrapped `{type:"json"|"error-text", value}` output form modelMessageSchema
      // requires. The server is the dedup boundary: a resolved part whose
      // toolCallId already has a persisted result is never written twice.
      const alreadyPersistedToolCallIds = collectResolvedToolCallIds(listMessages(conversationId));

      const resolvedClientToolParts = (lastMessage?.parts ?? []).filter(
        (p): p is { type: string; toolCallId: string; state: string; output?: unknown; errorText?: string } =>
          (p.type === "tool-request_user_image" || p.type === "tool-request_user_sketch") &&
          typeof p.toolCallId === "string" &&
          (p.state === "output-available" || p.state === "output-error") &&
          !alreadyPersistedToolCallIds.has(p.toolCallId),
      );
      if (resolvedClientToolParts.length > 0) {
        const toolResultMessage = {
          role: "tool" as const,
          content: resolvedClientToolParts.map((p) => ({
            type: "tool-result" as const,
            toolCallId: p.toolCallId,
            toolName: p.type.slice("tool-".length),
            output:
              p.state === "output-error"
                ? { type: "error-text" as const, value: p.errorText ?? "error" }
                : { type: "json" as const, value: p.output ?? null },
          })),
        };
        appendMessage({
          conversation_id: conversationId,
          role: "assistant",
          content_json: JSON.stringify([toolResultMessage]),
          interrupted: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
          cost_estimate: 0,
        });
      } else {
        // Defense-in-depth: a continuation with nothing to resume must never
        // re-run the model for up to agentMaxSteps steps.
        discardRun(run);
        return new Response(
          "No client-tool resolution found in this continuation; nothing to resume.",
          { status: 400 },
        );
      }
    }

    // Every prior row must already be ModelMessage-shaped (a `role` key); an old
    // v1 row gets a clear 400 instead of an opaque provider error. On a normal
    // send the row just appended is re-added from `userParts`; on a retry the
    // rows up to the stored user row are the prompt.
    const priorRows =
      retriedUserRowIndex !== -1
        ? listMessages(conversationId).slice(0, retriedUserRowIndex + 1)
        : isNewUserTurn
          ? listMessages(conversationId).slice(0, -1)
          : listMessages(conversationId);
    priorMessages = [];
    for (const row of priorRows) {
      const parsed: unknown = JSON.parse(row.content_json);
      const looksMigrated =
        Array.isArray(parsed) &&
        parsed.every((m) => typeof m === "object" && m !== null && "role" in (m as Record<string, unknown>));
      if (!looksMigrated) {
        discardRun(run);
        return new Response(
          "This conversation has messages in the old (pre-migration) format and can't " +
            "be continued on the new agent backend. Run scripts/migrate-chat-messages-to-uimessage.ts " +
            "first, then retry.",
          { status: 400 },
        );
      }
      priorMessages.push(...normalizeStaleToolResultFileData(parsed as unknown[]));
    }

    const systemBlocks = buildSystemMessages(body.canvas_snapshot, projectId, loadAgentPromptPrefs());
    systemText = systemBlocks.map((b) => b.text).join("\n\n");
  } catch (e) {
    discardRun(run);
    return new Response(`Failed to prepare the conversation: ${(e as Error).message}`, { status: 400 });
  }

  // Guards the stream-level failure fallback below against double-persisting:
  // set at the top of streamText's own onEnd/onAbort (a failure after some
  // output fires both the per-chunk onError and onEnd for the same turn).
  let turnPersisted = false;

  const result = streamText({
    model: agentModel.model,
    system: systemText,
    messages: (isNewUserTurn && retriedUserRowIndex === -1
      ? [...priorMessages, { role: "user", content: userParts }]
      : [...priorMessages]) as ModelMessage[],
    tools: { ...buildAiSdkTools(), ...V2_CLIENT_TOOLS },
    // finish_turn closes the turn: stop right after its step instead of
    // paying for one more model call that would only restate the answer.
    stopWhen: [isStepCount(settings.agentMaxSteps), hasToolCall(FINISH_TURN_TOOL_NAME)],
    // ONLY the run's own signal (« Arrêter » → POST …/stop). The request's
    // signal is deliberately not passed: leaving the page must not stop the turn.
    abortSignal: run.abort.signal,
    providerOptions: {
      openrouter: {
        ...(modelInfo?.supportsThinking ? { reasoning: { effort: settings.agentReasoningEffort } } : {}),
        ...webSearchProviderOptions(),
      },
    },
    // `responseMessages` is the aggregate across every step (not the deprecated
    // `response.messages`, last step only); `usage` is the whole-turn total.
    onEnd: async ({ responseMessages, usage, finishReason }) => {
      turnPersisted = true;
      persistAssistantTurn({
        conversationId,
        responseMessages,
        totalUsage: usage,
        finishReason,
        modelInfo,
      });
    },
    // Fires instead of onEnd on abort, before streamText emits its `abort`
    // chunk: saves the partial turn as interrupted, rebuilt from the steps.
    onAbort: ({ steps }) => {
      turnPersisted = true;
      const totalUsage = steps.reduce(
        (acc, s) => ({
          inputTokens: acc.inputTokens + (s.usage.inputTokens ?? 0),
          outputTokens: acc.outputTokens + (s.usage.outputTokens ?? 0),
        }),
        { inputTokens: 0, outputTokens: 0 },
      );
      persistAssistantTurn({
        conversationId,
        responseMessages: steps.flatMap((s) => s.response.messages),
        totalUsage,
        finishReason: "aborted",
        interrupted: true,
        modelInfo,
      });
    },
  });

  let endStatus: EndedRunStatus = "done";
  const uiStream = result.toUIMessageStream({
    // Per-chunk and log-only: it also fires for a routine `tool-error` part the
    // turn recovers from, so it must neither persist nor end the run.
    onError: (error) => {
      console.error("[agent v2] stream error:", error);
      return "An error occurred.";
    },
    // Called once for the whole turn, before the stream closes (so before
    // finishRun). A provider failure reaches neither streamText onEnd nor
    // onAbort: without this marker the user's message would stay unanswered.
    onEnd: ({ outcome }) => {
      endStatus = runStatusForOutcome(outcome.status);
      if (outcome.status !== "failed" || turnPersisted) return;
      try {
        persistAssistantTurn({
          conversationId,
          responseMessages: [],
          totalUsage: { inputTokens: 0, outputTokens: 0 },
          finishReason: "error",
          interrupted: true,
          modelInfo,
        });
      } catch (e) {
        // Never throw from here: `ai` would rethrow and cut the stream.
        console.error("[agent v2] failed to persist error marker:", e);
      }
    },
  });

  // The server itself reads the turn to its end (not awaited by the response):
  // the model keeps running whatever happens to this HTTP request.
  void pumpRunStream(run, uiStream, () => endStatus);

  // The sender is just the first subscriber, like any reconnection. If Next
  // cancels this response, only the subscription goes away.
  return createUIMessageStreamResponse({ stream: subscribe(run) });
}
```

- [ ] **Step 5: Run the new test**

Run: `./node_modules/.bin/vitest run tests/agent/v2-route-handler-runs.test.ts` — expected: PASS (8 tests).

- [ ] **Step 6: Migrate the existing route tests**

The four files below still send requests without `Content-Type` and mock `toUIMessageStreamResponse` / `consumeStream`. Apply exactly these edits.

`tests/agent/v2-route-handler.test.ts`:
1. In the `vi.mock("@/lib/agent/conversation/store", …)` factory add `getConversation: (id: string) => ({ id, project_id: "p1", title: "t", created_at: "", updated_at: "" }),`.
2. After the persist-turn mock add:
   ```ts
   vi.mock("@/lib/agent/conversation/auto-title", () => ({ generateAndPersistTitle: vi.fn(async () => {}) }));
   ```
3. Delete the whole `makeStreamResult` function (and its comment) and add, next to `import { setSetting } from "@/lib/settings";`:
   ```ts
   import { resetRunRegistry } from "@/lib/agent/v2/run-registry";
   import { chatRequest, fakeStreamResult } from "./helpers/chat-route";
   ```
4. Replace every `makeStreamResult()` with `fakeStreamResult()`.
5. Replace every `new Request("http://localhost/api/agent/chat", { method: "POST", body: JSON.stringify(X) }) as never` (multi-line) with `chatRequest(X)`.
6. In `beforeEach`, add `resetRunRegistry();` as the first line.
7. Delete the test `"calls result.consumeStream() so persistence still happens if the client disconnects mid-stream (finding #5)"` (replaced by « keeps the model call alive when the browser disconnects »).
8. Replace `streamResult._uiStreamOptions.onEnd?.({ outcome: { status: "failed" } });` with `await streamResult.end({ status: "failed" });`, `streamResult._uiStreamOptions.onEnd?.({ outcome: { status: "completed" } });` with `await streamResult.end({ status: "completed" });`, and `streamResult._uiStreamOptions.onError?.(new Error("some tool-error part"))` with `streamResult.options.onError?.(new Error("some tool-error part"))`.

`tests/agent/v2-route-handler-retry.test.ts`:
1. Store mock: add `getConversation: (id: string) => ({ id, project_id: "p1", title: "t", created_at: "", updated_at: "" }),`.
2. Delete the `streamResult` function; add imports `import { resetRunRegistry } from "@/lib/agent/v2/run-registry";` and `import { chatRequest, fakeStreamResult, waitForRunEnd } from "./helpers/chat-route";`.
3. Replace the body of `send` with:
   ```ts
   const { postV2 } = await import("@/lib/agent/v2/route-handler");
   const res = await postV2(
     chatRequest({
       conversation_id: "c1",
       project_id: "p1",
       messages: [{ role: "user", parts: [{ type: "text", text }] }],
       canvas_snapshot: { nodes: [], edges: [] },
     }),
   );
   // Each send's turn ends before the next one (one turn per conversation).
   await waitForRunEnd("c1");
   return res;
   ```
4. In `beforeEach`: first line `resetRunRegistry();`, and replace `streamTextMock.mockReturnValue(streamResult());` with `streamTextMock.mockImplementation(() => fakeStreamResult({ autoEnd: true }));`.

`tests/agent/v2-route-handler-settings.test.ts`:
1. Store mock: add the same `getConversation` line.
2. Delete `streamResult`; add `import { chatRequest, fakeStreamResult } from "./helpers/chat-route";`.
3. In `send`, replace the `new Request(…) as never` argument with `chatRequest({ … same object … })`.
4. In `beforeEach`, replace `streamTextMock.mockReturnValue(streamResult());` with `streamTextMock.mockImplementation(() => fakeStreamResult({ autoEnd: true }));`.

`tests/agent/finish-turn-wiring.test.ts`:
1. Store mock: add the same `getConversation` line.
2. Add `import { chatRequest, fakeStreamResult } from "./helpers/chat-route";`.
3. In the `"chat route"` `beforeEach`, replace the `streamTextMock.mockReturnValue({ toUIMessageStreamResponse: …, consumeStream: … });` call with `streamTextMock.mockImplementation(() => fakeStreamResult({ autoEnd: true }));`.
4. Replace the `new Request("http://localhost/api/agent/chat", { method: "POST", body: JSON.stringify({…}) }) as never` argument with `chatRequest({…})`.

Then:

Run: `grep -n "toUIMessageStreamResponse\|consumeStream\|_uiStreamOptions\|new Request(\"http://localhost/api/agent/chat\"" tests/agent/*.ts` — expected: no output.
Run: `./node_modules/.bin/vitest run tests/agent` — expected: PASS, every file.

- [ ] **Step 7: Full check**

Run: `./node_modules/.bin/tsc --noEmit` — expected: exit 0.
Run: `./node_modules/.bin/vitest run` — expected: all tests pass.
Run: `./node_modules/.bin/eslint src/lib/agent/v2/route-handler.ts tests/agent/helpers/chat-route.ts tests/agent/v2-route-handler-runs.test.ts tests/agent/v2-route-handler.test.ts tests/agent/v2-route-handler-retry.test.ts tests/agent/v2-route-handler-settings.test.ts tests/agent/finish-turn-wiring.test.ts` — expected: no new error.

- [ ] **Step 8: Commit**

```bash
git add src/lib/agent/v2/route-handler.ts tests/agent/helpers/chat-route.ts tests/agent/v2-route-handler-runs.test.ts tests/agent/v2-route-handler.test.ts tests/agent/v2-route-handler-retry.test.ts tests/agent/v2-route-handler-settings.test.ts tests/agent/finish-turn-wiring.test.ts
git commit -m "feat(agent): chat turns run in the background, one per conversation" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Stream, stop and runs routes; deleting a conversation stops its turn

**Files:**
- Create: `src/app/api/agent/chat/[conversationId]/stream/route.ts`, `src/app/api/agent/chat/[conversationId]/stop/route.ts`, `src/app/api/agent/runs/route.ts`, `src/lib/agent/v2/runs-snapshot.ts`
- Modify: `src/app/api/agent/conversations/[id]/route.ts` (DELETE), `src/lib/local-storage.ts` (add `getProjectName`)
- Test: `tests/agent/run-routes.test.ts`

**Interfaces:**
- Consumes: (Task 1) `getRun`, `subscribe`, `stopRun`, `listRuns`, `RunSummary`, `AgentRunsSnapshot`; `rejectNonJsonRequest`; `getConversation`, `softDeleteConversation`.
- Produces: `GET /api/agent/chat/[conversationId]/stream` (204 | SSE), `POST /api/agent/chat/[conversationId]/stop` (415 | `{ stopped: boolean }`), `GET /api/agent/runs` (`AgentRunsSnapshot`, `Cache-Control: no-store`); `attentionKind(run: RunSummary): AttentionKind`, `buildRunsSnapshot(runs: RunSummary[], lookup: { conversationExists(id): boolean; projectName(id): string | null }): AgentRunsSnapshot`; `getProjectName(id: string): string | null`.

- [ ] **Step 1: Write the failing test**

Create `tests/agent/run-routes.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createProject } from "@/lib/local-storage";
import { createConversation } from "@/lib/agent/conversation/store";
import { appendChunk, finishRun, getRun, resetRunRegistry, startRun } from "@/lib/agent/v2/run-registry";
import { buildRunsSnapshot } from "@/lib/agent/v2/runs-snapshot";
import type { AgentRunsSnapshot, RunSummary } from "@/lib/agent/v2/run-types";
import { GET as getStream } from "@/app/api/agent/chat/[conversationId]/stream/route";
import { POST as postStop } from "@/app/api/agent/chat/[conversationId]/stop/route";
import { GET as getRuns } from "@/app/api/agent/runs/route";
import { DELETE as deleteConversation } from "@/app/api/agent/conversations/[id]/route";

const params = (conversationId: string) => ({ params: Promise.resolve({ conversationId }) });
const jsonPost = (url: string) => new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });

// createProject ids are `proj_<Date.now()>`: one project for the whole file.
let projectId = "";
beforeAll(() => {
  projectId = createProject("Vidéo F1").id;
});
beforeEach(() => resetRunRegistry());

const newConversation = () => createConversation(projectId).id;

describe("GET /api/agent/chat/[conversationId]/stream", () => {
  it("answers 204 when nothing runs, for an unknown id or an ended run", async () => {
    expect((await getStream(new Request("http://localhost/x"), params("unknown"))).status).toBe(204);
    const id = newConversation();
    finishRun(startRun(id, projectId)!, "done");
    expect((await getStream(new Request("http://localhost/x"), params(id))).status).toBe(204);
  });

  it("replays the run from its start, then streams it live until it ends", async () => {
    const id = newConversation();
    const run = startRun(id, projectId)!;
    appendChunk(run, { type: "start" });
    const res = await getStream(new Request("http://localhost/x"), params(id));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    appendChunk(run, { type: "text-delta", id: "t", delta: "Bonjour" });
    finishRun(run, "done");
    const body = await res.text();
    expect(body).toContain('"type":"start"');
    expect(body).toContain('"delta":"Bonjour"');
  });
});

describe("POST /api/agent/chat/[conversationId]/stop", () => {
  it("refuses a non-JSON request", async () => {
    const id = newConversation();
    const run = startRun(id, projectId)!;
    const res = await postStop(new Request("http://localhost/x", { method: "POST", body: "{}" }), params(id));
    expect(res.status).toBe(415);
    expect(run.abort.signal.aborted).toBe(false);
  });

  it("aborts a running run and says whether it did", async () => {
    const id = newConversation();
    const run = startRun(id, projectId)!;
    const res = await postStop(jsonPost("http://localhost/x"), params(id));
    expect(await res.json()).toEqual({ stopped: true });
    expect(run.abort.signal.aborted).toBe(true);
    expect(await (await postStop(jsonPost("http://localhost/x"), params("unknown"))).json()).toEqual({ stopped: false });
  });
});

describe("GET /api/agent/runs", () => {
  it("lists running turns and ended ones by kind, with the project name", async () => {
    const running = newConversation();
    const finished = newConversation();
    const failed = newConversation();
    const question = newConversation();
    const stopped = newConversation();
    const runningRun = startRun(running, projectId)!;
    finishRun(startRun(finished, projectId)!, "done");
    finishRun(startRun(failed, projectId)!, "error");
    const asking = startRun(question, projectId)!;
    appendChunk(asking, { type: "tool-input-available", toolCallId: "r1", toolName: "request_user_image", input: {} });
    finishRun(asking, "done");
    finishRun(startRun(stopped, projectId)!, "stopped");

    const snapshot = (await (await getRuns()).json()) as AgentRunsSnapshot;
    expect(snapshot.running).toEqual([{ conversationId: running, projectId, projectName: "Vidéo F1", startedAt: runningRun.startedAt }]);
    const kinds = Object.fromEntries(snapshot.attention.map((entry) => [entry.conversationId, entry.kind]));
    expect(kinds).toEqual({ [finished]: "finished", [failed]: "error", [question]: "question", [stopped]: "finished" });
    expect(snapshot.attention.every((entry) => entry.projectName === "Vidéo F1" && typeof entry.endedAt === "number")).toBe(true);
  });

  it("skips runs of deleted conversations and names unknown projects", () => {
    const base: RunSummary = { conversationId: "gone", projectId: "p-x", startedAt: 1, status: "running", endedAt: null, pendingClientRequest: false };
    const snapshot = buildRunsSnapshot(
      [base, { ...base, conversationId: "kept", status: "done", endedAt: 5 }],
      { conversationExists: (id) => id === "kept", projectName: () => null },
    );
    expect(snapshot).toEqual({
      running: [],
      attention: [{ conversationId: "kept", projectId: "p-x", projectName: "Miniature sans nom", kind: "finished", endedAt: 5 }],
    });
  });
});

describe("DELETE /api/agent/conversations/[id]", () => {
  it("stops the conversation's running turn", async () => {
    const id = newConversation();
    const run = startRun(id, projectId)!;
    const res = await deleteConversation(new Request("http://localhost/x", { method: "DELETE" }) as never, { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    expect(run.abort.signal.aborted).toBe(true);
    expect(getRun(id)?.status).toBe("running"); // ends when its stream ends, like any stop
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/agent/run-routes.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/agent/v2/runs-snapshot"`.

- [ ] **Step 3: `getProjectName`**

In `src/lib/local-storage.ts`, right after the `listProjects` function, add:

```ts
/** The project's name, or null when it does not exist (deleted). */
export function getProjectName(id: string): string | null {
  const row = getDb().prepare("SELECT name FROM projects_meta WHERE id = ?").get(id) as { name: string } | undefined;
  return row?.name ?? null;
}
```

(`getDb` is already imported by this file — check; add `import { getDb } from "@/lib/db";` only if it is not.)

- [ ] **Step 4: Snapshot builder and the three routes**

Create `src/lib/agent/v2/runs-snapshot.ts`:

```ts
import type { AgentRunsSnapshot, AttentionEntry, AttentionKind, RunningEntry, RunSummary } from "./run-types";

const UNNAMED_PROJECT = "Miniature sans nom";

/** A paused request is a question; otherwise an error, or « finished » (done or stopped). */
export function attentionKind(run: RunSummary): AttentionKind {
  if (run.pendingClientRequest) return "question";
  return run.status === "error" ? "error" : "finished";
}

/** Everything the registry holds, minus deleted conversations. The client filters what it has seen. */
export function buildRunsSnapshot(
  runs: RunSummary[],
  lookup: { conversationExists: (conversationId: string) => boolean; projectName: (projectId: string) => string | null },
): AgentRunsSnapshot {
  const running: RunningEntry[] = [];
  const attention: AttentionEntry[] = [];
  for (const run of runs) {
    if (!lookup.conversationExists(run.conversationId)) continue;
    const projectName = lookup.projectName(run.projectId) ?? UNNAMED_PROJECT;
    if (run.status === "running") {
      running.push({ conversationId: run.conversationId, projectId: run.projectId, projectName, startedAt: run.startedAt });
    } else {
      attention.push({
        conversationId: run.conversationId,
        projectId: run.projectId,
        projectName,
        kind: attentionKind(run),
        endedAt: run.endedAt ?? run.startedAt,
      });
    }
  }
  return { running, attention };
}
```

Create `src/app/api/agent/chat/[conversationId]/stream/route.ts`:

```ts
import { createUIMessageStreamResponse } from "ai";
import { getRun, subscribe } from "@/lib/agent/v2/run-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reconnection to a running turn — the default URL of AI SDK's reconnectToStream
 * (`${api}/${id}/stream`, GET). 204 when nothing runs: useChat does not resume.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const run = getRun(conversationId);
  if (!run || run.status !== "running") return new Response(null, { status: 204 });
  return createUIMessageStreamResponse({ stream: subscribe(run) });
}
```

Create `src/app/api/agent/chat/[conversationId]/stop/route.ts`:

```ts
import { NextResponse } from "next/server";
import { stopRun } from "@/lib/agent/v2/run-registry";
import { rejectNonJsonRequest } from "@/lib/youtube/route-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** « Arrêter »: aborts the turn on the server; its stream then ends by itself, after the save. */
export async function POST(req: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const notJson = rejectNonJsonRequest(req);
  if (notJson) return notJson;
  const { conversationId } = await params;
  return NextResponse.json({ stopped: stopRun(conversationId) });
}
```

Create `src/app/api/agent/runs/route.ts`:

```ts
import { NextResponse } from "next/server";
import { listRuns } from "@/lib/agent/v2/run-registry";
import { buildRunsSnapshot } from "@/lib/agent/v2/runs-snapshot";
import { getConversation } from "@/lib/agent/conversation/store";
import { getProjectName } from "@/lib/local-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Turns running now and turns ended in the last 5 minutes, for the indicators and toasts. */
export async function GET() {
  const snapshot = buildRunsSnapshot(listRuns(), {
    conversationExists: (conversationId) => getConversation(conversationId) !== null,
    projectName: getProjectName,
  });
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
```

- [ ] **Step 5: DELETE stops the turn**

In `src/app/api/agent/conversations/[id]/route.ts`, add `import { stopRun } from "@/lib/agent/v2/run-registry";` and replace, in `DELETE`,

```ts
  softDeleteConversation(id);
  return NextResponse.json({ success: true });
```

with

```ts
  softDeleteConversation(id);
  // A turn still running there would keep paying for a conversation nobody can see.
  stopRun(id);
  return NextResponse.json({ success: true });
```

- [ ] **Step 6: Run the tests, type-check, lint**

Run: `./node_modules/.bin/vitest run tests/agent/run-routes.test.ts tests/agent/conversation-routes.test.ts` — expected: PASS.
Run: `./node_modules/.bin/tsc --noEmit` — expected: exit 0 (if it only complains in `.next/types`, clean it as described in Global Constraints).
Run: `./node_modules/.bin/eslint src/lib/agent/v2/runs-snapshot.ts "src/app/api/agent/chat/[conversationId]/stream/route.ts" "src/app/api/agent/chat/[conversationId]/stop/route.ts" src/app/api/agent/runs/route.ts "src/app/api/agent/conversations/[id]/route.ts" src/lib/local-storage.ts tests/agent/run-routes.test.ts` — expected: no new error.

- [ ] **Step 7: Commit**

```bash
git add src/lib/agent/v2/runs-snapshot.ts "src/app/api/agent/chat/[conversationId]/stream/route.ts" "src/app/api/agent/chat/[conversationId]/stop/route.ts" src/app/api/agent/runs/route.ts "src/app/api/agent/conversations/[id]/route.ts" src/lib/local-storage.ts tests/agent/run-routes.test.ts
git commit -m "feat(agent): routes to reconnect to, stop and list agent runs" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Toasts (Base UI)

**Files:**
- Create: `src/components/ui/toast.tsx`
- Modify: `src/app/layout.tsx`
- Test: `tests/chat/toast.test.tsx`

**Interfaces:**
- Consumes: `Toast` from `@base-ui/react/toast`, `buttonVariants` from `@/components/ui/button`.
- Produces: `toastManager`, `type ToastOptions = { id?: string; title: string; description?: string; action?: { label: string; onClick: () => void }; timeout?: number }`, `toast(options): string` (adding an existing `id` updates it in place), `<Toaster />` (mounted once in the root layout).

- [ ] **Step 1: Check the registry option (informational)**

Run: `./node_modules/.bin/shadcn view toast 2>&1 | head -5`
Whatever it prints (no network → an error is expected), continue with the hand-written wrapper below (ruling 1). Do not install `sonner`. If the command modified `package.json` / `package-lock.json`, restore them with `git checkout -- package.json package-lock.json`.

- [ ] **Step 2: Write the failing test**

Create `tests/chat/toast.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Toaster, toast } from "@/components/ui/toast";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("toast", () => {
  it("shows a toast with its title and action button", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root!.render(<Toaster />));

    const onClick = vi.fn();
    await act(async () => {
      toast({ id: "run-1", title: "L'agent a fini — Vidéo F1", action: { label: "Ouvrir", onClick } });
    });
    expect(document.body.textContent).toContain("L'agent a fini — Vidéo F1");

    const open = [...document.querySelectorAll("button")].find((button) => button.textContent === "Ouvrir");
    expect(open).toBeDefined();
    await act(async () => open!.click());
    expect(onClick).toHaveBeenCalledTimes(1);

    // Same id: updated in place, never duplicated.
    await act(async () => {
      toast({ id: "run-1", title: "L'agent a fini — Vidéo F1" });
    });
    expect(document.body.textContent?.split("L'agent a fini — Vidéo F1").length).toBe(2);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/chat/toast.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/ui/toast"`.

- [ ] **Step 4: The wrapper**

Create `src/components/ui/toast.tsx`:

```tsx
"use client"

import { Toast } from "@base-ui/react/toast"
import { XIcon } from "lucide-react"
import { cn } from "cn"
import { buttonVariants } from "@/components/ui/button"

/** One manager for the whole app, so toasts can be raised outside React components. */
const toastManager = Toast.createToastManager()

type ToastOptions = {
  /** Reusing an id updates that toast instead of adding a second one. */
  id?: string
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
  /** Milliseconds before it closes by itself (0: never). */
  timeout?: number
}

function toast({ id, title, description, action, timeout = 8000 }: ToastOptions): string {
  return toastManager.add({
    id,
    title,
    description,
    timeout,
    actionProps: action ? { children: action.label, onClick: action.onClick } : undefined,
  })
}

function ToastList() {
  const { toasts } = Toast.useToastManager()
  return toasts.map((item) => (
    <Toast.Root
      key={item.id}
      toast={item}
      data-slot="toast"
      className="pointer-events-auto w-full rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg transition-all duration-200 data-ending-style:opacity-0 data-limited:hidden data-starting-style:-translate-y-2 data-starting-style:opacity-0 motion-reduce:transition-none"
    >
      <Toast.Content className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <Toast.Title className="text-sm font-medium leading-snug" />
          <Toast.Description className="text-xs text-muted-foreground" />
        </div>
        <Toast.Action className={cn(buttonVariants({ variant: "outline", size: "sm" }))} />
        <Toast.Close aria-label="Fermer" className={cn(buttonVariants({ variant: "ghost", size: "icon-xs" }))}>
          <XIcon />
        </Toast.Close>
      </Toast.Content>
    </Toast.Root>
  ))
}

/** Mounted once in the root layout. Top-right: the chat panel sits bottom-right. */
function Toaster() {
  return (
    <Toast.Provider toastManager={toastManager} limit={3}>
      <Toast.Portal>
        <Toast.Viewport className="pointer-events-none fixed top-4 right-4 z-50 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  )
}

export { Toaster, toast, toastManager, type ToastOptions }
```

- [ ] **Step 5: Mount it in the root layout**

In `src/app/layout.tsx`, add `import { Toaster } from "@/components/ui/toast";` after the `SidebarProvider` import, and replace

```tsx
          <SidebarProvider defaultOpen={sidebarOpen} style={{ "--sidebar-width-icon": "4rem" } as React.CSSProperties}>
            {children}
          </SidebarProvider>
```

with

```tsx
          <SidebarProvider defaultOpen={sidebarOpen} style={{ "--sidebar-width-icon": "4rem" } as React.CSSProperties}>
            {children}
            <Toaster />
          </SidebarProvider>
```

(the existing `style` prop on `SidebarProvider` is untouched code, not new code).

- [ ] **Step 6: Run the test, type-check, lint**

Run: `./node_modules/.bin/vitest run tests/chat/toast.test.tsx` — expected: PASS. If happy-dom lacks an API Base UI calls (e.g. `getAnimations`), stub it in the test file with `Element.prototype.getAnimations ??= () => [];` before rendering — never change the component for the test environment.
Run: `./node_modules/.bin/tsc --noEmit` — expected: exit 0.
Run: `./node_modules/.bin/eslint src/components/ui/toast.tsx src/app/layout.tsx tests/chat/toast.test.tsx` — expected: no new error.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/toast.tsx src/app/layout.tsx tests/chat/toast.test.tsx
git commit -m "feat(ui): Base UI toasts mounted in the root layout" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Runs model and `AgentRunsProvider`

**Files:**
- Create: `src/components/agent-runs/agent-runs-model.ts`, `src/components/agent-runs/AgentRunsProvider.tsx`
- Modify: `src/app/layout.tsx`
- Test: `tests/agent-runs/agent-runs-model.test.ts`, `tests/agent-runs/agent-runs-provider.test.tsx`

**Interfaces:**
- Consumes: (Task 1) `AgentRunsSnapshot`, `AttentionEntry`, `AttentionKind`; (Task 5) `toast`; `usePathname`, `useRouter` from `next/navigation`.
- Produces (model): `RUNS_POLL_ACTIVE_MS = 3_000`, `RUNS_POLL_IDLE_MS = 30_000`, `RUNS_MEMORY_KEY = "thumbgen.agentRuns.v1"`, `EMPTY_RUNS`, `type RunsMemory = { seen: Record<string, number>; toasted: Record<string, number> }`, `parseRunsMemory(raw: string | null): RunsMemory`, `nextPollDelay(snapshot): number`, `unseenAttentions(snapshot, memory): AttentionEntry[]`, `markSeenEntries(memory, entries): RunsMemory`, `markToasted(memory, entries): RunsMemory`, `toastsToFire(snapshot, memory, openProjectId: string | null): AttentionEntry[]`, `pruneRunsMemory(memory, snapshot): RunsMemory` (all three return the same object when nothing changes), `attentionToastTitle(entry): string`, `openProjectIdFromPath(pathname: string | null): string | null`, `type RunIndicatorState = "running" | "attention" | null`, `runIndicatorState(snapshot, unseen, projectId?: string): RunIndicatorState`, `pickConversationId(conversations: { id: string }[], snapshot, projectId: string): string | null`.
- Produces (provider): `type AgentRunsContextValue = { snapshot: AgentRunsSnapshot; unseen: AttentionEntry[]; refreshRuns: () => Promise<AgentRunsSnapshot>; markSeen: (conversationIds: string[]) => void }`, `AgentRunsContext` (default: empty snapshot, `refreshRuns` resolves `EMPTY_RUNS`, `markSeen` no-op — components render without the provider), `useAgentRuns()`, `<AgentRunsProvider>`.

- [ ] **Step 1: Write the failing model test**

Create `tests/agent-runs/agent-runs-model.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  EMPTY_RUNS,
  RUNS_POLL_ACTIVE_MS,
  RUNS_POLL_IDLE_MS,
  attentionToastTitle,
  markSeenEntries,
  markToasted,
  nextPollDelay,
  openProjectIdFromPath,
  parseRunsMemory,
  pickConversationId,
  pruneRunsMemory,
  runIndicatorState,
  toastsToFire,
  unseenAttentions,
} from "@/components/agent-runs/agent-runs-model";
import type { AgentRunsSnapshot, AttentionEntry } from "@/lib/agent/v2/run-types";

const attention = (conversationId: string, projectId: string, endedAt: number, kind: AttentionEntry["kind"] = "finished"): AttentionEntry => ({
  conversationId,
  projectId,
  projectName: `Projet ${projectId}`,
  kind,
  endedAt,
});
const snapshot = (partial: Partial<AgentRunsSnapshot>): AgentRunsSnapshot => ({ ...EMPTY_RUNS, ...partial });
const emptyMemory = parseRunsMemory(null);

describe("agent runs model", () => {
  it("polls every 3 s while a turn runs, every 30 s otherwise", () => {
    expect(nextPollDelay(EMPTY_RUNS)).toBe(RUNS_POLL_IDLE_MS);
    expect(nextPollDelay(snapshot({ running: [{ conversationId: "c", projectId: "p", projectName: "P", startedAt: 1 }] }))).toBe(RUNS_POLL_ACTIVE_MS);
  });

  it("reads a damaged memory as empty", () => {
    expect(parseRunsMemory("{oops")).toEqual({ seen: {}, toasted: {} });
    expect(parseRunsMemory("null")).toEqual({ seen: {}, toasted: {} });
    expect(parseRunsMemory(JSON.stringify({ seen: { c1: 5, bad: "x" } }))).toEqual({ seen: { c1: 5 }, toasted: {} });
  });

  it("an attention is unseen until marked with its endedAt; a later end is unseen again", () => {
    const s = snapshot({ attention: [attention("c1", "p1", 10)] });
    expect(unseenAttentions(s, emptyMemory)).toHaveLength(1);
    const seen = markSeenEntries(emptyMemory, s.attention);
    expect(unseenAttentions(s, seen)).toHaveLength(0);
    expect(markSeenEntries(seen, s.attention)).toBe(seen);
    expect(unseenAttentions(snapshot({ attention: [attention("c1", "p1", 20)] }), seen)).toHaveLength(1);
  });

  it("toasts each unseen attention once, never for the open miniature", () => {
    const s = snapshot({ attention: [attention("c1", "p1", 10), attention("c2", "p2", 11, "question")] });
    expect(toastsToFire(s, emptyMemory, "p2").map((entry) => entry.conversationId)).toEqual(["c1"]);
    const toasted = markToasted(emptyMemory, toastsToFire(s, emptyMemory, null));
    expect(toastsToFire(s, toasted, null)).toEqual([]);
    expect(markToasted(toasted, [])).toBe(toasted);
  });

  it("prunes memory entries whose attention is gone", () => {
    const memory = { seen: { c1: 10, old: 3 }, toasted: { old: 3 } };
    const s = snapshot({ attention: [attention("c1", "p1", 10)] });
    expect(pruneRunsMemory(memory, s)).toEqual({ seen: { c1: 10 }, toasted: {} });
    const clean = { seen: { c1: 10 }, toasted: {} };
    expect(pruneRunsMemory(clean, s)).toBe(clean);
  });

  it("writes the three toast texts", () => {
    expect(attentionToastTitle(attention("c", "p", 1, "finished"))).toBe("L'agent a fini — Projet p");
    expect(attentionToastTitle(attention("c", "p", 1, "error"))).toBe("L'agent s'est arrêté sur une erreur — Projet p");
    expect(attentionToastTitle(attention("c", "p", 1, "question"))).toBe("L'agent te pose une question — Projet p");
  });

  it("finds the open miniature in the path", () => {
    expect(openProjectIdFromPath("/m/proj_123")).toBe("proj_123");
    expect(openProjectIdFromPath("/bibliotheque")).toBeNull();
    expect(openProjectIdFromPath(null)).toBeNull();
  });

  it("computes the indicator for one project or for all", () => {
    const running = snapshot({ running: [{ conversationId: "c1", projectId: "p1", projectName: "P", startedAt: 1 }] });
    expect(runIndicatorState(running, [], "p1")).toBe("running");
    expect(runIndicatorState(running, [], "p2")).toBeNull();
    expect(runIndicatorState(running, [])).toBe("running");
    expect(runIndicatorState(EMPTY_RUNS, [attention("c2", "p2", 5)], "p2")).toBe("attention");
    expect(runIndicatorState(EMPTY_RUNS, [attention("c2", "p2", 5)])).toBe("attention");
    expect(runIndicatorState(EMPTY_RUNS, [])).toBeNull();
  });

  it("opens the running conversation first, then the newest attention, then the most recent", () => {
    const list = [{ id: "recent" }, { id: "busy" }, { id: "ended" }, { id: "older-ended" }];
    const s = snapshot({
      running: [
        { conversationId: "busy", projectId: "p1", projectName: "P", startedAt: 5 },
        { conversationId: "other-project", projectId: "p2", projectName: "Q", startedAt: 9 },
      ],
      attention: [attention("older-ended", "p1", 3), attention("ended", "p1", 7)],
    });
    expect(pickConversationId(list, s, "p1")).toBe("busy");
    expect(pickConversationId(list, snapshot({ attention: s.attention }), "p1")).toBe("ended");
    expect(pickConversationId(list, EMPTY_RUNS, "p1")).toBe("recent");
    expect(pickConversationId([], s, "p1")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/agent-runs/agent-runs-model.test.ts`
Expected: FAIL — `Failed to resolve import "@/components/agent-runs/agent-runs-model"`.

- [ ] **Step 3: The model**

Create `src/components/agent-runs/agent-runs-model.ts`:

```ts
import type { AgentRunsSnapshot, AttentionEntry, AttentionKind } from "@/lib/agent/v2/run-types";

export const RUNS_POLL_ACTIVE_MS = 3_000;
export const RUNS_POLL_IDLE_MS = 30_000;
export const RUNS_MEMORY_KEY = "thumbgen.agentRuns.v1";
export const EMPTY_RUNS: AgentRunsSnapshot = { running: [], attention: [] };

/** Per browser: the last endedAt seen and toasted, by conversation. */
export type RunsMemory = { seen: Record<string, number>; toasted: Record<string, number> };

function numberRecord(value: unknown): Record<string, number> {
  if (typeof value !== "object" || value === null) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
  );
}

export function parseRunsMemory(raw: string | null): RunsMemory {
  if (!raw) return { seen: {}, toasted: {} };
  try {
    const parsed = JSON.parse(raw) as { seen?: unknown; toasted?: unknown } | null;
    return { seen: numberRecord(parsed?.seen), toasted: numberRecord(parsed?.toasted) };
  } catch {
    return { seen: {}, toasted: {} };
  }
}

export function nextPollDelay(snapshot: AgentRunsSnapshot): number {
  return snapshot.running.length > 0 ? RUNS_POLL_ACTIVE_MS : RUNS_POLL_IDLE_MS;
}

export function unseenAttentions(snapshot: AgentRunsSnapshot, memory: RunsMemory): AttentionEntry[] {
  return snapshot.attention.filter((entry) => entry.endedAt > (memory.seen[entry.conversationId] ?? 0));
}

/** The record with each entry's endedAt, or null when nothing would change. */
function recordEndedAt(record: Record<string, number>, entries: AttentionEntry[]): Record<string, number> | null {
  let next: Record<string, number> | null = null;
  for (const entry of entries) {
    if ((record[entry.conversationId] ?? 0) >= entry.endedAt) continue;
    next ??= { ...record };
    next[entry.conversationId] = entry.endedAt;
  }
  return next;
}

export function markSeenEntries(memory: RunsMemory, entries: AttentionEntry[]): RunsMemory {
  const seen = recordEndedAt(memory.seen, entries);
  return seen ? { ...memory, seen } : memory;
}

export function markToasted(memory: RunsMemory, entries: AttentionEntry[]): RunsMemory {
  const toasted = recordEndedAt(memory.toasted, entries);
  return toasted ? { ...memory, toasted } : memory;
}

/** Unseen, not toasted yet, and not about the miniature open right now. */
export function toastsToFire(snapshot: AgentRunsSnapshot, memory: RunsMemory, openProjectId: string | null): AttentionEntry[] {
  return unseenAttentions(snapshot, memory).filter(
    (entry) => entry.projectId !== openProjectId && entry.endedAt > (memory.toasted[entry.conversationId] ?? 0),
  );
}

/** Forgets conversations the registry no longer lists (their run was removed after 5 minutes). */
export function pruneRunsMemory(memory: RunsMemory, snapshot: AgentRunsSnapshot): RunsMemory {
  const listed = new Set(snapshot.attention.map((entry) => entry.conversationId));
  const prune = (record: Record<string, number>) => {
    const entries = Object.entries(record);
    const kept = entries.filter(([conversationId]) => listed.has(conversationId));
    return kept.length === entries.length ? record : Object.fromEntries(kept);
  };
  const seen = prune(memory.seen);
  const toasted = prune(memory.toasted);
  return seen === memory.seen && toasted === memory.toasted ? memory : { seen, toasted };
}

const TOAST_TITLES: Record<AttentionKind, string> = {
  finished: "L'agent a fini",
  error: "L'agent s'est arrêté sur une erreur",
  question: "L'agent te pose une question",
};

export function attentionToastTitle(entry: AttentionEntry): string {
  return `${TOAST_TITLES[entry.kind]} — ${entry.projectName}`;
}

export function openProjectIdFromPath(pathname: string | null): string | null {
  const match = pathname?.match(/^\/m\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export type RunIndicatorState = "running" | "attention" | null;

/** For one project, or for every project when projectId is omitted (sidebar). */
export function runIndicatorState(snapshot: AgentRunsSnapshot, unseen: AttentionEntry[], projectId?: string): RunIndicatorState {
  const concerned = (entry: { projectId: string }) => projectId === undefined || entry.projectId === projectId;
  if (snapshot.running.some(concerned)) return "running";
  return unseen.some(concerned) ? "attention" : null;
}

/**
 * Conversation to open with a miniature: the one where a turn runs, else the
 * newest one where a turn just ended (seen or not: the open page marks it seen
 * at once), else the most recent conversation (the list is sorted that way).
 */
export function pickConversationId(conversations: { id: string }[], snapshot: AgentRunsSnapshot, projectId: string): string | null {
  const ids = new Set(conversations.map((conversation) => conversation.id));
  const here = <T extends { projectId: string; conversationId: string }>(entry: T) => entry.projectId === projectId && ids.has(entry.conversationId);
  const running = snapshot.running.filter(here).sort((a, b) => b.startedAt - a.startedAt)[0];
  if (running) return running.conversationId;
  const ended = snapshot.attention.filter(here).sort((a, b) => b.endedAt - a.endedAt)[0];
  if (ended) return ended.conversationId;
  return conversations[0]?.id ?? null;
}
```

- [ ] **Step 4: Run the model test**

Run: `./node_modules/.bin/vitest run tests/agent-runs/agent-runs-model.test.ts` — expected: PASS (9 tests).

- [ ] **Step 5: Write the failing provider test**

Create `tests/agent-runs/agent-runs-provider.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AgentRunsSnapshot } from "@/lib/agent/v2/run-types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let pathname = "/bibliotheque";
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: pushMock }),
}));

const toastMock = vi.fn((..._args: unknown[]) => "id");
vi.mock("@/components/ui/toast", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

import { AgentRunsProvider, useAgentRuns } from "@/components/agent-runs/AgentRunsProvider";
import { RUNS_MEMORY_KEY } from "@/components/agent-runs/agent-runs-model";

const SNAPSHOT: AgentRunsSnapshot = {
  running: [],
  attention: [{ conversationId: "c1", projectId: "p1", projectName: "Vidéo F1", kind: "finished", endedAt: 1000 }],
};

function Probe() {
  const { unseen } = useAgentRuns();
  return <span data-testid="unseen">{unseen.length}</span>;
}

let root: Root | null = null;
async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <AgentRunsProvider>
        <Probe />
      </AgentRunsProvider>,
    ),
  );
}
async function unmount() {
  await act(async () => root?.unmount());
  root = null;
}
const unseenCount = () => document.querySelector('[data-testid="unseen"]')?.textContent;

beforeEach(() => {
  localStorage.clear();
  toastMock.mockClear();
  pushMock.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(SNAPSHOT)));
});
afterEach(async () => {
  await unmount();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("AgentRunsProvider", () => {
  it("toasts an unseen attention of another page once, with « Ouvrir »", async () => {
    pathname = "/bibliotheque";
    await mount();
    await vi.waitFor(() => expect(toastMock).toHaveBeenCalledTimes(1));
    const options = toastMock.mock.calls[0][0] as { id: string; title: string; action: { label: string; onClick: () => void } };
    expect(options.title).toBe("L'agent a fini — Vidéo F1");
    expect(options.action.label).toBe("Ouvrir");
    options.action.onClick();
    expect(pushMock).toHaveBeenCalledWith("/m/p1");
    await vi.waitFor(() => expect(unseenCount()).toBe("1"));
    expect(JSON.parse(localStorage.getItem(RUNS_MEMORY_KEY)!).toasted).toEqual({ c1: 1000 });

    await unmount();
    await mount();
    await vi.waitFor(() => expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(toastMock).toHaveBeenCalledTimes(1);
  });

  it("marks the open miniature's attentions seen, without a toast", async () => {
    pathname = "/m/p1";
    await mount();
    await vi.waitFor(() => expect(JSON.parse(localStorage.getItem(RUNS_MEMORY_KEY) ?? "{}").seen).toEqual({ c1: 1000 }));
    await vi.waitFor(() => expect(unseenCount()).toBe("0"));
    expect(toastMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/agent-runs/agent-runs-provider.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/agent-runs/AgentRunsProvider"`.

- [ ] **Step 7: The provider**

Create `src/components/agent-runs/AgentRunsProvider.tsx`:

```tsx
"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import type { AgentRunsSnapshot, AttentionEntry } from "@/lib/agent/v2/run-types";
import {
  EMPTY_RUNS,
  RUNS_MEMORY_KEY,
  RUNS_POLL_ACTIVE_MS,
  RUNS_POLL_IDLE_MS,
  attentionToastTitle,
  markSeenEntries,
  markToasted,
  nextPollDelay,
  openProjectIdFromPath,
  parseRunsMemory,
  pruneRunsMemory,
  toastsToFire,
  unseenAttentions,
  type RunsMemory,
} from "./agent-runs-model";

export type AgentRunsContextValue = {
  snapshot: AgentRunsSnapshot;
  /** Ended turns this browser has not seen yet. */
  unseen: AttentionEntry[];
  /** Fetches GET /api/agent/runs now; resolves to the latest snapshot (the previous one on failure). */
  refreshRuns: () => Promise<AgentRunsSnapshot>;
  markSeen: (conversationIds: string[]) => void;
};

export const AgentRunsContext = createContext<AgentRunsContextValue>({
  snapshot: EMPTY_RUNS,
  unseen: [],
  refreshRuns: async () => EMPTY_RUNS,
  markSeen: () => {},
});

export function useAgentRuns(): AgentRunsContextValue {
  return useContext(AgentRunsContext);
}

function readMemory(): RunsMemory {
  try {
    return parseRunsMemory(localStorage.getItem(RUNS_MEMORY_KEY));
  } catch {
    // Server render, private mode or blocked storage.
    return parseRunsMemory(null);
  }
}

function writeMemory(memory: RunsMemory): void {
  try {
    localStorage.setItem(RUNS_MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // Storage unavailable: seen state just won't persist.
  }
}

/**
 * Agent turns running or just ended anywhere in the app (chantier F1): polls
 * GET /api/agent/runs, marks the open miniature's endings seen, and raises one
 * toast per other ending.
 */
export function AgentRunsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<AgentRunsSnapshot>(EMPTY_RUNS);
  const [memory, setMemory] = useState<RunsMemory>(readMemory);
  const snapshotRef = useRef<AgentRunsSnapshot>(EMPTY_RUNS);
  const memoryRef = useRef<RunsMemory>(memory);
  const openProjectId = openProjectIdFromPath(pathname);
  const openProjectIdRef = useRef<string | null>(openProjectId);

  useEffect(() => {
    openProjectIdRef.current = openProjectId;
  }, [openProjectId]);

  const commitMemory = useCallback((next: RunsMemory) => {
    if (next === memoryRef.current) return;
    memoryRef.current = next;
    setMemory(next);
    writeMemory(next);
  }, []);

  const refreshRuns = useCallback(async (): Promise<AgentRunsSnapshot> => {
    let next: AgentRunsSnapshot;
    try {
      const res = await fetch("/api/agent/runs", { cache: "no-store" });
      if (!res.ok) return snapshotRef.current;
      next = (await res.json()) as AgentRunsSnapshot;
    } catch {
      return snapshotRef.current;
    }
    snapshotRef.current = next;
    setSnapshot(next);

    // The open miniature's endings are seen at once; every other one gets a single toast.
    const open = openProjectIdRef.current;
    const current = memoryRef.current;
    const seen = markSeenEntries(current, unseenAttentions(next, current).filter((entry) => entry.projectId === open));
    const toFire = toastsToFire(next, seen, open);
    for (const entry of toFire) {
      toast({
        id: `agent-run-${entry.conversationId}-${entry.endedAt}`,
        title: attentionToastTitle(entry),
        action: { label: "Ouvrir", onClick: () => router.push(`/m/${entry.projectId}`) },
      });
    }
    commitMemory(pruneRunsMemory(markToasted(seen, toFire), next));
    return next;
  }, [commitMemory, router]);

  // On mount and on every navigation (when the indicators matter)…
  useEffect(() => {
    void refreshRuns();
  }, [pathname, refreshRuns]);

  // …then every 3 s while a turn runs somewhere, every 30 s otherwise.
  const active = snapshot.running.length > 0;
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (delay: number) => {
      timer = setTimeout(async () => {
        const next = await refreshRuns();
        if (!cancelled) schedule(nextPollDelay(next));
      }, delay);
    };
    schedule(active ? RUNS_POLL_ACTIVE_MS : RUNS_POLL_IDLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, refreshRuns]);

  const markSeen = useCallback(
    (conversationIds: string[]) => {
      const entries = snapshotRef.current.attention.filter((entry) => conversationIds.includes(entry.conversationId));
      commitMemory(markSeenEntries(memoryRef.current, entries));
    },
    [commitMemory],
  );

  const unseen = useMemo(() => unseenAttentions(snapshot, memory), [snapshot, memory]);
  const value = useMemo<AgentRunsContextValue>(
    () => ({ snapshot, unseen, refreshRuns, markSeen }),
    [snapshot, unseen, refreshRuns, markSeen],
  );

  return <AgentRunsContext.Provider value={value}>{children}</AgentRunsContext.Provider>;
}
```

If eslint reports `react-hooks/set-state-in-effect` on the `void refreshRuns()` effect, declare the call inside the effect the way `ChatPanel`'s history effect does (`const run = async () => { await refreshRuns(); }; void run();`) and re-run eslint; do not disable the rule.

- [ ] **Step 8: Wrap the app**

In `src/app/layout.tsx`, add `import { AgentRunsProvider } from "@/components/agent-runs/AgentRunsProvider";` and replace

```tsx
            {children}
            <Toaster />
```

with

```tsx
            <AgentRunsProvider>{children}</AgentRunsProvider>
            <Toaster />
```

- [ ] **Step 9: Run the tests, type-check, lint**

Run: `./node_modules/.bin/vitest run tests/agent-runs` — expected: PASS (both files).
Run: `./node_modules/.bin/tsc --noEmit` — expected: exit 0.
Run: `./node_modules/.bin/eslint src/components/agent-runs/agent-runs-model.ts src/components/agent-runs/AgentRunsProvider.tsx src/app/layout.tsx tests/agent-runs/agent-runs-model.test.ts tests/agent-runs/agent-runs-provider.test.tsx` — expected: no new error.

- [ ] **Step 10: Commit**

```bash
git add src/components/agent-runs/agent-runs-model.ts src/components/agent-runs/AgentRunsProvider.tsx src/app/layout.tsx tests/agent-runs/agent-runs-model.test.ts tests/agent-runs/agent-runs-provider.test.tsx
git commit -m "feat(agent): app-wide agent runs provider with toasts" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Activity dots in the sidebar and on « Mes miniatures »

**Files:**
- Create: `src/components/agent-runs/RunIndicator.tsx`
- Modify: `src/components/panels/AppSidebar.tsx`, `src/app/miniatures/MiniaturesView.tsx`
- Test: `tests/agent-runs/run-indicator-render.test.tsx`

**Interfaces:**
- Consumes: (Task 6) `AgentRunsContext`, `useAgentRuns`, `runIndicatorState`, `EMPTY_RUNS`.
- Produces: `RunIndicator({ projectId?: string; className?: string })` — renders nothing, or `<span data-slot="run-indicator" data-state="running" | "attention" role="img" aria-label=…>`.

- [ ] **Step 1: Write the failing test**

Create `tests/agent-runs/run-indicator-render.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentRunsContext, type AgentRunsContextValue } from "@/components/agent-runs/AgentRunsProvider";
import { RunIndicator } from "@/components/agent-runs/RunIndicator";
import { EMPTY_RUNS } from "@/components/agent-runs/agent-runs-model";

const value = (partial: Partial<AgentRunsContextValue>): AgentRunsContextValue => ({
  snapshot: EMPTY_RUNS,
  unseen: [],
  refreshRuns: async () => EMPTY_RUNS,
  markSeen: () => {},
  ...partial,
});

const render = (context: AgentRunsContextValue, projectId?: string) =>
  renderToStaticMarkup(
    <AgentRunsContext.Provider value={context}>
      <RunIndicator projectId={projectId} className="absolute" />
    </AgentRunsContext.Provider>,
  );

describe("RunIndicator", () => {
  it("pulses while a turn runs, and respects reduced motion", () => {
    const html = render(value({ snapshot: { running: [{ conversationId: "c", projectId: "p1", projectName: "P", startedAt: 1 }], attention: [] } }), "p1");
    expect(html).toContain('data-slot="run-indicator"');
    expect(html).toContain('data-state="running"');
    expect(html).toContain("animate-pulse");
    expect(html).toContain("motion-reduce:animate-none");
    expect(html).toContain('aria-label="L&#x27;agent travaille"');
    expect(html).toContain("absolute");
  });

  it("stays still for an unseen ending, and shows nothing otherwise", () => {
    const unseen = [{ conversationId: "c", projectId: "p1", projectName: "P", kind: "finished" as const, endedAt: 2 }];
    const html = render(value({ unseen }), "p1");
    expect(html).toContain('data-state="attention"');
    expect(html).not.toContain("animate-pulse");
    expect(render(value({ unseen }), "p2")).toBe("");
    expect(render(value({}))).toBe("");
    // Without projectId (sidebar): any project counts.
    expect(render(value({ unseen }))).toContain('data-state="attention"');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/agent-runs/run-indicator-render.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/agent-runs/RunIndicator"`.

- [ ] **Step 3: The indicator**

Create `src/components/agent-runs/RunIndicator.tsx`:

```tsx
"use client";
import { cn } from "cn";
import { useAgentRuns } from "./AgentRunsProvider";
import { runIndicatorState } from "./agent-runs-model";

/** Violet dot: pulsing while the agent works, still when an ending is unseen. All projects when projectId is omitted. */
export function RunIndicator({ projectId, className }: { projectId?: string; className?: string }) {
  const { snapshot, unseen } = useAgentRuns();
  const state = runIndicatorState(snapshot, unseen, projectId);
  if (!state) return null;
  const label = state === "running" ? "L'agent travaille" : "L'agent a du nouveau";
  return (
    <span
      data-slot="run-indicator"
      data-state={state}
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-2.5 shrink-0 rounded-full bg-violet-400 ring-2 ring-background",
        state === "running" && "animate-pulse motion-reduce:animate-none",
        className,
      )}
    />
  );
}
```

- [ ] **Step 4: Sidebar**

In `src/components/panels/AppSidebar.tsx`, add `import { RunIndicator } from "@/components/agent-runs/RunIndicator";` and, inside the « Mes miniatures » `SidebarMenuItem`, right after its closing `</SidebarMenuButton>`, add:

```tsx
                {/* Aggregated: the sidebar lists no project (visible in the collapsed rail too). */}
                <RunIndicator className="pointer-events-none absolute top-1.5 right-1.5" />
```

(`SidebarMenuItem` is already `relative`.)

- [ ] **Step 5: Cards**

In `src/app/miniatures/MiniaturesView.tsx`:
1. Add `import type { ReactNode } from "react";` (or add `type ReactNode` to the existing `react` import) and `import { RunIndicator } from "@/components/agent-runs/RunIndicator";`.
2. Change `function ProjectTile({ id }: { id: string }) {` to `function ProjectTile({ id, children }: { id: string; children?: ReactNode }) {`, and add `{children}` as the last child of its outer tile `div` (the one whose classes start with `relative flex aspect-video`), after the inner icon `div`.
3. Replace `<ProjectTile id={project.id} />` with:

```tsx
              <ProjectTile id={project.id}>
                <RunIndicator projectId={project.id} className="absolute top-3 right-3 size-3" />
              </ProjectTile>
```

- [ ] **Step 6: Run the test, type-check, lint**

Run: `./node_modules/.bin/vitest run tests/agent-runs` — expected: PASS.
Run: `./node_modules/.bin/tsc --noEmit` — expected: exit 0.
Run: `./node_modules/.bin/eslint src/components/agent-runs/RunIndicator.tsx src/components/panels/AppSidebar.tsx src/app/miniatures/MiniaturesView.tsx tests/agent-runs/run-indicator-render.test.tsx` — expected: only the pre-existing `set-state-in-effect` error of `MiniaturesView.tsx` (the `load()` effect), nothing new.

- [ ] **Step 7: Commit**

```bash
git add src/components/agent-runs/RunIndicator.tsx src/components/panels/AppSidebar.tsx src/app/miniatures/MiniaturesView.tsx tests/agent-runs/run-indicator-render.test.tsx
git commit -m "feat(agent): activity dots in the sidebar and on miniature cards" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Chat reconnection model — transport, resume decisions, orphan turn

**Files:**
- Create: `src/components/panels/chat/chat-transport.ts`, `src/components/panels/chat/resume-model.ts`
- Modify: `src/components/panels/chat/chat-view-model.ts`, `src/components/panels/chat/Message.tsx`, `src/components/panels/chat/MessageList.tsx`
- Test: `tests/chat/resume.test.ts`, `tests/chat/orphan-turn-render.test.tsx`

**Interfaces:**
- Consumes: (Task 1) `AGENT_BUSY_MESSAGE`, `AgentRunsSnapshot`; `DefaultChatTransport` from `ai`; `Chat` from `@ai-sdk/react` (test only); `lastAssistantMessageIsCompleteWithClientToolCalls`.
- Produces: `AGENT_CHAT_API = "/api/agent/chat"`, `agentStreamUrl(conversationId: string | null): string`, `agentStopUrl(conversationId: string): string`, `createAgentChatTransport({ getConversationId: () => string | null; onReconnectStatus?: (status: number) => void; fetch?: typeof fetch }): DefaultChatTransport<UIMessage>`, `type StopResult = "stopped" | "not-running" | "failed"`, `stopAgentRun(conversationId, fetchImpl?): Promise<StopResult>` (`chat-transport.ts`); `isAgentBusyError(error: unknown): boolean`, `withoutTrailingUserMessage(messages): UIMessage[]`, `resumeWithoutStreamOutcome({ conversationId, listedRunningBefore, runsNow }): { refetch: boolean; runningNow: boolean }`, `isOrphanUserTurn(messages, runningNow): boolean` (`resume-model.ts`); `trailingAssistantRow(messages, status, stopped, orphanUserTurn = false)`; `ChatTurnControls.orphanUserTurn?: boolean`.

- [ ] **Step 1: Write the failing tests**

Create `tests/chat/resume.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { Chat } from "@ai-sdk/react";
import type { UIMessage, UIMessageChunk } from "ai";
import { agentStreamUrl, createAgentChatTransport, stopAgentRun } from "@/components/panels/chat/chat-transport";
import {
  isAgentBusyError,
  isOrphanUserTurn,
  resumeWithoutStreamOutcome,
  withoutTrailingUserMessage,
} from "@/components/panels/chat/resume-model";
import { groupConsecutiveMessages, trailingAssistantRow } from "@/components/panels/chat/chat-view-model";
import { lastAssistantMessageIsCompleteWithClientToolCalls } from "@/components/panels/chat/should-auto-continue";
import { AGENT_BUSY_MESSAGE, type AgentRunsSnapshot } from "@/lib/agent/v2/run-types";

const sse = (chunks: UIMessageChunk[]) =>
  new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n", {
    status: 200,
    headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
  });
const msg = (id: string, role: UIMessage["role"], text = "x"): UIMessage => ({ id, role, parts: [{ type: "text", text }] });
const noRuns: AgentRunsSnapshot = { running: [], attention: [] };

/** A chat whose every request is recorded; GETs replay `chunks`, POSTs would start a paid turn. */
function recordingChat(initial: UIMessage[], chunks: UIMessageChunk[]) {
  const requests: string[] = [];
  const chat = new Chat<UIMessage>({
    messages: initial,
    transport: createAgentChatTransport({
      getConversationId: () => "conv-1",
      fetch: async (input, init) => {
        requests.push(`${init?.method ?? "GET"} ${String(input)}`);
        return sse(chunks);
      },
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithClientToolCalls,
  });
  return { chat, requests };
}

describe("agent chat transport", () => {
  it("reconnects with a GET to the active conversation's stream and reads 204 as no run", async () => {
    const calls: string[] = [];
    const statuses: number[] = [];
    const transport = createAgentChatTransport({
      getConversationId: () => "conv-1",
      onReconnectStatus: (status) => statuses.push(status),
      fetch: async (input, init) => {
        calls.push(`${init?.method ?? "GET"} ${String(input)}`);
        return new Response(null, { status: 204 });
      },
    });
    expect(await transport.reconnectToStream({ chatId: "local-chat-id" })).toBeNull();
    expect(calls).toEqual(["GET /api/agent/chat/conv-1/stream"]);
    expect(statuses).toEqual([204]);
    expect(agentStreamUrl(null)).toBe("/api/agent/chat/none/stream");
  });

  it("replays a turn paused on an image request without sending anything (no automatic model call)", async () => {
    const { chat, requests } = recordingChat([msg("u1", "user", "Ajoute mon logo")], [
      { type: "start" },
      { type: "start-step" },
      { type: "text-start", id: "t" },
      { type: "text-delta", id: "t", delta: "Il me faut ton logo." },
      { type: "text-end", id: "t" },
      { type: "tool-input-available", toolCallId: "req-1", toolName: "request_user_image", input: { reason: "Ton logo" } },
      { type: "finish-step" },
      { type: "finish" },
    ]);
    await chat.resumeStream();
    expect(requests).toEqual(["GET /api/agent/chat/conv-1/stream"]);
    expect(chat.status).toBe("ready");
    expect(chat.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(chat.messages[1].parts.some((p) => p.type === "tool-request_user_image" && "state" in p && p.state === "input-available")).toBe(true);
  });

  it("replays a continuation turn as a new assistant message, grouped with the previous one, still without sending", async () => {
    const { chat, requests } = recordingChat([msg("u1", "user"), msg("a1", "assistant", "Avant la demande")], [
      { type: "start" },
      { type: "start-step" },
      { type: "tool-input-available", toolCallId: "s1", toolName: "get_canvas_state", input: { project_id: "p" } },
      { type: "tool-output-available", toolCallId: "s1", output: { content: [{ type: "text", text: "{}" }] } },
      { type: "finish-step" },
      { type: "finish" },
    ]);
    await chat.resumeStream();
    expect(requests).toHaveLength(1);
    expect(chat.messages.map((m) => m.role)).toEqual(["user", "assistant", "assistant"]);
    expect(chat.messages[2].id).not.toBe("a1");
    expect(groupConsecutiveMessages(chat.messages).map((group) => group.messages.length)).toEqual([1, 2]);
  });

  it("asks the server to stop with a JSON POST and reports the outcome", async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => Response.json({ stopped: true }));
    expect(await stopAgentRun("conv-1", fetchMock as unknown as typeof fetch)).toBe("stopped");
    expect(fetchMock).toHaveBeenCalledWith("/api/agent/chat/conv-1/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(await stopAgentRun("conv-1", (async () => Response.json({ stopped: false })) as typeof fetch)).toBe("not-running");
    expect(await stopAgentRun("conv-1", (async () => new Response("", { status: 500 })) as typeof fetch)).toBe("failed");
    expect(await stopAgentRun("conv-1", (async () => { throw new TypeError("fetch failed"); }) as typeof fetch)).toBe("failed");
  });
});

describe("resume model", () => {
  it("recognizes the 409 of a busy conversation", () => {
    expect(isAgentBusyError(new Error(AGENT_BUSY_MESSAGE))).toBe(true);
    expect(isAgentBusyError(new Error("Clé OpenRouter non configurée."))).toBe(false);
    expect(isAgentBusyError(undefined)).toBe(false);
  });

  it("drops the optimistic user message only", () => {
    const history = [msg("u0", "user"), msg("a0", "assistant")];
    expect(withoutTrailingUserMessage([...history, msg("u1", "user")])).toEqual(history);
    expect(withoutTrailingUserMessage(history)).toBe(history);
  });

  it("refetches after a 204 when the turn was running or is listed now", () => {
    expect(resumeWithoutStreamOutcome({ conversationId: "c1", listedRunningBefore: true, runsNow: noRuns })).toEqual({ refetch: true, runningNow: false });
    const ended: AgentRunsSnapshot = { running: [], attention: [{ conversationId: "c1", projectId: "p", projectName: "P", kind: "finished", endedAt: 2 }] };
    expect(resumeWithoutStreamOutcome({ conversationId: "c1", listedRunningBefore: false, runsNow: ended })).toEqual({ refetch: true, runningNow: false });
    const running: AgentRunsSnapshot = { running: [{ conversationId: "c1", projectId: "p", projectName: "P", startedAt: 1 }], attention: [] };
    expect(resumeWithoutStreamOutcome({ conversationId: "c1", listedRunningBefore: false, runsNow: running })).toEqual({ refetch: true, runningNow: true });
    expect(resumeWithoutStreamOutcome({ conversationId: "c1", listedRunningBefore: false, runsNow: noRuns })).toEqual({ refetch: false, runningNow: false });
  });

  it("an unanswered user message with no running turn is an interrupted turn (e.g. after a restart)", () => {
    expect(isOrphanUserTurn([msg("u0", "user")], false)).toBe(true);
    expect(isOrphanUserTurn([msg("u0", "user")], true)).toBe(false);
    expect(isOrphanUserTurn([msg("u0", "user"), msg("a0", "assistant")], false)).toBe(false);
    expect(isOrphanUserTurn([], false)).toBe(false);
  });

  it("shows « Tour interrompu » after an orphan user message, never while busy or on an empty list", () => {
    const orphan = [msg("u0", "user")];
    expect(trailingAssistantRow(orphan, "ready", null, true)).toBe("interrupted");
    expect(trailingAssistantRow(orphan, "ready", null)).toBeNull();
    expect(trailingAssistantRow(orphan, "submitted", null, true)).toBe("progress");
    expect(trailingAssistantRow([], "ready", null, true)).toBeNull();
    expect(trailingAssistantRow([...orphan, msg("a0", "assistant")], "ready", null, true)).toBeNull();
  });
});
```

Create `tests/chat/orphan-turn-render.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReactFlowProvider } from "@xyflow/react";
import type { UIMessage } from "ai";
import MessageList from "@/components/panels/chat/MessageList";
import type { ChatTurnControls } from "@/components/panels/chat/Message";

const controls = (overrides: Partial<ChatTurnControls> = {}): ChatTurnControls => ({
  status: "ready",
  errorMessage: null,
  turnStartedAt: null,
  stoppedLive: false,
  liveTurnStart: null,
  onAskAgent: () => {},
  onRetry: () => {},
  ...overrides,
});

const messages: UIMessage[] = [{ id: "u1", role: "user", parts: [{ type: "text", text: "Fais un croquis" }] }];

const render = (c: ChatTurnControls) =>
  renderToStaticMarkup(
    <ReactFlowProvider>
      <MessageList messages={messages} controls={c} />
    </ReactFlowProvider>,
  );

describe("orphan user turn", () => {
  it("reads « Tour interrompu » with « Réessayer » under the unanswered message", () => {
    const html = render(controls({ orphanUserTurn: true }));
    expect(html).toContain("Tour interrompu");
    expect(html).toContain("Réessayer");
  });

  it("shows nothing under the message without the flag", () => {
    expect(render(controls())).not.toContain("Tour interrompu");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `./node_modules/.bin/vitest run tests/chat/resume.test.ts tests/chat/orphan-turn-render.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/panels/chat/chat-transport"`; the render test fails on `orphanUserTurn` (TypeScript is not checked by vitest, the markup lacks « Tour interrompu »).

- [ ] **Step 3: Transport**

Create `src/components/panels/chat/chat-transport.ts`:

```ts
import { DefaultChatTransport, type UIMessage } from "ai";

export const AGENT_CHAT_API = "/api/agent/chat";

/** GET: replays the running turn, 204 when none runs. */
export function agentStreamUrl(conversationId: string | null): string {
  return `${AGENT_CHAT_API}/${encodeURIComponent(conversationId ?? "none")}/stream`;
}

export function agentStopUrl(conversationId: string): string {
  return `${AGENT_CHAT_API}/${encodeURIComponent(conversationId)}/stop`;
}

/**
 * The chat's transport: sends to POST /api/agent/chat as before, and reconnects
 * (useChat's resumeStream) to the ACTIVE conversation's run — never to useChat's
 * own local chat id. `onReconnectStatus` reports each GET's HTTP status (200
 * replay, 204 nothing runs), which resumeStream() itself does not expose.
 */
export function createAgentChatTransport({
  getConversationId,
  onReconnectStatus,
  fetch: fetchImpl,
}: {
  getConversationId: () => string | null;
  onReconnectStatus?: (status: number) => void;
  fetch?: typeof fetch;
}): DefaultChatTransport<UIMessage> {
  return new DefaultChatTransport<UIMessage>({
    api: AGENT_CHAT_API,
    fetch: async (input, init) => {
      const response = await (fetchImpl ?? globalThis.fetch)(input, init);
      if ((init?.method ?? "GET").toUpperCase() === "GET") onReconnectStatus?.(response.status);
      return response;
    },
    prepareReconnectToStreamRequest: () => ({ api: agentStreamUrl(getConversationId()) }),
  });
}

export type StopResult = "stopped" | "not-running" | "failed";

/** « Arrêter »: the server aborts the turn and saves it; the stream then ends by itself. */
export async function stopAgentRun(conversationId: string, fetchImpl: typeof fetch = globalThis.fetch): Promise<StopResult> {
  try {
    const response = await fetchImpl(agentStopUrl(conversationId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!response.ok) return "failed";
    const data = (await response.json()) as { stopped?: unknown };
    return data.stopped === true ? "stopped" : "not-running";
  } catch {
    return "failed";
  }
}
```

- [ ] **Step 4: Resume model**

Create `src/components/panels/chat/resume-model.ts`:

```ts
import type { UIMessage } from "ai";
import { AGENT_BUSY_MESSAGE, type AgentRunsSnapshot } from "@/lib/agent/v2/run-types";

/** The 409 of a conversation where a turn already runs (DefaultChatTransport throws the response text). */
export function isAgentBusyError(error: unknown): boolean {
  return error instanceof Error && error.message.trim() === AGENT_BUSY_MESSAGE;
}

/** The refused send's optimistic user message goes away; anything else stays. */
export function withoutTrailingUserMessage(messages: UIMessage[]): UIMessage[] {
  return messages.at(-1)?.role === "user" ? messages.slice(0, -1) : messages;
}

/**
 * After a reconnection answered 204: the history is refetched when the turn was
 * running when the page looked (it has just ended) or the registry lists it now.
 */
export function resumeWithoutStreamOutcome(input: {
  conversationId: string;
  listedRunningBefore: boolean;
  runsNow: AgentRunsSnapshot;
}): { refetch: boolean; runningNow: boolean } {
  const runningNow = input.runsNow.running.some((run) => run.conversationId === input.conversationId);
  const endedNow = input.runsNow.attention.some((entry) => entry.conversationId === input.conversationId);
  return { refetch: input.listedRunningBefore || runningNow || endedNow, runningNow };
}

/** A user message nobody answers and no turn running: the turn was cut (server restart). */
export function isOrphanUserTurn(messages: UIMessage[], runningNow: boolean): boolean {
  return !runningNow && messages.at(-1)?.role === "user";
}
```

- [ ] **Step 5: Trailing row, controls, list**

In `src/components/panels/chat/chat-view-model.ts`, replace the whole `trailingAssistantRow` function with:

```ts
/**
 * The assistant row to show at the end of the list while the running (or failed, or stopped) turn has no assistant message.
 * `orphanUserTurn`: the conversation was reopened on a user message the server never answered and no turn runs.
 */
export function trailingAssistantRow(
  messages: UIMessage[],
  status: ChatStatus,
  stopped: StoppedPlacement,
  orphanUserTurn = false,
): TrailingRow {
  const last = messages.at(-1);
  // No message at all: a new conversation's first send whose user message is not shown yet.
  if (!last || last.role === "user") {
    if (isBusyStatus(status)) return "progress";
    if (status === "error") return "error";
    return stopped === "trailing" || (orphanUserTurn && last !== undefined) ? "interrupted" : null;
  }
  // The last message is an older turn's answer: the stopped turn produced nothing.
  if (!isBusyStatus(status) && status !== "error" && stopped === "trailing") return "interrupted";
  return null;
}
```

In `src/components/panels/chat/Message.tsx`, in `ChatTurnControls`, after `liveTurnStart: LiveTurnStart | null;` add:

```ts
  /** Reopened on a user message the server never answered, with no turn running (« Tour interrompu »). */
  orphanUserTurn?: boolean;
```

In `src/components/panels/chat/MessageList.tsx`, replace

```tsx
  const trailing = trailingAssistantRow(messages, controls.status, stopped);
```

with

```tsx
  const trailing = trailingAssistantRow(messages, controls.status, stopped, controls.orphanUserTurn ?? false);
```

- [ ] **Step 6: Run the tests, type-check, lint**

Run: `./node_modules/.bin/vitest run tests/chat` — expected: PASS (existing chat tests unchanged, new ones green).
Run: `./node_modules/.bin/tsc --noEmit` — expected: exit 0. If `transport.reconnectToStream({ chatId })` needs more fields in its type, add `metadata: undefined, headers: undefined, body: undefined` in the test call.
Run: `./node_modules/.bin/eslint src/components/panels/chat/chat-transport.ts src/components/panels/chat/resume-model.ts src/components/panels/chat/chat-view-model.ts src/components/panels/chat/Message.tsx src/components/panels/chat/MessageList.tsx tests/chat/resume.test.ts tests/chat/orphan-turn-render.test.tsx` — expected: no new error.

- [ ] **Step 7: Commit**

```bash
git add src/components/panels/chat/chat-transport.ts src/components/panels/chat/resume-model.ts src/components/panels/chat/chat-view-model.ts src/components/panels/chat/Message.tsx src/components/panels/chat/MessageList.tsx tests/chat/resume.test.ts tests/chat/orphan-turn-render.test.tsx
git commit -m "feat(chat): reconnection transport and resume decisions" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Wire the chat panel — reconnect, stop on the server, 409, conversation choice

**Files:**
- Modify: `src/components/panels/ChatPanel.tsx` (full replacement), `src/components/panels/chat/useConversations.ts` (full replacement)
- Test: `tests/chat/chat-panel-safety.test.ts`

**Interfaces:**
- Consumes: (Task 3/4) the routes; (Task 5) `toast`; (Task 6) `useAgentRuns`, `pickConversationId`; (Task 8) `createAgentChatTransport`, `stopAgentRun`, `isAgentBusyError`, `withoutTrailingUserMessage`, `resumeWithoutStreamOutcome`, `isOrphanUserTurn`, `ChatTurnControls.orphanUserTurn`; existing `chat-view-model`, `turn-model`, `history-to-ui-messages`, `useChatStore` (`addAttachment`, `setDraft`, `setActive`, `bumpConversationListVersion`).
- Produces: nothing new for other tasks (UI wiring).

- [ ] **Step 1: Write the failing guard test**

Create `tests/chat/chat-panel-safety.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Paid-call guards on the panel's wiring (behaviour itself is tested on the
// pure modules it uses and checked in the browser with the fake model).
const source = fs.readFileSync(path.join(process.cwd(), "src/components/panels/ChatPanel.tsx"), "utf8");

describe("ChatPanel wiring", () => {
  it("never lets useChat resume or send on its own", () => {
    expect(source).not.toMatch(/\bresume\s*:/);
    expect(source).toContain("sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithClientToolCalls");
    expect(source.match(/sendAutomaticallyWhen/g)).toHaveLength(1);
  });

  it("reconnects through the conversation transport and stops on the server", () => {
    expect(source).toContain("createAgentChatTransport(");
    expect(source).not.toContain("new DefaultChatTransport");
    expect(source).toContain("resumeStream()");
    expect(source).toContain("stopAgentRun(");
    expect(source).toContain("orphanUserTurn");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/chat/chat-panel-safety.test.ts`
Expected: FAIL — `createAgentChatTransport(` not found.

- [ ] **Step 3: Replace `ChatPanel.tsx`**

First `git diff 2815807 -- src/components/panels/ChatPanel.tsx`; carry any change into the version below. Replace the whole file with:

```tsx
"use client";
import { useEffect, useMemo, useCallback, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { lastAssistantMessageIsCompleteWithClientToolCalls } from "./chat/should-auto-continue";
import { useChatStore, type ChatAttachment } from "@/store/chat-store";
import { useCanvasStore } from "@/store/canvas-store";
import ChatHeader from "./chat/ChatHeader";
import AgentAvatar from "./chat/AgentAvatar";
import MessageList from "./chat/MessageList";
import Composer from "./chat/Composer";
import PendingUiAction, { PendingToolPart } from "./chat/PendingUiAction";
import ImageAnnotateModal from "./chat/ImageAnnotateModal";
import type { ChatTurnControls } from "./chat/Message";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toast";
import { useAgentRuns } from "@/components/agent-runs/AgentRunsProvider";
import { AGENT_BUSY_MESSAGE } from "@/lib/agent/v2/run-types";
import { rowsToUIMessages, type StoredMessageRow } from "./chat/history-to-ui-messages";
import { snapshotCanvas } from "./chat/canvas-snapshot";
import { createAgentChatTransport, stopAgentRun } from "./chat/chat-transport";
import { isAgentBusyError, isOrphanUserTurn, resumeWithoutStreamOutcome, withoutTrailingUserMessage } from "./chat/resume-model";
import {
  conversationChangeEffects,
  liveTurnStart,
  retryableUserText,
  shouldRefetchAfterResume,
  type LiveTurnStart,
} from "./chat/chat-view-model";
import { isBusyStatus } from "./chat/turn-model";

// Per-browser UI preference, so a minimised agent stays minimised on reload.
const OPEN_STORAGE_KEY = "thumbgen.chat.open";
/** « Arrêter » also abandons the local stream if the server has not ended it by then. */
const STOP_FALLBACK_MS = 10_000;

function readStoredOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

async function loadHistoryMessages(conversationId: string): Promise<UIMessage[]> {
  const rows = (await fetch(`/api/agent/conversations/${conversationId}/messages`).then((r) => r.json())) as StoredMessageRow[];
  return rowsToUIMessages(rows);
}

const isActiveConversation = (conversationId: string) => useChatStore.getState().activeConversationId === conversationId;

/**
 * Right-side chat panel. Mounted from Canvas, on the miniature page only.
 *
 * Lifecycle (chantier F1: a turn belongs to the server, not to this page):
 *   - Opening a conversation loads its history, then reconnects to the turn the
 *     server may be running there (resumeStream → GET …/stream, 204 if none).
 *   - A send streams as before; leaving the page only drops the local stream.
 *   - « Arrêter » asks the server (POST …/stop); the stream ends by itself.
 *   - At the end of any turn: canonical refetch of the history (skipped when
 *     the turn failed, so the failed message and its error stay visible).
 */
export default function ChatPanel({ projectId }: { projectId: string }) {
  const [open, setOpenState] = useState(readStoredOpen);
  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    try {
      localStorage.setItem(OPEN_STORAGE_KEY, String(next));
    } catch {
      // Storage unavailable (private mode): the choice just won't persist.
    }
  }, []);

  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const draft = useChatStore((s) => s.draft);
  const setDraft = useChatStore((s) => s.setDraft);
  const attachments = useChatStore((s) => s.attachments);
  const clearAttachments = useChatStore((s) => s.clearAttachments);

  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);

  const { snapshot: runsSnapshot, refreshRuns } = useAgentRuns();
  const runsSnapshotRef = useRef(runsSnapshot);
  useEffect(() => {
    runsSnapshotRef.current = runsSnapshot;
  }, [runsSnapshot]);

  // Start of the running turn (or of the reconnected one), for the live timer.
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null);
  // Conversation whose turn the user stopped: its last turn reads « Tour interrompu » until the next send.
  const [stoppedConversationId, setStoppedConversationId] = useState<string | null>(null);
  // Messages present when the running turn started: « Arrêter » never marks an older turn interrupted.
  const [liveTurn, setLiveTurn] = useState<LiveTurnStart | null>(null);
  // Conversation reopened on a user message the server never answered (e.g. after a restart).
  const [orphanConversationId, setOrphanConversationId] = useState<string | null>(null);
  // Set by useChat's onError during a turn, so that turn keeps its live messages instead of the refetch.
  const turnFailedRef = useRef(false);
  // Set by onError when the send got a 409: a turn already runs in this conversation.
  const busyConflictRef = useRef(false);
  // Conversation the first send just created: its (empty) history is not loaded over the live messages.
  const createdConversationIdRef = useRef<string | null>(null);
  // Conversation of a resumed turn (client-request answer or reconnection), refetched once it ends.
  const resumedConversationIdRef = useRef<string | null>(null);
  // HTTP status of the last reconnection: 200 replays a run, 204 means none runs.
  const reconnectStatusRef = useRef<number | null>(null);
  const stopFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // « Arrêter » pressed before the server registered the turn: sent again at the first chunk.
  const pendingStopRef = useRef<string | null>(null);

  const transport = useMemo(
    () =>
      createAgentChatTransport({
        getConversationId: () => useChatStore.getState().activeConversationId,
        onReconnectStatus: (status) => {
          reconnectStatusRef.current = status;
        },
      }),
    [],
  );

  const {
    messages: chatMessages,
    status,
    sendMessage,
    regenerate,
    stop,
    resumeStream,
    addToolOutput,
    setMessages,
    error,
    clearError,
  } = useChat({
    // Seeded by the history effect below as soon as a conversation is active.
    messages: [],
    transport,
    // Auto-resumes ONLY once a client tool (request_user_image) was resolved via
    // addToolOutput — see the function's doc comment. A reconnection never
    // produces a resolved client request, so it never triggers a send.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithClientToolCalls,
    onError: (turnError) => {
      turnFailedRef.current = true;
      if (isAgentBusyError(turnError)) busyConflictRef.current = true;
    },
  });

  const annotateImageUrl = useChatStore((s) => s.annotateImageUrl);
  const closeAnnotate = useChatStore((s) => s.closeAnnotate);

  // When project changes, clear active conv so useConversations picks the new project's conversation.
  useEffect(() => {
    useChatStore.getState().setActive(null);
  }, [projectId]);

  // Reconnects to the turn the server may be running for this conversation.
  // Never starts one: a GET that answers 204 when nothing runs.
  const resumeConversation = useCallback(
    async (conversationId: string, history: UIMessage[]) => {
      if (!isActiveConversation(conversationId)) return;
      const listedRun = runsSnapshotRef.current.running.find((run) => run.conversationId === conversationId) ?? null;
      setStoppedConversationId(null);
      setOrphanConversationId(null);
      setLiveTurn(liveTurnStart(history));
      setTurnStartedAt(listedRun?.startedAt ?? Date.now());
      turnFailedRef.current = false;
      resumedConversationIdRef.current = conversationId;
      reconnectStatusRef.current = null;
      await resumeStream();
      if (reconnectStatusRef.current === 200) {
        // A run was replayed to its end: the status effect below refetches the canonical history.
        return;
      }
      resumedConversationIdRef.current = null;
      if (reconnectStatusRef.current !== 204 || !isActiveConversation(conversationId)) return;
      const runsNow = await refreshRuns();
      if (!isActiveConversation(conversationId)) return;
      const outcome = resumeWithoutStreamOutcome({ conversationId, listedRunningBefore: listedRun !== null, runsNow });
      let messages = history;
      if (outcome.refetch) {
        messages = await loadHistoryMessages(conversationId);
        if (!isActiveConversation(conversationId)) return;
        setMessages(messages);
      }
      if (isOrphanUserTurn(messages, outcome.runningNow)) setOrphanConversationId(conversationId);
    },
    [resumeStream, refreshRuns, setMessages],
  );

  // Load the persisted history when the active conversation changes, then
  // reconnect. A conversation that ensureConversation just created for the
  // first send is skipped entirely (its live messages and error stay). Any
  // other change first drops the local stream — the server turn goes on.
  useEffect(() => {
    const effects = conversationChangeEffects(activeConversationId, createdConversationIdRef.current);
    if (activeConversationId !== createdConversationIdRef.current) createdConversationIdRef.current = null;
    if (effects.stopRunningTurn) void stop();
    if (!effects.loadHistory) return;
    let cancelled = false;
    const load = async () => {
      if (!activeConversationId) {
        if (!cancelled) {
          setMessages([]);
          clearError();
          setOrphanConversationId(null);
        }
        return;
      }
      const history = await loadHistoryMessages(activeConversationId);
      if (cancelled) return;
      setMessages(history);
      clearError();
      void resumeConversation(activeConversationId, history);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [activeConversationId, setMessages, clearError, stop, resumeConversation]);

  // Leaving the page only drops the local stream; the server keeps running the turn.
  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  // The last message's pending client-tool part, only in state "input-available"
  // (offering a resolution in any other state is unsafe — see chantier E).
  const pendingToolPart = useMemo<PendingToolPart | undefined>(() => {
    const lastMessage = chatMessages.at(-1);
    return lastMessage?.role === "assistant"
      ? lastMessage.parts.find(
          (p): p is PendingToolPart =>
            (p.type === "tool-request_user_image" || p.type === "tool-request_user_sketch") &&
            p.state === "input-available",
        )
      : undefined;
  }, [chatMessages]);

  // Resolves PendingUiAction's pending part via useChat's addToolOutput. `options.body`
  // is required: the auto-continuation goes through the same transport as a send.
  const respondToUiTool = useCallback(
    (toolCallId: string, result: unknown) => {
      if (!pendingToolPart) return;
      const toolName = pendingToolPart.type.slice("tool-".length) as "request_user_image" | "request_user_sketch";
      setStoppedConversationId(null);
      setOrphanConversationId(null);
      setLiveTurn(liveTurnStart(chatMessages, chatMessages.at(-1)?.id ?? null));
      setTurnStartedAt(Date.now());
      turnFailedRef.current = false;
      resumedConversationIdRef.current = activeConversationId;
      void addToolOutput({
        tool: toolName,
        toolCallId,
        output: result,
        options: {
          body: {
            conversation_id: activeConversationId,
            project_id: projectId,
            canvas_snapshot: snapshotCanvas(nodes, edges),
          },
        },
      });
    },
    [addToolOutput, pendingToolPart, chatMessages, activeConversationId, projectId, nodes, edges],
  );

  // Canonical refetch for a resumed turn (client-request answer or reconnection),
  // once its status goes from busy back to ready (runTurn does it for the others).
  const previousStatusRef = useRef(status);
  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = status;
    const conversationId = resumedConversationIdRef.current;
    const refetch = shouldRefetchAfterResume({
      previousStatus,
      status,
      resumedConversationId: conversationId,
      turnFailed: turnFailedRef.current,
    });
    if (conversationId !== null && isBusyStatus(previousStatus) && !isBusyStatus(status)) {
      resumedConversationIdRef.current = null;
    }
    if (!refetch || conversationId === null) return;
    void (async () => {
      const messages = await loadHistoryMessages(conversationId);
      if (!isActiveConversation(conversationId)) return;
      setMessages(messages);
      useChatStore.getState().bumpConversationListVersion();
    })();
  }, [status, setMessages]);

  // Indicators elsewhere follow this page's turns without waiting for the next poll.
  useEffect(() => {
    if (status === "streaming" || status === "ready" || status === "error") void refreshRuns();
  }, [status, refreshRuns]);

  // « Arrêter » bookkeeping: a stop pressed too early is re-sent at the first
  // chunk; nothing pending survives the end of the turn.
  useEffect(() => {
    if (status === "streaming" && pendingStopRef.current !== null) {
      const conversationId = pendingStopRef.current;
      pendingStopRef.current = null;
      void stopAgentRun(conversationId).then((result) => {
        if (result === "failed") void stop();
      });
    }
    if (isBusyStatus(status)) return;
    pendingStopRef.current = null;
    if (stopFallbackRef.current !== null) {
      clearTimeout(stopFallbackRef.current);
      stopFallbackRef.current = null;
    }
  }, [status, stop]);

  // Auto-create a conversation if none is active, so a send never needs a second click.
  const ensureConversation = useCallback(async (): Promise<string | null> => {
    if (activeConversationId) return activeConversationId;
    const r = await fetch("/api/agent/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId }),
    });
    if (!r.ok) return null;
    const conv = (await r.json()) as { id: string };
    createdConversationIdRef.current = conv.id;
    useChatStore.getState().setActive(conv.id);
    return conv.id;
  }, [activeConversationId, projectId]);

  // Attachments go as a sibling `attachments` field (stored:<id> references), not AI SDK file parts.
  const requestBody = useCallback(
    (conversationId: string, attachmentsToSend: ChatAttachment[] = []) => ({
      conversation_id: conversationId,
      project_id: projectId,
      canvas_snapshot: snapshotCanvas(nodes, edges),
      attachments: attachmentsToSend.map((a) => ({ type: "image" as const, source: a.source })),
    }),
    [projectId, nodes, edges],
  );

  // Runs one turn (a send, an « Et maintenant » reply or a « Réessayer »), then
  // canonicalizes the conversation from the DB. `restoreInput` puts back what a
  // refused send (409) had taken from the composer.
  const runTurn = useCallback(
    async (conversationId: string, start: () => Promise<void>, restoreInput?: () => void) => {
      setStoppedConversationId(null);
      setOrphanConversationId(null);
      setLiveTurn(liveTurnStart(chatMessages));
      setTurnStartedAt(Date.now());
      turnFailedRef.current = false;
      busyConflictRef.current = false;
      resumedConversationIdRef.current = null;
      await start();

      if (busyConflictRef.current) {
        // 409: the server already runs a turn here (another tab, or one not reconnected yet).
        busyConflictRef.current = false;
        setMessages((messages) => withoutTrailingUserMessage(messages));
        clearError();
        restoreInput?.();
        toast({ title: AGENT_BUSY_MESSAGE });
        if (!isActiveConversation(conversationId)) return;
        const history = await loadHistoryMessages(conversationId);
        if (!isActiveConversation(conversationId)) return;
        setMessages(history);
        await resumeConversation(conversationId, history);
        return;
      }
      // A failed turn keeps its live messages: the refetch would drop the
      // user's unsaved message together with the error row under it.
      if (turnFailedRef.current) return;

      const messages = await loadHistoryMessages(conversationId);
      if (!isActiveConversation(conversationId)) return;
      setMessages(messages);
      // Picks up an auto-generated title (fire-and-forget on the first turn).
      useChatStore.getState().bumpConversationListVersion();
    },
    [chatMessages, setMessages, clearError, resumeConversation],
  );

  const onSend = useCallback(async () => {
    const conversationId = await ensureConversation();
    if (!conversationId) return;
    const text = draft;
    const attachmentsToSend = attachments;
    setDraft("");
    clearAttachments();
    await runTurn(
      conversationId,
      () => sendMessage({ text }, { body: requestBody(conversationId, attachmentsToSend) }),
      () => {
        const store = useChatStore.getState();
        store.setDraft(text);
        for (const attachment of attachmentsToSend) store.addAttachment(attachment);
      },
    );
  }, [ensureConversation, draft, attachments, setDraft, clearAttachments, runTurn, sendMessage, requestBody]);

  const busy = isBusyStatus(status);

  // « Et maintenant » → ask_agent: same path as the composer, without touching the draft.
  const onAskAgent = useCallback(
    (message: string) => {
      if (busy) return;
      void (async () => {
        const conversationId = await ensureConversation();
        if (!conversationId) return;
        await runTurn(conversationId, () => sendMessage({ text: message }, { body: requestBody(conversationId) }));
      })();
    },
    [busy, ensureConversation, runTurn, sendMessage, requestBody],
  );

  // « Réessayer »: regenerate re-runs the last user message (text only).
  const retryText = retryableUserText(chatMessages);
  const onRetry = useMemo(() => {
    if (busy || !retryText || !activeConversationId) return null;
    const conversationId = activeConversationId;
    return () => {
      void runTurn(conversationId, () => regenerate({ body: requestBody(conversationId) }));
    };
  }, [busy, retryText, activeConversationId, runTurn, regenerate, requestBody]);

  // « Arrêter »: the server stops and saves the turn, then its stream ends by
  // itself. A local stop() alone would leave the paid turn running on the server.
  const onStop = useCallback(() => {
    const conversationId = activeConversationId;
    setStoppedConversationId(conversationId);
    const stopLocally = () => {
      if (stopFallbackRef.current !== null) {
        clearTimeout(stopFallbackRef.current);
        stopFallbackRef.current = null;
      }
      void stop();
    };
    if (!conversationId) {
      stopLocally();
      return;
    }
    if (stopFallbackRef.current !== null) clearTimeout(stopFallbackRef.current);
    stopFallbackRef.current = setTimeout(stopLocally, STOP_FALLBACK_MS);
    void stopAgentRun(conversationId).then((result) => {
      if (result === "failed") stopLocally();
      else if (result === "not-running") pendingStopRef.current = conversationId;
    });
  }, [activeConversationId, stop]);

  const controls = useMemo<ChatTurnControls>(
    () => ({
      status,
      errorMessage: error?.message ?? null,
      turnStartedAt,
      stoppedLive: stoppedConversationId !== null && stoppedConversationId === activeConversationId,
      liveTurnStart: liveTurn,
      orphanUserTurn: orphanConversationId !== null && orphanConversationId === activeConversationId,
      onAskAgent,
      onRetry,
    }),
    [status, error, turnStartedAt, stoppedConversationId, activeConversationId, liveTurn, orphanConversationId, onAskAgent, onRetry],
  );

  return (
    <>
      {/* Kept mounted while minimised so scroll position and any in-flight
          stream survive a minimise/reopen; `hidden` only removes it from view. */}
      <aside
        hidden={!open}
        className="fixed right-4 bottom-4 z-40 h-[min(640px,calc(100vh-2rem))] w-[400px] max-w-[calc(100vw-2rem)] origin-bottom-right animate-in fade-in zoom-in-95 duration-150 motion-reduce:animate-none"
      >
        <Card className="flex h-full flex-col gap-0 overflow-hidden py-0 shadow-2xl">
          <ChatHeader projectId={projectId} status={status} onMinimize={() => setOpen(false)} />

          <CardContent className="flex flex-1 flex-col overflow-hidden p-0">
            <MessageList messages={chatMessages} controls={controls} />

            {/* A pending client request stays visible, outside the folded steps, right above the composer. */}
            {pendingToolPart && (
              <PendingUiAction part={pendingToolPart} onResolve={respondToUiTool} />
            )}
          </CardContent>

          <CardFooter className="p-0">
            <Composer onSend={onSend} status={status} onStop={onStop} />
          </CardFooter>
        </Card>
      </aside>

      {!open && (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label="Ouvrir l'agent"
                className="fixed right-4 bottom-4 z-40 rounded-2xl transition-transform duration-200 animate-in fade-in zoom-in-75 hover:-translate-y-0.5 motion-reduce:animate-none motion-reduce:transition-none motion-reduce:hover:translate-y-0 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <AgentAvatar size="lg" />
                {busy && (
                  <span className="absolute -top-1 -right-1 flex size-3.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full motion-reduce:animate-none bg-violet-400 opacity-75" />
                    <span className="relative inline-flex size-3.5 rounded-full border-2 border-background bg-violet-400" />
                  </span>
                )}
              </button>
            }
          />
          <TooltipContent side="left">
            <p>{busy ? "L'agent travaille…" : "Ouvrir l'agent"}</p>
          </TooltipContent>
        </Tooltip>
      )}

      {annotateImageUrl && (
        <ImageAnnotateModal imageUrl={annotateImageUrl} onClose={closeAnnotate} />
      )}
    </>
  );
}
```

- [ ] **Step 4: Replace `useConversations.ts`**

Replace `src/components/panels/chat/useConversations.ts` with:

```ts
"use client";
import { useCallback, useEffect, useState } from "react";
import { useChatStore } from "@/store/chat-store";
import { useAgentRuns } from "@/components/agent-runs/AgentRunsProvider";
import { pickConversationId } from "@/components/agent-runs/agent-runs-model";

export type Conversation = { id: string; title: string; updated_at: string };

/**
 * The project's conversations plus create/remove. When nothing is active it
 * selects, from a fresh runs snapshot, the conversation where the agent works
 * (or has just finished), else the most recent one. Refetches whenever the chat
 * store's list version is bumped (e.g. after a send, when an auto title lands).
 */
export function useConversations(projectId: string) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setActive = useChatStore((s) => s.setActive);
  const conversationListVersion = useChatStore((s) => s.conversationListVersion);
  const { refreshRuns } = useAgentRuns();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agent/conversations?project_id=${encodeURIComponent(projectId)}`);
      const list = (await res.json()) as Conversation[];
      setConversations(list);
      if (!useChatStore.getState().activeConversationId && list.length > 0) {
        const runs = await refreshRuns();
        if (!useChatStore.getState().activeConversationId) setActive(pickConversationId(list, runs, projectId));
      }
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, setActive, refreshRuns]);

  useEffect(() => {
    reload();
  }, [reload, conversationListVersion]);

  const create = useCallback(async () => {
    const res = await fetch("/api/agent/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId }),
    });
    if (!res.ok) return;
    const conversation = (await res.json()) as Conversation;
    setConversations((prev) => [conversation, ...prev]);
    setActive(conversation.id);
  }, [projectId, setActive]);

  const remove = useCallback(
    async (id: string) => {
      // The server also stops a turn still running in this conversation.
      const res = await fetch(`/api/agent/conversations/${id}`, { method: "DELETE" });
      if (!res.ok) return;
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (useChatStore.getState().activeConversationId === id) setActive(null);
    },
    [setActive],
  );

  const active = conversations.find((c) => c.id === activeConversationId) ?? null;

  return { conversations, active, activeConversationId, loading, create, remove, select: setActive };
}
```

- [ ] **Step 5: Run the tests, type-check, lint**

Run: `./node_modules/.bin/vitest run tests/chat/chat-panel-safety.test.ts` — expected: PASS.
Run: `./node_modules/.bin/vitest run` — expected: all tests pass.
Run: `./node_modules/.bin/tsc --noEmit` — expected: exit 0.
Run: `./node_modules/.bin/eslint src/components/panels/ChatPanel.tsx src/components/panels/chat/useConversations.ts tests/chat/chat-panel-safety.test.ts` — expected: no error (both files were clean before). If `react-hooks/refs` or `set-state-in-effect` fires on a new line, restructure that line as the rule suggests (move the ref write into an effect or the state update after an `await`) — never disable the rule.

- [ ] **Step 6: Commit**

```bash
git add src/components/panels/ChatPanel.tsx src/components/panels/chat/useConversations.ts tests/chat/chat-panel-safety.test.ts
git commit -m "feat(chat): reconnect to background turns, stop them on the server" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: Browser check with the fake server model (no model call)

**Files:** none modified (verification only). If a check fails, fix it in the file owned by the relevant task, re-run that task's tests, `tsc` and the checks below, and commit the fix separately (`fix(agent): …` / `fix(chat): …`) with that task's file list.

**Interfaces:**
- Consumes: everything from Tasks 1–9; `THUMBGEN_FAKE_AGENT` (Task 2).
- Produces: a pass/fail report for each numbered check below.

**Safety rules for this task.** Only the throwaway dev server on port **3100** with blank keys and `THUMBGEN_FAKE_AGENT=1`; never `localhost:3000`, never `data/thumbgen.db`. Never click « Générer ». The only chat requests allowed are those answered by the fake model — its `console.warn` line must appear in the server log once per accepted turn.

- [ ] **Step 1: Start the throwaway server**

```bash
FIXTURE_DIR="$(mktemp -d)"; echo "$FIXTURE_DIR"
```

Use the printed directory literally below (shell variables do not survive between tool calls). Start in the background:

```bash
THUMBGEN_FAKE_AGENT=1 THUMBGEN_DB_PATH="<FIXTURE_DIR>/thumbgen.db" OPENROUTER_API_KEY= OPENAI_API_KEY= YOUTUBE_API_KEY= ./node_modules/.bin/next dev -p 3100 > "<FIXTURE_DIR>/next.log" 2>&1
```

Wait, then create a project:

```bash
until curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/miniatures | grep -qE "^(200|307|308)$"; do sleep 2; done
curl -s -X POST http://localhost:3100/api/projects -H "Content-Type: application/json" -d '{"name":"F1 vérification"}'
```

Expected: JSON with `"id":"proj_…"`. Note `<PROJECT_ID>`.

- [ ] **Step 2: Free guards (curl)**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3100/api/agent/chat -d '{"conversation_id":"x"}'
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3100/api/agent/chat/unknown/stream
curl -s -X POST http://localhost:3100/api/agent/chat/unknown/stop -H "Content-Type: application/json" -d '{}'
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3100/api/agent/chat -H "Content-Type: application/json" -d '{"conversation_id":"does-not-exist","messages":[]}'
curl -s http://localhost:3100/api/agent/runs
```

Expected, in order: `415`, `204`, `{"stopped":false}`, `404`, `{"running":[],"attention":[]}`.

- [ ] **Step 3: Slow turn, then Bibliothèque (dot + toast)**

In the browser tool, open `http://localhost:3100/m/<PROJECT_ID>`, open the agent panel if minimised, type `Tour lent de test` and send.
1. Within 2 s: one live line with a spinner, label « Réfléchit » then « Lit le canvas », a ticking `0:0x` timer.
2. After ≈ 4 s, click « Bibliothèque » in the sidebar. On `/bibliotheque`: `document.querySelector('[data-slot="run-indicator"]')?.dataset.state` → `"running"` (the « Mes miniatures » entry), and the dot has class `animate-pulse`.
3. Wait (≈ 25 s) until a toast « L'agent a fini — F1 vérification » appears top-right with « Ouvrir »; the dot's `data-state` becomes `"attention"` (no `animate-pulse`). Only one toast (`document.querySelectorAll('[data-slot="toast"]').length` → `1`).
4. Open `http://localhost:3100/miniatures`: the « F1 vérification » card shows a still dot (`data-state="attention"`). Reload the page: no new toast.
5. Click « Ouvrir » in the toast (or the card): on `/m/<PROJECT_ID>` the finished turn shows the answer « Tour simulé terminé, sans appel de modèle. »; going back to `/bibliotheque`, the sidebar has no dot any more (seen).

- [ ] **Step 4: Leave and come back during a turn (reconnection)**

On `/m/<PROJECT_ID>`, send `Deuxième tour`. After ≈ 5 s click « Bibliothèque », wait ≈ 5 s, then use the browser's back navigation.
1. The chat shows the live line again (not « Tour interrompu », not an empty state), with a timer already past `0:08` (it counts from the server's `startedAt`) and the current step label.
2. The server log has the reconnection: `grep -c "GET /api/agent/chat/.*/stream 200" "<FIXTURE_DIR>/next.log"` → at least `1`.
3. At the end: the answer, one « Tour simulé terminé… » per turn, no duplicated user message after the canonical refetch.

- [ ] **Step 5: Close the tab during a turn**

Send `Troisième tour`, then close the tab after ≈ 3 s (tabs tool). Wait 30 s, open a new tab on `/m/<PROJECT_ID>`: the third answer is there (the turn finished without any open page).

- [ ] **Step 6: « Arrêter »**

Send `Quatrième tour`; after ≈ 4 s click « Arrêter ».
1. Within ≈ 2 s the turn reads « Tour interrompu » with « Réessayer » (do not click it).
2. Log: `grep -c "POST /api/agent/chat/.*/stop 200" "<FIXTURE_DIR>/next.log"` → at least `1`.
3. `curl -s http://localhost:3100/api/agent/runs` → the conversation in `attention` with `"kind":"finished"`, nothing in `running`.

- [ ] **Step 7: Second send while a turn runs (409)**

Send `Cinquième tour` in tab A. At once open tab B on `/m/<PROJECT_ID>` (it reconnects: live line), type `Doublon` in tab B and send.
1. Tab B: a toast « L'agent travaille déjà ici »; the composer contains `Doublon` again; no « Erreur » alert remains; the live line of tab A's turn is shown.
2. Log: `grep -c "POST /api/agent/chat 409" "<FIXTURE_DIR>/next.log"` → `1`.
3. The DB has no `Doublon` row:

```bash
/opt/homebrew/bin/node -e 'const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(process.argv[1]);console.log(db.prepare("SELECT COUNT(*) AS n FROM messages WHERE role = ? AND content_json LIKE ?").get("user","%Doublon%"))' "<FIXTURE_DIR>/thumbgen.db"
```

Expected: `{ n: 0 }` (an `ExperimentalWarning` is normal). Let tab A's turn finish; close tab B.

- [ ] **Step 8: No real model call**

```bash
grep -c "POST /api/agent/chat 200" "<FIXTURE_DIR>/next.log"
grep -c "THUMBGEN_FAKE_AGENT: simulated model, no real call" "<FIXTURE_DIR>/next.log"
grep -ci "openrouter.ai" "<FIXTURE_DIR>/next.log"
```

Expected: the first two counts are equal (5 turns: Steps 3–7); the third is `0`. Read the browser console errors: none from the chat, the provider or the toasts. Emulate `prefers-reduced-motion: reduce` if the tool allows it, else check the dot's classes contain `motion-reduce:animate-none`.

- [ ] **Step 9: Stop the server**

Stop the background `next dev`. Leave `<FIXTURE_DIR>` alone (throwaway). Report each check above with pass/fail and any fix commits.

---

## Task 11: Docker rebuild and live checks without paid calls

**Files:** none modified (verification only). If a check fails, fix it in the owning task's files, re-run `tsc` + `vitest`, commit (`fix(…): …`), and only then rebuild — this plan's single rebuild happens once every local check passes.

**Interfaces:**
- Consumes: Tasks 1–10 merged in the branch checked out at `/Users/antoinevigneau/thumbgen-real`.
- Produces: the deployed container and a report (paid check: done after « oui », or « skipped »).

**Safety rules for this task.** The container serves the user's real database and keys. Do not modify or delete projects or conversations; open them only to look. No message is sent to the agent without the user's explicit « oui » in this session. If a login page appears (`SITE_PASSWORD`), stop and ask the user to log in; never type a password.

- [ ] **Step 1: Green branch in the main repository**

```bash
cd /Users/antoinevigneau/thumbgen-real
git status --short
git log --oneline -12
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
grep -c "THUMBGEN_FAKE_AGENT" Dockerfile docker-compose.yml
```

Expected: the commits of Tasks 1–9 are in the checked-out branch (if the work lives in another worktree, stop and ask the user to merge or check it out here — Docker's `./data` bind mount is relative); `tsc` exits 0; all tests pass; the grep prints `Dockerfile:0` and `docker-compose.yml:0`.

- [ ] **Step 2: Rebuild and restart (the only rebuild)**

```bash
docker compose build thumbgen && docker compose up -d thumbgen
docker compose ps
until curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/miniatures | grep -qE "^(200|307|308)$"; do sleep 2; done
docker compose logs --tail 50 thumbgen
```

Expected: build succeeds, `thumbgen` is « Up », no error in the logs.

- [ ] **Step 3: The fake model is impossible in the production image**

Run a throwaway container from the image just built, with `THUMBGEN_FAKE_AGENT=1`, no key and an empty data directory (never `./data`):

```bash
PROD_CHECK_DIR="$(mktemp -d)"; chmod 777 "$PROD_CHECK_DIR"; echo "$PROD_CHECK_DIR"
IMAGE="$(docker inspect thumbgen --format '{{.Image}}')"; echo "$IMAGE"
```

Use both printed values literally:

```bash
docker run --rm -d --name thumbgen-f1-prodcheck -e THUMBGEN_FAKE_AGENT=1 -e OPENROUTER_API_KEY= -e OPENAI_API_KEY= -e YOUTUBE_API_KEY= -p 127.0.0.1:3101:3000 -v "<PROD_CHECK_DIR>:/app/data" <IMAGE>
until curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3101/miniatures | grep -qE "^(200|307|308)$"; do sleep 2; done
curl -s -X POST http://127.0.0.1:3101/api/projects -H "Content-Type: application/json" -d '{"name":"prod check"}'
```

Note `<PID>` (the `proj_…` id), then:

```bash
curl -s -X POST http://127.0.0.1:3101/api/agent/conversations -H "Content-Type: application/json" -d '{"project_id":"<PID>"}'
```

Note `<CID>` (the conversation `id`), then:

```bash
curl -s -w "\n%{http_code}\n" -X POST http://127.0.0.1:3101/api/agent/chat -H "Content-Type: application/json" -d '{"conversation_id":"<CID>","messages":[{"role":"user","parts":[{"type":"text","text":"test"}]}]}'
docker logs thumbgen-f1-prodcheck 2>&1 | grep -c "THUMBGEN_FAKE_AGENT"
docker stop thumbgen-f1-prodcheck
```

Expected: the chat answers `400` « Clé OpenRouter non configurée. Ajoute-la dans Réglages → Connexions des modèles. » (with the fake model active it would have streamed a 200: in production the variable is ignored, and without a key no model can be called); the log grep prints `0`. Leave `<PROD_CHECK_DIR>` alone.

- [ ] **Step 4: Free live checks on the real app**

With curl (if they answer 307/401 because of `SITE_PASSWORD`, run the same requests with `fetch` from the browser tool on a logged-in `http://localhost:3000` page):

```bash
curl -s http://localhost:3000/api/agent/runs
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/agent/chat/unknown/stream
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/agent/chat/unknown/stop -d '{}'
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/agent/chat -d '{}'
```

Expected: a JSON `{"running":[…],"attention":[…]}`; `204`; `415`; `415` (the last one proves a non-JSON request can never reach the model).

In the browser tool (look only, send nothing): `/miniatures` renders with no dot (unless a turn really runs); `/bibliotheque` renders; open an existing miniature with a conversation: history loads, no live line, no false « Tour interrompu » on a conversation that ends with an answer (an old conversation that ends with an unanswered user message now reads « Tour interrompu » + « Réessayer » — expected, do not click); console errors: none from the chat, provider or toasts.

- [ ] **Step 5: Ask before the paid check**

Ask the user in chat, and wait for a clear answer:

> Pour vérifier l'agent en arrière-plan en vrai, j'envoie un seul message court à l'agent dans un projet de test « F1 arrière-plan (vérification) », je vais dans la Bibliothèque pendant qu'il travaille, puis je reviens. Coût estimé : quelques centimes (modèle de l'agent, sans croquis). Je le fais ?

If the answer is not a clear yes, skip Step 6 and report « vérification payante : non faite (pas d'accord) ».

- [ ] **Step 6: One real turn (paid, only after « oui »)**

« Nouvelle miniature » → `F1 arrière-plan (vérification)` → open it → agent panel → send:

```text
Sans recherche YouTube, sans croquis et sans question : lis le canvas puis termine le tour en une phrase.
```

After ≈ 2 s click « Bibliothèque »: the « Mes miniatures » dot pulses; when the turn ends, the toast « L'agent a fini — F1 arrière-plan (vérification) » appears. Click « Ouvrir »: the answer is displayed. Do not click « Générer » or any action that starts a generation. Leave the project in place and mention it in the report.

- [ ] **Step 7: Logs and report**

```bash
docker compose logs --tail 100 thumbgen | grep -i "error\|warn" || echo "no errors"
```

Report every check with pass/fail, the production proof of Step 3, whether the paid check ran (and the project left), and any fix commits.

---

## Self-review against the spec

- **Problème / Objectif 1** (turn survives navigation and tab close): run registry + server-side pump + `abortSignal: run.abort.signal` only → Tasks 1, 3; tab-close check → Task 10 Step 5.
- **Objectif 2** (reconnect live): `GET …/stream` → Task 4; transport, `resumeStream()` after the history, `turnStartedAt` from the run, canonical refetch → Tasks 8, 9 (rulings 13, 18); browser → Task 10 Step 4.
- **Objectif 3** (indicator + toasts elsewhere): `GET /api/agent/runs` → Task 4 (ruling 10); provider polling 3 s / 30 s, seen memory, toasts keyed `conversationId + endedAt`, not for the open miniature → Task 6 (rulings 1, 11); dots → Task 7 (rulings 2, 21); browser → Task 10 Step 3.
- **Objectif 4** (one turn per conversation, several in parallel): synchronous `startRun`, 409 before any read/write/title/model → Tasks 1, 3; client 409 handling → Tasks 8, 9 (ruling 14); browser → Task 10 Step 7.
- **Registre**: every listed function, 5-min timer guarded by identity, `subscribe` cancel only unsubscribes, 2 000-chunk soft cap with delta merge, `pendingClientRequest` → Task 1 (rulings 6–9).
- **Route de chat** points 1–9: 415 → 400 → 404 → 409 (rulings 3, 4), `discardRun` on each early 400, `onError` log-only, fallback `interrupted: 1` moved to `toUIMessageStream` `onEnd`, outcome mapping, `finishRun` once after the save, response = `subscribe(run)`, `consumeStream` removed → Task 3 (ruling 19).
- **Nouvelles routes** and **DELETE** → Task 4.
- **Redémarrage**: empty registry → 204 → orphan « Tour interrompu » + « Réessayer », `findRetriedUserRowIndex` unchanged → Tasks 8, 9 (ruling 13).
- **Chat (client)**: no `resume: true`, `prepareReconnectToStreamRequest` on the active conversation, state reset before `resumeStream()`, 204 handling, grouped resumed message, « Arrêter » via the route with local fallback (10 s / failure) and early-stop re-send, 409 flow, local stream dropped on conversation change and unmount, `refreshRuns()` on status changes, no automatic send after a reconnection (real `Chat` test) → Tasks 8, 9 (rulings 13–18).
- **`useConversations`** priority → Tasks 6, 9 (ruling 12).
- **Coût et sécurité**: no automatic resumption, stop conditions unchanged, 409 before any cost, JSON-only POSTs, no keys in the buffer, fake model impossible in production (test + Docker proof) → Tasks 2, 3, 4, 9, 11 (ruling 5).
- **Tests** listed by the spec: registry → Task 1; POST route → Task 3; GET stream, stop, runs → Task 4; client → Task 8 (+ guard Task 9); rendering (dot, toast on unseen attention) → Tasks 6, 7; browser with the server fake model → Task 10.
- **Vérification live** (paid, consent-gated) → Task 11 Steps 5–6.
- Hors périmètre respected: chat stays on the miniature page, no survival across restarts, no server-placed nodes / `ask_user` (F2).
