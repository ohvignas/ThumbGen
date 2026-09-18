import { tool as aiTool, type Tool } from "ai";
import { z } from "zod";
import type OpenAI from "openai";
import { getOpenRouterClient } from "@/lib/agent/llm-client";
import { logGeneration } from "@/lib/generations-log";
import { ensureBrief, getBrief, reserveBriefUsage } from "@/lib/brief/store";
import { setBriefResearch } from "@/lib/brief/server-fields";
import type { BriefResearch } from "@/lib/brief/schema";
import { citationsFromCompletion, parseResearchPayload } from "@/lib/research/parse";
import { RESEARCH_MODEL, RESEARCH_REQUEST_OPTIONS, researchCostUsd } from "@/lib/research/pricing";
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
};

const NO_KEY = "Clé API OpenRouter non configurée. Ajoute-la dans Réglages.";
const FAILED = "La recherche a échoué. Continue avec les noms que l'utilisateur a cités.";
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

export async function executeResearchTopic(context: ResearchTopicContext, input: ResearchTopicInput): Promise<ToolResult> {
  const existing = ensureBrief(context.conversationId);
  if (!existing) return error("Conversation introuvable.", true);

  if (isFakeAgentEnabled()) {
    const fetchedAt = new Date().toISOString();
    setBriefResearch(context.conversationId, { ...FAKE_RESEARCH, fetchedAt });
    return { content: [{ type: "text", text: successLines({ ...FAKE_RESEARCH, fetchedAt }) }] };
  }

  if (existing.brief.research && !input.refresh) {
    return error("Une recherche existe déjà. Passe refresh: true pour la relancer.", true);
  }
  if (existing.brief.usage.research >= 2) {
    return error("Limite de 2 recherches atteinte pour cette miniature.", true);
  }

  const getClient = context.getClient ?? (() => getOpenRouterClient());
  const client = getClient();
  if (!client) return error(NO_KEY, true);

  const reservation = reserveBriefUsage(context.conversationId, "research", () => null);
  if (reservation.status !== "reserved") {
    return error(reservation.status === "refused" ? reservation.reason : "Pas de fiche pour cette conversation.", true);
  }

  const start = Date.now();
  try {
    const completion = await client.chat.completions.create(
      {
        model: RESEARCH_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Langue: ${input.language}. Sujet: ${input.query}` },
        ],
      },
      RESEARCH_REQUEST_OPTIONS,
    );
    const parsed = parseResearchPayload(completion.choices[0]?.message?.content);
    const usage = (completion.usage ?? {}) as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };
    if (!parsed) {
      logGeneration({
        provider: "openrouter",
        model: RESEARCH_MODEL,
        endpoint: "research",
        timeMs: Date.now() - start,
        imageCount: 0,
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0,
        totalTokens: usage.total_tokens ?? 0,
        costEstimate: 0,
        prompt: input.query,
        status: "error",
        errorMessage: "Réponse de recherche illisible",
      });
      return error(FAILED);
    }
    const research = {
      ...parsed,
      sources: citationsFromCompletion(completion),
      fetchedAt: new Date().toISOString(),
    };
    setBriefResearch(context.conversationId, research);
    logGeneration({
      provider: "openrouter",
      model: RESEARCH_MODEL,
      endpoint: "research",
      timeMs: Date.now() - start,
      imageCount: 0,
      inputTokens: usage.prompt_tokens ?? 0,
      outputTokens: usage.completion_tokens ?? 0,
        totalTokens: usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
      costEstimate: researchCostUsd(usage),
      prompt: input.query.slice(0, 200),
    });
    return { content: [{ type: "text", text: successLines(research) }] };
  } catch (err) {
    logGeneration({
      provider: "openrouter",
      model: RESEARCH_MODEL,
      endpoint: "research",
      timeMs: Date.now() - start,
      imageCount: 0,
      costEstimate: 0,
      prompt: input.query.slice(0, 200),
      status: "error",
      errorMessage: err instanceof Error ? err.message.slice(0, 200) : "Recherche impossible",
    });
    return error(FAILED);
  }
}

export function buildResearchTopicTool(context: ResearchTopicContext): Tool {
  return aiTool({
    description: [
      "Researches the video topic with Perplexity Sonar Pro (summary, key points, entities). Use when the subject is named and logos/competitors would benefit. Costs money, max 2 per conversation. query + language fr|en. refresh: true only to replace. On failure, continue from names the user cited. Then find_logos.",
      "query: the topic in the chosen language. language: fr or en. refresh: true only to replace an existing research (at most 2 calls per conversation).",
      "On failure, empty result or the limit: say so and continue to logos from names the user cited.",
    ].join("\n"),
    inputSchema: researchTopicInputSchema,
    execute: async (input: ResearchTopicInput) => executeResearchTopic(context, input),
    toModelOutput: ({ output }: { output: unknown }) => toolResultToModelOutput(output),
  }) as Tool;
}
