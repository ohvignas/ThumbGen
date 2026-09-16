# Canvas — ajout d'étapes et Personnages partout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home-made add-node menus with a data-driven node catalogue, an n8n-style « Ajouter une étape » side panel (free and wire-connect modes), an empty-canvas invitation, shadcn context menus with keyboard shortcuts, and make Personnages the only face input across the canvas, the library and the agent.

**Architecture:** A pure catalogue module (`src/lib/canvas/node-catalog.ts`) describes every addable step and its handles; pure helpers compute compatibility, placement, menu items and shortcut matching (all unit-tested). The canvas Zustand store owns one `nodePicker` state that every entry point opens (empty state, `N`, context menu, wire dropped on empty space, and later the generator's « + Ajouter » buttons from chantier B). Single-photo face nodes are converted to reference images on project load; face_reactions code paths are removed from the UI, the agent tools, the blueprint schema and the API.

**Tech Stack:** Next.js 16.2 App Router, React 19.2, TypeScript strict, Tailwind v4, shadcn `base-nova` on Base UI (`@base-ui/react` 1.8), `@xyflow/react` 12.10, Zustand 5, zod 4, `@dagrejs/dagre` 3, better-sqlite3 12, vitest 4, lucide-react 1.46.

**Spec:** `docs/superpowers/specs/2026-09-16-canvas-ajout-etapes-design.md` — the binding authority. Read it before starting any task. Deviations are listed under « Code reality vs spec » with the ruling taken.

## Global Constraints

- **Preflight — the Réglages plan must already be on `main`.** This plan runs after `docs/superpowers/plans/2026-09-16-reglages-page.md`. Before Task 1, run:
  ```bash
  git checkout main && git pull --ff-only 2>/dev/null; git log --oneline -1
  test -f src/hooks/useGeneratorDefaults.ts && test -f src/lib/generator-defaults.ts && echo "reglages OK"
  grep -n "hasGemini\|setProviders" src/components/Canvas.tsx
  ```
  Expected: `reglages OK`, and the grep prints nothing. If not, STOP and report that the Réglages plan has not landed.
- **Shared files — always re-read before editing, never trust line numbers.** The Réglages plan (and parallel chat work) edits `src/components/Canvas.tsx`, `src/components/nodes/GeneratorNode.tsx`, `src/components/panels/AppSidebar.tsx`, `src/store/canvas-store.ts`, `src/lib/agent/system-prompt.ts`, `src/lib/agent/v2/route-handler.ts`, `src/components/panels/ChatPanel.tsx`, `tests/agent/system-prompt.test.ts`. Before editing any of them, pull the latest `main` and re-read the whole file. Every edit in this plan is anchored on code content (identifiers, quoted snippets). If an anchor is not found verbatim, locate the equivalent code by its identifiers and apply the same change; if the code was removed, skip that sub-step and say so in your report.
- **Shared interface contract (chantier B depends on these exact names — do not rename):**
  ```ts
  // src/store/canvas-store.ts
  export type NodePickerState =
    | { mode: "free"; flowPos?: { x: number; y: number } }
    | { mode: "connect"; flowPos?: { x: number; y: number }; from: { nodeId: string; handleId: string; handleType: "source" | "target" } };
  nodePicker: NodePickerState | null;
  openNodePicker: (state: NodePickerState) => void;
  closeNodePicker: () => void;
  duplicateNode: (nodeId: string) => string; // returns new id ("" if nodeId is unknown)

  // src/lib/canvas/node-catalog.ts
  export type CatalogEntry = { id: string; category: "entrees" | "generation" | "finition"; title: string; description: string; keywords: string[]; icon: LucideIcon; nodeType: string; initialData?: Record<string, unknown>; inputs: { handle: string; accepts: string[] }[]; output?: { handle: string } };
  export const NODE_CATALOG: CatalogEntry[];
  export function searchCatalog(query: string, entries?: CatalogEntry[]): CatalogEntry[];
  export function compatibleEntries(from: { nodeType: string; handleId: string; handleType: "source" | "target"; data?: Record<string, unknown> }): Array<{ entry: CatalogEntry; newNodeHandle: string }>;
  ```
  Connect mode opened without `flowPos` places the new node 320 px left of the anchor node (same y) when `handleType` is `"target"`, 320 px right when `"source"`.
- **Commands.** Tests: `./node_modules/.bin/vitest run` (one file: `./node_modules/.bin/vitest run tests/path/file.test.ts`). Types: `./node_modules/.bin/tsc --noEmit`. Lint (touched files only): `./node_modules/.bin/eslint <files>` — no new **errors** allowed (existing `no-img-element` warnings are fine). `npx` is broken in this shell.
- **Stale Next validators.** When a task deletes a route and `tsc` errors appear *only* under `.next/types` or `.next/dev/types`, run `rm -rf .next/types .next/dev/types` and re-run `tsc`.
- **Tests use an isolated temp DB** (`tests/setup.ts` sets `THUMBGEN_DB_PATH`). New pure/store tests go under `tests/canvas/`, agent tests stay under `tests/agent/`. Environment is `node` (importing `@xyflow/react`, `zustand` and `lucide-react` works there).
- **Intermediate browser checks use a throwaway dev server**, never the Docker app. Docker serves `http://localhost:3000` from the real `data/thumbgen.db`; never point a second process at that file. Start: `THUMBGEN_DB_PATH="$(mktemp -d)/thumbgen.db" ./node_modules/.bin/next dev -p 3100` (run it in the background), browse `http://localhost:3100`, stop it when the check is done. With the empty DB, create a canvas through `/miniatures` → « Nouvelle miniature ». **Only Task 11 rebuilds Docker — exactly once.** The user is actively using the app.
- **shadcn here is `base-nova` on Base UI, not Radix.** Check `src/components/ui/*.tsx` before writing JSX. `DropdownMenuItem` has no `onSelect` (use `onClick`); `DropdownMenuLabel` must sit inside `DropdownMenuGroup`; `ToggleGroup` uses arrays (`value={[x]}`, `onValueChange={(v) => { const next = v[0]; if (next) setX(next); }}`); `Select`'s `onValueChange` receives `string | null` and takes `items={[{ value, label }]}` so `<SelectValue />` shows labels; triggers use `render={<Button … />}`. Available: `sheet.tsx`, `dropdown-menu.tsx` (with `DropdownMenuShortcut`), `input-group.tsx`, `empty.tsx`, `select.tsx`, `dialog.tsx` (with `DialogFooter`), `label.tsx`, `input.tsx`, `button.tsx`. There is no `Kbd` component.
- **Positioning a menu at a click point:** reuse the existing approach of `src/components/panels/ContextMenu.tsx` — a `position: fixed` 1×1 `<span>` rendered as the `DropdownMenuTrigger` anchor. A `position: fixed` style on `DropdownMenuContent` itself lands offset (the Positioner's transform becomes its containing block).
- **`cn` is imported from the npm package `"cn"`** (`import { cn } from "cn"`).
- **Styling.** Canvas nodes keep their own dark tokens (`--ink-*`, `--canvas-*`, `--node-*`, `--surface`, `--text-*`); lines this plan writes inside node components use Tailwind arbitrary-variable classes (`bg-(--surface)`, `text-(--text-muted)`). New canvas-level UI (picker sheet, empty state, menus, dialogs) uses shadcn components and tokens. No new `style={{…}}` objects except the menu anchor's dynamic coordinates.
- **UI copy is French.** In JSX text use `&apos;` for apostrophes.
- **Commit only the files a task lists** — never `git add -A` / `git add .`. Deleted files are staged with `git rm`. Never touch `docs/superpowers/plans/2026-09-16-reglages-page.md`.

## Code reality vs spec (rulings)

1. **The ZoomBar layout is not dagre.** `ZoomBar.tsx` has a hand-written BFS column layout; the spec calls it « (dagre) ». Ruling: the shared `useAutoLayout` hook uses the existing, tested dagre helper `autoLayout` from `src/lib/agent/tools/_helpers/auto-layout.ts` (same layout as `apply_workflow`); the BFS code is removed.
2. **Logo vs reference cannot be told apart from `nodeType`.** Both are `swipeFile` with output `image`, yet they plug into `logo-in` vs `ref-in` — the exact bug the spec wants fixed. Ruling: `compatibleEntries`'s `from` gets an **optional, additive** `data?: Record<string, unknown>` (the source node's data; calls without it still type-check). `catalogIdForNode` treats a `swipeFile` as a logo when `data.kind === "logo"`, or its `imageUrl` starts with `/api/logos/`, or its `image_source` starts with `stored:lg_`. `NodeData` gains `kind?: "reference" | "logo"`, set by the catalogue, the sidebar Logos tab, the generator's Logo/Référence buttons and `apply_workflow`.
3. **« fil depuis `result` → Aperçu / Texte / Générateur via `ref-in` »** conflicts with the handle table (`ref-in` accepts reference/aperçu/texte, not générateur). Ruling: the table wins. Generator `result` → Texte (`image-in`), Aperçu (`preview-in`); Texte `result` → Générateur (`ref-in`), Aperçu (`preview-in`).
4. **`GET /api/face-reactions/image` still has callers in saved data.** Legacy sidebar faces were added with `imageUrl: /api/face-reactions/image?f=…`, and `saveProject` strips `imageBase64` whenever `imageUrl` exists, so converted nodes only render through that route. Ruling: keep that one read-only route (and its `src/middleware.ts` public exemption, and the `face_reactions` table); delete every other face-reactions route, the tagging helper `src/lib/agent/vision.ts`, and their tests.
5. **Callers the spec does not list:** the chat library picker (`src/components/panels/chat/LibraryPickerModal.tsx`, « Visages » tab on `/api/face-reactions`) now lists Personnages; `ChatPanel.tsx`'s `summarizeNode` and `get_canvas_state` summarise a faceReference by its persona ref; `PromptNode.tsx` counts faces by `personaId`; `generate_sketch` and `list_personas` descriptions stop mentioning `stored:fr_` / `list_face_reactions`.
6. **`stored:fr_` leaves the whole image-source vocabulary** (general `ImageSourceSchema`, `resolveImageSource`, `imageExists`), not only `faceReference.image_source`, since nothing may resolve face_reactions any more.
7. **« Créer un personnage » needs to open the library tab from inside a node.** The sidebar's `activeTab` was local state. Ruling: lift it into a tiny Zustand store `src/store/library-store.ts`. Side effect: an open flyout stays open across client navigation (« Mes miniatures » still closes it).
8. **Import par angle.** The API accepts any subset of angles; the webcam wizard requires all three. Ruling: the import dialog requires the front photo, profiles are optional.
9. **Shortcut keys.** On macOS Option rewrites `event.key` (⇧⌥T gives `ˇ`), so `⇧⌥T` matches `event.code === "KeyT"`; letters `N`, `A`, `D` match `event.key` (layout-aware, AZERTY-safe). Shortcuts are ignored while a dialog, menu or the Excalidraw sketch editor is open.
10. **Opening the sheet at the end of a pointer gesture** (context-menu item, wire released) is deferred with `window.setTimeout(…, 0)` so the gesture's trailing click cannot land on the sheet backdrop and dismiss it. Keyboard and plain button opens are immediate.
11. **The sheet is modal with a light backdrop** — `ui/sheet.tsx` always renders `SheetOverlay`. Clicking the backdrop or pressing Échap closes it.
12. **`duplicateNode` on an unknown id** returns `""` and changes nothing (the contract returns `string`).

## File Structure

**Create**
- `src/lib/canvas/node-catalog.ts` — catalogue entries, categories, handle labels, search, compatibility.
- `src/lib/canvas/migrate-canvas.ts` — load-time migrations (legacy `image-in` handle, single-photo face nodes).
- `src/lib/canvas/placement.ts` — where a new node lands (view centre, next to an anchor).
- `src/lib/canvas/picker-actions.ts` — picker entries, subtitle and the add plan (pure).
- `src/lib/canvas/context-menus.ts` — pane / node context menu items (pure).
- `src/lib/canvas/shortcuts.ts` — shortcut matcher, editable-target and open-overlay guards (pure).
- `src/lib/personas.ts` — persona angle labels, image URL, node data, chat picker item.
- `src/store/library-store.ts` — sidebar library tab state.
- `src/hooks/useAutoLayout.ts`, `src/hooks/useCanvasShortcuts.ts`
- `src/components/panels/NodePicker.tsx`, `src/components/panels/CanvasEmptyState.tsx`, `src/components/panels/PersonaImportDialog.tsx`
- Tests: `tests/canvas/node-catalog.test.ts`, `tests/canvas/canvas-store.test.ts`, `tests/canvas/migrate-canvas.test.ts`, `tests/canvas/picker-actions.test.ts`, `tests/canvas/context-menus.test.ts`, `tests/canvas/shortcuts.test.ts`, `tests/canvas/personas.test.ts`, `tests/canvas/library-store.test.ts`

**Modify**
- `src/store/canvas-store.ts`, `src/components/Canvas.tsx`, `src/components/panels/ContextMenu.tsx` (rewrite), `src/components/panels/ZoomBar.tsx`, `src/components/nodes/FaceReferenceNode.tsx` (rewrite), `src/components/nodes/SwipeFileNode.tsx`, `src/components/nodes/PromptNode.tsx`, `src/components/nodes/GeneratorNode.tsx`, `src/components/panels/AppSidebar.tsx`, `src/components/panels/ChatPanel.tsx`, `src/components/panels/chat/LibraryPickerModal.tsx`
- `src/lib/agent/blueprint/schema.ts`, `src/lib/agent/tools/_helpers/image-source.ts`, `src/lib/agent/tools/apply-workflow.ts`, `src/lib/agent/tools/get-canvas-state.ts`, `src/lib/agent/tools/generate-sketch.ts`, `src/lib/agent/tools/list-personas.ts`, `src/lib/agent/tools/all.ts`, `src/lib/agent/tool-labels.ts`, `src/lib/agent/system-prompt.ts`, `src/app/api/face-reactions/image/route.ts` (comment only)
- Tests: `tests/agent/blueprint-schema.test.ts`, `tests/agent/image-source.test.ts`, `tests/agent/apply-workflow.test.ts`, `tests/agent/get-canvas-state.test.ts`, `tests/agent/generate-sketch.test.ts`, `tests/agent/registry-full.test.ts`, `tests/agent/mcp-server.test.ts`, `tests/agent/system-prompt.test.ts`

**Delete**
- `src/lib/agent/tools/list-face-reactions.ts`, `src/lib/agent/vision.ts`
- `src/app/api/face-reactions/route.ts`, `src/app/api/face-reactions/analyze-untagged/route.ts`, `src/app/api/face-reactions/rename/route.ts`
- `tests/agent/list-face-reactions.test.ts`, `tests/agent/rename-face-reaction-route.test.ts`

---

## Task 1: Node catalogue

**Files:**
- Create: `src/lib/canvas/node-catalog.ts`
- Test: `tests/canvas/node-catalog.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (exact names):
  - `type CatalogEntry` (contract above), `const NODE_CATALOG: CatalogEntry[]`
  - `const CATALOG_CATEGORIES: { id: CatalogEntry["category"]; label: string }[]`
  - `const HANDLE_LABELS: Record<string, string>`, `function handleLabel(handleId: string): string`
  - `function normalizeSearchText(text: string): string`
  - `function searchCatalog(query: string, entries?: CatalogEntry[]): CatalogEntry[]`
  - `function catalogIdForNode(node: { type?: string; data?: Record<string, unknown> }): string | undefined`
  - `function compatibleEntries(from: { nodeType: string; handleId: string; handleType: "source" | "target"; data?: Record<string, unknown> }): Array<{ entry: CatalogEntry; newNodeHandle: string }>`

- [ ] **Step 1: Write the failing test**

Create `tests/canvas/node-catalog.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  NODE_CATALOG,
  CATALOG_CATEGORIES,
  catalogIdForNode,
  compatibleEntries,
  handleLabel,
  normalizeSearchText,
  searchCatalog,
} from "@/lib/canvas/node-catalog";

const ids = (entries: { id: string }[]) => entries.map((e) => e.id);
const pairs = (matches: ReturnType<typeof compatibleEntries>) =>
  matches.map((m) => `${m.entry.id}:${m.newNodeHandle}`);

describe("NODE_CATALOG", () => {
  it("lists the v1 steps in display order", () => {
    expect(ids(NODE_CATALOG)).toEqual([
      "prompt",
      "personnage",
      "reference",
      "logo",
      "croquis",
      "generateur",
      "texte",
      "apercu",
    ]);
  });

  it("keeps each category contiguous and in CATALOG_CATEGORIES order", () => {
    const order = CATALOG_CATEGORIES.map((c) => c.id);
    const seen = NODE_CATALOG.map((e) => order.indexOf(e.category));
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(CATALOG_CATEGORIES.map((c) => c.label)).toEqual(["Entrées", "Génération", "Finition"]);
  });

  it("only accepts catalogue ids that exist and have an output", () => {
    const byId = new Map(NODE_CATALOG.map((e) => [e.id, e]));
    for (const entry of NODE_CATALOG) {
      for (const input of entry.inputs) {
        for (const accepted of input.accepts) {
          expect(byId.get(accepted)?.output, `${entry.id}.${input.handle} ← ${accepted}`).toBeDefined();
        }
      }
    }
  });

  it("maps logo and reference to swipeFile with their kind", () => {
    const logo = NODE_CATALOG.find((e) => e.id === "logo")!;
    const reference = NODE_CATALOG.find((e) => e.id === "reference")!;
    expect(logo).toMatchObject({ nodeType: "swipeFile", initialData: { kind: "logo" }, output: { handle: "image" } });
    expect(reference).toMatchObject({ nodeType: "swipeFile", initialData: { kind: "reference" }, output: { handle: "image" } });
  });
});

describe("searchCatalog", () => {
  it("returns every entry, in order, for an empty or blank query", () => {
    expect(ids(searchCatalog(""))).toEqual(ids(NODE_CATALOG));
    expect(ids(searchCatalog("   "))).toEqual(ids(NODE_CATALOG));
  });

  it("ignores case and accents", () => {
    expect(normalizeSearchText("Aperçu GÉNÉRATEUR")).toBe("apercu generateur");
    expect(ids(searchCatalog("apercu"))).toEqual(["apercu"]);
    expect(ids(searchCatalog("GÉNÉRATEUR"))).toEqual(["generateur"]);
  });

  it("matches keywords", () => {
    expect(ids(searchCatalog("visage"))).toEqual(["personnage"]);
    expect(ids(searchCatalog("marque"))).toEqual(["logo"]);
    expect(ids(searchCatalog("dessin"))).toEqual(["croquis"]);
  });

  it("matches title, description and keywords while keeping catalogue order", () => {
    expect(ids(searchCatalog("image"))).toEqual(["reference", "generateur", "texte"]);
  });

  it("requires every word of a multi-word query", () => {
    expect(ids(searchCatalog("image reference"))).toEqual(["reference"]);
  });

  it("returns nothing when no entry matches", () => {
    expect(searchCatalog("zzz")).toEqual([]);
  });

  it("filters the given entries instead of the full catalogue", () => {
    const subset = NODE_CATALOG.filter((e) => e.id === "apercu" || e.id === "texte");
    expect(ids(searchCatalog("", subset))).toEqual(["texte", "apercu"]);
    expect(ids(searchCatalog("logo", subset))).toEqual([]);
  });
});

describe("catalogIdForNode", () => {
  it("resolves plain node types to their entry", () => {
    expect(catalogIdForNode({ type: "prompt" })).toBe("prompt");
    expect(catalogIdForNode({ type: "faceReference" })).toBe("personnage");
    expect(catalogIdForNode({ type: "sketch" })).toBe("croquis");
    expect(catalogIdForNode({ type: "generator" })).toBe("generateur");
    expect(catalogIdForNode({ type: "textOverlay" })).toBe("texte");
    expect(catalogIdForNode({ type: "preview" })).toBe("apercu");
    expect(catalogIdForNode({ type: "unknown" })).toBeUndefined();
  });

  it("tells a logo swipeFile from a reference one", () => {
    expect(catalogIdForNode({ type: "swipeFile", data: { kind: "logo" } })).toBe("logo");
    expect(catalogIdForNode({ type: "swipeFile", data: { imageUrl: "/api/logos/image?f=abc" } })).toBe("logo");
    expect(catalogIdForNode({ type: "swipeFile", data: { image_source: "stored:lg_abc" } })).toBe("logo");
    expect(catalogIdForNode({ type: "swipeFile", data: { kind: "reference" } })).toBe("reference");
    expect(catalogIdForNode({ type: "swipeFile" })).toBe("reference");
  });
});

