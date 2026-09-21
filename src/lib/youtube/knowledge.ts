import { getOpenRouterClient } from "@/lib/agent/llm-client";
import { logGeneration } from "@/lib/generations-log";
import { getDb } from "@/lib/db";
import { getTypedSettings, updateSettings } from "@/lib/settings";
import { emptyChannelProfile } from "@/lib/settings-schema";
import { CLASSIFY_MODEL, tokenCostUsd } from "./classification-pricing";
import {
  ChannelKnowledgeJsonSchema,
  VideoSummarySchema,
  type ChannelKnowledgeJson,
  type VideoSummary,
} from "./knowledge-schema";
import * as knowledge from "./knowledge-store";
import * as store from "./channel-store";
import { typesSummary } from "./video-queries";
import { channelMedianViews } from "./performance";
import type { ClassifierClient } from "./classify";

export const KNOWLEDGE_SUMMARY_LIMIT = 40;
const REQUEST_OPTIONS = { timeout: 45_000, maxRetries: 0 } as const;

type OpenRouterUsage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };

const KNOWLEDGE_JSON_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "channel_knowledge",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["identity", "audience", "content", "thumbnails", "performance", "standingInstructions"],
      properties: {
        identity: {
          type: "object",
          additionalProperties: false,
          required: ["name", "handle", "niche", "positioning", "uniqueAngle"],
          properties: {
            name: { type: "string" },
            handle: { type: ["string", "null"] },
            niche: { type: "string" },
            positioning: { type: "string" },
            uniqueAngle: { type: "string" },
          },
        },
        audience: {
          type: "object",
          additionalProperties: false,
          required: ["who", "language", "motivations"],
          properties: { who: { type: "string" }, language: { type: "string" }, motivations: { type: "string" } },
        },
        content: {
          type: "object",
          additionalProperties: false,
          required: ["pillars", "formats", "titlePatterns", "hookPatterns"],
          properties: {
            pillars: { type: "array", items: { type: "string" } },
            formats: { type: "array", items: { type: "string" } },
            titlePatterns: { type: "array", items: { type: "string" } },
            hookPatterns: { type: "array", items: { type: "string" } },
          },
        },
        thumbnails: {
          type: "object",
          additionalProperties: false,
          required: ["winningTypes", "visualLanguage", "textStyle", "faceUsage", "avoid"],
          properties: {
            winningTypes: { type: "array", items: { type: "string" } },
            visualLanguage: { type: "string" },
            textStyle: { type: "string" },
            faceUsage: { type: "string" },
            avoid: { type: "array", items: { type: "string" } },
          },
        },
        performance: {
          type: "object",
          additionalProperties: false,
          required: ["summary", "outliers"],
          properties: {
            summary: { type: "string" },
            outliers: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["videoId", "title", "why"],
                properties: { videoId: { type: "string" }, title: { type: "string" }, why: { type: "string" } },
              },
            },
          },
        },
        standingInstructions: { type: "string" },
      },
    },
  },
} as const;

const SUMMARY_JSON_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "video_summary",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "topics", "hook"],
      properties: {
        summary: { type: "string" },
        topics: { type: "array", items: { type: "string" } },
        hook: { type: "string" },
      },
    },
  },
} as const;

