"use client";

import { useCallback, useState } from "react";
import { useCanvasStore, type AppNode, type NodeData } from "@/store/canvas-store";
import {
  buildGenerationPayload,
  generationPayloadFits,
  type GenerationPayload,
  type ImageLoader,
} from "@/lib/canvas/generator-payload";
import { compactGenerationImageRef, isServerResolvableGenerationRef } from "@/lib/canvas/image-refs";
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
import {
  beginGeneratorRun,
  endGeneratorRun,
  isAbortError,
} from "@/lib/canvas/generation-abort";
import { debugLog } from "@/lib/debug-log";
import { GENERATE_EMPTY_FR, GENERATION_FAILED_FR, generationErrorFields, PAYLOAD_TOO_LARGE_FR, userFacingGenerateError } from "@/lib/generation/generate-error";

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
    const compact = compactGenerationImageRef(src);
    if (isServerResolvableGenerationRef(compact) && !compact.startsWith("data:")) {
      return Promise.resolve(compact);
    }
    let pending = cache.get(src);
    if (!pending) {
      pending = fetchAsDataUrl(src);
      cache.set(src, pending);
    }
    return pending;
  };
}

type GenerateResult = { images: string[]; totalTokens: number; warnings?: string[] };

class GenerationJobError extends Error {
  status?: number;
  provider?: string;
  constructor(message: string, extra?: { status?: number; provider?: string }) {
    super(message);
    this.name = "GenerationJobError";
    this.status = extra?.status;
    this.provider = extra?.provider;
  }
}

async function requestGeneration(body: Record<string, unknown>, signal: AbortSignal): Promise<GenerateResult> {
  const res = await fetch("/api/generate/openrouter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const errData = (await res.json().catch(() => ({}))) as {
      error?: unknown;
      status?: unknown;
      provider?: unknown;
    };
    const raw = typeof errData.error === "string" && errData.error.trim()
      ? errData.error
      : `Échec de la génération (${res.status})`;
    throw new GenerationJobError(userFacingGenerateError(raw), {
      status: typeof errData.status === "number" ? errData.status : res.status,
      provider: typeof errData.provider === "string" ? errData.provider : undefined,
    });
  }
  const result = await res.json();
  return { images: result.images || [], totalTokens: result.stats?.totalTokens || 0, warnings: result.warnings };
}

type Job = { previewId: string; variant: VariantId; model: string; payload?: GenerationPayload };

/**
 * Runs a generator: plans the tasks (models or variants), creates one Aperçu
 * per image in « loading » state wired from the variant's output, generates in
 * parallel, then stores the images per variant on the generator. The only
 * code that turns variants into paid requests and Aperçu nodes — kept as a
 * plain function (no hook) so it can run against the real store in tests
 * without a React tree.
 *
 * Returns the pre-run guard's or the run's error message, or `null` on
 * success (including the no-op case: node missing or already generating).
 */
