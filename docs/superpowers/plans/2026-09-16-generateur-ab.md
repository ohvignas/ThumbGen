# Générateur clarifié et Test A/B/C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Générateur node as a clean shadcn node whose inputs are readable rows with aligned handles, and add a Test A/B/C mode where one generator produces up to 3 variants that differ by prompt, sketch or reference image while sharing the Personnage and the Logo.

**Architecture:** All the A/B/C logic is pure and unit-tested in two modules: `src/lib/canvas/generator-variants.ts` (handle names, per-variant input resolution with inheritance from A, edges to drop when variants are removed, generation plan, button summary) and `src/lib/canvas/generator-payload.ts` (request fields, row previews). The canvas store exposes them (`getVariantInputs`, `setGeneratorVariants`), a hook runs the generation, and `GeneratorNode.tsx` only composes rows and settings. The agent side (blueprint schema, `apply_workflow`, canvas summaries, system prompt) learns `abTest` and the `-b` / `-c` handles.

**Tech Stack:** Next.js 16.2 App Router, React 19.2, TypeScript strict, Tailwind v4, shadcn `base-nova` on Base UI (`@base-ui/react` 1.8), `@xyflow/react` 12, Zustand 5, zod 4, better-sqlite3, vitest 4, lucide-react 1.46.

**Spec:** `docs/superpowers/specs/2026-09-16-generateur-ab-design.md` — the binding authority. Read it before starting any task. Deviations are listed under « Code reality vs spec » with the ruling taken.

## Global Constraints

- **Sequencing.** This plan runs **after** the Réglages plan (`docs/superpowers/plans/2026-09-16-reglages-page.md`) and the chantier A plan (canvas step picker, spec `docs/superpowers/specs/2026-09-16-canvas-ajout-etapes-design.md`) are fully executed and merged into `main`. The code quoted here was read on `main` at `60dc293`, before those plans: **every task that edits an existing file starts by re-reading it on the latest `main`** and applies the described change to what is actually there. Anchors are quoted code, never line numbers. New files and new pure functions are given in full.
- **Interfaces delivered earlier, used verbatim (never reimplemented):**
  - Réglages — `src/lib/image-models.ts`: `IMAGE_MODELS`, `IMAGE_MODEL_GROUPS`, `IMAGE_RESOLUTIONS`, `DEFAULT_IMAGE_MODEL`, `imageModelLabel(id)`, `type ImageResolution`; `src/lib/settings-schema.ts`: `ASPECT_RATIOS = ["16x9", "9x16", "1x1"] as const`, `type AspectRatio`; `src/lib/settings.ts`: `setSetting(key, value)`; `src/components/settings/ConfirmDialog.tsx` (default export, props `open`, `onOpenChange`, `title`, `description`, `confirmLabel`, `busy?`, `destructive?`, `onConfirm`); `GeneratorNode` already sends `imageSize: data.imageSize`; `/api/generate/openrouter` reads the key through `getTypedSettings()`.
  - Chantier A — `src/store/canvas-store.ts`: `type NodePickerState`, `nodePicker`, `openNodePicker(state)`, `closeNodePicker()`, `duplicateNode(nodeId)`; `src/lib/canvas/node-catalog.ts`: `type CatalogEntry`, `NODE_CATALOG`, `searchCatalog(query, entries?)`, `compatibleEntries(from: { nodeType: string; handleId: string; handleType: "source" | "target" }): Array<{ entry: CatalogEntry; newNodeHandle: string }>`. Catalog ids: `prompt`, `personnage`, `reference`, `logo`, `croquis`, `generateur`, `texte`, `apercu`; output handles `prompt`, `face`, `image`, `image`, `image`, `result`, `result`, `preview-out`.
- **Commands.** Tests: `./node_modules/.bin/vitest run` (one file: `./node_modules/.bin/vitest run tests/path/file.test.ts`). Type-check: `./node_modules/.bin/tsc --noEmit`. Lint: `./node_modules/.bin/eslint <files>`. `npx` is broken in this shell; `node` is a broken shell function — use `/opt/homebrew/bin/node` if needed. If `tsc` reports errors only inside `.next/types` or `.next/dev/types`, run `rm -rf .next/types .next/dev/types` and re-run it.
- **Tests run against an isolated temp DB** created by `tests/setup.ts` (`THUMBGEN_DB_PATH`). New tests go in **new files** (chantier A and Réglages rewrite `tests/agent/blueprint-schema.test.ts`, `tests/agent/system-prompt.test.ts`, …).
- **Intermediate browser checks** use a dev server on a throwaway DB and port 3100, never the Docker DB: `THUMBGEN_DB_PATH="$(mktemp -d)/thumbgen.db" ./node_modules/.bin/next dev -p 3100`. Never click « Générer » there (it spends money). If a login page appears, stop and ask the user to log in; never type a password.
- **Docker.** The user is actively using `http://localhost:3000`. Exactly **one** rebuild, in Task 12: `docker compose build thumbgen && docker compose up -d thumbgen`, run from `/Users/antoinevigneau/thumbgen-real` (the `./data` bind mount is relative — never from a worktree).
- **shadcn here is `base-nova` on Base UI, not Radix.** Check `src/components/ui/*` before writing JSX. `ToggleGroup` uses arrays: `value={[x]}`, `onValueChange={(v) => { const next = OPTIONS.find((o) => o === v[0]); if (next) setX(next); }}`. `Select`'s `onValueChange` receives `string | null`; pass `items={[{ value, label }]}` so `<SelectValue />` shows labels. `Collapsible` sets `data-panel-open` on its trigger. `DropdownMenuItem` has no `onSelect`. Triggers use `render={<Button … />}`. `Switch` uses `checked` / `onCheckedChange(checked)`.
- **`cn` is imported from the npm package `"cn"`** (`import { cn } from "cn"`).
- **React Flow.** An edge only renders while its handle's DOM exists: every handle of every active variant stays mounted. Handles are placed **inside their row** (the row is `relative -mx-3 px-3`, cancelling `NodeShell`'s `px-3`, so React Flow's default `left: 0` / `right: 0` puts the handle on the node edge, vertically centred on the row). Edges with `sourceHandle: null` attach to the first source handle in DOM order, so `result` stays the first source handle.
- **UI rules.** Only shadcn components and Tailwind classes in new or rewritten code (no `style={{…}}`). UI copy is French; JSX text apostrophes as `&apos;`.
- **Spec values (verbatim):** node data `abTest?: { variants: ("A" | "B" | "C")[] }` (absent or `variants.length < 2` = normal mode; switching on creates `["A", "B"]`); `generatedImagesByVariant?: { A?: string[]; B?: string[]; C?: string[] }`, `generatedImages` still fed with A's images. Common handles `face-in`, `logo-in`. Per-variant handles: Prompt `prompt-in` / `prompt-in-b` / `prompt-in-c`; Croquis `sketch-in` / `sketch-in-b` / `sketch-in-c`; Image de référence `ref-in` / `ref-in-b` / `ref-in-c`. Outputs `result` / `result-b` / `result-c`. Row badge « hérité de A ». Sections « Commun », « Variante A », « Variante B », « Variante C »; « + Variante C » under the last section when only A and B; « Retirer » on C. Button summaries « 1 image », « 3 images », « 2 modèles × 2 images », « 2 variantes × 2 images · 4 images ». Preview titles « Variante A » / « Variante B » / « Variante C ». Node width ~340 px. YouTube Studio tests up to 3 thumbnails.
- **Commit only the files a task lists** — never `git add -A` / `git add .`.

## Code reality vs spec (rulings)

1. **The image route drops logos and sketches.** Since the OpenRouter migration, `/api/generate/openrouter` only forwards `faceImages` and `referenceImages`; the `logos` and `sketchImages` the node sends are silently ignored, so a per-variant Croquis would change nothing. Ruling: Task 4 forwards them as `input_references` (faces, logos, references, one sketch) with positional prompt hints, the way the deleted nano-banana route did.
2. **`getConnectedInputs` has another caller.** `TextOverlayNode` reads its type-based shape. Ruling: it stays as is; the store gains `getVariantInputs(nodeId, variant)` built on `resolveVariantInputs` (the spec's « étendu (ou complété) »).
3. **Role by handle, not by node type.** Today a generator classifies inputs mostly by source node type. Ruling: the handle decides (needed for per-variant handles); an edge whose `targetHandle` is null or not a generator handle falls back to the old type-based role, as variant A, so existing generators read the same inputs.
4. **`planGeneration(nodeData, connectedInputs)`.** « Comparer des modèles » is local UI state, not node data. Ruling: the first argument is `{ model, numImages, abTest, compareModels }`; the second maps each active variant to its resolved inputs.
5. **« crée ou met à jour son nœud Aperçu ».** Read as today's flow: each image gets a new Aperçu created in « loading » state, then updated with its result. Older Aperçu nodes are never reused (that would overwrite earlier results).
6. **`generatedImages` on the generator was never written**; the node only displayed it if present. Ruling: a run now writes A's images there and `generatedImagesByVariant` for every variant that produced images (merged with the previous values); the in-node image block disappears (not in the spec's structure).
7. **No cancellation exists** → the button is disabled with a spinner while generating (no « Arrêter »).
8. **The title is not renamable today** (no `onRename`). The spec says renamable: `onRename` writes `data.label`, title `data.label || "Générateur"`. `NodeShell` gains an optional `headerExtra` slot for the model `Badge`.
9. **Theme.** Réglages adds a light theme while nodes stay dark; shadcn components inside a node would turn light. Ruling: `NodeShell`'s root gets the `dark` class (it only redefines shadcn tokens).
10. **Face-cap warning.** It is gated on `provider === "gemini"`, never true since every model is served by OpenRouter. Ruling: shown whenever `REFERENCE_CAPS[model]?.characters === 0` and a Personnage is connected.
11. **Older counts.** The old UI allowed 5 images per model; such nodes keep their value (no toggle pressed, summary still right), not clamped.
12. **`summarizeNode` / `snapshotCanvas` are private** in `ChatPanel.tsx`. Ruling: moved to `src/components/panels/chat/canvas-snapshot.ts` so they can be tested. `get_canvas_state` also reports `count ?? numImages` (canvas nodes store `numImages`).
13. **Other exact matches on `prompt-in`.** `PromptNode`'s « Améliorer » context only follows edges into `prompt-in`. Ruling: it accepts every variant's prompt handle.
14. **Plural.** The spec's « N branchement(s) » is rendered with a real plural (« 1 branchement », « 2 branchements »).
15. **Removing C or turning the test off without any edge on the removed handles** applies immediately; the confirmation only appears when edges would be removed, as the spec states.

## File Structure

**Create**
- `src/lib/canvas/generator-variants.ts` — variant ids, handle names/parsing, `activeVariants`, `resolveVariantInputs`, `edgesToRemoveForVariants`, `variantRemovalCopy`, `planGeneration`, `generationSummary`.
- `src/lib/canvas/generator-payload.ts` — `nodeImageSource`, `faceImageSources`, `inputPreview`, `buildGenerationPayload`.
- `src/components/nodes/generator/GeneratorInputRow.tsx` — one input row with its handle.
- `src/components/nodes/generator/useGeneratorRun.ts` — runs a generation (previews, requests, results).
- `src/components/panels/chat/canvas-snapshot.ts` — `snapshotCanvas`, `summarizeNode` moved out of `ChatPanel.tsx`.
- Tests: `tests/canvas/generator-variants.test.ts`, `tests/canvas/generator-plan.test.ts`, `tests/canvas/generator-payload.test.ts`, `tests/canvas/canvas-store-variants.test.ts`, `tests/canvas/node-catalog-variants.test.ts`, `tests/generation/openrouter-inputs.test.ts`, `tests/agent/blueprint-ab-test.test.ts`, `tests/agent/apply-workflow-ab-test.test.ts`, `tests/agent/generator-summaries.test.ts`, `tests/agent/system-prompt-ab-test.test.ts`.

**Modify**
- `src/app/api/generate/openrouter/route.ts`, `src/store/canvas-store.ts`, `src/lib/canvas/node-catalog.ts` (and the picker's handle label if it has one), `src/components/nodes/PromptNode.tsx`, `src/components/nodes/NodeShell.tsx`, `src/components/nodes/GeneratorNode.tsx` (rewrite), `src/lib/agent/blueprint/schema.ts`, `src/lib/agent/tools/apply-workflow.ts`, `src/lib/agent/tools/get-canvas-state.ts`, `src/components/panels/ChatPanel.tsx`, `src/lib/agent/system-prompt.ts`.

---

## Task 1: Variant handles, input resolution and edges to drop

**Files:**
- Create: `src/lib/canvas/generator-variants.ts`
- Test: `tests/canvas/generator-variants.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces (`src/lib/canvas/generator-variants.ts`):
  - `VARIANT_IDS = ["A", "B", "C"] as const`, `type VariantId`, `type AbTest = { variants: VariantId[] }`
  - `COMMON_SLOTS = ["face", "logo"] as const`, `PER_VARIANT_SLOTS = ["prompt", "sketch", "ref"] as const`, `type CommonSlot`, `type PerVariantSlot`, `type InputSlot`
  - `inputHandle(slot: InputSlot, variant?: VariantId): string`, `resultHandle(variant: VariantId): string`
  - `type ParsedGeneratorHandle = { kind: "input"; slot: InputSlot; variant: VariantId } | { kind: "output"; variant: VariantId }`, `parseGeneratorHandle(handleId: string | null | undefined): ParsedGeneratorHandle | null`, `baseGeneratorHandle(handleId: string): string`, `isPromptInputHandle(handleId: string | null | undefined): boolean`
  - `normalizeVariants(variants: readonly string[]): VariantId[]`, `activeVariants(abTest: unknown): VariantId[]`, `isAbTestActive(abTest: unknown): boolean`, `summarizeAbTest(abTest: unknown): AbTest | undefined`
  - `type EdgeLike`, `type NodeLike`, `type SlotInputs<N> = { nodes: N[]; inherited: boolean }`, `type ResolvedVariantInputs<N> = { variant; face: N[]; logo: N[]; prompt: SlotInputs<N>; sketch: SlotInputs<N>; ref: SlotInputs<N> }`
  - `resolveVariantInputs<N extends NodeLike>(edges, nodes: readonly N[], generatorId: string, variant: VariantId): ResolvedVariantInputs<N>`
  - `edgesToRemoveForVariants<E extends EdgeLike>(edges: readonly E[], generatorId: string, keptVariants: readonly VariantId[]): E[]`
  - `type VariantRemovalCopy = { title; description; confirmLabel }`, `variantRemovalCopy(current, next, edgeCount): VariantRemovalCopy`

- [ ] **Step 1: Check that the two earlier plans are merged**

```bash
git log --oneline -1
grep -n "export const IMAGE_MODELS\|export const IMAGE_MODEL_GROUPS\|export const IMAGE_RESOLUTIONS\|export const DEFAULT_IMAGE_MODEL\|export function imageModelLabel" src/lib/image-models.ts
grep -n "export const ASPECT_RATIOS\|export type AspectRatio" src/lib/settings-schema.ts
grep -n "export function setSetting\|export function getTypedSettings" src/lib/settings.ts
test -f src/components/settings/ConfirmDialog.tsx && echo "ConfirmDialog present"
grep -n "openNodePicker\|export type NodePickerState" src/store/canvas-store.ts
grep -n "export function compatibleEntries\|export const NODE_CATALOG" src/lib/canvas/node-catalog.ts
grep -n "imageSize: data.imageSize" src/components/nodes/GeneratorNode.tsx
```

Expected: every grep prints at least one line and « ConfirmDialog present » is printed. If anything is missing, stop and report: this plan needs Réglages and chantier A merged first.

- [ ] **Step 2: Write the failing tests**

Create `tests/canvas/generator-variants.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  activeVariants,
  baseGeneratorHandle,
  edgesToRemoveForVariants,
  inputHandle,
  isAbTestActive,
  isPromptInputHandle,
  normalizeVariants,
  parseGeneratorHandle,
  resolveVariantInputs,
  resultHandle,
  summarizeAbTest,
  variantRemovalCopy,
} from "@/lib/canvas/generator-variants";

type TestNode = { id: string; type: string; data: Record<string, unknown> };

const node = (id: string, type: string, data: Record<string, unknown> = {}): TestNode => ({ id, type, data });
const edge = (source: string, targetHandle: string | null, target = "gen") => ({ source, target, targetHandle });
const ids = (items: { id: string }[]) => items.map((item) => item.id);