export function knowledgeToMarkdown(json: ChannelKnowledgeJson): string {
  const list = (items: string[]) => (items.length ? items.map((item) => `- ${item}`).join("\n") : "- (à compléter)");
  const outliers = json.performance.outliers
    .map((item) => `- ${item.title} (\`youtube:${item.videoId}\`) — ${item.why}`)
    .join("\n");
  return [
    `# ${json.identity.name || "Ma chaîne"}`,
    json.identity.handle ? `Handle : ${json.identity.handle}` : "",
    "",
    "## Identité",
    json.identity.niche && `Niche : ${json.identity.niche}`,
    json.identity.positioning,
    json.identity.uniqueAngle && `Angle : ${json.identity.uniqueAngle}`,
    "",
    "## Public",
    json.audience.who,
    json.audience.language && `Langue : ${json.audience.language}`,
    json.audience.motivations,
    "",
    "## Contenu",
    "Piliers :",
    list(json.content.pillars),
    "Formats :",
    list(json.content.formats),
    "Titres qui marchent :",
    list(json.content.titlePatterns),
    "Hooks :",
    list(json.content.hookPatterns),
    "",
    "## Miniatures",
    json.thumbnails.visualLanguage,
    json.thumbnails.textStyle,
    json.thumbnails.faceUsage,
    "Types qui marchent :",
    list(json.thumbnails.winningTypes),
    "À éviter :",
    list(json.thumbnails.avoid),
    "",
    "## Performance",
    json.performance.summary,
    outliers,
    "",
    "## Consignes pour l'agent",
    json.standingInstructions,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function compactKnowledgeBlock(json: ChannelKnowledgeJson): string {
  const lines = [
    json.identity.name && `- Name: ${json.identity.name}`,
    json.identity.handle && `- Handle: ${json.identity.handle}`,
    json.identity.niche && `- Niche: ${json.identity.niche}`,
    json.identity.positioning && `- Positioning: ${json.identity.positioning}`,
    json.identity.uniqueAngle && `- Unique angle: ${json.identity.uniqueAngle}`,
    json.audience.who && `- Audience: ${json.audience.who}`,
    json.audience.language && `- Language: ${json.audience.language}`,
    json.content.pillars.length > 0 && `- Pillars: ${json.content.pillars.join("; ")}`,
    json.content.titlePatterns.length > 0 && `- Title patterns: ${json.content.titlePatterns.join("; ")}`,
    json.content.hookPatterns.length > 0 && `- Hook patterns: ${json.content.hookPatterns.join("; ")}`,
    json.thumbnails.winningTypes.length > 0 && `- Winning thumbnail types: ${json.thumbnails.winningTypes.join("; ")}`,
    json.thumbnails.visualLanguage && `- Visual language: ${json.thumbnails.visualLanguage}`,
    json.thumbnails.textStyle && `- Thumbnail text: ${json.thumbnails.textStyle}`,
    json.thumbnails.faceUsage && `- Face: ${json.thumbnails.faceUsage}`,
    json.thumbnails.avoid.length > 0 && `- Avoid: ${json.thumbnails.avoid.join("; ")}`,
    json.performance.summary && `- Performance: ${json.performance.summary}`,
    json.standingInstructions && `- Standing instructions:\n${json.standingInstructions}`,
  ].filter(Boolean);
  return lines.join("\n");
}

function parseJson<T>(raw: string | null | undefined, fallback: T, parse: (value: unknown) => T): T {
  if (!raw) return fallback;
  try {
    return parse(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

async function completeJson(
  client: ClassifierClient,
  payload: { system: string; user: string; format: unknown; maxTokens: number; prompt: string },
): Promise<{ text: string; usage: OpenRouterUsage; ms: number }> {
  const start = Date.now();
  const completion = await client.chat.completions.create(
    {
      model: CLASSIFY_MODEL,
      temperature: 0.2,
      max_tokens: payload.maxTokens,
      response_format: payload.format as never,
      messages: [
        { role: "system", content: payload.system },
        { role: "user", content: payload.user },
      ],
    },
    REQUEST_OPTIONS,
  );
  return {
    text: completion.choices[0]?.message?.content ?? "",
    usage: (completion.usage ?? {}) as OpenRouterUsage,
    ms: Date.now() - start,
  };
}

function logCall(usage: OpenRouterUsage, ms: number, prompt: string, status: "success" | "error", error?: string) {
  const inputTokens = usage.prompt_tokens ?? 0;
  const outputTokens = usage.completion_tokens ?? 0;
  logGeneration({
    provider: "openrouter",
    model: CLASSIFY_MODEL,
    endpoint: "channel-knowledge",
    timeMs: ms,
    imageCount: 0,
    inputTokens,
    outputTokens,
    totalTokens: usage.total_tokens ?? inputTokens + outputTokens,
    costEstimate: typeof usage.cost === "number" ? usage.cost : tokenCostUsd(inputTokens, outputTokens),
    prompt,
    status,
    errorMessage: error ?? null,
  });
}

export async function summarizePendingVideos(
  channelId: string,
  client: ClassifierClient,
  now = () => new Date(),
): Promise<number> {
  const pending = knowledge.transcriptsNeedingSummary(channelId, KNOWLEDGE_SUMMARY_LIMIT);
  let summarized = 0;
  for (const row of pending) {
    try {
      const result = await completeJson(client, {
        system:
          "Tu résumes une vidéo YouTube pour un outil de miniatures. Réponds en JSON : summary (3-5 phrases), topics (mots-clés), hook (la promesse d'ouverture).",
        user: `Titre et transcript (tronqué) :\n${row.text.slice(0, 12_000)}`,
        format: SUMMARY_JSON_FORMAT,
        maxTokens: 500,
        prompt: `Résumé ${row.video_id}`,
      });
      const parsed = parseJson<VideoSummary>(result.text, { summary: "", topics: [], hook: "" }, (value) =>
        VideoSummarySchema.parse(value),
      );
      knowledge.setTranscriptSummary(row.video_id, parsed, now().toISOString());
      logCall(result.usage, result.ms, `Résumé ${row.video_id}`, "success");
      summarized += 1;
    } catch (err) {
      logCall({}, 0, `Résumé ${row.video_id}`, "error", err instanceof Error ? err.message.slice(0, 200) : "échec");
    }
  }
  return summarized;
}

async function buildAnalysisPrompt(channelId: string): Promise<string> {
  const channel = store.getChannel(channelId);
  const videos = store
    .viewSamples(channelId)
    .slice()
    .sort((a, b) => b.viewCount - a.viewCount);
  const median = channelMedianViews(store.viewSamples(channelId), new Date());
  const types = (await typesSummary("mine")).rows
    .filter((row) => row.totalCount > 0)
    .map((row) => `${row.label}: ${row.totalCount} (médiane ×${row.medianScore ?? "n/a"})`);
  const analytics = knowledge.listChannelAnalytics(channelId);
  const top = knowledge.topTranscripts(channelId, 12);
  const titles = (
    getDbTitles(channelId, 25) as Array<{ video_id: string; title: string; view_count: number }>
  ).map((video) => `${video.video_id} · ${video.view_count} vues · ${video.title}`);
  return JSON.stringify(
    {
      channel: {
        title: channel?.title,
        handle: channel?.handle,
        about: channel?.about,
        subscribers: channel?.subscriber_count,
        medianViews: median,
      },
      analytics,
      thumbnailTypes: types,
      topTitles: titles,
      transcriptSummaries: top.map((row) => ({
        videoId: row.video_id,
        title: row.title,
        summary: row.summary,
        hook: row.hook,
        topics: row.topics,
      })),
      sampleViewCounts: videos.slice(0, 15),
    },
    null,
    2,
  ).slice(0, 40_000);
}

function getDbTitles(channelId: string, limit: number) {
  return getDb()
    .prepare(
      "SELECT video_id, title, view_count FROM channel_videos WHERE channel_id = ? ORDER BY view_count DESC LIMIT ?",
    )
    .all(channelId, limit);
}

export async function generateChannelKnowledge(
  channelId: string,
  client: ClassifierClient | null = getOpenRouterClient(),
  now = () => new Date(),
): Promise<ChannelKnowledgeJson> {
  if (!client) throw new Error("Ajoute ta clé OpenRouter pour analyser la chaîne");
  await summarizePendingVideos(channelId, client, now);
  const user = await buildAnalysisPrompt(channelId);
  const result = await completeJson(client, {
    system:
      "Tu es stratège YouTube. À partir des données d'une chaîne (titres, types de miniatures, stats, extraits de transcripts), produis un document de marque pour un agent qui crée des miniatures. Réponds uniquement avec le JSON demandé, en français, concret, sans filler.",
    user,
    format: KNOWLEDGE_JSON_FORMAT,
    maxTokens: 1800,
    prompt: `Bible ${channelId}`,
  });
  let json: ChannelKnowledgeJson;
  try {
    json = ChannelKnowledgeJsonSchema.parse(JSON.parse(result.text));
  } catch {
    logCall(result.usage, result.ms, `Bible ${channelId}`, "error", "document invalide");
    throw new Error("L'analyse de la chaîne a renvoyé un document invalide");
  }
  logCall(result.usage, result.ms, `Bible ${channelId}`, "success");
  const channel = store.getChannel(channelId);
  if (!json.identity.name && channel) json.identity.name = channel.title;
  if (!json.identity.handle && channel) json.identity.handle = channel.handle;
  const counts = knowledge.countTranscripts(channelId);
  const document = knowledgeToMarkdown(json);
  knowledge.saveKnowledge({
    channel_id: channelId,
    generated_at: now().toISOString(),
    document_md: document,
    json: JSON.stringify(json),
    video_count: counts.total,
    transcript_count: counts.done,
  });
  fillEmptyProfile(json, channel?.handle ?? null);
  return json;
}

function fillEmptyProfile(json: ChannelKnowledgeJson, handle: string | null): void {
  const current = getTypedSettings().channelProfile;
  const next = emptyChannelProfile();
  Object.assign(next, current);
  let changed = false;
  const setIfEmpty = (key: "name" | "niche" | "audience" | "tone" | "agentInstructions", value: string) => {
    if (!current[key] && value) {
      next[key] = value.slice(0, key === "agentInstructions" ? 2000 : key === "name" ? 100 : 500);
      changed = true;
    }
  };
  setIfEmpty("name", json.identity.name);
  setIfEmpty("niche", json.identity.niche);
  setIfEmpty("audience", json.audience.who);
  setIfEmpty("tone", [json.thumbnails.visualLanguage, json.thumbnails.textStyle].filter(Boolean).join(" "));
  setIfEmpty("agentInstructions", json.standingInstructions);
  if (!getTypedSettings().youtubePlaylistId && handle) {
    updateSettings({ youtubePlaylistId: `https://www.youtube.com/${handle.startsWith("@") ? handle : `@${handle}`}` });
  }
  if (changed) updateSettings({ channelProfile: next });
}

export type KnowledgeDeps = { getClient: () => ClassifierClient | null };
export const defaultKnowledgeDeps: KnowledgeDeps = { getClient: () => getOpenRouterClient() };
