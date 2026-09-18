# Brainstorm slash skills picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the creator types `/` in the ThumbGen Brainstorm composer, show a Cursor-like slash picker of user-facing skills; picking `/croquis` (or typing it) makes the agent load `generate_sketch` this turn and brainstorm-then-sketch, without dumping every SKILL.md into the system prompt and without bringing back the 7-step wizard.

**Architecture:** A client-safe curated slash catalog (not the 27 tool SKILL.md files) drives the in-composer picker. Picking a row inserts `/alias ` into the draft; sending keeps that token in the visible user message. The chat route parses the first known slash token on a new user turn and appends one uncached `<invoked_skill>` system block containing **that** skill’s body. `read_skill` stays chat-only; MCP is unchanged; the cached `AGENT_SYSTEM_PROMPT` still only lists name + description.

**Tech Stack:** Next.js 16.2 App Router, React 19.2, TypeScript strict, Tailwind v4, shadcn `base-nova` on Base UI, Vercel AI SDK `ai` 7.0.99 + `@ai-sdk/react` 4.0.102, Zustand 5, vitest 4, happy-dom 20 for composer tests.

**Parent spec:** `docs/superpowers/specs/2026-09-17-agent-skills-runtime-design.md` (progressive disclosure, `read_skill` chat-only, no « Étape n/7 »). This plan adds the missing **user-facing slash picker**; it does not replace the skills runtime.

## Global Constraints

- **Worktree.** Implement in `/Users/antoinevigneau/thumbgen-real/.worktrees/agent-skills` on `feat/agent-skills`. Do **not** edit `/Users/antoinevigneau/thumbgen`. Do not merge F3c. Do not Docker rebuild from a worktree. Do not touch `data/thumbgen.db`. Never push unless the human asks in that session.
- **No 7-step wizard.** Do not reintroduce `THUMBNAIL JOURNEY`, `STEPS` 1–7, `GUIDED INTERVIEW`, `Until then:`, `trigger_generation`, or UI copy « Étape n/7 ». `INTERVIEW_START_MESSAGE` stays `"Aide-moi à construire la miniature de ma vidéo."`. The Fiche stays optional memory (`update_brief`), not a pipeline.
- **Progressive disclosure.** Cached `AGENT_SYSTEM_PROMPT` keeps `buildSkillsCatalogBlock()` (name + description only). Never concatenate all 27 SKILL.md bodies into the static prompt. At most **one** skill body is injected per turn, in an uncached `<invoked_skill>` block, and only when the user invoked a picker skill.
- **`read_skill` stays chat-only.** Do not register it on MCP. Do not add a new chat tool for slash. Picker is Brainstorm UI only.
- **`/croquis` is not a second sketch skill.** It is the user-facing alias of existing `generate_sketch`. Do not create `src/lib/agent/skills/croquis/`. Cursor’s personal `/croquis` skill is out of repo — do not copy it in.
- **shadcn here is `base-nova` on Base UI, not Radix.** Do not add `command` / `cmdk` / a Combobox for v1 (they steal textarea focus). Picker is an in-flow list above the textarea so the Card’s `overflow-hidden` does not clip it. `cn` from `"cn"`. French UI copy; apostrophes in JSX as `&apos;`. `motion-reduce:` on any animation. No new `style={{…}}`.
- **Commands.** Tests: `./node_modules/.bin/vitest run tests/path/file.test.ts`. Type-check: `./node_modules/.bin/tsc --noEmit` (if errors only in `.next/types` / `.next/dev/types`, `rm -rf .next/types .next/dev/types` and re-run). Lint: `./node_modules/.bin/eslint <files>`. Node: `/opt/homebrew/bin/node` if worktree `node` is missing. No `npx`. Tests never call a real model or paid APIs.
- **Commits.** One commit per task, explicit paths only (never `git add -A` / `git add .`). Never `--no-verify`. Never push.

---

## Design rulings (locked)

| Decision | Ruling | Alternatives (rejected for v1) |
|---|---|---|
| **Source of the list** | Curated user-facing subset in `slash-catalog.ts` (8 workflows). Tool skills (`finish_turn`, `list_*`, `place_node`, `get_canvas_state`, …) stay model-only via the name+description catalog + `read_skill`. | Dump all 27 SKILL.md in the picker (noisy, looks like an API reference). Parse `slash:` frontmatter from every SKILL.md and fetch via API (async picker, `fs` on the client). |
| **What happens on pick** | Insert `/alias ` into the draft (user can type more). On send, the visible bubble keeps that text. The server loads **that one** SKILL.md body into `<invoked_skill>` this turn so the model cannot “forget” to call `read_skill`. Do **not** auto-send on pick. | Hidden system-only cue with a cleaned bubble (retry/regenerate would lose the invoke unless we add DB metadata). Force a synthetic `read_skill` tool call in history (AI SDK plumbing). Auto-send on pick (cannot add “moi à droite”). Prompt-only “please call `read_skill`” (today’s failure mode). |
| **`/croquis` vs `generate_sketch`** | One picker row: `/croquis` → skill `generate_sketch`. Hidden alias: typing `/generate_sketch` resolves to the same row. `generate_sketch` already says: empty idea → `ask_user` / `thumbnail-packaging` first, then one cheap pencil draft, never the final « Générer ». | A new `croquis` SKILL.md that duplicates the sketch workflow. Two picker rows for the same action. |
| **Keyboard** | `/` opens the palette only as a **command token** (start of input or after whitespace). Filter as you type. ArrowUp/Down, Enter/Tab pick (do not send), Escape closes and leaves `/query`. Enter with **zero** matches sends as normal text. Do not intercept `/` inside URLs or mid-word (`https://…/watch`, `n/7`, `foo/bar`). | Steal every `/`. Require the token only at column 0 (breaks `regarde ça /croquis`). |
| **MCP vs chat** | Picker + `<invoked_skill>` are Brainstorm / `postV2` only. MCP clients still see `generate_sketch` as a tool, never `read_skill`, never slash. | Expose `read_skill` on MCP so Cursor and the app share one loader (out of scope; ThumbGen MCP has no composer). |
| **One skill per send** | `parseInvokedSkillFromText` returns the **first** known slash token. A second `/` later in the same message is leftover user text. | Multi-skill invoke in one turn. |

**`/croquis` behaviour the model must follow** (already in `generate_sketch` SKILL.md, reinforced by the invoke block): if the video/composition is unclear, brainstorm with `ask_user` (and `thumbnail-packaging` via `read_skill` if needed), then call `generate_sketch` once. Never treat the sketch as the published thumbnail. Never a 7-step interview.

---

## File Structure

