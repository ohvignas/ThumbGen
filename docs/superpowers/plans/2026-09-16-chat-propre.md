# Chat propre (chantier E) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the agent chat show, for every turn, one live step line while it works, then a short answer with its visual results and 1 to 3 « Et maintenant » actions, the detailed steps folded above — driven by a new chat-only `finish_turn` tool.

**Architecture:** A pure turn model (`src/components/panels/chat/turn-model.ts`) splits any assistant `UIMessage` (live or reopened) into steps, answer, results, next actions and pending client requests; it reads the input of the new server tool `finish_turn` (schema in `src/lib/agent/finish-turn.ts`, registered as chat-only so MCP never lists it) and falls back to the message's own texts and visual tool outputs. The chat UI is rebuilt on the shadcn conversation components: `MessageScroller` (anchors, auto-scroll, peek, `aria-busy`), `Message`/`MessageGroup`/`MessageAvatar`/`MessageHeader`/`MessageFooter`, `Bubble`, and the new `Marker` + `Spinner` for the live line. The route stops the tool loop right after `finish_turn`, and the static system prompt asks for it at the end of every turn.

**Tech Stack:** Next.js 16.2 App Router, React 19.2, TypeScript strict, Tailwind v4, shadcn `base-nova` on Base UI (`@base-ui/react` 1.8, `@shadcn/react` 0.3 message-scroller), Vercel AI SDK `ai` 7.0.99 + `@ai-sdk/react` 4.0.102, `@xyflow/react` 12, Zustand 5, zod 4, vitest 4, lucide-react 1.46.

**Spec:** `docs/superpowers/specs/2026-09-16-chat-propre-design.md` — the binding authority. Read it before starting any task. Deviations and precisions are listed under « Code reality vs spec » with the ruling taken.

## Global Constraints

- **Sequencing.** This plan runs **after** chantier C (Bibliothèque page, `docs/superpowers/specs/2026-09-16-bibliotheque-page-design.md`) and chantier D (chaînes suivies, `docs/superpowers/specs/2026-09-16-chaines-suivies-design.md`) are executed and merged into `main`. The code quoted here was read on `main` at `88f7697`, before them. Neither C nor D touches the chat files, but C evolves `LibraryPickerModal.tsx` (used by `PendingUiAction.tsx`, which this plan does not modify). **Every task that edits an existing file starts by re-reading it on the latest `main`** and applies the described change to what is actually there; anchors are quoted code, never line numbers. When a task gives a full replacement file for an existing file, first diff the current file against `88f7697` (`git diff 88f7697 -- <file>`): if C or D changed it, carry their change into the new version.
- **shadcn here is `base-nova` on Base UI, not Radix.** Check `src/components/ui/*` before writing JSX. `Collapsible` sets `data-panel-open` on its trigger (style with a named group: `group/x` on the trigger, `group-data-[panel-open]/x:rotate-90` on the chevron). Triggers take `render={<Button … />}` (or `render={<button … />}`). A disabled `Button` that must still show a tooltip uses `disabled focusableWhenDisabled` (Base UI then sets `aria-disabled` / `data-disabled`, not the `disabled` attribute, so style it with `data-disabled:opacity-50`). `cn` is imported from the npm package `"cn"` (`import { cn } from "cn"`).
- **UI rules.** Only shadcn components and Tailwind classes in new or rewritten code (no `style={{…}}`). UI copy is French; apostrophes in JSX text are written `&apos;`. Animations respect `prefers-reduced-motion` (`motion-reduce:` variants).
- **Spec values (verbatim):** `finish_turn` input `summary` 1–400 characters (1 à 2 phrases), `results` 0–6 tool call ids, `next_actions` 0–3 `{ label (≤ 40 car.), kind: "ask_agent" | "focus_node", message? (si ask_agent, ≤ 300 car.), node_id? (si focus_node) }`, output `{ ok: true }`. Live labels « Réfléchit », « Rédige la réponse », « Lit le canvas », « Cherche sur YouTube », « Dessine le croquis », « Construit le workflow », « Importe la miniature », « Liste tes personnages ». Header « ▸ 12 s · 4 étapes » (« 1 étape »). Timer `m:ss`. Buttons `variant="outline"` `size="sm"`. Tooltip « Élément introuvable ». Footer button « Copier la réponse ». Error « Réessayer ». Detail line « voir les résultats ci-dessous ». Section « Et maintenant ».
- **Agent prompt.** Changes only inside the static cached `AGENT_SYSTEM_PROMPT`; the per-turn blocks `<response_language>`, `<channel_profile>`, `<project_id>`, `<canvas_state>` and their order do not change. Existing prompt tests (`tests/agent/system-prompt.test.ts`, `tests/agent/system-prompt-ab-test.test.ts`) stay green untouched; new tests go in new files.
- **Commands.** Tests: `./node_modules/.bin/vitest run` (one file: `./node_modules/.bin/vitest run tests/path/file.test.ts`). Type-check: `./node_modules/.bin/tsc --noEmit`. Lint: `./node_modules/.bin/eslint <files>`. shadcn CLI: `./node_modules/.bin/shadcn`. `npx` is broken in this shell; `node` may be a broken shell function — use `/opt/homebrew/bin/node`. If `tsc` reports errors only inside `.next/types` or `.next/dev/types`, run `rm -rf .next/types .next/dev/types` and re-run it.
- **Tests never call a real model**: `streamText` is mocked, tool handlers are spied, rendering tests use `renderToStaticMarkup` from `react-dom/server` in `.test.tsx` files (no testing-library in this repo). Tests run against the isolated temp DB created by `tests/setup.ts`.
- **Intermediate browser checks** use a throwaway dev server, never the Docker DB: `THUMBGEN_DB_PATH="<throwaway dir>/thumbgen.db" OPENROUTER_API_KEY= ./node_modules/.bin/next dev -p 3100`. A real agent chat costs money: in browser checks, messages are only ever sent **after** installing the fetch stub of Task 11 (`window.__thumbgenChatStub?.installed === true`), and the dev server log must never show `POST /api/agent/chat`. Never click « Générer ». If a login page appears, stop and ask the user to log in; never type a password.
- **Docker.** The user is actively using `http://localhost:3000`. Exactly **one** rebuild, in Task 12: `docker compose build thumbgen && docker compose up -d thumbgen`, run from `/Users/antoinevigneau/thumbgen-real` (the `./data` bind mount is relative — never from a worktree). The one live check that sends a real agent message is paid and needs the user's explicit « oui » in the executing session.
- **Commits.** Commit only the files a task lists — never `git add -A` / `git add .`. Every commit message ends with a blank line and `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` (the second `-m` in each commit command below does exactly that).

## Code reality vs spec (rulings)

1. **shadcn components.** `message.tsx`, `bubble.tsx`, `message-scroller.tsx` already match the current base-nova registry (`./node_modules/.bin/shadcn add message --diff`, `bubble`, `message-scroller` all report « No changes »; `MessageGroup`, `MessageAvatar`, `MessageHeader`, `MessageFooter`, `useMessageScroller` are present). `marker` and `spinner` are added with the **local CLI** `./node_modules/.bin/shadcn add marker spinner --yes` (its `--dry-run` / `--view` were checked on `88f7697`: two new files, lucide icons); the exact expected content is given in Task 1 as a manual-copy fallback. The registry's Spinner uses `Loader2Icon` (the docs page shows `LoaderIcon`): the registry wins.
2. **MCP shares the registry.** `buildMcpServer()` lists every `listTools()` entry and `buildAiSdkTools()` wraps the same registry. Ruling: `ToolDefinition` gains `chatOnly?: boolean`; `finish_turn` is registered like the other tools (`src/lib/agent/tools/finish-turn.ts`, imported by `all.ts`) with `chatOnly: true`; the MCP server skips chat-only tools; the chat route still receives it.
3. **The model never sees tool call ids.** `finish_turn.results` must name tool calls, but tool call ids are generated by the provider and are not visible to the model. Ruling: the AI SDK adapter's `execute` appends a text line `result_id: <toolCallId>` to the successful output of the three visual tools (`generate_sketch`, `import_youtube_thumbnail`, `search_youtube`); the prompt tells the model to copy those ids. The line is appended last, so `GeneratedImagePreview` (first text) and `SearchYoutubeGallery` (caption before each image) are unaffected; MCP (handler called directly) is unaffected.
4. **Which results.** Only successful outputs of the three visual tools can be results (they are the only tools with a renderer). With a valid `finish_turn`, its `results` list is authoritative: known visual ids in the given order, duplicates dropped, unknown or non-visual ids ignored, and an empty list shows no result. Without `finish_turn` (absent or invalid input), every successful visual output of the turn is a result.
5. **Loop and auto-continuation.** `streamText` gets `stopWhen: [isStepCount(agentMaxSteps), hasToolCall("finish_turn")]`, so no extra (paid) model step follows `finish_turn`. `finish_turn` is a server tool, so `should-auto-continue.ts` is unchanged: it never auto-continues on `finish_turn` alone and still resumes a step that resolved a client request (new tests prove both). The prompt forbids calling `finish_turn` in the same step as `request_user_image`.
6. **Tool output.** The spec's `{ ok: true }` is returned in the app's `ToolResult` shape: `{ content: [{ type: "text", text: "{\"ok\":true}" }] }`.
7. **« 1 à 2 phrases ».** Not machine-checkable: the schema enforces 1–400 trimmed characters, the prompt asks for 1 to 2 short sentences.
8. **`durationMs`.** UI message parts carry no timestamps and nothing new is persisted. Reopened messages get `metadata.durationMs` = the assistant row's `created_at` minus the previous row's `created_at` (the user's message, or the client-request result that resumed the turn), second precision, in `history-to-ui-messages.ts`. The live `m:ss` timer counts from a `turnStartedAt` captured by `ChatPanel` when a send, action, retry or client-request answer starts a turn. Between the end of the stream and the canonical refetch (a few ms) the header shows the step count without a duration.
9. **Interrupted and failed turns.** Rows with `interrupted = 1` give `metadata.interrupted`; an interrupted row with empty content (`[]`, the route's error marker) now yields an empty assistant message instead of nothing. A live error (`status === "error"`), a live « Arrêter » and a reopened interrupted turn all render the answer area as a compact `Alert` (« Erreur » + message, or « Tour interrompu » / « L'agent s'est arrêté avant d'avoir fini. »), the detail staying available. « Réessayer » exists on the **last** turn only, when the last user message has text; it calls `useChat`'s `regenerate()` with the same request body (text only — attachments are not re-sent). A failed turn skips the canonical refetch so the unsaved user message and its error stay visible (`onError` sets a ref).
10. **No assistant message yet.** While `submitted` after a user message, after an error before the first chunk, or after a stop before the first chunk, `MessageList` renders a trailing assistant row (live line or error). The panel-level error `Alert` under the list is removed.
11. **PendingUiAction placement.** It stays mounted by `ChatPanel` between the list and the composer (file unchanged) — « sous la ligne, au-dessus du composer comme aujourd'hui », never inside the folded detail. A turn paused on a pending request (status `ready`) renders as a finished turn: the text before the request is its answer, no actions.
12. **Answer without `finish_turn`.** Texts after the last step tool, joined; else, if the turn stopped on a failed tool, « Échec de l'étape « <libellé> » : <erreur> » (the spec's « le résumé indique l'échec »); else the last text (removed from the steps). With a valid `finish_turn`, every text part is an intermediate step. `finish_turn` parts are never steps, valid or not.
13. **Tool errors.** A step is ✗ for `output-error`, `output-denied`, a live `ToolResult` with `isError: true` (registry tools return failures that way, formally `output-available`) and a reopened `{ type: "error-text" | "error-json" }` output.
14. **Step count.** Steps are the spec's list: non-empty reasoning, intermediate texts, tools (without `finish_turn` and pending requests). The header is hidden when there is no step; « 1 étape » / « n étapes ».
15. **Step detail.** A tool already shown in « Résultats » only says « Voir les résultats ci-dessous. » (no JSON). Other visual tools show their card in the detail. Input/output JSON is pretty-printed with strings over 160 characters shortened (base64 images). The reasoning duration « Réflexion (3 s) » is only known for reasoning streamed live in the mounted component (the existing `Reasoning` measures it); reopened reasoning reads « Réflexion ».
16. **Labels.** `TOOL_LABELS` is rewritten as French action phrases (every registry tool, `request_user_image`, `request_user_sketch`, `finish_turn` = « Rédige la réponse »), with a `toolLabel()` fallback. The live label is computed from the **last** part only: a trailing `step-start` or a finished tool reads « Réfléchit ».
17. **`focus_node`.** `ChatPanel` is rendered by `Canvas.tsx` under the page's `ReactFlowProvider` (`src/app/m/[id]/page.tsx`), so the action uses `useReactFlow().fitView({ nodes: [{ id }], padding: 0.4, maxZoom: 1, duration: 400 })` after `useCanvasStore.getState().selectOnly([id])`. A node missing from the canvas store gives a disabled button with the tooltip « Élément introuvable ».
18. **`ask_agent`.** Goes through the composer's path (create the conversation if needed, `sendMessage`, canonical refetch) without touching the draft or attachments; ignored while a turn runs.
19. **Prompt contradictions.** The static prompt's « OUTPUT FORMATTING » section (headings, long markdown answers), its « SKETCH IMAGE EMBEDDED INLINE » instruction and « Always announce what you're about to do before calling a tool » contradict the spec: they are replaced by an « ENDING EVERY TURN — finish_turn » section, a `finish_turn`-based hand-off of the sketches and of `apply_workflow`, and « at most one short sentence before a tool call ». The A/B section is untouched.
20. **Scroller configuration.** `autoScroll`, `defaultScrollPosition="last-anchor"`, `scrollPreviousItemPeek={48}` (px, « modéré » in a 640 px panel), `aria-busy` while a turn runs, `MessageScrollerButton` with a French screen-reader label « Aller au dernier message ». Consecutive messages of one author (a turn resumed after a client request is reopened as two assistant messages) share one `MessageScrollerItem` + `MessageGroup`, anchored (`scrollAnchor`) when the group is the user's, `messageId` = the group's first message id; earlier messages of a group keep an empty `MessageAvatar` slot.
21. **Known behaviour kept.** The canonical refetch replaces live message ids with DB row ids (existing behaviour): the finished turn remounts once, so its short fade can play twice. Accepted.
22. **Browser checks without a model.** A committed dev-only seed script (`scripts/chat-fixtures/seed-chat-fixture.mjs`: HTTP APIs + `node:sqlite` rows in the throwaway DB) and an in-page fetch stub (`scripts/chat-fixtures/chat-stream-stub.js`: scripted UI-message stream for `/api/agent/chat` plus matching history rows) — reusable by chantier F.
23. **SSR rendering tests** see Zustand's initial (empty) canvas, so the enabled `focus_node` case is verified in the browser (Task 11), the disabled case in tests.

## File Structure

**Create**
- `src/components/ui/marker.tsx`, `src/components/ui/spinner.tsx` — shadcn base-nova registry components.
- `src/lib/agent/finish-turn.ts` — `finish_turn` name, input schema and limits, visual result tools, `appendResultId`.
- `src/lib/agent/tools/finish-turn.ts` — the chat-only registry tool.
- `src/components/panels/chat/turn-model.ts` — `splitAssistantTurn`, `currentStepLabel`, `toolStatus`, `turnDisplay`, formatting.
- `src/components/panels/chat/chat-view-model.ts` — `groupConsecutiveMessages`, `trailingAssistantRow`, `lastUserText`.
- `src/components/panels/chat/tool-json.ts` — `formatToolJson`.
- `src/components/panels/chat/TurnSteps.tsx` — folded step list.
- `src/components/panels/chat/useElapsedMs.ts`, `src/components/panels/chat/TurnProgress.tsx` — live line.
- `src/components/panels/chat/TurnResults.tsx`, `src/components/panels/chat/TurnActions.tsx`, `src/components/panels/chat/AssistantTurn.tsx` — finished turn.
- `scripts/chat-fixtures/seed-chat-fixture.mjs`, `scripts/chat-fixtures/chat-stream-stub.js` — dev-only fixtures.
- Tests: `tests/chat/marker-spinner.test.tsx`, `tests/agent/finish-turn-tool.test.ts`, `tests/agent/finish-turn-wiring.test.ts`, `tests/agent/tool-labels.test.ts`, `tests/chat/turn-model.test.ts`, `tests/chat/history-turn-metadata.test.ts`, `tests/agent/system-prompt-finish-turn.test.ts`, `tests/chat/tool-json.test.ts`, `tests/chat/turn-steps-render.test.tsx`, `tests/chat/turn-progress-render.test.tsx`, `tests/chat/assistant-turn-render.test.tsx`, `tests/chat/chat-view-model.test.ts`, `tests/chat/message-render.test.tsx`.

**Modify**
- `src/lib/agent/tools/types.ts`, `src/lib/agent/tools/all.ts`, `src/lib/agent/mcp/server.ts`, `src/lib/agent/v2/tool-adapter.ts`, `src/lib/agent/v2/route-handler.ts`, `src/lib/agent/tool-labels.ts`, `src/lib/agent/system-prompt.ts`.
- `src/components/panels/chat/history-to-ui-messages.ts`, `src/components/panels/chat/TextMarkdown.tsx`, `src/components/panels/chat/ToolCallCard.tsx` (rewrite), `src/components/panels/chat/tool-renderers/SimpleToolPart.tsx` (rewrite), `src/components/panels/chat/Message.tsx` (rewrite), `src/components/panels/chat/MessageList.tsx` (rewrite), `src/components/panels/ChatPanel.tsx`.

**Delete**
- `src/components/panels/chat/AgentActivity.tsx`.

**Unchanged on purpose:** `PendingUiAction.tsx`, `should-auto-continue.ts`, `ChatHeader.tsx`, `AgentAvatar.tsx`, `ai-elements/reasoning.tsx`, `tool-renderers/GeneratedImagePreview.tsx`, `tool-renderers/SearchYoutubeGallery.tsx`, `persist-turn.ts`.

## Execution lanes

Tasks in different lanes touch disjoint files and can run in parallel worktrees; merge each lane back before the tasks that depend on it.
- **Lane A (agent backend):** Task 2 → Task 3 → Task 6.
- **Lane B (turn model):** Task 1 (independent, any time) · Task 4 (after Task 2) → Task 5.
- **Lane C (chat UI):** Task 7 (after Tasks 1 and 4) → Task 8 and Task 9 in parallel (Task 9 also after Task 5) → Task 10 (after Tasks 5, 8, 9).
- **Tail (sequential):** Task 11 (after Tasks 3, 6, 10) → Task 12 (last, the only Docker rebuild).

Between Task 7 and Task 10 the old `Message.tsx` still renders the chat: tool calls without a visual renderer temporarily render nothing there. That intermediate state is never deployed (Docker is rebuilt once, in Task 12).

---

## Task 1: Marker and Spinner from the shadcn registry

**Files:**
- Create: `src/components/ui/marker.tsx`, `src/components/ui/spinner.tsx` (via the shadcn CLI)
- Test: `tests/chat/marker-spinner.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `Marker` (props of a `div` + `variant?: "default" | "separator" | "border"` + `render`), `MarkerIcon` (`span`, `aria-hidden`), `MarkerContent` (`span`), `markerVariants` from `@/components/ui/marker`; `Spinner` (props of an `svg`, `data-slot="spinner"`, `role="status"`, `animate-spin`) from `@/components/ui/spinner`.

- [ ] **Step 1: Confirm the existing conversation components match the registry**

```bash
for c in message bubble message-scroller; do ./node_modules/.bin/shadcn add $c --diff 2>&1 | grep -E "skip|No changes|create|update"; done
```

Expected: `src/components/ui/message.tsx (skip)`, `bubble.tsx (skip)`, `message-scroller.tsx (skip)` / `button.tsx (skip)`, each with « No changes. ». If one reports changes, stop and report them (this plan was written against identical files).

- [ ] **Step 2: Write the failing test**

Create `tests/chat/marker-spinner.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Spinner } from "@/components/ui/spinner";