export async function runGenerator(nodeId: string, compareModels: readonly string[]): Promise<string | null> {
  const store = useCanvasStore.getState();
  const node = store.nodes.find((n) => n.id === nodeId);
  if (!node || node.data.isGenerating) return null;
  const { data, position } = node;
  const signal = beginGeneratorRun(nodeId);
  debugLog("generate", "start", {
    nodeId,
    model: data.model,
    abTest: Boolean(data.abTest),
    variants: data.abTest?.variants?.length ?? 1,
    numImages: data.numImages ?? 1,
    projectId: store.currentProjectId,
  });
  store.updateNodeData(nodeId, { isGenerating: true });
  const jobs: Job[] = [];

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

    tasks.forEach((task, taskIndex) => {
      const modelLabel = imageModelLabel(task.model);
      for (let i = 0; i < task.count; i++) {
        const suffix = task.count > 1 ? ` #${i + 1}` : "";
        const column = abActive ? i : jobs.length;
        const row = abActive ? taskIndex : 0;
        const previewData: NodeData = {
          label: abActive ? `Variante ${task.variant}${suffix}` : `${modelLabel}${suffix}`,
          genStatus: "loading",
          genModel: modelLabel,
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
        jobs.push({ previewId, variant: task.variant, model: task.model });
      }
    });

    const loadImage = createImageLoader();
    const inputsPerVariant = new Map(tasks.map((task) => [task.variant, task.inputs]));
    const payloads = new Map<VariantId, GenerationPayload>(
      await Promise.all(
        Array.from(inputsPerVariant, async ([variant, inputs]) => [variant, await buildGenerationPayload(inputs, loadImage)] as const),
      ),
    );
    for (const job of jobs) {
      const payload = payloads.get(job.variant);
      if (!payload) {
        useCanvasStore.getState().updateNodeData(job.previewId, {
          genStatus: "error",
          genError: GENERATION_FAILED_FR,
        });
        continue;
      }
      job.payload = payload;
      useCanvasStore.getState().updateNodeData(job.previewId, { genPromptUsed: payload.prompt });
    }

    const outcomes = await Promise.all(
      jobs.filter((job) => job.payload).map(async (job) => {
        const start = Date.now();
        try {
          if (!job.payload || !generationPayloadFits(job.payload)) {
            throw new GenerationJobError(job.payload ? PAYLOAD_TOO_LARGE_FR : GENERATION_FAILED_FR);
          }
          const result = await requestGeneration({
            ...job.payload,
            aspectRatio: data.aspectRatio || "16x9",
            model: job.model,
            // Unset on older and agent-built nodes: the route then uses defaultResolution.
            imageSize: data.imageSize,
            // Ties the stored image to the project, the unit the miniatures gallery groups by.
            projectId: useCanvasStore.getState().currentProjectId,
          }, signal);
          if (result.images.length === 0) {
            throw new GenerationJobError(GENERATE_EMPTY_FR);
          }
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
          const cancelled = isAbortError(err);
          const fields = generationErrorFields(err);
          debugLog(
            "generate",
            cancelled ? "job cancelled" : "job error",
            { previewId: job.previewId, variant: job.variant, ...(cancelled ? {} : fields) },
            cancelled ? "warn" : "error",
          );
          useCanvasStore.getState().updateNodeData(job.previewId, {
            genStatus: "error",
            genError: cancelled ? "Génération interrompue" : fields.error,
            genTimeMs: Date.now() - start,
          });
          return { variant: job.variant, images: [] as string[], error: cancelled ? undefined : fields.error };
        }
      }),
    );

    const produced: Partial<Record<VariantId, string[]>> = {};
    const skipped = jobs
      .filter((job) => !job.payload)
      .map((job) => ({ variant: job.variant, error: GENERATION_FAILED_FR }));
    const failed = [
      ...skipped,
      ...outcomes.flatMap((outcome) => (outcome.error ? [{ variant: outcome.variant, error: outcome.error }] : [])),
    ];
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
    const producedCount = outcomes.filter((outcome) => outcome.images.length > 0).length;
    debugLog("generate", "done", {
      nodeId,
      jobs: jobs.length,
      produced: producedCount,
      ...(failed.length > 0 ? { failed } : {}),
    });
    return null;
  } catch (err) {
    const cancelled = isAbortError(err);
    const fields = generationErrorFields(err);
    debugLog(
      "generate",
      cancelled ? "cancelled" : "error",
      { nodeId, ...(cancelled ? {} : fields) },
      cancelled ? "warn" : "error",
    );
    for (const job of jobs) {
      const preview = useCanvasStore.getState().nodes.find((item) => item.id === job.previewId);
      if (preview?.data.genStatus === "loading") {
        useCanvasStore.getState().updateNodeData(job.previewId, {
          genStatus: "error",
          genError: cancelled ? "Génération interrompue" : fields.error,
        });
      }
    }
    useCanvasStore.getState().updateNodeData(nodeId, { isGenerating: false });
    return cancelled ? null : fields.error;
  } finally {
    endGeneratorRun(nodeId, signal);
    if (useCanvasStore.getState().loaded) {
      await useCanvasStore.getState().flushPendingSave();
    }
  }
}

/** Thin React wrapper around {@link runGenerator}: just the `error` state. */
export function useGeneratorRun(nodeId: string) {
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (compareModels: readonly string[]) => {
      setError(null);
      const message = await runGenerator(nodeId, compareModels);
      if (message) setError(message);
    },
    [nodeId],
  );

  return { run, error };
}
