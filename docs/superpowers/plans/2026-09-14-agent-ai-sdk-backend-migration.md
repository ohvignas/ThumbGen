# Agent Chat — Migration Backend vers AI SDK v7 (Plan 1/2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new AI-SDK-v7-based chat agent backend (`src/lib/agent/v2/*`) that runs side-by-side with the existing hand-rolled backend, activated only by `process.env.THUMBGEN_AGENT_V2 === "1"`, with full test coverage and both known bugs (broken human-in-the-loop handshake, lost tool-result images) fixed — without touching or breaking the current production path in any way.

**Architecture:** New code lives entirely under `src/lib/agent/v2/` and is wired into the existing `src/app/api/agent/chat/route.ts` via a one-line env-flag branch at the top of `POST()`. The registered tool registry (`src/lib/agent/tools/*`), the external MCP server (`src/lib/agent/mcp/server.ts`, `src/app/api/mcp/route.ts`), and the SQLite persistence functions (`src/lib/agent/conversation/store.ts`) are reused as-is — this plan only replaces how the *chat panel's* consumption path talks to the LLM and executes tools.

**Tech Stack:** `ai` (Vercel AI SDK) v7, `@ai-sdk/react` v4 (its own package version — see Global Constraints; installed now, consumed by Plan 2), `@openrouter/ai-sdk-provider` v3, existing `zod` v4 tool schemas, `vitest` (existing test runner, `environment: "node"`, no component-testing library installed).

**Spec:** [docs/superpowers/specs/2026-09-14-agent-ai-sdk-redesign-design.md](../specs/2026-09-14-agent-ai-sdk-redesign-design.md)

**This is Plan 1 of 2.** The spec's frontend/AI-Elements/reskin/cutover/cleanup scope (§5, §7) is intentionally deferred to a second plan, written after this one is implemented and its tests are green. Rationale: the current frontend (`useChat.ts` hand-rolled SSE parser) cannot speak the new backend's wire format at all — shipping backend and frontend as one plan would mean the app has no working, testable state until the very last task. Splitting lets this plan produce a fully working, fully tested unit on its own (the v1 path stays the default and 100% functional throughout; the v2 path is exercised only by its own tests and manual flag-flipping), matching the writing-plans scope-check guidance for independently-testable subsystems. Plan 2 will: swap `ChatPanel.tsx` + subcomponents to `@ai-sdk/react`'s `useChat` + AI Elements, run the DB migration script this plan writes (but does not run) for real, flip the default, delete the v1 files, and do the visual reskin.

## Global Constraints

