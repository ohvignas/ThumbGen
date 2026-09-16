# Refonte UI 100% shadcn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all custom inline-style/CSS ("Atelier Nocturne" design tokens) from ThumbGen's non-canvas UI chrome and replace it entirely with real shadcn/ui primitives on the neutral "b0" theme, while leaving the React Flow canvas and its nodes visually untouched.

**Architecture:** A mechanical CSS-variable rename frees the `--accent` name for a real shadcn token, then every chrome component (Sidebar → a real `sidebar-07`-style `AppSidebar`, ProjectBar, ZoomBar, ContextMenu, Settings, the three overlay modals, SketchEditor's chrome, the Usage page, and the remaining chat sub-components) is rewritten file-by-file from `style={{ background: "var(--surface)" }}`-style inline CSS to Tailwind classes bound to the new b0 tokens and real shadcn components (`Sidebar`, `DropdownMenu`, `Dialog`, `Select`, `Switch`, `Table`, `Badge`, `ToggleGroup`, `Skeleton`, etc). One additional, spec-directed exception exists: the Sidebar's "Visages" tab gets a real UX fix (unified grid, single entry-point dialog, working search, inline rename) alongside its reskin — everywhere else in this plan is presentation-only, zero behavior change.

**Tech Stack:** Next.js 16 App Router, React 19.2, Zustand, `@xyflow/react`, TypeScript strict, Tailwind v4, shadcn/ui (style `base-nova`, already configured in `components.json`), `lucide-react` icons.

**Spec:** docs/superpowers/specs/2026-09-15-shadcn-ui-redesign-design.md

## Global Constraints

- **Canvas and nodes are out of scope for visual change.** `src/components/Canvas.tsx`, `src/components/edges/CustomEdge.tsx`, and all 8 files in `src/components/nodes/*.tsx` get zero visual change. The only edits allowed there are: (a) the mechanical `--accent`/`--accent-yellow` → `--canvas-accent`/`--canvas-accent-yellow` rename (Task 1), and (b) in `Canvas.tsx` only, removing the `<Sidebar />` render call and its import once `AppSidebar` moves to `page.tsx` (Task 3) — a structural move with no visual effect since `Sidebar` was already `position: fixed` (viewport-relative, not canvas-relative).
- **No behavior changes anywhere, except the Visages tab (Task 3b).** Every fetch call, Zustand state variable, drag-and-drop handler, and keyboard shortcut in every other file must survive unchanged — this is a presentation rewrite (JSX/markup/styles), not a logic rewrite. The Visages tab is the one deliberate exception, per the spec's "Parcours — gestion des visages" subsection: it gets a real UX fix in addition to the reskin.
- **Font stays Arial everywhere.** The `--font-dm-sans`/`--font-display`/`--font-mono` tokens are already all `Arial, Helvetica, sans-serif` — do not introduce a different font in any converted component.
- **b0 oklch values are exact.** The `:root`/`.dark` shadcn-token block in Task 1 must match the spec's CSS block byte-for-byte (values only — variable names already exist in the file).
- **Atelier Nocturne tokens (`--ink-*`, `--bone*`, `--brand*`, `--ember`, `--surface`, `--text-*`, `--line*`, `--canvas-bg`, `--node-bg*`) stay defined in `globals.css`** (the canvas/nodes depend on them) but after this plan, no file outside `Canvas.tsx`/`edges/CustomEdge.tsx`/`nodes/*.tsx` may reference them.
- **Every task that touches JSX/CSS ends with `npx tsc --noEmit` (expect the count of errors to only ever decrease task-over-task, reaching 0 once Task 11 lands) and a manual browser verification step** (`preview_start` the dev server, look at the actual surface — this project's standing rule that UI work isn't done until it's been seen).
- **Run the existing test suite (`npx vitest run`) after every task; expect zero test changes and zero new failures** — the suite doesn't cover style, so nothing here should move it, with the sole exception of Task 3b's two new backend rename endpoints, which get their own new tests.
- **Commit only the files a task actually lists — never `git add -A` or `git add .`.**
- **`components.json` is already configured** (`style: "base-nova"`, `baseColor: "neutral"`, `cssVariables: true`, aliases `@/components`, `@/lib/utils`, `@/components/ui`, `@/hooks`) — do not recreate or modify it.
- **Already-installed shadcn primitives** (do not reinstall): `alert`, `bubble`, `button`, `card`, `collapsible`, `empty`, `input-group`, `input`, `message-scroller`, `message`, `textarea`, `tooltip`.

---

## Task 1: Foundation — rename `--accent`/`--accent-yellow`, swap b0 theme values

**Files:**
- Modify: `src/app/globals.css:39-40,107,171,254` (definitions + 2 canvas CSS rules; line 254's `--color-accent: var(--accent)` mapping is explicitly NOT touched — see Step 2's note)
- Modify: `src/app/globals.css:48-78,276-306` (swap `:root`/`.dark` shadcn-token values to the b0 preset)
- Modify (mechanical rename only, `var(--accent)`/`var(--accent-yellow)` → `var(--canvas-accent)`/`var(--canvas-accent-yellow)`): `src/components/Canvas.tsx`, `src/components/edges/CustomEdge.tsx`, `src/components/nodes/GeneratorNode.tsx`, `src/components/nodes/PreviewNode.tsx`, `src/components/nodes/PromptNode.tsx`, `src/components/nodes/SketchNode.tsx`, `src/components/nodes/SwipeFileNode.tsx`, `src/components/nodes/TextOverlayNode.tsx`, `src/components/panels/ZoomBar.tsx`
- Modify (same mechanical rename, but these 4 files were **not** in the spec's naive "9 files" list — found by grepping the real repo, exactly as instructed; they are chrome files fully rewritten in later tasks, so this rename is a temporary correctness fix to avoid an interim visual regression between this task and the task that rewrites them): `src/components/panels/SketchEditor.tsx` (rewritten in Task 9), `src/components/panels/Sidebar.tsx` (deleted in Task 3), `src/components/panels/SettingsPanel.tsx` (rewritten in Task 7), `src/components/panels/WebcamCaptureModal.tsx` (rewritten in Task 8)
- Test: none (presentational; run existing suite, expect zero changes)

**Interfaces:**
- Produces: `--canvas-accent` (#6EDDB3), `--canvas-accent-yellow` (#F7FFA8) — consumed by the canvas/node files above for the rest of this plan's lifetime. `--accent`/`--accent-foreground` become real b0 shadcn tokens, consumed by every shadcn primitive installed in Task 2 (`bg-accent`, `text-accent-foreground`, etc.) and by nothing else.

**Note on `src/lib/model-costs.ts:42`:** grep for `var(--accent)` also matches a comment there (`reference: "#6EDDB3", // var(--accent)`). This is a documentation comment next to a hardcoded hex literal, not an actual CSS variable consumption — leave it untouched (optionally update the comment text to `// var(--canvas-accent)` for accuracy, but this has zero functional effect and is not required).

- [ ] **Step 1: Verify the file list by grepping the real repo — do not trust the spec's list blindly**

```bash
grep -rln "var(--accent)" src/
grep -rln "var(--accent-yellow)" src/
```

Expected: the 13 files listed above in "Modify" (Canvas.tsx, CustomEdge.tsx, 6 node files, ZoomBar.tsx, SketchEditor.tsx, Sidebar.tsx, SettingsPanel.tsx, WebcamCaptureModal.tsx) plus `globals.css` itself. `NodeShell.tsx`'s `accentColor` prop and `model-costs.ts`'s comment are unrelated false positives from a broader `--accent` grep — confirm they do NOT appear in this `var(--accent)`-scoped grep (they don't, since neither uses the literal `var(--accent)` substring).

- [ ] **Step 2: Rename the definitions and canvas-only CSS rules in `globals.css`**

```
Old (lines 39-40):
  --accent: #6EDDB3;
  --accent-yellow: #F7FFA8;

New:
  --canvas-accent: #6EDDB3;
  --canvas-accent-yellow: #F7FFA8;
```

```
Old (line 107, inside .react-flow__handle):
  background: var(--accent) !important;

New:
  background: var(--canvas-accent) !important;
```

```
Old (line 171, inside .react-flow__node.selected .node-card):
  border-color: var(--accent) !important;

New:
  border-color: var(--canvas-accent) !important;
```

**Do NOT touch line 254** (`--color-accent: var(--accent);` inside `@theme inline`). This line maps the Tailwind utility `bg-accent`/`text-accent`/etc. to the token named `--accent` — after Step 1 renames the canvas token away, `--accent` as a name is free, and Step 3 below defines it fresh as a real b0 gray. Leaving line 254 pointing at `var(--accent)` is correct and intentional: it now resolves to the new b0 value automatically.

- [ ] **Step 3: Swap the `:root`/`.dark` shadcn-token values to the b0 preset**

Replace lines 48-78 of `:root` (the block from `--background: oklch(1 0 0);` through `--sidebar-ring: oklch(0.708 0 0);`) and lines 276-306 of `.dark` (from `--background: var(--ink-1);` through `--sidebar-ring: oklch(0.556 0 0);`) with the spec's exact block:

```css
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --radius: 0.625rem;
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}
```

(This block replaces the CURRENT `:root`'s shadcn-token lines only — the Atelier Nocturne lines above it, `--font-dm-sans` through `--canvas-accent-yellow`/`--text-muted`/`--handle-size`/`--node-radius`/`--node-width`, stay exactly as they are, untouched, immediately above this block.)

```css
.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.556 0 0);
}
```

This REPLACES the current `.dark` block, which today remaps these same names onto Atelier Nocturne (`--background: var(--ink-1)`, `--primary: var(--brand)`, etc. — a previous session's work). The app forces `className="dark"` on `<html>` (`layout.tsx`), so this `.dark` block is what's actually active; the app now renders in neutral b0 gray instead of the tinted dark palette.

- [ ] **Step 4: Rename all consuming references in the 12 non-CSS files**

For each of the 13 files listed in "Modify" above (all except `globals.css`, already done in Steps 2-3), apply this exact two-pass rename (order matters — accent-yellow first, so the second pass's parenthesis-anchored pattern can't double-match):

```bash
for f in \
  src/components/Canvas.tsx \
  src/components/edges/CustomEdge.tsx \
  src/components/nodes/GeneratorNode.tsx \
  src/components/nodes/PreviewNode.tsx \
  src/components/nodes/PromptNode.tsx \
  src/components/nodes/SketchNode.tsx \
  src/components/nodes/SwipeFileNode.tsx \
  src/components/nodes/TextOverlayNode.tsx \
  src/components/panels/ZoomBar.tsx \
  src/components/panels/SketchEditor.tsx \
  src/components/panels/Sidebar.tsx \
  src/components/panels/SettingsPanel.tsx \
  src/components/panels/WebcamCaptureModal.tsx \
; do
  sed -i '' 's/--accent-yellow/--canvas-accent-yellow/g' "$f"
  sed -i '' 's/(--accent)/(--canvas-accent)/g' "$f"
done
```

(The second pattern `(--accent)` matches only the exact substring `(--accent)` — i.e. `var(--accent)`'s parenthesized form — so it cannot match `(--accent-foreground` or the just-renamed `(--canvas-accent-yellow)`, both of which have extra characters before the closing paren.)

- [ ] **Step 5: Verify the rename is complete and clean**

```bash
grep -rn "var(--accent)" src/ ; echo "exit: $?"
grep -rn "var(--accent-yellow)" src/ ; echo "exit: $?"
```

Expected: both commands print nothing and exit 1 (no matches) — every real consumer has been renamed. Then confirm the canvas tokens are intact and the new b0 accent exists:

```bash
grep -n "canvas-accent" src/app/globals.css
grep -n "^  --accent:" src/app/globals.css
```

Expected: `--canvas-accent: #6EDDB3;` / `--canvas-accent-yellow: #F7FFA8;` in the Atelier Nocturne block, and two `--accent: oklch(...)` lines (one in `:root`, one in `.dark`) from Step 3.

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors (pure string/value substitution, no type-level change).

- [ ] **Step 7: Visual check — canvas must be pixel-identical**

Start the dev server (`preview_start`), open the canvas (`/`). Confirm: React Flow connection handles are still mint-green (`#6EDDB3`), selected node borders still mint-green, the "Générateur"/context-menu star icon is still `#F7FFA8` yellow, ZoomBar's active navigate/pan button is still yellow-highlighted. Take a screenshot of the canvas area — this is the before/after reference for the rest of the plan (canvas must never change from this point on). Also confirm the rest of the app (Sidebar rail, Settings panel status dots, webcam capture buttons) still shows the SAME mint-green accent it did before this task — these files were mechanically renamed in Step 4 specifically so nothing regresses before their own dedicated task lands.

- [ ] **Step 8: Run the existing test suite**

```bash
npx vitest run
```

Expected: identical pass/fail counts to the pre-task baseline (no style-related tests exist).

- [ ] **Step 9: Commit**

```bash
git add src/app/globals.css src/components/Canvas.tsx src/components/edges/CustomEdge.tsx src/components/nodes/GeneratorNode.tsx src/components/nodes/PreviewNode.tsx src/components/nodes/PromptNode.tsx src/components/nodes/SketchNode.tsx src/components/nodes/SwipeFileNode.tsx src/components/nodes/TextOverlayNode.tsx src/components/panels/ZoomBar.tsx src/components/panels/SketchEditor.tsx src/components/panels/Sidebar.tsx src/components/panels/SettingsPanel.tsx src/components/panels/WebcamCaptureModal.tsx
git commit -m "$(cat <<'EOF'
chore: rename canvas --accent/--accent-yellow tokens, swap theme to b0 preset

Frees the --accent name for real shadcn semantic tokens. Zero visual
change anywhere — canvas keeps its mint-green handles via the renamed
--canvas-accent, and every other file that used var(--accent) was
mechanically renamed too so nothing regresses before its own
dedicated shadcn conversion task lands.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Install missing shadcn primitives

**Files:**
- Create: `src/components/ui/{sidebar,dropdown-menu,separator,breadcrumb,avatar,dialog,select,switch,label,table,badge,toggle-group,skeleton}.tsx` (+ whatever transitive `ui/*` dependencies the installer pulls in — do not hand-author, let the CLI generate them)
- Modify: `package.json`, `package-lock.json` (new Radix/base-ui peer deps as needed)
- Test: none

**Interfaces:**
- Produces: `Sidebar`, `SidebarProvider`, `SidebarHeader`, `SidebarContent`, `SidebarFooter`, `SidebarGroup`, `SidebarGroupLabel`, `SidebarGroupContent`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarInset`, `SidebarTrigger`, `useSidebar` (from `@/components/ui/sidebar`) — consumed by Task 3. `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator`, `DropdownMenuLabel` (from `@/components/ui/dropdown-menu`) — consumed by Tasks 4, 5, 6. `Separator` (`@/components/ui/separator`) — Task 5, 9. `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` (`@/components/ui/dialog`) — Tasks 3, 3b, 7, 8. `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` (`@/components/ui/select`) — Task 7. `Switch` (`@/components/ui/switch`) — Task 7. `Label` (`@/components/ui/label`) — Task 7. `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` (`@/components/ui/table`) — Task 10. `Badge` (`@/components/ui/badge`) — Task 10. `ToggleGroup`, `ToggleGroupItem` (`@/components/ui/toggle-group`) — Tasks 5, 10. `Skeleton` (`@/components/ui/skeleton`) — Task 10. `Avatar`/`AvatarImage`/`AvatarFallback` and `Breadcrumb*` are installed for completeness (spec's install list) but have no confirmed consumer in this plan — leave unused rather than inventing a call site.

- [ ] **Step 1: Run the installer**

```bash
npx shadcn@latest add sidebar dropdown-menu separator breadcrumb avatar dialog select switch label table badge toggle-group skeleton --yes
```

Expected: creates the 13 named files under `src/components/ui/` (plus any transitive deps it decides it needs, e.g. `sheet.tsx` if `sidebar.tsx`'s mobile variant depends on it — accept whatever the real installer produces), and updates `package.json`/`package-lock.json`.

- [ ] **Step 2: Confirm no unexpected changes to already-installed files**

```bash
git status
git diff package.json
```

Expected: `src/components/ui/{alert,bubble,button,card,collapsible,empty,input-group,input,message-scroller,message,textarea,tooltip}.tsx` are NOT modified (only new files appear under `src/components/ui/`) and `globals.css`/`layout.tsx` are NOT touched by this installer run (unlike the AI Elements installer from a prior session, these are plain shadcn component adds with no CSS/font side effects — verify this is still true for the real run, and if the installer DOES touch `globals.css`, diff it and revert any change there since Task 1 already set the correct b0 values).

- [ ] **Step 3: Confirm the real `sidebar.tsx` export names before Task 3 depends on them**

```bash
grep -n "^export" src/components/ui/sidebar.tsx
```

Read the full list. Task 3's code below assumes `Sidebar`, `SidebarProvider`, `SidebarHeader`, `SidebarContent`, `SidebarFooter`, `SidebarGroup`, `SidebarGroupLabel`, `SidebarGroupContent`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton` (with `tooltip`/`isActive`/`onClick` props), `SidebarInset`, and a `--sidebar-width-icon` CSS variable read by `SidebarProvider`'s `style` prop — these are the standard, stable shadcn sidebar-07 block exports. If this installed version's real names differ, adjust Task 3's imports/JSX to match the real exports rather than the names below — do not silently skip Task 3's sidebar usage.

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors (nothing imports the new files yet).

- [ ] **Step 5: Run the existing test suite**

```bash
npx vitest run
```

Expected: identical pass/fail counts to baseline.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui package.json package-lock.json
git commit -m "$(cat <<'EOF'
chore: install missing shadcn primitives (sidebar, dropdown-menu, dialog, select, switch, label, table, badge, toggle-group, skeleton, separator, avatar, breadcrumb)

Scoped install for the shadcn UI redesign — no components consume
these yet, this is purely adding the building blocks.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Token-mapping convention (used from here on)

Every remaining task converts Atelier Nocturne inline styles to Tailwind classes bound to the new b0 tokens. This table is the canonical mapping — applied directly in every task's code below, cited by reference instead of re-derived each time:

| Atelier Nocturne | b0 Tailwind |
|---|---|
| `color: var(--text-primary)` | `text-foreground` |
| `color: var(--text-secondary)` | `text-foreground` |
| `color: var(--text-tertiary)` | `text-muted-foreground` |
| `color: var(--text-muted)` | `text-muted-foreground` |
| `background: var(--surface)` | `bg-muted` |
| `background: var(--node-bg)` | `bg-card` |
| `background: var(--node-bg-hover)` | `bg-accent` |
| `border: 1px solid var(--line-faint)` | `border border-border/50` |
| `border: 1px solid var(--line)` | `border border-border` |
| `border: 1px solid var(--line-strong)` | `border border-border` |
| `color`/`background: var(--brand)` | `text-primary` / `bg-primary` |
| `background: var(--brand-tint)` | `bg-primary/10` |
| `color`/`background: var(--ember)` | `text-destructive` / `bg-destructive` |
| solid "light" action button (`background: var(--bone)`) | real `<Button>` (default variant handles its own colors) |
| `background: var(--ink-3)` (code/log surfaces) | `bg-muted` |
| custom hover-swap `onMouseEnter`/`onMouseLeave` inline handlers | Tailwind `hover:` classes |

---

## Task 3: AppSidebar shell + Modèles/Logos/Inspirations tabs (pure reskin)

**Files:**
- Create: `src/components/panels/AppSidebar.tsx`
- Delete: `src/components/panels/Sidebar.tsx`, `src/components/panels/SidebarRail.tsx`
- Modify: `src/app/layout.tsx` (wrap `children` in `SidebarProvider`)
- Modify: `src/app/page.tsx` (render `AppSidebar` + `SidebarInset` around `Canvas`)
- Modify: `src/components/Canvas.tsx:21,306` (remove the `Sidebar` import and its render call — `AppSidebar` now mounts at the page level, not inside `<ReactFlow>`)
- Modify: `src/app/usage/UsageView.tsx` (swap `<Sidebar />` for `<AppSidebar />` + `SidebarInset`, drop the now-redundant left padding compensation)
- Test: none new (presentational + one structural move; run existing suite, expect zero changes)

**Interfaces:**
- Consumes: `Sidebar`, `SidebarProvider`, `SidebarHeader`, `SidebarContent`, `SidebarFooter`, `SidebarGroup`, `SidebarGroupLabel`, `SidebarGroupContent`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarInset` (Task 2's `@/components/ui/sidebar`), `Dialog`/`DialogContent` (Task 2's `@/components/ui/dialog`), `Button` (`@/components/ui/button`), `Input` (`@/components/ui/input`), `Empty`/`EmptyHeader`/`EmptyMedia`/`EmptyTitle`/`EmptyDescription` (`@/components/ui/empty`).
- Produces: `export default function AppSidebar()` from `src/components/panels/AppSidebar.tsx` — consumed by `page.tsx` (this task), `UsageView.tsx` (this task), and rewritten again in Task 3b (Visages tab body only — every other export/prop stays the same).

**Note on the "Personnages"/Visages tab in THIS task:** per the coordinator's scope split, Task 3 is a pure, behavior-identical reskin. The Visages tab body below is therefore a faithful, unchanged-behavior port of the CURRENT `Sidebar.tsx`'s two separate sections (Personas grid + "Autres visages" grid, both delete-only, search still non-functional) — Task 3b immediately replaces this specific block with the real UX fix (unified grid, single entry dialog, working search, inline rename). Writing it twice is deliberate: it keeps this task strictly a reskin (independently testable against today's exact behavior) and keeps Task 3b's diff self-contained.

**Note on the top "Rechercher" input:** ported exactly as it is today — a single `<Input>` rendered unconditionally at the top of every tab's panel, with no `value`/`onChange` (decorative, does nothing on any tab today — confirmed reading `Sidebar.tsx`, its only wired search is `Inspirations`' own SECOND, separate field below it). Task 3b is the one that fixes this (wires it for Visages + Logos, removes it from Modèles + Inspirations where it doesn't belong) — do not get ahead of that here.

- [ ] **Step 1: Read the real `sidebar.tsx` exports one more time** (Task 2, Step 3 already did this — re-confirm nothing changed) and write `AppSidebar.tsx`:

```tsx
"use client";

import { useState, useEffect, useRef, DragEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useCanvasStore } from "@/store/canvas-store";
import { useReactFlow } from "@xyflow/react";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SettingsPanel from "./SettingsPanel";
import WebcamCaptureModal from "./WebcamCaptureModal";
import { PROVIDER_COLORS } from "@/lib/model-costs";
import { Users, Image as ImageIcon, LayoutGrid, Shapes, BarChart3, Settings as SettingsIcon, Search, Plus, X } from "lucide-react";

/* eslint-disable @next/next/no-img-element */

type SidebarTab = "models" | "faces" | "logos" | "swipe" | null;

type LogoEntry = { filename: string; label: string; size: number };
type SwipeEntry = { title: string; filename: string; size: number };
type YouTubeItem = { videoId: string; title: string; thumbnailUrl: string; addedAt: string };
type FaceReaction = { filename: string; label: string; size: number };
type Persona = { id: string; label: string; angles: ("front" | "left" | "right")[] };

const MODELS = [
  { id: "gemini-3-pro-image", label: "Gemini 3 Pro", color: PROVIDER_COLORS.gemini },
  { id: "gemini-3.1-flash-image", label: "Gemini 3.1 Flash", color: PROVIDER_COLORS.gemini },
  { id: "gemini-3.1-flash-lite-image", label: "Gemini 3.1 Flash Lite", color: PROVIDER_COLORS.gemini },
  { id: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash", color: PROVIDER_COLORS.gemini },
  { id: "ideogram", label: "Ideogram v3", color: PROVIDER_COLORS.ideogram },
  { id: "gpt-image-2.5-sunburst", label: "GPT Image 2.5 Sunburst (précis)", color: PROVIDER_COLORS.openai },
  { id: "gpt-image-2.5-flare", label: "GPT Image 2.5 Flare (rapide)", color: PROVIDER_COLORS.openai },
  { id: "gpt-image-2", label: "GPT Image 2 (4K)", color: PROVIDER_COLORS.openai },
  { id: "gpt-image-1.5", label: "GPT Image 1.5", color: PROVIDER_COLORS.openai },
  { id: "gpt-image-1", label: "GPT Image 1", color: PROVIDER_COLORS.openai },
  { id: "grok-imagine-image-2.0", label: "Grok Imagine 2.0", color: PROVIDER_COLORS.grok },
  { id: "bytedance-seed/seedream-4.5", label: "Seedream 4.5 (ByteDance)", color: PROVIDER_COLORS.openrouter },
];

export default function AppSidebar() {
  const [activeTab, setActiveTab] = useState<SidebarTab>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [swipeEntries, setSwipeEntries] = useState<SwipeEntry[]>([]);
  const [youtubeItems, setYoutubeItems] = useState<YouTubeItem[]>([]);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [swipeSearch, setSwipeSearch] = useState("");
  const [faceReactions, setFaceReactions] = useState<FaceReaction[]>([]);
  const [faceUploading, setFaceUploading] = useState(false);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [showWebcamCapture, setShowWebcamCapture] = useState(false);
  const [savingPersona, setSavingPersona] = useState(false);
  const [uploadedSwipes, setUploadedSwipes] = useState<SwipeEntry[]>([]);
  const [swipeUploading, setSwipeUploading] = useState(false);
  const [logos, setLogos] = useState<LogoEntry[]>([]);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faceInputRef = useRef<HTMLInputElement>(null);
  const swipeInputRef = useRef<HTMLInputElement>(null);
  const addNode = useCanvasStore((s) => s.addNode);
  const { screenToFlowPosition } = useReactFlow();
  const pathname = usePathname();
  const router = useRouter();
  const onCanvas = pathname === "/";

  const loadFaces = () => {
    fetch("/api/face-reactions").then((r) => r.json()).then(setFaceReactions).catch(() => {});
  };
  const loadPersonas = () => {
    fetch("/api/personas").then((r) => r.json()).then(setPersonas).catch(() => {});
  };

  const handlePersonaCaptured = async (photos: Record<"front" | "left" | "right", string>, name: string) => {
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
    } catch {
      window.alert("Échec de l'enregistrement du personnage — vérifie ta connexion et réessaie.");
    } finally {
      setSavingPersona(false);
    }
  };

  const handleDeletePersona = async (id: string, label: string) => {
    if (!window.confirm(`Supprimer "${label}" ? Les nœuds du canvas qui l'utilisent ne fonctionneront plus.`)) return;
    try {
      const res = await fetch(`/api/personas/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      loadPersonas();
    } catch {
      window.alert("Échec de la suppression — réessaie.");
    }
  };

  const loadUploadedSwipes = () => {
    fetch("/api/swipe-files").then((r) => r.json()).then(setUploadedSwipes).catch(() => {});
  };

  useEffect(() => {
    fetch("/swipe-file/manifest.json").then((r) => r.json()).then(setSwipeEntries).catch(() => {});
  }, []);
  useEffect(() => { loadFaces(); }, []);
  useEffect(() => { loadPersonas(); }, []);
  useEffect(() => { loadUploadedSwipes(); }, []);

  const fileToDataUrl = (file: File, maxSize = 1600): Promise<string> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = URL.createObjectURL(file);
    });
  };

  const handleFaceUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setFaceUploading(true);
    for (const file of Array.from(files)) {
      const dataUrl = await fileToDataUrl(file);
      await fetch("/api/face-reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, label: file.name.replace(/\.[^.]+$/, ""), ext: "jpg" }),
      });
    }
    setFaceUploading(false);
    loadFaces();
  };

  const handleDeleteFace = async (filename: string) => {
    await fetch(`/api/face-reactions?filename=${encodeURIComponent(filename)}`, { method: "DELETE" });
    loadFaces();
  };

  const handleSwipeUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setSwipeUploading(true);
    for (const file of Array.from(files)) {
      const dataUrl = await fileToDataUrl(file);
      await fetch("/api/swipe-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, title: file.name.replace(/\.[^.]+$/, ""), ext: "jpg" }),
      });
    }
    setSwipeUploading(false);
    loadUploadedSwipes();
  };

  const handleDeleteSwipe = async (filename: string) => {
    await fetch(`/api/swipe-files?filename=${encodeURIComponent(filename)}`, { method: "DELETE" });
    loadUploadedSwipes();
  };

  const loadLogos = () => {
    fetch("/api/logos").then((r) => r.json()).then(setLogos).catch(() => {});
  };
  useEffect(() => { loadLogos(); }, []);

  const fileToDataUrlPng = (file: File, maxSize = 512): Promise<string> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = URL.createObjectURL(file);
    });
  };

  const handleLogoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setLogoUploading(true);
    for (const file of Array.from(files)) {
      const dataUrl = await fileToDataUrlPng(file);
      await fetch("/api/logos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, label: file.name.replace(/\.[^.]+$/, ""), ext: "png" }),
      });
    }
    setLogoUploading(false);
    loadLogos();
  };

  const handleDeleteLogo = async (filename: string) => {
    await fetch(`/api/logos?filename=${encodeURIComponent(filename)}`, { method: "DELETE" });
    loadLogos();
  };

  const fetchPlaylist = () => {
    setYoutubeLoading(true);
    fetch("/api/youtube/playlist")
      .then((r) => r.json())
      .then((data) => { if (data.items) setYoutubeItems(data.items); })
      .catch(() => {})
      .finally(() => setYoutubeLoading(false));
  };

  useEffect(() => {
    fetchPlaylist();
    const interval = setInterval(fetchPlaylist, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const onSettingsSaved = () => { fetchPlaylist(); };

  const toggleTab = (tab: SidebarTab) => setActiveTab((prev) => (prev === tab ? null : tab));

  const addAtCenter = (type: string, data?: Record<string, unknown>) => {
    if (!onCanvas) {
      router.push("/");
      return;
    }
    const pos = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    pos.x += (Math.random() - 0.5) * 100;
    pos.y += (Math.random() - 0.5) * 100;
    addNode(type, pos, data);
  };

  const onDragStart = (e: DragEvent, type: string, data?: Record<string, unknown>) => {
    e.dataTransfer.setData("application/reactflow-type", type);
    if (data) e.dataTransfer.setData("application/reactflow-data", JSON.stringify(data));
    e.dataTransfer.effectAllowed = "move";
  };

  const onSwipeDragStart = (e: DragEvent, imageUrl: string, label: string) => {
    e.dataTransfer.setData("application/reactflow-type", "swipeFile");
    e.dataTransfer.setData("application/reactflow-data", JSON.stringify({ imageUrl, label }));
    e.dataTransfer.effectAllowed = "move";
  };

  const filteredSwipe = swipeEntries.filter((e) => e.title.toLowerCase().includes(swipeSearch.toLowerCase()));
  const filteredYoutube = youtubeItems.filter((e) => e.title.toLowerCase().includes(swipeSearch.toLowerCase()));

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <Link href="/" className="flex items-center justify-center h-11 w-11 rounded-xl mx-auto" aria-label="ThumbGen home">
            <Image src="/illith.svg" alt="" width={26} height={26} priority />
          </Link>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Miniatures</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Personnages" isActive={activeTab === "faces"} onClick={() => toggleTab("faces")}>
                    <Users />
                    <span>Personnages</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Modèles d'image" isActive={activeTab === "models"} onClick={() => toggleTab("models")}>
                    <ImageIcon />
                    <span>Modèles d&apos;image</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Inspirations" isActive={activeTab === "swipe"} onClick={() => toggleTab("swipe")}>
                    <LayoutGrid />
                    <span>Inspirations</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Logos" isActive={activeTab === "logos"} onClick={() => toggleTab("logos")}>
                    <Shapes />
                    <span>Logos</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Usage et coûts" isActive={!onCanvas} onClick={() => router.push("/usage")}>
                <BarChart3 />
                <span>Usage</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Réglages" onClick={() => setSettingsOpen(true)}>
                <SettingsIcon />
                <span>Réglages</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      {/* Expandable flyout panel — same role as the old Sidebar.tsx's activeTab panel.
          The shadcn Sidebar primitive has no secondary-flyout concept, so this stays a
          plain fixed-position sibling, positioned right at the icon rail's edge. */}
      {activeTab && (
        <div
          className="fixed top-0 bottom-0 z-10 overflow-y-auto bg-sidebar border-r border-sidebar-border"
          style={{ left: "var(--sidebar-width-icon, 4rem)", width: activeTab === "swipe" || activeTab === "faces" || activeTab === "logos" ? 300 : 240 }}
        >
          <div className="p-4">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <Input placeholder="Rechercher" className="pl-9" />
            </div>

            {activeTab === "faces" && (
              <>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-medium text-foreground">Personnages</h3>
                  <Button size="sm" variant="secondary" onClick={() => setShowWebcamCapture(true)} disabled={savingPersona}>
                    <Plus className="size-3" />
                    {savingPersona ? "Enregistrement…" : "Nouveau"}
                  </Button>
                </div>
                <p className="text-xs mb-3 text-muted-foreground">
                  Face + 2 profils webcam, pour une identité cohérente sur toutes tes miniatures ({personas.length})
                </p>

                {personas.length === 0 && (
                  <div
                    className="flex flex-col items-center justify-center py-8 rounded-xl cursor-pointer border-2 border-dashed border-border mb-5"
                    onClick={() => setShowWebcamCapture(true)}
                  >
                    <Users className="size-8 mb-2 text-muted-foreground" strokeWidth={1.5} />
                    <p className="text-xs text-center px-4 text-muted-foreground">Crée ton premier personnage avec la webcam</p>
                  </div>
                )}

                {personas.length > 0 && (
                  <div className="grid grid-cols-2 gap-1.5 mb-5">
                    {personas.map((persona) => (
                      <div
                        key={persona.id}
                        className="group cursor-pointer rounded-lg overflow-hidden relative border border-transparent hover:border-muted"
                        onClick={() =>
                          addAtCenter("faceReference", {
                            label: persona.label,
                            personaId: persona.id,
                            personaAngles: {
                              front: persona.angles.includes("front") ? `/api/personas/image?id=${persona.id}&angle=front` : undefined,
                              left: persona.angles.includes("left") ? `/api/personas/image?id=${persona.id}&angle=left` : undefined,
                              right: persona.angles.includes("right") ? `/api/personas/image?id=${persona.id}&angle=right` : undefined,
                            },
                          })
                        }
                      >
                        <img src={`/api/personas/image?id=${persona.id}&angle=${persona.angles[0]}`} alt={persona.label} className="w-full aspect-square object-cover" loading="lazy" />
                        <div className="absolute bottom-0 inset-x-0 px-1.5 py-1 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent">
                          <span className="text-[10px] truncate text-white">{persona.label}</span>
                          <span className="text-[9px] text-white/80">{persona.angles.length}/3</span>
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
                )}

                <div className="mb-2 border-t border-border" />

                <div className="flex items-center justify-between mb-1 mt-3">
                  <h3 className="text-sm font-medium text-foreground">Autres visages</h3>
                  <Button size="sm" variant="secondary" onClick={() => faceInputRef.current?.click()} disabled={faceUploading}>
                    <Plus className="size-3" />
                    {faceUploading ? "Import…" : "Ajouter"}
                  </Button>
                  <input ref={faceInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFaceUpload(e.target.files)} />
                </div>
                <p className="text-xs mb-3 text-muted-foreground">Clique pour ajouter au canvas ({faceReactions.length})</p>

                {faceReactions.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 rounded-xl cursor-pointer border-2 border-dashed border-border" onClick={() => faceInputRef.current?.click()}>
                    <Users className="size-8 mb-2 text-muted-foreground" strokeWidth={1.5} />
                    <p className="text-xs text-muted-foreground">Importe tes photos ici</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-1.5">
                  {faceReactions.map((face) => (
                    <div
                      key={face.filename}
                      draggable
                      onClick={() => addAtCenter("faceReference", { imageUrl: `/api/face-reactions/image?f=${face.filename}`, label: face.label })}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/reactflow-type", "faceReference");
                        e.dataTransfer.setData("application/reactflow-data", JSON.stringify({ imageUrl: `/api/face-reactions/image?f=${face.filename}`, label: face.label }));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className="group cursor-pointer rounded-lg overflow-hidden relative border border-transparent hover:border-muted"
                    >
                      <img src={`/api/face-reactions/image?f=${face.filename}`} alt={face.label} className="w-full aspect-video object-cover" loading="lazy" />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteFace(face.filename); }}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Supprimer"
                      >
                        <X className="size-2.5 text-destructive" strokeWidth={2.5} />
                      </button>
                      <div className="px-1.5 py-1 bg-card">
                        <p className="text-[10px] truncate text-muted-foreground">{face.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {activeTab === "swipe" && (
              <>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-medium text-foreground">Inspirations</h3>
                  <Button size="sm" variant="secondary" onClick={() => swipeInputRef.current?.click()} disabled={swipeUploading}>
                    <Plus className="size-3" />
                    {swipeUploading ? "Import…" : "Ajouter"}
                  </Button>
                  <input ref={swipeInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleSwipeUpload(e.target.files)} />
                </div>
                <p className="text-xs mb-3 text-muted-foreground">Glisse-dépose sur le canvas comme référence</p>

                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                  <Input placeholder="Rechercher des miniatures…" value={swipeSearch} onChange={(e) => setSwipeSearch(e.target.value)} className="pl-9" />
                </div>

                {uploadedSwipes.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                      <span className="text-xs font-medium text-foreground">Mes références</span>
                      <span className="text-xs text-muted-foreground">({uploadedSwipes.length})</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {uploadedSwipes.filter((e) => e.title.toLowerCase().includes(swipeSearch.toLowerCase())).map((entry) => (
                        <div
                          key={entry.filename}
                          draggable
                          onClick={() => addAtCenter("swipeFile", { imageUrl: `/api/swipe-files/image?f=${entry.filename}`, label: entry.title })}
                          onDragStart={(e) => onSwipeDragStart(e, `/api/swipe-files/image?f=${entry.filename}`, entry.title)}
                          className="group cursor-pointer rounded-lg overflow-hidden relative border border-transparent hover:border-muted"
                        >
                          <img src={`/api/swipe-files/image?f=${entry.filename}`} alt={entry.title} className="w-full aspect-video object-cover" loading="lazy" />
                          <button
                            onClick={(ev) => { ev.stopPropagation(); handleDeleteSwipe(entry.filename); }}
                            className="absolute top-1 right-1 p-1 rounded-full bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Supprimer"
                          >
                            <X className="size-2.5 text-destructive" strokeWidth={2.5} />
                          </button>
                          <div className="px-1.5 py-1 bg-card">
                            <p className="text-[10px] truncate text-muted-foreground">{entry.title}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#FF0000" strokeWidth="0">
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" />
                      <path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="#fff" />
                    </svg>
                    <span className="text-xs font-medium text-foreground">Playlist YouTube</span>
                    <span className="text-xs text-muted-foreground">({filteredYoutube.length})</span>
                  </div>

                  {youtubeLoading && youtubeItems.length === 0 ? (
                    <p className="text-xs py-4 text-center text-muted-foreground">Chargement de la playlist…</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                      {filteredYoutube.map((item) => (
                        <div
                          key={item.videoId}
                          draggable
                          onClick={() => addAtCenter("swipeFile", { imageUrl: item.thumbnailUrl, label: item.title })}
                          onDragStart={(e) => onSwipeDragStart(e, item.thumbnailUrl, item.title)}
                          className="cursor-pointer rounded-lg overflow-hidden border border-transparent hover:border-muted"
                        >
                          <img src={item.thumbnailUrl} alt={item.title} className="w-full aspect-video object-cover" loading="lazy" />
                          <div className="px-1.5 py-1 bg-card">
                            <p className="text-[10px] truncate text-muted-foreground">{item.title}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {filteredSwipe.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                      <span className="text-xs font-medium text-foreground">Miniatures enregistrées</span>
                      <span className="text-xs text-muted-foreground">({filteredSwipe.length})</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {filteredSwipe.map((entry) => (
                        <div
                          key={entry.filename}
                          draggable
                          onClick={() => addAtCenter("swipeFile", { imageUrl: `/swipe-file/${entry.filename}`, label: entry.title })}
                          onDragStart={(e) => onSwipeDragStart(e, `/swipe-file/${entry.filename}`, entry.title)}
                          className="cursor-pointer rounded-lg overflow-hidden border border-transparent hover:border-muted"
                        >
                          <img src={`/swipe-file/${entry.filename}`} alt={entry.title} className="w-full aspect-video object-cover" loading="lazy" />
                          <div className="px-1.5 py-1 bg-card">
                            <p className="text-[10px] truncate text-muted-foreground">{entry.title}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {filteredSwipe.length === 0 && filteredYoutube.length === 0 && (
                  <p className="text-xs text-center py-4 text-muted-foreground">Aucune miniature trouvée</p>
                )}
              </>
            )}

            {activeTab === "models" && (
              <>
                <h3 className="text-sm font-medium mb-1 text-foreground">Modèles d&apos;image</h3>
                <p className="text-xs mb-3 text-muted-foreground">Glisse un modèle sur le canvas pour générer</p>
                <div className="space-y-1">
                  {MODELS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => addAtCenter("generator", { model: m.id })}
                      draggable
                      onDragStart={(e) => onDragStart(e, "generator", { model: m.id })}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer bg-card border border-transparent hover:border-muted text-muted-foreground"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill={m.color} strokeWidth="0">
                        <path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61z" />
                      </svg>
                      <span className="text-xs font-medium">{m.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {activeTab === "logos" && (
              <>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-medium text-foreground">Logos</h3>
                  <Button size="sm" variant="secondary" onClick={() => logoInputRef.current?.click()} disabled={logoUploading}>
                    <Plus className="size-3" />
                    {logoUploading ? "Import…" : "Ajouter"}
                  </Button>
                  <input ref={logoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleLogoUpload(e.target.files)} />
                </div>
                <p className="text-xs mb-3 text-muted-foreground">Glisse-dépose sur le canvas ({logos.length})</p>

                {logos.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 rounded-xl cursor-pointer border-2 border-dashed border-border" onClick={() => logoInputRef.current?.click()}>
                    <Shapes className="size-8 mb-2 text-muted-foreground" strokeWidth={1.5} />
                    <p className="text-xs text-muted-foreground">Importe tes logos ici</p>
                  </div>
                )}

                <div className="space-y-2">
                  {logos.map((logo) => (
                    <div
                      key={logo.filename}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/reactflow-type", "swipeFile");
                        e.dataTransfer.setData("application/reactflow-data", JSON.stringify({ imageUrl: `/api/logos/image?f=${logo.filename}`, label: logo.label }));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className="group flex items-center gap-3 px-2 py-2 rounded-xl cursor-grab bg-muted border border-transparent hover:border-primary"
                    >
                      <div
                        className="flex-shrink-0 flex items-center justify-center rounded-lg overflow-hidden bg-white/5"
                        style={{ width: 44, height: 44 }}
                        onClick={() => addAtCenter("swipeFile", { imageUrl: `/api/logos/image?f=${logo.filename}`, label: logo.label })}
                      >
                        <img src={`/api/logos/image?f=${logo.filename}`} alt={logo.label} className="max-w-full max-h-full object-contain" loading="lazy" />
                      </div>

                      <input
                        type="text"
                        defaultValue={logo.label}
                        className="flex-1 bg-transparent text-xs font-medium focus:outline-none nopan nodrag text-foreground"
                        onBlur={(e) => {
                          const newLabel = e.target.value.trim();
                          if (newLabel && newLabel !== logo.label) {
                            fetch("/api/logos/rename", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ filename: logo.filename, label: newLabel }),
                            }).then(() => loadLogos());
                          }
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        onClick={(e) => e.stopPropagation()}
                      />

                      <button
                        onClick={(ev) => { ev.stopPropagation(); handleDeleteLogo(logo.filename); }}
                        className="flex-shrink-0 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-white/5"
                        title="Supprimer"
                      >
                        <X className="size-3 text-destructive" strokeWidth={2.5} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showWebcamCapture && <WebcamCaptureModal onClose={() => setShowWebcamCapture(false)} onComplete={handlePersonaCaptured} />}

      {/* SettingsPanel.tsx itself is not yet Dialog-shaped (Task 7 removes its own
          header/close chrome to match) — wrapping it here as-is is a deliberate,
          honest interim state: a temporary doubled close-button appearance until
          Task 7 lands, not a placeholder. */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <SettingsPanel onClose={() => setSettingsOpen(false)} onSaved={onSettingsSaved} />
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Delete the old files**

```bash
git rm src/components/panels/Sidebar.tsx src/components/panels/SidebarRail.tsx
```

- [ ] **Step 3: Update `layout.tsx`**

```
Old:
import type { Metadata } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";
...
        <TooltipProvider>{children}</TooltipProvider>

New:
import type { Metadata } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import "./globals.css";
...
        <TooltipProvider>
          {/* --sidebar-width-icon overridden to 4rem (64px) to match the
              old fixed-rail's exact width — zero layout shift. */}
          <SidebarProvider defaultOpen={false} style={{ "--sidebar-width-icon": "4rem" } as React.CSSProperties}>
            {children}
          </SidebarProvider>
        </TooltipProvider>
```

`defaultOpen={false}` keeps the Sidebar permanently in its icon-collapsed shape — matching today's app exactly (there is no expand affordance today, and none is added here; `collapsible="icon"`'s expanded state exists in the primitive for future use, per the spec's "ready to receive more sections later without extra work now").

- [ ] **Step 4: Update `page.tsx`**

```
Old:
"use client";

import dynamic from "next/dynamic";

const Canvas = dynamic(() => import("@/components/Canvas"), { ssr: false });

export default function Home() {
  return <Canvas />;
}

New:
"use client";

import dynamic from "next/dynamic";
import AppSidebar from "@/components/panels/AppSidebar";
import { SidebarInset } from "@/components/ui/sidebar";

const Canvas = dynamic(() => import("@/components/Canvas"), { ssr: false });

export default function Home() {
  return (
    <>
      <AppSidebar />
      <SidebarInset>
        <Canvas />
      </SidebarInset>
    </>
  );
}
```

- [ ] **Step 5: Remove `Sidebar` from `Canvas.tsx`**

```
Old (line 21):
import Sidebar from "./panels/Sidebar";

Remove this line entirely.
```

```
Old (line 306, inside <ReactFlow>):
        <Sidebar />
        <ZoomBar />

New:
        <ZoomBar />
```

`AppSidebar` now mounts once at the `page.tsx` level (Step 4) instead of nesting inside `<ReactFlow>` — `Sidebar` was already `position: fixed` (viewport-relative, not canvas-relative), so this is a zero-visual-effect structural move, not a canvas redesign.

- [ ] **Step 6: Update `UsageView.tsx`**

```
Old:
import Sidebar from "@/components/panels/Sidebar";
...
  return (
    <div className="usage-shell">
      <Sidebar />

      <main className="usage-main">

New:
import AppSidebar from "@/components/panels/AppSidebar";
import { SidebarInset } from "@/components/ui/sidebar";
...
  return (
    <div className="usage-shell">
      <AppSidebar />

      <SidebarInset>
      <main className="usage-main">
```

And close the added `<SidebarInset>` right before the existing closing `</main>`:

```
Old:
      </main>
    </div>
  );
}

New:
      </main>
      </SidebarInset>
    </div>
  );
}
```

And drop the manual left-padding compensation that existed only to clear the OLD fixed 64px rail (the new `SidebarInset` handles this via real flex layout now):

```
Old (inside the <style jsx> block):
        .usage-main {
          padding: 56px 64px 80px 128px; /* extra left for the 64px sidebar rail */

New:
        .usage-main {
          padding: 56px 64px 80px 64px;
```

(Task 10 removes this whole `<style jsx>` block anyway — this is a minimal, correct fix to keep this checkpoint visually right, not the final form.)

- [ ] **Step 7: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 8: Visual check**

Dev server, `/`: confirm the icon rail renders at the same 64px width, same 4 icons + brand mark at top, Usage/Réglages at the bottom. Click each of Personnages/Modèles/Inspirations/Logos — confirm the same flyout panel opens with the same content, upload buttons work, drag-and-drop onto the canvas still works, delete buttons still work. Click "Réglages" — confirm the Settings dialog opens (even with its temporary doubled-close-button look) and the existing fields still load/save. Click "Usage" — confirm it navigates to `/usage` and the rail/flyout still work there identically. Confirm the canvas area itself is still pixel-identical to Task 1's reference screenshot.

- [ ] **Step 9: Run the existing test suite**

```bash
npx vitest run
```

Expected: identical pass/fail counts to baseline.

- [ ] **Step 10: Commit**

```bash
git add src/components/panels/AppSidebar.tsx src/app/layout.tsx src/app/page.tsx src/components/Canvas.tsx src/app/usage/UsageView.tsx
git commit -m "$(cat <<'EOF'
feat(sidebar): replace Sidebar/SidebarRail with a real sidebar-07 AppSidebar

Pure reskin — same 4 tabs, same fetch/upload/drag-drop/delete logic,
same 64px icon rail width. AppSidebar now mounts once at the page
level (page.tsx, UsageView.tsx) via SidebarProvider/SidebarInset
instead of nesting inside Canvas.tsx's <ReactFlow>. Settings now
opens as a Dialog from the sidebar footer instead of an inline rail
panel (SettingsPanel.tsx itself isn't Dialog-shaped yet — Task 7).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3b: Visages tab UX fix + sidebar search wiring

**Depends on Task 3.** Per the spec's "Parcours — gestion des visages (correctif, pas juste un reskin)" subsection: today's Visages tab stacks two unexplained systems (webcam-only Personas vs. upload-only legacy faces), its search field is dead, there's no way to create a Persona from a photo, and nothing is renameable. This task fixes all of that — no other tab's *behavior* changes, only where explicitly noted (Logos/Modèles search visibility) as a tightly-scoped follow-on to the same fix.

**Files:**
- Modify: `src/components/panels/AppSidebar.tsx` (replace the Visages tab body; wire the top search input; add the "Nouveau visage" dialog; filter Logos by the same mechanism)
- Modify: `src/components/panels/WebcamCaptureModal.tsx` (two bug fixes found via live testing, documented in `docs/superpowers/specs/2026-09-15-ux-journey-audit.md`: the Capturer button must be unreachable — not just visually disabled — when webcam access is denied; the close button must be unmistakably visible on every step of the 3-step wizard)
- Modify: `src/app/api/personas/[id]/route.ts` (add a `PATCH` handler for rename)
- Create: `src/app/api/face-reactions/rename/route.ts` (mirrors the existing `src/app/api/logos/rename/route.ts` pattern exactly)
- Test: Create `tests/agent/rename-persona-route.test.ts`, `tests/agent/rename-face-reaction-route.test.ts`

**Interfaces:**
- Consumes: `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription` (Task 2), everything Task 3's `AppSidebar.tsx` already has in scope.
- Produces: nothing new consumed by later tasks — this is a leaf fix.

**Note — "triées par date de création" under the "no backend changes" constraint:** `GET /api/personas` returns rows `ORDER BY created_at DESC` and `GET /api/face-reactions` returns rows `ORDER BY created_at ASC` (confirmed reading both route files) — neither response includes the `created_at` value itself, and the spec is explicit that `/api/personas` and `/api/face-reactions` keep their current contracts. A true chronological interleave across both types is therefore not achievable without a backend change, which is out of scope here. Reasonable resolution: reverse `faceReactions` to newest-first (matching `personas`' existing order) and concatenate — personas group first (newest-first), then legacy faces (newest-first). Not a perfect global interleave, but a defensible reading given the hard constraint.

**Note — inline rename requires two new endpoints, which appears to conflict with "no backend changes":** neither `/api/personas/:id` nor `/api/face-reactions` has ever supported rename (confirmed reading both route files — only `DELETE` exists for personas; `GET`/`POST`/`DELETE` for face-reactions). The spec explicitly requires inline rename "same pattern as Logos," which itself only works because `/api/logos/rename` exists. Resolution: add the two minimal, additive endpoints below, mirroring `/api/logos/rename`'s existing pattern exactly (same request shape, same `id = filename.split(".")[0]` convention, same error handling) — reading "no backend changes" as "don't change what exists," not "never add a symmetric, already-precedented endpoint a listed UI feature strictly requires."

**Note — fast-follow, not implemented here:** replacing/recapturing a single angle of an existing Persona is explicitly out of scope for this pass (per the spec) — it would need a richer API contract than exists today. Not built in this task.

- [ ] **Step 1: Add the `PATCH` handler to `src/app/api/personas/[id]/route.ts`**

```
Old (full file):
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const persona = getDb().prepare("SELECT id FROM personas WHERE id = ?").get(id);
    if (!persona) return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    getDb().prepare("DELETE FROM personas WHERE id = ?").run(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete persona error:", err);
    return NextResponse.json({ error: "Failed to delete persona" }, { status: 500 });
  }
}

New (full file):
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { label } = (await request.json()) as { label?: string };
    if (!label || !label.trim()) return NextResponse.json({ error: "Missing label" }, { status: 400 });
    const result = getDb().prepare("UPDATE personas SET label = ? WHERE id = ?").run(label.trim(), id);
    if (result.changes === 0) return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Rename persona error:", err);
    return NextResponse.json({ error: "Rename failed" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const persona = getDb().prepare("SELECT id FROM personas WHERE id = ?").get(id);
    if (!persona) return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    getDb().prepare("DELETE FROM personas WHERE id = ?").run(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete persona error:", err);
    return NextResponse.json({ error: "Failed to delete persona" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create `src/app/api/face-reactions/rename/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const { filename, label } = await request.json();
    if (!filename || !label) return NextResponse.json({ error: "Missing filename or label" }, { status: 400 });

    const id = filename.split(".")[0];
    const result = getDb().prepare("UPDATE face_reactions SET label = ? WHERE id = ?").run(label, id);
    if (result.changes === 0) return NextResponse.json({ error: "Face not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Rename face error:", err);
    return NextResponse.json({ error: "Rename failed" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Write the two new backend tests**

```typescript
// tests/agent/rename-persona-route.test.ts
import { describe, it, expect } from "vitest";

async function call(
  handler: (req: Request, ctx?: { params: Promise<{ id: string }> }) => Promise<Response>,
  opts: { method?: string; url: string; body?: unknown; paramsId?: string },
) {
  const req = new Request(opts.url, {
    method: opts.method ?? "GET",
    headers: { "content-type": "application/json" },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const ctx = opts.paramsId ? { params: Promise.resolve({ id: opts.paramsId }) } : undefined;
  return handler(req, ctx);
}

describe("PATCH /api/personas/:id (rename)", () => {
  it("renames an existing persona", async () => {
    const { POST } = await import("@/app/api/personas/route");
    const created = (await (
      await call(POST as never, { method: "POST", url: "http://localhost/api/personas", body: { label: "Old name", photos: {} } })
    ).json()) as { id: string };

    const { PATCH } = await import("@/app/api/personas/[id]/route");
    const res = await call(PATCH as never, {
      method: "PATCH",
      url: `http://localhost/api/personas/${created.id}`,
      body: { label: "New name" },
      paramsId: created.id,
    });
    expect(res.status).toBe(200);

    const { GET } = await import("@/app/api/personas/route");
    const list = (await (await call(GET as never, { method: "GET", url: "http://localhost/api/personas" })).json()) as { id: string; label: string }[];
    expect(list.find((p) => p.id === created.id)?.label).toBe("New name");
  });

  it("404s for an unknown id", async () => {
    const { PATCH } = await import("@/app/api/personas/[id]/route");
    const res = await call(PATCH as never, {
      method: "PATCH",
      url: "http://localhost/api/personas/does-not-exist",
      body: { label: "x" },
      paramsId: "does-not-exist",
    });
    expect(res.status).toBe(404);
  });
});
```

```typescript
// tests/agent/rename-face-reaction-route.test.ts
import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";

describe("POST /api/face-reactions/rename", () => {
  it("renames an existing face reaction", async () => {
    const id = uuid();
    getDb()
      .prepare("INSERT INTO face_reactions (id, label, mime_type, size, data) VALUES (?, ?, ?, ?, ?)")
      .run(id, "Old label", "image/jpeg", 10, Buffer.alloc(10));

    const { POST } = await import("@/app/api/face-reactions/rename/route");
    const req = new Request("http://localhost/api/face-reactions/rename", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: id, label: "New label" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);

    const row = getDb().prepare("SELECT label FROM face_reactions WHERE id = ?").get(id) as { label: string };
    expect(row.label).toBe("New label");
  });

  it("404s for an unknown filename", async () => {
    const { POST } = await import("@/app/api/face-reactions/rename/route");
    const req = new Request("http://localhost/api/face-reactions/rename", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: "does-not-exist", label: "x" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 4: Run the two new tests**

```bash
npx vitest run tests/agent/rename-persona-route.test.ts tests/agent/rename-face-reaction-route.test.ts
```

Expected: 4/4 passing.

- [ ] **Step 5: Add new state, the combined type, and the derived lists to `AppSidebar.tsx`**

Add near the other type declarations (alongside `LogoEntry`/`SwipeEntry`/`YouTubeItem`/`FaceReaction`/`Persona`):

```tsx
type VisageEntry =
  | { kind: "persona"; id: string; label: string; angles: ("front" | "left" | "right")[] }
  | { kind: "legacy"; filename: string; label: string };
```

Add new imports:

```
Old:
import { Dialog, DialogContent } from "@/components/ui/dialog";
...
import { Users, Image as ImageIcon, LayoutGrid, Shapes, BarChart3, Settings as SettingsIcon, Search, Plus, X } from "lucide-react";

New:
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
...
import { Users, Image as ImageIcon, LayoutGrid, Shapes, BarChart3, Settings as SettingsIcon, Search, Plus, X, Camera, Upload } from "lucide-react";
```

Add new state, right after the existing `const [logoUploading, setLogoUploading] = useState(false);`:

```tsx
  const [visagesSearch, setVisagesSearch] = useState("");
  const [logosSearch, setLogosSearch] = useState("");
  const [newVisageOpen, setNewVisageOpen] = useState(false);
```

Add the derived lists and rename handlers right after the existing `const filteredSwipe = ...` / `const filteredYoutube = ...` lines:

```tsx
  // Personas arrive newest-first from GET /api/personas (ORDER BY created_at
  // DESC); face-reactions arrive oldest-first from GET /api/face-reactions
  // (ORDER BY created_at ASC — an existing, unrelated API contract this task
  // does not touch) — reversed here to newest-first to match. Neither
  // response carries created_at, so a true chronological interleave across
  // both types isn't possible without a backend change (out of scope) —
  // personas group first (newest-first), then legacy faces (newest-first).
  const visageEntries: VisageEntry[] = [
    ...personas.map((p): VisageEntry => ({ kind: "persona", id: p.id, label: p.label, angles: p.angles })),
    ...[...faceReactions].reverse().map((f): VisageEntry => ({ kind: "legacy", filename: f.filename, label: f.label })),
  ];
  const filteredVisages = visageEntries.filter((e) => e.label.toLowerCase().includes(visagesSearch.toLowerCase()));
  const filteredLogos = logos.filter((l) => l.label.toLowerCase().includes(logosSearch.toLowerCase()));

  const renamePersona = async (id: string, label: string) => {
    await fetch(`/api/personas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    loadPersonas();
  };

  const renameFace = async (filename: string, label: string) => {
    await fetch("/api/face-reactions/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, label }),
    });
    loadFaces();
  };
```

- [ ] **Step 6: Wire the top search input — Visages + Logos only, hidden on Modèles + Inspirations**

```
Old:
          <div className="p-4">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <Input placeholder="Rechercher" className="pl-9" />
            </div>

            {activeTab === "faces" && (

New:
          <div className="p-4">
            {(activeTab === "faces" || activeTab === "logos") && (
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Rechercher"
                  value={activeTab === "faces" ? visagesSearch : logosSearch}
                  onChange={(e) => (activeTab === "faces" ? setVisagesSearch(e.target.value) : setLogosSearch(e.target.value))}
                  className="pl-9"
                />
              </div>
            )}

            {activeTab === "faces" && (
```

Modèles has no search need (a static picker list — no items to filter) and Inspirations already has its own second, separate, working field (`swipeSearch`, unchanged) — rendering the generic top field there too would just be a redundant second search box.

- [ ] **Step 7: Replace the whole Visages tab body**

Replace the entire `{activeTab === "faces" && ( ... )}` block (Task 3's faithful port of the old Personas + "Autres visages" sections) with:

```tsx
            {activeTab === "faces" && (
              <>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-medium text-foreground">Visages</h3>
                  <Button size="sm" variant="secondary" onClick={() => setNewVisageOpen(true)} disabled={savingPersona}>
                    <Plus className="size-3" />
                    {savingPersona ? "Enregistrement…" : "Nouveau visage"}
                  </Button>
                </div>
                <p className="text-xs mb-3 text-muted-foreground">Clique pour ajouter au canvas ({filteredVisages.length})</p>

                {filteredVisages.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 rounded-xl cursor-pointer border-2 border-dashed border-border" onClick={() => setNewVisageOpen(true)}>
                    <Users className="size-8 mb-2 text-muted-foreground" strokeWidth={1.5} />
                    <p className="text-xs text-center px-4 text-muted-foreground">
                      {visagesSearch ? "Aucun résultat." : "Crée ton premier visage"}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-1.5">
                  {filteredVisages.map((entry) =>
                    entry.kind === "persona" ? (
                      <div
                        key={`persona-${entry.id}`}
                        className="group cursor-pointer rounded-lg overflow-hidden relative border border-transparent hover:border-muted"
                        onClick={() =>
                          addAtCenter("faceReference", {
                            label: entry.label,
                            personaId: entry.id,
                            personaAngles: {
                              front: entry.angles.includes("front") ? `/api/personas/image?id=${entry.id}&angle=front` : undefined,
                              left: entry.angles.includes("left") ? `/api/personas/image?id=${entry.id}&angle=left` : undefined,
                              right: entry.angles.includes("right") ? `/api/personas/image?id=${entry.id}&angle=right` : undefined,
                            },
                          })
                        }
                      >
                        <img src={`/api/personas/image?id=${entry.id}&angle=${entry.angles[0]}`} alt={entry.label} className="w-full aspect-square object-cover" loading="lazy" />
                        <div className="absolute bottom-0 inset-x-0 px-1.5 py-1 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent">
                          <input
                            defaultValue={entry.label}
                            className="flex-1 min-w-0 truncate text-[10px] bg-transparent text-white focus:outline-none nopan nodrag"
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v && v !== entry.label) renamePersona(entry.id, v);
                            }}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className="text-[9px] text-white/80 shrink-0 ml-1">{entry.angles.length}/3</span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeletePersona(entry.id, entry.label); }}
                          className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/75 hover:bg-destructive transition-colors"
                          title="Supprimer"
                        >
                          <X className="size-3 text-white" strokeWidth={2.5} />
                        </button>
                      </div>
                    ) : (
                      <div
                        key={`legacy-${entry.filename}`}
                        draggable
                        onClick={() => addAtCenter("faceReference", { imageUrl: `/api/face-reactions/image?f=${entry.filename}`, label: entry.label })}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("application/reactflow-type", "faceReference");
                          e.dataTransfer.setData("application/reactflow-data", JSON.stringify({ imageUrl: `/api/face-reactions/image?f=${entry.filename}`, label: entry.label }));
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        className="group cursor-pointer rounded-lg overflow-hidden relative border border-transparent hover:border-muted"
                      >
                        <img src={`/api/face-reactions/image?f=${entry.filename}`} alt={entry.label} className="w-full aspect-square object-cover" loading="lazy" />
                        <div className="absolute bottom-0 inset-x-0 px-1.5 py-1 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent">
                          <input
                            defaultValue={entry.label}
                            className="flex-1 min-w-0 truncate text-[10px] bg-transparent text-white focus:outline-none nopan nodrag"
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v && v !== entry.label) renameFace(entry.filename, v);
                            }}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className="text-[9px] text-white/80 shrink-0 ml-1">1 photo</span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteFace(entry.filename); }}
                          className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/75 hover:bg-destructive transition-colors"
                          title="Supprimer"
                        >
                          <X className="size-3 text-white" strokeWidth={2.5} />
                        </button>
                      </div>
                    ),
                  )}
                </div>

                <input
                  ref={faceInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => { handleFaceUpload(e.target.files); setNewVisageOpen(false); }}
                />
              </>
            )}
```

- [ ] **Step 8: Filter the Logos grid**

```
Old:
                {logos.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 rounded-xl cursor-pointer border-2 border-dashed border-border" onClick={() => logoInputRef.current?.click()}>
                    <Shapes className="size-8 mb-2 text-muted-foreground" strokeWidth={1.5} />
                    <p className="text-xs text-muted-foreground">Importe tes logos ici</p>
                  </div>
                )}

                <div className="space-y-2">
                  {logos.map((logo) => (

New:
                {filteredLogos.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 rounded-xl cursor-pointer border-2 border-dashed border-border" onClick={() => logoInputRef.current?.click()}>
                    <Shapes className="size-8 mb-2 text-muted-foreground" strokeWidth={1.5} />
                    <p className="text-xs text-muted-foreground">{logosSearch ? "Aucun résultat." : "Importe tes logos ici"}</p>
                  </div>
                )}

                <div className="space-y-2">
                  {filteredLogos.map((logo) => (
```

(The rest of the Logos section body — inline rename, delete, drag start — is untouched; it already had inline rename since Task 3's faithful port.)

- [ ] **Step 9: Add the "Nouveau visage" dialog**

Add right after the existing Settings `<Dialog>` at the bottom of the returned JSX:

```tsx
      <Dialog open={newVisageOpen} onOpenChange={setNewVisageOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nouveau visage</DialogTitle>
            <DialogDescription>Choisis comment ajouter un visage à ta bibliothèque.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button variant="outline" className="justify-start" onClick={() => { setNewVisageOpen(false); setShowWebcamCapture(true); }}>
              <Camera className="size-4" />
              Capturer avec la webcam
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => faceInputRef.current?.click()}>
              <Upload className="size-4" />
              Importer une photo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 10: Fix the two WebcamCaptureModal.tsx bugs**

Defensive guard on `capture()` (the button is already `disabled={!ready || !!error}`, but a live-testing pass found it reachable when access was denied — belt-and-suspenders the handler itself too):

```
Old:
  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

New:
  const capture = useCallback(() => {
    // Defense in depth: "Capturer" below is already disabled via
    // disabled={!ready || !!error}, but guard the handler itself too so a
    // stray click can never start a capture against a denied/unready camera.
    if (!ready || error) return;
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
```

```
Old:
  }, [step.angle]);

  const retake = () => setShots((prev) => ({ ...prev, [step.angle]: undefined }));

New:
  }, [step.angle, ready, error]);

  const retake = () => setShots((prev) => ({ ...prev, [step.angle]: undefined }));
```

Make the close button unmistakable on every step (it already renders on every step — the header sits above the `naming ? (...) : (...)` conditional — but was too visually quiet to reliably spot during live testing; upgrade it to the same prominent pattern already used in `ImageAnnotateModal.tsx`):

```
Old:
          <button onClick={onClose} style={{ color: "var(--text-muted)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>

New:
          <button
            onClick={onClose}
            aria-label="Fermer"
            title="Fermer"
            className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
```

- [ ] **Step 11: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 12: Visual + behavioral check**

Dev server, `/`, open the Visages tab: confirm Personas and legacy faces now render together in one grid, each with its own count badge (`n/3` vs `1 photo`). Type into the top search field — confirm it filters the combined grid by label live. Click "Nouveau visage" — confirm the dialog shows both choices; "Capturer avec la webcam" opens the existing webcam wizard unchanged; "Importer une photo" opens the file picker and, on selecting a file, uploads via the existing `/api/face-reactions` flow and the new entry appears in the grid. Rename a Persona and a legacy face by editing the label overlay and blurring — confirm both persist across a reload. Switch to Logos — confirm the top search now filters the Logos list by label. Switch to Modèles — confirm the top search field is gone entirely. Switch to Inspirations — confirm only its own dedicated "Rechercher des miniatures…" field shows (no second generic field above it). Open the webcam wizard directly and deny camera permission — confirm "Capturer" is inert (not just faded) and the close button (top-right X) is clearly visible and clickable on every one of the 3 photo steps AND the final naming step.

- [ ] **Step 13: Run the full test suite**

```bash
npx vitest run
```

Expected: all previous tests still pass, plus the 4 new ones from Step 4.

- [ ] **Step 14: Commit**

```bash
git add src/components/panels/AppSidebar.tsx src/components/panels/WebcamCaptureModal.tsx src/app/api/personas/\[id\]/route.ts src/app/api/face-reactions/rename/route.ts tests/agent/rename-persona-route.test.ts tests/agent/rename-face-reaction-route.test.ts
git commit -m "$(cat <<'EOF'
fix(sidebar): unify Visages grid, add single entry dialog, wire search + rename

Personas and legacy face-reactions now show in one sorted grid instead
of two unexplained stacked sections; a single "Nouveau visage" dialog
replaces the webcam-only entry point (webcam or file import, both on
their existing unchanged endpoints); the previously-dead top search
field now filters Visages and Logos (hidden on Modèles/Inspirations,
which don't need it); both visage types gain inline rename via two new,
additive, precedented endpoints (PATCH /api/personas/:id, POST
/api/face-reactions/rename). Also fixes two live-tested
WebcamCaptureModal bugs: the Capturer button is now truly inert (not
just faded) when camera access is denied, and its close button is
unmistakable on every step.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `ProjectBar.tsx` → `DropdownMenu`

**Files:**
- Modify: `src/components/panels/ProjectBar.tsx` (full rewrite)
- Test: none new

**Interfaces:**
- Consumes: `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuContent`/`DropdownMenuItem`/`DropdownMenuSeparator` (Task 2), `Button` (`@/components/ui/button`), `Input` (`@/components/ui/input`).
- Produces: same default export, same "no props" external shape — `Canvas.tsx`'s `<ProjectBar />` call site doesn't change.

**Note on nesting an editable `Input` + action buttons inside a `DropdownMenuItem`:** Radix's menu primitive triggers `onSelect` (and closes the menu) on pointer/keyboard interaction with an item. To keep the rename `Input` and the rename/delete buttons interactive without accidentally switching projects or closing the menu, every nested interactive element stops propagation on both `onClick` and `onPointerDown`, and the row's own `onSelect` is guarded to no-op while that row is being renamed. This is a standard, necessary pattern for this composition — not a hack unique to this file.

- [ ] **Step 1: Rewrite**

```tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { useCanvasStore } from "@/store/canvas-store";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderOpen, ChevronDown, Pencil, Trash2, Plus } from "lucide-react";

type ProjectMeta = { id: string; name: string; createdAt: string; updatedAt: string };

export default function ProjectBar() {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [currentId, setCurrentId] = useState("default");
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);
  const loadProject = useCanvasStore((s) => s.loadProject);

  const loadProjects = () => {
    fetch("/api/projects").then((r) => r.json()).then(setProjects).catch(() => {});
  };

  useEffect(() => {
    loadProjects();
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => { if (s.currentProjectId) setCurrentId(s.currentProjectId); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (renaming && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renaming]);

  const switchProject = async (projectId: string) => {
    setCurrentId(projectId);
    setMenuOpen(false);
    await loadProject(projectId);
    fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentProjectId: projectId }),
    }).catch(() => {});
  };

  const createProject = async () => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Nouveau projet" }),
    });
    const { id } = await res.json();
    loadProjects();
    await switchProject(id);
  };

  const renameProject = async (projectId: string, name: string) => {
    await fetch(`/api/projects?id=${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setRenaming(null);
    loadProjects();
  };

  const deleteProject = async (projectId: string) => {
    if (!confirm("Supprimer ce projet et toutes ses données ?")) return;
    await fetch(`/api/projects?id=${projectId}`, { method: "DELETE" });
    const remaining = projects.filter((p) => p.id !== projectId);
    if (remaining.length === 0 || currentId === projectId) {
      if (remaining.length === 0) {
        await createProject();
      } else {
        await switchProject(remaining[0].id);
        loadProjects();
      }
    } else {
      loadProjects();
    }
  };

  const currentProject = projects.find((p) => p.id === currentId);

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger render={<Button variant="outline" className="gap-2" />}>
        <FolderOpen className="size-3.5" />
        {currentProject?.name || "Mon projet"}
        <ChevronDown className="size-2.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[260px] max-h-64 overflow-y-auto">
        {projects.map((p) => (
          <DropdownMenuItem
            key={p.id}
            className="group gap-2"
            onSelect={(e) => {
              if (renaming === p.id) { e.preventDefault(); return; }
              switchProject(p.id);
            }}
          >
            {p.id === currentId && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
            {renaming === p.id ? (
              <Input
                ref={renameRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => { if (renameValue.trim()) renameProject(p.id, renameValue.trim()); else setRenaming(null); }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter" && renameValue.trim()) renameProject(p.id, renameValue.trim());
                  if (e.key === "Escape") setRenaming(null);
                }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="h-6 flex-1 text-xs"
              />
            ) : (
              <span className={`flex-1 truncate text-xs ${p.id === currentId ? "text-foreground" : "text-muted-foreground pl-[14px]"}`}>{p.name}</span>
            )}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setRenameValue(p.name); setRenaming(p.id); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="p-1 rounded text-muted-foreground hover:text-foreground"
                title="Renommer"
              >
                <Pencil className="size-2.5" />
              </button>
              {projects.length > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); deleteProject(p.id); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="p-1 rounded text-destructive"
                  title="Supprimer"
                >
                  <Trash2 className="size-2.5" />
                </button>
              )}
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => createProject()} className="gap-2 text-muted-foreground">
          <Plus className="size-3" />
          Nouveau projet
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Visual + behavioral check**

Dev server, `/`: open the ProjectBar dropdown — confirm the project list, current-project dot, and "Nouveau projet" row render. Click a different project — confirm it switches and closes the menu. Click the pencil icon on a row — confirm it turns into an editable input, focused/selected, WITHOUT switching projects or closing the menu; type a new name and press Enter — confirm it renames and the menu stays open with the updated name. Click the trash icon — confirm the confirm() dialog appears and deletion works, including the "delete the only remaining project auto-creates a new one" edge case. Click "Nouveau projet" — confirm it creates and switches.

- [ ] **Step 4: Run the existing test suite**

```bash
npx vitest run
```

Expected: identical pass/fail counts to baseline.

- [ ] **Step 5: Commit**

```bash
git add src/components/panels/ProjectBar.tsx
git commit -m "$(cat <<'EOF'
feat(projectbar): rewrite ProjectBar on shadcn DropdownMenu

Same behavior (switch/rename/create/delete project) — the custom
absolute-positioned menu with a manual mousedown-outside listener is
replaced by a real DropdownMenu.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `ZoomBar.tsx` → `ToggleGroup`/`Tooltip`/`Separator`/`DropdownMenu`

**Files:**
- Modify: `src/components/panels/ZoomBar.tsx` (full rewrite)
- Test: none new

**Interfaces:**
- Consumes: `ToggleGroup`/`ToggleGroupItem` (Task 2's `@/components/ui/toggle-group`), `Button` (`@/components/ui/button`), `Tooltip`/`TooltipTrigger`/`TooltipContent` (already installed), `Separator` (Task 2's `@/components/ui/separator`), `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuContent`/`DropdownMenuItem` (Task 2).
- Produces: same default export, no props — `Canvas.tsx`'s `<ZoomBar />` call site doesn't change.

- [ ] **Step 1: Rewrite**

```tsx
"use client";

import { useReactFlow, useViewport, type Node as FlowNode } from "@xyflow/react";
import { useState, useCallback } from "react";
import { useCanvasStore } from "@/store/canvas-store";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { MousePointer2, Hand, LayoutGrid, Undo2, Redo2, ChevronUp } from "lucide-react";

export default function ZoomBar() {
  const { zoomIn, zoomOut, fitView, zoomTo } = useReactFlow();
  const { zoom } = useViewport();
  const { undo, redo, canUndo, canRedo } = useCanvasStore();
  const [mode, setMode] = useState<"navigate" | "pan">("navigate");

  const zoomPercent = Math.round(zoom * 100);
  const { getNodes, getEdges, setNodes } = useReactFlow();

  const autoLayout = useCallback(() => {
    const nodes = getNodes();
    const edges = getEdges();
    if (nodes.length === 0) return;

    const children: Record<string, string[]> = {};
    const parents: Record<string, string[]> = {};
    for (const e of edges) {
      if (!children[e.source]) children[e.source] = [];
      children[e.source].push(e.target);
      if (!parents[e.target]) parents[e.target] = [];
      parents[e.target].push(e.source);
    }

    const roots = nodes.filter((n) => !parents[n.id] || parents[n.id].length === 0);
    const colMap: Record<string, number> = {};
    const visited = new Set<string>();
    const queue: { id: string; col: number }[] = [];
    for (const r of roots) queue.push({ id: r.id, col: 0 });

    while (queue.length > 0) {
      const { id: nid, col } = queue.shift()!;
      if (visited.has(nid)) {
        if ((colMap[nid] || 0) < col) colMap[nid] = col;
        continue;
      }
      visited.add(nid);
      colMap[nid] = col;
      for (const childId of children[nid] || []) queue.push({ id: childId, col: col + 1 });
    }

    for (const n of nodes) {
      if (!visited.has(n.id)) {
        visited.add(n.id);
        colMap[n.id] = 0;
      }
    }

    const columns: Record<number, FlowNode[]> = {};
    for (const n of nodes) {
      const col = colMap[n.id] || 0;
      if (!columns[col]) columns[col] = [];
      columns[col].push(n);
    }
    for (const col of Object.keys(columns)) {
      columns[Number(col)].sort((a, b) => a.position.y - b.position.y);
    }

    const COL_WIDTH = 360;
    const ROW_GAP = 20;
    const START_X = 0;
    const START_Y = 0;

    const updated = nodes.map((n) => {
      const col = colMap[n.id] || 0;
      const colNodes = columns[col];
      const rowIndex = colNodes.indexOf(n);
      let y = START_Y;
      for (let i = 0; i < rowIndex; i++) y += 250 + ROW_GAP;
      return { ...n, position: { x: START_X + col * COL_WIDTH, y } };
    });

    setNodes(updated);
    setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50);
  }, [getNodes, getEdges, setNodes, fitView]);

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 rounded-xl px-2 py-1.5 shadow-2xl bg-card border border-border">
      <ToggleGroup type="single" value={mode} onValueChange={(v) => v && setMode(v as "navigate" | "pan")}>
        <Tooltip>
          <TooltipTrigger render={<ToggleGroupItem value="navigate" aria-label="Navigate" />}>
            <MousePointer2 className="size-4" />
          </TooltipTrigger>
          <TooltipContent><p>Navigate</p></TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={<ToggleGroupItem value="pan" aria-label="Pan" />}>
            <Hand className="size-4" />
          </TooltipTrigger>
          <TooltipContent><p>Pan</p></TooltipContent>
        </Tooltip>
      </ToggleGroup>

      <Tooltip>
        <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={autoLayout} />}>
          <LayoutGrid className="size-4" />
        </TooltipTrigger>
        <TooltipContent><p>Réorganiser le canvas</p></TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-5 mx-1" />

      <Tooltip>
        <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={undo} disabled={!canUndo()} />}>
          <Undo2 className="size-4" />
        </TooltipTrigger>
        <TooltipContent><p>Undo (Cmd+Z)</p></TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={redo} disabled={!canRedo()} />}>
          <Redo2 className="size-4" />
        </TooltipTrigger>
        <TooltipContent><p>Redo (Cmd+Shift+Z)</p></TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-5 mx-1" />

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" className="gap-1 px-2 text-xs font-medium" />}>
          {zoomPercent}%
          <ChevronUp className="size-2.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="min-w-[160px]">
          <DropdownMenuItem onSelect={() => zoomIn()} className="justify-between">
            <span>Zoom avant</span>
            <span className="text-muted-foreground text-[10px]">Cmd +</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => zoomOut()} className="justify-between">
            <span>Zoom arrière</span>
            <span className="text-muted-foreground text-[10px]">Cmd -</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => zoomTo(1)} className="justify-between">
            <span>Zoom 100%</span>
            <span className="text-muted-foreground text-[10px]">Cmd 0</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => fitView({ padding: 0.1 })} className="justify-between">
            <span>Adapter à l&apos;écran</span>
            <span className="text-muted-foreground text-[10px]">Cmd 1</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

Note: the OLD component had its own `useEffect` for the `Cmd/Ctrl+Z`/`Cmd/Ctrl+Shift+Z` global keyboard shortcut and its own `mousedown`-outside-close listener for the zoom menu. The keyboard shortcut's `useEffect` is DROPPED here deliberately — it duplicated global undo/redo wiring that has no other UI dependency, but grep `src/` for `e.key === "z"` before finalizing this step to confirm there isn't a second copy elsewhere that already covers it; if there isn't, port the exact same `useEffect` (unchanged) back into this file rather than silently losing the shortcut. The outside-click-closes behavior is now handled entirely by `DropdownMenu`'s own built-in behavior (Radix closes on outside click/`Escape` automatically) — do not port the old manual listener, it would now double up.

- [ ] **Step 2: Verify the undo/redo keyboard shortcut isn't silently lost**

```bash
grep -rn 'key === "z"' src/
```

If the ONLY match was inside the old `ZoomBar.tsx` (now rewritten), add this `useEffect` back into the new file (import `useEffect` from `react`):

```tsx
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);
```

If another copy already exists elsewhere (e.g. a global canvas keyboard-shortcuts hook), leave it dropped here — do not double-register the same shortcut.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Visual + behavioral check**

Dev server, `/`: confirm Navigate/Pan toggle switches and the active one is visually highlighted (mint-yellow highlight preserved via the canvas-only tokens is NOT expected here — ZoomBar is in scope, its active-state color is now a real b0 token, a visual change is expected and correct). Confirm auto-layout still rearranges nodes, undo/redo still work and respect their disabled state, the zoom-percent dropdown opens/closes correctly and each item still zooms/fits as before. Confirm Cmd+Z / Cmd+Shift+Z still work globally.

- [ ] **Step 5: Run the existing test suite**

```bash
npx vitest run
```

Expected: identical pass/fail counts to baseline.

- [ ] **Step 6: Commit**

```bash
git add src/components/panels/ZoomBar.tsx
git commit -m "$(cat <<'EOF'
feat(zoombar): rewrite ZoomBar on shadcn ToggleGroup/Tooltip/Separator/DropdownMenu

Same zoom/pan/undo/redo/auto-layout behavior and keyboard shortcuts.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `ContextMenu.tsx` → controlled `DropdownMenu`

**Files:**
- Modify: `src/components/panels/ContextMenu.tsx` (full rewrite)
- Test: none new

**Interfaces:**
- Consumes: `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuContent`/`DropdownMenuItem`/`DropdownMenuLabel`/`DropdownMenuSeparator` (Task 2).
- Produces: same default export with the exact same external props (`x, y, sections, items, onClose`) — every call site in `Canvas.tsx` (2 call sites, both passing `x, y, sections, onClose`) stays unchanged.

Per the spec: this becomes a `DropdownMenu` with `open` controlled and custom `x, y` positioning via `style` on `DropdownMenuContent`, rather than the native `ContextMenu` primitive (which requires a real `ContextMenuTrigger` wrapping the clicked area — not available here, since `Canvas.tsx`/the node files that trigger this already capture their own click coordinates well before this component mounts, and are out of scope for restructuring).

**Note — genuine technical uncertainty in the positioning mechanism, resolved with a concrete fallback:** Radix's `DropdownMenuContent` normally self-positions via its own Popper wrapper (relative to `DropdownMenuTrigger`), which may conflict with a plain `style={{position:"fixed", left, top}}` passed directly to `DropdownMenuContent` depending on exactly how the installed `dropdown-menu.tsx` forwards that style. Step 1 below implements the spec's literal instruction first (fixed style directly on `DropdownMenuContent`). Step 3 (visual check) verifies pixel-accurate placement; if it's off, Step 3 also gives the exact fallback code (an invisible, precisely-positioned trigger anchor + Radix's own Popper alignment) — this is a real, complete, alternate implementation, not a "try something" note.

- [ ] **Step 1: Rewrite**

```tsx
"use client";

import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

type MenuItem = { label: string; onClick: () => void; icon?: React.ReactNode; disabled?: boolean; hint?: string };
type MenuSection = { title: string; items: MenuItem[] };

export default function ContextMenu({
  x,
  y,
  sections,
  items,
  onClose,
}: {
  x: number;
  y: number;
  sections?: MenuSection[];
  items?: MenuItem[];
  onClose: () => void;
}) {
  const allSections: MenuSection[] = sections ? sections : items ? [{ title: "", items }] : [];

  return (
    <DropdownMenu open onOpenChange={(open) => { if (!open) onClose(); }}>
      {/* Invisible 0x0 anchor at the captured click point — DropdownMenuContent
          is positioned via the plain fixed style below, not via this
          trigger's own layout. It exists only because Radix's DropdownMenu
          requires a trigger element to mount. */}
      <DropdownMenuTrigger render={<span style={{ position: "fixed", left: x, top: y, width: 0, height: 0 }} />} />
      <DropdownMenuContent
        style={{ position: "fixed", left: x, top: y, maxHeight: "80vh", overflowY: "auto" }}
        className="min-w-[220px]"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {allSections.map((section, si) => (
          <div key={si}>
            {si > 0 && <DropdownMenuSeparator />}
            {section.title && (
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">{section.title}</DropdownMenuLabel>
            )}
            {section.items.map((item, i) => (
              <DropdownMenuItem
                key={i}
                disabled={item.disabled}
                title={item.disabled && item.hint ? item.hint : undefined}
                onSelect={() => { if (!item.disabled) { item.onClick(); onClose(); } }}
                className="gap-3"
              >
                {item.icon && <span className="shrink-0">{item.icon}</span>}
                <span className="flex-1">{item.label}</span>
                {item.disabled && item.hint && <span className="text-[10px] text-muted-foreground">inactif</span>}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Visual check — verify positioning, apply the fallback if needed**

Dev server, `/`: right-click empty canvas space — confirm the menu opens exactly at the cursor, with the same sections/items as before (Prompt/Croquis/Visage de référence/Image-logo, plus the second unnamed section). Right-click again elsewhere, drag a connection to empty space to trigger the edge-drop menu too. Press Escape — confirm it closes. Click outside — confirm it closes. Confirm no console errors about missing/invalid Radix anchors.

**If the menu does NOT land exactly at `(x, y)`** (e.g. it appears at the top-left of the canvas or offset), replace the trigger+content pairing with Popper-anchored positioning instead:

```tsx
      <DropdownMenuTrigger render={<span style={{ position: "fixed", left: x, top: y, width: 1, height: 1 }} />} />
      <DropdownMenuContent
        side="bottom"
        align="start"
        sideOffset={0}
        alignOffset={0}
        avoidCollisions
        className="min-w-[220px] max-h-[80vh] overflow-y-auto"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
```

(Remove the `style={{position:"fixed", left, top}}` from `DropdownMenuContent` in this fallback — positioning now comes entirely from Radix's Popper, anchored to the 1x1 trigger already placed at `(x, y)`; `avoidCollisions` additionally keeps the menu on-screen near a viewport edge, which the old implementation didn't handle at all.) Note in the commit message which of the two mechanisms was actually used.

- [ ] **Step 4: Run the existing test suite**

```bash
npx vitest run
```

Expected: identical pass/fail counts to baseline.

- [ ] **Step 5: Commit**

```bash
git add src/components/panels/ContextMenu.tsx
git commit -m "$(cat <<'EOF'
feat(context-menu): rewrite ContextMenu on a controlled shadcn DropdownMenu

Same external props (x, y, sections, items, onClose) — no call site
changes. Opens at the captured click point via [fixed-style|Popper-
anchored — see commit body], closes on Escape/outside-click via
Radix's own DropdownMenu behavior instead of a manual listener.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Settings → `Dialog` (`SettingsPanel.tsx` + `settings/McpSettingsSection.tsx`)

**Files:**
- Modify: `src/components/panels/SettingsPanel.tsx` (full rewrite)
- Modify: `src/components/panels/settings/McpSettingsSection.tsx` (full rewrite)
- Modify: `src/components/panels/AppSidebar.tsx` (add `DialogHeader`/`DialogTitle` around the existing Settings `Dialog` call site)
- Test: none new

**Interfaces:**
- Consumes: `Label` (Task 2's `@/components/ui/label`), `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem` (Task 2), `Switch` (Task 2), `Input`/`Button`/`Separator` (already installed/Task 2), `Collapsible`/`CollapsibleTrigger`/`CollapsibleContent` (already installed), `Tooltip`/`TooltipTrigger`/`TooltipContent` (already installed).
- Produces: same `SettingsPanel({ onClose, onSaved })` signature — `AppSidebar.tsx`'s call site keeps passing the same two props.

**Note:** `SettingsPanel.tsx` drops its own "Réglages" header row and inline close-X button entirely — `DialogContent`'s own built-in close affordance plus the new `DialogHeader`/`DialogTitle` (added to `AppSidebar.tsx`'s Dialog wrapper in this task) replace it. This finishes the "temporary doubled close-button" interim state Task 3 explicitly flagged.

- [ ] **Step 1: Rewrite `SettingsPanel.tsx`**

```tsx
"use client";

import { useState, useEffect } from "react";
import McpSettingsSection from "./settings/McpSettingsSection";
import { AGENT_MODELS, DEFAULT_AGENT_MODEL } from "@/lib/agent/models";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type SettingsData = {
  geminiApiKey: string;
  ideogramApiKey: string;
  openaiApiKey: string;
  grokApiKey: string;
  anthropicApiKey: string;
  openrouterApiKey: string;
  youtubeApiKey: string;
  youtubePlaylistId: string;
  hasGemini: boolean;
  hasIdeogram: boolean;
  hasOpenai: boolean;
  hasGrok: boolean;
  hasAnthropic: boolean;
  hasOpenrouter: boolean;
  hasYoutube: boolean;
  language: string;
  agentModel: string;
  agentWebSearch: string;
};

function ApiKeyField({
  id,
  label,
  extra,
  placeholder,
  value,
  onChange,
  connected,
  connectedValue,
  helpHref,
  helpLabel,
}: {
  id: string;
  label: string;
  extra?: React.ReactNode;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  connected: boolean;
  connectedValue?: string;
  helpHref: string;
  helpLabel: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label} {extra}
      </Label>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${connected ? "bg-primary" : "bg-muted-foreground/30"}`} />
        <span className="text-[10px] text-muted-foreground">{connected ? `Connecté (${connectedValue})` : "Non configuré"}</span>
      </div>
      <Input id={id} type="password" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      <a href={helpHref} target="_blank" rel="noopener" className="text-[10px] text-primary block">
        {helpLabel} →
      </a>
    </div>
  );
}

export default function SettingsPanel({ onClose, onSaved }: { onClose: () => void; onSaved?: () => void }) {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [gemini, setGemini] = useState("");
  const [ideogram, setIdeogram] = useState("");
  const [openai, setOpenai] = useState("");
  const [grok, setGrok] = useState("");
  const [anthropic, setAnthropic] = useState("");
  const [openrouter, setOpenrouter] = useState("");
  const [agentModel, setAgentModel] = useState("");
  const [agentWebSearch, setAgentWebSearch] = useState(true);
  const [ytKey, setYtKey] = useState("");
  const [ytPlaylist, setYtPlaylist] = useState("");
  const [language, setLanguage] = useState("fr");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: SettingsData) => {
        setSettings(s);
        setYtPlaylist(s.youtubePlaylistId || "");
        setLanguage(s.language || "fr");
        setAgentModel(s.agentModel || "");
        setAgentWebSearch((s.agentWebSearch ?? "1") !== "0");
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const body: Record<string, string> = {};
    if (gemini) body.geminiApiKey = gemini;
    if (ideogram) body.ideogramApiKey = ideogram;
    if (openai) body.openaiApiKey = openai;
    if (grok) body.grokApiKey = grok;
    if (anthropic) body.anthropicApiKey = anthropic;
    if (openrouter) body.openrouterApiKey = openrouter;
    if (agentModel) body.agentModel = agentModel;
    body.agentWebSearch = agentWebSearch ? "1" : "0";
    if (ytKey) body.youtubeApiKey = ytKey;
    body.youtubePlaylistId = ytPlaylist;
    body.language = language;

    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    setSaved(true);
    const res = await fetch("/api/settings");
    const data = await res.json();
    setSettings(data);
    setGemini("");
    setIdeogram("");
    setOpenai("");
    setGrok("");
    setAnthropic("");
    setYtKey("");
    onSaved?.();
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4">
      <ApiKeyField
        id="gemini-key"
        label="Clé API Google Gemini"
        placeholder="AIzaSy..."
        value={gemini}
        onChange={setGemini}
        connected={!!settings?.hasGemini}
        connectedValue={settings?.geminiApiKey}
        helpHref="https://aistudio.google.com/apikey"
        helpLabel="Obtenir une clé gratuite"
      />
      <ApiKeyField
        id="ideogram-key"
        label="Clé API Ideogram"
        placeholder="ide_..."
        value={ideogram}
        onChange={setIdeogram}
        connected={!!settings?.hasIdeogram}
        connectedValue={settings?.ideogramApiKey}
        helpHref="https://ideogram.ai/manage-api"
        helpLabel="Obtenir une clé"
      />
      <ApiKeyField
        id="openai-key"
        label="Clé API OpenAI"
        placeholder="sk-..."
        value={openai}
        onChange={setOpenai}
        connected={!!settings?.hasOpenai}
        connectedValue={settings?.openaiApiKey}
        helpHref="https://platform.openai.com/api-keys"
        helpLabel="Obtenir une clé"
      />
      <ApiKeyField
        id="grok-key"
        label="Clé API Grok (xAI)"
        placeholder="xai-..."
        value={grok}
        onChange={setGrok}
        connected={!!settings?.hasGrok}
        connectedValue={settings?.grokApiKey}
        helpHref="https://console.x.ai"
        helpLabel="Obtenir une clé"
      />

      <div className="space-y-3">
        <ApiKeyField
          id="openrouter-key"
          label="Clé OpenRouter"
          extra={<span className="text-primary">· agent IA</span>}
          placeholder="sk-or-v1-..."
          value={openrouter}
          onChange={setOpenrouter}
          connected={!!settings?.hasOpenrouter}
          connectedValue={settings?.openrouterApiKey}
          helpHref="https://openrouter.ai/keys"
          helpLabel="Obtenir une clé"
        />

        <div className="space-y-1.5">
          <Label>Modèle de l&apos;agent</Label>
          <Select value={agentModel || settings?.agentModel || DEFAULT_AGENT_MODEL} onValueChange={setAgentModel}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AGENT_MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label} — ${m.pricing.inputPerM}/${m.pricing.outputPerM} per M
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="web-search" className="text-xs font-normal">
            Recherche web automatique (variant :online)
          </Label>
          <Switch id="web-search" checked={agentWebSearch} onCheckedChange={setAgentWebSearch} />
        </div>
      </div>

      <ApiKeyField
        id="anthropic-key"
        label="Clé API Anthropic"
        extra={<span className="text-primary">· chat IA</span>}
        placeholder="sk-ant-..."
        value={anthropic}
        onChange={setAnthropic}
        connected={!!settings?.hasAnthropic}
        connectedValue={settings?.anthropicApiKey}
        helpHref="https://console.anthropic.com/settings/keys"
        helpLabel="Obtenir une clé"
      />

      <ApiKeyField
        id="youtube-key"
        label="Clé API YouTube"
        placeholder="AIzaSy..."
        value={ytKey}
        onChange={setYtKey}
        connected={!!settings?.hasYoutube}
        connectedValue={settings?.youtubeApiKey}
        helpHref="https://console.cloud.google.com/apis/credentials"
        helpLabel="Obtenir une clé"
      />

      <div className="space-y-1.5">
        <Label htmlFor="yt-channel">Chaîne YouTube</Label>
        <Input id="yt-channel" placeholder="https://youtube.com/@votrechaine" value={ytPlaylist} onChange={(e) => setYtPlaylist(e.target.value)} />
        <p className="text-[10px] text-muted-foreground">Colle l&apos;URL de ta chaîne YouTube ou un ID de playlist</p>
      </div>

      <div className="space-y-1.5">
        <Label>Langue par défaut</Label>
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fr">Français</SelectItem>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="es">Español</SelectItem>
            <SelectItem value="de">Deutsch</SelectItem>
            <SelectItem value="pt">Português</SelectItem>
            <SelectItem value="it">Italiano</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">Le texte sur les miniatures sera généré dans cette langue</p>
      </div>

      <Separator />
      <McpSettingsSection />

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? "Enregistrement…" : saved ? "Enregistré !" : "Enregistrer"}
      </Button>
    </div>
  );
}
```

`onClose` is kept as a prop (still passed by `AppSidebar.tsx`) for signature stability even though this component no longer renders its own close button — the Dialog's own close affordance and `onOpenChange={setSettingsOpen}` (already wired in Task 3) fully own closing now.

- [ ] **Step 2: Rewrite `McpSettingsSection.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Eye, EyeOff, Copy, Check, RefreshCw, ChevronRight } from "lucide-react";

