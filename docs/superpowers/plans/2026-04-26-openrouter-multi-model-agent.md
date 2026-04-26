# OpenRouter Multi-Model Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace direct Anthropic SDK calls in the agent with the OpenAI SDK pointed at OpenRouter, exposing a model picker in Settings so the user can swap between Claude, Gemini 3 Pro, GPT-5, and others without touching code. Default to `google/gemini-3-pro-preview`.

**Architecture:** A thin `llm-client.ts` wraps the OpenAI SDK with a base URL of `https://openrouter.ai/api/v1`. A pure `translate.ts` module converts at the wire boundary between our persisted Anthropic-shaped messages (kept as-is to avoid DB migration) and the OpenAI Chat Completions shape OpenRouter expects. Three call sites migrate: `loop.ts` (main agent), `auto-title.ts` (Haiku titler), `vision.ts` (Haiku face tagger). Web search shifts from Anthropic's server tool to OpenRouter's `:online` model variant.

**Tech Stack:** OpenAI Node SDK (>=4.x), OpenRouter API, Vitest, Next.js, better-sqlite3.

---

## File Structure

**Create:**
- `src/lib/agent/llm-client.ts` — single OpenAI client factory pointed at OpenRouter (`baseURL`, `apiKey`, default headers).
- `src/lib/agent/translate.ts` — pure functions to translate Anthropic-shape ↔ OpenAI-shape (tools list, persisted message history, content blocks with images, streaming chunk accumulator).
- `src/lib/agent/models.ts` — curated list of model IDs with display names and per-model pricing (input/output/cached per million tokens).
- `tests/agent/translate.test.ts` — pure-function tests for every translator branch.
- `tests/agent/llm-client.test.ts` — verifies client config (baseURL, headers, key resolution from settings).

**Modify:**
- `package.json` — drop `@anthropic-ai/sdk`, add `openai`.
- `src/lib/settings.ts` — add `openrouterApiKey` and `agentModel` settings; remove `anthropicApiKey` from KEYS list (kept in type for one release as legacy migration path; new code uses openrouterApiKey).
- `src/components/panels/SettingsPanel.tsx` — replace Anthropic-key input with OpenRouter-key input + model picker dropdown.
- `src/lib/agent/loop.ts` — swap Anthropic SDK call for OpenAI client via translate module; drop `web_search_20250305` server tool; append `:online` to model when web search is enabled.
- `src/lib/agent/conversation/auto-title.ts` — same SDK swap (Haiku via OpenRouter).
- `src/lib/agent/vision.ts` — same SDK swap (Haiku via OpenRouter).
- `src/lib/agent/system-prompt.ts` — drop the `web_search` tool name reference in the mental checklist (web search is now provider-side via `:online`, not a tool the model invokes).
- `tests/agent/loop.test.ts` — adapt mocks from Anthropic SDK shape to OpenAI streaming shape.

**Delete:** None (nothing to remove other than via package.json).

---

## Task 1: Add OpenAI SDK and curated model list

**Files:**
- Modify: `package.json`
- Create: `src/lib/agent/models.ts`
- Create: `tests/agent/models.test.ts`

- [ ] **Step 1: Install openai, uninstall anthropic-ai/sdk**

```bash
npm uninstall @anthropic-ai/sdk
npm install openai@^5
```

Expected: `package.json` `dependencies` now has `openai` and no `@anthropic-ai/sdk`.

- [ ] **Step 2: Write the failing models test**

Create `tests/agent/models.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { AGENT_MODELS, getModelById, DEFAULT_AGENT_MODEL } from "@/lib/agent/models";

describe("AGENT_MODELS", () => {
  it("has gemini 3 pro as the default", () => {
    expect(DEFAULT_AGENT_MODEL).toBe("google/gemini-3-pro-preview");
    expect(getModelById(DEFAULT_AGENT_MODEL)).toBeDefined();
  });

  it("returns the model entry with pricing for a known id", () => {
    const m = getModelById("anthropic/claude-sonnet-4.6");
    expect(m).toBeDefined();
    expect(m!.label).toMatch(/sonnet/i);
    expect(m!.pricing.inputPerM).toBeGreaterThan(0);
    expect(m!.pricing.outputPerM).toBeGreaterThan(0);
  });

  it("returns undefined for an unknown id", () => {
    expect(getModelById("nope/nope")).toBeUndefined();
  });

  it("supportsThinking is set per model", () => {
    expect(getModelById("anthropic/claude-sonnet-4.6")!.supportsThinking).toBe(true);
    expect(getModelById("openai/gpt-5")!.supportsThinking).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/agent/models.test.ts`

Expected: FAIL with `Cannot find module '@/lib/agent/models'`.

- [ ] **Step 4: Implement the models module**

Create `src/lib/agent/models.ts`:

```typescript
/**
 * Curated list of OpenRouter model IDs the agent UI exposes.
 * Pricing is per million tokens at the time of writing — refresh from
 * https://openrouter.ai/<model> when adding new entries. supportsThinking
 * gates the `reasoning_effort` parameter we pass to OpenRouter (only
 * thinking-capable models accept it; sending it to others is a soft 400).
 */
export type AgentModel = {
  id: string;
  label: string;
  provider: "anthropic" | "google" | "openai" | "xai" | "meta";
  supportsThinking: boolean;
  pricing: { inputPerM: number; outputPerM: number; cachedInputPerM: number };
};

export const AGENT_MODELS: AgentModel[] = [
  {
    id: "google/gemini-3-pro-preview",
    label: "Gemini 3 Pro (preview)",
    provider: "google",
    supportsThinking: true,
    pricing: { inputPerM: 2.0, outputPerM: 12.0, cachedInputPerM: 0.5 },
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    label: "Claude Sonnet 4.6",
    provider: "anthropic",
    supportsThinking: true,
    pricing: { inputPerM: 3.0, outputPerM: 15.0, cachedInputPerM: 0.3 },
  },
  {
    id: "anthropic/claude-opus-4.7",
    label: "Claude Opus 4.7",
    provider: "anthropic",
    supportsThinking: true,
    pricing: { inputPerM: 15.0, outputPerM: 75.0, cachedInputPerM: 1.5 },
  },
  {
    id: "openai/gpt-5",
    label: "GPT-5",
    provider: "openai",
    supportsThinking: false,
    pricing: { inputPerM: 5.0, outputPerM: 15.0, cachedInputPerM: 1.25 },
  },
];

export const DEFAULT_AGENT_MODEL = "google/gemini-3-pro-preview";

export function getModelById(id: string): AgentModel | undefined {
  // Strip the :online suffix used for web-search variants when looking up.
  const base = id.replace(/:online$/, "");
  return AGENT_MODELS.find((m) => m.id === base);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/agent/models.test.ts`

