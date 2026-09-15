# Agent Chat — Frontend AI Elements Redesign (Plan 2/2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap ThumbGen's chat panel to `@ai-sdk/react`'s `useChat` + shadcn's AI Elements component kit, run the Plan-1 migration script for real, cut over to the AI-SDK-v7 backend as the only path, delete the v1 code, and reskin the result to ThumbGen's existing Atelier Nocturne brand tokens — with full feature parity against the current panel (including a bespoke feature the exploration for this plan turned up: `ToolCallCard`'s per-thumbnail "apply to canvas" button).

**Architecture:** `ChatPanel.tsx` and its subcomponents (`MessageList`, `Message`, `Composer`, `ToolCallCard`, `AgentActivity`, `PendingUiAction`) are rebuilt following the structure of [shadcn's own reference chatbot](https://github.com/shadcn-ui/chatbot-template) — plain shadcn primitives (`Message`/`Bubble`/`MessageScroller`/`Empty`/`InputGroup`) plus one dedicated component per rich tool (`components/panels/chat/tool-renderers/`, mirroring the reference's `components/parts/`) — with AI Elements' `Reasoning` kept for thinking display (no reference-project equivalent to follow instead). Wired to `@ai-sdk/react`'s `useChat` (with `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls`, confirmed real usage in the reference) pointed at the v2 route from Plan 1. `AttachButton`, `MicButton`, `ConversationList`, `UsageBadge`, `LibraryPickerModal`, `ImageAnnotateModal` are REST/local-state components already decoupled from the chat wire protocol — verified during Plan 1 (four of them read in full; the other two inferred from their trigger sites, to be confirmed at the point each is touched) — and are kept, only re-wired as children of the new components. The v1 backend and its kill-switch are deleted once the new frontend is live and the DB is migrated.