**Create**
- `src/lib/agent/skills/slash-catalog.ts` — curated picker rows (client-safe, no `fs`).
- `src/lib/agent/skills/slash-query.ts` — cursor query, filter, apply pick, parse invoke from user text (client-safe).
- `src/lib/agent/skills/invoked-skill.ts` — server: resolve body via `readSkillBody`, build `<invoked_skill>` block.
- `src/components/panels/chat/SkillPicker.tsx` — listbox UI.
- Tests: `tests/agent/slash-catalog.test.ts`, `tests/agent/slash-query.test.ts`, `tests/agent/invoked-skill.test.ts`, `tests/agent/system-prompt-slash.test.ts`, `tests/agent/v2-route-handler-slash.test.ts`, `tests/chat/skill-picker-render.test.tsx`, `tests/chat/composer-slash.test.tsx`.

**Modify**
- `src/lib/agent/system-prompt.ts` — one cached sentence about `<invoked_skill>`; `buildSystemMessages` optional 5th argument appends that uncached block.
- `src/lib/agent/v2/route-handler.ts` — on a new user turn, resolve slash from the user text and pass the block into `buildSystemMessages`.
- `src/components/panels/chat/Composer.tsx` — picker + keyboard; placeholder mentions `/`.
- `src/components/panels/chat/ChatEmptyState.tsx` — one extra sentence in the empty description (button message unchanged).
- `src/lib/agent/skills/generate_sketch/SKILL.md` — document in-app slash `/croquis`.
- `AGENTS.md` — one bullet that Brainstorm slash lives in `slash-catalog.ts`.
- `tests/agent/finish-turn-tool.test.ts` — assert MCP still hides `read_skill`.
- `tests/chat/chat-empty-state.test.tsx` — description may mention `/croquis`; start message unchanged.

**Unchanged on purpose:** `catalog.ts` (still lists all 27 for the model), `read-skill.ts`, MCP server, `ChatPanel.tsx` send path / request body (slash is in the user text, so retry works), chat transport, Fiche schema, fake-agent (still must not call paid `generate_sketch`).

## Execution lanes

Single lane (composer + route share the slash token contract). Do not parallelize.

---

## Chunk 1: Catalog, parsing, invoke block, route

### Task 1: Curated slash catalog

**Files:**
- Create: `src/lib/agent/skills/slash-catalog.ts`
- Create: `tests/agent/slash-catalog.test.ts`
- Modify: `AGENTS.md` (Agent skills section — one bullet)

**Interfaces:**
- Consumes: `listSkillCatalog()` in tests only (server `catalog.ts`).
- Produces: `SlashSkill`, `SLASH_SKILLS`, `lookupSlashToken(token: string): SlashSkill | null`

- [ ] **Step 1: Write the failing test**

Create `tests/agent/slash-catalog.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

import { SLASH_SKILLS, lookupSlashToken } from "@/lib/agent/skills/slash-catalog";
import { listSkillCatalog } from "@/lib/agent/skills/catalog";

describe("slash catalog", () => {
  it("exposes croquis as the only sketch workflow, mapped to generate_sketch", () => {
    const croquis = SLASH_SKILLS.find((row) => row.slash === "croquis");
    expect(croquis).toEqual(
      expect.objectContaining({
        slash: "croquis",
        skill: "generate_sketch",
        title: "Croquis",
      }),
    );
    expect(SLASH_SKILLS.filter((row) => row.skill === "generate_sketch")).toHaveLength(1);
    expect(SLASH_SKILLS.some((row) => row.slash === "generate_sketch")).toBe(false);
  });

  it("is a subset of the SKILL.md catalog, with unique slashes", () => {
    const known = new Set(listSkillCatalog().map((skill) => skill.name));
    const slashes = SLASH_SKILLS.map((row) => row.slash);
    expect(new Set(slashes).size).toBe(slashes.length);
    expect(SLASH_SKILLS.length).toBeGreaterThanOrEqual(6);
    expect(SLASH_SKILLS.length).toBeLessThan(listSkillCatalog().length);
    for (const row of SLASH_SKILLS) {
      expect(known.has(row.skill), row.skill).toBe(true);
      expect(row.slash).toMatch(/^[a-z][a-z0-9-]{0,40}$/);
      expect(row.title.length).toBeGreaterThan(0);
      expect(row.description.length).toBeGreaterThan(0);
    }
  });

  it("looks up /croquis and the hidden /generate_sketch alias, not finish_turn", () => {
    expect(lookupSlashToken("croquis")?.skill).toBe("generate_sketch");
    expect(lookupSlashToken("Generate_Sketch")?.skill).toBe("generate_sketch");
    expect(lookupSlashToken("finish_turn")).toBeNull();
    expect(lookupSlashToken("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/agent/slash-catalog.test.ts`

Expected: FAIL — `slash-catalog` is not defined.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/agent/skills/slash-catalog.ts`:

```ts
/**
 * User-facing Brainstorm slash commands (composer `/` picker).
 * Not the full SKILL.md catalog — tool skills stay model-only.
 * Safe to import from client components (no fs).
 */

export type SlashSkill = {
  /** Token after `/` in the composer (e.g. croquis). */
  slash: string;
  /** Exact SKILL.md `name` passed to read_skill / <invoked_skill>. */
  skill: string;
  title: string;
  description: string;
};

export const SLASH_SKILLS: SlashSkill[] = [
  {
    slash: "croquis",
    skill: "generate_sketch",
    title: "Croquis",
    description: "Brainstorm puis dessine un croquis (pas la miniature finale).",
  },
  {
    slash: "miniature",
    skill: "thumbnail-packaging",
    title: "Nouvelle miniature",
    description: "Promesse, titres, textes miniature, packs A/B.",
  },
  {
    slash: "canvas",
    skill: "existing-workflow",
    title: "Workflow existant",
    description: "Analyse ou modifie le canvas ouvert.",
  },
  {
    slash: "recherche",
    skill: "research_topic",
    title: "Recherche",
    description: "Brief du sujet (Perplexity, payant).",
  },
  {
    slash: "concurrents",
    skill: "find_competitor_thumbnails",
    title: "Concurrents",
    description: "Miniatures qui performent dans la niche.",
  },
  {
    slash: "script",
    skill: "extract_youtube_script",
    title: "Script YouTube",
    description: "Transcription d'une vidéo collée.",
  },
  {
    slash: "youtube",
    skill: "search_youtube",
    title: "Chercher YouTube",
    description: "Recherche publique de vidéos.",
  },
  {
    slash: "logos",
    skill: "find_logos",
    title: "Logos",
    description: "Trouver des marques à coller sur la miniature.",
  },
];

/** Resolves a typed token (`croquis` or hidden `generate_sketch`) to a picker row. */
export function lookupSlashToken(token: string): SlashSkill | null {
  const normalized = token.trim().toLowerCase();
  if (!normalized) return null;
  return SLASH_SKILLS.find((row) => row.slash === normalized || row.skill === normalized) ?? null;
}
```

In `AGENTS.md`, under `## Agent skills (Brainstorm)`, add:

