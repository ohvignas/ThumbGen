# ThumbGen Agent + MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a right-side chat panel where Claude Sonnet 4.6 acts as a conversational agent that builds/modifies the canvas workflow via tools, and expose the same tool surface as an MCP server consumable by remote Claude clients.

**Architecture:** Pure-function tool registry → MCP server (in-memory transport for browser, Streamable HTTP for remote) → browser agent loop with SSE streaming + UI-only tools (request_user_image, request_user_sketch). Single `apply_workflow` tool with blueprint JSON for all canvas mutations.

**Tech Stack:** Next.js 16 App Router, React 19, Zustand, React Flow, better-sqlite3, `@anthropic-ai/sdk`, `@modelcontextprotocol/sdk`, `openai` (Whisper), `zod`, `youtube-transcript`, `@dagrejs/dagre`.

**Spec:** `docs/superpowers/specs/2026-04-25-thumbgen-agent-design.md` — read this first.

**Milestones:**
- M1 (Tasks 1-4): Foundations — deps, DB schema, settings, blueprint schema
- M2 (Tasks 5-12): Tool registry — pure functions, fully tested
- M3 (Tasks 13-15): MCP server — in-memory + HTTP+bearer
- M4 (Tasks 16-22): Browser agent backend — SSE chat, transcribe, suspend/resume
- M5 (Tasks 23-31): Chat panel UI
- M6 (Tasks 32-35): Settings, GC, polish, docs

---

## File Structure

**New files:**
```
src/lib/agent/
├── tools/
│   ├── index.ts                       # Registry { name → { schema, description, handler } }
│   ├── types.ts                       # Shared types (ToolHandler, ImageSource, etc.)
│   ├── _helpers/
│   │   ├── image-source.ts            # Resolve ImageSource string to bytes
│   │   ├── thumbnail.ts               # Generate small previews
│   │   └── auto-layout.ts             # Dagre layout for blueprint nodes
│   ├── get-canvas-state.ts
│   ├── get-node-details.ts
│   ├── apply-workflow.ts              # Server-side: validation + persist to projects table
│   ├── list-face-references.ts
│   ├── list-logos.ts
│   ├── list-swipe-files.ts
│   ├── list-face-reactions.ts
│   ├── list-projects.ts
│   ├── list-past-generations.ts
│   ├── generate-sketch.ts
│   ├── remix-image.ts
│   ├── edit-image.ts
│   ├── trigger-generation.ts
│   ├── extract-youtube-script.ts
│   ├── search-youtube-channel.ts
│   └── get-channel-videos.ts
├── blueprint/
│   ├── schema.ts                      # Zod schema for Blueprint, NodeData, ImageSource
│   └── diff.ts                        # Pure diff(current, target) → operations[]
├── mcp/
│   ├── server.ts                      # Build McpServer from registry
│   └── in-memory-client.ts            # Helper for browser agent loop
├── browser-tools/
│   ├── request-user-image.ts          # UI-only tool definition + suspend/resume
│   └── request-user-sketch.ts
├── conversation/
│   ├── store.ts                       # DB read/write for conversations & messages
│   └── cost.ts                        # Cost calculation (anthropic + tools)
├── system-prompt.ts                   # Static system prompt for the agent
└── transcribe.ts                      # Whisper wrapper

src/app/api/
├── agent/
│   ├── chat/
│   │   ├── route.ts                   # POST SSE — main agent loop
│   │   └── tool-result/route.ts       # POST — receive UI-tool results
│   ├── transcribe/route.ts            # POST multipart — Whisper
│   └── conversations/
│       ├── route.ts                   # GET (list), POST (create)
│       └── [id]/
│           ├── route.ts               # DELETE (soft)
│           └── messages/route.ts      # GET (load history)
├── mcp/route.ts                       # POST + GET — Streamable HTTP MCP
└── chat-uploads/
    ├── route.ts                       # POST upload
    └── [id]/route.ts                  # GET image bytes

src/components/panels/
├── ChatPanel.tsx                      # Main panel container
├── chat/
│   ├── ConversationList.tsx
│   ├── MessageList.tsx
│   ├── Message.tsx
│   ├── ToolCallCard.tsx
│   ├── PendingUiAction.tsx
│   ├── Composer.tsx
│   ├── AttachButton.tsx
│   ├── MicButton.tsx
│   └── LibraryPickerModal.tsx
└── settings/
    └── McpSettingsSection.tsx         # Bearer token UI, embedded in SettingsPanel

src/hooks/
├── useChat.ts                         # SSE consumer + state machine
├── useCanvasSync.ts                   # Polling projects.updated_at
└── useMediaRecorder.ts                # Audio capture wrapper

src/store/
└── chat-store.ts                      # Zustand: open/closed, active conv, draft

scripts/
├── migrate-agent-tables.ts            # SQLite migration for new tables
└── gc-chat-uploads.ts                 # GC job (run via cron or on startup)

tests/
└── agent/                             # Vitest tests (one file per tool + integration)
```

**Modified files:**
```
src/lib/db.ts                          # +new tables init
src/lib/settings.ts                    # +mcp_api_key auto-gen
src/components/Canvas.tsx              # mount ChatPanel, wire toggle
src/components/panels/SidebarRail.tsx  # +chat button
src/components/panels/SettingsPanel.tsx # +McpSettingsSection
src/store/canvas-store.ts              # +applyBlueprint action (animated)
package.json                           # +deps
```

---

## Task 1: Add dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime deps**

```bash
npm install @anthropic-ai/sdk @modelcontextprotocol/sdk openai zod youtube-transcript @dagrejs/dagre
```

- [ ] **Step 2: Install dev deps for tests**

```bash
npm install -D vitest @vitest/ui happy-dom
```

- [ ] **Step 3: Add test scripts**

In `package.json` `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Create `vitest.config.ts` at project root**

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: [],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
```

- [ ] **Step 5: Verify install**

```bash
npm run test -- --version
```
Expected: prints vitest version.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "feat(deps): add anthropic sdk, mcp sdk, openai, zod, vitest"
```

---

## Task 2: SQLite migration for new tables

**Files:**
- Create: `scripts/migrate-agent-tables.ts`
- Modify: `src/lib/db.ts:18-95` (the `init` function — add new CREATE TABLE statements)

- [ ] **Step 1: Write migration script**

```typescript
// scripts/migrate-agent-tables.ts
import { getDb } from "../src/lib/db";

