# Page Réglages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the « Réglages » dialog with a dedicated `/reglages` page whose seven sections each drive a real, verifiable behaviour, backed by a typed settings schema, and remove the dead settings and orphaned routes they used to feed.

**Architecture:** A client-safe zod schema (`src/lib/settings-schema.ts`) is the single source of truth for every setting (type, bounds, default, secret marker); `src/lib/settings.ts` reads and writes the SQLite `settings` table through it. `/api/settings` exposes typed values with masked secrets, and the server features (agent route, system prompt, image route, root layout) read `getTypedSettings()`. The UI is a client layout (`ReactFlowProvider` + `AppSidebar` + section menu) with one sub-route per section; each section is a shadcn `Card` + `<form>` driven by a shared `useSettingsForm` hook.

**Tech Stack:** Next.js 16.2 App Router, React 19.2, TypeScript strict, Tailwind v4, shadcn `base-nova` on Base UI (`@base-ui/react` 1.8), zod 4.3, better-sqlite3 12, vitest 4, lucide-react 1.46.

**Spec:** `docs/superpowers/specs/2026-09-16-reglages-page-design.md` — the binding authority. Read it before starting any task. Where this plan deviates, the deviation is listed under « Code reality vs spec » below with the ruling taken.

## Global Constraints

- **Commands.** Tests: `./node_modules/.bin/vitest run` (single file: `./node_modules/.bin/vitest run tests/path/file.test.ts`). Type-check: `./node_modules/.bin/tsc --noEmit`. `npx` is broken in this shell; `node` is a broken shell function — use `/opt/homebrew/bin/node` if you ever need Node directly.
- **Stale Next validators.** `tsconfig.json` includes `.next/types/**` and `.next/dev/types/**`, which import every route file by path. When a task deletes or moves a route and `tsc` reports errors *only* inside those folders, run `rm -rf .next/types .next/dev/types` (generated build output, recreated by `next build`/`next dev`) and re-run `tsc`.
- **Intermediate browser checks use a dev server on a throwaway DB and another port.** The Docker container already serves `http://localhost:3000` from `data/thumbgen.db` (bind mount). Never point a second process at that file (two SQLite writers across the Docker VM boundary risks corruption — this repo already has a `thumbgen.db.corrupted-backup.*`). Run: `THUMBGEN_DB_PATH="$(mktemp -d)/thumbgen.db" ./node_modules/.bin/next dev -p 3100` and browse `http://localhost:3100`. The empty DB means secrets show « Via variable d'environnement » when `.env` provides them — expected. Stop the dev server when done. The final Docker rebuild and live check are Task 12.
- **Tests run against an isolated temp DB** created per test file by `tests/setup.ts` (`THUMBGEN_DB_PATH`). Tests that depend on a clean `settings` table start with `getDb().exec("DELETE FROM settings")`. Tests that touch secret env vars save, delete and restore them.
- **shadcn here is `base-nova` on Base UI, not Radix.** Check `src/components/ui/*` before writing JSX. Known idioms:
  - `DropdownMenuItem` has no `onSelect` — use `onClick`. `DropdownMenuLabel` must sit inside a `DropdownMenuGroup`.
  - `ToggleGroup` has no `type` prop and works with arrays: `value={[x]}` and `onValueChange={(v) => { const next = OPTIONS.find((o) => o === v[0]); if (next) setX(next); }}`.
  - `Select`'s `onValueChange` receives `string | null` — always null-guard. Pass `items={[{ value, label }]}` to `Select` so `<SelectValue />` shows the label instead of the raw value.
  - `Collapsible` uses `data-panel-open`. Triggers use `render={<Button … />}`.
  - `Switch` uses `checked` / `onCheckedChange(checked: boolean)`.
  - For a link styled as a button use `<Link className={cn(buttonVariants({ variant }), "…")}>` (`buttonVariants` is exported by `@/components/ui/button`).
- **`cn` is imported from the npm package `"cn"`** (`import { cn } from "cn"`), never from a local utils file.
- **`AppSidebar` calls `useReactFlow()`**: any page rendering it must be wrapped in `ReactFlowProvider` (pattern: `src/app/miniatures/page.tsx`).
- **UI uses only shadcn components and Tailwind classes.** No `style={{…}}` objects and no custom CSS in new or rewritten code. In canvas node code, the lines this plan rewrites use Tailwind arbitrary-variable classes (`bg-(--surface)`, `text-(--text-muted)`); untouched lines keep their existing styles.
- **The page body does not scroll** (`body { overflow: hidden }` in `globals.css`): the Réglages layout scrolls inside `SidebarInset` (`h-svh overflow-y-auto`).
- **UI copy is French.** In JSX text use `&apos;` for apostrophes (existing convention); inside JS strings use `'` normally.
- **Parallel work on the chat panel** is committing to `main` at the same time. Never touch `src/components/panels/ChatPanel.tsx` or anything under `src/components/panels/chat/`. Tasks 1 and 7 edit `src/components/Canvas.tsx` (where `ChatPanel` is mounted): before editing it, rebase onto the latest `main` and re-read the file — the anchors in this plan come from `main` at `933e63e`.
- **Commit only the files a task lists** — never `git add -A` / `git add .`. Deleted files are staged with `git rm`.
- **Settings table (verbatim from the spec):**

| Clé | Type | Défaut |
|---|---|---|
| `openrouterApiKey` | string secret | — |
| `openaiApiKey` | string secret | — |
| `youtubeApiKey` | string secret | — |
| `mcpApiKey` | string secret | — (géré par la section MCP existante) |
| `agentModel` | enum des ids de `AGENT_MODELS` | `DEFAULT_AGENT_MODEL` |
| `agentWebSearch` | boolean | `true` |
| `agentReasoningEffort` | `"low" \| "medium" \| "high"` | `"medium"` |
| `agentMaxSteps` | int 5–50 | `25` |
| `agentAutoTitle` | boolean | `true` |
| `agentResponseLanguage` | `"fr" \| "en" \| "es" \| "de" \| "pt" \| "it"` | `"fr"` |
| `favoriteModel` | enum des ids de `MODEL_SLUGS` | `"gemini-3.1-flash-image"` |
| `defaultAspectRatio` | `"16x9" \| "9x16" \| "1x1"` | `"16x9"` |
| `defaultImageCount` | int 1–4 | `1` |
| `defaultResolution` | `"1K" \| "2K" \| "4K"` | `"2K"` |
| `language` (texte des miniatures) | mêmes 6 langues | `"fr"` |
| `youtubePlaylistId` | string (URL de chaîne, @handle ou id de playlist) | `""` |
| `channelProfile` | objet JSON (voir « Ma chaîne ») | profil vide |
| `theme` | `"dark" \| "light" \| "system"` | `"dark"` |
| `currentProjectId` | string | — (interne, non affiché; stored default `"default"`) |

- **Menu order, labels, icons:** `connexions` « Connexions des modèles » `KeyRound` · `agent` « Agent IA » `Bot` · `generation` « Génération d'images » `ImagePlus` · `chaine` « Ma chaîne » `TvMinimalPlay` (see ruling 2) · `integrations` « Intégrations » `Plug` · `donnees` « Données & sauvegardes » `Database` · `apparence` « Apparence » `Palette`.
- **Principe directeur:** every displayed setting changes a real behaviour. No decorative switch, no « bientôt » field, nothing from chantiers 2 and 3 (YouTube OAuth, « Ma chaîne » dashboard), not even disabled.

## Code reality vs spec (rulings)

1. **Where the DB functions live.** The spec puts `getTypedSettings` / `updateSettings` / `clearSetting` in `settings-schema.ts`. The Réglages forms (client components) need the schema's option lists, and a module that imports `getDb` (better-sqlite3) cannot be bundled for the browser. Ruling: `settings-schema.ts` holds only zod + constants + pure helpers (client-safe); `getTypedSettings`, `updateSettings`, `clearSetting`, `getSetting` live in `src/lib/settings.ts` (server).
2. **`Youtube` icon.** lucide-react 1.46 has no brand icons (`Youtube` does not exist). Ruling: `TvMinimalPlay`.
3. **`MODEL_SLUGS` and `ALL_MODELS` were private.** `MODEL_SLUGS` is a non-exported const inside `src/app/api/generate/openrouter/route.ts` (a route file may not export arbitrary names) and `ALL_MODELS` is local to `GeneratorNode.tsx`. Ruling: extract both into `src/lib/image-models.ts` (Task 1), consumed by the route, the node, the schema and the Génération section.
4. **Task order.** Dead-code removal runs first (Task 1), before the API reshape (Task 2): once `/api/settings` stops returning `hasGemini`/`hasOpenrouter`, `GeneratorNode`'s `availableProviders` logic would mark every model « (inactif) » and block generation.
5. **zod 4 `.partial()` still applies defaults.** `SettingsSchema.partial().parse({})` returns every default (verified). Ruling: `updateSettings` validates with the partial schema but writes only the keys present in the input.
6. **Resolution selector.** In `GeneratorNode` it only renders when `provider === "gemini"`, which is never true (every model has provider `"openrouter"`), and it offers only 2K/4K. Ruling: render it for every model with 1K/2K/4K; unset `imageSize` means « use `defaultResolution` ».
7. **Readers of `/api/settings`.** Only `Canvas.tsx` (reads `favoriteModel`, `currentProjectId`, and the `has*` flags removed in Task 1), `GeneratorNode.tsx` (flags, removed in Task 1) and `SettingsPanel.tsx` (deleted in Task 4) read it. `ProjectBar.tsx` only POSTs `currentProjectId` (still valid); `AppSidebar.tsx` never reads it; `UsageBadge` has been renamed `UsageSummary` by the chat work and does not read it. No other reader needs adapting.
8. **Env fallback scope.** The old `getSetting` fell back to an env var for *every* key (`LANGUAGE`, `YOUTUBE_PLAYLIST_ID`…). Per the spec, `ENV_FALLBACK` now covers the four secrets only.
9. **`<channel_profile>` content.** The « Ma chaîne » form also edits `youtubePlaylistId` (a separate key). Ruling: the block includes it as a « YouTube channel » line when set, and it counts as a filled field.
10. **Default persona validation.** « id de persona existant ou null » is enforced in `updateSettings` (DB lookup) and reported as a 400 issue on `channelProfile.defaultPersonaId`.
11. **Theme script.** The inline `<head>` script is always emitted and is a no-op unless `<html data-theme="system">`, so switching to « Système » client-side (no reload) still follows `prefers-color-scheme` changes.
12. **Generator defaults scope.** Besides the canvas context menu and edge-drop menu, the defaults also apply to generator nodes added from the sidebar « Modèles d'image » panel (click in `AppSidebar`, drop through `Canvas.onDrop`), keeping the clicked model.
13. **OpenRouter `/api/v1/key` shape** (verified in OpenRouter's API reference): `data.{label, limit: number|null, limit_remaining: number|null, usage: number, is_free_tier: boolean, …}`. The test summary reads only these fields, and only when present.
14. **Live verification safety (Task 12).** The executor does not confirm destructive actions on the user's real data (« Supprimer la clé », deleting a backup, running the cleanup): it verifies the dialogs open and cancel; the confirmed paths are covered by route tests.

## File Structure

**Create**
- `src/lib/image-models.ts` — image model catalogue (id, label, group, OpenRouter slug) + resolutions.
- `src/lib/settings-schema.ts` — zod schema, option lists, secret keys, env fallback table, response types, pure helpers.
- `src/lib/connection-tests.ts` — server-side key tests for OpenRouter / OpenAI / YouTube.
- `src/lib/agent/prompt-prefs.ts` — loads the prompt preferences (languages, channel profile, default persona) from settings.
- `src/lib/generator-defaults.ts` — maps settings to new-generator-node data.
- `src/lib/data-admin.ts` — storage stats, backups, cleanup.
- `src/lib/theme.ts` — theme class, inline system script, sidebar cookie parsing, client `applyTheme`.
- `src/hooks/useGeneratorDefaults.ts` — client hook fetching generator defaults.
- `src/app/api/settings/test/route.ts`
- `src/app/api/data/stats/route.ts`, `src/app/api/data/backups/route.ts`, `src/app/api/data/backups/download/route.ts`, `src/app/api/data/cleanup/route.ts`
- `src/app/reglages/layout.tsx`, `src/app/reglages/page.tsx`, and `page.tsx` under `connexions/`, `agent/`, `generation/`, `chaine/`, `integrations/`, `donnees/`, `apparence/`
- `src/components/settings/`: `sections.ts`, `SettingsNav.tsx`, `use-settings.ts`, `IntegrationsSection.tsx`, `secret-status.ts`, `FieldError.tsx`, `ConfirmDialog.tsx`, `SecretKeyCard.tsx`, `ConnexionsSection.tsx`, `form-state.ts`, `use-settings-form.ts`, `SettingsFormCard.tsx`, `AgentSection.tsx`, `GenerationSection.tsx`, `ChaineSection.tsx`, `format.ts`, `api.ts`, `StorageCard.tsx`, `BackupsCard.tsx`, `CleanupCard.tsx`, `DonneesSection.tsx`, `ApparenceSection.tsx`
- Tests: `tests/settings/*.test.ts`, `tests/data/*.test.ts`, `tests/agent/prompt-prefs.test.ts`, `tests/agent/v2-route-handler-settings.test.ts`

**Modify**
- `src/lib/settings.ts` (rewrite), `src/app/api/settings/route.ts` (rewrite), `src/lib/agent/v2/web-search-tool.ts`, `src/lib/agent/v2/route-handler.ts`, `src/lib/agent/system-prompt.ts`, `src/app/api/generate/openrouter/route.ts`, `src/components/nodes/GeneratorNode.tsx`, `src/components/Canvas.tsx`, `src/store/canvas-store.ts`, `src/components/panels/AppSidebar.tsx`, `src/lib/db.ts` (export the DB path), `src/app/layout.tsx`, `docker-compose.yml`, `Dockerfile`, `tests/agent/system-prompt.test.ts`

**Delete**
- `src/components/panels/SettingsPanel.tsx`
- `src/app/api/generate/nano-banana/`, `src/app/api/generate/openai/`, `src/app/api/generate/ideogram/`, `src/app/api/generate/grok/`, `src/app/api/edit/ideogram/`, `src/app/api/remix/ideogram/`

**Kept as is:** `src/components/panels/settings/McpSettingsSection.tsx`, `src/app/api/settings/mcp-key/route.ts`.

---

## Task 1: Image model catalogue + remove orphaned routes and provider flags

**Files:**
- Create: `src/lib/image-models.ts`
- Create: `tests/settings/image-models.test.ts`
- Modify: `src/app/api/generate/openrouter/route.ts` (import `MODEL_SLUGS` instead of defining it)
- Modify: `src/components/nodes/GeneratorNode.tsx` (derive model lists from the catalogue, drop `availableProviders`)
- Modify: `src/components/Canvas.tsx` (drop the `providers` state) — **rebase onto latest `main` and re-read the file first**
- Modify: `docker-compose.yml`, `Dockerfile`
- Delete: `src/app/api/generate/nano-banana/route.ts`, `src/app/api/generate/openai/route.ts`, `src/app/api/generate/ideogram/route.ts`, `src/app/api/generate/grok/route.ts`, `src/app/api/edit/ideogram/route.ts`, `src/app/api/remix/ideogram/route.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (`src/lib/image-models.ts`):
  - `type ImageModelGroup = "Gemini" | "OpenAI" | "ByteDance"`
  - `type ImageModel = { id: string; label: string; group: ImageModelGroup; slug: string }`
  - `IMAGE_MODELS: readonly ImageModel[]`, `IMAGE_MODEL_IDS: [string, ...string[]]`, `IMAGE_MODEL_GROUPS: readonly ImageModelGroup[]`
  - `MODEL_SLUGS: Record<string, string>`, `DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image"`
  - `imageModelLabel(id: string): string`
  - `IMAGE_RESOLUTIONS = ["1K", "2K", "4K"] as const`, `type ImageResolution`, `isImageResolution(value: unknown): value is ImageResolution`

- [ ] **Step 1: Re-verify that the legacy routes have no caller**

```bash
grep -rn "generate/nano-banana\|generate/openai\|generate/ideogram\|generate/grok\|edit/ideogram\|remix/ideogram" src scripts
grep -rn "app/api/generate\|app/api/edit\|app/api/remix" src tests scripts
```

Expected: no output for either command. (`tests/agent/list-past-generations.test.ts` stores the string `"/api/generate/openai"` as log data — that is not a caller; the first command does not search `tests`.) If anything else shows up, stop and report it instead of deleting.

- [ ] **Step 2: Write the failing catalogue test**

Create `tests/settings/image-models.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODEL_GROUPS,
  IMAGE_MODEL_IDS,
  IMAGE_MODELS,
  IMAGE_RESOLUTIONS,
  MODEL_SLUGS,
  imageModelLabel,
  isImageResolution,
} from "@/lib/image-models";

describe("image model catalogue", () => {
  it("keeps the exact OpenRouter slugs the route used before the extraction", () => {
    expect(MODEL_SLUGS).toEqual({
      "gemini-3-pro-image": "google/gemini-3-pro-image",
      "gemini-3.1-flash-image": "google/gemini-3.1-flash-image",
      "gemini-3.1-flash-lite-image": "google/gemini-3.1-flash-lite-image",
      "gemini-2.5-flash-image": "google/gemini-2.5-flash-image",
      "gpt-image-2.5-sunburst": "openai/gpt-image-2.5-sunburst",
      "gpt-image-2.5-flare": "openai/gpt-image-2.5-flare",
      "gpt-image-2": "openai/gpt-image-2",
      "gpt-image-1": "openai/gpt-image-1",
      "bytedance-seed/seedream-4.5": "bytedance-seed/seedream-4.5",
    });
  });

  it("has unique ids, a known default and a group for every model", () => {
    expect(new Set(IMAGE_MODEL_IDS).size).toBe(IMAGE_MODELS.length);
    expect(IMAGE_MODEL_IDS).toContain(DEFAULT_IMAGE_MODEL);
    for (const model of IMAGE_MODELS) expect(IMAGE_MODEL_GROUPS).toContain(model.group);
  });

  it("labels known ids and falls back to the id", () => {
    expect(imageModelLabel("gpt-image-2")).toBe("GPT Image 2 (4K)");
    expect(imageModelLabel("unknown-model")).toBe("unknown-model");
  });

  it("recognises the three resolutions only", () => {
    expect(IMAGE_RESOLUTIONS).toEqual(["1K", "2K", "4K"]);
    expect(isImageResolution("4K")).toBe(true);
    expect(isImageResolution("8K")).toBe(false);
    expect(isImageResolution(undefined)).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/settings/image-models.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/image-models"`.

- [ ] **Step 4: Create the catalogue**

Create `src/lib/image-models.ts`:

```ts
/**
 * Every image model the canvas can generate with. All of them are served by
 * OpenRouter's Unified Image API (one key, one endpoint). Client-safe — no
 * server imports — so GeneratorNode, /api/generate/openrouter, the settings
 * schema and the Réglages page share this exact list.
 */
export type ImageModelGroup = "Gemini" | "OpenAI" | "ByteDance";

export type ImageModel = { id: string; label: string; group: ImageModelGroup; slug: string };

export const IMAGE_MODELS: readonly ImageModel[] = [
  { id: "gemini-3-pro-image", label: "Gemini 3 Pro", group: "Gemini", slug: "google/gemini-3-pro-image" },
  { id: "gemini-3.1-flash-image", label: "Gemini 3.1 Flash", group: "Gemini", slug: "google/gemini-3.1-flash-image" },
  { id: "gemini-3.1-flash-lite-image", label: "Gemini 3.1 Flash Lite", group: "Gemini", slug: "google/gemini-3.1-flash-lite-image" },
  { id: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash", group: "Gemini", slug: "google/gemini-2.5-flash-image" },
  { id: "gpt-image-2.5-sunburst", label: "GPT Image 2.5 Sunburst (précis)", group: "OpenAI", slug: "openai/gpt-image-2.5-sunburst" },
  { id: "gpt-image-2.5-flare", label: "GPT Image 2.5 Flare (rapide)", group: "OpenAI", slug: "openai/gpt-image-2.5-flare" },
  { id: "gpt-image-2", label: "GPT Image 2 (4K)", group: "OpenAI", slug: "openai/gpt-image-2" },
  { id: "gpt-image-1", label: "GPT Image 1", group: "OpenAI", slug: "openai/gpt-image-1" },
  { id: "bytedance-seed/seedream-4.5", label: "Seedream 4.5 (ByteDance)", group: "ByteDance", slug: "bytedance-seed/seedream-4.5" },
];

export const IMAGE_MODEL_GROUPS: readonly ImageModelGroup[] = ["Gemini", "OpenAI", "ByteDance"];

export const IMAGE_MODEL_IDS = IMAGE_MODELS.map((model) => model.id) as [string, ...string[]];

// ThumbGen's internal model id (what the client sends) → OpenRouter slug.
export const MODEL_SLUGS: Record<string, string> = Object.fromEntries(
  IMAGE_MODELS.map((model) => [model.id, model.slug]),
);

export const DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image";

export function imageModelLabel(id: string): string {
  return IMAGE_MODELS.find((model) => model.id === id)?.label ?? id;
}

export const IMAGE_RESOLUTIONS = ["1K", "2K", "4K"] as const;

export type ImageResolution = (typeof IMAGE_RESOLUTIONS)[number];

export function isImageResolution(value: unknown): value is ImageResolution {
  return typeof value === "string" && (IMAGE_RESOLUTIONS as readonly string[]).includes(value);
}
```

- [ ] **Step 5: Run the catalogue test**

Run: `./node_modules/.bin/vitest run tests/settings/image-models.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Point the OpenRouter route at the catalogue**

In `src/app/api/generate/openrouter/route.ts`, replace the import line

```ts
import { getSetting } from "@/lib/settings";
```

with

```ts
import { getSetting } from "@/lib/settings";
import { MODEL_SLUGS } from "@/lib/image-models";
```

Then replace this whole block (the comment and the local map):

```ts
// Maps ThumbGen's internal model id (what the client sends, unchanged from
// before this migration) to the real OpenRouter model slug. Ideogram, Grok,
// and gpt-image-1.5 have no OpenRouter equivalent (confirmed via a live
// 404 against the real API) and are intentionally absent from this map —
// the client-side model list no longer offers them.
const MODEL_SLUGS: Record<string, string> = {
  "gemini-3-pro-image": "google/gemini-3-pro-image",
  "gemini-3.1-flash-image": "google/gemini-3.1-flash-image",
  "gemini-3.1-flash-lite-image": "google/gemini-3.1-flash-lite-image",
  "gemini-2.5-flash-image": "google/gemini-2.5-flash-image",
  "gpt-image-2.5-sunburst": "openai/gpt-image-2.5-sunburst",
  "gpt-image-2.5-flare": "openai/gpt-image-2.5-flare",
  "gpt-image-2": "openai/gpt-image-2",
  "gpt-image-1": "openai/gpt-image-1",
  "bytedance-seed/seedream-4.5": "bytedance-seed/seedream-4.5",
};
```

with

```ts
// The id → OpenRouter slug map lives in src/lib/image-models.ts. Ideogram,
// Grok and gpt-image-1.5 have no OpenRouter equivalent and are absent from it.
```

- [ ] **Step 7: Delete the orphaned legacy routes**

```bash
git rm src/app/api/generate/nano-banana/route.ts src/app/api/generate/openai/route.ts src/app/api/generate/ideogram/route.ts src/app/api/generate/grok/route.ts src/app/api/edit/ideogram/route.ts src/app/api/remix/ideogram/route.ts
ls src/app/api/generate src/app/api/edit src/app/api/remix 2>&1
```

Expected: `src/app/api/generate` lists only `openrouter`; `src/app/api/edit` and `src/app/api/remix` no longer exist (git removes the empty directories from the index; if an empty directory remains on disk, remove it with `rmdir`).

- [ ] **Step 8: Derive GeneratorNode's model lists from the catalogue**

In `src/components/nodes/GeneratorNode.tsx`, replace everything from the top of the file down to and including the `ALL_MODELS` line:

```tsx
"use client";

import { Handle, Position, NodeProps } from "@xyflow/react";
import { useCanvasStore, AppNode } from "@/store/canvas-store";
import { useCallback, useState, useEffect } from "react";
import NodeShell from "./NodeShell";
import { MODEL_COSTS, INPUT_TYPE_COLORS, REFERENCE_CAPS } from "@/lib/model-costs";
import { Alert, AlertDescription } from "@/components/ui/alert";

// All image generation now routes exclusively through OpenRouter's Unified
// Image API (one key, one endpoint) — direct Gemini/OpenAI keys, Ideogram,
// and Grok are no longer used. Ideogram and Grok have no OpenRouter image
// equivalent (verified live against the real API) so they're dropped
// entirely rather than left as permanently "(inactif)" dead options.
// gpt-image-1.5 has no OpenRouter slug either — dropped for the same reason.
const GEMINI_MODELS = [
  { id: "gemini-3-pro-image", label: "Gemini 3 Pro", provider: "openrouter" },
  { id: "gemini-3.1-flash-image", label: "Gemini 3.1 Flash", provider: "openrouter" },
  { id: "gemini-3.1-flash-lite-image", label: "Gemini 3.1 Flash Lite", provider: "openrouter" },
  { id: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash", provider: "openrouter" },
];

const OPENAI_MODELS = [
  { id: "gpt-image-2.5-sunburst", label: "GPT Image 2.5 Sunburst (précis)", provider: "openrouter" },
  { id: "gpt-image-2.5-flare", label: "GPT Image 2.5 Flare (rapide)", provider: "openrouter" },
  { id: "gpt-image-2", label: "GPT Image 2 (4K)", provider: "openrouter" },
  { id: "gpt-image-1", label: "GPT Image 1", provider: "openrouter" },
];

const OPENROUTER_MODELS = [
  { id: "bytedance-seed/seedream-4.5", label: "Seedream 4.5 (ByteDance)", provider: "openrouter" },
];

const ALL_MODELS = [...GEMINI_MODELS, ...OPENAI_MODELS, ...OPENROUTER_MODELS];
```

with

```tsx
"use client";

import { Handle, Position, NodeProps } from "@xyflow/react";
import { useCanvasStore, AppNode } from "@/store/canvas-store";
import { useCallback, useState } from "react";
import { cn } from "cn";
import NodeShell from "./NodeShell";
import { MODEL_COSTS, INPUT_TYPE_COLORS, REFERENCE_CAPS } from "@/lib/model-costs";
import { IMAGE_MODELS } from "@/lib/image-models";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Every model routes through OpenRouter's Unified Image API (one key, one
// endpoint). The catalogue lives in src/lib/image-models.ts, shared with the
// server route and the Réglages page.
const ALL_MODELS = IMAGE_MODELS.map((m) => ({ id: m.id, label: m.label, group: m.group, provider: "openrouter" }));
const GEMINI_MODELS = ALL_MODELS.filter((m) => m.group === "Gemini");
const OPENAI_MODELS = ALL_MODELS.filter((m) => m.group === "OpenAI");
const OPENROUTER_MODELS = ALL_MODELS.filter((m) => m.group === "ByteDance");
```

- [ ] **Step 9: Remove `availableProviders` from GeneratorNode**

Delete this block (state + effect):

```tsx
  const [availableProviders, setAvailableProviders] = useState<Record<string, boolean>>({ gemini: true });

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => {
        setAvailableProviders({
          gemini: !!s.hasGemini,
          ideogram: !!s.hasIdeogram,
          openai: !!s.hasOpenai,
          grok: !!s.hasGrok,
          openrouter: !!s.hasOpenrouter,
        });
      })
      .catch(() => {});
  }, []);