```
- In-app `/` picker: `src/lib/agent/skills/slash-catalog.ts` (user-facing aliases; `/croquis` → `generate_sketch`). Not Cursor personal skills.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/agent/slash-catalog.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/skills/slash-catalog.ts tests/agent/slash-catalog.test.ts AGENTS.md
git commit -m "$(cat <<'EOF'
feat(agent): add Brainstorm slash catalog for /croquis

EOF
)"
```

---

### Task 2: Slash query, filter, pick, parse

**Files:**
- Create: `src/lib/agent/skills/slash-query.ts`
- Create: `tests/agent/slash-query.test.ts`

**Interfaces:**
- Consumes: `SlashSkill`, `SLASH_SKILLS`, `lookupSlashToken` from Task 1
- Produces:
  - `slashQueryAtCursor(text: string, cursor: number): { start: number; query: string } | null`
  - `filterSlashSkills(query: string): SlashSkill[]`
  - `applySlashPick(text: string, cursor: number, alias: string): { text: string; cursor: number }`
  - `parseInvokedSkillFromText(text: string): SlashSkill | null`

- [ ] **Step 1: Write the failing test**

Create `tests/agent/slash-query.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  applySlashPick,
  filterSlashSkills,
  parseInvokedSkillFromText,
  slashQueryAtCursor,
} from "@/lib/agent/skills/slash-query";

describe("slashQueryAtCursor", () => {
  it("opens at start of input and after whitespace", () => {
    expect(slashQueryAtCursor("/", 1)).toEqual({ start: 0, query: "" });
    expect(slashQueryAtCursor("/cro", 4)).toEqual({ start: 0, query: "cro" });
    expect(slashQueryAtCursor("hello /cro", 10)).toEqual({ start: 6, query: "cro" });
    expect(slashQueryAtCursor("a\n/", 3)).toEqual({ start: 2, query: "" });
  });

  it("does not steal / inside a URL, path, or mid-word", () => {
    const url = "https://youtube.com/watch?v=abc";
    expect(slashQueryAtCursor(url, url.length)).toBeNull();
    expect(slashQueryAtCursor("https://", 8)).toBeNull();
    expect(slashQueryAtCursor("n/7", 3)).toBeNull();
    expect(slashQueryAtCursor("foo/bar", 7)).toBeNull();
    expect(slashQueryAtCursor("regarde/", 8)).toBeNull();
  });

  it("only looks at the token ending at the cursor", () => {
    expect(slashQueryAtCursor("/croquis moi", 12)).toBeNull();
    expect(slashQueryAtCursor("/croquis moi", 8)).toEqual({ start: 0, query: "croquis" });
  });
});

describe("filterSlashSkills", () => {
  it("lists every picker skill on an empty query and filters croquis", () => {
    expect(filterSlashSkills("").map((row) => row.slash)).toContain("croquis");
    expect(filterSlashSkills("  ").length).toBe(filterSlashSkills("").length);
    expect(filterSlashSkills("CRO").map((row) => row.slash)).toEqual(["croquis"]);
    expect(filterSlashSkills("generate_sketch").map((row) => row.slash)).toEqual(["croquis"]);
    expect(filterSlashSkills("zzzz-nope")).toEqual([]);
  });
});

describe("applySlashPick", () => {
  it("replaces the open /query with /alias and a trailing space", () => {
    expect(applySlashPick("/cro", 4, "croquis")).toEqual({ text: "/croquis ", cursor: 9 });
    expect(applySlashPick("go /c", 5, "croquis")).toEqual({ text: "go /croquis ", cursor: 12 });
  });
});

describe("parseInvokedSkillFromText", () => {
  it("invokes the first known slash token, including hidden skill-name alias", () => {
    expect(parseInvokedSkillFromText("/croquis")?.skill).toBe("generate_sketch");
    expect(parseInvokedSkillFromText("/croquis moi à droite")?.slash).toBe("croquis");
    expect(parseInvokedSkillFromText("  /croquis")?.skill).toBe("generate_sketch");
    expect(parseInvokedSkillFromText("idée /croquis svp")?.skill).toBe("generate_sketch");
    expect(parseInvokedSkillFromText("/generate_sketch pencil")?.slash).toBe("croquis");
  });

  it("ignores unknown slashes, URLs, and tool names that are not picker skills", () => {
    expect(parseInvokedSkillFromText("/unknown")).toBeNull();
    expect(parseInvokedSkillFromText("https://youtube.com/watch?v=abc")).toBeNull();
    expect(parseInvokedSkillFromText("/finish_turn")).toBeNull();
    expect(parseInvokedSkillFromText("pas un slash")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/agent/slash-query.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/agent/skills/slash-query.ts`:

```ts
import { lookupSlashToken, SLASH_SKILLS, type SlashSkill } from "./slash-catalog";

const QUERY_AT_CURSOR = /(?:^|\s)\/([a-z0-9_-]*)$/i;
const TOKEN_IN_TEXT = /(^|\s)\/([a-z0-9][a-z0-9_-]{0,80})(?=\s|$)/gi;

export type SlashQuery = { start: number; query: string };

/** Open `/` token ending at the cursor (start of input or after whitespace). */
export function slashQueryAtCursor(text: string, cursor: number): SlashQuery | null {
  if (cursor < 0 || cursor > text.length) return null;
  const before = text.slice(0, cursor);
  const match = before.match(QUERY_AT_CURSOR);
  if (!match) return null;
  const query = match[1] ?? "";
  const start = before.length - query.length - 1;
  if (start < 0 || text[start] !== "/") return null;
  return { start, query };
}

export function filterSlashSkills(query: string): SlashSkill[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...SLASH_SKILLS];
  return SLASH_SKILLS.filter((row) => {
    return (
      row.slash.includes(needle) ||
      row.skill.toLowerCase().includes(needle) ||
      row.title.toLowerCase().includes(needle) ||
      row.description.toLowerCase().includes(needle)
    );
  });
}

export function applySlashPick(text: string, cursor: number, alias: string): { text: string; cursor: number } {
  const insertion = `/${alias} `;
  const open = slashQueryAtCursor(text, cursor);
  if (!open) {
    const next = `${text.slice(0, cursor)}${insertion}${text.slice(cursor)}`;
    return { text: next, cursor: cursor + insertion.length };
  }
  const next = `${text.slice(0, open.start)}${insertion}${text.slice(cursor)}`;
  return { text: next, cursor: open.start + insertion.length };
}

/** First known picker slash in the user message (send / retry source of truth). */
export function parseInvokedSkillFromText(text: string): SlashSkill | null {
  for (const match of text.matchAll(TOKEN_IN_TEXT)) {
    const entry = lookupSlashToken(match[2] ?? "");
    if (entry) return entry;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/agent/slash-query.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/skills/slash-query.ts tests/agent/slash-query.test.ts
git commit -m "$(cat <<'EOF'
feat(agent): parse Brainstorm slash tokens without stealing URLs

EOF
)"
```