describe("generator handles", () => {
  it("keeps today's ids for A, suffixes B and C, never suffixes common inputs", () => {
    expect(inputHandle("prompt")).toBe("prompt-in");
    expect(inputHandle("prompt", "B")).toBe("prompt-in-b");
    expect(inputHandle("sketch", "C")).toBe("sketch-in-c");
    expect(inputHandle("ref", "B")).toBe("ref-in-b");
    expect(inputHandle("face", "C")).toBe("face-in");
    expect(inputHandle("logo", "B")).toBe("logo-in");
    expect(resultHandle("A")).toBe("result");
    expect(resultHandle("B")).toBe("result-b");
    expect(resultHandle("C")).toBe("result-c");
  });

  it("parses generator handles and nothing else", () => {
    expect(parseGeneratorHandle("ref-in-c")).toEqual({ kind: "input", slot: "ref", variant: "C" });
    expect(parseGeneratorHandle("face-in")).toEqual({ kind: "input", slot: "face", variant: "A" });
    expect(parseGeneratorHandle("result-b")).toEqual({ kind: "output", variant: "B" });
    expect(parseGeneratorHandle("face-in-b")).toBeNull();
    expect(parseGeneratorHandle("preview-in")).toBeNull();
    expect(parseGeneratorHandle("")).toBeNull();
    expect(parseGeneratorHandle(null)).toBeNull();
    expect(parseGeneratorHandle(undefined)).toBeNull();
  });

  it("maps variant handles to their A counterpart", () => {
    expect(baseGeneratorHandle("prompt-in-b")).toBe("prompt-in");
    expect(baseGeneratorHandle("sketch-in-c")).toBe("sketch-in");
    expect(baseGeneratorHandle("ref-in-b")).toBe("ref-in");
    expect(baseGeneratorHandle("result-c")).toBe("result");
    expect(baseGeneratorHandle("logo-in")).toBe("logo-in");
    expect(baseGeneratorHandle("image")).toBe("image");
  });

  it("recognises the prompt input of every variant", () => {
    expect(isPromptInputHandle("prompt-in")).toBe(true);
    expect(isPromptInputHandle("prompt-in-c")).toBe(true);
    expect(isPromptInputHandle("ref-in-b")).toBe(false);
    expect(isPromptInputHandle(null)).toBe(false);
  });
});

describe("active variants", () => {
  it("orders variants, always keeps A and needs B before C", () => {
    expect(normalizeVariants(["C", "B", "A"])).toEqual(["A", "B", "C"]);
    expect(normalizeVariants(["B"])).toEqual(["A", "B"]);
    expect(normalizeVariants(["A", "C"])).toEqual(["A"]);
    expect(normalizeVariants(["Z"])).toEqual(["A"]);
  });

  it("treats a missing, malformed or single-variant abTest as normal mode", () => {
    expect(activeVariants(undefined)).toEqual(["A"]);
    expect(activeVariants({ variants: ["A"] })).toEqual(["A"]);
    expect(activeVariants({ variants: "AB" })).toEqual(["A"]);
    expect(activeVariants({ variants: ["A", "B"] })).toEqual(["A", "B"]);
    expect(activeVariants({ variants: ["A", "B", "C"] })).toEqual(["A", "B", "C"]);
    expect(isAbTestActive({ variants: ["A"] })).toBe(false);
    expect(isAbTestActive({ variants: ["A", "B"] })).toBe(true);
  });

  it("summarizes only an active test", () => {
    expect(summarizeAbTest({ variants: ["A", "B", "C"] })).toEqual({ variants: ["A", "B", "C"] });
    expect(summarizeAbTest({ variants: ["A"] })).toBeUndefined();
    expect(summarizeAbTest(undefined)).toBeUndefined();
  });
});

describe("resolveVariantInputs", () => {
  const nodes = [
    node("face", "faceReference"),
    node("logo", "swipeFile", { kind: "logo" }),
    node("pA", "prompt"),
    node("pB", "prompt"),
    node("skA", "sketch"),
    node("refA", "swipeFile"),
    node("refC", "swipeFile"),
    node("other", "prompt"),
  ];
  const edges = [
    edge("face", "face-in"),
    edge("logo", "logo-in"),
    edge("pA", "prompt-in"),
    edge("pB", "prompt-in-b"),
    edge("skA", "sketch-in"),
    edge("refA", "ref-in"),
    edge("refC", "ref-in-c"),
    edge("other", "prompt-in", "another-generator"),
  ];

  it("shares the Personnage and the Logo with every variant", () => {
    for (const variant of ["A", "B", "C"] as const) {
      const inputs = resolveVariantInputs(edges, nodes, "gen", variant);
      expect(ids(inputs.face)).toEqual(["face"]);
      expect(ids(inputs.logo)).toEqual(["logo"]);
    }
  });

  it("gives A its own inputs, never inherited", () => {
    const a = resolveVariantInputs(edges, nodes, "gen", "A");
    expect(a.prompt).toEqual({ nodes: [nodes[2]], inherited: false });
    expect(a.sketch).toEqual({ nodes: [nodes[4]], inherited: false });
    expect(a.ref).toEqual({ nodes: [nodes[5]], inherited: false });
  });

  it("lets B's own input win and inherits A's input for B's unconnected handles", () => {
    const b = resolveVariantInputs(edges, nodes, "gen", "B");
    expect(b.prompt).toEqual({ nodes: [nodes[3]], inherited: false });
    expect(b.sketch).toEqual({ nodes: [nodes[4]], inherited: true });
    expect(b.ref).toEqual({ nodes: [nodes[5]], inherited: true });
  });

  it("uses C's own reference and inherits A's prompt", () => {
    const c = resolveVariantInputs(edges, nodes, "gen", "C");
    expect(c.ref).toEqual({ nodes: [nodes[6]], inherited: false });
    expect(c.prompt).toEqual({ nodes: [nodes[2]], inherited: true });
  });

  it("leaves a C input empty, not inherited, when A has nothing on that handle", () => {
    const c = resolveVariantInputs([edge("refC", "ref-in-c")], nodes, "gen", "C");
    expect(c.prompt).toEqual({ nodes: [], inherited: false });
    expect(c.sketch).toEqual({ nodes: [], inherited: false });
    expect(ids(c.ref.nodes)).toEqual(["refC"]);
  });

  it("ignores edges into other nodes and edges from deleted nodes", () => {
    const a = resolveVariantInputs([...edges, edge("ghost", "prompt-in")], nodes, "gen", "A");
    expect(ids(a.prompt.nodes)).toEqual(["pA"]);
  });

  it("classifies edges without a known handle by source type, as variant A", () => {
    const legacy = [edge("pA", null), edge("face", null), edge("skA", "image-in"), edge("logo", null), edge("refA", "")];
    const a = resolveVariantInputs(legacy, nodes, "gen", "A");
    expect(ids(a.prompt.nodes)).toEqual(["pA"]);
    expect(ids(a.face)).toEqual(["face"]);
    expect(ids(a.sketch.nodes)).toEqual(["skA"]);
    expect(ids(a.logo)).toEqual(["logo"]);
    expect(ids(a.ref.nodes)).toEqual(["refA"]);
  });

  it("keeps canvas order and lists a node connected twice once", () => {
    const a = resolveVariantInputs(
      [edge("pB", "prompt-in"), edge("pA", "prompt-in"), edge("pA", "prompt-in")],
      nodes,
      "gen",
      "A",
    );
    expect(ids(a.prompt.nodes)).toEqual(["pA", "pB"]);
  });
});

describe("edgesToRemoveForVariants", () => {
  const edges = [
    { id: "1", source: "pA", target: "gen", targetHandle: "prompt-in" },
    { id: "2", source: "pB", target: "gen", targetHandle: "prompt-in-b" },
    { id: "3", source: "skC", target: "gen", targetHandle: "sketch-in-c" },
    { id: "4", source: "face", target: "gen", targetHandle: "face-in" },
    { id: "5", source: "gen", sourceHandle: "result", target: "prevA", targetHandle: "preview-in" },
    { id: "6", source: "gen", sourceHandle: "result-b", target: "prevB", targetHandle: "preview-in" },
    { id: "7", source: "gen", sourceHandle: "result-c", target: "prevC", targetHandle: "preview-in" },
    { id: "8", source: "other-gen", sourceHandle: "result-b", target: "prevX", targetHandle: "preview-in" },
    { id: "9", source: "pX", target: "other-gen", targetHandle: "prompt-in-b" },
  ];

  it("removing C drops only C's inputs and output", () => {
    expect(ids(edgesToRemoveForVariants(edges, "gen", ["A", "B"]))).toEqual(["3", "7"]);
  });

  it("disabling the test drops every B and C edge of this generator only", () => {
    expect(ids(edgesToRemoveForVariants(edges, "gen", ["A"]))).toEqual(["2", "3", "6", "7"]);
  });

  it("drops nothing while every variant stays", () => {
    expect(edgesToRemoveForVariants(edges, "gen", ["A", "B", "C"])).toEqual([]);
  });
});