describe("compatibleEntries — wire dragged from an input (target) handle", () => {
  const target = (nodeType: string, handleId: string) =>
    pairs(compatibleEntries({ nodeType, handleId, handleType: "target" }));

  it("generator inputs", () => {
    expect(target("generator", "prompt-in")).toEqual(["prompt:prompt"]);
    expect(target("generator", "face-in")).toEqual(["personnage:face"]);
    expect(target("generator", "ref-in")).toEqual(["reference:image", "texte:result", "apercu:preview-out"]);
    expect(target("generator", "logo-in")).toEqual(["logo:image"]);
    expect(target("generator", "sketch-in")).toEqual(["croquis:image"]);
  });

  it("text overlay and preview inputs", () => {
    expect(target("textOverlay", "image-in")).toEqual(["generateur:result", "apercu:preview-out"]);
    expect(target("preview", "preview-in")).toEqual(["generateur:result", "texte:result"]);
  });

  it("returns nothing for an unknown handle", () => {
    expect(target("generator", "prompt-in-z")).toEqual([]);
    expect(target("nope", "prompt-in")).toEqual([]);
  });
});

describe("compatibleEntries — wire dragged from an output (source) handle", () => {
  const source = (nodeType: string, handleId: string, data?: Record<string, unknown>) =>
    pairs(compatibleEntries({ nodeType, handleId, handleType: "source", data }));

  it("inputs plug into the matching generator handle", () => {
    expect(source("prompt", "prompt")).toEqual(["generateur:prompt-in"]);
    expect(source("faceReference", "face")).toEqual(["generateur:face-in"]);
    expect(source("sketch", "image")).toEqual(["generateur:sketch-in"]);
  });

  it("a Logo goes to logo-in, a reference image to ref-in", () => {
    expect(source("swipeFile", "image", { kind: "logo" })).toEqual(["generateur:logo-in"]);
    expect(source("swipeFile", "image", { imageUrl: "/api/logos/image?f=x" })).toEqual(["generateur:logo-in"]);
    expect(source("swipeFile", "image", { kind: "reference" })).toEqual(["generateur:ref-in"]);
    expect(source("swipeFile", "image")).toEqual(["generateur:ref-in"]);
  });

  it("results feed the finishing steps", () => {
    expect(source("generator", "result")).toEqual(["texte:image-in", "apercu:preview-in"]);
    expect(source("textOverlay", "result")).toEqual(["generateur:ref-in", "apercu:preview-in"]);
    expect(source("preview", "preview-out")).toEqual(["generateur:ref-in", "texte:image-in"]);
  });

  it("returns nothing when the handle is not the node's output", () => {
    expect(source("generator", "prompt-in")).toEqual([]);
    expect(source("nope", "result")).toEqual([]);
  });
});

describe("handleLabel", () => {
  it("names handles in French and falls back to the raw id", () => {
    expect(handleLabel("logo-in")).toBe("Logo");
    expect(handleLabel("ref-in")).toBe("Image de référence");
    expect(handleLabel("result")).toBe("Résultat");
    expect(handleLabel("mystery")).toBe("mystery");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/canvas/node-catalog.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/canvas/node-catalog"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/canvas/node-catalog.ts`:

```ts
import type { LucideIcon } from "lucide-react";
import {
  Eye,
  Hexagon,
  Image as ImageIcon,
  MessageSquareText,
  PenLine,
  Sparkles,
  Type,
  UserRound,
} from "lucide-react";

/**
 * Single source of truth for what the canvas UI can add (« Ajouter une
 * étape » panel, wire dropped on empty space, generator « + Ajouter »).
 *
 * Each entry maps to a React Flow node type (+ initial data) and declares its
 * handles, so the compatibility between a dragged wire and a new node is
 * computed here instead of being hard-coded in Canvas.tsx.
 *
 * `inputs[].accepts` lists catalogue ids, not node types: a `swipeFile` is
 * either a « reference » or a « logo », and they plug into different
 * generator handles.
 */
export type CatalogEntry = {
  id: string;
  category: "entrees" | "generation" | "finition";
  title: string;
  description: string;
  keywords: string[];
  icon: LucideIcon;
  nodeType: string;
  initialData?: Record<string, unknown>;
  inputs: { handle: string; accepts: string[] }[];
  output?: { handle: string };
};

export const CATALOG_CATEGORIES: { id: CatalogEntry["category"]; label: string }[] = [
  { id: "entrees", label: "Entrées" },
  { id: "generation", label: "Génération" },
  { id: "finition", label: "Finition" },
];

export const NODE_CATALOG: CatalogEntry[] = [
  {
    id: "prompt",
    category: "entrees",
    title: "Prompt",
    description: "Décris la miniature en texte.",
    keywords: ["texte", "description", "consigne", "idee", "text"],
    icon: MessageSquareText,
    nodeType: "prompt",
    inputs: [],
    output: { handle: "prompt" },
  },
  {
    id: "personnage",
    category: "entrees",
    title: "Personnage",
    description: "Ton visage sous plusieurs angles, depuis ta bibliothèque.",
    keywords: ["visage", "face", "persona", "moi", "portrait", "character"],
    icon: UserRound,
    nodeType: "faceReference",
    inputs: [],
    output: { handle: "face" },
  },
  {
    id: "reference",
    category: "entrees",
    title: "Image de référence",
    description: "Une image d'inspiration pour le style ou la composition.",
    keywords: ["inspiration", "photo", "style", "composition", "miniature", "reference"],
    icon: ImageIcon,
    nodeType: "swipeFile",
    initialData: { kind: "reference" },
    inputs: [],
    output: { handle: "image" },
  },
  {
    id: "logo",
    category: "entrees",
    title: "Logo",
    description: "Un logo à intégrer dans la miniature.",
    keywords: ["marque", "brand", "icone", "embleme"],
    icon: Hexagon,
    nodeType: "swipeFile",
    initialData: { kind: "logo" },
    inputs: [],
    output: { handle: "image" },
  },
  {
    id: "croquis",
    category: "entrees",
    title: "Croquis",
    description: "Dessine la composition à la main.",
    keywords: ["dessin", "sketch", "esquisse", "brouillon", "draw"],
    icon: PenLine,
    nodeType: "sketch",
    inputs: [],
    output: { handle: "image" },
  },
  {
    id: "generateur",
    category: "generation",
    title: "Générateur",
    description: "Génère la miniature à partir des entrées branchées.",
    keywords: ["generer", "generate", "ia", "ai", "modele", "model", "image"],
    icon: Sparkles,
    nodeType: "generator",
    inputs: [
      { handle: "prompt-in", accepts: ["prompt"] },
      { handle: "face-in", accepts: ["personnage"] },
      { handle: "ref-in", accepts: ["reference", "apercu", "texte"] },
      { handle: "logo-in", accepts: ["logo"] },
      { handle: "sketch-in", accepts: ["croquis"] },
    ],
    output: { handle: "result" },
  },
  {
    id: "texte",
    category: "finition",
    title: "Texte overlay",
    description: "Ajoute un texte par-dessus une image générée.",
    keywords: ["titre", "title", "text", "overlay", "accroche"],
    icon: Type,
    nodeType: "textOverlay",
    inputs: [{ handle: "image-in", accepts: ["generateur", "apercu"] }],
    output: { handle: "result" },
  },
  {
    id: "apercu",
    category: "finition",
    title: "Aperçu",
    description: "Affiche et sélectionne un résultat.",
    keywords: ["preview", "resultat", "voir", "selection"],
    icon: Eye,
    nodeType: "preview",
    inputs: [{ handle: "preview-in", accepts: ["generateur", "texte"] }],
    output: { handle: "preview-out" },
  },
];

export const HANDLE_LABELS: Record<string, string> = {
  prompt: "Prompt",
  face: "Personnage",
  image: "Image",
  result: "Résultat",
  "preview-out": "Aperçu",
  "prompt-in": "Prompt",
  "face-in": "Personnage",
  "ref-in": "Image de référence",
  "logo-in": "Logo",
  "sketch-in": "Croquis",
  "image-in": "Image",
  "preview-in": "Aperçu",
};

export function handleLabel(handleId: string): string {
  return HANDLE_LABELS[handleId] ?? handleId;
}

/** Lower-case, accent-free, trimmed — « Aperçu » and « apercu » compare equal. */
export function normalizeSearchText(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/**
 * Case- and accent-insensitive filter over title, description and keywords.
 * Every word of the query must match somewhere. Keeps the order of `entries`.
 */
export function searchCatalog(query: string, entries: CatalogEntry[] = NODE_CATALOG): CatalogEntry[] {
  const words = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...entries];
  return entries.filter((entry) => {
    const haystack = normalizeSearchText([entry.title, entry.description, ...entry.keywords].join(" "));
    return words.every((word) => haystack.includes(word));
  });
}

/**
 * Which catalogue entry an existing canvas node corresponds to. A swipeFile
 * is a logo when it says so (`kind`), or when it comes from the logo library
 * (older nodes were created without `kind`).
 */
export function catalogIdForNode(node: { type?: string; data?: Record<string, unknown> }): string | undefined {
  if (node.type === "swipeFile") {
    const data = node.data ?? {};
    const isLogo =
      data.kind === "logo" ||
      (typeof data.imageUrl === "string" && data.imageUrl.startsWith("/api/logos/")) ||
      (typeof data.image_source === "string" && data.image_source.startsWith("stored:lg_"));
    return isLogo ? "logo" : "reference";
  }
  return NODE_CATALOG.find((entry) => entry.nodeType === node.type)?.id;
}

/**
 * Entries that can be wired to the handle a wire was dragged from, with the
 * handle to use on the NEW node.
 * - from an output (`source`): entries with an input accepting that node;
 * - from an input (`target`): entries accepted by that input, via their output.
 * `data` is the dragged-from node's data (needed to tell a Logo from a
 * reference image); omitting it is allowed.
 */
export function compatibleEntries(from: {
  nodeType: string;
  handleId: string;
  handleType: "source" | "target";
  data?: Record<string, unknown>;
}): Array<{ entry: CatalogEntry; newNodeHandle: string }> {
  if (from.handleType === "source") {
    const sourceId = catalogIdForNode({ type: from.nodeType, data: from.data });
    const sourceEntry = NODE_CATALOG.find((entry) => entry.id === sourceId);
    if (!sourceEntry || sourceEntry.output?.handle !== from.handleId) return [];
    const matches: Array<{ entry: CatalogEntry; newNodeHandle: string }> = [];
    for (const entry of NODE_CATALOG) {
      const input = entry.inputs.find((candidate) => candidate.accepts.includes(sourceEntry.id));
      if (input) matches.push({ entry, newNodeHandle: input.handle });
    }
    return matches;
  }

  const targetEntry = NODE_CATALOG.find(
    (entry) => entry.nodeType === from.nodeType && entry.inputs.some((input) => input.handle === from.handleId),
  );
  const input = targetEntry?.inputs.find((candidate) => candidate.handle === from.handleId);
  if (!input) return [];
  const matches: Array<{ entry: CatalogEntry; newNodeHandle: string }> = [];
  for (const entry of NODE_CATALOG) {
    if (entry.output && input.accepts.includes(entry.id)) {
      matches.push({ entry, newNodeHandle: entry.output.handle });
    }
  }
  return matches;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/canvas/node-catalog.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Type-check**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/canvas/node-catalog.ts tests/canvas/node-catalog.test.ts
git commit -m "feat(canvas): data-driven node catalogue with search and handle compatibility"
```

---

## Task 2: Canvas store — picker state, duplication, selection

**Files:**
- Modify: `src/store/canvas-store.ts` (shared file — pull `main` and re-read it first)
- Test: `tests/canvas/canvas-store.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces (exact names):
  - `export type NodePickerState` (contract above)
  - store fields/actions: `nodePicker: NodePickerState | null`, `openNodePicker(state)`, `closeNodePicker()`, `duplicateNode(nodeId): string`, `setAllSelected(selected: boolean): void`
  - `NodeData.kind?: "reference" | "logo"`

- [ ] **Step 1: Write the failing test**

Create `tests/canvas/canvas-store.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Edge } from "@xyflow/react";
import { useCanvasStore, type AppNode } from "@/store/canvas-store";

const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, json: async () => ({}) }));