---

### Task 3: Invoke block + cached prompt sentence

**Files:**
- Create: `src/lib/agent/skills/invoked-skill.ts`
- Create: `tests/agent/invoked-skill.test.ts`
- Create: `tests/agent/system-prompt-slash.test.ts`
- Modify: `src/lib/agent/system-prompt.ts`
- Modify: `src/lib/agent/skills/generate_sketch/SKILL.md` (one line under the intro)

**Interfaces:**
- Consumes: `parseInvokedSkillFromText` (Task 2), `readSkillBody` from `catalog.ts`
- Produces:
  - `InvokedSkill = { slash: string; skill: string; title: string; body: string }`
  - `resolveInvokedSkill(userText: string): InvokedSkill | null`
  - `buildInvokedSkillBlock(invoked: InvokedSkill): string`
  - `buildSystemMessages(..., invokedSkillBlock?: string | null)` 5th arg

- [ ] **Step 1: Write the failing tests**

Create `tests/agent/invoked-skill.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildInvokedSkillBlock, resolveInvokedSkill } from "@/lib/agent/skills/invoked-skill";
import { AGENT_SYSTEM_PROMPT } from "@/lib/agent/system-prompt";

const BODY_MARKER = "graphite-on-paper";

describe("resolveInvokedSkill", () => {
  it("loads generate_sketch body for /croquis and not for unknown slashes", () => {
    const invoked = resolveInvokedSkill("/croquis moi à droite");
    expect(invoked?.slash).toBe("croquis");
    expect(invoked?.skill).toBe("generate_sketch");
    expect(invoked?.body).toContain(BODY_MARKER);
    expect(invoked?.body).not.toMatch(/^---/);
    expect(resolveInvokedSkill("https://youtube.com/watch?v=abc")).toBeNull();
    expect(resolveInvokedSkill("/finish_turn")).toBeNull();
  });
});

describe("buildInvokedSkillBlock", () => {
  it("wraps one skill body and tells the model not to read_skill it again this turn", () => {
    const invoked = resolveInvokedSkill("/croquis")!;
    const block = buildInvokedSkillBlock(invoked);
    expect(block.startsWith('<invoked_skill name="generate_sketch" slash="croquis">')).toBe(true);
    expect(block).toContain("already loaded");
    expect(block).toContain("do not call read_skill for \"generate_sketch\"");
    expect(block).toContain(BODY_MARKER);
    expect(block).toContain("brainstorm");
    expect(block).not.toContain("Étape n/7");
    expect(block.endsWith("</invoked_skill>")).toBe(true);
  });

  it("does not live in the cached system prompt", () => {
    expect(AGENT_SYSTEM_PROMPT).toContain("<invoked_skill>");
    expect(AGENT_SYSTEM_PROMPT).not.toContain(BODY_MARKER);
    expect(AGENT_SYSTEM_PROMPT).not.toContain("limit = 2 × max(1, variants.length) + 3");
  });
});
```

Create `tests/agent/system-prompt-slash.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { AGENT_SYSTEM_PROMPT, buildSystemMessages } from "@/lib/agent/system-prompt";

describe("system prompt — slash invoke block", () => {
  it("keeps the catalog in the cached block and appends invoked_skill uncached last", () => {
    const without = buildSystemMessages({ nodes: [], edges: [] }, "proj_1");
    expect(without[0].text).toBe(AGENT_SYSTEM_PROMPT);
    expect(without[0].cache_control).toEqual({ type: "ephemeral" });
    expect(without.some((block) => block.text.startsWith("<invoked_skill"))).toBe(false);

    const block = '<invoked_skill name="generate_sketch" slash="croquis">\nbody\n</invoked_skill>';
    const withInvoke = buildSystemMessages({ nodes: [], edges: [] }, "proj_1", undefined, null, block);
    expect(withInvoke.at(-1)).toEqual({ type: "text", text: block });
    expect(withInvoke.at(-1)!.cache_control).toBeUndefined();
    expect(withInvoke[0].text).toBe(AGENT_SYSTEM_PROMPT);
  });

  it("does not dump tool skill bodies into the static prompt", () => {
    expect(AGENT_SYSTEM_PROMPT).toContain("generate_sketch");
    expect(AGENT_SYSTEM_PROMPT).toContain("If this turn includes an <invoked_skill> block");
    expect(AGENT_SYSTEM_PROMPT).not.toContain("graphite-on-paper");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/agent/invoked-skill.test.ts tests/agent/system-prompt-slash.test.ts`

Expected: FAIL — `invoked-skill` missing and/or 5th argument unused.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/agent/skills/invoked-skill.ts`:

```ts
import { readSkillBody } from "./catalog";
import { parseInvokedSkillFromText } from "./slash-query";

export type InvokedSkill = {
  slash: string;
  skill: string;
  title: string;
  body: string;
};

export function resolveInvokedSkill(userText: string): InvokedSkill | null {
  const entry = parseInvokedSkillFromText(userText);
  if (!entry) return null;
  const body = readSkillBody(entry.skill);
  if (!body) return null;
  return { slash: entry.slash, skill: entry.skill, title: entry.title, body };
}

export function buildInvokedSkillBlock(invoked: InvokedSkill): string {
  return [
    `<invoked_skill name="${invoked.skill}" slash="${invoked.slash}">`,
    `The user explicitly invoked this skill with /${invoked.slash} (${invoked.title}). Follow it this turn.`,
    `These instructions are already loaded — do not call read_skill for "${invoked.skill}" unless you need a re-read. You may read_skill other skills this one names.`,
    "If the idea is still empty, brainstorm with the user first (ask_user), then continue the skill. Do not mention a 7-step journey or Étape n/7.",
    "",
    invoked.body,
    "</invoked_skill>",
  ].join("\n");
}
```

In `src/lib/agent/system-prompt.ts`, insert this sentence in `AGENT_SYSTEM_PROMPT` immediately after `${buildSkillsCatalogBlock()}` (still inside the template, before the `If <canvas_state>` paragraph):

```
If this turn includes an <invoked_skill> block, follow that skill now. It is already loaded — do not call read_skill for that name unless you need a re-read.
```

The cached block becomes:

```
${buildSkillsCatalogBlock()}

