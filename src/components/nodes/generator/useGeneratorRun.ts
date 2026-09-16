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
