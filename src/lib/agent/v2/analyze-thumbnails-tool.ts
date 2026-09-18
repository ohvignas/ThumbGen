import { tool as aiTool, type Tool } from "ai";
import { z } from "zod";
import type OpenAI from "openai";
import { getOpenRouterClient } from "@/lib/agent/llm-client";
import { logGeneration } from "@/lib/generations-log";
import { ensureBrief, reserveBriefUsage } from "@/lib/brief/store";
import { setBriefCompetition } from "@/lib/brief/server-fields";
import { getCompetitorSearch, type CompetitorHit } from "@/lib/brief/competitor-search-store";
import { getThumbnailAnalysis, saveThumbnailAnalysis } from "@/lib/brief/thumbnail-analysis-store";
import { summarizeCompetition, type AnalyzedCompetitor } from "@/lib/brief/competition-summary";
import {
  EMOTION_LABELS,
  LAYOUTS,
  thumbAnalysisSchema,
  type ThumbAnalysis,
} from "@/lib/brief/schema";
import { CLASSIFY_MODEL, tokenCostUsd } from "@/lib/youtube/classification-pricing";
import { CLASSIFY_REQUEST_OPTIONS } from "@/lib/youtube/classify";
import { THUMB_TYPE_IDS } from "@/lib/youtube/thumb-types";
import { youtubeThumbnailUrl } from "@/lib/youtube/types";
import type { ToolResult } from "@/lib/agent/tools/types";
import { isFakeAgentEnabled } from "./fake-agent-model";
import { FAKE_COMPETITION } from "./fake-f3b-fixtures";
import { toolResultToModelOutput } from "./tool-adapter";

export const ANALYZE_THUMBNAILS_TOOL_NAME = "analyze_thumbnails";
export const analyzeThumbnailsInputSchema = z.object({
  video_ids: z.array(z.string().trim().min(6).max(20)).min(1).max(12),
});
export type AnalyzeThumbnailsInput = z.output<typeof analyzeThumbnailsInputSchema>;
export type AnalyzeClient = Pick<OpenAI, "chat">;
export type AnalyzeThumbnailsContext = {
  conversationId: string;
  getClient?: () => AnalyzeClient | null;
};

const NO_KEY = "Clé API OpenRouter non configurée. Ajoute-la dans Réglages.";
const SYSTEM = [
  "Tu décris la composition visuelle d'une miniature YouTube.",
  "Réponds uniquement avec le JSON demandé. Couleurs en #RRGGBB.",
].join("\n");

const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "thumb_analysis",
    strict: true,
    schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: [...THUMB_TYPE_IDS] },
        faceCount: { type: "integer", enum: [0, 1, 2, 3] },
        emotion: { type: "string", enum: [...EMOTION_LABELS] },
        emotionIntensity: { type: "integer", enum: [1, 2, 3] },
        mouthOpen: { type: "boolean" },
        textWords: { type: "integer", minimum: 0 },
        text: { type: "string" },
        elementCount: { type: "integer", minimum: 0 },
        layout: { type: "string", enum: [...LAYOUTS] },
        background: { type: "string", enum: ["solid", "gradient", "scene", "screenshot"] },
        dominantColors: {
          type: "array",
          items: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
          maxItems: 3,
        },
        hasLogo: { type: "boolean" },
        hasArrowOrCircle: { type: "boolean" },
      },
      required: [
        "type",
        "faceCount",
        "textWords",
        "elementCount",
        "layout",
        "background",
        "dominantColors",
        "hasLogo",
        "hasArrowOrCircle",
      ],
      additionalProperties: false,
    },
  },
} as const;

function error(text: string, requestNotSent = false): ToolResult {
  return { isError: true, requestNotSent, content: [{ type: "text", text }] };
}

function parseAnalysis(content: string | null | undefined): ThumbAnalysis | null {
  if (!content) return null;
  const unfenced = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    const parsed = thumbAnalysisSchema.safeParse(JSON.parse(unfenced));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function successText(patterns: string[], saturation: string[]): string {
  return `Ce qui marche : ${patterns.join(" · ") || "—"}\nCe que tout le monde fait (à éviter) : ${saturation.join(" · ") || "—"}`;
}

type OpenRouterUsage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };

