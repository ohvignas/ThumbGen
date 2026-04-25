import { v4 as uuid } from "uuid";
import { getDb } from "./db";
import { getCostPerImage } from "./model-costs";

export type LogInput = {
  provider: string;
  model: string;
  endpoint: "generate" | "edit" | "remix";
  timeMs: number;
  imageCount: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  prompt?: string | null;
  projectId?: string | null;
  status?: "success" | "error";
  errorMessage?: string | null;
  generatedImageIds?: string[];
};

export function logGeneration(input: LogInput): string {
  const id = uuid();
  const cost = getCostPerImage(input.model) * (input.imageCount || 0);
  getDb()
    .prepare(`
      INSERT INTO generations_log
      (id, provider, model, endpoint, cost_estimate, time_ms,
       input_tokens, output_tokens, total_tokens, image_count,
       prompt, project_id, status, error_message, generated_image_ids)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      id,
      input.provider,
      input.model,
      input.endpoint,
      cost,
      input.timeMs,
      input.inputTokens ?? 0,
      input.outputTokens ?? 0,
      input.totalTokens ?? 0,
      input.imageCount,
      input.prompt ?? null,
      input.projectId ?? null,
      input.status ?? "success",
      input.errorMessage ?? null,
      input.generatedImageIds && input.generatedImageIds.length > 0
        ? JSON.stringify(input.generatedImageIds)
        : null,
    );
  return id;
}

export type Period = "today" | "7d" | "30d" | "all";

function periodClause(period: Period): string {
  switch (period) {
    case "today":
      return "WHERE date(created_at) = date('now')";
    case "7d":
      return "WHERE created_at >= datetime('now', '-7 days')";
    case "30d":
      return "WHERE created_at >= datetime('now', '-30 days')";
    case "all":
    default:
      return "";
  }
}

export type Totals = {
  totalCost: number;
  totalGenerations: number;
  totalImages: number;
  totalTokens: number;
  avgTimeMs: number;
  errorCount: number;
};

export function getTotals(period: Period): Totals {
  const where = periodClause(period);
  const row = getDb()
    .prepare(`
      SELECT
        COALESCE(SUM(cost_estimate), 0)         AS totalCost,
        COUNT(*)                                AS totalGenerations,
        COALESCE(SUM(image_count), 0)           AS totalImages,
        COALESCE(SUM(total_tokens), 0)          AS totalTokens,
        COALESCE(AVG(time_ms), 0)               AS avgTimeMs,
        COALESCE(SUM(CASE WHEN status='error' THEN 1 ELSE 0 END), 0) AS errorCount
      FROM generations_log
      ${where}
    `)
    .get() as Totals;
  return row;
}

export type ModelBreakdown = {
  provider: string;
  model: string;
  count: number;
  images: number;
  cost: number;
  avgTimeMs: number;
  totalTokens: number;
};

export function getByModel(period: Period): ModelBreakdown[] {
  const where = periodClause(period);
  return getDb()
    .prepare(`
      SELECT
        provider,
        model,
        COUNT(*)                              AS count,
        COALESCE(SUM(image_count), 0)         AS images,
        COALESCE(SUM(cost_estimate), 0)       AS cost,
        COALESCE(AVG(time_ms), 0)             AS avgTimeMs,
        COALESCE(SUM(total_tokens), 0)        AS totalTokens
      FROM generations_log
      ${where}
      GROUP BY provider, model
      ORDER BY cost DESC
    `)
    .all() as ModelBreakdown[];
}

export type LogRow = {
  id: string;
  created_at: string;
  provider: string;
  model: string;
  endpoint: string;
  cost_estimate: number;
  time_ms: number;
  total_tokens: number;
  image_count: number;
  prompt: string | null;
  status: string;
  error_message: string | null;
};

export function getRecentLog(period: Period, limit = 100): LogRow[] {
  const where = periodClause(period);
  return getDb()
    .prepare(`
      SELECT id, created_at, provider, model, endpoint, cost_estimate, time_ms,
             total_tokens, image_count, prompt, status, error_message
      FROM generations_log
      ${where}
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .all(limit) as LogRow[];
}

export type DailyPoint = { day: string; cost: number; count: number };

export function getDailySeries(period: Period): DailyPoint[] {
  const where = periodClause(period);
  return getDb()
    .prepare(`
      SELECT
        date(created_at)                AS day,
        COALESCE(SUM(cost_estimate), 0) AS cost,
        COUNT(*)                        AS count
      FROM generations_log
      ${where}
      GROUP BY day
      ORDER BY day ASC
    `)
    .all() as DailyPoint[];
}