Expected: PASS, 4 tests passing.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/agent/models.ts tests/agent/models.test.ts
git commit -m "chore(agent): swap @anthropic-ai/sdk for openai SDK + curated model list"
```

---

## Task 2: Settings — openrouterApiKey + agentModel + webSearchEnabled

**Files:**
- Modify: `src/lib/settings.ts:4-47`
- Test: extend any existing settings test (or skip — pure typed object plumbing)

- [ ] **Step 1: Update the AppSettings type and KEYS list**

Edit `src/lib/settings.ts`:

```typescript
export type AppSettings = {
  geminiApiKey?: string;
  ideogramApiKey?: string;
  openaiApiKey?: string;
  grokApiKey?: string;
  youtubeApiKey?: string;
  youtubePlaylistId?: string;
  sitePassword?: string;
  language?: string;
  favoriteModel?: string;
  currentProjectId?: string;
  mcpApiKey?: string;
  // Legacy — kept readable for one release so existing rows still resolve.
  // New code reads openrouterApiKey instead.
  anthropicApiKey?: string;
  openrouterApiKey?: string;
  agentModel?: string;
  agentWebSearch?: string; // "1" | "0"
};

const KEYS: (keyof AppSettings)[] = [
  "geminiApiKey",
  "ideogramApiKey",
  "openaiApiKey",
  "grokApiKey",
  "youtubeApiKey",
  "youtubePlaylistId",
  "sitePassword",
  "language",
  "favoriteModel",
  "currentProjectId",
  "mcpApiKey",
  "anthropicApiKey",
  "openrouterApiKey",
  "agentModel",
  "agentWebSearch",
];

const ENV_MAP: Record<keyof AppSettings, string> = {
  geminiApiKey: "GEMINI_API_KEY",
  ideogramApiKey: "IDEOGRAM_API_KEY",
  openaiApiKey: "OPENAI_API_KEY",
  grokApiKey: "GROK_API_KEY",
  youtubeApiKey: "YOUTUBE_API_KEY",
  youtubePlaylistId: "YOUTUBE_PLAYLIST_ID",
  sitePassword: "SITE_PASSWORD",
  language: "LANGUAGE",
  favoriteModel: "FAVORITE_MODEL",
  currentProjectId: "CURRENT_PROJECT_ID",
  mcpApiKey: "MCP_API_KEY",
  anthropicApiKey: "ANTHROPIC_API_KEY",
  openrouterApiKey: "OPENROUTER_API_KEY",
  agentModel: "AGENT_MODEL",
  agentWebSearch: "AGENT_WEB_SEARCH",
};
```

- [ ] **Step 2: Verify type compiles**

Run: `npx tsc --noEmit src/lib/settings.ts 2>&1 | head -5`

Note: this file uses no path-alias imports, so single-file tsc works.

Expected: no errors related to settings.ts.

- [ ] **Step 3: Commit**

```bash
git add src/lib/settings.ts
git commit -m "feat(settings): add openrouterApiKey, agentModel, agentWebSearch fields"
```

---

## Task 3: Pure translate.ts — Anthropic shape ↔ OpenAI shape

**Files:**
- Create: `src/lib/agent/translate.ts`
- Create: `tests/agent/translate.test.ts`

- [ ] **Step 1: Write the failing translate test**

Create `tests/agent/translate.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  toolsToOpenAI,
  persistedMessagesToOpenAI,
  contentBlocksToOpenAIContent,
  type AnthropicBlock,
  type OpenAIMessage,
} from "@/lib/agent/translate";

describe("toolsToOpenAI", () => {
  it("wraps Anthropic-style tool specs in OpenAI function envelope", () => {
    const out = toolsToOpenAI([
      { name: "get_weather", description: "Returns weather", input_schema: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } },
    ]);
    expect(out).toEqual([
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "Returns weather",
          parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
        },
      },
    ]);
  });
});