async function classifyOne(
  client: AnalyzeClient,
  videoId: string,
): Promise<ThumbAnalysis | null> {
  const start = Date.now();
  try {
    const completion = await client.chat.completions.create(
      {
        model: CLASSIFY_MODEL,
        temperature: 0,
        response_format: RESPONSE_FORMAT,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: "Décris cette miniature YouTube." },
              { type: "image_url", image_url: { url: youtubeThumbnailUrl(videoId, "mqdefault") } },
            ],
          },
        ],
      },
      CLASSIFY_REQUEST_OPTIONS,
    );
    const usage = (completion.usage ?? {}) as OpenRouterUsage;
    const analysis = parseAnalysis(completion.choices[0]?.message?.content);
    const inputTokens = usage.prompt_tokens ?? 0;
    const outputTokens = usage.completion_tokens ?? 0;
    logGeneration({
      provider: "openrouter",
      model: CLASSIFY_MODEL,
      endpoint: "classify-thumbnail",
      timeMs: Date.now() - start,
      imageCount: 0,
      inputTokens,
      outputTokens,
      totalTokens: usage.total_tokens ?? inputTokens + outputTokens,
      costEstimate: typeof usage.cost === "number" && Number.isFinite(usage.cost) ? usage.cost : tokenCostUsd(inputTokens, outputTokens),
      prompt: `Miniature ${videoId}`,
      status: analysis ? "success" : "error",
      errorMessage: analysis ? null : "Analyse illisible",
    });
    return analysis;
  } catch (err) {
    logGeneration({
      provider: "openrouter",
      model: CLASSIFY_MODEL,
      endpoint: "classify-thumbnail",
      timeMs: Date.now() - start,
      imageCount: 0,
      costEstimate: 0,
      prompt: `Miniature ${videoId}`,
      status: "error",
      errorMessage: err instanceof Error ? err.message.slice(0, 200) : "Analyse impossible",
    });
    return null;
  }
}

export async function executeAnalyzeThumbnails(
  context: AnalyzeThumbnailsContext,
  input: AnalyzeThumbnailsInput,
): Promise<ToolResult> {
  const existing = ensureBrief(context.conversationId);
  if (!existing) return error("Conversation introuvable.", true);

  if (isFakeAgentEnabled()) {
    const analyzedAt = new Date().toISOString();
    setBriefCompetition(context.conversationId, { ...FAKE_COMPETITION, analyzedAt });
    return { content: [{ type: "text", text: successText(FAKE_COMPETITION.patterns, FAKE_COMPETITION.saturation) }] };
  }

  const search = getCompetitorSearch(context.conversationId);
  if (!search || search.length === 0) return error("Aucune recherche de concurrents à analyser. Relance find_competitor_thumbnails.", true);

  const byId = new Map(search.map((row) => [row.videoId, row]));
  const requested = [...new Set(input.video_ids)].filter((id) => byId.has(id)).slice(0, 12);
  if (requested.length === 0) return error("Aucun identifiant ne correspond à la dernière recherche.", true);

  const cached: Array<{ hit: CompetitorHit; analysis: ThumbAnalysis }> = [];
  const missing: CompetitorHit[] = [];
  for (const videoId of requested) {
    const hit = byId.get(videoId)!;
    const stored = getThumbnailAnalysis(videoId);
    if (stored) cached.push({ hit, analysis: stored.analysis });
    else missing.push(hit);
  }

  const analyzed: AnalyzedCompetitor[] = cached.map(({ hit, analysis }) => ({
    lang: hit.lang,
    score: hit.score,
    analysis,
  }));

  if (missing.length > 0) {
    if (existing.brief.usage.analyses >= 2) {
      return error("Limite de 2 analyses de miniatures atteinte pour cette miniature.", true);
    }
    const getClient = context.getClient ?? (() => getOpenRouterClient());
    const client = getClient();
    if (!client) return error(NO_KEY, true);
    const reservation = reserveBriefUsage(context.conversationId, "analyses", () => null);
    if (reservation.status !== "reserved") {
      return error(reservation.status === "refused" ? reservation.reason : "Pas de fiche pour cette conversation.", true);
    }
    for (const hit of missing) {
      const analysis = await classifyOne(client, hit.videoId);
      if (!analysis) continue;
      saveThumbnailAnalysis(hit.videoId, analysis);
      analyzed.push({ lang: hit.lang, score: hit.score, analysis });
    }
  }

  const summary = summarizeCompetition(analyzed);
  const analyzedAt = new Date().toISOString();
  setBriefCompetition(context.conversationId, { ...summary, analyzedAt });
  return { content: [{ type: "text", text: successText(summary.patterns, summary.saturation) }] };
}

export function buildAnalyzeThumbnailsTool(context: AnalyzeThumbnailsContext): Tool {
  return aiTool({
    description: [
      "Vision-analyses competing thumbnails from the last find_competitor_thumbnails call. Pass up to 12 video_ids from that search. Cached analyses cost nothing. At most 2 paid calls per conversation. Returns two lines: Ce qui marche / Ce que tout le monde fait (à éviter). Not a look at the user's canvas (view_canvas_images).",
    ].join("\n"),
    inputSchema: analyzeThumbnailsInputSchema,
    execute: async (input: AnalyzeThumbnailsInput) => executeAnalyzeThumbnails(context, input),
    toModelOutput: ({ output }: { output: unknown }) => toolResultToModelOutput(output),
  }) as Tool;
}