If this turn includes an <invoked_skill> block, follow that skill now. It is already loaded — do not call read_skill for that name unless you need a re-read.
If <canvas_state> has nodes AND the user asks about that existing workflow, read_skill existing-workflow first. ...
```

Change `buildSystemMessages` to accept an optional 5th argument and append it last (existing 4-arg callers stay identical):

```ts
/**
 * Returns the "system" parameter as an array of blocks. The first block is the
 * static persona+rules with cache_control set, so it's cached across turns.
 * The following blocks are per-turn: reply language, channel profile, project
 * id, canvas snapshot, the thumbnail brief when the conversation has one, and
 * an <invoked_skill> body when the user sent a Brainstorm slash command.
 */
export function buildSystemMessages(
  canvasSnapshot: unknown,
  projectId?: string,
  prefs: AgentPromptPrefs = DEFAULT_AGENT_PROMPT_PREFS,
  brief: ThumbnailBrief | null = null,
  invokedSkillBlock?: string | null,
): Array<{
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}> {
  const blocks: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> = [
    {
      type: "text",
      text: AGENT_SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" },
    },
    { type: "text", text: buildResponseLanguageBlock(prefs) },
  ];
  const channelProfile = buildChannelProfileBlock(prefs);
  if (channelProfile) blocks.push({ type: "text", text: channelProfile });
  if (projectId) {
    blocks.push({
      type: "text",
      text: `<project_id>${projectId}</project_id>\n\nThe project_id above identifies the current canvas. Pass it as the \`project_id\` argument to any tool that takes one (apply_workflow, get_canvas_state, list_past_generations, etc.).`,
    });
  }
  blocks.push({
    type: "text",
    text: `<canvas_state>\n${JSON.stringify(canvasSnapshot, null, 2)}\n</canvas_state>`,
  });
  if (brief) blocks.push({ type: "text", text: buildThumbnailBriefBlock(brief) });
  if (invokedSkillBlock) blocks.push({ type: "text", text: invokedSkillBlock });
  return blocks;
}
```

In `src/lib/agent/skills/generate_sketch/SKILL.md`, after `Load this skill before the first sketch in a conversation. Do not mention a 7-step journey.` add:

```
In-app slash: **/croquis** (same skill — do not invent a second sketch workflow). When invoked that way and the idea is empty, brainstorm with them first, then sketch.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/agent/invoked-skill.test.ts tests/agent/system-prompt-slash.test.ts tests/agent/system-prompt.test.ts tests/agent/system-prompt-finish-turn.test.ts tests/agent/skills-runtime.test.ts tests/agent/system-prompt-journey.test.ts`

Expected: PASS (including existing prompt tests; `buildSystemMessages` length unchanged when no 5th arg).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/skills/invoked-skill.ts src/lib/agent/system-prompt.ts src/lib/agent/skills/generate_sketch/SKILL.md tests/agent/invoked-skill.test.ts tests/agent/system-prompt-slash.test.ts
git commit -m "$(cat <<'EOF'
feat(agent): inject one invoked skill body per slash turn

EOF
)"
```

---

### Task 4: Chat route wires the invoke block

**Files:**
- Modify: `src/lib/agent/v2/route-handler.ts`
- Create: `tests/agent/v2-route-handler-slash.test.ts`
- Modify: `tests/agent/finish-turn-tool.test.ts` (MCP still hides `read_skill`)

**Interfaces:**
- Consumes: `resolveInvokedSkill`, `buildInvokedSkillBlock` (Task 3); `lastMessageText` already computed for new user turns
- Produces: `streamText({ system })` contains `<invoked_skill>` iff the current user text has a picker slash. Tool continuations do not re-inject.

- [ ] **Step 1: Write the failing tests**

Create `tests/agent/v2-route-handler-slash.test.ts` (same mock skeleton as `tests/agent/v2-route-handler-brief.test.ts`, trimmed — copy the `youtube-transcript` mock, conversation store mock, `streamText` mock, `setSetting("openrouterApiKey")`, `chatRequest` / `fakeStreamResult` / `waitForRunEnd` helpers):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

vi.mock("@/lib/agent/conversation/store", () => ({
  appendMessage: vi.fn(),
  listMessages: vi.fn(() => []),
  getConversation: (id: string) => ({ id, project_id: "p1", title: "t", created_at: "", updated_at: "" }),
}));
vi.mock("@/lib/agent/v2/persist-turn", () => ({ persistAssistantTurn: vi.fn() }));
vi.mock("@/lib/agent/conversation/auto-title", () => ({ generateAndPersistTitle: vi.fn(async () => {}) }));

const streamTextMock = vi.fn();
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, streamText: (opts: unknown) => streamTextMock(opts) };
});

import { setSetting } from "@/lib/settings";
import { resetRunRegistry } from "@/lib/agent/v2/run-registry";
import { chatRequest, fakeStreamResult, waitForRunEnd } from "./helpers/chat-route";

const lastSystem = () => (streamTextMock.mock.calls.at(-1)![0] as { system: string }).system;

async function post(text: string, conversationId: string) {
  const { postV2 } = await import("@/lib/agent/v2/route-handler");
  return postV2(
    chatRequest({
      conversation_id: conversationId,
      messages: [{ role: "user", parts: [{ type: "text", text }] }],
      canvas_snapshot: { nodes: [], edges: [] },
    }),
  );
}

describe("chat route — slash invoked skill", () => {
  let fake: ReturnType<typeof fakeStreamResult>;

  beforeEach(() => {
    resetRunRegistry();
    setSetting("openrouterApiKey", "test-key");
    fake = fakeStreamResult();
    streamTextMock.mockReset();
    streamTextMock.mockImplementation(() => fake);
  });

  it("injects generate_sketch for /croquis and leaves a plain hello untouched", async () => {
    await post("/croquis moi à droite", "c-slash");
    expect(lastSystem()).toContain('<invoked_skill name="generate_sketch" slash="croquis">');
    expect(lastSystem()).toContain("graphite-on-paper");
    await fake.end();
    await waitForRunEnd("c-slash");

    fake = fakeStreamResult();
    streamTextMock.mockImplementation(() => fake);
    await post("hello", "c-plain");
    expect(lastSystem()).not.toContain("<invoked_skill");
    expect(lastSystem()).not.toContain("graphite-on-paper");
    await fake.end();
    await waitForRunEnd("c-plain");
  });

  it("does not inject on a client-tool continuation", async () => {
    const { postV2 } = await import("@/lib/agent/v2/route-handler");
    await postV2(
      chatRequest({
        conversation_id: "c-cont",
        messages: [
          {
            role: "assistant",
            parts: [
              {
                type: "tool-ask_user",
                toolCallId: "q1",
                state: "output-available",
                input: { question: "Sujet ?", options: [{ id: "a", label: "A" }] },
                output: { selected: ["a"] },
              },
            ],
          },
        ],
      }),
    );
    expect(lastSystem()).not.toContain("<invoked_skill");
    await fake.end();
    await waitForRunEnd("c-cont");
  });
});
```

In `tests/agent/finish-turn-tool.test.ts`, inside `it("is not listed to MCP clients…")`, add:

```ts
expect(names).not.toContain("read_skill");
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/agent/v2-route-handler-slash.test.ts tests/agent/finish-turn-tool.test.ts`

Expected: slash route test FAIL (`system` has catalog descriptions but not the generate_sketch body). MCP assertion may already pass (keep it).

- [ ] **Step 3: Write minimal implementation**

In `src/lib/agent/v2/route-handler.ts`:

1. Import:

```ts
import { buildInvokedSkillBlock, resolveInvokedSkill } from "@/lib/agent/skills/invoked-skill";
```

2. Next to `let brief` / `let systemText` (around the `try` that builds `userParts`):

```ts
  let brief: ThumbnailBrief | null = null;
  let systemText: string;
  let invokedSkillBlock: string | null = null;