**Tech Stack:** `@ai-sdk/react` v4 (already installed, Plan 1), shadcn/ui + AI Elements (`npx ai-elements`, not yet installed — this plan's Task 1), existing `zustand` stores, existing `react-markdown`/`remark-gfm` (kept for message text rendering — see Task 6's rationale for NOT switching to AI Elements' own `Streamdown`-based renderer).

**Spec:** [docs/superpowers/specs/2026-09-14-agent-ai-sdk-redesign-design.md](../specs/2026-09-14-agent-ai-sdk-redesign-design.md)
**Precedes/depends on:** [2026-09-14-agent-ai-sdk-backend-migration.md](./2026-09-14-agent-ai-sdk-backend-migration.md) (Plan 1, merged to `main` in PR #2) — this plan assumes the v2 backend (`src/lib/agent/v2/*`, gated behind `THUMBGEN_AGENT_V2`) already exists and is fully tested.

## Global Constraints

- Every task that touches JSX/CSS ends with a manual browser verification step (`preview_start` + look at it) — per this project's own standing rule, UI work is not done until it's been seen, not just typechecked.
- **Exploration for this plan already caught one real hazard: running a bare `npx ai-elements@latest` clobbers three things this app depends on** — it overwrites the existing `--accent: #6EDDB3` CSS variable (drives the canvas React Flow handle color) with a generic gray, deletes the `body { font-family: Arial... }` rule (the app is deliberately single-font "Arial everywhere," confirmed in `globals.css`'s own comment), and injects a Google Font (`Geist`) import into `layout.tsx`. Task 1 explicitly reverts/fixes all three — do not skip this reconciliation because the installer "already did the CSS."
- **Architecture reference: [github.com/shadcn-ui/chatbot-template](https://github.com/shadcn-ui/chatbot-template)**, shadcn's own complete, official reference chatbot (cloned and read in full during this plan's exploration — `chat.tsx`, `chat-message.tsx`, `prompt-form.tsx`, `tools/index.ts`, `tools/ask_user.ts`, `components/parts/*.tsx`, `components/ui/{message,bubble,message-scroller,empty,input-group}.tsx`). This plan follows its patterns wherever they fit, over this plan's earlier draft's own AI-Elements-package composition — see the specific notes in Tasks 1, 3, 6, 7, 9, 10. Confirmed by reading it: it does NOT use the `ai-elements` CLI/package at all — everything is hand-composed from plain shadcn primitives plus one dedicated component per tool (`components/parts/`). Confirmed NOT relevant to this plan: `@shadcn/helpers`/`createChat()` (a different package, only referenced in a separate shadcn docs page) — a scripted-fixture generator for docs/demos with no model, API route, or network request; wiring the chat panel to it would disconnect it from the real Plan-1 backend, so it is not used anywhere in this plan.
- Installed component set (scoped, not the bare `ai-elements@latest` kitchen-sink command which also pulls in rive/media-chrome/mermaid/carousel deps this app never uses): AI Elements' `reasoning` only (no reference-project equivalent exists to follow instead, and nothing here conflicts with adopting it); shadcn's own `message`, `bubble`, `empty`, `message-scroller`, `input-group`, `alert` (all verified real, installed and read in full from the real registry during this plan's exploration). Dropped from the earlier draft: AI Elements' `conversation` (replaced by `message-scroller`, richer — per-item `scrollAnchor`, confirmed reading its source), `message` (replaced by the reference's own simpler `ui/message.tsx` + `ui/bubble.tsx` — the reference's `TextPart` also confirmed using plain `react-markdown`, not `Streamdown`, validating Task 6's already-planned choice), `prompt-input` (replaced by raw `InputGroup` composition, matching `PromptForm` exactly), `tool` (replaced by the reference's one-dedicated-component-per-tool pattern, Task 9), `image` (never actually used in this plan's own custom renderers, which use plain `<img>`). `card` is available (`npx shadcn add card`) but not installed by this plan — see Task 5's note on why the top-level panel doesn't use it.
- `AttachButton.tsx`, `MicButton.tsx`, `ConversationList.tsx`, `UsageBadge.tsx` are CONFIRMED decoupled from the chat wire protocol (read in full during Plan 1/this plan's exploration) — do not rewrite them, only re-wire their call sites. `LibraryPickerModal.tsx`, `ImageAnnotateModal.tsx` are inferred decoupled (triggered via local `chat-store` state, not message parts) but not read in full — confirm this assumption the first time either is touched (Task 7 and Task 6 respectively) and escalate if it doesn't hold.
- The exact `UIMessage`/`ToolUIPart`/`ReasoningUIPart` part shapes referenced in this plan's code were derived from reading `src/components/ai-elements/tool.tsx` and `reasoning.tsx`'s real prop types during exploration, but the plan itself does not re-derive `node_modules/ai/dist/index.d.ts`'s exact `UIMessage`/`UIMessagePart` union (Plan 1 needed this for `ModelMessage`; this plan builds the reverse direction, which Plan 1's final review noted `ai@7.0.99` has no built-in helper for). Task 4 explicitly includes a step to verify the hand-rolled converter's output against the real type before trusting it.
- `THUMBGEN_AGENT_V2` stays required during Tasks 3–12 (frontend work developed and tested against the flag turned on) and is deleted only in Task 13 (cutover), after Task 2's migration has run for real.
- Every new/modified test file follows the existing convention (`tests/agent/<name>.test.ts` for logic; this plan has no component-testing library installed and does not add one — component correctness is verified in the browser, not via component unit tests, matching this project's existing testing culture).
- **Tasks 5–12's DISPATCH order must follow dependency order, not the printed task numbers** — discovered when Task 5 was about to be dispatched: Task 5's own code calls `<Message message={m} />` (a `message: UIMessage` prop), but Task 5's Files list doesn't touch `Message.tsx` — that prop rename is Task 6's job. Task 6's own code, in turn, calls `<ToolCallCard part={...} />` (the NEW prop shape) and imports `SimpleToolPart`/`SearchYoutubeGallery`/`GeneratedImagePreview` indirectly through `ToolCallCard` — Task 9's job, and Task 9 itself imports `SearchYoutubeGallery`/`GeneratedImagePreview` directly from Task 10. None of these were written to tolerate running out of order (each assumes its dependency already landed), so the plan's own 5-6-7-8-9-10-11-12 numbering is NOT a safe dispatch sequence for this cluster. **Required order: Task 10 → Task 9 → Task 8 → Task 6 → Task 5 → Task 12 → Task 7 → Task 11** (10/9/6/5/12 form the one real hard chain — 10 has no dependents among these and unblocks the most, 9 needs 10, 6 needs 9, 5 needs 6, 12 needs 6; 8 slots in after 9 so it can import the by-then-real `tool-labels.ts` directly instead of using its own documented "no Task 9 yet" fallback; 7 and 11 are fully independent of this cluster — needing only Task 1/Task 3 — and can run anywhere after Task 4, placed last here for no reason other than bookkeeping simplicity). The task NUMBERS and their content are unchanged — this bullet governs execution order only.

---

## File Structure

**New files:**
- `src/components/ai-elements/reasoning.tsx` — installed by the AI Elements CLI (Task 1).
- `src/components/ui/{message,bubble,empty,message-scroller,input-group,alert,...}.tsx` — shadcn primitives, installed explicitly (Task 1), plus whatever else they pull in as dependencies.
- `components.json` — shadcn config (created by Task 1).
- `src/components/panels/chat/tool-renderers/SimpleToolPart.tsx` — shared minimal one-line renderer for the 11 plain list/get/apply tools with no rich visual output (mirrors the reference's `WebSearchPart` — a 3-state text line, not a JSON dump — parameterized by tool name + French label instead of one file per tool, since 11 near-identical one-liners would be pure duplication the reference project's own 3-tool scope never had to weigh; see Task 9's note).
- `src/components/panels/chat/tool-renderers/SearchYoutubeGallery.tsx` — dedicated renderer for `search_youtube`'s image+caption grid (Task 10), mirroring the reference's `GithubRepoPart` (one dedicated component for one meaningfully-different tool).
- `src/components/panels/chat/tool-renderers/GeneratedImagePreview.tsx` — dedicated renderer for `generate_sketch`/`import_youtube_thumbnail`'s single-image preview, preserving the "apply to canvas" button for sketches (Task 10).
- `src/lib/agent/tool-labels.ts` — the ONE authoritative `{toolName: frenchLabel}` map, replacing the two independently-drifted `FRIENDLY_NAMES` tables in `ToolCallCard.tsx` and `AgentActivity.tsx` (Task 9).
- `src/components/panels/chat/history-to-ui-messages.ts` — converts persisted `ModelMessage[]` rows (now migrated, Task 2) into `UIMessage[]` for `useChat`'s initial state (Task 4).

**Modified:**
- `src/app/globals.css`, `src/app/layout.tsx` — Task 1 (AI Elements install reconciliation).
- `src/components/panels/ChatPanel.tsx` — Task 3 (`useChat` wiring), Task 13 (remove flag dependency).
- `src/components/panels/chat/MessageList.tsx` — Task 5.
- `src/components/panels/chat/Message.tsx` — Task 6.
- `src/components/panels/chat/Composer.tsx` — Task 7.
- `src/components/panels/chat/AgentActivity.tsx` — Task 8.
- `src/components/panels/chat/ToolCallCard.tsx` — Task 9 (kept as the dispatcher that picks a custom renderer vs. the generic `Tool` shell).
- `src/components/panels/chat/PendingUiAction.tsx` — Task 11.
- `src/app/api/agent/chat/route.ts` — Task 13 (delete the v1 branch, keep only what Task 8 of Plan 1 called `postV2`'s body, now unconditional).

**Deleted (Task 13):**
- `src/lib/agent/loop.ts`, `src/lib/agent/llm-client.ts`, `src/lib/agent/translate.ts`, `src/hooks/useChat.ts`, `src/lib/agent/pending-actions.ts`, `src/app/api/agent/chat/tool-result/route.ts`.
- `src/lib/agent/mcp/in-memory-client.ts` — already unused since Plan 1 Task 3 (verify no remaining import before deleting).

**Explicitly NOT renamed:** `src/lib/agent/v2/*` keeps its `v2/` directory name even after cutover (it's no longer "the second, optional path" — it's the only path). Renaming it to drop the `v2` prefix would be purely cosmetic, touches ~8 files' import paths for zero functional benefit, and carries real risk of a missed import breaking the build. Deliberately left as-is.

---

### Task 1: Install AI Elements + shadcn components (scoped) + reconcile globals.css/layout.tsx

**Files:**
- Create: `components.json`, `src/components/ai-elements/reasoning.tsx`, `src/components/ui/{message,bubble,empty,message-scroller,input-group,alert}.tsx` (+ their own shadcn dependencies — exact list TBD by the installer, do not hand-author these)
- Modify: `src/app/globals.css`, `src/app/layout.tsx`, `package.json`, `package-lock.json`

**Interfaces:**
- Produces: `Reasoning`/`ReasoningTrigger`/`ReasoningContent` (from `@/components/ai-elements/reasoning`); `MessageGroup`/`Message`/`MessageAvatar`/`MessageContent`/`MessageHeader`/`MessageFooter` (from `@/components/ui/message`); `BubbleGroup`/`Bubble`/`BubbleContent`/`BubbleReactions` (from `.../bubble`); `Empty`/`EmptyHeader`/`EmptyMedia`/`EmptyTitle`/`EmptyDescription`/`EmptyContent` (from `.../empty`); `MessageScrollerProvider`/`MessageScroller`/`MessageScrollerViewport`/`MessageScrollerContent`/`MessageScrollerItem`/`MessageScrollerButton` (from `.../message-scroller`); `InputGroup`/`InputGroupAddon`/`InputGroupButton`/`InputGroupTextarea` (from `.../input-group`); `Alert`/`AlertTitle`/`AlertDescription` (from `.../alert`) — all consumed by Tasks 5–12. Component set and structure follow [shadcn's reference chatbot](https://github.com/shadcn-ui/chatbot-template) (`components/ui/{message,bubble,message-scroller,empty,input-group}.tsx`, read in full during this plan's exploration) rather than the AI Elements package for everything except `reasoning`, which has no reference-project equivalent.

- [ ] **Step 1: Run the scoped installers**

```bash
unset -f node npm npx 2>/dev/null
yes | npx ai-elements@latest add reasoning
npx shadcn@latest add message bubble empty message-scroller input-group alert --yes
```

Expected: creates `components.json`, `src/components/ai-elements/reasoning.tsx`, `src/components/ui/{message,bubble,empty,message-scroller,input-group,alert}.tsx`, whatever OTHER `src/components/ui/*` files those depend on, and modifies `package.json`/`package-lock.json`/`src/app/globals.css`/`src/app/layout.tsx`.

- [ ] **Step 2: Diff `layout.tsx` and revert the unwanted font injection**

```bash
git diff src/app/layout.tsx
```

The installer adds a `Geist` Google Font import and applies it via `geist.variable`/`font-sans`. This app is deliberately single-font ("Single-font system: Arial everywhere," `globals.css`'s own comment). Remove the `Geist` import and the `font-sans`/`geist.variable` className additions — restore the `<html>` tag to only add whatever the installer's `dark` class change contributes (keep `className="dark"` addition if present — Atelier Nocturne is dark-only, this is harmless and matches `.dark`-scoped shadcn tokens). The final `layout.tsx` must still set `fontFamily: "Arial, Helvetica, sans-serif"` on `<body>` exactly as before.

- [ ] **Step 3: Add `TooltipProvider` if the installer asks for it**

None of the specific components installed in Step 1 (`message`, `bubble`, `empty`, `message-scroller`, `input-group`, `alert`, `reasoning` — confirmed reading each one's source during this plan's exploration) use `Tooltip` internally, unlike the broader AI Elements set this plan's earlier draft considered. If Step 1's own CLI output nonetheless prints a message asking you to wrap the app in `TooltipProvider` (a `tooltip` component may still be pulled in as a transitive dependency of something), do it in `layout.tsx`:

```tsx
import { TooltipProvider } from "@/components/ui/tooltip";
// ...
<body ...>
  <TooltipProvider>{children}</TooltipProvider>
</body>
```

If no such message appears, skip this step — don't add a provider for a component nothing here uses.

- [ ] **Step 4: Diff `globals.css` and fix the `--accent` regression**

```bash
git diff src/app/globals.css
```

Confirm whether `--accent` (originally `#6EDDB3`, drives `.react-flow__handle`'s background — the canvas connection-point color) got overwritten by the installer's generic `oklch(...)` value. If so, restore it to `#6EDDB3` — this token is explicitly marked `DO NOT change unless rebuilding canvas` in this file's own existing comment, and the AI Elements install has no legitimate reason to touch it.

Also confirm the `body { font-family: Arial... }` rule the installer deletes is NOT needed as a fallback (it's redundant with `layout.tsx`'s inline style, which the installer does NOT touch) — leaving it removed is fine, but note it in your report so it's a documented decision, not a silent loss.

- [ ] **Step 5: Remap the installer's generic shadcn tokens onto Atelier Nocturne**

The installer adds a full set of generic `oklch(...)` tokens (`--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent-foreground`, `--destructive`, `--border`, `--input`, `--ring`, `--sidebar-*`, `--chart-*`) inside `:root` and a `.dark { ... }` block with dark-mode overrides for the same names. These shadcn components style themselves entirely through these tokens (e.g. `bg-background`, `text-foreground` — confirmed directly in `bubble.tsx`: its `default`/`secondary`/`muted`/`destructive` variants set `bg-primary`/`bg-secondary`/`bg-muted`/`bg-destructive` respectively, and `card.tsx` uses `bg-card`/`text-card-foreground`/`bg-muted`). Left as the installer's defaults, every new component will render in generic light/dark gray, not Atelier Nocturne's dark ink + warm bone + magenta palette.

Since this app is dark-only (no light/dark toggle), remap the tokens **inside `.dark`** (the block that's actually active, given `layout.tsx`'s `<html className="dark">`) to point at the existing Atelier Nocturne tokens, using the closest real semantic match:

```css
.dark {
  --background: var(--ink-1);
  --foreground: var(--bone);
  --card: var(--node-bg);
  --card-foreground: var(--bone);
  --popover: var(--node-bg);
  --popover-foreground: var(--bone);
  --primary: var(--brand);
  --primary-foreground: var(--bone);
  --secondary: var(--brand-tint);
  --secondary-foreground: var(--bone);
  --muted: var(--ink-3);
  --muted-foreground: var(--bone-muted);
  --accent-foreground: var(--bone);
  --destructive: var(--ember);
  --border: var(--line);
  --input: var(--line);
  --ring: var(--brand);
}
```

Do NOT touch the bare `:root` copies of these same names (used only as a fallback before `.dark` applies) — leave the installer's defaults there, they're inert once `.dark` is active on `<html>`.

Note: `--accent` itself (not `--accent-foreground`) is deliberately excluded from this remap — it's the pre-existing canvas token fixed in Step 4, not a new shadcn semantic slot; do not add a `--accent: var(--brand)` line here, that would re-break the canvas handles.

- [ ] **Step 6: Verify nothing broke — typecheck, then look at the app**

```bash
unset -f node npm npx 2>/dev/null
npx tsc --noEmit
```

Expected: clean (no component is imported/used yet, so this mainly confirms the install itself didn't break the build).

Then start the dev server and LOOK at the canvas (not the chat panel — nothing there changed yet):

```bash
# use this session's preview_start tool, not a raw shell background process
```

Confirm: canvas still renders with mint-green connection handles (not white/gray), body text still renders in Arial, no visual regression anywhere outside the (still-untouched) chat panel.

- [ ] **Step 7: Commit**

```bash
git add components.json src/components/ai-elements src/components/ui src/app/globals.css src/app/layout.tsx package.json package-lock.json
git commit -m "chore: install AI Elements (scoped) + reconcile globals.css/layout.tsx with Atelier Nocturne"
```

---

### Task 2: Run the Plan-1 migration script for real

**Files:** none created/modified (this task runs an already-committed script against the real dev database).

**Interfaces:**
- Consumes: `migrateAllMessages()` from `scripts/migrate-chat-messages-to-uimessage.ts` (Plan 1, already committed and tested — do not modify it here).

This is the "migrate, then flip, then swap frontend" sequencing the Plan 1 spec's §7 and this plan's Global Constraints require: the new frontend (Tasks 3–12) will be developed and tested against `THUMBGEN_AGENT_V2=1`, which means every conversation it touches during development must already be migrated, or `route-handler.ts`'s shape guard (Plan 1, Task 8's fix wave) will correctly, but confusingly, 400 on old-format history.

- [ ] **Step 1: Back up the database file**

```bash
cp data/thumbgen.db data/thumbgen.db.bak.$(date +%Y%m%d%H%M%S)
```

- [ ] **Step 2: Run the migration**

```bash
unset -f node npm npx 2>/dev/null
npx tsx scripts/migrate-chat-messages-to-uimessage.ts
```

Expected output: `Migrated <N> rows, <E> errors, <S> skipped.` (per Plan 1's fix-wave, the script now reports `skipped` for already-migrated rows and continues past a single bad row rather than aborting the whole batch — `E` should be `0` or explainable).

- [ ] **Step 3: Spot-check the result**

```bash
sqlite3 data/thumbgen.db "SELECT role, content_json FROM messages ORDER BY created_at DESC LIMIT 3"
```

Expected: `content_json` values parse as `[{"role":...,"content":[...]}, ...]` (ModelMessage shape), not `[{"type":"text",...}]` (the old Anthropic-block shape).

- [ ] **Step 4: Run the migration a second time to confirm idempotency**

```bash
npx tsx scripts/migrate-chat-messages-to-uimessage.ts
```

Expected: `Migrated 0 rows, 0 errors, <N> skipped` — every row already migrated in Step 2 is now correctly skipped, not re-processed or emptied (this is exactly the idempotency guard Plan 1's fix-wave added — this step is a real-data confirmation of it, not a repeat of Plan 1's own unit test).

- [ ] **Step 5: No commit needed** — this step changes `data/thumbgen.db` only, which is not tracked in git (confirm: `git check-ignore data/thumbgen.db` should succeed). If it's somehow tracked, stop and report — that would mean the repo has been committing user data, a separate problem to flag rather than silently commit over.

---

### Task 3: `ChatPanel.tsx` — swap to `@ai-sdk/react`'s `useChat`

**Files:**
- Modify: `src/components/panels/ChatPanel.tsx`

**Interfaces:**
- Consumes: `useChat` from `@ai-sdk/react`, `DefaultChatTransport` (or whatever transport class the installed `@ai-sdk/react@4.0.102` exports for pointing at a custom endpoint — verify the exact export name against `node_modules/@ai-sdk/react/dist/index.d.ts` before writing this import; do not guess).
- Produces: the same external shape `MessageList`/`Composer`/`AgentActivity`/`PendingUiAction` will consume in Tasks 5–11 — specifically `messages: UIMessage[]`, `status: ChatStatus`, `sendMessage`, `stop`, `addToolOutput` (or whatever the exact v4 API names these — verify against the installed package's types, the API surface for tool-output resolution has been renamed across AI SDK majors per Plan 1's own findings, so re-confirm for v4 specifically rather than assuming it matches what Plan 1 found for the `ai` core package).

This task ONLY swaps the data-fetching hook — it does NOT touch the JSX that renders `messages`/`events`/etc. (that JSX gets replaced file-by-file in Tasks 5–11). To keep this task reviewable in isolation, temporarily adapt `useChat`'s output back into the OLD `DisplayMessage[]`/`ChatEvent[]` shapes the untouched child components still expect, with a `// TODO(Task 5-11): remove this adapter once children are rewritten` comment — this is intentional, temporary scaffolding, not permanent tech debt; each of Tasks 5–11 removes the piece of this adapter its own rewritten component no longer needs.

- [ ] **Step 1: Read the real `useChat` v4 types before writing any code**

```bash
unset -f node npm npx 2>/dev/null
grep -n "export function useChat\|export declare function useChat" node_modules/@ai-sdk/react/dist/index.d.ts
```

Read the full signature this prints (the file, around that line) — confirm the exact shape of what `useChat` returns (`messages`, `status`, `sendMessage` vs `append`, `stop`, `addToolOutput` vs `addToolResult`, `error`) and what options it accepts (`transport`, `id`, `messages` for initial state). Plan 1's research found AI SDK renamed several of these across majors (`addToolResult`→`addToolOutput`, `onFinish`→`onEnd`) — do not assume the v4 react package's names match without checking.

- [ ] **Step 2: Wire `useChat`**

Real code — the field/option names below are confirmed two ways: against `node_modules/@ai-sdk/react/dist/index.d.ts` directly, AND against a real, working call site in [shadcn's reference chatbot](https://github.com/shadcn-ui/chatbot-template)'s `components/chat.tsx` (read in full during this plan's exploration), which uses this exact shape:

```tsx
import { useChat } from "@ai-sdk/react";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";

// Inside ChatPanel:
const { messages, status, sendMessage, stop, addToolOutput, error } = useChat({
  messages: initialUiMessages, // from Task 4's history-to-ui-messages.ts, loaded per active conversation
  // Auto-resumes the turn once a client tool (request_user_image) has been
  // resolved via addToolOutput — confirmed real usage in the reference's
  // chat.tsx, needed for Task 11's human-in-the-loop flow to actually
  // continue the conversation instead of just sitting resolved-but-idle.
  sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
});
```

The reference project does NOT pass an explicit `transport` at all — `useChat` defaults to POSTing to `/api/chat` (its own route). This app's route is `/api/agent/chat`, so a `transport: new DefaultChatTransport({ api: "/api/agent/chat" })` IS still needed here; confirm `DefaultChatTransport`'s exact export path (`from "ai"`) against `node_modules/ai/dist/index.d.ts` before trusting this import.

**`conversation_id`/`project_id`/`canvas_snapshot` per send — resolved, not left open:** the reference's `chat.tsx` calls `sendMessage({ text }, { body: { model: resolvedModel } })` — `sendMessage`'s SECOND argument accepts a per-call `{ body }` that merges into the request, confirmed both in that real call site and in `addToolOutput`'s matching `{ options: { body: {...} } }` parameter (Task 11 uses the identical mechanism). No custom transport is needed — pass `project_id`/`canvas_snapshot` (which changes per send, unlike a static `model`) the same way:

```tsx
sendMessage(
  { text: draft, files: attachmentFileParts },
  { body: { conversation_id: activeConversationId, project_id: projectId, canvas_snapshot: snapshotCanvas(nodes, edges) } },
);
```

`postV2` (Plan 1's `route-handler.ts`) already reads `conversation_id`/`project_id`/`canvas_snapshot` from the parsed request body alongside the AI-SDK-native `messages` — confirm the exact key names it destructures still match (`src/lib/agent/v2/route-handler.ts`) before finalizing this call.

- [ ] **Step 3: Temporary adapter for untouched children**

```tsx
// TODO(Task 5-11): remove once MessageList/Composer/AgentActivity/PendingUiAction are rewritten
const legacyHistory: DisplayMessage[] = messages.map(uiMessageToLegacyDisplayMessage); // write this small mapper inline or in a scratch file; it is deleted by Task 5, not part of the final design
const legacyStreaming = status === "streaming" || status === "submitted";
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Manual verification**

`THUMBGEN_AGENT_V2=1` dev server, open the chat panel, send one message, confirm SOMETHING renders (even if visually still the OLD components via the adapter) and no console error. This is a wiring check, not a visual check — Tasks 5–11 own the visual result.

- [ ] **Step 6: Commit**

```bash
git add src/components/panels/ChatPanel.tsx
git commit -m "feat(chat): wire ChatPanel to @ai-sdk/react's useChat (children still on legacy adapter)"
```

---

### Task 4: History-loading adapter (`ModelMessage[]` rows → `UIMessage[]`)

**Files:**
- Create: `src/components/panels/chat/history-to-ui-messages.ts`
- Test: `tests/agent/history-to-ui-messages.test.ts`

**Interfaces:**
- Consumes: the existing `GET /api/agent/conversations/:id/messages` response shape — an array of `{id, role, content_json, ...}` rows (unchanged route, Plan 1 confirmed `conversation/store.ts` and this route are format-agnostic) where `content_json` now parses to `ModelMessage[]` (post-Task-2 migration).
- Produces: `rowsToUIMessages(rows): UIMessage[]`, consumed by `ChatPanel.tsx` (Task 3, replacing the placeholder `initialUiMessages` reference) to seed `useChat`'s initial state when a conversation is opened.

- [ ] **Step 1: Read the real `UIMessage`/`UIMessagePart` types**

```bash
grep -n "^type UIMessage\|^interface UIMessage\|type UIMessagePart" node_modules/ai/dist/index.d.ts | head -20
```

Read the matching type definitions in full. Confirm the exact part-type string for tool parts (Plan 1's final review confirmed message parts for a typed tool are named `tool-${toolName}`, e.g. `tool-list_logos` — confirm this still holds for `UIMessage` specifically, not just the `ModelMessage`/streaming-part vocabulary Plan 1 verified) and for reasoning parts (`type: "reasoning"` with a `text` field, matching what `reasoning.tsx`'s `ReasoningContent` expects: `children: string`).

- [ ] **Step 2: Write the converter**

```typescript
// src/components/panels/chat/history-to-ui-messages.ts
import type { UIMessage } from "ai";

type ModelMessageContent =
  | { type: "text"; text: string }
  | { type: "file"; mediaType: string; data: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool-result"; toolCallId: string; toolName: string; output: unknown };

type PersistedModelMessage = {
  role: "user" | "assistant" | "tool";
  content: ModelMessageContent[];
};

type Row = { id: string; role: "user" | "assistant"; content_json: string };

/**
 * Converts persisted ModelMessage[] rows (Plan 1's storage format) into
 * UIMessage[] for useChat's initial state. ai@7.0.99 has no built-in
 * reverse of convertToModelMessages (confirmed absent during Plan 1's
 * final review) — this is a deliberate, hand-rolled inverse limited to
 * exactly the part shapes this app's tools ever produce (text, file,
 * tool-call/tool-result pairs, reasoning).
 */
export function rowsToUIMessages(rows: Row[]): UIMessage[] {
  const out: UIMessage[] = [];
  // Tool results arrive in a SEPARATE role:"tool" ModelMessage from the
  // assistant row that made the call (see Plan 1's persist-turn.ts) — merge
  // each tool-result back onto the matching tool-call by toolCallId so a
  // UIMessage's tool part carries both input AND output together, as
  // ToolCallCard's dispatcher (Task 9) expects from a single part.
  for (const row of rows) {
    const persisted = JSON.parse(row.content_json) as PersistedModelMessage[];
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
        else if (c.type === "file") parts.push({ type: "file", mediaType: c.mediaType, url: c.data });
        else if (c.type === "tool-call") {
          parts.push({
            type: `tool-${c.toolName}`,
            toolCallId: c.toolCallId,
            state: "input-available",
            input: c.input,
          } as UIMessage["parts"][number]);
        }
      }
      out.push({ id: row.id, role: msg.role as "user" | "assistant", parts });
    }
  }
  return out;
}
```

- [ ] **Step 2b: Verify the constructed objects actually satisfy `UIMessage`/`UIMessagePart`**

```bash
npx tsc --noEmit
```

The `as UIMessage["parts"][number]` cast in Step 2 is a deliberate escape hatch for the same reason Plan 1 needed similar casts (a hand-built discriminated-union member the compiler can't always narrow automatically) — but if typecheck reveals the REAL `UIMessagePart`/tool-part shape needs different field names than `state`/`input`/`output`/`toolCallId`, fix the object literal to match what the compiler says, the same rule Plan 1 followed throughout. Do not widen the cast to paper over a real mismatch.

- [ ] **Step 3: Write the test**

```typescript
// tests/agent/history-to-ui-messages.test.ts
import { describe, it, expect } from "vitest";
import { rowsToUIMessages } from "@/components/panels/chat/history-to-ui-messages";

describe("rowsToUIMessages", () => {
  it("converts a plain text turn", () => {
    const rows = [
      { id: "r1", role: "user" as const, content_json: JSON.stringify([{ role: "user", content: [{ type: "text", text: "Salut" }] }]) },
      { id: "r2", role: "assistant" as const, content_json: JSON.stringify([{ role: "assistant", content: [{ type: "text", text: "Bonjour" }] }]) },
    ];
    const messages = rowsToUIMessages(rows);
    expect(messages).toHaveLength(2);
    expect(messages[0].parts).toEqual([{ type: "text", text: "Salut" }]);
    expect(messages[1].parts).toEqual([{ type: "text", text: "Bonjour" }]);
  });

  it("folds a tool-result row back onto the matching tool-call part", () => {
    const rows = [
      { id: "r1", role: "user" as const, content_json: JSON.stringify([{ role: "user", content: [{ type: "text", text: "logos?" }] }]) },
      {
        id: "r2",
        role: "assistant" as const,
        content_json: JSON.stringify([
          { role: "assistant", content: [{ type: "tool-call", toolCallId: "c1", toolName: "list_logos", input: {} }] },
          { role: "tool", content: [{ type: "tool-result", toolCallId: "c1", toolName: "list_logos", output: { content: [{ type: "text", text: "2 logos" }] } }] },
        ]),
      },
    ];
    const messages = rowsToUIMessages(rows);
    const toolPart = messages[1].parts.find((p) => p.type === "tool-list_logos") as { state: string; output: unknown };
    expect(toolPart.state).toBe("output-available");
    expect(toolPart.output).toEqual({ content: [{ type: "text", text: "2 logos" }] });
  });
});
```

- [ ] **Step 4: Run the test**

```bash
npx vitest run tests/agent/history-to-ui-messages.test.ts
```

Expected: 2/2 passing.

- [ ] **Step 5: Wire it into `ChatPanel.tsx`**, replacing Task 3's `initialUiMessages` placeholder — load history via the existing `GET /api/agent/conversations/:id/messages` fetch (unchanged from `ChatPanel.tsx`'s current `useEffect`), pass the rows through `rowsToUIMessages`.

- [ ] **Step 6: Commit**

```bash
git add src/components/panels/chat/history-to-ui-messages.ts tests/agent/history-to-ui-messages.test.ts src/components/panels/ChatPanel.tsx
git commit -m "feat(chat): convert persisted ModelMessage rows to UIMessage for useChat's initial state"
```

---

### Task 5: `MessageList.tsx` → shadcn `MessageScroller` + `Empty`

**Files:**
- Modify: `src/components/panels/chat/MessageList.tsx`, `src/components/panels/ChatPanel.tsx`

**Interfaces:**
- Consumes: `MessageScrollerProvider`/`MessageScroller`/`MessageScrollerViewport`/`MessageScrollerContent`/`MessageScrollerItem` (`@/components/ui/message-scroller`), `Empty`/`EmptyHeader`/`EmptyMedia`/`EmptyTitle`/`EmptyDescription` (`@/components/ui/empty`) — both Task 1 — `messages: UIMessage[]` (Task 3's `useChat`, no longer the legacy adapter — this task removes that specific piece of Task 3's temporary scaffolding).
- Produces: renders `<Message>` (Task 6) per `UIMessage`, each wrapped in `MessageScrollerItem`.

**Scope addition, found during this plan's own execution (a real gap, not originally called out by any task): nothing anywhere in this plan ever wires up `error` display.** Task 1 installs `Alert`/`AlertTitle`/`AlertDescription` and lists them as "consumed by Tasks 5–12," but no task's text actually uses them. The OLD code's error handling (a synthetic `DisplayMessage` pushed into the combined message array — `ChatPanel.tsx`'s now-deleted `messages: DisplayMessage[]` `useMemo`, removed by Task 6 taking away `DisplayMessage`/`MessageBlock`) has nothing replacing it. This task is the correct owner: it's the one deleting `legacyLiveMessages`/the old combine and rewiring `MessageList`'s call site, so it's the one that must decide what shows `useChat`'s real `error: Error | undefined` state. Fix, matching the reference chatbot's own pattern (`chat.tsx`'s error display, read during this plan's exploration):

```tsx
// In ChatPanel.tsx, near where <MessageList .../> and <Composer .../> render:
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
// ...
{error && (
  <Alert variant="destructive" className="mx-3 my-2">
    <AlertTitle>Erreur</AlertTitle>
    <AlertDescription>{error.message}</AlertDescription>
  </Alert>
)}
```

Place it between `MessageList` and `Composer` (matching the reference's layout — the error sits above the input, not inside the scrolling message list). `error` is already destructured from `useChat()` in `ChatPanel.tsx` (Task 3) and currently unused for this purpose (the old code fed it into the now-deleted synthetic-bubble mechanism) — just render it directly, no new state needed.

**Why `MessageScroller` instead of AI Elements' own `Conversation`:** both do the same job (auto-scroll-to-bottom container); `MessageScroller` (confirmed reading its real source, `src/components/ui/message-scroller.tsx`) is the richer of the two — `MessageScrollerItem` takes a `scrollAnchor` prop that settles the viewport near a SPECIFIC turn instead of always snapping to the document bottom, matching the "no jarring jump on a new message" behavior described in shadcn's own AI-SDK-helper docs page. Anchor the user's own message on send (`scrollAnchor={m.role === "user"}`), the same pattern shown there.

**Why the panel does NOT become a `Card`:** `Card`/`CardHeader`/`CardContent`/`CardFooter` are the right shell for a STANDALONE floating chat widget (which is what shadcn's own demo is — an embeddable, self-contained card). ThumbGen's chat panel is a fixed-width `<aside>` sidebar with its OWN header (`ChatPanel.tsx`'s existing `<header>` with the "Agent/Brainstorm" title) and its own top/bottom borders already matching Atelier Nocturne's line tokens — wrapping that in `Card` would nest two nearly-identical header/border systems and fight the existing panel chrome for no visual gain. `Card` is not used in this plan; if a future panel design genuinely becomes a floating/detachable widget, this decision should be revisited then, not forced now.

- [ ] **Step 1: Rewrite**

```tsx
"use client";
import { MessageScrollerProvider, MessageScroller, MessageScrollerViewport, MessageScrollerContent, MessageScrollerItem, MessageScrollerButton } from "@/components/ui/message-scroller";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import Message from "./Message";
import type { UIMessage } from "ai";

export default function MessageList({ messages }: { messages: UIMessage[] }) {
  if (messages.length === 0) {
    return (
      <Empty className="flex-1 border-none">
        <EmptyHeader>
          <EmptyTitle
            className="italic"
            style={{
              color: "var(--text-secondary)",
              fontFamily: "var(--font-display), 'Fraunces', serif",
              fontSize: 28,
              fontWeight: 400,
              letterSpacing: "-0.015em",
              lineHeight: 1.15,
            }}
          >
            on commence <br />par quoi ?
          </EmptyTitle>
          <EmptyDescription
            className="text-[11px] mt-1"
            style={{
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            Texte · Image · Vocal
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <MessageScrollerProvider>
      <MessageScroller className="flex-1" style={{ borderTop: "1px solid var(--line-faint)" }}>
        <MessageScrollerViewport>
          <MessageScrollerContent>
            {messages.map((m) => (
              <MessageScrollerItem key={m.id} scrollAnchor={m.role === "user"}>
                <Message message={m} />
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
```

Note: `MessageScroller` handles auto-scroll internally — do not port the old manual `ref.current.scrollTo(...)` effect over, it's redundant with (and would fight) this component's own behavior.

`EmptyMedia`/`EmptyContent` (also exported by `empty.tsx`) aren't used here — this empty state has no icon and no action buttons, matching the CURRENT app's minimal look exactly; don't add them just because they exist, that would be new UI the app doesn't have today.

- [ ] **Step 2: Update `ChatPanel.tsx`'s call site** — pass `messages` (i.e. `chatMessages`, the real `UIMessage[]` from `useChat`) to `MessageList` instead of the legacy-adapted array. Delete `legacyLiveMessages`, `uiMessageToLegacyDisplayMessage`, the `messages: DisplayMessage[]` combine `useMemo`, and the now-dangling `import type { DisplayMessage, MessageBlock } from "./chat/Message"` (Task 6 removed those exports) — all now-dead code once `MessageList` consumes `chatMessages` directly. **Do NOT touch** `legacyEvents`/`uiMessageToLegacyEvents`/`legacyStreaming`/the `conversation_renamed` effect/`pendingUiRequest` — those are still consumed by the untouched `Composer` (`streaming` prop, Task 7's job) and `PendingUiAction` (Task 11's job) call sites and must survive until those tasks land. Add the `error`-`Alert` wiring from this task's header note here.

- [ ] **Step 3: Typecheck, then verify in browser**

```bash
npx tsc --noEmit
```

Since Task 6 already landed (dispatched before this task in the plan's actual dependency order — see Global Constraints), this should bring the repo to a FULLY clean typecheck (0 errors) — confirm this explicitly, don't just confirm "no new errors."

Start the dev server (`THUMBGEN_AGENT_V2=1`), open the chat panel with an empty conversation: confirm the French empty-state copy renders identically to before, centered, same fonts, no stray icon/border box around it (the `border-none` override above matters — `Empty`'s default has a dashed border, which doesn't match this app's existing borderless empty state). Then open a conversation with real history and confirm messages now render correctly through the real `Message`/`Bubble` components (Task 6's work, now finally exercised live). Also verify the error path: trigger a real error (e.g. temporarily clear the OpenRouter API key setting, send a message, confirm the `Alert` appears with a sensible message instead of the turn silently failing), then restore the setting.

- [ ] **Step 4: Commit**

```bash
git add src/components/panels/chat/MessageList.tsx src/components/panels/ChatPanel.tsx
git commit -m "feat(chat): MessageList on shadcn MessageScroller + Empty, wire real UIMessage[] + error Alert into ChatPanel"
```

---

### Task 6: `Message.tsx` → shadcn `Message`/`Bubble`, keep the existing markdown renderer

**Files:**
- Modify: `src/components/panels/chat/Message.tsx`

**Interfaces:**
- Consumes: `Message`/`MessageContent` (`@/components/ui/message`), `Bubble`/`BubbleContent` (`.../bubble`) — both Task 1 — `UIMessage` (Task 3), `openAnnotate` (`chat-store`, unchanged).
- Produces: renders `ToolCallCard` (Task 9) for tool parts.

**Structure mirrors [the reference chatbot](https://github.com/shadcn-ui/chatbot-template)'s `chat-message.tsx` exactly** (read in full during this plan's exploration): user messages get `Message align="end"` wrapping a `Bubble` (a real chat bubble — the visual container); assistant messages get `Message align="start"` with NO bubble, parts rendered directly — this is precisely ThumbGen's own current distinction too (`Message.tsx`'s existing comment: "User messages get a soft magenta-tinted background... assistant messages: no background"). Use `Bubble`'s `variant="tinted"` (a `--primary`-derived oklch tint, confirmed reading `bubble.tsx`'s `bubbleVariants`) rather than the reference's `variant="muted"` (gray) — once Task 1 remaps `--primary` to `var(--brand)`, `tinted` reproduces the exact "soft magenta tint" look the current app already has, where the reference's own `muted` would not.

**Deliberate design decision — do NOT use `Streamdown` (AI Elements'/shadcn's newer markdown renderer) for text rendering.** Confirmed reading the reference's own `components/parts/text-part.tsx`: even shadcn's own official chatbot template uses plain `ReactMarkdown` + `remarkGfm` for text parts, not `Streamdown` — this is not a compromise, it's the same choice the reference itself makes. Keep this app's EXISTING `ReactMarkdown` setup verbatim (image-click-to-annotate, code-block styling, external-link handling), just move it inside the new `MessageContent` shell instead of a bare `<div>`.

- [ ] **Step 1: Rewrite, preserving the exact existing ReactMarkdown block**

```tsx
"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Message as MessageRow, MessageContent } from "@/components/ui/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import ToolCallCard from "./ToolCallCard";
import { useChatStore } from "@/store/chat-store";
import type { UIMessage } from "ai";

function TextMarkdown({ text, openAnnotate }: { text: string; openAnnotate: (url: string) => void }) {
  return (
    <div className="text-sm break-words chat-md" style={{ color: "var(--text-primary)", lineHeight: 1.55 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand)", textDecoration: "underline", textUnderlineOffset: 2 }}>
              {children}
            </a>
          ),
          code: ({ children, ...props }) => {
            const isInline = !(props as { node?: { position?: { start: { line: number }; end: { line: number } } } }).node?.position
              || (props as { node: { position: { start: { line: number }; end: { line: number } } } }).node.position.start.line
              === (props as { node: { position: { start: { line: number }; end: { line: number } } } }).node.position.end.line;
            return (
              <code style={{
                background: "var(--ink-3)", padding: isInline ? "1px 5px" : "10px 12px",
                borderRadius: isInline ? 4 : 8, fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
                fontSize: isInline ? 12 : 11, display: isInline ? "inline" : "block",
                border: "1px solid var(--line-faint)", color: "var(--text-secondary)", overflowX: isInline ? "visible" : "auto",
              }}>
                {children}
              </code>
            );
          },
          img: ({ src, alt }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={typeof src === "string" ? src : ""} alt={alt ?? ""} onClick={() => typeof src === "string" && openAnnotate(src)}
              loading="lazy" style={{ maxWidth: "100%", borderRadius: 8, margin: "8px 0", cursor: "zoom-in", border: "1px solid var(--line-faint)" }} />
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export default function Message({ message }: { message: UIMessage }) {
  const openAnnotate = useChatStore((s) => s.openAnnotate);
  const isUser = message.role === "user";

  if (isUser) {
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
                      className="max-w-[240px] rounded my-1" style={{ border: "1px solid var(--line)", cursor: "zoom-in" }} />
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

  return (
    <MessageRow align="start">
      <MessageContent>
        {message.parts.map((part, i) => {
          if (part.type === "text") return <TextMarkdown key={i} text={part.text} openAnnotate={openAnnotate} />;
          if (part.type.startsWith("tool-")) {
            return <ToolCallCard key={i} part={part as Extract<UIMessage["parts"][number], { type: `tool-${string}` }>} />;
          }
          if (part.type === "reasoning") {
            // Task 12 replaces this branch with the real Reasoning/ReasoningTrigger/ReasoningContent wiring.
            return null;
          }
          return null;
        })}
      </MessageContent>
    </MessageRow>
  );
}
```

- [ ] **Step 2: Check whether `LibraryPickerModal.tsx`/`ImageAnnotateModal.tsx` need changes**

Read `src/components/panels/chat/ImageAnnotateModal.tsx` (referenced here via `openAnnotate`). Confirm it's triggered purely via `chat-store`'s `annotateImageUrl`/`closeAnnotate` (local UI state) with no dependency on `MessageBlock`/`ChatEvent`/old message shapes. If confirmed decoupled as expected, no changes needed to that file. If it turns out coupled to something this plan is changing, STOP and report — that contradicts this plan's Global Constraints assumption and needs a ruling before continuing.

- [ ] **Step 3: Typecheck, then verify in browser**

```bash
npx tsc --noEmit
```

Send a real message (`THUMBGEN_AGENT_V2=1`), confirm: markdown renders identically to before (headings, bold, links open in new tab, code blocks styled, images clickable to open the annotate modal), user vs. assistant messages are visually distinguishable (AI Elements' `is-user`/`is-assistant` classes — confirm the magenta-tinted look is preserved or intentionally adapted, not just accidentally lost).

- [ ] **Step 4: Commit**

```bash
git add src/components/panels/chat/Message.tsx
git commit -m "feat(chat): Message on AI Elements Message/MessageContent, keep existing markdown renderer"
```

---

### Task 7: `Composer.tsx` → raw shadcn `InputGroup`, keep `AttachButton`/`MicButton` and the existing Enter-to-submit logic

**Files:**
- Modify: `src/components/panels/chat/Composer.tsx`

**Interfaces:**
- Consumes: `InputGroup`/`InputGroupAddon`/`InputGroupButton`/`InputGroupTextarea` (`@/components/ui/input-group`, Task 1), `sendMessage`/`status`/`stop` (Task 3's `useChat`), existing `AttachButton`/`MicButton` (unchanged), `chat-store`'s `draft`/`attachments`/`removeAttachment` (unchanged).

**Composed exactly like the reference chatbot's `components/prompt-form.tsx`** (read in full during this plan's exploration): a raw `InputGroup` wrapping `InputGroupTextarea` plus an `InputGroupAddon align="block-end"` holding the action buttons — no AI-Elements `PromptInput` wrapper. Global Constraints already drops `prompt-input` from the install list (Task 1) in favor of this composition, so this task's code must not import it.

**Deliberate design decision — keep this app's own hand-written Enter-to-submit `onKeyDown`, not AI Elements'.** The reference's `PromptForm` also hand-writes its own `onKeyDown` (`Enter` submits, `Shift+Enter` inserts a newline) directly on the raw `<textarea>`/`InputGroupTextarea` — there is no bundled behavior to inherit here, since `InputGroup` is a layout primitive with no submit logic of its own. Port the existing `Composer.tsx` handler (`src/components/panels/chat/Composer.tsx:62-67`) verbatim.

**Deliberate design decision — keep `AttachButton`'s own upload flow.** `AttachButton.tsx` already uploads via `POST /api/chat-uploads` and stores a `stored:<id>` reference STRING in `chat-store`'s `attachments` array (confirmed reading `AttachButton.tsx` during Plan 1's exploration) — nothing here changes, it just moves into an `InputGroupAddon`.

- [ ] **Step 1: Rewrite**

```tsx
"use client";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { useChatStore } from "@/store/chat-store";
import MicButton from "./MicButton";
import AttachButton from "./AttachButton";
import type { ChatStatus } from "ai";

export default function Composer({
  onSend,
  status,
  onStop,
}: {
  onSend: () => void;
  status: ChatStatus;
  onStop: () => void;
}) {
  const draft = useChatStore((s) => s.draft);
  const setDraft = useChatStore((s) => s.setDraft);
  const attachments = useChatStore((s) => s.attachments);
  const removeAttachment = useChatStore((s) => s.removeAttachment);

  const streaming = status === "streaming" || status === "submitted";
  const canSend = (draft.trim().length > 0 || attachments.length > 0) && !streaming;

  return (
    <div className="px-3 py-3 space-y-2" style={{ borderTop: "1px solid var(--line-faint)" }}>
      {attachments.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 nopan nodrag">
          {attachments.map((a) => (
            <div key={a.source} className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.preview_url} alt="attachment" className="h-12 w-12 object-cover rounded" style={{ border: "1px solid var(--line)" }} />
              <button onClick={() => removeAttachment(a.source)} className="absolute -top-1 -right-1 rounded-full w-3.5 h-3.5 text-[8px] leading-none flex items-center justify-center transition-colors" style={{ background: "var(--ember)", color: "var(--ink-1)" }} aria-label="Retirer">×</button>
            </div>
          ))}
        </div>
      )}

      <InputGroup className="rounded-xl" style={{ background: "var(--ink-3)", borderColor: "var(--line)" }}>
        <InputGroupTextarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Décris ta miniature, ou enregistre un vocal…"
          style={{ color: "var(--text-primary)", minHeight: "32px", maxHeight: "160px" }}
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && canSend) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        <InputGroupAddon align="block-end">
          <MicButton onTranscribed={(t) => setDraft(draft ? `${draft} ${t}` : t)} />
          <AttachButton />
          {streaming ? (
            <InputGroupButton onClick={onStop} title="Arrêter" aria-label="Arrêter" style={{ color: "var(--ember)" }} className="ml-auto">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
            </InputGroupButton>
          ) : (
            <InputGroupButton
              onClick={onSend}
              disabled={!canSend}
              title="Envoyer"
              aria-label="Envoyer"
              className="ml-auto"
              style={{ color: canSend ? "var(--ink-1)" : "var(--text-tertiary)", background: canSend ? "var(--bone)" : "transparent" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
```

- [ ] **Step 2: Update `ChatPanel.tsx`'s call site** — pass `status` (from `useChat`) instead of the old `streaming: boolean`, and `onSend`/`onStop` wired to `sendMessage`/`stop`.

- [ ] **Step 3: Typecheck, then verify in browser**

```bash
npx tsc --noEmit
```

Confirm: attachments strip still works (add via AttachButton, shows thumbnail, × removes it), mic button still transcribes into the draft, Enter sends / Shift+Enter makes a newline, Stop button appears and works mid-stream, Send button disables correctly when empty.

- [ ] **Step 4: Commit**

```bash
git add src/components/panels/chat/Composer.tsx src/components/panels/ChatPanel.tsx
git commit -m "feat(chat): Composer on raw shadcn InputGroup, keep AttachButton/MicButton and Enter-to-submit as-is"
```

---

### Task 8: `AgentActivity.tsx` — rebuild from `useChat`'s `status` + last message

**Files:**
- Modify: `src/components/panels/chat/AgentActivity.tsx`

**Interfaces:**
- Consumes: `status: ChatStatus` and the last `UIMessage` (Task 3's `useChat`), `src/lib/agent/tool-labels.ts` (Task 9 — if Task 9 hasn't landed yet when this task runs, inline a temporary local copy of the label map and switch to the shared one when Task 9 lands; note this explicitly in the report rather than silently duplicating a table long-term).

The old `deriveActivity` (event-log reverse-scan across `ui_tool_request`/`tool_call`/`tool_result`/`text_delta` events) has no direct equivalent in `useChat`'s API — it operated on this app's OWN flat SSE event log, which no longer exists. Rebuild the same 4 visible states (idle/hidden, thinking, writing, using-tool-X) from what IS available: `status` plus the CURRENT (last) message's `parts` array.

- [ ] **Step 1: Rewrite**

```tsx
"use client";
import { useMemo } from "react";
import type { UIMessage, ChatStatus } from "ai";
import { TOOL_LABELS } from "@/lib/agent/tool-labels"; // Task 9 — see note above if Task 9 hasn't landed

type Activity = { kind: "thinking" } | { kind: "writing" } | { kind: "tool"; name: string; label: string } | { kind: "idle" };

function deriveActivity(status: ChatStatus, lastMessage: UIMessage | undefined): Activity {
  if (status !== "streaming" && status !== "submitted") return { kind: "idle" };
  if (!lastMessage || lastMessage.role !== "assistant") return { kind: "thinking" };

  const lastPart = lastMessage.parts.at(-1);
  if (!lastPart) return { kind: "thinking" };

  if (lastPart.type.startsWith("tool-")) {
    const state = (lastPart as { state?: string }).state;
    if (state !== "output-available" && state !== "output-error") {
      const name = lastPart.type.slice("tool-".length);
      return { kind: "tool", name, label: TOOL_LABELS[name] ?? name };
    }
  }
  if (lastPart.type === "text") return { kind: "writing" };
  return { kind: "thinking" };
}

export default function AgentActivity({ status, lastMessage }: { status: ChatStatus; lastMessage: UIMessage | undefined }) {
  const activity = useMemo(() => deriveActivity(status, lastMessage), [status, lastMessage]);
  if (activity.kind === "idle") return null;

  let toolName: string | null = null;
  let label: string;
  switch (activity.kind) {
    case "thinking": label = "réfléchit"; break;
    case "writing": label = "écrit"; break;
    case "tool": toolName = activity.name; label = activity.label; break;
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2" style={{ borderTop: "1px solid var(--line-faint)", background: "var(--ink-3)" }}>
      <span className="block w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: "var(--brand)" }} />
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span className="text-[9px] uppercase shrink-0" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono), 'JetBrains Mono', monospace", letterSpacing: "0.22em" }}>Assistant</span>
        {toolName && (
          <span className="text-[9px] uppercase shrink-0" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono), 'JetBrains Mono', monospace", letterSpacing: "0.18em" }}>· {toolName}</span>
        )}
        <span className="italic truncate" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-display), 'Fraunces', serif", fontSize: 13, letterSpacing: "-0.01em" }}>{label}…</span>
      </div>
    </div>
  );
}
```

Note: the old "waiting_user" state (an unresolved `ui_tool_request`) is intentionally dropped here — `PendingUiAction` (Task 11) rendering IS the waiting-for-user signal now (it appears/disappears based on `useChat`'s own pending-tool-call detection), so a duplicate status strip for the same condition would be redundant, not lost functionality.

- [ ] **Step 2: Update `ChatPanel.tsx`'s call site** — pass `status` and `messages.at(-1)` instead of `events`/`streaming`.

- [ ] **Step 3: Typecheck, then verify in browser**

```bash
npx tsc --noEmit
```

Send a message that triggers at least one tool call (e.g. ask about logos). Confirm the activity strip shows "réfléchit…" then "· list_logos lecture de la bibliothèque · logos…" (or whatever Task 9's label says) then "écrit…" as the turn progresses, matching the old component's visible behavior.

- [ ] **Step 4: Commit**

```bash
git add src/components/panels/chat/AgentActivity.tsx src/components/panels/ChatPanel.tsx
git commit -m "feat(chat): rebuild AgentActivity from useChat status + last message parts"
```

---

### Task 9: Unified tool labels + `ToolCallCard.tsx` → part-type dispatcher (no generic `Tool` shell)

**Files:**
- Create: `src/lib/agent/tool-labels.ts`, `src/components/panels/chat/tool-renderers/SimpleToolPart.tsx`
- Modify: `src/components/panels/chat/ToolCallCard.tsx`, `src/components/panels/chat/AgentActivity.tsx` (switch its temporary local copy, if any, to the shared file)

**Deliberate design decision — no AI-Elements `Tool`/`ToolHeader`/`ToolContent`/`ToolOutput` shell.** Confirmed reading the reference's `components/chat-message.tsx`: it has no generic collapsible tool wrapper at all — a `switch(part.type)` dispatches straight to one dedicated component per tool (`components/parts/*.tsx`), and its only "plain" tool (`web_search`) renders as a bare one-line status text (`web-search-part.tsx`), not a bordered/collapsible card. ThumbGen has ~15 tools against the reference's 3, so a single dedicated file per tool would be mostly-duplicated boilerplate — `SimpleToolPart.tsx` is the reasoned scale adaptation: ONE shared component, parameterized by tool name and label, reused for every plain list/get/apply tool, matching `WebSearchPart`'s actual rendering (a 3-state status line) rather than reintroducing a generic wrapper the reference deliberately doesn't have.

**Interfaces:**
- Consumes: `listTools()` from `@/lib/agent/tools` (the real registry, unchanged) — used only to WRITE this file correctly, not imported at runtime by it (the label map is static; deriving it from the registry at build time would need a script, which is more machinery than a 14-entry map justifies — YAGNI).
- Produces: `TOOL_LABELS: Record<string, string>`, consumed by Task 8 (already) and this task's `ToolCallCard.tsx`.

- [ ] **Step 1: Get the authoritative tool name list**

```bash
unset -f node npm npx 2>/dev/null
npx vitest run tests/agent/registry-full.test.ts --reporter=verbose 2>&1 | head -5
grep -A20 "const expected" tests/agent/registry-full.test.ts
```

Cross-reference against `src/lib/agent/tools/all.ts`'s imports (the real source of truth). Write `TOOL_LABELS` with EXACTLY these names, dropping the phantom entries both old tables carried (`web_search`, `trigger_generation`, `get_node_details`, `remix_image`, `edit_image` — none are registered tools) and adding the ones both old tables were missing (`list_personas`, `import_youtube_thumbnail`).

```typescript
// src/lib/agent/tool-labels.ts
/**
 * Single source of truth for tool display labels — replaces the two
 * independently-drifted FRIENDLY_NAMES tables that used to live in
 * ToolCallCard.tsx and AgentActivity.tsx (both referenced tools that were
 * never registered, and both were missing tools that were).
 */
export const TOOL_LABELS: Record<string, string> = {
  list_logos: "bibliothèque · logos",
  list_face_reactions: "bibliothèque · visages",
  list_personas: "bibliothèque · personnages",
  list_swipe_files: "bibliothèque · références",
  list_projects: "liste projets",
  list_past_generations: "générations passées",
  get_canvas_state: "lecture canvas",
  apply_workflow: "workflow appliqué",
  generate_sketch: "croquis",
  extract_youtube_script: "transcript YouTube",
  search_youtube: "recherche YouTube",
  search_youtube_channel: "recherche dans la chaîne",
  get_channel_videos: "vidéos de la chaîne",
  import_youtube_thumbnail: "import miniature YouTube",
  request_user_image: "demande image",
};
```

(`request_user_image` is a client tool, not in the server registry — kept because it's a real tool name that appears in message parts, per Plan 1 Task 4.)

- [ ] **Step 2: `SimpleToolPart.tsx` — the shared one-liner, mirroring `WebSearchPart`'s 3-state pattern**

```tsx
// src/components/panels/chat/tool-renderers/SimpleToolPart.tsx
"use client";
import type { UIMessage } from "ai";

type ToolPart = Extract<UIMessage["parts"][number], { type: `tool-${string}` }>;

export default function SimpleToolPart({ part, label }: { part: ToolPart; label: string }) {
  const state = part.state;

  return (
    <div className="flex items-center gap-1.5 text-xs py-1" style={{ color: "var(--text-tertiary)" }}>
      {(state === "input-streaming" || state === "input-available") && (
        <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
          <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
        </svg>
      )}
      {state === "output-error" ? (
        <span style={{ color: "var(--ember)" }}>{label} · erreur{"errorText" in part && part.errorText ? ` — ${part.errorText}` : ""}</span>
      ) : (
        <span>{label}{state === "output-available" ? "" : "…"}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `ToolCallCard.tsx` as a `switch`-style dispatcher, no generic wrapper**

```tsx
"use client";
import { TOOL_LABELS } from "@/lib/agent/tool-labels";
import SimpleToolPart from "./tool-renderers/SimpleToolPart";
import SearchYoutubeGallery from "./tool-renderers/SearchYoutubeGallery";
import GeneratedImagePreview from "./tool-renderers/GeneratedImagePreview";
import type { UIMessage } from "ai";

type ToolPart = Extract<UIMessage["parts"][number], { type: `tool-${string}` }>;

const CUSTOM_RENDERERS: Record<string, (part: ToolPart) => React.ReactNode> = {
  search_youtube: (part) => <SearchYoutubeGallery part={part} />,
  generate_sketch: (part) => <GeneratedImagePreview part={part} />,
  import_youtube_thumbnail: (part) => <GeneratedImagePreview part={part} />,
};

export default function ToolCallCard({ part }: { part: ToolPart }) {
  const toolName = part.type.slice("tool-".length);
  const label = TOOL_LABELS[toolName] ?? toolName;
  const custom = CUSTOM_RENDERERS[toolName];

  if (custom && part.state === "output-available") return <>{custom(part)}</>;
  return <SimpleToolPart part={part} label={label} />;
}
```

Note: unlike the earlier AI-Elements-`Tool` draft, a custom renderer only takes over once `output-available` — while the call is still pending (`input-streaming`/`input-available`) or has failed (`output-error`), `SimpleToolPart` handles it uniformly, matching the reference's `AskUserPart` (which "only renders when `part.state === 'output-available'`", per this plan's exploration) rather than trying to make every custom renderer handle every state itself.

- [ ] **Step 4: Update `Message.tsx`'s call site** (Task 6) — it already renders `<ToolCallCard part={...} />` per the code in Task 6; confirm the prop name matches exactly (`part`, not the old `name`/`status`/`summary`/`input`/`images` props — this is a full prop-shape change, not a rename).

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

(Full visual verification happens after Task 10 adds the custom renderers this task references — `ToolCallCard.tsx` won't render correctly standalone until then. That's expected; don't chase a visual gap here that Task 10 closes.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/tool-labels.ts src/components/panels/chat/ToolCallCard.tsx src/components/panels/chat/tool-renderers/SimpleToolPart.tsx src/components/panels/chat/AgentActivity.tsx
git commit -m "feat(chat): unify tool labels, rebuild ToolCallCard as a part-type dispatcher (no generic Tool shell)"
```

---

### Task 10: Custom tool-result renderers (search gallery, sketch/thumbnail preview + apply-to-canvas)

**Files:**
- Create: `src/components/panels/chat/tool-renderers/SearchYoutubeGallery.tsx`, `src/components/panels/chat/tool-renderers/GeneratedImagePreview.tsx`

**Interfaces:**
- Consumes: `useCanvasStore`, `useChatStore` (existing), `part.output`. **Correction (found during this task's real execution, disproving the plan's earlier assumption): `part.output` carries TWO different real shapes, not one.** LIVE (a tool that just resolved this session) carries the tool handler's raw return value — `{content: ToolContent[]}` per `src/lib/agent/tools/types.ts`, image entries as `{type:"image", mimeType, data}` — confirmed by tracing `node_modules/ai`'s tool-part update path, which enqueues `execute()`'s return value onto the UI stream's `output` field untransformed. RELOADED (page refresh, history restored via Task 4's `rowsToUIMessages`) carries whatever `tool-adapter.ts`'s `toModelOutput` built — `{type:"content", value: ContentPart[]}`, image entries as `{type:"file", mediaType, data}` — because persistence captures `responseMessages` (AI SDK's own model-facing record of the turn), which is inherently the `toModelOutput`-shaped form, not the raw handler output; Plan 1's original comment ("only reshapes what the MODEL sees, not what's stored in `output`") turns out not to hold once a turn round-trips through persistence. Confirmed against a real `search_youtube` row in `data/thumbgen.db` (id `290773ef-4f32-4d33-8b42-45f75c7ee4e7`). **Both components must normalize both shapes** — a `normalizeToolContent`-style helper, not a single-shape assumption. Deliberately plain `<img>`, not AI Elements' `image` component — dropped from the install list (Global Constraints), never needed since neither renderer does anything an `<img>` tag doesn't already do here.
- Produces: the React node returned directly by Task 9's `ToolCallCard` dispatcher once `part.state === "output-available"` (no `ToolOutput` wrapper — Task 9 no longer uses one). Task 9's `SimpleToolPart` (the shared one-liner for plain tools) is unaffected by this shape split — it never inspects `output`'s content, only `state`/`errorText`.

**This is the highest-value visual work in this plan** — `search_youtube` returns up to 6 image+caption pairs (confirmed reading the real tool source during Plan 1: `search-youtube.ts`'s `content` array interleaves `{type:"text", text: "[i] title — channel"}` then `{type:"image",...}` per thumbnail), and `generate_sketch`'s existing `ToolCallCard.tsx` implementation (being replaced) has a real, working "apply this sketch to the canvas" button per thumbnail (`POST /api/agent/apply-sketch`) that must not be lost.

- [ ] **Step 1: `SearchYoutubeGallery.tsx`** — walk the interleaved text/image content array, pairing each image with its immediately-preceding caption (recovering the pairing that Plan 1's `route-handler.ts`/persistence keeps intact end to end, unlike v1's old `loop.ts` which flattened it — confirmed by Plan 1's final review as a real, now-fixed gap):

```tsx
"use client";
import { useState } from "react";
import { useChatStore } from "@/store/chat-store";

type ToolContent = { type: "text"; text: string } | { type: "file"; mediaType: string; data: string };

export default function SearchYoutubeGallery({ part }: { part: { output?: unknown } }) {
  const openAnnotate = useChatStore((s) => s.openAnnotate);
  const output = part.output as { content?: ToolContent[] } | undefined;
  const content = output?.content ?? [];

  const pairs: { caption: string; url: string }[] = [];
  let pendingCaption = "";
  for (const c of content) {
    if (c.type === "text") pendingCaption = c.text;
    else if (c.type === "file" && c.mediaType?.startsWith("image/")) {
      pairs.push({ caption: pendingCaption, url: `data:${c.mediaType};base64,${c.data}` });
      pendingCaption = "";
    }
  }

  if (pairs.length === 0) return <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Aucune miniature.</p>;

  return (
    <div className="grid grid-cols-2 gap-2">
      {pairs.map((p, i) => (
        <button key={i} type="button" onClick={() => openAnnotate(p.url)} className="text-left rounded-md overflow-hidden" style={{ border: "1px solid var(--line)", background: "var(--ink-3)", cursor: "zoom-in" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.url} alt={p.caption} loading="lazy" className="w-full aspect-video object-cover" />
          <p className="text-[10px] p-1.5 line-clamp-2" style={{ color: "var(--text-tertiary)" }}>{p.caption}</p>
        </button>
      ))}
    </div>
  );
}
```

Verify the exact shape `part.output`'s `content[].type` field uses for images (`ToolContent` in Plan 1's `tools/types.ts` uses `{type:"file", mediaType, data}` per Task 3/9's already-established convention — NOT `{type:"image", mimeType, data}`, the OLD v1 shape) before trusting the type above; re-check `src/lib/agent/tools/types.ts` directly if this doesn't match.

- [ ] **Step 2: `GeneratedImagePreview.tsx`** — port the apply-to-canvas behavior verbatim from the OLD `ToolCallCard.tsx` (being replaced by Task 9), scoped to a single image instead of a grid, since `generate_sketch`/`import_youtube_thumbnail` each produce one image per call:

```tsx
"use client";
import { useState } from "react";
import { useCanvasStore } from "@/store/canvas-store";
import { useChatStore } from "@/store/chat-store";

type ToolContent = { type: "text"; text: string } | { type: "file"; mediaType: string; data: string };

function extractSketchId(text: string): string | null {
  const m = text.match(/generated:(sk_[a-z0-9]+)/);
  return m ? m[1] : null;
}

export default function GeneratedImagePreview({ part }: { part: { output?: unknown } }) {
  const openAnnotate = useChatStore((s) => s.openAnnotate);
  const projectId = useCanvasStore((s) => s.currentProjectId);
  const loadProject = useCanvasStore((s) => s.loadProject);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  const output = part.output as { content?: ToolContent[] } | undefined;
  const content = output?.content ?? [];
  const textPart = content.find((c): c is Extract<ToolContent, { type: "text" }> => c.type === "text");
  const imagePart = content.find((c): c is Extract<ToolContent, { type: "file" }> => c.type === "file");
  const sketchId = textPart ? extractSketchId(textPart.text) : null;

  if (!imagePart) return null;
  const url = `data:${imagePart.mediaType};base64,${imagePart.data}`;

  const applyToCanvas = async () => {
    if (!sketchId || applied || applying) return;
    setApplying(true);
    try {
      const res = await fetch("/api/agent/apply-sketch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sketch_id: sketchId, project_id: projectId }),
      });
      if (res.ok) {
        setApplied(true);
        await loadProject(projectId);
      }
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="relative rounded-md overflow-hidden" style={{ border: "1px solid var(--line)", maxWidth: 280 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="généré" loading="lazy" onClick={() => openAnnotate(url)} className="w-full aspect-video object-cover" style={{ cursor: "zoom-in" }} />
      {sketchId && (
        <button type="button" onClick={applyToCanvas} disabled={applied || applying}
          className="absolute top-1.5 right-1.5 px-2 py-1 rounded text-[9px] uppercase"
          style={{ background: "rgba(15,15,20,0.85)", color: "var(--bone)", border: "1px solid var(--brand)" }}>
          {applied ? "Ajouté ✓" : applying ? "…" : "+ canvas"}
        </button>
      )}
    </div>
  );
}
```

Cross-check the regex against `generate-sketch.ts`'s actual return text (`` `Sketch generated. Reference: generated:${id} ...` `` per Plan 1's exploration) before trusting the exact pattern above.

- [ ] **Step 2b: Verify `/api/agent/apply-sketch`'s real request/response shape**

```bash
grep -n "sketch_id\|project_id" src/app/api/agent/apply-sketch/route.ts
```

Confirm the field names match what `GeneratedImagePreview.tsx` sends — this endpoint is unchanged by this plan, but its exact contract wasn't re-verified during this plan's own exploration (only inferred from the OLD `ToolCallCard.tsx`'s fetch call).

- [ ] **Step 3: Typecheck, then full visual verification of Task 9+10 together**

```bash
npx tsc --noEmit
```

`THUMBGEN_AGENT_V2=1` dev server: ask the agent to search YouTube for something — confirm a 2-column thumbnail grid appears with captions, click one to confirm the annotate modal opens. Ask it to generate a sketch — confirm the single-image preview appears with a working "+ canvas" button that actually adds the node when clicked (verify on the canvas itself, not just that the button changes state).

- [ ] **Step 4: Commit**

```bash
git add src/components/panels/chat/tool-renderers
git commit -m "feat(chat): custom tool-result renderers — search gallery + sketch/thumbnail preview with apply-to-canvas"
```

---

### Task 11: `PendingUiAction.tsx` → `addToolOutput` wiring

**Files:**
- Modify: `src/components/panels/chat/PendingUiAction.tsx`, `src/components/panels/ChatPanel.tsx`, `src/lib/agent/v2/route-handler.ts`

**Interfaces:**
- Consumes: `addToolOutput` (Task 3's `useChat`, exact name confirmed against real v4 types in Task 3 Step 1), the last message's pending tool part (a `tool-request_user_image` or `tool-request_user_sketch` part whose `state` is NOT yet `output-available`).

**Two real defects verified during Task 3's review, both parked for this task specifically because it's the correct owner (not fixed as throwaway patches to scaffolding code that Task 3's own temporary adapter — deleted by this task — would have needed anyway):**
1. `addToolOutput` triggers `sendAutomaticallyWhen`'s auto-continuation through the SAME `DefaultChatTransport` as a normal send — which means it needs the SAME `body` (`conversation_id`/`project_id`/`canvas_snapshot`) or `route-handler.ts`'s own guard (`if (!body?.conversation_id || !body?.project_id) return 400`) rejects it. Confirmed by tracing `node_modules/ai/dist/index.js`'s real `addToolOutput`→auto-continuation call path during Task 3's review — a call with no `options.body` silently 400s every time. Step 2 below has the corrected call shape; do not drop the `options` argument.
2. Once (1) is fixed, an auto-continuation's request has `messages.at(-1)` be the ASSISTANT's own message (whose tool part just got resolved), not a new user turn — `route-handler.ts`'s text/attachment extraction (fixed in Task 3 for the NORMAL send path) must not treat this as a new user message to persist. Step 2b below guards this.

The old component resolved via `onResolve(toolUseId, result) → POST /api/agent/chat/tool-result`. This whole round trip is deleted by Plan 1's Task 4 (the client-tool pattern correlates by `toolCallId` directly through `addToolOutput`, no separate endpoint). Preserve BOTH branches of the existing component — `request_user_image` (upload/library/skip) AND `request_user_sketch` (the sketch-editor-via-sentinel-canvas-node flow) — confirmed during this plan's exploration to be real, complete, working code today, even though the Plan-1 backend doesn't currently offer `request_user_sketch` to the model (excluded from `V2_CLIENT_TOOLS`, matching v1's identical exclusion) — this task modernizes the resolution mechanism without re-opening that separate, already-made decision.

**No dedicated resolved-state component (deliberately, not an oversight).** The reference's `AskUserPart` renders a richer resolved view once `state === "output-available"`; ThumbGen's OLD `PendingUiAction.tsx` (read above) has no resolved-state rendering at all — once answered, the request simply stops being the "last pending part" and disappears from view. Once this task's `addToolOutput` resolves the part, it falls through to Task 9's `ToolCallCard` dispatcher like any other tool, which (no custom renderer registered for `request_user_image`/`request_user_sketch`) renders `SimpleToolPart`'s generic one-liner ("demande image" / whichever label). That is a strict improvement over v1's total silence, achieved with zero new files — adding a dedicated `AskUserImagePart.tsx` here would be a new feature beyond this plan's parity scope, not a gap to close.

- [ ] **Step 1: Find the pending tool part**

In `ChatPanel.tsx`, derive the request from the last message (replacing the old `events`-array scan):

```tsx
const lastMessage = messages.at(-1);
const pendingToolPart = lastMessage?.role === "assistant"
  ? lastMessage.parts.find(
      (p): p is Extract<UIMessage["parts"][number], { type: "tool-request_user_image" | "tool-request_user_sketch" } & { state: string }> =>
        (p.type === "tool-request_user_image" || p.type === "tool-request_user_sketch") && p.state !== "output-available",
    )
  : undefined;
```

- [ ] **Step 2: Rewrite `PendingUiAction.tsx`'s resolution calls**

Replace every `onResolve(request.id, result)` call site with:

```tsx
addToolOutput({
  tool: <toolName>,
  toolCallId: <part.toolCallId>,
  output: result,
  options: {
    body: {
      conversation_id: activeConversationId,
      project_id: projectId,
      canvas_snapshot: snapshotCanvas(nodes, edges),
    },
  },
});
```

The `options.body` is NOT optional — omitting it is a verified real bug (see this task's header note #1): the auto-continuation this triggers goes through the same transport as a normal send and needs the same `body` or `route-handler.ts` 400s it. `conversation_id`/`project_id`/`canvas_snapshot` come from the same sources `onSend`'s call already uses (`ChatPanel.tsx`, Task 3) — thread them down to wherever this call site actually lives (`PendingUiAction.tsx` if the call stays there, or `ChatPanel.tsx`'s `respondToUiTool`-equivalent if it's cleaner to keep it there, matching Task 3's existing pattern). Verify the exact parameter shape (`tool`/`toolCallId`/`output`/`options.body`) against what Task 3 Step 1 already confirmed — don't re-derive it, reuse that finding, but DO re-confirm `options.body` specifically since Task 3's own first attempt at this call omitted it. Everything else in the component (the upload/library/skip UI for `request_user_image`, the sentinel-canvas-node sketch-editor flow for `request_user_sketch`) stays as-is — only the resolution call site changes.

- [ ] **Step 2b: Guard `route-handler.ts` against a tool-continuation's last message being non-user**

Task 3 fixed `route-handler.ts` to extract the new user turn's text/attachments from `body.messages.at(-1)`, assuming that's always a fresh user message — true for a normal send, false for the auto-continuation this task wires up (there, `messages.at(-1)` is the ASSISTANT message whose tool part just got resolved; no new user turn exists). Guard the extraction:

```ts
const lastMessage = body.messages?.at(-1);
const isNewUserTurn = lastMessage?.role === "user";
// ...only build/append userParts and the new user DB row when isNewUserTurn.
// When it's not (a tool-continuation), skip straight to building `priorMessages`
// from the DB (which already includes the assistant's tool-call row and will
// include its resolved tool-result once this task's addToolOutput path persists
// it) and call streamText with no new user message appended.
```

Read the current state of `route-handler.ts`'s extraction block (Task 3 left it around lines 55-72) before writing this — confirm the exact variable names in place now rather than assuming they still match this snippet verbatim.

- [ ] **Step 3: Update `ChatPanel.tsx`'s render** — pass `pendingToolPart` (or `null`) instead of the old `pendingUiRequest`; the component's `request.name`/`request.input`/`request.id` usages become `pendingToolPart.type` (strip the `tool-` prefix)/`pendingToolPart.input`/`pendingToolPart.toolCallId`.

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Manual verification — this is the ONE feature Plan 1's final review flagged as never actually exercised live (spec §9's "handshake réellement exercé" requirement, still open)**

There is no way to trigger `request_user_image` from a normal chat turn today (the model decides when to call it, and nothing in the system prompt currently prompts it reliably) — so a full live round trip may not be practically triggerable through the UI alone. Do NOT skip verification because of this: as a fallback, add a temporary test-only trigger (e.g. a dev-only button, or a direct `addToolOutput` call from the browser console against a manually-constructed pending part) to exercise the modal's upload/skip/library paths and confirm `addToolOutput` actually resumes the turn instead of hanging. Remove any temporary trigger before committing — it's a verification aid, not a feature.

- [ ] **Step 6: Commit**

```bash
git add src/components/panels/chat/PendingUiAction.tsx src/components/panels/ChatPanel.tsx src/lib/agent/v2/route-handler.ts
git commit -m "feat(chat): PendingUiAction resolves via addToolOutput, preserves both request_user_image and request_user_sketch flows"
```

---

### Task 12: Reasoning display

**Files:**
- Modify: `src/components/panels/chat/Message.tsx` (the `reasoning` branch stubbed out in Task 6)

**Interfaces:**
- Consumes: `Reasoning`/`ReasoningTrigger`/`ReasoningContent` (Task 1), `part.type === "reasoning"` UIMessage parts (present only when `modelInfo.supportsThinking` — Plan 1's `route-handler.ts` already conditionally sets `reasoning: {effort:"medium"}`; nothing in THIS task changes when reasoning is requested, only how it's displayed once present).

- [ ] **Step 1: Wire it in**, replacing Task 6's `return null` for `part.type === "reasoning"`:

```tsx
if (part.type === "reasoning") {
  return (
    <Reasoning key={i} isStreaming={status === "streaming"}>
      <ReasoningTrigger getThinkingMessage={(streaming, duration) =>
        streaming ? "réfléchit…" : duration !== undefined ? `a réfléchi ${duration}s` : "a réfléchi"
      } />
      <ReasoningContent>{part.text}</ReasoningContent>
    </Reasoning>
  );
}
```

`Message.tsx` needs `status` passed down from `ChatPanel.tsx` (it currently only receives `message`) — add it as a prop.

- [ ] **Step 2: Verify `part.text`'s exact field name for a reasoning part** — confirmed by Task 4 Step 1's read of the real `UIMessage`/`UIMessagePart` types; reuse that finding rather than re-deriving it.

- [ ] **Step 3: Typecheck, then verify in browser**

```bash
npx tsc --noEmit
```

Set `agentModel` (Settings) to a thinking-capable model (e.g. `google/gemini-3.8-flash`, `supportsThinking: true` per `models.ts`), send a message that requires some reasoning. Confirm a collapsible "réfléchit…" section appears above the response text, expands to show the reasoning content, and auto-collapses a moment after the turn completes (per `Reasoning`'s built-in `AUTO_CLOSE_DELAY` behavior, confirmed reading the component source).

- [ ] **Step 4: Commit**

```bash
git add src/components/panels/chat/Message.tsx src/components/panels/ChatPanel.tsx
git commit -m "feat(chat): render reasoning parts via AI Elements Reasoning, localized to French"
```

---

### Task 13: Cutover — remove the flag, delete v1

**Files:**
- Modify: `src/app/api/agent/chat/route.ts`
- Delete: `src/lib/agent/loop.ts`, `src/lib/agent/translate.ts`, `src/hooks/useChat.ts`, `src/lib/agent/pending-actions.ts`, `src/app/api/agent/chat/tool-result/` (whole directory), `src/lib/agent/mcp/in-memory-client.ts`, `src/lib/agent/conversation/auto-title.ts`
- **Do NOT delete `src/lib/agent/llm-client.ts`** (corrected from an earlier draft of this task, which missed this — see the note below).
- Delete tests: `tests/agent/chat-sse-skeleton.test.ts` (tests the now-deleted v1 route body + tool-result endpoint), `tests/agent/pending-actions.test.ts`, `tests/agent/browser-tools.test.ts` (tests v1's `BROWSER_TOOL_DEFS`, which nothing imports anymore once `loop.ts` is gone — confirm no other consumer before deleting), `tests/agent/loop.test.ts`, `tests/agent/use-chat.test.ts`, `tests/agent/translate.test.ts`
- Modify (not delete): `tests/agent/mcp-server.test.ts` — remove ONLY its `describe("getInMemoryMcpClient (caching)", ...)` block (tests the deleted `in-memory-client.ts`); its OTHER `describe` block (testing `buildMcpServer` from the surviving `@/lib/agent/mcp/server`) must stay.

**Interfaces:** none — this task only removes code, it doesn't change any remaining file's external contract.

**Correction found during this task's own execution (a real gap in this task's original file list, caught by a implementer who correctly stopped at Step 1 rather than forcing through):**
- **`src/lib/agent/llm-client.ts` must NOT be deleted.** It's a small, generic `getOpenRouterClient()` factory (a raw `openai`-SDK client, unrelated to v2's own AI-SDK `openrouter-provider.ts`) with a real consumer OUTSIDE the v1 chat path entirely: `src/lib/agent/vision.ts` (the face-reactions photo-tagging feature, imported by `src/app/api/face-reactions/route.ts` and `.../analyze-untagged/route.ts` — both live, unrelated to this plan). Deleting it would break that unrelated feature's build. `tests/agent/llm-client.test.ts` correspondingly also stays (it tests this surviving file).
- **`src/lib/agent/conversation/auto-title.ts` must be ADDED to the deletion list.** It exports `generateAndPersistTitle`, called from exactly one place: `loop.ts` (being deleted). No v2 equivalent exists anywhere in `src/lib/agent/v2/` (confirmed by grep — v2's `route-handler.ts` never generates a conversation title). This is the SAME gap already surfaced twice earlier in this plan's own execution — Task 8's review noted v2 "does not currently emit anything that maps to `conversation_renamed`," and Task 11 removed `ChatPanel.tsx`'s now-dead `conversation_renamed` refetch effect for the same reason. Conversation auto-titling was silently dropped somewhere in the v1→v2 backend migration (a Plan-1/backend-scope gap, not something this frontend plan owns or should try to port here) — `auto-title.ts` becomes fully orphaned once `loop.ts` is gone, so it's now dead code that must be deleted alongside it, not preserved.
- The three additional test files (`loop.test.ts`, `use-chat.test.ts`, `translate.test.ts`) test modules this task ALREADY deletes (`loop.ts`, `useChat.ts`, `translate.ts`) but were missing from the original test-deletion list — a real oversight, now fixed above.
- `tests/agent/mcp-server.test.ts` needed a PARTIAL edit, not blanket deletion, because it contains two unrelated `describe` blocks — only one tests the file being deleted.

- [ ] **Step 1: Confirm nothing outside the files being deleted imports from them**

```bash
grep -rn "from \"@/lib/agent/loop\"\|from \"@/lib/agent/translate\"\|from \"@/hooks/useChat\"\|from \"@/lib/agent/pending-actions\"\|from \"@/lib/agent/mcp/in-memory-client\"\|from \"@/lib/agent/conversation/auto-title\"" src/ tests/
grep -rn "import(\"@/lib/agent/mcp/in-memory-client\")\|import('@/lib/agent/mcp/in-memory-client')" src/ tests/
```

(Note: `llm-client` is deliberately excluded from this grep now — it's not being deleted. The second grep catches dynamic `import(...)` calls the first, static-only pattern would miss — this is how the missed `tests/agent/mcp-server.test.ts` dependency was found.)

Every match should be inside a file this task is about to delete (or, for `mcp-server.test.ts`, inside the specific describe block being removed). If anything OUTSIDE that set matches, stop and resolve it before deleting (either that file needs updating, not deleting, or the grep result reveals a dependency this plan's exploration missed) — exactly as happened once already for this same task.

- [ ] **Step 2: Simplify `route.ts`** — remove the `if (process.env.THUMBGEN_AGENT_V2 === "1")` branch and the `runAgentLoop` import; keep only what was `postV2`'s body, now the file's only `POST` implementation. Given `postV2`'s current implementation lives in `src/lib/agent/v2/route-handler.ts` and is already fully self-contained, the simplest correct change is: delete this file's OWN `POST` function entirely and re-export `postV2` directly as `POST`:

```typescript
export { postV2 as POST } from "@/lib/agent/v2/route-handler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
```

Confirm `route-handler.ts` doesn't already declare conflicting `runtime`/`dynamic` exports of its own before doing this (it shouldn't — Plan 1 only added those to the OLD `route.ts`, not to `route-handler.ts` itself, but verify rather than assume).

- [ ] **Step 3: Delete the files listed above**

```bash
git rm src/lib/agent/loop.ts src/lib/agent/translate.ts src/hooks/useChat.ts src/lib/agent/pending-actions.ts src/lib/agent/mcp/in-memory-client.ts src/lib/agent/conversation/auto-title.ts
git rm -r src/app/api/agent/chat/tool-result
git rm tests/agent/chat-sse-skeleton.test.ts tests/agent/pending-actions.test.ts tests/agent/browser-tools.test.ts tests/agent/loop.test.ts tests/agent/use-chat.test.ts tests/agent/translate.test.ts
```

Then edit (not delete) `tests/agent/mcp-server.test.ts` by hand: remove only its `describe("getInMemoryMcpClient (caching)", ...)` block, keeping the `describe("MCP server (in-memory)", ...)` block (which tests the surviving `buildMcpServer`) intact.

```bash
```

- [ ] **Step 4: Re-home `startGcLoop()`**

Plan 1's spec (§3.1) flagged this: `startGcLoop()` (from `src/lib/agent/gc.ts`) was bootstrapped as a module-load side effect inside the now-deleted `loop.ts` (`if (typeof window === "undefined") startGcLoop();`). Add the same guarded call into `src/lib/agent/v2/route-handler.ts` (module scope, same pattern) so it keeps firing once `loop.ts` is gone:

```typescript
import { startGcLoop } from "@/lib/agent/gc";
if (typeof window === "undefined") startGcLoop();
```

- [ ] **Step 5: Remove the `THUMBGEN_AGENT_V2` env var references**

```bash
grep -rn "THUMBGEN_AGENT_V2" src/ scripts/ docs/ .env.example 2>/dev/null
```

Remove any remaining reference (there shouldn't be any in source after Step 2 — this step catches stray mentions in `.env.example`, comments, or docs Plan 1 left behind).

- [ ] **Step 6: Full test suite + typecheck + lint**

```bash
unset -f node npm npx 2>/dev/null
npm run test
npx tsc --noEmit
npm run lint
```

Expected: clean (the tests deleted/edited in Step 3 tested exactly the code deleted in this task; nothing else should reference it).

- [ ] **Step 7: Full manual verification without the flag** — `npm run dev` with `THUMBGEN_AGENT_V2` UNSET (or removed from `.env.local` if it was there for Tasks 3–12's development). Confirm the chat panel works exactly as it did during Tasks 3–12's individual verifications — the flag's absence should now be irrelevant since there is no more branch to gate.

- [ ] **Step 8: Commit**

**Do NOT use `git add -A`/`-u`/`.`** — this repo's working tree has pre-existing, unrelated uncommitted changes (from other in-progress work) that must never be swept into this plan's commits. `git rm` (Step 3) already stages the deletions; add only the files Step 2/4/3's partial edit actually modified on top of that:

```bash
git add src/app/api/agent/chat/route.ts src/lib/agent/v2/route-handler.ts tests/agent/mcp-server.test.ts
git commit -m "chore: cutover — v2 backend is now the only path, delete v1 (loop.ts, translate.ts, useChat.ts, pending-actions.ts, tool-result route, in-memory MCP client, orphaned auto-title.ts); llm-client.ts kept (still used by vision.ts)"
```

Before committing, run `git status --short` and confirm nothing outside {the files this task deletes/modifies} is staged.

---

### Task 14: Final full verification

**Files:** none (verification only, matching Plan 1's Task 11 pattern).

- [ ] **Step 1: Full suite, typecheck, lint** (repeat of Task 13 Step 6, as a final confirmation after any commits since)

```bash
npm run test && npx tsc --noEmit && npm run lint
```

- [ ] **Step 2: Full golden-path browser walkthrough** — start the dev server, and manually:
  1. Open the chat panel on a project with NO existing conversation — confirm the French empty state renders.
  2. Send a text message, confirm streaming text renders live, word by word.
  3. Ask something that triggers `search_youtube` — confirm the thumbnail gallery renders with captions.
  4. Ask for a sketch — confirm the preview + "+ canvas" button work, and the node actually appears on the canvas.
  5. Close and reopen the conversation (or switch away and back) — confirm history reloads correctly, INCLUDING the tool-result images from step 3/4 (this is Bug B's actual fix — the whole point of Plan 1's migration script and Plan 2's `history-to-ui-messages.ts` — if images are missing on reload, something regressed, treat as a blocking finding).
  6. Click Stop mid-stream — confirm it actually stops, and the partial turn is marked interrupted (check via `sqlite3 data/thumbgen.db "SELECT interrupted FROM messages ORDER BY created_at DESC LIMIT 1"` after stopping).
  7. Attach an image via AttachButton, send a message referencing it — confirm it round-trips.
  8. Use MicButton to record and transcribe — confirm the transcribed text appears in the composer.
  9. Confirm the reskin: colors, fonts, spacing all read as ThumbGen's Atelier Nocturne look, not shadcn/AI-Elements' generic default — no stray gray boxes, no visible Geist font anywhere, canvas handles still mint green.

- [ ] **Step 3: Report any finding from Step 2 honestly** — this is the last gate before the plan is considered done; a real problem found here is exactly what this step exists to catch, not something to soften.

- [ ] **Step 4: Commit** only if Step 2/3 surfaced something needing a fix; otherwise nothing to commit.