describe("Marker + Spinner (shadcn base-nova)", () => {
  it("renders a status marker whose spinner is hidden from assistive tech", () => {
    const html = renderToStaticMarkup(
      <Marker role="status">
        <MarkerIcon>
          <Spinner />
        </MarkerIcon>
        <MarkerContent>Cherche sur YouTube</MarkerContent>
      </Marker>,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('data-slot="marker"');
    expect(html).toContain('data-slot="marker-icon"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-slot="spinner"');
    expect(html).toContain("animate-spin");
    expect(html).toContain("Cherche sur YouTube");
  });

  it("renders as another element through render", () => {
    const html = renderToStaticMarkup(
      <Marker render={<span />}>
        <MarkerContent>Réfléchit</MarkerContent>
      </Marker>,
    );
    expect(html.startsWith("<span")).toBe(true);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/chat/marker-spinner.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/ui/marker"`.

- [ ] **Step 4: Add the components with the local shadcn CLI**

```bash
./node_modules/.bin/shadcn add marker spinner --yes
git status --short
```

Expected: `?? src/components/ui/marker.tsx` and `?? src/components/ui/spinner.tsx`. The CLI lists `cn` as a dependency, which is already installed: if `package.json` or `package-lock.json` show as modified, restore them with `git checkout -- package.json package-lock.json` and check `ls node_modules/cn` still works.

If the CLI cannot reach the registry, create the two files by hand with exactly this content (the registry's base-nova files with the lucide icon resolved):

`src/components/ui/spinner.tsx`:

```tsx
import { cn } from "cn"
import { Loader2Icon } from "lucide-react"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon data-slot="spinner" role="status" aria-label="Loading" className={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }
```

`src/components/ui/marker.tsx`:

```tsx
import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const markerVariants = cva(
  "group/marker relative flex min-h-4 w-full items-center gap-2 text-left text-sm text-muted-foreground [&_svg:not([class*='size-'])]:size-4 [a]:underline [a]:underline-offset-3 [a]:hover:text-foreground",
  {
    variants: {
      variant: {
        default: "",
        separator:
          "before:mr-1 before:h-px before:min-w-0 before:flex-1 before:bg-border after:ml-1 after:h-px after:min-w-0 after:flex-1 after:bg-border",
        border: "border-b border-border pb-2",
      },
    },
  }
)

function Marker({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"div"> & VariantProps<typeof markerVariants>) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(markerVariants({ variant, className })),
      },
      props
    ),
    render,
    state: {
      slot: "marker",
      variant,
    },
  })
}

function MarkerIcon({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="marker-icon"
      aria-hidden="true"
      className={cn(
        "size-4 shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function MarkerContent({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="marker-content"
      className={cn(
        "min-w-0 wrap-break-word group-data-[variant=separator]/marker:flex-none group-data-[variant=separator]/marker:text-center *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Marker, MarkerIcon, MarkerContent, markerVariants }
```

Whichever way they were created, compare the files with the two blocks above; only formatting may differ.

- [ ] **Step 5: Run the test, type-check and lint**

Run: `./node_modules/.bin/vitest run tests/chat/marker-spinner.test.tsx` — expected: PASS (2 tests).
Run: `./node_modules/.bin/tsc --noEmit` — expected: exit 0.
Run: `./node_modules/.bin/eslint src/components/ui/marker.tsx src/components/ui/spinner.tsx tests/chat/marker-spinner.test.tsx` — expected: no error.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/marker.tsx src/components/ui/spinner.tsx tests/chat/marker-spinner.test.tsx
git commit -m "feat(ui): add shadcn Marker and Spinner (base-nova)" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: The chat-only `finish_turn` tool

**Files:**
- Create: `src/lib/agent/finish-turn.ts`, `src/lib/agent/tools/finish-turn.ts`
- Modify: `src/lib/agent/tools/types.ts`, `src/lib/agent/tools/all.ts`, `src/lib/agent/mcp/server.ts`
- Test: `tests/agent/finish-turn-tool.test.ts`

**Interfaces:**
- Consumes: `registerTool`, `listTools`, `getTool` from `@/lib/agent/tools`; `ToolResult`, `ToolDefinition` from `@/lib/agent/tools/types`.
- Produces (`src/lib/agent/finish-turn.ts`, pure, safe to import from client code):
  - `FINISH_TURN_TOOL_NAME = "finish_turn"`
  - `VISUAL_RESULT_TOOLS = ["generate_sketch", "import_youtube_thumbnail", "search_youtube"] as const`, `isVisualResultTool(toolName: string): boolean`
  - `RESULT_ID_PREFIX = "result_id: "`, `FINISH_TURN_LIMITS = { summary: 400, results: 6, nextActions: 3, label: 40, message: 300 }`
  - `finishTurnInputSchema` (zod object), `type FinishTurnInput = { summary: string; results: string[]; next_actions: Array<{ label: string; kind: "ask_agent" | "focus_node"; message?: string; node_id?: string }> }`
  - `parseFinishTurnInput(input: unknown): FinishTurnInput | null`
  - `appendResultId(toolName: string, result: ToolResult, toolCallId: string): ToolResult`
- Produces (`src/lib/agent/tools/types.ts`): `ToolDefinition.chatOnly?: boolean`.
- Produces (`src/lib/agent/tools/finish-turn.ts`): `finishTurnTool`, registered on import.

- [ ] **Step 1: Write the failing tests**

Create `tests/agent/finish-turn-tool.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

// youtube-transcript ships a CJS bundle that breaks under Vitest's ESM transform.
vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

import "@/lib/agent/tools/all";
import { getTool, listTools } from "@/lib/agent/tools";
import { buildMcpServer } from "@/lib/agent/mcp/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  FINISH_TURN_TOOL_NAME,
  appendResultId,
  finishTurnInputSchema,
  isVisualResultTool,
  parseFinishTurnInput,
} from "@/lib/agent/finish-turn";

const VALID = {
  summary: "Deux angles prêts : A choc, B duel.",
  results: ["call_a", "call_b"],
  next_actions: [
    { label: "Angle A", kind: "ask_agent", message: "Je choisis l'angle A." },
    { label: "Voir le générateur", kind: "focus_node", node_id: "gen-1" },
  ],
};

const accepts = (input: unknown) => finishTurnInputSchema.safeParse(input).success;

describe("finish_turn input", () => {
  it("accepts a full input and defaults results and next_actions to empty lists", () => {
    expect(accepts(VALID)).toBe(true);
    expect(finishTurnInputSchema.parse({ summary: " Fini. " })).toEqual({ summary: "Fini.", results: [], next_actions: [] });
  });

  it("needs a summary of 1 to 400 characters", () => {
    expect(accepts({})).toBe(false);
    expect(accepts({ summary: "" })).toBe(false);
    expect(accepts({ summary: "   " })).toBe(false);
    expect(accepts({ summary: "x".repeat(400) })).toBe(true);
    expect(accepts({ summary: "x".repeat(401) })).toBe(false);
  });

  it("caps results at 6 ids", () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `call_${i}`);
    expect(accepts({ summary: "ok", results: ids(6) })).toBe(true);
    expect(accepts({ summary: "ok", results: ids(7) })).toBe(false);
  });

  it("caps next_actions at 3 and labels at 40 characters", () => {
    const action = (label: string) => ({ label, kind: "ask_agent", message: "Oui." });
    expect(accepts({ summary: "ok", next_actions: [action("a"), action("b"), action("c")] })).toBe(true);
    expect(accepts({ summary: "ok", next_actions: [action("a"), action("b"), action("c"), action("d")] })).toBe(false);
    expect(accepts({ summary: "ok", next_actions: [action("x".repeat(40))] })).toBe(true);
    expect(accepts({ summary: "ok", next_actions: [action("x".repeat(41))] })).toBe(false);
  });

  it("needs a message of at most 300 characters for ask_agent", () => {
    expect(accepts({ summary: "ok", next_actions: [{ label: "A", kind: "ask_agent" }] })).toBe(false);
    expect(accepts({ summary: "ok", next_actions: [{ label: "A", kind: "ask_agent", message: "x".repeat(300) }] })).toBe(true);
    expect(accepts({ summary: "ok", next_actions: [{ label: "A", kind: "ask_agent", message: "x".repeat(301) }] })).toBe(false);
  });

  it("needs a node_id for focus_node and rejects unknown kinds", () => {
    expect(accepts({ summary: "ok", next_actions: [{ label: "Voir", kind: "focus_node" }] })).toBe(false);
    expect(accepts({ summary: "ok", next_actions: [{ label: "Voir", kind: "focus_node", node_id: "gen-1" }] })).toBe(true);
    expect(accepts({ summary: "ok", next_actions: [{ label: "Go", kind: "generate", node_id: "gen-1" }] })).toBe(false);
  });

  it("parses to null instead of throwing", () => {
    expect(parseFinishTurnInput(VALID)?.next_actions).toHaveLength(2);
    expect(parseFinishTurnInput({ summary: "" })).toBeNull();
    expect(parseFinishTurnInput(undefined)).toBeNull();
  });
});

describe("finish_turn tool", () => {
  it("is registered as a chat-only tool without side effect that answers {ok:true}", async () => {
    const tool = getTool(FINISH_TURN_TOOL_NAME);
    expect(tool?.chatOnly).toBe(true);
    const result = await tool!.handler(finishTurnInputSchema.parse(VALID));
    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual({ ok: true });
  });

  it("is the only chat-only tool", () => {
    expect(listTools().filter((tool) => tool.chatOnly).map((tool) => tool.name)).toEqual([FINISH_TURN_TOOL_NAME]);
  });

  it("is not listed to MCP clients, unlike the other registry tools", async () => {
    const server = buildMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(clientTransport);
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    expect(names).toContain("list_logos");
    expect(names).toContain("generate_sketch");
    expect(names).not.toContain(FINISH_TURN_TOOL_NAME);
  });
});

describe("result ids", () => {
  const ok = { content: [{ type: "text" as const, text: "Sketch generated." }, { type: "image" as const, mimeType: "image/png", data: "AAA=" }] };

  it("knows the three visual tools", () => {
    expect(["generate_sketch", "import_youtube_thumbnail", "search_youtube"].every(isVisualResultTool)).toBe(true);
    expect(isVisualResultTool("apply_workflow")).toBe(false);
  });

  it("appends a result_id line to a successful visual output only", () => {
    expect(appendResultId("generate_sketch", ok, "call_1").content.at(-1)).toEqual({ type: "text", text: "result_id: call_1" });
    expect(appendResultId("apply_workflow", ok, "call_1")).toBe(ok);
    const failed = { isError: true, content: [{ type: "text" as const, text: "OpenRouter API error 500" }] };
    expect(appendResultId("generate_sketch", failed, "call_1")).toBe(failed);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `./node_modules/.bin/vitest run tests/agent/finish-turn-tool.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/agent/finish-turn"`.

- [ ] **Step 3: Write the shared module**

Create `src/lib/agent/finish-turn.ts`:

```ts
import { z } from "zod";
import type { ToolResult } from "@/lib/agent/tools/types";

/**
 * Shared contract of the chat-only `finish_turn` tool (chantier E): the agent
 * calls it once at the end of every turn, and the chat panel reads its input
 * to show a short answer, the visual results and « Et maintenant » buttons.
 * Pure module — imported by the server tool, the AI SDK adapter and the chat UI.
 */
export const FINISH_TURN_TOOL_NAME = "finish_turn";

/** Tools whose output the chat can show as a visual result card. */
export const VISUAL_RESULT_TOOLS = ["generate_sketch", "import_youtube_thumbnail", "search_youtube"] as const;

export function isVisualResultTool(toolName: string): boolean {
  return (VISUAL_RESULT_TOOLS as readonly string[]).includes(toolName);
}

/** Start of the line appended to a visual tool's successful output, so the model can cite the call in `results`. */
export const RESULT_ID_PREFIX = "result_id: ";

export const FINISH_TURN_LIMITS = {
  summary: 400,
  results: 6,
  nextActions: 3,
  label: 40,
  message: 300,
} as const;

const nextActionSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(1)
      .max(FINISH_TURN_LIMITS.label)
      .describe("Button text, max 40 characters, in the reply language."),
    kind: z
      .enum(["ask_agent", "focus_node"])
      .describe('"ask_agent" sends `message` to you as the user\'s reply; "focus_node" selects and centers `node_id` on the canvas.'),
    message: z
      .string()
      .trim()
      .min(1)
      .max(FINISH_TURN_LIMITS.message)
      .optional()
      .describe("Required when kind is ask_agent: the reply sent in the user's name, max 300 characters."),
    node_id: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Required when kind is focus_node: the id of a node on the canvas."),
  })
  .superRefine((action, ctx) => {
    if (action.kind === "ask_agent" && !action.message) {
      ctx.addIssue({ code: "custom", path: ["message"], message: "message is required when kind is ask_agent" });
    }
    if (action.kind === "focus_node" && !action.node_id) {
      ctx.addIssue({ code: "custom", path: ["node_id"], message: "node_id is required when kind is focus_node" });
    }
  });

export const finishTurnInputSchema = z.object({
  summary: z
    .string()
    .trim()
    .min(1)
    .max(FINISH_TURN_LIMITS.summary)
    .describe("Your answer to the user: 1 to 2 short sentences, max 400 characters."),
  results: z
    .array(z.string().trim().min(1))
    .max(FINISH_TURN_LIMITS.results)
    .default([])
    .describe("Up to 6 result_id values of this turn's visual tool calls, in display order."),
  next_actions: z
    .array(nextActionSchema)
    .max(FINISH_TURN_LIMITS.nextActions)
    .default([])
    .describe("0 to 3 one-click follow-ups shown under the answer."),
});

export type FinishTurnInput = z.output<typeof finishTurnInputSchema>;

/** The validated input, or null when it is missing or invalid (the chat then falls back). */
export function parseFinishTurnInput(input: unknown): FinishTurnInput | null {
  const parsed = finishTurnInputSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

/** Appends `result_id: <toolCallId>` to a visual tool's successful output; any other output is returned as is. */
export function appendResultId(toolName: string, result: ToolResult, toolCallId: string): ToolResult {
  if (result.isError || !isVisualResultTool(toolName)) return result;
  return { ...result, content: [...result.content, { type: "text", text: `${RESULT_ID_PREFIX}${toolCallId}` }] };
}
```

- [ ] **Step 4: Mark chat-only tools in the registry type**

Re-read `src/lib/agent/tools/types.ts`. In `ToolDefinition`, after `handler: ToolHandler<I>;`, add:

```ts
  /** Only meaningful inside ThumbGen's chat panel: the MCP server never lists it. */
  chatOnly?: boolean;
```

- [ ] **Step 5: Register the tool**

Create `src/lib/agent/tools/finish-turn.ts`:

```ts
import { FINISH_TURN_TOOL_NAME, finishTurnInputSchema, type FinishTurnInput } from "@/lib/agent/finish-turn";
import type { ToolDefinition } from "./types";
import { registerTool } from "./index";

export const finishTurnTool: ToolDefinition<FinishTurnInput> = {
  name: FINISH_TURN_TOOL_NAME,
  description:
    "Ends the current chat turn. Call it exactly once per turn, as your last tool call, alone in its own step once every other tool result is back. The chat shows the user only `summary`, the visual results listed in `results` (the result_id values printed at the end of generate_sketch, import_youtube_thumbnail and search_youtube outputs) and the `next_actions` buttons; everything else from the turn is folded into a collapsed step list. No side effect.",
  inputSchema: finishTurnInputSchema,
  chatOnly: true,
  handler: async () => ({ content: [{ type: "text", text: JSON.stringify({ ok: true }) }] }),
};

registerTool(finishTurnTool);
```

Re-read `src/lib/agent/tools/all.ts` and add, after the line `import "./import-youtube-thumbnail";`:

```ts
import "./finish-turn";
```

- [ ] **Step 6: Keep it away from MCP clients**

Re-read `src/lib/agent/mcp/server.ts`. Replace

```ts
  for (const tool of listTools()) {
```

with

```ts
  for (const tool of listTools()) {
    // Chat-only tools (finish_turn) mean nothing to an external MCP client.
    if (tool.chatOnly) continue;
```

- [ ] **Step 7: Run the tests**

Run: `./node_modules/.bin/vitest run tests/agent/finish-turn-tool.test.ts tests/agent/mcp-server.test.ts tests/agent/registry-full.test.ts tests/agent/registry.test.ts`
Expected: PASS (12 new tests; the existing registry and MCP tests unchanged).

- [ ] **Step 8: Type-check, lint and commit**

Run: `./node_modules/.bin/tsc --noEmit` — expected: exit 0.
Run: `./node_modules/.bin/eslint src/lib/agent/finish-turn.ts src/lib/agent/tools/finish-turn.ts src/lib/agent/tools/types.ts src/lib/agent/tools/all.ts src/lib/agent/mcp/server.ts tests/agent/finish-turn-tool.test.ts` — expected: no error.

```bash
git add src/lib/agent/finish-turn.ts src/lib/agent/tools/finish-turn.ts src/lib/agent/tools/types.ts src/lib/agent/tools/all.ts src/lib/agent/mcp/server.ts tests/agent/finish-turn-tool.test.ts
git commit -m "feat(agent): chat-only finish_turn tool, hidden from MCP" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Result ids for visual tools and a loop that stops on `finish_turn`

**Files:**
- Modify: `src/lib/agent/v2/tool-adapter.ts`, `src/lib/agent/v2/route-handler.ts`
- Test: `tests/agent/finish-turn-wiring.test.ts`

**Interfaces:**
- Consumes (Task 2): `appendResultId`, `FINISH_TURN_TOOL_NAME` from `@/lib/agent/finish-turn`.
- Produces: `buildAiSdkTools()` still returns every registry tool (now including `finish_turn`); a visual tool's successful `execute()` output ends with `{ type: "text", text: "result_id: <toolCallId>" }`; `postV2` passes `stopWhen: [isStepCount(agentMaxSteps), hasToolCall("finish_turn")]`.

- [ ] **Step 1: Write the failing tests**

Create `tests/agent/finish-turn-wiring.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { UIMessage } from "ai";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

vi.mock("@/lib/agent/conversation/store", () => ({
  appendMessage: vi.fn(),
  listMessages: vi.fn(() => []),
}));

vi.mock("@/lib/agent/v2/persist-turn", () => ({
  persistAssistantTurn: vi.fn(),
}));

vi.mock("@/lib/agent/conversation/auto-title", () => ({
  generateAndPersistTitle: vi.fn(async () => {}),
}));

// Never call a real model: streamText is replaced, everything else in "ai" stays real.
const streamTextMock = vi.fn();
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, streamText: (opts: unknown) => streamTextMock(opts) };
});

import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import { getTool } from "@/lib/agent/tools";
import { buildAiSdkTools } from "@/lib/agent/v2/tool-adapter";
import { lastAssistantMessageIsCompleteWithClientToolCalls } from "@/components/panels/chat/should-auto-continue";

type Content = Array<{ type: string; text?: string }>;
type StopCondition = (options: { steps: Array<{ toolCalls: Array<{ toolName: string }> }> }) => boolean | PromiseLike<boolean>;

describe("AI SDK tools", () => {
  it("expose finish_turn to the chat model", () => {
    expect(Object.keys(buildAiSdkTools())).toContain("finish_turn");
  });

  it("end a visual tool's successful output with its result_id", async () => {
    const def = getTool("generate_sketch")!;
    const spy = vi.spyOn(def, "handler").mockResolvedValue({
      content: [
        { type: "text", text: "Sketch generated. Reference: generated:sk_abc (cost: $0.040)" },
        { type: "image", mimeType: "image/png", data: "AAA=" },
      ],
    });
    try {
      const tools = buildAiSdkTools();
      const out = (await tools.generate_sketch.execute!({}, { toolCallId: "call_42" } as never)) as { content: Content };
      expect(out.content).toHaveLength(3);
      expect(out.content[0].text).toContain("generated:sk_abc");
      expect(out.content.at(-1)).toEqual({ type: "text", text: "result_id: call_42" });
    } finally {
      spy.mockRestore();
    }
  });

  it("leave failed visual outputs and other tools untouched", async () => {
    const def = getTool("generate_sketch")!;
    const spy = vi.spyOn(def, "handler").mockResolvedValue({ isError: true, content: [{ type: "text", text: "OpenRouter API error 500" }] });
    try {
      const tools = buildAiSdkTools();
      const failed = (await tools.generate_sketch.execute!({}, { toolCallId: "call_1" } as never)) as { content: Content };
      expect(failed.content).toEqual([{ type: "text", text: "OpenRouter API error 500" }]);
      const logos = (await tools.list_logos.execute!({}, { toolCallId: "call_2" } as never)) as { content: Content };
      expect(logos.content.some((c) => c.text?.startsWith("result_id:"))).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("chat route", () => {
  beforeEach(() => {
    getDb().exec("DELETE FROM settings");
    setSetting("openrouterApiKey", "test-key");
    streamTextMock.mockReset();
    streamTextMock.mockReturnValue({
      toUIMessageStreamResponse: () => new Response("ok", { headers: { "content-type": "text/event-stream" } }),
      consumeStream: vi.fn(async () => {}),
    });
  });

  it("stops the tool loop right after a finish_turn step, and only then", async () => {
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    await postV2(
      new Request("http://localhost/api/agent/chat", {
        method: "POST",
        body: JSON.stringify({
          conversation_id: `c-${Math.random().toString(36).slice(2)}`,
          project_id: "p1",
          messages: [{ role: "user", parts: [{ type: "text", text: "Salut" }] }],
          canvas_snapshot: { nodes: [], edges: [] },
        }),
      }) as never,
    );
    const args = streamTextMock.mock.calls[0][0] as { tools: Record<string, unknown>; stopWhen: StopCondition[] };
    expect(Object.keys(args.tools)).toContain("finish_turn");
    expect(Array.isArray(args.stopWhen)).toBe(true);
    const stops = async (toolNames: string[]) => {
      const steps = [{ toolCalls: toolNames.map((toolName) => ({ toolName })) }];
      for (const condition of args.stopWhen) if (await condition({ steps })) return true;
      return false;
    };
    expect(await stops(["finish_turn"])).toBe(true);
    expect(await stops(["generate_sketch", "finish_turn"])).toBe(true);
    expect(await stops(["generate_sketch"])).toBe(false);
  });
});

describe("auto-continuation", () => {
  const assistant = (parts: unknown[]) => [{ id: "m1", role: "assistant", parts } as unknown as UIMessage];

  it("never resumes a turn that ended with finish_turn", () => {
    const messages = assistant([
      { type: "step-start" },
      { type: "tool-generate_sketch", state: "output-available", toolCallId: "c1" },
      { type: "step-start" },
      { type: "tool-finish_turn", state: "output-available", toolCallId: "c2" },
    ]);
    expect(lastAssistantMessageIsCompleteWithClientToolCalls({ messages })).toBe(false);
  });

  it("still resumes when the last step resolved a client request next to finish_turn", () => {
    const messages = assistant([
      { type: "step-start" },
      { type: "tool-request_user_image", state: "output-available", toolCallId: "c1" },
      { type: "tool-finish_turn", state: "output-available", toolCallId: "c2" },
    ]);
    expect(lastAssistantMessageIsCompleteWithClientToolCalls({ messages })).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `./node_modules/.bin/vitest run tests/agent/finish-turn-wiring.test.ts`
Expected: FAIL — « end a visual tool's successful output with its result_id » (content has 2 items) and « stops the tool loop right after a finish_turn step » (`stopWhen` is not an array). The auto-continuation tests already pass: they pin the ruling that `should-auto-continue.ts` needs no change.

- [ ] **Step 3: Append result ids in the adapter**

Re-read `src/lib/agent/v2/tool-adapter.ts`. After

```ts
import type { ToolContent, ToolResult } from "@/lib/agent/tools/types";
```

add

```ts
import { appendResultId } from "@/lib/agent/finish-turn";
```

and replace

```ts
    execute: async (input: unknown) => {
      const result: ToolResult = await def.handler(input);
      return result as any;
    },
```

with

```ts
    execute: async (input: unknown, { toolCallId }: { toolCallId: string }) => {
      const result: ToolResult = await def.handler(input);
      // Visual tools end with "result_id: <toolCallId>" so the model can cite
      // them in finish_turn.results — it never sees tool call ids otherwise.
      return appendResultId(name, result, toolCallId) as any;
    },
```

(`toModelOutput` is unchanged: the extra text item reaches the model like any other text.)

- [ ] **Step 4: Stop the loop after `finish_turn`**

Re-read `src/lib/agent/v2/route-handler.ts`. Replace

```ts
import { streamText, isStepCount, type ModelMessage } from "ai";
```

with

```ts
import { streamText, isStepCount, hasToolCall, type ModelMessage } from "ai";
```

after

```ts
import { persistAssistantTurn } from "./persist-turn";
```

add

```ts
import { FINISH_TURN_TOOL_NAME } from "@/lib/agent/finish-turn";
```

and replace

```ts
    stopWhen: isStepCount(settings.agentMaxSteps),
```

with

```ts
    // finish_turn closes the turn: stop right after its step instead of
    // paying for one more model call that would only restate the answer.
    stopWhen: [isStepCount(settings.agentMaxSteps), hasToolCall(FINISH_TURN_TOOL_NAME)],
```

- [ ] **Step 5: Run the tests**

Run: `./node_modules/.bin/vitest run tests/agent/finish-turn-wiring.test.ts tests/agent/v2-tool-adapter.test.ts tests/agent/v2-route-handler.test.ts tests/agent/v2-route-handler-settings.test.ts tests/agent/should-auto-continue.test.ts`
Expected: PASS (6 new tests; the existing adapter, route and auto-continuation tests unchanged — `isStepCount` is still called with the « Étapes max » setting).

- [ ] **Step 6: Type-check, lint and commit**

Run: `./node_modules/.bin/tsc --noEmit` — expected: exit 0.
Run: `./node_modules/.bin/eslint src/lib/agent/v2/tool-adapter.ts src/lib/agent/v2/route-handler.ts tests/agent/finish-turn-wiring.test.ts` — expected: no new error (the adapter's existing `as any` casts are unchanged).

```bash
git add src/lib/agent/v2/tool-adapter.ts src/lib/agent/v2/route-handler.ts tests/agent/finish-turn-wiring.test.ts
git commit -m "feat(agent): cite visual results by id and stop the loop on finish_turn" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Turn model and step labels

**Files:**
- Create: `src/components/panels/chat/turn-model.ts`
- Modify: `src/lib/agent/tool-labels.ts` (rewrite)
- Test: `tests/chat/turn-model.test.ts`, `tests/agent/tool-labels.test.ts`

**Interfaces:**
- Consumes (Task 2): `FINISH_TURN_TOOL_NAME`, `isVisualResultTool`, `parseFinishTurnInput`, `type FinishTurnInput`.
- Produces (`src/lib/agent/tool-labels.ts`): `TOOL_LABELS: Record<string, string>` (kept), `toolLabel(toolName: string): string`.
- Produces (`src/components/panels/chat/turn-model.ts`):
  - types `MessagePart`, `ToolPart` (= `Extract<UIMessage["parts"][number], { type: \`tool-${string}\` }>`), `ToolStatus = "running" | "done" | "error"`, `TurnStep = ReasoningStep | TextStep | ToolStep` with `ReasoningStep = { kind: "reasoning"; id; text }`, `TextStep = { kind: "text"; id; text }`, `ToolStep = { kind: "tool"; id; toolName; label; status: ToolStatus; errorText: string | null; part: ToolPart; shownInResults: boolean }`, `NextAction = { kind: "ask_agent"; label; message } | { kind: "focus_node"; label; nodeId }`, `TurnMetadata = { durationMs?: number; interrupted?: boolean }`, `AssistantTurn = { steps; answer: string; results: ToolPart[]; nextActions: NextAction[]; pending: ToolPart[]; durationMs: number | null; stepCount: number; interrupted: boolean; hasFinishTurn: boolean }`, `TurnError = { title: string; description: string }`, `TurnDisplay = { mode: "progress" | "done"; error: TurnError | null; showActions: boolean; canRetry: boolean }`
  - `CLIENT_TOOL_NAMES`, `INTERRUPTED_TURN_ERROR`, `liveTurnError(message: string | null): TurnError`, `isBusyStatus(status: ChatStatus): boolean`, `emptyAssistantTurn(): AssistantTurn`
  - `isToolPart(part)`, `toolNameOf(part: ToolPart): string`, `toolStatus(part: ToolPart): { status: ToolStatus; errorText: string | null }`, `readTurnMetadata(message: UIMessage): TurnMetadata`
  - `splitAssistantTurn(message: UIMessage): AssistantTurn`
  - `currentStepLabel(message: UIMessage | undefined, status: ChatStatus): string`
  - `formatTurnDuration(ms: number): string`, `formatElapsed(ms: number): string`, `stepCountLabel(count: number): string`, `turnHeaderLabel(turn: Pick<AssistantTurn, "durationMs" | "stepCount">): string`
  - `turnDisplay(input: { isLast: boolean; status: ChatStatus; errorMessage: string | null; stoppedLive: boolean; interrupted: boolean }): TurnDisplay`

- [ ] **Step 1: Write the failing tests**

Create `tests/agent/tool-labels.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

import "@/lib/agent/tools/all";
import { listTools } from "@/lib/agent/tools";
import { TOOL_LABELS, toolLabel } from "@/lib/agent/tool-labels";

describe("tool labels", () => {
  it("label every registered tool and both client requests", () => {
    const names = [...listTools().map((tool) => tool.name), "request_user_image", "request_user_sketch"];
    for (const name of names) expect(TOOL_LABELS[name], name).toBeTruthy();
  });

  it("say what the agent is doing", () => {
    expect(toolLabel("get_canvas_state")).toBe("Lit le canvas");
    expect(toolLabel("search_youtube")).toBe("Cherche sur YouTube");
    expect(toolLabel("generate_sketch")).toBe("Dessine le croquis");
    expect(toolLabel("apply_workflow")).toBe("Construit le workflow");
    expect(toolLabel("import_youtube_thumbnail")).toBe("Importe la miniature");
    expect(toolLabel("list_personas")).toBe("Liste tes personnages");
    expect(toolLabel("finish_turn")).toBe("Rédige la réponse");
  });

  it("fall back to a readable tool name", () => {
    expect(toolLabel("web_fetch")).toBe("web fetch");
  });
});
```

Create `tests/chat/turn-model.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { UIMessage } from "ai";
import {
  INTERRUPTED_TURN_ERROR,
  currentStepLabel,
  emptyAssistantTurn,
  formatElapsed,
  formatTurnDuration,
  isBusyStatus,
  splitAssistantTurn,
  toolStatus,
  turnDisplay,
  turnHeaderLabel,
  type ToolPart,
} from "@/components/panels/chat/turn-model";

const PNG = "iVBORw0KGgo=";

function assistant(parts: unknown[], metadata?: unknown): UIMessage {
  return { id: "a1", role: "assistant", parts, ...(metadata === undefined ? {} : { metadata }) } as unknown as UIMessage;
}

const text = (value: string) => ({ type: "text", text: value });

const tool = (name: string, toolCallId: string, extra: Record<string, unknown> = {}) => ({
  type: `tool-${name}`,
  toolCallId,
  state: "output-available",
  input: {},
  output: { content: [{ type: "text", text: "ok" }] },
  ...extra,
});

const sketch = (toolCallId: string) =>
  tool("generate_sketch", toolCallId, {
    input: { prompt: toolCallId },
    output: {
      content: [
        { type: "text", text: `Sketch generated. Reference: generated:sk_${toolCallId}` },
        { type: "image", mimeType: "image/png", data: PNG },
        { type: "text", text: `result_id: ${toolCallId}` },
      ],
    },
  });

const finish = (input: unknown) => tool("finish_turn", "fin", { input, output: { content: [{ type: "text", text: '{"ok":true}' }] } });

const ids = (parts: ToolPart[]) => parts.map((part) => part.toolCallId);

const stepNames = (message: UIMessage) =>
  splitAssistantTurn(message).steps.map((step) => (step.kind === "tool" ? `tool:${step.toolName}` : `${step.kind}:${step.text}`));

describe("splitAssistantTurn with finish_turn", () => {
  const message = assistant([
    { type: "step-start" },
    { type: "reasoning", text: "Je réfléchis." },
    text("Je dessine deux croquis."),
    sketch("c1"),
    sketch("c2"),
    tool("apply_workflow", "c3"),
    { type: "step-start" },
    finish({
      summary: "Deux angles prêts.",
      results: ["c2", "c1", "c2", "inconnu", "c3"],
      next_actions: [
        { label: "Angle A", kind: "ask_agent", message: "Je choisis l'angle A." },
        { label: "Voir le générateur", kind: "focus_node", node_id: "gen-1" },
      ],
    }),
  ]);

  it("answers with the summary and keeps finish_turn out of the steps", () => {
    const turn = splitAssistantTurn(message);
    expect(turn.hasFinishTurn).toBe(true);
    expect(turn.answer).toBe("Deux angles prêts.");
    expect(stepNames(message)).toEqual([
      "reasoning:Je réfléchis.",
      "text:Je dessine deux croquis.",
      "tool:generate_sketch",
      "tool:generate_sketch",
      "tool:apply_workflow",
    ]);
    expect(turn.stepCount).toBe(5);
  });

  it("shows the listed visual results in order, once, ignoring unknown and non-visual ids", () => {
    const turn = splitAssistantTurn(message);
    expect(ids(turn.results)).toEqual(["c2", "c1"]);
    expect(turn.steps.flatMap((step) => (step.kind === "tool" ? [step.shownInResults] : []))).toEqual([true, true, false]);
  });

  it("maps next actions", () => {
    expect(splitAssistantTurn(message).nextActions).toEqual([
      { kind: "ask_agent", label: "Angle A", message: "Je choisis l'angle A." },
      { kind: "focus_node", label: "Voir le générateur", nodeId: "gen-1" },
    ]);
  });

  it("keeps every text as a step", () => {
    const turn = splitAssistantTurn(assistant([tool("get_canvas_state", "c1"), text("Voilà le plan."), finish({ summary: "Plan prêt." })]));
    expect(turn.answer).toBe("Plan prêt.");
    expect(turn.steps.map((step) => step.kind)).toEqual(["tool", "text"]);
  });

  it("shows no result when finish_turn lists none", () => {
    const turn = splitAssistantTurn(assistant([sketch("c1"), finish({ summary: "Rien à montrer." })]));
    expect(turn.results).toEqual([]);
    expect(turn.steps[0]).toMatchObject({ kind: "tool", shownInResults: false });
  });

  it("falls back silently when the finish_turn input is invalid", () => {
    const invalid = assistant([text("Je cherche."), sketch("c1"), text("Voici un croquis."), finish({ summary: "" })]);
    const turn = splitAssistantTurn(invalid);
    expect(turn.hasFinishTurn).toBe(false);
    expect(turn.answer).toBe("Voici un croquis.");
    expect(ids(turn.results)).toEqual(["c1"]);
    expect(turn.nextActions).toEqual([]);
    expect(stepNames(invalid)).toEqual(["text:Je cherche.", "tool:generate_sketch"]);
  });
});

describe("splitAssistantTurn without finish_turn", () => {
  it("answers with the texts after the last tool", () => {
    const message = assistant([text("Je lis."), tool("get_canvas_state", "c1"), text("Le canvas est vide."), text("On commence ?")]);
    expect(splitAssistantTurn(message).answer).toBe("Le canvas est vide.\n\nOn commence ?");
    expect(stepNames(message)).toEqual(["text:Je lis.", "tool:get_canvas_state"]);
  });

  it("answers with the last text when the turn ends on a tool", () => {
    const message = assistant([text("Je construis."), tool("apply_workflow", "c1")]);
    expect(splitAssistantTurn(message).answer).toBe("Je construis.");
    expect(stepNames(message)).toEqual(["tool:apply_workflow"]);
  });

  it("keeps a plain reply without any step", () => {
    const turn = splitAssistantTurn(assistant([text("Salut !")]));
    expect(turn.answer).toBe("Salut !");
    expect(turn.stepCount).toBe(0);
  });

  it("states the failure when the turn stops on a failed tool", () => {
    const message = assistant([
      text("Je dessine."),
      { type: "tool-generate_sketch", toolCallId: "c1", state: "output-error", input: {}, errorText: "OpenRouter API error 500" },
    ]);
    const turn = splitAssistantTurn(message);
    expect(turn.answer).toBe("Échec de l'étape « Dessine le croquis » : OpenRouter API error 500");
    expect(stepNames(message)).toEqual(["text:Je dessine.", "tool:generate_sketch"]);
    expect(turn.steps[1]).toMatchObject({ status: "error", errorText: "OpenRouter API error 500" });
  });

  it("shows every successful visual output as a result", () => {
    const turn = splitAssistantTurn(
      assistant([
        tool("search_youtube", "c1"),
        sketch("c2"),
        tool("generate_sketch", "c3", { output: { isError: true, content: [{ type: "text", text: "boom" }] } }),
        tool("apply_workflow", "c4"),
      ]),
    );
    expect(ids(turn.results)).toEqual(["c1", "c2"]);
  });
});

describe("client requests", () => {
  it("keeps a pending request out of the steps", () => {
    const turn = splitAssistantTurn(
      assistant([
        text("Il me faut ton logo."),
        { type: "tool-request_user_image", toolCallId: "c1", state: "input-available", input: { reason: "logo" } },
      ]),
    );
    expect(ids(turn.pending)).toEqual(["c1"]);
    expect(turn.steps).toEqual([]);
    expect(turn.answer).toBe("Il me faut ton logo.");
  });

  it("lists an answered request as a step", () => {
    const message = assistant([tool("request_user_image", "c1", { output: { source_ids: ["stored:lg_1"] } })]);
    expect(splitAssistantTurn(message).pending).toEqual([]);
    expect(stepNames(message)).toEqual(["tool:request_user_image"]);
  });
});

describe("turn metadata", () => {
  it("reads the duration and the interruption", () => {
    const turn = splitAssistantTurn(assistant([text("x")], { durationMs: 12_000, interrupted: true }));
    expect(turn.durationMs).toBe(12_000);
    expect(turn.interrupted).toBe(true);
  });

  it("ignores malformed metadata", () => {
    const turn = splitAssistantTurn(assistant([text("x")], { durationMs: -1, interrupted: "oui" }));
    expect(turn.durationMs).toBeNull();
    expect(turn.interrupted).toBe(false);
  });
});

describe("toolStatus", () => {
  const status = (part: unknown) => toolStatus(part as ToolPart);

  it("is running until an output arrives", () => {
    expect(status({ type: "tool-x", toolCallId: "c", state: "input-streaming" })).toEqual({ status: "running", errorText: null });
    expect(status({ type: "tool-x", toolCallId: "c", state: "input-available", input: {} })).toEqual({ status: "running", errorText: null });
  });

  it("detects every error shape", () => {
    expect(status({ type: "tool-x", toolCallId: "c", state: "output-error", errorText: "boom" })).toEqual({ status: "error", errorText: "boom" });
    expect(status({ type: "tool-x", toolCallId: "c", state: "output-denied" })).toEqual({ status: "error", errorText: "Refusé" });
    expect(status(tool("x", "c", { output: { isError: true, content: [{ type: "text", text: "clé absente" }] } }))).toEqual({ status: "error", errorText: "clé absente" });
    expect(status(tool("x", "c", { output: { type: "error-text", value: "abandon" } }))).toEqual({ status: "error", errorText: "abandon" });
    expect(status(tool("x", "c"))).toEqual({ status: "done", errorText: null });
  });
});

describe("currentStepLabel", () => {
  it("says Réfléchit when nothing more precise is known", () => {
    expect(currentStepLabel(undefined, "submitted")).toBe("Réfléchit");
    expect(currentStepLabel(assistant([text("x")]), "submitted")).toBe("Réfléchit");
    expect(currentStepLabel(assistant([]), "streaming")).toBe("Réfléchit");
    expect(currentStepLabel(assistant([{ type: "reasoning", text: "…" }]), "streaming")).toBe("Réfléchit");
    expect(currentStepLabel(assistant([text("x"), { type: "step-start" }]), "streaming")).toBe("Réfléchit");
    expect(currentStepLabel(assistant([tool("search_youtube", "c1")]), "streaming")).toBe("Réfléchit");
    expect(currentStepLabel({ id: "u", role: "user", parts: [] } as UIMessage, "streaming")).toBe("Réfléchit");
  });

  it("names the running tool and the answer being written", () => {
    const running = (name: string) => assistant([{ type: `tool-${name}`, toolCallId: "c1", state: "input-available", input: {} }]);
    expect(currentStepLabel(running("search_youtube"), "streaming")).toBe("Cherche sur YouTube");
    expect(currentStepLabel(running("finish_turn"), "streaming")).toBe("Rédige la réponse");
    expect(currentStepLabel(assistant([text("Je")]), "streaming")).toBe("Rédige la réponse");
  });
});

describe("formatting", () => {
  it("formats durations and the live timer", () => {
    expect(formatTurnDuration(400)).toBe("1 s");
    expect(formatTurnDuration(12_400)).toBe("12 s");
    expect(formatTurnDuration(60_000)).toBe("1 min");
    expect(formatTurnDuration(75_000)).toBe("1 min 15 s");
    expect(formatElapsed(-5)).toBe("0:00");
    expect(formatElapsed(9_999)).toBe("0:09");
    expect(formatElapsed(75_000)).toBe("1:15");
  });

  it("builds the folded header", () => {
    expect(turnHeaderLabel({ durationMs: 12_000, stepCount: 1 })).toBe("12 s · 1 étape");
    expect(turnHeaderLabel({ durationMs: null, stepCount: 4 })).toBe("4 étapes");
  });
});

describe("turnDisplay", () => {
  const base = { isLast: true, status: "ready" as const, errorMessage: null, stoppedLive: false, interrupted: false };

  it("shows the live line only on the last message of a running turn", () => {
    expect(turnDisplay({ ...base, status: "streaming" }).mode).toBe("progress");
    expect(turnDisplay({ ...base, status: "submitted" }).mode).toBe("progress");
    expect(turnDisplay({ ...base, isLast: false, status: "streaming" })).toEqual({ mode: "done", error: null, showActions: false, canRetry: false });
  });

  it("offers actions on the last finished turn only", () => {
    expect(turnDisplay(base)).toEqual({ mode: "done", error: null, showActions: true, canRetry: false });
    expect(turnDisplay({ ...base, isLast: false }).showActions).toBe(false);
  });

  it("turns a failed or stopped last turn into an error with Réessayer", () => {
    expect(turnDisplay({ ...base, status: "error", errorMessage: "Clé absente" })).toEqual({
      mode: "done",
      error: { title: "Erreur", description: "Clé absente" },
      showActions: false,
      canRetry: true,
    });
    expect(turnDisplay({ ...base, status: "error" }).error?.description).toBe("Une erreur est survenue.");
    expect(turnDisplay({ ...base, stoppedLive: true }).error).toEqual(INTERRUPTED_TURN_ERROR);
    expect(turnDisplay({ ...base, isLast: false, interrupted: true })).toEqual({
      mode: "done",
      error: INTERRUPTED_TURN_ERROR,
      showActions: false,
      canRetry: false,
    });
  });

  it("knows busy statuses and the empty turn", () => {
    expect(["submitted", "streaming"].every((s) => isBusyStatus(s as "submitted"))).toBe(true);
    expect(isBusyStatus("ready")).toBe(false);
    expect(emptyAssistantTurn()).toMatchObject({ answer: "", stepCount: 0, steps: [], results: [] });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `./node_modules/.bin/vitest run tests/agent/tool-labels.test.ts tests/chat/turn-model.test.ts`
Expected: FAIL — `toolLabel` is not exported, `finish_turn` has no label, and `Failed to resolve import "@/components/panels/chat/turn-model"`.

- [ ] **Step 3: Rewrite the labels**

Re-read `src/lib/agent/tool-labels.ts` (if a chantier added a tool to the registry since `88f7697`, give it a label in the same style). Replace the whole file with:

```ts
/**
 * Single source of truth for tool display labels in the chat (live step line
 * and step detail). Each label says what the agent is doing, in French.
 */
export const TOOL_LABELS: Record<string, string> = {
  list_logos: "Liste tes logos",
  list_personas: "Liste tes personnages",
  list_swipe_files: "Liste tes références",
  list_projects: "Liste tes miniatures",
  list_past_generations: "Relit les générations passées",
  get_canvas_state: "Lit le canvas",
  apply_workflow: "Construit le workflow",
  generate_sketch: "Dessine le croquis",
  extract_youtube_script: "Lit la transcription YouTube",
  search_youtube: "Cherche sur YouTube",
  search_youtube_channel: "Cherche dans la chaîne",
  get_channel_videos: "Liste les vidéos de la chaîne",
  import_youtube_thumbnail: "Importe la miniature",
  request_user_image: "Demande une image",
  request_user_sketch: "Demande un croquis",
  finish_turn: "Rédige la réponse",
};

/** The label of a tool, or its name made readable when it has none. */
export function toolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? toolName.replace(/_/g, " ");
}
```

- [ ] **Step 4: Write the turn model**

Create `src/components/panels/chat/turn-model.ts`:

```ts
import type { ChatStatus, UIMessage } from "ai";
import { toolLabel } from "@/lib/agent/tool-labels";
import {
  FINISH_TURN_TOOL_NAME,
  isVisualResultTool,
  parseFinishTurnInput,
  type FinishTurnInput,
} from "@/lib/agent/finish-turn";

/**
 * Pure model of one assistant message for the chat panel (chantier E): what
 * goes in the folded step list, what the answer is, which tool outputs are
 * shown as results, and the « Et maintenant » actions. Used for live and
 * reopened conversations alike.
 */

export type MessagePart = UIMessage["parts"][number];
export type ToolPart = Extract<MessagePart, { type: `tool-${string}` }>;

/** Client tools the chat resolves itself (PendingUiAction) — matches should-auto-continue.ts. */
export const CLIENT_TOOL_NAMES: ReadonlySet<string> = new Set(["request_user_image", "request_user_sketch"]);

export type ToolStatus = "running" | "done" | "error";

export type ReasoningStep = { kind: "reasoning"; id: string; text: string };
export type TextStep = { kind: "text"; id: string; text: string };
export type ToolStep = {
  kind: "tool";
  id: string;
  toolName: string;
  label: string;
  status: ToolStatus;
  errorText: string | null;
  part: ToolPart;
  /** Already shown under « Résultats »: the detail only points to it. */
  shownInResults: boolean;
};
export type TurnStep = ReasoningStep | TextStep | ToolStep;

export type NextAction =
  | { kind: "ask_agent"; label: string; message: string }
  | { kind: "focus_node"; label: string; nodeId: string };

/** Stored on reopened assistant messages by history-to-ui-messages.ts. */
export type TurnMetadata = { durationMs?: number; interrupted?: boolean };

export type AssistantTurn = {
  steps: TurnStep[];
  answer: string;
  results: ToolPart[];
  nextActions: NextAction[];
  pending: ToolPart[];
  durationMs: number | null;
  stepCount: number;
  interrupted: boolean;
  hasFinishTurn: boolean;
};

export type TurnError = { title: string; description: string };

export const INTERRUPTED_TURN_ERROR: TurnError = {
  title: "Tour interrompu",
  description: "L'agent s'est arrêté avant d'avoir fini.",
};

export function liveTurnError(message: string | null): TurnError {
  return { title: "Erreur", description: message?.trim() || "Une erreur est survenue." };
}

export function isBusyStatus(status: ChatStatus): boolean {
  return status === "submitted" || status === "streaming";
}

export function emptyAssistantTurn(): AssistantTurn {
  return {
    steps: [],
    answer: "",
    results: [],
    nextActions: [],
    pending: [],
    durationMs: null,
    stepCount: 0,
    interrupted: false,
    hasFinishTurn: false,
  };
}

export function isToolPart(part: MessagePart): part is ToolPart {
  return part.type.startsWith("tool-");
}

export function toolNameOf(part: ToolPart): string {
  return part.type.slice("tool-".length);
}

/** Error text carried by a tool output that is formally "output-available", or null. */
function errorTextOfOutput(output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;
  // Reopened AI SDK error results: { type: "error-text" | "error-json", value }.
  if (o.type === "error-text" || o.type === "error-json") {
    return typeof o.value === "string" ? o.value : JSON.stringify(o.value ?? null);
  }
  // Live registry failures: ToolResult { isError: true, content: [{ type: "text", text }] }.
  if (o.isError === true) {
    const content = Array.isArray(o.content) ? (o.content as Array<{ type?: unknown; text?: unknown }>) : [];
    const first = content.find((c) => c?.type === "text" && typeof c.text === "string");
    return typeof first?.text === "string" ? first.text : "Erreur";
  }
  return null;
}

export function toolStatus(part: ToolPart): { status: ToolStatus; errorText: string | null } {
  if (part.state === "output-error") return { status: "error", errorText: part.errorText || "Erreur" };
  if (part.state === "output-denied") return { status: "error", errorText: "Refusé" };
  if (part.state === "output-available") {
    const errorText = errorTextOfOutput(part.output);
    return errorText === null ? { status: "done", errorText: null } : { status: "error", errorText };
  }
  return { status: "running", errorText: null };
}

export function readTurnMetadata(message: UIMessage): TurnMetadata {
  const metadata = message.metadata;
  if (!metadata || typeof metadata !== "object") return {};
  const { durationMs, interrupted } = metadata as Record<string, unknown>;
  const out: TurnMetadata = {};
  if (typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs >= 0) out.durationMs = durationMs;
  if (interrupted === true) out.interrupted = true;
  return out;
}

function isPendingClientRequest(part: ToolPart): boolean {
  return CLIENT_TOOL_NAMES.has(toolNameOf(part)) && (part.state === "input-streaming" || part.state === "input-available");
}

function isShowableResult(part: ToolPart): boolean {
  return isVisualResultTool(toolNameOf(part)) && part.state === "output-available" && toolStatus(part).status === "done";
}

function toNextAction(action: FinishTurnInput["next_actions"][number]): NextAction | null {
  if (action.kind === "ask_agent" && action.message) return { kind: "ask_agent", label: action.label, message: action.message };
  if (action.kind === "focus_node" && action.node_id) return { kind: "focus_node", label: action.label, nodeId: action.node_id };
  return null;
}

export function splitAssistantTurn(message: UIMessage): AssistantTurn {
  const parts = message.parts;
  const metadata = readTurnMetadata(message);

  let finish: FinishTurnInput | null = null;
  const pending: ToolPart[] = [];
  const stepToolIndexes = new Set<number>();
  const stepTools: ToolPart[] = [];
  let lastStepToolIndex = -1;
  const texts: Array<{ index: number; text: string }> = [];

  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (part.type === "text") {
      if (part.text.trim() !== "") texts.push({ index, text: part.text.trim() });
      continue;
    }
    if (!isToolPart(part)) continue;
    if (toolNameOf(part) === FINISH_TURN_TOOL_NAME) {
      // Never a step; only a complete, valid input counts (the last one wins).
      if (part.state === "input-available" || part.state === "output-available") {
        finish = parseFinishTurnInput(part.input) ?? finish;
      }
      continue;
    }
    if (isPendingClientRequest(part)) {
      pending.push(part);
      continue;
    }
    stepToolIndexes.add(index);
    stepTools.push(part);
    lastStepToolIndex = index;
  }

  let answer = "";
  const answerTextIndexes = new Set<number>();
  if (finish) {
    answer = finish.summary;
  } else {
    const trailing = texts.filter((t) => t.index > lastStepToolIndex);
    const lastTool = stepTools.at(-1);
    const lastToolStatus = lastTool ? toolStatus(lastTool) : null;
    if (trailing.length > 0) {
      answer = trailing.map((t) => t.text).join("\n\n");
      for (const t of trailing) answerTextIndexes.add(t.index);
    } else if (lastTool && lastToolStatus?.status === "error") {
      answer = `Échec de l'étape « ${toolLabel(toolNameOf(lastTool))} » : ${lastToolStatus.errorText}`;
    } else if (texts.length > 0) {
      const last = texts[texts.length - 1];
      answer = last.text;
      answerTextIndexes.add(last.index);
    }
  }

  let results: ToolPart[];
  if (finish) {
    const byId = new Map(stepTools.map((part) => [part.toolCallId, part]));
    results = [];
    for (const id of finish.results) {
      const part = byId.get(id);
      if (part && isShowableResult(part) && !results.includes(part)) results.push(part);
    }
  } else {
    results = stepTools.filter(isShowableResult);
  }

  const steps: TurnStep[] = [];
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    const id = `${message.id}:${index}`;
    if (part.type === "reasoning") {
      if (part.text.trim() !== "") steps.push({ kind: "reasoning", id, text: part.text });
    } else if (part.type === "text") {
      if (part.text.trim() !== "" && !answerTextIndexes.has(index)) steps.push({ kind: "text", id, text: part.text.trim() });
    } else if (isToolPart(part) && stepToolIndexes.has(index)) {
      const toolName = toolNameOf(part);
      const { status, errorText } = toolStatus(part);
      steps.push({
        kind: "tool",
        id,
        toolName,
        label: toolLabel(toolName),
        status,
        errorText,
        part,
        shownInResults: results.includes(part),
      });
    }
  }

  const nextActions = finish
    ? finish.next_actions.map(toNextAction).filter((action): action is NextAction => action !== null)
    : [];

  return {
    steps,
    answer,
    results,
    nextActions,
    pending,
    durationMs: metadata.durationMs ?? null,
    stepCount: steps.length,
    interrupted: metadata.interrupted === true,
    hasFinishTurn: finish !== null,
  };
}

/** Label of the live step line, from the last part of the running message. */
export function currentStepLabel(message: UIMessage | undefined, status: ChatStatus): string {
  if (status === "submitted" || !message || message.role !== "assistant") return "Réfléchit";
  const last = message.parts.at(-1);
  if (!last) return "Réfléchit";
  if (last.type === "text") return "Rédige la réponse";
  if (isToolPart(last)) {
    return toolStatus(last).status === "running" ? toolLabel(toolNameOf(last)) : "Réfléchit";
  }
  return "Réfléchit";
}

export function formatTurnDuration(ms: number): string {
  const total = Math.max(1, Math.round(ms / 1000));
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`;
}

/** Live timer text, m:ss. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function stepCountLabel(count: number): string {
  return `${count} étape${count > 1 ? "s" : ""}`;
}

/** « 12 s · 4 étapes », or « 4 étapes » when the duration is unknown. */
export function turnHeaderLabel(turn: Pick<AssistantTurn, "durationMs" | "stepCount">): string {
  const steps = stepCountLabel(turn.stepCount);
  return turn.durationMs === null ? steps : `${formatTurnDuration(turn.durationMs)} · ${steps}`;
}

export type TurnDisplay = {
  mode: "progress" | "done";
  error: TurnError | null;
  showActions: boolean;
  canRetry: boolean;
};

/** How an assistant message renders given its place in the list and the chat status. */
export function turnDisplay(input: {
  isLast: boolean;
  status: ChatStatus;
  errorMessage: string | null;
  stoppedLive: boolean;
  interrupted: boolean;
}): TurnDisplay {
  if (input.isLast && isBusyStatus(input.status)) {
    return { mode: "progress", error: null, showActions: false, canRetry: false };
  }
  const error =
    input.isLast && input.status === "error"
      ? liveTurnError(input.errorMessage)
      : input.interrupted || (input.isLast && input.stoppedLive)
        ? INTERRUPTED_TURN_ERROR
        : null;
  return { mode: "done", error, showActions: input.isLast && error === null, canRetry: input.isLast && error !== null };
}
```

- [ ] **Step 5: Run the tests**

Run: `./node_modules/.bin/vitest run tests/agent/tool-labels.test.ts tests/chat/turn-model.test.ts`
Expected: PASS (3 + 25 tests).

- [ ] **Step 6: Type-check, lint and commit**

Run: `./node_modules/.bin/tsc --noEmit` — expected: exit 0 (`AgentActivity.tsx` and `ToolCallCard.tsx` still import `TOOL_LABELS`, which is kept).
Run: `./node_modules/.bin/eslint src/lib/agent/tool-labels.ts src/components/panels/chat/turn-model.ts tests/agent/tool-labels.test.ts tests/chat/turn-model.test.ts` — expected: no error.

```bash
git add src/lib/agent/tool-labels.ts src/components/panels/chat/turn-model.ts tests/agent/tool-labels.test.ts tests/chat/turn-model.test.ts
git commit -m "feat(chat): pure turn model — steps, answer, results, next actions" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Duration and interruption of reopened turns

**Files:**
- Modify: `src/components/panels/chat/history-to-ui-messages.ts` (full new version)
- Test: `tests/chat/history-turn-metadata.test.ts`

**Interfaces:**
- Consumes (Task 4): `type TurnMetadata`.
- Produces: `type StoredMessageRow = { id: string; role: "user" | "assistant"; content_json: string; created_at?: string; interrupted?: number }`, `parseStoredTimestamp(value: string | undefined): number | null`, `rowsToUIMessages(rows: StoredMessageRow[]): UIMessage[]` (assistant messages carry `metadata: TurnMetadata` when known; an interrupted empty row gives an empty assistant message).

- [ ] **Step 1: Write the failing tests**

Create `tests/chat/history-turn-metadata.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseStoredTimestamp, rowsToUIMessages, type StoredMessageRow } from "@/components/panels/chat/history-to-ui-messages";

const json = (messages: unknown[]) => JSON.stringify(messages);
const userRow = (id: string, text: string, created_at?: string): StoredMessageRow => ({
  id,
  role: "user",
  content_json: json([{ role: "user", content: [{ type: "text", text }] }]),
  interrupted: 0,
  ...(created_at ? { created_at } : {}),
});

describe("parseStoredTimestamp", () => {
  it("reads SQLite datetime('now') values as UTC", () => {
    expect(parseStoredTimestamp("2026-09-16 10:00:12")).toBe(Date.UTC(2026, 8, 16, 10, 0, 12));
  });

  it("reads ISO strings", () => {
    expect(parseStoredTimestamp("2026-09-16T10:00:12.500Z")).toBe(Date.UTC(2026, 8, 16, 10, 0, 12, 500));
  });

  it("returns null when missing or invalid", () => {
    expect(parseStoredTimestamp(undefined)).toBeNull();
    expect(parseStoredTimestamp("")).toBeNull();
    expect(parseStoredTimestamp("hier")).toBeNull();
  });
});

describe("rowsToUIMessages turn metadata", () => {
  it("measures an assistant turn from the row before it", () => {
    const messages = rowsToUIMessages([
      userRow("u1", "Salut", "2026-09-16 10:00:00"),
      {
        id: "a1",
        role: "assistant",
        content_json: json([{ role: "assistant", content: [{ type: "text", text: "Bonjour" }] }]),
        interrupted: 0,
        created_at: "2026-09-16 10:00:12",
      },
    ]);
    expect(messages[0].metadata).toBeUndefined();
    expect(messages[1].metadata).toEqual({ durationMs: 12_000 });
  });

  it("measures a resumed turn from the client request's result row", () => {
    const messages = rowsToUIMessages([
      userRow("u1", "Mets mon logo", "2026-09-16 10:00:00"),
      {
        id: "a1",
        role: "assistant",
        content_json: json([
          {
            role: "assistant",
            content: [
              { type: "text", text: "Il me faut ton logo." },
              { type: "tool-call", toolCallId: "c1", toolName: "request_user_image", input: { reason: "logo" } },
            ],
          },
        ]),
        interrupted: 0,
        created_at: "2026-09-16 10:00:05",
      },
      {
        id: "t1",
        role: "assistant",
        content_json: json([
          { role: "tool", content: [{ type: "tool-result", toolCallId: "c1", toolName: "request_user_image", output: { type: "json", value: { source_ids: ["stored:lg_1"] } } }] },
        ]),
        interrupted: 0,
        created_at: "2026-09-16 10:01:00",
      },
      {
        id: "a2",
        role: "assistant",
        content_json: json([{ role: "assistant", content: [{ type: "text", text: "Merci !" }] }]),
        interrupted: 0,
        created_at: "2026-09-16 10:01:07",
      },
    ]);
    expect(messages.map((m) => m.id)).toEqual(["u1", "a1", "a2"]);
    expect(messages[1].metadata).toEqual({ durationMs: 5_000 });
    expect(messages[1].parts[1]).toMatchObject({ state: "output-available" });
    expect(messages[2].metadata).toEqual({ durationMs: 7_000 });
  });

  it("keeps an interrupted turn without content as an empty assistant message", () => {
    const messages = rowsToUIMessages([
      userRow("u1", "Salut", "2026-09-16 10:00:00"),
      { id: "a1", role: "assistant", content_json: "[]", interrupted: 1, created_at: "2026-09-16 10:00:03" },
    ]);
    expect(messages[1]).toEqual({ id: "a1", role: "assistant", parts: [], metadata: { durationMs: 3_000, interrupted: true } });
  });

  it("flags an interrupted turn that has partial content", () => {
    const messages = rowsToUIMessages([
      userRow("u1", "Salut"),
      {
        id: "a1",
        role: "assistant",
        content_json: json([{ role: "assistant", content: [{ type: "text", text: "Je commence" }] }]),
        interrupted: 1,
      },
    ]);
    expect(messages[1].metadata).toEqual({ interrupted: true });
  });

  it("adds nothing when rows carry no timestamps", () => {
    const messages = rowsToUIMessages([
      { id: "u1", role: "user", content_json: json([{ role: "user", content: [{ type: "text", text: "Salut" }] }]) },
      { id: "a1", role: "assistant", content_json: json([{ role: "assistant", content: [{ type: "text", text: "Bonjour" }] }]) },
    ]);
    expect(messages.every((m) => m.metadata === undefined)).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `./node_modules/.bin/vitest run tests/chat/history-turn-metadata.test.ts`
Expected: FAIL — `parseStoredTimestamp` and `StoredMessageRow` are not exported; metadata is undefined.

- [ ] **Step 3: Rewrite the converter**

Re-read `src/components/panels/chat/history-to-ui-messages.ts`. Replace it with the version below (same conversion; the loop now knows the row index to compute metadata, and interrupted empty rows are kept):

```ts
import type { UIMessage } from "ai";
import type { TurnMetadata } from "./turn-model";

type ModelMessageContent =
  | { type: "text"; text: string }
  | { type: "file"; mediaType: string; data: string }
  | { type: "reasoning"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool-result"; toolCallId: string; toolName: string; output: unknown };

type PersistedModelMessage = {
  role: "user" | "assistant" | "tool";
  content: ModelMessageContent[];
};

/** One row of GET /api/agent/conversations/:id/messages (a `messages` table row). */
export type StoredMessageRow = {
  id: string;
  role: "user" | "assistant";
  content_json: string;
  /** SQLite `datetime('now')`: "YYYY-MM-DD HH:MM:SS", UTC. */
  created_at?: string;
  /** 1 when the turn was stopped or failed before it finished. */
  interrupted?: number;
};

/** A SQLite `datetime('now')` value (UTC, no zone) or an ISO string, in ms; null when absent or invalid. */
export function parseStoredTimestamp(value: string | undefined): number | null {
  if (!value) return null;
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Metadata of the assistant message started by `rows[rowIndex]`. A turn's row
 * is written when the turn ends, and the row before it (the user's message, or
 * the client-tool result that resumed the turn) when it started — so their
 * `created_at` gap is the turn's duration, to the second. Nothing new is stored.
 */
function assistantMetadata(rows: StoredMessageRow[], rowIndex: number): TurnMetadata | undefined {
  const row = rows[rowIndex];
  const metadata: TurnMetadata = {};
  const endedAt = parseStoredTimestamp(row.created_at);
  const startedAt = rowIndex > 0 ? parseStoredTimestamp(rows[rowIndex - 1].created_at) : null;
  if (endedAt !== null && startedAt !== null && endedAt >= startedAt) metadata.durationMs = endedAt - startedAt;
  if (row.interrupted === 1) metadata.interrupted = true;
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

/**
 * Converts persisted ModelMessage[] rows (Plan 1's storage format) into
 * UIMessage[] for useChat's initial state. ai@7.0.99 has no built-in
 * reverse of convertToModelMessages (confirmed absent during Plan 1's
 * final review) — this is a deliberate, hand-rolled inverse limited to
 * exactly the part shapes this app's tools ever produce (text, file,
 * tool-call/tool-result pairs, reasoning).
 */
export function rowsToUIMessages(rows: StoredMessageRow[]): UIMessage[] {
  const out: UIMessage[] = [];
  // Tool results arrive in a SEPARATE role:"tool" ModelMessage from the
  // assistant row that made the call (see Plan 1's persist-turn.ts) — merge
  // each tool-result back onto the matching tool-call by toolCallId so a
  // UIMessage's tool part carries both input AND output together, as
  // ToolCallCard's dispatcher (Task 9) expects from a single part.
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const persisted = JSON.parse(row.content_json) as PersistedModelMessage[];

    // A turn that failed or was stopped before producing anything is stored
    // as an empty, interrupted assistant row: keep it as an empty message so
    // the chat can show « Tour interrompu » where the answer should be.
    if (persisted.length === 0 && row.role === "assistant" && row.interrupted === 1) {
      out.push({ id: row.id, role: "assistant", parts: [], metadata: assistantMetadata(rows, rowIndex) });
      continue;
    }

    for (const msg of persisted) {
      if (msg.role === "tool") {
        // Fold onto the immediately-preceding UIMessage's matching tool part.
        const prev = out.at(-1);
        if (!prev) continue;
        for (const c of msg.content) {
          if (c.type !== "tool-result") continue;
          const part = prev.parts.find(
            (p): p is Extract<UIMessage["parts"][number], { type: `tool-${string}` }> =>
              p.type.startsWith("tool-") && "toolCallId" in p && p.toolCallId === c.toolCallId,
          );
          if (part && "state" in part) {
            (part as { state: string }).state = "output-available";
            (part as { output?: unknown }).output = c.output;
          }
        }
        continue;
      }

      const parts: UIMessage["parts"] = [];
      for (const c of msg.content) {
        if (c.type === "text") parts.push({ type: "text", text: c.text });
        else if (c.type === "file")
          // Persisted `data` is always a bare base64 string (route-handler.ts's
          // resolveImageSource() / the migration script's AnthropicBlock ->
          // FilePart conversion both write it that way — never a full data: URI
          // or hosted URL) — but FileUIPart.url must be an actual URL (hosted or
          // Data URL) for <img src> / download links to work, so rebuild the
          // data: URI here rather than passing the bare base64 through as-is.
          parts.push({ type: "file", mediaType: c.mediaType, url: `data:${c.mediaType};base64,${c.data}` });
        else if (c.type === "reasoning") parts.push({ type: "reasoning", text: c.text });
        else if (c.type === "tool-call") {
          parts.push({
            type: `tool-${c.toolName}`,
            toolCallId: c.toolCallId,
            state: "input-available",
            input: c.input,
          } as UIMessage["parts"][number]);
        }
      }

      // A row's content_json can hold MULTIPLE sequential non-tool entries —
      // not just one — because persist-turn.ts's onEnd aggregates
      // responseMessages across every step of a turn, and route-handler.ts
      // runs up to 25 steps (stopWhen: isStepCount(25)). A 2-step turn (call
      // tool A, get result, then call tool B or answer based on it) persists
      // as e.g. [assistant(callA), tool(resultA), assistant(callB-or-text)]
      // — all in ONE row. Pushing a new UIMessage per entry would give two
      // objects both carrying `id: row.id`, a duplicate React key in
      // MessageList (via uiMessageToLegacyDisplayMessage's `key={m.id}`) and
      // the same logical turn rendering as multiple bubbles on reload instead
      // of the single bubble it is live. So: only start a new UIMessage for
      // the FIRST non-tool entry of a row; every subsequent one appends its
      // parts onto that same message instead.
      const prevForRow = out.at(-1);
      if (prevForRow && prevForRow.id === row.id) {
        prevForRow.parts.push(...parts);
      } else {
        const metadata = row.role === "assistant" ? assistantMetadata(rows, rowIndex) : undefined;
        out.push({ id: row.id, role: msg.role as "user" | "assistant", parts, ...(metadata ? { metadata } : {}) });
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the tests**

Run: `./node_modules/.bin/vitest run tests/chat/history-turn-metadata.test.ts tests/agent/history-to-ui-messages.test.ts`
Expected: PASS (8 new tests; the existing converter tests unchanged).

- [ ] **Step 5: Type-check, lint and commit**

Run: `./node_modules/.bin/tsc --noEmit` — expected: exit 0.
Run: `./node_modules/.bin/eslint src/components/panels/chat/history-to-ui-messages.ts tests/chat/history-turn-metadata.test.ts` — expected: no error.

```bash
git add src/components/panels/chat/history-to-ui-messages.ts tests/chat/history-turn-metadata.test.ts
git commit -m "feat(chat): reopened turns carry their duration and interruption" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: System prompt — end every turn with `finish_turn`

**Files:**
- Modify: `src/lib/agent/system-prompt.ts` (inside `AGENT_SYSTEM_PROMPT` only)
- Test: `tests/agent/system-prompt-finish-turn.test.ts`

**Interfaces:**
- Consumes (Task 2): the tool name `finish_turn` and its fields; (Task 3) the `result_id: <id>` line.
- Produces: the static prompt instructions; `buildSystemMessages` unchanged.

- [ ] **Step 1: Write the failing test**

Create `tests/agent/system-prompt-finish-turn.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { AGENT_SYSTEM_PROMPT, DEFAULT_AGENT_PROMPT_PREFS, buildSystemMessages } from "@/lib/agent/system-prompt";
import { EMPTY_CHANNEL_PROFILE } from "@/lib/settings-schema";

describe("system prompt — finish_turn", () => {
  it("asks to end every turn with finish_turn and describes its fields", () => {
    for (const expected of [
      "ENDING EVERY TURN — finish_turn (mandatory)",
      "exactly once, as your LAST tool call",
      "max 400 characters",
      '"result_id: <id>"',
      'kind "ask_agent" + message (max 300 characters)',
      'kind "focus_node" + node_id',
      "label max 40 characters",
      "which costs money",
      "don't call finish_turn in the same step",
    ]) {
      expect(AGENT_SYSTEM_PROMPT).toContain(expected);
    }
  });

  it("no longer asks for long markdown answers or sketches embedded in text", () => {
    expect(AGENT_SYSTEM_PROMPT).not.toContain("OUTPUT FORMATTING");
    expect(AGENT_SYSTEM_PROMPT).not.toContain("SKETCH IMAGE EMBEDDED INLINE");
    expect(AGENT_SYSTEM_PROMPT).not.toContain("![Angle A]");
    expect(AGENT_SYSTEM_PROMPT).not.toContain("Always announce what you're about to do");
  });

  it("sends the generator hand-off through finish_turn with a focus_node action", () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('a focus_node next action on the generator\'s node id (label "Voir le générateur")');
    expect(AGENT_SYSTEM_PROMPT).toContain('one ask_agent button per angle (label "Angle A — Choc", message "Je choisis l\'angle A.")');
  });

  it("keeps finish_turn in the cached block and the dynamic blocks in the same order", () => {
    const prefs = { ...DEFAULT_AGENT_PROMPT_PREFS, channelProfile: { ...EMPTY_CHANNEL_PROFILE, name: "Demo" } };
    const blocks = buildSystemMessages({ nodes: [], edges: [] }, "proj-1", prefs);
    expect(blocks[0]).toEqual({ type: "text", text: AGENT_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } });
    expect(blocks.slice(1).map((block) => block.text.split("\n")[0].replace(/>.*$/, ">"))).toEqual([
      "<response_language>",
      "<channel_profile>",
      "<project_id>",
      "<canvas_state>",
    ]);
    expect(blocks.slice(1).some((block) => block.text.includes("finish_turn"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/agent/system-prompt-finish-turn.test.ts`
Expected: FAIL — the prompt has no « ENDING EVERY TURN » section and still contains « OUTPUT FORMATTING ».

- [ ] **Step 3: Edit the static prompt**

Re-read `src/lib/agent/system-prompt.ts`. All edits are inside the `AGENT_SYSTEM_PROMPT` template literal; the new text contains no backtick and no `${`.

(a) Replace the checklist line

```text
11. Final generation is triggered by the USER clicking "Generate" on the canvas generator node, not by a tool call — after apply_workflow succeeds, always remind them explicitly ("clique Generate sur le node generator pour lancer, ça a un coût").
```

with

```text
11. Final generation is triggered by the USER clicking "Générer" on the canvas generator node, not by a tool call — after apply_workflow succeeds, always remind them explicitly in finish_turn's summary ("clique Générer sur le générateur pour lancer, ça a un coût") and add a focus_node next action on that generator.
```

(b) Replace the rule

```text
- Always announce what you're about to do before calling a tool ("Je vais générer un croquis…")
```

with

```text
- Before a tool call, write at most one short sentence (or nothing): it only appears in the collapsed step list, never as your answer
```

(c) Replace the whole section from the line `OUTPUT FORMATTING — important for readability:` through the line `- Don't write a wall of text. Keep paragraphs to 2-3 sentences.` (inclusive) with:

```text
ENDING EVERY TURN — finish_turn (mandatory):
- End EVERY turn by calling finish_turn exactly once, as your LAST tool call, alone in its own step, once every other tool result is back. The chat shows the user only its summary, its results and its next_actions; everything else you wrote or called during the turn is folded into a collapsed step list.
- summary: 1 to 2 short sentences, max 400 characters, in the reply language — what you did, what you found, or what you need from the user. Never write a long answer in free text: no headings, no walls of text, no JSON. **Bold** on one key phrase is fine.
- results: the result_id values of this turn's tool calls whose visual output the user should see, in display order, max 6. Only generate_sketch, import_youtube_thumbnail and search_youtube produce a visual output; each successful one ends with a line "result_id: <id>" — copy that id exactly. Leave results empty when nothing visual is worth showing.
- next_actions: 0 to 3 buttons, label max 40 characters, in the reply language.
  - kind "ask_agent" + message (max 300 characters): a reply the user sends you in one click, written in the user's voice (label "Angle B", message "Je choisis l'angle B.").
  - kind "focus_node" + node_id (an id from <canvas_state> or from your apply_workflow blueprint): selects and centers that node, for something the USER does themselves — above all clicking "Générer" on a generator, which costs money. Never offer an ask_agent action that would start a paid generation.
- When you call request_user_image, don't call finish_turn in the same step: the turn resumes once the user answers, and you finish it then.
```

(d) In « PROPOSING ANGLES », replace everything from the line starting with `3. After the sketches are generated, present them with the SKETCH IMAGE EMBEDDED INLINE` through the line `   This makes the visual choice immediate. Then ask "lequel te parle ?".` (inclusive — the markdown example in between goes too) with the single line:

```text
3. After the sketches are generated, end the turn with finish_turn: the summary names each angle in a few words and asks which one speaks to them (e.g. "A : choc, B : comparaison, C : démo — lequel te parle ?"), results lists the sketches' result_id values in angle order (A, B, C), and next_actions offers one ask_agent button per angle (label "Angle A — Choc", message "Je choisis l'angle A."). The sketches appear right under the summary, so never embed sketch images or /api/generated-sketches links in text.
```

Keep exactly one blank line between this line and `WHEN THE USER PICKS AN ANGLE`.

(e) In « WHEN THE USER PICKS AN ANGLE », replace

```text
- After apply_workflow succeeds, tell the user "le workflow est sur le canvas, clique Generate sur le node generator pour lancer la miniature finale" — point them to the action.
```

with

```text
- After apply_workflow succeeds, end the turn with finish_turn: summary "le workflow est sur le canvas, clique Générer sur le générateur pour lancer la miniature finale (ça a un coût)", and a focus_node next action on the generator's node id (label "Voir le générateur").
```

- [ ] **Step 4: Run the prompt tests**

Run: `./node_modules/.bin/vitest run tests/agent/system-prompt-finish-turn.test.ts tests/agent/system-prompt.test.ts tests/agent/system-prompt-ab-test.test.ts`
Expected: PASS (4 new tests; the existing prompt tests unchanged).

- [ ] **Step 5: Type-check, lint and commit**

Run: `./node_modules/.bin/tsc --noEmit` — expected: exit 0.
Run: `./node_modules/.bin/eslint src/lib/agent/system-prompt.ts tests/agent/system-prompt-finish-turn.test.ts` — expected: no error.

```bash
git add src/lib/agent/system-prompt.ts tests/agent/system-prompt-finish-turn.test.ts
git commit -m "feat(agent): end every turn with finish_turn instead of long answers" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Folded step detail

**Files:**
- Create: `src/components/panels/chat/tool-json.ts`, `src/components/panels/chat/TurnSteps.tsx`
- Modify: `src/components/panels/chat/TextMarkdown.tsx`, `src/components/panels/chat/ToolCallCard.tsx` (rewrite), `src/components/panels/chat/tool-renderers/SimpleToolPart.tsx` (rewrite)
- Test: `tests/chat/tool-json.test.ts`, `tests/chat/turn-steps-render.test.tsx`

**Interfaces:**
- Consumes (Task 1): `Spinner`. (Task 2): `VISUAL_RESULT_TOOLS`. (Task 4): `ToolPart`, `ToolStep`, `ToolStatus`, `TurnStep`, `toolNameOf`, `splitAssistantTurn`.
- Produces:
  - `formatToolJson(value: unknown): string`
  - `TextMarkdown({ text, openAnnotate?, className? })` (new optional `className`, merged with `cn`)
  - `ToolCallCard({ part: ToolPart })` default export — the visual card of a finished `search_youtube` / `generate_sketch` / `import_youtube_thumbnail` call, `null` otherwise; `hasResultRenderer(toolName: string): boolean`
  - `SimpleToolPart({ step: ToolStep })` default export — compact, collapsible tool row
  - `TurnSteps({ steps: TurnStep[]; live: boolean })` default export

- [ ] **Step 1: Write the failing tests**

Create `tests/chat/tool-json.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatToolJson } from "@/components/panels/chat/tool-json";

describe("formatToolJson", () => {
  it("pretty-prints small values as they are", () => {
    expect(formatToolJson({ query: "macbook", limit: 8 })).toBe('{\n  "query": "macbook",\n  "limit": 8\n}');
  });

  it("shortens long strings such as base64 images", () => {
    const out = formatToolJson({ content: [{ type: "image", data: "A".repeat(5000) }] });
    expect(out).toContain(`"${"A".repeat(40)}… (5000 caractères)"`);
    expect(out.length).toBeLessThan(200);
  });

  it("shows a dash when there is nothing and never throws", () => {
    expect(formatToolJson(undefined)).toBe("—");
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(formatToolJson(loop)).toBe("[object Object]");
  });
});
```

Create `tests/chat/turn-steps-render.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { UIMessage } from "ai";
import TurnSteps from "@/components/panels/chat/TurnSteps";
import ToolCallCard, { hasResultRenderer } from "@/components/panels/chat/ToolCallCard";
import { VISUAL_RESULT_TOOLS } from "@/lib/agent/finish-turn";
import { splitAssistantTurn, type ToolPart } from "@/components/panels/chat/turn-model";

function assistant(parts: unknown[]): UIMessage {
  return { id: "a1", role: "assistant", parts } as unknown as UIMessage;
}

describe("TurnSteps", () => {
  it("lists reasoning, intermediate text and tools with their status, everything folded", () => {
    const turn = splitAssistantTurn(
      assistant([
        { type: "reasoning", text: "Je réfléchis longuement." },
        { type: "text", text: "Je lis le canvas." },
        { type: "tool-get_canvas_state", toolCallId: "c1", state: "output-available", input: {}, output: { content: [{ type: "text", text: "2 nœuds" }] } },
        { type: "tool-generate_sketch", toolCallId: "c2", state: "output-available", input: { prompt: "x" }, output: { isError: true, content: [{ type: "text", text: "OpenRouter API error 500" }] } },
        { type: "tool-search_youtube", toolCallId: "c3", state: "input-available", input: { query: "macbook" } },
        { type: "text", text: "Voilà." },
      ]),
    );
    const html = renderToStaticMarkup(<TurnSteps steps={turn.steps} live={false} />);
    expect(html).toContain("Réflexion");
    expect(html).not.toContain("Je réfléchis longuement.");
    expect(html).toContain("Je lis le canvas.");
    expect(html).toContain("Lit le canvas");
    expect(html).toContain("(terminé)");
    expect(html).toContain("Dessine le croquis");
    expect(html).toContain("(échec)");
    expect(html).toContain("OpenRouter API error 500");
    expect(html).toContain("Cherche sur YouTube");
    expect(html).toContain("(en cours)");
    expect(html).toContain('data-slot="spinner"');
    expect(html).not.toContain("Voilà.");
    expect(html).not.toContain("Entrée");
  });

  it("says when there is no step yet", () => {
    expect(renderToStaticMarkup(<TurnSteps steps={[]} live />)).toContain("Aucune étape pour l&#x27;instant.");
  });
});

describe("ToolCallCard", () => {
  it("has a renderer for every visual result tool", () => {
    expect(VISUAL_RESULT_TOOLS.every(hasResultRenderer)).toBe(true);
    expect(hasResultRenderer("apply_workflow")).toBe(false);
    expect(hasResultRenderer("constructor")).toBe(false);
  });

  it("renders nothing for a tool without a visual output", () => {
    const part = { type: "tool-apply_workflow", toolCallId: "c1", state: "output-available", input: {}, output: { content: [] } } as unknown as ToolPart;
    expect(renderToStaticMarkup(<ToolCallCard part={part} />)).toBe("");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `./node_modules/.bin/vitest run tests/chat/tool-json.test.ts tests/chat/turn-steps-render.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/panels/chat/tool-json"` and `"@/components/panels/chat/TurnSteps"`.

- [ ] **Step 3: JSON formatting**

Create `src/components/panels/chat/tool-json.ts`:

```ts
/** Strings longer than this (base64 images, long transcripts) are shortened in the step detail. */
const MAX_STRING_LENGTH = 160;

/** Pretty JSON of a tool input or output for the step detail; « — » when there is nothing. */
export function formatToolJson(value: unknown): string {
  if (value === undefined) return "—";
  try {
    const json = JSON.stringify(
      value,
      (_key, v: unknown) =>
        typeof v === "string" && v.length > MAX_STRING_LENGTH ? `${v.slice(0, 40)}… (${v.length} caractères)` : v,
      2,
    );
    return json ?? "—";
  } catch {
    return String(value);
  }
}
```

- [ ] **Step 4: Let `TextMarkdown` take a class**

Re-read `src/components/panels/chat/TextMarkdown.tsx`. After `import remarkGfm from "remark-gfm";` add `import { cn } from "cn";`, and replace

```tsx
export function TextMarkdown({ text, openAnnotate }: { text: string; openAnnotate?: (url: string) => void }) {
  return (
    <div className="text-sm break-words chat-md leading-relaxed text-foreground">
```

with

```tsx
export function TextMarkdown({
  text,
  openAnnotate,
  className,
}: {
  text: string;
  openAnnotate?: (url: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("text-sm break-words chat-md leading-relaxed text-foreground", className)}>
```

- [ ] **Step 5: Result cards only in `ToolCallCard`**

Replace `src/components/panels/chat/ToolCallCard.tsx` with:

```tsx
"use client";
import type { ReactNode } from "react";
import SearchYoutubeGallery from "./tool-renderers/SearchYoutubeGallery";
import GeneratedImagePreview from "./tool-renderers/GeneratedImagePreview";
import { toolNameOf, type ToolPart } from "./turn-model";

const RESULT_RENDERERS: Record<string, (part: ToolPart) => ReactNode> = {
  search_youtube: (part) => <SearchYoutubeGallery part={part} />,
  generate_sketch: (part) => <GeneratedImagePreview part={part} />,
  import_youtube_thumbnail: (part) => <GeneratedImagePreview part={part} />,
};

export function hasResultRenderer(toolName: string): boolean {
  return Object.hasOwn(RESULT_RENDERERS, toolName);
}

/** The visual card of a finished tool call (sketch, imported thumbnail, YouTube search); nothing for other tools. */
export default function ToolCallCard({ part }: { part: ToolPart }) {
  const toolName = toolNameOf(part);
  if (!hasResultRenderer(toolName) || part.state !== "output-available") return null;
  return <>{RESULT_RENDERERS[toolName](part)}</>;
}
```

- [ ] **Step 6: Compact tool row**

Replace `src/components/panels/chat/tool-renderers/SimpleToolPart.tsx` with:

```tsx
"use client";
import { CheckIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import ToolCallCard, { hasResultRenderer } from "../ToolCallCard";
import { formatToolJson } from "../tool-json";
import type { ToolStatus, ToolStep } from "../turn-model";

const STATUS_TEXT: Record<ToolStatus, string> = { running: "en cours", done: "terminé", error: "échec" };

function StatusIcon({ status }: { status: ToolStatus }) {
  return (
    <span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center">
      {status === "running" && <Spinner className="size-3.5" />}
      {status === "done" && <CheckIcon className="size-3.5 text-emerald-500" />}
      {status === "error" && <XIcon className="size-3.5 text-destructive" />}
    </span>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[11px] font-medium text-muted-foreground">{title}</p>
      <pre className="max-h-40 overflow-auto rounded-md bg-muted px-2 py-1.5 font-mono text-[11px] leading-snug break-all whitespace-pre-wrap text-muted-foreground">
        {formatToolJson(value)}
      </pre>
    </div>
  );
}

/** One tool call in the step detail: label and status, its input and output on demand. */
export default function SimpleToolPart({ step }: { step: ToolStep }) {
  const { part, status } = step;
  const showVisual = !step.shownInResults && status === "done" && hasResultRenderer(step.toolName);

  return (
    <Collapsible>
      <CollapsibleTrigger
        render={
          <button
            type="button"
            className="group/tool flex w-full items-center gap-2 rounded-md py-0.5 text-left text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        }
      >
        <StatusIcon status={status} />
        <span className="min-w-0 flex-1 truncate">{step.label}</span>
        <span className="sr-only">({STATUS_TEXT[status]})</span>
        <ChevronRightIcon aria-hidden="true" className="size-3.5 shrink-0 transition-transform group-data-[panel-open]/tool:rotate-90" />
      </CollapsibleTrigger>
      {status === "error" && step.errorText && <p className="pl-6 text-xs text-destructive">{step.errorText}</p>}
      <CollapsibleContent className="flex flex-col gap-2 pt-1.5 pl-6">
        {step.shownInResults ? (
          <p className="text-xs text-muted-foreground">Voir les résultats ci-dessous.</p>
        ) : (
          <>
            {showVisual && <ToolCallCard part={part} />}
            <JsonBlock title="Entrée" value={part.input} />
            {status !== "running" && (
              <JsonBlock title="Sortie" value={part.state === "output-error" ? part.errorText : part.output} />
            )}
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
```

- [ ] **Step 7: Step list**

Create `src/components/panels/chat/TurnSteps.tsx`:

```tsx
"use client";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import SimpleToolPart from "./tool-renderers/SimpleToolPart";
import { TextMarkdown } from "./TextMarkdown";
import type { TurnStep } from "./turn-model";

function reasoningLabel(streaming: boolean, duration?: number): string {
  if (streaming) return "Réflexion…";
  return duration === undefined ? "Réflexion" : `Réflexion (${duration} s)`;
}

/** The folded detail of a turn: reasoning, intermediate texts and tool calls, in order. */
export default function TurnSteps({ steps, live }: { steps: TurnStep[]; live: boolean }) {
  if (steps.length === 0) {
    return <p className="text-xs text-muted-foreground">Aucune étape pour l&apos;instant.</p>;
  }

  return (
    <ol aria-label="Étapes" className="flex flex-col gap-1.5 border-l border-border pl-3">
      {steps.map((step, index) => (
        <li key={step.id} className="min-w-0">
          {step.kind === "reasoning" && (
            <Reasoning isStreaming={live && index === steps.length - 1} defaultOpen={false} className="mb-0">
              <ReasoningTrigger className="text-xs" getThinkingMessage={reasoningLabel} />
              <ReasoningContent className="mt-1.5 text-xs">{step.text}</ReasoningContent>
            </Reasoning>
          )}
          {step.kind === "text" && <TextMarkdown text={step.text} className="text-xs text-muted-foreground" />}
          {step.kind === "tool" && <SimpleToolPart step={step} />}
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 8: Run the tests**

Run: `./node_modules/.bin/vitest run tests/chat/tool-json.test.ts tests/chat/turn-steps-render.test.tsx`
Expected: PASS (3 + 4 tests).

- [ ] **Step 9: Type-check, lint and commit**

Run: `./node_modules/.bin/tsc --noEmit` — expected: exit 0 (the current `Message.tsx` still renders `<ToolCallCard part={…} />`, same props).
Run: `./node_modules/.bin/eslint src/components/panels/chat/tool-json.ts src/components/panels/chat/TextMarkdown.tsx src/components/panels/chat/ToolCallCard.tsx src/components/panels/chat/tool-renderers/SimpleToolPart.tsx src/components/panels/chat/TurnSteps.tsx tests/chat/tool-json.test.ts tests/chat/turn-steps-render.test.tsx` — expected: no error.

```bash
git add src/components/panels/chat/tool-json.ts src/components/panels/chat/TextMarkdown.tsx src/components/panels/chat/ToolCallCard.tsx src/components/panels/chat/tool-renderers/SimpleToolPart.tsx src/components/panels/chat/TurnSteps.tsx tests/chat/tool-json.test.ts tests/chat/turn-steps-render.test.tsx
git commit -m "feat(chat): folded step detail with compact tool rows" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Live step line

**Files:**
- Create: `src/components/panels/chat/useElapsedMs.ts`, `src/components/panels/chat/TurnProgress.tsx`
- Test: `tests/chat/turn-progress-render.test.tsx`

**Interfaces:**
- Consumes (Task 1): `Marker`, `MarkerIcon`, `MarkerContent`, `Spinner`. (Task 4): `currentStepLabel`, `formatElapsed`, `TurnStep`. (Task 7): `TurnSteps`.
- Produces: `useElapsedMs(startedAt: number | null): number`; `TurnProgress({ message: UIMessage | undefined; status: ChatStatus; startedAt: number | null; steps: TurnStep[] })` default export.

- [ ] **Step 1: Write the failing test**

Create `tests/chat/turn-progress-render.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { UIMessage } from "ai";
import TurnProgress from "@/components/panels/chat/TurnProgress";
import { splitAssistantTurn } from "@/components/panels/chat/turn-model";

describe("TurnProgress", () => {
  it("shows one status line with the current step, a timer and a folded live detail", () => {
    const message = {
      id: "a1",
      role: "assistant",
      parts: [
        { type: "step-start" },
        { type: "text", text: "Je cherche des miniatures." },
        { type: "tool-search_youtube", toolCallId: "c1", state: "input-available", input: { query: "macbook" } },
      ],
    } as unknown as UIMessage;
    const html = renderToStaticMarkup(
      <TurnProgress message={message} status="streaming" startedAt={null} steps={splitAssistantTurn(message).steps} />,
    );
    expect(html.match(/role="status"/g)).toHaveLength(2); // the Marker and its (aria-hidden) Spinner
    expect(html).toContain("Cherche sur YouTube");
    expect(html).toContain("0:00");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Je cherche des miniatures.");
  });

  it("says Réfléchit while the request is only submitted", () => {
    const html = renderToStaticMarkup(<TurnProgress message={undefined} status="submitted" startedAt={null} steps={[]} />);
    expect(html).toContain("Réfléchit");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/chat/turn-progress-render.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/panels/chat/TurnProgress"`.

- [ ] **Step 3: Timer hook**

Create `src/components/panels/chat/useElapsedMs.ts` (the state only changes inside the interval callback, which the `react-hooks/set-state-in-effect` lint rule allows):

```ts
"use client";
import { useEffect, useState } from "react";

/** Milliseconds since `startedAt`, refreshed every second; 0 without a start. */
export function useElapsedMs(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  return startedAt === null ? 0 : Math.max(0, now - startedAt);
}
```

- [ ] **Step 4: The live line**

Create `src/components/panels/chat/TurnProgress.tsx` (the `shimmer` utility comes from `shadcn/tailwind.css`, already imported by `globals.css`):

```tsx
"use client";
import type { ChatStatus, UIMessage } from "ai";
import { ChevronRightIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Spinner } from "@/components/ui/spinner";
import TurnSteps from "./TurnSteps";
import { currentStepLabel, formatElapsed, type TurnStep } from "./turn-model";
import { useElapsedMs } from "./useElapsedMs";

/**
 * The single live line of a running turn: spinner, current step, m:ss timer.
 * Clicking it unfolds the step list, updated as the turn streams. The text the
 * model writes is never shown word by word here.
 */
export default function TurnProgress({
  message,
  status,
  startedAt,
  steps,
}: {
  message: UIMessage | undefined;
  status: ChatStatus;
  startedAt: number | null;
  steps: TurnStep[];
}) {
  const elapsedMs = useElapsedMs(startedAt);

  return (
    <Collapsible className="flex flex-col gap-2">
      <CollapsibleTrigger
        render={
          <button
            type="button"
            className="group/progress flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        }
      >
        <Marker role="status" render={<span />} className="min-w-0 flex-1">
          <MarkerIcon>
            <Spinner />
          </MarkerIcon>
          <MarkerContent className="truncate shimmer motion-reduce:shimmer-none">{currentStepLabel(message, status)}</MarkerContent>
        </Marker>
        <span aria-hidden="true" className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
          {formatElapsed(elapsedMs)}
        </span>
        <ChevronRightIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]/progress:rotate-90"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-2">
        <TurnSteps steps={steps} live />
      </CollapsibleContent>
    </Collapsible>
  );
}
```

- [ ] **Step 5: Run the test**

Run: `./node_modules/.bin/vitest run tests/chat/turn-progress-render.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Type-check, lint and commit**

Run: `./node_modules/.bin/tsc --noEmit` — expected: exit 0.
Run: `./node_modules/.bin/eslint src/components/panels/chat/useElapsedMs.ts src/components/panels/chat/TurnProgress.tsx tests/chat/turn-progress-render.test.tsx` — expected: no error.

```bash
git add src/components/panels/chat/useElapsedMs.ts src/components/panels/chat/TurnProgress.tsx tests/chat/turn-progress-render.test.tsx
git commit -m "feat(chat): one live step line with timer while the agent works" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Finished turn — answer, results, « Et maintenant », copy

**Files:**
- Create: `src/components/panels/chat/TurnResults.tsx`, `src/components/panels/chat/TurnActions.tsx`, `src/components/panels/chat/AssistantTurn.tsx`
- Test: `tests/chat/assistant-turn-render.test.tsx`

**Interfaces:**
- Consumes (Task 4): `AssistantTurn` (type), `NextAction`, `ToolPart`, `TurnError`, `toolNameOf`, `turnHeaderLabel`, `splitAssistantTurn`, `emptyAssistantTurn`, `INTERRUPTED_TURN_ERROR`. (Task 5): `rowsToUIMessages`, `StoredMessageRow`. (Task 7): `ToolCallCard`, `TurnSteps`, `TextMarkdown`. Canvas store `selectOnly(ids: string[])`, `nodes`; `useReactFlow().fitView`.
- Produces:
  - `TurnResults({ results: ToolPart[] })` default export
  - `TurnActions({ actions: NextAction[]; onAskAgent: (message: string) => void })` default export
  - `AssistantTurn({ turn: AssistantTurn; error: TurnError | null; showActions: boolean; onRetry: (() => void) | null; onAskAgent: (message: string) => void })` default export — renders fragments meant to sit inside `MessageContent`

- [ ] **Step 1: Write the failing tests**

Create `tests/chat/assistant-turn-render.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReactFlowProvider } from "@xyflow/react";
import type { UIMessage } from "ai";
import AssistantTurn from "@/components/panels/chat/AssistantTurn";
import { rowsToUIMessages, type StoredMessageRow } from "@/components/panels/chat/history-to-ui-messages";
import { INTERRUPTED_TURN_ERROR, emptyAssistantTurn, splitAssistantTurn } from "@/components/panels/chat/turn-model";

const PNG = "iVBORw0KGgo=";
const noop = () => {};
const render = (ui: ReactNode) => renderToStaticMarkup(<ReactFlowProvider>{ui}</ReactFlowProvider>);
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("AssistantTurn — reopened conversation without finish_turn", () => {
  const rows: StoredMessageRow[] = [
    {
      id: "u1",
      role: "user",
      content_json: JSON.stringify([{ role: "user", content: [{ type: "text", text: "Des idées ?" }] }]),
      created_at: "2026-09-16 10:00:00",
      interrupted: 0,
    },
    {
      id: "a1",
      role: "assistant",
      created_at: "2026-09-16 10:00:12",
      interrupted: 0,
      content_json: JSON.stringify([
        {
          role: "assistant",
          content: [
            { type: "text", text: "Je cherche sur YouTube." },
            { type: "tool-call", toolCallId: "c1", toolName: "search_youtube", input: { query: "macbook" } },
          ],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "c1",
              toolName: "search_youtube",
              output: {
                type: "content",
                value: [
                  { type: "text", text: "[1] Le MacBook — Chaîne" },
                  { type: "file", mediaType: "image/jpeg", data: { type: "data", data: PNG } },
                ],
              },
            },
          ],
        },
        { role: "assistant", content: [{ type: "text", text: "Trois patterns ressortent : visages choqués, flèches, contrastes." }] },
      ]),
    },
  ];

  it("shows the answer, the results and a folded step header", () => {
    const turn = splitAssistantTurn(rowsToUIMessages(rows)[1]);
    const html = render(<AssistantTurn turn={turn} error={null} showActions onRetry={null} onAskAgent={noop} />);
    expect(html).toContain("12 s · 2 étapes");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Trois patterns ressortent");
    expect(html).not.toContain("Je cherche sur YouTube.");
    expect(count(html, "<img")).toBe(1);
    expect(html).not.toContain("Et maintenant");
    expect(html).toContain('aria-label="Copier la réponse"');
  });
});

describe("AssistantTurn — finish_turn", () => {
  const sketch = (toolCallId: string) => ({
    type: "tool-generate_sketch",
    toolCallId,
    state: "output-available",
    input: { prompt: toolCallId },
    output: {
      content: [
        { type: "text", text: `Sketch generated. Reference: generated:sk_${toolCallId}` },
        { type: "image", mimeType: "image/png", data: PNG },
        { type: "text", text: `result_id: ${toolCallId}` },
      ],
    },
  });
  const message = {
    id: "a2",
    role: "assistant",
    metadata: { durationMs: 12_000 },
    parts: [
      { type: "reasoning", text: "Deux directions." },
      sketch("c1"),
      sketch("c2"),
      {
        type: "tool-finish_turn",
        toolCallId: "c3",
        state: "output-available",
        input: {
          summary: "Deux angles prêts : **A** choc, **B** duel.",
          results: ["c2", "c1", "inconnu"],
          next_actions: [
            { label: "Angle A", kind: "ask_agent", message: "Je choisis l'angle A." },
            { label: "Ancien nœud", kind: "focus_node", node_id: "supprime" },
          ],
        },
        output: { content: [{ type: "text", text: '{"ok":true}' }] },
      },
    ],
  } as unknown as UIMessage;

  it("shows the summary, both sketches and the actions of the last turn", () => {
    const html = render(<AssistantTurn turn={splitAssistantTurn(message)} error={null} showActions onRetry={null} onAskAgent={noop} />);
    expect(html).toContain("12 s · 3 étapes");
    expect(html).toContain("<strong>A</strong>");
    expect(count(html, "<img")).toBe(2);
    expect(html).toContain("Et maintenant");
    expect(html).toContain("Angle A");
    expect(html).toContain("Ancien nœud");
    // A node missing from the canvas disables its button (the found case is checked in the browser:
    // zustand renders its initial, empty canvas on the server).
    expect(count(html, 'aria-disabled="true"')).toBe(1);
  });

  it("hides the actions on an older turn", () => {
    const html = render(<AssistantTurn turn={splitAssistantTurn(message)} error={null} showActions={false} onRetry={null} onAskAgent={noop} />);
    expect(html).toContain("Deux angles prêts");
    expect(html).not.toContain("Et maintenant");
  });
});

describe("AssistantTurn — error", () => {
  it("replaces the answer with an Alert and Réessayer", () => {
    const turn = { ...emptyAssistantTurn(), answer: "Réponse partielle" };
    const html = render(<AssistantTurn turn={turn} error={INTERRUPTED_TURN_ERROR} showActions={false} onRetry={noop} onAskAgent={noop} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Tour interrompu");
    expect(html).toContain("Réessayer");
    expect(html).not.toContain("Réponse partielle");
    expect(html).not.toContain("Copier la réponse");
  });

  it("has no Réessayer without a retry handler", () => {
    const html = render(<AssistantTurn turn={emptyAssistantTurn()} error={INTERRUPTED_TURN_ERROR} showActions={false} onRetry={null} onAskAgent={noop} />);
    expect(html).not.toContain("Réessayer");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `./node_modules/.bin/vitest run tests/chat/assistant-turn-render.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/panels/chat/AssistantTurn"`.

- [ ] **Step 3: Results grid**

Create `src/components/panels/chat/TurnResults.tsx`:

```tsx
"use client";
import { cn } from "cn";
import ToolCallCard from "./ToolCallCard";
import { toolNameOf, type ToolPart } from "./turn-model";

/** Visual outputs of the turn (sketches, imported thumbnails, YouTube searches) in a compact grid. */
export default function TurnResults({ results }: { results: ToolPart[] }) {
  if (results.length === 0) return null;

  return (
    <div role="group" aria-label="Résultats" className="grid grid-cols-2 gap-2">
      {results.map((part) => (
        <div
          key={part.toolCallId}
          className={cn("min-w-0", (results.length === 1 || toolNameOf(part) === "search_youtube") && "col-span-2")}
        >
          <ToolCallCard part={part} />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: « Et maintenant »**

Create `src/components/panels/chat/TurnActions.tsx`:

```tsx
"use client";
import { useReactFlow } from "@xyflow/react";
import { CornerDownLeftIcon, CrosshairIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCanvasStore } from "@/store/canvas-store";
import type { NextAction } from "./turn-model";

/** Selects a canvas node and centers the view on it; disabled when the node is gone. */
function FocusNodeButton({ label, nodeId }: { label: string; nodeId: string }) {
  const exists = useCanvasStore((s) => s.nodes.some((node) => node.id === nodeId));
  const { fitView } = useReactFlow();

  const focus = () => {
    useCanvasStore.getState().selectOnly([nodeId]);
    void fitView({ nodes: [{ id: nodeId }], padding: 0.4, maxZoom: 1, duration: 400 });
  };

  if (exists) {
    return (
      <Button variant="outline" size="sm" onClick={focus}>
        <CrosshairIcon data-icon="inline-start" />
        {label}
      </Button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="outline" size="sm" disabled focusableWhenDisabled className="data-disabled:opacity-50">
            <CrosshairIcon data-icon="inline-start" />
            {label}
          </Button>
        }
      />
      <TooltipContent>
        <p>Élément introuvable</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** « Et maintenant » : the 1 to 3 follow-ups the agent offered at the end of the last turn. */
export default function TurnActions({ actions, onAskAgent }: { actions: NextAction[]; onAskAgent: (message: string) => void }) {
  if (actions.length === 0) return null;

  return (
    <div role="group" aria-label="Et maintenant" className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">Et maintenant</p>
      <div className="flex flex-wrap gap-1.5">
        {actions.map((action, index) =>
          action.kind === "ask_agent" ? (
            <Button key={index} variant="outline" size="sm" onClick={() => onAskAgent(action.message)}>
              <CornerDownLeftIcon data-icon="inline-start" />
              {action.label}
            </Button>
          ) : (
            <FocusNodeButton key={index} label={action.label} nodeId={action.nodeId} />
          ),
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: The finished turn**

Create `src/components/panels/chat/AssistantTurn.tsx`:

```tsx
"use client";
import { useState } from "react";
import { CheckIcon, ChevronRightIcon, CopyIcon, RotateCcwIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MessageFooter, MessageHeader } from "@/components/ui/message";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useChatStore } from "@/store/chat-store";
import { TextMarkdown } from "./TextMarkdown";
import TurnActions from "./TurnActions";
import TurnResults from "./TurnResults";
import TurnSteps from "./TurnSteps";
import { turnHeaderLabel, type AssistantTurn as AssistantTurnModel, type TurnError } from "./turn-model";

function CopyAnswerButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard refused (permission, insecure context): nothing to confirm.
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size="icon-xs" aria-label="Copier la réponse" onClick={copy}>
            {copied ? <CheckIcon /> : <CopyIcon />}
          </Button>
        }
      />
      <TooltipContent>
        <p>{copied ? "Copié" : "Copier la réponse"}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * A finished assistant turn: folded « 12 s · 4 étapes » header, the answer,
 * the visual results, « Et maintenant » (last turn only) and a copy button.
 * On error the answer is replaced by a compact Alert with « Réessayer ».
 */
export default function AssistantTurn({
  turn,
  error,
  showActions,
  onRetry,
  onAskAgent,
}: {
  turn: AssistantTurnModel;
  error: TurnError | null;
  showActions: boolean;
  onRetry: (() => void) | null;
  onAskAgent: (message: string) => void;
}) {
  const openAnnotate = useChatStore((s) => s.openAnnotate);

  return (
    <>
      {turn.stepCount > 0 && (
        <Collapsible className="flex flex-col gap-2">
          <MessageHeader className="px-0">
            <CollapsibleTrigger render={<Button variant="ghost" size="xs" className="group/steps -ml-2 text-muted-foreground" />}>
              <ChevronRightIcon data-icon="inline-start" className="transition-transform group-data-[panel-open]/steps:rotate-90" />
              {turnHeaderLabel(turn)}
            </CollapsibleTrigger>
          </MessageHeader>
          <CollapsibleContent>
            <TurnSteps steps={turn.steps} live={false} />
          </CollapsibleContent>
        </Collapsible>
      )}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{error.title}</AlertTitle>
          <AlertDescription>{error.description}</AlertDescription>
          {onRetry && (
            <div className="mt-2">
              <Button variant="outline" size="xs" onClick={onRetry}>
                <RotateCcwIcon data-icon="inline-start" />
                Réessayer
              </Button>
            </div>
          )}
        </Alert>
      ) : (
        turn.answer && (
          <Bubble variant="ghost" className="max-w-full">
            <BubbleContent className="animate-in duration-300 fade-in motion-reduce:animate-none">
              <TextMarkdown text={turn.answer} openAnnotate={openAnnotate} />
            </BubbleContent>
          </Bubble>
        )
      )}

      <TurnResults results={turn.results} />

      {showActions && <TurnActions actions={turn.nextActions} onAskAgent={onAskAgent} />}

      {!error && turn.answer && (
        <MessageFooter className="px-0">
          <CopyAnswerButton text={turn.answer} />
        </MessageFooter>
      )}
    </>
  );
}
```

- [ ] **Step 6: Run the tests**

Run: `./node_modules/.bin/vitest run tests/chat/assistant-turn-render.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 7: Type-check, lint and commit**

Run: `./node_modules/.bin/tsc --noEmit` — expected: exit 0.
Run: `./node_modules/.bin/eslint src/components/panels/chat/TurnResults.tsx src/components/panels/chat/TurnActions.tsx src/components/panels/chat/AssistantTurn.tsx tests/chat/assistant-turn-render.test.tsx` — expected: no error.

```bash
git add src/components/panels/chat/TurnResults.tsx src/components/panels/chat/TurnActions.tsx src/components/panels/chat/AssistantTurn.tsx tests/chat/assistant-turn-render.test.tsx
git commit -m "feat(chat): finished turn with answer, results and next actions" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: Wire the chat panel — scroller, groups, actions, retry; remove AgentActivity

**Files:**
- Create: `src/components/panels/chat/chat-view-model.ts`
- Modify: `src/components/panels/chat/Message.tsx` (rewrite), `src/components/panels/chat/MessageList.tsx` (rewrite), `src/components/panels/ChatPanel.tsx` (full new version)
- Delete: `src/components/panels/chat/AgentActivity.tsx`
- Test: `tests/chat/chat-view-model.test.ts`, `tests/chat/message-render.test.tsx`

**Interfaces:**
- Consumes (Task 4): `splitAssistantTurn`, `turnDisplay`, `isBusyStatus`, `liveTurnError`, `INTERRUPTED_TURN_ERROR`, `emptyAssistantTurn`. (Task 5): `rowsToUIMessages`, `StoredMessageRow`. (Task 8): `TurnProgress`. (Task 9): `AssistantTurn`. `useChat` from `@ai-sdk/react` (`sendMessage`, `regenerate`, `stop`, `addToolOutput`, `setMessages`, `error`, `clearError`, `onError`).
- Produces:
  - `chat-view-model.ts`: `type MessageGroupModel = { key: string; role: UIMessage["role"]; messages: UIMessage[] }`, `groupConsecutiveMessages(messages: UIMessage[]): MessageGroupModel[]`, `type TrailingRow = "progress" | "error" | "interrupted" | null`, `trailingAssistantRow(messages: UIMessage[], status: ChatStatus, stoppedLive: boolean): TrailingRow`, `lastUserText(messages: UIMessage[]): string`
  - `Message.tsx`: `type ChatTurnControls = { status: ChatStatus; errorMessage: string | null; turnStartedAt: number | null; stoppedLive: boolean; onAskAgent: (message: string) => void; onRetry: (() => void) | null }`, `AssistantRow({ showAvatar: boolean; children: ReactNode })`, default `Message({ message; isLast; showAvatar; controls })`
  - `MessageList.tsx`: default `MessageList({ messages: UIMessage[]; controls: ChatTurnControls })`

- [ ] **Step 1: Write the failing tests**

Create `tests/chat/chat-view-model.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { UIMessage } from "ai";
import { groupConsecutiveMessages, lastUserText, trailingAssistantRow } from "@/components/panels/chat/chat-view-model";

const msg = (id: string, role: "user" | "assistant", parts: unknown[] = []) => ({ id, role, parts }) as unknown as UIMessage;

describe("groupConsecutiveMessages", () => {
  it("groups consecutive messages of the same author, keyed by the first one", () => {
    const groups = groupConsecutiveMessages([msg("u1", "user"), msg("a1", "assistant"), msg("a2", "assistant"), msg("u2", "user")]);
    expect(groups.map((g) => [g.key, g.role, g.messages.map((m) => m.id)])).toEqual([
      ["u1", "user", ["u1"]],
      ["a1", "assistant", ["a1", "a2"]],
      ["u2", "user", ["u2"]],
    ]);
    expect(groupConsecutiveMessages([])).toEqual([]);
  });
});

describe("trailingAssistantRow", () => {
  const afterUser = [msg("a0", "assistant"), msg("u1", "user")];

  it("adds a row only after a user message", () => {
    expect(trailingAssistantRow(afterUser, "submitted", false)).toBe("progress");
    expect(trailingAssistantRow(afterUser, "streaming", false)).toBe("progress");
    expect(trailingAssistantRow(afterUser, "error", false)).toBe("error");
    expect(trailingAssistantRow(afterUser, "ready", true)).toBe("interrupted");
    expect(trailingAssistantRow(afterUser, "ready", false)).toBeNull();
    expect(trailingAssistantRow([msg("u1", "user"), msg("a1", "assistant")], "streaming", false)).toBeNull();
    expect(trailingAssistantRow([], "error", false)).toBeNull();
  });
});

describe("lastUserText", () => {
  it("returns the text of the last user message", () => {
    const messages = [
      msg("u1", "user", [{ type: "text", text: "Premier" }]),
      msg("u2", "user", [{ type: "text", text: " Change " }, { type: "file", mediaType: "image/png", url: "data:," }, { type: "text", text: "le fond " }]),
      msg("a1", "assistant", [{ type: "text", text: "Réponse" }]),
    ];
    expect(lastUserText(messages)).toBe("Change le fond");
    expect(lastUserText([msg("u1", "user", [{ type: "file", mediaType: "image/png", url: "data:," }])])).toBe("");
    expect(lastUserText([])).toBe("");
  });
});
```

Create `tests/chat/message-render.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReactFlowProvider } from "@xyflow/react";
import type { UIMessage } from "ai";
import Message, { type ChatTurnControls } from "@/components/panels/chat/Message";

const controls = (overrides: Partial<ChatTurnControls> = {}): ChatTurnControls => ({
  status: "ready",
  errorMessage: null,
  turnStartedAt: null,
  stoppedLive: false,
  onAskAgent: () => {},
  onRetry: () => {},
  ...overrides,
});

const render = (message: UIMessage, isLast: boolean, c: ChatTurnControls, showAvatar = true) =>
  renderToStaticMarkup(
    <ReactFlowProvider>
      <Message message={message} isLast={isLast} showAvatar={showAvatar} controls={c} />
    </ReactFlowProvider>,
  );

const readCanvas = { type: "tool-get_canvas_state", toolCallId: "c1", state: "output-available", input: {}, output: { content: [{ type: "text", text: "vide" }] } };

const finished = {
  id: "a1",
  role: "assistant",
  parts: [
    { type: "text", text: "Je lis le canvas." },
    readCanvas,
    {
      type: "tool-finish_turn",
      toolCallId: "c2",
      state: "output-available",
      input: { summary: "Canvas vide, on commence ?", next_actions: [{ label: "Oui, on y va", kind: "ask_agent", message: "Oui, on commence." }] },
      output: { content: [{ type: "text", text: '{"ok":true}' }] },
    },
  ],
} as unknown as UIMessage;

describe("Message", () => {
  it("keeps the user's tinted bubble", () => {
    const html = render({ id: "u1", role: "user", parts: [{ type: "text", text: "Salut" }] } as UIMessage, false, controls());
    expect(html).toContain('data-slot="bubble"');
    expect(html).toContain('data-variant="tinted"');
    expect(html).toContain("Salut");
  });

  it("shows only the live step line while the last turn runs", () => {
    const running = {
      id: "a1",
      role: "assistant",
      parts: [{ type: "text", text: "Je lis le canvas." }, { ...readCanvas, state: "input-available", output: undefined }],
    } as unknown as UIMessage;
    const html = render(running, true, controls({ status: "streaming" }));
    expect(html).toContain('role="status"');
    expect(html).toContain("Lit le canvas");
    expect(html).not.toContain("Je lis le canvas.");
  });

  it("shows the answer and « Et maintenant » on the last finished turn only", () => {
    const last = render(finished, true, controls());
    expect(last).toContain("2 étapes");
    expect(last).toContain("Canvas vide, on commence ?");
    expect(last).toContain("Et maintenant");
    expect(last).toContain("Oui, on y va");

    const older = render(finished, false, controls({ status: "streaming" }));
    expect(older).toContain("Canvas vide, on commence ?");
    expect(older).not.toContain("Et maintenant");
  });

  it("turns the last turn into an error with Réessayer", () => {
    const html = render(finished, true, controls({ status: "error", errorMessage: "Clé OpenRouter non configurée." }));
    expect(html).toContain("Erreur");
    expect(html).toContain("Clé OpenRouter non configurée.");
    expect(html).toContain("Réessayer");
    expect(html).not.toContain("Canvas vide, on commence ?");
  });

  it("leaves the avatar slot empty for earlier messages of a group", () => {
    expect(render(finished, false, controls(), true)).toContain("lucide-sparkles");
    expect(render(finished, false, controls(), false)).not.toContain("lucide-sparkles");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `./node_modules/.bin/vitest run tests/chat/chat-view-model.test.ts tests/chat/message-render.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/panels/chat/chat-view-model"`, and `Message` has no `controls` / `ChatTurnControls`.

- [ ] **Step 3: List helpers**

Create `src/components/panels/chat/chat-view-model.ts`:

```ts
import type { ChatStatus, UIMessage } from "ai";
import { isBusyStatus } from "./turn-model";

export type MessageGroupModel = { key: string; role: UIMessage["role"]; messages: UIMessage[] };

/** Consecutive messages of one author, rendered in one MessageGroup (e.g. a turn resumed after a client request). */
export function groupConsecutiveMessages(messages: UIMessage[]): MessageGroupModel[] {
  const groups: MessageGroupModel[] = [];
  for (const message of messages) {
    const last = groups.at(-1);
    if (last && last.role === message.role) last.messages.push(message);
    else groups.push({ key: message.id, role: message.role, messages: [message] });
  }
  return groups;
}

export type TrailingRow = "progress" | "error" | "interrupted" | null;

/** The assistant row to show after the user's last message while no assistant message exists for it. */
export function trailingAssistantRow(messages: UIMessage[], status: ChatStatus, stoppedLive: boolean): TrailingRow {
  const last = messages.at(-1);
  if (!last || last.role !== "user") return null;
  if (isBusyStatus(status)) return "progress";
  if (status === "error") return "error";
  if (stoppedLive) return "interrupted";
  return null;
}

/** Text of the user's last message, what « Réessayer » sends again; "" when it had none. */
export function lastUserText(messages: UIMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role !== "user") continue;
    return message.parts
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("")
      .trim();
  }
  return "";
}
```

- [ ] **Step 4: Message rows**

Re-read `src/components/panels/chat/Message.tsx` (the user-message markup below is today's, unchanged). Replace the file with:

```tsx
"use client";
import { useMemo, type ReactNode } from "react";
import type { ChatStatus, UIMessage } from "ai";
import { Message as MessageRow, MessageAvatar, MessageContent } from "@/components/ui/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { useChatStore } from "@/store/chat-store";
import AgentAvatar from "./AgentAvatar";
import AssistantTurn from "./AssistantTurn";
import TurnProgress from "./TurnProgress";
import { TextMarkdown } from "./TextMarkdown";
import { splitAssistantTurn, turnDisplay } from "./turn-model";

/** What every message row needs from ChatPanel. */
export type ChatTurnControls = {
  status: ChatStatus;
  errorMessage: string | null;
  /** Start of the running turn, for the live timer. */
  turnStartedAt: number | null;
  /** The user pressed « Arrêter » in this conversation since the last send. */
  stoppedLive: boolean;
  onAskAgent: (message: string) => void;
  /** Re-runs the last user message; null when there is nothing to retry. */
  onRetry: (() => void) | null;
};

function UserMessage({ message }: { message: UIMessage }) {
  const openAnnotate = useChatStore((s) => s.openAnnotate);
  return (
    <MessageRow align="end">
      <MessageContent>
        <Bubble align="end" variant="tinted">
          <BubbleContent>
            {message.parts.map((part, i) => {
              if (part.type === "text") return <TextMarkdown key={i} text={part.text} openAnnotate={openAnnotate} />;
              if (part.type === "file" && part.mediaType?.startsWith("image/")) {
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={part.url} alt="image" onClick={() => openAnnotate(part.url)}
                    className="max-w-[240px] rounded my-1 border border-border cursor-zoom-in" />
                );
              }
              return null;
            })}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </MessageRow>
  );
}

/** An assistant row: the agent's avatar (empty slot for earlier messages of a group) and the turn. */
export function AssistantRow({ showAvatar, children }: { showAvatar: boolean; children: ReactNode }) {
  return (
    <MessageRow align="start">
      <MessageAvatar className="min-w-9 rounded-xl bg-transparent">{showAvatar && <AgentAvatar />}</MessageAvatar>
      <MessageContent>{children}</MessageContent>
    </MessageRow>
  );
}

function AssistantMessage({
  message,
  isLast,
  showAvatar,
  controls,
}: {
  message: UIMessage;
  isLast: boolean;
  showAvatar: boolean;
  controls: ChatTurnControls;
}) {
  const turn = useMemo(() => splitAssistantTurn(message), [message]);
  const display = turnDisplay({
    isLast,
    status: controls.status,
    errorMessage: controls.errorMessage,
    stoppedLive: controls.stoppedLive,
    interrupted: turn.interrupted,
  });

  return (
    <AssistantRow showAvatar={showAvatar}>
      {display.mode === "progress" ? (
        <TurnProgress message={message} status={controls.status} startedAt={controls.turnStartedAt} steps={turn.steps} />
      ) : (
        <AssistantTurn
          turn={turn}
          error={display.error}
          showActions={display.showActions}
          onRetry={display.canRetry ? controls.onRetry : null}
          onAskAgent={controls.onAskAgent}
        />
      )}
    </AssistantRow>
  );
}

export default function Message({
  message,
  isLast,
  showAvatar,
  controls,
}: {
  message: UIMessage;
  isLast: boolean;
  showAvatar: boolean;
  controls: ChatTurnControls;
}) {
  if (message.role === "user") return <UserMessage message={message} />;
  return <AssistantMessage message={message} isLast={isLast} showAvatar={showAvatar} controls={controls} />;
}
```

- [ ] **Step 5: Message list with the configured scroller**

Replace `src/components/panels/chat/MessageList.tsx` with:

```tsx
"use client";
import { ArrowDownIcon, Sparkles } from "lucide-react";
import type { UIMessage } from "ai";
import { MessageGroup } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import AssistantTurn from "./AssistantTurn";
import Message, { AssistantRow, type ChatTurnControls } from "./Message";
import TurnProgress from "./TurnProgress";
import { groupConsecutiveMessages, trailingAssistantRow } from "./chat-view-model";
import { INTERRUPTED_TURN_ERROR, emptyAssistantTurn, isBusyStatus, liveTurnError } from "./turn-model";

/** Pixels of the previous turn kept visible above a newly anchored user message. */
const PREVIOUS_ITEM_PEEK_PX = 48;

export default function MessageList({ messages, controls }: { messages: UIMessage[]; controls: ChatTurnControls }) {
  if (messages.length === 0) {
    return (
      <Empty className="flex-1 border-none">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Sparkles />
          </EmptyMedia>
          <EmptyTitle>On commence par quoi ?</EmptyTitle>
          <EmptyDescription>
            Décris ta miniature, joins une image ou enregistre un vocal.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const groups = groupConsecutiveMessages(messages);
  const lastMessage = messages[messages.length - 1];
  const trailing = trailingAssistantRow(messages, controls.status, controls.stoppedLive);

  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="last-anchor" scrollPreviousItemPeek={PREVIOUS_ITEM_PEEK_PX}>
      <MessageScroller className="flex-1 border-t border-border">
        <MessageScrollerViewport>
          <MessageScrollerContent aria-busy={isBusyStatus(controls.status)} className="p-(--card-spacing)">
            {groups.map((group) => (
              <MessageScrollerItem key={group.key} messageId={group.key} scrollAnchor={group.role === "user"}>
                <MessageGroup>
                  {group.messages.map((message, index) => (
                    <Message
                      key={message.id}
                      message={message}
                      isLast={message === lastMessage}
                      showAvatar={index === group.messages.length - 1}
                      controls={controls}
                    />
                  ))}
                </MessageGroup>
              </MessageScrollerItem>
            ))}
            {trailing && (
              <MessageScrollerItem key="trailing-assistant" messageId="trailing-assistant">
                <AssistantRow showAvatar>
                  {trailing === "progress" ? (
                    <TurnProgress message={undefined} status={controls.status} startedAt={controls.turnStartedAt} steps={[]} />
                  ) : (
                    <AssistantTurn
                      turn={emptyAssistantTurn()}
                      error={trailing === "error" ? liveTurnError(controls.errorMessage) : INTERRUPTED_TURN_ERROR}
                      showActions={false}
                      onRetry={controls.onRetry}
                      onAskAgent={controls.onAskAgent}
                    />
                  )}
                </AssistantRow>
              </MessageScrollerItem>
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton>
          <ArrowDownIcon />
          <span className="sr-only">Aller au dernier message</span>
        </MessageScrollerButton>
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
```

- [ ] **Step 6: Chat panel**

Run `git diff 88f7697 -- src/components/panels/ChatPanel.tsx`; if chantier C or D changed it, carry that change into the version below. Then replace `src/components/panels/ChatPanel.tsx` with:

```tsx
"use client";
import { useEffect, useMemo, useCallback, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
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
import { rowsToUIMessages, type StoredMessageRow } from "./chat/history-to-ui-messages";
import { snapshotCanvas } from "./chat/canvas-snapshot";
import { lastUserText } from "./chat/chat-view-model";
import { isBusyStatus } from "./chat/turn-model";

// Per-browser UI preference, so a minimised agent stays minimised on reload.
const OPEN_STORAGE_KEY = "thumbgen.chat.open";

function readStoredOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

/**
 * Right-side chat panel. Slide-in 420px wide. Mounted from Canvas.
 *
 * Lifecycle:
 *   - On open + active conversation change: fetch persisted messages
 *   - On send: @ai-sdk/react's useChat optimistically pushes the user
 *     message and opens the UI-message stream against postV2
 *     (src/lib/agent/v2/route-handler.ts, the only agent backend)
 *   - The assistant message streams in as part of useChat's own `messages`
 *     until `status` returns to "ready"; MessageList shows it as one live
 *     step line (TurnProgress), then as a finished turn (AssistantTurn)
 *   - On done: refetch messages from DB to canonicalize (skipped when the
 *     turn failed, so the failed message and its error stay visible)
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

  // Start of the running turn (or of its automatic resumption), for the live timer.
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null);
  // Conversation whose turn the user stopped: its last turn reads « Tour interrompu » until the next send.
  const [stoppedConversationId, setStoppedConversationId] = useState<string | null>(null);
  // Set by useChat's onError during a turn, so that turn keeps its live messages instead of the refetch.
  const turnFailedRef = useRef(false);

  const {
    messages: chatMessages,
    status,
    sendMessage,
    regenerate,
    stop,
    addToolOutput,
    setMessages,
    error,
    clearError,
  } = useChat({
    // Starts empty; the "Load persisted history" useEffect below seeds this
    // via setMessages(rowsToUIMessages(rows)) as soon as activeConversationId
    // is known (including on first mount), so the initial [] here is only
    // ever visible for a single render before that effect runs.
    messages: [],
    transport: new DefaultChatTransport({ api: "/api/agent/chat" }),
    // Auto-resumes the turn once a client tool (request_user_image) has been
    // resolved via addToolOutput — needed for Task 11's human-in-the-loop
    // flow to actually continue the conversation instead of sitting
    // resolved-but-idle. Scoped to client-tool completions specifically (see
    // the function's own doc comment) — ai's own
    // lastAssistantMessageIsCompleteWithToolCalls fires for ANY completed
    // tool call, which could otherwise trigger an unbounded auto-
    // continuation loop when the server's « Étapes max » cap (agentMaxSteps
    // setting) lands on a step that happened to end with completed
    // server-tool results.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithClientToolCalls,
    onError: () => {
      turnFailedRef.current = true;
    },
  });

  const annotateImageUrl = useChatStore((s) => s.annotateImageUrl);
  const closeAnnotate = useChatStore((s) => s.closeAnnotate);

  // When project changes, clear active conv so useConversations picks the new
  // project's first conv (or stays empty if none). Without this, the previous
  // project's conversation + history would bleed over into the new project.
  useEffect(() => {
    useChatStore.getState().setActive(null);
  }, [projectId]);

  // Load persisted history when active conversation changes, seeding
  // useChat's own message state directly via rowsToUIMessages (Task 4) —
  // this replaces the old history/setHistory adapter + rowToDisplay, which
  // parsed content_json as the stale v1 AnthropicBlock[] shape and rendered
  // every persisted message as an empty bubble now that Task 2's migration
  // has moved the DB to ModelMessage[]-shaped rows. A previous conversation's
  // error must not paint the loaded one, hence clearError().
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!activeConversationId) {
        if (!cancelled) {
          setMessages([]);
          clearError();
        }
        return;
      }
      const rows = (await fetch(`/api/agent/conversations/${activeConversationId}/messages`).then((r) => r.json())) as StoredMessageRow[];
      if (!cancelled) {
        setMessages(rowsToUIMessages(rows));
        clearError();
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [activeConversationId, setMessages, clearError]);

  // The last message's pending client-tool part (request_user_image /
  // request_user_sketch) — a direct scan of chatMessages, replacing the old
  // legacyEvents-array scan. Requires state === "input-available"
  // specifically (not just "!== output-available"): the deleted
  // uiMessageToLegacyEvents adapter also excluded "input-streaming" (args
  // not settled yet — `input?.reason` would be undefined, and resolving
  // mid-stream sets state to "output-available" without ever firing the
  // auto-continuation, since sendAutomaticallyWhen's send is gated on
  // status being neither "streaming" nor "submitted" — the next
  // tool-input-available chunk then silently overwrites the resolved part).
  // "output-error"/"output-denied" are excluded too for the same reason —
  // only "input-available" is a state where offering a resolution is safe.
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

  // Resolves PendingUiAction's pending part via useChat's real addToolOutput.
  // `options.body` is NOT optional: addToolOutput's auto-continuation
  // (sendAutomaticallyWhen above) goes through the SAME DefaultChatTransport
  // as a normal send, so it needs the same conversation_id/project_id/
  // canvas_snapshot or route-handler.ts's own guard 400s it (verified
  // against node_modules/ai/dist/index.js's real addToolOutput ->
  // makeRequest -> transport.sendMessages call path) — see this task's brief
  // header note.
  const respondToUiTool = useCallback(
    (toolCallId: string, result: unknown) => {
      if (!pendingToolPart) return;
      const toolName = pendingToolPart.type.slice("tool-".length) as "request_user_image" | "request_user_sketch";
      setTurnStartedAt(Date.now());
      turnFailedRef.current = false;
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
    [addToolOutput, pendingToolPart, activeConversationId, projectId, nodes, edges],
  );

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
    useChatStore.getState().setActive(conv.id);
    return conv.id;
  }, [activeConversationId, projectId]);

  // Attachments deliberately do NOT go through AI SDK's own `files`/
  // FileUIPart mechanism (Plan 2's Task 7 decision keeps AttachButton.tsx's
  // existing `stored:<id>` string flow) — they're sent as a sibling
  // top-level `attachments` field in `body`, read by route-handler.ts.
  const requestBody = useCallback(
    (conversationId: string, attachmentsToSend: ChatAttachment[] = []) => ({
      conversation_id: conversationId,
      project_id: projectId,
      canvas_snapshot: snapshotCanvas(nodes, edges),
      attachments: attachmentsToSend.map((a) => ({ type: "image" as const, source: a.source })),
    }),
    [projectId, nodes, edges],
  );

  // Runs one turn (a send, an « Et maintenant » reply or a « Réessayer »),
  // then canonicalizes the conversation from the DB.
  const runTurn = useCallback(
    async (conversationId: string, start: () => Promise<void>) => {
      setStoppedConversationId(null);
      setTurnStartedAt(Date.now());
      turnFailedRef.current = false;
      await start();
      // A failed turn keeps its live messages: the refetch would drop the
      // user's unsaved message together with the error row under it.
      if (turnFailedRef.current) return;

      // Refetch persisted history (canonical assistant message replaces the live one).
      // If the user switched conversations mid-stream, the active conv has changed —
      // discard the refetch so we don't paint old messages over the new conv's UI.
      const rows = (await fetch(`/api/agent/conversations/${conversationId}/messages`).then((r) => r.json())) as StoredMessageRow[];
      if (useChatStore.getState().activeConversationId !== conversationId) return;
      setMessages(rowsToUIMessages(rows));

      // Cheap, idempotent, always safe to call — useConversations refetches
      // the whole list on every bump. This is how the conversation list picks
      // up an auto-generated title (route-handler.ts's generateAndPersistTitle,
      // fire-and-forget server-side on a conversation's first turn) — there's
      // no more SSE `conversation_renamed` event under v2 to trigger this
      // precisely, so bumping unconditionally after every send is the simplest
      // correct replacement. If the title write raced past this refetch, the
      // list just shows the old title until the next bump.
      useChatStore.getState().bumpConversationListVersion();
    },
    [setMessages],
  );

  const onSend = useCallback(async () => {
    const conversationId = await ensureConversation();
    if (!conversationId) return;
    const text = draft;
    const attachmentsToSend = attachments;
    setDraft("");
    clearAttachments();
    // useChat's sendMessage pushes the user's UIMessage into `chatMessages`
    // synchronously before the network call resolves, so no manual
    // optimistic append is needed here.
    await runTurn(conversationId, () => sendMessage({ text }, { body: requestBody(conversationId, attachmentsToSend) }));
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

  // « Réessayer »: regenerate drops the failed assistant message (if any) and
  // re-runs the last user message — its text only, attachments are not re-sent.
  const retryText = lastUserText(chatMessages);
  const onRetry = useMemo(() => {
    if (busy || !retryText || !activeConversationId) return null;
    const conversationId = activeConversationId;
    return () => {
      void runTurn(conversationId, () => regenerate({ body: requestBody(conversationId) }));
    };
  }, [busy, retryText, activeConversationId, runTurn, regenerate, requestBody]);

  const onStop = useCallback(() => {
    setStoppedConversationId(activeConversationId);
    stop();
  }, [activeConversationId, stop]);

  const controls = useMemo<ChatTurnControls>(
    () => ({
      status,
      errorMessage: error?.message ?? null,
      turnStartedAt,
      stoppedLive: stoppedConversationId !== null && stoppedConversationId === activeConversationId,
      onAskAgent,
      onRetry,
    }),
    [status, error, turnStartedAt, stoppedConversationId, activeConversationId, onAskAgent, onRetry],
  );

  return (
    <>
      {/* Kept mounted while minimised so scroll position and any in-flight
          stream survive a minimise/reopen; `hidden` only removes it from view. */}
      <aside
        hidden={!open}
        className="fixed right-4 bottom-4 z-40 h-[min(640px,calc(100vh-2rem))] w-[400px] max-w-[calc(100vw-2rem)] origin-bottom-right animate-in fade-in zoom-in-95 duration-150"
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
                className="fixed right-4 bottom-4 z-40 rounded-2xl transition-transform duration-200 animate-in fade-in zoom-in-75 hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <AgentAvatar size="lg" />
                {busy && (
                  <span className="absolute -top-1 -right-1 flex size-3.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-violet-400 opacity-75" />
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

What changed compared with `88f7697`, for review: `AgentActivity` and the panel-level error `Alert` are gone (errors live in the turn); `onSend` is split into `ensureConversation` + `requestBody` + `runTurn` so « Et maintenant » (`onAskAgent`) and « Réessayer » (`onRetry`, via `regenerate`) share the composer's path; `turnStartedAt`, `stoppedConversationId` and `turnFailedRef` feed `ChatTurnControls`; `onStop` marks the conversation as stopped; history loads call `clearError()`; history rows are typed `StoredMessageRow[]`.

- [ ] **Step 7: Delete AgentActivity**

```bash
git rm src/components/panels/chat/AgentActivity.tsx
grep -rn "AgentActivity" src tests || echo "no reference left"
```

Expected: « no reference left ».

- [ ] **Step 8: Run the tests**

Run: `./node_modules/.bin/vitest run tests/chat tests/agent/history-to-ui-messages.test.ts tests/agent/should-auto-continue.test.ts`
Expected: PASS (every chat test of Tasks 1, 4, 5, 7, 8, 9 and the 3 + 5 new ones).

- [ ] **Step 9: Full suite, type-check, lint**

Run: `./node_modules/.bin/vitest run` — expected: all tests pass.
Run: `./node_modules/.bin/tsc --noEmit` — expected: exit 0.
Run: `./node_modules/.bin/eslint src/components/panels/ChatPanel.tsx src/components/panels/chat/Message.tsx src/components/panels/chat/MessageList.tsx src/components/panels/chat/chat-view-model.ts tests/chat/chat-view-model.test.ts tests/chat/message-render.test.tsx` — expected: no error (in particular no `react-hooks/set-state-in-effect` or `react-hooks/refs` error: state is set in handlers, the ref is only read and written in callbacks).

- [ ] **Step 10: Commit**

```bash
git add src/components/panels/chat/chat-view-model.ts src/components/panels/chat/Message.tsx src/components/panels/chat/MessageList.tsx src/components/panels/ChatPanel.tsx tests/chat/chat-view-model.test.ts tests/chat/message-render.test.tsx
git commit -m "feat(chat): clean turns in the panel — scroller anchors, groups, next actions, retry" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

(`git rm` in Step 7 already staged the deletion of `AgentActivity.tsx`; it goes into this commit.)

---

## Task 11: Dev fixtures and browser check without any model call

**Files:**
- Create: `scripts/chat-fixtures/seed-chat-fixture.mjs`, `scripts/chat-fixtures/chat-stream-stub.js`
- Test: `tests/chat/chat-stream-stub.test.ts`

**Interfaces:**
- Consumes: the running app's `POST /api/projects`, `POST /api/project`, `POST /api/agent/conversations`, the `messages` / `conversations` tables; (Tasks 4–5) `splitAssistantTurn`, `rowsToUIMessages` in the test.
- Produces: a seed script printing `Open <BASE_URL>/m/<projectId>`; a browser snippet that installs `window.__thumbgenChatStub` (`{ installed: true, mode: "turn" | "error", calls, rows }`) and returns `"installed"`.

- [ ] **Step 1: Write the failing test**

Create `tests/chat/chat-stream-stub.test.ts`:

```ts
// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { DefaultChatTransport, readUIMessageStream, type UIMessage } from "ai";
import { splitAssistantTurn } from "@/components/panels/chat/turn-model";
import { rowsToUIMessages } from "@/components/panels/chat/history-to-ui-messages";

const STUB_PATH = path.join(process.cwd(), "scripts/chat-fixtures/chat-stream-stub.js");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dev chat stream stub", () => {
  it("streams a finish_turn turn the chat parses, then serves the same turn to the history refetch", async () => {
    // No waiting: the stub's delays resolve immediately.
    vi.stubGlobal("setTimeout", (callback: () => void) => {
      callback();
      return 0;
    });
    // The "real" server has no stored row for this conversation.
    window.fetch = async () => new Response("[]", { headers: { "content-type": "application/json" } });
    expect((0, eval)(fs.readFileSync(STUB_PATH, "utf8"))).toBe("installed");

    const transport = new DefaultChatTransport({ api: "/api/agent/chat", fetch: (input, init) => window.fetch(input, init) });
    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "chat",
      messageId: undefined,
      messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "Dessine un croquis" }] }],
      abortSignal: undefined,
      body: { conversation_id: "conv-1" },
    });
    let live: UIMessage | undefined;
    for await (const message of readUIMessageStream({ stream })) live = message;

    const liveTurn = splitAssistantTurn(live!);
    expect(liveTurn.hasFinishTurn).toBe(true);
    expect(liveTurn.stepCount).toBe(4);
    expect(liveTurn.results).toHaveLength(1);
    expect(liveTurn.nextActions.map((action) => action.kind)).toEqual(["focus_node", "ask_agent"]);

    const rows = await (await window.fetch("/api/agent/conversations/conv-1/messages")).json();
    const reopened = rowsToUIMessages(rows);
    expect(reopened.map((message) => message.role)).toEqual(["user", "assistant"]);
    const reopenedTurn = splitAssistantTurn(reopened[1]);
    expect(reopenedTurn.stepCount).toBe(4);
    expect(reopenedTurn.results).toHaveLength(1);
    expect(reopenedTurn.answer).toContain("visage choqué");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/chat/chat-stream-stub.test.ts`
Expected: FAIL — `ENOENT` on `scripts/chat-fixtures/chat-stream-stub.js`.

- [ ] **Step 3: The browser stream stub**

Create `scripts/chat-fixtures/chat-stream-stub.js`:

```js
// Dev-only fixture (chantier E). Paste this whole file into the browser's
// JavaScript tool on a ThumbGen canvas page (/m/<id>). It replaces
// POST /api/agent/chat with a scripted, slow UI-message stream — no model is
// ever called — and serves matching rows to the history refetch that follows.
// Reload the page to remove it.
//   window.__thumbgenChatStub.mode = "turn"   // default: a 4-step turn ending with finish_turn
//   window.__thumbgenChatStub.mode = "error"  // the chat route answers 400 before streaming
(() => {
  if (window.__thumbgenChatStub?.installed) return "already installed";

  const realFetch = window.fetch.bind(window);
  const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAMAASsJTYQAAAAASUVORK5CYII=";
  const stub = { installed: true, mode: "turn", calls: 0, rows: new Map() };
  window.__thumbgenChatStub = stub;

  const sleep = (ms, signal) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });

  const stamp = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

  function script(n) {
    const id = (name) => `stub-${n}-${name}`;
    const reasoning = "Je regarde le canvas avant de dessiner.";
    const sketchText = "Sketch generated. Reference: generated:sk_stub (cost: $0.000)";
    const finishInput = {
      summary: "Croquis prêt : **visage choqué** devant le MacBook.",
      results: [id("sketch")],
      next_actions: [
        { label: "Voir le générateur", kind: "focus_node", node_id: "gen-1" },
        { label: "Un autre croquis", kind: "ask_agent", message: "Fais un autre croquis." },
      ],
    };
    const chunks = [
      { type: "start" },
      { type: "start-step" },
      { type: "reasoning-start", id: id("r") },
      { type: "reasoning-delta", id: id("r"), delta: reasoning },
      { type: "reasoning-end", id: id("r") },
      { type: "text-start", id: id("t") },
      { type: "text-delta", id: id("t"), delta: "Je lis le canvas." },
      { type: "text-end", id: id("t") },
      { type: "tool-input-available", toolCallId: id("canvas"), toolName: "get_canvas_state", input: {} },
      { type: "tool-output-available", toolCallId: id("canvas"), output: { content: [{ type: "text", text: "2 nœuds : prompt-1, gen-1" }] } },
      { type: "finish-step" },
      { type: "start-step" },
      { type: "tool-input-available", toolCallId: id("sketch"), toolName: "generate_sketch", input: { prompt: "Visage choqué devant un MacBook" } },
      {
        type: "tool-output-available",
        toolCallId: id("sketch"),
        output: { content: [{ type: "text", text: sketchText }, { type: "image", mimeType: "image/png", data: PNG }, { type: "text", text: `result_id: ${id("sketch")}` }] },
      },
      { type: "finish-step" },
      { type: "start-step" },
      { type: "tool-input-available", toolCallId: id("finish"), toolName: "finish_turn", input: finishInput },
      { type: "tool-output-available", toolCallId: id("finish"), output: { content: [{ type: "text", text: '{"ok":true}' }] } },
      { type: "finish-step" },
      { type: "finish", finishReason: "tool-calls" },
    ];
    const resultRow = (toolCallId, toolName, value) => ({ role: "tool", content: [{ type: "tool-result", toolCallId, toolName, output: { type: "content", value } }] });
    const assistantContent = [
      { role: "assistant", content: [{ type: "reasoning", text: reasoning }, { type: "text", text: "Je lis le canvas." }, { type: "tool-call", toolCallId: id("canvas"), toolName: "get_canvas_state", input: {} }] },
      resultRow(id("canvas"), "get_canvas_state", [{ type: "text", text: "2 nœuds : prompt-1, gen-1" }]),
      { role: "assistant", content: [{ type: "tool-call", toolCallId: id("sketch"), toolName: "generate_sketch", input: { prompt: "Visage choqué devant un MacBook" } }] },
      resultRow(id("sketch"), "generate_sketch", [{ type: "text", text: sketchText }, { type: "file", mediaType: "image/png", data: { type: "data", data: PNG } }, { type: "text", text: `result_id: ${id("sketch")}` }]),
      { role: "assistant", content: [{ type: "tool-call", toolCallId: id("finish"), toolName: "finish_turn", input: finishInput }] },
      resultRow(id("finish"), "finish_turn", [{ type: "text", text: '{"ok":true}' }]),
    ];
    return { id, chunks, assistantContent };
  }

  function remember(conversationId, rows) {
    stub.rows.set(conversationId, [...(stub.rows.get(conversationId) ?? []), ...rows]);
  }

  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
    const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();

    if (url.pathname === "/api/agent/chat" && method === "POST") {
      stub.calls += 1;
      const n = stub.calls;
      if (stub.mode === "error") {
        return new Response("Clé OpenRouter non configurée. Ajoute-la dans Réglages → Connexions des modèles.", { status: 400 });
      }
      const body = JSON.parse(typeof init.body === "string" ? init.body : "{}");
      const lastUser = [...(body.messages ?? [])].reverse().find((m) => m.role === "user");
      const userText = (lastUser?.parts ?? []).filter((p) => p.type === "text").map((p) => p.text).join("");
      const { id, chunks, assistantContent } = script(n);
      const startedAt = Date.now();
      const userRow = { id: id("user"), role: "user", interrupted: 0, created_at: stamp(startedAt), content_json: JSON.stringify([{ role: "user", content: [{ type: "text", text: userText }] }]) };
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for (const chunk of chunks) {
              await sleep(chunk.type === "tool-output-available" ? 3000 : 400, init.signal);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            }
            remember(body.conversation_id, [
              userRow,
              { id: id("assistant"), role: "assistant", interrupted: 0, created_at: stamp(Date.now()), content_json: JSON.stringify(assistantContent) },
            ]);
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch (error) {
            // « Arrêter »: store what the server would, an empty interrupted turn.
            remember(body.conversation_id, [
              userRow,
              { id: id("assistant"), role: "assistant", interrupted: 1, created_at: stamp(Date.now()), content_json: "[]" },
            ]);
            controller.error(error);
          }
        },
      });
      return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" } });
    }

    const history = url.pathname.match(/^\/api\/agent\/conversations\/([^/]+)\/messages$/);
    if (history && method === "GET" && stub.rows.has(history[1])) {
      const rows = await (await realFetch(input, init)).json();
      return new Response(JSON.stringify([...rows, ...stub.rows.get(history[1])]), { status: 200, headers: { "content-type": "application/json" } });
    }

    return realFetch(input, init);
  };

  return "installed";
})();
```

- [ ] **Step 4: The seed script**

Create `scripts/chat-fixtures/seed-chat-fixture.mjs`:

```js
// Dev-only fixture (chantier E): seeds a THROWAWAY ThumbGen database with chat
// conversations covering every layout of the chat panel, without any model call.
//
// Run it while `next dev` serves the same database:
//   BASE_URL=http://localhost:3100 THUMBGEN_DB_PATH=/abs/path/thumbgen.db \
//     /opt/homebrew/bin/node scripts/chat-fixtures/seed-chat-fixture.mjs
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3100";
const DB_PATH = process.env.THUMBGEN_DB_PATH;

if (!DB_PATH) {
  console.error("THUMBGEN_DB_PATH is required: the dev server's throwaway database.");
  process.exit(1);
}
if (path.resolve(DB_PATH).startsWith(path.resolve("data") + path.sep)) {
  console.error("Refusing to seed ./data: that is the Docker database with the user's real projects.");
  process.exit(1);
}

// 1×1 transparent PNG, enough for the image previews.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAMAASsJTYQAAAAASUVORK5CYII=";

async function post(route, body) {
  const res = await fetch(`${BASE_URL}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${route} → ${res.status} ${await res.text()}`);
  return res.json();
}

const project = await post("/api/projects", { name: "Chat propre (fixture)" });
await post("/api/project", {
  projectId: project.id,
  nodes: [
    { id: "prompt-1", type: "prompt", position: { x: 0, y: 0 }, data: { prompt: "Miniature de test" } },
    { id: "gen-1", type: "generator", position: { x: 420, y: 0 }, data: { model: "gemini-3.1-flash-image", aspectRatio: "16x9", numImages: 1 } },
  ],
  edges: [{ id: "e-prompt-gen", source: "prompt-1", sourceHandle: null, target: "gen-1", targetHandle: "prompt-in" }],
});

const db = new DatabaseSync(DB_PATH);
const insertMessage = db.prepare(
  "INSERT INTO messages (id, conversation_id, role, content_json, interrupted, created_at) VALUES (?, ?, ?, ?, ?, ?)",
);
const touchConversation = db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?");

/** SQLite datetime('now') format, `seconds` after a base time `minutesAgo` minutes ago. */
const at = (minutesAgo, seconds = 0) =>
  new Date(Date.now() - minutesAgo * 60_000 + seconds * 1000).toISOString().slice(0, 19).replace("T", " ");

const text = (value) => ({ type: "text", text: value });
const image = () => ({ type: "file", mediaType: "image/png", data: { type: "data", data: PNG } });
const call = (toolCallId, toolName, input) => ({ type: "tool-call", toolCallId, toolName, input });
const result = (toolCallId, toolName, value) => ({ type: "tool-result", toolCallId, toolName, output: { type: "content", value } });
const assistant = (...content) => ({ role: "assistant", content });
const tool = (...content) => ({ role: "tool", content });
const finish = (toolCallId, input) => [
  assistant(call(toolCallId, "finish_turn", input)),
  tool(result(toolCallId, "finish_turn", [text('{"ok":true}')])),
];

async function conversation(title, updatedMinutesAgo, rows) {
  const conv = await post("/api/agent/conversations", { project_id: project.id, title });
  for (const row of rows) {
    insertMessage.run(randomUUID(), conv.id, row.role, JSON.stringify(row.content), row.interrupted ?? 0, row.createdAt);
  }
  touchConversation.run(at(updatedMinutesAgo), conv.id);
}

// A. Two finished turns with finish_turn: results, « Et maintenant » on the last one only.
await conversation("Fixture — réponse organisée", 1, [
  { role: "user", createdAt: at(30), content: [{ role: "user", content: [text("Propose-moi deux angles pour ma vidéo sur le nouveau MacBook.")] }] },
  {
    role: "assistant",
    createdAt: at(30, 14),
    content: [
      assistant({ type: "reasoning", text: "Je regarde le canvas puis je dessine deux croquis." }, text("Je lis le canvas."), call("fx-canvas", "get_canvas_state", { project_id: project.id })),
      tool(result("fx-canvas", "get_canvas_state", [text("2 nœuds : prompt-1, gen-1")])),
      assistant(text("Je dessine deux croquis."), call("fx-sk-a", "generate_sketch", { prompt: "Visage choqué devant un MacBook" }), call("fx-sk-b", "generate_sketch", { prompt: "Duel MacBook contre PC" })),
      tool(
        result("fx-sk-a", "generate_sketch", [text("Sketch generated. Reference: generated:sk_fixturea (cost: $0.000)"), image(), text("result_id: fx-sk-a")]),
        result("fx-sk-b", "generate_sketch", [text("Sketch generated. Reference: generated:sk_fixtureb (cost: $0.000)"), image(), text("result_id: fx-sk-b")]),
      ),
      ...finish("fx-finish-1", {
        summary: "Deux angles prêts : **A** choc, **B** duel. Lequel te parle ?",
        results: ["fx-sk-a", "fx-sk-b"],
        next_actions: [
          { label: "Angle A — Choc", kind: "ask_agent", message: "Je choisis l'angle A." },
          { label: "Angle B — Duel", kind: "ask_agent", message: "Je choisis l'angle B." },
        ],
      }),
    ],
  },
  { role: "user", createdAt: at(29), content: [{ role: "user", content: [text("Je choisis l'angle A.")] }] },
  {
    role: "assistant",
    createdAt: at(29, 9),
    content: [
      assistant(call("fx-apply", "apply_workflow", { project_id: project.id, blueprint: { nodes: [], edges: [] } })),
      tool(result("fx-apply", "apply_workflow", [text("Workflow appliqué : 2 nœuds.")])),
      ...finish("fx-finish-2", {
        summary: "Le workflow est sur le canvas : clique **Générer** sur le générateur pour lancer la miniature finale (ça a un coût).",
        results: [],
        next_actions: [
          { label: "Voir le générateur", kind: "focus_node", node_id: "gen-1" },
          { label: "Ancien générateur", kind: "focus_node", node_id: "gen-supprime" },
          { label: "Change le fond", kind: "ask_agent", message: "Change le fond en orange." },
        ],
      }),
    ],
  },
]);

// B. An older conversation without finish_turn, ending on an interrupted turn.
await conversation("Fixture — ancienne conversation", 60, [
  { role: "user", createdAt: at(120), content: [{ role: "user", content: [text("Qu'est-ce qui marche sur YouTube pour les MacBook ?")] }] },
  {
    role: "assistant",
    createdAt: at(120, 20),
    content: [
      assistant(text("Je cherche sur YouTube."), call("fx-search", "search_youtube", { query: "MacBook", limit: 8 })),
      tool(result("fx-search", "search_youtube", [text('[1] "MacBook M5 : le test" — Chaîne A'), image(), text('[2] "Faut-il acheter le MacBook ?" — Chaîne B'), image()])),
      assistant(text("Trois patterns ressortent : **visage choqué**, flèche rouge, fond très contrasté.")),
    ],
  },
  { role: "user", createdAt: at(119), content: [{ role: "user", content: [text("Et pour les tutoriels ?")] }] },
  { role: "assistant", createdAt: at(119, 3), interrupted: 1, content: [] },
]);

// C. A turn paused on a pending image request.
await conversation("Fixture — demande d'image", 90, [
  { role: "user", createdAt: at(200), content: [{ role: "user", content: [text("Ajoute mon logo.")] }] },
  {
    role: "assistant",
    createdAt: at(200, 4),
    content: [assistant(text("Il me faut ton logo pour la miniature."), call("fx-request", "request_user_image", { reason: "Ton logo, en PNG de préférence.", suggested_kind: "logo" }))],
  },
]);

db.close();
console.log(`Seeded project ${project.id}`);
console.log(`Open ${BASE_URL}/m/${project.id}`);
```

- [ ] **Step 5: Run the test and lint**

Run: `./node_modules/.bin/vitest run tests/chat/chat-stream-stub.test.ts` — expected: PASS (1 test; it drives the stub through the real `DefaultChatTransport` + `readUIMessageStream`).
Run: `./node_modules/.bin/eslint scripts/chat-fixtures/seed-chat-fixture.mjs scripts/chat-fixtures/chat-stream-stub.js tests/chat/chat-stream-stub.test.ts` — expected: no error.
Run: `/opt/homebrew/bin/node --check scripts/chat-fixtures/seed-chat-fixture.mjs` — expected: no output.

- [ ] **Step 6: Start a throwaway dev server and seed it**

```bash
FIXTURE_DIR="$(mktemp -d)"; echo "$FIXTURE_DIR"
```

Note the printed directory and use it literally below (shell variables do not survive between tool calls). Start the server in the background (keep its output to check the log later):

```bash
THUMBGEN_DB_PATH="<FIXTURE_DIR>/thumbgen.db" OPENROUTER_API_KEY= ./node_modules/.bin/next dev -p 3100 > "<FIXTURE_DIR>/next.log" 2>&1
```

Wait until it answers, then seed:

```bash
until curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/miniatures | grep -qE "^(200|307|308)$"; do sleep 2; done
BASE_URL=http://localhost:3100 THUMBGEN_DB_PATH="<FIXTURE_DIR>/thumbgen.db" /opt/homebrew/bin/node scripts/chat-fixtures/seed-chat-fixture.mjs
```

Expected: `Seeded project proj_…` and `Open http://localhost:3100/m/proj_…` (an `ExperimentalWarning` about SQLite is normal).

- [ ] **Step 7: Reopened conversations (no stub needed, nothing is sent)**

Open the printed URL in the browser tool. The agent panel opens on « Fixture — réponse organisée ». Check, with a screenshot and the accessibility tree:
1. First assistant turn: header « 14 s · 6 étapes » (folded, chevron right), answer « Deux angles prêts : **A** choc, **B** duel. Lequel te parle ? », two sketch images side by side, **no** « Et maintenant » (not the last turn), a copy button under the answer.
2. Last assistant turn: « 9 s · 1 étape », the « clique **Générer** » answer, « Et maintenant » with « Voir le générateur », « Ancien générateur » (dimmed; hovering shows « Élément introuvable »), « Change le fond ».
3. Click the first turn's header: the list shows « Réflexion », « Je lis le canvas. » (small, muted), ✓ « Lit le canvas », « Je dessine deux croquis. », ✓ « Dessine le croquis » twice. Expand one sketch row: only « Voir les résultats ci-dessous. ». Expand « Lit le canvas »: « Entrée » / « Sortie » JSON blocks.
4. Click « Voir le générateur »: the canvas centers on the Générateur and selects it.
5. There is no « Assistant · réfléchit… » bar under the list.
6. Open « Historique » → « Fixture — ancienne conversation »: first turn « 20 s · 2 étapes », answer « Trois patterns ressortent : … », the YouTube search gallery (2 thumbnails) as result, no « Et maintenant »; last turn: an Alert « Tour interrompu » / « L'agent s'est arrêté avant d'avoir fini. » with « Réessayer » (do **not** click it before Step 8).
7. « Historique » → « Fixture — demande d'image »: the answer « Il me faut ton logo pour la miniature. », and the « Demande » card (Uploader / Bibliothèque / Skip) above the composer without opening anything. Do not click it.
8. The user messages are unchanged tinted bubbles on the right.

- [ ] **Step 8: Install the stub, then run live turns**

Read `scripts/chat-fixtures/chat-stream-stub.js` and pass its whole content to the browser JavaScript tool on the canvas tab. Expected result: `"installed"`. Confirm with `window.__thumbgenChatStub.installed` → `true`. From here on, every chat request is answered by the stub; if the page reloads, install it again before sending anything.

Back in « Fixture — réponse organisée »:
1. Type `Dessine un croquis` and send. For about 20 s: a single line with a spinner, a changing label (« Réfléchit » → « Rédige la réponse » → « Lit le canvas » → « Réfléchit » → « Dessine le croquis » → « Rédige la réponse »), a `0:0x` timer that ticks, a chevron; no text appears word by word. `document.querySelector('[data-slot="message-scroller-content"]').getAttribute("aria-busy")` → `"true"`.
2. During the turn, click the line: the step list unfolds and updates live (spinner on the running tool, ✓ when done).
3. At the end: « N s · 4 étapes », the answer « Croquis prêt : **visage choqué** devant le MacBook. », one sketch, « Et maintenant » with « Voir le générateur » and « Un autre croquis »; the previous turn's actions are gone; `aria-busy` → `"false"`.
4. The new user message is anchored near the top of the list with a strip of the previous turn visible above it; scroll up during a new turn (send `Encore`) → the view does not jump back; the round « aller au dernier message » button appears and brings you back down.
5. Click « Un autre croquis »: a user message « Fais un autre croquis. » and a new stub turn; the composer draft is untouched.
6. Send `Stop` and click « Arrêter » after 2 s: the turn becomes « Tour interrompu » + « Réessayer ». Click « Réessayer »: a new stub turn runs to the end (after the refetch the retried message appears twice, as it would be stored by the server).
7. Run `window.__thumbgenChatStub.mode = "error"` then send `Test erreur`: under the user message, an assistant row with the Alert « Erreur » / « Clé OpenRouter non configurée. Ajoute-la dans Réglages → Connexions des modèles. » and « Réessayer »; the user message stays. Run `window.__thumbgenChatStub.mode = "turn"`, click « Réessayer »: the turn completes, the user message is not duplicated.
8. Emulate `prefers-reduced-motion: reduce` if the browser tool allows it; otherwise check that the answer's `BubbleContent` has the class `motion-reduce:animate-none` and the live label `motion-reduce:shimmer-none`.
9. Read the console errors (only errors): none from the chat. Then `grep -c "POST /api/agent/chat" "<FIXTURE_DIR>/next.log"` → `0`.

- [ ] **Step 9: Stop the dev server and commit**

Stop the background `next dev`. Leave `<FIXTURE_DIR>` alone (throwaway). Then:

```bash
git add scripts/chat-fixtures/seed-chat-fixture.mjs scripts/chat-fixtures/chat-stream-stub.js tests/chat/chat-stream-stub.test.ts
git commit -m "test(chat): dev fixtures to check the chat without calling a model" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

If a check failed, fix it in the file owned by the relevant task, re-run that task's tests, `tsc` and the checks above, and commit the fix separately (`fix(chat): …`) before this commit.

---

## Task 12: Docker rebuild and live verification

**Files:** none modified (verification only). If a check fails, fix it in the file owned by the relevant task, re-run `tsc` + `vitest`, commit with a `fix(chat): …` message, and only then rebuild — this plan's single rebuild happens once every local check passes.

**Safety rules for this task.** The container serves the user's real database and real API keys.
- Do not modify or delete existing projects or conversations. Open them only to look.
- The live agent check sends **one** real message (paid) in a new project named `Chat propre (vérification)`, only after the user answered « oui » in this session; leave the project in place and mention it in the report.
- If a login page appears (`SITE_PASSWORD` set), stop and ask the user to log in; never type a password.

- [ ] **Step 1: Make sure the branch is green and checked out in the main repository**

```bash
cd /Users/antoinevigneau/thumbgen-real
git status --short
git log --oneline -12
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
```

Expected: the commits of Tasks 1–11 are in the checked-out branch of `/Users/antoinevigneau/thumbgen-real` (if the work lives in another worktree, stop and ask the user to merge or check it out there — Docker's `./data` bind mount is relative to the repository); no uncommitted change to this plan's files; `tsc` exits 0; all tests pass.

- [ ] **Step 2: Rebuild and restart the container (the only rebuild)**

```bash
docker compose build thumbgen && docker compose up -d thumbgen
docker compose ps
until curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/miniatures | grep -qE "^(200|307|308)$"; do sleep 2; done
docker compose logs --tail 50 thumbgen
```

Expected: the build succeeds, `thumbgen` is « Up », no error in the logs.

- [ ] **Step 3: Real reopened conversations (free)**

In `http://localhost:3000/miniatures`, open a project that already has an agent conversation (without sending anything). Check: every assistant turn shows a folded « n s · k étapes » header (or no header for a plain reply), a short answer (the old long markdown answer is now the fallback answer of old turns — expected), search galleries and sketches as results, no « Et maintenant » (old turns have no `finish_turn`), no « Assistant · réfléchit… » bar; expanding a header lists the steps with ✓ / ✗; an old interrupted turn reads « Tour interrompu ».

- [ ] **Step 4: Ask before the paid check**

Ask the user in chat, and wait for a clear answer:

> Pour vérifier le nouveau chat en vrai, j'envoie un seul message à l'agent dans un projet de test « Chat propre (vérification) » : il lit le canvas et dessine un croquis. Coût estimé : quelques centimes (modèle de l'agent + un croquis). Je le fais ?

If the answer is not a clear yes, skip Step 5 and say so in the report.

- [ ] **Step 5: One real agent turn (paid, after « oui »)**

« Nouvelle miniature » → `Chat propre (vérification)` → open it → open the agent panel → send:

```text
Sans recherche YouTube ni question : lis le canvas, dessine un seul croquis simple d'un visage surpris devant un ordinateur, puis termine le tour.
```

Check: while it works, one line with a spinner, the step labels (« Lit le canvas », « Dessine le croquis », …) and a ticking timer, no word-by-word text; at the end a folded « n s · k étapes » header, an answer of 1–2 sentences, the sketch under « Résultats », 1–3 « Et maintenant » buttons; the detail lists the steps and the sketch row says « Voir les résultats ci-dessous. » (if the sketch is not in the results, the model did not copy its `result_id`: the sketch must then still be visible in the detail — report it). Do not click « Générer » or any action that would start a generation.

- [ ] **Step 6: Logs and report**

```bash
docker compose logs --tail 100 thumbgen | grep -i "error\|warn" || echo "no errors"
```

Report every check above with pass/fail, whether the paid check ran (and the project name left in the gallery), and any fix commits.

---

## Self-review against the spec

- §1 Structure d'un tour: `splitAssistantTurn` in `turn-model.ts` (steps, answer priority, results priority, next actions, pending, `durationMs`, `stepCount`) → Task 4 (rulings 4, 12–14); reused for reopened conversations → Tasks 5, 9 (ruling 8).
- §2 `finish_turn`: zod input and limits, `{ ok: true }`, never a step → Tasks 2, 4 (rulings 6, 7); registered like the other tools, not exposed to MCP → Task 2 (ruling 2); ids the model can cite → Task 3 (ruling 3); prompt (every turn, no long free text, `focus_node` for paid clicks, dynamic blocks unchanged) → Task 6 (ruling 19); loop and auto-continuation → Task 3 (ruling 5).
- §3 Pendant le travail: `Marker role="status"` + `Spinner` + label + `m:ss` + chevron, no streaming text → Task 8; `currentStepLabel` with the completed labels → Task 4 (ruling 16); `Collapsible` live detail → Tasks 7–8; `AgentActivity` removed → Task 10; `PendingUiAction` placement → Task 10 (ruling 11).
- §4 Tour terminé: `MessageAvatar` = `AgentAvatar`, folded header « 12 s · 4 étapes », answer with `TextMarkdown` and a reduced-motion-aware fade, results grid with the existing renderers, « Et maintenant » (`ask_agent` via the composer path, `focus_node` with `selectOnly` + `fitView`, disabled « Élément introuvable », last turn only), `MessageFooter` copy button → Tasks 9–10 (rulings 17, 18); error `Alert` + « Réessayer » with the detail kept → Tasks 4, 9, 10 (rulings 9, 10).
- §5 Détail des étapes: reasoning via `Reasoning`, muted intermediate text, compact tool rows with spinner / ✓ / ✗ + message, JSON on demand, no duplicated visual → Task 7 (ruling 15).
- §6 Défilement et liste: `scrollAnchor` on user messages, `autoScroll`, `last-anchor`, moderate peek, `aria-busy`, visible button, `MessageGroup`, unchanged user bubble → Task 10 (ruling 20).
- §7 Composants: `marker` + `spinner` via the local CLI (manual fallback), existing components checked against the registry → Task 1 (ruling 1).
- Gestion des erreurs: invalid/absent `finish_turn` → silent fallback; unknown result id ignored; failed tool ✗ and a failure answer → Task 4.
- Tests: `splitAssistantTurn` cases, `currentStepLabel`, `finish_turn` validation, prompt (instruction present, blocks and order, existing tests green), reopened conversation rendering, no real model → Tasks 2, 3, 4, 6, 9, 10, 11.
- Vérifications manuelles: live line, finished layout, sketch and search results, both action kinds, client request visible, reopened conversation, scrolling → Task 11 (stubbed) and Task 12 (real, paid step gated).
- Hors champ respected: no choice questions or live node-by-node building (F), no voice mode (G).
