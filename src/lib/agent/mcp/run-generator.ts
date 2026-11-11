import { NextRequest } from "next/server";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import { POST as generateImage } from "@/app/api/generate/openrouter/route";
import { createCanvasSnapshot, writeProjectCanvas } from "@/lib/canvas-snapshots";
import { nextUpdatedAt } from "@/lib/canvas/canvas-patch";
import {
  buildGenerationPayload,
  generationPayloadFits,
  type GenerationPayload,
  type PayloadNode,
} from "@/lib/canvas/generator-payload";
import {
  activeVariants,
  imageCount,
  isAbTestActive,
  resolveVariantInputs,
  resultHandle,
  type VariantId,
} from "@/lib/canvas/generator-variants";
import { toImageSourceRef } from "@/lib/canvas/image-refs";
import { DEFAULT_IMAGE_MODEL, imageModelLabel } from "@/lib/image-models";
import { MODEL_COSTS } from "@/lib/model-costs";
import { debugLog } from "@/lib/debug-log";
import type { ToolResult } from "@/lib/agent/tools/types";

/**
 * Server-side twin of the canvas « Générer » button (useGeneratorRun.ts), for
 * MCP clients: there is no browser to click it. Reads the generator's inputs
 * from the stored canvas, sends one paid request per image through the same
 * /api/generate/openrouter handler, then writes the Aperçu nodes and the
 * generator's images back to the canvas.
 */

// Same layout as useGeneratorRun.ts.
const PREVIEW_OFFSET_X = 400;
const PREVIEW_COLUMN_GAP = 350;
const PREVIEW_ROW_GAP = 420;
/** A/B/C × 4 images: what the canvas itself allows in one click. */
const MAX_JOBS = 12;

type StoredNode = {
  id: string;
  type: string;
  position?: { x: number; y: number };
  data: Record<string, unknown>;
};
type StoredEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
};

export type RunGeneratorInput = {
  project_id: string;
  node_id?: string;
  variants?: VariantId[];
};

type Job = { variant: VariantId; index: number; payload: GenerationPayload };
type JobOutcome =
  | { job: Job; ok: true; images: string[]; timeMs: number; tokens: number }
  | { job: Job; ok: false; error: string; timeMs: number };