function IconBtn({
  onClick,
  disabled,
  title,
  tone = "default",
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  tone?: "default" | "destructive";
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            onClick={onClick}
            disabled={disabled}
            aria-label={title}
            className={tone === "destructive" ? "text-destructive hover:text-destructive" : undefined}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent><p>{title}</p></TooltipContent>
    </Tooltip>
  );
}

export default function McpSettingsSection() {
  const [key, setKey] = useState<string>("");
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/settings/mcp-key")
      .then((r) => r.json())
      .then((d: { key: string }) => setKey(d.key))
      .catch(() => setKey(""));
  }, []);

  const regenerate = async () => {
    if (!confirm("Régénérer la clé invalidera toute configuration existante de Claude Desktop ou autre client MCP. Continuer ?")) return;
    setLoading(true);
    try {
      const r = await fetch("/api/settings/mcp-key", { method: "POST" });
      const d = (await r.json()) as { key: string };
      setKey(d.key);
      setReveal(true);
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // older browsers / permission denied
    }
  };

  const masked = "•".repeat(40);

  const claudeDesktopConfig = `{
  "mcpServers": {
    "thumbgen": {
      "url": "http://localhost:3000/api/mcp",
      "auth": { "type": "bearer", "token": "${key || "<your-key>"}" }
    }
  }
}`;

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-medium text-foreground">Serveur MCP</h3>
        <p className="text-[11px] mt-1 text-muted-foreground">
          Expose les outils ThumbGen aux clients MCP distants (Claude Desktop, Claude Code, Cursor…).
        </p>
      </div>

      <div className="space-y-1.5">
        <span className="text-[10px] uppercase text-muted-foreground block">Bearer token</span>
        <div className="flex gap-1.5 items-center">
          <code className="flex-1 text-[11px] px-2.5 py-2 rounded-lg truncate tabular-nums bg-muted font-mono border border-border" title={reveal ? key : undefined}>
            {reveal ? key || "(non générée)" : masked}
          </code>
          <IconBtn onClick={() => setReveal((v) => !v)} title={reveal ? "Masquer" : "Révéler"}>
            {reveal ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </IconBtn>
          <IconBtn onClick={copy} disabled={!key} title="Copier">
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </IconBtn>
          <IconBtn onClick={regenerate} disabled={loading} title="Régénérer" tone="destructive">
            <RefreshCw className="size-3.5" />
          </IconBtn>
        </div>
      </div>

      <Collapsible>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground [&[data-state=open]>svg]:rotate-90">
          <ChevronRight className="size-3 transition-transform" />
          Config Claude Desktop
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2.5 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Ajoute ce bloc à <code className="px-1 rounded bg-muted font-mono text-[10px]">~/Library/Application Support/Claude/claude_desktop_config.json</code> (macOS) ou l&apos;équivalent sur ton système, puis redémarre Claude Desktop.
          </p>
          <pre className="text-[10.5px] p-2.5 rounded-lg overflow-x-auto bg-muted font-mono border border-border leading-relaxed">{claudeDesktopConfig}</pre>
          <p className="text-[11px] italic text-muted-foreground">
            Pour un usage à distance, expose ThumbGen via Tailscale, ngrok ou un hébergement HTTPS, puis remplace l&apos;URL ci-dessus.
          </p>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
```

- [ ] **Step 3: Add `DialogHeader`/`DialogTitle` to `AppSidebar.tsx`'s Settings Dialog**

```
Old:
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <SettingsPanel onClose={() => setSettingsOpen(false)} onSaved={onSettingsSaved} />
        </DialogContent>
      </Dialog>

New:
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Réglages</DialogTitle>
          </DialogHeader>
          <SettingsPanel onClose={() => setSettingsOpen(false)} onSaved={onSettingsSaved} />
        </DialogContent>
      </Dialog>
```

(`DialogHeader`/`DialogTitle` are already imported in `AppSidebar.tsx` from Task 3b's Step 5.)

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Visual + behavioral check**

Dev server, `/`, open Réglages: confirm a single close affordance now (Dialog's own X, top-right), a "Réglages" title, all 7 API key fields with their connected/not-connected status dots and help links, the model `Select` populated from `AGENT_MODELS`, the web-search `Switch` reflecting/saving its state, the language `Select`, the YouTube channel field, the MCP section (reveal/copy/regenerate buttons with tooltips, the Collapsible Claude Desktop config block expanding/collapsing), and the Save button's disabled/saving/saved states. Fill in one key and Save — confirm it persists (status dot flips, field clears) exactly as before.

- [ ] **Step 6: Run the existing test suite**

```bash
npx vitest run
```

Expected: identical pass/fail counts to baseline.

- [ ] **Step 7: Commit**

```bash
git add src/components/panels/SettingsPanel.tsx src/components/panels/settings/McpSettingsSection.tsx src/components/panels/AppSidebar.tsx
git commit -m "$(cat <<'EOF'
feat(settings): rewrite Settings on shadcn Dialog/Select/Switch/Label/Collapsible

Same 7 API key fields, model picker, web-search toggle, language
picker, and MCP section — SettingsPanel drops its own header/close
button now that the Dialog (Task 3) provides both.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `WebcamCaptureModal.tsx`, `LibraryPickerModal.tsx`, `ImageAnnotateModal.tsx` → `Dialog`

**Files:**
- Modify: `src/components/panels/WebcamCaptureModal.tsx`
- Modify: `src/components/panels/chat/LibraryPickerModal.tsx` (full rewrite)
- Modify: `src/components/panels/chat/ImageAnnotateModal.tsx` (full rewrite)
- Test: none new

**Interfaces:**
- Consumes: `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle` (Task 2), `Button`/`Textarea` (already installed).
- Produces: identical external props on all three (`WebcamCaptureModal({onClose, onComplete})`, `LibraryPickerModal({onClose, onPick})`, `ImageAnnotateModal({imageUrl, onClose})`) — no call site changes anywhere (`AppSidebar.tsx`, `AttachButton.tsx`, `PendingUiAction.tsx`, `Message.tsx`/`ChatPanel.tsx`'s annotate trigger).

All three were already plain full-screen custom overlays (a backdrop `<div>` with a manual `onClick={onClose}` plus an inner `<div onClick={(e) => e.stopPropagation()}>`) — this task swaps that hand-rolled backdrop/outside-click/Escape mechanism for `Dialog`'s real one, and removes each component's own manual close button in favor of `Dialog`'s built-in one. Internal logic (webcam capture wizard, library fetch/tabs, annotate canvas drawing) is untouched.

- [ ] **Step 1: `WebcamCaptureModal.tsx`** — add the import and replace the outer wrapper + header

```
Old (top of file):
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

New:
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
```

```
Old:
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(8,8,12,0.85)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl p-5 w-full max-w-sm"
        style={{ background: "var(--node-bg)", border: "1px solid var(--line)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            {naming ? "Dernière étape — Nom" : `Étape ${stepIndex + 1} / ${STEPS.length} — ${step.title}`}
          </span>
          <button
            onClick={onClose}
            aria-label="Fermer"
            title="Fermer"
            className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {naming ? (

New:
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm" style={{ background: "var(--node-bg)", border: "1px solid var(--line)" }}>
        <span className="text-xs font-medium mb-1 block" style={{ color: "var(--text-muted)" }}>
          {naming ? "Dernière étape — Nom" : `Étape ${stepIndex + 1} / ${STEPS.length} — ${step.title}`}
        </span>

        {naming ? (
```

(The prominent close button Task 3b just added is now redundant — `DialogContent`'s own built-in close X replaces it, so it's removed here rather than doubled.)

```
Old (end of file):
          </button>
        </div>
          </>
        )}
      </div>
    </div>
  );
}

New:
          </button>
        </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Rewrite `LibraryPickerModal.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Tab = "faces" | "logos" | "refs";
type Item = { source: string; preview_url: string; label: string };

const TABS: Record<Tab, { listUrl: string; imagePrefix: string; storedPrefix: "fr" | "lg" | "sf"; labelKey: "label" | "title" }> = {
  faces: { listUrl: "/api/face-reactions", imagePrefix: "/api/face-reactions/image", storedPrefix: "fr", labelKey: "label" },
  logos: { listUrl: "/api/logos", imagePrefix: "/api/logos/image", storedPrefix: "lg", labelKey: "label" },
  refs: { listUrl: "/api/swipe-files", imagePrefix: "/api/swipe-files/image", storedPrefix: "sf", labelKey: "title" },
};

const TAB_LABELS: Record<Tab, string> = { faces: "Visages", logos: "Logos", refs: "Références" };

export default function LibraryPickerModal({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (source: string, preview_url: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("faces");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
    const cfg = TABS[tab];
    fetch(cfg.listUrl)
      .then((r) => r.json())
      .then((rows: Array<Record<string, unknown>>) => {
        if (cancelled) return;
        setItems(
          rows.map((r) => {
            const id = r.filename as string;
            const label = (r[cfg.labelKey] as string) || "Untitled";
            return {
              source: `stored:${cfg.storedPrefix}_${id}`,
              preview_url: `${cfg.imagePrefix}?f=${encodeURIComponent(id)}`,
              label,
            };
          }),
        );
      })
      .catch(() => setItems([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tab]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-[640px] max-w-[90vw] max-h-[85vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle>Bibliothèque</DialogTitle>
        </DialogHeader>

        <div className="flex gap-0 px-4 pt-3 border-b">
          {(Object.keys(TABS) as Tab[]).map((t) => {
            const isActive = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 pb-2 text-[10px] uppercase tracking-wider transition-colors relative ${isActive ? "text-foreground" : "text-muted-foreground"}`}
              >
                {TAB_LABELS[t]}
                {isActive && <span className="absolute left-3 right-3 -bottom-px h-px bg-primary" />}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-center py-12 text-muted-foreground text-sm">Chargement…</p>
          ) : items.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground text-sm">Aucun élément.</p>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {items.map((it) => (
                <button
                  key={it.source}
                  onClick={() => onPick(it.source, it.preview_url)}
                  className="rounded overflow-hidden text-left transition-all border border-border hover:border-muted-foreground"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.preview_url} alt={it.label} className="w-full h-24 object-cover bg-muted" />
                  <div className="text-[11px] px-2 py-1.5 truncate text-foreground">{it.label}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Rewrite `ImageAnnotateModal.tsx`**

```tsx
"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useChatStore } from "@/store/chat-store";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Undo2, Trash2, Download } from "lucide-react";

type Stroke = { color: string; width: number; points: Array<{ x: number; y: number }> };

const PEN_COLORS = ["#FF2E63", "#F7FFA8", "#6EDDB3", "#FFFFFF"];
const PEN_WIDTHS = [3, 6, 12];

export default function ImageAnnotateModal({ imageUrl, onClose }: { imageUrl: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [color, setColor] = useState(PEN_COLORS[0]);
  const [width, setWidth] = useState(PEN_WIDTHS[1]);
  const [comment, setComment] = useState("");
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  const [sending, setSending] = useState(false);

  const setDraft = useChatStore((s) => s.setDraft);
  const addAttachment = useChatStore((s) => s.addAttachment);

  const syncCanvasSize = useCallback(() => {
    if (!imgRef.current || !canvasRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    canvasRef.current.width = rect.width;
    canvasRef.current.height = rect.height;
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, currentStroke]);

  useEffect(() => {
    if (!imgLoaded) return;
    syncCanvasSize();
    const ro = new ResizeObserver(syncCanvasSize);
    if (imgRef.current) ro.observe(imgRef.current);
    return () => ro.disconnect();
  }, [imgLoaded, syncCanvasSize]);

  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const draw = (s: Stroke) => {
      if (s.points.length === 0) return;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
      ctx.stroke();
    };
    strokes.forEach(draw);
    if (currentStroke) draw(currentStroke);
  }

  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, currentStroke]);

  function localPoint(e: React.PointerEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setCurrentStroke({ color, width, points: [localPoint(e)] });
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!currentStroke) return;
    setCurrentStroke({ ...currentStroke, points: [...currentStroke.points, localPoint(e)] });
  }
  function onPointerUp() {
    if (!currentStroke) return;
    setStrokes((prev) => [...prev, currentStroke]);
    setCurrentStroke(null);
  }
  function undo() {
    setStrokes((prev) => prev.slice(0, -1));
  }
  function clear() {
    setStrokes([]);
  }

  async function mergeImageWithDrawing(): Promise<Blob | null> {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return null;
    const off = document.createElement("canvas");
    off.width = img.naturalWidth;
    off.height = img.naturalHeight;
    const ctx = off.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, off.width, off.height);
    const scaleX = off.width / canvas.width;
    const scaleY = off.height / canvas.height;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of strokes) {
      if (s.points.length === 0) continue;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width * Math.max(scaleX, scaleY);
      ctx.beginPath();
      ctx.moveTo(s.points[0].x * scaleX, s.points[0].y * scaleY);
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x * scaleX, s.points[i].y * scaleY);
      ctx.stroke();
    }
    return new Promise((resolve) => off.toBlob((b) => resolve(b), "image/png"));
  }

  async function download() {
    const blob = await mergeImageWithDrawing();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `thumbgen-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function sendToAgent() {
    setSending(true);
    try {
      const blob = await mergeImageWithDrawing();
      if (!blob) {
        setSending(false);
        return;
      }
      const fd = new FormData();
      fd.append("file", new File([blob], "annotated.png", { type: "image/png" }));
      const res = await fetch("/api/chat-uploads", { method: "POST", body: fd });
      if (!res.ok) {
        setSending(false);
        return;
      }
      const data = (await res.json()) as { source: string };
      const previewUrl = URL.createObjectURL(blob);
      addAttachment({ source: data.source, preview_url: previewUrl });
      setDraft(comment.trim() || "Voici les modifications que je veux sur cette image:");
      onClose();
    } catch {
      // swallow — modal stays open so the user can retry
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="flex flex-col gap-3 p-5"
        style={{ background: "var(--ink-1)", border: "1px solid var(--line)", maxWidth: "min(1200px, 95vw)", maxHeight: "92vh", minWidth: 600 }}
        ref={containerRef}
      >
        {/* Toolbar — chrome, converted; the drawing canvas below is the same
            kind of exception as the main React Flow canvas: its own pointer
            handlers and drawing logic are untouched. */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>
              <span style={{ color: "var(--brand)" }}>·</span> Annoter
            </span>
            <div className="flex items-center gap-1.5">
              {PEN_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  aria-label={`color ${c}`}
                  className="w-6 h-6 rounded-full transition-transform"
                  style={{ background: c, border: color === c ? "2px solid var(--text-primary)" : "1px solid var(--line)", transform: color === c ? "scale(1.12)" : "scale(1)" }}
                />
              ))}
              <div className="w-px h-5 mx-1" style={{ background: "var(--line)" }} />
              {PEN_WIDTHS.map((w) => (
                <button
                  key={w}
                  onClick={() => setWidth(w)}
                  aria-label={`width ${w}`}
                  className="flex items-center justify-center w-6 h-6 rounded-md transition-colors"
                  style={{ background: width === w ? "var(--surface)" : "transparent", border: width === w ? "1px solid var(--brand)" : "1px solid var(--line-faint)" }}
                >
                  <span className="block rounded-full" style={{ width: w, height: w, background: "var(--text-primary)" }} />
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={undo} disabled={strokes.length === 0}>
              <Undo2 className="size-3" />
              Annuler
            </Button>
            <Button variant="outline" size="sm" onClick={clear} disabled={strokes.length === 0}>
              <Trash2 className="size-3" />
              Effacer tout
            </Button>
            <Button variant="outline" size="sm" onClick={download}>
              <Download className="size-3" />
              Télécharger
            </Button>
          </div>
        </div>

        {/* Image + drawing canvas — untouched */}
        <div className="relative flex-1 flex items-center justify-center overflow-hidden rounded-xl" style={{ background: "var(--ink-3)", minHeight: 300 }}>
          <div className="relative inline-block" style={{ maxHeight: "65vh" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={imageUrl}
              alt=""
              onLoad={() => setImgLoaded(true)}
              onLoadCapture={(e) => {
                const im = e.currentTarget;
                setImgDims({ w: im.naturalWidth, h: im.naturalHeight });
              }}
              draggable={false}
              style={{ display: "block", maxWidth: "min(900px, 90vw)", maxHeight: "65vh", width: "auto", height: "auto", userSelect: "none", pointerEvents: "none" }}
            />
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{ position: "absolute", inset: 0, cursor: "crosshair", touchAction: "none" }}
            />
          </div>
        </div>

        {/* Comment + send */}
        <div className="flex items-end gap-2">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Décris à l'agent ce que tu veux modifier sur l'image…"
            rows={2}
            className="flex-1 resize-none"
          />
          <Button onClick={sendToAgent} disabled={sending} className="h-auto py-2">
            {sending ? "Envoi…" : "Envoyer à l'agent"}
          </Button>
        </div>

        {imgDims && (
          <p className="text-[10px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>
            {imgDims.w} × {imgDims.h} px · clique en dehors pour fermer · esc pour quitter
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

(The manual "click outside to close" handler — `onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}` on the old outer div — is dropped: `Dialog`'s own overlay now handles outside-click-to-close natively.)

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Visual + behavioral check**

Dev server, `/`: trigger the webcam capture modal (Visages tab → "Nouveau visage" → "Capturer avec la webcam") — confirm it opens as a Dialog, Escape/outside-click/the Dialog's own X all close it, the 3-step wizard + naming step still work exactly as before (including Task 3b's fixes: denied-camera state truly disables Capturer, close is reachable every step). Trigger the Library picker (via `AttachButton`'s "Depuis ma bibliothèque" and via `PendingUiAction`'s image request flow) — confirm the 3 tabs load/filter correctly and picking an item still attaches it. Trigger the annotate modal (click any chat image) — confirm the color/width pickers, undo/clear/download, the drawing canvas itself, and "Envoyer à l'agent" all work exactly as before.

- [ ] **Step 6: Run the existing test suite**

```bash
npx vitest run
```

Expected: identical pass/fail counts to baseline.

- [ ] **Step 7: Commit**

```bash
git add src/components/panels/WebcamCaptureModal.tsx src/components/panels/chat/LibraryPickerModal.tsx src/components/panels/chat/ImageAnnotateModal.tsx
git commit -m "$(cat <<'EOF'
feat(modals): rewrite WebcamCaptureModal/LibraryPickerModal/ImageAnnotateModal on shadcn Dialog

Same external props, same internal logic (webcam wizard, library
tabs/fetch, annotate canvas drawing) — only the backdrop/close
mechanism changes, from a hand-rolled outside-click listener to
Dialog's own.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `SketchEditor.tsx` chrome → shadcn

**Files:**
- Modify: `src/components/panels/SketchEditor.tsx` (full rewrite of the chrome; drawing-surface logic untouched)
- Test: none new

**Interfaces:**
- Consumes: `ToggleGroup`/`ToggleGroupItem` (Task 2), `Button` (already installed).
- Produces: same default export, no props (mounted once, controlled entirely via the `open-sketch-editor` window event, unchanged).

**Exception, same shape as the main canvas:** the Excalidraw component itself (`<Comp>`, its own pointer/drawing handlers) and `makeFrameElements`'s Excalidraw element properties (`strokeColor: "var(--bone)"`, etc. — these are Excalidraw's OWN element-rendering properties consumed by its canvas renderer, not React DOM `style`) are untouched. Only the top bar (title, ratio picker, Cancel/Save) and the right-hand `AssetPanel` — both plain React DOM chrome — convert.

- [ ] **Step 1: Rewrite**

```tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useCanvasStore } from "@/store/canvas-store";
import "@excalidraw/excalidraw/index.css";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { PenLine } from "lucide-react";

type ExcalidrawAPI = {
  getSceneElements: () => unknown[];
  getAppState: () => Record<string, unknown>;
  getFiles: () => Record<string, unknown>;
  updateScene: (scene: Record<string, unknown>) => void;
  addFiles: (files: { id: string; dataURL: string; mimeType: string; created: number }[]) => void;
};

type ExcalidrawMod = {
  Excalidraw: React.ComponentType<Record<string, unknown>>;
  exportToBlob: (opts: Record<string, unknown>) => Promise<Blob>;
};

type WorkflowAsset = { url: string; label: string; type: string };

const RATIOS: Record<string, { w: number; h: number; label: string }> = {
  "16x9": { w: 1280, h: 720, label: "16:9" },
  "1x1": { w: 1024, h: 1024, label: "1:1" },
  "4x3": { w: 1024, h: 768, label: "4:3" },
  "9x16": { w: 720, h: 1280, label: "9:16" },
};

// Excalidraw's OWN element-rendering properties (strokeColor/opacity/etc,
// consumed by its canvas renderer) — part of the drawing-surface exception,
// not React DOM chrome. Untouched.
function makeFrameElements(ratio: string) {
  const dims = RATIOS[ratio] || RATIOS["16x9"];
  return [
    {
      type: "rectangle" as const,
      id: "thumbnail-frame",
      x: -dims.w / 2,
      y: -dims.h / 2,
      width: dims.w,
      height: dims.h,
      strokeColor: "var(--bone)",
      backgroundColor: "transparent",
      fillStyle: "solid" as const,
      strokeWidth: 2,
      strokeStyle: "dashed" as const,
      roughness: 0,
      opacity: 40,
      locked: true,
      roundness: { type: 3 },
    },
    {
      type: "text" as const,
      id: "thumbnail-label",
      x: -dims.w / 2,
      y: -dims.h / 2 - 30,
      width: 250,
      height: 25,
      text: `Zone miniature ${dims.label}`,
      fontSize: 16,
      fontFamily: 1,
      strokeColor: "var(--bone)",
      opacity: 40,
      locked: true,
    },
  ];
}

function AssetPanel({ assets, onAddImage }: { assets: WorkflowAsset[]; onAddImage: (url: string) => void }) {
  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-[180px] bg-muted border-l border-border">
        <p className="text-[10px] text-center px-4 text-muted-foreground">
          Ajoute des nodes Face, Logo ou Image sur ton canvas pour les voir ici
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-[180px] bg-muted border-l border-border">
      <div className="px-3 pt-3 pb-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Workflow ({assets.length})</span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        <div className="space-y-1.5">
          {assets.map((item, i) => (
            <button
              key={i}
              onClick={() => onAddImage(item.url)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all border border-transparent hover:border-primary bg-card/50"
              title={`Ajouter "${item.label}"`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url} alt={item.label} className="w-10 h-10 rounded object-cover flex-shrink-0" loading="lazy" />
              <div className="min-w-0 text-left">
                <p className="text-[10px] font-medium truncate text-foreground">{item.label}</p>
                <p className="text-[9px] text-muted-foreground">{item.type === "faceReference" ? "Face" : item.type === "swipeFile" ? "Image" : item.type}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SketchEditor() {
  const [open, setOpen] = useState(false);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [ratio, setRatio] = useState("16x9");
  const [Comp, setComp] = useState<React.ComponentType<Record<string, unknown>> | null>(null);
  const [saving, setSaving] = useState(false);
  const [key, setKey] = useState(0);
  const [workflowAssets, setWorkflowAssets] = useState<WorkflowAsset[]>([]);
  const modRef = useRef<ExcalidrawMod | null>(null);
  const apiRef = useRef<ExcalidrawAPI | null>(null);
  const savedElementsRef = useRef<unknown[] | null>(null);
  const savedFilesRef = useRef<Record<string, unknown> | null>(null);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  useEffect(() => {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).EXCALIDRAW_ASSET_PATH = "/excalidraw-fonts/";
    }
    import("@excalidraw/excalidraw").then((mod) => {
      modRef.current = mod as unknown as ExcalidrawMod;
      setComp(() => mod.Excalidraw as unknown as React.ComponentType<Record<string, unknown>>);
    });
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setNodeId(detail.nodeId);
      setRatio(detail.aspectRatio || "16x9");

      if (detail.sketchElements) {
        try { savedElementsRef.current = JSON.parse(detail.sketchElements); }
        catch { savedElementsRef.current = null; }
      } else {
        savedElementsRef.current = null;
      }
      if (detail.sketchFiles) {
        try { savedFilesRef.current = JSON.parse(detail.sketchFiles); }
        catch { savedFilesRef.current = null; }
      } else {
        savedFilesRef.current = null;
      }

      setWorkflowAssets(detail.workflowAssets || []);
      setKey((k) => k + 1);
      setOpen(true);
    };
    window.addEventListener("open-sketch-editor", handler);
    return () => window.removeEventListener("open-sketch-editor", handler);
  }, []);

  const changeRatio = useCallback((newRatio: string) => {
    if (apiRef.current) {
      const currentElements = apiRef.current.getSceneElements() as Array<{ id: string }>;
      savedElementsRef.current = currentElements.filter((el) => el.id !== "thumbnail-frame" && el.id !== "thumbnail-label");
      savedFilesRef.current = apiRef.current.getFiles() as Record<string, unknown>;
    }
    setRatio(newRatio);
    setKey((k) => k + 1);
  }, []);

  const getInitialData = useCallback(() => {
    const frameElements = makeFrameElements(ratio);
    if (savedElementsRef.current && savedElementsRef.current.length > 0) {
      const userElements = (savedElementsRef.current as Array<{ id: string }>).filter((el) => el.id !== "thumbnail-frame" && el.id !== "thumbnail-label");
      return { elements: [...frameElements, ...userElements], files: savedFilesRef.current || undefined, scrollToContent: true };
    }
    return { elements: frameElements, scrollToContent: true };
  }, [ratio]);

  const addImageToCanvas = useCallback(async (imageUrl: string) => {
    try {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      const file = new File([blob], "image.png", { type: blob.type || "image/png" });
      const excalidrawEl = document.querySelector(".excalidraw .excalidraw__canvas");
      if (!excalidrawEl) return;
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      const rect = excalidrawEl.getBoundingClientRect();
      const dropEvent = new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      });
      excalidrawEl.dispatchEvent(dropEvent);
    } catch (err) {
      console.error("Failed to drop image:", err);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!apiRef.current || !modRef.current || !nodeId) return;
    setSaving(true);
    try {
      const allElements = apiRef.current.getSceneElements() as Array<{ id: string }>;
      const appState = apiRef.current.getAppState();
      const files = apiRef.current.getFiles();
      const dims = RATIOS[ratio] || RATIOS["16x9"];

      const blob = await modRef.current.exportToBlob({
        elements: allElements,
        appState: { ...appState, exportWithDarkMode: true, exportBackground: true, viewBackgroundColor: "#1e1e2e" },
        files,
        getDimensions: () => ({ width: dims.w, height: dims.h, scale: 1 }),
        mimeType: "image/png",
      });

      const reader = new FileReader();
      reader.onload = () => {
        updateNodeData(nodeId, {
          imageBase64: reader.result as string,
          aspectRatio: ratio,
          sketchElements: JSON.stringify(allElements),
          sketchFiles: JSON.stringify(files),
        });
        setOpen(false);
        setSaving(false);
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.error("Export sketch error:", err);
      setSaving(false);
    }
  }, [nodeId, ratio, updateNodeData]);

  const handleCancel = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCancel();
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, handleSave]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0 bg-card border-b border-border">
        <div className="flex items-center gap-3">
          <PenLine className="size-4 text-primary" strokeWidth={1.5} />
          <span className="text-sm font-medium text-foreground">Éditeur de croquis</span>
          <ToggleGroup type="single" value={ratio} onValueChange={(v) => v && changeRatio(v)} className="ml-4">
            {Object.entries(RATIOS).map(([k, val]) => (
              <ToggleGroupItem key={k} value={k} className="text-[11px] px-2 h-6">
                {val.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Cmd+S sauvegarder · Esc annuler</span>
          <Button variant="outline" size="sm" onClick={handleCancel}>Annuler</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Export..." : "Sauvegarder"}</Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1">
          {Comp ? (
            <Comp
              key={key}
              excalidrawAPI={(api: unknown) => { apiRef.current = api as ExcalidrawAPI; }}
              theme="dark"
              initialData={getInitialData()}
              UIOptions={{ canvasActions: { saveToActiveFile: false, loadScene: false, export: false, toggleTheme: false } }}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <span className="text-sm text-muted-foreground">Chargement...</span>
            </div>
          )}
        </div>

        <AssetPanel assets={workflowAssets} onAddImage={addImageToCanvas} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Visual + behavioral check**

Dev server, `/`: add a Sketch node and open the editor. Confirm the ratio ToggleGroup switches between 16:9/1:1/4:3/9:16 and preserves drawn content across the switch (verbatim-ported `changeRatio` logic). Confirm Cmd+S and the Sauvegarder button both save and close, Escape and the Annuler button both cancel. Confirm the right-hand asset panel lists workflow images and clicking one still drops it onto the Excalidraw canvas. Confirm the drawing surface itself (pen tools, shapes, the dashed thumbnail-frame guide) is completely unchanged.

- [ ] **Step 4: Run the existing test suite**

```bash
npx vitest run
```

Expected: identical pass/fail counts to baseline.

- [ ] **Step 5: Commit**

```bash
git add src/components/panels/SketchEditor.tsx
git commit -m "$(cat <<'EOF'
feat(sketch-editor): convert chrome to shadcn ToggleGroup/Button

Same exception as the main canvas — only the top bar and the asset
side panel convert; the Excalidraw drawing surface and its own
element-rendering properties are untouched.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `usage/UsageView.tsx` → Tailwind + shadcn (remove `<style jsx>` entirely)

**Files:**
- Modify: `src/app/usage/UsageView.tsx` (full rewrite)
- Test: none new

**Interfaces:**
- Consumes: `ToggleGroup`/`ToggleGroupItem`, `Card`/`CardHeader`/`CardContent`, `Badge`, `Skeleton`, `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`, `Empty`/`EmptyHeader`/`EmptyTitle` (Task 2 + already installed), `AppSidebar`/`SidebarInset` (Task 3).
- Produces: same default export `UsageView`, no props.

**Compromise, per the spec (already assumed, not relitigated here):** the ~96–200px italic serif hero number loses its editorial display-font treatment — the font stays Arial and the custom styling disappears, replaced by standard bold `text-7xl` sizing. This is the plan's one deliberately accepted visual regression.

- [ ] **Step 1: Rewrite**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import AppSidebar from "@/components/panels/AppSidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { PROVIDER_COLORS } from "@/lib/model-costs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

type Period = "today" | "7d" | "30d" | "all";

type Totals = { totalCost: number; totalGenerations: number; totalImages: number; totalTokens: number; avgTimeMs: number; errorCount: number };
type ModelBreakdown = { provider: string; model: string; count: number; images: number; cost: number; avgTimeMs: number; totalTokens: number };
type LogRow = {
  id: string; created_at: string; provider: string; model: string; endpoint: string;
  cost_estimate: number; time_ms: number; total_tokens: number; image_count: number;
  prompt: string | null; status: string; error_message: string | null;
};
type DailyPoint = { day: string; cost: number; count: number };
type AgentTotals = { totalCost: number; totalMessages: number; totalConversations: number; totalInputTokens: number; totalOutputTokens: number; totalTokens: number };
type AgentDailyPoint = { day: string; cost: number; messages: number };
type ApiResponse = {
  period: Period; totals: Totals; byModel: ModelBreakdown[]; log: LogRow[]; daily: DailyPoint[];
  agentTotals?: AgentTotals; agentDaily?: AgentDailyPoint[];
};

const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "all", label: "All time" },
];

const MODEL_LABELS: Record<string, string> = {
  "gemini-2.5-flash-image": "Gemini 2.5 Flash",
  "gemini-3.1-flash-image": "Gemini 3.1 Flash",
  "gemini-3.1-flash-lite-image": "Gemini 3.1 Flash Lite",
  "gemini-3-pro-image": "Gemini 3 Pro",
  ideogram: "Ideogram v3",
  "gpt-image-1": "GPT Image 1",
  "gpt-image-1.5": "GPT Image 1.5",
  "gpt-image-2": "GPT Image 2",
  "gpt-image-2.5-flare": "GPT Image 2.5 Flare",
  "gpt-image-2.5-sunburst": "GPT Image 2.5 Sunburst",
  "grok-imagine-image-2.0": "Grok Imagine 2.0",
  "bytedance-seed/seedream-4.5": "Seedream 4.5",
};

const modelLabel = (m: string) => MODEL_LABELS[m] || m;
const fmtNum = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
const fmtMs = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)}s`);

function splitCost(n: number): [string, string] {
  const fixed = n.toFixed(2);
  const [int, dec] = fixed.split(".");
  return [Number(int).toLocaleString("en-US"), dec];
}

function fmtTime(iso: string) {
  const isoNorm = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const d = new Date(isoNorm);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function timeAgo(iso: string) {
  const isoNorm = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const d = new Date(isoNorm);
  const diff = Date.now() - d.getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.round(h / 24);
  return `${days}d`;
}

function UsageInner() {
  const [period, setPeriod] = useState<Period>("all");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/generations?period=${period}`)
      .then((r) => r.json())
      .then((d: ApiResponse) => setData(d))
      .finally(() => setLoading(false));
  }, [period]);

  const totals = data?.totals;
  const byModel = data?.byModel ?? [];
  const log = data?.log ?? [];
  const daily = data?.daily ?? [];
  const agentTotals = data?.agentTotals;

  const imagesCost = totals?.totalCost ?? 0;
  const agentCost = agentTotals?.totalCost ?? 0;
  const grandTotal = imagesCost + agentCost;

  const maxBar = useMemo(() => Math.max(0.0001, ...byModel.map((b) => b.cost)), [byModel]);
  const maxDaily = useMemo(() => Math.max(0.0001, ...daily.map((d) => d.cost)), [daily]);
  const [intPart, decPart] = splitCost(grandTotal);
  const costPerImage = totals && totals.totalImages > 0 ? totals.totalCost / totals.totalImages : 0;

  return (
    <>
      <AppSidebar />
      <SidebarInset>
        <main className="px-6 sm:px-8 py-10 sm:py-14 max-w-[1200px] mx-auto w-full">
          {/* Header */}
          <header className="mb-14">
            <div className="inline-flex items-center gap-3 text-[11px] tracking-[0.22em] uppercase text-muted-foreground mb-4">
              <span className="w-7 h-px bg-primary" />
              <span>Generation Ledger</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 sm:gap-8 pb-7 border-b border-border">
              <h1 className="text-4xl sm:text-5xl font-bold text-foreground">Usage</h1>
              <ToggleGroup type="single" value={period} onValueChange={(v) => v && setPeriod(v as Period)}>
                {PERIODS.map((p) => (
                  <ToggleGroupItem key={p.id} value={p.id} className="text-xs">
                    {p.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </header>

          {/* Hero */}
          <section className="pb-12 mb-14 border-b border-border">
            <div className="text-[11px] tracking-[0.18em] uppercase text-muted-foreground mb-5">Cumulative cost · estimate</div>
            <div className="flex items-baseline gap-1 flex-wrap" aria-label={`${intPart}.${decPart} dollars`}>
              <span className="text-2xl text-muted-foreground font-mono mr-3 self-start">$</span>
              {loading ? (
                <Skeleton className="h-16 w-48" />
              ) : (
                <>
                  <span className="text-6xl sm:text-7xl font-bold text-foreground tabular-nums">{intPart}</span>
                  <span className="text-6xl sm:text-7xl font-bold text-primary">.</span>
                  <span className="text-6xl sm:text-7xl font-bold text-muted-foreground tabular-nums">{decPart}</span>
                  <span className="text-xs font-mono tracking-widest text-muted-foreground ml-4 self-end mb-2">USD</span>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    <span className="w-4 h-px bg-primary" /> Génération · images
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-foreground tabular-nums">${imagesCost.toFixed(2)}</div>
                  <div className="flex flex-wrap gap-2 mt-2 text-xs font-mono text-muted-foreground">
                    <span>{fmtNum(totals?.totalImages ?? 0)} images</span>
                    <span>·</span>
                    <span>{fmtNum(totals?.totalGenerations ?? 0)} calls</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    <span className="w-4 h-px bg-primary" /> Agent IA · chat
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-foreground tabular-nums">${agentCost.toFixed(2)}</div>
                  <div className="flex flex-wrap gap-2 mt-2 text-xs font-mono text-muted-foreground">
                    <span>{fmtNum(agentTotals?.totalConversations ?? 0)} conv.</span>
                    <span>·</span>
                    <span>{fmtNum(agentTotals?.totalMessages ?? 0)} msgs</span>
                    <span>·</span>
                    <span>{fmtNum(agentTotals?.totalTokens ?? 0)} tokens</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <ul className="flex flex-wrap gap-6 sm:gap-8 mt-7 list-none p-0 font-mono text-xs">
              <li className="flex items-baseline gap-2">
                <span className="text-foreground tabular-nums">{loading ? "—" : fmtNum((totals?.totalGenerations ?? 0) + (agentTotals?.totalMessages ?? 0))}</span>
                <span className="text-muted-foreground uppercase tracking-[0.16em] text-[10px]">total calls</span>
              </li>
              <li className="flex items-baseline gap-2">
                <span className="text-foreground tabular-nums">{loading ? "—" : fmtNum(totals?.totalImages ?? 0)}</span>
                <span className="text-muted-foreground uppercase tracking-[0.16em] text-[10px]">images</span>
              </li>
              <li className="flex items-baseline gap-2">
                <span className="text-foreground tabular-nums">{loading ? "—" : fmtNum((totals?.totalTokens ?? 0) + (agentTotals?.totalTokens ?? 0))}</span>
                <span className="text-muted-foreground uppercase tracking-[0.16em] text-[10px]">tokens</span>
              </li>
              <li className="flex items-baseline gap-2">
                <span className="text-foreground tabular-nums">{loading ? "—" : fmtMs(totals?.avgTimeMs ?? 0)}</span>
                <span className="text-muted-foreground uppercase tracking-[0.16em] text-[10px]">avg latency</span>
              </li>
              <li className="flex items-baseline gap-2">
                <span className="text-foreground tabular-nums">{loading || costPerImage === 0 ? "—" : `$${costPerImage.toFixed(3)}`}</span>
                <span className="text-muted-foreground uppercase tracking-[0.16em] text-[10px]">cost / image</span>
              </li>
              {totals && totals.errorCount > 0 && (
                <li className="flex items-baseline gap-2">
                  <span className="text-destructive tabular-nums">{totals.errorCount}</span>
                  <span className="text-muted-foreground uppercase tracking-[0.16em] text-[10px]">errors</span>
                </li>
              )}
            </ul>

            {daily.length > 0 && (
              <div className="flex items-end gap-[3px] h-14 mt-8" aria-label="Daily cost trend">
                {daily.map((d) => (
                  <span
                    key={d.day}
                    className="flex-1 min-w-1 bg-muted-foreground/30 hover:bg-primary transition-colors"
                    style={{ height: `${Math.max(4, (d.cost / maxDaily) * 100)}%` }}
                    title={`${d.day} · $${d.cost.toFixed(2)} · ${d.count} gen`}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Section 01: Breakdown by model */}
          <section className="mb-20">
            <header className="flex items-baseline gap-5 pb-4 mb-6 border-b border-border flex-wrap">
              <span className="font-mono text-[11px] tracking-[0.2em] text-primary">01</span>
              <h2 className="text-2xl font-semibold text-foreground">By model</h2>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">{byModel.length} model{byModel.length !== 1 ? "s" : ""} · sorted by cost</span>
            </header>

            {byModel.length === 0 ? (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyTitle className="text-xs font-mono tracking-widest text-muted-foreground">— No generations in this window —</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="flex flex-col">
                {byModel.map((b) => {
                  const color = PROVIDER_COLORS[b.provider] || "#FFFFFF";
                  const widthPct = (b.cost / maxBar) * 100;
                  return (
                    <div key={`${b.provider}-${b.model}`} className="grid grid-cols-2 lg:grid-cols-[220px_1fr_90px_90px_90px] items-center gap-3 lg:gap-6 py-4 border-b border-border last:border-b-0">
                      <div className="flex items-center gap-3 min-w-0 col-span-2 lg:col-span-1">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                        <span className="text-sm text-foreground truncate">{modelLabel(b.model)}</span>
                        <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/70">{b.provider}</span>
                      </div>
                      <div className="h-px bg-border relative hidden lg:block">
                        <span className="absolute left-0 -top-[1px] h-[3px] opacity-85" style={{ width: `${widthPct}%`, background: color }} />
                      </div>
                      <div className="font-mono text-[13px] text-right text-foreground tabular-nums">${b.cost.toFixed(b.cost < 1 ? 3 : 2)}</div>
                      <div className="font-mono text-[13px] text-right text-muted-foreground tabular-nums">{fmtNum(b.images)} <span className="text-[10px] uppercase text-muted-foreground/70">img</span></div>
                      <div className="font-mono text-[13px] text-right text-muted-foreground tabular-nums">{fmtMs(b.avgTimeMs)} <span className="text-[10px] uppercase text-muted-foreground/70">avg</span></div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Section 02: Activity log */}
          <section className="mb-20">
            <header className="flex items-baseline gap-5 pb-4 mb-6 border-b border-border flex-wrap">
              <span className="font-mono text-[11px] tracking-[0.2em] text-primary">02</span>
              <h2 className="text-2xl font-semibold text-foreground">Recent activity</h2>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">{log.length} entr{log.length === 1 ? "y" : "ies"} · most recent first</span>
            </header>

            {log.length === 0 ? (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyTitle className="text-xs font-mono tracking-widest text-muted-foreground">— No entries in this window —</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead aria-label="Time ago" />
                      <TableHead>Model</TableHead>
                      <TableHead>Prompt</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Latency</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                      <TableHead className="text-right">Img</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {log.map((row) => {
                      const color = PROVIDER_COLORS[row.provider] || "#fff";
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="whitespace-nowrap text-muted-foreground">{fmtTime(row.created_at)}</TableCell>
                          <TableCell className="text-[10px] text-muted-foreground/70 text-right">{timeAgo(row.created_at)}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            <Badge variant="outline" className="gap-1.5">
                              <span className="w-1 h-1 rounded-full" style={{ background: color }} />
                              {modelLabel(row.model)}
                            </Badge>
                            <span className="text-muted-foreground/70 text-[10px] ml-2">/{row.endpoint}</span>
                          </TableCell>
                          <TableCell className="max-w-[380px] text-muted-foreground">
                            {row.status === "error" ? (
                              <span className="text-destructive text-[11px]" title={row.error_message || ""}>ERR · {row.error_message || "—"}</span>
                            ) : row.prompt ? (
                              <span className="line-clamp-1" title={row.prompt}>{row.prompt}</span>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-foreground">${row.cost_estimate.toFixed(3)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{fmtMs(row.time_ms)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {row.total_tokens > 0 ? fmtNum(row.total_tokens) : <span className="text-muted-foreground/50">—</span>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{row.image_count}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          <footer className="flex items-center gap-3 pt-6 border-t border-border font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground/70">
            <span className="w-1 h-1 rounded-full bg-primary" />
            <span>Costs are estimates from per-image pricing. Real billing may differ.</span>
          </footer>
        </main>
      </SidebarInset>
    </>
  );
}

export default function UsageView() {
  // ReactFlowProvider lets AppSidebar mount safely on this page (it calls
  // useReactFlow() internally for its addAtCenter helper).
  return (
    <ReactFlowProvider>
      <UsageInner />
    </ReactFlowProvider>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Visual check — every state**

Dev server, `/usage`. Check all 4 period pills switch and refetch. Check the loading state (throttle network in devtools or reload) shows the `Skeleton` in place of the hero number. Check the empty state (a period with zero data, e.g. "Today" on a fresh install) shows the `Empty` blocks for both sections instead of the table/list. Check a populated state: hero number, both category cards, the 5-6 stat meta line, the sparkline (hover shows the tooltip), the by-model bars (color-coded, width proportional to cost, provider tag), and the activity table (badge per row, error rows in red, prompt truncation, "—" for empty cells). Resize the window narrow — confirm the model-row grid collapses to 2 columns and hides the bar below the `lg` breakpoint, and the table scrolls horizontally rather than squashing.

- [ ] **Step 4: Run the existing test suite**

```bash
npx vitest run
```

Expected: identical pass/fail counts to baseline.

- [ ] **Step 5: Commit**

```bash
git add src/app/usage/UsageView.tsx
git commit -m "$(cat <<'EOF'
feat(usage): rewrite UsageView on Tailwind + shadcn, remove the ~400-line <style jsx> block

Same information hierarchy (hero total, images/agent split, by-model
breakdown with bars, daily sparkline, activity log table) — ToggleGroup
for the period selector, Card for the split cards, Skeleton for
loading, Badge for the model tag, Table for the activity log, Empty
for empty states. Accepted compromise: the italic serif hero number
loses its editorial display-font treatment (font stays Arial).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Finish ChatPanel — `Composer`/`AttachButton` Tooltips + audit remaining chat files

**Files:**
- Modify: `src/components/panels/ChatPanel.tsx` (finish the token conversion the prior session's `Card` restructuring left behind — found by re-reading the current file, not in the original scope list)
- Modify: `src/components/panels/chat/Composer.tsx` (Tooltip-wrap send/stop, finish token conversion)
- Modify: `src/components/panels/chat/AttachButton.tsx` (Tooltip-wrap its `IconButton`, finish token conversion)
- Modify: `src/components/panels/chat/AgentActivity.tsx`
- Modify: `src/components/panels/chat/PendingUiAction.tsx`
- Modify: `src/components/panels/chat/Message.tsx`
- Modify: `src/components/panels/chat/TextMarkdown.tsx`
- Modify: `src/components/panels/chat/UsageBadge.tsx`
- Modify: `src/components/panels/chat/ConversationList.tsx`
- Modify: `src/components/panels/chat/MessageList.tsx` (found still unconverted by grep — NOT in the original file list, same "verify, don't trust the list" discovery as Task 1)
- Modify: `src/components/panels/chat/tool-renderers/GeneratedImagePreview.tsx`
- Modify: `src/components/panels/chat/tool-renderers/SearchYoutubeGallery.tsx`
- Modify: `src/components/panels/chat/tool-renderers/SimpleToolPart.tsx` (also gets the `Alert`-for-errors fix below)
- Test: none new

**Interfaces:**
- Consumes: `Tooltip`/`TooltipTrigger`/`TooltipContent` (already installed, `MicButton.tsx`'s exact pattern), `Alert`/`AlertTitle`/`AlertDescription` (already installed), `Button` (already installed).
- Produces: no external API changes anywhere in this task — every component keeps its existing props.

**`ToolCallCard.tsx` needs no changes** — confirmed via `grep -n "var(--\|style={{" src/components/panels/chat/ToolCallCard.tsx` returning zero matches; it's already fully converted.

**Real functional fix, not just style — `SimpleToolPart.tsx`'s error state:** found via live debugging, documented in `docs/superpowers/specs/2026-09-15-ux-journey-audit.md`. Today a tool-call error renders as a barely-visible inline text span (`text-xs py-1`). This task upgrades the error branch specifically to a real `Alert variant="destructive"` — same visual weight as every other error surface in the app (`ChatPanel.tsx`'s own error `Alert`). The three non-error states (input-streaming/input-available/output-available) are untouched.

- [ ] **Step 1: Finish `ChatPanel.tsx`'s token conversion**

The prior session converted its structure to `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardAction`/`CardContent`/`CardFooter`/`Tooltip` but left the header's own colors/fonts as inline Atelier Nocturne styles — convert those to Tailwind:

```
Old:
      <Card className="h-full flex flex-col gap-0 py-0 overflow-hidden" style={{ background: "var(--node-bg)" }}>
        <CardHeader className="border-b py-3" style={{ borderColor: "var(--line-faint)" }}>
          <CardTitle
            className="italic truncate"
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-display), 'Fraunces', serif",
              fontSize: 18,
              fontWeight: 400,
              letterSpacing: "-0.015em",
            }}
          >
            <span style={{ color: "var(--brand)" }}>·</span> Brainstorm
          </CardTitle>
          <CardDescription
            className="text-[10px] uppercase"
            style={{
              fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
              letterSpacing: "0.18em",
              color: "var(--text-muted)",
            }}
          >
            Agent conversationnel ThumbGen
          </CardDescription>

New:
      <Card className="h-full flex flex-col gap-0 py-0 overflow-hidden bg-card">
        <CardHeader className="border-b py-3">
          <CardTitle className="italic truncate text-[18px] font-normal tracking-[-0.015em] text-foreground">
            <span className="text-primary">·</span> Brainstorm
          </CardTitle>
          <CardDescription className="text-[10px] uppercase tracking-[0.18em] font-mono text-muted-foreground">
            Agent conversationnel ThumbGen
          </CardDescription>
```

- [ ] **Step 2: `Composer.tsx`** — Tooltip-wrap send/stop, finish token conversion

```
Old:
"use client";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { useChatStore } from "@/store/chat-store";
import MicButton from "./MicButton";
import AttachButton from "./AttachButton";
import type { ChatStatus } from "ai";

New:
"use client";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useChatStore } from "@/store/chat-store";
import MicButton from "./MicButton";
import AttachButton from "./AttachButton";
import type { ChatStatus } from "ai";
```

```
Old:
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

New:
    <div className="px-3 py-3 space-y-2 border-t border-border">
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

      <InputGroup className="rounded-xl bg-muted border-border">
        <InputGroupTextarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Décris ta miniature, ou enregistre un vocal…"
          className="text-foreground"
          style={{ minHeight: "32px", maxHeight: "160px" }}
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
            <Tooltip>
              <TooltipTrigger render={<InputGroupButton onClick={onStop} aria-label="Arrêter" className="ml-auto text-destructive" />}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
              </TooltipTrigger>
              <TooltipContent><p>Arrêter</p></TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <InputGroupButton
                    onClick={onSend}
                    disabled={!canSend}
                    aria-label="Envoyer"
                    className={`ml-auto ${canSend ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                  />
                }
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              </TooltipTrigger>
              <TooltipContent><p>Envoyer</p></TooltipContent>
            </Tooltip>
          )}
        </InputGroupAddon>
      </InputGroup>
    </div>
```

- [ ] **Step 3: `AttachButton.tsx`** — Tooltip-wrap `IconButton`, finish token conversion

```
Old:
"use client";
import { useRef, useState } from "react";
import LibraryPickerModal from "./LibraryPickerModal";
import { useChatStore } from "@/store/chat-store";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

function IconButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="p-1.5 rounded-lg transition-colors nopan nodrag"
      style={{ color: "var(--text-tertiary)" }}
      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-tertiary)")}
    >
      {children}
    </button>
  );
}

New:
"use client";
import { useRef, useState } from "react";
import LibraryPickerModal from "./LibraryPickerModal";
import { useChatStore } from "@/store/chat-store";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

function IconButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onClick}
            aria-label={title}
            className="p-1.5 rounded-lg transition-colors nopan nodrag text-muted-foreground hover:text-foreground"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent><p>{title}</p></TooltipContent>
    </Tooltip>
  );
}
```

```
Old:
      {error && (
        <span
          className="text-[10px] self-center"
          style={{ color: "var(--ember)" }}
          title={error}
        >
          ⚠
        </span>
      )}

New:
      {error && (
        <span className="text-[10px] self-center text-destructive" title={error}>
          ⚠
        </span>
      )}
```

- [ ] **Step 4: `AgentActivity.tsx`**

```
Old:
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

New:
    <div className="flex items-center gap-2 px-4 py-2 border-t border-border bg-muted">
      <span className="block w-1.5 h-1.5 rounded-full animate-pulse shrink-0 bg-primary" />
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span className="text-[9px] uppercase tracking-[0.22em] shrink-0 font-mono text-muted-foreground">Assistant</span>
        {toolName && <span className="text-[9px] uppercase tracking-[0.18em] shrink-0 font-mono text-muted-foreground">· {toolName}</span>}
        <span className="italic truncate text-[13px] tracking-[-0.01em] text-foreground">{label}…</span>
      </div>
    </div>
```

- [ ] **Step 5: `PendingUiAction.tsx`** — rewrite (converts the local `ActionButton` to the real `Button`, ports the file input to a ref-click pattern matching `AppSidebar.tsx`'s convention rather than nesting it inside a `Button` — this codebase's `Button`/Trigger components use Base UI's `render` prop, not Radix `asChild`, so a `<label>`-wrapped file input in a `Button` isn't a safe pattern to introduce here)

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import LibraryPickerModal from "./LibraryPickerModal";
import { useCanvasStore } from "@/store/canvas-store";
import { Button } from "@/components/ui/button";
import type { UIMessage } from "ai";

export type PendingToolPart = Extract<UIMessage["parts"][number], { type: `tool-${string}` }>;

const SKETCH_SENTINEL_NODE_ID = "__chat_sketch__";

export default function PendingUiAction({
  part,
  onResolve,
}: {
  part: PendingToolPart;
  onResolve: (toolCallId: string, result: unknown) => void;
}) {
  const [showLib, setShowLib] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sketchOpen, setSketchOpen] = useState(false);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const input = part.input as { reason?: string; suggested_kind?: string; initial_image_id?: string } | undefined;
  const toolName = part.type.slice("tool-".length) as "request_user_image" | "request_user_sketch";
  const toolCallId = part.toolCallId;

  const skip = () => onResolve(toolCallId, { skipped: true });

  useEffect(() => {
    if (!sketchOpen) return;
    const unsub = useCanvasStore.subscribe(async (state) => {
      const sentinelNode = state.nodes.find((n) => n.id === SKETCH_SENTINEL_NODE_ID);
      if (!sentinelNode) return;
      const imageBase64 = (sentinelNode.data as Record<string, unknown>).imageBase64 as string | undefined;
      if (!imageBase64) return;
      unsub();
      setSketchOpen(false);
      updateNodeData(SKETCH_SENTINEL_NODE_ID, { imageBase64: undefined });
      try {
        const blob = await fetch(imageBase64).then((r) => r.blob());
        const fd = new FormData();
        fd.append("file", new File([blob], "sketch.png", { type: blob.type || "image/png" }));
        const upRes = await fetch("/api/chat-uploads", { method: "POST", body: fd });
        const upJson = (await upRes.json()) as { source?: string };
        if (upJson.source) onResolve(toolCallId, { generated_id: upJson.source });
        else onResolve(toolCallId, { skipped: true });
      } catch {
        onResolve(toolCallId, { skipped: true });
      }
    });
    return () => unsub();
  }, [sketchOpen, toolCallId, onResolve, updateNodeData]);

  const openSketch = () => {
    window.dispatchEvent(
      new CustomEvent("open-sketch-editor", {
        detail: { nodeId: SKETCH_SENTINEL_NODE_ID, aspectRatio: input?.suggested_kind || "16x9", workflowAssets: [] },
      }),
    );
    setSketchOpen(true);
  };

  if (toolName === "request_user_image") {
    return (
      <div className="mx-3 my-2 rounded-xl p-3 bg-primary/10 border border-border">
        <div className="text-[9px] uppercase tracking-[0.22em] mb-1.5 font-mono text-muted-foreground">
          <span className="text-primary">→</span> Demande
        </div>
        <p className="text-sm italic mb-3 text-[15px] tracking-[-0.01em] leading-snug text-foreground">
          {input?.reason || "L'assistant demande une image."}
        </p>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" disabled={uploading} onClick={() => uploadInputRef.current?.click()}>Uploader</Button>
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            disabled={uploading}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setUploading(true);
              try {
                const fd = new FormData();
                fd.append("file", f);
                const res = await fetch("/api/chat-uploads", { method: "POST", body: fd });
                const j = (await res.json()) as { source?: string; error?: string };
                if (j.source) onResolve(toolCallId, { source_ids: [j.source] });
                else onResolve(toolCallId, { skipped: true });
              } finally {
                setUploading(false);
              }
            }}
          />
          <Button size="sm" variant="outline" onClick={() => setShowLib(true)}>Bibliothèque</Button>
          <Button size="sm" variant="ghost" onClick={skip}>Skip</Button>
        </div>
        {showLib && (
          <LibraryPickerModal
            onClose={() => setShowLib(false)}
            onPick={(source) => { onResolve(toolCallId, { source_ids: [source] }); setShowLib(false); }}
          />
        )}
      </div>
    );
  }

  if (toolName === "request_user_sketch") {
    return (
      <div className="mx-3 my-2 rounded-xl p-3 bg-primary/10 border border-border">
        <div className="text-[9px] uppercase tracking-[0.22em] mb-1.5 font-mono text-muted-foreground">
          <span className="text-primary">→</span> Croquis
        </div>
        <p className="text-sm italic mb-3 text-[15px] leading-snug text-foreground">
          {input?.reason || "L'assistant veut que tu dessines un croquis."}
        </p>
        <div className="flex gap-2">
          <Button size="sm" onClick={openSketch} disabled={sketchOpen}>Dessiner</Button>
          <Button size="sm" variant="ghost" onClick={skip}>Skip</Button>
        </div>
        {sketchOpen && <p className="text-[10px] mt-2 italic text-muted-foreground">Éditeur ouvert — sauvegarde avec Cmd+S.</p>}
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 6: `Message.tsx`**

```
Old:
                if (part.type === "file" && part.mediaType?.startsWith("image/")) {
                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={part.url} alt="image" onClick={() => openAnnotate(part.url)}
                      className="max-w-[240px] rounded my-1" style={{ border: "1px solid var(--line)", cursor: "zoom-in" }} />
                  );
                }

New:
                if (part.type === "file" && part.mediaType?.startsWith("image/")) {
                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={part.url} alt="image" onClick={() => openAnnotate(part.url)}
                      className="max-w-[240px] rounded my-1 border border-border cursor-zoom-in" />
                  );
                }
```

- [ ] **Step 7: `TextMarkdown.tsx`**

```
Old:
export function TextMarkdown({ text, openAnnotate }: { text: string; openAnnotate?: (url: string) => void }) {
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
            <img src={typeof src === "string" ? src : ""} alt={alt ?? ""} onClick={() => typeof src === "string" && openAnnotate?.(src)}
              loading="lazy" style={{ maxWidth: "100%", borderRadius: 8, margin: "8px 0", cursor: openAnnotate ? "zoom-in" : undefined, border: "1px solid var(--line-faint)" }} />
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

New:
export function TextMarkdown({ text, openAnnotate }: { text: string; openAnnotate?: (url: string) => void }) {
  return (
    <div className="text-sm break-words chat-md leading-relaxed text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
              {children}
            </a>
          ),
          code: ({ children, ...props }) => {
            const isInline = !(props as { node?: { position?: { start: { line: number }; end: { line: number } } } }).node?.position
              || (props as { node: { position: { start: { line: number }; end: { line: number } } } }).node.position.start.line
              === (props as { node: { position: { start: { line: number }; end: { line: number } } } }).node.position.end.line;
            return (
              <code className={`bg-muted border border-border/50 text-muted-foreground font-mono ${isInline ? "inline px-1.5 py-0.5 rounded text-xs" : "block px-3 py-2.5 rounded-lg text-[11px] overflow-x-auto"}`}>
                {children}
              </code>
            );
          },
          img: ({ src, alt }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={typeof src === "string" ? src : ""}
              alt={alt ?? ""}
              onClick={() => typeof src === "string" && openAnnotate?.(src)}
              loading="lazy"
              className={`max-w-full rounded-lg my-2 border border-border/50 ${openAnnotate ? "cursor-zoom-in" : ""}`}
            />
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 8: `UsageBadge.tsx`**

```
Old:
    <div
      className="flex items-center gap-1.5 text-[10px] tabular-nums"
      style={{
        color: "var(--text-muted)",
        fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
        letterSpacing: "0.04em",
      }}
      title={`Aujourd'hui : chat ${fmt(usage.today.messages)} + générations ${fmt(usage.today.generations)}\nMois : chat ${fmt(usage.month.messages)} + générations ${fmt(usage.month.generations)}`}
    >
      <span style={{ color: "var(--text-secondary)" }}>{fmt(usage.today.total)}</span>
      <span>/</span>
      <span>{fmt(usage.month.total)}</span>
    </div>

New:
    <div
      className="flex items-center gap-1.5 text-[10px] tabular-nums tracking-[0.04em] font-mono text-muted-foreground"
      title={`Aujourd'hui : chat ${fmt(usage.today.messages)} + générations ${fmt(usage.today.generations)}\nMois : chat ${fmt(usage.month.messages)} + générations ${fmt(usage.month.generations)}`}
    >
      <span className="text-foreground">{fmt(usage.today.total)}</span>
      <span>/</span>
      <span>{fmt(usage.month.total)}</span>
    </div>
```

- [ ] **Step 9: `ConversationList.tsx`** — rewrite the return statement

```
Old (top imports):
"use client";
import { useEffect, useState, useCallback } from "react";
import { useChatStore } from "@/store/chat-store";

New:
"use client";
import { useEffect, useState, useCallback } from "react";
import { useChatStore } from "@/store/chat-store";
import { ChevronDown, Plus, X } from "lucide-react";
```

```
Old (full return statement):
  return (
    <div
      className="px-3 py-2.5 relative"
      style={{ borderBottom: "1px solid var(--line-faint)" }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 text-left transition-colors nopan nodrag"
        style={{ color: "var(--text-secondary)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="text-[9px] uppercase shrink-0"
            style={{
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
              letterSpacing: "0.22em",
            }}
          >
            <span style={{ color: "var(--brand)" }}>{count}</span> Conv.
          </span>
          <span
            className="italic truncate"
            style={{
              color: active ? "var(--text-primary)" : "var(--text-muted)",
              fontFamily: "var(--font-display), 'Fraunces', serif",
              fontSize: 14,
              letterSpacing: "-0.01em",
            }}
          >
            {active?.title ?? "—"}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {loading && (
            <span className="text-[10px] animate-pulse" style={{ color: "var(--text-muted)" }}>
              …
            </span>
          )}
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            style={{
              color: "var(--text-tertiary)",
              transform: open ? "rotate(180deg)" : "rotate(0)",
              transition: "transform 0.18s ease",
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-1 mx-2 rounded-xl overflow-hidden z-30 shadow-2xl"
          style={{
            background: "var(--node-bg)",
            border: "1px solid var(--line-strong)",
          }}
        >
          <button
            onClick={create}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs transition-colors"
            style={{
              color: "var(--text-secondary)",
              borderBottom: "1px solid var(--line-faint)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span style={{ fontFamily: "var(--font-mono), monospace", letterSpacing: "0.18em", textTransform: "uppercase", fontSize: 10 }}>
              Nouvelle
            </span>
          </button>

          <div className="max-h-64 overflow-y-auto py-1">
            {convs.length === 0 && !loading && (
              <p className="text-[11px] italic px-3 py-2" style={{ color: "var(--text-muted)" }}>
                Aucune conversation.
              </p>
            )}

            {convs.map((c) => {
              const isActive = activeConversationId === c.id;
              return (
                <div
                  key={c.id}
                  className="group flex items-center gap-2 px-3 py-2 transition-colors cursor-pointer"
                  onClick={() => {
                    setActive(c.id);
                    setOpen(false);
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = "transparent";
                  }}
                  style={{
                    background: isActive ? "var(--surface)" : "transparent",
                  }}
                >
                  {isActive ? (
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: "var(--brand)" }}
                    />
                  ) : (
                    <span className="w-1.5 h-1.5 shrink-0" />
                  )}
                  <span
                    className="flex-1 truncate text-xs italic"
                    style={{
                      color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                      fontFamily: "var(--font-display), 'Fraunces', serif",
                      fontSize: 13,
                    }}
                    title={c.title}
                  >
                    {c.title}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(c.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                    style={{ color: "var(--ember)" }}
                    aria-label="Supprimer"
                    title="Supprimer"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

New:
  return (
    <div className="px-3 py-2.5 relative border-b border-border">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-2 text-left transition-colors nopan nodrag text-foreground">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[9px] uppercase tracking-[0.22em] shrink-0 font-mono text-muted-foreground">
            <span className="text-primary">{count}</span> Conv.
          </span>
          <span className={`italic truncate text-sm tracking-[-0.01em] ${active ? "text-foreground" : "text-muted-foreground"}`}>
            {active?.title ?? "—"}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {loading && <span className="text-[10px] animate-pulse text-muted-foreground">…</span>}
          <ChevronDown className={`size-2.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 mx-2 rounded-xl overflow-hidden z-30 shadow-2xl bg-card border border-border">
          <button
            onClick={create}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs transition-colors border-b border-border text-muted-foreground hover:bg-muted"
          >
            <Plus className="size-2.5" />
            <span className="font-mono tracking-[0.18em] uppercase text-[10px]">Nouvelle</span>
          </button>

          <div className="max-h-64 overflow-y-auto py-1">
            {convs.length === 0 && !loading && <p className="text-[11px] italic px-3 py-2 text-muted-foreground">Aucune conversation.</p>}

            {convs.map((c) => {
              const isActive = activeConversationId === c.id;
              return (
                <div
                  key={c.id}
                  className={`group flex items-center gap-2 px-3 py-2 transition-colors cursor-pointer ${isActive ? "bg-muted" : "hover:bg-muted/50"}`}
                  onClick={() => { setActive(c.id); setOpen(false); }}
                >
                  {isActive ? <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-primary" /> : <span className="w-1.5 h-1.5 shrink-0" />}
                  <span className={`flex-1 truncate text-xs italic ${isActive ? "text-foreground" : "text-muted-foreground"}`} title={c.title}>
                    {c.title}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); remove(c.id); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-destructive"
                    aria-label="Supprimer"
                    title="Supprimer"
                  >
                    <X className="size-2.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 10: `MessageList.tsx`** (found unconverted via grep — the empty-state block and the scroller's border)

```
Old:
      <Empty className="flex-1 border-none">
        <EmptyHeader>
          <EmptyMedia
            variant="icon"
            style={{
              background: "var(--brand-tint)",
              width: 44,
              height: 44,
              borderRadius: 12,
              border: "1px solid var(--line)",
            }}
          >
            <Sparkles size={18} style={{ color: "var(--brand)" }} strokeWidth={1.75} />
          </EmptyMedia>
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

New:
      <Empty className="flex-1 border-none">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="w-11 h-11 rounded-xl bg-primary/10 border border-border">
            <Sparkles size={18} className="text-primary" strokeWidth={1.75} />
          </EmptyMedia>
          <EmptyTitle className="italic text-[28px] font-normal tracking-[-0.015em] leading-tight text-foreground">
            on commence <br />par quoi ?
          </EmptyTitle>
          <EmptyDescription className="text-[11px] mt-1 tracking-[0.18em] uppercase font-mono text-muted-foreground">
            Texte · Image · Vocal
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
```

```
Old:
      <MessageScroller className="flex-1" style={{ borderTop: "1px solid var(--line-faint)" }}>

New:
      <MessageScroller className="flex-1 border-t border-border">
```

- [ ] **Step 11: `tool-renderers/GeneratedImagePreview.tsx`**

```
Old:
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

New:
    <div className="relative rounded-md overflow-hidden border border-border" style={{ maxWidth: 280 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="généré" loading="lazy" onClick={() => openAnnotate(url)} className="w-full aspect-video object-cover cursor-zoom-in" />
      {sketchId && (
        <button type="button" onClick={applyToCanvas} disabled={applied || applying}
          className="absolute top-1.5 right-1.5 px-2 py-1 rounded text-[9px] uppercase bg-black/85 text-white border border-primary">
          {applied ? "Ajouté ✓" : applying ? "…" : "+ canvas"}
        </button>
      )}
    </div>
```

- [ ] **Step 12: `tool-renderers/SearchYoutubeGallery.tsx`**

```
Old:
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

New:
  if (pairs.length === 0) return <p className="text-xs text-muted-foreground">Aucune miniature.</p>;

  return (
    <div className="grid grid-cols-2 gap-2">
      {pairs.map((p, i) => (
        <button key={i} type="button" onClick={() => openAnnotate(p.url)} className="text-left rounded-md overflow-hidden border border-border bg-muted cursor-zoom-in">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.url} alt={p.caption} loading="lazy" className="w-full aspect-video object-cover" />
          <p className="text-[10px] p-1.5 line-clamp-2 text-muted-foreground">{p.caption}</p>
        </button>
      ))}
    </div>
  );
```

- [ ] **Step 13: `tool-renderers/SimpleToolPart.tsx`** — token conversion + the real `Alert`-for-errors fix

```tsx
"use client";
import type { UIMessage } from "ai";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

type ToolPart = Extract<UIMessage["parts"][number], { type: `tool-${string}` }>;

export default function SimpleToolPart({ part, label }: { part: ToolPart; label: string }) {
  const state = part.state;

  if (state === "output-error") {
    const errorText = "errorText" in part ? (part as { errorText?: string }).errorText : undefined;
    return (
      <Alert variant="destructive" className="my-1">
        <AlertTitle>{label}</AlertTitle>
        {errorText && <AlertDescription>{errorText}</AlertDescription>}
      </Alert>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs py-1 text-muted-foreground">
      {(state === "input-streaming" || state === "input-available") && (
        <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
          <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
        </svg>
      )}
      <span>{label}{state === "output-available" ? "" : "…"}</span>
    </div>
  );
}
```

- [ ] **Step 14: Verify no custom tokens remain anywhere in scope**

```bash
grep -rln "var(--" src/app/layout.tsx src/app/page.tsx src/app/usage/UsageView.tsx src/components/panels/ src/components/panels/chat/ src/components/panels/settings/ 2>/dev/null
```

Expected: empty (no matches) — every file this plan touches is now free of Atelier Nocturne token references. (`src/components/Canvas.tsx`, `src/components/edges/CustomEdge.tsx`, and `src/components/nodes/*.tsx` are expected to still match — they're the canvas exception and keep `var(--canvas-*)`/`var(--text-*)`/etc. by design.)

- [ ] **Step 15: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors — this should be the first fully clean typecheck of the whole plan.

- [ ] **Step 16: Visual + behavioral check**

Dev server, `/`, open the chat panel: confirm the header now renders in b0 tokens (no visual regression, just neutral instead of magenta-tinted). Hover the Composer's send/stop/attach/mic buttons — confirm each shows a tooltip. Send a message, confirm attachments preview/remove still works. Trigger a tool call that errors (e.g. temporarily break an API key and ask the agent to do something that calls a simple tool) — confirm the error now renders as a full `Alert`, not a barely-visible text line. Trigger `request_user_image`/`request_user_sketch` — confirm the upload/library/skip/draw flows all still work. Click a chat image to annotate it, click a markdown link/code block/image — confirm all render correctly. Switch conversations via the `ConversationList` dropdown, confirm create/delete/switch still work. Check the empty-state message list still renders identically.

- [ ] **Step 17: Run the full test suite**

```bash
npx vitest run
```

Expected: identical pass/fail counts to baseline.

- [ ] **Step 18: Commit**

```bash
git add src/components/panels/ChatPanel.tsx src/components/panels/chat/Composer.tsx src/components/panels/chat/AttachButton.tsx src/components/panels/chat/AgentActivity.tsx src/components/panels/chat/PendingUiAction.tsx src/components/panels/chat/Message.tsx src/components/panels/chat/TextMarkdown.tsx src/components/panels/chat/UsageBadge.tsx src/components/panels/chat/ConversationList.tsx src/components/panels/chat/MessageList.tsx src/components/panels/chat/tool-renderers/GeneratedImagePreview.tsx src/components/panels/chat/tool-renderers/SearchYoutubeGallery.tsx src/components/panels/chat/tool-renderers/SimpleToolPart.tsx
git commit -m "$(cat <<'EOF'
feat(chat): finish converting chat components off Atelier Nocturne tokens

Composer/AttachButton's icon buttons get the same Tooltip pattern
already used by MicButton; every remaining chat file (including
MessageList.tsx and ChatPanel.tsx's header, found still unconverted
by grep) moves its inline var(--...) styles to Tailwind b0 classes.
Also a real functional fix found via live debugging: a tool-call
error in SimpleToolPart.tsx now renders as a proper destructive Alert
instead of a barely-visible text line.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: `GeneratorNode.tsx` generation-error display → `Alert` (narrow, deliberate canvas exception)

**One narrow exception to the Global Constraint "canvas/nodes are out of scope for visual change" — found via live debugging, not a general license to touch this file further.** Everything else in `GeneratorNode.tsx` (700+ lines) stays exactly as it is; no other styling, tokens, or logic in this file changes as part of this plan.

**Files:**
- Modify: `src/components/nodes/GeneratorNode.tsx` (one paragraph only)
- Test: none new

**Interfaces:**
- Consumes: `Alert`/`AlertDescription` (already installed).
- Produces: no change to `GeneratorNode`'s props or any other exported shape.

- [ ] **Step 1: Add the import**

```
Old (top of file, alongside the other imports):
import { INPUT_TYPE_COLORS } from "@/lib/model-costs";

New:
import { INPUT_TYPE_COLORS } from "@/lib/model-costs";
import { Alert, AlertDescription } from "@/components/ui/alert";
```

(Adjust to wherever the real existing import block ends — add this one line to it, do not reorder or touch any other import.)

- [ ] **Step 2: Replace the one paragraph**

```
Old:
      {error && <p className="text-xs" style={{ color: "var(--ember)" }}>{error}</p>}

New:
      {error && (
        <Alert variant="destructive" className="py-1.5 px-2.5 gap-x-2 [&>svg]:size-3.5">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}
```

Sized compact (`py-1.5 px-2.5`, smaller icon) to fit inside a node card rather than the full-width `Alert` used in `ChatPanel.tsx`'s chat error — check how it renders against the node's actual width in Step 4 and adjust the padding/icon-size classes if it overflows the card.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Visual check — confirm this is the ONLY change in the file**

```bash
git diff src/components/nodes/GeneratorNode.tsx
```

Expected: exactly the import line and the one paragraph replacement — nothing else. Then dev server, `/`: trigger a generation error (e.g. an invalid model config or a missing API key) on a Generator node — confirm the error now renders as a compact destructive `Alert` that fits inside the node card without breaking its layout, and confirm every other part of every Generator node (handles, model picker, image size/count controls, generate button, mint-green accent color) is pixel-identical to Task 1's canvas reference screenshot.

- [ ] **Step 5: Run the full test suite**

```bash
npx vitest run
```

Expected: identical pass/fail counts to baseline.

- [ ] **Step 6: Commit**

```bash
git add src/components/nodes/GeneratorNode.tsx
git commit -m "$(cat <<'EOF'
fix(generator-node): show generation errors as a compact Alert

Narrow, deliberate exception to the canvas-is-out-of-scope rule for
this plan — found via live debugging. Only this one paragraph changes;
nothing else in the file is touched.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Spec coverage** — walked the spec's "Composant par composant" section top to bottom:
- App shell (`layout.tsx`/`page.tsx`) → Task 3.
- Sidebar → `AppSidebar.tsx` → Task 3 (shell + Modèles/Logos/Inspirations) + Task 3b (Visages correctif, per the coordinator's amendment splitting this out of the original single Task 3).
- `ProjectBar.tsx` → Task 4.
- `ZoomBar.tsx` → Task 5.
- `ContextMenu.tsx` → Task 6.
- Settings (`SettingsPanel.tsx` + `McpSettingsSection.tsx`) → Task 7.
- `WebcamCaptureModal.tsx`/`LibraryPickerModal.tsx`/`ImageAnnotateModal.tsx` → Task 8.
- `SketchEditor.tsx` → Task 9.
- `usage/UsageView.tsx` → Task 10.
- `ChatPanel.tsx` + `panels/chat/*` → Task 11.
- Foundation tokens + b0 swap → Task 1. Missing shadcn installs → Task 2.
- The three live-testing amendments (Visages UX fix, WebcamCaptureModal bugs, sidebar search scope, SimpleToolPart Alert, GeneratorNode Alert) are folded into Tasks 3b, 11, and the new Task 12 respectively — none dropped.

**2. Placeholder scan** — every task's code blocks are complete, real, pasteable code (full-file rewrites for substantially restructured files: `AppSidebar.tsx`, `ProjectBar.tsx`, `ZoomBar.tsx`, `ContextMenu.tsx`, `SettingsPanel.tsx`, `McpSettingsSection.tsx`, `LibraryPickerModal.tsx`, `ImageAnnotateModal.tsx`, `SketchEditor.tsx`, `UsageView.tsx`, `PendingUiAction.tsx`, `SimpleToolPart.tsx`; precise old/new diffs for localized changes elsewhere). No task contains "TBD," "add appropriate styling," or a bare "similar to Task N" reference. The two spots with genuine technical uncertainty (`ContextMenu.tsx`'s positioning mechanism in Task 6, `sidebar.tsx`'s exact export names in Task 2/3) each carry a concrete primary implementation AND a concrete, real fallback/verification step — not a vague "figure it out."

**3. Type/name consistency** — `AppSidebar` (default export, no props) is created in Task 3 and consumed identically by `page.tsx`, `UsageView.tsx` (Task 3), and is the sole target of every subsequent Visages/search edit (Task 3b) and the Settings-dialog-header edit (Task 7) — same file, same export, no drift. `PendingToolPart` (from `PendingUiAction.tsx`) and the `Extract<UIMessage["parts"][number], {type: \`tool-${string}\`}>` shape are used identically in `ChatPanel.tsx`, `Message.tsx`, and `PendingUiAction.tsx` itself. `ContextMenu`'s `{x, y, sections, items, onClose}` signature is unchanged from the original and matches both of `Canvas.tsx`'s call sites (out of scope, unedited). `--canvas-accent`/`--canvas-accent-yellow` (Task 1) are the only names referenced by the canvas/node files for the rest of the plan — every chrome file that transiently used them (Sidebar.tsx, SettingsPanel.tsx, WebcamCaptureModal.tsx, SketchEditor.tsx) has them fully removed by its own dedicated task (3, 7, 8, 9 respectively), confirmed by Task 11's Step 14 grep sweep.