describe("variantRemovalCopy", () => {
  it("words disabling the test", () => {
    expect(variantRemovalCopy(["A", "B", "C"], ["A"], 3)).toEqual({
      title: "Désactiver le test A/B ?",
      description: "Désactiver le test A/B retire 3 branchements des variantes B et C.",
      confirmLabel: "Désactiver",
    });
    expect(variantRemovalCopy(["A", "B"], ["A"], 1).description).toBe(
      "Désactiver le test A/B retire 1 branchement de la variante B.",
    );
  });

  it("words removing C", () => {
    expect(variantRemovalCopy(["A", "B", "C"], ["A", "B"], 2)).toEqual({
      title: "Retirer la variante C ?",
      description: "Retirer la variante C retire 2 branchements de la variante C.",
      confirmLabel: "Retirer",
    });
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `./node_modules/.bin/vitest run tests/canvas/generator-variants.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/canvas/generator-variants"`.

- [ ] **Step 4: Create the module**

Create `src/lib/canvas/generator-variants.ts`:

```ts
/**
 * Pure logic of the Générateur's A/B/C test mode
 * (docs/superpowers/specs/2026-09-16-generateur-ab-design.md): handle names,
 * per-variant input resolution with inheritance from variant A, the edges to
 * drop when variants are removed, and the generation plan. No React, no store.
 */

export const VARIANT_IDS = ["A", "B", "C"] as const;
export type VariantId = (typeof VARIANT_IDS)[number];

/** Stored on generator node data. Absent or fewer than 2 variants = normal mode. */
export type AbTest = { variants: VariantId[] };

/** Inputs wired once and used by every variant. */
export const COMMON_SLOTS = ["face", "logo"] as const;
export type CommonSlot = (typeof COMMON_SLOTS)[number];

/** Inputs each variant can override; B and C inherit A's when left unconnected. */
export const PER_VARIANT_SLOTS = ["prompt", "sketch", "ref"] as const;
export type PerVariantSlot = (typeof PER_VARIANT_SLOTS)[number];

export type InputSlot = CommonSlot | PerVariantSlot;

const SUFFIX: Record<VariantId, string> = { A: "", B: "-b", C: "-c" };

function isCommonSlot(slot: InputSlot): slot is CommonSlot {
  return (COMMON_SLOTS as readonly string[]).includes(slot);
}

/** Target handle id: A keeps today's ids (`prompt-in`), B/C are suffixed (`prompt-in-b`). */
export function inputHandle(slot: InputSlot, variant: VariantId = "A"): string {
  return isCommonSlot(slot) ? `${slot}-in` : `${slot}-in${SUFFIX[variant]}`;
}

/** Source handle id of a variant's output: `result`, `result-b`, `result-c`. */
export function resultHandle(variant: VariantId): string {
  return `result${SUFFIX[variant]}`;
}

export type ParsedGeneratorHandle =
  | { kind: "input"; slot: InputSlot; variant: VariantId }
  | { kind: "output"; variant: VariantId };

const HANDLES = new Map<string, ParsedGeneratorHandle>();
for (const slot of COMMON_SLOTS) HANDLES.set(inputHandle(slot), { kind: "input", slot, variant: "A" });
for (const variant of VARIANT_IDS) {
  for (const slot of PER_VARIANT_SLOTS) HANDLES.set(inputHandle(slot, variant), { kind: "input", slot, variant });
  HANDLES.set(resultHandle(variant), { kind: "output", variant });
}

export function parseGeneratorHandle(handleId: string | null | undefined): ParsedGeneratorHandle | null {
  return (handleId && HANDLES.get(handleId)) || null;
}

/** `prompt-in-b` → `prompt-in`, `result-c` → `result`; any other id is returned unchanged. */
export function baseGeneratorHandle(handleId: string): string {
  const parsed = parseGeneratorHandle(handleId);
  if (!parsed) return handleId;
  return parsed.kind === "output" ? resultHandle("A") : inputHandle(parsed.slot);
}

export function isPromptInputHandle(handleId: string | null | undefined): boolean {
  const parsed = parseGeneratorHandle(handleId);
  return parsed?.kind === "input" && parsed.slot === "prompt";
}

/** Ordered A, B, C; A always present; C only alongside B. */
export function normalizeVariants(variants: readonly string[]): VariantId[] {
  const wanted = new Set(variants);
  return VARIANT_IDS.filter((v) => v === "A" || (wanted.has(v) && (v !== "C" || wanted.has("B"))));
}

/** Variants to render and generate: `["A"]` in normal mode. Accepts any stored value. */
export function activeVariants(abTest: unknown): VariantId[] {
  if (typeof abTest !== "object" || abTest === null) return ["A"];
  const raw = (abTest as { variants?: unknown }).variants;
  if (!Array.isArray(raw)) return ["A"];
  const variants = normalizeVariants(raw.filter((v): v is string => typeof v === "string"));
  return variants.length >= 2 ? variants : ["A"];
}

export function isAbTestActive(abTest: unknown): boolean {
  return activeVariants(abTest).length >= 2;
}

/** What node summaries (agent) expose: the active variants, or nothing in normal mode. */
export function summarizeAbTest(abTest: unknown): AbTest | undefined {
  return isAbTestActive(abTest) ? { variants: activeVariants(abTest) } : undefined;
}

export type EdgeLike = {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export type NodeLike = { id: string; type?: string; data?: unknown };

export type SlotInputs<N> = { nodes: N[]; inherited: boolean };

export type ResolvedVariantInputs<N> = {
  variant: VariantId;
  face: N[];
  logo: N[];
  prompt: SlotInputs<N>;
  sketch: SlotInputs<N>;
  ref: SlotInputs<N>;
};

// Edges without a known generator handle (null, "", or a legacy id) are
// classified by their source node's type, as variant A — the way the
// generator read its inputs before handles decided the role.
function legacySlot(node: NodeLike): InputSlot {
  switch (node.type) {
    case "prompt":
      return "prompt";
    case "faceReference":
      return "face";
    case "sketch":
      return "sketch";
    default: {
      const kind = typeof node.data === "object" && node.data !== null ? (node.data as { kind?: unknown }).kind : undefined;
      return kind === "logo" ? "logo" : "ref";
    }
  }
}

/**
 * Inputs of one variant of a generator: common inputs, plus per-variant
 * inputs where B/C fall back to A's input on the same handle when their own
 * handle is unconnected (`inherited: true`). Nodes keep canvas order.
 */
export function resolveVariantInputs<N extends NodeLike>(
  edges: readonly EdgeLike[],
  nodes: readonly N[],
  generatorId: string,
  variant: VariantId,
): ResolvedVariantInputs<N> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const sourcesByHandle = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (edge.target !== generatorId) continue;
    const parsed = parseGeneratorHandle(edge.targetHandle);
    let handle: string;
    if (parsed?.kind === "input") {
      handle = inputHandle(parsed.slot, parsed.variant);
    } else {
      const source = byId.get(edge.source);
      if (!source) continue;
      handle = inputHandle(legacySlot(source));
    }
    const sources = sourcesByHandle.get(handle) ?? new Set<string>();
    sources.add(edge.source);
    sourcesByHandle.set(handle, sources);
  }

  const nodesOn = (handle: string): N[] => {
    const sources = sourcesByHandle.get(handle);
    return sources ? nodes.filter((n) => sources.has(n.id)) : [];
  };

  const perVariant = (slot: PerVariantSlot): SlotInputs<N> => {
    const own = nodesOn(inputHandle(slot, variant));
    if (own.length > 0 || variant === "A") return { nodes: own, inherited: false };
    const fromA = nodesOn(inputHandle(slot, "A"));
    return { nodes: fromA, inherited: fromA.length > 0 };
  };

  return {
    variant,
    face: nodesOn(inputHandle("face")),
    logo: nodesOn(inputHandle("logo")),
    prompt: perVariant("prompt"),
    sketch: perVariant("sketch"),
    ref: perVariant("ref"),
  };
}

/** Edges of this generator on handles of variants that are not kept (A is always kept). */
export function edgesToRemoveForVariants<E extends EdgeLike>(
  edges: readonly E[],
  generatorId: string,
  keptVariants: readonly VariantId[],
): E[] {
  const kept = new Set<VariantId>(["A", ...keptVariants]);
  return edges.filter((edge) => {
    if (edge.target === generatorId) {
      const parsed = parseGeneratorHandle(edge.targetHandle);
      if (parsed?.kind === "input" && !kept.has(parsed.variant)) return true;
    }
    if (edge.source === generatorId) {
      const parsed = parseGeneratorHandle(edge.sourceHandle);
      if (parsed?.kind === "output" && !kept.has(parsed.variant)) return true;
    }
    return false;
  });
}

export type VariantRemovalCopy = { title: string; description: string; confirmLabel: string };

/** Confirmation dialog copy when going from `current` to `next` variants removes `edgeCount` edges. */
export function variantRemovalCopy(
  current: readonly VariantId[],
  next: readonly VariantId[],
  edgeCount: number,
): VariantRemovalCopy {
  const removed = current.filter((v) => !next.includes(v));
  const links = `${edgeCount} branchement${edgeCount > 1 ? "s" : ""}`;
  const owners = removed.length > 1 ? `des variantes ${removed.join(" et ")}` : `de la variante ${removed[0]}`;
  if (next.length < 2) {
    return {
      title: "Désactiver le test A/B ?",
      description: `Désactiver le test A/B retire ${links} ${owners}.`,
      confirmLabel: "Désactiver",
    };
  }
  const target = removed.length > 1 ? `les variantes ${removed.join(" et ")}` : `la variante ${removed[0]}`;
  return {
    title: `Retirer ${target} ?`,
    description: `Retirer ${target} retire ${links} ${owners}.`,
    confirmLabel: "Retirer",
  };
}
```

- [ ] **Step 5: Run the tests**

Run: `./node_modules/.bin/vitest run tests/canvas/generator-variants.test.ts`
Expected: PASS (20 tests).

- [ ] **Step 6: Type-check**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/canvas/generator-variants.ts tests/canvas/generator-variants.test.ts
git commit -m "feat(generator): variant handles, input resolution and edge removal for the A/B/C test"
```

---

## Task 2: Generation plan and button summary

**Files:**
- Modify: `src/lib/canvas/generator-variants.ts` (append)
- Test: `tests/canvas/generator-plan.test.ts`

**Interfaces:**
- Consumes: `activeVariants`, `VariantId` (Task 1).
- Produces (same module):
  - `type GenerationTask<I> = { variant: VariantId; model: string; count: number; inputs: I }`
  - `type GenerationSettings = { model: string; numImages?: number; abTest?: unknown; compareModels?: readonly string[] }`
  - `imageCount(numImages: number | undefined): number`
  - `planGeneration<I>(settings: GenerationSettings, inputsByVariant: Partial<Record<VariantId, I>>): GenerationTask<I>[]` — throws when an active variant has no inputs
  - `generationSummary(tasks: readonly { count: number }[], abTestActive: boolean): string`

- [ ] **Step 1: Write the failing tests**

Create `tests/canvas/generator-plan.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generationSummary, imageCount, planGeneration } from "@/lib/canvas/generator-variants";

describe("planGeneration", () => {
  const inputs = { A: "inputs-A", B: "inputs-B", C: "inputs-C" };

  it("normal mode: one task for the main model", () => {
    expect(planGeneration({ model: "m1", numImages: 3 }, inputs)).toEqual([
      { variant: "A", model: "m1", count: 3, inputs: "inputs-A" },
    ]);
  });

  it("normal mode: one task per compared model, main model first, duplicates dropped", () => {
    expect(planGeneration({ model: "m1", numImages: 2, compareModels: ["m2", "m1", "m3"] }, inputs)).toEqual([
      { variant: "A", model: "m1", count: 2, inputs: "inputs-A" },
      { variant: "A", model: "m2", count: 2, inputs: "inputs-A" },
      { variant: "A", model: "m3", count: 2, inputs: "inputs-A" },
    ]);
  });

  it("A/B mode: one task per variant with the main model, compared models ignored", () => {
    expect(
      planGeneration({ model: "m1", numImages: 2, abTest: { variants: ["A", "B"] }, compareModels: ["m2"] }, inputs),
    ).toEqual([
      { variant: "A", model: "m1", count: 2, inputs: "inputs-A" },
      { variant: "B", model: "m1", count: 2, inputs: "inputs-B" },
    ]);
  });

  it("A/B/C mode: three tasks, count per variant", () => {
    const tasks = planGeneration({ model: "m1", numImages: 1, abTest: { variants: ["A", "B", "C"] } }, inputs);
    expect(tasks.map((task) => [task.variant, task.count, task.inputs])).toEqual([
      ["A", 1, "inputs-A"],
      ["B", 1, "inputs-B"],
      ["C", 1, "inputs-C"],
    ]);
  });

  it("an abTest with a single variant is normal mode", () => {
    expect(planGeneration({ model: "m1", abTest: { variants: ["A"] }, compareModels: ["m2"] }, inputs)).toHaveLength(2);
  });

  it("counts at least one image per task", () => {
    expect(imageCount(undefined)).toBe(1);
    expect(imageCount(0)).toBe(1);
    expect(imageCount(Number.NaN)).toBe(1);
    expect(imageCount(2.7)).toBe(2);
    expect(imageCount(5)).toBe(5);
  });

  it("throws when an active variant has no inputs", () => {
    expect(() => planGeneration({ model: "m1", abTest: { variants: ["A", "B"] } }, { A: "inputs-A" })).toThrow(
      /variant B/,
    );
  });
});

describe("generationSummary", () => {
  it.each([
    ["1 image", [1], false],
    ["3 images", [3], false],
    ["2 modèles × 2 images", [2, 2], false],
    ["3 modèles × 1 image", [1, 1, 1], false],
    ["2 variantes × 2 images · 4 images", [2, 2], true],
    ["3 variantes × 1 image · 3 images", [1, 1, 1], true],
  ] as const)("« %s »", (expected, counts, abTestActive) => {
    expect(generationSummary(counts.map((count) => ({ count })), abTestActive)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `./node_modules/.bin/vitest run tests/canvas/generator-plan.test.ts`
Expected: FAIL — `planGeneration` / `generationSummary` / `imageCount` are not exported (`is not a function`).

- [ ] **Step 3: Append the plan functions**

Append to the end of `src/lib/canvas/generator-variants.ts` (after `variantRemovalCopy`):

```ts
export type GenerationTask<I> = { variant: VariantId; model: string; count: number; inputs: I };

export type GenerationSettings = {
  model: string;
  numImages?: number;
  abTest?: unknown;
  /** « Avancé › Comparer des modèles » — ignored in A/B mode. */
  compareModels?: readonly string[];
};

export function imageCount(numImages: number | undefined): number {
  return typeof numImages === "number" && Number.isFinite(numImages) && numImages >= 1 ? Math.floor(numImages) : 1;
}

/**
 * Normal mode: one task per model (main model first, then compared models).
 * A/B mode: one task per active variant, main model only. `count` images each.
 */
export function planGeneration<I>(
  settings: GenerationSettings,
  inputsByVariant: Partial<Record<VariantId, I>>,
): GenerationTask<I>[] {
  const count = imageCount(settings.numImages);
  const inputsFor = (variant: VariantId): I => {
    const inputs = inputsByVariant[variant];
    if (inputs === undefined) throw new Error(`planGeneration: no inputs for variant ${variant}`);
    return inputs;
  };

  const variants = activeVariants(settings.abTest);
  if (variants.length > 1) {
    return variants.map((variant): GenerationTask<I> => ({ variant, model: settings.model, count, inputs: inputsFor(variant) }));
  }

  const inputs = inputsFor("A");
  const models = Array.from(new Set([settings.model, ...(settings.compareModels ?? [])]));
  return models.map((model): GenerationTask<I> => ({ variant: "A", model, count, inputs }));
}

function images(n: number): string {
  return `${n} image${n > 1 ? "s" : ""}`;
}

/** Text under « Générer »: « 3 images », « 2 modèles × 2 images », « 2 variantes × 2 images · 4 images ». */
export function generationSummary(tasks: readonly { count: number }[], abTestActive: boolean): string {
  const perTask = tasks[0]?.count ?? 0;
  const total = tasks.reduce((sum, task) => sum + task.count, 0);
  if (abTestActive) return `${tasks.length} variantes × ${images(perTask)} · ${images(total)}`;
  if (tasks.length > 1) return `${tasks.length} modèles × ${images(perTask)}`;
  return images(total);
}
```

- [ ] **Step 4: Run the tests**

Run: `./node_modules/.bin/vitest run tests/canvas/generator-plan.test.ts tests/canvas/generator-variants.test.ts`
Expected: PASS (13 + 20 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas/generator-variants.ts tests/canvas/generator-plan.test.ts
git commit -m "feat(generator): generation plan per model or per variant, and the button summary"
```

---

## Task 3: Request payload and input row previews

**Files:**
- Create: `src/lib/canvas/generator-payload.ts`
- Test: `tests/canvas/generator-payload.test.ts`

**Interfaces:**
- Consumes: `InputSlot`, `ResolvedVariantInputs` (Task 1); `NodeData` type from `@/store/canvas-store`.
- Produces (`src/lib/canvas/generator-payload.ts`):
  - `type PayloadNode = { id: string; type?: string; data: NodeData }`
  - `type ImageLoader = (src: string) => Promise<string | null>`
  - `type GenerationPayload = { prompt: string; negativePrompt: string; faceImages: string[]; referenceImages: string[]; logos: { image: string; label: string }[]; sketchImages: string[] }` — exactly the input fields of `/api/generate/openrouter`
  - `nodeImageSource(data: NodeData): string | null`, `faceImageSources(data: NodeData): string[]`
  - `type InputPreview = { kind: "none" } | { kind: "text"; text: string; more: number } | { kind: "image"; src: string; more: number }`, `inputPreview(slot: InputSlot, nodes: readonly PayloadNode[]): InputPreview`
  - `buildGenerationPayload(inputs: ResolvedVariantInputs<PayloadNode>, loadImage: ImageLoader): Promise<GenerationPayload>`

- [ ] **Step 1: Write the failing tests**

Create `tests/canvas/generator-payload.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  buildGenerationPayload,
  faceImageSources,
  inputPreview,
  nodeImageSource,
  type ImageLoader,
  type PayloadNode,
} from "@/lib/canvas/generator-payload";
import type { ResolvedVariantInputs } from "@/lib/canvas/generator-variants";

const n = (id: string, type: string, data: PayloadNode["data"]): PayloadNode => ({ id, type, data });

function variantInputs(partial: Partial<ResolvedVariantInputs<PayloadNode>>): ResolvedVariantInputs<PayloadNode> {
  const empty = { nodes: [], inherited: false };
  return { variant: "A", face: [], logo: [], prompt: empty, sketch: empty, ref: empty, ...partial };
}

// Fake loader: marks what was loaded, fails on sources starting with "broken".
const loader: ImageLoader = async (src) => (src.startsWith("broken") ? null : `loaded(${src})`);

describe("nodeImageSource", () => {
  it("prefers the embedded image, then the selected generated image, then the URL", () => {
    expect(nodeImageSource({ imageBase64: "data:a", imageUrl: "/u" })).toBe("data:a");
    expect(nodeImageSource({ generatedImages: ["/g0", "/g1"], selectedImageIndex: 1, imageUrl: "/u" })).toBe("/g1");
    expect(nodeImageSource({ generatedImages: ["/g0"] })).toBe("/g0");
    expect(nodeImageSource({ imageUrl: "/u" })).toBe("/u");
    expect(nodeImageSource({})).toBeNull();
  });
});

describe("faceImageSources", () => {
  it("expands a Personnage into its angles, front first", () => {
    expect(faceImageSources({ personaAngles: { right: "/r", front: "/f" }, imageUrl: "/u" })).toEqual(["/f", "/r"]);
  });

  it("falls back to the node's single image", () => {
    expect(faceImageSources({ imageBase64: "data:x" })).toEqual(["data:x"]);
    expect(faceImageSources({})).toEqual([]);
  });
});

describe("inputPreview", () => {
  it("shows nothing for an unconnected input", () => {
    expect(inputPreview("prompt", [])).toEqual({ kind: "none" });
  });

  it("shows the first line of the first prompt, shortened, and how many more are connected", () => {
    const long = "Un visage choqué devant un graphique rouge qui s'effondre en direct\nDeuxième ligne";
    expect(inputPreview("prompt", [n("p1", "prompt", { prompt: long }), n("p2", "prompt", { prompt: "b" })])).toEqual({
      kind: "text",
      text: "Un visage choqué devant un graphique rouge qui…",
      more: 1,
    });
    expect(inputPreview("prompt", [n("p", "prompt", {})])).toEqual({ kind: "text", text: "Prompt vide", more: 0 });
  });

  it("shows a Personnage's front angle", () => {
    expect(inputPreview("face", [n("f", "faceReference", { personaAngles: { left: "/l", front: "/f" } })])).toEqual({
      kind: "image",
      src: "/f",
      more: 0,
    });
  });

  it("shows an image input's picture, or its label when it has none", () => {
    expect(inputPreview("ref", [n("r", "preview", { generatedImages: ["/g"] })])).toEqual({ kind: "image", src: "/g", more: 0 });
    expect(inputPreview("logo", [n("l", "swipeFile", { label: "Marque" })])).toEqual({ kind: "text", text: "Marque", more: 0 });
    expect(inputPreview("sketch", [n("s", "sketch", {})])).toEqual({ kind: "text", text: "Sans image", more: 0 });
  });
});

describe("buildGenerationPayload", () => {
  it("builds the /api/generate/openrouter fields from a variant's inputs", async () => {
    const payload = await buildGenerationPayload(
      variantInputs({
        face: [n("f", "faceReference", { personaAngles: { front: "/f", left: "/l" } })],
        logo: [
          n("l1", "swipeFile", { imageBase64: "data:logo", label: "Marque" }),
          n("l2", "swipeFile", { imageUrl: "broken-logo" }),
        ],
        prompt: {
          nodes: [n("p1", "prompt", { prompt: "A", negativePrompt: "flou" }), n("p2", "prompt", { prompt: "B" })],
          inherited: false,
        },
        sketch: { nodes: [n("s", "sketch", { imageBase64: "data:sketch" })], inherited: true },
        ref: {
          nodes: [
            n("r1", "swipeFile", { imageUrl: "/ref" }),
            n("r2", "preview", { generatedImages: ["/g0", "/g1"], selectedImageIndex: 1 }),
            n("r3", "swipeFile", {}),
          ],
          inherited: false,
        },
      }),
      loader,
    );

    expect(payload).toEqual({
      prompt: "A\nB",
      negativePrompt: "flou",
      faceImages: ["loaded(/f)", "loaded(/l)"],
      referenceImages: ["loaded(/ref)", "loaded(/g1)"],
      logos: [{ image: "loaded(data:logo)", label: "Marque" }],
      sketchImages: ["loaded(data:sketch)"],
    });
  });

  it("takes text from Prompt nodes only and names an unlabeled logo « Logo »", async () => {
    const payload = await buildGenerationPayload(
      variantInputs({
        prompt: {
          nodes: [n("x", "swipeFile", { prompt: "ignored" }), n("p", "prompt", { prompt: "kept" })],
          inherited: false,
        },
        logo: [n("l", "swipeFile", { imageUrl: "/logo" })],
      }),
      loader,
    );
    expect(payload.prompt).toBe("kept");
    expect(payload.logos).toEqual([{ image: "loaded(/logo)", label: "Logo" }]);
  });

  it("returns empty fields for a variant with no inputs", async () => {
    expect(await buildGenerationPayload(variantInputs({}), loader)).toEqual({
      prompt: "",
      negativePrompt: "",
      faceImages: [],
      referenceImages: [],
      logos: [],
      sketchImages: [],
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `./node_modules/.bin/vitest run tests/canvas/generator-payload.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/canvas/generator-payload"`.

- [ ] **Step 3: Create the module**

Create `src/lib/canvas/generator-payload.ts`:

```ts
/**
 * Turns a generator variant's resolved inputs into the fields
 * /api/generate/openrouter expects, and describes an input row's preview.
 * Image fetching is injected (`ImageLoader`) so this stays unit-testable.
 */
import type { NodeData } from "@/store/canvas-store";
import type { InputSlot, ResolvedVariantInputs } from "./generator-variants";

export type PayloadNode = { id: string; type?: string; data: NodeData };

/** Resolves an image reference (data URL or URL) to a data URL, or null when unreadable. */
export type ImageLoader = (src: string) => Promise<string | null>;

export type GenerationPayload = {
  prompt: string;
  negativePrompt: string;
  faceImages: string[];
  referenceImages: string[];
  logos: { image: string; label: string }[];
  sketchImages: string[];
};

/** Embedded image, else the selected generated image (Aperçu, Texte overlay), else the URL. */
export function nodeImageSource(data: NodeData): string | null {
  if (data.imageBase64) return data.imageBase64;
  const generated = data.generatedImages?.[data.selectedImageIndex ?? 0];
  if (generated) return generated;
  return data.imageUrl ?? null;
}

/** A Personnage expands into its angles (front, left, right); otherwise its single image. */
export function faceImageSources(data: NodeData): string[] {
  const angles = data.personaAngles;
  if (angles && (angles.front || angles.left || angles.right)) {
    return [angles.front, angles.left, angles.right].filter((src): src is string => Boolean(src));
  }
  const single = nodeImageSource(data);
  return single ? [single] : [];
}

export type InputPreview =
  | { kind: "none" }
  | { kind: "text"; text: string; more: number }
  | { kind: "image"; src: string; more: number };

const PREVIEW_TEXT_MAX = 48;

function firstLine(text: string): string {
  const line = text.trim().split("\n")[0].trim();
  return line.length > PREVIEW_TEXT_MAX ? `${line.slice(0, PREVIEW_TEXT_MAX - 1).trimEnd()}…` : line;
}

/** What an input row shows: a thumbnail, a one-line excerpt, or nothing when unconnected. */
export function inputPreview(slot: InputSlot, nodes: readonly PayloadNode[]): InputPreview {
  const first = nodes[0];
  if (!first) return { kind: "none" };
  const more = nodes.length - 1;
  if (slot === "prompt") {
    const text = first.data.prompt?.trim();
    return { kind: "text", text: text ? firstLine(text) : "Prompt vide", more };
  }
  const src = slot === "face" ? faceImageSources(first.data)[0] : nodeImageSource(first.data);
  if (src) return { kind: "image", src, more };
  return { kind: "text", text: first.data.label || "Sans image", more };
}

async function loadAll(sources: readonly string[], loadImage: ImageLoader): Promise<string[]> {
  const loaded = await Promise.all(sources.map((src) => loadImage(src)));
  return loaded.filter((image): image is string => Boolean(image));
}

function imageSources(nodes: readonly PayloadNode[]): string[] {
  return nodes.map((n) => nodeImageSource(n.data)).filter((src): src is string => Boolean(src));
}

/** Request fields for one variant. Only Prompt nodes contribute text; unreadable images are skipped. */
export async function buildGenerationPayload(
  inputs: ResolvedVariantInputs<PayloadNode>,
  loadImage: ImageLoader,
): Promise<GenerationPayload> {
  const prompts = inputs.prompt.nodes.filter((n) => n.type === "prompt");
  const [faceGroups, referenceImages, sketchImages, logoEntries] = await Promise.all([
    Promise.all(inputs.face.map((n) => loadAll(faceImageSources(n.data), loadImage))),
    loadAll(imageSources(inputs.ref.nodes), loadImage),
    loadAll(imageSources(inputs.sketch.nodes), loadImage),
    Promise.all(
      inputs.logo.map(async (n) => {
        const src = nodeImageSource(n.data);
        const image = src ? await loadImage(src) : null;
        return image ? { image, label: n.data.label || n.data.prompt || "Logo" } : null;
      }),
    ),
  ]);

  return {
    prompt: prompts.map((n) => n.data.prompt).filter(Boolean).join("\n"),
    negativePrompt: prompts.map((n) => n.data.negativePrompt).filter(Boolean).join("\n"),
    faceImages: faceGroups.flat(),
    referenceImages,
    logos: logoEntries.filter((entry): entry is { image: string; label: string } => entry !== null),
    sketchImages,
  };
}
```

- [ ] **Step 4: Run the tests and type-check**

Run: `./node_modules/.bin/vitest run tests/canvas/generator-payload.test.ts && ./node_modules/.bin/tsc --noEmit`
Expected: PASS (10 tests); `tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas/generator-payload.ts tests/canvas/generator-payload.test.ts
git commit -m "feat(generator): build generation requests and row previews from a variant's inputs"
```

---

## Task 4: The image route forwards logos and the sketch

**Files:**
- Modify: `src/app/api/generate/openrouter/route.ts`
- Test: `tests/generation/openrouter-inputs.test.ts`

**Interfaces:**
- Consumes: `setSetting` (Réglages, `src/lib/settings.ts`).
- Produces: `/api/generate/openrouter` sends `input_references` in the order faces, logos, references, sketch (one at most), and tells the model which positions are logos and that the last one is a composition sketch. The request body shape is unchanged (`logos: { image, label }[]`, `sketchImages: string[]` were already sent by the node).

- [ ] **Step 1: Re-read the route and confirm the gap**

```bash
grep -n "logos\|sketchImages\|inputReferences" src/app/api/generate/openrouter/route.ts
```

Expected: only the line `const inputReferences: string[] = [...faceImages, ...referenceImages];` and the uses of `inputReferences`. If `logos` / `sketchImages` are already read and forwarded, skip Step 3, still add and run the tests of Steps 2 and 4, and report it.

- [ ] **Step 2: Write the failing tests**

Create `tests/generation/openrouter-inputs.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";
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

type SentBody = { prompt: string; input_references?: { type: string; image_url: { url: string } }[] };

async function send(body: Record<string, unknown>): Promise<SentBody> {
  const res = await POST(
    new Request("http://localhost/api/generate/openrouter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "gemini-3.1-flash-image", ...body }),
    }) as never,
  );
  expect(res.status).toBe(200);
  return JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
}

const referenceUrls = (sent: SentBody) => (sent.input_references ?? []).map((ref) => ref.image_url.url);

describe("/api/generate/openrouter inputs", () => {
  it("sends faces, then logos, then references, then the sketch", async () => {
    const sent = await send({
      prompt: "Une miniature",
      faceImages: ["data:face"],
      logos: [{ image: "data:logo", label: "Marque" }],
      referenceImages: ["data:ref"],
      sketchImages: ["data:sketch"],
    });
    expect(referenceUrls(sent)).toEqual(["data:face", "data:logo", "data:ref", "data:sketch"]);
  });

  it("tells the model which reference images are logos and that the last one is a layout sketch", async () => {
    const sent = await send({
      prompt: "Une miniature",
      faceImages: ["data:f1", "data:f2"],
      logos: [
        { image: "data:l1", label: "Marque" },
        { image: "data:l2", label: "Studio" },
      ],
      sketchImages: ["data:s"],
    });
    expect(sent.prompt).toContain("Reference images 3 to 4 are logos to include in the thumbnail: Marque, Studio.");
    expect(sent.prompt).toContain("The last reference image is a rough COMPOSITION SKETCH.");
  });

  it("forwards one sketch at most and skips malformed logos", async () => {
    const sent = await send({
      prompt: "Une miniature",
      logos: [{ label: "sans image" }, "data:bad", { image: "data:l", label: "" }],
      sketchImages: ["data:s1", "data:s2"],
    });
    expect(referenceUrls(sent)).toEqual(["data:l", "data:s1"]);
    expect(sent.prompt).toContain("Reference image 1 is a logo to include in the thumbnail: Logo.");
  });

  it("accepts a sketch as the only input", async () => {
    const sent = await send({ sketchImages: ["data:s"] });
    expect(referenceUrls(sent)).toEqual(["data:s"]);
  });

  it("leaves the prompt untouched without logos or sketches", async () => {
    const sent = await send({ prompt: "Une miniature", referenceImages: ["data:r"] });
    expect(sent.prompt).toBe("Une miniature");
    expect(referenceUrls(sent)).toEqual(["data:r"]);
  });
});
```

Run: `./node_modules/.bin/vitest run tests/generation/openrouter-inputs.test.ts`
Expected: FAIL — the order test receives `["data:face", "data:ref"]`, the prompt tests miss the logo and sketch sentences, the sketch-only request gets a 400.

- [ ] **Step 3: Read logos and the sketch in the route**

In `src/app/api/generate/openrouter/route.ts`:

1. In the destructuring of `body`, replace

```ts
      referenceImages = [],
```

with

```ts
      referenceImages = [],
      logos: rawLogos = [],
      sketchImages: rawSketchImages = [],
```

2. Replace

```ts
    const inputReferences: string[] = [...faceImages, ...referenceImages];
```

with

```ts
    const logos = (Array.isArray(rawLogos) ? rawLogos : []).filter(
      (logo: unknown): logo is { image: string; label?: string } =>
        typeof logo === "object" && logo !== null && typeof (logo as { image?: unknown }).image === "string",
    );
    // One composition sketch at most: it is a layout guide, not a style or identity reference.
    const sketchImages: string[] = (Array.isArray(rawSketchImages) ? rawSketchImages : [])
      .filter((sketch: unknown): sketch is string => typeof sketch === "string")
      .slice(0, 1);

    // Order matters: the prompt below points at images by position.
    const inputReferences: string[] = [
      ...faceImages,
      ...logos.map((logo) => logo.image),
      ...referenceImages,
      ...sketchImages,
    ];
```

3. Replace

```ts
    if (negativePrompt) fullPrompt += `\n\nAvoid: ${negativePrompt}`;
```

with

```ts
    if (logos.length > 0) {
      const first = faceImages.length + 1;
      const last = faceImages.length + logos.length;
      const which = first === last ? `Reference image ${first} is a logo` : `Reference images ${first} to ${last} are logos`;
      const names = logos.map((logo) => logo.label || "Logo").join(", ");
      fullPrompt += `\n\nIMPORTANT: ${which} to include in the thumbnail: ${names}. Place each logo visibly and keep it recognizable — not distorted or blended into the background.`;
    }
    if (sketchImages.length > 0) {
      fullPrompt += `\n\nIMPORTANT: The last reference image is a rough COMPOSITION SKETCH. Match its layout and where elements are placed, not its hand-drawn style — the result must look polished and professional.`;
    }
    if (negativePrompt) fullPrompt += `\n\nAvoid: ${negativePrompt}`;
```

- [ ] **Step 4: Run the route tests**

Run: `./node_modules/.bin/vitest run tests/generation/openrouter-inputs.test.ts tests/settings/openrouter-resolution.test.ts`
Expected: PASS (5 tests + the Réglages resolution tests, unchanged).

- [ ] **Step 5: Type-check and commit**

Run: `./node_modules/.bin/tsc --noEmit` — expected exit 0.

```bash
git add src/app/api/generate/openrouter/route.ts tests/generation/openrouter-inputs.test.ts
git commit -m "fix(generation): send connected logos and the composition sketch to OpenRouter"
```

---

## Task 5: Store — `abTest` data, `getVariantInputs`, `setGeneratorVariants`

**Files:**
- Modify: `src/store/canvas-store.ts`
- Test: `tests/canvas/canvas-store-variants.test.ts`

**Interfaces:**
- Consumes: `resolveVariantInputs`, `edgesToRemoveForVariants`, `normalizeVariants`, `AbTest`, `ResolvedVariantInputs`, `VariantId` (Task 1).
- Produces:
  - `NodeData.abTest?: AbTest`, `NodeData.generatedImagesByVariant?: Partial<Record<VariantId, string[]>>`
  - `getVariantInputs(nodeId: string, variant: VariantId): ResolvedVariantInputs<AppNode>`
  - `setGeneratorVariants(nodeId: string, variants: VariantId[]): void` — normalizes the variants, removes the edges of dropped variants and sets `abTest` (`undefined` below 2 variants) in one `set`, then one history snapshot + autosave when the project is loaded.

- [ ] **Step 1: Write the failing tests**

Create `tests/canvas/canvas-store-variants.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { Edge } from "@xyflow/react";
import { useCanvasStore, type AppNode } from "@/store/canvas-store";

const at = { x: 0, y: 0 };

const NODES: AppNode[] = [
  { id: "gen", type: "generator", position: at, data: { model: "gpt-image-2", abTest: { variants: ["A", "B", "C"] } } },
  { id: "pA", type: "prompt", position: at, data: { prompt: "A" } },
  { id: "pB", type: "prompt", position: at, data: { prompt: "B" } },
  { id: "pC", type: "prompt", position: at, data: { prompt: "C" } },
  { id: "face", type: "faceReference", position: at, data: {} },
  { id: "prevB", type: "preview", position: at, data: {} },
];

const EDGES: Edge[] = [
  { id: "e-pA", source: "pA", target: "gen", targetHandle: "prompt-in" },
  { id: "e-pB", source: "pB", target: "gen", targetHandle: "prompt-in-b" },
  { id: "e-pC", source: "pC", target: "gen", targetHandle: "prompt-in-c" },
  { id: "e-face", source: "face", target: "gen", targetHandle: "face-in" },
  { id: "e-prevB", source: "gen", sourceHandle: "result-b", target: "prevB", targetHandle: "preview-in" },
];

// loaded: false keeps history snapshots and autosave (fetch) out of these tests.
beforeEach(() => {
  useCanvasStore.setState({ nodes: structuredClone(NODES), edges: structuredClone(EDGES), loaded: false });
});

const generator = () => useCanvasStore.getState().nodes.find((n) => n.id === "gen")!;
const edgeIds = () => useCanvasStore.getState().edges.map((e) => e.id);

describe("canvas store — generator variants", () => {
  it("getVariantInputs resolves a variant with the shared Personnage", () => {
    const b = useCanvasStore.getState().getVariantInputs("gen", "B");
    expect(b.prompt.nodes.map((n) => n.id)).toEqual(["pB"]);
    expect(b.prompt.inherited).toBe(false);
    expect(b.face.map((n) => n.id)).toEqual(["face"]);
  });

  it("removing C keeps A and B and drops C's edges", () => {
    useCanvasStore.getState().setGeneratorVariants("gen", ["A", "B"]);
    expect(generator().data.abTest).toEqual({ variants: ["A", "B"] });
    expect(edgeIds()).toEqual(["e-pA", "e-pB", "e-face", "e-prevB"]);
  });

  it("disabling the test clears abTest and drops every B and C edge", () => {
    useCanvasStore.getState().setGeneratorVariants("gen", ["A"]);
    expect(generator().data.abTest).toBeUndefined();
    expect(edgeIds()).toEqual(["e-pA", "e-face"]);
  });

  it("enabling the test on a normal generator only adds abTest", () => {
    useCanvasStore.setState({
      nodes: [{ id: "gen", type: "generator", position: at, data: { model: "gpt-image-2" } }, structuredClone(NODES[1])],
      edges: [structuredClone(EDGES[0])],
    });
    useCanvasStore.getState().setGeneratorVariants("gen", ["A", "B"]);
    expect(generator().data.abTest).toEqual({ variants: ["A", "B"] });
    expect(generator().data.model).toBe("gpt-image-2");
    expect(edgeIds()).toEqual(["e-pA"]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `./node_modules/.bin/vitest run tests/canvas/canvas-store-variants.test.ts`
Expected: FAIL — `getVariantInputs is not a function`.

- [ ] **Step 3: Extend the store**

Re-read `src/store/canvas-store.ts` on the latest `main` (chantier A added the node picker and `duplicateNode`). Then:

1. After `import { v4 as uuid } from "uuid";` add:

```ts
import {
  edgesToRemoveForVariants,
  normalizeVariants,
  resolveVariantInputs,
  type AbTest,
  type ResolvedVariantInputs,
  type VariantId,
} from "@/lib/canvas/generator-variants";
```

2. Add these fields at the end of the `NodeData` type (just before its closing `};`):

```ts
  // Générateur — test A/B/C. Absent or fewer than 2 variants = normal mode.
  abTest?: AbTest;
  // Images of the last generation per variant; generatedImages keeps variant A's.
  generatedImagesByVariant?: Partial<Record<VariantId, string[]>>;
```

3. In the `CanvasState` interface, right after the `getConnectedInputs: (nodeId: string) => { … };` member, add:

```ts
  // Inputs of one variant of a generator (common + per-variant, B/C inheriting A).
  getVariantInputs: (nodeId: string, variant: VariantId) => ResolvedVariantInputs<AppNode>;
  // Sets a generator's variants (["A"] = normal mode) and removes, in the same
  // history step, the edges plugged into handles of the variants dropped.
  setGeneratorVariants: (nodeId: string, variants: VariantId[]) => void;
```

4. In the store implementation, right after the `getConnectedInputs: (nodeId) => { … },` property, add:

```ts
  getVariantInputs: (nodeId, variant) => {
    const { nodes, edges } = get();
    return resolveVariantInputs(edges, nodes, nodeId, variant);
  },

  setGeneratorVariants: (nodeId, variants) => {
    const kept = normalizeVariants(variants);
    const { nodes, edges } = get();
    const dropped = new Set(edgesToRemoveForVariants(edges, nodeId, kept));
    const abTest: AbTest | undefined = kept.length >= 2 ? { variants: kept } : undefined;
    set({
      edges: edges.filter((edge) => !dropped.has(edge)),
      nodes: nodes.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, abTest } } : node)),
    });
    if (get().loaded) {
      pushHistory(get, set);
      debouncedSave(get(), set);
    }
  },
```

`getConnectedInputs` stays unchanged (`TextOverlayNode` uses it).

- [ ] **Step 4: Run the tests and type-check**

Run: `./node_modules/.bin/vitest run tests/canvas/canvas-store-variants.test.ts && ./node_modules/.bin/tsc --noEmit`
Expected: PASS (4 tests); `tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/store/canvas-store.ts tests/canvas/canvas-store-variants.test.ts
git commit -m "feat(canvas-store): generator variant inputs and variant switching with edge cleanup"
```

---

## Task 6: Variant handles in the node catalog, the picker label and the prompt enhancer

**Files:**
- Modify: `src/lib/canvas/node-catalog.ts`
- Modify (only if Step 4 finds a handle label lookup): the file holding it, most likely `src/components/panels/NodePicker.tsx`
- Modify: `src/components/nodes/PromptNode.tsx`
- Test: `tests/canvas/node-catalog-variants.test.ts`

**Interfaces:**
- Consumes: `compatibleEntries`, `CatalogEntry` (chantier A); `baseGeneratorHandle`, `parseGeneratorHandle`, `isPromptInputHandle` (Task 1).
- Produces: `compatibleEntries({ nodeType: "generator", handleId: "prompt-in-b" | "prompt-in-c" | "sketch-in-b" | "sketch-in-c" | "ref-in-b" | "ref-in-c", handleType: "target" })` returns exactly what the A handle returns; same for `result-b` / `result-c` (source) versus `result`. The picker, opened in connect mode from a variant handle, therefore lists the right entries and connects to the variant handle it was opened from.

- [ ] **Step 1: Write the failing tests**

Create `tests/canvas/node-catalog-variants.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { compatibleEntries } from "@/lib/canvas/node-catalog";

type From = Parameters<typeof compatibleEntries>[0];

// "<catalog id>:<handle on the new node>", sorted, so the comparison ignores ordering details.
const offers = (from: From) =>
  compatibleEntries(from)
    .map(({ entry, newNodeHandle }) => `${entry.id}:${newNodeHandle}`)
    .sort();

describe("compatibleEntries on the generator's variant handles", () => {
  it.each([
    ["prompt-in-b", "prompt-in"],
    ["prompt-in-c", "prompt-in"],
    ["sketch-in-b", "sketch-in"],
    ["sketch-in-c", "sketch-in"],
    ["ref-in-b", "ref-in"],
    ["ref-in-c", "ref-in"],
  ])("input %s offers what %s offers", (variantHandle, baseHandle) => {
    const expected = offers({ nodeType: "generator", handleId: baseHandle, handleType: "target" });
    expect(expected.length).toBeGreaterThan(0);
    expect(offers({ nodeType: "generator", handleId: variantHandle, handleType: "target" })).toEqual(expected);
  });

  it.each(["result-b", "result-c"])("output %s offers what result offers", (variantHandle) => {
    const expected = offers({ nodeType: "generator", handleId: "result", handleType: "source" });
    expect(expected.length).toBeGreaterThan(0);
    expect(offers({ nodeType: "generator", handleId: variantHandle, handleType: "source" })).toEqual(expected);
  });

  it("offers a Prompt wired by its prompt output for prompt-in-b", () => {
    expect(offers({ nodeType: "generator", handleId: "prompt-in-b", handleType: "target" })).toContain("prompt:prompt");
  });

  it("offers a Croquis wired by its image output for sketch-in-c", () => {
    expect(offers({ nodeType: "generator", handleId: "sketch-in-c", handleType: "target" })).toContain("croquis:image");
  });

  it("offers an Aperçu from result-b", () => {
    expect(offers({ nodeType: "generator", handleId: "result-b", handleType: "source" })).toContain("apercu:preview-in");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `./node_modules/.bin/vitest run tests/canvas/node-catalog-variants.test.ts`
Expected: FAIL — the variant handles return `[]` (chantier A only knows `prompt-in`, `sketch-in`, `ref-in`, `result`). The three « offers a … » tests fail too.

- [ ] **Step 3: Normalize generator handles in `compatibleEntries`**

Re-read `src/lib/canvas/node-catalog.ts`. Add the import:

```ts
import { baseGeneratorHandle } from "./generator-variants";
```

At the very start of the body of `compatibleEntries(from)`, add:

```ts
  // The A/B/C generator's variant handles (prompt-in-b, result-c…) accept and
  // offer exactly what their variant A counterparts do.
  const lookup = from.nodeType === "generator" ? { ...from, handleId: baseGeneratorHandle(from.handleId) } : from;
```

and replace every other use of `from` inside that function body with `lookup`. The function's return shape stays `{ entry, newNodeHandle }`: the caller keeps connecting to its own `from.handleId` (the variant handle).

Run: `./node_modules/.bin/vitest run tests/canvas/node-catalog-variants.test.ts tests/canvas/node-catalog.test.ts`
Expected: PASS (the new tests and chantier A's catalog tests; if chantier A named its catalog test file differently, run `./node_modules/.bin/vitest run tests/canvas` instead).

- [ ] **Step 4: Name variant handles in the picker subtitle**

```bash
grep -rn "Compatible avec" src/components src/lib
grep -rn "\"prompt-in\"" src/components/panels src/lib/canvas/node-catalog.ts
```

If the « Compatible avec … » subtitle takes the handle's name from a lookup keyed by handle id (a map containing `"prompt-in"`), make that lookup variant-aware. With `HANDLE_LABELS` standing for the existing map's real name, and `handleId` for the variable the subtitle already uses:

```ts
import { baseGeneratorHandle, parseGeneratorHandle } from "@/lib/canvas/generator-variants";

function handleName(handleId: string): string {
  const base = HANDLE_LABELS[baseGeneratorHandle(handleId)] ?? handleId;
  const variant = parseGeneratorHandle(handleId)?.variant;
  return variant && variant !== "A" ? `${base} · variante ${variant}` : base;
}
```

and use `handleName(handleId)` where the subtitle read `HANDLE_LABELS[handleId]`. If the subtitle is built from something else (the catalog entry, `compatibleEntries`), change nothing and note it in your report.

- [ ] **Step 5: Let « Améliorer le prompt » follow variant prompt handles**

Re-read `src/components/nodes/PromptNode.tsx`. Add the import:

```ts
import { isPromptInputHandle } from "@/lib/canvas/generator-variants";
```

and replace

```ts
      .filter((e) => e.source === id && e.targetHandle === "prompt-in")
```

with

```ts
      .filter((e) => e.source === id && isPromptInputHandle(e.targetHandle))
```

- [ ] **Step 6: Type-check, lint, full suite**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/lib/canvas/node-catalog.ts src/components/nodes/PromptNode.tsx
./node_modules/.bin/vitest run
```

Expected: `tsc` exits 0; ESLint reports no error; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/canvas/node-catalog.ts src/components/nodes/PromptNode.tsx tests/canvas/node-catalog-variants.test.ts
git commit -m "feat(canvas): variant handles resolve like their A counterparts in the step picker"
```

(Add the picker file to `git add` if Step 4 changed it.)

---

## Task 7: Generator building blocks — `NodeShell` slot, input row, generation hook

**Files:**
- Modify: `src/components/nodes/NodeShell.tsx`
- Create: `src/components/nodes/generator/GeneratorInputRow.tsx`
- Create: `src/components/nodes/generator/useGeneratorRun.ts`

**Interfaces:**
- Consumes: `InputPreview`, `buildGenerationPayload`, `GenerationPayload`, `ImageLoader` (Task 3); `activeVariants`, `isAbTestActive`, `planGeneration`, `resultHandle`, `ResolvedVariantInputs`, `VariantId` (Tasks 1–2); `getVariantInputs`, `NodeData.generatedImagesByVariant` (Task 5); `DEFAULT_IMAGE_MODEL`, `imageModelLabel` (Réglages); `MODEL_COSTS` (`src/lib/model-costs.ts`).
- Produces:
  - `NodeShell` prop `headerExtra?: ReactNode` (rendered right-aligned before the « … » menu); root carries the `dark` class.
  - `GeneratorInputRow` default export, props `{ handleId: string; icon: LucideIcon; label: string; preview: InputPreview; inherited: boolean; addLabel: string; onAdd: () => void }`.
  - `useGeneratorRun(nodeId: string): { run: (compareModels: readonly string[]) => Promise<void>; error: string | null }`.

- [ ] **Step 1: Add the header slot and the dark scope to `NodeShell`**

Re-read `src/components/nodes/NodeShell.tsx`. Then:

1. In the destructured props, after `accentColor,` add `headerExtra,`; in the props type, after `accentColor?: string;` add `headerExtra?: ReactNode;`.
2. On the root element, replace `className="node-card rounded-xl border transition-all"` with `className="node-card dark rounded-xl border transition-all"` (nodes stay dark whatever the app theme; `.dark` only redefines shadcn tokens).
3. Immediately before the element holding the « … » node menu (today `<div className="relative flex-shrink-0" ref={menuRef}>`), insert:

```tsx
        {headerExtra && <div className="ml-auto mr-1 flex min-w-0 items-center">{headerExtra}</div>}
```

- [ ] **Step 2: Create the input row**

Create `src/components/nodes/generator/GeneratorInputRow.tsx`:

```tsx
"use client";

import { Handle, Position } from "@xyflow/react";
import { PlusIcon, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { InputPreview } from "@/lib/canvas/generator-payload";

/**
 * One input of the Générateur: its target handle sits on the node's left edge,
 * vertically centred on this row (the row cancels NodeShell's px-3 padding).
 */
export default function GeneratorInputRow({
  handleId,
  icon: Icon,
  label,
  preview,
  inherited,
  addLabel,
  onAdd,
}: {
  handleId: string;
  icon: LucideIcon;
  label: string;
  preview: InputPreview;
  /** Unconnected B/C input showing variant A's input. */
  inherited: boolean;
  /** Tooltip of the « + » shown on an inherited row. */
  addLabel: string;
  onAdd: () => void;
}) {
  return (
    <div className="relative -mx-3 flex h-9 items-center gap-2 px-3">
      <Handle type="target" position={Position.Left} id={handleId} />
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="w-28 shrink-0 truncate text-xs text-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
        {inherited && (
          <Badge variant="outline" className="h-4 shrink-0 px-1.5 text-[10px]">
            hérité de A
          </Badge>
        )}
        {preview.kind === "image" && (
          <img
            src={preview.src}
            alt=""
            className={cn("size-7 shrink-0 rounded object-cover", inherited && "opacity-50")}
          />
        )}
        {preview.kind === "text" && (
          <span className={cn("min-w-0 truncate text-xs text-muted-foreground", inherited && "opacity-50")}>
            {preview.text}
          </span>
        )}
        {preview.kind !== "none" && preview.more > 0 && (
          <span className="shrink-0 text-[10px] text-muted-foreground">+{preview.more}</span>
        )}
        {preview.kind === "none" && (
          <Button type="button" variant="ghost" size="xs" className="text-muted-foreground" onClick={onAdd}>
            <PlusIcon />
            Ajouter
          </Button>
        )}
        {inherited && (
          <Tooltip>
            <TooltipTrigger
              render={<Button type="button" variant="ghost" size="icon-xs" aria-label={addLabel} onClick={onAdd} />}
            >
              <PlusIcon />
            </TooltipTrigger>
            <TooltipContent>{addLabel}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the generation hook**

Create `src/components/nodes/generator/useGeneratorRun.ts`:

```ts
"use client";

import { useCallback, useState } from "react";
import { useCanvasStore, type AppNode, type NodeData } from "@/store/canvas-store";
import { buildGenerationPayload, type GenerationPayload, type ImageLoader } from "@/lib/canvas/generator-payload";
import {
  activeVariants,
  isAbTestActive,
  planGeneration,
  resultHandle,
  type ResolvedVariantInputs,
  type VariantId,
} from "@/lib/canvas/generator-variants";
import { DEFAULT_IMAGE_MODEL, imageModelLabel } from "@/lib/image-models";
import { MODEL_COSTS } from "@/lib/model-costs";

// Where one run's Aperçu nodes go, relative to the generator: one column per
// image; in A/B mode one row per variant.
const PREVIEW_OFFSET_X = 400;
const PREVIEW_COLUMN_GAP = 350;
const PREVIEW_ROW_GAP = 420;

async function fetchAsDataUrl(src: string): Promise<string | null> {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** One loader per run: an image shared by several variants is fetched once. */
function createImageLoader(): ImageLoader {
  const cache = new Map<string, Promise<string | null>>();
  return (src) => {
    if (src.startsWith("data:")) return Promise.resolve(src);
    let pending = cache.get(src);
    if (!pending) {
      pending = fetchAsDataUrl(src);
      cache.set(src, pending);
    }
    return pending;
  };
}

type GenerateResult = { images: string[]; totalTokens: number; warnings?: string[] };

async function requestGeneration(body: Record<string, unknown>): Promise<GenerateResult> {
  const res = await fetch("/api/generate/openrouter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Échec de la génération (${res.status})`);
  }
  const result = await res.json();
  return { images: result.images || [], totalTokens: result.stats?.totalTokens || 0, warnings: result.warnings };
}

type Job = { previewId: string; variant: VariantId; model: string; payload: GenerationPayload };

/**
 * Runs a generator: plans the tasks (models or variants), creates one Aperçu
 * per image in « loading » state wired from the variant's output, generates in
 * parallel, then stores the images per variant on the generator.
 */
export function useGeneratorRun(nodeId: string) {
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (compareModels: readonly string[]) => {
      const store = useCanvasStore.getState();
      const node = store.nodes.find((n) => n.id === nodeId);
      if (!node || node.data.isGenerating) return;
      const { data, position } = node;
      setError(null);
      store.updateNodeData(nodeId, { isGenerating: true });

      try {
        const abActive = isAbTestActive(data.abTest);
        const inputsByVariant: Partial<Record<VariantId, ResolvedVariantInputs<AppNode>>> = {};
        for (const variant of activeVariants(data.abTest)) {
          inputsByVariant[variant] = store.getVariantInputs(nodeId, variant);
        }
        const tasks = planGeneration(
          { model: data.model || DEFAULT_IMAGE_MODEL, numImages: data.numImages, abTest: data.abTest, compareModels },
          inputsByVariant,
        );

        const loadImage = createImageLoader();
        const inputsPerVariant = new Map(tasks.map((task) => [task.variant, task.inputs]));
        const payloads = new Map<VariantId, GenerationPayload>(
          await Promise.all(
            Array.from(inputsPerVariant, async ([variant, inputs]) => [variant, await buildGenerationPayload(inputs, loadImage)] as const),
          ),
        );

        const jobs: Job[] = [];
        tasks.forEach((task, taskIndex) => {
          const payload = payloads.get(task.variant);
          if (!payload) return;
          const modelLabel = imageModelLabel(task.model);
          for (let i = 0; i < task.count; i++) {
            const suffix = task.count > 1 ? ` #${i + 1}` : "";
            const column = abActive ? i : jobs.length;
            const row = abActive ? taskIndex : 0;
            const previewData: NodeData = {
              label: abActive ? `Variante ${task.variant}${suffix}` : `${modelLabel}${suffix}`,
              genStatus: "loading",
              genModel: modelLabel,
              genPromptUsed: payload.prompt,
            };
            const previewId = useCanvasStore
              .getState()
              .addNodeAndConnect(
                "preview",
                { x: position.x + PREVIEW_OFFSET_X + column * PREVIEW_COLUMN_GAP, y: position.y + row * PREVIEW_ROW_GAP },
                nodeId,
                resultHandle(task.variant),
                "preview-in",
                previewData,
                true,
              );
            jobs.push({ previewId, variant: task.variant, model: task.model, payload });
          }
        });

        const outcomes = await Promise.all(
          jobs.map(async (job) => {
            const start = Date.now();
            try {
              const result = await requestGeneration({
                ...job.payload,
                aspectRatio: data.aspectRatio || "16x9",
                model: job.model,
                // Unset on older and agent-built nodes: the route then uses defaultResolution.
                imageSize: data.imageSize,
                // Ties the stored image to the project, the unit the miniatures gallery groups by.
                projectId: useCanvasStore.getState().currentProjectId,
              });
              const cost = MODEL_COSTS[job.model] || 0;
              useCanvasStore.getState().updateNodeData(job.previewId, {
                generatedImages: result.images,
                selectedImageIndex: 0,
                genStatus: "done",
                genTimeMs: Date.now() - start,
                genTokens: result.totalTokens,
                genCost: cost > 0 ? `~$${cost.toFixed(3)}` : "",
                genWarning: result.warnings?.join(" ") || undefined,
              });
              return { variant: job.variant, images: result.images };
            } catch (err) {
              useCanvasStore.getState().updateNodeData(job.previewId, {
                genStatus: "error",
                genError: err instanceof Error ? err.message : "Échec de la génération",
                genTimeMs: Date.now() - start,
              });
              return { variant: job.variant, images: [] as string[] };
            }
          }),
        );

        const produced: Partial<Record<VariantId, string[]>> = {};
        for (const outcome of outcomes) {
          if (outcome.images.length > 0) produced[outcome.variant] = [...(produced[outcome.variant] ?? []), ...outcome.images];
        }
        const update: Partial<NodeData> = { isGenerating: false };
        if (Object.keys(produced).length > 0) {
          const previous = useCanvasStore.getState().nodes.find((n) => n.id === nodeId)?.data.generatedImagesByVariant;
          update.generatedImagesByVariant = { ...previous, ...produced };
          // generatedImages stays variant A's images, for code that reads it.
          if (produced.A) {
            update.generatedImages = produced.A;
            update.selectedImageIndex = 0;
          }
        }
        useCanvasStore.getState().updateNodeData(nodeId, update);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Échec de la génération");
        useCanvasStore.getState().updateNodeData(nodeId, { isGenerating: false });
      }
    },
    [nodeId],
  );

  return { run, error };
}
```

- [ ] **Step 4: Type-check and lint**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/components/nodes/NodeShell.tsx src/components/nodes/generator
```

Expected: `tsc` exits 0; ESLint: no error (one `@next/next/no-img-element` warning in `GeneratorInputRow.tsx` is expected — every canvas node uses `<img>` for data URLs).

- [ ] **Step 5: Commit**

```bash
git add src/components/nodes/NodeShell.tsx src/components/nodes/generator/GeneratorInputRow.tsx src/components/nodes/generator/useGeneratorRun.ts
git commit -m "feat(generator): input row, generation hook and a header slot for node badges"
```

---

## Task 8: Rewrite `GeneratorNode` and drop the dead Ideogram fields

**Files:**
- Rewrite: `src/components/nodes/GeneratorNode.tsx`
- Modify: `src/store/canvas-store.ts` (remove dead `NodeData` fields)

**Interfaces:**
- Consumes: everything from Tasks 1–7; `openNodePicker` (chantier A); `ConfirmDialog` (Réglages); `IMAGE_MODELS`, `IMAGE_MODEL_GROUPS`, `IMAGE_RESOLUTIONS`, `DEFAULT_IMAGE_MODEL`, `imageModelLabel` (Réglages); `ASPECT_RATIOS`, `AspectRatio` (Réglages); `MODEL_COSTS`, `REFERENCE_CAPS`.
- Produces: the node described in spec §2–§3. Handles: `face-in`, `logo-in`, `prompt-in`, `sketch-in`, `ref-in`, `result` always; `prompt-in-b`, `sketch-in-b`, `ref-in-b`, `result-b` while B is active; same with `-c` for C.

- [ ] **Step 1: Re-read the current node**

Read `src/components/nodes/GeneratorNode.tsx` on the latest `main`. Note any `NodeShell` prop or store call that does not belong to the features being replaced (for example an `onDuplicate` added by chantier A): carry it over into the new file. Everything else — `collectInputs`, `generateWithModel`, `handleGenerate`, `handleCompare`, the five label buttons stacked on the left edge, the `<select>`s, the in-node generated image, `ideogramMode` / `renderingSpeed` / `styleType` / `imageWeight` / `maskDataUrl` — is replaced.

- [ ] **Step 2: Replace the node**

Replace the whole content of `src/components/nodes/GeneratorNode.tsx` with:

```tsx
"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from "@xyflow/react";
import {
  ChevronDownIcon,
  FlaskConicalIcon,
  ImageIcon,
  LoaderCircleIcon,
  PencilLineIcon,
  PlusIcon,
  ShapesIcon,
  SparklesIcon,
  StarIcon,
  TypeIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { useCanvasStore, type AppNode } from "@/store/canvas-store";
import NodeShell from "./NodeShell";
import GeneratorInputRow from "./generator/GeneratorInputRow";
import { useGeneratorRun } from "./generator/useGeneratorRun";
import ConfirmDialog from "@/components/settings/ConfirmDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { inputPreview } from "@/lib/canvas/generator-payload";
import {
  COMMON_SLOTS,
  PER_VARIANT_SLOTS,
  activeVariants,
  edgesToRemoveForVariants,
  generationSummary,
  inputHandle,
  planGeneration,
  resolveVariantInputs,
  resultHandle,
  variantRemovalCopy,
  type InputSlot,
  type ResolvedVariantInputs,
  type VariantId,
  type VariantRemovalCopy,
} from "@/lib/canvas/generator-variants";
import {
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODEL_GROUPS,
  IMAGE_MODELS,
  IMAGE_RESOLUTIONS,
  imageModelLabel,
} from "@/lib/image-models";
import { MODEL_COSTS, REFERENCE_CAPS } from "@/lib/model-costs";
import { ASPECT_RATIOS, type AspectRatio } from "@/lib/settings-schema";

const SLOT_META: Record<InputSlot, { label: string; icon: LucideIcon }> = {
  face: { label: "Personnage", icon: UserRoundIcon },
  logo: { label: "Logo", icon: ShapesIcon },
  prompt: { label: "Prompt", icon: TypeIcon },
  sketch: { label: "Croquis", icon: PencilLineIcon },
  ref: { label: "Image de référence", icon: ImageIcon },
};

const ASPECT_LABELS: Record<AspectRatio, string> = { "16x9": "16:9", "9x16": "9:16", "1x1": "1:1" };
const IMAGE_COUNTS = [1, 2, 3, 4] as const;
const MODEL_ITEMS = IMAGE_MODELS.map((m) => ({ value: m.id, label: m.label }));

function priceLabel(modelId: string): string {
  const cost = MODEL_COSTS[modelId];
  return cost ? `~$${cost.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}` : "";
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{children}</p>;
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

type PendingRemoval = { variants: VariantId[]; copy: VariantRemovalCopy };

export default function GeneratorNode({ id, data, positionAbsoluteX, positionAbsoluteY }: NodeProps<AppNode>) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const removeNode = useCanvasStore((s) => s.removeNode);
  const setGeneratorVariants = useCanvasStore((s) => s.setGeneratorVariants);
  const openNodePicker = useCanvasStore((s) => s.openNodePicker);
  const edges = useCanvasStore((s) => s.edges);
  const nodes = useCanvasStore((s) => s.nodes);
  const updateNodeInternals = useUpdateNodeInternals();
  const { run, error } = useGeneratorRun(id);
  const [compareModels, setCompareModels] = useState<string[]>([]);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);

  const model = data.model || DEFAULT_IMAGE_MODEL;
  const aspectRatio = data.aspectRatio || "16x9";
  const numImages = data.numImages || 1;
  const variantsKey = activeVariants(data.abTest).join("");
  const variants = useMemo(() => variantsKey.split("") as VariantId[], [variantsKey]);
  const abActive = variants.length > 1;

  // Handles mount and unmount with the variants: React Flow must re-measure them.
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, variantsKey, updateNodeInternals]);

  const resolved = useMemo(
    () => variants.map((variant) => resolveVariantInputs(edges, nodes, id, variant)),
    [edges, nodes, id, variants],
  );
  const inputsA = resolved[0];

  const inputsByVariant: Partial<Record<VariantId, ResolvedVariantInputs<AppNode>>> = {};
  for (const inputs of resolved) inputsByVariant[inputs.variant] = inputs;
  const summary = generationSummary(
    planGeneration({ model, numImages, abTest: data.abTest, compareModels }, inputsByVariant),
    abActive,
  );
  const faceIgnored = inputsA.face.length > 0 && REFERENCE_CAPS[model]?.characters === 0;

  const openPicker = (handleId: string, rowIndex: number) =>
    openNodePicker({
      mode: "connect",
      flowPos: { x: positionAbsoluteX - 400, y: positionAbsoluteY + rowIndex * 90 },
      from: { nodeId: id, handleId, handleType: "target" },
    });

  // Going to fewer variants removes the edges of the dropped ones: confirm first when there are any.
  const requestVariants = (next: VariantId[]) => {
    const dropped = edgesToRemoveForVariants(edges, id, next);
    if (dropped.length === 0) {
      setGeneratorVariants(id, next);
      return;
    }
    setPendingRemoval({ variants: next, copy: variantRemovalCopy(variants, next, dropped.length) });
  };

  const toggleCompareModel = (modelId: string) =>
    setCompareModels((prev) => (prev.includes(modelId) ? prev.filter((m) => m !== modelId) : [...prev, modelId]));

  const saveFavorite = () => {
    void fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favoriteModel: model }),
    }).catch(() => {});
  };

  const renderRow = (slot: InputSlot, inputs: ResolvedVariantInputs<AppNode>, rowIndex: number) => {
    const slotInputs = slot === "face" || slot === "logo" ? { nodes: inputs[slot], inherited: false } : inputs[slot];
    const handleId = inputHandle(slot, inputs.variant);
    return (
      <GeneratorInputRow
        key={handleId}
        handleId={handleId}
        icon={SLOT_META[slot].icon}
        label={SLOT_META[slot].label}
        preview={inputPreview(slot, slotInputs.nodes)}
        inherited={slotInputs.inherited}
        addLabel={`Ajouter pour la variante ${inputs.variant}`}
        onAdd={() => openPicker(handleId, rowIndex)}
      />
    );
  };

  return (
    <NodeShell
      title={data.label || "Générateur"}
      icon={<SparklesIcon className="size-4 text-(--canvas-accent)" />}
      headerExtra={
        <Badge variant="secondary" className="max-w-36">
          <span className="truncate">{imageModelLabel(model)}</span>
        </Badge>
      }
      onRename={(label) => updateNodeData(id, { label })}
      onDelete={() => removeNode(id)}
      width={340}
    >
      <div className="nodrag nopan space-y-3">
        <section aria-label="Entrées">
          {abActive && <SectionTitle>Commun</SectionTitle>}
          {COMMON_SLOTS.map((slot, index) => renderRow(slot, inputsA, index))}
          {resolved.map((inputs, variantIndex) => (
            <div key={inputs.variant}>
              {abActive && (
                <div className="relative -mx-3 mt-2 flex h-7 items-center justify-between px-3">
                  <SectionTitle>Variante {inputs.variant}</SectionTitle>
                  {inputs.variant === "C" && (
                    <Button type="button" variant="ghost" size="xs" onClick={() => requestVariants(["A", "B"])}>
                      Retirer
                    </Button>
                  )}
                  <Handle type="source" position={Position.Right} id={resultHandle(inputs.variant)} />
                </div>
              )}
              {PER_VARIANT_SLOTS.map((slot, index) =>
                renderRow(slot, inputs, COMMON_SLOTS.length + variantIndex * PER_VARIANT_SLOTS.length + index),
              )}
            </div>
          ))}
          {abActive && variants.length === 2 && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="mt-2 w-full"
              onClick={() => requestVariants(["A", "B", "C"])}
            >
              <PlusIcon />
              Variante C
            </Button>
          )}
        </section>

        <section aria-label="Réglages" className="space-y-3 border-t border-border pt-3">
          <div className="space-y-1.5">
            <FieldLabel>Modèle</FieldLabel>
            <div className="flex gap-1">
              <Select
                items={MODEL_ITEMS}
                value={model}
                onValueChange={(value) => {
                  if (value) updateNodeData(id, { model: value });
                }}
              >
                <SelectTrigger size="sm" className="min-w-0 flex-1" aria-label="Modèle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {IMAGE_MODEL_GROUPS.map((group) => (
                    <SelectGroup key={group}>
                      <SelectLabel>{group}</SelectLabel>
                      {IMAGE_MODELS.filter((m) => m.group === group).map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label}
                          <span className="text-muted-foreground">{priceLabel(m.id)}</span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label="Définir comme modèle par défaut"
                      onClick={saveFavorite}
                    />
                  }
                >
                  <StarIcon />
                </TooltipTrigger>
                <TooltipContent>Définir comme modèle par défaut</TooltipContent>
              </Tooltip>
            </div>
            {faceIgnored && (
              <p className="text-[11px] text-destructive">
                {imageModelLabel(model)} ne prend pas en compte les visages : le personnage branché sera ignoré.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Format</FieldLabel>
            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={0}
              className="w-full"
              aria-label="Format"
              value={(ASPECT_RATIOS as readonly string[]).includes(aspectRatio) ? [aspectRatio] : []}
              onValueChange={(value) => {
                const next = ASPECT_RATIOS.find((ratio) => ratio === value[0]);
                if (next) updateNodeData(id, { aspectRatio: next });
              }}
            >
              {ASPECT_RATIOS.map((ratio) => (
                <ToggleGroupItem key={ratio} value={ratio} className="flex-1">
                  {ASPECT_LABELS[ratio]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Résolution{data.imageSize ? "" : " · réglage par défaut"}</FieldLabel>
            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={0}
              className="w-full"
              aria-label="Résolution"
              value={data.imageSize ? [data.imageSize] : []}
              onValueChange={(value) => {
                const next = IMAGE_RESOLUTIONS.find((size) => size === value[0]);
                if (next) updateNodeData(id, { imageSize: next });
              }}
            >
              {IMAGE_RESOLUTIONS.map((size) => (
                <ToggleGroupItem key={size} value={size} className="flex-1">
                  {size}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="space-y-1.5">
            <FieldLabel>{abActive ? "Images par variante" : "Images"}</FieldLabel>
            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={0}
              className="w-full"
              aria-label="Images"
              value={[String(numImages)]}
              onValueChange={(value) => {
                const next = IMAGE_COUNTS.find((count) => String(count) === value[0]);
                if (next) updateNodeData(id, { numImages: next });
              }}
            >
              {IMAGE_COUNTS.map((count) => (
                <ToggleGroupItem key={count} value={String(count)} className="flex-1">
                  {count}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs text-foreground">
              <FlaskConicalIcon className="size-3.5 text-muted-foreground" aria-hidden />
              Test A/B
            </span>
            <Switch
              size="sm"
              aria-label="Test A/B"
              checked={abActive}
              onCheckedChange={(checked) => requestVariants(checked ? ["A", "B"] : ["A"])}
            />
          </div>

          <Collapsible>
            <CollapsibleTrigger
              render={
                <Button type="button" variant="ghost" size="xs" className="w-full justify-between px-1 text-muted-foreground" />
              }
            >
              Avancé
              <ChevronDownIcon className="transition-transform group-data-[panel-open]/button:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1 pt-1">
              <FieldLabel>Comparer des modèles</FieldLabel>
              {abActive && (
                <p className="text-[11px] text-muted-foreground">
                  Indisponible en test A/B : toutes les variantes utilisent le modèle principal.
                </p>
              )}
              {IMAGE_MODELS.filter((m) => m.id !== model).map((m) => (
                <label
                  key={m.id}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-1 py-1 text-xs",
                    abActive ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-muted",
                    !abActive && compareModels.includes(m.id) && "bg-muted",
                  )}
                >
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={compareModels.includes(m.id)}
                    disabled={abActive}
                    onChange={() => toggleCompareModel(m.id)}
                  />
                  <span className="min-w-0 flex-1 truncate">{m.label}</span>
                  <span className="text-muted-foreground">{priceLabel(m.id)}</span>
                </label>
              ))}
            </CollapsibleContent>
          </Collapsible>
        </section>

        {/* In normal mode the single output sits next to the button; in A/B mode each variant title carries its own. */}
        <div className="relative -mx-3 px-3">
          <Button
            type="button"
            className="h-auto w-full flex-col gap-0.5 py-2"
            disabled={Boolean(data.isGenerating)}
            onClick={() => void run(compareModels)}
          >
            {data.isGenerating ? (
              <span className="flex items-center gap-1.5">
                <LoaderCircleIcon className="animate-spin" />
                Génération en cours…
              </span>
            ) : (
              <>
                <span>Générer</span>
                <span className="text-xs font-normal opacity-80">{summary}</span>
              </>
            )}
          </Button>
          {!abActive && <Handle type="source" position={Position.Right} id={resultHandle("A")} />}
        </div>

        {error && (
          <Alert variant="destructive" className="px-2.5 py-1.5">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        <ConfirmDialog
          open={pendingRemoval !== null}
          onOpenChange={(open) => {
            if (!open) setPendingRemoval(null);
          }}
          title={pendingRemoval?.copy.title ?? ""}
          description={pendingRemoval?.copy.description ?? ""}
          confirmLabel={pendingRemoval?.copy.confirmLabel ?? "Confirmer"}
          onConfirm={() => {
            if (pendingRemoval) setGeneratorVariants(id, pendingRemoval.variants);
            setPendingRemoval(null);
          }}
        />
      </div>
    </NodeShell>
  );
}
```

- [ ] **Step 3: Remove the dead Ideogram fields from `NodeData`**

In `src/store/canvas-store.ts`, delete these lines from the `NodeData` type:

```ts
  ideogramMode?: "generate" | "remix" | "edit";
```

```ts
  imageWeight?: number;
  styleType?: string;
  renderingSpeed?: string;
```

```ts
  maskDataUrl?: string;
```

Then:

```bash
grep -rn "ideogramMode\|renderingSpeed\|styleType\|imageWeight\|maskDataUrl" src tests
```

Expected: no output (Réglages already deleted the Ideogram routes). If a hit remains outside `GeneratorNode.tsx` / `canvas-store.ts`, stop and report it.

- [ ] **Step 4: Type-check, lint, full suite**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/components/nodes/GeneratorNode.tsx src/store/canvas-store.ts
./node_modules/.bin/vitest run
```

Expected: `tsc` exits 0; ESLint: no error; all tests pass.

- [ ] **Step 5: Check in the browser (throwaway dev server, port 3100)**

Start `THUMBGEN_DB_PATH="$(mktemp -d)/thumbgen.db" ./node_modules/.bin/next dev -p 3100` in the background and open `http://localhost:3100/miniatures`. « Nouvelle miniature » → title `Test générateur` → open its canvas. Add a Générateur (« Ajouter une première étape » → Générateur). **Never click « Générer ».**

1. The node is ~340 px wide: title « Générateur », model badge on the right of the header. Rows Personnage, Logo, Prompt, Croquis, Image de référence, each with « + Ajouter »; each row's handle sits on the left edge, centred on the row. The button reads « Générer » / « 1 image »; the output handle is on the right edge next to it.
2. « … » menu → « Renommer » → `Générateur test` → the title changes.
3. « + Ajouter » on the Prompt row → the step picker opens in connect mode (list filtered) → Prompt → a Prompt node appears on the left and its edge lands on the Prompt row. Type `Test A` in it → the row shows `Test A`.
4. Images « 3 » → « 3 images ». « Avancé » → tick one model → « 2 modèles × 3 images » → untick it; Images back to « 1 ».
5. Test A/B on → sections « Commun » (Personnage, Logo), « Variante A », « Variante B »; the Prompt edge still lands on Variante A's Prompt row; Variante B's Prompt row shows « hérité de A », a dimmed `Test A` and a « + »; output handles on the right of each variant title; summary « 2 variantes × 1 image · 2 images »; « Avancé » says the comparison is unavailable and the boxes are disabled.
6. « + » on Variante B's Prompt row → picker → Prompt → its edge lands on Variante B's Prompt row; type `Test B` → the badge disappears.
7. Drag from Variante B's Croquis handle to empty canvas → the picker lists Croquis (subtitle names the handle, not a raw id) → add → the edge lands on Variante B's Croquis row.
8. « + Variante C » → « Variante C » section with « Retirer »; summary « 3 variantes × 1 image · 3 images ». « Retirer » → C disappears at once (no edge on C, no dialog).
9. Test A/B off → dialog « Désactiver le test A/B ? » / « Désactiver le test A/B retire 2 branchements de la variante B. » → « Annuler » → still on. Off again → « Désactiver » → B's section and its two edges are gone; the Prompt B and Croquis nodes remain, unconnected.
10. `⌘Z` → B's section and both edges come back together.

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/components/nodes/GeneratorNode.tsx src/store/canvas-store.ts
git commit -m "feat(generator): clearer shadcn generator node with input rows and a Test A/B/C mode"
```

---

## Task 9: Agent blueprint accepts `abTest`; `apply_workflow` copies it

**Files:**
- Modify: `src/lib/agent/blueprint/schema.ts`
- Modify: `src/lib/agent/tools/apply-workflow.ts`
- Test: `tests/agent/blueprint-ab-test.test.ts`, `tests/agent/apply-workflow-ab-test.test.ts`

**Interfaces:**
- Consumes: `activeVariants`, `baseGeneratorHandle`, `parseGeneratorHandle` (Task 1).
- Produces: blueprint `generator.data.abTest?: { variants: ["A","B"] | ["A","B","C"] }` (also accepted flattened on the node); an edge to a `-b` / `-c` input handle fails validation unless its generator has that variant, with the message `Edge to "<handle>" needs variant <V> active on generator "<id>": set its data.abTest = { variants: [...] }, or connect to "<A handle>".` (or `Handle "<handle>" only exists on generator nodes; …` when the target is not a generator). `apply_workflow` writes `abTest` into the canvas generator's data.

- [ ] **Step 1: Write the failing tests**

Create `tests/agent/blueprint-ab-test.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { BlueprintSchema } from "@/lib/agent/blueprint/schema";

const prompt = (id: string) => ({ id, type: "prompt", data: { prompt: id } });
const generator = (data: Record<string, unknown> = {}) => ({
  id: "gen",
  type: "generator",
  data: { model: "nano-banana", aspectRatio: "16x9", ...data },
});

function issues(blueprint: unknown): string[] {
  const result = BlueprintSchema.safeParse(blueprint);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe("Blueprint — generator A/B/C test", () => {
  it.each([[["A", "B"]], [["A", "B", "C"]]])("accepts abTest.variants %j and keeps it in data", (variants) => {
    const result = BlueprintSchema.safeParse({ nodes: [generator({ abTest: { variants } })], edges: [] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.nodes[0].data.abTest).toEqual({ variants });
  });

  it("accepts abTest flattened on the node", () => {
    const result = BlueprintSchema.safeParse({
      nodes: [{ id: "gen", type: "generator", model: "nano-banana", aspectRatio: "16x9", abTest: { variants: ["A", "B"] } }],
      edges: [],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.nodes[0].data.abTest).toEqual({ variants: ["A", "B"] });
  });

  it.each([[["A"]], [["A", "C"]], [["B", "A"]], [["A", "B", "C", "D"]]])("rejects abTest.variants %j", (variants) => {
    expect(BlueprintSchema.safeParse({ nodes: [generator({ abTest: { variants } })], edges: [] }).success).toBe(false);
  });

  it("accepts per-variant edges when their variant is active", () => {
    const blueprint = {
      nodes: [prompt("pA"), prompt("pB"), prompt("pC"), generator({ abTest: { variants: ["A", "B", "C"] } })],
      edges: [
        { source: "pA", target: "gen", targetHandle: "prompt-in" },
        { source: "pB", target: "gen", targetHandle: "prompt-in-b" },
        { source: "pC", target: "gen", targetHandle: "prompt-in-c" },
      ],
    };
    expect(issues(blueprint)).toEqual([]);
  });

  it("rejects an edge to prompt-in-c when C is not active, with an explicit message", () => {
    const blueprint = {
      nodes: [prompt("pC"), generator({ abTest: { variants: ["A", "B"] } })],
      edges: [{ source: "pC", target: "gen", targetHandle: "prompt-in-c" }],
    };
    expect(issues(blueprint)).toEqual([
      'Edge to "prompt-in-c" needs variant C active on generator "gen": set its data.abTest = { variants: ["A","B","C"] }, or connect to "prompt-in".',
    ]);
  });

  it("rejects a B handle on a generator without abTest", () => {
    const blueprint = {
      nodes: [prompt("pB"), generator()],
      edges: [{ source: "pB", target: "gen", targetHandle: "sketch-in-b" }],
    };
    expect(issues(blueprint)).toEqual([
      'Edge to "sketch-in-b" needs variant B active on generator "gen": set its data.abTest = { variants: ["A","B"] }, or connect to "sketch-in".',
    ]);
  });

  it("rejects a variant handle on a node that is not a generator", () => {
    const blueprint = {
      nodes: [prompt("p1"), prompt("p2")],
      edges: [{ source: "p1", target: "p2", targetHandle: "ref-in-b" }],
    };
    expect(issues(blueprint)).toEqual([
      'Handle "ref-in-b" only exists on generator nodes; node "p2" is a prompt. Use "ref-in" instead.',
    ]);
  });

  it("still accepts a normal generator wired on A's handles", () => {
    const blueprint = {
      nodes: [prompt("p1"), generator()],
      edges: [{ source: "p1", target: "gen", targetHandle: "prompt-in" }],
    };
    expect(issues(blueprint)).toEqual([]);
  });
});
```

Create `tests/agent/apply-workflow-ab-test.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { applyWorkflowTool } from "@/lib/agent/tools/apply-workflow";
import { getDb } from "@/lib/db";

describe("apply_workflow — generator A/B/C test", () => {
  const projectId = "test-apply-workflow-ab";

  beforeEach(() => {
    getDb().prepare("INSERT OR REPLACE INTO projects (id, nodes, edges) VALUES (?, ?, ?)").run(projectId, "[]", "[]");
  });

  function persisted() {
    const row = getDb().prepare("SELECT nodes, edges FROM projects WHERE id = ?").get(projectId) as {
      nodes: string;
      edges: string;
    };
    return {
      nodes: JSON.parse(row.nodes) as Array<{ id: string; data: Record<string, unknown> }>,
      edges: JSON.parse(row.edges) as Array<{ source: string; targetHandle: string }>,
    };
  }

  it("copies abTest onto the canvas generator and keeps the variant edges", async () => {
    const blueprint = {
      nodes: [
        { id: "prompt-a", type: "prompt", data: { prompt: "Angle choc" } },
        { id: "prompt-b", type: "prompt", data: { prompt: "Angle démo" } },
        { id: "gen", type: "generator", data: { model: "nano-banana", aspectRatio: "16x9", abTest: { variants: ["A", "B"] } } },
      ],
      edges: [
        { source: "prompt-a", target: "gen", targetHandle: "prompt-in" },
        { source: "prompt-b", target: "gen", targetHandle: "prompt-in-b" },
      ],
    };
    const result = await applyWorkflowTool.handler({ project_id: projectId, blueprint });
    expect(result.isError).toBeFalsy();
    const { nodes, edges } = persisted();
    expect(nodes.find((n) => n.id === "gen")?.data.abTest).toEqual({ variants: ["A", "B"] });
    expect(edges.map((e) => [e.source, e.targetHandle])).toEqual([
      ["prompt-a", "prompt-in"],
      ["prompt-b", "prompt-in-b"],
    ]);
  });

  it("does not add abTest to a normal generator", async () => {
    const blueprint = {
      nodes: [{ id: "gen", type: "generator", data: { model: "openai", aspectRatio: "16x9" } }],
      edges: [],
    };
    await applyWorkflowTool.handler({ project_id: projectId, blueprint });
    expect(persisted().nodes[0].data).not.toHaveProperty("abTest");
  });

  it("refuses an edge to prompt-in-c when variant C is not active, and writes nothing", async () => {
    const blueprint = {
      nodes: [
        { id: "prompt-c", type: "prompt", data: { prompt: "Angle trois" } },
        { id: "gen", type: "generator", data: { model: "nano-banana", aspectRatio: "16x9", abTest: { variants: ["A", "B"] } } },
      ],
      edges: [{ source: "prompt-c", target: "gen", targetHandle: "prompt-in-c" }],
    };
    const result = await applyWorkflowTool.handler({ project_id: projectId, blueprint });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("prompt-in-c");
    expect(text).toContain("abTest");
    expect(persisted().nodes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `./node_modules/.bin/vitest run tests/agent/blueprint-ab-test.test.ts tests/agent/apply-workflow-ab-test.test.ts`
Expected: FAIL — invalid `abTest` values are accepted, variant edges are not checked, and `abTest` is missing from the persisted generator.

- [ ] **Step 3: Extend the blueprint schema**

Re-read `src/lib/agent/blueprint/schema.ts` (chantier A changed `faceReference`'s `image_source`). Then:

1. After `import { z } from "zod";` add:

```ts
import { activeVariants, baseGeneratorHandle, parseGeneratorHandle } from "@/lib/canvas/generator-variants";
```

2. Just before `const NodeDataByType = z.discriminatedUnion("type", [`, add:

```ts
// Générateur A/B/C test: ["A","B"] or ["A","B","C"], nothing else.
const AbTestSchema = z.object({
  variants: z.union([
    z.tuple([z.literal("A"), z.literal("B")]),
    z.tuple([z.literal("A"), z.literal("B"), z.literal("C")]),
  ]),
});
```

3. In the `generator` branch of `NodeDataByType`, after `count: z.number().int().min(1).max(10).optional(),` add:

```ts
    abTest: AbTestSchema.optional(),
```

4. Add `"abTest",` to the `KNOWN_DATA_KEYS` set (after `"count",`).

5. In `BlueprintSchema`'s `.superRefine((bp, ctx) => { … })`, after the `bp.edges.forEach` loop that reports unknown source/target ids, add:

```ts
    // Variant handles (prompt-in-b, sketch-in-c, …) only exist on a generator
    // whose abTest includes that variant.
    const nodesById = new Map(bp.nodes.map((n) => [n.id, n]));
    bp.edges.forEach((e, i) => {
      const handle = parseGeneratorHandle(e.targetHandle);
      if (handle?.kind !== "input" || handle.variant === "A") return;
      const target = nodesById.get(e.target);
      if (!target) return; // already reported as an unknown node id
      const base = baseGeneratorHandle(e.targetHandle);
      if (target.type !== "generator") {
        ctx.addIssue({
          code: "custom",
          path: ["edges", i, "targetHandle"],
          message: `Handle "${e.targetHandle}" only exists on generator nodes; node "${e.target}" is a ${target.type}. Use "${base}" instead.`,
        });
        return;
      }
      if (!activeVariants(target.data.abTest).includes(handle.variant)) {
        const variants = handle.variant === "C" ? '["A","B","C"]' : '["A","B"]';
        ctx.addIssue({
          code: "custom",
          path: ["edges", i, "targetHandle"],
          message: `Edge to "${e.targetHandle}" needs variant ${handle.variant} active on generator "${e.target}": set its data.abTest = { variants: ${variants} }, or connect to "${base}".`,
        });
      }
    });
```

- [ ] **Step 4: Copy `abTest` in `apply_workflow`**

Re-read `src/lib/agent/tools/apply-workflow.ts`. In `blueprintToCanvasData`, replace the `generator` case:

```ts
    case "generator":
      return {
        model: MODEL_ID_MAP[data.model as string] ?? data.model,
        aspectRatio: data.aspectRatio,
        numImages: data.count ?? 1,
      };
```

with

```ts
    case "generator":
      return {
        model: MODEL_ID_MAP[data.model as string] ?? data.model,
        aspectRatio: data.aspectRatio,
        numImages: data.count ?? 1,
        // A/B/C test: count stays per variant.
        ...(data.abTest ? { abTest: data.abTest } : {}),
      };
```

In the tool's `description` string, replace

```
Edge handles for the generator are: face-in, ref-in, logo-in, sketch-in, prompt-in.
```

with

```
Edge handles for the generator are: face-in, ref-in, logo-in, sketch-in, prompt-in. For an A/B/C test set the generator's data.abTest = { variants: ["A","B"] } or { variants: ["A","B","C"] }: variant B's own inputs go to prompt-in-b / sketch-in-b / ref-in-b, variant C's to prompt-in-c / sketch-in-c / ref-in-c, while face-in and logo-in are shared by every variant.
```

(Keep the rest of the description as it is on `main`.)

- [ ] **Step 5: Run the tests**

Run: `./node_modules/.bin/vitest run tests/agent/blueprint-ab-test.test.ts tests/agent/apply-workflow-ab-test.test.ts tests/agent/blueprint-schema.test.ts tests/agent/apply-workflow.test.ts`
Expected: PASS (12 + 3 new tests; the existing blueprint and apply_workflow tests still pass).

- [ ] **Step 6: Type-check and commit**

Run: `./node_modules/.bin/tsc --noEmit` — expected exit 0.

```bash
git add src/lib/agent/blueprint/schema.ts src/lib/agent/tools/apply-workflow.ts tests/agent/blueprint-ab-test.test.ts tests/agent/apply-workflow-ab-test.test.ts
git commit -m "feat(agent): blueprints can build A/B/C generators with per-variant input handles"
```

---

## Task 10: Canvas summaries expose `abTest`

**Files:**
- Create: `src/components/panels/chat/canvas-snapshot.ts`
- Modify: `src/components/panels/ChatPanel.tsx`
- Modify: `src/lib/agent/tools/get-canvas-state.ts`
- Test: `tests/agent/generator-summaries.test.ts`

**Interfaces:**
- Consumes: `summarizeAbTest` (Task 1).
- Produces: `snapshotCanvas(nodes: SnapshotNode[], edges: SnapshotEdge[]): unknown`, `summarizeNode(type: string, data: Record<string, unknown>): Record<string, unknown>` exported from `src/components/panels/chat/canvas-snapshot.ts`; the generator summary of both the chat snapshot and `get_canvas_state` is `{ model, aspectRatio, count, abTest? }` with `abTest: { variants }` only when the test is active.

- [ ] **Step 1: Write the failing tests**

Create `tests/agent/generator-summaries.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "@/lib/db";
import { getCanvasStateTool } from "@/lib/agent/tools/get-canvas-state";
import { snapshotCanvas, summarizeNode } from "@/components/panels/chat/canvas-snapshot";

describe("generator summaries expose the A/B/C test", () => {
  const projectId = "test-generator-summaries";

  beforeAll(() => {
    getDb()
      .prepare("INSERT OR REPLACE INTO projects (id, nodes, edges) VALUES (?, ?, ?)")
      .run(
        projectId,
        JSON.stringify([
          {
            id: "g-ab",
            type: "generator",
            data: { model: "gpt-image-2", aspectRatio: "16x9", numImages: 2, abTest: { variants: ["A", "B", "C"] } },
          },
          { id: "g-plain", type: "generator", data: { model: "gpt-image-2", aspectRatio: "16x9", numImages: 1 } },
          { id: "p-b", type: "prompt", data: { prompt: "B" } },
        ]),
        JSON.stringify([{ source: "p-b", target: "g-ab", targetHandle: "prompt-in-b" }]),
      );
  });

  async function canvasState() {
    const result = await getCanvasStateTool.handler({ project_id: projectId });
    return JSON.parse((result.content[0] as { text: string }).text) as {
      nodes: Array<{ id: string; summary: Record<string, unknown> }>;
      edges: Array<{ targetHandle?: string }>;
    };
  }

  it("get_canvas_state reports abTest.variants and the image count of an A/B/C generator", async () => {
    const state = await canvasState();
    expect(state.nodes.find((n) => n.id === "g-ab")?.summary).toEqual({
      model: "gpt-image-2",
      aspectRatio: "16x9",
      count: 2,
      abTest: { variants: ["A", "B", "C"] },
    });
    expect(state.edges[0].targetHandle).toBe("prompt-in-b");
  });

  it("get_canvas_state leaves abTest out for a normal generator", async () => {
    const state = await canvasState();
    expect(state.nodes.find((n) => n.id === "g-plain")?.summary).not.toHaveProperty("abTest");
  });

  it("the chat snapshot summarizes abTest the same way", () => {
    expect(
      summarizeNode("generator", { model: "m", aspectRatio: "16x9", numImages: 1, abTest: { variants: ["A", "B"] } }),
    ).toEqual({ model: "m", aspectRatio: "16x9", count: 1, abTest: { variants: ["A", "B"] } });
    expect(summarizeNode("generator", { model: "m", abTest: { variants: ["A"] } }).abTest).toBeUndefined();
  });

  it("the chat snapshot keeps variant target handles", () => {
    const snapshot = snapshotCanvas(
      [{ id: "g", type: "generator", data: { abTest: { variants: ["A", "B"] } } }],
      [{ source: "p", target: "g", targetHandle: "prompt-in-b" }],
    ) as { edges: Array<{ targetHandle?: string | null }> };
    expect(snapshot.edges[0].targetHandle).toBe("prompt-in-b");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `./node_modules/.bin/vitest run tests/agent/generator-summaries.test.ts`
Expected: FAIL — `Failed to resolve import "@/components/panels/chat/canvas-snapshot"`.

- [ ] **Step 3: Move the snapshot helpers out of `ChatPanel.tsx`**

Re-read `src/components/panels/ChatPanel.tsx`. Create `src/components/panels/chat/canvas-snapshot.ts`:

```ts
import { summarizeAbTest } from "@/lib/canvas/generator-variants";

export type SnapshotNode = { id: string; type?: string; data?: Record<string, unknown> };
export type SnapshotEdge = { source: string; target: string; targetHandle?: string | null };

/**
 * Compact canvas description sent with every agent turn (`canvas_snapshot`),
 * rendered into the system prompt as <canvas_state>. No binary image data.
 */
export function snapshotCanvas(nodes: SnapshotNode[], edges: SnapshotEdge[]): unknown {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      summary: summarizeNode(n.type ?? "", n.data ?? {}),
    })),
    edges: edges.map((e) => ({ source: e.source, target: e.target, targetHandle: e.targetHandle })),
  };
}

export function summarizeNode(type: string, data: Record<string, unknown>): Record<string, unknown> {
  switch (type) {
    case "prompt":
      return { prompt: data.prompt, negativePrompt: data.negativePrompt };
    case "generator":
      // Generator nodes use `count` — `numImages` was a documentation error.
      return {
        model: data.model,
        aspectRatio: data.aspectRatio,
        count: data.count ?? data.numImages,
        abTest: summarizeAbTest(data.abTest),
      };
    case "faceReference":
    case "swipeFile":
    case "sketch":
      return {
        hasImage: Boolean(data.imageBase64 || data.imageUrl),
        label: data.label,
      };
    default:
      return {};
  }
}
```

If the current `summarizeNode` in `ChatPanel.tsx` has `case` branches not shown above (added by chantier A), copy them into the new file unchanged; only the `generator` branch changes.

In `ChatPanel.tsx`, delete the `// --- Helpers ---` comment and the two local functions `snapshotCanvas` and `summarizeNode` below it, and add next to the other `./chat/…` imports:

```ts
import { snapshotCanvas } from "./chat/canvas-snapshot";
```

- [ ] **Step 4: Expose `abTest` in `get_canvas_state`**

Re-read `src/lib/agent/tools/get-canvas-state.ts`. Add the import:

```ts
import { summarizeAbTest } from "@/lib/canvas/generator-variants";
```

and in `summarize`, replace the generator case:

```ts
    case "generator":
      return { model: data.model, aspectRatio: data.aspectRatio, count: data.count };
```

with

```ts
    case "generator":
      return {
        model: data.model,
        aspectRatio: data.aspectRatio,
        // Canvas nodes store numImages; blueprints say count.
        count: data.count ?? data.numImages,
        abTest: summarizeAbTest(data.abTest),
      };
```

- [ ] **Step 5: Run the tests, type-check, lint**

```bash
./node_modules/.bin/vitest run tests/agent/generator-summaries.test.ts tests/agent/get-canvas-state.test.ts
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/components/panels/ChatPanel.tsx src/components/panels/chat/canvas-snapshot.ts src/lib/agent/tools/get-canvas-state.ts
```

Expected: PASS (4 new tests, existing `get_canvas_state` tests unchanged); `tsc` exits 0; ESLint: no error.

- [ ] **Step 6: Commit**

```bash
git add src/components/panels/chat/canvas-snapshot.ts src/components/panels/ChatPanel.tsx src/lib/agent/tools/get-canvas-state.ts tests/agent/generator-summaries.test.ts
git commit -m "feat(agent): canvas summaries show a generator's A/B/C variants"
```

---

## Task 11: System prompt — one A/B/C generator per multi-angle choice

**Files:**
- Modify: `src/lib/agent/system-prompt.ts`
- Test: `tests/agent/system-prompt-ab-test.test.ts`

**Interfaces:**
- Consumes: the handles and `abTest` shape accepted in Task 9.
- Produces: `AGENT_SYSTEM_PROMPT`'s « MULTI-SELECT FOR A/B TESTING » section instructs one generator with `abTest`, shared Personnage/Logo wired once, a prompt (and optionally sketch/reference) per variant on the `-b` / `-c` handles, several generators of at most 3 variants beyond 3 angles, and YouTube Studio's 3-thumbnail limit.

- [ ] **Step 1: Write the failing test**

Create `tests/agent/system-prompt-ab-test.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { AGENT_SYSTEM_PROMPT } from "@/lib/agent/system-prompt";

describe("system prompt — A/B/C test", () => {
  it("builds one generator with abTest when the user picks 2 or 3 angles", () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('abTest: { variants: ["A","B"] }');
    expect(AGENT_SYSTEM_PROMPT).toContain('abTest: { variants: ["A","B","C"] }');
    expect(AGENT_SYSTEM_PROMPT).not.toContain("SEPARATE prompt + generator pair");
  });

  it("wires shared inputs once and per-variant inputs on the -b / -c handles", () => {
    for (const handle of ["face-in", "logo-in", "prompt-in-b", "prompt-in-c", "sketch-in-b", "ref-in-c"]) {
      expect(AGENT_SYSTEM_PROMPT).toContain(`"${handle}"`);
    }
  });

  it("caps a test at 3 variants, like YouTube Studio", () => {
    expect(AGENT_SYSTEM_PROMPT).toContain("YouTube Studio");
    expect(AGENT_SYSTEM_PROMPT).toContain("up to 3 thumbnails");
    expect(AGENT_SYSTEM_PROMPT).toContain("at most 3 variants");
  });
});
```

Run: `./node_modules/.bin/vitest run tests/agent/system-prompt-ab-test.test.ts`
Expected: FAIL — the prompt still describes separate prompt + generator pairs.

- [ ] **Step 2: Rewrite the section**

Re-read `src/lib/agent/system-prompt.ts` (Réglages and chantier A both edited `AGENT_SYSTEM_PROMPT`). Inside the `AGENT_SYSTEM_PROMPT` template literal, replace everything from the line starting with `MULTI-SELECT FOR A/B TESTING —` down to and including the line starting with `This is the core loop:` (the last line before the closing `` `; ``) with:

```text
MULTI-SELECT FOR A/B TESTING — if the user picks 2 or 3 angles ("A et C", "garde les trois", "je veux tester plusieurs directions"), ship them as ONE A/B/C test, not as separate workflows. YouTube Studio's "Tester et comparer" tests up to 3 thumbnails per video, and a single ThumbGen generator holds up to 3 variants:
- Build a SINGLE apply_workflow call with ONE generator whose data includes abTest: { variants: ["A","B"] } for 2 angles, or abTest: { variants: ["A","B","C"] } for 3 angles. The first chosen angle is variant A, the second B, the third C.
- Wire the shared inputs ONCE, on the handles every variant uses: the Personnage faceReference on "face-in" and the logo swipeFile on "logo-in". Never duplicate them per variant.
- Give each variant its own prompt node: variant A's on "prompt-in", B's on "prompt-in-b", C's on "prompt-in-c". When an angle needs its own sketch or reference image, use the same pattern: "sketch-in" / "sketch-in-b" / "sketch-in-c" and "ref-in" / "ref-in-b" / "ref-in-c". Use unique node ids per variant (e.g. prompt-a, prompt-b, sketch-b).
- A variant with nothing wired on one of its own handles reuses variant A's input on that handle, so wire only what differs between angles — but always give every variant its own prompt.
- Edges to "-b" handles require "B" in abTest.variants and edges to "-c" handles require "C"; apply_workflow rejects them otherwise.
- Every variant uses the generator's model (chosen with the model rules above) and its count, which is PER VARIANT — keep count 1 unless the user asks for more.
- 4 angles or more: build several A/B/C generators of at most 3 variants each (e.g. 4 angles → one A/B/C generator + one A/B generator), each with its own shared-input edges.
After apply_workflow succeeds, tell the user the A/B test is on the canvas: one click on "Générer" produces one Aperçu per variant, titled "Variante A", "Variante B" (and "Variante C"), ready to compare and to test in YouTube Studio. Don't silently pick a "best" one for them — A/B testing means they compare the real outputs themselves.

This is the core loop: gather → propose 3 visual options → user picks (one, or 2-3 for an A/B/C test) → SHIP the full workflow → user clicks Générer.
```

(The text contains no backtick and no `${`, so it is safe inside the template literal.)

- [ ] **Step 3: Run the prompt tests**

Run: `./node_modules/.bin/vitest run tests/agent/system-prompt-ab-test.test.ts tests/agent/system-prompt.test.ts`
Expected: PASS (3 new tests; the Réglages system-prompt tests unchanged).

- [ ] **Step 4: Type-check and commit**

Run: `./node_modules/.bin/tsc --noEmit` — expected exit 0.

```bash
git add src/lib/agent/system-prompt.ts tests/agent/system-prompt-ab-test.test.ts
git commit -m "feat(agent): multi-angle picks become one A/B/C generator"
```

---

## Task 12: Docker rebuild and live verification

**Files:** none modified (verification only). If a check fails, fix it in the file owned by the relevant task, re-run `tsc` + `vitest`, commit with a `fix(generator): …` message, and only then rebuild — the single rebuild of this plan happens after every check that does not need the container passes locally.

**Safety rules for this task.** The container serves the user's real database and real API keys.
- Do not modify or delete existing projects. Open one only to look at it.
- All edits happen in a new project named `Test A/B (vérification)`; leave it in place and mention it in the report.
- Exactly one image generation (2 images, about $0.04) and one agent message.
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

- [ ] **Step 3: An existing generator is unchanged**

In `http://localhost:3000/miniatures`, open a project that already has a Générateur (without editing anything): its node shows the new rows; every existing edge into it is still drawn and lands on the matching row (Prompt, Personnage, Logo, Croquis, Image de référence); edges out of it start from the output next to « Générer »; the summary matches its image count; Test A/B is off.

- [ ] **Step 4: Build an A/B test by hand**

« Nouvelle miniature » → `Test A/B (vérification)` → open it. Add a Générateur. Select the model « Gemini 3.1 Flash », Images « 1 ».
1. « + Ajouter » on Prompt → Prompt → type `Miniature YouTube : un chat astronaute qui salue, fond violet`.
2. Test A/B on → Variante B's Prompt row shows « hérité de A » → « + » → Prompt → type `Miniature YouTube : un chien pirate qui rit, fond orange` → the badge disappears.
3. « + Variante C » → « + Ajouter » on C's Prompt → Prompt → type `C`; « Retirer » on C → dialog « Retirer la variante C ? » / « Retirer la variante C retire 1 branchement de la variante C. » → « Annuler » → C stays → « Retirer » → « Retirer » → C and its edge are gone (the Prompt C node remains; delete it with Backspace).
4. The button reads « Générer » / « 2 variantes × 1 image · 2 images ». Click it once.
5. While generating: spinner, button disabled. Then two Aperçu nodes titled « Variante A » and « Variante B », wired from Variante A's and Variante B's output handles, each showing an image (cat, then dog).
6. `curl -s http://localhost:3000/api/projects` still lists the project, and the gallery (`/miniatures`) shows its new images.
7. Test A/B off → dialog « Désactiver le test A/B retire 2 branchements de la variante B. » → « Annuler » (keep the test on for the next step).

- [ ] **Step 5: Agent builds one A/B generator**

Open the agent panel on `Test A/B (vérification)` and send:

```text
Sans recherche ni croquis : sur ce canvas, construis directement un test A/B avec un seul générateur (modèle nano-banana, format 16x9, 1 image) et deux prompts. A : « Visage choqué devant un graphique qui s'effondre ». B : « Visage souriant devant une fusée qui décolle ».
```

Expected: `apply_workflow` succeeds; the canvas reloads with **one** Générateur with Test A/B on, Variante A's Prompt row showing the first prompt and Variante B's the second (no « hérité de A » on Prompt rows). Do not click « Générer ».

- [ ] **Step 6: Logs and report**

```bash
docker compose logs --tail 100 thumbgen | grep -i "error\|warn" || echo "no errors"
```

Report every check above with pass/fail, the name of the test project left in the gallery, and any fix commits.

---

## Self-review against the spec

- §1 Nettoyage (Ideogram state, deps, fields, UI; `NodeData` fields) → Task 8 (Steps 2–3).
- §2 Structure: shadcn components inside the existing shell, ~340 px, renamable title + model `Badge` → Tasks 7–8 (ruling 8); input rows with in-row handles, previews, « + Ajouter » opening the picker in connect mode, « hérité de A » → Tasks 3, 7, 8; Modèle `Select` grouped + star, Format / Résolution / Images `ToggleGroup`, Test A/B `Switch`, « Avancé » `Collapsible` with comparison disabled in A/B mode → Task 8; « Générer » with computed summary, loading state (ruling 7) → Tasks 2, 8; error `Alert` unchanged → Task 8.
- §3 Mode A/B/C: `abTest` data and `["A","B"]` on switch → Tasks 5, 8; common and per-variant handles, outputs → Tasks 1, 8; inheritance → Task 1; sections, handles always mounted, « + Variante C », « Retirer » → Task 8; confirmation and edge removal → Tasks 1, 5, 8 (rulings 14–15); `planGeneration`, `resolveVariantInputs`, store extension → Tasks 1, 2, 5 (rulings 2–4); parallel tasks, one Aperçu per image titled per variant from its output → Task 7 (ruling 5); `generatedImagesByVariant` + `generatedImages` for A → Tasks 5, 7 (ruling 6); `projectId` on every call → Task 7.
- §4 Agent: schema `abTest` + variant edge validation → Task 9; `apply_workflow` copies `abTest` → Task 9; `get_canvas_state` and `snapshotCanvas` / `summarizeNode` → Task 10 (ruling 12); system prompt section → Task 11.
- Catalog extension for variant handles (chantier A interface) → Task 6; per-variant sketches and logos actually reaching the model → Task 4 (ruling 1).
- Tests list: `resolveVariantInputs` → Task 1; `planGeneration` → Task 2; handle removal → Task 1 (+ store Task 5); blueprint + `apply_workflow` → Task 9; summaries → Task 10.
- Manual checks: existing generator unchanged, A/B on, add/remove C with confirmation, « + Ajouter » on the right variant handle, « hérité de A », A/B generation with titled Aperçus, button summary, agent picking 2 angles → Task 8 Step 5 (dev server) and Task 12 (live).
- Out of scope respected: no « Comparaison A/B » node, no YouTube publishing, no other node redesign, no per-variant model.