- `ai` must be `^7.0.0` — the official `@openrouter/ai-sdk-provider` package's peer dependency requires v7 specifically, not v5/v6.
- `@openrouter/ai-sdk-provider` must be `^3.0.0` (the v7-targeting release line).
- `@ai-sdk/react` must be `^4.0.0` — its own package version numbers do NOT mirror `ai`'s major version (verified directly against the npm registry: `@ai-sdk/react@4.0.102`'s own `dependencies` pin `"ai": "7.0.99"` exactly — 4.x is the react-hooks release line that pairs with `ai@7`, there is no `@ai-sdk/react@7.x`).
- Zero changes to `src/lib/agent/tools/*.ts`, `src/lib/agent/tools/index.ts`, `src/lib/agent/tools/all.ts`, `src/lib/agent/mcp/server.ts`, `src/app/api/mcp/route.ts` — this is live, externally-consumed infrastructure (Claude Desktop / other MCP clients connect to `/api/mcp` today), and was the explicit constraint #1 of the original April 2026 agent spec.
- Zero changes to `src/lib/agent/loop.ts`, `src/lib/agent/llm-client.ts`, `src/lib/agent/translate.ts`, `src/hooks/useChat.ts`, `src/components/panels/ChatPanel.tsx` (and its subcomponents) — the v1 path must remain the default and fully functional through every task in this plan.
- New code lives under `src/lib/agent/v2/` exclusively, gated by `process.env.THUMBGEN_AGENT_V2 === "1"` — no new Settings UI, no new DB-backed flag (this is a temporary internal/dev switch, deleted in Plan 2).
- No module-scope singleton for the OpenRouter client/provider — read `getSetting("openrouterApiKey")` fresh on every request, matching v1's existing behavior exactly (a Settings-page key change must apply to the very next message, no restart).
- `stopWhen: isStepCount(25)` — this is the current AI SDK v7 name; the older `stepCountIs` name (v6 and earlier) is renamed and its old doc URL now 404s.
- Cost tracking uses `totalUsage` (aggregated across the whole multi-step tool loop) from `onFinish`, not `usage` (which may be per-step) — otherwise the cost badge silently drifts from v1's behavior.
- Every new test file follows the existing convention: `tests/agent/<name>.test.ts`, `vitest` with `environment: "node"`, `vi.mock("youtube-transcript", ...)` at the top of any test that transitively imports the tool registry (existing tests already need this — `youtube-transcript` ships a CJS bundle that breaks under Vitest's ESM transform).

---

## File Structure

**New files (this plan):**
- `src/lib/agent/v2/openrouter-provider.ts` — OpenRouter provider factory, no singleton
- `src/lib/agent/v2/tool-adapter.ts` — wraps the existing tool registry as AI SDK `tool()` definitions
- `src/lib/agent/v2/browser-client-tools.ts` — `request_user_image` as an AI SDK client tool (no `execute`)
- `src/lib/agent/v2/web-search-tool.ts` — OpenRouter web-search provider-options helper
- `src/lib/agent/v2/persist-turn.ts` — persists a completed assistant turn to the existing `messages` table
- `src/lib/agent/v2/route-handler.ts` — the actual `streamText`-based POST handler
- `scripts/migrate-chat-messages-to-uimessage.ts` — DB migration script (written + tested here, **run for real only in Plan 2**)
- `tests/agent/v2-openrouter-provider.test.ts`
- `tests/agent/v2-tool-adapter.test.ts`
- `tests/agent/v2-browser-client-tools.test.ts`
- `tests/agent/v2-web-search-tool.test.ts`
- `tests/agent/v2-persist-turn.test.ts`
- `tests/agent/v2-route-handler.test.ts`
- `tests/agent/migrate-chat-messages.test.ts`

**Modified files:**
- `src/app/api/agent/chat/route.ts` — add a 3-line env-flag branch at the top of `POST()`; everything else in the file is untouched
- `src/lib/agent/system-prompt.ts` — fix the two phantom-tool references (`trigger_generation`, `web_search`) — this file is shared by both v1 and v2 (it's pure prompt text, transport-agnostic), so this fix benefits the current production path immediately
- `tests/agent/registry-full.test.ts`, `tests/agent/mcp-server.test.ts` — add the two tool names missing from their expected-list arrays (`list_personas`, `import_youtube_thumbnail`), already-registered tools these tests should have covered

**Explicitly NOT touched** (verified by reading, not assumed): `src/lib/agent/tools/*`, `src/lib/agent/mcp/*`, `src/app/api/mcp/route.ts`, `src/lib/agent/conversation/store.ts`, `src/app/api/agent/conversations/**`, `src/lib/settings.ts`, `src/lib/agent/models.ts`, `src/lib/agent/gc.ts`, `src/store/chat-store.ts`, `src/app/api/agent/usage/route.ts`, `src/components/panels/chat/UsageBadge.tsx`.

**Two spec items with no Plan-1 task, deliberately — not dropped:**
- **`gc.ts` re-homing** (spec §3.1): `startGcLoop()` is bootstrapped as a module-load side effect inside `loop.ts` (`if (typeof window === "undefined") startGcLoop();`). It only needs to move once `loop.ts` is actually deleted — which does not happen in this plan (`route.ts` still unconditionally imports `runAgentLoop` from `loop.ts` for the v1 path). `startGcLoop()` keeps firing exactly as today through every task here; re-homing it belongs to whichever Plan 2 task deletes `loop.ts`.
- **Image-result storage** (spec §4.3, `search_youtube`/`import_youtube_thumbnail` inline base64 → URL-referenced): the tool source files are untouched by this plan (they live in the never-modified `tools/*.ts` bucket). `generate_sketch` and `import_youtube_thumbnail` already write to durable, URL-servable storage (`generated_sketches` + `/api/generated-sketches/<id>`, `swipe_files` + `/api/swipe-files/<id>`); `search_youtube`'s thumbnails already have stable public URLs on YouTube's own CDN (`i.ytimg.com`) that a Plan-2 renderer can reference directly without ThumbGen storing its own copy. There is no backend change required for this — it is purely a Plan-2 frontend-renderer concern (how the custom tool-result component displays what the tools already return).

---

### Task 1: Install AI SDK v7 dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Produces: `ai@^7`, `@ai-sdk/react@^4`, `@openrouter/ai-sdk-provider@^3` available to import from any file in the repo. Every later task in this plan imports from these.

- [ ] **Step 1: Install the packages**

```bash
npm install ai@^7 @ai-sdk/react@^4 @openrouter/ai-sdk-provider@^3
```

`@ai-sdk/react`'s own version numbers do not mirror `ai`'s major version — `^4` is correct here, not `^7` (see Global Constraints). Verify after install: `npm ls ai @ai-sdk/react @openrouter/ai-sdk-provider` should show `ai@7.x` satisfying both `@ai-sdk/react`'s and `@openrouter/ai-sdk-provider`'s internal requirement on it, with no peer-dependency warnings.

- [ ] **Step 2: Verify the install didn't break the existing build**

```bash
npx tsc --noEmit
```

Expected: no new errors (the packages are installed but not yet imported anywhere, so this should be identical to the pre-install typecheck).

- [ ] **Step 3: Verify the existing test suite is still fully green**

```bash
npm run test
```

Expected: PASS, same count as before this task (nothing imports the new packages yet).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install AI SDK v7 + OpenRouter provider for the v2 chat backend"
```

---

### Task 2: OpenRouter provider factory (no singleton)

**Files:**
- Create: `src/lib/agent/v2/openrouter-provider.ts`
- Test: `tests/agent/v2-openrouter-provider.test.ts`

**Interfaces:**
- Consumes: `getSetting("openrouterApiKey")` from `@/lib/settings` (existing, unchanged).
- Produces: `getOpenRouterProvider(): OpenRouterProvider | null` — a fresh provider instance built from the CURRENT setting value on every call, or `null` if no key is configured. Task 7 calls this once per request.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/agent/v2-openrouter-provider.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const createOpenRouterMock = vi.fn((opts: { apiKey: string }) => ({ __apiKey: opts.apiKey }));
vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: (opts: { apiKey: string }) => createOpenRouterMock(opts),
}));

import { setSetting } from "@/lib/settings";
import { getOpenRouterProvider } from "@/lib/agent/v2/openrouter-provider";

describe("getOpenRouterProvider", () => {
  beforeEach(() => createOpenRouterMock.mockClear());

  it("returns null when no API key is configured", () => {
    const prevEnv = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    setSetting("openrouterApiKey", "");
    expect(getOpenRouterProvider()).toBeNull();
    if (prevEnv !== undefined) process.env.OPENROUTER_API_KEY = prevEnv;
  });

  it("creates a fresh provider from the CURRENT setting on every call — no caching", () => {
    setSetting("openrouterApiKey", "key-A");
    getOpenRouterProvider();
    expect(createOpenRouterMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ apiKey: "key-A" }),
    );

    setSetting("openrouterApiKey", "key-B");
    getOpenRouterProvider();
    expect(createOpenRouterMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ apiKey: "key-B" }),
    );

    expect(createOpenRouterMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/agent/v2-openrouter-provider.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/agent/v2/openrouter-provider'".

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/agent/v2/openrouter-provider.ts
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { getSetting } from "@/lib/settings";

/**
 * Creates a fresh OpenRouter provider from the current Settings value on
 * every call — no module-scope singleton. v1's llm-client.ts reads the API
 * key fresh per-call by explicit design (a Settings-page key change must
 * apply to the very next message, no restart); the common singleton pattern
 * shown in most @openrouter/ai-sdk-provider examples would silently break
 * that on a warm server process, so this deliberately does not cache.
 */
export function getOpenRouterProvider() {
  const apiKey = getSetting("openrouterApiKey");
  if (!apiKey) return null;
  return createOpenRouter({
    apiKey,
    headers: {
      "HTTP-Referer": "https://thumbgen.local",
      "X-Title": "ThumbGen",
    },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/agent/v2-openrouter-provider.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/v2/openrouter-provider.ts tests/agent/v2-openrouter-provider.test.ts
git commit -m "feat(agent-v2): add OpenRouter provider factory with no singleton caching"
```

---

### Task 3: Tool adapter — registry → AI SDK `tool()`

**Files:**
- Create: `src/lib/agent/v2/tool-adapter.ts`
- Test: `tests/agent/v2-tool-adapter.test.ts`

**Interfaces:**
- Consumes: `listTools(): ToolDefinition[]`, `getTool(name): ToolDefinition | undefined` from `@/lib/agent/tools` (existing, unchanged). `ToolDefinition<I> = {name: string; description: string; inputSchema: z.ZodType<I>; handler: (input: I) => Promise<ToolResult>}`. `ToolResult = {content: ToolContent[]; isError?: boolean}`. `ToolContent = {type:"text"; text:string} | {type:"image"; mimeType:string; data:string}` (base64), all from `@/lib/agent/tools/types` (existing, unchanged).
- Produces: `buildAiSdkTools(): Record<string, Tool>` — one AI SDK tool per registered tool, keyed by name. Task 7 spreads this into `streamText`'s `tools` option.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/agent/v2-tool-adapter.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

import "@/lib/agent/tools/all";
import { buildAiSdkTools } from "@/lib/agent/v2/tool-adapter";

describe("buildAiSdkTools", () => {
  it("wraps every registered tool, keyed by name", () => {
    const tools = buildAiSdkTools();
    expect(Object.keys(tools)).toContain("list_logos");
    expect(Object.keys(tools)).toContain("apply_workflow");
    expect(Object.keys(tools)).toContain("list_personas");
  });

  it("execute() calls straight into the real tool handler (no MCP round-trip)", async () => {
    const tools = buildAiSdkTools();
    const result = await tools.list_logos.execute!({}, { toolCallId: "t1" } as never);
    expect(result).toHaveProperty("content");
    expect(Array.isArray((result as { content: unknown[] }).content)).toBe(true);
  });

  it("toModelOutput maps text+image ToolContent into content/file parts", () => {
    const tools = buildAiSdkTools();
    const fake = {
      content: [
        { type: "text" as const, text: "hello" },
        { type: "image" as const, mimeType: "image/png", data: "AAA=" },
      ],
    };
    const out = tools.list_logos.toModelOutput!({
      toolCallId: "t1",
      input: {},
      output: fake,
    } as never);
    expect(out).toEqual({
      type: "content",
      value: [
        { type: "text", text: "hello" },
        { type: "file", mediaType: "image/png", data: "AAA=" },
      ],
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/agent/v2-tool-adapter.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/agent/v2/tool-adapter'".

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/agent/v2/tool-adapter.ts
import { tool as aiTool, type Tool } from "ai";
import { getTool, listTools } from "@/lib/agent/tools";
import type { ToolContent, ToolResult } from "@/lib/agent/tools/types";

/**
 * Wraps one registered ThumbGen tool as an AI SDK tool() definition. Calls
 * straight into the existing ToolDefinition.handler — no MCP round-trip.
 * The registry (src/lib/agent/tools/index.ts) is untouched; this only
 * changes how the v2 chat route CONSUMES it (v1's loop.ts still goes
 * through the in-memory MCP client, unaffected by this file).
 */
function toAiSdkTool(name: string): Tool {
  const def = getTool(name);
  if (!def) throw new Error(`Unknown tool: ${name}`);
  return aiTool({
    description: def.description,
    inputSchema: def.inputSchema,
    execute: async (input: unknown) => {
      const result: ToolResult = await def.handler(input);
      return result;
    },
    // Shapes what the MODEL sees back. The UI (Plan 2) reads the raw
    // execute() return value (our ToolResult) directly off the tool part's
    // `output` field instead — this only controls the next model turn.
    toModelOutput: ({ output }) => {
      const result = output as ToolResult;
      return {
        type: "content" as const,
        value: result.content.map((c: ToolContent) =>
          c.type === "text"
            ? { type: "text" as const, text: c.text }
            : { type: "file" as const, mediaType: c.mimeType, data: c.data },
        ),
      };
    },
  });
}

/** Builds the full { [toolName]: Tool } map streamText expects, from every tool currently in the registry. */
export function buildAiSdkTools(): Record<string, Tool> {
  const out: Record<string, Tool> = {};
  for (const def of listTools()) {
    out[def.name] = toAiSdkTool(def.name);
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/agent/v2-tool-adapter.test.ts
```

Expected: PASS (3 tests). If `toModelOutput` or `execute` don't type-check against the installed `ai` package's `tool()` signature, run `npx tsc --noEmit` and fix the mismatch against the compiler error — that error is the ground truth for the exact installed version, not this plan's assumption.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/v2/tool-adapter.ts tests/agent/v2-tool-adapter.test.ts
git commit -m "feat(agent-v2): adapt the existing tool registry to AI SDK tool() definitions"
```

---

### Task 4: Browser client tool (`request_user_image`)

**Files:**
- Create: `src/lib/agent/v2/browser-client-tools.ts`
- Test: `tests/agent/v2-browser-client-tools.test.ts`

**Interfaces:**
- Consumes: `requestUserImageInputSchema` from `@/lib/agent/browser-tools/request-user-image` (existing, unchanged — the exact same zod schema v1 uses).
- Produces: `V2_CLIENT_TOOLS: Record<string, Tool>`, `V2_CLIENT_TOOL_NAMES: Set<string>`. Task 7 spreads `V2_CLIENT_TOOLS` into `streamText`'s `tools` option alongside `buildAiSdkTools()`'s output.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/agent/v2-browser-client-tools.test.ts
import { describe, it, expect } from "vitest";
import { V2_CLIENT_TOOLS, V2_CLIENT_TOOL_NAMES } from "@/lib/agent/v2/browser-client-tools";

describe("v2 browser client tools", () => {
  it("exposes request_user_image with no execute (resolved client-side)", () => {
    expect(V2_CLIENT_TOOL_NAMES.has("request_user_image")).toBe(true);
    expect(V2_CLIENT_TOOLS.request_user_image.execute).toBeUndefined();
  });

  it("reuses the exact v1 input schema (reason required, suggested_kind enum)", () => {
    const schema = V2_CLIENT_TOOLS.request_user_image.inputSchema as {
      safeParse: (v: unknown) => { success: boolean };
    };
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ reason: "need a face" }).success).toBe(true);
    expect(schema.safeParse({ reason: "x", suggested_kind: "weird" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/agent/v2-browser-client-tools.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/agent/v2/browser-client-tools'".

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/agent/v2/browser-client-tools.ts
import { tool as aiTool } from "ai";
import { requestUserImageInputSchema } from "@/lib/agent/browser-tools/request-user-image";

/**
 * AI SDK "client tool": no `execute`, so streamText pauses the step and the
 * client resolves it via useChat's addToolOutput (Plan 2). This replaces
 * v1's ui_tool_request / registerPending(requestId) handshake, which is
 * confirmed broken: loop.ts registers the pending promise under a freshly
 * generated requestId, but resolution (POST /api/agent/chat/tool-result)
 * looks it up by the model's tool_call id — two different keys, never
 * reconciled, no timeout. addToolOutput correlates by the model's own
 * toolCallId end to end, so there is no second synthetic ID to keep in
 * sync — this fixes the hang by construction, not by patching the old
 * two-ID handshake.
 *
 * request_user_sketch is intentionally NOT included here, matching v1
 * (browser-tools/index.ts excludes it from BROWSER_TOOL_DEFS) — SketchEditor
 * still has no save callback, unrelated to this migration.
 */
export const requestUserImageClientTool = aiTool({
  description:
    "Asks the user to upload an image (face, logo, or reference). The browser opens a file picker or the library. The conversation suspends until the user uploads OR explicitly skips.",
  inputSchema: requestUserImageInputSchema,
});

export const V2_CLIENT_TOOLS = {
  request_user_image: requestUserImageClientTool,
};

export const V2_CLIENT_TOOL_NAMES = new Set(Object.keys(V2_CLIENT_TOOLS));
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/agent/v2-browser-client-tools.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/v2/browser-client-tools.ts tests/agent/v2-browser-client-tools.test.ts
git commit -m "feat(agent-v2): request_user_image as an AI SDK client tool (fixes v1 handshake bug)"
```

---

### Task 5: Fix phantom tool references in the system prompt

**Files:**
- Modify: `src/lib/agent/system-prompt.ts`

**Interfaces:**
- Consumes: nothing new — this is a text-only edit to the shared `AGENT_SYSTEM_PROMPT` string, read by both v1 (`loop.ts`) and v2 (`route-handler.ts`, Task 7) via the existing `buildSystemMessages()` export.
- Produces: nothing new — behavior fix only.

This file currently instructs the model to call two tools that don't exist in the registry: `trigger_generation` (rule 11) and `web_search` (the "Cite web sources" rule and the module docstring). Neither is registered in `tools/all.ts`. This is a plausible cause of the client-side crash reported earlier this session, and is independent of the AI SDK migration — fixing it benefits v1 immediately.

- [ ] **Step 1: Fix rule 11 (generation is a canvas click, not a tool call)**

In `src/lib/agent/system-prompt.ts`, find:

```
11. Ask explicit confirmation before calling trigger_generation (it costs money)
```

Replace with:

```
11. Final generation is triggered by the USER clicking "Generate" on the canvas generator node, not by a tool call — after apply_workflow succeeds, always remind them explicitly ("clique Generate sur le node generator pour lancer, ça a un coût").
```

- [ ] **Step 2: Fix the phantom `web_search` reference**

Find:

```
- Cite web sources when you use web_search
```

Replace with:

```
- Cite web sources when the web_search tool returns results
```

- [ ] **Step 3: Update the stale docstring above `buildSystemMessages`**

Find:

```
/**
 * Returns the Anthropic Messages API "system" parameter as an array of blocks.
 * The first block is the static persona+rules with cache_control set, so it's
 * cached across turns. The second block is the per-turn canvas snapshot.
 *
 * Note: trigger_generation is referenced in the prompt but is NOT yet a registered
 * tool. When implemented (later milestone), the prompt remains accurate.
 */
```

Replace with:

```
/**
 * Returns the Anthropic Messages API "system" parameter as an array of blocks.
 * The first block is the static persona+rules with cache_control set, so it's
 * cached across turns. The second block is the per-turn canvas snapshot.
 */
```

- [ ] **Step 4: Run the existing test suite to confirm nothing depended on the old wording**

```bash
npx vitest run
```

Expected: PASS, same count as before (no test asserts on this prompt text).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/system-prompt.ts
git commit -m "fix(agent): remove phantom trigger_generation/web_search tool references from system prompt"
```

---

### Task 6: Web-search provider-options helper

**Files:**
- Create: `src/lib/agent/v2/web-search-tool.ts`
- Test: `tests/agent/v2-web-search-tool.test.ts`

**Interfaces:**
- Consumes: `getSetting("agentWebSearch")` from `@/lib/settings` (existing, unchanged).
- Produces: `webSearchProviderOptions(): { web_search_options: Record<string, never> } | undefined`. Task 7 spreads this into `streamText`'s `providerOptions.openrouter`.

**Note on the exact mechanism (verified directly against the installed provider's source, not assumed):** OpenRouter's own docs describe a newer `tools: [{type: "openrouter:web_search"}]` model-driven mechanism as superseding the old `plugins: [{id: "web"}]` (which is still functional but marked deprecated). However, `@openrouter/ai-sdk-provider`'s currently-typed `OpenRouterChatSettings` does **not** expose that `tools:[...]` shape — it exposes `web_search_options?: {max_results?, search_prompt?, engine?}` as its own, separately-named newer field, alongside the older `plugins` field. This task uses `web_search_options` (the real, currently-typed field, confirmed via the provider's own source) rather than the `plugins` field it replaces. It preserves the exact same on/off semantics as v1's `webSearchOn = getSetting("agentWebSearch") !== "0"` (`loop.ts:132`). Whether `web_search_options` alone yields OpenRouter's newer model-decides-when-to-search behavior (vs. still always-augmenting once) is a live-API behavior this plan cannot verify from static types — confirm manually during Task 10's verification pass and note the actual observed behavior for Plan 2.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/agent/v2-web-search-tool.test.ts
import { describe, it, expect } from "vitest";
import { setSetting } from "@/lib/settings";
import { webSearchProviderOptions } from "@/lib/agent/v2/web-search-tool";

describe("webSearchProviderOptions", () => {
  it("is enabled by default (agentWebSearch unset)", () => {
    setSetting("agentWebSearch", "");
    expect(webSearchProviderOptions()).toEqual({ web_search_options: {} });
  });

  it("is disabled when agentWebSearch is '0'", () => {
    setSetting("agentWebSearch", "0");
    expect(webSearchProviderOptions()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/agent/v2-web-search-tool.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/agent/v2/web-search-tool'".

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/agent/v2/web-search-tool.ts
import { getSetting } from "@/lib/settings";

/**
 * OpenRouter's web-search augmentation, opted in via the existing
 * agentWebSearch setting — same on/off semantics as v1's
 * `plugins: [{id: "web"}]` (loop.ts:132-139). Uses `web_search_options`,
 * the field @openrouter/ai-sdk-provider currently types for this (verified
 * against its source — the provider does not yet type the
 * `tools:[{type:'openrouter:web_search'}]` shape OpenRouter's own docs
 * describe as the newest mechanism; `plugins:[{id:'web'}]` still works but
 * is marked deprecated by OpenRouter).
 */
export function webSearchProviderOptions(): { web_search_options: Record<string, never> } | undefined {
  const enabled = getSetting("agentWebSearch") !== "0";
  if (!enabled) return undefined;
  return { web_search_options: {} };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/agent/v2-web-search-tool.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/v2/web-search-tool.ts tests/agent/v2-web-search-tool.test.ts
git commit -m "feat(agent-v2): migrate web search to OpenRouter's web_search_options"
```

---

### Task 7: Turn persistence (`persistAssistantTurn`)

**Files:**
- Create: `src/lib/agent/v2/persist-turn.ts`
- Test: `tests/agent/v2-persist-turn.test.ts`

**Interfaces:**
- Consumes: `appendMessage(input: AppendMessageInput): Message` from `@/lib/agent/conversation/store` (existing, unchanged). `AgentModel` type from `@/lib/agent/models` (existing, unchanged).
- Produces: `estimateCost(model, inputTokens, outputTokens): number`, `persistAssistantTurn(info: FinishInfo): void`. Task 8 (route-handler) calls `persistAssistantTurn` from `streamText`'s `onFinish`.

Split out from the route handler specifically so it's unit-testable without mocking AI SDK's streaming machinery at all — it only touches the existing, already-fully-understood `conversation/store.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/agent/v2-persist-turn.test.ts
import { describe, it, expect } from "vitest";
import { v4 as uuid } from "uuid";
import { createConversation, listMessages } from "@/lib/agent/conversation/store";
import { persistAssistantTurn, estimateCost } from "@/lib/agent/v2/persist-turn";
import type { AgentModel } from "@/lib/agent/models";

const FAKE_MODEL: AgentModel = {
  id: "test/model",
  label: "Test",
  provider: "openai",
  supportsThinking: false,
  pricing: { inputPerM: 2, outputPerM: 10, cachedInputPerM: 0.5 },
};

describe("estimateCost", () => {
  it("computes input+output cost from per-million pricing", () => {
    expect(estimateCost(FAKE_MODEL, 1_000_000, 1_000_000)).toBeCloseTo(12);
  });

  it("returns 0 for an unknown model", () => {
    expect(estimateCost(undefined, 1000, 1000)).toBe(0);
  });
});

describe("persistAssistantTurn", () => {
  it("writes one assistant row with totalUsage-based cost", () => {
    const conv = createConversation(`test-v2-persist-${uuid()}`);
    persistAssistantTurn({
      conversationId: conv.id,
      responseMessages: [{ role: "assistant", content: "hi" }],
      totalUsage: { inputTokens: 500_000, outputTokens: 100_000 },
      finishReason: "stop",
      modelInfo: FAKE_MODEL,
    });
    const rows = listMessages(conv.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("assistant");
    expect(rows[0].total_input_tokens).toBe(500_000);
    expect(rows[0].total_output_tokens).toBe(100_000);
    expect(rows[0].cost_estimate).toBeCloseTo(0.5 * 2 + 0.1 * 10); // 2.0
    expect(rows[0].interrupted).toBe(0);
  });

  it("marks interrupted=1 when finishReason is 'aborted'", () => {
    const conv = createConversation(`test-v2-persist-${uuid()}`);
    persistAssistantTurn({
      conversationId: conv.id,
      responseMessages: [],
      totalUsage: {},
      finishReason: "aborted",
      modelInfo: undefined,
    });
    expect(listMessages(conv.id)[0].interrupted).toBe(1);
    expect(listMessages(conv.id)[0].cost_estimate).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/agent/v2-persist-turn.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/agent/v2/persist-turn'".

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/agent/v2/persist-turn.ts
import { appendMessage } from "@/lib/agent/conversation/store";
import type { AgentModel } from "@/lib/agent/models";

export function estimateCost(m: AgentModel | undefined, inTok: number, outTok: number): number {
  if (!m) return 0;
  return (inTok / 1_000_000) * m.pricing.inputPerM + (outTok / 1_000_000) * m.pricing.outputPerM;
}

export type FinishInfo = {
  conversationId: string;
  responseMessages: unknown[]; // result.response.messages from streamText's onFinish
  totalUsage: { inputTokens?: number; outputTokens?: number };
  finishReason: string;
  modelInfo: AgentModel | undefined;
};

/**
 * Persists the assistant's completed turn into the SAME `messages` table
 * v1 uses, with the SAME columns UsageBadge / /api/agent/usage already read
 * — so v1 and v2 stay interchangeable at the DB layer for as long as the
 * kill-switch exists.
 *
 * totalUsage (aggregated across the whole multi-step tool loop) is used
 * instead of onFinish's step-level `usage`, matching v1's totalInput/
 * totalOutput accumulation across up to 25 iterations (loop.ts:241-242) —
 * using step-level usage here would silently under-report cost on any turn
 * that called more than one tool.
 */
export function persistAssistantTurn(info: FinishInfo): void {
  const cost = estimateCost(info.modelInfo, info.totalUsage.inputTokens ?? 0, info.totalUsage.outputTokens ?? 0);
  appendMessage({
    conversation_id: info.conversationId,
    role: "assistant",
    content_json: JSON.stringify(info.responseMessages),
    interrupted: info.finishReason === "aborted" ? 1 : 0,
    total_input_tokens: info.totalUsage.inputTokens ?? 0,
    total_output_tokens: info.totalUsage.outputTokens ?? 0,
    cost_estimate: cost,
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/agent/v2-persist-turn.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/v2/persist-turn.ts tests/agent/v2-persist-turn.test.ts
git commit -m "feat(agent-v2): persist completed turns using totalUsage-aggregated cost"
```

---

### Task 8: The v2 route handler (`streamText` wiring)

**Files:**
- Create: `src/lib/agent/v2/route-handler.ts`
- Modify: `src/app/api/agent/chat/route.ts`
- Test: `tests/agent/v2-route-handler.test.ts`

**Interfaces:**
- Consumes: `getOpenRouterProvider` (Task 2), `buildAiSdkTools` (Task 3), `V2_CLIENT_TOOLS` (Task 4), `webSearchProviderOptions` (Task 5), `persistAssistantTurn` (Task 7), plus existing `buildSystemMessages` (`@/lib/agent/system-prompt`), `appendMessage`/`listMessages` (`@/lib/agent/conversation/store`), `resolveImageSource` (`@/lib/agent/tools/_helpers/image-source`), `getSetting`/`getModelById`/`DEFAULT_AGENT_MODEL` (existing, unchanged).
- Produces: `postV2(req: NextRequest): Promise<Response>` — a full replacement POST handler returning `streamText(...).toUIMessageStreamResponse()`. Plan 2's frontend task consumes this response's wire format directly via `@ai-sdk/react`'s `useChat`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/agent/v2-route-handler.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

const streamTextMock = vi.fn();
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, streamText: (opts: unknown) => streamTextMock(opts) };
});

import "@/lib/agent/tools/all";
import { setSetting } from "@/lib/settings";

describe("postV2", () => {
  beforeEach(() => streamTextMock.mockClear());

  it("returns 400 when conversation_id is missing", async () => {
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    const res = await postV2(
      new Request("http://localhost/api/agent/chat", {
        method: "POST",
        body: JSON.stringify({ project_id: "p" }),
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when no OpenRouter API key is configured", async () => {
    const prevEnv = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    setSetting("openrouterApiKey", "");
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    const res = await postV2(
      new Request("http://localhost/api/agent/chat", {
        method: "POST",
        body: JSON.stringify({ conversation_id: "c1", project_id: "p1", message: { text: "hi" } }),
      }) as never,
    );
    expect(res.status).toBe(400);
    if (prevEnv !== undefined) process.env.OPENROUTER_API_KEY = prevEnv;
  });

  it("wires registry tools + the client tool into streamText, with stopWhen set", async () => {
    setSetting("openrouterApiKey", "test-key");
    streamTextMock.mockReturnValue({
      toUIMessageStreamResponse: () =>
        new Response("ok", { headers: { "content-type": "text/event-stream" } }),
    });
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    const res = await postV2(
      new Request("http://localhost/api/agent/chat", {
        method: "POST",
        body: JSON.stringify({
          conversation_id: `c-${Date.now()}`,
          project_id: "p1",
          message: { text: "hi" },
          canvas_snapshot: { nodes: [], edges: [] },
        }),
      }) as never,
    );
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    expect(streamTextMock).toHaveBeenCalledTimes(1);
    const callArgs = streamTextMock.mock.calls[0][0] as {
      tools: Record<string, unknown>;
      stopWhen: unknown;
      abortSignal: unknown;
    };
    expect(Object.keys(callArgs.tools)).toContain("list_logos");
    expect(Object.keys(callArgs.tools)).toContain("request_user_image");
    expect(callArgs.stopWhen).toBeDefined();
    expect(callArgs.abortSignal).toBeInstanceOf(AbortSignal);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/agent/v2-route-handler.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/agent/v2/route-handler'".

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/agent/v2/route-handler.ts
import { NextRequest } from "next/server";
import { streamText, isStepCount } from "ai";
import { getOpenRouterProvider } from "./openrouter-provider";
import { buildAiSdkTools } from "./tool-adapter";
import { V2_CLIENT_TOOLS } from "./browser-client-tools";
import { webSearchProviderOptions } from "./web-search-tool";
import { persistAssistantTurn } from "./persist-turn";
import { buildSystemMessages } from "@/lib/agent/system-prompt";
import { appendMessage, listMessages } from "@/lib/agent/conversation/store";
import { resolveImageSource } from "@/lib/agent/tools/_helpers/image-source";
import { getSetting } from "@/lib/settings";
import { getModelById, DEFAULT_AGENT_MODEL } from "@/lib/agent/models";

const MAX_STEPS = 25;

export async function postV2(req: NextRequest): Promise<Response> {
  const body = (await req.json().catch(() => null)) as
    | {
        conversation_id?: string;
        project_id?: string;
        message?: { text?: string; attachments?: Array<{ type: "image"; source: string }> };
        canvas_snapshot?: unknown;
      }
    | null;

  if (!body?.conversation_id || !body?.project_id) {
    return new Response("Missing conversation_id or project_id", { status: 400 });
  }

  const provider = getOpenRouterProvider();
  if (!provider) {
    return new Response(
      "Clé OpenRouter non configurée. Ajoute OPENROUTER_API_KEY dans Settings.",
      { status: 400 },
    );
  }

  const modelId = getSetting("agentModel") || DEFAULT_AGENT_MODEL;
  const modelInfo = getModelById(modelId);
  const conversationId = body.conversation_id;

  const userParts: Array<
    { type: "text"; text: string } | { type: "file"; mediaType: string; data: string }
  > = [];
  if (body.message?.text) userParts.push({ type: "text", text: body.message.text });
  for (const a of body.message?.attachments ?? []) {
    if (a.type !== "image") continue;
    const img = await resolveImageSource(a.source);
    userParts.push({ type: "file", mediaType: img.mimeType, data: img.bytes.toString("base64") });
  }

  appendMessage({
    conversation_id: conversationId,
    role: "user",
    content_json: JSON.stringify([{ role: "user", content: userParts }]),
    interrupted: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    cost_estimate: 0,
  });

  // Every prior row is assumed to already be ModelMessage-shaped — true once
  // scripts/migrate-chat-messages-to-uimessage.ts has run for real (Plan 2's
  // cutover sequencing: migrate, THEN flip THUMBGEN_AGENT_V2, THEN swap the
  // frontend — never true for a conversation continued under v2 before that
  // migration runs, which the cutover sequencing exists specifically to
  // prevent).
  const priorMessages = listMessages(conversationId)
    .slice(0, -1)
    .flatMap((m) => JSON.parse(m.content_json));

  const systemBlocks = buildSystemMessages(body.canvas_snapshot, body.project_id);
  const systemText = systemBlocks.map((b) => b.text).join("\n\n");

  const result = streamText({
    model: provider(modelId),
    system: systemText,
    messages: [...priorMessages, { role: "user", content: userParts }],
    tools: { ...buildAiSdkTools(), ...V2_CLIENT_TOOLS },
    stopWhen: isStepCount(MAX_STEPS),
    // v1 checks abort only at the outer-iteration and token-streaming
    // boundaries, never inside the per-tool-call dispatch loop — a Stop
    // click lets any tool calls already in flight for the current batch
    // finish before the next iteration notices. Passing the request's own
    // signal here reproduces that same "finish current batch, then stop"
    // granularity as the starting point (whatever AI SDK's own abortSignal
    // handling does internally), not a tightened version — see spec §6.1.
    abortSignal: req.signal,
    providerOptions: {
      openrouter: {
        ...(modelInfo?.supportsThinking ? { reasoning: { effort: "medium" as const } } : {}),
        ...webSearchProviderOptions(),
      },
    },
    onFinish: async ({ response, totalUsage, finishReason }) => {
      persistAssistantTurn({
        conversationId,
        responseMessages: response.messages,
        totalUsage,
        finishReason,
        modelInfo,
      });
    },
  });

  return result.toUIMessageStreamResponse();
}
```

- [ ] **Step 4: Wire the flag into the existing route** — in `src/app/api/agent/chat/route.ts`, add the import and the branch. Find:

```typescript
import { NextRequest } from "next/server";
import { runAgentLoop } from "@/lib/agent/loop";
```

Replace with:

```typescript
import { NextRequest } from "next/server";
import { runAgentLoop } from "@/lib/agent/loop";
import { postV2 } from "@/lib/agent/v2/route-handler";
```

Then find:

```typescript
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
```

Replace with:

```typescript
export async function POST(req: NextRequest) {
  if (process.env.THUMBGEN_AGENT_V2 === "1") {
    return postV2(req);
  }

  const body = (await req.json().catch(() => null)) as
```

Everything else in the file (the v1 body, `sseFormat`, the `ReadableStream` construction) stays byte-for-byte unchanged.

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run tests/agent/v2-route-handler.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 6: Run the FULL suite to confirm v1's route tests are unaffected**

```bash
npx vitest run tests/agent/chat-sse-skeleton.test.ts
```

Expected: PASS, identical to before this task — the v1 body is untouched and `THUMBGEN_AGENT_V2` is unset in the test environment, so every existing assertion exercises the exact same v1 code path as before.

- [ ] **Step 7: Commit**

```bash
git add src/lib/agent/v2/route-handler.ts src/app/api/agent/chat/route.ts tests/agent/v2-route-handler.test.ts
git commit -m "feat(agent-v2): wire streamText into /api/agent/chat behind THUMBGEN_AGENT_V2"
```

---

### Task 9: DB migration script (written + tested, NOT run for real in this plan)

**Files:**
- Create: `scripts/migrate-chat-messages-to-uimessage.ts`
- Test: `tests/agent/migrate-chat-messages.test.ts`

**Interfaces:**
- Consumes: `getDb()` from `@/lib/db` (existing, unchanged) — reads/writes the `messages` table directly.
- Produces: `convertRow(row, toolResultBlocks): ModelMessage[]`, `migrateAllMessages(): {converted: number; errors: number}`. Plan 2's cutover task runs `npx tsx scripts/migrate-chat-messages-to-uimessage.ts` for real, once, before flipping `THUMBGEN_AGENT_V2` to the default.

This also fixes Bug B: v1 never actually attached `_images`/`_summary` onto the persisted `tool_use` block (`loop.ts:264` only ever writes `{type,id,name,input}`) — the real tool-result data (images, summaries) lives in the FOLLOWING row's `tool_result` blocks, which the old UI's `rowToDisplay` explicitly skips. This script reunites each `tool_use` with its `tool_result` by `tool_use_id` before converting, recovering historical tool images instead of leaving them permanently lost.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/agent/migrate-chat-messages.test.ts
import { describe, it, expect } from "vitest";
import { v4 as uuid } from "uuid";
import { createConversation, appendMessage, listMessages } from "@/lib/agent/conversation/store";
import { migrateAllMessages } from "../../scripts/migrate-chat-messages-to-uimessage";

describe("migrateAllMessages", () => {
  it("converts a plain user→assistant turn with no tools", () => {
    const conv = createConversation(`test-migrate-${uuid()}`);
    appendMessage({
      conversation_id: conv.id, role: "user",
      content_json: JSON.stringify([{ type: "text", text: "Salut" }]),
      interrupted: 0, total_input_tokens: 0, total_output_tokens: 0, cost_estimate: 0,
    });
    appendMessage({
      conversation_id: conv.id, role: "assistant",
      content_json: JSON.stringify([{ type: "text", text: "Bonjour !" }]),
      interrupted: 0, total_input_tokens: 10, total_output_tokens: 5, cost_estimate: 0.001,
    });

    const result = migrateAllMessages();
    expect(result.errors).toBe(0);

    const rows = listMessages(conv.id);
    expect(JSON.parse(rows[0].content_json)).toEqual([
      { role: "user", content: [{ type: "text", text: "Salut" }] },
    ]);
    expect(JSON.parse(rows[1].content_json)).toEqual([
      { role: "assistant", content: [{ type: "text", text: "Bonjour !" }] },
    ]);
  });

  it("recovers Bug B: reunites a tool_use with its tool_result (image included)", () => {
    const conv = createConversation(`test-migrate-${uuid()}`);
    appendMessage({
      conversation_id: conv.id, role: "user",
      content_json: JSON.stringify([{ type: "text", text: "Cherche des miniatures" }]),
      interrupted: 0, total_input_tokens: 0, total_output_tokens: 0, cost_estimate: 0,
    });
    appendMessage({
      conversation_id: conv.id, role: "assistant",
      content_json: JSON.stringify([
        { type: "text", text: "Je cherche." },
        { type: "tool_use", id: "call_1", name: "search_youtube", input: { query: "test" } },
      ]),
      interrupted: 0, total_input_tokens: 0, total_output_tokens: 0, cost_estimate: 0,
    });
    appendMessage({
      conversation_id: conv.id, role: "user",
      content_json: JSON.stringify([
        {
          type: "tool_result",
          tool_use_id: "call_1",
          content: [
            { type: "text", text: "[1] Titre" },
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAA=" } },
          ],
        },
      ]),
      interrupted: 0, total_input_tokens: 0, total_output_tokens: 0, cost_estimate: 0,
    });

    const result = migrateAllMessages();
    expect(result.errors).toBe(0);

    const rows = listMessages(conv.id);
    expect(rows).toHaveLength(3);

    const assistantMsgs = JSON.parse(rows[1].content_json) as Array<{ role: string; content: unknown[] }>;
    expect(assistantMsgs).toHaveLength(2); // [assistant text+tool-call, tool result]
    expect(assistantMsgs[0].role).toBe("assistant");
    expect(assistantMsgs[1].role).toBe("tool");
    const toolResultPart = assistantMsgs[1].content[0] as {
      toolCallId: string;
      output: { type: string; value: unknown[] };
    };
    expect(toolResultPart.toolCallId).toBe("call_1");
    expect(toolResultPart.output.value).toContainEqual({
      type: "file", mediaType: "image/jpeg", data: "AAA=",
    });

    // The now-redundant tool_result-only row becomes a no-op, not deleted
    // (preserves row IDs/count for anything that might reference them).
    expect(JSON.parse(rows[2].content_json)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/agent/migrate-chat-messages.test.ts
```

Expected: FAIL with "Cannot find module '../../scripts/migrate-chat-messages-to-uimessage'".

- [ ] **Step 3: Write the implementation**

```typescript
// scripts/migrate-chat-messages-to-uimessage.ts
import type { ModelMessage } from "ai";
import { getDb } from "@/lib/db";

type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: AnthropicBlock[] | string };

type Row = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content_json: string;
  created_at: string;
};

function isToolResultRow(blocks: AnthropicBlock[]): boolean {
  return blocks.length > 0 && blocks.every((b) => b.type === "tool_result");
}

function convertToolResultOutput(content: AnthropicBlock[] | string) {
  if (typeof content === "string") return { type: "text" as const, value: content };
  return {
    type: "content" as const,
    value: content.map((c) =>
      c.type === "text"
        ? { type: "text" as const, text: c.text }
        : c.type === "image"
          ? { type: "file" as const, mediaType: c.source.media_type, data: c.source.data }
          : { type: "text" as const, text: "" },
    ),
  };
}

/**
 * Converts one row's Anthropic-shaped blocks into ModelMessage(s). For an
 * assistant row, `toolResultBlocks` — the IMMEDIATELY FOLLOWING row's blocks,
 * when that row is a tool-result carrier — recovers Bug B (see file header).
 * Returns [] for a tool-result-only row: its data is folded into the
 * PRECEDING assistant row's output by the caller's lookahead, so the row
 * itself becomes a no-op rather than being converted standalone.
 */
export function convertRow(row: Row, toolResultBlocks: AnthropicBlock[] | undefined): ModelMessage[] {
  const blocks = JSON.parse(row.content_json) as AnthropicBlock[];

  if (row.role === "assistant") {
    const content: Array<Record<string, unknown>> = [];
    for (const b of blocks) {
      if (b.type === "text") content.push({ type: "text", text: b.text });
      else if (b.type === "tool_use") {
        content.push({ type: "tool-call", toolCallId: b.id, toolName: b.name, input: b.input });
      }
    }
    const messages: ModelMessage[] = [{ role: "assistant", content } as ModelMessage];

    if (toolResultBlocks) {
      const toolContent = toolResultBlocks
        .filter((b): b is AnthropicBlock & { type: "tool_result" } => b.type === "tool_result")
        .map((b) => {
          const matchingCall = blocks.find(
            (x): x is AnthropicBlock & { type: "tool_use" } => x.type === "tool_use" && x.id === b.tool_use_id,
          );
          return {
            type: "tool-result",
            toolCallId: b.tool_use_id,
            toolName: matchingCall?.name ?? "",
            output: convertToolResultOutput(b.content),
          };
        });
      if (toolContent.length) messages.push({ role: "tool", content: toolContent } as ModelMessage);
    }
    return messages;
  }

  if (isToolResultRow(blocks)) return [];

  // Plain user input row (text/image — first turn or a follow-up message).
  const content: Array<Record<string, unknown>> = [];
  for (const b of blocks) {
    if (b.type === "text") content.push({ type: "text", text: b.text });
    else if (b.type === "image") content.push({ type: "file", mediaType: b.source.media_type, data: b.source.data });
  }
  return [{ role: "user", content } as ModelMessage];
}

export function migrateAllMessages(): { converted: number; errors: number } {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, conversation_id, role, content_json, created_at FROM messages ORDER BY conversation_id, created_at ASC",
    )
    .all() as Row[];

  let converted = 0;
  let errors = 0;
  const update = db.prepare("UPDATE messages SET content_json = ? WHERE id = ?");

  const tx = db.transaction(() => {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const blocks = JSON.parse(row.content_json) as AnthropicBlock[];

      if (row.role === "user" && isToolResultRow(blocks)) {
        // Data folded into the preceding assistant row — this row becomes a no-op.
        update.run("[]", row.id);
        converted++;
        continue;
      }

      try {
        const next = rows[i + 1];
        const nextIsToolResult =
          next &&
          next.conversation_id === row.conversation_id &&
          next.role === "user" &&
          isToolResultRow(JSON.parse(next.content_json) as AnthropicBlock[]);
        const toolResultBlocks = nextIsToolResult
          ? (JSON.parse(next.content_json) as AnthropicBlock[])
          : undefined;
        const messages = convertRow(row, toolResultBlocks);
        update.run(JSON.stringify(messages), row.id);
        converted++;
      } catch (e) {
        console.error(`Failed to convert message ${row.id}:`, e);
        errors++;
      }
    }
  });
  tx();
  return { converted, errors };
}

if (require.main === module) {
  const result = migrateAllMessages();
  console.log(`Migrated ${result.converted} rows, ${result.errors} errors.`);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/agent/migrate-chat-messages.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck against the real installed `ModelMessage` type**

```bash
npx tsc --noEmit
```

Expected: no errors. The `as ModelMessage` casts in Step 3 are deliberately narrow (applied only at each `return`/`push` site) so that if the real installed `ModelMessage` union shape differs from what's hand-written here, this typecheck is what catches it — the compiler is the ground truth for the exact current shape, not this plan's assumption. If it fails, adjust the object literals to match the compiler error, not the other way around.

- [ ] **Step 6: Confirm this script has NOT been run against the real dev database**

```bash
sqlite3 data/thumbgen.db "SELECT content_json FROM messages ORDER BY created_at DESC LIMIT 1" 2>/dev/null || echo "no local db or sqlite3 not installed — either is fine"
```

Expected: if a row is printed, it must still look like Anthropic blocks (`[{"type":"text",...}]` or `[{"type":"tool_use",...}]`), NOT `[{"role":...,"content":...}]`. This script is written and tested here but must only run for real as the first step of Plan 2's cutover — running it now would convert real conversation history to a shape the still-default v1 frontend can no longer read.

- [ ] **Step 7: Commit**

```bash
git add scripts/migrate-chat-messages-to-uimessage.ts tests/agent/migrate-chat-messages.test.ts
git commit -m "feat(agent-v2): write (untested-in-prod) DB migration script, recovers Bug B image data"
```

---

### Task 10: Registry test hygiene

**Files:**
- Modify: `tests/agent/registry-full.test.ts`
- Modify: `tests/agent/mcp-server.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — closes a pre-existing test gap (both files' expected-tool-name arrays predate `list_personas` and `import_youtube_thumbnail`, added earlier this session, and neither test file was updated to cover them).

- [ ] **Step 1: Add the two missing names to `registry-full.test.ts`**

In `tests/agent/registry-full.test.ts`, find:

```typescript
    const expected = [
      "list_logos",
      "list_face_reactions",
      "list_swipe_files",
      "list_projects",
      "list_past_generations",
      "get_canvas_state",
      "apply_workflow",
      "generate_sketch",
      "extract_youtube_script",
      "search_youtube",
      "search_youtube_channel",
      "get_channel_videos",
    ];
```

Replace with:

```typescript
    const expected = [
      "list_logos",
      "list_face_reactions",
      "list_personas",
      "list_swipe_files",
      "list_projects",
      "list_past_generations",
      "get_canvas_state",
      "apply_workflow",
      "generate_sketch",
      "extract_youtube_script",
      "search_youtube",
      "search_youtube_channel",
      "get_channel_videos",
      "import_youtube_thumbnail",
    ];
```

- [ ] **Step 2: Add the two missing names to `mcp-server.test.ts`**

In `tests/agent/mcp-server.test.ts`, find:

```typescript
  it("lists all 11 tools from the registry", async () => {
    const { client } = await connectPair();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    [
      "list_logos",
      "list_face_reactions",
      "list_swipe_files",
      "list_projects",
      "list_past_generations",
      "get_canvas_state",
      "apply_workflow",
      "generate_sketch",
      "extract_youtube_script",
      "search_youtube_channel",
      "get_channel_videos",
    ].forEach((n) => expect(names).toContain(n));
  });
```

Replace with:

```typescript
  it("lists all 13 tools from the registry", async () => {
    const { client } = await connectPair();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    [
      "list_logos",
      "list_face_reactions",
      "list_personas",
      "list_swipe_files",
      "list_projects",
      "list_past_generations",
      "get_canvas_state",
      "apply_workflow",
      "generate_sketch",
      "extract_youtube_script",
      "search_youtube_channel",
      "get_channel_videos",
      "import_youtube_thumbnail",
    ].forEach((n) => expect(names).toContain(n));
  });
```

(Note: `search_youtube` itself is deliberately absent from this specific list — check the current file before editing: if it's present in the array you're replacing, keep it in the replacement too. The count in the test name/description should match the actual number of registered tools — verify with the registry-full test's own count rather than hand-counting.)

- [ ] **Step 3: Run both tests**

```bash
npx vitest run tests/agent/registry-full.test.ts tests/agent/mcp-server.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/agent/registry-full.test.ts tests/agent/mcp-server.test.ts
git commit -m "test: cover list_personas and import_youtube_thumbnail in registry tests"
```

---

### Task 11: Full Plan-1 verification pass

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Full typecheck**

```bash
npx tsc --noEmit
```

Expected: PASS, zero errors.

- [ ] **Step 2: Full test suite**

```bash
npm run test
```

Expected: PASS — every pre-existing test (including `chat-sse-skeleton.test.ts`, `pending-actions.test.ts`, `browser-tools.test.ts`, `mcp-http.test.ts` covering the untouched v1/external-MCP paths) plus every new `v2-*`/`migrate-chat-messages` test from this plan.

- [ ] **Step 3: Lint**

```bash
npm run lint
```

Expected: PASS, zero errors (warnings acceptable only if they pre-date this plan — do not introduce new ones).

- [ ] **Step 4: Manual smoke test of the v2 path with a real OpenRouter key**

```bash
THUMBGEN_AGENT_V2=1 npm run dev
```

With a valid `openrouterApiKey` configured in Settings, POST a minimal request to `/api/agent/chat` (e.g. via `curl` with a fresh `conversation_id`/`project_id` and a simple text message) and confirm: (a) the response has `content-type: text/event-stream`, (b) the stream contains real model output, (c) after it completes, `GET /api/agent/conversations/<id>/messages` shows a persisted assistant row whose `content_json` parses as a JSON array, (d) `cost_estimate` on that row is a non-zero, plausible number. Separately, ask the agent something that would trigger `search_youtube` or `list_logos` and confirm a tool call round-trips successfully. Note the ACTUAL observed web-search behavior (does the model call it 0-N times, or does it always search exactly once?) for Plan 2's design notes.

Also specifically prompt something likely to make the model call `generate_sketch` two or three times in the same turn (e.g. ask for "3 angles différents" the way the system prompt's PROPOSING ANGLES step does) and watch the server logs / Gemini API response timing: confirm whether the calls execute sequentially (matching v1's accidental serialization) or concurrently (spec §6.2 risk — AI SDK may run same-step tool calls in parallel by default, which v1 never actually exercised against the real image-generation provider). Note whichever it is for Plan 2 — a genuine rate-limit risk only exists if it's concurrent.

- [ ] **Step 5: Confirm v1 is still the untouched default**

```bash
unset THUMBGEN_AGENT_V2
npm run dev
```

Manually send one message through the existing chat panel UI exactly as before and confirm it behaves identically to pre-Plan-1 (this exercises `loop.ts` unchanged — no code path introduced by this plan is reachable when the flag is unset).

- [ ] **Step 6: Final commit (if any of the above surfaced fixes)**

```bash
git add -A
git commit -m "chore: Plan 1 verification pass — backend AI SDK migration complete behind flag"
```