const db = getDb();
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL,
    title       TEXT NOT NULL DEFAULT 'Nouvelle conversation',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_conv_project ON conversations(project_id, deleted_at);

  CREATE TABLE IF NOT EXISTS messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role            TEXT NOT NULL,
    content_json    TEXT NOT NULL,
    interrupted     INTEGER NOT NULL DEFAULT 0,
    total_input_tokens   INTEGER NOT NULL DEFAULT 0,
    total_output_tokens  INTEGER NOT NULL DEFAULT 0,
    cost_estimate   REAL NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  );
  CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at);

  CREATE TABLE IF NOT EXISTS chat_uploads (
    id          TEXT PRIMARY KEY,
    mime_type   TEXT NOT NULL,
    size        INTEGER NOT NULL,
    data        BLOB NOT NULL,
    attached    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_chat_uploads_attached ON chat_uploads(attached, created_at);

  CREATE TABLE IF NOT EXISTS generated_sketches (
    id          TEXT PRIMARY KEY,
    prompt      TEXT NOT NULL,
    mime_type   TEXT NOT NULL,
    data        BLOB NOT NULL,
    attached    INTEGER NOT NULL DEFAULT 0,
    cost_estimate REAL NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_sketches_attached ON generated_sketches(attached, created_at);
`);
console.log("Migration done.");
```

- [ ] **Step 2: Mirror the same DDL inside `init()` of `src/lib/db.ts`**

In `src/lib/db.ts`, in the `init` function after the existing `database.exec(...)` block, append the same CREATE TABLE / INDEX statements (so a fresh DB also gets them).

- [ ] **Step 3: Run migration**

```bash
npx tsx scripts/migrate-agent-tables.ts
```
Expected: `Migration done.`

- [ ] **Step 4: Verify schema**

```bash
sqlite3 data/thumbgen.db ".schema conversations messages chat_uploads generated_sketches"
```
Expected: prints the 4 CREATE TABLE statements.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-agent-tables.ts src/lib/db.ts
git commit -m "feat(db): add conversations, messages, chat_uploads, generated_sketches tables"
```

---

## Task 3: Settings — auto-generate MCP API key

**Files:**
- Modify: `src/lib/settings.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/agent/settings.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { ensureMcpApiKey, getMcpApiKey, regenerateMcpApiKey } from "@/lib/settings";

describe("MCP API key", () => {
  it("auto-generates on first ensureMcpApiKey", () => {
    const key1 = ensureMcpApiKey();
    expect(key1).toMatch(/^tg_[a-f0-9]{64}$/);
    const key2 = ensureMcpApiKey();
    expect(key2).toBe(key1);
  });

  it("regenerates on demand", () => {
    const before = ensureMcpApiKey();
    const after = regenerateMcpApiKey();
    expect(after).not.toBe(before);
    expect(getMcpApiKey()).toBe(after);
  });
});
```

- [ ] **Step 2: Run — should fail (functions don't exist)**

```bash
npm test -- tests/agent/settings.test.ts
```
Expected: FAIL with import error.

- [ ] **Step 3: Implement**

Add to `src/lib/settings.ts` (after existing exports):
```typescript
import crypto from "crypto";

const MCP_KEY_SETTING = "mcp_api_key";

export function getMcpApiKey(): string | null {
  return getSetting(MCP_KEY_SETTING);
}

export function ensureMcpApiKey(): string {
  const existing = getMcpApiKey();
  if (existing) return existing;
  const key = `tg_${crypto.randomBytes(32).toString("hex")}`;
  setSetting(MCP_KEY_SETTING, key);
  return key;
}

export function regenerateMcpApiKey(): string {
  const key = `tg_${crypto.randomBytes(32).toString("hex")}`;
  setSetting(MCP_KEY_SETTING, key);
  return key;
}
```

(Inspect `src/lib/settings.ts` to confirm `getSetting` / `setSetting` signatures match — adapt names if needed.)

- [ ] **Step 4: Run — should pass**

```bash
npm test -- tests/agent/settings.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings.ts tests/agent/settings.test.ts
git commit -m "feat(settings): auto-generate and regenerate MCP API key"
```

---

## Task 4: Blueprint Zod schema

**Files:**
- Create: `src/lib/agent/blueprint/schema.ts`
- Create: `tests/agent/blueprint-schema.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/agent/blueprint-schema.test.ts
import { describe, it, expect } from "vitest";
import { BlueprintSchema, ImageSourceSchema } from "@/lib/agent/blueprint/schema";

describe("ImageSource", () => {
  it.each([
    "stored:fc_abc123",
    "stored:lg_xyz",
    "stored:sf_aaa",
    "stored:fr_bbb",
    "stored:gi_ccc",
    "generated:sk_123",
    "uploaded:up_456",
    "data:image/png;base64,iVBORw0KGgo=",
  ])("accepts %s", (s) => {
    expect(ImageSourceSchema.safeParse(s).success).toBe(true);
  });

  it.each([
    "stored:invalid_prefix",
    "https://example.com/x.png",
    "fc_abc",
    "",
  ])("rejects %s", (s) => {
    expect(ImageSourceSchema.safeParse(s).success).toBe(false);
  });
});

describe("Blueprint", () => {
  it("accepts a minimal generator-only blueprint", () => {
    const bp = {
      nodes: [
        { id: "gen-1", type: "generator", data: { model: "ideogram", aspectRatio: "16x9" } },
      ],
      edges: [],
    };
    expect(BlueprintSchema.safeParse(bp).success).toBe(true);
  });

  it("rejects edges referencing missing node ids", () => {
    const bp = {
      nodes: [{ id: "p-1", type: "prompt", data: { prompt: "hi" } }],
      edges: [{ source: "p-1", target: "missing", targetHandle: "prompt-in" }],
    };
    const result = BlueprintSchema.safeParse(bp);
    expect(result.success).toBe(false);
  });

  it("rejects faceReference without image_source", () => {
    const bp = {
      nodes: [{ id: "f-1", type: "faceReference", data: {} }],
      edges: [],
    };
    expect(BlueprintSchema.safeParse(bp).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run — fails (file missing)**

```bash
npm test -- tests/agent/blueprint-schema.test.ts
```

- [ ] **Step 3: Implement schema**

```typescript
// src/lib/agent/blueprint/schema.ts
import { z } from "zod";

export const ImageSourceSchema = z.string().refine(
  (s) =>
    /^stored:(fc|lg|sf|fr|gi)_[\w-]+$/.test(s) ||
    /^generated:[\w-]+$/.test(s) ||
    /^uploaded:[\w-]+$/.test(s) ||
    /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(s),
  { message: "Invalid ImageSource" }
);

const NodeDataByType = z.discriminatedUnion("type", [
  z.object({ type: z.literal("faceReference"), image_source: ImageSourceSchema, label: z.string().optional() }),
  z.object({ type: z.literal("swipeFile"), kind: z.enum(["logo", "reference"]), image_source: ImageSourceSchema, label: z.string().optional() }),
  z.object({ type: z.literal("sketch"), image_source: ImageSourceSchema }),
  z.object({ type: z.literal("prompt"), prompt: z.string(), negativePrompt: z.string().optional() }),
  z.object({
    type: z.literal("generator"),
    model: z.enum(["ideogram", "grok", "nano-banana", "openai"]),
    aspectRatio: z.enum(["16x9", "9x16", "1x1"]),
    count: z.number().int().min(1).max(10).optional(),
  }),
]);

const NodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["faceReference", "swipeFile", "sketch", "prompt", "generator"]),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  data: z.record(z.string(), z.unknown()),
}).superRefine((node, ctx) => {
  // Validate data shape against the type via NodeDataByType
  const result = NodeDataByType.safeParse({ type: node.type, ...node.data });
  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue({ ...issue, path: ["data", ...issue.path] });
    }
  }
});

const EdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  targetHandle: z.string(),
});

export const BlueprintSchema = z.object({
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
}).superRefine((bp, ctx) => {
  const ids = new Set(bp.nodes.map((n) => n.id));
  bp.edges.forEach((e, i) => {
    if (!ids.has(e.source))
      ctx.addIssue({ code: "custom", path: ["edges", i, "source"], message: `Unknown node id: ${e.source}` });
    if (!ids.has(e.target))
      ctx.addIssue({ code: "custom", path: ["edges", i, "target"], message: `Unknown node id: ${e.target}` });
  });
});

export type Blueprint = z.infer<typeof BlueprintSchema>;
export type ImageSource = z.infer<typeof ImageSourceSchema>;
```

- [ ] **Step 4: Run — passes**

```bash
npm test -- tests/agent/blueprint-schema.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/blueprint/schema.ts tests/agent/blueprint-schema.test.ts
git commit -m "feat(blueprint): Zod schema with strict per-type validation and edge integrity"
```

---

## Task 5: Tool registry types and helper

**Files:**
- Create: `src/lib/agent/tools/types.ts`
- Create: `src/lib/agent/tools/index.ts`

- [ ] **Step 1: Write types**

```typescript
// src/lib/agent/tools/types.ts
import { z } from "zod";

export type ToolContent =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; data: string };  // base64

export type ToolResult = { content: ToolContent[]; isError?: boolean };

export type ToolHandler<I> = (input: I) => Promise<ToolResult>;

export type ToolDefinition<I = unknown> = {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  handler: ToolHandler<I>;
};
```

- [ ] **Step 2: Write registry stub**

```typescript
// src/lib/agent/tools/index.ts
import { ToolDefinition } from "./types";

const _registry = new Map<string, ToolDefinition>();

export function registerTool<I>(def: ToolDefinition<I>) {
  if (_registry.has(def.name)) throw new Error(`Tool already registered: ${def.name}`);
  _registry.set(def.name, def as ToolDefinition);
}

export function getTool(name: string): ToolDefinition | undefined {
  return _registry.get(name);
}

export function listTools(): ToolDefinition[] {
  return Array.from(_registry.values());
}

// Tools are imported here so they self-register at module load
// Will be filled in subsequent tasks
```

- [ ] **Step 3: Smoke test**

Create `tests/agent/registry.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { registerTool, getTool, listTools } from "@/lib/agent/tools";

describe("registry", () => {
  it("registers and retrieves a tool", () => {
    registerTool({
      name: "echo",
      description: "echo",
      inputSchema: z.object({ msg: z.string() }),
      handler: async ({ msg }) => ({ content: [{ type: "text", text: msg }] }),
    });
    expect(getTool("echo")?.name).toBe("echo");
    expect(listTools().some((t) => t.name === "echo")).toBe(true);
  });
});
```

- [ ] **Step 4: Run**

```bash
npm test -- tests/agent/registry.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/types.ts src/lib/agent/tools/index.ts tests/agent/registry.test.ts
git commit -m "feat(agent): tool registry with Zod schemas"
```

---

## Task 6: Image source resolver helper

**Files:**
- Create: `src/lib/agent/tools/_helpers/image-source.ts`
- Create: `tests/agent/image-source.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/agent/image-source.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { resolveImageSource, makeStoredId } from "@/lib/agent/tools/_helpers/image-source";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";

describe("resolveImageSource", () => {
  let logoId: string;

  beforeAll(() => {
    logoId = uuid();
    getDb()
      .prepare("INSERT INTO logos (id, label, mime_type, size, data) VALUES (?, ?, ?, ?, ?)")
      .run(logoId, "Test", "image/png", 4, Buffer.from([0, 0, 0, 0]));
  });

  it("resolves a stored:lg_ source", async () => {
    const r = await resolveImageSource(`stored:lg_${logoId}` as const);
    expect(r.mimeType).toBe("image/png");
    expect(r.bytes.length).toBe(4);
  });

  it("rejects an unknown source", async () => {
    await expect(resolveImageSource(`stored:lg_does-not-exist` as const)).rejects.toThrow();
  });

  it("decodes base64 data: source", async () => {
    const png1px = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZkqfO0AAAAASUVORK5CYII=";
    const r = await resolveImageSource(png1px);
    expect(r.mimeType).toBe("image/png");
    expect(r.bytes.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run — fails**

```bash
npm test -- tests/agent/image-source.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// src/lib/agent/tools/_helpers/image-source.ts
import { getDb } from "@/lib/db";

export type ResolvedImage = { mimeType: string; bytes: Buffer };

const TABLE_BY_PREFIX: Record<string, string> = {
  fc: "face_references",  // adjust if your table name differs (face_reactions etc)
  lg: "logos",
  sf: "swipe_files",
  fr: "face_reactions",
  gi: "generated_images",
};

export function makeStoredId(prefix: keyof typeof TABLE_BY_PREFIX, id: string): `stored:${string}` {
  return `stored:${prefix}_${id}` as const;
}

export async function resolveImageSource(source: string): Promise<ResolvedImage> {
  // data: URI
  if (source.startsWith("data:image/")) {
    const m = source.match(/^data:(image\/[a-z]+);base64,(.+)$/);
    if (!m) throw new Error("Malformed data URI");
    return { mimeType: m[1], bytes: Buffer.from(m[2], "base64") };
  }

  // stored:<prefix>_<id>
  if (source.startsWith("stored:")) {
    const m = source.match(/^stored:(fc|lg|sf|fr|gi)_(.+)$/);
    if (!m) throw new Error(`Invalid stored source: ${source}`);
    const [, prefix, id] = m;
    const table = TABLE_BY_PREFIX[prefix];
    const row = getDb()
      .prepare(`SELECT mime_type, data FROM ${table} WHERE id = ?`)
      .get(id) as { mime_type: string; data: Buffer } | undefined;
    if (!row) throw new Error(`Image not found: ${source}`);
    return { mimeType: row.mime_type, bytes: row.data };
  }

  // generated:<id>
  if (source.startsWith("generated:")) {
    const id = source.slice("generated:".length);
    const row = getDb()
      .prepare("SELECT mime_type, data FROM generated_sketches WHERE id = ?")
      .get(id) as { mime_type: string; data: Buffer } | undefined;
    if (!row) throw new Error(`Generated sketch not found: ${source}`);
    return { mimeType: row.mime_type, bytes: row.data };
  }

  // uploaded:<id>
  if (source.startsWith("uploaded:")) {
    const id = source.slice("uploaded:".length);
    const row = getDb()
      .prepare("SELECT mime_type, data FROM chat_uploads WHERE id = ?")
      .get(id) as { mime_type: string; data: Buffer } | undefined;
    if (!row) throw new Error(`Upload not found: ${source}`);
    return { mimeType: row.mime_type, bytes: row.data };
  }

  throw new Error(`Unsupported image source scheme: ${source}`);
}

export function markAttached(source: string): void {
  if (source.startsWith("generated:")) {
    const id = source.slice("generated:".length);
    getDb().prepare("UPDATE generated_sketches SET attached = 1 WHERE id = ?").run(id);
  } else if (source.startsWith("uploaded:")) {
    const id = source.slice("uploaded:".length);
    getDb().prepare("UPDATE chat_uploads SET attached = 1 WHERE id = ?").run(id);
  }
}
```

**Note:** Inspect `src/lib/db.ts` and the actual table names. The spec mentions `face_references` but the DB uses `face_reactions`. Verify what's there and align both the schema and this helper.

- [ ] **Step 4: Run — passes**

```bash
npm test -- tests/agent/image-source.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/_helpers/image-source.ts tests/agent/image-source.test.ts
git commit -m "feat(agent): image source resolver helper"
```

---

## Task 7: Auto-layout helper (Dagre)

**Files:**
- Create: `src/lib/agent/tools/_helpers/auto-layout.ts`
- Create: `tests/agent/auto-layout.test.ts`

- [ ] **Step 1: Write test**

```typescript
// tests/agent/auto-layout.test.ts
import { describe, it, expect } from "vitest";
import { autoLayout } from "@/lib/agent/tools/_helpers/auto-layout";

describe("autoLayout", () => {
  it("assigns positions to all nodes", () => {
    const nodes = [
      { id: "a", type: "prompt" as const },
      { id: "b", type: "generator" as const },
    ];
    const edges = [{ source: "a", target: "b", targetHandle: "prompt-in" }];
    const positioned = autoLayout(nodes, edges);
    expect(positioned).toHaveLength(2);
    expect(positioned[0].position).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
    expect(positioned[1].position).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
    expect(positioned[0].position.x).not.toBe(positioned[1].position.x);
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// src/lib/agent/tools/_helpers/auto-layout.ts
import dagre from "@dagrejs/dagre";

const NODE_W = 320;
const NODE_H = 200;

type MinNode = { id: string; type: string; position?: { x: number; y: number } };
type MinEdge = { source: string; target: string; targetHandle?: string };

export function autoLayout<N extends MinNode>(nodes: N[], edges: MinEdge[]): (N & { position: { x: number; y: number } })[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 120 });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    return { ...n, position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 } };
  });
}
```

- [ ] **Step 3: Run + commit**

```bash
npm test -- tests/agent/auto-layout.test.ts
git add src/lib/agent/tools/_helpers/auto-layout.ts tests/agent/auto-layout.test.ts
git commit -m "feat(agent): Dagre-based auto-layout helper"
```

---

## Task 8: Library list tools (one tool, pattern repeats)

**Files:**
- Create: `src/lib/agent/tools/list-logos.ts`
- Create: `tests/agent/list-logos.test.ts`

This task implements `list_logos`. Repeat the same pattern in Task 8b–e for `list_face_references`, `list_swipe_files`, `list_face_reactions`, `list_projects`, `list_past_generations`. (To keep the plan readable, only the first is fully shown; subsequent tools follow the identical structure with different table names and schemas.)

- [ ] **Step 1: Write test**

```typescript
// tests/agent/list-logos.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { listLogosTool } from "@/lib/agent/tools/list-logos";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";

describe("list_logos", () => {
  beforeAll(() => {
    getDb().prepare("DELETE FROM logos").run();
    const id = uuid();
    getDb()
      .prepare("INSERT INTO logos (id, label, mime_type, size, data) VALUES (?, ?, ?, ?, ?)")
      .run(id, "Claude", "image/png", 100, Buffer.alloc(100));
  });

  it("returns text content listing logos", async () => {
    const r = await listLogosTool.handler({});
    expect(r.content[0].type).toBe("text");
    expect((r.content[0] as { text: string }).text).toContain("Claude");
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// src/lib/agent/tools/list-logos.ts
import { z } from "zod";
import { getDb } from "@/lib/db";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({});

export const listLogosTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "list_logos",
  description: "Lists logos stored in the user's library. Returns id, label, size, and a `stored:lg_<id>` reference usable in apply_workflow.",
  inputSchema: InputSchema,
  handler: async () => {
    const rows = getDb()
      .prepare("SELECT id, label, size, created_at FROM logos ORDER BY created_at DESC")
      .all() as { id: string; label: string; size: number; created_at: string }[];
    if (rows.length === 0) {
      return { content: [{ type: "text", text: "No logos in library." }] };
    }
    const lines = rows.map((r) => `- stored:lg_${r.id} — "${r.label}" (${r.size} bytes, added ${r.created_at})`);
    return { content: [{ type: "text", text: `${rows.length} logo(s):\n${lines.join("\n")}` }] };
  },
};

registerTool(listLogosTool);
```

- [ ] **Step 3: Run + commit**

```bash
npm test -- tests/agent/list-logos.test.ts
git add src/lib/agent/tools/list-logos.ts tests/agent/list-logos.test.ts
git commit -m "feat(agent): list_logos tool"
```

- [ ] **Step 4: Repeat the exact pattern for:**
  - `list_face_references.ts` (table `face_references` — verify name in db.ts; `stored:fc_<id>`)
  - `list_swipe_files.ts` (table `swipe_files`; `stored:sf_<id>`)
  - `list_face_reactions.ts` (table `face_reactions`; `stored:fr_<id>`)
  - `list_projects.ts` (table `projects_meta`; returns `id, name, updated_at`)
  - `list_past_generations.ts` (table `generations_log` joined with `generated_images`; takes `{ project_id, limit? }`, returns `id, model, prompt, cost, stored:gi_<id>`)

Each in its own file + test + commit.

---

## Task 9: get_canvas_state tool

**Files:**
- Create: `src/lib/agent/tools/get-canvas-state.ts`
- Create: `tests/agent/get-canvas-state.test.ts`

- [ ] **Step 1: Write test**

```typescript
// tests/agent/get-canvas-state.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { getCanvasStateTool } from "@/lib/agent/tools/get-canvas-state";
import { getDb } from "@/lib/db";

describe("get_canvas_state", () => {
  const projectId = "test-canvas-state";
  beforeAll(() => {
    getDb().prepare("INSERT OR REPLACE INTO projects (id, nodes, edges) VALUES (?, ?, ?)")
      .run(projectId, JSON.stringify([
        { id: "p-1", type: "prompt", data: { prompt: "hi" } },
        { id: "g-1", type: "generator", data: { model: "ideogram", aspectRatio: "16x9" } },
      ]), JSON.stringify([
        { source: "p-1", target: "g-1", targetHandle: "prompt-in" },
      ]));
  });

  it("returns blueprint with all nodes and edges", async () => {
    const r = await getCanvasStateTool.handler({ project_id: projectId });
    const text = (r.content[0] as { text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.edges).toHaveLength(1);
  });

  it("returns empty blueprint for unknown project", async () => {
    const r = await getCanvasStateTool.handler({ project_id: "does-not-exist" });
    const parsed = JSON.parse((r.content[0] as { text: string }).text);
    expect(parsed.nodes).toEqual([]);
    expect(parsed.edges).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// src/lib/agent/tools/get-canvas-state.ts
import { z } from "zod";
import { getDb } from "@/lib/db";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({ project_id: z.string() });

export const getCanvasStateTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "get_canvas_state",
  description: "Reads the current workflow on the canvas for a given project. Returns a Blueprint with nodes (id, type, summary) and edges. Use this at the start of every conversation turn to know what already exists.",
  inputSchema: InputSchema,
  handler: async ({ project_id }) => {
    const row = getDb()
      .prepare("SELECT nodes, edges FROM projects WHERE id = ?")
      .get(project_id) as { nodes: string; edges: string } | undefined;

    if (!row) {
      return { content: [{ type: "text", text: JSON.stringify({ nodes: [], edges: [] }) }] };
    }

    // Strip heavy fields (base64 imageData) — keep summaries
    const nodes = JSON.parse(row.nodes).map((n: { id: string; type: string; data: Record<string, unknown> }) => ({
      id: n.id,
      type: n.type,
      summary: summarize(n.type, n.data),
    }));
    const edges = JSON.parse(row.edges).map((e: { source: string; target: string; targetHandle?: string }) => ({
      source: e.source,
      target: e.target,
      targetHandle: e.targetHandle,
    }));

    return { content: [{ type: "text", text: JSON.stringify({ nodes, edges }, null, 2) }] };
  },
};

function summarize(type: string, data: Record<string, unknown>): Record<string, unknown> {
  switch (type) {
    case "prompt":
      return { prompt: data.prompt, negativePrompt: data.negativePrompt };
    case "generator":
      return { model: data.model, aspectRatio: data.aspectRatio, count: data.count };
    case "faceReference":
    case "swipeFile":
    case "sketch":
      return { hasImage: Boolean(data.imageBase64 || data.imageUrl), label: data.label };
    default:
      return {};
  }
}

registerTool(getCanvasStateTool);
```

- [ ] **Step 3: Run + commit**

```bash
npm test -- tests/agent/get-canvas-state.test.ts
git add src/lib/agent/tools/get-canvas-state.ts tests/agent/get-canvas-state.test.ts
git commit -m "feat(agent): get_canvas_state tool"
```

---

## Task 10: apply_workflow tool (server side)

**Files:**
- Create: `src/lib/agent/blueprint/diff.ts`
- Create: `src/lib/agent/tools/apply-workflow.ts`
- Create: `tests/agent/apply-workflow.test.ts`

- [ ] **Step 1: Write diff function test**

```typescript
// tests/agent/blueprint-diff.test.ts
import { describe, it, expect } from "vitest";
import { diffBlueprints } from "@/lib/agent/blueprint/diff";

describe("diffBlueprints", () => {
  it("identifies created/updated/deleted nodes", () => {
    const current = {
      nodes: [
        { id: "a", type: "prompt", data: { prompt: "old" } },
        { id: "b", type: "generator", data: { model: "ideogram", aspectRatio: "16x9" } },
      ],
      edges: [],
    };
    const target = {
      nodes: [
        { id: "a", type: "prompt", data: { prompt: "new" } }, // updated
        { id: "c", type: "sketch", data: { image_source: "stored:sf_x" } }, // created
        // b removed
      ],
      edges: [],
    };
    const ops = diffBlueprints(current, target);
    expect(ops.create.map((n: { id: string }) => n.id)).toEqual(["c"]);
    expect(ops.update.map((n: { id: string }) => n.id)).toEqual(["a"]);
    expect(ops.delete).toEqual(["b"]);
  });
});
```

- [ ] **Step 2: Implement diff**

```typescript
// src/lib/agent/blueprint/diff.ts
import { Blueprint } from "./schema";

type Node = Blueprint["nodes"][number];

export type DiffOps = {
  create: Node[];
  update: Node[];
  delete: string[];
};

export function diffBlueprints(current: Blueprint, target: Blueprint): DiffOps {
  const currentMap = new Map(current.nodes.map((n) => [n.id, n]));
  const targetMap = new Map(target.nodes.map((n) => [n.id, n]));

  const create: Node[] = [];
  const update: Node[] = [];
  const del: string[] = [];

  for (const [id, node] of targetMap) {
    if (!currentMap.has(id)) {
      create.push(node);
    } else {
      const cur = currentMap.get(id)!;
      if (JSON.stringify(cur) !== JSON.stringify(node)) update.push(node);
    }
  }
  for (const id of currentMap.keys()) {
    if (!targetMap.has(id)) del.push(id);
  }
  return { create, update, delete: del };
}
```

- [ ] **Step 3: Test apply_workflow tool**

```typescript
// tests/agent/apply-workflow.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { applyWorkflowTool } from "@/lib/agent/tools/apply-workflow";
import { getDb } from "@/lib/db";

describe("apply_workflow", () => {
  const projectId = "test-apply";
  beforeEach(() => {
    getDb().prepare("INSERT OR REPLACE INTO projects (id, nodes, edges) VALUES (?, ?, ?)")
      .run(projectId, "[]", "[]");
  });

  it("validates and persists a fresh blueprint", async () => {
    const blueprint = {
      nodes: [
        { id: "p-1", type: "prompt", data: { prompt: "hello" } },
        { id: "g-1", type: "generator", data: { model: "ideogram", aspectRatio: "16x9" } },
      ],
      edges: [{ source: "p-1", target: "g-1", targetHandle: "prompt-in" }],
    };
    const r = await applyWorkflowTool.handler({ project_id: projectId, blueprint });
    expect(r.isError).toBeFalsy();
    const row = getDb().prepare("SELECT nodes FROM projects WHERE id = ?").get(projectId) as { nodes: string };
    expect(JSON.parse(row.nodes)).toHaveLength(2);
  });

  it("rejects an invalid blueprint with helpful error", async () => {
    const invalid = { nodes: [{ id: "x", type: "generator", data: {} }], edges: [] };
    const r = await applyWorkflowTool.handler({ project_id: projectId, blueprint: invalid });
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toMatch(/model|aspectRatio/);
  });
});
```

- [ ] **Step 4: Implement apply-workflow**

```typescript
// src/lib/agent/tools/apply-workflow.ts
import { z } from "zod";
import { getDb } from "@/lib/db";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";
import { BlueprintSchema } from "@/lib/agent/blueprint/schema";
import { diffBlueprints } from "@/lib/agent/blueprint/diff";
import { autoLayout } from "./_helpers/auto-layout";
import { resolveImageSource, markAttached } from "./_helpers/image-source";

const InputSchema = z.object({
  project_id: z.string(),
  blueprint: z.unknown(),  // validated via BlueprintSchema below
});

export const applyWorkflowTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "apply_workflow",
  description: "Replaces or modifies the canvas workflow for a project. Provide a complete Blueprint (nodes + edges). The diff against the current state determines what's created/updated/deleted. ALWAYS read get_canvas_state first if you want to preserve existing nodes.",
  inputSchema: InputSchema,
  handler: async ({ project_id, blueprint }) => {
    const parsed = BlueprintSchema.safeParse(blueprint);
    if (!parsed.success) {
      return { isError: true, content: [{ type: "text", text: `Invalid blueprint:\n${JSON.stringify(parsed.error.format(), null, 2)}` }] };
    }
    const target = parsed.data;

    // Validate every image_source resolves
    for (const node of target.nodes) {
      const src = (node.data as { image_source?: string }).image_source;
      if (src) {
        try { await resolveImageSource(src); } catch (e) {
          return { isError: true, content: [{ type: "text", text: `Image source unresolvable on node ${node.id}: ${(e as Error).message}` }] };
        }
      }
    }

    // Load current
    const row = getDb().prepare("SELECT nodes, edges FROM projects WHERE id = ?").get(project_id) as { nodes: string; edges: string } | undefined;
    const current = row ? { nodes: JSON.parse(row.nodes), edges: JSON.parse(row.edges) } : { nodes: [], edges: [] };

    const ops = diffBlueprints(current, target);

    // Auto-layout the target
    const positioned = autoLayout(target.nodes, target.edges);

    // Persist
    getDb().prepare("INSERT OR REPLACE INTO projects (id, nodes, edges, updated_at) VALUES (?, ?, ?, datetime('now'))")
      .run(project_id, JSON.stringify(positioned), JSON.stringify(target.edges));

    // Mark attached on referenced uploads/sketches (skip GC)
    for (const node of target.nodes) {
      const src = (node.data as { image_source?: string }).image_source;
      if (src) markAttached(src);
    }

    const summary = `Applied: ${ops.create.length} created, ${ops.update.length} updated, ${ops.delete.length} deleted.`;
    return { content: [{ type: "text", text: `${summary}\nCurrent nodes: ${target.nodes.map(n => n.id).join(", ")}` }] };
  },
};

registerTool(applyWorkflowTool);
```

- [ ] **Step 5: Run + commit**

```bash
npm test -- tests/agent/apply-workflow.test.ts tests/agent/blueprint-diff.test.ts
git add src/lib/agent/blueprint/diff.ts src/lib/agent/tools/apply-workflow.ts tests/agent/apply-workflow.test.ts tests/agent/blueprint-diff.test.ts
git commit -m "feat(agent): apply_workflow tool with strict validation and diff"
```

---

## Task 11: generate_sketch tool (wraps existing nano-banana route)

**Files:**
- Create: `src/lib/agent/tools/generate-sketch.ts`
- Create: `tests/agent/generate-sketch.test.ts` (mocked HTTP)

- [ ] **Step 1: Inspect existing route** to understand `/api/generate/nano-banana` shape (input/output JSON):

```bash
cat src/app/api/generate/nano-banana/route.ts | head -80
```

- [ ] **Step 2: Write tool with internal in-process call**

Don't HTTP-call your own server — extract the core logic if needed, or call the route handler directly.

```typescript
// src/lib/agent/tools/generate-sketch.ts
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";
// Import the core generation function from the route (refactor route to expose it if necessary)
import { runNanoBananaGeneration } from "@/lib/generation/nano-banana";  // extract from route

const InputSchema = z.object({
  prompt: z.string().min(1),
  aspect_ratio: z.enum(["16x9", "9x16", "1x1"]).optional().default("16x9"),
});

export const generateSketchTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "generate_sketch",
  description: "Generates a quick draft thumbnail (sketch) using nano-banana. Use this for fast visual exploration BEFORE the final trigger_generation. Returns a generated:<id> reference usable in apply_workflow as a sketch node image_source.",
  inputSchema: InputSchema,
  handler: async ({ prompt, aspect_ratio }) => {
    const result = await runNanoBananaGeneration({ prompt, aspectRatio: aspect_ratio });
    const id = `sk_${uuid().replace(/-/g, "")}`;
    getDb().prepare("INSERT INTO generated_sketches (id, prompt, mime_type, data, cost_estimate) VALUES (?, ?, ?, ?, ?)")
      .run(id, prompt, result.mimeType, result.bytes, result.costEstimate);

    return {
      content: [
        { type: "text", text: `Sketch generated. Reference: generated:${id} (cost: $${result.costEstimate.toFixed(3)})` },
        { type: "image", mimeType: result.mimeType, data: result.bytes.toString("base64") },
      ],
    };
  },
};

registerTool(generateSketchTool);
```

- [ ] **Step 3: Refactor `src/app/api/generate/nano-banana/route.ts`** to extract the generation core into `src/lib/generation/nano-banana.ts` exporting `runNanoBananaGeneration({ prompt, aspectRatio })`. The route becomes a thin HTTP wrapper around it.

- [ ] **Step 4: Write test using a mocked `runNanoBananaGeneration`**

```typescript
// tests/agent/generate-sketch.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/generation/nano-banana", () => ({
  runNanoBananaGeneration: vi.fn(async () => ({
    mimeType: "image/png",
    bytes: Buffer.from([1, 2, 3]),
    costEstimate: 0.04,
  })),
}));

import { generateSketchTool } from "@/lib/agent/tools/generate-sketch";

describe("generate_sketch", () => {
  it("creates a sketch and returns a generated:* reference", async () => {
    const r = await generateSketchTool.handler({ prompt: "cat in space", aspect_ratio: "16x9" });
    const text = (r.content[0] as { text: string }).text;
    expect(text).toMatch(/Reference: generated:sk_/);
    expect(r.content[1].type).toBe("image");
  });
});
```

- [ ] **Step 5: Run + commit**

```bash
npm test -- tests/agent/generate-sketch.test.ts
git add src/lib/agent/tools/generate-sketch.ts src/lib/generation/nano-banana.ts src/app/api/generate/nano-banana/route.ts tests/agent/generate-sketch.test.ts
git commit -m "feat(agent): generate_sketch tool wraps nano-banana"
```

- [ ] **Step 6: Repeat the same extract-and-wrap pattern for:**
  - `remix_image` — wraps `/api/remix/ideogram`
  - `edit_image` — wraps `/api/edit/ideogram`
  - `trigger_generation` — wraps the full generation pipeline (find generator node + connected sources, call appropriate model route)

For `trigger_generation`, the input is `{ project_id, generator_id }`. It loads the project, finds the generator node, walks its incoming edges to collect prompt + sources, and dispatches to the right model. Each in own task with own commit.

---

## Task 12: extract_youtube_script and channel tools

**Files:**
- Create: `src/lib/agent/tools/extract-youtube-script.ts`
- Create: `src/lib/agent/tools/search-youtube-channel.ts`
- Create: `src/lib/agent/tools/get-channel-videos.ts`
- Create: `tests/agent/youtube.test.ts`

- [ ] **Step 1: Implement extract_youtube_script using `youtube-transcript`**

```typescript
// src/lib/agent/tools/extract-youtube-script.ts
import { z } from "zod";
import { YoutubeTranscript } from "youtube-transcript";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({ url: z.string().url() });

export const extractYoutubeScriptTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "extract_youtube_script",
  description: "Extracts the transcript and metadata of a YouTube video given its URL. Use this when the user wants a thumbnail for a specific video.",
  inputSchema: InputSchema,
  handler: async ({ url }) => {
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(url);
      const text = transcript.map((c) => c.text).join(" ");
      return { content: [{ type: "text", text: `Transcript (${transcript.length} segments):\n\n${text}` }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: `Failed to extract transcript: ${(e as Error).message}` }] };
    }
  },
};

registerTool(extractYoutubeScriptTool);
```

- [ ] **Step 2: Implement search_youtube_channel and get_channel_videos** by extracting the YouTube Data API logic from `src/app/api/youtube/playlist/route.ts` into a shared `src/lib/youtube/api.ts` and wrapping in tools (same extract-and-wrap pattern as Task 11).

- [ ] **Step 3: Tests with mocked HTTP**

```typescript
// tests/agent/youtube.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => [{ text: "hello", offset: 0, duration: 1 }]) },
}));

import { extractYoutubeScriptTool } from "@/lib/agent/tools/extract-youtube-script";

describe("extract_youtube_script", () => {
  it("returns transcript text", async () => {
    const r = await extractYoutubeScriptTool.handler({ url: "https://youtube.com/watch?v=x" });
    expect((r.content[0] as { text: string }).text).toContain("hello");
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/tools/extract-youtube-script.ts src/lib/agent/tools/search-youtube-channel.ts src/lib/agent/tools/get-channel-videos.ts src/lib/youtube/api.ts tests/agent/youtube.test.ts
git commit -m "feat(agent): YouTube tools (transcript, channel search, channel videos)"
```

---

## Task 13: Wire all tools into the registry index

**Files:**
- Modify: `src/lib/agent/tools/index.ts`

- [ ] **Step 1: Add imports at the bottom of `src/lib/agent/tools/index.ts`** so each tool self-registers on module load:

```typescript
// At bottom of src/lib/agent/tools/index.ts
import "./list-logos";
import "./list-face-references";
import "./list-swipe-files";
import "./list-face-reactions";
import "./list-projects";
import "./list-past-generations";
import "./get-canvas-state";
import "./apply-workflow";
import "./generate-sketch";
import "./remix-image";
import "./edit-image";
import "./trigger-generation";
import "./extract-youtube-script";
import "./search-youtube-channel";
import "./get-channel-videos";
```

- [ ] **Step 2: Smoke test**

```typescript
// tests/agent/registry-full.test.ts
import { describe, it, expect } from "vitest";
import { listTools } from "@/lib/agent/tools";

describe("full registry", () => {
  it("registers all expected tools", () => {
    const names = listTools().map((t) => t.name);
    [
      "list_logos", "list_face_references", "list_swipe_files", "list_face_reactions",
      "list_projects", "list_past_generations", "get_canvas_state", "apply_workflow",
      "generate_sketch", "remix_image", "edit_image", "trigger_generation",
      "extract_youtube_script", "search_youtube_channel", "get_channel_videos",
    ].forEach((n) => expect(names).toContain(n));
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
npm test -- tests/agent/registry-full.test.ts
git add src/lib/agent/tools/index.ts tests/agent/registry-full.test.ts
git commit -m "feat(agent): wire all tools into registry"
```

**🏁 Milestone M2 complete: 15 tools registered, all unit-tested.**

---

## Task 14: MCP server construction

**Files:**
- Create: `src/lib/agent/mcp/server.ts`
- Create: `tests/agent/mcp-server.test.ts`

- [ ] **Step 1: Test**

```typescript
// tests/agent/mcp-server.test.ts
import { describe, it, expect } from "vitest";
import { buildMcpServer } from "@/lib/agent/mcp/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

describe("MCP server", () => {
  it("lists registry tools via in-memory transport", async () => {
    const server = buildMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(clientTransport);

    const { tools } = await client.listTools();
    expect(tools.find((t) => t.name === "apply_workflow")).toBeDefined();
    expect(tools.find((t) => t.name === "list_logos")).toBeDefined();
  });

  it("calls a tool through the transport", async () => {
    const server = buildMcpServer();
    const [c, s] = InMemoryTransport.createLinkedPair();
    await server.connect(s);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(c);

    const r = await client.callTool({ name: "list_logos", arguments: {} });
    expect(r.content).toBeDefined();
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// src/lib/agent/mcp/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listTools } from "@/lib/agent/tools";

export function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "thumbgen", version: "1.0.0" });

  for (const tool of listTools()) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      async (args) => tool.handler(args),
    );
  }

  return server;
}
```

(Verify exact import paths against the installed `@modelcontextprotocol/sdk` version — adapt if the package layout differs.)

- [ ] **Step 3: Run + commit**

```bash
npm test -- tests/agent/mcp-server.test.ts
git add src/lib/agent/mcp/server.ts tests/agent/mcp-server.test.ts
git commit -m "feat(mcp): build server from registry"
```

---

## Task 15: MCP HTTP route with bearer auth

**Files:**
- Create: `src/app/api/mcp/route.ts`
- Create: `src/lib/agent/mcp/in-memory-client.ts`

- [ ] **Step 1: Implement HTTP route**

```typescript
// src/app/api/mcp/route.ts
import { NextRequest } from "next/server";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildMcpServer } from "@/lib/agent/mcp/server";
import { ensureMcpApiKey } from "@/lib/settings";

export const runtime = "nodejs";

// One server instance per process; sessions are managed by the transport
const server = buildMcpServer();
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => crypto.randomUUID(),
});
await server.connect(transport);

function isAuthorized(req: NextRequest): boolean {
  const expected = ensureMcpApiKey();
  const got = req.headers.get("authorization")?.replace(/^Bearer /, "");
  return got === expected;
}

function originAllowed(req: NextRequest): boolean {
  // Per MCP spec: validate Origin to prevent DNS rebinding
  const origin = req.headers.get("origin");
  if (!origin) return true;  // CLI clients omit origin
  try {
    const u = new URL(origin);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1" || process.env.THUMBGEN_PUBLIC_HOST === u.hostname;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!originAllowed(req)) return new Response("Forbidden origin", { status: 403 });
  if (!isAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  return await transport.handleRequest(req as unknown as Request, await req.json());
}

export async function GET(req: NextRequest) {
  if (!originAllowed(req)) return new Response("Forbidden origin", { status: 403 });
  if (!isAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  return await transport.handleRequest(req as unknown as Request);
}

export async function DELETE(req: NextRequest) {
  if (!isAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  return await transport.handleRequest(req as unknown as Request);
}
```

(The exact `transport.handleRequest` signature depends on the SDK version. If it doesn't accept a Web `Request` directly, adapt with the SDK's HTTP helper.)

- [ ] **Step 2: Implement in-memory client helper**

```typescript
// src/lib/agent/mcp/in-memory-client.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildMcpServer } from "./server";

let cached: Client | null = null;

export async function getInMemoryMcpClient(): Promise<Client> {
  if (cached) return cached;
  const server = buildMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "thumbgen-browser-agent", version: "1.0.0" });
  await client.connect(clientTransport);
  cached = client;
  return client;
}
```

- [ ] **Step 3: Manual e2e**

```bash
# Get token
KEY=$(node -e "require('./src/lib/settings.ts'); console.log(require('./src/lib/settings').ensureMcpApiKey())")
# Or read from DB:
KEY=$(sqlite3 data/thumbgen.db "SELECT value FROM settings WHERE key='mcp_api_key'")

# Initialize
curl -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

Expected: returns initialize response with `Mcp-Session-Id` header.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/mcp/route.ts src/lib/agent/mcp/in-memory-client.ts
git commit -m "feat(mcp): Streamable HTTP route with bearer auth + in-memory client helper"
```

**🏁 Milestone M3 complete: MCP server reachable via HTTP and in-memory.**

---

## Task 16: Whisper transcription endpoint

**Files:**
- Create: `src/lib/agent/transcribe.ts`
- Create: `src/app/api/agent/transcribe/route.ts`

- [ ] **Step 1: Implement core**

```typescript
// src/lib/agent/transcribe.ts
import OpenAI from "openai";
import { getSetting } from "@/lib/settings";

export async function transcribeAudio(file: File, language = "fr"): Promise<{ text: string }> {
  const apiKey = getSetting("openai_api_key") || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  const openai = new OpenAI({ apiKey });
  const result = await openai.audio.transcriptions.create({
    file,
    model: "gpt-4o-mini-transcribe",
    language,
  });
  return { text: result.text };
}
```

- [ ] **Step 2: Wire HTTP route**

```typescript
// src/app/api/agent/transcribe/route.ts
import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/agent/transcribe";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("audio") as File | null;
  if (!file) return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "Audio too large (max 25MB)" }, { status: 400 });
  try {
    const { text } = await transcribeAudio(file);
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/transcribe.ts src/app/api/agent/transcribe/route.ts
git commit -m "feat(agent): Whisper transcription endpoint via gpt-4o-mini-transcribe"
```

---

## Task 17: Conversations CRUD endpoints

**Files:**
- Create: `src/lib/agent/conversation/store.ts`
- Create: `src/app/api/agent/conversations/route.ts`
- Create: `src/app/api/agent/conversations/[id]/route.ts`
- Create: `src/app/api/agent/conversations/[id]/messages/route.ts`

- [ ] **Step 1: Store layer with tests**

```typescript
// src/lib/agent/conversation/store.ts
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";

export type Conversation = { id: string; project_id: string; title: string; created_at: string; updated_at: string };
export type Message = { id: string; conversation_id: string; role: "user" | "assistant"; content_json: string; interrupted: number; total_input_tokens: number; total_output_tokens: number; cost_estimate: number; created_at: string };

export function createConversation(project_id: string, title = "Nouvelle conversation"): Conversation {
  const id = uuid();
  getDb().prepare("INSERT INTO conversations (id, project_id, title) VALUES (?, ?, ?)").run(id, project_id, title);
  return getConversation(id)!;
}

export function getConversation(id: string): Conversation | null {
  return (getDb().prepare("SELECT * FROM conversations WHERE id = ? AND deleted_at IS NULL").get(id) as Conversation) || null;
}

export function listConversations(project_id: string): Conversation[] {
  return getDb().prepare("SELECT * FROM conversations WHERE project_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC").all(project_id) as Conversation[];
}

export function softDeleteConversation(id: string): void {
  getDb().prepare("UPDATE conversations SET deleted_at = datetime('now') WHERE id = ?").run(id);
}

export function updateConversationTitle(id: string, title: string): void {
  getDb().prepare("UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?").run(title, id);
}

export function appendMessage(input: Omit<Message, "id" | "created_at">): Message {
  const id = uuid();
  getDb().prepare(`
    INSERT INTO messages (id, conversation_id, role, content_json, interrupted, total_input_tokens, total_output_tokens, cost_estimate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.conversation_id, input.role, input.content_json, input.interrupted, input.total_input_tokens, input.total_output_tokens, input.cost_estimate);
  getDb().prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(input.conversation_id);
  return getDb().prepare("SELECT * FROM messages WHERE id = ?").get(id) as Message;
}

export function listMessages(conversation_id: string): Message[] {
  return getDb().prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC").all(conversation_id) as Message[];
}
```

- [ ] **Step 2: Routes**

```typescript
// src/app/api/agent/conversations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createConversation, listConversations } from "@/lib/agent/conversation/store";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("project_id");
  if (!projectId) return NextResponse.json({ error: "project_id required" }, { status: 400 });
  return NextResponse.json(listConversations(projectId));
}

export async function POST(req: NextRequest) {
  const { project_id, title } = await req.json();
  if (!project_id) return NextResponse.json({ error: "project_id required" }, { status: 400 });
  const conv = createConversation(project_id, title);
  return NextResponse.json(conv);
}
```

```typescript
// src/app/api/agent/conversations/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { softDeleteConversation, updateConversationTitle, getConversation } from "@/lib/agent/conversation/store";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { title } = await req.json();
  updateConversationTitle(id, title);
  return NextResponse.json(getConversation(id));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  softDeleteConversation(id);
  return NextResponse.json({ success: true });
}
```

```typescript
// src/app/api/agent/conversations/[id]/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { listMessages } from "@/lib/agent/conversation/store";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json(listMessages(id));
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/conversation/store.ts src/app/api/agent/conversations/
git commit -m "feat(agent): conversation CRUD endpoints"
```

---

## Task 18: System prompt module

**Files:**
- Create: `src/lib/agent/system-prompt.ts`

- [ ] **Step 1: Implement (verbatim from spec section 5)**

```typescript
// src/lib/agent/system-prompt.ts
export const AGENT_SYSTEM_PROMPT = `You are ThumbGen Brainstorm, an expert YouTube thumbnail strategist embedded in a node-based canvas editor.

Your job: collaborate with the creator to design and produce the best thumbnail for their video by progressively building the workflow on their canvas.

Mental checklist (adapt to context, don't follow rigidly):
1. Understand the video subject + audience + tone (ask if unclear)
2. Check if there are visual references they want (call list_swipe_files OR ask them to upload)
3. Check if their face should appear (call list_face_references / list_face_reactions OR ask)
4. If a brand is mentioned, ask if they want a specific logo (call list_logos OR ask)
5. If web context would help (recent topic, current event), use web_search
6. If they want to leverage their YT channel context, use search_youtube_channel
7. Propose a quick sketch via generate_sketch to validate the visual direction
8. Once validated, build the final workflow via apply_workflow with the right generator + connections
9. Ask explicit confirmation before calling trigger_generation (it costs money)

Rules:
- Always read the current canvas state at the start of each turn (it's injected in <canvas_state>)
- If the canvas already has a workflow and the user wants to "modify" or "iterate", call apply_workflow with a new blueprint that retains existing node IDs you want to keep
- If the user wants a "new thumbnail", build a fresh workflow alongside the existing one (different positions)
- Always announce what you're about to do before calling a tool ("Je vais générer un croquis…")
- French is the user's preferred language unless they switch
- Be concise. The user is creative, not technical. Don't dump JSON in chat.
- Cost-aware: prefer generate_sketch (cheap) for exploration, trigger_generation only after validation
- Cite web sources when you use web_search`;

export function buildSystemMessages(canvasSnapshot: unknown) {
  return [
    {
      type: "text" as const,
      text: AGENT_SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" as const },
    },
    {
      type: "text" as const,
      text: `<canvas_state>\n${JSON.stringify(canvasSnapshot, null, 2)}\n</canvas_state>`,
    },
  ];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/agent/system-prompt.ts
git commit -m "feat(agent): system prompt with prompt caching on the static portion"
```

---

## Task 19: Browser-only UI tools

**Files:**
- Create: `src/lib/agent/browser-tools/request-user-image.ts`
- Create: `src/lib/agent/browser-tools/request-user-sketch.ts`

- [ ] **Step 1: Implement**

```typescript
// src/lib/agent/browser-tools/request-user-image.ts
import { z } from "zod";

export const requestUserImageTool = {
  name: "request_user_image",
  description: "Asks the user to upload an image (face, logo, reference, etc). Suspends the conversation until they respond.",
  inputSchema: z.object({
    reason: z.string(),
    suggested_kind: z.enum(["face", "logo", "reference", "any"]).optional(),
  }),
};

export type RequestUserImageInput = z.infer<typeof requestUserImageTool.inputSchema>;
export type RequestUserImageOutput = { source_ids: string[] } | { skipped: true };
```

```typescript
// src/lib/agent/browser-tools/request-user-sketch.ts
import { z } from "zod";

export const requestUserSketchTool = {
  name: "request_user_sketch",
  description: "Asks the user to draw a quick sketch of their thumbnail idea. Opens the SketchEditor. Suspends until they validate or skip.",
  inputSchema: z.object({
    reason: z.string(),
    initial_image_id: z.string().optional(),
  }),
};

export type RequestUserSketchInput = z.infer<typeof requestUserSketchTool.inputSchema>;
export type RequestUserSketchOutput = { generated_id: string } | { skipped: true };
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/agent/browser-tools/
git commit -m "feat(agent): browser-only UI tool definitions"
```

---

## Task 20: Agent chat SSE route — skeleton + suspend/resume infra

**Files:**
- Create: `src/app/api/agent/chat/route.ts`
- Create: `src/app/api/agent/chat/tool-result/route.ts`
- Create: `src/lib/agent/pending-actions.ts`

- [ ] **Step 1: Pending actions registry (in-memory map)**

```typescript
// src/lib/agent/pending-actions.ts
type Resolver = (result: unknown) => void;

const pending = new Map<string, Resolver>();

export function registerPending(toolUseId: string): Promise<unknown> {
  return new Promise((resolve) => {
    pending.set(toolUseId, resolve);
  });
}

export function resolvePending(toolUseId: string, result: unknown): boolean {
  const r = pending.get(toolUseId);
  if (!r) return false;
  pending.delete(toolUseId);
  r(result);
  return true;
}
```

- [ ] **Step 2: Tool-result endpoint**

```typescript
// src/app/api/agent/chat/tool-result/route.ts
import { NextRequest, NextResponse } from "next/server";
import { resolvePending } from "@/lib/agent/pending-actions";

export async function POST(req: NextRequest) {
  const { tool_use_id, result } = await req.json();
  const ok = resolvePending(tool_use_id, result);
  return NextResponse.json({ accepted: ok });
}
```

- [ ] **Step 3: Chat SSE skeleton (logic in next task)**

```typescript
// src/app/api/agent/chat/route.ts
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      try {
        await runAgentLoop({ ...body, send });
        send("done", { ok: true });
      } catch (e) {
        send("error", { message: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

// Stub for next task
async function runAgentLoop(_args: unknown): Promise<void> {
  // implemented in Task 21
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/pending-actions.ts src/app/api/agent/chat/
git commit -m "feat(agent): SSE route skeleton + pending-actions registry"
```

---

## Task 21: Agent loop implementation

**Files:**
- Modify: `src/app/api/agent/chat/route.ts` (replace `runAgentLoop` stub)
- Create: `src/lib/agent/loop.ts`

- [ ] **Step 1: Implement loop**

```typescript
// src/lib/agent/loop.ts
import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuid } from "uuid";
import { getInMemoryMcpClient } from "./mcp/in-memory-client";
import { buildSystemMessages } from "./system-prompt";
import { appendMessage, listMessages } from "./conversation/store";
import { registerPending } from "./pending-actions";
import { requestUserImageTool } from "./browser-tools/request-user-image";
import { requestUserSketchTool } from "./browser-tools/request-user-sketch";

type SendFn = (event: string, data: unknown) => void;

export async function runAgentLoop(opts: {
  conversation_id: string;
  project_id: string;
  message: { text: string; attachments?: Array<{ type: "image"; source: string }> };
  canvas_snapshot: unknown;
  abort: AbortSignal;
  send: SendFn;
}) {
  const { conversation_id, project_id, message, canvas_snapshot, abort, send } = opts;

  // Persist user message
  const userBlocks: unknown[] = [{ type: "text", text: message.text }];
  for (const a of message.attachments || []) {
    if (a.type === "image") {
      // For uploaded:* and stored:* we resolve to base64 (Anthropic vision needs base64 or URL)
      const { resolveImageSource } = await import("./tools/_helpers/image-source");
      const img = await resolveImageSource(a.source);
      userBlocks.push({
        type: "image",
        source: { type: "base64", media_type: img.mimeType, data: img.bytes.toString("base64") },
      });
    }
  }
  appendMessage({
    conversation_id, role: "user", content_json: JSON.stringify(userBlocks),
    interrupted: 0, total_input_tokens: 0, total_output_tokens: 0, cost_estimate: 0,
  });

  // Build history for Claude (alternating user/assistant)
  const history = listMessages(conversation_id).map((m) => ({
    role: m.role,
    content: JSON.parse(m.content_json),
  }));

  // Get tools from MCP + UI-only + native web_search
  const mcp = await getInMemoryMcpClient();
  const { tools: mcpTools } = await mcp.listTools();

  const toolDefs = [
    ...mcpTools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })),
    {
      name: requestUserImageTool.name,
      description: requestUserImageTool.description,
      input_schema: { type: "object", properties: { reason: { type: "string" }, suggested_kind: { type: "string" } } },
    },
    {
      name: requestUserSketchTool.name,
      description: requestUserSketchTool.description,
      input_schema: { type: "object", properties: { reason: { type: "string" }, initial_image_id: { type: "string" } } },
    },
    { type: "web_search_20250305", name: "web_search", max_uses: 5 },
  ];

  const anthropic = new Anthropic();
  const systemMessages = buildSystemMessages(canvas_snapshot);

  const MAX_ITER = 25;
  let iter = 0;
  let assistantBlocks: unknown[] = [];
  let totalInput = 0;
  let totalOutput = 0;

  while (iter++ < MAX_ITER) {
    if (abort.aborted) break;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemMessages,
      tools: toolDefs as never,
      messages: history,
    });

    totalInput += response.usage.input_tokens;
    totalOutput += response.usage.output_tokens;
    assistantBlocks = [...assistantBlocks, ...response.content];

    // Forward text deltas (in non-streaming variant we send content blocks at end)
    for (const block of response.content) {
      if (block.type === "text") send("text_delta", { content: block.text });
    }

    if (response.stop_reason === "tool_use") {
      const toolResults: unknown[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        send("tool_call", { id: block.id, name: block.name, input: block.input });

        if (block.name === "request_user_image" || block.name === "request_user_sketch") {
          send("ui_tool_request", { id: block.id, name: block.name, input: block.input });
          const result = await registerPending(block.id);
          send("ui_tool_response_ack", { id: block.id });
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
        } else {
          // MCP tool
          const r = await mcp.callTool({ name: block.name, arguments: block.input as Record<string, unknown> });
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: r.content as never });
          send("tool_result", { id: block.id, name: block.name, summary: summarizeResult(r) });
        }
      }
      history.push({ role: "assistant", content: response.content });
      history.push({ role: "user", content: toolResults });
      continue;
    }

    if (response.stop_reason === "pause_turn") {
      // server tools (web_search) need another turn
      history.push({ role: "assistant", content: response.content });
      continue;
    }

    // end_turn or stop_sequence
    break;
  }

  // Persist assistant message
  const cost = totalInput * 0.003 / 1000 + totalOutput * 0.015 / 1000; // claude-sonnet-4-6 pricing — verify current
  appendMessage({
    conversation_id, role: "assistant", content_json: JSON.stringify(assistantBlocks),
    interrupted: abort.aborted ? 1 : 0,
    total_input_tokens: totalInput, total_output_tokens: totalOutput, cost_estimate: cost,
  });
}

function summarizeResult(r: { content: { type: string; text?: string }[] }): string {
  const t = r.content.find((c) => c.type === "text")?.text || "";
  return t.slice(0, 200);
}
```

- [ ] **Step 2: Wire into route**

In `src/app/api/agent/chat/route.ts`, replace the stub:
```typescript
import { runAgentLoop } from "@/lib/agent/loop";
```
And in `start()`:
```typescript
const ac = new AbortController();
req.signal.addEventListener("abort", () => ac.abort());
await runAgentLoop({ ...body, abort: ac.signal, send });
```

- [ ] **Step 3: Manual smoke test**

Start the dev server, then:
```bash
curl -N -X POST http://localhost:3000/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"conversation_id":"<uuid>","project_id":"default","message":{"text":"liste mes logos"},"canvas_snapshot":{"nodes":[],"edges":[]}}'
```
Expected: SSE stream with text deltas, a `tool_call` for `list_logos`, a `tool_result`, then more text and `done`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/loop.ts src/app/api/agent/chat/route.ts
git commit -m "feat(agent): main agent loop with MCP tool dispatch and suspend/resume"
```

---

## Task 22: Chat upload endpoint

**Files:**
- Create: `src/app/api/chat-uploads/route.ts`
- Create: `src/app/api/chat-uploads/[id]/route.ts`

- [ ] **Step 1: POST upload + GET image**

```typescript
// src/app/api/chat-uploads/route.ts
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "Too large (max 5MB)" }, { status: 400 });
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    return NextResponse.json({ error: "Unsupported type" }, { status: 400 });

  const id = `up_${uuid().replace(/-/g, "")}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  getDb().prepare("INSERT INTO chat_uploads (id, mime_type, size, data) VALUES (?, ?, ?, ?)")
    .run(id, file.type, buffer.length, buffer);
  return NextResponse.json({ id, source: `uploaded:${id}`, size: buffer.length });
}
```

```typescript
// src/app/api/chat-uploads/[id]/route.ts
import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = getDb().prepare("SELECT mime_type, data FROM chat_uploads WHERE id = ?").get(id) as { mime_type: string; data: Buffer } | undefined;
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.data), { headers: { "Content-Type": row.mime_type, "Cache-Control": "private, max-age=86400" } });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/chat-uploads/
git commit -m "feat(agent): chat upload endpoints"
```

**🏁 Milestone M4 complete: backend agent fully working — SSE chat, transcribe, conversations, uploads.**

---

## Task 23: Chat store (Zustand)

**Files:**
- Create: `src/store/chat-store.ts`

- [ ] **Step 1: Implement**

```typescript
// src/store/chat-store.ts
import { create } from "zustand";

type ChatState = {
  isOpen: boolean;
  activeConversationId: string | null;
  draft: string;
  attachments: Array<{ source: string; preview_url: string }>;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setActive: (id: string | null) => void;
  setDraft: (s: string) => void;
  addAttachment: (a: { source: string; preview_url: string }) => void;
  removeAttachment: (source: string) => void;
  clearAttachments: () => void;
};

export const useChatStore = create<ChatState>((set) => ({
  isOpen: false,
  activeConversationId: null,
  draft: "",
  attachments: [],
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  setActive: (id) => set({ activeConversationId: id, attachments: [], draft: "" }),
  setDraft: (s) => set({ draft: s }),
  addAttachment: (a) => set((s) => ({ attachments: [...s.attachments, a] })),
  removeAttachment: (source) => set((s) => ({ attachments: s.attachments.filter((x) => x.source !== source) })),
  clearAttachments: () => set({ attachments: [] }),
}));
```

- [ ] **Step 2: Commit**

```bash
git add src/store/chat-store.ts
git commit -m "feat(chat): Zustand store for chat panel state"
```

---

## Task 24: useChat hook (SSE consumer)

**Files:**
- Create: `src/hooks/useChat.ts`

- [ ] **Step 1: Implement**

```typescript
// src/hooks/useChat.ts
import { useState, useCallback, useRef } from "react";

export type ChatEvent =
  | { type: "text_delta"; content: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; name: string; summary: string }
  | { type: "ui_tool_request"; id: string; name: string; input: unknown }
  | { type: "ui_tool_response_ack"; id: string }
  | { type: "done"; ok: boolean }
  | { type: "error"; message: string };

export function useChat() {
  const [streaming, setStreaming] = useState(false);
  const [events, setEvents] = useState<ChatEvent[]>([]);
  const ctlRef = useRef<AbortController | null>(null);

  const send = useCallback(async (body: unknown) => {
    setStreaming(true);
    setEvents([]);
    const ctl = new AbortController();
    ctlRef.current = ctl;
    try {
      const resp = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      if (!resp.body) throw new Error("No response body");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const lines = block.split("\n");
          const event = lines.find((l) => l.startsWith("event: "))?.slice(7) || "message";
          const data = lines.find((l) => l.startsWith("data: "))?.slice(6) || "{}";
          setEvents((prev) => [...prev, { type: event, ...JSON.parse(data) } as ChatEvent]);
        }
      }
    } finally {
      setStreaming(false);
      ctlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    ctlRef.current?.abort();
  }, []);

  const respondToUiTool = useCallback(async (toolUseId: string, result: unknown) => {
    await fetch("/api/agent/chat/tool-result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool_use_id: toolUseId, result }),
    });
  }, []);

  return { send, stop, streaming, events, respondToUiTool };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useChat.ts
git commit -m "feat(chat): useChat SSE consumer hook"
```

---

## Task 25: useMediaRecorder hook

**Files:**
- Create: `src/hooks/useMediaRecorder.ts`

- [ ] **Step 1: Implement**

```typescript
// src/hooks/useMediaRecorder.ts
import { useRef, useState, useCallback } from "react";

export function useMediaRecorder() {
  const [recording, setRecording] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
    recRef.current = rec;
    chunksRef.current = [];
    rec.ondataavailable = (e) => chunksRef.current.push(e.data);
    rec.start();
    setRecording(true);
  }, []);

  const stop = useCallback((): Promise<Blob> => {
    return new Promise((resolve) => {
      const rec = recRef.current!;
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        rec.stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        resolve(blob);
      };
      rec.stop();
    });
  }, []);

  return { recording, start, stop };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useMediaRecorder.ts
git commit -m "feat(chat): useMediaRecorder hook"
```

---

## Task 26: Composer component

**Files:**
- Create: `src/components/panels/chat/Composer.tsx`
- Create: `src/components/panels/chat/MicButton.tsx`
- Create: `src/components/panels/chat/AttachButton.tsx`
- Create: `src/components/panels/chat/LibraryPickerModal.tsx`

- [ ] **Step 1: MicButton**

```tsx
// src/components/panels/chat/MicButton.tsx
"use client";
import { useState } from "react";
import { useMediaRecorder } from "@/hooks/useMediaRecorder";

export default function MicButton({ onTranscribed }: { onTranscribed: (text: string) => void }) {
  const { recording, start, stop } = useMediaRecorder();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (recording) {
      const blob = await stop();
      setBusy(true);
      const fd = new FormData();
      fd.append("audio", new File([blob], "audio.webm", { type: "audio/webm" }));
      const res = await fetch("/api/agent/transcribe", { method: "POST", body: fd });
      const { text } = await res.json();
      onTranscribed(text || "");
      setBusy(false);
    } else {
      await start();
    }
  };

  return (
    <button onClick={onClick} disabled={busy} className="p-2 rounded-lg" title={recording ? "Stop" : "Record"}>
      {busy ? "…" : recording ? "⏺" : "🎤"}
    </button>
  );
}
```

- [ ] **Step 2: AttachButton + LibraryPickerModal**

```tsx
// src/components/panels/chat/AttachButton.tsx
"use client";
import { useRef, useState } from "react";
import LibraryPickerModal from "./LibraryPickerModal";
import { useChatStore } from "@/store/chat-store";

export default function AttachButton() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [showLib, setShowLib] = useState(false);
  const addAttachment = useChatStore((s) => s.addAttachment);

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files).slice(0, 5)) {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/chat-uploads", { method: "POST", body: fd });
      const { source, id } = await res.json();
      addAttachment({ source, preview_url: `/api/chat-uploads/${id}` });
    }
  };

  return (
    <>
      <button onClick={() => fileRef.current?.click()} className="p-2 rounded-lg" title="Upload">📎</button>
      <button onClick={() => setShowLib(true)} className="p-2 rounded-lg" title="From library">📚</button>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      {showLib && <LibraryPickerModal onClose={() => setShowLib(false)} onPick={(source, preview_url) => { addAttachment({ source, preview_url }); setShowLib(false); }} />}
    </>
  );
}
```

```tsx
// src/components/panels/chat/LibraryPickerModal.tsx
"use client";
import { useEffect, useState } from "react";

type Item = { id: string; label: string; source: string; preview_url: string };

export default function LibraryPickerModal({ onClose, onPick }: { onClose: () => void; onPick: (source: string, preview_url: string) => void }) {
  const [tab, setTab] = useState<"faces" | "logos" | "refs" | "reactions">("faces");
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    const endpointAndPrefix = ({
      faces: ["/api/face-references", "fc", "/api/face-references/image"],
      logos: ["/api/logos", "lg", "/api/logos/image"],
      refs: ["/api/swipe-files", "sf", "/api/swipe-files/image"],
      reactions: ["/api/face-reactions", "fr", "/api/face-reactions/image"],
    } as const)[tab];
    fetch(endpointAndPrefix[0]).then((r) => r.json()).then((rows) => {
      setItems(rows.map((r: { filename: string; label: string }) => ({
        id: r.filename, label: r.label, source: `stored:${endpointAndPrefix[1]}_${r.filename}`,
        preview_url: `${endpointAndPrefix[2]}/${r.filename}`,
      })));
    });
  }, [tab]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl p-4 max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-2 mb-3">
          {(["faces", "logos", "refs", "reactions"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={tab === t ? "font-bold" : ""}>{t}</button>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-2 max-h-96 overflow-y-auto">
          {items.map((it) => (
            <button key={it.id} onClick={() => onPick(it.source, it.preview_url)} className="rounded-lg overflow-hidden border">
              <img src={it.preview_url} alt={it.label} className="w-full h-24 object-cover" />
              <div className="text-xs p-1 truncate">{it.label}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Composer**

```tsx
// src/components/panels/chat/Composer.tsx
"use client";
import { useChatStore } from "@/store/chat-store";
import MicButton from "./MicButton";
import AttachButton from "./AttachButton";

export default function Composer({ onSend, streaming, onStop }: { onSend: () => void; streaming: boolean; onStop: () => void }) {
  const { draft, setDraft, attachments, removeAttachment } = useChatStore();

  return (
    <div className="border-t p-2 space-y-2">
      {attachments.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {attachments.map((a) => (
            <div key={a.source} className="relative shrink-0">
              <img src={a.preview_url} className="h-12 w-12 object-cover rounded" />
              <button onClick={() => removeAttachment(a.source)} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-xs">×</button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Décris ta miniature…"
          className="flex-1 resize-none rounded-lg border px-3 py-2 text-sm"
          rows={2}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
        />
        <MicButton onTranscribed={(t) => setDraft(draft + (draft ? " " : "") + t)} />
        <AttachButton />
        {streaming ? (
          <button onClick={onStop} className="p-2 bg-red-500 text-white rounded-lg">◼</button>
        ) : (
          <button onClick={onSend} disabled={!draft && attachments.length === 0} className="p-2 bg-blue-500 text-white rounded-lg disabled:opacity-50">↑</button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/panels/chat/
git commit -m "feat(chat): Composer + MicButton + AttachButton + LibraryPickerModal"
```

---

## Task 27: Message + ToolCallCard + MessageList

**Files:**
- Create: `src/components/panels/chat/Message.tsx`
- Create: `src/components/panels/chat/ToolCallCard.tsx`
- Create: `src/components/panels/chat/MessageList.tsx`

- [ ] **Step 1: ToolCallCard**

```tsx
// src/components/panels/chat/ToolCallCard.tsx
"use client";

const ICONS: Record<string, string> = {
  web_search: "🔍",
  generate_sketch: "🎨",
  apply_workflow: "➕",
  extract_youtube_script: "📺",
  search_youtube_channel: "📊",
  get_channel_videos: "📊",
  trigger_generation: "⚡",
  list_logos: "📚",
  list_face_references: "📚",
  list_swipe_files: "📚",
  list_face_reactions: "📚",
  list_projects: "📁",
  list_past_generations: "🖼",
  get_canvas_state: "🗺",
  get_node_details: "🔎",
  remix_image: "🔁",
  edit_image: "✏️",
};

export default function ToolCallCard({ name, input, status, summary }: { name: string; input: unknown; status: "pending" | "done" | "error"; summary?: string }) {
  return (
    <div className="rounded-lg border p-2 my-1 text-xs flex items-start gap-2 bg-gray-50">
      <span>{ICONS[name] || "🛠"}</span>
      <div className="flex-1">
        <div className="font-mono">{name}</div>
        {summary && <div className="text-gray-600 mt-1">{summary}</div>}
        {status === "pending" && <div className="text-gray-400">…</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Message**

```tsx
// src/components/panels/chat/Message.tsx
"use client";
import ToolCallCard from "./ToolCallCard";

export type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  blocks: Array<
    | { type: "text"; text: string }
    | { type: "image"; preview_url: string }
    | { type: "tool_call"; id: string; name: string; input: unknown; status: "pending" | "done" | "error"; summary?: string }
  >;
};

export default function Message({ msg }: { msg: DisplayMessage }) {
  return (
    <div className={`p-2 ${msg.role === "user" ? "bg-blue-50" : ""}`}>
      <div className="text-xs text-gray-500 mb-1">{msg.role === "user" ? "Toi" : "Claude"}</div>
      {msg.blocks.map((b, i) => {
        if (b.type === "text") return <div key={i} className="text-sm whitespace-pre-wrap">{b.text}</div>;
        if (b.type === "image") return <img key={i} src={b.preview_url} className="max-w-xs rounded my-1" />;
        if (b.type === "tool_call") return <ToolCallCard key={i} {...b} />;
        return null;
      })}
    </div>
  );
}
```

- [ ] **Step 3: MessageList**

```tsx
// src/components/panels/chat/MessageList.tsx
"use client";
import { useEffect, useRef } from "react";
import Message, { DisplayMessage } from "./Message";

export default function MessageList({ messages }: { messages: DisplayMessage[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo(0, ref.current.scrollHeight); }, [messages]);
  return (
    <div ref={ref} className="flex-1 overflow-y-auto">
      {messages.map((m) => <Message key={m.id} msg={m} />)}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/panels/chat/Message.tsx src/components/panels/chat/ToolCallCard.tsx src/components/panels/chat/MessageList.tsx
git commit -m "feat(chat): Message, ToolCallCard, MessageList components"
```

---

## Task 28: ConversationList component

**Files:**
- Create: `src/components/panels/chat/ConversationList.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/panels/chat/ConversationList.tsx
"use client";
import { useEffect, useState } from "react";
import { useChatStore } from "@/store/chat-store";

type Conv = { id: string; title: string; updated_at: string };

export default function ConversationList({ projectId }: { projectId: string }) {
  const [convs, setConvs] = useState<Conv[]>([]);
  const { activeConversationId, setActive } = useChatStore();

  const reload = async () => {
    const r = await fetch(`/api/agent/conversations?project_id=${projectId}`).then((r) => r.json());
    setConvs(r);
    if (!activeConversationId && r.length > 0) setActive(r[0].id);
  };

  useEffect(() => { reload(); }, [projectId]);

  const create = async () => {
    const r = await fetch("/api/agent/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId }),
    }).then((r) => r.json());
    setConvs((c) => [r, ...c]);
    setActive(r.id);
  };

  return (
    <div className="border-b p-2">
      <details>
        <summary className="text-xs text-gray-500 cursor-pointer">Conversations ({convs.length})</summary>
        <div className="space-y-1 mt-2">
          <button onClick={create} className="text-xs w-full text-left p-1 hover:bg-gray-100 rounded">+ Nouvelle</button>
          {convs.map((c) => (
            <button
              key={c.id}
              onClick={() => setActive(c.id)}
              className={`text-xs w-full text-left p-1 rounded ${activeConversationId === c.id ? "bg-blue-100" : "hover:bg-gray-100"}`}
            >
              {c.title}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/panels/chat/ConversationList.tsx
git commit -m "feat(chat): ConversationList component"
```

---

## Task 29: ChatPanel container + integration

**Files:**
- Create: `src/components/panels/ChatPanel.tsx`
- Modify: `src/components/Canvas.tsx`
- Modify: `src/components/panels/SidebarRail.tsx`

- [ ] **Step 1: ChatPanel**

```tsx
// src/components/panels/ChatPanel.tsx
"use client";
import { useEffect, useState, useMemo } from "react";
import { useChatStore } from "@/store/chat-store";
import { useChat, ChatEvent } from "@/hooks/useChat";
import { useCanvasStore } from "@/store/canvas-store";
import ConversationList from "./chat/ConversationList";
import MessageList from "./chat/MessageList";
import Composer from "./chat/Composer";
import type { DisplayMessage } from "./chat/Message";

export default function ChatPanel({ projectId }: { projectId: string }) {
  const { isOpen, close, activeConversationId, draft, attachments, clearAttachments, setDraft } = useChatStore();
  const { send, stop, streaming, events, respondToUiTool } = useChat();
  const [history, setHistory] = useState<DisplayMessage[]>([]);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);

  // Load history when active conversation changes
  useEffect(() => {
    if (!activeConversationId) { setHistory([]); return; }
    fetch(`/api/agent/conversations/${activeConversationId}/messages`).then((r) => r.json()).then((rows) => {
      setHistory(rows.map((m: { id: string; role: string; content_json: string }) => ({
        id: m.id,
        role: m.role,
        blocks: JSON.parse(m.content_json).map((b: { type: string; text?: string; source?: { data: string; media_type: string } }) => {
          if (b.type === "text") return { type: "text", text: b.text };
          if (b.type === "image") return { type: "image", preview_url: `data:${b.source!.media_type};base64,${b.source!.data}` };
          return { type: "text", text: "" };
        }),
      })));
    });
  }, [activeConversationId]);

  // Build live message from streaming events
  const liveMessage = useMemo<DisplayMessage | null>(() => {
    if (events.length === 0) return null;
    const blocks: DisplayMessage["blocks"] = [];
    let currentText = "";
    for (const e of events) {
      if (e.type === "text_delta") currentText += e.content;
      else if (e.type === "tool_call") {
        if (currentText) { blocks.push({ type: "text", text: currentText }); currentText = ""; }
        blocks.push({ type: "tool_call", id: e.id, name: e.name, input: e.input, status: "pending" });
      } else if (e.type === "tool_result") {
        const idx = blocks.findIndex((b) => b.type === "tool_call" && b.id === e.id);
        if (idx >= 0) (blocks[idx] as { status: string; summary?: string }).status = "done", (blocks[idx] as { summary?: string }).summary = e.summary;
      }
    }
    if (currentText) blocks.push({ type: "text", text: currentText });
    return { id: "live", role: "assistant", blocks };
  }, [events]);

  // Handle UI tool requests
  useEffect(() => {
    const last = events[events.length - 1];
    if (last?.type !== "ui_tool_request") return;
    if (last.name === "request_user_image") {
      // open file picker; for v1 use a simple prompt that asks user to pick from library
      // (concrete UX: dispatch an event that PendingUiAction consumes)
      // Simplification: respond with skipped after 30s if no action
      // Concrete: render LibraryPickerModal from PendingUiAction
    }
    // ... see Task 30 for PendingUiAction component
  }, [events]);

  if (!isOpen) return null;

  const messages = liveMessage ? [...history, liveMessage] : history;

  const onSend = async () => {
    if (!activeConversationId) return;
    const text = draft;
    setDraft("");
    const atts = attachments.map((a) => ({ type: "image" as const, source: a.source }));
    clearAttachments();
    setHistory((h) => [...h, { id: `local-${Date.now()}`, role: "user", blocks: [{ type: "text", text }, ...atts.map((a) => ({ type: "image" as const, preview_url: a.source.startsWith("uploaded:") ? `/api/chat-uploads/${a.source.slice(9)}` : "" }))] }]);
    await send({
      conversation_id: activeConversationId,
      project_id: projectId,
      message: { text, attachments: atts },
      canvas_snapshot: { nodes: nodes.map((n) => ({ id: n.id, type: n.type })), edges },
    });
    // Reload history to get persisted assistant message
    const rows = await fetch(`/api/agent/conversations/${activeConversationId}/messages`).then((r) => r.json());
    setHistory(rows);
  };

  return (
    <aside className="fixed right-0 top-0 bottom-0 w-[420px] bg-white border-l shadow-xl flex flex-col z-40">
      <header className="border-b p-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Chat IA</h2>
        <button onClick={close} className="text-xl">×</button>
      </header>
      <ConversationList projectId={projectId} />
      <MessageList messages={messages} />
      <Composer onSend={onSend} streaming={streaming} onStop={stop} />
    </aside>
  );
}
```

- [ ] **Step 2: Wire into Canvas.tsx**

In `src/components/Canvas.tsx`, find the project ID source and add at the bottom of the JSX tree:
```tsx
import ChatPanel from "./panels/ChatPanel";
// ...
<ChatPanel projectId={currentProjectId} />
```

- [ ] **Step 3: Add toggle in SidebarRail**

In `src/components/panels/SidebarRail.tsx`, add a button:
```tsx
import { useChatStore } from "@/store/chat-store";
const toggle = useChatStore((s) => s.toggle);
// ...
<button onClick={toggle} title="Chat IA">✨</button>
```

- [ ] **Step 4: Manual smoke test**

Start dev server, click ✨, create a conversation, type "liste mes logos", verify response.

- [ ] **Step 5: Commit**

```bash
git add src/components/panels/ChatPanel.tsx src/components/Canvas.tsx src/components/panels/SidebarRail.tsx
git commit -m "feat(chat): ChatPanel container integrated into Canvas"
```

---

## Task 30: PendingUiAction component

**Files:**
- Create: `src/components/panels/chat/PendingUiAction.tsx`
- Modify: `src/components/panels/ChatPanel.tsx` (mount it)

- [ ] **Step 1: Implement**

```tsx
// src/components/panels/chat/PendingUiAction.tsx
"use client";
import { useState } from "react";
import LibraryPickerModal from "./LibraryPickerModal";
import SketchEditor from "@/components/panels/SketchEditor";

export default function PendingUiAction({
  request, onResolve,
}: {
  request: { id: string; name: string; input: { reason?: string; suggested_kind?: string } };
  onResolve: (toolUseId: string, result: unknown) => void;
}) {
  const [showLib, setShowLib] = useState(false);
  const [showSketch, setShowSketch] = useState(false);

  if (request.name === "request_user_image") {
    return (
      <div className="border-2 border-dashed border-blue-300 rounded-lg p-3 my-2">
        <p className="text-sm mb-2">{request.input.reason || "Claude veut une image."}</p>
        <div className="flex gap-2">
          <button onClick={() => setShowLib(true)} className="px-3 py-1 bg-blue-500 text-white rounded text-xs">📚 Bibliothèque</button>
          <button onClick={() => onResolve(request.id, { skipped: true })} className="px-3 py-1 border rounded text-xs">Skip</button>
        </div>
        {showLib && (
          <LibraryPickerModal
            onClose={() => setShowLib(false)}
            onPick={(source) => { onResolve(request.id, { source_ids: [source] }); setShowLib(false); }}
          />
        )}
      </div>
    );
  }

  if (request.name === "request_user_sketch") {
    return (
      <div className="border-2 border-dashed border-purple-300 rounded-lg p-3 my-2">
        <p className="text-sm mb-2">{request.input.reason || "Claude veut que tu dessines un croquis."}</p>
        <div className="flex gap-2">
          <button onClick={() => setShowSketch(true)} className="px-3 py-1 bg-purple-500 text-white rounded text-xs">🎨 Dessiner</button>
          <button onClick={() => onResolve(request.id, { skipped: true })} className="px-3 py-1 border rounded text-xs">Skip</button>
        </div>
        {showSketch && (
          <SketchEditor
            onSave={async (dataUrl: string) => {
              // Upload as chat-upload to get an id
              const blob = await (await fetch(dataUrl)).blob();
              const fd = new FormData();
              fd.append("file", new File([blob], "sketch.png", { type: blob.type }));
              const { source } = await fetch("/api/chat-uploads", { method: "POST", body: fd }).then((r) => r.json());
              const generated_id = source.replace("uploaded:", "");
              onResolve(request.id, { generated_id: `up_${generated_id}` });
              setShowSketch(false);
            }}
            onCancel={() => setShowSketch(false)}
          />
        )}
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 2: Wire in ChatPanel** — track latest unanswered ui_tool_request and render PendingUiAction at bottom of MessageList. Call `respondToUiTool` from useChat on resolve.

- [ ] **Step 3: Commit**

```bash
git add src/components/panels/chat/PendingUiAction.tsx src/components/panels/ChatPanel.tsx
git commit -m "feat(chat): PendingUiAction for request_user_image and request_user_sketch"
```

---

## Task 31: useCanvasSync (polling)

**Files:**
- Create: `src/hooks/useCanvasSync.ts`
- Create: `src/app/api/project/[id]/route.ts` (GET endpoint that returns updated_at)
- Modify: `src/components/Canvas.tsx` to call the hook

- [ ] **Step 1: Endpoint**

```typescript
// src/app/api/project/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = getDb().prepare("SELECT updated_at, nodes, edges FROM projects WHERE id = ?").get(id) as { updated_at: string; nodes: string; edges: string } | undefined;
  if (!row) return NextResponse.json({ updated_at: null, nodes: [], edges: [] });
  return NextResponse.json({ updated_at: row.updated_at, nodes: JSON.parse(row.nodes), edges: JSON.parse(row.edges) });
}
```

- [ ] **Step 2: Hook**

```typescript
// src/hooks/useCanvasSync.ts
import { useEffect, useRef } from "react";
import { useCanvasStore } from "@/store/canvas-store";

export function useCanvasSync(projectId: string) {
  const setNodes = useCanvasStore((s) => s.setNodes);
  const setEdges = useCanvasStore((s) => s.setEdges);
  const lastUpdatedAt = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        try {
          const data = await fetch(`/api/project/${projectId}`).then((r) => r.json());
          if (data.updated_at && data.updated_at !== lastUpdatedAt.current) {
            if (lastUpdatedAt.current !== null) {
              // External mutation detected (MCP client or agent)
              setNodes(data.nodes);
              setEdges(data.edges);
            }
            lastUpdatedAt.current = data.updated_at;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 2000));
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [projectId, setNodes, setEdges]);
}
```

(Verify `setNodes`/`setEdges` actions exist in `canvas-store`. Add them if missing.)

- [ ] **Step 3: Wire in Canvas.tsx**

```tsx
import { useCanvasSync } from "@/hooks/useCanvasSync";
// ...
useCanvasSync(currentProjectId);
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCanvasSync.ts src/app/api/project/[id]/route.ts src/components/Canvas.tsx src/store/canvas-store.ts
git commit -m "feat(canvas): polling sync for external mutations (MCP, agent)"
```

**🏁 Milestone M5 complete: end-to-end UI works.**

---

## Task 32: McpSettingsSection

**Files:**
- Create: `src/components/panels/settings/McpSettingsSection.tsx`
- Modify: `src/components/panels/SettingsPanel.tsx` to include it
- Create: `src/app/api/settings/mcp-key/route.ts`

- [ ] **Step 1: API for getting/regenerating key**

```typescript
// src/app/api/settings/mcp-key/route.ts
import { NextResponse } from "next/server";
import { ensureMcpApiKey, regenerateMcpApiKey } from "@/lib/settings";

export async function GET() {
  return NextResponse.json({ key: ensureMcpApiKey() });
}

export async function POST() {
  return NextResponse.json({ key: regenerateMcpApiKey() });
}
```

- [ ] **Step 2: Component**

```tsx
// src/components/panels/settings/McpSettingsSection.tsx
"use client";
import { useEffect, useState } from "react";

export default function McpSettingsSection() {
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);

  useEffect(() => {
    fetch("/api/settings/mcp-key").then((r) => r.json()).then((d) => setKey(d.key));
  }, []);

  const regen = async () => {
    if (!confirm("Régénérer la clé ? Les clients distants devront être reconfigurés.")) return;
    const { key: k } = await fetch("/api/settings/mcp-key", { method: "POST" }).then((r) => r.json());
    setKey(k);
  };

  const config = `{
  "mcpServers": {
    "thumbgen": {
      "url": "http://localhost:3000/api/mcp",
      "auth": { "type": "bearer", "token": "${key}" }
    }
  }
}`;

  return (
    <section className="space-y-2 p-3 border rounded">
      <h3 className="font-semibold text-sm">MCP server</h3>
      <p className="text-xs text-gray-500">Expose les tools de ThumbGen aux clients MCP distants (Claude Desktop, etc).</p>
      <div className="flex gap-2 items-center">
        <code className="flex-1 text-xs bg-gray-100 p-2 rounded">{show ? key : "•".repeat(40)}</code>
        <button onClick={() => setShow(!show)} className="text-xs">{show ? "🙈" : "👁"}</button>
        <button onClick={() => navigator.clipboard.writeText(key)} className="text-xs">📋</button>
        <button onClick={regen} className="text-xs text-red-500">↻</button>
      </div>
      <details>
        <summary className="text-xs cursor-pointer">Config Claude Desktop</summary>
        <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto">{config}</pre>
        <p className="text-xs text-gray-500 mt-1">Pour usage à distance, expose via Tailscale, ngrok ou hébergement HTTPS.</p>
      </details>
    </section>
  );
}
```

- [ ] **Step 3: Insert into SettingsPanel**

In `src/components/panels/SettingsPanel.tsx`, import and render `<McpSettingsSection />` in the appropriate location.

- [ ] **Step 4: Commit**

```bash
git add src/components/panels/settings/McpSettingsSection.tsx src/app/api/settings/mcp-key/route.ts src/components/panels/SettingsPanel.tsx
git commit -m "feat(settings): MCP API key UI section"
```

---

## Task 33: GC job for expired uploads/sketches

**Files:**
- Create: `src/lib/agent/gc.ts`
- Modify: `src/lib/db.ts` to call GC at startup

- [ ] **Step 1: GC function**

```typescript
// src/lib/agent/gc.ts
import { getDb } from "@/lib/db";

export function runGc(): { uploads: number; sketches: number } {
  const uploads = getDb().prepare(
    "DELETE FROM chat_uploads WHERE attached = 0 AND created_at < datetime('now', '-24 hours')"
  ).run();
  const sketches = getDb().prepare(
    "DELETE FROM generated_sketches WHERE attached = 0 AND created_at < datetime('now', '-1 hour')"
  ).run();
  return { uploads: uploads.changes, sketches: sketches.changes };
}

let interval: NodeJS.Timeout | null = null;
export function startGcLoop() {
  if (interval) return;
  runGc();
  interval = setInterval(() => runGc(), 60 * 60 * 1000);  // hourly
}
```

- [ ] **Step 2: Start at server boot**

In `src/lib/db.ts`, after `init`:
```typescript
import { startGcLoop } from "@/lib/agent/gc";
// at module load (after db is ready):
if (typeof window === "undefined") startGcLoop();
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/gc.ts src/lib/db.ts
git commit -m "feat(agent): GC job for expired uploads and sketches"
```

---

## Task 34: Cost tracking display

**Files:**
- Create: `src/app/api/agent/usage/route.ts`
- Modify: `src/components/panels/settings/McpSettingsSection.tsx` (or create a new section)

- [ ] **Step 1: API**

```typescript
// src/app/api/agent/usage/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const today = getDb().prepare(
    "SELECT COALESCE(SUM(cost_estimate), 0) AS c FROM messages WHERE date(created_at) = date('now')"
  ).get() as { c: number };
  const month = getDb().prepare(
    "SELECT COALESCE(SUM(cost_estimate), 0) AS c FROM messages WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')"
  ).get() as { c: number };
  // Add generations_log totals too
  const genToday = getDb().prepare(
    "SELECT COALESCE(SUM(cost_estimate), 0) AS c FROM generations_log WHERE date(created_at) = date('now')"
  ).get() as { c: number };
  const genMonth = getDb().prepare(
    "SELECT COALESCE(SUM(cost_estimate), 0) AS c FROM generations_log WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')"
  ).get() as { c: number };
  return NextResponse.json({
    today: today.c + genToday.c,
    month: month.c + genMonth.c,
  });
}
```

- [ ] **Step 2: Display in settings or top bar (small badge)**

Choose a location and render `Today: $X — Month: $Y` reading from this endpoint, refreshing every 30s.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/agent/usage/route.ts src/components/panels/settings/
git commit -m "feat(agent): cost tracking display"
```

---

## Task 35: README docs for remote MCP setup

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a section**

Append to README.md:
```markdown
## MCP server (use ThumbGen from another Claude)

ThumbGen exposes its tools (canvas manipulation, generation, library, YouTube) as an MCP server. Connect from Claude Desktop, Claude Code, or any MCP client.

### 1. Get your API key
Open Settings → MCP, copy the bearer token.

### 2. Configure Claude Desktop
Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or equivalent:
```json
{
  "mcpServers": {
    "thumbgen": {
      "url": "http://localhost:3000/api/mcp",
      "auth": { "type": "bearer", "token": "tg_xxxxx" }
    }
  }
}
```
Restart Claude Desktop.

### 3. Remote access
For use from another device, expose ThumbGen via:
- **Tailscale** (recommended): `tailscale serve https / http://localhost:3000`
- **ngrok**: `ngrok http 3000` then use the HTTPS URL
- **Hosting**: deploy with HTTPS

⚠️ Always use HTTPS for remote access. The Origin header is validated to prevent DNS rebinding attacks.

### Available tools
list_projects, list_logos, list_face_references, list_swipe_files, list_face_reactions, list_past_generations, get_canvas_state, apply_workflow, generate_sketch, remix_image, edit_image, trigger_generation, extract_youtube_script, search_youtube_channel, get_channel_videos.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: MCP server setup and remote usage"
```

**🏁 Milestone M6 complete: production-ready.**

---

## Self-Review

**Spec coverage check (versus `2026-04-25-thumbgen-agent-design.md`):**

- ✅ Section 2 (architecture in 3 layers) — Tasks 13–15 (registry → MCP server → InMemoryClient + HTTP route)
- ✅ Section 3 (data model) — Task 2
- ✅ Section 4.A–E (all tools) — Tasks 8–12
- ✅ Section 4.F (UI-only tools) — Task 19, 30
- ✅ Section 4 (apply_workflow blueprint + diff) — Task 4, 10
- ✅ Section 5 (browser agent SSE loop) — Tasks 20–21
- ✅ Section 5 (Whisper transcribe) — Task 16
- ✅ Section 5 (system prompt + caching) — Task 18
- ✅ Section 6 (MCP HTTP route + bearer + origin) — Task 15
- ✅ Section 6 (notification browser via polling) — Task 31
- ✅ Section 7 (UI ChatPanel + sub-components) — Tasks 23–30
- ✅ Section 8 (auth, image limits) — Tasks 15, 22
- ✅ Section 8 (cost tracking) — Task 34
- ✅ Section 8 (GC) — Task 33
- ✅ Section 11 (deps) — Task 1
- ✅ Section 12 (phasing) — milestones M1–M6 align with phases 0–5

**Type consistency check :** function names align (`runAgentLoop`, `buildMcpServer`, `getInMemoryMcpClient`, `resolveImageSource`, `markAttached`, `applyWorkflowTool`). `ImageSource` matches between schema (Task 4), resolver (Task 6), and apply (Task 10). `Blueprint` referenced consistently from Task 4 onwards. `ToolDefinition` consistent from Task 5.

**Placeholder check :** no TBD/TODO. Some steps reference "verify exact import path" or "verify table name" — these are explicit instructions to check, not placeholders.

**Things the implementer should verify against the codebase before starting :**
- Exact name of the face references table (`face_references` vs `face_reactions` — DB shows `face_reactions`, the spec uses `face_references` for the *user-attached face* concept; the registry tools may need to map differently)
- Existing routes signature (`/api/face-references` may not exist as such — adapt LibraryPickerModal endpoints)
- The `@modelcontextprotocol/sdk` import paths and `transport.handleRequest` signature for the installed version
- Anthropic SDK current pricing constants for `claude-sonnet-4-6` to fix the cost computation in Task 21

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-25-thumbgen-agent.md`.**

**Two execution options :**

**1. Subagent-Driven (recommended)** — Je dispatch un subagent par task, review entre les tasks, itération rapide.

**2. Inline Execution** — J'exécute les tasks dans cette session avec checkpoints aux milestones.

Tu préfères laquelle ?