```

3. Inside `if (isNewUserTurn)`, immediately after `lastMessageText` is joined, before `if (lastMessageText) userParts.push(...)`:

```ts
      const lastMessageText = (lastMessage?.parts ?? [])
        .filter((p): p is { type: "text"; text: string } => p.type === "text" && typeof p.text === "string")
        .map((p) => p.text)
        .join("");

      const invoked = resolveInvokedSkill(lastMessageText);
      invokedSkillBlock = invoked ? buildInvokedSkillBlock(invoked) : null;

      if (lastMessageText) userParts.push({ type: "text", text: lastMessageText });
```

4. Replace the `buildSystemMessages(...)` call with:

```ts
const systemBlocks = buildSystemMessages(
  body.canvas_snapshot,
  projectId,
  loadAgentPromptPrefs(),
  brief,
  invokedSkillBlock,
);
```

Do not add `invoked_skill` to `ChatRequestBody`. The user text is the source of truth (retry / regenerate keep `/croquis` in the stored user row). The continuation fixture matches `tests/agent/v2-route-handler-interview.test.ts` « resumes after an answered ask_user » (`listMessages` stays `[]`; `lastMessage.role === "assistant"` so `isNewUserTurn` is false).

- [ ] **Step 4: Run tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/agent/v2-route-handler-slash.test.ts tests/agent/v2-route-handler.test.ts tests/agent/finish-turn-tool.test.ts tests/agent/skills-runtime.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/v2/route-handler.ts tests/agent/v2-route-handler-slash.test.ts tests/agent/finish-turn-tool.test.ts
git commit -m "$(cat <<'EOF'
feat(agent): load invoked skill on Brainstorm slash sends

EOF
)"
```

---

## Chunk 2: Composer picker UI

### Task 5: SkillPicker listbox

**Files:**
- Create: `src/components/panels/chat/SkillPicker.tsx`
- Create: `tests/chat/skill-picker-render.test.tsx`

**Interfaces:**
- Consumes: `SlashSkill` from Task 1
- Produces: `SkillPicker({ items, activeIndex, onHover, onPick })` with `role="listbox"`

- [ ] **Step 1: Write the failing test**

Create `tests/chat/skill-picker-render.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SkillPicker from "@/components/panels/chat/SkillPicker";
import { SLASH_SKILLS } from "@/lib/agent/skills/slash-catalog";

describe("SkillPicker", () => {
  it("renders croquis as a selectable option and an empty state", () => {
    const html = renderToStaticMarkup(
      <SkillPicker items={SLASH_SKILLS} activeIndex={0} onHover={() => {}} onPick={() => {}} />,
    );
    expect(html).toContain("role=\"listbox\"");
    expect(html).toContain("/croquis");
    expect(html).toContain("Croquis");
    expect(html).toContain("Brainstorm puis dessine un croquis");
    expect(html).not.toContain("finish_turn");
    expect(html).not.toContain("Étape n/7");

    const empty = renderToStaticMarkup(
      <SkillPicker items={[]} activeIndex={0} onHover={() => {}} onPick={() => {}} />,
    );
    expect(empty).toContain("Aucune skill");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/chat/skill-picker-render.test.tsx`

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/panels/chat/SkillPicker.tsx`:

```tsx
"use client";
import { cn } from "cn";
import type { SlashSkill } from "@/lib/agent/skills/slash-catalog";

export default function SkillPicker({
  items,
  activeIndex,
  onHover,
  onPick,
}: {
  items: SlashSkill[];
  activeIndex: number;
  onHover: (index: number) => void;
  onPick: (skill: SlashSkill) => void;
}) {
  return (
    <div
      id="brainstorm-slash-picker"
      role="listbox"
      aria-label="Skills"
      className="max-h-56 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
    >
      {items.length === 0 ? (
        <p className="px-2 py-1.5 text-xs text-muted-foreground">Aucune skill</p>
      ) : (
        items.map((item, index) => {
          const active = index === activeIndex;
          return (
            <button
              key={item.slash}
              type="button"
              role="option"
              id={`slash-skill-${item.slash}`}
              aria-selected={active}
              onMouseEnter={() => onHover(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                onPick(item);
              }}
              className={cn(
                "flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm",
                active ? "bg-muted" : "bg-transparent",
              )}
            >
              <span className="font-medium">
                <span className="font-mono text-muted-foreground">/{item.slash}</span>
                <span className="ml-2">{item.title}</span>
              </span>
              <span className="text-xs text-muted-foreground">{item.description}</span>
            </button>
          );
        })
      )}
    </div>
  );
}
```

Use `onMouseDown` + `preventDefault` so the textarea does not blur before pick.

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/chat/skill-picker-render.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/panels/chat/SkillPicker.tsx tests/chat/skill-picker-render.test.tsx
git commit -m "$(cat <<'EOF'
feat(chat): add Brainstorm slash skill listbox

EOF
)"
```

---

### Task 6: Composer keyboard + empty-state hint

**Files:**
- Modify: `src/components/panels/chat/Composer.tsx`
- Modify: `src/components/panels/chat/ChatEmptyState.tsx`
- Create: `tests/chat/composer-slash.test.tsx`
- Modify: `tests/chat/chat-empty-state.test.tsx`

**Interfaces:**
- Consumes: `slashQueryAtCursor`, `filterSlashSkills`, `applySlashPick` (Task 2), `SkillPicker` (Task 5), existing `useChatStore` draft
- Produces: typing `/` at a command position shows the list; Enter with matches picks `/croquis `; Enter with no matches still sends; URL `/` does not open the list. `INTERVIEW_START_MESSAGE` unchanged.

- [ ] **Step 1: Write the failing tests**

