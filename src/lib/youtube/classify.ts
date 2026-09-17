import type OpenAI from "openai";
import { getOpenRouterClient } from "@/lib/agent/llm-client";
import { logGeneration } from "@/lib/generations-log";
import { getTypedSettings } from "@/lib/settings";
import * as store from "./channel-store";
import {
  CLASSIFY_CONFIRM_THRESHOLD,
  CLASSIFY_MODEL,
  CLASSIFY_MODEL_LABEL,
  estimateClassificationCostUsd,
  tokenCostUsd,
} from "./classification-pricing";
import { channelRuntime } from "./runtime";
import { THUMB_TYPES, THUMB_TYPE_IDS, parseClassification } from "./thumb-types";
import { youtubeThumbnailUrl, type ClassificationStatus } from "./types";

export const CLASSIFY_BATCH_SIZE = 20;
export const CLASSIFY_CONCURRENCY = 4;
/** One call must not hang the queue; our own retry policy (3 attempts across runs) replaces the SDK's. */
export const CLASSIFY_REQUEST_OPTIONS = { timeout: 30_000, maxRetries: 0 } as const;

export const CLASSIFY_SYSTEM_PROMPT = [
  "Tu classes des miniatures YouTube selon leur composition visuelle.",
  'Réponds uniquement avec un objet JSON {"type": "<identifiant>"} où l\'identifiant est l\'un de :',
  ...THUMB_TYPES.map((type) => `- ${type.id} : ${type.label}`),
  "Choisis le type dominant. Si aucun ne convient, réponds other.",
].join("\n");

const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "thumbnail_type",
    strict: true,
    schema: {
      type: "object",
      properties: { type: { type: "string", enum: [...THUMB_TYPE_IDS] } },
      required: ["type"],
      additionalProperties: false,
    },
  },
} as const;

export type ClassifierClient = Pick<OpenAI, "chat">;

export type ClassificationDeps = {
  getClient: () => ClassifierClient | null;
  isEnabled: () => boolean;
};

export const defaultClassificationDeps: ClassificationDeps = {
  getClient: () => getOpenRouterClient(),
  isEnabled: () => getTypedSettings().inspirationAutoClassify,
};

type OpenRouterUsage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };

export function buildClassificationStatus(
  running: boolean,
  deps: ClassificationDeps = defaultClassificationDeps,
): ClassificationStatus {
  const { pending, unapproved } = store.countPendingClassification();
  const awaitingConfirmation = unapproved > CLASSIFY_CONFIRM_THRESHOLD ? unapproved : 0;
  return {
    enabled: deps.isEnabled(),
    hasKey: deps.getClient() !== null,
    pending,
    awaitingConfirmation,
    estimatedCostUsd: estimateClassificationCostUsd(awaitingConfirmation),
    running,
    modelLabel: CLASSIFY_MODEL_LABEL,
  };
}

/** One OpenRouter call per thumbnail; every call is logged in generations_log for Usage. */
export async function classifyVideo(client: ClassifierClient, videoId: string): Promise<"classified" | "failed"> {
  const start = Date.now();
  try {
    const completion = await client.chat.completions.create({
      model: CLASSIFY_MODEL,
      temperature: 0,
      max_tokens: 50,
      response_format: RESPONSE_FORMAT,
      messages: [
        { role: "system", content: CLASSIFY_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Quel est le type de cette miniature ?" },
            { type: "image_url", image_url: { url: youtubeThumbnailUrl(videoId, "mqdefault") } },
          ],
        },
      ],
    }, CLASSIFY_REQUEST_OPTIONS);
    const type = parseClassification(completion.choices[0]?.message?.content);
    const usage = (completion.usage ?? {}) as OpenRouterUsage;
    const inputTokens = usage.prompt_tokens ?? 0;
    const outputTokens = usage.completion_tokens ?? 0;
    store.setAiThumbType(videoId, type);
    logGeneration({
      provider: "openrouter",
      model: CLASSIFY_MODEL,
      endpoint: "classify-thumbnail",
      timeMs: Date.now() - start,
      imageCount: 0,
      inputTokens,
      outputTokens,
      totalTokens: usage.total_tokens ?? inputTokens + outputTokens,
      costEstimate: typeof usage.cost === "number" ? usage.cost : tokenCostUsd(inputTokens, outputTokens),
      prompt: `Miniature ${videoId} → ${type}`,
    });
    return "classified";
  } catch (err) {
    store.incrementClassifyAttempts(videoId);
    logGeneration({
      provider: "openrouter",
      model: CLASSIFY_MODEL,
      endpoint: "classify-thumbnail",
      timeMs: Date.now() - start,
      imageCount: 0,
      costEstimate: 0,
      prompt: `Miniature ${videoId}`,
      status: "error",
      errorMessage: err instanceof Error ? err.message.slice(0, 200) : "Classement impossible",
    });
    return "failed";
  }
}

async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await run(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Classifies pending thumbnails until none is left. 200 unapproved thumbnails
 * or fewer are approved on the spot; more wait for « Lancer le classement ».
 * Nothing is approved while a channel import is running: the import adds 50
 * rows per page, so the count is only final once it ends (the sync kicks the
 * worker again when it is done).
 * A thumbnail that fails is not retried within the same run.
 */
export async function runClassificationQueue(
  deps: ClassificationDeps = defaultClassificationDeps,
): Promise<{ classified: number; failed: number }> {
  let classified = 0;
  let failed = 0;
  const attempted = new Set<string>();
  for (;;) {
    if (!deps.isEnabled()) break;
    const client = deps.getClient();
    if (!client) break;
    const { unapproved } = store.countPendingClassification();
    const importing = channelRuntime().locks.size > 0;
    if (!importing && unapproved > 0 && unapproved <= CLASSIFY_CONFIRM_THRESHOLD) store.approvePendingClassification();
    const batch = store
      .nextClassificationBatch(CLASSIFY_BATCH_SIZE + attempted.size)
      .filter((videoId) => !attempted.has(videoId))
      .slice(0, CLASSIFY_BATCH_SIZE);
    if (batch.length === 0) break;
    for (const videoId of batch) attempted.add(videoId);
    const results = await mapWithConcurrency(batch, CLASSIFY_CONCURRENCY, (videoId) => classifyVideo(client, videoId));
    classified += results.filter((result) => result === "classified").length;
    failed += results.filter((result) => result === "failed").length;
  }
  return { classified, failed };
}