function seed(nodes: AppNode[], edges: Edge[] = []) {
  useCanvasStore.setState({
    nodes,
    edges,
    loaded: true,
    saving: false,
    dirty: false,
    currentProjectId: "store-test",
    history: [{ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }],
    historyIndex: 0,
    nodePicker: null,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
  seed([]);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockClear();
});

describe("node picker state", () => {
  it("starts closed, opens with the given state and closes", () => {
    expect(useCanvasStore.getState().nodePicker).toBeNull();

    useCanvasStore.getState().openNodePicker({ mode: "free", flowPos: { x: 10, y: 20 } });
    expect(useCanvasStore.getState().nodePicker).toEqual({ mode: "free", flowPos: { x: 10, y: 20 } });

    const connect = {
      mode: "connect" as const,
      from: { nodeId: "gen", handleId: "logo-in", handleType: "target" as const },
    };
    useCanvasStore.getState().openNodePicker(connect);
    expect(useCanvasStore.getState().nodePicker).toEqual(connect);

    useCanvasStore.getState().closeNodePicker();
    expect(useCanvasStore.getState().nodePicker).toBeNull();
  });
});

describe("duplicateNode", () => {
  const generator: AppNode = {
    id: "gen",
    type: "generator",
    position: { x: 100, y: 200 },
    data: { model: "gemini-3.1-flash-image", isGenerating: true, generatedImages: ["/img/a.png"] },
  };
  const prompt: AppNode = { id: "p", type: "prompt", position: { x: 0, y: 0 }, data: { prompt: "hello" } };
  const edge: Edge = { id: "e1", source: "p", target: "gen", targetHandle: "prompt-in" };

  it("adds a copy with a new id, offset by +40/+40, without isGenerating and without edges", () => {
    seed([generator, prompt], [edge]);

    const newId = useCanvasStore.getState().duplicateNode("gen");
    const { nodes, edges } = useCanvasStore.getState();

    expect(newId).toBeTruthy();
    expect(newId).not.toBe("gen");
    expect(nodes).toHaveLength(3);
    const copy = nodes.find((n) => n.id === newId)!;
    expect(copy.type).toBe("generator");
    expect(copy.position).toEqual({ x: 140, y: 240 });
    expect(copy.data.model).toBe("gemini-3.1-flash-image");
    expect("isGenerating" in copy.data).toBe(false);
    expect(copy.data.generatedImages).toEqual(["/img/a.png"]);
    expect(edges).toEqual([edge]);
  });

  it("deep-clones data so editing the copy leaves the original untouched", () => {
    seed([generator]);
    const newId = useCanvasStore.getState().duplicateNode("gen");
    const copy = useCanvasStore.getState().nodes.find((n) => n.id === newId)!;
    copy.data.generatedImages!.push("/img/b.png");
    const original = useCanvasStore.getState().nodes.find((n) => n.id === "gen")!;
    expect(original.data.generatedImages).toEqual(["/img/a.png"]);
  });

  it("records the duplication in the undo history", () => {
    seed([generator]);
    useCanvasStore.getState().duplicateNode("gen");
    vi.advanceTimersByTime(300);
    const { history, historyIndex } = useCanvasStore.getState();
    expect(historyIndex).toBe(1);
    expect(history[historyIndex].nodes).toHaveLength(2);
    expect(useCanvasStore.getState().dirty).toBe(true);
  });

  it("returns an empty string and changes nothing for an unknown id", () => {
    seed([generator]);
    expect(useCanvasStore.getState().duplicateNode("missing")).toBe("");
    expect(useCanvasStore.getState().nodes).toHaveLength(1);
  });
});

describe("setAllSelected", () => {
  it("selects every node, then clears nodes and edges, without touching history", () => {
    seed(
      [
        { id: "a", type: "prompt", position: { x: 0, y: 0 }, data: {} },
        { id: "b", type: "prompt", position: { x: 0, y: 100 }, data: {}, selected: true },
      ],
      [{ id: "e", source: "a", target: "b", selected: true }],
    );

    useCanvasStore.getState().setAllSelected(true);
    expect(useCanvasStore.getState().nodes.every((n) => n.selected)).toBe(true);

    useCanvasStore.getState().setAllSelected(false);
    expect(useCanvasStore.getState().nodes.some((n) => n.selected)).toBe(false);
    expect(useCanvasStore.getState().edges.some((e) => e.selected)).toBe(false);

    vi.advanceTimersByTime(3000);
    expect(useCanvasStore.getState().history).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/canvas/canvas-store.test.ts`
Expected: FAIL — `openNodePicker is not a function` (and TypeScript-level unknown properties, which vitest does not check).

- [ ] **Step 3: Add `kind` to `NodeData`**

In `src/store/canvas-store.ts`, inside `export type NodeData = {`, replace

```ts
  imageBase64?: string;
```

(the first occurrence, right after `imageUrl?: string;`) with

```ts
  imageBase64?: string;
  // swipeFile only: a logo plugs into the generator's logo-in, a reference
  // image into ref-in. Older nodes have no kind (see catalogIdForNode).
  kind?: "reference" | "logo";
```

- [ ] **Step 4: Add the picker state type**

Right after `export type AppNode = Node<NodeData>;` add:

```ts
/**
 * « Ajouter une étape » panel. `free`: any step, placed at `flowPos` or at the
 * centre of the view. `connect`: only steps compatible with the handle the
 * wire comes from; the new node is wired to it and placed at `flowPos`, or
 * 320px left (target handle) / right (source handle) of that node.
 */
export type NodePickerState =
  | { mode: "free"; flowPos?: { x: number; y: number } }
  | {
      mode: "connect";
      flowPos?: { x: number; y: number };
      from: { nodeId: string; handleId: string; handleType: "source" | "target" };
    };
```

- [ ] **Step 5: Declare the new state and actions**

In `interface CanvasState`, right after the `removeNode: (nodeId: string) => void;` line, add:

```ts
  duplicateNode: (nodeId: string) => string;
  setAllSelected: (selected: boolean) => void;
  nodePicker: NodePickerState | null;
  openNodePicker: (state: NodePickerState) => void;
  closeNodePicker: () => void;
```

- [ ] **Step 6: Implement them**

In the `create<CanvasState>((set, get) => ({` object, right after the initial `historyIndex: -1,` line, add:

```ts
  nodePicker: null,
```

Then right after the closing `},` of the `removeNode: (nodeId) => { … },` action, add:

```ts
  duplicateNode: (nodeId) => {
    const source = get().nodes.find((n) => n.id === nodeId);
    if (!source) return "";
    const id = uuid();
    const data = JSON.parse(JSON.stringify(source.data)) as NodeData;
    delete data.isGenerating;
    const copy: AppNode = {
      id,
      type: source.type,
      position: { x: source.position.x + 40, y: source.position.y + 40 },
      data,
    };
    set({ nodes: [...get().nodes, copy] });
    if (get().loaded) {
      pushHistory(get, set);
      debouncedSave(get(), set);
    }
    return id;
  },

  // Selection is view state: no history entry, no save.
  setAllSelected: (selected) => {
    set({
      nodes: get().nodes.map((n) => (Boolean(n.selected) === selected ? n : { ...n, selected })),
      edges: selected ? get().edges : get().edges.map((e) => (e.selected ? { ...e, selected: false } : e)),
    });
  },

  openNodePicker: (nodePicker) => set({ nodePicker }),
  closeNodePicker: () => set({ nodePicker: null }),
```

- [ ] **Step 7: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/canvas/canvas-store.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 8: Type-check and full suite**

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run`
Expected: `tsc` exits 0; every test passes.

- [ ] **Step 9: Commit**

```bash
git add src/store/canvas-store.ts tests/canvas/canvas-store.test.ts
git commit -m "feat(canvas): store state for the step picker, node duplication and select-all"
```

---

## Task 3: Convert single-photo face nodes on project load

**Files:**
- Create: `src/lib/canvas/migrate-canvas.ts`
- Modify: `src/store/canvas-store.ts` (`loadProject` — pull `main` and re-read first)
- Test: `tests/canvas/migrate-canvas.test.ts`, `tests/canvas/canvas-store.test.ts` (append)

**Interfaces:**
- Consumes: `AppNode`, `NodeData` (with `kind`) from Task 2.
- Produces: `migrateCanvas(nodes: AppNode[], edges: Edge[]): { nodes: AppNode[]; edges: Edge[]; changed: boolean }`. `loadProject` applies it and, when `changed`, schedules the normal debounced save.

- [ ] **Step 1: Write the failing pure test**

Create `tests/canvas/migrate-canvas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/store/canvas-store";
import { migrateCanvas } from "@/lib/canvas/migrate-canvas";

const generator: AppNode = { id: "gen", type: "generator", position: { x: 400, y: 0 }, data: { model: "m" } };

describe("migrateCanvas", () => {
  it("turns a single-photo faceReference into a reference image and rewires its edges", () => {
    const nodes: AppNode[] = [
      {
        id: "face",
        type: "faceReference",
        position: { x: 0, y: 0 },
        data: { imageUrl: "/api/face-reactions/image?f=abc", imageBase64: "data:image/jpeg;base64,AAAA", label: "Choqué", image_source: "stored:fr_abc" } as AppNode["data"],
      },
      generator,
    ];
    const edges: Edge[] = [
      { id: "e1", source: "face", sourceHandle: "face", target: "gen", targetHandle: "face-in" },
      { id: "e2", source: "prompt", sourceHandle: "prompt", target: "gen", targetHandle: "prompt-in" },
    ];

    const result = migrateCanvas(nodes, edges);

    expect(result.changed).toBe(true);
    expect(result.nodes[0]).toEqual({
      id: "face",
      type: "swipeFile",
      position: { x: 0, y: 0 },
      data: {
        kind: "reference",
        imageUrl: "/api/face-reactions/image?f=abc",
        imageBase64: "data:image/jpeg;base64,AAAA",
        label: "Choqué",
      },
    });
    expect(result.nodes[1]).toBe(generator);
    expect(result.edges[0]).toEqual({ id: "e1", source: "face", sourceHandle: "image", target: "gen", targetHandle: "ref-in" });
    expect(result.edges[1]).toBe(edges[1]);
  });

  it("rewires a null sourceHandle edge (agent-built) on the target side only", () => {
    const nodes: AppNode[] = [
      { id: "face", type: "faceReference", position: { x: 0, y: 0 }, data: { imageBase64: "data:image/png;base64,BBBB" } },
      generator,
    ];
    const edges: Edge[] = [{ id: "e1", source: "face", sourceHandle: null, target: "gen", targetHandle: "face-in" }];
    const result = migrateCanvas(nodes, edges);
    expect(result.edges[0]).toEqual({ id: "e1", source: "face", sourceHandle: null, target: "gen", targetHandle: "ref-in" });
    expect(result.nodes[0].data).toEqual({ kind: "reference", imageBase64: "data:image/png;base64,BBBB" });
  });

  it("keeps Personnage nodes and empty face nodes as they are", () => {
    const persona: AppNode = {
      id: "persona",
      type: "faceReference",
      position: { x: 0, y: 0 },
      data: { personaId: "p1", personaAngles: { front: "/api/personas/image?id=p1&angle=front" }, label: "Antoine" },
    };
    const empty: AppNode = { id: "empty", type: "faceReference", position: { x: 0, y: 200 }, data: {} };
    const edges: Edge[] = [{ id: "e1", source: "persona", sourceHandle: "face", target: "gen", targetHandle: "face-in" }];

    const result = migrateCanvas([persona, empty, generator], edges);

    expect(result.changed).toBe(false);
    expect(result.nodes).toEqual([persona, empty, generator]);
    expect(result.edges).toEqual(edges);
  });

  it("still renames the legacy image-in handle to ref-in", () => {
    const edges: Edge[] = [{ id: "e1", source: "ref", target: "gen", targetHandle: "image-in" }];
    const result = migrateCanvas([generator], edges);
    expect(result.changed).toBe(true);
    expect(result.edges[0].targetHandle).toBe("ref-in");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/canvas/migrate-canvas.test.ts`
Expected: FAIL — cannot resolve `@/lib/canvas/migrate-canvas`.

- [ ] **Step 3: Implement the migration**

Create `src/lib/canvas/migrate-canvas.ts`:

```ts
import type { Edge } from "@xyflow/react";
import type { AppNode, NodeData } from "@/store/canvas-store";

/**
 * Lazy, load-time migrations of a saved canvas. Pure: returns new arrays and
 * whether anything changed, so the store can let the normal autosave persist
 * the result.
 *
 * 1. Edges saved before the generator handle rename point at "image-in";
 *    it is "ref-in" now.
 * 2. Faces are Personnages only. A faceReference holding a single photo (no
 *    persona) becomes a reference image (swipeFile, kind "reference") keeping
 *    its image and label; its wires move from face → face-in to
 *    image → ref-in. Empty face nodes and Personnage nodes are untouched.
 */
export function migrateCanvas(
  nodes: AppNode[],
  edges: Edge[],
): { nodes: AppNode[]; edges: Edge[]; changed: boolean } {
  let changed = false;
  const converted = new Set<string>();

  const nextNodes = nodes.map((node) => {
    if (node.type !== "faceReference") return node;
    const data = node.data ?? {};
    const angles = data.personaAngles;
    const hasPersona = Boolean(data.personaId || (angles && (angles.front || angles.left || angles.right)));
    const hasImage = Boolean(data.imageBase64 || data.imageUrl);
    if (hasPersona || !hasImage) return node;

    converted.add(node.id);
    changed = true;
    const nextData: NodeData = { kind: "reference" };
    if (data.imageUrl) nextData.imageUrl = data.imageUrl;
    if (data.imageBase64) nextData.imageBase64 = data.imageBase64;
    if (data.label) nextData.label = data.label;
    return { ...node, type: "swipeFile", data: nextData };
  });

  const nextEdges = edges.map((edge) => {
    let next = edge;
    if (next.targetHandle === "image-in") {
      next = { ...next, targetHandle: "ref-in" };
      changed = true;
    }
    if (converted.has(next.source)) {
      if (next.sourceHandle === "face") {
        next = { ...next, sourceHandle: "image" };
        changed = true;
      }
      if (next.targetHandle === "face-in") {
        next = { ...next, targetHandle: "ref-in" };
        changed = true;
      }
    }
    return next;
  });

  return { nodes: nextNodes, edges: nextEdges, changed };
}
```

- [ ] **Step 4: Run the pure test**

Run: `./node_modules/.bin/vitest run tests/canvas/migrate-canvas.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Append the store integration test**

Append to `tests/canvas/canvas-store.test.ts`:

```ts
describe("loadProject migrations", () => {
  const legacyProject = {
    nodes: [
      { id: "face", type: "faceReference", position: { x: 0, y: 0 }, data: { imageUrl: "/api/face-reactions/image?f=abc", label: "Choqué" } },
      { id: "gen", type: "generator", position: { x: 400, y: 0 }, data: { model: "m" } },
    ],
    edges: [{ id: "e1", source: "face", sourceHandle: "face", target: "gen", targetHandle: "face-in" }],
  };

  function stubProject(project: unknown) {
    const mock = vi.fn(async (url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => (String(url).startsWith("/api/project?id=") ? project : {}),
    }));
    vi.stubGlobal("fetch", mock);
    return mock;
  }

  it("converts single-photo faces on load and autosaves the result", async () => {
    const mock = stubProject(legacyProject);
    useCanvasStore.setState({ loaded: false, dirty: false, saving: false });

    await useCanvasStore.getState().loadProject("legacy");

    const { nodes, edges, dirty, history } = useCanvasStore.getState();
    expect(nodes[0]).toMatchObject({ type: "swipeFile", data: { kind: "reference", label: "Choqué" } });
    expect(edges[0]).toMatchObject({ sourceHandle: "image", targetHandle: "ref-in" });
    expect(history[0].nodes[0].type).toBe("swipeFile");
    expect(dirty).toBe(true);

    await vi.advanceTimersByTimeAsync(2000);
    const save = mock.mock.calls.find(([url, init]) => url === "/api/project" && init?.method === "POST");
    expect(save).toBeDefined();
    expect(JSON.parse(String(save![1]!.body)).nodes[0].type).toBe("swipeFile");
  });

  it("does not schedule a save when nothing needed converting", async () => {
    stubProject({ nodes: [legacyProject.nodes[1]], edges: [] });
    useCanvasStore.setState({ loaded: false, dirty: false, saving: false });

    await useCanvasStore.getState().loadProject("clean");

    expect(useCanvasStore.getState().nodes).toHaveLength(1);
    expect(useCanvasStore.getState().dirty).toBe(false);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/canvas/canvas-store.test.ts`
Expected: FAIL in « converts single-photo faces on load » (node still `faceReference`).

- [ ] **Step 7: Use the migration in `loadProject`**

In `src/store/canvas-store.ts`, add to the imports (after `import { v4 as uuid } from "uuid";`):

```ts
import { migrateCanvas } from "@/lib/canvas/migrate-canvas";
```

In `loadProject`, replace the block that starts with `const initialNodes = data.nodes || [];` and ends with the closing `});` of the `set({ nodes: initialNodes, edges: initialEdges, … })` call (it includes the « Lazy migration: legacy projects stored edges with targetHandle "image-in" » comment and the `initialSnapshot` declaration) with:

```ts
      // Lazy migrations (legacy "image-in" handle, single-photo face nodes →
      // reference images) — see migrateCanvas. When anything changed, the
      // normal debounced autosave persists the converted canvas.
      const migrated = migrateCanvas(data.nodes || [], data.edges || []);
      const initialSnapshot: Snapshot = {
        nodes: JSON.parse(JSON.stringify(migrated.nodes)),
        edges: JSON.parse(JSON.stringify(migrated.edges)),
      };
      set({
        nodes: migrated.nodes,
        edges: migrated.edges,
        loaded: true,
        currentProjectId: projectId,
        history: [initialSnapshot],
        historyIndex: 0,
      });
      if (migrated.changed) debouncedSave(get(), set);
```

- [ ] **Step 8: Run the store tests, types and full suite**

Run: `./node_modules/.bin/vitest run tests/canvas && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run`
Expected: all pass; `tsc` exits 0.

- [ ] **Step 9: Commit**

```bash
git add src/lib/canvas/migrate-canvas.ts src/store/canvas-store.ts tests/canvas/migrate-canvas.test.ts tests/canvas/canvas-store.test.ts
git commit -m "feat(canvas): convert single-photo face nodes into reference images on load"
```

---

## Task 4: « Ajouter une étape » panel and empty-canvas invitation

**Files:**
- Create: `src/lib/canvas/placement.ts`, `src/lib/canvas/picker-actions.ts`
- Create: `src/components/panels/NodePicker.tsx`, `src/components/panels/CanvasEmptyState.tsx`
- Modify: `src/components/nodes/SwipeFileNode.tsx` (title and empty text follow `kind`)
- Modify: `src/components/Canvas.tsx` (mount only — shared file, pull `main` and re-read first)
- Test: `tests/canvas/picker-actions.test.ts`

**Interfaces:**
- Consumes: `NODE_CATALOG`, `CATALOG_CATEGORIES`, `searchCatalog`, `compatibleEntries`, `handleLabel`, `CatalogEntry` (Task 1); `NodePickerState`, `NodeData`, `nodePicker`, `openNodePicker`, `closeNodePicker`, `addNode`, `addNodeAndConnect` (Task 2 / existing store); `generatorDefaults` returned by `useGeneratorDefaults()` in `Canvas.tsx` (Réglages plan).
- Produces:
  - `placement.ts`: `type XYPosition`, `CONNECT_OFFSET_X = 320`, `NEW_NODE_HALF_SIZE`, `connectedNodePosition(anchor, handleType): XYPosition`, `viewportCenterPosition(size, transform): XYPosition`
  - `picker-actions.ts`: `type PickerNode`, `type PickerAddPlan`, `pickerBaseEntries(state, nodes): CatalogEntry[]`, `pickerSubtitle(state, nodeCount): string`, `planPickerAdd({ state, entry, nodes, viewCenter, generatorDefaults }): PickerAddPlan | null`
  - `<NodePicker generatorDefaults={…} />` (default export), `<CanvasEmptyState />` (default export)

- [ ] **Step 1: Write the failing test**

Create `tests/canvas/picker-actions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { NODE_CATALOG } from "@/lib/canvas/node-catalog";
import { connectedNodePosition, viewportCenterPosition } from "@/lib/canvas/placement";
import { pickerBaseEntries, pickerSubtitle, planPickerAdd, type PickerNode } from "@/lib/canvas/picker-actions";

const entry = (id: string) => NODE_CATALOG.find((e) => e.id === id)!;
const nodes: PickerNode[] = [
  { id: "gen", type: "generator", position: { x: 1000, y: 400 }, data: { model: "m" } },
  { id: "logo-node", type: "swipeFile", position: { x: 200, y: 100 }, data: { kind: "logo" } },
];
const viewCenter = { x: 50, y: 60 };
const generatorDefaults = { model: "gemini-3-pro-image", aspectRatio: "16x9", numImages: 2, imageSize: "2K" };

describe("placement", () => {
  it("puts a connected node 320px left of a target handle's node, right of a source's", () => {
    expect(connectedNodePosition({ x: 1000, y: 400 }, "target")).toEqual({ x: 680, y: 400 });
    expect(connectedNodePosition({ x: 1000, y: 400 }, "source")).toEqual({ x: 1320, y: 400 });
  });

  it("converts the centre of the visible pane to flow coordinates, minus half a node", () => {
    // pane 1200×800, panned by (100, 50), zoom 2 → centre (600,400) → flow (250,175)
    expect(viewportCenterPosition({ width: 1200, height: 800 }, [100, 50, 2])).toEqual({ x: 110, y: 75 });
  });
});

describe("pickerBaseEntries", () => {
  it("offers the whole catalogue in free mode", () => {
    expect(pickerBaseEntries({ mode: "free" }, nodes)).toEqual(NODE_CATALOG);
  });

  it("offers only compatible steps in connect mode", () => {
    const fromLogoIn = pickerBaseEntries(
      { mode: "connect", from: { nodeId: "gen", handleId: "logo-in", handleType: "target" } },
      nodes,
    );
    expect(fromLogoIn.map((e) => e.id)).toEqual(["logo"]);

    const fromLogoOutput = pickerBaseEntries(
      { mode: "connect", from: { nodeId: "logo-node", handleId: "image", handleType: "source" } },
      nodes,
    );
    expect(fromLogoOutput.map((e) => e.id)).toEqual(["generateur"]);
  });

  it("offers nothing when the wire's node no longer exists", () => {
    expect(
      pickerBaseEntries({ mode: "connect", from: { nodeId: "gone", handleId: "logo-in", handleType: "target" } }, nodes),
    ).toEqual([]);
  });
});

describe("pickerSubtitle", () => {
  it("invites to start on an empty canvas, to add otherwise, and names the handle in connect mode", () => {
    expect(pickerSubtitle({ mode: "free" }, 0)).toBe("Choisis ce qui démarre ta miniature");
    expect(pickerSubtitle({ mode: "free" }, 3)).toBe("Choisis l'élément à ajouter");
    expect(
      pickerSubtitle({ mode: "connect", from: { nodeId: "gen", handleId: "logo-in", handleType: "target" } }, 3),
    ).toBe("Compatible avec « Logo »");
  });
});

describe("planPickerAdd", () => {
  it("adds a free node at the clicked position", () => {
    const plan = planPickerAdd({
      state: { mode: "free", flowPos: { x: 5, y: 6 } },
      entry: entry("prompt"),
      nodes,
      viewCenter,
      generatorDefaults,
    });
    expect(plan).toEqual({ mode: "free", nodeType: "prompt", position: { x: 5, y: 6 }, data: {} });
  });

  it("adds a free node at the view centre when no position was given", () => {
    const plan = planPickerAdd({ state: { mode: "free" }, entry: entry("logo"), nodes, viewCenter, generatorDefaults });
    expect(plan).toEqual({ mode: "free", nodeType: "swipeFile", position: viewCenter, data: { kind: "logo" } });
  });

  it("gives a new generator the generation defaults", () => {
    const plan = planPickerAdd({ state: { mode: "free" }, entry: entry("generateur"), nodes, viewCenter, generatorDefaults });
    expect(plan?.data).toEqual(generatorDefaults);
  });

  it("wires a node created from an input handle, 320px to its left", () => {
    const plan = planPickerAdd({
      state: { mode: "connect", from: { nodeId: "gen", handleId: "logo-in", handleType: "target" } },
      entry: entry("logo"),
      nodes,
      viewCenter,
      generatorDefaults,
    });
    expect(plan).toEqual({
      mode: "connect",
      nodeType: "swipeFile",
      position: { x: 680, y: 400 },
      data: { kind: "logo" },
      connectTo: "gen",
      connectToHandle: "logo-in",
      newNodeHandle: "image",
      newNodeIsTarget: false,
    });
  });

  it("wires a node created from an output handle at the drop position, on the right input", () => {
    const plan = planPickerAdd({
      state: {
        mode: "connect",
        flowPos: { x: 700, y: 120 },
        from: { nodeId: "logo-node", handleId: "image", handleType: "source" },
      },
      entry: entry("generateur"),
      nodes,
      viewCenter,
      generatorDefaults,
    });
    expect(plan).toEqual({
      mode: "connect",
      nodeType: "generator",
      position: { x: 700, y: 120 },
      data: generatorDefaults,
      connectTo: "logo-node",
      connectToHandle: "image",
      newNodeHandle: "logo-in",
      newNodeIsTarget: true,
    });
  });

  it("refuses an incompatible step or a vanished node", () => {
    const logoIn = { nodeId: "gen", handleId: "logo-in", handleType: "target" as const };
    expect(
      planPickerAdd({ state: { mode: "connect", from: logoIn }, entry: entry("prompt"), nodes, viewCenter, generatorDefaults }),
    ).toBeNull();
    expect(
      planPickerAdd({
        state: { mode: "connect", from: { ...logoIn, nodeId: "gone" } },
        entry: entry("logo"),
        nodes,
        viewCenter,
        generatorDefaults,
      }),
    ).toBeNull();
  });

  it("copies initial data instead of sharing the catalogue object", () => {
    const plan = planPickerAdd({ state: { mode: "free" }, entry: entry("logo"), nodes, viewCenter, generatorDefaults })!;
    plan.data.kind = "reference";
    expect(entry("logo").initialData).toEqual({ kind: "logo" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `./node_modules/.bin/vitest run tests/canvas/picker-actions.test.ts`
Expected: FAIL — cannot resolve `@/lib/canvas/placement`.

- [ ] **Step 3: Implement placement**

Create `src/lib/canvas/placement.ts`:

```ts
export type XYPosition = { x: number; y: number };

/** Horizontal gap used when a step is added next to the node a wire comes from. */
export const CONNECT_OFFSET_X = 320;

/** Roughly half a node, so a node « at the centre » is visually centred. */
export const NEW_NODE_HALF_SIZE: XYPosition = { x: 140, y: 100 };

/**
 * Position of a node added from a handle without a drop point: left of the
 * anchor node for one of its inputs (target), right of it for its output.
 */
export function connectedNodePosition(anchor: XYPosition, handleType: "source" | "target"): XYPosition {
  return {
    x: anchor.x + (handleType === "target" ? -CONNECT_OFFSET_X : CONNECT_OFFSET_X),
    y: anchor.y,
  };
}

/**
 * Flow coordinates of the centre of the visible pane. `transform` is React
 * Flow's `[translateX, translateY, zoom]` and `size` the pane in pixels.
 */
export function viewportCenterPosition(
  size: { width: number; height: number },
  transform: readonly [number, number, number],
): XYPosition {
  const [translateX, translateY, zoom] = transform;
  return {
    x: (size.width / 2 - translateX) / zoom - NEW_NODE_HALF_SIZE.x,
    y: (size.height / 2 - translateY) / zoom - NEW_NODE_HALF_SIZE.y,
  };
}
```

- [ ] **Step 4: Implement the picker actions**

Create `src/lib/canvas/picker-actions.ts`:

```ts
import type { NodePickerState } from "@/store/canvas-store";
import { NODE_CATALOG, compatibleEntries, handleLabel, type CatalogEntry } from "./node-catalog";
import { connectedNodePosition, type XYPosition } from "./placement";

/** The subset of a canvas node the picker needs. */
export type PickerNode = { id: string; type?: string; position: XYPosition; data: Record<string, unknown> };

export type PickerAddPlan =
  | { mode: "free"; nodeType: string; position: XYPosition; data: Record<string, unknown> }
  | {
      mode: "connect";
      nodeType: string;
      position: XYPosition;
      data: Record<string, unknown>;
      connectTo: string;
      connectToHandle: string;
      newNodeHandle: string;
      /** true when the wire comes from an output: the new node receives it. */
      newNodeIsTarget: boolean;
    };

function connectMatches(state: Extract<NodePickerState, { mode: "connect" }>, nodes: PickerNode[]) {
  const fromNode = nodes.find((node) => node.id === state.from.nodeId);
  if (!fromNode) return null;
  const matches = compatibleEntries({
    nodeType: fromNode.type ?? "",
    handleId: state.from.handleId,
    handleType: state.from.handleType,
    data: fromNode.data,
  });
  return { fromNode, matches };
}

/** Steps listed before any search: all of them, or those compatible with the wire. */
export function pickerBaseEntries(state: NodePickerState, nodes: PickerNode[]): CatalogEntry[] {
  if (state.mode === "free") return NODE_CATALOG;
  return connectMatches(state, nodes)?.matches.map((match) => match.entry) ?? [];
}

export function pickerSubtitle(state: NodePickerState, nodeCount: number): string {
  if (state.mode === "connect") return `Compatible avec « ${handleLabel(state.from.handleId)} »`;
  return nodeCount === 0 ? "Choisis ce qui démarre ta miniature" : "Choisis l'élément à ajouter";
}

/**
 * What adding `entry` means for the current picker state: which node, where,
 * with which data and, in connect mode, how to wire it. `null` when the entry
 * is not compatible (or the wire's node is gone).
 */
export function planPickerAdd({
  state,
  entry,
  nodes,
  viewCenter,
  generatorDefaults,
}: {
  state: NodePickerState;
  entry: CatalogEntry;
  nodes: PickerNode[];
  viewCenter: XYPosition;
  generatorDefaults: Record<string, unknown>;
}): PickerAddPlan | null {
  const data: Record<string, unknown> =
    entry.nodeType === "generator"
      ? { ...generatorDefaults, ...(entry.initialData ?? {}) }
      : { ...(entry.initialData ?? {}) };

  if (state.mode === "free") {
    return { mode: "free", nodeType: entry.nodeType, position: state.flowPos ?? viewCenter, data };
  }

  const found = connectMatches(state, nodes);
  const match = found?.matches.find((candidate) => candidate.entry.id === entry.id);
  if (!found || !match) return null;

  return {
    mode: "connect",
    nodeType: entry.nodeType,
    position: state.flowPos ?? connectedNodePosition(found.fromNode.position, state.from.handleType),
    data,
    connectTo: state.from.nodeId,
    connectToHandle: state.from.handleId,
    newNodeHandle: match.newNodeHandle,
    newNodeIsTarget: state.from.handleType === "source",
  };
}
```

- [ ] **Step 5: Run the test**

Run: `./node_modules/.bin/vitest run tests/canvas/picker-actions.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 6: Create the panel component**

Create `src/components/panels/NodePicker.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { useStoreApi } from "@xyflow/react";
import { ArrowRight, Search, SearchX } from "lucide-react";
import { cn } from "cn";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { useCanvasStore, type NodeData, type NodePickerState } from "@/store/canvas-store";
import { CATALOG_CATEGORIES, searchCatalog, type CatalogEntry } from "@/lib/canvas/node-catalog";
import { pickerBaseEntries, pickerSubtitle, planPickerAdd } from "@/lib/canvas/picker-actions";
import { viewportCenterPosition } from "@/lib/canvas/placement";

/**
 * « Ajouter une étape » — side panel listing the node catalogue. Opened through
 * the canvas store (`openNodePicker`) by the empty state, the N shortcut, the
 * canvas context menu, a wire released on empty space and the generator's
 * « + Ajouter » buttons. Closes after adding.
 */
export default function NodePicker({ generatorDefaults }: { generatorDefaults: NodeData }) {
  const nodePicker = useCanvasStore((s) => s.nodePicker);
  const closeNodePicker = useCanvasStore((s) => s.closeNodePicker);
  const searchRef = useRef<HTMLInputElement>(null);

  return (
    <Sheet
      open={nodePicker !== null}
      onOpenChange={(open) => {
        if (!open) closeNodePicker();
      }}
    >
      <SheetContent
        side="right"
        initialFocus={searchRef}
        className="gap-0 p-0 data-[side=right]:w-[380px] data-[side=right]:sm:max-w-[380px]"
      >
        {nodePicker && (
          <NodePickerBody state={nodePicker} generatorDefaults={generatorDefaults} searchRef={searchRef} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function NodePickerBody({
  state,
  generatorDefaults,
  searchRef,
}: {
  state: NodePickerState;
  generatorDefaults: NodeData;
  searchRef: RefObject<HTMLInputElement | null>;
}) {
  const nodes = useCanvasStore((s) => s.nodes);
  const addNode = useCanvasStore((s) => s.addNode);
  const addNodeAndConnect = useCanvasStore((s) => s.addNodeAndConnect);
  const closeNodePicker = useCanvasStore((s) => s.closeNodePicker);
  const flowStore = useStoreApi();
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const baseEntries = useMemo(() => pickerBaseEntries(state, nodes), [state, nodes]);
  const results = useMemo(() => searchCatalog(query, baseEntries), [query, baseEntries]);
  const active = results.length === 0 ? -1 : Math.min(activeIndex, results.length - 1);

  useEffect(() => {
    if (active < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const add = (entry: CatalogEntry) => {
    const { width, height, transform } = flowStore.getState();
    const plan = planPickerAdd({
      state,
      entry,
      nodes,
      viewCenter: viewportCenterPosition({ width, height }, transform),
      generatorDefaults,
    });
    if (!plan) return;
    if (plan.mode === "connect") {
      addNodeAndConnect(
        plan.nodeType,
        plan.position,
        plan.connectTo,
        plan.connectToHandle,
        plan.newNodeHandle,
        plan.data,
        plan.newNodeIsTarget,
      );
    } else {
      addNode(plan.nodeType, plan.position, plan.data);
    }
    closeNodePicker();
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(Math.min(active + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(Math.max(active - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      add(results[active]);
    }
  };

  return (
    <>
      <SheetHeader className="border-b pr-12">
        <SheetTitle>Ajouter une étape</SheetTitle>
        <SheetDescription>{pickerSubtitle(state, nodes.length)}</SheetDescription>
      </SheetHeader>

      <div className="p-3">
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onSearchKeyDown}
            placeholder="Rechercher une étape…"
            aria-label="Rechercher une étape"
          />
        </InputGroup>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {results.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchX />
              </EmptyMedia>
              <EmptyTitle>Aucune étape ne correspond</EmptyTitle>
              <EmptyDescription>Essaie un autre mot, par exemple « logo » ou « texte ».</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          CATALOG_CATEGORIES.map((category) => {
            const rows = results
              .map((entry, index) => ({ entry, index }))
              .filter((row) => row.entry.category === category.id);
            if (rows.length === 0) return null;
            return (
              <div key={category.id} className="mb-2">
                <div className="px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground">{category.label}</div>
                {rows.map(({ entry, index }) => {
                  const Icon = entry.icon;
                  const isActive = index === active;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      data-index={index}
                      data-active={isActive || undefined}
                      onMouseMove={() => {
                        if (!isActive) setActiveIndex(index);
                      }}
                      onClick={() => add(entry)}
                      className={cn(
                        "relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors",
                        isActive ? "bg-accent text-accent-foreground" : "text-foreground",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "absolute inset-y-2 left-0 w-0.5 rounded-full",
                          isActive ? "bg-primary" : "bg-transparent",
                        )}
                      />
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{entry.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{entry.description}</span>
                      </span>
                      <ArrowRight
                        aria-hidden
                        className={cn(
                          "size-4 shrink-0 text-muted-foreground transition-opacity",
                          isActive ? "opacity-100" : "opacity-0",
                        )}
                      />
                    </button>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 7: Create the empty state**

Create `src/components/panels/CanvasEmptyState.tsx`:

```tsx
"use client";

import { Plus } from "lucide-react";
import { useCanvasStore } from "@/store/canvas-store";

/**
 * Centred invitation shown while the loaded project has no node. The overlay
 * lets pan/zoom through (pointer-events-none); only the button is clickable.
 */
export default function CanvasEmptyState() {
  const loaded = useCanvasStore((s) => s.loaded);
  const isEmpty = useCanvasStore((s) => s.nodes.length === 0);
  const openNodePicker = useCanvasStore((s) => s.openNodePicker);

  if (!loaded || !isEmpty) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
      <button
        type="button"
        onClick={() => openNodePicker({ mode: "free" })}
        className="group pointer-events-auto flex flex-col items-center gap-3 rounded-2xl p-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex size-20 items-center justify-center rounded-2xl border-2 border-dashed border-border text-muted-foreground transition-colors group-hover:border-primary group-hover:text-foreground">
          <Plus className="size-8" />
        </span>
        <span className="text-sm text-muted-foreground transition-colors group-hover:text-foreground">
          Ajouter une première étape
        </span>
      </button>
    </div>
  );
}
```

- [ ] **Step 8: Name logo nodes « Logo »**

In `src/components/nodes/SwipeFileNode.tsx`, replace

```tsx
  const displayTitle = data.label || "Image";
```

with

```tsx
  const isLogo = data.kind === "logo";
  const displayTitle = data.label || (isLogo ? "Logo" : "Image");
```

and replace

```tsx
          <span className="text-xs">Ajouter une miniature de référence</span>
```

with

```tsx
          <span className="text-xs">{isLogo ? "Ajouter un logo" : "Ajouter une miniature de référence"}</span>
```

- [ ] **Step 9: Mount both in the canvas**

Pull `main` and re-read `src/components/Canvas.tsx`. Confirm it declares `const generatorDefaults = useGeneratorDefaults();` (Réglages plan). Then:

1. After `import ContextMenu from "./panels/ContextMenu";` add:

```tsx
import NodePicker from "./panels/NodePicker";
import CanvasEmptyState from "./panels/CanvasEmptyState";
```

2. In the `return`, the root element is `<div className="w-full h-screen" style={{ background: "var(--canvas-bg)" }}>`. Add `relative` so the overlay can position against it:

```tsx
    <div className="relative w-full h-screen" style={{ background: "var(--canvas-bg)" }}>
```

3. Right after the closing `</ReactFlow>` add:

```tsx
      <CanvasEmptyState />
```

4. Right before `<SketchEditor />` add:

```tsx
      <NodePicker generatorDefaults={generatorDefaults} />
```

- [ ] **Step 10: Type-check, lint, full suite**

Run:
```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/components/panels/NodePicker.tsx src/components/panels/CanvasEmptyState.tsx src/components/nodes/SwipeFileNode.tsx src/components/Canvas.tsx src/lib/canvas
./node_modules/.bin/vitest run
```
Expected: `tsc` exits 0; eslint reports no errors; all tests pass.

- [ ] **Step 11: Check in the browser (throwaway dev server, port 3100)**

Start `THUMBGEN_DB_PATH="$(mktemp -d)/thumbgen.db" ./node_modules/.bin/next dev -p 3100` in the background. Open `http://localhost:3100/miniatures`, create a « Nouvelle miniature », land on its canvas. Check:
- The dashed « + » square and « Ajouter une première étape » sit in the middle; dragging the canvas around it still pans.
- Click it → the right-hand sheet « Ajouter une étape » opens above the chat bubble, subtitle « Choisis ce qui démarre ta miniature », search focused, three groups Entrées / Génération / Finition, first row highlighted with the left bar.
- Type `apercu` → only « Aperçu »; type `zzz` → « Aucune étape ne correspond »; clear → ↓↓ moves the highlight to « Image de référence », Entrée adds it at the view centre and closes the sheet; the empty state disappears.
- Create a second miniature, open the sheet from its empty state, add « Logo » → the node is titled « Logo » and reads « Ajouter un logo ».
- Reopening the sheet on a non-empty canvas is not possible yet (menus and `N` come in Task 5); that is expected. Stop the dev server.

- [ ] **Step 12: Commit**

```bash
git add src/lib/canvas/placement.ts src/lib/canvas/picker-actions.ts src/components/panels/NodePicker.tsx src/components/panels/CanvasEmptyState.tsx src/components/nodes/SwipeFileNode.tsx src/components/Canvas.tsx tests/canvas/picker-actions.test.ts
git commit -m "feat(canvas): « Ajouter une étape » side panel and empty-canvas invitation"
```

---

## Task 5: Context menus, keyboard shortcuts, shared « Ranger », wire-drop picker

**Files:**
- Create: `src/lib/canvas/context-menus.ts`, `src/lib/canvas/shortcuts.ts`
- Create: `src/hooks/useAutoLayout.ts`, `src/hooks/useCanvasShortcuts.ts`
- Modify: `src/components/panels/ContextMenu.tsx` (rewrite), `src/components/panels/ZoomBar.tsx`
- Modify: `src/components/Canvas.tsx` (full rewrite of the component — shared file, pull `main` and re-read first)
- Test: `tests/canvas/context-menus.test.ts`, `tests/canvas/shortcuts.test.ts`

**Interfaces:**
- Consumes: `openNodePicker`, `duplicateNode`, `setAllSelected`, `removeNode`, `nodePicker`, `closeNodePicker` (Task 2); `NodePicker`, `CanvasEmptyState` (Task 4); `autoLayout(nodes, edges)` from `src/lib/agent/tools/_helpers/auto-layout.ts`; `useGeneratorDefaults()` (Réglages plan).
- Produces:
  - `context-menus.ts`: `type ContextMenuItem`, `paneMenuItems(opts)`, `nodeMenuItems(opts)`
  - `shortcuts.ts`: `type CanvasShortcut`, `matchCanvasShortcut(event)`, `isEditableTarget(target)`, `OVERLAY_SELECTOR`, `hasOpenOverlay(doc)`
  - `useAutoLayout(): () => void`, `useCanvasShortcuts({ onAutoLayout })`
  - `<ContextMenu x y items onClose />` with `items: ContextMenuItem[]`

- [ ] **Step 1: Write the failing tests**

Create `tests/canvas/context-menus.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { nodeMenuItems, paneMenuItems, type ContextMenuItem } from "@/lib/canvas/context-menus";

const summary = (items: ContextMenuItem[]) =>
  items.map((item) =>
    item.type === "separator"
      ? "---"
      : [item.label, item.shortcut ?? "", item.disabled ? "off" : "on", item.destructive ? "danger" : ""].join("|"),
  );

const paneOptions = (overrides: Partial<Parameters<typeof paneMenuItems>[0]> = {}) => ({
  hasNodes: true,
  hasSelection: true,
  onAddStep: vi.fn(),
  onAutoLayout: vi.fn(),
  onSelectAll: vi.fn(),
  onDeselectAll: vi.fn(),
  ...overrides,
});

describe("paneMenuItems", () => {
  it("lists the actions with their shortcuts", () => {
    expect(summary(paneMenuItems(paneOptions()))).toEqual([
      "Ajouter une étape|N|on|",
      "Ranger le workflow|⇧⌥T|on|",
      "---",
      "Tout sélectionner|⌘A|on|",
      "Tout désélectionner|Échap|on|",
    ]);
  });

  it("disables layout and select-all on an empty canvas, and deselect without a selection", () => {
    expect(summary(paneMenuItems(paneOptions({ hasNodes: false, hasSelection: false })))).toEqual([
      "Ajouter une étape|N|on|",
      "Ranger le workflow|⇧⌥T|off|",
      "---",
      "Tout sélectionner|⌘A|off|",
      "Tout désélectionner|Échap|off|",
    ]);
  });

  it("wires each item to its callback", () => {
    const options = paneOptions();
    for (const item of paneMenuItems(options)) if (item.type === "item") item.action();
    expect(options.onAddStep).toHaveBeenCalledTimes(1);
    expect(options.onAutoLayout).toHaveBeenCalledTimes(1);
    expect(options.onSelectAll).toHaveBeenCalledTimes(1);
    expect(options.onDeselectAll).toHaveBeenCalledTimes(1);
  });
});

describe("nodeMenuItems", () => {
  it("offers Dupliquer then a destructive Supprimer", () => {
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();
    const items = nodeMenuItems({ onDuplicate, onDelete });
    expect(summary(items)).toEqual(["Dupliquer|⌘D|on|", "---", "Supprimer|⌫|on|danger"]);
    for (const item of items) if (item.type === "item") item.action();
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
```

Create `tests/canvas/shortcuts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { OVERLAY_SELECTOR, hasOpenOverlay, isEditableTarget, matchCanvasShortcut } from "@/lib/canvas/shortcuts";

const key = (init: Partial<KeyboardEvent>) =>
  ({ key: "", code: "", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...init }) as KeyboardEvent;

describe("matchCanvasShortcut", () => {
  it("N opens the picker, without modifiers only", () => {
    expect(matchCanvasShortcut(key({ key: "n", code: "KeyN" }))).toBe("add-step");
    expect(matchCanvasShortcut(key({ key: "N", code: "KeyN" }))).toBe("add-step");
    expect(matchCanvasShortcut(key({ key: "N", code: "KeyN", shiftKey: true }))).toBeNull();
    expect(matchCanvasShortcut(key({ key: "n", code: "KeyN", metaKey: true }))).toBeNull();
  });

  it("⇧⌥T lays out, even though macOS Option rewrites event.key", () => {
    expect(matchCanvasShortcut(key({ key: "ˇ", code: "KeyT", shiftKey: true, altKey: true }))).toBe("auto-layout");
    expect(matchCanvasShortcut(key({ key: "T", code: "KeyT", shiftKey: true }))).toBeNull();
  });

  it("⌘A / Ctrl+A select all, ⌘D / Ctrl+D duplicate", () => {
    expect(matchCanvasShortcut(key({ key: "a", code: "KeyQ", metaKey: true }))).toBe("select-all");
    expect(matchCanvasShortcut(key({ key: "a", ctrlKey: true }))).toBe("select-all");
    expect(matchCanvasShortcut(key({ key: "d", metaKey: true }))).toBe("duplicate");
    expect(matchCanvasShortcut(key({ key: "d", ctrlKey: true }))).toBe("duplicate");
    expect(matchCanvasShortcut(key({ key: "a", metaKey: true, shiftKey: true }))).toBeNull();
  });

  it("Escape without modifiers, nothing else", () => {
    expect(matchCanvasShortcut(key({ key: "Escape" }))).toBe("escape");
    expect(matchCanvasShortcut(key({ key: "Escape", metaKey: true }))).toBeNull();
    expect(matchCanvasShortcut(key({ key: "x" }))).toBeNull();
    expect(matchCanvasShortcut(key({ key: "z", metaKey: true }))).toBeNull();
  });
});

describe("isEditableTarget", () => {
  it("is true for form fields and contenteditable, false otherwise", () => {
    expect(isEditableTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: "textarea" } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: "SELECT" } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: false } as unknown as EventTarget)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe("hasOpenOverlay", () => {
  it("looks for dialogs, menus and the Excalidraw editor", () => {
    expect(OVERLAY_SELECTOR).toContain('[role="dialog"]');
    expect(OVERLAY_SELECTOR).toContain('[role="menu"]');
    expect(OVERLAY_SELECTOR).toContain(".excalidraw");
    expect(hasOpenOverlay({ querySelector: () => ({}) as Element })).toBe(true);
    expect(hasOpenOverlay({ querySelector: () => null })).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `./node_modules/.bin/vitest run tests/canvas/context-menus.test.ts tests/canvas/shortcuts.test.ts`
Expected: FAIL — cannot resolve `@/lib/canvas/context-menus` and `@/lib/canvas/shortcuts`.

- [ ] **Step 3: Implement the menu items**

Create `src/lib/canvas/context-menus.ts`:

```ts
export type ContextMenuItem =
  | {
      type: "item";
      label: string;
      shortcut?: string;
      action: () => void;
      disabled?: boolean;
      destructive?: boolean;
    }
  | { type: "separator" };

/** Right-click on the canvas background. */
export function paneMenuItems(options: {
  hasNodes: boolean;
  hasSelection: boolean;
  onAddStep: () => void;
  onAutoLayout: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}): ContextMenuItem[] {
  return [
    { type: "item", label: "Ajouter une étape", shortcut: "N", action: options.onAddStep },
    {
      type: "item",
      label: "Ranger le workflow",
      shortcut: "⇧⌥T",
      action: options.onAutoLayout,
      disabled: !options.hasNodes,
    },
    { type: "separator" },
    {
      type: "item",
      label: "Tout sélectionner",
      shortcut: "⌘A",
      action: options.onSelectAll,
      disabled: !options.hasNodes,
    },
    {
      type: "item",
      label: "Tout désélectionner",
      shortcut: "Échap",
      action: options.onDeselectAll,
      disabled: !options.hasSelection,
    },
  ];
}

/** Right-click on a node. */
export function nodeMenuItems(options: { onDuplicate: () => void; onDelete: () => void }): ContextMenuItem[] {
  return [
    { type: "item", label: "Dupliquer", shortcut: "⌘D", action: options.onDuplicate },
    { type: "separator" },
    { type: "item", label: "Supprimer", shortcut: "⌫", action: options.onDelete, destructive: true },
  ];
}
```

- [ ] **Step 4: Implement the shortcut helpers**

Create `src/lib/canvas/shortcuts.ts`:

```ts
export type CanvasShortcut = "add-step" | "auto-layout" | "select-all" | "duplicate" | "escape";

type KeyInput = Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">;

/**
 * Canvas keyboard shortcuts. Letters match `event.key` (layout-aware: the A
 * key of an AZERTY keyboard is still « a »). ⇧⌥T matches `event.code`
 * because Option rewrites `event.key` on macOS (⇧⌥T → « ˇ »).
 * ⌘Z / ⇧⌘Z (ZoomBar) and Backspace/Delete (React Flow) are handled elsewhere.
 */
export function matchCanvasShortcut(event: KeyInput): CanvasShortcut | null {
  const mod = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();
  if (event.key === "Escape") return !mod && !event.shiftKey && !event.altKey ? "escape" : null;
  if (!mod && !event.shiftKey && !event.altKey && key === "n") return "add-step";
  if (!mod && event.shiftKey && event.altKey && event.code === "KeyT") return "auto-layout";
  if (mod && !event.shiftKey && !event.altKey && key === "a") return "select-all";
  if (mod && !event.shiftKey && !event.altKey && key === "d") return "duplicate";
  return null;
}

/** Typing in a field must never trigger a canvas shortcut. */
export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as { tagName?: unknown; isContentEditable?: unknown } | null;
  if (!element || typeof element.tagName !== "string") return false;
  const tag = element.tagName.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || element.isContentEditable === true;
}

/** Open dialogs/sheets and menus (Base UI) and the full-screen sketch editor. */
export const OVERLAY_SELECTOR = '[role="dialog"], [role="alertdialog"], [role="menu"], .excalidraw';

export function hasOpenOverlay(doc: { querySelector(selectors: string): Element | null }): boolean {
  return doc.querySelector(OVERLAY_SELECTOR) !== null;
}
```

- [ ] **Step 5: Run the tests**

Run: `./node_modules/.bin/vitest run tests/canvas/context-menus.test.ts tests/canvas/shortcuts.test.ts`
Expected: PASS (4 + 6 tests).

- [ ] **Step 6: Create the shared layout hook**

Create `src/hooks/useAutoLayout.ts`:

```ts
"use client";

import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { autoLayout } from "@/lib/agent/tools/_helpers/auto-layout";

/**
 * « Ranger le workflow »: left-to-right dagre layout (the same one
 * apply_workflow uses), then fit the view. Shared by the ZoomBar button, the
 * canvas context menu and the ⇧⌥T shortcut. `setNodes` on this controlled
 * flow goes through the store's onNodesChange, so it is undoable and saved.
 */
export function useAutoLayout(): () => void {
  const { getNodes, getEdges, setNodes, fitView } = useReactFlow();

  return useCallback(() => {
    const nodes = getNodes();
    if (nodes.length === 0) return;
    const laidOut = autoLayout(
      nodes.map((node) => ({ id: node.id, type: node.type ?? "" })),
      getEdges().map((edge) => ({ source: edge.source, target: edge.target })),
    );
    const positions = new Map(laidOut.map((node) => [node.id, node.position]));
    setNodes(nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position })));
    setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50);
  }, [getNodes, getEdges, setNodes, fitView]);
}
```

- [ ] **Step 7: Create the shortcuts hook**

Create `src/hooks/useCanvasShortcuts.ts`:

```ts
"use client";

import { useEffect } from "react";
import { useCanvasStore } from "@/store/canvas-store";
import { hasOpenOverlay, isEditableTarget, matchCanvasShortcut } from "@/lib/canvas/shortcuts";

/**
 * N → step picker (view centre) · ⇧⌥T → ranger · ⌘A → tout sélectionner ·
 * ⌘D → dupliquer la sélection · Échap → ferme le panneau, sinon désélectionne.
 * Ignored while typing, and (except Échap closing the picker) while a dialog,
 * menu, the picker or the sketch editor is open.
 */
export function useCanvasShortcuts({ onAutoLayout }: { onAutoLayout: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = matchCanvasShortcut(event);
      if (!shortcut) return;
      const store = useCanvasStore.getState();

      if (shortcut === "escape") {
        if (store.nodePicker) {
          store.closeNodePicker();
          return;
        }
        if (isEditableTarget(event.target) || hasOpenOverlay(document)) return;
        store.setAllSelected(false);
        return;
      }

      if (event.repeat || store.nodePicker || isEditableTarget(event.target) || hasOpenOverlay(document)) return;

      switch (shortcut) {
        case "add-step":
          event.preventDefault();
          store.openNodePicker({ mode: "free" });
          return;
        case "auto-layout":
          event.preventDefault();
          if (store.nodes.length > 0) onAutoLayout();
          return;
        case "select-all":
          event.preventDefault();
          store.setAllSelected(true);
          return;
        case "duplicate":
          event.preventDefault();
          for (const node of store.nodes.filter((candidate) => candidate.selected)) {
            store.duplicateNode(node.id);
          }
          return;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onAutoLayout]);
}
```

- [ ] **Step 8: Rewrite the context menu component**

Replace the whole content of `src/components/panels/ContextMenu.tsx` with:

```tsx
"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ContextMenuItem } from "@/lib/canvas/context-menus";

export default function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  return (
    <DropdownMenu
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {/* Invisible 1x1 anchor at the captured click point. DropdownMenuContent
          positions itself against this anchor via Base UI's own Popper-style
          positioner (side/align/offset below) rather than a plain fixed style —
          a literal `style={{position:"fixed", left, top}}` on DropdownMenuContent
          lands offset, because the Positioner wraps it in a `transform`-ed
          ancestor, which becomes the containing block for a nested `fixed`
          child per the CSS spec (verified in-browser: menu opened ~2x offset
          from the click point). */}
      <DropdownMenuTrigger
        nativeButton={false}
        render={<span style={{ position: "fixed", left: x, top: y, width: 1, height: 1 }} />}
      />
      <DropdownMenuContent
        side="bottom"
        align="start"
        sideOffset={0}
        alignOffset={0}
        className="min-w-[240px]"
        finalFocus={false}
      >
        {items.map((item, index) =>
          item.type === "separator" ? (
            <DropdownMenuSeparator key={`separator-${index}`} />
          ) : (
            <DropdownMenuItem
              key={item.label}
              disabled={item.disabled}
              variant={item.destructive ? "destructive" : "default"}
              onClick={() => {
                if (item.disabled) return;
                item.action();
                onClose();
              }}
            >
              <span>{item.label}</span>
              {item.shortcut && <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut>}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 9: Use the shared layout in the ZoomBar**

In `src/components/panels/ZoomBar.tsx`:

1. Replace the imports

```tsx
import { useReactFlow, useViewport, type Node as FlowNode } from "@xyflow/react";
import { useState, useEffect, useCallback } from "react";
```

with

```tsx
import { useReactFlow, useViewport } from "@xyflow/react";
import { useState, useEffect } from "react";
import { useAutoLayout } from "@/hooks/useAutoLayout";
```

2. Delete the line `const { getNodes, getEdges, setNodes } = useReactFlow();` and the whole `const autoLayout = useCallback(() => { … }, [getNodes, getEdges, setNodes, fitView]);` block (the BFS column layout, from `const autoLayout = useCallback(` through its dependency array). In their place add:

```tsx
  const autoLayout = useAutoLayout();
```

3. Replace the tooltip text `<TooltipContent><p>Réorganiser le canvas</p></TooltipContent>` with:

```tsx
        <TooltipContent><p>Ranger le workflow (⇧⌥T)</p></TooltipContent>
```

Check: `grep -n "COL_WIDTH\|colMap\|getEdges" src/components/panels/ZoomBar.tsx` prints nothing.

- [ ] **Step 10: Rewrite the canvas component**

Pull `main`, re-read `src/components/Canvas.tsx`, and run `git log --oneline -5 -- src/components/Canvas.tsx`. The file must currently contain, besides the pieces removed below: the `nodeTypes`/`edgeTypes`/`defaultEdgeOptions` constants, `const generatorDefaults = useGeneratorDefaults();`, the `projectId` loading `useEffect`, `useCanvasSync(currentProjectId);`, `onDragOver`, `onDrop` (spreading `generatorDefaults` into generator data), the `Panel` with `ProjectBar` and the saving indicator, `<ZoomBar />`, `<ChatPanel projectId={currentProjectId} />`, `<CanvasEmptyState />`, `<NodePicker generatorDefaults={generatorDefaults} />` and `<SketchEditor />`. Everything else related to adding nodes (`STAR_ICON`, `contextMenu`/`setContextMenu`, `edgeDropMenu`, `connectStartRef`, `justOpenedEdgeMenuRef`, `onConnectStart`, `onConnectEnd`, `addConnectedNode`, the three inline SVG icons, `contextMenuSections`, both `<ContextMenu …>` blocks) is replaced. If the current file has any other code not listed here (e.g. a new prop or panel added by parallel work), carry it over into the new file unchanged.

Replace the whole file with:

```tsx
"use client";

import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Panel,
  useReactFlow,
  type NodeMouseHandler,
  type OnConnectEnd,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useCanvasStore, type AppNode } from "@/store/canvas-store";
import FaceReferenceNode from "./nodes/FaceReferenceNode";
import SwipeFileNode from "./nodes/SwipeFileNode";
import PromptNode from "./nodes/PromptNode";
import GeneratorNode from "./nodes/GeneratorNode";
import PreviewNode from "./nodes/PreviewNode";
import SketchNode from "./nodes/SketchNode";
import TextOverlayNode from "./nodes/TextOverlayNode";
import CustomEdge from "./edges/CustomEdge";
import ZoomBar from "./panels/ZoomBar";
import ChatPanel from "./panels/ChatPanel";
import ContextMenu from "./panels/ContextMenu";
import NodePicker from "./panels/NodePicker";
import CanvasEmptyState from "./panels/CanvasEmptyState";
import ProjectBar from "./panels/ProjectBar";
import SketchEditor from "./panels/SketchEditor";
import { useCallback, useState, useEffect } from "react";
import { DragEvent } from "react";
import { useRouter } from "next/navigation";
import { useCanvasSync } from "@/hooks/useCanvasSync";
import { useGeneratorDefaults } from "@/hooks/useGeneratorDefaults";
import { useAutoLayout } from "@/hooks/useAutoLayout";
import { useCanvasShortcuts } from "@/hooks/useCanvasShortcuts";
import { nodeMenuItems, paneMenuItems } from "@/lib/canvas/context-menus";

const nodeTypes = {
  faceReference: FaceReferenceNode,
  swipeFile: SwipeFileNode,
  prompt: PromptNode,
  generator: GeneratorNode,
  preview: PreviewNode,
  sketch: SketchNode,
  textOverlay: TextOverlayNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

const defaultEdgeOptions = {
  type: "custom",
  animated: false,
};

type CanvasMenu =
  | { kind: "pane"; x: number; y: number; flowPos: { x: number; y: number } }
  | { kind: "node"; x: number; y: number; nodeId: string };

function CanvasInner({ projectId }: { projectId?: string }) {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    removeNode,
    duplicateNode,
    setAllSelected,
    openNodePicker,
    loadProject,
    saving,
    currentProjectId,
  } = useCanvasStore();
  const { screenToFlowPosition } = useReactFlow();
  const router = useRouter();
  const generatorDefaults = useGeneratorDefaults();
  const autoLayout = useAutoLayout();
  useCanvasShortcuts({ onAutoLayout: autoLayout });
  const [menu, setMenu] = useState<CanvasMenu | null>(null);

  // A projectId from the route wins: /m/<id> is a direct link to one
  // miniature, so it also becomes the "current" project everything else
  // (ProjectBar, chat, agent) reads from settings. Without one, fall back to
  // the last-opened project.
  useEffect(() => {
    if (projectId) {
      let cancelled = false;
      fetch("/api/projects")
        .then((r) => r.json() as Promise<Array<{ id: string }>>)
        .then((projects) => {
          if (cancelled) return;
          // Loading an unknown id would show an empty canvas whose first
          // autosave silently re-creates the project (saveProject upserts its
          // meta row) — e.g. a stale tab on a deleted project. Send it back to
          // the gallery instead.
          if (!projects.some((p) => p.id === projectId)) {
            router.replace("/miniatures");
            return;
          }
          loadProject(projectId);
          fetch("/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ currentProjectId: projectId }),
          }).catch(() => {});
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => loadProject(s.currentProjectId || "default"))
      .catch(() => loadProject());
  }, [loadProject, projectId, router]);

  // Poll for external mutations (agent / MCP client) and refresh the canvas
  useCanvasSync(currentProjectId);

  // A wire released on empty space opens the step picker restricted to the
  // steps compatible with the handle it came from.
  const onConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState) => {
      // isValid is null only when the pointer was not over (or near) a handle.
      if (connectionState.isValid !== null) return;
      const fromHandle = connectionState.fromHandle;
      if (!fromHandle?.id) return;
      const point = "changedTouches" in event ? event.changedTouches[0] : event;
      const flowPos = screenToFlowPosition({ x: point.clientX, y: point.clientY });
      const from = { nodeId: fromHandle.nodeId, handleId: fromHandle.id, handleType: fromHandle.type };
      // Deferred: the click that follows this pointer-up must not land on the
      // sheet's backdrop and close it right away.
      window.setTimeout(() => openNodePicker({ mode: "connect", flowPos, from }), 0);
    },
    [screenToFlowPosition, openNodePicker],
  );

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow-type");
      if (!type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const rawData = event.dataTransfer.getData("application/reactflow-data");
      const data = rawData ? JSON.parse(rawData) : {};

      // A generator dragged from the sidebar carries only its model; the
      // Génération settings fill in format, count and resolution.
      addNode(type, position, type === "generator" ? { ...generatorDefaults, ...data } : data);
    },
    [screenToFlowPosition, addNode, generatorDefaults],
  );

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setMenu({ kind: "pane", x: event.clientX, y: event.clientY, flowPos });
    },
    [screenToFlowPosition],
  );

  const onNodeContextMenu: NodeMouseHandler<AppNode> = useCallback((event, node) => {
    event.preventDefault();
    setMenu({ kind: "node", x: event.clientX, y: event.clientY, nodeId: node.id });
  }, []);

  const hasSelection = nodes.some((n) => n.selected) || edges.some((e) => e.selected);
  const menuItems = !menu
    ? []
    : menu.kind === "pane"
      ? paneMenuItems({
          hasNodes: nodes.length > 0,
          hasSelection,
          onAddStep: () => {
            const flowPos = menu.flowPos;
            // Deferred for the same reason as onConnectEnd.
            window.setTimeout(() => openNodePicker({ mode: "free", flowPos }), 0);
          },
          onAutoLayout: autoLayout,
          onSelectAll: () => setAllSelected(true),
          onDeselectAll: () => setAllSelected(false),
        })
      : nodeMenuItems({
          onDuplicate: () => duplicateNode(menu.nodeId),
          onDelete: () => removeNode(menu.nodeId),
        });

  return (
    <div className="relative w-full h-screen" style={{ background: "var(--canvas-bg)" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onConnectEnd={onConnectEnd}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={() => setMenu(null)}
        fitView={false}
        snapToGrid
        snapGrid={[20, 20]}
        minZoom={0.02}
        maxZoom={2}
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: true }}
        style={{ background: "var(--canvas-bg)" }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={0.8}
          color="var(--bone-faint)"
        />

        {/* Project selector + save indicator */}
        <Panel position="top-left" className="!ml-16">
          <div className="flex items-center gap-3">
            <ProjectBar />
            {saving && (
              <span className="text-xs px-2 py-1 rounded-lg" style={{ color: "var(--text-muted)", background: "var(--node-bg)" }}>
                Enregistrement…
              </span>
            )}
          </div>
        </Panel>

        <ZoomBar />
      </ReactFlow>

      <CanvasEmptyState />

      <ChatPanel projectId={currentProjectId} />

      {menu && (
        <ContextMenu
          key={`${menu.kind}-${menu.x}-${menu.y}`}
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
        />
      )}

      <NodePicker generatorDefaults={generatorDefaults} />

      <SketchEditor />
    </div>
  );
}

// NOTE: this used to wrap CanvasInner in its own <ReactFlowProvider> here.
// AppSidebar (Task 3) now mounts as a page-level sibling of <Canvas /> instead
// of nesting inside <ReactFlow> — since it also calls useReactFlow(), it needs
// to share the same ReactFlowProvider/store as the actual <ReactFlow> instance
// below (a phantom, unshared provider around AppSidebar alone would either
// crash — no provider at all — or silently desync screenToFlowPosition from
// the canvas's real pan/zoom). The provider is therefore lifted one level up,
// to page.tsx, wrapping both AppSidebar and Canvas together.
export default function Canvas({ projectId }: { projectId?: string }) {
  return <CanvasInner projectId={projectId} />;
}
```

- [ ] **Step 11: Type-check, lint, full suite**

Run:
```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/components/Canvas.tsx src/components/panels/ContextMenu.tsx src/components/panels/ZoomBar.tsx src/hooks/useAutoLayout.ts src/hooks/useCanvasShortcuts.ts src/lib/canvas
./node_modules/.bin/vitest run
grep -n "edgeDropMenu\|addConnectedNode\|STAR_ICON\|contextMenuSections\|OnConnectStart" src/components/Canvas.tsx
```
Expected: `tsc` exits 0; no eslint errors; all tests pass; the grep prints nothing.

- [ ] **Step 12: Check in the browser (throwaway dev server, port 3100)**

Start the dev server as in the Global Constraints, create a miniature and check:
- Right-click the background → menu at the pointer with « Ajouter une étape N », « Ranger le workflow ⇧⌥T » (disabled while empty), separator, « Tout sélectionner ⌘A » (disabled), « Tout désélectionner Échap » (disabled). « Ajouter une étape » opens the sheet; add « Prompt » → it lands where you right-clicked.
- Press `N` on the canvas → sheet opens; add « Générateur » → it lands at the view centre with the Génération defaults (format / nombre / résolution shown in the node).
- Drag a wire from the generator's `logo-in` handle and release on empty space → sheet subtitle « Compatible avec « Logo » », list shows only « Logo »; Entrée → Logo node at the drop point, wired to `logo-in`. Repeat from `sketch-in` → only « Croquis », wired to `sketch-in`.
- Drag a wire from that Logo node's output to empty space → only « Générateur »; the new generator receives the wire on `logo-in` (not `ref-in`).
- Drag from the Prompt's output and release **on** the generator's `prompt-in` → a normal connection, no sheet.
- Right-click a node → « Dupliquer ⌘D », separator, red « Supprimer ⌫ ». Dupliquer adds a copy 40/40 lower-right without wires; ⌘Z undoes it; Supprimer removes the node.
- ⌘A selects every node; ⌘D duplicates the selection; Échap deselects; with the sheet open, Échap closes it.
- ⇧⌥T and the ZoomBar « Ranger » button lay the graph out left to right and fit the view.
- Click into the chat input and type `n` → no sheet opens. Stop the dev server.

- [ ] **Step 13: Commit**

```bash
git add src/lib/canvas/context-menus.ts src/lib/canvas/shortcuts.ts src/hooks/useAutoLayout.ts src/hooks/useCanvasShortcuts.ts src/components/panels/ContextMenu.tsx src/components/panels/ZoomBar.tsx src/components/Canvas.tsx tests/canvas/context-menus.test.ts tests/canvas/shortcuts.test.ts
git commit -m "feat(canvas): shadcn context menus, keyboard shortcuts and wire-drop step picker"
```

---

## Task 6: Personnage node

**Files:**
- Create: `src/lib/personas.ts`, `src/store/library-store.ts`
- Modify: `src/components/nodes/FaceReferenceNode.tsx` (rewrite)
- Modify: `src/components/nodes/PromptNode.tsx` (face count)
- Modify: `src/components/panels/AppSidebar.tsx` (tab state only — shared file, pull `main` and re-read first)
- Test: `tests/canvas/personas.test.ts`, `tests/canvas/library-store.test.ts`

**Interfaces:**
- Consumes: `useCanvasStore` (`updateNodeData`, `removeNode`), `NodeData.personaId`, `NodeData.personaAngles`.
- Produces:
  - `personas.ts`: `type PersonaAngle = "front" | "left" | "right"`, `PERSONA_ANGLES`, `PERSONA_ANGLE_LABELS`, `type PersonaSummary = { id: string; label: string; angles: PersonaAngle[] }` (one row of `GET /api/personas`), `personaImageUrl(personaId, angle)`, `personaNodeData(persona)`, `personaPickerItem(persona)`
  - `library-store.ts`: `type LibraryTab = "models" | "faces" | "logos" | "swipe"`, `useLibraryStore` with `activeTab: LibraryTab | null`, `setActiveTab(tab | null)`, `toggleTab(tab)`

- [ ] **Step 1: Write the failing tests**

Create `tests/canvas/personas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  PERSONA_ANGLES,
  PERSONA_ANGLE_LABELS,
  personaImageUrl,
  personaNodeData,
  personaPickerItem,
} from "@/lib/personas";

describe("personas helpers", () => {
  it("lists the three angles with French labels", () => {
    expect(PERSONA_ANGLES).toEqual(["front", "left", "right"]);
    expect(PERSONA_ANGLE_LABELS).toEqual({ front: "Face", left: "Profil gauche", right: "Profil droit" });
  });

  it("builds the angle image URL", () => {
    expect(personaImageUrl("p1", "left")).toBe("/api/personas/image?id=p1&angle=left");
  });

  it("builds faceReference node data with only the captured angles", () => {
    expect(personaNodeData({ id: "p1", label: "Antoine", angles: ["front", "right"] })).toEqual({
      label: "Antoine",
      personaId: "p1",
      personaAngles: {
        front: "/api/personas/image?id=p1&angle=front",
        right: "/api/personas/image?id=p1&angle=right",
      },
    });
  });

  it("builds a chat library item from the first angle, or nothing without photos", () => {
    expect(personaPickerItem({ id: "p1", label: "Antoine", angles: ["left", "right"] })).toEqual({
      source: "stored:persona_p1",
      preview_url: "/api/personas/image?id=p1&angle=left",
      label: "Antoine",
    });
    expect(personaPickerItem({ id: "p2", label: "", angles: ["front"] })?.label).toBe("Personnage");
    expect(personaPickerItem({ id: "p3", label: "Vide", angles: [] })).toBeNull();
  });
});
```

Create `tests/canvas/library-store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { useLibraryStore } from "@/store/library-store";

beforeEach(() => useLibraryStore.setState({ activeTab: null }));

describe("library store", () => {
  it("opens a tab and closes it", () => {
    useLibraryStore.getState().setActiveTab("faces");
    expect(useLibraryStore.getState().activeTab).toBe("faces");
    useLibraryStore.getState().setActiveTab(null);
    expect(useLibraryStore.getState().activeTab).toBeNull();
  });

  it("toggles the same tab closed and switches to another tab", () => {
    const { toggleTab } = useLibraryStore.getState();
    toggleTab("logos");
    expect(useLibraryStore.getState().activeTab).toBe("logos");
    toggleTab("faces");
    expect(useLibraryStore.getState().activeTab).toBe("faces");
    toggleTab("faces");
    expect(useLibraryStore.getState().activeTab).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `./node_modules/.bin/vitest run tests/canvas/personas.test.ts tests/canvas/library-store.test.ts`
Expected: FAIL — cannot resolve `@/lib/personas` and `@/store/library-store`.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/personas.ts`:

```ts
/** A Personnage: one identity captured from up to three angles. */
export type PersonaAngle = "front" | "left" | "right";

export const PERSONA_ANGLES: PersonaAngle[] = ["front", "left", "right"];

export const PERSONA_ANGLE_LABELS: Record<PersonaAngle, string> = {
  front: "Face",
  left: "Profil gauche",
  right: "Profil droit",
};

/** One row of `GET /api/personas`. */
export type PersonaSummary = { id: string; label: string; angles: PersonaAngle[] };

export function personaImageUrl(personaId: string, angle: PersonaAngle): string {
  return `/api/personas/image?id=${encodeURIComponent(personaId)}&angle=${angle}`;
}

/** Data of a faceReference node showing this Personnage. */
export function personaNodeData(persona: PersonaSummary): {
  label: string;
  personaId: string;
  personaAngles: Partial<Record<PersonaAngle, string>>;
} {
  const personaAngles: Partial<Record<PersonaAngle, string>> = {};
  for (const angle of persona.angles) personaAngles[angle] = personaImageUrl(persona.id, angle);
  return { label: persona.label, personaId: persona.id, personaAngles };
}

/** Item of the chat « Bibliothèque » picker; null for a Personnage without photos. */
export function personaPickerItem(
  persona: PersonaSummary,
): { source: string; preview_url: string; label: string } | null {
  const angle = persona.angles[0];
  if (!angle) return null;
  return {
    source: `stored:persona_${persona.id}`,
    preview_url: personaImageUrl(persona.id, angle),
    label: persona.label || "Personnage",
  };
}
```

Create `src/store/library-store.ts`:

```ts
import { create } from "zustand";

export type LibraryTab = "models" | "faces" | "logos" | "swipe";

interface LibraryState {
  /** Sidebar flyout currently open (null = closed). */
  activeTab: LibraryTab | null;
  setActiveTab: (tab: LibraryTab | null) => void;
  toggleTab: (tab: LibraryTab) => void;
}

/**
 * Shared so that canvas nodes (the Personnage node's « Créer un
 * personnage ») can open a library tab of the AppSidebar.
 */
export const useLibraryStore = create<LibraryState>((set) => ({
  activeTab: null,
  setActiveTab: (activeTab) => set({ activeTab }),
  toggleTab: (tab) => set((state) => ({ activeTab: state.activeTab === tab ? null : tab })),
}));
```

- [ ] **Step 4: Run the tests**

Run: `./node_modules/.bin/vitest run tests/canvas/personas.test.ts tests/canvas/library-store.test.ts`
Expected: PASS (4 + 2 tests).

- [ ] **Step 5: Move the sidebar tab state into the store**

Pull `main` and re-read `src/components/panels/AppSidebar.tsx`. Then:

1. After `import { useCanvasStore } from "@/store/canvas-store";` add:

```tsx
import { useLibraryStore } from "@/store/library-store";
```

2. Delete the line `type SidebarTab = "models" | "faces" | "logos" | "swipe" | null;`.

3. Replace `const [activeTab, setActiveTab] = useState<SidebarTab>(null);` with:

```tsx
  const activeTab = useLibraryStore((s) => s.activeTab);
  const setActiveTab = useLibraryStore((s) => s.setActiveTab);
  const toggleTab = useLibraryStore((s) => s.toggleTab);
```

4. Delete the local helper `const toggleTab = (tab: SidebarTab) => setActiveTab((prev) => (prev === tab ? null : tab));`.

Check: `grep -n "SidebarTab" src/components/panels/AppSidebar.tsx` prints nothing.

- [ ] **Step 6: Rewrite the Personnage node**

Replace the whole content of `src/components/nodes/FaceReferenceNode.tsx` with:

```tsx
"use client";

import { Handle, Position, NodeProps } from "@xyflow/react";
import { useCallback, useEffect, useState } from "react";
import { useCanvasStore, AppNode } from "@/store/canvas-store";
import { useLibraryStore } from "@/store/library-store";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PERSONA_ANGLES, PERSONA_ANGLE_LABELS, personaNodeData, type PersonaSummary } from "@/lib/personas";
import NodeShell from "./NodeShell";

/* eslint-disable @next/next/no-img-element */

/**
 * Personnage (node type "faceReference", kept for saved data). Faces are
 * Personnages only: pick one from the library, or go create one. A former
 * single-photo face node is converted to a reference image on load
 * (see migrateCanvas).
 */
export default function FaceReferenceNode({ id, data }: NodeProps<AppNode>) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const removeNode = useCanvasStore((s) => s.removeNode);
  const setLibraryTab = useLibraryStore((s) => s.setActiveTab);
  const [personas, setPersonas] = useState<PersonaSummary[] | null>(null);

  const loadPersonas = useCallback(() => {
    fetch("/api/personas")
      .then((res) => (res.ok ? (res.json() as Promise<PersonaSummary[]>) : []))
      .then((rows) => setPersonas(rows))
      .catch(() => setPersonas([]));
  }, []);

  useEffect(() => {
    loadPersonas();
  }, [loadPersonas]);

  const angles = data.personaAngles;
  const hasPersona = Boolean(data.personaId || (angles && (angles.front || angles.left || angles.right)));

  const items = (personas ?? []).map((persona) => ({ value: persona.id, label: persona.label }));
  if (data.personaId && !items.some((item) => item.value === data.personaId)) {
    items.unshift({ value: data.personaId, label: data.label || "Personnage" });
  }

  const choosePersona = (value: string | null) => {
    if (!value) return;
    const persona = personas?.find((candidate) => candidate.id === value);
    if (persona) updateNodeData(id, personaNodeData(persona));
  };

  return (
    <NodeShell
      title={data.label || "Personnage"}
      onDelete={() => removeNode(id)}
      onRename={(newName) => updateNodeData(id, { label: newName })}
      width={280}
      icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ember)" strokeWidth="1.5" strokeLinecap="round">
          <path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
        </svg>
      }
    >
      <div className="flex flex-col gap-2">
        {hasPersona && (
          <div className="grid grid-cols-3 gap-1.5">
            {PERSONA_ANGLES.map((angle) => (
              <div key={angle} className="overflow-hidden rounded-lg bg-(--surface)">
                {angles?.[angle] ? (
                  <img src={angles[angle]} alt={PERSONA_ANGLE_LABELS[angle]} className="aspect-square w-full object-cover" />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center text-[9px] text-(--text-muted)">—</div>
                )}
              </div>
            ))}
          </div>
        )}

        <Select
          items={items}
          value={data.personaId ?? null}
          onValueChange={choosePersona}
          onOpenChange={(open) => {
            if (open) loadPersonas();
          }}
        >
          <SelectTrigger
            size="sm"
            aria-label="Personnage"
            className="nodrag nopan w-full border-(--line) bg-(--surface) text-(--text-primary) data-placeholder:text-(--text-muted)"
          >
            <SelectValue placeholder="Choisir un personnage" />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!hasPersona && (
          <>
            {personas?.length === 0 && (
              <p className="text-[11px] text-(--text-muted)">Aucun personnage dans ta bibliothèque.</p>
            )}
            <button
              type="button"
              onClick={() => setLibraryTab("faces")}
              className="nodrag nopan self-start text-xs text-(--canvas-accent) hover:underline"
            >
              Créer un personnage
            </button>
          </>
        )}
      </div>
      <Handle type="source" position={Position.Right} id="face" />
    </NodeShell>
  );
}
```

- [ ] **Step 7: Count Personnages in the prompt context**

In `src/components/nodes/PromptNode.tsx`, replace

```tsx
      const faces = allNodes.filter((n) => n.type === "faceReference" && (n.data.imageBase64 || n.data.imageUrl));
```

with

```tsx
      const faces = allNodes.filter((n) => n.type === "faceReference" && n.data.personaId);
```

- [ ] **Step 8: Type-check, lint, full suite**

Run:
```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/components/nodes/FaceReferenceNode.tsx src/components/nodes/PromptNode.tsx src/components/panels/AppSidebar.tsx src/lib/personas.ts src/store/library-store.ts
./node_modules/.bin/vitest run
```
Expected: `tsc` exits 0; no eslint errors; all tests pass.

- [ ] **Step 9: Check in the browser (throwaway dev server, port 3100)**

Start the dev server, then seed one Personnage and one legacy canvas in the throwaway DB:

```bash
PNG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZkqfO0AAAAASUVORK5CYII="
curl -s -X POST http://localhost:3100/api/personas -H 'content-type: application/json' \
  -d "{\"label\":\"Test perso\",\"photos\":{\"front\":\"data:image/png;base64,$PNG\",\"left\":\"data:image/png;base64,$PNG\"}}"
curl -s -X POST http://localhost:3100/api/project -H 'content-type: application/json' \
  -d "{\"projectId\":\"legacy-demo\",\"nodes\":[{\"id\":\"face\",\"type\":\"faceReference\",\"position\":{\"x\":0,\"y\":0},\"data\":{\"imageBase64\":\"data:image/png;base64,$PNG\",\"label\":\"Vieille photo\"}},{\"id\":\"gen\",\"type\":\"generator\",\"position\":{\"x\":420,\"y\":0},\"data\":{\"model\":\"gemini-3.1-flash-image\"}}],\"edges\":[{\"id\":\"e1\",\"source\":\"face\",\"sourceHandle\":\"face\",\"target\":\"gen\",\"targetHandle\":\"face-in\"}]}"
```

Check:
- On a new miniature, add « Personnage » from the sheet → node titled « Personnage » with the select « Choisir un personnage » and « Créer un personnage »; no photo upload zone and no « Retirer le fond » in its « … » menu.
- Open the select → « Test perso »; choose it → the grid shows Face and Profil gauche, « — » for Profil droit; the title becomes « Test perso »; the select can still switch Personnage.
- « Créer un personnage » on an empty Personnage node opens the sidebar Personnages flyout.
- Open `http://localhost:3100/m/legacy-demo` → the old face is an image node « Vieille photo » wired to the generator's Référence input; wait ~3 s, reload → still converted (autosaved). Stop the dev server.

- [ ] **Step 10: Commit**

```bash
git add src/lib/personas.ts src/store/library-store.ts src/components/nodes/FaceReferenceNode.tsx src/components/nodes/PromptNode.tsx src/components/panels/AppSidebar.tsx tests/canvas/personas.test.ts tests/canvas/library-store.test.ts
git commit -m "feat(canvas): Personnage node picks a library persona instead of a single photo"
```

---

## Task 7: Library — Personnages only, logos tagged, chat picker

**Files:**
- Create: `src/components/panels/PersonaImportDialog.tsx`
- Modify: `src/components/panels/AppSidebar.tsx` (shared file — pull `main` and re-read first)
- Modify: `src/components/nodes/GeneratorNode.tsx` (Référence / Logo buttons pass `kind` — shared file, re-read first)
- Modify: `src/components/panels/chat/LibraryPickerModal.tsx` (re-read first)

**Interfaces:**
- Consumes: `PersonaAngle`, `PERSONA_ANGLES`, `PERSONA_ANGLE_LABELS`, `PersonaSummary`, `personaImageUrl`, `personaNodeData`, `personaPickerItem`, `useLibraryStore` (Task 6).
- Produces: `<PersonaImportDialog onClose prepareFile onSubmit saving />` (default export). Sidebar logos and the generator's Logo button create `swipeFile` nodes with `kind: "logo"`. No UI calls `/api/face-reactions*` any more (Task 10 relies on it).

- [ ] **Step 1: Create the per-angle import dialog**

Create `src/components/panels/PersonaImportDialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ImagePlus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PERSONA_ANGLES, PERSONA_ANGLE_LABELS, type PersonaAngle } from "@/lib/personas";

/* eslint-disable @next/next/no-img-element */

/**
 * « Nouveau personnage » without a webcam: one photo per angle. The front
 * photo is required; profiles are optional (the library shows n/3).
 */
export default function PersonaImportDialog({
  onClose,
  prepareFile,
  onSubmit,
  saving,
}: {
  onClose: () => void;
  prepareFile: (file: File) => Promise<string>;
  onSubmit: (photos: Partial<Record<PersonaAngle, string>>, name: string) => Promise<void>;
  saving: boolean;
}) {
  const [photos, setPhotos] = useState<Partial<Record<PersonaAngle, string>>>({});
  const [name, setName] = useState("");

  const pick = async (angle: PersonaAngle, file: File | undefined) => {
    if (!file) return;
    const dataUrl = await prepareFile(file);
    setPhotos((previous) => ({ ...previous, [angle]: dataUrl }));
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Importer un personnage</DialogTitle>
          <DialogDescription>Une photo par angle. La face est obligatoire, les profils sont conseillés.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="persona-import-name">Nom</Label>
            <Input
              id="persona-import-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex : Antoine, Moi, Perso vidéo…"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {PERSONA_ANGLES.map((angle) => (
              <label key={angle} className="group flex cursor-pointer flex-col gap-1.5">
                <span className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted/40 transition-colors group-hover:border-primary">
                  {photos[angle] ? (
                    <img src={photos[angle]} alt={PERSONA_ANGLE_LABELS[angle]} className="size-full object-cover" />
                  ) : (
                    <ImagePlus className="size-5 text-muted-foreground" />
                  )}
                </span>
                <span className="text-center text-xs text-muted-foreground">
                  {PERSONA_ANGLE_LABELS[angle]}
                  {angle === "front" ? " *" : ""}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    void pick(angle, file);
                  }}
                />
              </label>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={!photos.front || saving} onClick={() => void onSubmit(photos, name.trim())}>
            {saving ? "Enregistrement…" : "Créer le personnage"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Sidebar — imports, types and state**

Pull `main` and re-read `src/components/panels/AppSidebar.tsx`. Then:

1. After `import WebcamCaptureModal from "./WebcamCaptureModal";` add:

```tsx
import PersonaImportDialog from "./PersonaImportDialog";
import { personaImageUrl, personaNodeData, type PersonaAngle, type PersonaSummary } from "@/lib/personas";
```

2. Delete these type declarations: `type FaceReaction = { filename: string; label: string; size: number };`, `type Persona = { id: string; label: string; angles: ("front" | "left" | "right")[] };` and the whole `type VisageEntry =` union (its two `|` lines).

3. Delete the state lines `const [faceReactions, setFaceReactions] = useState<FaceReaction[]>([]);`, `const [faceUploading, setFaceUploading] = useState(false);` and `const faceInputRef = useRef<HTMLInputElement>(null);`.

4. Replace `const [personas, setPersonas] = useState<Persona[]>([]);` with:

```tsx
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
```

5. Replace `const [visagesSearch, setVisagesSearch] = useState("");` with:

```tsx
  const [personasSearch, setPersonasSearch] = useState("");
```

6. Replace `const [newVisageOpen, setNewVisageOpen] = useState(false);` with:

```tsx
  const [newPersonaOpen, setNewPersonaOpen] = useState(false);
  const [personaImportOpen, setPersonaImportOpen] = useState(false);
```

- [ ] **Step 3: Sidebar — handlers**

1. Delete the `loadFaces` function (`const loadFaces = () => { fetch("/api/face-reactions")… };`) and its effect `useEffect(() => { loadFaces(); }, []);`.

2. Replace the whole `handlePersonaCaptured` function (and the comment block right above it about WebcamCaptureModal's naming step) with:

```tsx
  // Shared by the webcam wizard (3 angles + name) and the per-angle import
  // dialog (front required). A blank name falls back to « Personnage N ».
  const savePersona = async (photos: Partial<Record<PersonaAngle, string>>, name: string) => {
    setSavingPersona(true);
    try {
      const res = await fetch("/api/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: name || `Personnage ${personas.length + 1}`, photos }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        window.alert(body.error || "Échec de l'enregistrement du personnage — réessaie.");
        return;
      }
      loadPersonas();
      setShowWebcamCapture(false);
      setPersonaImportOpen(false);
    } catch {
      window.alert("Échec de l'enregistrement du personnage — vérifie ta connexion et réessaie.");
    } finally {
      setSavingPersona(false);
    }
  };
```

3. Delete `handleFaceUpload` (`const handleFaceUpload = async (files: FileList | null) => { … };`), `handleDeleteFace` and `renameFace` entirely.

4. Replace the block that starts with the comment `// Personas arrive newest-first from GET /api/personas` and ends with `const filteredVisages = visageEntries.filter(…);` with:

```tsx
  const filteredPersonas = personas.filter((p) => p.label.toLowerCase().includes(personasSearch.toLowerCase()));
```

- [ ] **Step 4: Sidebar — search field and Personnages grid**

1. In the search `Input` shared by the faces and logos tabs, replace

```tsx
                  value={activeTab === "faces" ? visagesSearch : logosSearch}
                  onChange={(e) => (activeTab === "faces" ? setVisagesSearch(e.target.value) : setLogosSearch(e.target.value))}
```

with

```tsx
                  value={activeTab === "faces" ? personasSearch : logosSearch}
                  onChange={(e) => (activeTab === "faces" ? setPersonasSearch(e.target.value) : setLogosSearch(e.target.value))}
```

2. Replace the whole `{activeTab === "faces" && ( … )}` block (from that line down to, not including, `{activeTab === "swipe" && (`) with:

```tsx
            {activeTab === "faces" && (
              <>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-medium text-foreground">Personnages</h3>
                  <Button size="sm" variant="secondary" onClick={() => setNewPersonaOpen(true)} disabled={savingPersona}>
                    <Plus className="size-3" />
                    {savingPersona ? "Enregistrement…" : "Nouveau personnage"}
                  </Button>
                </div>
                <p className="text-xs mb-3 text-muted-foreground">Clique pour ajouter au canvas ({filteredPersonas.length})</p>

                {filteredPersonas.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 rounded-xl cursor-pointer border-2 border-dashed border-border" onClick={() => setNewPersonaOpen(true)}>
                    <Users className="size-8 mb-2 text-muted-foreground" strokeWidth={1.5} />
                    <p className="text-xs text-center px-4 text-muted-foreground">
                      {personasSearch ? "Aucun résultat." : "Crée ton premier personnage"}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-1.5">
                  {filteredPersonas.map((persona) => (
                    <div
                      key={persona.id}
                      className="group cursor-pointer rounded-lg overflow-hidden relative border border-transparent hover:border-muted"
                      onClick={() => addAtCenter("faceReference", personaNodeData(persona))}
                    >
                      {persona.angles[0] ? (
                        <img src={personaImageUrl(persona.id, persona.angles[0])} alt={persona.label} className="w-full aspect-square object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full aspect-square bg-muted" />
                      )}
                      <div className="absolute bottom-0 inset-x-0 px-1.5 py-1 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent">
                        <input
                          defaultValue={persona.label}
                          className="flex-1 min-w-0 truncate text-[10px] bg-transparent text-white focus:outline-none nopan nodrag"
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v && v !== persona.label) renamePersona(persona.id, v);
                          }}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="text-[9px] text-white/80 shrink-0 ml-1">{persona.angles.length}/3</span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeletePersona(persona.id, persona.label); }}
                        className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/75 hover:bg-destructive transition-colors"
                        title="Supprimer"
                      >
                        <X className="size-3 text-white" strokeWidth={2.5} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
```

- [ ] **Step 5: Sidebar — dialogs and logos**

1. Replace `{showWebcamCapture && <WebcamCaptureModal onClose={() => setShowWebcamCapture(false)} onComplete={handlePersonaCaptured} />}` with:

```tsx
      {showWebcamCapture && <WebcamCaptureModal onClose={() => setShowWebcamCapture(false)} onComplete={savePersona} />}

      {personaImportOpen && (
        <PersonaImportDialog
          onClose={() => setPersonaImportOpen(false)}
          prepareFile={(file) => fileToDataUrl(file)}
          onSubmit={savePersona}
          saving={savingPersona}
        />
      )}
```

2. Replace the whole `<Dialog open={newVisageOpen} onOpenChange={setNewVisageOpen}> … </Dialog>` block with:

```tsx
      <Dialog open={newPersonaOpen} onOpenChange={setNewPersonaOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nouveau personnage</DialogTitle>
            <DialogDescription>Ton visage sous trois angles (face, profil gauche, profil droit) pour des miniatures qui te ressemblent.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button variant="outline" className="justify-start" onClick={() => { setNewPersonaOpen(false); setShowWebcamCapture(true); }}>
              <Camera className="size-4" />
              Capturer avec la webcam
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => { setNewPersonaOpen(false); setPersonaImportOpen(true); }}>
              <Upload className="size-4" />
              Importer une photo par angle
            </Button>
          </div>
        </DialogContent>
      </Dialog>
```

3. In the Logos tab, tag logo nodes. Replace

```tsx
                        e.dataTransfer.setData("application/reactflow-data", JSON.stringify({ imageUrl: `/api/logos/image?f=${logo.filename}`, label: logo.label }));
```

with

```tsx
                        e.dataTransfer.setData("application/reactflow-data", JSON.stringify({ imageUrl: `/api/logos/image?f=${logo.filename}`, label: logo.label, kind: "logo" }));
```

and replace

```tsx
                        onClick={() => addAtCenter("swipeFile", { imageUrl: `/api/logos/image?f=${logo.filename}`, label: logo.label })}
```

with

```tsx
                        onClick={() => addAtCenter("swipeFile", { imageUrl: `/api/logos/image?f=${logo.filename}`, label: logo.label, kind: "logo" })}
```

4. Verify nothing of the single-photo library remains:

```bash
grep -n "face-reactions\|faceReactions\|FaceReaction\|VisageEntry\|newVisageOpen\|visagesSearch\|handlePersonaCaptured\|faceInputRef\|handleFaceUpload\|renameFace\|Nouveau visage" src/components/panels/AppSidebar.tsx
```

Expected: no output.

- [ ] **Step 6: Generator buttons pass the swipe-file kind**

Pull `main` and re-read `src/components/nodes/GeneratorNode.tsx`. If the « Référence » and « Logo » input buttons still call `addNodeAndConnect("swipeFile", …)`, pass the kind as the 6th argument:

- the call ending with `id, "ref-in", "image")` becomes `id, "ref-in", "image", { kind: "reference" })`
- the call ending with `id, "logo-in", "image")` becomes `id, "logo-in", "image", { kind: "logo" })`

If those buttons no longer exist (rewritten by another plan), skip this step and say so in your report.

- [ ] **Step 7: Chat library picker lists Personnages**

Re-read `src/components/panels/chat/LibraryPickerModal.tsx`. Then:

1. After `import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";` add:

```tsx
import { personaPickerItem, type PersonaSummary } from "@/lib/personas";
```

2. Replace the `TABS` constant and the `TAB_LABELS` constant (from `const TABS: Record<Tab, {` through the `const TAB_LABELS` line) with:

```tsx
type Row = Record<string, unknown>;

// « faces » lists Personnages (multi-angle sets). Single face photos are
// no longer offered anywhere.
const TABS: Record<Tab, { listUrl: string; toItem: (row: Row) => Item | null }> = {
  faces: {
    listUrl: "/api/personas",
    toItem: (row) => personaPickerItem(row as unknown as PersonaSummary),
  },
  logos: {
    listUrl: "/api/logos",
    toItem: (row) => ({
      source: `stored:lg_${row.filename}`,
      preview_url: `/api/logos/image?f=${encodeURIComponent(String(row.filename))}`,
      label: (row.label as string) || "Untitled",
    }),
  },
  refs: {
    listUrl: "/api/swipe-files",
    toItem: (row) => ({
      source: `stored:sf_${row.filename}`,
      preview_url: `/api/swipe-files/image?f=${encodeURIComponent(String(row.filename))}`,
      label: (row.title as string) || "Untitled",
    }),
  },
};

const TAB_LABELS: Record<Tab, string> = { faces: "Personnages", logos: "Logos", refs: "Références" };
```

3. Replace the `.then((rows: Array<Record<string, unknown>>) => { … })` callback (the one mapping `r.filename` with `cfg.storedPrefix`, `cfg.imagePrefix` and `cfg.labelKey`) with:

```tsx
      .then((rows: Row[]) => {
        if (cancelled) return;
        setItems(rows.map((row) => cfg.toItem(row)).filter((item): item is Item => item !== null));
      })
```

Check: `grep -n "face-reactions\|storedPrefix\|labelKey" src/components/panels/chat/LibraryPickerModal.tsx` prints nothing.

- [ ] **Step 8: Type-check, lint, full suite**

Run:
```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/components/panels/AppSidebar.tsx src/components/panels/PersonaImportDialog.tsx src/components/nodes/GeneratorNode.tsx src/components/panels/chat/LibraryPickerModal.tsx
./node_modules/.bin/vitest run
```
Expected: `tsc` exits 0; no eslint errors (if eslint reports an import as unused — e.g. `useRef` — remove it only if it really is unused); all tests pass.

- [ ] **Step 9: Check in the browser (throwaway dev server, port 3100)**

Start the dev server and seed a Personnage with the first `curl` of Task 6 Step 9. Check:
- Sidebar « Personnages »: heading « Personnages », button « Nouveau personnage », only the seeded Personnage (« 2/3 »), no « 1 photo » tiles. Clicking the tile adds a Personnage node showing its angles.
- « Nouveau personnage » → dialog with only « Capturer avec la webcam » and « Importer une photo par angle ». The import dialog shows « Face * », « Profil gauche », « Profil droit »; « Créer le personnage » stays disabled until a Face photo is chosen; pick any small image for Face, name « Import test », create → appears in the grid as 1/3.
- Sidebar « Logos »: import a logo, click it → node titled with its label; drag a wire from its output to empty space → only « Générateur », wired on `logo-in`.
- Generator « Logo » input button → the created node reads « Ajouter un logo ».
- Chat → attach → « Bibliothèque »: first tab « Personnages » lists the Personnages. Stop the dev server.

- [ ] **Step 10: Commit**

```bash
git add src/components/panels/PersonaImportDialog.tsx src/components/panels/AppSidebar.tsx src/components/nodes/GeneratorNode.tsx src/components/panels/chat/LibraryPickerModal.tsx
git commit -m "feat(library): Personnages-only face library with per-angle import; logos tagged as logos"
```

---

## Task 8: Agent data paths accept only Personnages as faces

**Files:**
- Modify: `src/lib/agent/blueprint/schema.ts`
- Modify: `src/lib/agent/tools/_helpers/image-source.ts`
- Modify: `src/lib/agent/tools/apply-workflow.ts`
- Modify: `src/lib/agent/tools/get-canvas-state.ts`
- Modify: `src/lib/agent/tools/generate-sketch.ts`
- Modify: `src/components/panels/ChatPanel.tsx` (`summarizeNode` only — re-read first)
- Test: `tests/agent/blueprint-schema.test.ts`, `tests/agent/image-source.test.ts`, `tests/agent/apply-workflow.test.ts`, `tests/agent/get-canvas-state.test.ts`, `tests/agent/generate-sketch.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `ImageSourceSchema` without `stored:fr_`; `faceReference.image_source` must match `stored:persona_<id>`; `resolveImageSource` / `imageExists` no longer know `fr`; canvas `swipeFile` nodes built by `apply_workflow` carry `kind`; `get_canvas_state` and the chat snapshot summarise a faceReference as `{ persona: "stored:persona_<id>" | null, label }`.

- [ ] **Step 1: Update the blueprint tests**

In `tests/agent/blueprint-schema.test.ts`:

1. In the `describe("ImageSource")` accepts list, replace `"stored:fr_bbb",` with `"stored:persona_bbb",`.
2. In the rejects list, add `"stored:fr_bbb",                // single face photos are gone: Personnages only` as the first entry.
3. Inside `describe("Blueprint", …)`, add these tests after « rejects faceReference without image_source »:

```ts
  it("accepts a faceReference pointing at a Personnage", () => {
    const bp = {
      nodes: [{ id: "f-1", type: "faceReference", data: { image_source: "stored:persona_abc" } }],
      edges: [],
    };
    expect(BlueprintSchema.safeParse(bp).success).toBe(true);
  });

  it.each(["stored:fr_abc", "stored:sf_abc", "uploaded:up_abc", "generated:sk_abc"])(
    "rejects a faceReference whose image_source is %s (faces are Personnages only)",
    (source) => {
      const bp = { nodes: [{ id: "f-1", type: "faceReference", data: { image_source: source } }], edges: [] };
      const result = BlueprintSchema.safeParse(bp);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(JSON.stringify(result.error.issues)).toContain("stored:persona_");
      }
    },
  );
```

- [ ] **Step 2: Update the image-source tests**

In `tests/agent/image-source.test.ts`, add inside `describe("resolveImageSource", …)` (after « rejects an unsupported scheme »):

```ts
  it("no longer resolves single face photos (stored:fr_)", async () => {
    await expect(resolveImageSource("stored:fr_anything")).rejects.toThrow();
  });
```

and inside `describe("imageExists …", …)` (after « returns false for unsupported schemes »):

```ts
  it("returns false for single face photos (stored:fr_)", () => {
    expect(imageExists("stored:fr_anything")).toBe(false);
  });
```

- [ ] **Step 3: Update the apply_workflow tests**

In `tests/agent/apply-workflow.test.ts`:

1. In « resolves image_source to a data URL on the persisted swipeFile node so canvas can render it », after `expect(swipe.data.label).toBe("Brand");` add:

```ts
    expect(swipe.data.kind).toBe("logo"); // lets the canvas wire a Logo to logo-in
```

2. Add before the final `});` of the `describe`:

```ts
  it("stores a Personnage faceReference as its angle photos", async () => {
    const personaId = uuid();
    getDb().prepare("INSERT INTO personas (id, label) VALUES (?, ?)").run(personaId, "Antoine");
    getDb()
      .prepare("INSERT INTO persona_photos (id, persona_id, angle, mime_type, size, data) VALUES (?, ?, ?, ?, ?, ?)")
      .run(uuid(), personaId, "front", "image/png", 1, Buffer.from([1]));
    const bp = {
      nodes: [{ id: "face-1", type: "faceReference", data: { image_source: `stored:persona_${personaId}` } }],
      edges: [],
    };
    const r = await applyWorkflowTool.handler({ project_id: projectId, blueprint: bp });
    expect(r.isError).toBeFalsy();
    const row = getDb().prepare("SELECT nodes FROM projects WHERE id = ?").get(projectId) as { nodes: string };
    const face = (JSON.parse(row.nodes) as Array<{ data: Record<string, unknown> }>)[0];
    expect(face.data.personaId).toBe(personaId);
    expect((face.data.personaAngles as Record<string, string>).front).toMatch(/^data:image\/png;base64,/);
    expect(face.data.label).toBe("Antoine");
    expect(face.data.imageBase64).toBeUndefined();
  });

  it("rejects a single face photo on a faceReference", async () => {
    const bp = { nodes: [{ id: "face-1", type: "faceReference", data: { image_source: "stored:fr_legacy" } }], edges: [] };
    const r = await applyWorkflowTool.handler({ project_id: projectId, blueprint: bp });
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toContain("stored:persona_");
  });
```

- [ ] **Step 4: Rewrite the get_canvas_state test**

Replace the whole content of `tests/agent/get-canvas-state.test.ts` with:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { getCanvasStateTool } from "@/lib/agent/tools/get-canvas-state";
import { getDb } from "@/lib/db";

describe("get_canvas_state", () => {
  const projectId = "test-canvas-state";

  beforeAll(() => {
    getDb()
      .prepare("INSERT OR REPLACE INTO projects (id, nodes, edges) VALUES (?, ?, ?)")
      .run(
        projectId,
        JSON.stringify([
          { id: "p-1", type: "prompt", data: { prompt: "hello world", negativePrompt: "blur" } },
          { id: "g-1", type: "generator", data: { model: "openai", aspectRatio: "16x9", count: 4 } },
          {
            id: "f-1",
            type: "faceReference",
            data: { personaId: "abc", personaAngles: { front: "data:image/png;base64,AAAA" }, label: "Antoine" },
          },
          { id: "s-1", type: "swipeFile", data: { imageBase64: "data:image/png;base64,BBBB", label: "Brand", kind: "logo" } },
        ]),
        JSON.stringify([
          { source: "p-1", target: "g-1", targetHandle: "prompt-in" },
          { source: "f-1", target: "g-1", targetHandle: "face-in" },
          { source: "s-1", target: "g-1", targetHandle: "logo-in" },
        ]),
      );
  });

  it("returns blueprint with all nodes and edges", async () => {
    const r = await getCanvasStateTool.handler({ project_id: projectId });
    const parsed = JSON.parse((r.content[0] as { text: string }).text);
    expect(parsed.nodes).toHaveLength(4);
    expect(parsed.edges).toHaveLength(3);
  });

  it("strips binary image data from node summaries", async () => {
    const r = await getCanvasStateTool.handler({ project_id: projectId });
    const text = (r.content[0] as { text: string }).text;
    expect(text).not.toContain("AAAA");
    expect(text).not.toContain("BBBB");
    const parsed = JSON.parse(text);
    const swipe = parsed.nodes.find((n: { id: string }) => n.id === "s-1");
    expect(swipe.summary).toMatchObject({ hasImage: true, label: "Brand", kind: "logo" });
  });

  it("summarises a Personnage by its persona reference", async () => {
    const r = await getCanvasStateTool.handler({ project_id: projectId });
    const parsed = JSON.parse((r.content[0] as { text: string }).text);
    const face = parsed.nodes.find((n: { id: string }) => n.id === "f-1");
    expect(face.summary).toEqual({ persona: "stored:persona_abc", label: "Antoine" });
  });

  it("preserves prompt content in summary", async () => {
    const r = await getCanvasStateTool.handler({ project_id: projectId });
    const parsed = JSON.parse((r.content[0] as { text: string }).text);
    const prompt = parsed.nodes.find((n: { id: string }) => n.id === "p-1");
    expect(prompt.summary.prompt).toBe("hello world");
    expect(prompt.summary.negativePrompt).toBe("blur");
  });

  it("preserves generator config in summary", async () => {
    const r = await getCanvasStateTool.handler({ project_id: projectId });
    const parsed = JSON.parse((r.content[0] as { text: string }).text);
    const gen = parsed.nodes.find((n: { id: string }) => n.id === "g-1");
    expect(gen.summary).toMatchObject({ model: "openai", aspectRatio: "16x9", count: 4 });
  });

  it("returns empty blueprint for unknown project", async () => {
    const r = await getCanvasStateTool.handler({ project_id: "does-not-exist" });
    const parsed = JSON.parse((r.content[0] as { text: string }).text);
    expect(parsed.nodes).toEqual([]);
    expect(parsed.edges).toEqual([]);
  });
});
```

If `get_canvas_state`'s generator summary was changed by another plan (e.g. it now also includes `abTest`), keep using `toMatchObject` as written — do not tighten it.

- [ ] **Step 5: Update the generate_sketch face test**

In `tests/agent/generate-sketch.test.ts`, in « wraps a face/reference image as a tagged input_references object, not a bare string », replace

```ts
    getDb().prepare("INSERT OR REPLACE INTO face_reactions (id, label, mime_type, size, data) VALUES (?, ?, ?, ?, ?)")
      .run("test1", "Test face", "image/png", bytes.length, bytes);
```

with

```ts
    getDb().prepare("INSERT OR REPLACE INTO personas (id, label) VALUES (?, ?)").run("test1", "Test persona");
    getDb()
      .prepare("INSERT OR REPLACE INTO persona_photos (id, persona_id, angle, mime_type, size, data) VALUES (?, ?, ?, ?, ?, ?)")
      .run("test1-front", "test1", "front", "image/png", bytes.length, bytes);
```

and replace `face_source: "stored:fr_test1"` with `face_source: "stored:persona_test1"`.

- [ ] **Step 6: Run the tests to see them fail**

Run: `./node_modules/.bin/vitest run tests/agent/blueprint-schema.test.ts tests/agent/image-source.test.ts tests/agent/apply-workflow.test.ts tests/agent/get-canvas-state.test.ts tests/agent/generate-sketch.test.ts`
Expected: FAIL in `blueprint-schema` (`stored:fr_bbb` still accepted, faceReference still accepts `stored:sf_…`), `apply-workflow` (`kind` missing; `stored:fr_legacy` rejected only later with « Image source not found », without the Personnage message) and `get-canvas-state` (face summary is still `hasImage`). The two new `image-source` tests and the updated `generate-sketch` test already pass — they are regression guards for the code removed in Step 8.

- [ ] **Step 7: Restrict the blueprint schema**

In `src/lib/agent/blueprint/schema.ts`, replace the header comment and `ImageSourceSchema`:

```ts
// Stored prefixes map 1:1 to DB tables :
//   lg_ → logos, sf_ → swipe_files, fr_ → face_reactions, gi_ → generated_images,
//   persona_ → personas (resolves to up to 3 angle images, not one — see
//   blueprintToCanvasData's special-case handling in apply-workflow.ts)
export const ImageSourceSchema = z.string().refine(
  (s) =>
    /^stored:(lg|sf|fr|gi|persona)_[\w-]+$/.test(s) ||
```

with

```ts
// Stored prefixes map 1:1 to DB tables :
//   lg_ → logos, sf_ → swipe_files, gi_ → generated_images,
//   persona_ → personas (resolves to up to 3 angle images, not one — see
//   blueprintToCanvasData's special-case handling in apply-workflow.ts).
// Single face photos (fr_) are no longer a source: faces are Personnages
// only.
export const ImageSourceSchema = z.string().refine(
  (s) =>
    /^stored:(lg|sf|gi|persona)_[\w-]+$/.test(s) ||
```

Right after the closing `);` of `ImageSourceSchema`, add:

```ts
const PersonaSourceSchema = z
  .string()
  .regex(
    /^stored:persona_[\w-]+$/,
    "faceReference only accepts a Personnage: image_source must be stored:persona_<id> (see list_personas)",
  );
```

In the `faceReference` branch of `NodeDataByType`, replace `image_source: ImageSourceSchema,` with:

```ts
    image_source: PersonaSourceSchema,
```

(Only the faceReference branch — swipeFile and sketch keep `ImageSourceSchema`.)

- [ ] **Step 8: Drop `fr` from the image resolver**

In `src/lib/agent/tools/_helpers/image-source.ts`:

1. Replace

```ts
const TABLE_BY_PREFIX = {
  lg: "logos",
  sf: "swipe_files",
  fr: "face_reactions",
  gi: "generated_images",
} as const;
```

with

```ts
// fr_ (single face photos) is intentionally absent: faces are Personnages
// only (stored:persona_<id>, handled below).
const TABLE_BY_PREFIX = {
  lg: "logos",
  sf: "swipe_files",
  gi: "generated_images",
} as const;
```

2. Replace both occurrences of the regex `/^stored:(lg|sf|fr|gi)_(.+)$/` (one in `resolveImageSource`, one in `imageExists`) with `/^stored:(lg|sf|gi)_(.+)$/`.

- [ ] **Step 9: apply_workflow keeps `kind` and loses the single-photo face branch**

In `src/lib/agent/tools/apply-workflow.ts`, inside `blueprintToCanvasData`'s `switch (type)`:

1. Delete the whole `case "faceReference":` block that returns `{ imageBase64, label: data.label || "Visage", image_source: imageSource }` (a faceReference can only be a Personnage now, handled by the persona branch above the switch).

2. Replace the `swipeFile` case

```ts
    case "swipeFile":
      return {
        imageBase64,
        label: data.label || (data.kind === "logo" ? "Logo" : "Image"),
        image_source: imageSource,
      };
```

with

```ts
    case "swipeFile":
      return {
        imageBase64,
        label: data.label || (data.kind === "logo" ? "Logo" : "Image"),
        kind: data.kind,
        image_source: imageSource,
      };
```

- [ ] **Step 10: Summaries describe Personnages**

In `src/lib/agent/tools/get-canvas-state.ts`, inside `summarize`, replace

```ts
    case "faceReference":
    case "swipeFile":
    case "sketch":
```

with

```ts
    case "faceReference":
      return {
        persona: typeof data.personaId === "string" ? `stored:persona_${data.personaId}` : null,
        label: data.label,
      };
    case "swipeFile":
    case "sketch":
```

Re-read `src/components/panels/ChatPanel.tsx` (parallel chat work may have moved things). In its `summarizeNode` function, apply the same split: replace

```tsx
    case "faceReference":
    case "swipeFile":
    case "sketch":
```

with

```tsx
    case "faceReference":
      return {
        persona: typeof data.personaId === "string" ? `stored:persona_${data.personaId}` : null,
        label: data.label,
      };
    case "swipeFile":
    case "sketch":
```

- [ ] **Step 11: generate_sketch points at Personnages**

In `src/lib/agent/tools/generate-sketch.ts`:

1. Replace the input schema comment

```ts
  // OPTIONAL: face image to bake the user's actual face into the sketch (so the
  // sketched person resembles them, not a generic person). Pass `stored:fr_<id>`.
```

with

```ts
  // OPTIONAL: the user's Personnage, to bake their actual face into the sketch
  // (so the sketched person resembles them, not a generic person). Pass
  // `stored:persona_<id>` — its front angle is used.
```

2. In the tool `description`, replace ``ALWAYS pass `face_source: stored:fr_<id>` when a face is involved`` with ``ALWAYS pass `face_source: stored:persona_<id>` (the chosen Personnage) when the user's face is involved``.

- [ ] **Step 12: Run the tests, types and full suite**

Run:
```bash
./node_modules/.bin/vitest run tests/agent/blueprint-schema.test.ts tests/agent/image-source.test.ts tests/agent/apply-workflow.test.ts tests/agent/get-canvas-state.test.ts tests/agent/generate-sketch.test.ts
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
grep -rn "stored:fr_\|(lg|sf|fr|gi" src/lib/agent/blueprint src/lib/agent/tools/_helpers src/lib/agent/tools/apply-workflow.ts src/lib/agent/tools/generate-sketch.ts src/lib/agent/tools/get-canvas-state.ts
```
Expected: the five files pass; `tsc` exits 0; the full suite passes; the grep prints nothing.

- [ ] **Step 13: Commit**

```bash
git add src/lib/agent/blueprint/schema.ts src/lib/agent/tools/_helpers/image-source.ts src/lib/agent/tools/apply-workflow.ts src/lib/agent/tools/get-canvas-state.ts src/lib/agent/tools/generate-sketch.ts src/components/panels/ChatPanel.tsx tests/agent/blueprint-schema.test.ts tests/agent/image-source.test.ts tests/agent/apply-workflow.test.ts tests/agent/get-canvas-state.test.ts tests/agent/generate-sketch.test.ts
git commit -m "feat(agent): faces are Personnages only in blueprints, image sources and canvas summaries"
```

---

## Task 9: Remove `list_face_reactions` and rewrite the agent's face guidance

**Files:**
- Delete: `src/lib/agent/tools/list-face-reactions.ts`, `tests/agent/list-face-reactions.test.ts`
- Modify: `src/lib/agent/tools/all.ts`, `src/lib/agent/tool-labels.ts`, `src/lib/agent/tools/list-personas.ts`
- Modify: `src/lib/agent/system-prompt.ts` (shared file — pull `main` and re-read first)
- Test: `tests/agent/registry-full.test.ts`, `tests/agent/mcp-server.test.ts`, `tests/agent/system-prompt.test.ts` (shared file — re-read first)

**Interfaces:**
- Consumes: the persona-only schema and `generate_sketch` wording from Task 8.
- Produces: a tool registry without `list_face_reactions`; no tool description and no system prompt text mentions `list_face_reactions` or `stored:fr_`.

- [ ] **Step 1: Write the failing tests**

In `tests/agent/registry-full.test.ts`:

1. Remove `"list_face_reactions",` from the `expected` array.
2. Add inside the `describe("full registry", …)`:

```ts
  it("no longer offers single face photos to the agent", () => {
    const tools = listTools();
    expect(tools.map((t) => t.name)).not.toContain("list_face_reactions");
    for (const tool of tools) {
      expect(tool.description, tool.name).not.toMatch(/list_face_reactions|stored:fr_/);
    }
  });
```

In `tests/agent/mcp-server.test.ts`:

1. Rename the test `"lists all 13 tools from the registry"` to `"lists the registry tools"`.
2. Remove `"list_face_reactions",` from its array and add, right after the `.forEach((n) => expect(names).toContain(n));` line:

```ts
    expect(names).not.toContain("list_face_reactions");
```

In `tests/agent/system-prompt.test.ts` (re-read it first — the Réglages plan rewrote it), add inside its top-level `describe`:

```ts
  it("treats faces as Personnages only", () => {
    expect(AGENT_SYSTEM_PROMPT).not.toContain("list_face_reactions");
    expect(AGENT_SYSTEM_PROMPT).not.toContain("stored:fr_");
    expect(AGENT_SYSTEM_PROMPT).toContain("Personnages only");
    expect(AGENT_SYSTEM_PROMPT).toContain('face_source: "stored:persona_<id>"');
  });
```

If `AGENT_SYSTEM_PROMPT` is not imported in that file any more, add it to the existing import from `@/lib/agent/system-prompt`.

- [ ] **Step 2: Run them to verify they fail**

Run: `./node_modules/.bin/vitest run tests/agent/registry-full.test.ts tests/agent/mcp-server.test.ts tests/agent/system-prompt.test.ts`
Expected: FAIL — `list_face_reactions` is still registered and still named in the prompt.

- [ ] **Step 3: Remove the tool**

```bash
git rm src/lib/agent/tools/list-face-reactions.ts tests/agent/list-face-reactions.test.ts
```

In `src/lib/agent/tools/all.ts`, delete the line `import "./list-face-reactions";`.

In `src/lib/agent/tool-labels.ts`, delete the line `  list_face_reactions: "bibliothèque · visages",`.

- [ ] **Step 4: Rewrite the list_personas texts**

In `src/lib/agent/tools/list-personas.ts`, replace the whole `description:` string with:

```ts
  description:
    "Lists the user's Personnages — multi-angle face reference sets (front + left/right profile, captured via webcam or imported one photo per angle). A Personnage is the ONLY way to put the user's face in a thumbnail: it gives Nano Banana Pro and Seedream up to 3 angles of the same identity, which measurably improves face consistency. Each entry includes a `stored:persona_<id>` ref usable as a faceReference node's image_source in apply_workflow and as generate_sketch's face_source.",
```

and replace the empty-library text

```ts
            text: "Aucun Personnage dans la bibliothèque. L'utilisateur peut en créer un depuis l'onglet Personnages de la sidebar (capture webcam en 3 angles). En attendant, propose list_face_reactions si une photo simple existe.",
```

with

```ts
            text: "Aucun Personnage dans la bibliothèque. S'il veut apparaître dans la miniature, propose-lui d'en créer un depuis l'onglet Personnages de la sidebar (capture webcam en 3 angles ou une photo par angle) ; sinon pars sur des angles sans visage.",
```

- [ ] **Step 5: Rewrite the face guidance in the system prompt**

Pull `main` and re-read `src/lib/agent/system-prompt.ts`. All edits are inside the `AGENT_SYSTEM_PROMPT` template literal (no backticks or `${` in the new text).

1. Replace

```
Do NOT batch list_personas / list_face_reactions / list_logos / list_swipe_files / search_youtube in parallel.
```

with

```
Do NOT batch list_personas / list_logos / list_swipe_files / search_youtube in parallel.
```

2. Replace the whole step 5 — from the line starting `5. **Face decision tree**` through the bullet starting `   - When matching a face to an angle via list_face_reactions:` (inclusive; six lines in total) — with:

```
5. **Face decision tree — Personnages only** — call list_personas. A Personnage (multi-angle face set: front + left/right profile) is the ONLY way to put the user's face in a thumbnail: pass its stored:persona_<id> ref as the faceReference's image_source and as generate_sketch's face_source. It gives Nano Banana Pro / Seedream up to 3 angles of the same identity, which measurably improves face consistency — this is the single biggest lever for "look like me across the whole thumbnail set". Never use a single photo, a chat upload or a reference image as the user's face. Then:
   - If the user has a Personnage AND the YT patterns from step 3 show faces dominating → propose 3 sketches WITH the face baked in. Don't ask permission first — just propose. If several Personnages exist, pick the one whose label fits the video, or ask once which one to use.
   - If the user has a Personnage AND the YT patterns are mostly faceless → propose 3 sketches WITHOUT face, but mention "tu peux apparaître si tu veux, ton personnage est prêt" so they can pivot.
   - If the user has NO Personnage → ask once "tu veux apparaître ? Si oui, crée d'abord un Personnage dans l'onglet Personnages de la bibliothèque (webcam en 3 angles ou une photo par angle), puis dis-le-moi. Si non, je pars sans visage." Don't keep nagging. Move on with no-face sketches if they decline.
   - A Personnage carries identity, not expression: write the expression each angle needs (choqué, concentré, hilare…) into that angle's prompt text.
```

3. Replace

```
PROPOSING ANGLES — when you've gathered context (search_youtube, list_personas, list_face_reactions, list_logos, etc.)
```

with

```
PROPOSING ANGLES — when you've gathered context (search_youtube, list_personas, list_logos, etc.)
```

4. Replace

```
CRITICAL: when the angle uses a face, you MUST pass face_source: "stored:fr_<id>" to generate_sketch
```

with

```
CRITICAL: when the angle uses the user's face, you MUST pass face_source: "stored:persona_<id>" (the chosen Personnage) to generate_sketch
```

5. Replace

```
- DO NOT re-call list_personas, list_face_reactions, list_logos, or list_swipe_files — you already have them in context from this turn.
```

with

```
- DO NOT re-call list_personas, list_logos, or list_swipe_files — you already have them in context from this turn.
```

6. Replace

```
      - faceReference with image_source = the matched stored:fr_<id>
```

with

```
      - faceReference with image_source = the chosen stored:persona_<id> — ONLY a Personnage ref is accepted here; leave the faceReference node out when the angle has no face
```

Verify:

```bash
grep -n "list_face_reactions\|stored:fr_\|face_reactions" src/lib/agent/system-prompt.ts src/lib/agent/tools src/lib/agent/tool-labels.ts -r
```

Expected: no output. If the Réglages plan's `<channel_profile>` block (in `buildSystemMessages` or a helper such as `src/lib/agent/prompt-prefs.ts`) mentions faces, it already uses `stored:persona_<id>` — leave it.

- [ ] **Step 6: Run the tests, types and full suite**

Run:
```bash
./node_modules/.bin/vitest run tests/agent/registry-full.test.ts tests/agent/mcp-server.test.ts tests/agent/system-prompt.test.ts
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
```
Expected: the three files pass; `tsc` exits 0; the full suite passes.

- [ ] **Step 7: Commit**

```bash
git add src/lib/agent/tools/all.ts src/lib/agent/tool-labels.ts src/lib/agent/tools/list-personas.ts src/lib/agent/system-prompt.ts tests/agent/registry-full.test.ts tests/agent/mcp-server.test.ts tests/agent/system-prompt.test.ts
git commit -m "feat(agent): drop list_face_reactions; face guidance speaks only of Personnages"
```

(The deletions were staged by `git rm` in Step 3.)

---

## Task 10: Delete the orphaned face_reactions code

**Files:**
- Delete: `src/app/api/face-reactions/route.ts`, `src/app/api/face-reactions/analyze-untagged/route.ts`, `src/app/api/face-reactions/rename/route.ts`, `src/lib/agent/vision.ts`, `tests/agent/rename-face-reaction-route.test.ts`
- Modify: `src/app/api/face-reactions/image/route.ts` (explanatory comment only)
- Modify: `src/components/panels/ChatPanel.tsx` (stale comment only — re-read first)

**Interfaces:**
- Consumes: Tasks 7–9 removed every UI and agent caller.
- Produces: only `GET /api/face-reactions/image` remains (ruling 4); the `face_reactions` table and `src/middleware.ts` exemption stay.

- [ ] **Step 1: Prove there are no callers left**

Run:
```bash
grep -rn "api/face-reactions\|face_reactions\|tagFaceImage\|agent/vision\|list_face_reactions\|stored:fr_" src tests
```

Expected output lines, and only these:
- `src/app/api/face-reactions/route.ts`, `…/analyze-untagged/route.ts`, `…/rename/route.ts`, `…/image/route.ts` (the routes themselves)
- `src/lib/agent/vision.ts` (if it names the table in a comment)
- `src/lib/db.ts` (table creation and its `tags` column migration — kept)
- `src/middleware.ts` (public `api/face-reactions/image` exemption — kept)
- `src/components/panels/ChatPanel.tsx` (the backfill comment removed in Step 3)
- `tests/agent/rename-face-reaction-route.test.ts` (deleted in Step 2)
- `tests/canvas/migrate-canvas.test.ts`, `tests/canvas/canvas-store.test.ts` (legacy `imageUrl` fixtures, and `stored:fr_abc` in the migration fixture — kept)
- `tests/agent/blueprint-schema.test.ts`, `tests/agent/image-source.test.ts`, `tests/agent/apply-workflow.test.ts`, `tests/agent/registry-full.test.ts`, `tests/agent/mcp-server.test.ts`, `tests/agent/system-prompt.test.ts` (negative assertions — kept)

If any other file appears (e.g. a new component calling `/api/face-reactions`), STOP and report it instead of deleting.

- [ ] **Step 2: Delete the routes, the tagging helper and the route test**

```bash
git rm src/app/api/face-reactions/route.ts src/app/api/face-reactions/analyze-untagged/route.ts src/app/api/face-reactions/rename/route.ts src/lib/agent/vision.ts tests/agent/rename-face-reaction-route.test.ts
```

- [ ] **Step 3: Document the surviving route and drop the stale chat comment**

At the top of `src/app/api/face-reactions/image/route.ts`, before the first import, add:

```ts
// The only face_reactions route left. Single face photos are no longer a
// library item (faces are Personnages), but canvases saved before that change
// hold image nodes whose imageUrl points here (legacy faces are converted to
// reference images on load, and the save strips their base64 because an
// imageUrl exists) — so this read-only endpoint must keep serving them.
```

Re-read `src/components/panels/ChatPanel.tsx`. Delete the comment block that starts with `// NOTE: auto-backfill of existing untagged faces was removed at the user's` (five `//` lines mentioning `POST /api/face-reactions` and `/api/face-reactions/analyze-untagged`). Change nothing else in that file.

- [ ] **Step 4: Type-check (clearing stale route validators) and full suite**

Run:
```bash
./node_modules/.bin/tsc --noEmit || (rm -rf .next/types .next/dev/types && ./node_modules/.bin/tsc --noEmit)
./node_modules/.bin/vitest run
grep -rn "api/face-reactions" src
```
Expected: `tsc` exits 0; the full suite passes; the grep lists only `src/app/api/face-reactions/image/route.ts` (if its comment names the path) and `src/middleware.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/face-reactions/image/route.ts src/components/panels/ChatPanel.tsx
git commit -m "chore: remove orphaned face_reactions routes and tagging; keep the legacy image endpoint"
```

(The deletions were staged by `git rm` in Step 2.)

---

## Task 11: Docker rebuild and live verification

**Files:** none (verification only; fix-ups found here go in a separate commit listing exactly the files touched).

**Interfaces:**
- Consumes: everything above.
- Produces: the running app at `http://localhost:3000` with chantier A, verified against the spec's manual checklist.

- [ ] **Step 1: Final static checks on `main`**

Run:
```bash
git status --short
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
./node_modules/.bin/eslint src/components/Canvas.tsx src/components/panels/NodePicker.tsx src/components/panels/CanvasEmptyState.tsx src/components/panels/ContextMenu.tsx src/components/panels/ZoomBar.tsx src/components/panels/AppSidebar.tsx src/components/panels/PersonaImportDialog.tsx src/components/panels/chat/LibraryPickerModal.tsx src/components/nodes/FaceReferenceNode.tsx src/components/nodes/SwipeFileNode.tsx src/components/nodes/PromptNode.tsx src/hooks src/lib/canvas src/lib/personas.ts src/store
```
Expected: clean working tree (apart from files that were already untracked before this plan); `tsc` exits 0; all tests pass; no eslint errors.

- [ ] **Step 2: Rebuild and restart the container — the only rebuild of this plan**

```bash
docker compose build thumbgen && docker compose up -d thumbgen
for i in $(seq 1 60); do code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/miniatures); [ "$code" = "200" ] && break; sleep 2; done; echo "HTTP $code"
docker compose logs --tail 30 thumbgen
```
Expected: build succeeds, `HTTP 200`, no error in the last log lines. If the build fails, fix the cause, commit the fix, and rebuild once more — report that a second build was needed.

- [ ] **Step 3: Live checks on `http://localhost:3000`**

This is the user's real data. Work in a dedicated miniature: in `/miniatures`, « Nouvelle miniature » named « Test ajout d'étapes ». Do not delete the user's projects, Personnages or logos; do not click « Générer » (paid). Leave the test miniature in place and tell the user its name at the end.

Canvas (spec § 2–5):
- [ ] Empty test canvas shows the dashed « + » and « Ajouter une première étape »; panning over it works; clicking opens « Ajouter une étape » (« Choisis ce qui démarre ta miniature »), search focused.
- [ ] Search is accent/case-insensitive (`APERCU` → Aperçu; `marque` → Logo); ↑/↓ move the highlighted row across categories; Entrée adds at the view centre; the sheet closes; « Aucune étape ne correspond » for `zzz`; Échap closes the sheet.
- [ ] Right-click background: « Ajouter une étape N » (node lands at the click point), « Ranger le workflow ⇧⌥T », « Tout sélectionner ⌘A », « Tout désélectionner Échap », with disabled states as the canvas changes.
- [ ] Right-click a node: « Dupliquer ⌘D » (copy +40/+40, no wires, undo with ⌘Z) and red « Supprimer ⌫ ».
- [ ] Shortcuts on the canvas: `N`, `⇧⌥T`, `⌘A`, `⌘D` (duplicates the selection), `Échap`; typing `n` in the chat input does not open the sheet.
- [ ] A new Générateur carries the Réglages generation defaults (format, nombre, résolution).
- [ ] Wire from the generator's `logo-in` to empty space → only « Logo », wired on `logo-in`; from `sketch-in` → only « Croquis », on `sketch-in`; from a Logo node's output → only « Générateur », on `logo-in`; from a generator `result` → « Texte overlay » and « Aperçu ».

Personnages (spec § 6):
- [ ] Sidebar « Personnages »: only Personnages (n/3), no « 1 photo » tiles; « Nouveau personnage » offers only « Capturer avec la webcam » and « Importer une photo par angle »; open the import dialog and cancel (do not create a Personnage in the user's library).
- [ ] « Personnage » node from the sheet: select lists the user's Personnages; choosing one shows its angles and renames the node; switching works; on an empty node « Créer un personnage » opens the Personnages flyout.
- [ ] If one of the user's existing miniatures contains an old single-photo face node, open it: it now shows as an image node wired to Référence (optional — skip if none is known).
- [ ] Chat → attach → « Bibliothèque »: the first tab is « Personnages ».

Agent (spec § 6 — cheap check, one exchange, no sketches):
- [ ] Only if the user's library has at least one Personnage: in the test miniature's chat, send « Sans croquis ni recherche : construis directement sur le canvas un workflow avec mon personnage, un prompt "test" et un générateur. » Expected: tool activity shows « bibliothèque · personnages » and « workflow appliqué », never « bibliothèque · visages »; the canvas gets a Personnage node (angles visible) wired to the generator's `face-in`. Do not click « Générer ». If no Personnage exists, skip and say so.

- [ ] **Step 4: Report**

Report to the user: build result, each checklist item (pass / fail / skipped with reason), the name of the test miniature left in place, and any follow-up commit made during verification.