```

Replace the model `<select>` (from `<select` with `value={model}` to its closing `</select>`):

```tsx
          <select
            value={model}
            onChange={(e) => {
              const selected = e.target.value;
              const prov = getProvider(selected);
              if (availableProviders[prov]) {
                updateNodeData(id, { model: selected });
              }
            }}
            className="flex-1 rounded-xl px-3 py-2 text-xs focus:outline-none nopan nodrag"
            style={selectStyle}
          >
            <optgroup label="Gemini">
              {GEMINI_MODELS.map((m) => (
                <option key={m.id} value={m.id} disabled={!availableProviders[m.provider]}>
                  {m.label} — {getModelPriceLabel(m.id)}{!availableProviders[m.provider] ? " (inactif)" : ""}
                </option>
              ))}
            </optgroup>
            <optgroup label="OpenAI">
              {OPENAI_MODELS.map((m) => (
                <option key={m.id} value={m.id} disabled={!availableProviders[m.provider]}>
                  {m.label} — {getModelPriceLabel(m.id)}{!availableProviders[m.provider] ? " (inactif)" : ""}
                </option>
              ))}
            </optgroup>
            <optgroup label="ByteDance">
              {OPENROUTER_MODELS.map((m) => (
                <option key={m.id} value={m.id} disabled={!availableProviders[m.provider]}>
                  {m.label} — {getModelPriceLabel(m.id)}{!availableProviders[m.provider] ? " (inactif)" : ""}
                </option>
              ))}
            </optgroup>
          </select>
```

with (the existing `style={selectStyle}` line is kept untouched):

```tsx
          <select
            value={model}
            onChange={(e) => updateNodeData(id, { model: e.target.value })}
            className="flex-1 rounded-xl px-3 py-2 text-xs focus:outline-none nopan nodrag"
            style={selectStyle}
          >
            <optgroup label="Gemini">
              {GEMINI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {getModelPriceLabel(m.id)}
                </option>
              ))}
            </optgroup>
            <optgroup label="OpenAI">
              {OPENAI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {getModelPriceLabel(m.id)}
                </option>
              ))}
            </optgroup>
            <optgroup label="ByteDance">
              {OPENROUTER_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {getModelPriceLabel(m.id)}
                </option>
              ))}
            </optgroup>
          </select>
```

Replace the compare list (the `<div className="space-y-1 mb-3">` block and everything inside it):

```tsx
          <div className="space-y-1 mb-3">
            {ALL_MODELS.filter((m) => m.id !== model).map((m) => {
              const isAvailable = !!availableProviders[m.provider];
              return (
                <label
                  key={m.id}
                  className="flex items-center gap-2 px-2 py-1 rounded-lg text-xs transition-all nopan nodrag"
                  style={{
                    color: !isAvailable ? "var(--text-muted)" : compareModels.has(m.id) ? "var(--text-primary)" : "var(--text-muted)",
                    background: compareModels.has(m.id) && isAvailable ? "var(--surface)" : "transparent",
                    opacity: isAvailable ? 1 : 0.4,
                    cursor: isAvailable ? "pointer" : "not-allowed",
                  }}
                  title={!isAvailable ? "Clé API non configurée — va dans Réglages" : ""}
                >
                  <input
                    type="checkbox"
                    checked={compareModels.has(m.id)}
                    onChange={() => isAvailable && toggleCompareModel(m.id)}
                    disabled={!isAvailable}
                    className="nopan nodrag"
                    style={{ accentColor: "var(--canvas-accent)" }}
                  />
                  {m.label} <span style={{ color: "var(--text-muted)" }}>— {getModelPriceLabel(m.id)}</span>
                  {!isAvailable && <span style={{ color: "var(--bone-faint)", fontSize: 10 }}>(inactif)</span>}
                  {isAvailable && connectedFaceCount > 0 && m.provider === "gemini" && REFERENCE_CAPS[m.id]?.characters === 0 && (
                    <span style={{ color: "var(--ember)", fontSize: 10 }}>(ignore le visage)</span>
                  )}
                </label>
              );
            })}
          </div>
```

with

```tsx
          <div className="space-y-1 mb-3">
            {ALL_MODELS.filter((m) => m.id !== model).map((m) => (
              <label
                key={m.id}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs transition-all nopan nodrag",
                  compareModels.has(m.id) ? "bg-(--surface) text-(--text-primary)" : "bg-transparent text-(--text-muted)",
                )}
              >
                <input
                  type="checkbox"
                  checked={compareModels.has(m.id)}
                  onChange={() => toggleCompareModel(m.id)}
                  className="accent-(--canvas-accent) nopan nodrag"
                />
                {m.label} <span className="text-(--text-muted)">— {getModelPriceLabel(m.id)}</span>
                {connectedFaceCount > 0 && m.provider === "gemini" && REFERENCE_CAPS[m.id]?.characters === 0 && (
                  <span className="text-[10px] text-(--ember)">(ignore le visage)</span>
                )}
              </label>
            ))}
          </div>
```

Then confirm nothing references the removed state:

```bash
grep -n "availableProviders\|hasGemini\|hasOpenrouter\|inactif" src/components/nodes/GeneratorNode.tsx
```

Expected: no output.

- [ ] **Step 10: Remove the `providers` state from Canvas.tsx**

Rebase onto the latest `main` and re-read `src/components/Canvas.tsx` first. Then replace:

```tsx
  const [providers, setProviders] = useState<Record<string, boolean>>({ gemini: true });
  const [favoriteModel, setFavoriteModel] = useState("gemini-3.1-flash-image");

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((s) => {
      setProviders({ gemini: !!s.hasGemini, ideogram: !!s.hasIdeogram, openai: !!s.hasOpenai, grok: !!s.hasGrok });
      if (s.favoriteModel) setFavoriteModel(s.favoriteModel);
    }).catch(() => {});
  }, []);
```

with

```tsx
  const [favoriteModel, setFavoriteModel] = useState("gemini-3.1-flash-image");

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((s) => {
      if (s.favoriteModel) setFavoriteModel(s.favoriteModel);
    }).catch(() => {});
  }, []);
```

- [ ] **Step 11: Remove the dead env vars from Docker**

Replace the whole content of `docker-compose.yml` with:

```yaml
services:
  thumbgen:
    build:
      context: .
      args:
        OPENAI_API_KEY: ${OPENAI_API_KEY:-}
        YOUTUBE_API_KEY: ${YOUTUBE_API_KEY:-}
        SITE_PASSWORD: ${SITE_PASSWORD:-}
    container_name: thumbgen
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY:-}
      - YOUTUBE_API_KEY=${YOUTUBE_API_KEY:-}
      - SITE_PASSWORD=${SITE_PASSWORD:-}
```

In `Dockerfile`, replace:

```dockerfile
# Build args → env vars for Next.js build
ARG GEMINI_API_KEY
ARG IDEOGRAM_API_KEY
ARG OPENAI_API_KEY
ARG GROK_API_KEY
ARG YOUTUBE_API_KEY
ARG SITE_PASSWORD

ENV GEMINI_API_KEY=$GEMINI_API_KEY
ENV IDEOGRAM_API_KEY=$IDEOGRAM_API_KEY
ENV OPENAI_API_KEY=$OPENAI_API_KEY
ENV GROK_API_KEY=$GROK_API_KEY
ENV YOUTUBE_API_KEY=$YOUTUBE_API_KEY
ENV SITE_PASSWORD=$SITE_PASSWORD
```

with

```dockerfile
# Build args → env vars for Next.js build
ARG OPENAI_API_KEY
ARG YOUTUBE_API_KEY
ARG SITE_PASSWORD

ENV OPENAI_API_KEY=$OPENAI_API_KEY
ENV YOUTUBE_API_KEY=$YOUTUBE_API_KEY
ENV SITE_PASSWORD=$SITE_PASSWORD
```

- [ ] **Step 12: Verify**

```bash
grep -rn "hasGemini\|hasIdeogram\|hasGrok\|availableProviders\|setProviders" src
grep -n "GEMINI\|IDEOGRAM\|GROK" docker-compose.yml Dockerfile
rm -rf .next/types .next/dev/types
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
```

Expected: both greps print nothing except `src/app/api/settings/route.ts` and `src/components/panels/SettingsPanel.tsx` for the first one (rewritten in Task 2 and deleted in Task 4). `tsc` exits 0. The whole suite passes (previous count + 4).

- [ ] **Step 13: Commit**

```bash
git add src/lib/image-models.ts tests/settings/image-models.test.ts src/app/api/generate/openrouter/route.ts src/components/nodes/GeneratorNode.tsx src/components/Canvas.tsx docker-compose.yml Dockerfile
git commit -m "refactor(generation): shared image model catalogue, drop orphaned provider routes and flags"
```

(The deletions were already staged by `git rm` in Step 7.)

---

## Task 2: Typed settings schema, settings.ts rewrite, `/api/settings` GET/POST/DELETE

**Files:**
- Create: `src/lib/settings-schema.ts`
- Rewrite: `src/lib/settings.ts`
- Rewrite: `src/app/api/settings/route.ts`
- Modify: `src/lib/agent/v2/web-search-tool.ts`
- Create: `tests/settings/settings.test.ts`, `tests/settings/settings-route.test.ts`

**Interfaces:**
- Consumes: `IMAGE_MODEL_IDS`, `DEFAULT_IMAGE_MODEL`, `IMAGE_RESOLUTIONS`, `ImageResolution` from `@/lib/image-models` (Task 1); `AGENT_MODELS`, `DEFAULT_AGENT_MODEL` from `@/lib/agent/models`.
- Produces (`src/lib/settings-schema.ts`, client-safe):
  - `LANGUAGE_CODES`, `type LanguageCode`, `LANGUAGES: ReadonlyArray<{ code: LanguageCode; label: string; englishName: string }>`
  - `REASONING_EFFORTS`, `type ReasoningEffort`; `ASPECT_RATIOS`, `type AspectRatio`; `THEMES`, `type Theme`; re-exports `IMAGE_RESOLUTIONS`, `type ImageResolution`, `isImageResolution`
  - `SECRET_KEYS`, `type SecretKey`, `isSecretKey(key: string): key is SecretKey`, `ENV_FALLBACK: Record<SecretKey, string>`
  - `BRAND_COLOR_PATTERN`, `ChannelProfileSchema`, `type ChannelProfile`, `EMPTY_CHANNEL_PROFILE`, `emptyChannelProfile(): ChannelProfile`
  - `SettingsSchema`, `SettingsUpdateSchema`, `type TypedSettings`, `SETTING_KEYS`
  - `type SecretStatus = { configured: boolean; preview: string | null; source: "settings" | "env" | null }`
  - `type SettingsValues = Omit<TypedSettings, SecretKey>`, `type SettingsResponse = SettingsValues & Record<SecretKey, SecretStatus> & { sitePasswordEnabled: boolean }`
  - `type SettingsIssue = { path: string; message: string }`, `toSettingsIssues(error: ZodError): SettingsIssue[]`, `previewSecret(value: string): string`
- Produces (`src/lib/settings.ts`, server):
  - `getTypedSettings(): TypedSettings`
  - `updateSettings(input: unknown): void` — throws `SettingsValidationError`
  - `class SettingsValidationError extends Error { issues: SettingsIssue[] }`
  - `clearSetting(key: string): void`, `setSetting(key: keyof TypedSettings, value: string): void` (raw, unvalidated — MCP key and tests)
  - `getSetting(key: StringSettingKey): string` (keys whose value is a string)
  - `getSecretStatus(key: SecretKey): SecretStatus`, `getPublicSettings(): SettingsResponse`
  - unchanged: `getMcpApiKey()`, `ensureMcpApiKey()`, `regenerateMcpApiKey()`
  - removed: `getSettings`, `saveSettings`, `AppSettings`
- Produces (HTTP): `GET /api/settings` → `SettingsResponse`; `POST /api/settings` → `{ success: true }` or 400 `{ error, issues: SettingsIssue[] }`; `DELETE /api/settings?key=<secret>` → `{ key, configured, preview, source }` or 400.

- [ ] **Step 1: Write the failing settings tests**

Create `tests/settings/settings.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getDb } from "@/lib/db";
import {
  SettingsValidationError,
  clearSetting,
  getSecretStatus,
  getSetting,
  getTypedSettings,
  setSetting,
  updateSettings,
} from "@/lib/settings";
import { EMPTY_CHANNEL_PROFILE } from "@/lib/settings-schema";

const ENV_NAMES = ["OPENROUTER_API_KEY", "OPENAI_API_KEY", "YOUTUBE_API_KEY", "MCP_API_KEY", "LANGUAGE"];
const savedEnv: Record<string, string | undefined> = {};

function storedRows(): Record<string, string | null> {
  const rows = getDb().prepare("SELECT key, value FROM settings").all() as { key: string; value: string | null }[];
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

function issuesOf(fn: () => void): { path: string; message: string }[] {
  try {
    fn();
  } catch (err) {
    if (err instanceof SettingsValidationError) return err.issues;
    throw err;
  }
  throw new Error("expected a SettingsValidationError");
}

beforeEach(() => {
  getDb().exec("DELETE FROM settings");
  for (const name of ENV_NAMES) {
    savedEnv[name] = process.env[name];
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of ENV_NAMES) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
  vi.restoreAllMocks();
});

describe("getTypedSettings", () => {
  it("returns every default on an empty table", () => {
    expect(getTypedSettings()).toEqual({
      openrouterApiKey: undefined,
      openaiApiKey: undefined,
      youtubeApiKey: undefined,
      mcpApiKey: undefined,
      agentModel: "anthropic/claude-sonnet-4.6",
      agentWebSearch: true,
      agentReasoningEffort: "medium",
      agentMaxSteps: 25,
      agentAutoTitle: true,
      agentResponseLanguage: "fr",
      favoriteModel: "gemini-3.1-flash-image",
      defaultAspectRatio: "16x9",
      defaultImageCount: 1,
      defaultResolution: "2K",
      language: "fr",
      youtubePlaylistId: "",
      channelProfile: EMPTY_CHANNEL_PROFILE,
      theme: "dark",
      currentProjectId: "default",
    });
  });

  it.each([
    ["1", true],
    ["true", true],
    ["0", false],
    ["false", false],
  ] as Array<[string, boolean]>)("reads agentWebSearch %s as %s", (raw, expected) => {
    setSetting("agentWebSearch", raw);
    expect(getTypedSettings().agentWebSearch).toBe(expected);
  });

  it("treats an empty stored string as unset", () => {
    setSetting("agentWebSearch", "");
    setSetting("language", "");
    expect(getTypedSettings().agentWebSearch).toBe(true);
    expect(getTypedSettings().language).toBe("fr");
  });

  it("falls back to the default and warns on an invalid stored value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setSetting("agentMaxSteps", "999");
    setSetting("theme", "purple");
    setSetting("channelProfile", "{not json");
    const settings = getTypedSettings();
    expect(settings.agentMaxSteps).toBe(25);
    expect(settings.theme).toBe("dark");
    expect(settings.channelProfile).toEqual(EMPTY_CHANNEL_PROFILE);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("agentMaxSteps"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("channelProfile"));
  });

  it("ignores rows for settings that no longer exist", () => {
    getDb().prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("geminiApiKey", "AIza-old");
    expect(Object.keys(getTypedSettings())).not.toContain("geminiApiKey");
  });

  it("falls back to the environment for secrets only", () => {
    process.env.OPENAI_API_KEY = "sk-from-env-1234";
    process.env.LANGUAGE = "en";
    const settings = getTypedSettings();
    expect(settings.openaiApiKey).toBe("sk-from-env-1234");
    expect(settings.language).toBe("fr");
  });

  it("prefers the stored secret over the environment", () => {
    process.env.OPENAI_API_KEY = "sk-from-env-1234";
    setSetting("openaiApiKey", "sk-stored-5678");
    expect(getTypedSettings().openaiApiKey).toBe("sk-stored-5678");
  });
});

describe("updateSettings", () => {
  it("accepts 5 and 50 steps and rejects 4 and 51", () => {
    updateSettings({ agentMaxSteps: 5 });
    expect(getTypedSettings().agentMaxSteps).toBe(5);
    updateSettings({ agentMaxSteps: 50 });
    expect(getTypedSettings().agentMaxSteps).toBe(50);
    expect(issuesOf(() => updateSettings({ agentMaxSteps: 4 }))).toEqual([
      { path: "agentMaxSteps", message: "Entre 5 et 50 étapes" },
    ]);
    expect(issuesOf(() => updateSettings({ agentMaxSteps: 51 }))[0].path).toBe("agentMaxSteps");
  });

  it("accepts 1 to 4 images and rejects 0 and 5", () => {
    updateSettings({ defaultImageCount: 1 });
    updateSettings({ defaultImageCount: 4 });
    expect(getTypedSettings().defaultImageCount).toBe(4);
    expect(issuesOf(() => updateSettings({ defaultImageCount: 0 }))[0]).toEqual({
      path: "defaultImageCount",
      message: "Entre 1 et 4 images",
    });
    expect(issuesOf(() => updateSettings({ defaultImageCount: 5 }))[0].path).toBe("defaultImageCount");
  });

  it("writes only the keys it receives, booleans as true/false", () => {
    updateSettings({ agentWebSearch: false, agentMaxSteps: 12 });
    expect(storedRows()).toEqual({ agentWebSearch: "false", agentMaxSteps: "12" });
  });

  it("stores the channel profile as JSON with nested defaults", () => {
    updateSettings({ channelProfile: { name: "Ma chaîne", brandColors: ["#FF0000"] } });
    expect(getTypedSettings().channelProfile).toEqual({
      ...EMPTY_CHANNEL_PROFILE,
      name: "Ma chaîne",
      brandColors: ["#FF0000"],
    });
    expect(JSON.parse(storedRows().channelProfile ?? "null")).toEqual(getTypedSettings().channelProfile);
  });

  it("rejects unknown keys and writes nothing", () => {
    expect(issuesOf(() => updateSettings({ geminiApiKey: "x", agentMaxSteps: 10 }))).toEqual([
      { path: "geminiApiKey", message: "Réglage inconnu : geminiApiKey" },
    ]);
    expect(storedRows()).toEqual({});
  });

  it("rejects a non-object body", () => {
    expect(issuesOf(() => updateSettings(["agentMaxSteps"]))).toEqual([
      { path: "", message: "Objet de réglages attendu" },
    ]);
  });

  it("ignores a blank secret instead of wiping the stored one", () => {
    updateSettings({ openrouterApiKey: "sk-or-v1-keep" });
    updateSettings({ openrouterApiKey: "   ", agentAutoTitle: false });
    expect(getTypedSettings().openrouterApiKey).toBe("sk-or-v1-keep");
    expect(getTypedSettings().agentAutoTitle).toBe(false);
  });

  it("rejects a badly formatted brand colour", () => {
    expect(issuesOf(() => updateSettings({ channelProfile: { brandColors: ["red"] } }))).toEqual([
      { path: "channelProfile.brandColors.0", message: "Couleur au format #RRGGBB" },
    ]);
  });

  it("rejects a default persona that does not exist and accepts one that does", () => {
    expect(issuesOf(() => updateSettings({ channelProfile: { defaultPersonaId: "ghost" } }))).toEqual([
      { path: "channelProfile.defaultPersonaId", message: "Ce personnage n'existe plus" },
    ]);
    getDb().prepare("INSERT OR IGNORE INTO personas (id, label) VALUES (?, ?)").run("persona-settings-test", "Moi");
    updateSettings({ channelProfile: { defaultPersonaId: "persona-settings-test" } });
    expect(getTypedSettings().channelProfile.defaultPersonaId).toBe("persona-settings-test");
  });
});

describe("secret helpers", () => {
  it("getSecretStatus reports the source and a 4-character preview", () => {
    expect(getSecretStatus("openrouterApiKey")).toEqual({ configured: false, preview: null, source: null });
    process.env.OPENROUTER_API_KEY = "sk-or-v1-envenvenv9999";
    expect(getSecretStatus("openrouterApiKey")).toEqual({ configured: true, preview: "…9999", source: "env" });
    updateSettings({ openrouterApiKey: "sk-or-v1-storedstored-a107" });
    expect(getSecretStatus("openrouterApiKey")).toEqual({ configured: true, preview: "…a107", source: "settings" });
  });

  it("clearSetting deletes the stored row", () => {
    updateSettings({ youtubeApiKey: "AIza-to-delete" });
    clearSetting("youtubeApiKey");
    expect(storedRows()).toEqual({});
    expect(getTypedSettings().youtubeApiKey).toBeUndefined();
  });

  it("getSetting returns strings with defaults applied", () => {
    expect(getSetting("openaiApiKey")).toBe("");
    expect(getSetting("language")).toBe("fr");
    expect(getSetting("agentModel")).toBe("anthropic/claude-sonnet-4.6");
  });
});
```

Create `tests/settings/settings-route.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDb } from "@/lib/db";
import { getTypedSettings, setSetting } from "@/lib/settings";
import { DELETE, GET, POST } from "@/app/api/settings/route";

const ENV_NAMES = ["OPENROUTER_API_KEY", "OPENAI_API_KEY", "YOUTUBE_API_KEY", "MCP_API_KEY", "SITE_PASSWORD"];
const savedEnv: Record<string, string | undefined> = {};

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

function del(key: string) {
  return DELETE(new Request(`http://localhost/api/settings?key=${encodeURIComponent(key)}`, { method: "DELETE" }));
}

beforeEach(() => {
  getDb().exec("DELETE FROM settings");
  for (const name of ENV_NAMES) {
    savedEnv[name] = process.env[name];
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of ENV_NAMES) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
});

describe("GET /api/settings", () => {
  it("returns typed values and masks every secret", async () => {
    setSetting("openrouterApiKey", "sk-or-v1-0000000000a107");
    setSetting("agentWebSearch", "0");
    const res = await GET();
    const body = await res.json();
    expect(body.openrouterApiKey).toEqual({ configured: true, preview: "…a107", source: "settings" });
    expect(body.openaiApiKey).toEqual({ configured: false, preview: null, source: null });
    expect(body.agentWebSearch).toBe(false);
    expect(body.agentMaxSteps).toBe(25);
    expect(body.sitePasswordEnabled).toBe(false);
    expect(JSON.stringify(body)).not.toContain("sk-or-v1-0000000000a107");
  });

  it("exposes SITE_PASSWORD only as a boolean", async () => {
    process.env.SITE_PASSWORD = "hunter2-secret";
    const body = await (await GET()).json();
    expect(body.sitePasswordEnabled).toBe(true);
    expect(JSON.stringify(body)).not.toContain("hunter2-secret");
  });
});