Create `tests/chat/composer-slash.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import Composer from "@/components/panels/chat/Composer";
import { useChatStore } from "@/store/chat-store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  useChatStore.getState().reset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(onSend = vi.fn()) {
  await act(async () => root.render(<Composer onSend={onSend} status="ready" onStop={() => {}} />));
  return onSend;
}

function textarea() {
  return container.querySelector("textarea")!;
}

async function typeDraft(value: string, cursor = value.length) {
  const el = textarea();
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.setSelectionRange(cursor, cursor);
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  });
}

async function key(name: string, init: KeyboardEventInit = {}) {
  await act(async () => {
    textarea().dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...init }));
  });
}

describe("composer slash picker", () => {
  it("opens on / at the start, filters, and Enter inserts /croquis without sending", async () => {
    const onSend = await render();
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    await typeDraft("/");
    expect(container.querySelector('[role="listbox"]')?.textContent).toContain("Croquis");
    await typeDraft("/cro");
    expect(container.querySelector('[role="listbox"]')?.textContent).toContain("Croquis");
    expect(container.querySelector('[role="listbox"]')?.textContent).not.toContain("/miniature");
    await key("Enter");
    expect(onSend).not.toHaveBeenCalled();
    expect(useChatStore.getState().draft).toBe("/croquis ");
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it("does not open inside a URL and Escape closes", async () => {
    await render();
    await typeDraft("https://youtube.com/watch");
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    await typeDraft("/");
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    await key("Escape");
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(useChatStore.getState().draft).toBe("/");
  });

  it("sends on Enter when the query matches nothing", async () => {
    const onSend = await render();
    await typeDraft("/zzzz-nope");
    expect(container.textContent).toContain("Aucune skill");
    await key("Enter");
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});
```

In `tests/chat/chat-empty-state.test.tsx`, in the copy test, keep `INTERVIEW_START_MESSAGE` assertion and add:

```ts
expect(html).toContain("/croquis");
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/chat/composer-slash.test.tsx tests/chat/chat-empty-state.test.tsx`

Expected: composer tests FAIL (no listbox). Empty-state `/croquis` FAIL.

- [ ] **Step 3: Write minimal implementation**

Replace `src/components/panels/chat/Composer.tsx` in full:

```tsx
"use client";
import { useRef, useState, type ChangeEvent, type KeyboardEvent, type Ref } from "react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useChatStore } from "@/store/chat-store";
import MicButton from "./MicButton";
import AttachButton from "./AttachButton";
import SkillPicker from "./SkillPicker";
import type { ChatStatus } from "ai";
import type { SlashSkill } from "@/lib/agent/skills/slash-catalog";
import { applySlashPick, filterSlashSkills, slashQueryAtCursor } from "@/lib/agent/skills/slash-query";

function assignRef(ref: Ref<HTMLTextAreaElement> | undefined, el: HTMLTextAreaElement | null) {
  if (!ref) return;
  if (typeof ref === "function") ref(el);
  else (ref as { current: HTMLTextAreaElement | null }).current = el;
}

export default function Composer({
  onSend,
  status,
  onStop,
  inputRef,
}: {
  onSend: () => void;
  status: ChatStatus;
  onStop: () => void;
  /** The message field, so the panel can give it focus back (e.g. after answering a question). */
  inputRef?: Ref<HTMLTextAreaElement>;
}) {
  const draft = useChatStore((s) => s.draft);
  const setDraft = useChatStore((s) => s.setDraft);
  const attachments = useChatStore((s) => s.attachments);
  const removeAttachment = useChatStore((s) => s.removeAttachment);
  const localRef = useRef<HTMLTextAreaElement>(null);
  const [cursor, setCursor] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissedStart, setDismissedStart] = useState<number | null>(null);

  const streaming = status === "streaming" || status === "submitted";
  const canSend = (draft.trim().length > 0 || attachments.length > 0) && !streaming;

  const openQuery = slashQueryAtCursor(draft, cursor);
  const pickerOpen = openQuery !== null && openQuery.start !== dismissedStart;
  const items = pickerOpen && openQuery ? filterSlashSkills(openQuery.query) : [];
  const safeIndex = items.length === 0 ? 0 : Math.min(activeIndex, items.length - 1);

  const pick = (skill: SlashSkill) => {
    const next = applySlashPick(draft, cursor, skill.slash);
    setDraft(next.text);
    setCursor(next.cursor);
    setDismissedStart(null);
    setActiveIndex(0);
    requestAnimationFrame(() => {
      const el = localRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.cursor, next.cursor);
    });
  };

  const syncCursor = (el: HTMLTextAreaElement) => {
    setCursor(el.selectionStart ?? el.value.length);
  };

  const onChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const nextCursor = e.target.selectionStart ?? value.length;
    const prevQuery = slashQueryAtCursor(draft, cursor)?.query;
    const nextOpen = slashQueryAtCursor(value, nextCursor);
    if (prevQuery !== nextOpen?.query) setActiveIndex(0);
    if (dismissedStart !== null && nextOpen?.start !== dismissedStart) setDismissedStart(null);
    setDraft(value);
    setCursor(nextCursor);
  };

  const onComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (pickerOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (items.length > 0) setActiveIndex((index) => (index + 1) % items.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (items.length > 0) setActiveIndex((index) => (index - 1 + items.length) % items.length);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (openQuery) setDismissedStart(openQuery.start);
        return;
      }
      if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
        if (items.length > 0) {
          e.preventDefault();
          pick(items[safeIndex]!);
          return;
        }
        if (e.key === "Tab") return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && canSend) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="w-full space-y-2 p-(--card-spacing)">
      {attachments.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 nopan nodrag">
          {attachments.map((a) => (
            <div key={a.source} className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.preview_url} alt="attachment" className="h-12 w-12 object-cover rounded border border-border" />
              <button onClick={() => removeAttachment(a.source)} className="absolute -top-1 -right-1 rounded-full w-3.5 h-3.5 text-[8px] leading-none flex items-center justify-center transition-colors bg-destructive text-destructive-foreground" aria-label="Retirer">×</button>
            </div>
          ))}
        </div>
      )}

      {pickerOpen && (
        <SkillPicker items={items} activeIndex={safeIndex} onHover={setActiveIndex} onPick={pick} />
      )}

      <InputGroup className="rounded-xl bg-muted border-border">
        <InputGroupTextarea
          ref={(el) => {
            localRef.current = el;
            assignRef(inputRef, el);
          }}
          value={draft}
          onChange={onChange}
          onClick={(e) => syncCursor(e.currentTarget)}
          onKeyUp={(e) => syncCursor(e.currentTarget)}
          onKeyDown={onComposerKeyDown}
          placeholder="Décris ta miniature, tape / pour une skill, ou enregistre un vocal…"
          className="h-14 min-h-14 px-3 py-2.5 text-foreground"
          rows={2}
          role="combobox"
          aria-expanded={pickerOpen}
          aria-controls="brainstorm-slash-picker"
          aria-activedescendant={pickerOpen && items[safeIndex] ? `slash-skill-${items[safeIndex].slash}` : undefined}
          aria-autocomplete="list"
        />
        <InputGroupAddon align="block-end">
          <MicButton onTranscribed={(t) => setDraft(draft ? `${draft} ${t}` : t)} />
          <AttachButton />
          {streaming ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <InputGroupButton onClick={onStop} aria-label="Arrêter" variant="outline" size="icon-sm" className="ml-auto text-destructive">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="6" width="12" height="12" rx="1" />
                    </svg>
                  </InputGroupButton>
                }
              />
              <TooltipContent>
                <p>Arrêter</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <InputGroupButton
                    onClick={onSend}
                    disabled={!canSend}
                    aria-label="Envoyer"
                    variant={canSend ? "default" : "outline"}
                    size="icon-sm"
                    className="ml-auto rounded-full"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="19" x2="12" y2="5" />
                      <polyline points="5 12 12 5 19 12" />
                    </svg>
                  </InputGroupButton>
                }
              />
              <TooltipContent>
                <p>Envoyer</p>
              </TooltipContent>
            </Tooltip>
          )}
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
```

