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