function parseArray<T>(json: string): T[] {
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

function fail(text: string, requestNotSent = true): ToolResult {
  return { isError: true, requestNotSent, content: [{ type: "text", text }] };
}

async function requestImage(body: Record<string, unknown>): Promise<{ images: string[]; tokens: number }> {
  const request = new NextRequest("http://thumbgen.internal/api/generate/openrouter", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const response = await generateImage(request);
  const json = (await response.json().catch(() => ({}))) as {
    images?: unknown;
    error?: unknown;
    stats?: { totalTokens?: number };
  };
  if (!response.ok) {
    throw new Error(typeof json.error === "string" && json.error ? json.error : `Échec de la génération (${response.status})`);
  }
  const images = Array.isArray(json.images) ? json.images.filter((item): item is string => typeof item === "string") : [];
  if (images.length === 0) throw new Error("Le modèle n'a renvoyé aucune image.");
  return { images, tokens: json.stats?.totalTokens ?? 0 };
}

export async function runGeneratorOnServer({ project_id, node_id, variants }: RunGeneratorInput): Promise<ToolResult> {
  const db = getDb();
  const readCanvas = () =>
    db.prepare("SELECT nodes, edges, updated_at FROM projects WHERE id = ?").get(project_id) as
      | { nodes: string; edges: string; updated_at: string }
      | undefined;

  const row = readCanvas();
  if (!row) return fail(`Unknown project_id: ${project_id}. Use list_projects.`);
  const nodes = parseArray<StoredNode>(row.nodes);
  const edges = parseArray<StoredEdge>(row.edges);

  const generators = nodes.filter((node) => node.type === "generator");
  const generator = node_id ? generators.find((node) => node.id === node_id) : generators.length === 1 ? generators[0] : undefined;
  if (!generator) {
    if (node_id) return fail(`No generator node "${node_id}" on this canvas. Generators: ${generators.map((n) => n.id).join(", ") || "none"}.`);
    return fail(
      generators.length === 0
        ? "This canvas has no generator node. Build the workflow with apply_workflow first."
        : `This canvas has ${generators.length} generators: pass node_id (${generators.map((n) => n.id).join(", ")}).`,
    );
  }

  const data = generator.data ?? {};
  const active = activeVariants(data.abTest);
  const wanted = variants?.length ? active.filter((variant) => variants.includes(variant)) : active;
  if (wanted.length === 0) {
    return fail(`None of the requested variants is active on ${generator.id}. Active: ${active.join(", ")}.`);
  }
  const perVariant = imageCount(typeof data.numImages === "number" ? data.numImages : undefined);
  if (wanted.length * perVariant > MAX_JOBS) {
    return fail(`Refused: ${wanted.length * perVariant} images in one run (max ${MAX_JOBS}). Lower the generator's count.`);
  }
  const model = typeof data.model === "string" && data.model ? data.model : DEFAULT_IMAGE_MODEL;
  const aspectRatio = typeof data.aspectRatio === "string" && data.aspectRatio ? data.aspectRatio : "16x9";

  // Stored canvases hold refs or same-origin URLs the generate route resolves
  // itself; anything else (a browser-only blob) is unreadable here and skipped.
  const loadImage = async (src: string) => (src.startsWith("data:") ? src : null);

  const jobs: Job[] = [];
  for (const variant of wanted) {
    const inputs = resolveVariantInputs(edges, nodes as PayloadNode[], generator.id, variant);
    const payload = await buildGenerationPayload(inputs, loadImage);
    if (!payload.prompt.trim()) {
      return fail(`Variant ${variant} of ${generator.id} has no prompt wired on its prompt input. Nothing was generated.`);
    }
    if (!generationPayloadFits(payload)) {
      return fail(`Variant ${variant}: the references are too heavy for one request. Nothing was generated.`);
    }
    for (let index = 0; index < perVariant; index++) jobs.push({ variant, index, payload });
  }

  debugLog("generate", "mcp start", { projectId: project_id, nodeId: generator.id, model, jobs: jobs.length });

  const outcomes: JobOutcome[] = await Promise.all(
    jobs.map(async (job): Promise<JobOutcome> => {
      const start = Date.now();
      try {
        const result = await requestImage({
          ...job.payload,
          aspectRatio,
          model,
          imageSize: data.imageSize,
          projectId: project_id,
        });
        return { job, ok: true, images: result.images, timeMs: Date.now() - start, tokens: result.tokens };
      } catch (err) {
        return { job, ok: false, error: err instanceof Error ? err.message : "Échec de la génération", timeMs: Date.now() - start };
      }
    }),
  );

  const succeeded = outcomes.filter((outcome): outcome is Extract<JobOutcome, { ok: true }> => outcome.ok);
  const failed = outcomes.filter((outcome): outcome is Extract<JobOutcome, { ok: false }> => !outcome.ok);
  const cost = MODEL_COSTS[model] ?? 0;
  const modelLabel = imageModelLabel(model);
  const abActive = isAbTestActive(data.abTest);

  // Merge onto the canvas as it is NOW: the run took a while and the user's
  // browser may have saved meanwhile. Only our own additions are written.
  let canvasNote = "";
  if (succeeded.length > 0) {
    const written = db.transaction((): boolean => {
      const fresh = readCanvas();
      if (!fresh) return false;
      const freshNodes = parseArray<StoredNode>(fresh.nodes);
      const freshEdges = parseArray<StoredEdge>(fresh.edges);
      const target = freshNodes.find((node) => node.id === generator.id && node.type === "generator");
      if (!target) return false;

      const origin = target.position ?? { x: 0, y: 0 };
      const produced: Partial<Record<VariantId, string[]>> = {};
      let column = 0;
      for (const outcome of succeeded) {
        const { variant, index } = outcome.job;
        const suffix = perVariant > 1 ? ` #${index + 1}` : "";
        const previewId = uuid();
        freshNodes.push({
          id: previewId,
          type: "preview",
          position: {
            x: origin.x + PREVIEW_OFFSET_X + (abActive ? index : column) * PREVIEW_COLUMN_GAP,
            y: origin.y + (abActive ? active.indexOf(variant) : 0) * PREVIEW_ROW_GAP,
          },
          data: {
            label: abActive ? `Variante ${variant}${suffix}` : `${modelLabel}${suffix}`,
            genStatus: "done",
            genModel: modelLabel,
            genPromptUsed: outcome.job.payload.prompt,
            generatedImages: outcome.images,
            selectedImageIndex: 0,
            genTimeMs: outcome.timeMs,
            genTokens: outcome.tokens,
            genCost: cost > 0 ? `~$${cost.toFixed(3)}` : "",
          },
        });
        freshEdges.push({
          id: uuid(),
          source: generator.id,
          sourceHandle: resultHandle(variant),
          target: previewId,
          targetHandle: "preview-in",
          type: "custom",
        });
        produced[variant] = [...(produced[variant] ?? []), ...outcome.images];
        column += 1;
      }

      const previous = (target.data.generatedImagesByVariant ?? {}) as Partial<Record<VariantId, string[]>>;
      target.data = {
        ...target.data,
        isGenerating: false,
        generatedImagesByVariant: { ...previous, ...produced },
        ...(produced.A ? { generatedImages: produced.A, selectedImageIndex: 0 } : {}),
      };

      createCanvasSnapshot(project_id, fresh.nodes, fresh.edges, "apply_workflow", db);
      writeProjectCanvas(project_id, JSON.stringify(freshNodes), JSON.stringify(freshEdges), db, nextUpdatedAt(fresh.updated_at));
      return true;
    })();
    canvasNote = written
      ? "Aperçu nodes were added to the canvas next to the generator."
      : "The generator node is no longer on the canvas: the images are saved (list_past_generations) but no Aperçu node was added.";
  }

  debugLog("generate", "mcp done", {
    projectId: project_id,
    nodeId: generator.id,
    produced: succeeded.length,
    failed: failed.length,
  });

  const lines: string[] = [
    `Generator ${generator.id} · ${modelLabel} · ${aspectRatio} · ${succeeded.length}/${jobs.length} image(s) · ~$${(cost * succeeded.length).toFixed(2)}`,
  ];
  for (const outcome of succeeded) {
    for (const image of outcome.images) {
      lines.push(`- variant ${outcome.job.variant}: ${toImageSourceRef(image) ?? image} (${Math.round(outcome.timeMs / 1000)} s)`);
    }
  }
  for (const outcome of failed) lines.push(`- variant ${outcome.job.variant}: FAILED — ${outcome.error}`);
  if (canvasNote) lines.push(canvasNote);
  if (succeeded.length > 0) {
    lines.push("Look at them with view_canvas_images, then export_image on the stored:gi_ ref you keep.");
  }

  return {
    ...(succeeded.length === 0 ? { isError: true } : {}),
    content: [{ type: "text", text: lines.join("\n") }],
  };
}
