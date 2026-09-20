import { tool as aiTool, type Tool } from "ai";
import { z } from "zod";
import type OpenAI from "openai";
import { logGeneration } from "@/lib/generations-log";
import { ensureBrief, reserveBriefUsage } from "@/lib/brief/store";
import { setBriefResearch } from "@/lib/brief/server-fields";
import type { BriefResearch } from "@/lib/brief/schema";
import { citationsFromCompletion, parseResearchPayload } from "@/lib/research/parse";
import { RESEARCH_MODEL, RESEARCH_REQUEST_OPTIONS, researchCostUsd } from "@/lib/research/pricing";
import {
  RESEARCH_FAILED,
  RESEARCH_NO_KEY,
  RESEARCH_RESPONSE_FORMAT,
  RESEARCH_UNREADABLE,
  fetchPerplexityResearch,
  resolveResearchRoute,
  researchErrorFromUnknown,
  type PerplexityCompletion,
  type ResearchProvider,
} from "@/lib/research/perplexity-client";
import { debugLog } from "@/lib/debug-log";
import type { ToolResult } from "@/lib/agent/tools/types";
import { isFakeAgentEnabled } from "./fake-agent-model";
import { FAKE_RESEARCH } from "./fake-f3b-fixtures";
import { toolResultToModelOutput } from "./tool-adapter";

export const RESEARCH_TOPIC_TOOL_NAME = "research_topic";

export const researchTopicInputSchema = z.object({
  query: z.string().trim().min(1).max(300),
  language: z.enum(["fr", "en"]),
  refresh: z.boolean().optional(),
});
export type ResearchTopicInput = z.output<typeof researchTopicInputSchema>;

export type ResearchClient = Pick<OpenAI, "chat">;
export type ResearchTopicContext = {
  conversationId: string;
  getClient?: () => ResearchClient | null;
  fetchResearch?: typeof fetchPerplexityResearch;
};

const SYSTEM = [
  "Tu résumes un sujet pour concevoir une miniature YouTube.",
  'Réponds uniquement avec un objet JSON {"summary": string, "keyPoints": string[], "entities": {"name": string, "kind": "company"|"tool"|"product"|"other"}[]}.',
  "summary ≤ 1200 caractères, au plus 6 keyPoints, au plus 12 entities. N'inclus pas de sources.",
].join("\n");

function error(text: string, requestNotSent = false): ToolResult {
  return { isError: true, requestNotSent, content: [{ type: "text", text }] };
}

function successLines(research: BriefResearch): string {
  return [
    research.summary,
    research.keyPoints.length ? `Points clés : ${research.keyPoints.join(" · ")}` : "",
    research.entities.length ? `Entités : ${research.entities.map((entity) => entity.name).join(", ")}` : "",
    research.sources.length ? `Sources : ${research.sources.map((source) => source.title).join(" · ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function logResearch(
  conversationId: string,
  projectId: string | undefined,
  message: string,
  data: Record<string, unknown>,
  level?: "error" | "start" | "success",
): void {
  debugLog("agent", message, { conversationId, ...(projectId ? { projectId } : {}), ...data }, level);
}

async function completeResearch(
  context: ResearchTopicContext,
  input: ResearchTopicInput,
): Promise<PerplexityCompletion> {
  if (context.getClient) {
    const client = context.getClient();
    if (!client) throw Object.assign(new Error(RESEARCH_NO_KEY), { status: 0 });
    return (await client.chat.completions.create(
      {
        model: RESEARCH_MODEL,
        temperature: 0,
        response_format: RESEARCH_RESPONSE_FORMAT,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Langue: ${input.language}. Sujet: ${input.query}` },
        ],
      },
      RESEARCH_REQUEST_OPTIONS,
    )) as PerplexityCompletion;
  }
  const fetchResearch = context.fetchResearch ?? fetchPerplexityResearch;
  return fetchResearch({ query: input.query, language: input.language, system: SYSTEM });
}