describe("POST /api/settings", () => {
  it("saves a valid subset", async () => {
    const res = await post({ agentMaxSteps: 12, theme: "light" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(getTypedSettings().agentMaxSteps).toBe(12);
    expect(getTypedSettings().theme).toBe("light");
  });

  it("returns 400 with per-field issues", async () => {
    const res = await post({ agentMaxSteps: 99, defaultResolution: "8K" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Réglages invalides");
    expect(body.issues).toEqual([
      { path: "agentMaxSteps", message: "Entre 5 et 50 étapes" },
      { path: "defaultResolution", message: "Résolution inconnue" },
    ]);
    expect(getTypedSettings().agentMaxSteps).toBe(25);
  });

  it("ignores an empty secret", async () => {
    setSetting("openaiApiKey", "sk-keep-me");
    const res = await post({ openaiApiKey: "" });
    expect(res.status).toBe(200);
    expect(getTypedSettings().openaiApiKey).toBe("sk-keep-me");
  });

  it("returns 400 on a malformed body", async () => {
    const res = await post("{nope");
    expect(res.status).toBe(400);
    expect((await res.json()).issues).toEqual([]);
  });
});

describe("DELETE /api/settings", () => {
  it("refuses a non-secret key", async () => {
    setSetting("language", "en");
    const res = await del("language");
    expect(res.status).toBe(400);
    expect(getTypedSettings().language).toBe("en");
  });

  it("clears a stored secret", async () => {
    setSetting("youtubeApiKey", "AIza-stored-key");
    const res = await del("youtubeApiKey");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ key: "youtubeApiKey", configured: false, preview: null, source: null });
  });

  it("reports when the environment still provides the secret", async () => {
    process.env.OPENAI_API_KEY = "sk-env-provided-4321";
    setSetting("openaiApiKey", "sk-stored-1111");
    const body = await (await del("openaiApiKey")).json();
    expect(body).toEqual({ key: "openaiApiKey", configured: true, preview: "…4321", source: "env" });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `./node_modules/.bin/vitest run tests/settings/settings.test.ts tests/settings/settings-route.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/settings-schema"` / missing exports such as `getTypedSettings`.

- [ ] **Step 3: Create the schema**

Create `src/lib/settings-schema.ts`:

```ts
import { z, type ZodError } from "zod";
import { AGENT_MODELS, DEFAULT_AGENT_MODEL } from "@/lib/agent/models";
import { DEFAULT_IMAGE_MODEL, IMAGE_MODEL_IDS, IMAGE_RESOLUTIONS } from "@/lib/image-models";

/**
 * Single source of truth for every persisted setting: type, bounds, default
 * and secret marker. Client-safe (no DB import) so the Réglages forms reuse
 * the option lists; reading and writing the settings table lives in
 * src/lib/settings.ts.
 */

export { IMAGE_RESOLUTIONS, isImageResolution, type ImageResolution } from "@/lib/image-models";

export const LANGUAGE_CODES = ["fr", "en", "es", "de", "pt", "it"] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export const LANGUAGES: ReadonlyArray<{ code: LanguageCode; label: string; englishName: string }> = [
  { code: "fr", label: "Français", englishName: "French" },
  { code: "en", label: "English", englishName: "English" },
  { code: "es", label: "Español", englishName: "Spanish" },
  { code: "de", label: "Deutsch", englishName: "German" },
  { code: "pt", label: "Português", englishName: "Portuguese" },
  { code: "it", label: "Italiano", englishName: "Italian" },
];

export const REASONING_EFFORTS = ["low", "medium", "high"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export const ASPECT_RATIOS = ["16x9", "9x16", "1x1"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const THEMES = ["dark", "light", "system"] as const;
export type Theme = (typeof THEMES)[number];

/** Settings holding credentials: never sent to the browser, only their status. */
export const SECRET_KEYS = ["openrouterApiKey", "openaiApiKey", "youtubeApiKey", "mcpApiKey"] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];

export function isSecretKey(key: string): key is SecretKey {
  return (SECRET_KEYS as readonly string[]).includes(key);
}

/** Environment variable read when a secret is not stored in the settings table. */
export const ENV_FALLBACK: Record<SecretKey, string> = {
  openrouterApiKey: "OPENROUTER_API_KEY",
  openaiApiKey: "OPENAI_API_KEY",
  youtubeApiKey: "YOUTUBE_API_KEY",
  mcpApiKey: "MCP_API_KEY",
};

export const BRAND_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export const ChannelProfileSchema = z.object({
  name: z.string().trim().max(100, "100 caractères maximum").default(""),
  niche: z.string().trim().max(200, "200 caractères maximum").default(""),
  audience: z.string().trim().max(500, "500 caractères maximum").default(""),
  tone: z.string().trim().max(500, "500 caractères maximum").default(""),
  brandColors: z
    .array(z.string().regex(BRAND_COLOR_PATTERN, "Couleur au format #RRGGBB"))
    .max(3, "3 couleurs maximum")
    .default([]),
  defaultPersonaId: z.string().min(1).nullable().default(null),
  agentInstructions: z.string().trim().max(2000, "2000 caractères maximum").default(""),
});

export type ChannelProfile = z.output<typeof ChannelProfileSchema>;

export const EMPTY_CHANNEL_PROFILE: ChannelProfile = {
  name: "",
  niche: "",
  audience: "",
  tone: "",
  brandColors: [],
  defaultPersonaId: null,
  agentInstructions: "",
};

export function emptyChannelProfile(): ChannelProfile {
  return { ...EMPTY_CHANNEL_PROFILE, brandColors: [] };
}

const secret = () => z.string().trim().max(1000, "Clé trop longue").optional();

// Stored as text: "true"/"false" (written) and legacy "1"/"0" (agentWebSearch).
const flag = (defaultValue: boolean) =>
  z
    .preprocess((value) => {
      if (value === "true" || value === "1") return true;
      if (value === "false" || value === "0") return false;
      return value;
    }, z.boolean({ error: "Valeur oui/non attendue" }))
    .default(defaultValue);

const intRange = (min: number, max: number, defaultValue: number, message: string) =>
  z.coerce.number().int(message).min(min, message).max(max, message).default(defaultValue);

const AGENT_MODEL_IDS = AGENT_MODELS.map((model) => model.id) as [string, ...string[]];

export const SettingsSchema = z.object({
  openrouterApiKey: secret(),
  openaiApiKey: secret(),
  youtubeApiKey: secret(),
  mcpApiKey: secret(),
  agentModel: z.enum(AGENT_MODEL_IDS, { error: "Modèle d'agent inconnu" }).default(DEFAULT_AGENT_MODEL),
  agentWebSearch: flag(true),
  agentReasoningEffort: z.enum(REASONING_EFFORTS, { error: "Effort de réflexion inconnu" }).default("medium"),
  agentMaxSteps: intRange(5, 50, 25, "Entre 5 et 50 étapes"),
  agentAutoTitle: flag(true),
  agentResponseLanguage: z.enum(LANGUAGE_CODES, { error: "Langue inconnue" }).default("fr"),
  favoriteModel: z.enum(IMAGE_MODEL_IDS, { error: "Modèle d'image inconnu" }).default(DEFAULT_IMAGE_MODEL),
  defaultAspectRatio: z.enum(ASPECT_RATIOS, { error: "Format inconnu" }).default("16x9"),
  defaultImageCount: intRange(1, 4, 1, "Entre 1 et 4 images"),
  defaultResolution: z.enum(IMAGE_RESOLUTIONS, { error: "Résolution inconnue" }).default("2K"),
  language: z.enum(LANGUAGE_CODES, { error: "Langue inconnue" }).default("fr"),
  youtubePlaylistId: z.string().trim().max(300, "300 caractères maximum").default(""),
  channelProfile: ChannelProfileSchema.default(emptyChannelProfile),
  theme: z.enum(THEMES, { error: "Thème inconnu" }).default("dark"),
  currentProjectId: z.string().trim().min(1).max(200).default("default"),
});

export type TypedSettings = z.output<typeof SettingsSchema>;

export const SETTING_KEYS = Object.keys(SettingsSchema.shape) as Array<keyof TypedSettings>;

/**
 * Validates a POST body. Caution: zod 4 still fills the defaults of omitted
 * fields inside a .partial() object — writers must only persist the keys the
 * caller actually sent.
 */
export const SettingsUpdateSchema = SettingsSchema.partial().strict();

export type SecretStatus = {
  configured: boolean;
  preview: string | null;
  source: "settings" | "env" | null;
};

export type SettingsValues = Omit<TypedSettings, SecretKey>;

export type SettingsResponse = SettingsValues & Record<SecretKey, SecretStatus> & { sitePasswordEnabled: boolean };

export type SettingsIssue = { path: string; message: string };

export function toSettingsIssues(error: ZodError): SettingsIssue[] {
  return error.issues.map((issue) => {
    if (issue.code === "unrecognized_keys") {
      return { path: issue.keys.join(","), message: `Réglage inconnu : ${issue.keys.join(", ")}` };
    }
    return { path: issue.path.map(String).join("."), message: issue.message };
  });
}

export function previewSecret(value: string): string {
  const trimmed = value.trim();
  return trimmed.length >= 8 ? `…${trimmed.slice(-4)}` : "…";
}
```

- [ ] **Step 4: Rewrite `src/lib/settings.ts`**

Replace the whole file with:

```ts
import crypto from "crypto";
import type { ZodType } from "zod";
import { getDb } from "./db";
import {
  ENV_FALLBACK,
  SECRET_KEYS,
  SETTING_KEYS,
  SettingsSchema,
  SettingsUpdateSchema,
  isSecretKey,
  previewSecret,
  toSettingsIssues,
  type SecretKey,
  type SecretStatus,
  type SettingsIssue,
  type SettingsResponse,
  type SettingsValues,
  type TypedSettings,
} from "./settings-schema";

export type { TypedSettings } from "./settings-schema";

export class SettingsValidationError extends Error {
  readonly issues: SettingsIssue[];

  constructor(issues: SettingsIssue[]) {
    super("Invalid settings");
    this.name = "SettingsValidationError";
    this.issues = issues;
  }
}

/** Keys whose typed value is a string — what the legacy getSetting() can return. */
type StringSettingKey = {
  [K in keyof TypedSettings]-?: NonNullable<TypedSettings[K]> extends string ? K : never;
}[keyof TypedSettings];

function readStoredRows(): Map<string, string> {
  const rows = getDb().prepare("SELECT key, value FROM settings").all() as { key: string; value: string | null }[];
  const stored = new Map<string, string>();
  for (const row of rows) {
    // An empty string has always meant "unset" in this table.
    if (row.value !== null && row.value !== "") stored.set(row.key, row.value);
  }
  return stored;
}

function readStoredValue(key: string): string | undefined {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string | null }
    | undefined;
  return row?.value ? row.value : undefined;
}

function describeForLog(key: string, value: string | undefined): string {
  if (isSecretKey(key)) return "(secret)";
  if (value === undefined) return "(unset)";
  return value.length > 60 ? `${value.slice(0, 60)}…` : value;
}

/**
 * Reads the settings table and returns every setting typed, with defaults.
 * Secrets fall back to their environment variable. An invalid stored value
 * never throws: it is logged and replaced by the default.
 */
export function getTypedSettings(): TypedSettings {
  const stored = readStoredRows();
  const out: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) {
    const field = SettingsSchema.shape[key] as ZodType;
    const storedValue = stored.get(key);
    let raw: unknown = storedValue;
    if (raw === undefined && isSecretKey(key)) raw = process.env[ENV_FALLBACK[key]] || undefined;
    if (key === "channelProfile" && typeof storedValue === "string") {
      try {
        raw = JSON.parse(storedValue);
      } catch {
        raw = Symbol("invalid-json");
      }
    }
    const parsed = field.safeParse(raw);
    if (parsed.success) {
      out[key] = parsed.data;
      continue;
    }
    console.warn(`[settings] ${key}: invalid stored value ${describeForLog(key, storedValue)}, using the default`);
    out[key] = field.parse(undefined);
  }
  return out as TypedSettings;
}

function serialize(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/**
 * Validates a subset of settings and writes it in one transaction. Only the
 * keys present in `input` are written. A blank secret is ignored so an empty
 * password field never wipes a stored key.
 */
export function updateSettings(input: unknown): void {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new SettingsValidationError([{ path: "", message: "Objet de réglages attendu" }]);
  }

  const candidate: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (isSecretKey(key) && typeof value === "string" && value.trim() === "") continue;
    candidate[key] = value;
  }

  const parsed = SettingsUpdateSchema.safeParse(candidate);
  if (!parsed.success) throw new SettingsValidationError(toSettingsIssues(parsed.error));

  const db = getDb();
  const personaId = parsed.data.channelProfile?.defaultPersonaId;
  if ("channelProfile" in candidate && personaId) {
    const exists = db.prepare("SELECT 1 FROM personas WHERE id = ?").get(personaId);
    if (!exists) {
      throw new SettingsValidationError([
        { path: "channelProfile.defaultPersonaId", message: "Ce personnage n'existe plus" },
      ]);
    }
  }

  const values = parsed.data as Record<string, unknown>;
  const upsert = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  const write = db.transaction(() => {
    for (const key of Object.keys(candidate)) {
      if (values[key] === undefined) continue;
      upsert.run(key, serialize(values[key]));
    }
  });
  write();
}

export function clearSetting(key: string): void {
  getDb().prepare("DELETE FROM settings WHERE key = ?").run(key);
}

/** Raw, unvalidated write. Used by the MCP key helpers and by tests. */
export function setSetting(key: keyof TypedSettings, value: string): void {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}

/** Legacy string accessor kept for existing callers; typed values come from getTypedSettings(). */
export function getSetting(key: StringSettingKey): string {
  return getTypedSettings()[key] ?? "";
}

export function getSecretStatus(key: SecretKey): SecretStatus {
  const stored = readStoredValue(key);
  if (stored) return { configured: true, preview: previewSecret(stored), source: "settings" };
  const fromEnv = process.env[ENV_FALLBACK[key]];
  if (fromEnv) return { configured: true, preview: previewSecret(fromEnv), source: "env" };
  return { configured: false, preview: null, source: null };
}

/** What GET /api/settings returns: typed values, secrets replaced by their status. */
export function getPublicSettings(): SettingsResponse {
  const typed = getTypedSettings();
  const values: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) {
    if (!isSecretKey(key)) values[key] = typed[key];
  }
  const secrets = Object.fromEntries(SECRET_KEYS.map((key) => [key, getSecretStatus(key)])) as Record<
    SecretKey,
    SecretStatus
  >;
  return { ...(values as SettingsValues), ...secrets, sitePasswordEnabled: Boolean(process.env.SITE_PASSWORD) };
}

export function getMcpApiKey(): string | null {
  const value = getSetting("mcpApiKey");
  return value || null;
}

export function ensureMcpApiKey(): string {
  const existing = getMcpApiKey();
  if (existing) return existing;
  const key = `tg_${crypto.randomBytes(32).toString("hex")}`;
  setSetting("mcpApiKey", key);
  return key;
}

export function regenerateMcpApiKey(): string {
  const key = `tg_${crypto.randomBytes(32).toString("hex")}`;
  setSetting("mcpApiKey", key);
  return key;
}
```

Note on the `Symbol("invalid-json")` sentinel: it guarantees the channel profile's `safeParse` fails (so the warning is logged and the default used) without a second code path.

- [ ] **Step 5: Rewrite the settings route**

Replace the whole content of `src/app/api/settings/route.ts` with:

```ts
import { NextResponse } from "next/server";
import {
  SettingsValidationError,
  clearSetting,
  getPublicSettings,
  getSecretStatus,
  updateSettings,
} from "@/lib/settings";
import { isSecretKey } from "@/lib/settings-schema";

export async function GET() {
  return NextResponse.json(getPublicSettings());
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide", issues: [] }, { status: 400 });
  }
  try {
    updateSettings(body);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof SettingsValidationError) {
      return NextResponse.json({ error: "Réglages invalides", issues: err.issues }, { status: 400 });
    }
    console.error("Save settings error:", err);
    return NextResponse.json({ error: "Échec de l'enregistrement des réglages" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!isSecretKey(key)) {
    return NextResponse.json({ error: "Seules les clés secrètes peuvent être effacées" }, { status: 400 });
  }
  clearSetting(key);
  // source "env" means an environment variable still provides a value the page cannot erase.
  return NextResponse.json({ key, ...getSecretStatus(key) });
}
```

- [ ] **Step 6: Read `agentWebSearch` as a boolean**

Replace the function in `src/lib/agent/v2/web-search-tool.ts`:

```ts
export function webSearchProviderOptions(): { web_search_options: Record<string, never> } | undefined {
  const enabled = getSetting("agentWebSearch") !== "0";
  if (!enabled) return undefined;
  return { web_search_options: {} };
}
```

with

```ts
export function webSearchProviderOptions(): { web_search_options: Record<string, never> } | undefined {
  if (!getTypedSettings().agentWebSearch) return undefined;
  return { web_search_options: {} };
}
```

and its import `import { getSetting } from "@/lib/settings";` with `import { getTypedSettings } from "@/lib/settings";`.

- [ ] **Step 7: Run the new tests**

Run: `./node_modules/.bin/vitest run tests/settings/settings.test.ts tests/settings/settings-route.test.ts`
Expected: PASS (all tests in both files).

- [ ] **Step 8: Type-check and run the whole suite**

```bash
grep -rn "getSettings\|saveSettings\|AppSettings" src tests
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
```

Expected: the grep prints nothing. `tsc` exits 0. All tests pass, including the untouched `tests/agent/settings.test.ts` (MCP key), `tests/agent/v2-web-search-tool.test.ts`, `tests/agent/v2-openrouter-provider.test.ts` and `tests/agent/auto-title.test.ts`, which still use `setSetting`. (`SettingsPanel.tsx` still compiles: it only reads the JSON through its own local type; it is deleted in Task 4.)

- [ ] **Step 9: Commit**

```bash
git add src/lib/settings-schema.ts src/lib/settings.ts src/app/api/settings/route.ts src/lib/agent/v2/web-search-tool.ts tests/settings/settings.test.ts tests/settings/settings-route.test.ts
git commit -m "feat(settings): typed settings schema with validated API and masked secrets"
```

---

## Task 3: Server-side connection tests (`POST /api/settings/test`)

**Files:**
- Create: `src/lib/connection-tests.ts`
- Create: `src/app/api/settings/test/route.ts`
- Create: `tests/settings/connection-tests.test.ts`

**Interfaces:**
- Consumes: `getTypedSettings()` (Task 2).
- Produces:
  - `TESTABLE_PROVIDERS = ["openrouter", "openai", "youtube"] as const`, `type TestableProvider`, `isTestableProvider(value: unknown): value is TestableProvider`
  - `type ConnectionTestResult = { ok: boolean; detail: string }`
  - `testProviderKey(provider: TestableProvider): Promise<ConnectionTestResult>`
  - HTTP `POST /api/settings/test?provider=openrouter|openai|youtube` → `ConnectionTestResult` (400 for an unknown provider). The key never leaves the server.

- [ ] **Step 1: Write the failing tests**

Create `tests/settings/connection-tests.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import { testProviderKey } from "@/lib/connection-tests";
import { POST } from "@/app/api/settings/test/route";

const ENV_NAMES = ["OPENROUTER_API_KEY", "OPENAI_API_KEY", "YOUTUBE_API_KEY"];
const savedEnv: Record<string, string | undefined> = {};
const fetchMock = vi.fn<typeof fetch>();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  getDb().exec("DELETE FROM settings");
  for (const name of ENV_NAMES) {
    savedEnv[name] = process.env[name];
    delete process.env[name];
  }
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const name of ENV_NAMES) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
});

describe("testProviderKey", () => {
  it("reports a missing key without calling the provider", async () => {
    expect(await testProviderKey("openai")).toEqual({ ok: false, detail: "Aucune clé configurée" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tests OpenRouter with the stored key and summarises usage and limit", async () => {
    setSetting("openrouterApiKey", "sk-or-v1-secret-a107");
    fetchMock.mockResolvedValue(json({ data: { label: "x", usage: 1.5, limit: 10, limit_remaining: 8.5, is_free_tier: false } }));
    const result = await testProviderKey("openrouter");
    expect(result).toEqual({ ok: true, detail: "Clé valide · consommation 1,50 $ · limite 10,00 $ · reste 8,50 $" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/key");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer sk-or-v1-secret-a107");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("says when OpenRouter reports no limit", async () => {
    setSetting("openrouterApiKey", "sk-or-v1-secret-a107");
    fetchMock.mockResolvedValue(json({ data: { usage: 0, limit: null, limit_remaining: null, is_free_tier: true } }));
    expect(await testProviderKey("openrouter")).toEqual({
      ok: true,
      detail: "Clé valide · consommation 0,00 $ · sans limite · offre gratuite",
    });
  });

  it("tests OpenAI against /v1/models", async () => {
    setSetting("openaiApiKey", "sk-openai-key");
    fetchMock.mockResolvedValue(json({ data: [] }));
    expect(await testProviderKey("openai")).toEqual({ ok: true, detail: "Clé valide" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/models");
  });

  it("tests YouTube with a 1-unit channels lookup", async () => {
    setSetting("youtubeApiKey", "AIza-yt-key");
    fetchMock.mockResolvedValue(json({ items: [{ id: "UC" }] }));
    expect(await testProviderKey("youtube")).toEqual({ ok: true, detail: "Clé valide · 1 unité de quota utilisée" });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("https://www.googleapis.com/youtube/v3/channels?");
    expect(url).toContain("part=id");
    expect(url).toContain("forHandle=%40YouTube");
    expect(url).toContain("key=AIza-yt-key");
  });

  it("uses the environment fallback like the rest of the app", async () => {
    process.env.OPENAI_API_KEY = "sk-env-key";
    fetchMock.mockResolvedValue(json({ data: [] }));
    expect((await testProviderKey("openai")).ok).toBe(true);
  });

  it("returns the HTTP status and a short message, never the key", async () => {
    setSetting("openaiApiKey", "sk-leaky-key-9999");
    fetchMock.mockResolvedValue(json({ error: { message: "Incorrect API key provided: sk-leaky-key-9999." } }, 401));
    const result = await testProviderKey("openai");
    expect(result).toEqual({ ok: false, detail: "HTTP 401 · Incorrect API key provided: …." });
    expect(result.detail).not.toContain("sk-leaky-key-9999");
  });

  it("reports a timeout", async () => {
    setSetting("openaiApiKey", "sk-openai-key");
    fetchMock.mockRejectedValue(Object.assign(new Error("timed out"), { name: "TimeoutError" }));
    expect(await testProviderKey("openai")).toEqual({ ok: false, detail: "Délai dépassé (10 s)" });
  });

  it("reports an unreachable service", async () => {
    setSetting("youtubeApiKey", "AIza-yt-key");
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await testProviderKey("youtube")).toEqual({ ok: false, detail: "Service injoignable" });
  });
});

describe("POST /api/settings/test", () => {
  it("rejects an unknown provider", async () => {
    const res = await POST(new Request("http://localhost/api/settings/test?provider=gemini", { method: "POST" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, detail: "Fournisseur inconnu" });
  });

  it("returns the test result without the key", async () => {
    setSetting("openrouterApiKey", "sk-or-v1-never-leak-0001");
    fetchMock.mockResolvedValue(json({ data: { usage: 2, limit: null } }));
    const res = await POST(new Request("http://localhost/api/settings/test?provider=openrouter", { method: "POST" }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text).ok).toBe(true);
    expect(text).not.toContain("sk-or-v1-never-leak-0001");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `./node_modules/.bin/vitest run tests/settings/connection-tests.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/connection-tests"`.

- [ ] **Step 3: Implement the key tests**

Create `src/lib/connection-tests.ts`:

```ts
import { getTypedSettings } from "@/lib/settings";

export const TESTABLE_PROVIDERS = ["openrouter", "openai", "youtube"] as const;
export type TestableProvider = (typeof TESTABLE_PROVIDERS)[number];
export type ConnectionTestResult = { ok: boolean; detail: string };

const TIMEOUT_MS = 10_000;

const KEY_FOR: Record<TestableProvider, "openrouterApiKey" | "openaiApiKey" | "youtubeApiKey"> = {
  openrouter: "openrouterApiKey",
  openai: "openaiApiKey",
  youtube: "youtubeApiKey",
};

export function isTestableProvider(value: unknown): value is TestableProvider {
  return typeof value === "string" && (TESTABLE_PROVIDERS as readonly string[]).includes(value);
}

function formatUsd(amount: number): string {
  return `${amount.toFixed(2).replace(".", ",")} $`;
}

/** Short provider error message with every occurrence of the key masked. */
async function readErrorMessage(res: Response, apiKey: string): Promise<string> {
  const text = await res.text().catch(() => "");
  let message = "";
  try {
    const body = JSON.parse(text) as { error?: string | { message?: unknown } };
    if (typeof body.error === "string") message = body.error;
    else if (body.error && typeof body.error.message === "string") message = body.error.message;
  } catch {
    message = "";
  }
  return message.split(apiKey).join("…").slice(0, 120);
}

async function failure(res: Response, apiKey: string): Promise<ConnectionTestResult> {
  const message = await readErrorMessage(res, apiKey);
  return { ok: false, detail: message ? `HTTP ${res.status} · ${message}` : `HTTP ${res.status}` };
}

async function testOpenRouter(apiKey: string, signal: AbortSignal): Promise<ConnectionTestResult> {
  const res = await fetch("https://openrouter.ai/api/v1/key", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  });
  if (!res.ok) return failure(res, apiKey);
  // Documented shape: { data: { usage, limit: number|null, limit_remaining: number|null, is_free_tier, … } }.
  const body = (await res.json().catch(() => ({}))) as {
    data?: { usage?: unknown; limit?: unknown; limit_remaining?: unknown; is_free_tier?: unknown };
  };
  const data = body.data ?? {};
  const parts = ["Clé valide"];
  if (typeof data.usage === "number") parts.push(`consommation ${formatUsd(data.usage)}`);
  if (typeof data.limit === "number") parts.push(`limite ${formatUsd(data.limit)}`);
  else if (data.limit === null) parts.push("sans limite");
  if (typeof data.limit_remaining === "number") parts.push(`reste ${formatUsd(data.limit_remaining)}`);
  if (data.is_free_tier === true) parts.push("offre gratuite");
  return { ok: true, detail: parts.join(" · ") };
}

async function testOpenAi(apiKey: string, signal: AbortSignal): Promise<ConnectionTestResult> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  });
  if (!res.ok) return failure(res, apiKey);
  return { ok: true, detail: "Clé valide" };
}

async function testYouTube(apiKey: string, signal: AbortSignal): Promise<ConnectionTestResult> {
  const params = new URLSearchParams({ part: "id", forHandle: "@YouTube", key: apiKey });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params.toString()}`, { signal });
  if (!res.ok) return failure(res, apiKey);
  return { ok: true, detail: "Clé valide · 1 unité de quota utilisée" };
}

/** Tests the key the server would actually use (stored value, else env var). */
export async function testProviderKey(provider: TestableProvider): Promise<ConnectionTestResult> {
  const apiKey = getTypedSettings()[KEY_FOR[provider]];
  if (!apiKey) return { ok: false, detail: "Aucune clé configurée" };
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    if (provider === "openrouter") return await testOpenRouter(apiKey, signal);
    if (provider === "openai") return await testOpenAi(apiKey, signal);
    return await testYouTube(apiKey, signal);
  } catch (err) {
    const name = (err as { name?: unknown } | null)?.name;
    if (name === "TimeoutError" || name === "AbortError") return { ok: false, detail: "Délai dépassé (10 s)" };
    return { ok: false, detail: "Service injoignable" };
  }
}
```

- [ ] **Step 4: Add the route**

Create `src/app/api/settings/test/route.ts`:

```ts
import { NextResponse } from "next/server";
import { isTestableProvider, testProviderKey } from "@/lib/connection-tests";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const provider = new URL(request.url).searchParams.get("provider");
  if (!isTestableProvider(provider)) {
    return NextResponse.json({ ok: false, detail: "Fournisseur inconnu" }, { status: 400 });
  }
  return NextResponse.json(await testProviderKey(provider));
}
```

- [ ] **Step 5: Run the tests**

Run: `./node_modules/.bin/vitest run tests/settings/connection-tests.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 6: Type-check and full suite**

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run`
Expected: `tsc` exits 0; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/connection-tests.ts src/app/api/settings/test/route.ts tests/settings/connection-tests.test.ts
git commit -m "feat(settings): server-side connection tests for OpenRouter, OpenAI and YouTube keys"
```

---

## Task 4: `/reglages` shell, section menu, Intégrations section, sidebar wiring

**Files:**
- Create: `src/components/settings/sections.ts`
- Create: `src/components/settings/SettingsNav.tsx`
- Create: `src/components/settings/use-settings.ts`
- Create: `src/components/settings/IntegrationsSection.tsx`
- Create: `src/app/reglages/layout.tsx`, `src/app/reglages/page.tsx`, `src/app/reglages/integrations/page.tsx`
- Create: `tests/settings/sections.test.ts`
- Modify: `src/components/panels/AppSidebar.tsx`
- Delete: `src/components/panels/SettingsPanel.tsx`

**Interfaces:**
- Consumes: `SettingsResponse` type (Task 2); `McpSettingsSection` (unchanged).
- Produces:
  - `SETTINGS_SECTIONS: readonly { slug; label; icon: LucideIcon }[]` (spec order), `type SettingsSectionSlug`, `isSettingsSectionSlug(value: string): value is SettingsSectionSlug`, `activeSectionSlug(pathname: string): SettingsSectionSlug`
  - `useSettings(): { settings: SettingsResponse | null; loadError: string | null; reload: () => Promise<SettingsResponse | null> }` (client hook)
  - Route shell: every section page renders inside `src/app/reglages/layout.tsx`; section pages are server components rendering one client section component.

Until Tasks 5–11 land, the other six menu links (and the `/reglages` redirect target `/reglages/connexions`) return 404 — expected at this stage.

- [ ] **Step 1: Write the failing test for the section model**

Create `tests/settings/sections.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SETTINGS_SECTIONS, activeSectionSlug, isSettingsSectionSlug } from "@/components/settings/sections";

describe("settings sections", () => {
  it("lists the seven sections in the spec order with their labels", () => {
    expect(SETTINGS_SECTIONS.map((s) => [s.slug, s.label])).toEqual([
      ["connexions", "Connexions des modèles"],
      ["agent", "Agent IA"],
      ["generation", "Génération d'images"],
      ["chaine", "Ma chaîne"],
      ["integrations", "Intégrations"],
      ["donnees", "Données & sauvegardes"],
      ["apparence", "Apparence"],
    ]);
  });

  it("finds the active section from the pathname", () => {
    expect(activeSectionSlug("/reglages/agent")).toBe("agent");
    expect(activeSectionSlug("/reglages/donnees/extra")).toBe("donnees");
    expect(activeSectionSlug("/reglages")).toBe("connexions");
    expect(activeSectionSlug("/reglages/nope")).toBe("connexions");
  });

  it("recognises section slugs", () => {
    expect(isSettingsSectionSlug("apparence")).toBe(true);
    expect(isSettingsSectionSlug("theme")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/settings/sections.test.ts`
Expected: FAIL — `Failed to resolve import "@/components/settings/sections"`.

- [ ] **Step 3: Create the section model**

Create `src/components/settings/sections.ts`:

```ts
import { Bot, Database, ImagePlus, KeyRound, Palette, Plug, TvMinimalPlay, type LucideIcon } from "lucide-react";

// lucide-react 1.x ships no brand icons (no `Youtube`), hence TvMinimalPlay for « Ma chaîne ».
export const SETTINGS_SECTIONS = [
  { slug: "connexions", label: "Connexions des modèles", icon: KeyRound },
  { slug: "agent", label: "Agent IA", icon: Bot },
  { slug: "generation", label: "Génération d'images", icon: ImagePlus },
  { slug: "chaine", label: "Ma chaîne", icon: TvMinimalPlay },
  { slug: "integrations", label: "Intégrations", icon: Plug },
  { slug: "donnees", label: "Données & sauvegardes", icon: Database },
  { slug: "apparence", label: "Apparence", icon: Palette },
] as const satisfies ReadonlyArray<{ slug: string; label: string; icon: LucideIcon }>;

export type SettingsSectionSlug = (typeof SETTINGS_SECTIONS)[number]["slug"];

export function isSettingsSectionSlug(value: string): value is SettingsSectionSlug {
  return SETTINGS_SECTIONS.some((section) => section.slug === value);
}

/** "/reglages/<slug>/…" → slug; anything else falls back to the first section. */
export function activeSectionSlug(pathname: string): SettingsSectionSlug {
  const segment = pathname.split("/")[2] ?? "";
  return isSettingsSectionSlug(segment) ? segment : "connexions";
}
```

- [ ] **Step 4: Run the test**

Run: `./node_modules/.bin/vitest run tests/settings/sections.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Create the settings loader hook**

Create `src/components/settings/use-settings.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import type { SettingsResponse } from "@/lib/settings-schema";

/** Loads GET /api/settings once; `reload` refetches (e.g. after saving a key). */
export function useSettings() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<SettingsResponse | null> => {
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as SettingsResponse;
      setSettings(data);
      setLoadError(null);
      return data;
    } catch {
      setLoadError("Impossible de charger les réglages.");
      return null;
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { settings, loadError, reload };
}
```

- [ ] **Step 6: Create the section menu**

Create `src/components/settings/SettingsNav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SETTINGS_SECTIONS, activeSectionSlug, isSettingsSectionSlug } from "./sections";

const SECTION_ITEMS = SETTINGS_SECTIONS.map((section) => ({ value: section.slug, label: section.label }));

export default function SettingsNav() {
  const pathname = usePathname();
  const router = useRouter();
  const active = activeSectionSlug(pathname);

  return (
    <div className="min-w-0">
      <div className="md:hidden">
        <Select
          items={SECTION_ITEMS}
          value={active}
          onValueChange={(value) => {
            if (value && isSettingsSectionSlug(value)) router.push(`/reglages/${value}`);
          }}
        >
          <SelectTrigger className="w-full" aria-label="Section des réglages">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SECTION_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <nav aria-label="Sections des réglages" className="hidden md:block">
        <ul className="grid gap-1">
          {SETTINGS_SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = section.slug === active;
            return (
              <li key={section.slug}>
                <Link
                  href={`/reglages/${section.slug}`}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(buttonVariants({ variant: isActive ? "secondary" : "ghost" }), "w-full justify-start")}
                >
                  <Icon />
                  {section.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
```

- [ ] **Step 7: Create the layout and the redirect**

Create `src/app/reglages/layout.tsx`:

```tsx
"use client";

import { ReactFlowProvider } from "@xyflow/react";
import AppSidebar from "@/components/panels/AppSidebar";
import SettingsNav from "@/components/settings/SettingsNav";
import { SidebarInset } from "@/components/ui/sidebar";

// AppSidebar calls useReactFlow(), so it needs a provider even without a canvas.
// The body never scrolls (globals.css), so the inset is the scroll container.
export default function ReglagesLayout({ children }: { children: React.ReactNode }) {
  return (
    <ReactFlowProvider>
      <AppSidebar />
      <SidebarInset className="h-svh overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-6 py-8">
          <header className="mb-8">
            <h1 className="font-heading text-2xl font-medium">Réglages</h1>
            <p className="text-sm text-muted-foreground">
              Clés des modèles, agent, génération, chaîne, intégrations, données et apparence de ThumbGen.
            </p>
          </header>
          <div className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
            <SettingsNav />
            <div className="grid min-w-0 content-start gap-6">{children}</div>
          </div>
        </div>
      </SidebarInset>
    </ReactFlowProvider>
  );
}
```

Create `src/app/reglages/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function ReglagesIndexPage() {
  redirect("/reglages/connexions");
}
```

- [ ] **Step 8: Create the Intégrations section and page**

Create `src/components/settings/IntegrationsSection.tsx`:

```tsx
"use client";

import McpSettingsSection from "@/components/panels/settings/McpSettingsSection";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSettings } from "./use-settings";

export default function IntegrationsSection() {
  const { settings, loadError } = useSettings();

  return (
    <>
      <Card>
        <CardContent>
          <McpSettingsSection />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accès protégé par mot de passe</CardTitle>
          <CardDescription>Se configure via la variable d&apos;environnement SITE_PASSWORD.</CardDescription>
          <CardAction>
            {settings ? (
              <Badge variant={settings.sitePasswordEnabled ? "default" : "secondary"}>
                {settings.sitePasswordEnabled ? "Activé" : "Désactivé"}
              </Badge>
            ) : (
              <Skeleton className="h-5 w-16" />
            )}
          </CardAction>
        </CardHeader>
        {loadError && (
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          </CardContent>
        )}
      </Card>
    </>
  );
}
```

Create `src/app/reglages/integrations/page.tsx`:

```tsx
import IntegrationsSection from "@/components/settings/IntegrationsSection";

export const metadata = { title: "Intégrations · Réglages · ThumbGen" };

export default function IntegrationsPage() {
  return <IntegrationsSection />;
}
```

- [ ] **Step 9: Point the sidebar at the page and delete the dialog**

In `src/components/panels/AppSidebar.tsx`:

1. Delete the import line `import SettingsPanel from "./SettingsPanel";`.
2. Delete the line `  const [settingsOpen, setSettingsOpen] = useState(false);`.
3. Delete the line `  const onSettingsSaved = () => { fetchPlaylist(); };` and the blank line after it.
4. Replace

```tsx
              <SidebarMenuButton tooltip="Réglages" onClick={() => setSettingsOpen(true)}>
```

with

```tsx
              <SidebarMenuButton
                tooltip="Réglages"
                isActive={pathname.startsWith("/reglages")}
                onClick={() => { setActiveTab(null); router.push("/reglages"); }}
              >
```

5. Delete the settings dialog block:

```tsx
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Réglages</DialogTitle>
          </DialogHeader>
          <SettingsPanel onClose={() => setSettingsOpen(false)} onSaved={onSettingsSaved} />
        </DialogContent>
      </Dialog>

```

Keep the `Dialog` imports: the « Nouveau visage » dialog still uses them.

Then delete the old panel:

```bash
git rm src/components/panels/SettingsPanel.tsx
grep -rn "SettingsPanel\|settingsOpen\|onSettingsSaved" src
```

Expected: the grep prints nothing.

- [ ] **Step 10: Type-check and full suite**

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run`
Expected: `tsc` exits 0; all tests pass.

- [ ] **Step 11: Check in the browser (dev server)**

Start the throwaway dev server (see Global Constraints: `THUMBGEN_DB_PATH="$(mktemp -d)/thumbgen.db" ./node_modules/.bin/next dev -p 3100`) and open `http://localhost:3100/reglages/integrations`:
- The sidebar « Réglages » item is highlighted; the section menu shows 7 entries with « Intégrations » highlighted.
- The MCP card shows the masked token with reveal/copy/regenerate buttons (do **not** click « Régénérer »).
- The password card shows « Activé » or « Désactivé ».
- At a width under 768 px the menu becomes a `Select`.
- Clicking « Réglages » in the sidebar navigates to `/reglages` (404 on `/reglages/connexions` is expected until Task 5).

Stop the dev server afterwards.

- [ ] **Step 12: Commit**

```bash
git add src/components/settings/sections.ts src/components/settings/SettingsNav.tsx src/components/settings/use-settings.ts src/components/settings/IntegrationsSection.tsx src/app/reglages/layout.tsx src/app/reglages/page.tsx src/app/reglages/integrations/page.tsx tests/settings/sections.test.ts src/components/panels/AppSidebar.tsx
git commit -m "feat(reglages): dedicated settings page shell with section menu and integrations section"
```

---

## Task 5: Connexions des modèles section

**Files:**
- Create: `src/components/settings/secret-status.ts`
- Create: `src/components/settings/FieldError.tsx`
- Create: `src/components/settings/ConfirmDialog.tsx`
- Create: `src/components/settings/SecretKeyCard.tsx`
- Create: `src/components/settings/ConnexionsSection.tsx`
- Create: `src/app/reglages/connexions/page.tsx`
- Create: `tests/settings/secret-status.test.ts`

**Interfaces:**
- Consumes: `SecretStatus`, `SettingsIssue`, `ENV_FALLBACK` (Task 2); `POST/DELETE /api/settings` (Task 2); `POST /api/settings/test` and `type TestableProvider` (Task 3); `useSettings()` (Task 4).
- Produces:
  - `describeSecretStatus(status: SecretStatus): { label: string; variant: "secondary" | "outline" | "destructive" }`
  - `<FieldError message?: string />` — destructive helper text, renders nothing without a message
  - `<ConfirmDialog open onOpenChange title description confirmLabel busy? destructive? onConfirm />` — reused by Task 10

- [ ] **Step 1: Write the failing badge test**

Create `tests/settings/secret-status.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { describeSecretStatus } from "@/components/settings/secret-status";

describe("describeSecretStatus", () => {
  it("shows the preview of a stored key", () => {
    expect(describeSecretStatus({ configured: true, preview: "…a107", source: "settings" })).toEqual({
      label: "Configurée · …a107",
      variant: "secondary",
    });
  });

  it("flags a key coming from the environment", () => {
    expect(describeSecretStatus({ configured: true, preview: "…9999", source: "env" })).toEqual({
      label: "Via variable d'environnement",
      variant: "outline",
    });
  });

  it("flags a missing key", () => {
    expect(describeSecretStatus({ configured: false, preview: null, source: null })).toEqual({
      label: "Non configurée",
      variant: "destructive",
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/settings/secret-status.test.ts`
Expected: FAIL — `Failed to resolve import "@/components/settings/secret-status"`.

- [ ] **Step 3: Implement the badge mapping**

Create `src/components/settings/secret-status.ts`:

```ts
import type { SecretStatus } from "@/lib/settings-schema";

export function describeSecretStatus(status: SecretStatus): {
  label: string;
  variant: "secondary" | "outline" | "destructive";
} {
  if (status.source === "settings") return { label: `Configurée · ${status.preview ?? "…"}`, variant: "secondary" };
  if (status.source === "env") return { label: "Via variable d'environnement", variant: "outline" };
  return { label: "Non configurée", variant: "destructive" };
}
```

- [ ] **Step 4: Run the test**

Run: `./node_modules/.bin/vitest run tests/settings/secret-status.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Create the shared field error and confirmation dialog**

Create `src/components/settings/FieldError.tsx`:

```tsx
export default function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}
```

Create `src/components/settings/ConfirmDialog.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  busy = false,
  destructive = true,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" variant={destructive ? "destructive" : "default"} disabled={busy} onClick={onConfirm}>
            {busy ? "En cours…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Create the per-provider key card**

Create `src/components/settings/SecretKeyCard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { ConnectionTestResult, TestableProvider } from "@/lib/connection-tests";
import { ENV_FALLBACK, type SecretStatus, type SettingsIssue } from "@/lib/settings-schema";
import ConfirmDialog from "./ConfirmDialog";
import FieldError from "./FieldError";
import { describeSecretStatus } from "./secret-status";

export type ProviderKeyConfig = {
  key: "openrouterApiKey" | "openaiApiKey" | "youtubeApiKey";
  provider: TestableProvider;
  title: string;
  usage: string;
  placeholder: string;
  helpHref: string;
};

export default function SecretKeyCard({
  config,
  status,
  onChanged,
}: {
  config: ProviderKeyConfig;
  status: SecretStatus | null;
  onChanged: () => Promise<unknown>;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const envName = ENV_FALLBACK[config.key];
  const inputId = `secret-${config.key}`;
  const badge = status ? describeSecretStatus(status) : null;

  const save = async () => {
    if (!value.trim() || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    setFieldError(undefined);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [config.key]: value.trim() }),
      });
      if (res.status === 400) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; issues?: SettingsIssue[] };
        const issue = body.issues?.find((item) => item.path === config.key);
        if (issue) setFieldError(issue.message);
        else setError(body.error ?? "Clé refusée.");
        return;
      }
      if (!res.ok) {
        setError(`Échec de l'enregistrement (HTTP ${res.status}).`);
        return;
      }
      // The secret never stays in the page once saved.
      setValue("");
      setTestResult(null);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
      await onChanged();
    } catch {
      setError("Échec de l'enregistrement — vérifie ta connexion.");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/settings/test?provider=${config.provider}`, { method: "POST" });
      setTestResult((await res.json()) as ConnectionTestResult);
    } catch {
      setTestResult({ ok: false, detail: "Test impossible — vérifie ta connexion." });
    } finally {
      setTesting(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/settings?key=${config.key}`, { method: "DELETE" });
      if (!res.ok) {
        setError(`Suppression impossible (HTTP ${res.status}).`);
        return;
      }
      const after = (await res.json()) as SecretStatus;
      if (after.source === "env") {
        setNotice(
          `La clé enregistrée est supprimée, mais la variable d'environnement ${envName} en fournit encore une : elle ne peut pas être effacée depuis cette page.`,
        );
      }
      setTestResult(null);
      setConfirmOpen(false);
      await onChanged();
    } catch {
      setError("Suppression impossible — vérifie ta connexion.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <form
        className="contents"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <CardHeader>
          <CardTitle>{config.title}</CardTitle>
          <CardDescription>{config.usage}</CardDescription>
          <CardAction>
            {badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : <Skeleton className="h-5 w-24" />}
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={inputId}>{status?.configured ? "Remplacer la clé" : "Clé API"}</Label>
            <Input
              id={inputId}
              type="password"
              autoComplete="off"
              placeholder={config.placeholder}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              aria-invalid={Boolean(fieldError)}
            />
            <FieldError message={fieldError} />
            <a
              href={config.helpHref}
              target="_blank"
              rel="noopener noreferrer"
              className="w-fit text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Obtenir une clé
            </a>
          </div>
          {status?.source === "env" && (
            <p className="text-sm text-muted-foreground">
              Cette clé vient de la variable d&apos;environnement {envName} : elle ne peut pas être effacée depuis cette page.
            </p>
          )}
          {testResult && (
            <Alert variant={testResult.ok ? "default" : "destructive"}>
              <AlertDescription>{testResult.detail}</AlertDescription>
            </Alert>
          )}
          {notice && (
            <Alert>
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex-wrap gap-2">
          <Button type="submit" disabled={!value.trim() || saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
          <Button type="button" variant="outline" disabled={!status?.configured || testing} onClick={() => void runTest()}>
            {testing ? "Test en cours…" : "Tester"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={status?.source !== "settings" || deleting}
            onClick={() => setConfirmOpen(true)}
          >
            Supprimer la clé
          </Button>
          {saved && <span className="text-sm text-muted-foreground">Enregistré</span>}
        </CardFooter>
      </form>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Supprimer la clé ${config.title} ?`}
        description="Les fonctions qui l'utilisent cesseront de marcher jusqu'à l'enregistrement d'une nouvelle clé."
        confirmLabel="Supprimer la clé"
        busy={deleting}
        onConfirm={() => void remove()}
      />
    </Card>
  );
}
```

`import type` from `@/lib/connection-tests` is erased at compile time, so the server-only module is never bundled for the browser.

- [ ] **Step 7: Create the section and its page**

Create `src/components/settings/ConnexionsSection.tsx`:

```tsx
"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import SecretKeyCard, { type ProviderKeyConfig } from "./SecretKeyCard";
import { useSettings } from "./use-settings";

const PROVIDERS: ProviderKeyConfig[] = [
  {
    key: "openrouterApiKey",
    provider: "openrouter",
    title: "OpenRouter",
    usage: "Requise. Génère les images, fait tourner l'agent et améliore les prompts.",
    placeholder: "sk-or-v1-…",
    helpHref: "https://openrouter.ai/keys",
  },
  {
    key: "openaiApiKey",
    provider: "openai",
    title: "OpenAI",
    usage: "Utilisée uniquement pour la dictée vocale du chat.",
    placeholder: "sk-…",
    helpHref: "https://platform.openai.com/api-keys",
  },
  {
    key: "youtubeApiKey",
    provider: "youtube",
    title: "YouTube Data API",
    usage: "Recherche de vidéos et de miniatures par l'agent, flux d'inspirations.",
    placeholder: "AIza…",
    helpHref: "https://console.cloud.google.com/apis/credentials",
  },
];

export default function ConnexionsSection() {
  const { settings, loadError, reload } = useSettings();

  return (
    <>
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}
      {PROVIDERS.map((config) => (
        <SecretKeyCard
          key={config.key}
          config={config}
          status={settings ? settings[config.key] : null}
          onChanged={reload}
        />
      ))}
    </>
  );
}
```

Create `src/app/reglages/connexions/page.tsx`:

```tsx
import ConnexionsSection from "@/components/settings/ConnexionsSection";

export const metadata = { title: "Connexions des modèles · Réglages · ThumbGen" };

export default function ConnexionsPage() {
  return <ConnexionsSection />;
}
```

- [ ] **Step 8: Type-check and full suite**

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run`
Expected: `tsc` exits 0; all tests pass.

- [ ] **Step 9: Check in the browser (throwaway dev server on port 3100)**

Open `http://localhost:3100/reglages` → redirected to `/reglages/connexions`:
- Three cards (OpenRouter, OpenAI, YouTube Data API) with their usage sentence and a status badge.
- « Enregistrer » is disabled while the field is empty. Type `sk-test-00000000` in the OpenAI field, save → the field empties, « Enregistré » shows for ~2 s, the badge becomes « Configurée · …0000 », « Supprimer la clé » becomes enabled.
- « Tester » on that fake key shows a destructive alert starting with `HTTP 401` (or « Service injoignable » offline); the alert never contains the key.
- « Supprimer la clé » opens the confirmation dialog; confirm → the badge returns to its previous state (« Via variable d'environnement » when `.env` provides `OPENAI_API_KEY`, with the explanation notice; otherwise « Non configurée »).

This dev server runs on a throwaway DB, so these writes touch nothing real. Stop it afterwards.

- [ ] **Step 10: Commit**

```bash
git add src/components/settings/secret-status.ts src/components/settings/FieldError.tsx src/components/settings/ConfirmDialog.tsx src/components/settings/SecretKeyCard.tsx src/components/settings/ConnexionsSection.tsx src/app/reglages/connexions/page.tsx tests/settings/secret-status.test.ts
git commit -m "feat(reglages): connexions section with key status, test and removal"
```

---

## Task 6: Agent IA — settings wiring in the agent route and system prompt, then the section

**Files:**
- Create: `src/lib/agent/prompt-prefs.ts`
- Modify: `src/lib/agent/system-prompt.ts`
- Modify: `src/lib/agent/v2/route-handler.ts`
- Create: `src/components/settings/form-state.ts`
- Create: `src/components/settings/use-settings-form.ts`
- Create: `src/components/settings/SettingsFormCard.tsx`
- Create: `src/components/settings/AgentSection.tsx`
- Create: `src/app/reglages/agent/page.tsx`
- Rewrite: `tests/agent/system-prompt.test.ts`
- Create: `tests/agent/prompt-prefs.test.ts`, `tests/agent/v2-route-handler-settings.test.ts`, `tests/settings/form-state.test.ts`

**Interfaces:**
- Consumes: `getTypedSettings`, `updateSettings`, `setSetting` (Task 2); `LANGUAGES`, `LanguageCode`, `REASONING_EFFORTS`, `SettingsValues`, `SettingsIssue` (Task 2); `useSettings` (Task 4); `FieldError` (Task 5).
- Produces:
  - `src/lib/agent/system-prompt.ts`: `type AgentPromptPrefs = { responseLanguage: LanguageCode; thumbnailLanguage: LanguageCode }`, `DEFAULT_AGENT_PROMPT_PREFS`, `buildResponseLanguageBlock(prefs: Pick<AgentPromptPrefs, "responseLanguage" | "thumbnailLanguage">): string`, `buildSystemMessages(canvasSnapshot: unknown, projectId?: string, prefs?: AgentPromptPrefs)` — block order: cached static prompt, `<response_language>`, `<project_id>` (optional), `<canvas_state>`. Task 8 extends `AgentPromptPrefs`.
  - `src/lib/agent/prompt-prefs.ts`: `loadAgentPromptPrefs(): AgentPromptPrefs`
  - `src/components/settings/form-state.ts`: `pickValues`, `isDirty`, `issuesByPath`
  - `src/components/settings/use-settings-form.ts`: `useSettingsForm<K extends keyof SettingsValues>(keys: readonly K[], options?: { onSaved?: (values: Pick<SettingsValues, K>) => void }): SettingsForm<K>` with `values`, `setValue(key, value)`, `dirty`, `saving`, `saved`, `issues: Record<string, string>`, `error`, `loadError`, `save()`. Pass a module-level constant as `keys`.
  - `src/components/settings/SettingsFormCard.tsx`: `<SettingsFormCard title description form>{(values) => …}</SettingsFormCard>` — Card + form + skeleton + « Enregistrer » (enabled only when dirty) + « Enregistré » for 2 s + destructive Alert for non-field errors.

- [ ] **Step 1: Write the failing system-prompt tests**

Replace the whole content of `tests/agent/system-prompt.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import {
  AGENT_SYSTEM_PROMPT,
  DEFAULT_AGENT_PROMPT_PREFS,
  buildResponseLanguageBlock,
  buildSystemMessages,
} from "@/lib/agent/system-prompt";

describe("system prompt", () => {
  it("contains the persona and the canvas_state instruction", () => {
    expect(AGENT_SYSTEM_PROMPT).toContain("ThumbGen Brainstorm");
    expect(AGENT_SYSTEM_PROMPT).toContain("<canvas_state>");
  });

  it("no longer hard-codes French as the reply language", () => {
    expect(AGENT_SYSTEM_PROMPT).not.toContain("French is the user's preferred language");
  });

  it("returns the cached persona block, the language block, then the canvas block", () => {
    const blocks = buildSystemMessages({ nodes: [], edges: [] });
    expect(blocks).toHaveLength(3);
    expect(blocks[0].cache_control).toEqual({ type: "ephemeral" });
    expect(blocks[1].text.startsWith("<response_language>")).toBe(true);
    expect(blocks[1].cache_control).toBeUndefined();
    expect(blocks[2].cache_control).toBeUndefined();
    expect(blocks[2].text).toContain("<canvas_state>");
    expect(blocks[2].text).toContain('"nodes": []');
  });

  it("snapshot serialization preserves node ids", () => {
    const blocks = buildSystemMessages({
      nodes: [{ id: "p-1", type: "prompt", summary: { prompt: "hi" } }],
      edges: [],
    });
    expect(blocks.at(-1)!.text).toContain('"id": "p-1"');
  });

  it("injects project_id between the language block and canvas_state", () => {
    const blocks = buildSystemMessages({ nodes: [], edges: [] }, "proj-abc");
    expect(blocks).toHaveLength(4);
    expect(blocks[1].text.startsWith("<response_language>")).toBe(true);
    expect(blocks[2].text).toContain("<project_id>proj-abc</project_id>");
    expect(blocks[2].text).toMatch(/Pass it as the `project_id` argument/);
    expect(blocks[3].text).toContain("<canvas_state>");
  });

  it("omits the project_id block when no projectId given", () => {
    const blocks = buildSystemMessages({ nodes: [], edges: [] });
    expect(blocks.some((b) => b.text.includes("<project_id>"))).toBe(false);
  });

  it("defaults both languages to French", () => {
    const text = buildSystemMessages({ nodes: [], edges: [] })[1].text;
    expect(text).toContain("Reply to the user in French");
    expect(text).toContain("on the thumbnails themselves");
  });

  it("names the reply language and the thumbnail text language separately", () => {
    const text = buildResponseLanguageBlock({ ...DEFAULT_AGENT_PROMPT_PREFS, responseLanguage: "en", thumbnailLanguage: "es" });
    expect(text).toContain("Reply to the user in English");
    expect(text).toMatch(/on the thumbnails themselves .* in Spanish\./);
  });
});
```

Create `tests/agent/prompt-prefs.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "@/lib/db";
import { updateSettings } from "@/lib/settings";
import { loadAgentPromptPrefs } from "@/lib/agent/prompt-prefs";

beforeEach(() => {
  getDb().exec("DELETE FROM settings");
});

describe("loadAgentPromptPrefs", () => {
  it("defaults both languages to French", () => {
    expect(loadAgentPromptPrefs()).toEqual({ responseLanguage: "fr", thumbnailLanguage: "fr" });
  });

  it("reads agentResponseLanguage and the thumbnail language setting", () => {
    updateSettings({ agentResponseLanguage: "en", language: "de" });
    expect(loadAgentPromptPrefs()).toEqual({ responseLanguage: "en", thumbnailLanguage: "de" });
  });
});
```

Create `tests/agent/v2-route-handler-settings.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

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

const generateAndPersistTitleMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@/lib/agent/conversation/auto-title", () => ({
  generateAndPersistTitle: (...args: unknown[]) => generateAndPersistTitleMock(...args),
}));

const streamTextMock = vi.fn();
const isStepCountMock = vi.fn();
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    streamText: (opts: unknown) => streamTextMock(opts),
    isStepCount: (count: number) => {
      isStepCountMock(count);
      return actual.isStepCount(count);
    },
  };
});

import { getDb } from "@/lib/db";
import { setSetting, updateSettings } from "@/lib/settings";

type StreamArgs = {
  system: string;
  providerOptions: { openrouter: { reasoning?: { effort: string } } };
};

function streamResult() {
  return {
    toUIMessageStreamResponse: () => new Response("ok", { headers: { "content-type": "text/event-stream" } }),
    consumeStream: vi.fn(async () => {}),
  };
}

async function send(text = "hi") {
  const { postV2 } = await import("@/lib/agent/v2/route-handler");
  return postV2(
    new Request("http://localhost/api/agent/chat", {
      method: "POST",
      body: JSON.stringify({
        conversation_id: `c-${Math.random().toString(36).slice(2)}`,
        project_id: "p1",
        messages: [{ role: "user", parts: [{ type: "text", text }] }],
        canvas_snapshot: { nodes: [], edges: [] },
      }),
    }) as never,
  );
}

function streamArgs(): StreamArgs {
  return streamTextMock.mock.calls[0][0] as StreamArgs;
}

describe("postV2 reads the agent settings", () => {
  beforeEach(() => {
    getDb().exec("DELETE FROM settings");
    setSetting("openrouterApiKey", "test-key");
    streamTextMock.mockReset();
    streamTextMock.mockReturnValue(streamResult());
    isStepCountMock.mockClear();
    generateAndPersistTitleMock.mockClear();
  });

  it("sends the configured reasoning effort to a thinking model", async () => {
    updateSettings({ agentModel: "anthropic/claude-sonnet-4.6", agentReasoningEffort: "high" });
    await send();
    expect(streamArgs().providerOptions.openrouter.reasoning).toEqual({ effort: "high" });
  });

  it("defaults the reasoning effort to medium", async () => {
    await send();
    expect(streamArgs().providerOptions.openrouter.reasoning).toEqual({ effort: "medium" });
  });

  it("sends no reasoning option to a model without thinking support", async () => {
    updateSettings({ agentModel: "openai/gpt-5", agentReasoningEffort: "high" });
    await send();
    expect(streamArgs().providerOptions.openrouter.reasoning).toBeUndefined();
  });

  it("uses agentMaxSteps as the step limit, 25 by default", async () => {
    await send();
    expect(isStepCountMock).toHaveBeenLastCalledWith(25);
    streamTextMock.mockClear();
    updateSettings({ agentMaxSteps: 12 });
    await send();
    expect(isStepCountMock).toHaveBeenLastCalledWith(12);
  });

  it("auto-titles the first turn by default", async () => {
    await send("Une miniature gaming néon");
    expect(generateAndPersistTitleMock).toHaveBeenCalledTimes(1);
  });

  it("skips the auto-title when agentAutoTitle is off", async () => {
    updateSettings({ agentAutoTitle: false });
    await send("Une miniature gaming néon");
    expect(generateAndPersistTitleMock).not.toHaveBeenCalled();
  });

  it("adds the response language block to the system prompt", async () => {
    updateSettings({ agentResponseLanguage: "en" });
    await send();
    expect(streamArgs().system).toContain("<response_language>");
    expect(streamArgs().system).toContain("Reply to the user in English");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `./node_modules/.bin/vitest run tests/agent/system-prompt.test.ts tests/agent/prompt-prefs.test.ts tests/agent/v2-route-handler-settings.test.ts`
Expected: FAIL — missing exports `buildResponseLanguageBlock` / `DEFAULT_AGENT_PROMPT_PREFS`, unresolved `@/lib/agent/prompt-prefs`, and route-handler assertions failing (effort stays `"medium"`, steps stay 25, auto-title still called).

- [ ] **Step 3: Add the language block to the system prompt**

In `src/lib/agent/system-prompt.ts`:

1. Replace the import line

```ts
import { buildAgentRubric } from "@/lib/prompt-engineering";
```

with

```ts
import { buildAgentRubric } from "@/lib/prompt-engineering";
import { LANGUAGES, type LanguageCode } from "@/lib/settings-schema";
```

2. Delete this line from `AGENT_SYSTEM_PROMPT` (the language now comes from the `<response_language>` block):

```
- French is the user's preferred language unless they switch
```

3. In the same prompt, replace

```
      - prompt with the actual prompt text describing the thumbnail (in the language of the user's video — usually French)
```

with

```
      - prompt with the actual prompt text describing the thumbnail (thumbnail text in the language given in <response_language>)
```

4. Replace everything from the doc comment `/**` that precedes `export function buildSystemMessages(` down to the end of the file with:

```ts
// ── Per-turn system blocks (built from Réglages) ──

/** What the agent's per-turn system blocks need from the settings. */
export type AgentPromptPrefs = {
  responseLanguage: LanguageCode;
  thumbnailLanguage: LanguageCode;
};

export const DEFAULT_AGENT_PROMPT_PREFS: AgentPromptPrefs = {
  responseLanguage: "fr",
  thumbnailLanguage: "fr",
};

function languageName(code: LanguageCode): string {
  return LANGUAGES.find((language) => language.code === code)?.englishName ?? code;
}

export function buildResponseLanguageBlock(prefs: Pick<AgentPromptPrefs, "responseLanguage" | "thumbnailLanguage">): string {
  return [
    "<response_language>",
    `Reply to the user in ${languageName(prefs.responseLanguage)} unless they explicitly switch language.`,
    `Write any text meant to appear on the thumbnails themselves (text overlays, hooks, titles inside image prompts) in ${languageName(prefs.thumbnailLanguage)}.`,
    "</response_language>",
  ].join("\n");
}

/**
 * Returns the "system" parameter as an array of blocks. The first block is the
 * static persona+rules with cache_control set, so it's cached across turns.
 * The following blocks are per-turn: reply language, project id, canvas snapshot.
 */
export function buildSystemMessages(
  canvasSnapshot: unknown,
  projectId?: string,
  prefs: AgentPromptPrefs = DEFAULT_AGENT_PROMPT_PREFS,
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
  if (projectId) {
    blocks.push({
      type: "text",
      text: `<project_id>${projectId}</project_id>\n\nThe project_id above identifies the current canvas. Pass it as the \`project_id\` argument to any tool that takes one (apply_workflow, get_canvas_state, list_past_generations, trigger_generation, etc.).`,
    });
  }
  blocks.push({
    type: "text",
    text: `<canvas_state>\n${JSON.stringify(canvasSnapshot, null, 2)}\n</canvas_state>`,
  });
  return blocks;
}
```

- [ ] **Step 4: Create the prefs loader**

Create `src/lib/agent/prompt-prefs.ts`:

```ts
import { getTypedSettings } from "@/lib/settings";
import type { AgentPromptPrefs } from "@/lib/agent/system-prompt";

/** Reads the Réglages values that shape the agent's per-turn system blocks. */
export function loadAgentPromptPrefs(): AgentPromptPrefs {
  const settings = getTypedSettings();
  return {
    responseLanguage: settings.agentResponseLanguage,
    thumbnailLanguage: settings.language,
  };
}
```

- [ ] **Step 5: Wire the route handler to the settings**

In `src/lib/agent/v2/route-handler.ts`:

1. Replace

```ts
import { getSetting } from "@/lib/settings";
import { getModelById, DEFAULT_AGENT_MODEL } from "@/lib/agent/models";
```

with

```ts
import { getTypedSettings } from "@/lib/settings";
import { getModelById } from "@/lib/agent/models";
import { loadAgentPromptPrefs } from "@/lib/agent/prompt-prefs";
```

2. Delete the line `const MAX_STEPS = 25;` and the blank line after it.

3. Replace

```ts
  const modelId = getSetting("agentModel") || DEFAULT_AGENT_MODEL;
```

with

```ts
  const settings = getTypedSettings();
  const modelId = settings.agentModel;
```

4. Replace

```ts
      if (isFirstTurn && lastMessageText.trim()) {
```

with

```ts
      if (isFirstTurn && lastMessageText.trim() && settings.agentAutoTitle) {
```

5. In the comment of the `else` branch, replace `// MAX_STEPS more steps with nothing new to respond to. Return early` with `// agentMaxSteps more steps with nothing new to respond to. Return early`.

6. Replace

```ts
    const systemBlocks = buildSystemMessages(body.canvas_snapshot, body.project_id);
```

with

```ts
    const systemBlocks = buildSystemMessages(body.canvas_snapshot, body.project_id, loadAgentPromptPrefs());
```

7. Replace

```ts
    stopWhen: isStepCount(MAX_STEPS),
```

with

```ts
    stopWhen: isStepCount(settings.agentMaxSteps),
```

8. Replace

```ts
        ...(modelInfo?.supportsThinking ? { reasoning: { effort: "medium" as const } } : {}),
```

with

```ts
        ...(modelInfo?.supportsThinking ? { reasoning: { effort: settings.agentReasoningEffort } } : {}),
```

Then check nothing else references the removed names:

```bash
grep -n "MAX_STEPS\|DEFAULT_AGENT_MODEL\|getSetting(" src/lib/agent/v2/route-handler.ts
```

Expected: no output.

- [ ] **Step 6: Run the agent tests**

Run: `./node_modules/.bin/vitest run tests/agent/system-prompt.test.ts tests/agent/prompt-prefs.test.ts tests/agent/v2-route-handler-settings.test.ts tests/agent/v2-route-handler.test.ts`
Expected: PASS (all four files; the existing `v2-route-handler.test.ts` is unchanged and still green).

- [ ] **Step 7: Write the failing form-state test**

Create `tests/settings/form-state.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isDirty, issuesByPath, pickValues } from "@/components/settings/form-state";

describe("form state helpers", () => {
  it("pickValues copies only the requested keys", () => {
    expect(pickValues({ a: 1, b: "x", c: true }, ["a", "c"] as const)).toEqual({ a: 1, c: true });
  });

  it("isDirty compares nested values", () => {
    const initial = { theme: "dark", profile: { brandColors: ["#000000"] } };
    expect(isDirty(initial, { theme: "dark", profile: { brandColors: ["#000000"] } })).toBe(false);
    expect(isDirty(initial, { theme: "dark", profile: { brandColors: ["#000000", "#FFFFFF"] } })).toBe(true);
    expect(isDirty(initial, { theme: "light", profile: { brandColors: ["#000000"] } })).toBe(true);
  });

  it("issuesByPath keeps the first message for each path", () => {
    expect(
      issuesByPath([
        { path: "agentMaxSteps", message: "Entre 5 et 50 étapes" },
        { path: "agentMaxSteps", message: "second" },
        { path: "", message: "Objet de réglages attendu" },
      ]),
    ).toEqual({ agentMaxSteps: "Entre 5 et 50 étapes", "": "Objet de réglages attendu" });
  });
});
```

Run: `./node_modules/.bin/vitest run tests/settings/form-state.test.ts`
Expected: FAIL — `Failed to resolve import "@/components/settings/form-state"`.

- [ ] **Step 8: Implement the form helpers, hook and card**

Create `src/components/settings/form-state.ts`:

```ts
export function pickValues<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) out[key] = source[key];
  return out;
}

/** Values are plain JSON built in schema key order, so a string comparison is exact. */
export function isDirty(initial: unknown, current: unknown): boolean {
  return JSON.stringify(initial) !== JSON.stringify(current);
}

export function issuesByPath(issues: ReadonlyArray<{ path: string; message: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    if (!(issue.path in out)) out[issue.path] = issue.message;
  }
  return out;
}
```

Run: `./node_modules/.bin/vitest run tests/settings/form-state.test.ts`
Expected: PASS (3 tests).

Create `src/components/settings/use-settings-form.ts`:

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SettingsIssue, SettingsValues } from "@/lib/settings-schema";
import { isDirty, issuesByPath, pickValues } from "./form-state";
import { useSettings } from "./use-settings";

export type SettingsForm<K extends keyof SettingsValues> = {
  values: Pick<SettingsValues, K> | null;
  setValue: <F extends K>(key: F, value: SettingsValues[F]) => void;
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  issues: Record<string, string>;
  error: string | null;
  loadError: string | null;
  save: () => Promise<void>;
};

/**
 * Loads the given setting keys, tracks edits against the loaded values and
 * POSTs only those keys. Pass a module-level constant as `keys`.
 */
export function useSettingsForm<K extends keyof SettingsValues>(
  keys: readonly K[],
  options: { onSaved?: (values: Pick<SettingsValues, K>) => void } = {},
): SettingsForm<K> {
  const { settings, loadError } = useSettings();
  const [initial, setInitial] = useState<Pick<SettingsValues, K> | null>(null);
  const [values, setValues] = useState<Pick<SettingsValues, K> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const onSavedRef = useRef(options.onSaved);

  useEffect(() => {
    onSavedRef.current = options.onSaved;
  });

  useEffect(() => {
    if (!settings || initial) return;
    const picked = pickValues(settings, keys) as Pick<SettingsValues, K>;
    setInitial(picked);
    setValues(picked);
  }, [settings, initial, keys]);

  const setValue = useCallback(<F extends K>(key: F, value: SettingsValues[F]) => {
    setValues((prev) => (prev ? ({ ...prev, [key]: value } as Pick<SettingsValues, K>) : prev));
    setSaved(false);
  }, []);

  const save = useCallback(async () => {
    if (!values) return;
    setSaving(true);
    setError(null);
    setIssues({});
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (res.status === 400) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; issues?: SettingsIssue[] };
        const byPath = issuesByPath(body.issues ?? []);
        const general = byPath[""];
        delete byPath[""];
        setIssues(byPath);
        if (general || Object.keys(byPath).length === 0) setError(general ?? body.error ?? "Réglages invalides.");
        return;
      }
      if (!res.ok) {
        setError(`Échec de l'enregistrement (HTTP ${res.status}).`);
        return;
      }
      setInitial(values);
      onSavedRef.current?.(values);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Échec de l'enregistrement — vérifie ta connexion.");
    } finally {
      setSaving(false);
    }
  }, [values]);

  return {
    values,
    setValue,
    dirty: values !== null && initial !== null && isDirty(initial, values),
    saving,
    saved,
    issues,
    error,
    loadError,
    save,
  };
}
```

Create `src/components/settings/SettingsFormCard.tsx`:

```tsx
"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type FormLike<V> = {
  values: V | null;
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
  loadError: string | null;
  save: () => Promise<void>;
};

export default function SettingsFormCard<V>({
  title,
  description,
  form,
  children,
}: {
  title: string;
  description: string;
  form: FormLike<V>;
  children: (values: V) => React.ReactNode;
}) {
  return (
    <Card>
      {/* noValidate: bounds are enforced by the server so its French issue messages show under the fields. */}
      <form
        className="contents"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.save();
        }}
      >
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {form.loadError ? (
            <Alert variant="destructive">
              <AlertDescription>{form.loadError}</AlertDescription>
            </Alert>
          ) : form.values === null ? (
            <div className="grid gap-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-8 w-1/2" />
            </div>
          ) : (
            children(form.values)
          )}
          {form.error && (
            <Alert variant="destructive">
              <AlertDescription>{form.error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="gap-3">
          <Button type="submit" disabled={!form.dirty || form.saving}>
            {form.saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
          {form.saved && <span className="text-sm text-muted-foreground">Enregistré</span>}
        </CardFooter>
      </form>
    </Card>
  );
}
```

- [ ] **Step 9: Create the Agent section and page**

Create `src/components/settings/AgentSection.tsx`:

```tsx
"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AGENT_MODELS, getModelById } from "@/lib/agent/models";
import { LANGUAGES, REASONING_EFFORTS, type ReasoningEffort } from "@/lib/settings-schema";
import FieldError from "./FieldError";
import SettingsFormCard from "./SettingsFormCard";
import { useSettingsForm } from "./use-settings-form";

const KEYS = [
  "agentModel",
  "agentWebSearch",
  "agentReasoningEffort",
  "agentMaxSteps",
  "agentAutoTitle",
  "agentResponseLanguage",
] as const;

const MODEL_ITEMS = AGENT_MODELS.map((model) => ({
  value: model.id,
  label: `${model.label} — ${model.pricing.inputPerM} $ / ${model.pricing.outputPerM} $ par million de tokens`,
}));

const LANGUAGE_ITEMS = LANGUAGES.map((language) => ({ value: language.code, label: language.label }));

const EFFORT_LABELS: Record<ReasoningEffort, string> = { low: "Faible", medium: "Moyen", high: "Élevé" };

export default function AgentSection() {
  const form = useSettingsForm(KEYS);

  return (
    <SettingsFormCard title="Agent IA" description="Le modèle et le comportement de l'agent du chat." form={form}>
      {(values) => {
        const supportsThinking = getModelById(values.agentModel)?.supportsThinking ?? false;
        return (
          <>
            <div className="grid gap-2">
              <Label htmlFor="agent-model">Modèle</Label>
              <Select
                items={MODEL_ITEMS}
                value={values.agentModel}
                onValueChange={(value) => {
                  if (value) form.setValue("agentModel", value);
                }}
              >
                <SelectTrigger id="agent-model" className="w-full" aria-invalid={Boolean(form.issues.agentModel)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={form.issues.agentModel} />
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="grid gap-1">
                <Label htmlFor="agent-web-search">Recherche web automatique</Label>
                <p className="text-sm text-muted-foreground">
                  L&apos;agent consulte le web avant de répondre (variante « :online » d&apos;OpenRouter).
                </p>
              </div>
              <Switch
                id="agent-web-search"
                checked={values.agentWebSearch}
                onCheckedChange={(checked) => form.setValue("agentWebSearch", checked)}
              />
            </div>

            <div className="grid gap-2">
              <Label>Effort de réflexion</Label>
              <ToggleGroup
                variant="outline"
                aria-label="Effort de réflexion"
                disabled={!supportsThinking}
                value={[values.agentReasoningEffort]}
                onValueChange={(value) => {
                  const next = REASONING_EFFORTS.find((effort) => effort === value[0]);
                  if (next) form.setValue("agentReasoningEffort", next);
                }}
              >
                {REASONING_EFFORTS.map((effort) => (
                  <ToggleGroupItem key={effort} value={effort}>
                    {EFFORT_LABELS[effort]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-sm text-muted-foreground">
                {supportsThinking
                  ? "Plus l'effort est élevé, plus l'agent réfléchit avant de répondre : plus lent et plus cher."
                  : "Ce modèle ne prend pas en charge la réflexion : ce réglage est ignoré tant qu'il est sélectionné."}
              </p>
              <FieldError message={form.issues.agentReasoningEffort} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="agent-max-steps">Étapes max par réponse</Label>
              <Input
                id="agent-max-steps"
                type="number"
                min={5}
                max={50}
                step={1}
                className="w-24"
                value={Number.isFinite(values.agentMaxSteps) ? values.agentMaxSteps : ""}
                onChange={(event) => form.setValue("agentMaxSteps", event.target.valueAsNumber)}
                aria-invalid={Boolean(form.issues.agentMaxSteps)}
              />
              <p className="text-sm text-muted-foreground">
                Nombre maximal d&apos;appels d&apos;outils enchaînés par l&apos;agent dans une réponse (5 à 50).
              </p>
              <FieldError message={form.issues.agentMaxSteps} />
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="grid gap-1">
                <Label htmlFor="agent-auto-title">Titre automatique des conversations</Label>
                <p className="text-sm text-muted-foreground">
                  Nomme chaque nouvelle conversation d&apos;après ton premier message.
                </p>
              </div>
              <Switch
                id="agent-auto-title"
                checked={values.agentAutoTitle}
                onCheckedChange={(checked) => form.setValue("agentAutoTitle", checked)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="agent-language">Langue des réponses</Label>
              <Select
                items={LANGUAGE_ITEMS}
                value={values.agentResponseLanguage}
                onValueChange={(value) => {
                  const next = LANGUAGE_ITEMS.find((item) => item.value === value);
                  if (next) form.setValue("agentResponseLanguage", next.value);
                }}
              >
                <SelectTrigger id="agent-language" className="w-full sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={form.issues.agentResponseLanguage} />
            </div>
          </>
        );
      }}
    </SettingsFormCard>
  );
}
```

Create `src/app/reglages/agent/page.tsx`:

```tsx
import AgentSection from "@/components/settings/AgentSection";

export const metadata = { title: "Agent IA · Réglages · ThumbGen" };

export default function AgentPage() {
  return <AgentSection />;
}
```

- [ ] **Step 10: Type-check and full suite**

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run`
Expected: `tsc` exits 0; all tests pass.

- [ ] **Step 11: Check in the browser (throwaway dev server on port 3100)**

Open `http://localhost:3100/reglages/agent`:
- « Enregistrer » is disabled on load; change « Étapes max » to 12 → enabled; save → « Enregistré » for ~2 s and the button is disabled again; reload → 12.
- Type 60 and save → « Entre 5 et 50 étapes » under the field, nothing saved.
- Choose « GPT-5 » → the effort toggle is disabled with the explanation; choose a Claude model → enabled again.
- The model select trigger shows the label with prices, not the raw id.

- [ ] **Step 12: Commit**

```bash
git add src/lib/agent/prompt-prefs.ts src/lib/agent/system-prompt.ts src/lib/agent/v2/route-handler.ts src/components/settings/form-state.ts src/components/settings/use-settings-form.ts src/components/settings/SettingsFormCard.tsx src/components/settings/AgentSection.tsx src/app/reglages/agent/page.tsx tests/agent/system-prompt.test.ts tests/agent/prompt-prefs.test.ts tests/agent/v2-route-handler-settings.test.ts tests/settings/form-state.test.ts
git commit -m "feat(reglages): agent section driving reasoning effort, step limit, auto-title and reply language"
```

---

## Task 7: Génération d'images — resolution in the image route, new-node defaults, section

**Files:**
- Modify: `src/app/api/generate/openrouter/route.ts`
- Modify: `src/store/canvas-store.ts` (type of `imageSize`)
- Modify: `src/components/nodes/GeneratorNode.tsx` (send `imageSize`, working 1K/2K/4K selector)
- Modify: `src/components/Canvas.tsx` — **rebase onto latest `main` and re-read the file first**
- Modify: `src/components/panels/AppSidebar.tsx`
- Create: `src/lib/generator-defaults.ts`, `src/hooks/useGeneratorDefaults.ts`
- Create: `src/components/settings/GenerationSection.tsx`, `src/app/reglages/generation/page.tsx`
- Create: `tests/settings/openrouter-resolution.test.ts`, `tests/settings/generator-defaults.test.ts`

**Interfaces:**
- Consumes: `IMAGE_MODELS`, `IMAGE_MODEL_GROUPS`, `IMAGE_RESOLUTIONS`, `isImageResolution`, `ImageResolution`, `DEFAULT_IMAGE_MODEL` (Task 1); `getTypedSettings`, `updateSettings`, `setSetting`, `ASPECT_RATIOS`, `AspectRatio`, `LANGUAGES`, `SettingsResponse` (Task 2); `useSettingsForm`, `SettingsFormCard`, `FieldError` (Tasks 5–6).
- Produces:
  - `/api/generate/openrouter` body accepts `imageSize?: "1K" | "2K" | "4K"`; sends `resolution = imageSize` if valid, else the `defaultResolution` setting.
  - `NodeData.imageSize?: ImageResolution`
  - `type GeneratorDefaults = Required<Pick<NodeData, "model" | "aspectRatio" | "numImages" | "imageSize">>`, `FALLBACK_GENERATOR_DEFAULTS`, `generatorDefaultsFromSettings(settings): GeneratorDefaults`
  - `useGeneratorDefaults(): GeneratorDefaults` (client hook)

- [ ] **Step 1: Write the failing tests**

Create `tests/settings/openrouter-resolution.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getDb } from "@/lib/db";
import { setSetting, updateSettings } from "@/lib/settings";
import { POST } from "@/app/api/generate/openrouter/route";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  getDb().exec("DELETE FROM settings");
  setSetting("openrouterApiKey", "test-key");
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [], usage: {} }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function sentBody(extra: Record<string, unknown>): Promise<{ resolution: string; model: string }> {
  const res = await POST(
    new Request("http://localhost/api/generate/openrouter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "Une miniature", model: "gemini-3.1-flash-image", ...extra }),
    }) as never,
  );
  expect(res.status).toBe(200);
  return JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
}

describe("/api/generate/openrouter resolution", () => {
  it("uses the node's imageSize", async () => {
    updateSettings({ defaultResolution: "4K" });
    expect((await sentBody({ imageSize: "1K" })).resolution).toBe("1K");
  });

  it("falls back to defaultResolution when the node has none", async () => {
    updateSettings({ defaultResolution: "4K" });
    expect((await sentBody({})).resolution).toBe("4K");
  });

  it("falls back to defaultResolution (2K by default) for an unknown size", async () => {
    expect((await sentBody({ imageSize: "8K" })).resolution).toBe("2K");
  });

  it("still maps the model id to its OpenRouter slug", async () => {
    expect((await sentBody({})).model).toBe("google/gemini-3.1-flash-image");
  });
});
```

Create `tests/settings/generator-defaults.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { FALLBACK_GENERATOR_DEFAULTS, generatorDefaultsFromSettings } from "@/lib/generator-defaults";

describe("generator defaults", () => {
  it("maps the Génération settings to new generator node data", () => {
    expect(
      generatorDefaultsFromSettings({
        favoriteModel: "gpt-image-2",
        defaultAspectRatio: "9x16",
        defaultImageCount: 3,
        defaultResolution: "4K",
      }),
    ).toEqual({ model: "gpt-image-2", aspectRatio: "9x16", numImages: 3, imageSize: "4K" });
  });

  it("uses the schema defaults until the settings are loaded", () => {
    expect(FALLBACK_GENERATOR_DEFAULTS).toEqual({
      model: "gemini-3.1-flash-image",
      aspectRatio: "16x9",
      numImages: 1,
      imageSize: "2K",
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `./node_modules/.bin/vitest run tests/settings/openrouter-resolution.test.ts tests/settings/generator-defaults.test.ts`
Expected: FAIL — resolution assertions receive `"2K"` for the first two tests, and `Failed to resolve import "@/lib/generator-defaults"`.

- [ ] **Step 3: Resolve the resolution in the image route**

In `src/app/api/generate/openrouter/route.ts`:

1. Replace

```ts
import { getSetting } from "@/lib/settings";
```

with

```ts
import { getTypedSettings } from "@/lib/settings";
import { isImageResolution } from "@/lib/image-models";
```

2. Replace

```ts
    const OPENROUTER_API_KEY = getSetting("openrouterApiKey");
```

with

```ts
    const settings = getTypedSettings();
    const OPENROUTER_API_KEY = settings.openrouterApiKey;
```

3. Replace

```ts
      model: requestedModel,
      projectId = null,
    } = body;
```

with

```ts
      model: requestedModel,
      imageSize,
      projectId = null,
    } = body;
```

4. Replace

```ts
    modelUsed = model;
    promptForLog = prompt || null;
```

with

```ts
    modelUsed = model;
    promptForLog = prompt || null;
    // A node without its own resolution (older nodes, agent-built workflows)
    // uses the Réglages default instead of a hard-coded 2K.
    const resolution = isImageResolution(imageSize) ? imageSize : settings.defaultResolution;
```

5. Replace

```ts
        resolution: "2K",
```

with

```ts
        resolution,
```

- [ ] **Step 4: Create the defaults mapping**

Create `src/lib/generator-defaults.ts`:

```ts
import { DEFAULT_IMAGE_MODEL } from "@/lib/image-models";
import type { SettingsResponse } from "@/lib/settings-schema";
import type { NodeData } from "@/store/canvas-store";

export type GeneratorDefaults = Required<Pick<NodeData, "model" | "aspectRatio" | "numImages" | "imageSize">>;

/** Same values as the schema defaults, used until GET /api/settings answers. */
export const FALLBACK_GENERATOR_DEFAULTS: GeneratorDefaults = {
  model: DEFAULT_IMAGE_MODEL,
  aspectRatio: "16x9",
  numImages: 1,
  imageSize: "2K",
};

export function generatorDefaultsFromSettings(
  settings: Pick<SettingsResponse, "favoriteModel" | "defaultAspectRatio" | "defaultImageCount" | "defaultResolution">,
): GeneratorDefaults {
  return {
    model: settings.favoriteModel,
    aspectRatio: settings.defaultAspectRatio,
    numImages: settings.defaultImageCount,
    imageSize: settings.defaultResolution,
  };
}
```

In `src/store/canvas-store.ts`, add at the top of the imports:

```ts
import type { ImageResolution } from "@/lib/image-models";
```

and replace

```ts
  imageSize?: "2K" | "4K"; // Gemini output resolution
```

with

```ts
  imageSize?: ImageResolution; // output resolution; unset → the defaultResolution setting
```

- [ ] **Step 5: Run the tests**

Run: `./node_modules/.bin/vitest run tests/settings/openrouter-resolution.test.ts tests/settings/generator-defaults.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Create the client hook**

Create `src/hooks/useGeneratorDefaults.ts`:

```ts
"use client";

import { useEffect, useState } from "react";
import {
  FALLBACK_GENERATOR_DEFAULTS,
  generatorDefaultsFromSettings,
  type GeneratorDefaults,
} from "@/lib/generator-defaults";
import type { SettingsResponse } from "@/lib/settings-schema";

/** Data for generator nodes created from the canvas UI, from the Génération settings. */
export function useGeneratorDefaults(): GeneratorDefaults {
  const [defaults, setDefaults] = useState<GeneratorDefaults>(FALLBACK_GENERATOR_DEFAULTS);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((res) => (res.ok ? (res.json() as Promise<SettingsResponse>) : null))
      .then((settings) => {
        if (settings && !cancelled) setDefaults(generatorDefaultsFromSettings(settings));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return defaults;
}
```

- [ ] **Step 7: Make GeneratorNode send and edit the resolution**

In `src/components/nodes/GeneratorNode.tsx`:

1. Replace

```tsx
import { IMAGE_MODELS } from "@/lib/image-models";
```

with

```tsx
import { IMAGE_MODELS, IMAGE_RESOLUTIONS } from "@/lib/image-models";
```

2. In `generateWithModel`, replace

```tsx
      aspectRatio,
      model: targetModel,
```

with

```tsx
      aspectRatio,
      model: targetModel,
      // Unset on older and agent-built nodes: the route then uses defaultResolution.
      imageSize: data.imageSize,
```

3. Replace the resolution block, which never rendered (every model's provider is `"openrouter"`):

```tsx
        {provider === "gemini" && (
          <div>
            <label className="text-xs block mb-1.5" style={{ color: "var(--text-muted)" }}>Résolution</label>
            <div className="flex gap-1">
              {(["2K", "4K"] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => updateNodeData(id, { imageSize: size })}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all nopan nodrag"
                  style={{
                    background: (data.imageSize || "2K") === size ? "var(--canvas-accent)" : "var(--surface)",
                    color: (data.imageSize || "2K") === size ? "var(--canvas-bg)" : "var(--text-muted)",
                  }}
                >
                  {size}{size === "4K" ? " (Pro)" : ""}
                </button>
              ))}
            </div>
          </div>
        )}
```

with

```tsx
        <div>
          <label className="text-xs block mb-1.5 text-(--text-muted)">
            Résolution{data.imageSize ? "" : " · réglage par défaut"}
          </label>
          <div className="flex gap-1">
            {IMAGE_RESOLUTIONS.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => updateNodeData(id, { imageSize: size })}
                className={cn(
                  "flex-1 py-1.5 rounded-lg text-xs font-medium transition-all nopan nodrag",
                  data.imageSize === size ? "bg-(--canvas-accent) text-(--canvas-bg)" : "bg-(--surface) text-(--text-muted)",
                )}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
```

- [ ] **Step 8: Apply the defaults to generator nodes created from the canvas UI**

Rebase onto the latest `main` and re-read `src/components/Canvas.tsx`. Then:

1. Add the import next to `import { useCanvasSync } from "@/hooks/useCanvasSync";`:

```tsx
import { useGeneratorDefaults } from "@/hooks/useGeneratorDefaults";
```

2. Replace (the version left by Task 1)

```tsx
  const [favoriteModel, setFavoriteModel] = useState("gemini-3.1-flash-image");

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((s) => {
      if (s.favoriteModel) setFavoriteModel(s.favoriteModel);
    }).catch(() => {});
  }, []);
```

with

```tsx
  const generatorDefaults = useGeneratorDefaults();
```

3. In `onDrop`, replace

```tsx
      addNode(type, position, data);
    },
    [screenToFlowPosition, addNode]
```

with

```tsx
      // A generator dragged from the sidebar carries only its model; the
      // Génération settings fill in format, count and resolution.
      addNode(type, position, type === "generator" ? { ...generatorDefaults, ...data } : data);
    },
    [screenToFlowPosition, addNode, generatorDefaults]
```

4. Replace

```tsx
            { label: "Générateur", icon: STAR_ICON("var(--canvas-accent-yellow)", true), onClick: () => addNode("generator", contextMenu.flowPos, { model: favoriteModel }) },
```

with

```tsx
            { label: "Générateur", icon: STAR_ICON("var(--canvas-accent-yellow)", true), onClick: () => addNode("generator", contextMenu.flowPos, { ...generatorDefaults }) },
```

5. Replace

```tsx
                { label: "Générateur", icon: STAR_ICON("var(--canvas-accent-yellow)", true), onClick: () => addConnectedNode("generator", { model: favoriteModel }) },
```

with

```tsx
                { label: "Générateur", icon: STAR_ICON("var(--canvas-accent-yellow)", true), onClick: () => addConnectedNode("generator", { ...generatorDefaults }) },
```

Then verify:

```bash
grep -n "favoriteModel" src/components/Canvas.tsx
```

Expected: no output. (`useState` and `useEffect` stay imported: the context-menu state and the project-loading effect still use them.)

In `src/components/panels/AppSidebar.tsx`:

1. Add the import after `import { useReactFlow } from "@xyflow/react";`:

```tsx
import { useGeneratorDefaults } from "@/hooks/useGeneratorDefaults";
```

2. Replace

```tsx
  const addNode = useCanvasStore((s) => s.addNode);
```

with

```tsx
  const addNode = useCanvasStore((s) => s.addNode);
  const generatorDefaults = useGeneratorDefaults();
```

3. Replace

```tsx
                      onClick={() => addAtCenter("generator", { model: m.id })}
```

with

```tsx
                      onClick={() => addAtCenter("generator", { ...generatorDefaults, model: m.id })}
```

(The drag payload `{ model: m.id }` stays: `Canvas.onDrop` now merges the defaults.)

- [ ] **Step 9: Create the Génération section and page**

Create `src/components/settings/GenerationSection.tsx`:

```tsx
"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { IMAGE_MODEL_GROUPS, IMAGE_MODELS } from "@/lib/image-models";
import { ASPECT_RATIOS, IMAGE_RESOLUTIONS, LANGUAGES, type AspectRatio } from "@/lib/settings-schema";
import FieldError from "./FieldError";
import SettingsFormCard from "./SettingsFormCard";
import { useSettingsForm } from "./use-settings-form";

const KEYS = ["favoriteModel", "defaultAspectRatio", "defaultImageCount", "defaultResolution", "language"] as const;

const MODEL_ITEMS = IMAGE_MODELS.map((model) => ({ value: model.id, label: model.label }));
const LANGUAGE_ITEMS = LANGUAGES.map((language) => ({ value: language.code, label: language.label }));
const ASPECT_LABELS: Record<AspectRatio, string> = { "16x9": "16:9", "9x16": "9:16", "1x1": "1:1" };
const IMAGE_COUNTS = [1, 2, 3, 4] as const;

export default function GenerationSection() {
  const form = useSettingsForm(KEYS);

  return (
    <SettingsFormCard
      title="Génération d'images"
      description="Réglages de départ des nœuds Générateur créés depuis le canvas. Les workflows posés par l'agent gardent leurs propres choix."
      form={form}
    >
      {(values) => (
        <>
          <div className="grid gap-2">
            <Label htmlFor="generation-model">Modèle par défaut</Label>
            <Select
              items={MODEL_ITEMS}
              value={values.favoriteModel}
              onValueChange={(value) => {
                if (value) form.setValue("favoriteModel", value);
              }}
            >
              <SelectTrigger id="generation-model" className="w-full sm:w-80" aria-invalid={Boolean(form.issues.favoriteModel)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IMAGE_MODEL_GROUPS.map((group) => (
                  <SelectGroup key={group}>
                    <SelectLabel>{group}</SelectLabel>
                    {IMAGE_MODELS.filter((model) => model.group === group).map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              L&apos;étoile d&apos;un nœud Générateur modifie aussi ce réglage.
            </p>
            <FieldError message={form.issues.favoriteModel} />
          </div>

          <div className="grid gap-2">
            <Label>Format par défaut</Label>
            <ToggleGroup
              variant="outline"
              aria-label="Format par défaut"
              value={[values.defaultAspectRatio]}
              onValueChange={(value) => {
                const next = ASPECT_RATIOS.find((ratio) => ratio === value[0]);
                if (next) form.setValue("defaultAspectRatio", next);
              }}
            >
              {ASPECT_RATIOS.map((ratio) => (
                <ToggleGroupItem key={ratio} value={ratio}>
                  {ASPECT_LABELS[ratio]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldError message={form.issues.defaultAspectRatio} />
          </div>

          <div className="grid gap-2">
            <Label>Nombre d&apos;images par défaut</Label>
            <ToggleGroup
              variant="outline"
              aria-label="Nombre d'images par défaut"
              value={[String(values.defaultImageCount)]}
              onValueChange={(value) => {
                const next = IMAGE_COUNTS.find((count) => String(count) === value[0]);
                if (next) form.setValue("defaultImageCount", next);
              }}
            >
              {IMAGE_COUNTS.map((count) => (
                <ToggleGroupItem key={count} value={String(count)}>
                  {count}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldError message={form.issues.defaultImageCount} />
          </div>

          <div className="grid gap-2">
            <Label>Résolution par défaut</Label>
            <ToggleGroup
              variant="outline"
              aria-label="Résolution par défaut"
              value={[values.defaultResolution]}
              onValueChange={(value) => {
                const next = IMAGE_RESOLUTIONS.find((size) => size === value[0]);
                if (next) form.setValue("defaultResolution", next);
              }}
            >
              {IMAGE_RESOLUTIONS.map((size) => (
                <ToggleGroupItem key={size} value={size}>
                  {size}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p className="text-sm text-muted-foreground">
              Aussi utilisée par les nœuds qui n&apos;ont pas choisi leur propre résolution.
            </p>
            <FieldError message={form.issues.defaultResolution} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="generation-language">Langue du texte sur les miniatures</Label>
            <Select
              items={LANGUAGE_ITEMS}
              value={values.language}
              onValueChange={(value) => {
                const next = LANGUAGE_ITEMS.find((item) => item.value === value);
                if (next) form.setValue("language", next.value);
              }}
            >
              <SelectTrigger id="generation-language" className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Utilisée par « Améliorer le prompt » et par l&apos;agent pour le texte placé sur les miniatures.
            </p>
            <FieldError message={form.issues.language} />
          </div>
        </>
      )}
    </SettingsFormCard>
  );
}
```

Create `src/app/reglages/generation/page.tsx`:

```tsx
import GenerationSection from "@/components/settings/GenerationSection";

export const metadata = { title: "Génération d'images · Réglages · ThumbGen" };

export default function GenerationPage() {
  return <GenerationSection />;
}
```

- [ ] **Step 10: Type-check and full suite**

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run`
Expected: `tsc` exits 0; all tests pass.

- [ ] **Step 11: Check in the browser (throwaway dev server on port 3100)**

- `http://localhost:3100/reglages/generation`: set Format 9:16, Nombre 3, Résolution 4K, save, reload → values kept; the model trigger shows a label.
- Open `http://localhost:3100/miniatures`, create a project, then on its canvas: right-click → « Générateur » → the node shows 9:16, 3 images, 4K highlighted. Click « Modèles d'image » in the sidebar and click a model → the new node has the clicked model with 9:16 / 3 / 4K.
- An existing node without `imageSize` shows « Résolution · réglage par défaut » with no size highlighted.

- [ ] **Step 12: Commit**

```bash
git add src/app/api/generate/openrouter/route.ts src/store/canvas-store.ts src/components/nodes/GeneratorNode.tsx src/components/Canvas.tsx src/components/panels/AppSidebar.tsx src/lib/generator-defaults.ts src/hooks/useGeneratorDefaults.ts src/components/settings/GenerationSection.tsx src/app/reglages/generation/page.tsx tests/settings/openrouter-resolution.test.ts tests/settings/generator-defaults.test.ts
git commit -m "feat(reglages): generation defaults for new generator nodes and a working resolution choice"
```

---

## Task 8: Ma chaîne — `<channel_profile>` system block and section

**Files:**
- Modify: `src/lib/agent/system-prompt.ts`
- Rewrite: `src/lib/agent/prompt-prefs.ts`
- Rewrite: `tests/agent/system-prompt.test.ts`, `tests/agent/prompt-prefs.test.ts`
- Create: `src/components/settings/ChaineSection.tsx`, `src/app/reglages/chaine/page.tsx`

**Interfaces:**
- Consumes: `ChannelProfile`, `EMPTY_CHANNEL_PROFILE`, `BRAND_COLOR_PATTERN` (Task 2); `AgentPromptPrefs`, `buildResponseLanguageBlock`, `buildSystemMessages` (Task 6); `useSettingsForm`, `SettingsFormCard`, `FieldError` (Tasks 5–6); `GET /api/personas` → `Array<{ id: string; label: string; angles: string[] }>`.
- Produces:
  - `AgentPromptPrefs` gains `youtubeChannel: string`, `channelProfile: ChannelProfile`, `defaultPersona: { id: string; label: string } | null`
  - `buildChannelProfileBlock(prefs: Pick<AgentPromptPrefs, "youtubeChannel" | "channelProfile" | "defaultPersona">): string | null`
  - `buildSystemMessages` block order: cached static prompt, `<response_language>`, `<channel_profile>` (only when a field is filled), `<project_id>` (optional), `<canvas_state>`.

- [ ] **Step 1: Write the failing tests**

Replace the whole content of `tests/agent/system-prompt.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import {
  AGENT_SYSTEM_PROMPT,
  DEFAULT_AGENT_PROMPT_PREFS,
  buildChannelProfileBlock,
  buildResponseLanguageBlock,
  buildSystemMessages,
  type AgentPromptPrefs,
} from "@/lib/agent/system-prompt";
import { EMPTY_CHANNEL_PROFILE } from "@/lib/settings-schema";

const PROFILE_PREFS: AgentPromptPrefs = {
  ...DEFAULT_AGENT_PROMPT_PREFS,
  youtubeChannel: "https://www.youtube.com/@demo",
  channelProfile: {
    ...EMPTY_CHANNEL_PROFILE,
    name: "Demo Tech",
    niche: "IA générative",
    tone: "Direct, un peu d'humour",
    brandColors: ["#E6007E", "#111111"],
    defaultPersonaId: "p1",
    agentInstructions: "Toujours un visage expressif.",
  },
  defaultPersona: { id: "p1", label: "Antoine" },
};

/** Index of the first per-turn block (never the cached one) starting with the tag. */
function blockIndex(blocks: Array<{ text: string; cache_control?: unknown }>, tag: string): number {
  return blocks.findIndex((block) => block.cache_control === undefined && block.text.startsWith(tag));
}

describe("system prompt", () => {
  it("contains the persona and the canvas_state instruction", () => {
    expect(AGENT_SYSTEM_PROMPT).toContain("ThumbGen Brainstorm");
    expect(AGENT_SYSTEM_PROMPT).toContain("<canvas_state>");
  });

  it("no longer hard-codes French as the reply language", () => {
    expect(AGENT_SYSTEM_PROMPT).not.toContain("French is the user's preferred language");
  });

  it("returns the cached persona block, the language block, then the canvas block", () => {
    const blocks = buildSystemMessages({ nodes: [], edges: [] });
    expect(blocks).toHaveLength(3);
    expect(blocks[0].cache_control).toEqual({ type: "ephemeral" });
    expect(blocks[1].text.startsWith("<response_language>")).toBe(true);
    expect(blocks[1].cache_control).toBeUndefined();
    expect(blocks[2].cache_control).toBeUndefined();
    expect(blocks[2].text).toContain("<canvas_state>");
    expect(blocks[2].text).toContain('"nodes": []');
  });

  it("snapshot serialization preserves node ids", () => {
    const blocks = buildSystemMessages({
      nodes: [{ id: "p-1", type: "prompt", summary: { prompt: "hi" } }],
      edges: [],
    });
    expect(blocks.at(-1)!.text).toContain('"id": "p-1"');
  });

  it("injects project_id between the language block and canvas_state", () => {
    const blocks = buildSystemMessages({ nodes: [], edges: [] }, "proj-abc");
    expect(blocks).toHaveLength(4);
    expect(blocks[1].text.startsWith("<response_language>")).toBe(true);
    expect(blocks[2].text).toContain("<project_id>proj-abc</project_id>");
    expect(blocks[2].text).toMatch(/Pass it as the `project_id` argument/);
    expect(blocks[3].text).toContain("<canvas_state>");
  });

  it("omits the project_id block when no projectId given", () => {
    const blocks = buildSystemMessages({ nodes: [], edges: [] });
    expect(blocks.some((b) => b.text.includes("<project_id>"))).toBe(false);
  });

  it("defaults both languages to French", () => {
    const text = buildSystemMessages({ nodes: [], edges: [] })[1].text;
    expect(text).toContain("Reply to the user in French");
    expect(text).toContain("on the thumbnails themselves");
  });

  it("names the reply language and the thumbnail text language separately", () => {
    const text = buildResponseLanguageBlock({ ...DEFAULT_AGENT_PROMPT_PREFS, responseLanguage: "en", thumbnailLanguage: "es" });
    expect(text).toContain("Reply to the user in English");
    expect(text).toMatch(/on the thumbnails themselves .* in Spanish\./);
  });
});

describe("<channel_profile>", () => {
  it("is absent when the profile is empty", () => {
    expect(buildChannelProfileBlock(DEFAULT_AGENT_PROMPT_PREFS)).toBeNull();
    const blocks = buildSystemMessages({ nodes: [], edges: [] }, "proj-abc");
    expect(blocks.some((b) => b.text.includes("<channel_profile>"))).toBe(false);
  });

  it("sits after the cached prompt and the language block, before project_id and canvas_state", () => {
    const blocks = buildSystemMessages({ nodes: [], edges: [] }, "proj-abc", PROFILE_PREFS);
    expect(blocks).toHaveLength(5);
    expect(blocks[0].cache_control).toEqual({ type: "ephemeral" });
    const profile = blockIndex(blocks, "<channel_profile>");
    expect(profile).toBeGreaterThan(blockIndex(blocks, "<response_language>"));
    expect(profile).toBeLessThan(blockIndex(blocks, "<project_id>"));
    expect(blockIndex(blocks, "<project_id>")).toBeLessThan(blockIndex(blocks, "<canvas_state>"));
  });

  it("lists only the filled fields", () => {
    const text = buildChannelProfileBlock(PROFILE_PREFS)!;
    expect(text).toContain("- Channel name: Demo Tech");
    expect(text).toContain("- YouTube channel: https://www.youtube.com/@demo");
    expect(text).toContain("- Niche / topic: IA générative");
    expect(text).toContain("- Tone and style: Direct, un peu d'humour");
    expect(text).toContain("- Brand colors: #E6007E, #111111");
    expect(text).toContain("Toujours un visage expressif.");
    expect(text).not.toContain("Target audience");
  });

  it("tells the agent to use the default persona as faceReference", () => {
    const text = buildChannelProfileBlock(PROFILE_PREFS)!;
    expect(text).toContain('"Antoine"');
    expect(text).toContain("stored:persona_p1");
    expect(text).toContain("faceReference");
  });

  it("omits the persona line when the persona no longer exists", () => {
    const text = buildChannelProfileBlock({ ...PROFILE_PREFS, defaultPersona: null })!;
    expect(text).not.toContain("stored:persona_");
    expect(text).toContain("- Channel name: Demo Tech");
  });

  it("counts the YouTube channel alone as a filled field", () => {
    expect(buildChannelProfileBlock({ ...DEFAULT_AGENT_PROMPT_PREFS, youtubeChannel: "@demo" })).toContain(
      "- YouTube channel: @demo",
    );
  });
});
```

Replace the whole content of `tests/agent/prompt-prefs.test.ts` with:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "@/lib/db";
import { updateSettings } from "@/lib/settings";
import { EMPTY_CHANNEL_PROFILE } from "@/lib/settings-schema";
import { loadAgentPromptPrefs } from "@/lib/agent/prompt-prefs";

beforeEach(() => {
  getDb().exec("DELETE FROM settings");
});

describe("loadAgentPromptPrefs", () => {
  it("returns French and an empty profile by default", () => {
    expect(loadAgentPromptPrefs()).toEqual({
      responseLanguage: "fr",
      thumbnailLanguage: "fr",
      youtubeChannel: "",
      channelProfile: EMPTY_CHANNEL_PROFILE,
      defaultPersona: null,
    });
  });

  it("reads agentResponseLanguage and the thumbnail language setting", () => {
    updateSettings({ agentResponseLanguage: "en", language: "de" });
    const prefs = loadAgentPromptPrefs();
    expect(prefs.responseLanguage).toBe("en");
    expect(prefs.thumbnailLanguage).toBe("de");
  });

  it("resolves the default persona and the channel fields", () => {
    getDb().prepare("INSERT OR IGNORE INTO personas (id, label) VALUES (?, ?)").run("persona-prefs-1", "Antoine");
    updateSettings({ youtubePlaylistId: "@demo", channelProfile: { name: "Demo", defaultPersonaId: "persona-prefs-1" } });
    const prefs = loadAgentPromptPrefs();
    expect(prefs.youtubeChannel).toBe("@demo");
    expect(prefs.channelProfile.name).toBe("Demo");
    expect(prefs.defaultPersona).toEqual({ id: "persona-prefs-1", label: "Antoine" });
  });

  it("drops a default persona deleted since it was chosen", () => {
    getDb().prepare("INSERT OR IGNORE INTO personas (id, label) VALUES (?, ?)").run("persona-prefs-2", "Ancien");
    updateSettings({ channelProfile: { defaultPersonaId: "persona-prefs-2" } });
    getDb().prepare("DELETE FROM personas WHERE id = ?").run("persona-prefs-2");
    const prefs = loadAgentPromptPrefs();
    expect(prefs.channelProfile.defaultPersonaId).toBe("persona-prefs-2");
    expect(prefs.defaultPersona).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `./node_modules/.bin/vitest run tests/agent/system-prompt.test.ts tests/agent/prompt-prefs.test.ts`
Expected: FAIL — `buildChannelProfileBlock` is not exported; `loadAgentPromptPrefs()` lacks `youtubeChannel`, `channelProfile`, `defaultPersona`.

- [ ] **Step 3: Add the channel profile block**

In `src/lib/agent/system-prompt.ts`:

1. Replace

```ts
import { LANGUAGES, type LanguageCode } from "@/lib/settings-schema";
```

with

```ts
import { EMPTY_CHANNEL_PROFILE, LANGUAGES, type ChannelProfile, type LanguageCode } from "@/lib/settings-schema";
```

2. Replace everything from the line `// ── Per-turn system blocks (built from Réglages) ──` to the end of the file with:

```ts
// ── Per-turn system blocks (built from Réglages) ──

/** What the agent's per-turn system blocks need from the settings. */
export type AgentPromptPrefs = {
  responseLanguage: LanguageCode;
  thumbnailLanguage: LanguageCode;
  youtubeChannel: string;
  channelProfile: ChannelProfile;
  /** The profile's default persona; null when unset or deleted since. */
  defaultPersona: { id: string; label: string } | null;
};

export const DEFAULT_AGENT_PROMPT_PREFS: AgentPromptPrefs = {
  responseLanguage: "fr",
  thumbnailLanguage: "fr",
  youtubeChannel: "",
  channelProfile: EMPTY_CHANNEL_PROFILE,
  defaultPersona: null,
};

function languageName(code: LanguageCode): string {
  return LANGUAGES.find((language) => language.code === code)?.englishName ?? code;
}

export function buildResponseLanguageBlock(prefs: Pick<AgentPromptPrefs, "responseLanguage" | "thumbnailLanguage">): string {
  return [
    "<response_language>",
    `Reply to the user in ${languageName(prefs.responseLanguage)} unless they explicitly switch language.`,
    `Write any text meant to appear on the thumbnails themselves (text overlays, hooks, titles inside image prompts) in ${languageName(prefs.thumbnailLanguage)}.`,
    "</response_language>",
  ].join("\n");
}

/** The creator's channel profile from Réglages → Ma chaîne, or null when nothing is filled in. */
export function buildChannelProfileBlock(
  prefs: Pick<AgentPromptPrefs, "youtubeChannel" | "channelProfile" | "defaultPersona">,
): string | null {
  const profile = prefs.channelProfile;
  const lines: string[] = [];
  if (profile.name) lines.push(`- Channel name: ${profile.name}`);
  if (prefs.youtubeChannel) lines.push(`- YouTube channel: ${prefs.youtubeChannel}`);
  if (profile.niche) lines.push(`- Niche / topic: ${profile.niche}`);
  if (profile.audience) lines.push(`- Target audience: ${profile.audience}`);
  if (profile.tone) lines.push(`- Tone and style: ${profile.tone}`);
  if (profile.brandColors.length > 0) lines.push(`- Brand colors: ${profile.brandColors.join(", ")}`);
  if (prefs.defaultPersona) {
    lines.push(
      `- Default character: "${prefs.defaultPersona.label}". Use stored:persona_${prefs.defaultPersona.id} as the default faceReference image_source unless the user asks for someone else or no face.`,
    );
  }
  if (profile.agentInstructions) lines.push(`- Standing instructions from the creator:\n${profile.agentInstructions}`);
  if (lines.length === 0) return null;
  return [
    "<channel_profile>",
    "The creator described their channel in Réglages → Ma chaîne. Use it to ground audience, tone and branding; explicit requests in the conversation take precedence.",
    ...lines,
    "</channel_profile>",
  ].join("\n");
}

/**
 * Returns the "system" parameter as an array of blocks. The first block is the
 * static persona+rules with cache_control set, so it's cached across turns.
 * The following blocks are per-turn: reply language, channel profile, project
 * id, canvas snapshot.
 */
export function buildSystemMessages(
  canvasSnapshot: unknown,
  projectId?: string,
  prefs: AgentPromptPrefs = DEFAULT_AGENT_PROMPT_PREFS,
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
      text: `<project_id>${projectId}</project_id>\n\nThe project_id above identifies the current canvas. Pass it as the \`project_id\` argument to any tool that takes one (apply_workflow, get_canvas_state, list_past_generations, trigger_generation, etc.).`,
    });
  }
  blocks.push({
    type: "text",
    text: `<canvas_state>\n${JSON.stringify(canvasSnapshot, null, 2)}\n</canvas_state>`,
  });
  return blocks;
}
```

- [ ] **Step 4: Load the profile and resolve the persona**

Replace the whole content of `src/lib/agent/prompt-prefs.ts` with:

```ts
import { getDb } from "@/lib/db";
import { getTypedSettings } from "@/lib/settings";
import type { AgentPromptPrefs } from "@/lib/agent/system-prompt";

/** Reads the Réglages values that shape the agent's per-turn system blocks. */
export function loadAgentPromptPrefs(): AgentPromptPrefs {
  const settings = getTypedSettings();
  const personaId = settings.channelProfile.defaultPersonaId;
  const persona = personaId
    ? (getDb().prepare("SELECT id, label FROM personas WHERE id = ?").get(personaId) as
        | { id: string; label: string }
        | undefined)
    : undefined;
  return {
    responseLanguage: settings.agentResponseLanguage,
    thumbnailLanguage: settings.language,
    youtubeChannel: settings.youtubePlaylistId,
    channelProfile: settings.channelProfile,
    // A persona deleted since it was chosen is left out of the prompt.
    defaultPersona: persona ?? null,
  };
}
```

- [ ] **Step 5: Run the tests**

Run: `./node_modules/.bin/vitest run tests/agent/system-prompt.test.ts tests/agent/prompt-prefs.test.ts tests/agent/v2-route-handler-settings.test.ts`
Expected: PASS (all three files).

- [ ] **Step 6: Create the Ma chaîne section and page**

Create `src/components/settings/ChaineSection.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BRAND_COLOR_PATTERN, type ChannelProfile } from "@/lib/settings-schema";
import FieldError from "./FieldError";
import SettingsFormCard from "./SettingsFormCard";
import { useSettingsForm } from "./use-settings-form";

const KEYS = ["youtubePlaylistId", "channelProfile"] as const;
const NO_PERSONA = "__none__";
const MAX_BRAND_COLORS = 3;
const NEW_BRAND_COLOR = "#E6007E";

type PersonaOption = { id: string; label: string };

export default function ChaineSection() {
  const form = useSettingsForm(KEYS);
  const [personas, setPersonas] = useState<PersonaOption[] | null>(null);

  useEffect(() => {
    fetch("/api/personas")
      .then((res) => (res.ok ? (res.json() as Promise<PersonaOption[]>) : []))
      .then((list) => setPersonas(list.map((persona) => ({ id: persona.id, label: persona.label }))))
      .catch(() => setPersonas([]));
  }, []);

  return (
    <SettingsFormCard
      title="Ma chaîne"
      description="Le profil de ta chaîne, transmis à l'agent à chaque conversation."
      form={form}
    >
      {(values) => {
        const profile = values.channelProfile;
        const setProfile = (patch: Partial<ChannelProfile>) => form.setValue("channelProfile", { ...profile, ...patch });
        const setColor = (index: number, color: string) =>
          setProfile({ brandColors: profile.brandColors.map((current, i) => (i === index ? color : current)) });

        const personaItems = [
          { value: NO_PERSONA, label: "Aucun" },
          ...(personas ?? []).map((persona) => ({ value: persona.id, label: persona.label })),
        ];
        if (profile.defaultPersonaId && !personaItems.some((item) => item.value === profile.defaultPersonaId)) {
          personaItems.push({
            value: profile.defaultPersonaId,
            label: personas === null ? "Chargement…" : "Personnage supprimé",
          });
        }

        const colorIssue =
          form.issues["channelProfile.brandColors"] ??
          profile.brandColors.map((_, index) => form.issues[`channelProfile.brandColors.${index}`]).find(Boolean);

        return (
          <>
            <div className="grid gap-2">
              <Label htmlFor="channel-name">Nom de la chaîne</Label>
              <Input
                id="channel-name"
                maxLength={100}
                value={profile.name}
                onChange={(event) => setProfile({ name: event.target.value })}
                aria-invalid={Boolean(form.issues["channelProfile.name"])}
              />
              <FieldError message={form.issues["channelProfile.name"]} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="channel-youtube">Chaîne YouTube</Label>
              <Input
                id="channel-youtube"
                placeholder="https://youtube.com/@votrechaine"
                value={values.youtubePlaylistId}
                onChange={(event) => form.setValue("youtubePlaylistId", event.target.value)}
                aria-invalid={Boolean(form.issues.youtubePlaylistId)}
              />
              <p className="text-sm text-muted-foreground">
                URL de la chaîne, @handle ou id de playlist. Alimente aussi le flux d&apos;inspirations.
              </p>
              <FieldError message={form.issues.youtubePlaylistId} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="channel-niche">Thématique / niche</Label>
              <Input
                id="channel-niche"
                maxLength={200}
                value={profile.niche}
                onChange={(event) => setProfile({ niche: event.target.value })}
                aria-invalid={Boolean(form.issues["channelProfile.niche"])}
              />
              <FieldError message={form.issues["channelProfile.niche"]} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="channel-audience">Public cible</Label>
              <Textarea
                id="channel-audience"
                maxLength={500}
                rows={3}
                value={profile.audience}
                onChange={(event) => setProfile({ audience: event.target.value })}
                aria-invalid={Boolean(form.issues["channelProfile.audience"])}
              />
              <FieldError message={form.issues["channelProfile.audience"]} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="channel-tone">Ton et style</Label>
              <Textarea
                id="channel-tone"
                maxLength={500}
                rows={3}
                value={profile.tone}
                onChange={(event) => setProfile({ tone: event.target.value })}
                aria-invalid={Boolean(form.issues["channelProfile.tone"])}
              />
              <FieldError message={form.issues["channelProfile.tone"]} />
            </div>

            <div className="grid gap-2">
              <Label>Couleurs de marque</Label>
              {profile.brandColors.map((color, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    type="color"
                    aria-label={`Couleur ${index + 1}`}
                    className="h-8 w-12 cursor-pointer p-1"
                    value={BRAND_COLOR_PATTERN.test(color) ? color : "#000000"}
                    onChange={(event) => setColor(index, event.target.value.toUpperCase())}
                  />
                  <Input
                    aria-label={`Code hexadécimal de la couleur ${index + 1}`}
                    className="w-32 font-mono"
                    maxLength={7}
                    value={color}
                    onChange={(event) => setColor(index, event.target.value)}
                    aria-invalid={Boolean(form.issues[`channelProfile.brandColors.${index}`])}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Retirer la couleur ${index + 1}`}
                    onClick={() => setProfile({ brandColors: profile.brandColors.filter((_, i) => i !== index) })}
                  >
                    <X />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                disabled={profile.brandColors.length >= MAX_BRAND_COLORS}
                onClick={() => setProfile({ brandColors: [...profile.brandColors, NEW_BRAND_COLOR] })}
              >
                <Plus />
                Ajouter une couleur
              </Button>
              <p className="text-sm text-muted-foreground">Jusqu&apos;à 3 couleurs, au format #RRGGBB.</p>
              <FieldError message={colorIssue} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="channel-persona">Personnage par défaut</Label>
              <Select
                items={personaItems}
                value={profile.defaultPersonaId ?? NO_PERSONA}
                onValueChange={(value) => setProfile({ defaultPersonaId: !value || value === NO_PERSONA ? null : value })}
              >
                <SelectTrigger
                  id="channel-persona"
                  className="w-full sm:w-64"
                  aria-invalid={Boolean(form.issues["channelProfile.defaultPersonaId"])}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {personaItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                L&apos;agent l&apos;utilise comme visage de référence sauf si tu demandes autre chose.
              </p>
              <FieldError message={form.issues["channelProfile.defaultPersonaId"]} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="channel-instructions">Consignes pour l&apos;agent</Label>
              <Textarea
                id="channel-instructions"
                maxLength={2000}
                rows={5}
                value={profile.agentInstructions}
                onChange={(event) => setProfile({ agentInstructions: event.target.value })}
                aria-invalid={Boolean(form.issues["channelProfile.agentInstructions"])}
              />
              <p className="text-sm text-muted-foreground">
                Habitudes de la chaîne, choses à éviter, style de titres… (2000 caractères maximum).
              </p>
              <FieldError message={form.issues["channelProfile.agentInstructions"]} />
            </div>
          </>
        );
      }}
    </SettingsFormCard>
  );
}
```

Create `src/app/reglages/chaine/page.tsx`:

```tsx
import ChaineSection from "@/components/settings/ChaineSection";

export const metadata = { title: "Ma chaîne · Réglages · ThumbGen" };

export default function ChainePage() {
  return <ChaineSection />;
}
```

- [ ] **Step 7: Type-check and full suite**

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run`
Expected: `tsc` exits 0; all tests pass.

- [ ] **Step 8: Check in the browser (throwaway dev server on port 3100)**

Open `http://localhost:3100/reglages/chaine`:
- Fill the name, add two colours, pick « Aucun » persona, save, reload → values kept.
- Type `red` in a colour code and save → « Couleur au format #RRGGBB » under the colours; nothing saved.
- « Ajouter une couleur » is disabled at 3 colours.

- [ ] **Step 9: Commit**

```bash
git add src/lib/agent/system-prompt.ts src/lib/agent/prompt-prefs.ts tests/agent/system-prompt.test.ts tests/agent/prompt-prefs.test.ts src/components/settings/ChaineSection.tsx src/app/reglages/chaine/page.tsx
git commit -m "feat(reglages): channel profile section fed to the agent as a channel_profile block"
```

---

## Task 9: Données & sauvegardes — stats, backups and cleanup API

**Files:**
- Modify: `src/lib/db.ts` (export the DB file path)
- Create: `src/lib/data-admin.ts`
- Create: `src/app/api/data/stats/route.ts`, `src/app/api/data/backups/route.ts`, `src/app/api/data/backups/download/route.ts`, `src/app/api/data/cleanup/route.ts`
- Create: `tests/data/data-admin.test.ts`, `tests/data/data-routes.test.ts`

**Interfaces:**
- Consumes: `getDb()` from `@/lib/db`.
- Produces:
  - `getDbFilePath(): string` (in `src/lib/db.ts`)
  - `src/lib/data-admin.ts`: `type StorageStats = { dbBytes; walBytes; counts: { projects; conversations; messages; generatedImages; personas; logos; swipeFiles; sketches; chatUploads } }` (all numbers), `type BackupEntry = { name: string; createdAt: string; size: number; legacy: boolean }`, `type CleanupCandidates = { sketches: number; chatUploads: number }`, `type CleanupResult = { deletedSketches: number; deletedChatUploads: number; bytesBefore: number; bytesAfter: number }`, `class BackupInProgressError`, `getStorageStats()`, `backupsDir()`, `listBackups()`, `resolveBackupPath(name): string | null`, `createBackup(now?: Date): Promise<BackupEntry>`, `deleteBackup(name): boolean`, `countCleanupCandidates()`, `runCleanup()`
  - HTTP: `GET /api/data/stats` → `StorageStats`; `GET /api/data/backups` → `BackupEntry[]` (newest first); `POST /api/data/backups` → 201 `BackupEntry` / 409; `DELETE /api/data/backups?name=` → `{ success: true }` / 400; `GET /api/data/backups/download?name=` → file attachment / 400; `GET /api/data/cleanup` → `CleanupCandidates`; `POST /api/data/cleanup` → `CleanupResult` / 409.

- [ ] **Step 1: Write the failing tests**

Create `tests/data/data-admin.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { v4 as uuid } from "uuid";
import { getDb, getDbFilePath } from "@/lib/db";
import {
  BackupInProgressError,
  backupsDir,
  countCleanupCandidates,
  createBackup,
  deleteBackup,
  getStorageStats,
  listBackups,
  resolveBackupPath,
  runCleanup,
} from "@/lib/data-admin";

const dataDir = () => path.dirname(getDbFilePath());
const LEGACY_FILES = ["thumbgen.db.bak-test", "thumbgen.db.bak-test-wal", "thumbgen.db.bak-test-shm", "notes.txt"];

function insertUpload(ageHours: number, attached: 0 | 1): string {
  const id = `up_${uuid().replace(/-/g, "")}`;
  getDb()
    .prepare(
      "INSERT INTO chat_uploads (id, mime_type, size, data, attached, created_at) VALUES (?, ?, ?, ?, ?, datetime('now', ?))",
    )
    .run(id, "image/png", 1, Buffer.from([0]), attached, `-${ageHours} hours`);
  return id;
}

function insertSketch(ageHours: number, attached: 0 | 1): string {
  const id = `sk_${uuid().replace(/-/g, "")}`;
  getDb()
    .prepare(
      "INSERT INTO generated_sketches (id, prompt, mime_type, data, attached, created_at) VALUES (?, ?, ?, ?, ?, datetime('now', ?))",
    )
    .run(id, "test", "image/png", Buffer.from([0]), attached, `-${ageHours} hours`);
  return id;
}

function exists(table: "chat_uploads" | "generated_sketches", id: string): boolean {
  return Boolean(getDb().prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id));
}

beforeEach(() => {
  getDb().exec("DELETE FROM chat_uploads; DELETE FROM generated_sketches;");
  fs.rmSync(backupsDir(), { recursive: true, force: true });
});

afterEach(() => {
  for (const name of LEGACY_FILES) fs.rmSync(path.join(dataDir(), name), { force: true });
});

describe("getStorageStats", () => {
  it("reports the database size and the row counts", () => {
    const before = getStorageStats();
    insertUpload(1, 0);
    const after = getStorageStats();
    expect(after.dbBytes).toBeGreaterThan(0);
    expect(after.walBytes).toBeGreaterThanOrEqual(0);
    expect(after.counts.chatUploads).toBe(before.counts.chatUploads + 1);
    expect(Object.keys(after.counts).sort()).toEqual(
      ["chatUploads", "conversations", "generatedImages", "logos", "messages", "personas", "projects", "sketches", "swipeFiles"].sort(),
    );
  });
});

describe("backups", () => {
  it("creates a valid SQLite copy in data/backups", async () => {
    const entry = await createBackup(new Date(2026, 8, 16, 10, 5, 7));
    expect(entry.name).toBe("thumbgen-20260916-100507.db");
    expect(entry.legacy).toBe(false);
    expect(entry.size).toBeGreaterThan(0);
    const file = path.join(backupsDir(), entry.name);
    const copy = new Database(file, { readonly: true });
    expect(copy.pragma("integrity_check", { simple: true })).toBe("ok");
    copy.close();
  });

  it("never overwrites a backup taken in the same second", async () => {
    const at = new Date(2026, 8, 16, 11, 0, 0);
    const first = await createBackup(at);
    const second = await createBackup(at);
    expect(first.name).toBe("thumbgen-20260916-110000.db");
    expect(second.name).toBe("thumbgen-20260916-110000-1.db");
  });

  it("refuses a second backup while one is running", async () => {
    const running = createBackup();
    await expect(createBackup()).rejects.toBeInstanceOf(BackupInProgressError);
    await running;
  });

  it("lists backups and legacy copies, but not WAL/SHM files or the live database", async () => {
    await createBackup(new Date(2026, 8, 16, 12, 0, 0));
    for (const name of LEGACY_FILES) fs.writeFileSync(path.join(dataDir(), name), "x");
    const names = listBackups().map((backup) => [backup.name, backup.legacy]);
    expect(names).toContainEqual(["thumbgen-20260916-120000.db", false]);
    expect(names).toContainEqual(["thumbgen.db.bak-test", true]);
    const flat = names.map(([name]) => name);
    expect(flat).not.toContain("thumbgen.db");
    expect(flat).not.toContain("thumbgen.db-wal");
    expect(flat).not.toContain("thumbgen.db.bak-test-wal");
    expect(flat).not.toContain("thumbgen.db.bak-test-shm");
    expect(flat).not.toContain("notes.txt");
  });

  it("resolves only names returned by the list", async () => {
    const entry = await createBackup(new Date(2026, 8, 16, 13, 0, 0));
    expect(resolveBackupPath(entry.name)).toBe(path.join(backupsDir(), entry.name));
    expect(resolveBackupPath("thumbgen.db")).toBeNull();
    expect(resolveBackupPath("../thumbgen.db")).toBeNull();
    expect(resolveBackupPath(`backups/${entry.name}`)).toBeNull();
    expect(resolveBackupPath("")).toBeNull();
  });

  it("deletes a listed backup and nothing else", async () => {
    const entry = await createBackup(new Date(2026, 8, 16, 14, 0, 0));
    expect(deleteBackup("../thumbgen.db")).toBe(false);
    expect(deleteBackup(entry.name)).toBe(true);
    expect(fs.existsSync(path.join(backupsDir(), entry.name))).toBe(false);
    expect(fs.existsSync(getDbFilePath())).toBe(true);
  });
});

describe("cleanup", () => {
  it("counts and deletes only unattached rows older than 24 h, then vacuums", () => {
    const oldUpload = insertUpload(25, 0);
    const recentUpload = insertUpload(1, 0);
    const attachedUpload = insertUpload(99, 1);
    const oldSketch = insertSketch(30, 0);
    const recentSketch = insertSketch(2, 0);
    const attachedSketch = insertSketch(99, 1);

    expect(countCleanupCandidates()).toEqual({ sketches: 1, chatUploads: 1 });

    const result = runCleanup();
    expect(result.deletedSketches).toBe(1);
    expect(result.deletedChatUploads).toBe(1);
    expect(result.bytesBefore).toBeGreaterThan(0);
    expect(result.bytesAfter).toBeGreaterThan(0);

    expect(exists("chat_uploads", oldUpload)).toBe(false);
    expect(exists("chat_uploads", recentUpload)).toBe(true);
    expect(exists("chat_uploads", attachedUpload)).toBe(true);
    expect(exists("generated_sketches", oldSketch)).toBe(false);
    expect(exists("generated_sketches", recentSketch)).toBe(true);
    expect(exists("generated_sketches", attachedSketch)).toBe(true);
    expect(countCleanupCandidates()).toEqual({ sketches: 0, chatUploads: 0 });
  });
});
```

Create `tests/data/data-routes.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import { backupsDir } from "@/lib/data-admin";
import { GET as statsGet } from "@/app/api/data/stats/route";
import { DELETE as backupsDelete, GET as backupsGet, POST as backupsPost } from "@/app/api/data/backups/route";
import { GET as downloadGet } from "@/app/api/data/backups/download/route";
import { GET as cleanupGet, POST as cleanupPost } from "@/app/api/data/cleanup/route";

beforeEach(() => {
  fs.rmSync(backupsDir(), { recursive: true, force: true });
});

describe("/api/data routes", () => {
  it("GET stats returns sizes and counts", async () => {
    const res = await statsGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dbBytes).toBeGreaterThan(0);
    expect(typeof body.counts.projects).toBe("number");
  });

  it("creates, lists, downloads and deletes a backup", async () => {
    const created = await backupsPost();
    expect(created.status).toBe(201);
    const entry = (await created.json()) as { name: string; size: number };

    const list = (await (await backupsGet()).json()) as Array<{ name: string }>;
    expect(list.map((backup) => backup.name)).toContain(entry.name);

    const download = await downloadGet(
      new Request(`http://localhost/api/data/backups/download?name=${encodeURIComponent(entry.name)}`),
    );
    expect(download.status).toBe(200);
    expect(download.headers.get("content-disposition")).toBe(`attachment; filename="${entry.name}"`);
    expect(Number(download.headers.get("content-length"))).toBe(entry.size);
    expect((await download.arrayBuffer()).byteLength).toBe(entry.size);

    const deleted = await backupsDelete(
      new Request(`http://localhost/api/data/backups?name=${encodeURIComponent(entry.name)}`, { method: "DELETE" }),
    );
    expect(deleted.status).toBe(200);
    const after = (await (await backupsGet()).json()) as Array<{ name: string }>;
    expect(after.map((backup) => backup.name)).not.toContain(entry.name);
  });

  it("rejects names that are not in the backup list with 400", async () => {
    for (const name of ["../thumbgen.db", "thumbgen.db", "/etc/passwd", ""]) {
      const download = await downloadGet(
        new Request(`http://localhost/api/data/backups/download?name=${encodeURIComponent(name)}`),
      );
      expect(download.status).toBe(400);
      const deleted = await backupsDelete(
        new Request(`http://localhost/api/data/backups?name=${encodeURIComponent(name)}`, { method: "DELETE" }),
      );
      expect(deleted.status).toBe(400);
    }
  });

  it("GET cleanup counts candidates and POST runs the cleanup", async () => {
    const counts = await (await cleanupGet()).json();
    expect(counts).toEqual({ sketches: expect.any(Number), chatUploads: expect.any(Number) });
    const res = await cleanupPost();
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result).toEqual({
      deletedSketches: expect.any(Number),
      deletedChatUploads: expect.any(Number),
      bytesBefore: expect.any(Number),
      bytesAfter: expect.any(Number),
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `./node_modules/.bin/vitest run tests/data`
Expected: FAIL — `getDbFilePath` is not exported and `@/lib/data-admin` does not resolve.

- [ ] **Step 3: Export the DB path**

In `src/lib/db.ts`, replace

```ts
export function getDb(): Database.Database {
  if (!global.__thumbgen_db) {
    global.__thumbgen_db = open();
  }
  return global.__thumbgen_db;
}
```

with

```ts
export function getDb(): Database.Database {
  if (!global.__thumbgen_db) {
    global.__thumbgen_db = open();
  }
  return global.__thumbgen_db;
}

/** Absolute path of the SQLite file (THUMBGEN_DB_PATH or data/thumbgen.db). */
export function getDbFilePath(): string {
  return DB_FILE;
}
```

- [ ] **Step 4: Implement the data administration module**

Create `src/lib/data-admin.ts`:

```ts
import fs from "fs";
import path from "path";
import { getDb, getDbFilePath } from "@/lib/db";

export type StorageStats = {
  dbBytes: number;
  walBytes: number;
  counts: {
    projects: number;
    conversations: number;
    messages: number;
    generatedImages: number;
    personas: number;
    logos: number;
    swipeFiles: number;
    sketches: number;
    chatUploads: number;
  };
};

export type BackupEntry = { name: string; createdAt: string; size: number; legacy: boolean };

export type CleanupCandidates = { sketches: number; chatUploads: number };

export type CleanupResult = {
  deletedSketches: number;
  deletedChatUploads: number;
  bytesBefore: number;
  bytesAfter: number;
};

export class BackupInProgressError extends Error {
  constructor() {
    super("A backup is already running");
    this.name = "BackupInProgressError";
  }
}

function fileSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function databaseBytes(): number {
  return fileSize(getDbFilePath()) + fileSize(`${getDbFilePath()}-wal`);
}

function count(sql: string): number {
  return (getDb().prepare(sql).get() as { n: number }).n;
}

export function getStorageStats(): StorageStats {
  // Counting first also opens the database, so the file exists before it is measured.
  const counts = {
    projects: count("SELECT COUNT(*) AS n FROM projects_meta"),
    conversations: count("SELECT COUNT(*) AS n FROM conversations WHERE deleted_at IS NULL"),
    messages: count("SELECT COUNT(*) AS n FROM messages"),
    generatedImages: count("SELECT COUNT(*) AS n FROM generated_images"),
    personas: count("SELECT COUNT(*) AS n FROM personas"),
    logos: count("SELECT COUNT(*) AS n FROM logos"),
    swipeFiles: count("SELECT COUNT(*) AS n FROM swipe_files"),
    sketches: count("SELECT COUNT(*) AS n FROM generated_sketches"),
    chatUploads: count("SELECT COUNT(*) AS n FROM chat_uploads"),
  };
  const dbFile = getDbFilePath();
  return { dbBytes: fileSize(dbFile), walBytes: fileSize(`${dbFile}-wal`), counts };
}

export function backupsDir(): string {
  return path.join(path.dirname(getDbFilePath()), "backups");
}

type LocatedBackup = BackupEntry & { filePath: string };

function locate(dir: string, name: string, legacy: boolean): LocatedBackup | null {
  const filePath = path.join(dir, name);
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
    return { name, createdAt: stat.mtime.toISOString(), size: stat.size, legacy, filePath };
  } catch {
    return null;
  }
}

/**
 * Backups made by this page (data/backups/*.db) plus older manual copies
 * next to the live database (thumbgen.db.*, without their -wal/-shm files).
 */
function locateBackups(): LocatedBackup[] {
  const found: LocatedBackup[] = [];
  const dir = backupsDir();
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".db")) continue;
      const entry = locate(dir, name, false);
      if (entry) found.push(entry);
    }
  }
  const dataDir = path.dirname(getDbFilePath());
  const legacyPrefix = `${path.basename(getDbFilePath())}.`;
  for (const name of fs.readdirSync(dataDir)) {
    if (!name.startsWith(legacyPrefix) || name.endsWith("-wal") || name.endsWith("-shm")) continue;
    const entry = locate(dataDir, name, true);
    if (entry) found.push(entry);
  }
  return found.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listBackups(): BackupEntry[] {
  return locateBackups().map((backup) => ({
    name: backup.name,
    createdAt: backup.createdAt,
    size: backup.size,
    legacy: backup.legacy,
  }));
}

/** Whitelist: only an exact name from the list resolves; paths and ".." never do. */
export function resolveBackupPath(name: string): string | null {
  return locateBackups().find((backup) => backup.name === name)?.filePath ?? null;
}

let backupRunning = false;

function timestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/** Online backup through better-sqlite3 (safe while the app keeps writing). */
export async function createBackup(now: Date = new Date()): Promise<BackupEntry> {
  if (backupRunning) throw new BackupInProgressError();
  backupRunning = true;
  try {
    const dir = backupsDir();
    fs.mkdirSync(dir, { recursive: true });
    const base = `thumbgen-${timestamp(now)}`;
    let name = `${base}.db`;
    for (let suffix = 1; fs.existsSync(path.join(dir, name)); suffix++) name = `${base}-${suffix}.db`;
    await getDb().backup(path.join(dir, name));
    const entry = locate(dir, name, false);
    if (!entry) throw new Error(`Backup file missing after backup: ${name}`);
    return { name: entry.name, createdAt: entry.createdAt, size: entry.size, legacy: entry.legacy };
  } finally {
    backupRunning = false;
  }
}

export function deleteBackup(name: string): boolean {
  const filePath = resolveBackupPath(name);
  if (!filePath) return false;
  fs.unlinkSync(filePath);
  return true;
}

const STALE = "attached = 0 AND created_at < datetime('now', '-24 hours')";

export function countCleanupCandidates(): CleanupCandidates {
  return {
    sketches: count(`SELECT COUNT(*) AS n FROM generated_sketches WHERE ${STALE}`),
    chatUploads: count(`SELECT COUNT(*) AS n FROM chat_uploads WHERE ${STALE}`),
  };
}

export function runCleanup(): CleanupResult {
  if (backupRunning) throw new BackupInProgressError();
  const db = getDb();
  const bytesBefore = databaseBytes();
  const deleted = db.transaction(() => ({
    sketches: db.prepare(`DELETE FROM generated_sketches WHERE ${STALE}`).run().changes,
    chatUploads: db.prepare(`DELETE FROM chat_uploads WHERE ${STALE}`).run().changes,
  }))();
  db.exec("VACUUM");
  // In WAL mode the main file only shrinks once the WAL is checkpointed.
  db.pragma("wal_checkpoint(TRUNCATE)");
  return {
    deletedSketches: deleted.sketches,
    deletedChatUploads: deleted.chatUploads,
    bytesBefore,
    bytesAfter: databaseBytes(),
  };
}
```

- [ ] **Step 5: Add the routes**

Create `src/app/api/data/stats/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getStorageStats } from "@/lib/data-admin";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(getStorageStats());
  } catch (err) {
    console.error("Storage stats error:", err);
    return NextResponse.json({ error: "Lecture des statistiques impossible" }, { status: 500 });
  }
}
```

Create `src/app/api/data/backups/route.ts`:

```ts
import { NextResponse } from "next/server";
import { BackupInProgressError, createBackup, deleteBackup, listBackups } from "@/lib/data-admin";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(listBackups());
  } catch (err) {
    console.error("List backups error:", err);
    return NextResponse.json({ error: "Liste des sauvegardes impossible" }, { status: 500 });
  }
}

export async function POST() {
  try {
    return NextResponse.json(await createBackup(), { status: 201 });
  } catch (err) {
    if (err instanceof BackupInProgressError) {
      return NextResponse.json({ error: "Une sauvegarde est déjà en cours" }, { status: 409 });
    }
    console.error("Create backup error:", err);
    return NextResponse.json({ error: "Échec de la sauvegarde" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const name = new URL(request.url).searchParams.get("name") ?? "";
  try {
    if (!deleteBackup(name)) return NextResponse.json({ error: "Sauvegarde inconnue" }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete backup error:", err);
    return NextResponse.json({ error: "Suppression impossible" }, { status: 500 });
  }
}
```

Create `src/app/api/data/backups/download/route.ts`:

```ts
import fs from "fs";
import { Readable } from "stream";
import { NextResponse } from "next/server";
import { resolveBackupPath } from "@/lib/data-admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name") ?? "";
  const filePath = resolveBackupPath(name);
  if (!filePath) return NextResponse.json({ error: "Sauvegarde inconnue" }, { status: 400 });
  try {
    const size = fs.statSync(filePath).size;
    const stream = Readable.toWeb(fs.createReadStream(filePath)) as unknown as ReadableStream<Uint8Array>;
    return new Response(stream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(size),
        "Content-Disposition": `attachment; filename="${name.replace(/"/g, "")}"`,
      },
    });
  } catch (err) {
    console.error("Download backup error:", err);
    return NextResponse.json({ error: "Téléchargement impossible" }, { status: 500 });
  }
}
```

Create `src/app/api/data/cleanup/route.ts`:

```ts
import { NextResponse } from "next/server";
import { BackupInProgressError, countCleanupCandidates, runCleanup } from "@/lib/data-admin";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(countCleanupCandidates());
  } catch (err) {
    console.error("Cleanup count error:", err);
    return NextResponse.json({ error: "Comptage impossible" }, { status: 500 });
  }
}

export async function POST() {
  try {
    return NextResponse.json(runCleanup());
  } catch (err) {
    if (err instanceof BackupInProgressError) {
      return NextResponse.json({ error: "Une sauvegarde est en cours, réessaie dans un instant" }, { status: 409 });
    }
    console.error("Cleanup error:", err);
    return NextResponse.json({ error: "Échec du nettoyage" }, { status: 500 });
  }
}
```

- [ ] **Step 6: Run the tests**

Run: `./node_modules/.bin/vitest run tests/data`
Expected: PASS (both files).

- [ ] **Step 7: Type-check and full suite**

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run`
Expected: `tsc` exits 0; all tests pass (the existing `tests/agent/gc.test.ts` is unaffected).

- [ ] **Step 8: Commit**

```bash
git add src/lib/db.ts src/lib/data-admin.ts src/app/api/data/stats/route.ts src/app/api/data/backups/route.ts src/app/api/data/backups/download/route.ts src/app/api/data/cleanup/route.ts tests/data/data-admin.test.ts tests/data/data-routes.test.ts
git commit -m "feat(data): storage stats, online backups and cleanup endpoints"
```

---

## Task 10: Données & sauvegardes section

**Files:**
- Create: `src/components/settings/format.ts`, `src/components/settings/api.ts`
- Create: `src/components/settings/StorageCard.tsx`, `src/components/settings/BackupsCard.tsx`, `src/components/settings/CleanupCard.tsx`, `src/components/settings/DonneesSection.tsx`
- Create: `src/app/reglages/donnees/page.tsx`
- Create: `tests/settings/data-ui-helpers.test.ts`

**Interfaces:**
- Consumes: `StorageStats`, `BackupEntry`, `CleanupCandidates`, `CleanupResult` types and the `/api/data/*` routes (Task 9); `ConfirmDialog` (Task 5).
- Produces: `formatBytes(bytes: number): string`, `formatDateTime(iso: string): string`, `readApiError(res: Response, fallback: string): Promise<string>`.

- [ ] **Step 1: Write the failing helper tests**

Create `tests/settings/data-ui-helpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readApiError } from "@/components/settings/api";
import { formatBytes, formatDateTime } from "@/components/settings/format";

describe("formatBytes", () => {
  it("uses French units with a decimal comma", () => {
    expect(formatBytes(512)).toBe("512 o");
    expect(formatBytes(1536)).toBe("1,5 Ko");
    expect(formatBytes(80 * 1024 * 1024)).toBe("80,0 Mo");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3,0 Go");
  });
});

describe("formatDateTime", () => {
  it("formats an ISO date and leaves garbage untouched", () => {
    expect(formatDateTime("2026-09-16T10:05:00.000Z")).toContain("2026");
    expect(formatDateTime("not a date")).toBe("not a date");
  });
});

describe("readApiError", () => {
  it("returns the API error message or the fallback", async () => {
    expect(await readApiError(new Response(JSON.stringify({ error: "Sauvegarde inconnue" }), { status: 400 }), "x")).toBe(
      "Sauvegarde inconnue",
    );
    expect(await readApiError(new Response("oops", { status: 500 }), "Erreur générique")).toBe("Erreur générique");
  });
});
```

Run: `./node_modules/.bin/vitest run tests/settings/data-ui-helpers.test.ts`
Expected: FAIL — `Failed to resolve import "@/components/settings/api"`.

- [ ] **Step 2: Implement the helpers**

Create `src/components/settings/format.ts`:

```ts
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  const units = ["Ko", "Mo", "Go"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1).replace(".", ",")} ${units[unit]}`;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
```

Create `src/components/settings/api.ts`:

```ts
/** The `error` string of a JSON error response, or the fallback. */
export async function readApiError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: unknown };
  return typeof body.error === "string" ? body.error : fallback;
}
```

Run: `./node_modules/.bin/vitest run tests/settings/data-ui-helpers.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: Create the storage card**

Create `src/components/settings/StorageCard.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { StorageStats } from "@/lib/data-admin";
import { readApiError } from "./api";
import { formatBytes } from "./format";

const COUNT_ROWS: Array<{ key: keyof StorageStats["counts"]; label: string }> = [
  { key: "projects", label: "Projets" },
  { key: "conversations", label: "Conversations" },
  { key: "messages", label: "Messages" },
  { key: "generatedImages", label: "Images générées" },
  { key: "personas", label: "Personnages" },
  { key: "logos", label: "Logos" },
  { key: "swipeFiles", label: "Inspirations" },
  { key: "sketches", label: "Croquis" },
  { key: "chatUploads", label: "Uploads de chat" },
];

export default function StorageCard({ refreshKey }: { refreshKey: number }) {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/data/stats", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(await readApiError(res, "Lecture des statistiques impossible."));
        return (await res.json()) as StorageStats;
      })
      .then((data) => {
        if (cancelled) return;
        setStats(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Lecture des statistiques impossible.");
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stockage</CardTitle>
        <CardDescription>Taille de la base SQLite et nombre d&apos;éléments enregistrés.</CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : !stats ? (
          <div className="grid gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Élément</TableHead>
                <TableHead className="text-right">Valeur</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Base de données (journal WAL compris)</TableCell>
                <TableCell className="text-right tabular-nums">{formatBytes(stats.dbBytes + stats.walBytes)}</TableCell>
              </TableRow>
              {COUNT_ROWS.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>{row.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{stats.counts[row.key].toLocaleString("fr-FR")}</TableCell>
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

- [ ] **Step 4: Create the backups card**

Create `src/components/settings/BackupsCard.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { cn } from "cn";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BackupEntry } from "@/lib/data-admin";
import { readApiError } from "./api";
import ConfirmDialog from "./ConfirmDialog";
import { formatBytes, formatDateTime } from "./format";

export default function BackupsCard() {
  const [backups, setBackups] = useState<BackupEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<BackupEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/data/backups", { cache: "no-store" });
      if (!res.ok) throw new Error(await readApiError(res, "Liste des sauvegardes indisponible."));
      setBackups((await res.json()) as BackupEntry[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Liste des sauvegardes indisponible.");
      setBackups([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/data/backups", { method: "POST" });
      if (!res.ok) {
        setError(await readApiError(res, "Échec de la sauvegarde."));
        return;
      }
      await load();
    } catch {
      setError("Échec de la sauvegarde — vérifie ta connexion.");
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/data/backups?name=${encodeURIComponent(toDelete.name)}`, { method: "DELETE" });
      if (!res.ok) {
        setError(await readApiError(res, "Suppression impossible."));
        return;
      }
      setToDelete(null);
      await load();
    } catch {
      setError("Suppression impossible — vérifie ta connexion.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sauvegardes</CardTitle>
        <CardDescription>Copies complètes de la base, enregistrées dans data/backups/.</CardDescription>
        <CardAction>
          <Button type="button" disabled={creating} onClick={() => void create()}>
            {creating ? "Sauvegarde…" : "Créer une sauvegarde"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {backups === null ? (
          <div className="grid gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : backups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune sauvegarde pour l&apos;instant.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fichier</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Taille</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {backups.map((backup) => (
                <TableRow key={backup.name}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{backup.name}</span>
                      {backup.legacy && <Badge variant="outline">ancienne copie</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>{formatDateTime(backup.createdAt)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBytes(backup.size)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <a
                        href={`/api/data/backups/download?name=${encodeURIComponent(backup.name)}`}
                        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
                        aria-label={`Télécharger ${backup.name}`}
                      >
                        <Download />
                      </a>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Supprimer ${backup.name}`}
                        onClick={() => setToDelete(backup)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Alert>
          <AlertTitle>Restaurer une sauvegarde</AlertTitle>
          <AlertDescription>
            <ol className="list-decimal space-y-1 pl-4">
              <li>
                Arrête le container : <code className="font-mono">docker compose stop thumbgen</code>.
              </li>
              <li>
                Remplace <code className="font-mono">data/thumbgen.db</code> par la copie choisie, renommée{" "}
                <code className="font-mono">thumbgen.db</code>.
              </li>
              <li>
                Supprime <code className="font-mono">data/thumbgen.db-wal</code> et{" "}
                <code className="font-mono">data/thumbgen.db-shm</code> s&apos;ils existent.
              </li>
              <li>
                Redémarre : <code className="font-mono">docker compose start thumbgen</code>.
              </li>
            </ol>
          </AlertDescription>
        </Alert>
      </CardContent>
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
        title="Supprimer cette sauvegarde ?"
        description={toDelete ? `${toDelete.name} sera supprimé définitivement du disque.` : ""}
        confirmLabel="Supprimer"
        busy={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </Card>
  );
}
```

- [ ] **Step 5: Create the cleanup card, the section and the page**

Create `src/components/settings/CleanupCard.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { CleanupCandidates, CleanupResult } from "@/lib/data-admin";
import { readApiError } from "./api";
import ConfirmDialog from "./ConfirmDialog";
import { formatBytes } from "./format";

export default function CleanupCard({ onCleaned }: { onCleaned: () => void }) {
  const [candidates, setCandidates] = useState<CleanupCandidates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [result, setResult] = useState<CleanupResult | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/data/cleanup", { cache: "no-store" });
      if (!res.ok) throw new Error(await readApiError(res, "Comptage impossible."));
      setCandidates((await res.json()) as CleanupCandidates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comptage impossible.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async () => {
    setCleaning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/data/cleanup", { method: "POST" });
      if (!res.ok) {
        setError(await readApiError(res, "Échec du nettoyage."));
        return;
      }
      setResult((await res.json()) as CleanupResult);
      setConfirmOpen(false);
      onCleaned();
      await load();
    } catch {
      setError("Échec du nettoyage — vérifie ta connexion.");
    } finally {
      setCleaning(false);
    }
  };

  const total = candidates ? candidates.sketches + candidates.chatUploads : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nettoyage</CardTitle>
        <CardDescription>
          Supprime les croquis et les imports de chat jamais utilisés depuis plus de 24 h, puis compacte la base.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {candidates ? (
          <p className="text-sm">
            {candidates.sketches} croquis et {candidates.chatUploads} imports de chat concernés.
          </p>
        ) : (
          !error && <Skeleton className="h-5 w-72" />
        )}
        {result && (
          <Alert>
            <AlertDescription>
              {result.deletedSketches + result.deletedChatUploads} élément(s) supprimé(s) · base{" "}
              {formatBytes(result.bytesBefore)} → {formatBytes(result.bytesAfter)}
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter>
        <Button type="button" variant="outline" disabled={candidates === null || cleaning} onClick={() => setConfirmOpen(true)}>
          Nettoyer…
        </Button>
      </CardFooter>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Nettoyer la base ?"
        description={`${total} élément(s) seront supprimés définitivement, puis la base sera compactée (VACUUM). L'application peut ralentir quelques secondes.`}
        confirmLabel="Nettoyer"
        busy={cleaning}
        onConfirm={() => void run()}
      />
    </Card>
  );
}
```

Create `src/components/settings/DonneesSection.tsx`:

```tsx
"use client";

import { useState } from "react";
import BackupsCard from "./BackupsCard";
import CleanupCard from "./CleanupCard";
import StorageCard from "./StorageCard";

export default function DonneesSection() {
  const [statsVersion, setStatsVersion] = useState(0);

  return (
    <>
      <StorageCard refreshKey={statsVersion} />
      <BackupsCard />
      <CleanupCard onCleaned={() => setStatsVersion((version) => version + 1)} />
    </>
  );
}
```

Create `src/app/reglages/donnees/page.tsx`:

```tsx
import DonneesSection from "@/components/settings/DonneesSection";

export const metadata = { title: "Données & sauvegardes · Réglages · ThumbGen" };

export default function DonneesPage() {
  return <DonneesSection />;
}
```

- [ ] **Step 6: Type-check and full suite**

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run`
Expected: `tsc` exits 0; all tests pass.

- [ ] **Step 7: Check in the browser (throwaway dev server on port 3100)**

Open `http://localhost:3100/reglages/donnees` (throwaway DB, so every action here is safe):
- « Stockage » shows the size and nine counts.
- « Créer une sauvegarde » adds a row; the download icon downloads a `.db` file; the trash icon opens the dialog, « Supprimer » removes the row.
- « Nettoyer… » shows the count in the dialog; confirming shows the « élément(s) supprimé(s) · base X → Y » alert and refreshes « Stockage ».

- [ ] **Step 8: Commit**

```bash
git add src/components/settings/format.ts src/components/settings/api.ts src/components/settings/StorageCard.tsx src/components/settings/BackupsCard.tsx src/components/settings/CleanupCard.tsx src/components/settings/DonneesSection.tsx src/app/reglages/donnees/page.tsx tests/settings/data-ui-helpers.test.ts
git commit -m "feat(reglages): data section with storage stats, backups and cleanup"
```

---

## Task 11: Apparence — theme in the root layout, system script, sidebar cookie, section

**Files:**
- Create: `src/lib/theme.ts`
- Modify: `src/app/layout.tsx`
- Create: `src/components/settings/ApparenceSection.tsx`, `src/app/reglages/apparence/page.tsx`
- Create: `tests/settings/theme.test.ts`

**Interfaces:**
- Consumes: `getTypedSettings` (Task 2); `THEMES`, `Theme` (Task 2); `useSettingsForm` with `onSaved`, `SettingsFormCard`, `FieldError` (Tasks 5–6).
- Produces (`src/lib/theme.ts`): `THEME_SCRIPT: string`, `serverThemeClass(theme: Theme): string`, `sidebarDefaultOpen(cookieValue: string | undefined): boolean`, `applyTheme(theme: Theme): void` (client only).

- [ ] **Step 1: Write the failing test**

Create `tests/settings/theme.test.ts` (the first line selects the DOM environment for this file only):

```ts
// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { THEME_SCRIPT, applyTheme, serverThemeClass, sidebarDefaultOpen } from "@/lib/theme";

type MediaStub = { matches: boolean; addEventListener: (type: string, listener: () => void) => void };

function stubPrefersDark(matches: boolean) {
  const listeners: Array<() => void> = [];
  const media: MediaStub = { matches, addEventListener: (_type, listener) => listeners.push(listener) };
  window.matchMedia = vi.fn().mockReturnValue(media) as unknown as typeof window.matchMedia;
  return { media, listeners };
}

const root = () => document.documentElement;

afterEach(() => {
  root().className = "";
  delete root().dataset.theme;
});

describe("server helpers", () => {
  it("renders the dark class only for the dark theme", () => {
    expect(serverThemeClass("dark")).toBe("dark");
    expect(serverThemeClass("light")).toBe("");
    expect(serverThemeClass("system")).toBe("");
  });

  it("opens the sidebar unless its cookie says false", () => {
    expect(sidebarDefaultOpen(undefined)).toBe(true);
    expect(sidebarDefaultOpen("true")).toBe(true);
    expect(sidebarDefaultOpen("false")).toBe(false);
  });
});

describe("applyTheme", () => {
  it("adds or removes the dark class and records the theme", () => {
    stubPrefersDark(false);
    applyTheme("dark");
    expect(root().classList.contains("dark")).toBe(true);
    expect(root().dataset.theme).toBe("dark");
    applyTheme("light");
    expect(root().classList.contains("dark")).toBe(false);
    expect(root().dataset.theme).toBe("light");
  });

  it("follows prefers-color-scheme for the system theme", () => {
    stubPrefersDark(true);
    applyTheme("system");
    expect(root().classList.contains("dark")).toBe(true);
    stubPrefersDark(false);
    applyTheme("system");
    expect(root().classList.contains("dark")).toBe(false);
  });
});

describe("THEME_SCRIPT", () => {
  it("applies and then tracks the OS preference while the theme is system", () => {
    const { media, listeners } = stubPrefersDark(true);
    root().dataset.theme = "system";
    new Function(THEME_SCRIPT)();
    expect(root().classList.contains("dark")).toBe(true);
    media.matches = false;
    listeners.forEach((listener) => listener());
    expect(root().classList.contains("dark")).toBe(false);
  });

  it("stays inert when the theme is not system", () => {
    const { listeners } = stubPrefersDark(true);
    root().dataset.theme = "light";
    new Function(THEME_SCRIPT)();
    listeners.forEach((listener) => listener());
    expect(root().classList.contains("dark")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/settings/theme.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/theme"`.

- [ ] **Step 3: Implement the theme helpers**

Create `src/lib/theme.ts`:

```ts
import type { Theme } from "@/lib/settings-schema";

/**
 * Inline <head> script. While <html data-theme="system">, it mirrors
 * prefers-color-scheme onto the `dark` class and keeps following OS changes.
 * It reads data-theme on every change, so a client-side switch away from
 * « Système » (applyTheme) turns it off without a reload.
 */
export const THEME_SCRIPT =
  '(function(){try{var r=document.documentElement;var m=window.matchMedia("(prefers-color-scheme: dark)");' +
  'var s=function(){if(r.dataset.theme==="system"){r.classList.toggle("dark",m.matches);}};' +
  's();m.addEventListener("change",s);}catch(e){}})();';

/** Class rendered on <html> by the server; "system" is resolved by THEME_SCRIPT in the browser. */
export function serverThemeClass(theme: Theme): string {
  return theme === "dark" ? "dark" : "";
}

/** ui/sidebar.tsx writes sidebar_state=true|false; no cookie yet means open. */
export function sidebarDefaultOpen(cookieValue: string | undefined): boolean {
  return cookieValue !== "false";
}

/** Client only: applies a freshly saved theme without reloading the page. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
}
```

- [ ] **Step 4: Run the test**

Run: `./node_modules/.bin/vitest run tests/settings/theme.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Read the theme and the sidebar cookie in the root layout**

In `src/app/layout.tsx`:

1. Replace

```tsx
import type { Metadata } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import "./globals.css";
```

with

```tsx
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { cn } from "cn";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { getTypedSettings } from "@/lib/settings";
import { THEME_SCRIPT, serverThemeClass, sidebarDefaultOpen } from "@/lib/theme";
import "./globals.css";
```

2. Replace

```tsx
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="h-full antialiased dark" suppressHydrationWarning>
```

with

```tsx
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // cookies() first: it opts the layout into dynamic rendering before the database is read.
  const cookieStore = await cookies();
  const sidebarOpen = sidebarDefaultOpen(cookieStore.get("sidebar_state")?.value);
  const { theme } = getTypedSettings();

  return (
    <html
      lang="fr"
      data-theme={theme}
      className={cn("h-full antialiased", serverThemeClass(theme))}
      suppressHydrationWarning
    >
      <head>
        {/* Follows prefers-color-scheme while data-theme is "system"; does nothing otherwise. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
```

3. Replace

```tsx
          {/* Opens expanded so the nav labels and group headings are actually
              visible; the SidebarTrigger in AppSidebar's header collapses it
              back to the 4rem icon rail (width matched to the old fixed rail). */}
          <SidebarProvider style={{ "--sidebar-width-icon": "4rem" } as React.CSSProperties}>
```

with

```tsx
          {/* Reopens in the state the user left it (sidebar_state cookie written
              by ui/sidebar.tsx), expanded when there is no cookie yet. The
              SidebarTrigger in AppSidebar's header collapses it back to the 4rem
              icon rail (width matched to the old fixed rail). */}
          <SidebarProvider defaultOpen={sidebarOpen} style={{ "--sidebar-width-icon": "4rem" } as React.CSSProperties}>
```

The two pre-existing `style` props in this file (body font, sidebar icon width) are left untouched.

- [ ] **Step 6: Create the Apparence section and page**

Create `src/components/settings/ApparenceSection.tsx`:

```tsx
"use client";

import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { THEMES, type Theme } from "@/lib/settings-schema";
import { applyTheme } from "@/lib/theme";
import FieldError from "./FieldError";
import SettingsFormCard from "./SettingsFormCard";
import { useSettingsForm } from "./use-settings-form";

const KEYS = ["theme"] as const;

const THEME_LABELS: Record<Theme, string> = { dark: "Sombre", light: "Clair", system: "Système" };

export default function ApparenceSection() {
  // The saved theme is applied at once; the root layout renders it on the next load.
  const form = useSettingsForm(KEYS, { onSaved: (values) => applyTheme(values.theme) });

  return (
    <SettingsFormCard title="Apparence" description="Thème de l'interface." form={form}>
      {(values) => (
        <div className="grid gap-2">
          <Label>Thème</Label>
          <ToggleGroup
            variant="outline"
            aria-label="Thème"
            value={[values.theme]}
            onValueChange={(value) => {
              const next = THEMES.find((theme) => theme === value[0]);
              if (next) form.setValue("theme", next);
            }}
          >
            {THEMES.map((theme) => (
              <ToggleGroupItem key={theme} value={theme}>
                {THEME_LABELS[theme]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-sm text-muted-foreground">Le canvas et ses nœuds restent sombres.</p>
          <FieldError message={form.issues.theme} />
        </div>
      )}
    </SettingsFormCard>
  );
}
```

Create `src/app/reglages/apparence/page.tsx`:

```tsx
import ApparenceSection from "@/components/settings/ApparenceSection";

export const metadata = { title: "Apparence · Réglages · ThumbGen" };

export default function ApparencePage() {
  return <ApparenceSection />;
}
```

- [ ] **Step 7: Type-check, full suite and production build**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
THUMBGEN_DB_PATH="$(mktemp -d)/thumbgen.db" ./node_modules/.bin/next build
```

(`next build` imports route modules while collecting page data, and the agent route starts its GC loop against the database — hence the throwaway `THUMBGEN_DB_PATH`, never the live `data/thumbgen.db`.)

Expected: `tsc` exits 0; all tests pass; `next build` succeeds and lists `/reglages`, the seven `/reglages/<section>` routes and the new `/api/settings/test` and `/api/data/*` routes. A build error such as « Module not found: Can't resolve 'fs' » means a client component imports a server module — fix the import (only `import type` may reference `@/lib/settings`, `@/lib/connection-tests` or `@/lib/data-admin` from client code). Remove the local `.next` build output afterwards only if it gets in the way of `next dev`.

- [ ] **Step 8: Check in the browser (throwaway dev server on port 3100)**

- `http://localhost:3100/reglages/apparence`: choose « Clair », save → the page turns light immediately, without a reload; reload → still light. Choose « Système », save → matches the OS appearance; switch the OS appearance → the page follows. Choose « Sombre », save → dark again.
- Open a canvas in light mode → the canvas and its nodes stay dark.
- Collapse the sidebar with its trigger, reload → it stays collapsed; expand, reload → stays expanded.

- [ ] **Step 9: Commit**

```bash
git add src/lib/theme.ts src/app/layout.tsx src/components/settings/ApparenceSection.tsx src/app/reglages/apparence/page.tsx tests/settings/theme.test.ts
git commit -m "feat(reglages): appearance section with dark, light and system themes; sidebar remembers its state"
```

---

## Task 12: Docker rebuild and live verification of every section

**Files:** none modified (verification only). If a check fails, fix it in the file owned by the relevant earlier task, re-run `tsc` + `vitest`, commit with a `fix(reglages): …` message, then rebuild.

**Safety rules for this task.** The container serves the user's real database and real API keys.
- Restore every value you change for a check to its original value before moving on.
- Do **not** confirm « Supprimer la clé », a backup deletion or « Nettoyer » in this live app: open each dialog, verify its text, then click « Annuler ». Those confirmed paths are covered by Tasks 5, 9 and 10.
- Do not click the download icon in the browser (it saves a file); verify the download with `curl` into `/dev/null` instead.
- Do not click « Régénérer » in the MCP card.
- If a login page appears (`SITE_PASSWORD` set), stop and ask the user to log in; never type a password.

- [ ] **Step 1: Make sure `main` is green**

```bash
git status --short
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
```

Expected: clean working tree for this feature's files; `tsc` exits 0; all tests pass.

- [ ] **Step 2: Rebuild and restart the container**

```bash
docker compose build thumbgen && docker compose up -d thumbgen
docker compose ps
until curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/reglages | grep -qE "^(200|307|308)$"; do sleep 2; done
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/reglages
docker compose logs --tail 50 thumbgen
```

Expected: the build succeeds; `thumbgen` is « Up »; `/reglages` answers `307` redirecting to `/reglages/connexions`; the logs show no error.

- [ ] **Step 3: API smoke checks (read-only)**

```bash
curl -s http://localhost:3000/api/settings | /opt/anaconda3/bin/python3 -m json.tool | head -60
curl -s http://localhost:3000/api/data/stats
curl -s http://localhost:3000/api/data/backups
curl -s http://localhost:3000/api/data/cleanup
```

Expected: `/api/settings` shows `openrouterApiKey`/`openaiApiKey`/`youtubeApiKey`/`mcpApiKey` as `{ configured, preview, source }` objects (no raw key anywhere), `agentWebSearch` as a boolean, `sitePasswordEnabled` as a boolean, and no `geminiApiKey`/`hasGemini`. The data endpoints return JSON; the backup list includes the existing `thumbgen.db.*` copies flagged `legacy: true`.

- [ ] **Step 4: Navigation and layout**

Open `http://localhost:3000/miniatures` in the browser pane, click « Réglages » in the sidebar:
- URL becomes `/reglages/connexions`; the sidebar item is active; the section menu lists the 7 sections in order with their icons, « Connexions des modèles » highlighted.
- Click each menu entry: the URL and highlight follow. The page scrolls inside the content area.
- Resize the viewport to 375 px wide: the menu is a `Select`; choosing « Apparence » navigates. Reset the viewport afterwards.

- [ ] **Step 5: Connexions des modèles**

- Three cards with the usage sentences from the spec; badges match Step 3's `source` values (« Configurée · …xxxx » for stored keys).
- « Enregistrer » is disabled with an empty field.
- Click « Tester » on each card: OpenRouter shows « Clé valide · consommation … » (plus limit info when present), OpenAI « Clé valide », YouTube « Clé valide · 1 unité de quota utilisée » — or a short `HTTP <status> · …` error if a key is actually invalid; no key text in any result.
- Click « Supprimer la clé » on one card: the dialog opens with its warning → « Annuler ».

- [ ] **Step 6: Agent IA**

- « Enregistrer » disabled on load. Change « Étapes max par réponse » from its current value (note it) to another value in 5–50 → enabled → save → « Enregistré » → reload → kept. Put the original value back and save.
- Enter 99 → save → « Entre 5 et 50 étapes » under the field; reload to discard.
- Select « GPT-5 » → effort toggle disabled with the explanation; reload to discard.

- [ ] **Step 7: Génération d'images**

- Note the current values. Set « Résolution par défaut » to a different value, save, reload → kept.
- Open an existing miniature canvas, right-click the empty canvas → « Générateur »: the new node shows the default model, format, image count and the chosen resolution highlighted. Delete that test node (select it, press Delete).
- Back in Réglages, restore the original values and save.

- [ ] **Step 8: Ma chaîne**

- The current `youtubePlaylistId` value is prefilled in « Chaîne YouTube ». Note the other fields.
- Type `Test réglages` in « Nom de la chaîne », save, reload → kept. Put back the original value (empty if it was empty) and save.
- Add a colour, type `red` in its hex field, save → « Couleur au format #RRGGBB »; reload to discard.
- The « Personnage par défaut » select lists « Aucun » and the existing personas by name.

- [ ] **Step 9: Intégrations**

- MCP card: masked token, « Config Claude Desktop » expands.
- Password card shows « Activé » or « Désactivé » consistent with:

```bash
docker compose exec thumbgen sh -c 'test -n "$SITE_PASSWORD" && echo set || echo unset'
```

- [ ] **Step 10: Données & sauvegardes**

- « Stockage » shows a size close to `ls -lh data/thumbgen.db` plus the WAL, and non-zero counts.
- « Créer une sauvegarde » → a new `thumbgen-YYYYMMDD-HHMMSS.db` row appears. Verify its file and download without saving it:

```bash
ls -lh data/backups/
curl -s -D - -o /dev/null "http://localhost:3000/api/data/backups/download?name=<the new file name>" | grep -i "content-disposition\|content-length"
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/data/backups/download?name=..%2Fthumbgen.db"
```

Expected: the file exists; `content-disposition: attachment; filename="<name>"` and a `content-length` equal to its size; the traversal attempt returns `400`.
- Trash icon on that new backup → the dialog names the file → « Annuler ». (The backup stays on disk; mention it in your report so the user can keep or delete it.)
- « Nettoyer… » → the dialog shows the number of affected items → « Annuler ».

- [ ] **Step 11: Apparence**

- Note the current theme. Choose « Clair », save → the page turns light immediately without reload; reload → still light (server-rendered). Choose « Système », save → matches the OS appearance. Open a canvas → canvas and nodes stay dark. Restore the original theme and save.
- Collapse the sidebar, reload → stays collapsed; expand it again, reload → stays expanded.

- [ ] **Step 12: Final log check and report**

```bash
docker compose logs --tail 100 thumbgen | grep -i "error\|warn" || echo "no errors"
```

Expected: no new errors (a `[settings] … invalid stored value` warning would mean a stored value failed validation — report which key). Report: every check above with pass/fail, the backup file created in Step 10, and any fix commits.

---

## Self-review against the spec

- Routes & layout, redirect, menu order/labels/icons, `Select` under `md`, sidebar wiring, `SettingsPanel` removal, `McpSettingsSection` reuse → Task 4 (icons: ruling 2).
- Typed schema (types, bounds, defaults, secret marker, `ENV_FALLBACK`, invalid value → default + warn, partial strict writes in a transaction, text storage, `"1"`/`"0"` compatibility, removed keys, `getSetting` kept) → Task 2 (location: ruling 1; defaults filling: ruling 5).
- API GET/POST/DELETE with masked secrets, issues, blank secret ignored, env-source reporting → Task 2; `/api/settings/test` with 10 s timeout and no key leak → Task 3; readers of the old shape → Tasks 1, 4, 7 (ruling 7).
- Saving UX (Card + form, dirty-only save, « Enregistré » 2 s, per-field issues, destructive alert, secret fields with badge/test/delete, secret cleared after save) → Tasks 5–6.
- Section 1 + dead code/Docker removal → Tasks 1, 5. Section 2 (model, web search, effort, max steps, auto-title, `<response_language>`, French line removed) → Task 6. Section 3 (defaults, star unchanged, `imageSize` → `resolution`, thumbnail language) → Tasks 6–7 (rulings 6, 12). Section 4 (`channelProfile`, persona validation, `<channel_profile>` placement, deleted persona omitted) → Tasks 2, 8 (rulings 9, 10). Section 5 → Task 4. Section 6 (stats, backups with whitelist and 409, manual restore procedure, cleanup with counts + confirmation + VACUUM) → Tasks 9–10. Section 7 (theme via layout, system script, immediate apply, help text, sidebar cookie) → Task 11 (ruling 11).
- Spec test list → Tasks 2, 3, 6, 7, 8, 9, 11. Manual browser verification list → Task 12.
- Out of scope respected: no YouTube OAuth, no budget, no restore from UI, no editable site password, no light canvas.