Do **not** add `style={{ maxHeight: "160px" }}` back (new code stays Tailwind-only; the textarea already has `h-14 min-h-14`).

In `ChatEmptyState.tsx`, change only `EmptyDescription` to:

```tsx
<EmptyDescription>
  Décris ta miniature, tape / pour une skill (ex. /croquis), joins une image ou enregistre un vocal.
</EmptyDescription>
```

Do not change `INTERVIEW_START_MESSAGE` or the button.

- [ ] **Step 4: Run tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/chat/composer-slash.test.tsx tests/chat/chat-empty-state.test.tsx tests/chat/skill-picker-render.test.tsx`

Expected: PASS. Enter with matches must call `onSend` zero times; `/zzzz-nope` Enter calls `onSend` once (fall through because `items.length === 0`).

Also run: `./node_modules/.bin/eslint src/components/panels/chat/Composer.tsx src/components/panels/chat/SkillPicker.tsx src/components/panels/chat/ChatEmptyState.tsx`

Expected: no new React Compiler / hooks errors (`react-hooks/set-state-in-effect` must stay clean — cursor state is set from events, not effects).

- [ ] **Step 5: Commit**

```bash
git add src/components/panels/chat/Composer.tsx src/components/panels/chat/ChatEmptyState.tsx tests/chat/composer-slash.test.tsx tests/chat/chat-empty-state.test.tsx
git commit -m "$(cat <<'EOF'
feat(chat): open a slash skill picker from the Brainstorm composer

EOF
)"
```

---

### Task 7: Regression sweep + browser check (no Docker, no paid sketch)

**Files:** none new unless a test from Tasks 1–6 failed the sweep.

- [ ] **Step 1: Run the focused plus related suites**

```bash
./node_modules/.bin/vitest run \
  tests/agent/slash-catalog.test.ts \
  tests/agent/slash-query.test.ts \
  tests/agent/invoked-skill.test.ts \
  tests/agent/system-prompt-slash.test.ts \
  tests/agent/v2-route-handler-slash.test.ts \
  tests/agent/skills-runtime.test.ts \
  tests/agent/read-skill.test.ts \
  tests/agent/system-prompt-journey.test.ts \
  tests/agent/finish-turn-tool.test.ts \
  tests/agent/fake-agent-journey.test.ts \
  tests/chat/skill-picker-render.test.tsx \
  tests/chat/composer-slash.test.tsx \
  tests/chat/chat-empty-state.test.tsx \
  tests/chat/chat-panel-safety.test.ts
```

Expected: all PASS. Fake agent still never calls `generate_sketch`. `read_skill` still `chatOnly`. Catalog in the static prompt still has ≥27 name+description lines. No `Étape n/7`.

- [ ] **Step 2: Type-check touched files’ project**

Run: `./node_modules/.bin/tsc --noEmit`

Expected: PASS (or only stale `.next/types` — delete those dirs and re-run).

- [ ] **Step 3: Browser check without Docker and without a paid sketch**

From the worktree, throwaway DB only:

```bash
THUMBGEN_DB_PATH="/tmp/thumbgen-slash-picker/thumbgen.db" OPENROUTER_API_KEY= \
  ./node_modules/.bin/next dev -p 3100
```

Open `http://localhost:3100`, go to a miniature’s Brainstorm chat (log in yourself if a login wall appears — the agent must not type a password).

Check:
1. Empty state still has « Construire avec l'agent » and mentions `/croquis`. Clicking the button still sends `Aide-moi à construire la miniature de ma vidéo.` — not a slash.
2. Focus the composer, type `/` → list with Croquis first. Type `cro` → only croquis. ArrowDown then Enter → draft is `/croquis `, list closed, **no** network turn yet.
3. Type `https://youtube.com/watch?v=dQw4w9WgXcQ` → no list.
4. Escape on `/foo` leaves `/foo` and closes the list.
5. Do **not** click « Générer ». Do **not** send `/croquis` to a real OpenRouter model in this task (that would bill `generate_sketch` if the model follows the skill). Optional free send: only if `THUMBGEN_FAKE_AGENT=journey` is already how this checkout runs the fake model — still must not produce a paid image.

Stop the dev server. Do not `docker compose`.

- [ ] **Step 4: Commit only if Step 3 forced a code fix**

If the browser check required a Composer focus/cursor fix, add a test that encodes it, then:

```bash
git add src/components/panels/chat/Composer.tsx tests/chat/composer-slash.test.tsx
git commit -m "$(cat <<'EOF'
fix(chat): keep slash picker cursor in the Brainstorm composer

EOF
)"
```

If nothing changed, do not create an empty commit.

---

## Self-review

**Spec coverage**
- `/` picker in Brainstorm composer → Tasks 5–6
- Curated list vs 27 tools → Task 1 ruling
- Pick inserts token; send loads that skill → Tasks 2–4 + 6
- `/croquis` = `generate_sketch`, no duplicate skill → Tasks 1 and 3
- Keyboard / URL `/` → Tasks 2 and 6
- MCP / `read_skill` chat-only → Task 4
- No dump of 27 bodies → Task 3 tests
- No wizard / Fiche-as-pipeline / F3c / Docker / live DB → Global Constraints + Task 7

**Placeholder scan:** none. Every step has code or an exact command.

**Type consistency:** `SlashSkill.slash` / `.skill` / `.title` / `.description`; `SlashQuery.start` / `.query`; `InvokedSkill` adds `.body`; `buildSystemMessages` 5th arg is `string | null | undefined`; route uses `resolveInvokedSkill` + `buildInvokedSkillBlock` only on new user turns.

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-18-brainstorm-slash-skills.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks (`superpowers:subagent-driven-development`)
2. **Inline Execution** — this session with `superpowers:executing-plans`, checkpoints for review

Which approach?