export async function executeResearchTopic(context: ResearchTopicContext, input: ResearchTopicInput): Promise<ToolResult> {
  const existing = ensureBrief(context.conversationId);
  if (!existing) return error("Conversation introuvable.", true);
  const projectId = existing.projectId;
  logResearch(context.conversationId, projectId, "tool start", { name: RESEARCH_TOPIC_TOOL_NAME }, "start");

  if (isFakeAgentEnabled()) {
    const fetchedAt = new Date().toISOString();
    setBriefResearch(context.conversationId, { ...FAKE_RESEARCH, fetchedAt });
    logResearch(context.conversationId, projectId, "tool end", { name: RESEARCH_TOPIC_TOOL_NAME, isError: false });
    return { content: [{ type: "text", text: successLines({ ...FAKE_RESEARCH, fetchedAt }) }] };
  }

  if (existing.brief.research && !input.refresh) {
    const text = "Une recherche existe déjà. Passe refresh: true pour la relancer.";
    logResearch(context.conversationId, projectId, "tool end", { name: RESEARCH_TOPIC_TOOL_NAME, isError: true, error: text }, "error");
    return error(text, true);
  }
  if (existing.brief.usage.research >= 2) {
    const text = "Limite de 2 recherches atteinte pour cette miniature.";
    logResearch(context.conversationId, projectId, "tool end", { name: RESEARCH_TOPIC_TOOL_NAME, isError: true, error: text }, "error");
    return error(text, true);
  }

  const route = context.getClient ? null : resolveResearchRoute();
  if (!context.getClient && !route && !context.fetchResearch) {
    logResearch(
      context.conversationId,
      projectId,
      "research_topic failed",
      { name: RESEARCH_TOPIC_TOOL_NAME, isError: true, error: RESEARCH_NO_KEY },
      "error",
    );
    logResearch(context.conversationId, projectId, "tool end", { name: RESEARCH_TOPIC_TOOL_NAME, isError: true, error: RESEARCH_NO_KEY }, "error");
    return error(RESEARCH_NO_KEY, true);
  }

  const reservation = reserveBriefUsage(context.conversationId, "research", () => null);
  if (reservation.status !== "reserved") {
    const text = reservation.status === "refused" ? reservation.reason : "Pas de fiche pour cette conversation.";
    logResearch(context.conversationId, projectId, "tool end", { name: RESEARCH_TOPIC_TOOL_NAME, isError: true, error: text }, "error");
    return error(text, true);
  }

  const provider: ResearchProvider = route?.provider ?? "perplexity";
  const model = route?.model ?? RESEARCH_MODEL;
  const start = Date.now();
  logResearch(context.conversationId, projectId, "research_topic start", { name: RESEARCH_TOPIC_TOOL_NAME, provider }, "start");
  try {
    const completion = await completeResearch(context, input);
    const parsed = parseResearchPayload(completion.choices?.[0]?.message?.content);
    const usage = (completion.usage ?? {}) as {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      cost?: number;
    };
    if (!parsed) {
      logGeneration({
        provider,
        model,
        endpoint: "research",
        timeMs: Date.now() - start,
        imageCount: 0,
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0,
        totalTokens: usage.total_tokens ?? 0,
        costEstimate: 0,
        prompt: input.query,
        status: "error",
        errorMessage: RESEARCH_UNREADABLE,
      });
      logResearch(
        context.conversationId,
        projectId,
        "research_topic failed",
        { name: RESEARCH_TOPIC_TOOL_NAME, isError: true, error: RESEARCH_UNREADABLE, provider },
        "error",
      );
      logResearch(context.conversationId, projectId, "tool end", { name: RESEARCH_TOPIC_TOOL_NAME, isError: true, error: RESEARCH_UNREADABLE, provider }, "error");
      return error(RESEARCH_UNREADABLE);
    }
    const research = {
      ...parsed,
      sources: citationsFromCompletion(completion),
      fetchedAt: new Date().toISOString(),
    };
    setBriefResearch(context.conversationId, research);
    logGeneration({
      provider,
      model,
      endpoint: "research",
      timeMs: Date.now() - start,
      imageCount: 0,
      inputTokens: usage.prompt_tokens ?? 0,
      outputTokens: usage.completion_tokens ?? 0,
      totalTokens: usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
      costEstimate: researchCostUsd(usage),
      prompt: input.query.slice(0, 200),
    });
    logResearch(context.conversationId, projectId, "tool end", { name: RESEARCH_TOPIC_TOOL_NAME, isError: false, ms: Date.now() - start, provider }, "success");
    return { content: [{ type: "text", text: successLines(research) }] };
  } catch (err) {
    const mapped = researchErrorFromUnknown(err);
    const failProvider = mapped.provider ?? provider;
    logGeneration({
      provider: failProvider,
      model,
      endpoint: "research",
      timeMs: Date.now() - start,
      imageCount: 0,
      costEstimate: 0,
      prompt: input.query.slice(0, 200),
      status: "error",
      errorMessage: mapped.text.slice(0, 200),
    });
    logResearch(
      context.conversationId,
      projectId,
      "research_topic failed",
      {
        name: RESEARCH_TOPIC_TOOL_NAME,
        isError: true,
        error: mapped.text,
        provider: failProvider,
        ...(mapped.status != null ? { status: mapped.status } : {}),
        ...(mapped.body ? { body: mapped.body } : {}),
      },
      "error",
    );
    logResearch(context.conversationId, projectId, "tool end", { name: RESEARCH_TOPIC_TOOL_NAME, isError: true, error: mapped.text, ms: Date.now() - start, provider: failProvider }, "error");
    return error(mapped.text || RESEARCH_FAILED);
  }
}

export function buildResearchTopicTool(context: ResearchTopicContext): Tool {
  return aiTool({
    description: [
      "Researches the video topic with Perplexity Sonar Pro (summary, key points, entities). Native Perplexity if the key is set, otherwise OpenRouter. Use when the subject is named and logos/competitors would benefit. Costs money, max 2 per conversation. query + language fr|en. refresh: true only to replace. On failure, continue from names the user cited. Then find_logos.",
      "query: the topic in the chosen language. language: fr or en. refresh: true only to replace an existing research (at most 2 calls per conversation).",
      "On failure, empty result or the limit: say so and continue to logos from names the user cited.",
    ].join("\n"),
    inputSchema: researchTopicInputSchema,
    execute: async (input: ResearchTopicInput) => executeResearchTopic(context, input),
    toModelOutput: ({ output }: { output: unknown }) => toolResultToModelOutput(output),
  }) as Tool;
}