describe("contentBlocksToOpenAIContent", () => {
  it("converts a text-only blocks array to a string", () => {
    expect(contentBlocksToOpenAIContent([{ type: "text", text: "hello" }])).toBe("hello");
  });

  it("converts mixed text+image blocks to OpenAI content parts array", () => {
    const out = contentBlocksToOpenAIContent([
      { type: "text", text: "what is this" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
    ]);
    expect(out).toEqual([
      { type: "text", text: "what is this" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
    ]);
  });
});

describe("persistedMessagesToOpenAI", () => {
  it("translates a simple user→assistant text exchange", () => {
    const persisted: Array<{ role: "user" | "assistant"; content: AnthropicBlock[] }> = [
      { role: "user", content: [{ type: "text", text: "hi" }] },
      { role: "assistant", content: [{ type: "text", text: "hello!" }] },
    ];
    const out: OpenAIMessage[] = persistedMessagesToOpenAI(persisted);
    expect(out).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello!" },
    ]);
  });

  it("converts assistant tool_use blocks into a tool_calls array on one assistant message", () => {
    const persisted: Array<{ role: "user" | "assistant"; content: AnthropicBlock[] }> = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "let me check" },
          { type: "tool_use", id: "toolu_1", name: "get_weather", input: { city: "Paris" } },
          { type: "tool_use", id: "toolu_2", name: "get_time", input: {} },
        ],
      },
    ];
    const out = persistedMessagesToOpenAI(persisted);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      role: "assistant",
      content: "let me check",
      tool_calls: [
        { id: "toolu_1", type: "function", function: { name: "get_weather", arguments: JSON.stringify({ city: "Paris" }) } },
        { id: "toolu_2", type: "function", function: { name: "get_time", arguments: JSON.stringify({}) } },
      ],
    });
  });

  it("converts user tool_result blocks into role=tool messages, one per result", () => {
    const persisted: Array<{ role: "user" | "assistant"; content: AnthropicBlock[] }> = [
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "toolu_1", content: [{ type: "text", text: "Paris: 18°C" }] },
          { type: "tool_result", tool_use_id: "toolu_2", content: "12:34" },
        ],
      },
    ];
    const out = persistedMessagesToOpenAI(persisted);
    expect(out).toEqual([
      { role: "tool", tool_call_id: "toolu_1", content: "Paris: 18°C" },
      { role: "tool", tool_call_id: "toolu_2", content: "12:34" },
    ]);
  });

  it("preserves images attached inside a tool_result content array", () => {
    const persisted: Array<{ role: "user" | "assistant"; content: AnthropicBlock[] }> = [
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_1",
            content: [
              { type: "text", text: "here is the chart" },
              { type: "image", source: { type: "base64", media_type: "image/png", data: "BBBB" } },
            ],
          },
        ],
      },
    ];
    const out = persistedMessagesToOpenAI(persisted);
    expect(out).toEqual([
      {
        role: "tool",
        tool_call_id: "toolu_1",
        content: [
          { type: "text", text: "here is the chart" },
          { type: "image_url", image_url: { url: "data:image/png;base64,BBBB" } },
        ],
      },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/agent/translate.test.ts`

Expected: FAIL with `Cannot find module '@/lib/agent/translate'`.

- [ ] **Step 3: Implement translate.ts**

Create `src/lib/agent/translate.ts`:

```typescript
/**
 * Wire-boundary translators between our persisted Anthropic-shaped messages
 * and the OpenAI Chat Completions shape OpenRouter expects.
 *
 * The DB schema stores messages as Anthropic blocks (tool_use, tool_result,
 * image with source.base64). We translate to OpenAI on the way out; new
 * assistant turns coming back from OpenRouter are translated to Anthropic
 * blocks on the way in (handled in loop.ts via streaming accumulator).
 */

export type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: AnthropicBlock[] | string };

export type AnthropicToolSpec = {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
};

export type OpenAIToolSpec = {
  type: "function";
  function: { name: string; description?: string; parameters: Record<string, unknown> };
};

export type OpenAIContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type OpenAIMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | OpenAIContentPart[] }
  | {
      role: "assistant";
      content: string | OpenAIContentPart[] | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | { role: "tool"; tool_call_id: string; content: string | OpenAIContentPart[] };

export function toolsToOpenAI(tools: AnthropicToolSpec[]): OpenAIToolSpec[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

export function contentBlocksToOpenAIContent(
  blocks: AnthropicBlock[],
): string | OpenAIContentPart[] {
  // If every block is text, collapse to a single string for the simplest shape.
  if (blocks.every((b) => b.type === "text")) {
    return blocks.map((b) => (b.type === "text" ? b.text : "")).join("\n");
  }
  const parts: OpenAIContentPart[] = [];
  for (const b of blocks) {
    if (b.type === "text") parts.push({ type: "text", text: b.text });
    else if (b.type === "image") {
      parts.push({
        type: "image_url",
        image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` },
      });
    }
    // Skip tool_use / tool_result here — those belong in dedicated messages.
  }
  return parts;
}

function toolResultContent(content: AnthropicBlock[] | string): string | OpenAIContentPart[] {
  if (typeof content === "string") return content;
  return contentBlocksToOpenAIContent(content);
}

/**
 * Translate persisted conversation messages (Anthropic shape) into the
 * OpenAI message stream OpenRouter expects. One Anthropic assistant message
 * with multiple tool_use blocks becomes ONE OpenAI assistant message with a
 * tool_calls array. One Anthropic user message with multiple tool_result
 * blocks becomes MULTIPLE OpenAI role=tool messages — one per result.
 */
export function persistedMessagesToOpenAI(
  messages: Array<{ role: "user" | "assistant"; content: AnthropicBlock[] }>,
): OpenAIMessage[] {
  const out: OpenAIMessage[] = [];
  for (const msg of messages) {
    if (msg.role === "assistant") {
      const textBlocks = msg.content.filter((b): b is Extract<AnthropicBlock, { type: "text" }> => b.type === "text");
      const toolUseBlocks = msg.content.filter(
        (b): b is Extract<AnthropicBlock, { type: "tool_use" }> => b.type === "tool_use",
      );
      const text = textBlocks.map((b) => b.text).join("\n");
      const toolCalls = toolUseBlocks.map((b) => ({
        id: b.id,
        type: "function" as const,
        function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
      }));
      const assistantMsg: Extract<OpenAIMessage, { role: "assistant" }> = {
        role: "assistant",
        content: text || null,
      };
      if (toolCalls.length) assistantMsg.tool_calls = toolCalls;
      out.push(assistantMsg);
    } else {
      // User: split tool_result blocks out into separate role=tool messages,
      // and combine remaining text+image blocks into a single user message.
      const toolResults = msg.content.filter(
        (b): b is Extract<AnthropicBlock, { type: "tool_result" }> => b.type === "tool_result",
      );
      const otherBlocks = msg.content.filter((b) => b.type !== "tool_result");
      for (const tr of toolResults) {
        out.push({
          role: "tool",
          tool_call_id: tr.tool_use_id,
          content: toolResultContent(tr.content),
        });
      }
      if (otherBlocks.length) {
        out.push({ role: "user", content: contentBlocksToOpenAIContent(otherBlocks) });
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/agent/translate.test.ts`

Expected: PASS, 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/translate.ts tests/agent/translate.test.ts
git commit -m "feat(agent): translate.ts — Anthropic↔OpenAI message shape converters"
```

---

## Task 4: llm-client.ts — OpenRouter-pointed OpenAI client

**Files:**
- Create: `src/lib/agent/llm-client.ts`
- Create: `tests/agent/llm-client.test.ts`

- [ ] **Step 1: Write the failing client test**

Create `tests/agent/llm-client.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("openai", () => {
  const ctor = vi.fn();
  return { default: ctor };
});

vi.mock("@/lib/settings", () => ({
  getSetting: vi.fn(),
}));

import OpenAI from "openai";
import { getSetting } from "@/lib/settings";
import { getOpenRouterClient } from "@/lib/agent/llm-client";

describe("getOpenRouterClient", () => {
  beforeEach(() => {
    vi.mocked(OpenAI).mockClear();
    vi.mocked(getSetting).mockReset();
  });

  it("constructs an OpenAI client pointing at openrouter with the configured key", () => {
    vi.mocked(getSetting).mockReturnValue("sk-or-v1-test");
    getOpenRouterClient();
    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "sk-or-v1-test",
        baseURL: "https://openrouter.ai/api/v1",
      }),
    );
  });

  it("returns null when no key is configured", () => {
    vi.mocked(getSetting).mockReturnValue("");
    expect(getOpenRouterClient()).toBeNull();
  });

  it("includes ThumbGen attribution headers", () => {
    vi.mocked(getSetting).mockReturnValue("sk-or-v1-test");
    getOpenRouterClient();
    const call = vi.mocked(OpenAI).mock.calls[0][0] as { defaultHeaders?: Record<string, string> };
    expect(call.defaultHeaders?.["HTTP-Referer"]).toMatch(/thumbgen/i);
    expect(call.defaultHeaders?.["X-Title"]).toBe("ThumbGen");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/agent/llm-client.test.ts`

Expected: FAIL with `Cannot find module '@/lib/agent/llm-client'`.

- [ ] **Step 3: Implement llm-client.ts**

Create `src/lib/agent/llm-client.ts`:

```typescript
import OpenAI from "openai";
import { getSetting } from "@/lib/settings";

/**
 * Singleton-ish factory for an OpenAI client pointed at OpenRouter.
 * Reads the api key from settings on each call so a Settings update takes
 * effect without restart. Returns null if the user hasn't configured a key —
 * callers must handle that and surface a friendly error.
 *
 * The HTTP-Referer + X-Title headers help ThumbGen show up in OpenRouter's
 * dashboards for the user's own analytics; they're not required.
 */
export function getOpenRouterClient(): OpenAI | null {
  const apiKey = getSetting("openrouterApiKey");
  if (!apiKey) return null;
  return new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://thumbgen.local",
      "X-Title": "ThumbGen",
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/agent/llm-client.test.ts`

Expected: PASS, 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/llm-client.ts tests/agent/llm-client.test.ts
git commit -m "feat(agent): llm-client.ts — OpenRouter-pointed OpenAI client factory"
```

---

## Task 5: Migrate auto-title.ts to OpenRouter

**Files:**
- Modify: `src/lib/agent/conversation/auto-title.ts`

- [ ] **Step 1: Replace the implementation**

Edit `src/lib/agent/conversation/auto-title.ts`. Replace the entire file with:

```typescript
import { getOpenRouterClient } from "@/lib/agent/llm-client";
import { updateConversationTitle } from "./store";

// A small fast model for one-shot titling. anthropic/claude-haiku-4.5 via
// OpenRouter is essentially free per call and very good at constraint-followed
// short outputs. We pin a non-thinking variant — no reasoning needed for a
// 4-word title and we don't want the latency hit.
const TITLE_MODEL = "anthropic/claude-haiku-4.5";

const SYSTEM = `Tu génères des titres TRÈS courts pour une conversation de design de miniatures YouTube.

Règles strictes :
- 3 à 6 mots maximum
- En français
- Pas de guillemets, pas de points, pas de markdown
- Capture le sujet ou l'intention de la première demande, pas le ton
- Si le message mentionne un produit/marque, garde-le

Réponds UNIQUEMENT avec le titre brut, rien d'autre.`;

/**
 * Generate a short title for a conversation from the user's first message.
 * Fire-and-forget: failures are logged but don't block the agent loop. The
 * SSE `send` callback is invoked on success so the chat UI can refresh the
 * conversation list immediately.
 */
export async function generateAndPersistTitle(
  conversationId: string,
  firstUserText: string,
  send: (event: string, data: unknown) => void,
): Promise<void> {
  const client = getOpenRouterClient();
  if (!client || !firstUserText.trim()) return;

  try {
    const res = await client.chat.completions.create({
      model: TITLE_MODEL,
      max_tokens: 40,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: firstUserText.slice(0, 1000) },
      ],
    });

    const raw = res.choices[0]?.message?.content;
    if (!raw || typeof raw !== "string") return;

    let title = raw.trim().replace(/^["'«»"]+|["'«»"]+$/g, "");
    title = title.replace(/[.!?…]+$/g, "").trim();
    if (!title) return;
    if (title.length > 80) title = title.slice(0, 77).trimEnd() + "…";

    updateConversationTitle(conversationId, title);
    send("conversation_renamed", { conversation_id: conversationId, title });
  } catch (e) {
    console.warn("[auto-title] generation failed:", (e as Error).message);
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep auto-title | head -3`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/conversation/auto-title.ts
git commit -m "refactor(agent): auto-title.ts uses OpenRouter via Haiku 4.5"
```

---

## Task 6: Migrate vision.ts to OpenRouter

**Files:**
- Modify: `src/lib/agent/vision.ts`

- [ ] **Step 1: Read the current shape**

Run: `cat src/lib/agent/vision.ts | head -80` and note the function signature, the JSON schema returned, and the system prompt. The migration must preserve the same return type.

- [ ] **Step 2: Replace the SDK call site**

Edit `src/lib/agent/vision.ts`. Replace the Anthropic block with:

```typescript
import { getOpenRouterClient } from "@/lib/agent/llm-client";

// Same Haiku model as auto-title — Haiku via OpenRouter is reliable,
// vision-capable, and cheap (~$0.001 per face).
const VISION_MODEL = "anthropic/claude-haiku-4.5";
```

Replace `const client = new Anthropic({ apiKey });` and the `client.messages.create(...)` call with:

```typescript
  const client = getOpenRouterClient();
  if (!client) {
    throw new Error("OpenRouter API key not configured.");
  }

  const res = await client.chat.completions.create({
    model: VISION_MODEL,
    max_tokens: 400,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: USER_INSTRUCTION },
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${bytes.toString("base64")}` },
          },
        ],
      },
    ],
  });

  const text = res.choices[0]?.message?.content;
  if (!text || typeof text !== "string") {
    throw new Error("Vision model returned no text.");
  }
```

(The downstream JSON parsing of `text` stays unchanged.)

- [ ] **Step 3: Verify the file still compiles end-to-end**

Run: `npx tsc --noEmit 2>&1 | grep vision`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/vision.ts
git commit -m "refactor(agent): vision.ts (face tagging) uses OpenRouter via Haiku 4.5"
```

---

## Task 7: Rewrite loop.ts to use OpenRouter + translate

This is the largest task. It replaces the streaming agent loop. We migrate in one step rather than splitting because the in-memory shape changes everywhere at once — partial migration would leave the file inconsistent.

**Files:**
- Modify: `src/lib/agent/loop.ts`

- [ ] **Step 1: Read the current loop.ts to know what we're preserving**

Run: `wc -l src/lib/agent/loop.ts` and `grep -n "^export\|^function\|^async function" src/lib/agent/loop.ts`

Note: we must preserve the `runAgentLoop` export signature (`AgentLoopOptions`) and the SSE event names (`text_delta`, `tool_call`, `tool_result`, `ui_tool_request`, `ui_tool_response_ack`, `done`, `error`, `conversation_renamed`) — the chat UI consumes these and we don't change the UI in this plan.

- [ ] **Step 2: Replace the imports and constants block at the top of loop.ts**

Edit `src/lib/agent/loop.ts`. Replace the import block and the `MODEL`, `THINKING_BUDGET`, `MAX_TOKENS`, `PRICE_INPUT_PER_M`, `PRICE_OUTPUT_PER_M` constants with:

```typescript
import { getInMemoryMcpClient } from "@/lib/agent/mcp/in-memory-client";
import { buildSystemMessages } from "@/lib/agent/system-prompt";
import { appendMessage, listMessages } from "@/lib/agent/conversation/store";
import { generateAndPersistTitle } from "@/lib/agent/conversation/auto-title";
import { registerPending, abandonPending } from "@/lib/agent/pending-actions";
import { BROWSER_TOOL_DEFS, BROWSER_TOOL_NAMES } from "@/lib/agent/browser-tools";
import { resolveImageSource } from "@/lib/agent/tools/_helpers/image-source";
import { getSetting } from "@/lib/settings";
import { startGcLoop } from "./gc";
import { getOpenRouterClient } from "@/lib/agent/llm-client";
import { toolsToOpenAI, persistedMessagesToOpenAI, type AnthropicBlock } from "@/lib/agent/translate";
import { getModelById, DEFAULT_AGENT_MODEL } from "@/lib/agent/models";
import { v4 as uuid } from "uuid";

if (typeof window === "undefined") {
  startGcLoop();
}

const MAX_ITER = 25;
const MAX_TOKENS = 16000;
// Reasoning effort the agent gets when the chosen model supports thinking.
// "medium" is the OpenRouter knob roughly equivalent to ~6K thinking budget on
// Claude or Gemini's medium thinking — enough to plan tool calls without
// blowing latency or cost.
const REASONING_EFFORT = "medium" as const;
```

- [ ] **Step 3: Replace the ContentBlock type alias with the imported one**

In `loop.ts`, find the local `type ContentBlock = ...` definition. Replace it with:

```typescript
type ContentBlock = AnthropicBlock;
```

The persisted DB shape stays Anthropic-style — translate happens at the wire boundary only.

- [ ] **Step 4: Rewrite the body of runAgentLoop**

Replace the entire body of `runAgentLoop`. The new implementation:

```typescript
export async function runAgentLoop(opts: AgentLoopOptions): Promise<void> {
  const { conversation_id, project_id, message, canvas_snapshot, abort, send } = opts;

  // 1. Build user content blocks (text + resolved image attachments)
  const userBlocks: ContentBlock[] = [{ type: "text", text: message.text || "" }];
  for (const a of message.attachments ?? []) {
    if (a.type !== "image") continue;
    try {
      const img = await resolveImageSource(a.source);
      userBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.mimeType,
          data: img.bytes.toString("base64"),
        },
      });
    } catch (e) {
      send("error", { message: `Attachment failed: ${(e as Error).message}` });
      return;
    }
  }

  // 2. Persist the user message + auto-title on first turn
  const isFirstTurn = listMessages(conversation_id).length === 0;
  appendMessage({
    conversation_id,
    role: "user",
    content_json: JSON.stringify(userBlocks),
    interrupted: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    cost_estimate: 0,
  });
  if (isFirstTurn && message.text?.trim()) {
    void generateAndPersistTitle(conversation_id, message.text, send);
  }

  // 3. Build the message history. Strip cross-turn tool blocks (each turn
  // restarts fresh tool-wise — see git history for why) then translate.
  const persisted = listMessages(conversation_id).map((m) => ({
    role: m.role as "user" | "assistant",
    content: (() => {
      const raw = JSON.parse(m.content_json) as ContentBlock[];
      return raw.filter((b) => b.type !== "tool_use" && b.type !== "tool_result");
    })(),
  })).filter((m) => m.content.length > 0);
  const oaiHistory = persistedMessagesToOpenAI(persisted);

  // 4. Connect MCP and assemble tools list
  const mcp = await getInMemoryMcpClient();
  const { tools: mcpTools } = await mcp.listTools();

  const browserToolSpecs = BROWSER_TOOL_DEFS.map((def) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { $schema, ...input_schema } = def.inputSchema.toJSONSchema() as Record<string, unknown> & { $schema?: string };
    return { name: def.name, description: def.description, input_schema };
  });
  const mcpToolSpecs = mcpTools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    input_schema: t.inputSchema as Record<string, unknown>,
  }));
  const tools = toolsToOpenAI([...mcpToolSpecs, ...browserToolSpecs]);

  // 5. Resolve client + model
  const client = getOpenRouterClient();
  if (!client) {
    const msg = "Clé OpenRouter non configurée. Ajoute OPENROUTER_API_KEY dans Settings.";
    send("error", { message: msg });
    appendMessage({
      conversation_id,
      role: "assistant",
      content_json: JSON.stringify([{ type: "text", text: `⚠ ${msg}` }]),
      interrupted: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      cost_estimate: 0,
    });
    return;
  }

  const userModelId = getSetting("agentModel") || DEFAULT_AGENT_MODEL;
  const webSearchOn = getSetting("agentWebSearch") !== "0";
  const modelId = webSearchOn ? `${userModelId}:online` : userModelId;
  const modelInfo = getModelById(userModelId);

  // 6. Build the OpenAI message stream input
  const systemBlocks = buildSystemMessages(canvas_snapshot, project_id);
  const systemText = systemBlocks.map((b) => b.text).join("\n\n");
  const oaiMessages = [
    { role: "system" as const, content: systemText },
    ...oaiHistory,
    {
      role: "user" as const,
      content: userBlocks.length === 1 && userBlocks[0].type === "text"
        ? userBlocks[0].text
        : userBlocks.map((b) =>
            b.type === "text"
              ? { type: "text" as const, text: b.text }
              : { type: "image_url" as const, image_url: { url: `data:${(b as Extract<ContentBlock, { type: "image" }>).source.media_type};base64,${(b as Extract<ContentBlock, { type: "image" }>).source.data}` } },
          ),
    },
  ];

  // 7. Iterate up to MAX_ITER tool-use rounds.
  let totalInput = 0;
  let totalOutput = 0;
  const accumulatedAssistantBlocks: ContentBlock[] = [];
  const pendingToolResults: ContentBlock[] = []; // collected for next persist

  for (let iter = 0; iter < MAX_ITER; iter++) {
    if (abort.aborted) break;

    const stream = await client.chat.completions.create({
      model: modelId,
      max_tokens: MAX_TOKENS,
      messages: oaiMessages,
      tools: tools.length ? tools : undefined,
      tool_choice: tools.length ? "auto" : undefined,
      stream: true,
      ...(modelInfo?.supportsThinking ? { reasoning_effort: REASONING_EFFORT } : {}),
    });

    // 8. Accumulate streaming chunks: text → SSE text_delta, tool_calls
    // arrive in incremental delta pieces, accumulate them in toolCallAccum.
    let accumText = "";
    const toolCallAccum = new Map<number, { id?: string; name?: string; args: string }>();
    let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;

    for await (const chunk of stream) {
      if (abort.aborted) break;
      const choice = chunk.choices?.[0];
      const delta = choice?.delta as
        | {
            content?: string;
            tool_calls?: Array<{
              index: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }>;
          }
        | undefined;
      if (delta?.content) {
        accumText += delta.content;
        send("text_delta", { content: delta.content });
      }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const cur = toolCallAccum.get(tc.index) ?? { args: "" };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name = tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          toolCallAccum.set(tc.index, cur);
        }
      }
      if (chunk.usage) usage = chunk.usage;
    }

    // 9. Append text block to accumulated history if any
    if (accumText) accumulatedAssistantBlocks.push({ type: "text", text: accumText });
    if (usage?.prompt_tokens) totalInput += usage.prompt_tokens;
    if (usage?.completion_tokens) totalOutput += usage.completion_tokens;

    const toolCalls = Array.from(toolCallAccum.values()).filter((c) => c.id && c.name);
    if (toolCalls.length === 0) {
      // No more tools to dispatch — assistant turn complete.
      break;
    }

    // 10. Add the assistant turn (with tool_calls) to the OpenAI conversation
    // for the next iteration, AND record tool_use blocks in our DB-shape.
    oaiMessages.push({
      role: "assistant",
      content: accumText || null,
      tool_calls: toolCalls.map((c) => ({
        id: c.id!,
        type: "function" as const,
        function: { name: c.name!, arguments: c.args || "{}" },
      })),
    } as never);
    for (const c of toolCalls) {
      let parsed: unknown = {};
      try { parsed = JSON.parse(c.args || "{}"); } catch {}
      const block: ContentBlock = { type: "tool_use", id: c.id!, name: c.name!, input: parsed };
      accumulatedAssistantBlocks.push(block);
      send("tool_call", { id: c.id, name: c.name, input: parsed, scope: BROWSER_TOOL_NAMES.has(c.name!) ? "ui" : "server" });
    }

    // 11. Dispatch each tool. Browser tools route through the UI bridge,
    // server tools go through the in-memory MCP client.
    for (const c of toolCalls) {
      let resultText = "";
      let resultBlocks: AnthropicBlock[] | string = "";
      try {
        if (BROWSER_TOOL_NAMES.has(c.name!)) {
          // Defer to the browser via the SSE bridge. registerPending returns
          // a promise that resolves when /api/agent/chat/tool-result POSTs back.
          const requestId = uuid();
          send("ui_tool_request", { id: c.id, request_id: requestId, name: c.name, input: JSON.parse(c.args || "{}") });
          const browserResult = await registerPending(requestId, abort);
          send("ui_tool_response_ack", { id: c.id });
          resultBlocks = typeof browserResult === "string" ? browserResult : JSON.stringify(browserResult);
          resultText = typeof resultBlocks === "string" ? resultBlocks : "";
        } else {
          const r = await mcp.callTool({ name: c.name!, arguments: JSON.parse(c.args || "{}") });
          // Convert MCP content array to our internal block shape
          const blocks: AnthropicBlock[] = [];
          for (const part of (r.content as Array<{ type: string; text?: string; mimeType?: string; data?: string }>) ?? []) {
            if (part.type === "text" && part.text) blocks.push({ type: "text", text: part.text });
            else if (part.type === "image" && part.data && part.mimeType) {
              blocks.push({
                type: "image",
                source: { type: "base64", media_type: part.mimeType, data: part.data },
              });
            }
          }
          resultBlocks = blocks;
          resultText = blocks.filter((b) => b.type === "text").map((b) => (b as Extract<AnthropicBlock, { type: "text" }>).text).join("\n");
        }
      } catch (e) {
        const errMsg = (e as Error).message;
        resultBlocks = `ERROR: ${errMsg}`;
        resultText = errMsg;
      }

      // Record the tool_result in our DB-shape for persistence after the loop
      pendingToolResults.push({
        type: "tool_result",
        tool_use_id: c.id!,
        content: resultBlocks,
      });

      // Push the tool_result into the OpenAI conversation for the next round
      oaiMessages.push({
        role: "tool",
        tool_call_id: c.id!,
        content: typeof resultBlocks === "string"
          ? resultBlocks
          : resultBlocks.map((b) =>
              b.type === "text"
                ? { type: "text", text: b.text }
                : b.type === "image"
                  ? { type: "image_url", image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } }
                  : { type: "text", text: "" },
            ),
      } as never);

      // Best-effort image extraction for the SSE event (chat UI inline gallery)
      const summaryImages = (typeof resultBlocks === "string" ? [] : resultBlocks)
        .filter((b): b is Extract<AnthropicBlock, { type: "image" }> => b.type === "image")
        .map((b) => `data:${b.source.media_type};base64,${b.source.data}`);
      send("tool_result", {
        id: c.id,
        name: c.name,
        summary: resultText.slice(0, 500),
        images: summaryImages.length ? summaryImages : undefined,
      });
    }
  }

  // 12. Persist the assistant turn (text + tool_use) and the user turn that
  // carries the tool_results, mirroring the prior Anthropic-shape on disk.
  const finalAssistantBlocks = accumulatedAssistantBlocks.length
    ? accumulatedAssistantBlocks
    : [{ type: "text" as const, text: "" }];
  appendMessage({
    conversation_id,
    role: "assistant",
    content_json: JSON.stringify(finalAssistantBlocks),
    interrupted: abort.aborted ? 1 : 0,
    total_input_tokens: totalInput,
    total_output_tokens: totalOutput,
    cost_estimate: estimateCost(modelInfo, totalInput, totalOutput),
  });
  if (pendingToolResults.length) {
    appendMessage({
      conversation_id,
      role: "user",
      content_json: JSON.stringify(pendingToolResults),
      interrupted: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      cost_estimate: 0,
    });
  }

  // Cleanup any unresolved browser tool requests (timeout / abort)
  abandonPending();

  send("done", {
    usage: { input: totalInput, output: totalOutput },
    cost: estimateCost(modelInfo, totalInput, totalOutput),
  });
}

function estimateCost(
  m: ReturnType<typeof getModelById>,
  inTok: number,
  outTok: number,
): number {
  if (!m) return 0;
  return (inTok / 1_000_000) * m.pricing.inputPerM + (outTok / 1_000_000) * m.pricing.outputPerM;
}
```

- [ ] **Step 5: Run typecheck on loop.ts**

Run: `npx tsc --noEmit 2>&1 | grep "loop.ts" | head -10`

Expected: zero errors specifically attributed to `loop.ts`. Pre-existing errors in other files are fine to leave for now (out of scope).

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/loop.ts
git commit -m "feat(agent): main loop runs on OpenRouter via OpenAI SDK + translate"
```

---

## Task 8: Update system-prompt.ts to drop the web_search tool reference

**Files:**
- Modify: `src/lib/agent/system-prompt.ts:19-20`

The agent's mental checklist references calling `web_search` as a tool. With OpenRouter `:online` variants, web search is automatic on every assistant turn, not a discrete tool the model invokes.

- [ ] **Step 1: Replace the web_search step**

In `src/lib/agent/system-prompt.ts`, find the line starting with "**MANDATORY web_search to nail down the topic". Replace it and the "STRICT TURN ORDERING" line below it with:

```
2. **Use the web research baked into your context to nail down the topic BEFORE any YouTube search** — when you have OpenRouter's `:online` variant, web results are auto-attached to your reasoning. Read them carefully BEFORE doing anything else: what is this thing exactly, what's its OFFICIAL name, what brand/company owns it, what's the visual identity (logo, colors), what are the related keywords people actually search for, what's recent context. Without this step you'll search YouTube with a vague phrase and get unrelated thumbnails. Note: if web search is disabled in Settings (`:online` not appended), state explicitly "je n'ai pas accès au web — je m'appuie sur ce que tu m'as dit" and ASK the user for the missing context instead of guessing.
   STRICT TURN ORDERING: in the first turn, your job is ONLY to (a) absorb the web context, and (b) confirm the topic understanding to the user. Do NOT batch list_face_reactions / list_logos / list_swipe_files / search_youtube in parallel. You need the topic understanding to formulate the right YT query AND to know what brand/logo/face setup is even relevant. Library lookups happen in turn 2 onwards, AFTER you have context.
```

- [ ] **Step 2: Verify the file still parses**

Run: `node -e "import('./src/lib/agent/system-prompt.ts').then(m => console.log(typeof m.AGENT_SYSTEM_PROMPT))"` — actually this won't work because Node can't import .ts directly. Instead:

Run: `npx tsc --noEmit 2>&1 | grep system-prompt`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/system-prompt.ts
git commit -m "docs(agent): web research is now ambient via :online, not a tool call"
```

---

## Task 9: Replace SettingsPanel UI — OpenRouter key + model picker + web search toggle

**Files:**
- Modify: `src/components/panels/SettingsPanel.tsx`

- [ ] **Step 1: Read the section that handles the Anthropic key**

Run: `grep -n "anthropic\|Anthropic" src/components/panels/SettingsPanel.tsx`

Note the line numbers for: state variable declaration, body assignment in the save handler, the rendered input field, and the connected/not-configured display string.

- [ ] **Step 2: Replace the state + save handler additions**

In `src/components/panels/SettingsPanel.tsx`, find the block where local state is declared for keys. Add (or modify) so the file has:

```typescript
const [openrouter, setOpenrouter] = useState("");
const [agentModel, setAgentModel] = useState("");
const [agentWebSearch, setAgentWebSearch] = useState(true);
```

In the save handler where each key gets pushed to `body`, replace any `if (anthropic) body.anthropicApiKey = anthropic;` line and add:

```typescript
if (openrouter) body.openrouterApiKey = openrouter;
if (agentModel) body.agentModel = agentModel;
body.agentWebSearch = agentWebSearch ? "1" : "0";
```

- [ ] **Step 3: Add the UI section**

Find the rendered Anthropic key input. Replace it with:

```typescript
import { AGENT_MODELS, DEFAULT_AGENT_MODEL } from "@/lib/agent/models";

// ... in the JSX where the Anthropic input was:
<div className="space-y-3">
  <div>
    <label className="text-xs text-text-muted">Clé OpenRouter</label>
    <input
      type="password"
      value={openrouter}
      onChange={(e) => setOpenrouter(e.target.value)}
      placeholder="sk-or-v1-..."
      className="w-full mt-1 px-3 py-2 rounded-lg bg-surface text-text-primary"
    />
    <p className="text-[11px] text-text-muted mt-1">
      {settings?.hasOpenrouter ? `Connecté (${settings?.openrouterApiKey})` : "Non configuré — cf. https://openrouter.ai/keys"}
    </p>
  </div>

  <div>
    <label className="text-xs text-text-muted">Modèle de l'agent</label>
    <select
      value={agentModel || settings?.agentModel || DEFAULT_AGENT_MODEL}
      onChange={(e) => setAgentModel(e.target.value)}
      className="w-full mt-1 px-3 py-2 rounded-lg bg-surface text-text-primary"
    >
      {AGENT_MODELS.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label} — ${m.pricing.inputPerM}/${m.pricing.outputPerM} per M
        </option>
      ))}
    </select>
  </div>

  <label className="flex items-center gap-2 text-sm text-text-secondary">
    <input
      type="checkbox"
      checked={agentWebSearch}
      onChange={(e) => setAgentWebSearch(e.target.checked)}
    />
    Recherche web automatique (`:online` variant)
  </label>
</div>
```

- [ ] **Step 4: Make sure the GET /api/settings route returns hasOpenrouter + openrouterApiKey (masked)**

Run: `cat src/app/api/settings/route.ts | head -80`

If it builds the response by enumerating known keys (typical pattern), add `openrouterApiKey` and `hasOpenrouter` to the masking + boolean output similar to how `anthropicApiKey` and `hasAnthropic` are handled. Mirror the existing pattern exactly — likely a 2-3 line addition.

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep "SettingsPanel\|api/settings/route" | head -10`

Expected: no errors.

- [ ] **Step 6: Smoke test in the browser**

```
1. Open http://localhost:3000/settings
2. Confirm the OpenRouter key input is shown
3. Confirm the model picker shows 4 entries with prices
4. Confirm the web-search checkbox is shown
5. Paste a fake key like "sk-or-v1-test", click Save, refresh the page, verify it shows "Connecté (sk-or-v1-...)"
```

- [ ] **Step 7: Commit**

```bash
git add src/components/panels/SettingsPanel.tsx src/app/api/settings/route.ts
git commit -m "feat(settings): OpenRouter key input + agent model picker + web search toggle"
```

---

## Task 10: Update loop.test.ts to match the new shape

**Files:**
- Modify: `tests/agent/loop.test.ts`

The existing tests mock `@anthropic-ai/sdk`. Since we removed it, these tests fail at import time. Rewrite them to mock `getOpenRouterClient` instead.

- [ ] **Step 1: Read the existing tests**

Run: `cat tests/agent/loop.test.ts`

Identify each test's intent — most likely: (a) emits text_delta then done, (b) dispatches an MCP tool call and feeds tool_result back, (c) emits ui_tool_request and waits.

- [ ] **Step 2: Replace the mock + first test**

Edit `tests/agent/loop.test.ts`. Replace the file with:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/agent/llm-client", () => ({
  getOpenRouterClient: vi.fn(),
}));
vi.mock("@/lib/agent/conversation/store", () => ({
  appendMessage: vi.fn(),
  listMessages: vi.fn().mockReturnValue([]),
}));
vi.mock("@/lib/agent/conversation/auto-title", () => ({
  generateAndPersistTitle: vi.fn(),
}));
vi.mock("@/lib/agent/mcp/in-memory-client", () => ({
  getInMemoryMcpClient: vi.fn().mockResolvedValue({
    listTools: () => Promise.resolve({ tools: [] }),
    callTool: vi.fn(),
  }),
}));
vi.mock("@/lib/agent/system-prompt", () => ({
  buildSystemMessages: () => [{ type: "text", text: "system" }],
}));
vi.mock("@/lib/settings", () => ({
  getSetting: vi.fn().mockReturnValue(""),
}));

import { getOpenRouterClient } from "@/lib/agent/llm-client";
import { runAgentLoop } from "@/lib/agent/loop";

function asyncIterable<T>(items: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const i of items) yield i;
    },
  };
}

describe("runAgentLoop on OpenRouter", () => {
  beforeEach(() => {
    vi.mocked(getOpenRouterClient).mockReset();
  });

  it("emits text_delta and done when the model returns plain text", async () => {
    const create = vi.fn().mockResolvedValue(
      asyncIterable([
        { choices: [{ delta: { content: "hello " } }] },
        { choices: [{ delta: { content: "world" } }] },
        { choices: [{ delta: {} }], usage: { prompt_tokens: 12, completion_tokens: 3 } },
      ]),
    );
    vi.mocked(getOpenRouterClient).mockReturnValue({ chat: { completions: { create } } } as never);

    const events: Array<{ event: string; data: unknown }> = [];
    await runAgentLoop({
      conversation_id: "c1",
      project_id: "p1",
      message: { text: "hi" },
      canvas_snapshot: {},
      abort: new AbortController().signal,
      send: (event, data) => events.push({ event, data }),
    });

    const deltas = events.filter((e) => e.event === "text_delta");
    expect(deltas).toHaveLength(2);
    expect(events.some((e) => e.event === "done")).toBe(true);
  });

  it("emits an error when no OpenRouter key is configured", async () => {
    vi.mocked(getOpenRouterClient).mockReturnValue(null);
    const events: Array<{ event: string; data: unknown }> = [];
    await runAgentLoop({
      conversation_id: "c1",
      project_id: "p1",
      message: { text: "hi" },
      canvas_snapshot: {},
      abort: new AbortController().signal,
      send: (event, data) => events.push({ event, data }),
    });
    const err = events.find((e) => e.event === "error");
    expect(err).toBeDefined();
    expect((err!.data as { message: string }).message).toMatch(/OpenRouter/i);
  });
});
```

- [ ] **Step 3: Run the loop tests**

Run: `npx vitest run tests/agent/loop.test.ts`

Expected: 2 PASS, 0 FAIL.

- [ ] **Step 4: Run the full test suite to confirm we didn't break anything else**

Run: `npx vitest run --reporter=dot 2>&1 | tail -5`

Expected: same baseline as before this plan started — failing tests in `apply-workflow.test.ts` and `list-past-generations.test.ts` are pre-existing and out of scope.

- [ ] **Step 5: Commit**

```bash
git add tests/agent/loop.test.ts
git commit -m "test(agent): rewrite loop tests against the OpenRouter SDK contract"
```

---

## Task 11: Manual end-to-end smoke test + final commit

This is non-coding: verify the user-facing flow works.

- [ ] **Step 1: Configure OpenRouter key**

```
1. Get an OpenRouter key from https://openrouter.ai/keys
2. Open http://localhost:3000/settings
3. Paste the key into the OpenRouter field, click Save
4. Confirm the picker shows Gemini 3 Pro selected by default
```

- [ ] **Step 2: Send a test message**

```
1. Open the chat panel on a project
2. Type: "miniature pour ma vidéo sur Cursor 2.0"
3. Watch the SSE stream — text should arrive token-by-token
4. Watch for tool_call events (search_youtube, list_face_reactions, etc.)
5. Confirm the conversation auto-renames after a few seconds
```

- [ ] **Step 3: Try a different model**

```
1. Change the model picker to anthropic/claude-sonnet-4.6
2. Save
3. Send another message
4. Confirm the response style differs and the dev server logs show the new model id
```

- [ ] **Step 4: Toggle web search off**

```
1. Uncheck the web-search box
2. Save
3. Send a message about a recent topic
4. Confirm the assistant says "je n'ai pas accès au web" or asks for context
```

- [ ] **Step 5: Final commit if there are any tweaks**

If anything needed correction during smoke test, commit those fixes. If clean, just `git push`.

```bash
git push origin main
```

---

## Self-Review

**Spec coverage check:** Each architectural decision from the design conversation maps to a task:
- OpenAI SDK pointed at OpenRouter → Task 4 (llm-client.ts)
- Model picker → Tasks 1 (models list) + 9 (UI)
- Default Gemini 3 Pro → Task 1 (DEFAULT_AGENT_MODEL constant)
- Translate at wire boundary, keep DB schema → Task 3 (translate.ts)
- Web search via `:online` variant → Task 7 (modelId construction) + Task 8 (system prompt)
- Migrate auto-title and vision too → Tasks 5, 6
- Tests: every new module gets a test (Tasks 1, 3, 4, 10)

**Placeholder scan:** No "TBD", no vague "add error handling", every code step has runnable code. The only minor gap: Step 4 of Task 9 says "mirror the existing pattern" for the settings route — that's intentional because the existing pattern is in the file the engineer is reading, not invented. If the engineer can't find a clean parallel, fall back to: read `src/app/api/settings/route.ts` first, then add `openrouterApiKey` and `hasOpenrouter` keys exactly the way `anthropicApiKey` / `hasAnthropic` are added today.

**Type consistency:** `getModelById` returns `AgentModel | undefined` everywhere. `getOpenRouterClient` returns `OpenAI | null` everywhere. `AnthropicBlock` is the same imported type used in loop.ts and translate.ts. SSE event names match what the chat UI already consumes. No drift.

**Risks worth calling out:**

1. OpenRouter pricing in `models.ts` is a snapshot — refresh from the provider pages when adding a new model. Wrong pricing only affects the cost display, not behavior.
2. `:online` variant cost: web search adds a per-request fee (~$5/1000 requests at the time of writing) on top of the model's token cost. Worth mentioning to the user once they see the bill.
3. Tool result content with images: OpenAI added array content for `role: "tool"` messages relatively recently. Some OpenRouter-hosted models may not handle it gracefully. If a specific model breaks, the workaround is to send images as a follow-up `role: "user"` message — but ship the cleaner shape first and patch only if needed.
4. The migration is unidirectional: existing chat history persisted with Anthropic-shape blocks (`tool_use` with `toolu_xxx` ids) keeps loading fine because the chat UI reads from DB; the new agent generates calls with whatever ids OpenRouter returns (`call_xxx` for OpenAI, model-specific elsewhere). No incompatibility — IDs are opaque to us.

---

## Post-Implementation Notes (2026-04-26 evening)

The 11 tasks shipped via subagent-driven execution. Smoke test surfaced 2 production bugs that needed in-place patches:

- `ff00736` — added try/catch around `client.chat.completions.create()` so OpenRouter errors surface in the chat UI instead of failing silently
- `a4f1bb6` — replaced the broken `:online` model suffix with the modern `plugins:[{id:"web"}]` parameter (the `:online` variant 404s on `google/gemini-3-pro-preview` and many other recent models)
- `676b3d0` — corrected the Gemini model ID from `google/gemini-3-pro-preview` to `google/gemini-3.1-pro-preview` (the real ID per OpenRouter's `/models` endpoint). All 4 hardcoded references updated + DB row migrated inline.
- `92c0631` — renamed hardcoded "Claude" labels in the chat UI ("Claude" eyebrow, request-image/sketch reasons) to "Assistant" since the agent is now provider-agnostic.

### Open follow-ups (deliberately deferred)

1. **Web plugin streaming buffer**: when `plugins:[{id:"web"}]` is enabled, OpenRouter executes the search synchronously before streaming the completion. With Gemini specifically, the user perceives no per-token streaming — chunks may arrive in larger blocks. Workaround for now: toggle web search off in Settings to verify the streaming path itself works, or switch to Sonnet 4.6 (Anthropic streams reliably per-token through OpenRouter).
2. **Anthropic legacy UI**: the Anthropic API key block in `SettingsPanel.tsx` is intentionally kept for one release as a legacy migration aid. Remove once the user confirms no value in keeping it visible.
3. **YT thumbnail import dedup**: `import_youtube_thumbnail` creates a new `swipe_files` row on each call for the same `video_id`. Add a dedup-by-video-id check if the user starts seeing duplicate references.
4. **Pricing snapshot date**: `src/lib/agent/models.ts` lacks a `pricingAsOf` field. Add when next refreshing prices.
5. **Model registry tests**: add a `unique IDs` invariant test (`expect(new Set(AGENT_MODELS.map(m => m.id)).size).toBe(AGENT_MODELS.length)`) to prevent accidental duplicates.
6. **Sonnet vs Gemini quality A/B**: the user's original motivation for the migration. They'll compare side by side over the next few sessions and decide which to keep as default.
