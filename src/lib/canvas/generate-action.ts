import {
  activeVariants,
  generationSummary,
  isAbTestActive,
  planGeneration,
  resolveVariantInputs,
  type EdgeLike,
  type NodeLike,
  type ResolvedVariantInputs,
  type VariantId,
} from "./generator-variants";
import { DEFAULT_IMAGE_MODEL } from "@/lib/image-models";
import { MODEL_COSTS } from "@/lib/model-costs";

/**
 * The chat's « Générer » action (finish_turn `generate`, chantier F2): label
 * and cost computed by the app from the generator node as it is now — never
 * written by the model. Same plan as the node's own button (without « Comparer
 * des modèles », which the chat's run does not use).
 */
export type GenerateActionState =
  | { status: "missing" }
  | { status: "generating" }
  | { status: "ready"; label: string; costUsd: number };

/** `~0,02 $`: at most 3 decimals, at least 2, French decimal comma. */
export function formatUsdEstimate(value: number): string {
  const fixed = value.toFixed(3).replace(/(\.\d\d)0$/, "$1");
  return `~${fixed.replace(".", ",")} $`;
}

export function generateActionState<N extends NodeLike>(nodeId: string, nodes: readonly N[], edges: readonly EdgeLike[]): GenerateActionState {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node || node.type !== "generator") return { status: "missing" };
  const data = (node.data && typeof node.data === "object" ? node.data : {}) as Record<string, unknown>;
  if (data.isGenerating) return { status: "generating" };

  const inputsByVariant: Partial<Record<VariantId, ResolvedVariantInputs<N>>> = {};
  for (const variant of activeVariants(data.abTest)) {
    inputsByVariant[variant] = resolveVariantInputs(edges, nodes, nodeId, variant);
  }
  const tasks = planGeneration(
    {
      model: typeof data.model === "string" && data.model ? data.model : DEFAULT_IMAGE_MODEL,
      numImages: typeof data.numImages === "number" ? data.numImages : undefined,
      abTest: data.abTest,
      compareModels: [],
    },
    inputsByVariant,
  );
  const summary = generationSummary(tasks, isAbTestActive(data.abTest));
  const costUsd = Math.round(tasks.reduce((sum, task) => sum + (MODEL_COSTS[task.model] ?? 0) * task.count, 0) * 1000) / 1000;
  return {
    status: "ready",
    label: costUsd > 0 ? `Générer · ${summary} · ${formatUsdEstimate(costUsd)}` : `Générer · ${summary}`,
    costUsd,
  };
}
