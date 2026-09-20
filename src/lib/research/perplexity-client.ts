import { getSetting } from "@/lib/settings";
import { THUMBGEN_USER_AGENT } from "@/lib/user-agent";
import { RESEARCH_MODEL, RESEARCH_REQUEST_OPTIONS } from "./pricing";

export type ResearchProvider = "perplexity" | "openrouter";

/** Native Sonar endpoint — not OpenRouter `/chat/completions`. */
export const PERPLEXITY_SONAR_URL = "https://api.perplexity.ai/v1/sonar";
export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
/** OpenRouter slug for the same Sonar Pro model (`src/lib/agent/models.ts` has no Perplexity ids). */
export const OPENROUTER_RESEARCH_MODEL = "perplexity/sonar-pro";

export const RESEARCH_NO_KEY =
  "Aucune clé Perplexity ni OpenRouter. Configure-en une dans Réglages → Connexions.";
export const RESEARCH_INVALID_KEY = "Clé API Perplexity invalide. Vérifie-la dans Réglages.";
export const RESEARCH_RATE_LIMIT =
  "Quota Perplexity dépassé (HTTP 429). Réessaie plus tard. Continue avec les noms que l'utilisateur a cités.";
export const RESEARCH_UNREADABLE = "Réponse de recherche illisible. Continue avec les noms que l'utilisateur a cités.";
export const RESEARCH_FAILED = "La recherche a échoué. Continue avec les noms que l'utilisateur a cités.";

/** Native Perplexity and OpenRouter structured outputs accept `json_schema`. `json_object` 400s. */
export const RESEARCH_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "topic_research",
    strict: true,
    schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        keyPoints: { type: "array", items: { type: "string" } },
        entities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              kind: { type: "string", enum: ["company", "tool", "product", "other"] },
            },
            required: ["name", "kind"],
          },
        },
      },
      required: ["summary", "keyPoints", "entities"],
      additionalProperties: false,
    },
  },
};

export type PerplexityCompletion = {
  choices?: Array<{
    message?: {
      content?: string | null;
      annotations?: Array<{ type?: unknown; url_citation?: { url?: unknown; title?: unknown } }>;
      citations?: unknown;
    };
  }>;
  citations?: unknown;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };
};

export type ResearchRoute = {
  provider: ResearchProvider;
  apiKey: string;
  url: string;
  model: string;
};

export class PerplexityRequestError extends Error {
  readonly status: number;
  readonly body: string;
  readonly provider?: ResearchProvider;

  constructor(status: number, body: string, message: string, provider?: ResearchProvider) {
    super(message);
    this.name = "PerplexityRequestError";
    this.status = status;
    this.body = body;
    this.provider = provider;
  }
}

export function getPerplexityApiKey(): string | undefined {
  const key = getSetting("perplexityApiKey");
  return key || undefined;
}

export function getOpenRouterApiKey(): string | undefined {
  const key = getSetting("openrouterApiKey");
  return key || undefined;
}

/** Native Perplexity first; OpenRouter (`perplexity/sonar-pro`) if that key is missing. */
export function resolveResearchRoute(): ResearchRoute | null {
  const perplexityKey = getPerplexityApiKey();
  if (perplexityKey) {
    return { provider: "perplexity", apiKey: perplexityKey, url: PERPLEXITY_SONAR_URL, model: RESEARCH_MODEL };
  }
  const openRouterKey = getOpenRouterApiKey();
  if (openRouterKey) {
    return {
      provider: "openrouter",
      apiKey: openRouterKey,
      url: OPENROUTER_CHAT_URL,
      model: OPENROUTER_RESEARCH_MODEL,
    };
  }
  return null;
}

export function snippetForLog(body: string, max = 180): string {
  return body.replace(/\s+/g, " ").trim().slice(0, max);
}

function providerLabel(provider: ResearchProvider): string {
  return provider === "openrouter" ? "OpenRouter" : "Perplexity";
}

export function researchErrorFromHttp(status: number, provider: ResearchProvider = "perplexity"): string {
  const label = providerLabel(provider);
  if (status === 401 || status === 403) return `Clé API ${label} invalide. Vérifie-la dans Réglages.`;
  if (status === 429) {
    return `Quota ${label} dépassé (HTTP 429). Réessaie plus tard. Continue avec les noms que l'utilisateur a cités.`;
  }
  return `La recherche ${label} a échoué (HTTP ${status}). Continue avec les noms que l'utilisateur a cités.`;
}

export function researchErrorFromUnknown(err: unknown): {
  text: string;
  status?: number;
  body?: string;
  provider?: ResearchProvider;
} {
  if (err instanceof PerplexityRequestError) {
    return {
      text: err.message,
      status: err.status || undefined,
      body: err.body || undefined,
      ...(err.provider ? { provider: err.provider } : {}),
    };
  }
  const status =
    typeof err === "object" && err && "status" in err && typeof (err as { status: unknown }).status === "number"
      ? (err as { status: number }).status
      : undefined;
  const raw = err instanceof Error ? err.message : "Recherche impossible";
  if (status === 401 || status === 403 || /401|unauthorized|invalid api key|incorrect api key/i.test(raw)) {
    return { text: RESEARCH_INVALID_KEY, status: status ?? 401, body: snippetForLog(raw) };
  }
  if (status === 429 || /429|rate limit|too many/i.test(raw)) {
    return { text: RESEARCH_RATE_LIMIT, status: status ?? 429, body: snippetForLog(raw) };
  }
  if (status) return { text: researchErrorFromHttp(status), status, body: snippetForLog(raw) };
  return { text: RESEARCH_FAILED, body: snippetForLog(raw) };
}

function researchHeaders(apiKey: string, provider: ResearchProvider): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "User-Agent": THUMBGEN_USER_AGENT,
  };
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://thumbgen.local";
    headers["X-Title"] = "ThumbGen";
  }
  return headers;
}

function researchRequestBody(
  input: { query: string; language: "fr" | "en"; system: string },
  route: ResearchRoute,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: route.model,
    temperature: 0,
    response_format: RESEARCH_RESPONSE_FORMAT,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: `Langue: ${input.language}. Sujet: ${input.query}` },
    ],
  };
  if (route.provider === "perplexity") body.language_preference = input.language;
  return body;
}

function routeFromOptions(options?: {
  apiKey?: string;
  provider?: ResearchProvider;
}): ResearchRoute | null {
  if (options?.provider) {
    const apiKey =
      options.apiKey ?? (options.provider === "openrouter" ? getOpenRouterApiKey() : getPerplexityApiKey());
    if (!apiKey) return null;
    return options.provider === "openrouter"
      ? { provider: "openrouter", apiKey, url: OPENROUTER_CHAT_URL, model: OPENROUTER_RESEARCH_MODEL }
      : { provider: "perplexity", apiKey, url: PERPLEXITY_SONAR_URL, model: RESEARCH_MODEL };
  }
  if (options?.apiKey) {
    return { provider: "perplexity", apiKey: options.apiKey, url: PERPLEXITY_SONAR_URL, model: RESEARCH_MODEL };
  }
  return resolveResearchRoute();
}

export async function fetchPerplexityResearch(
  input: { query: string; language: "fr" | "en"; system: string },
  options?: { apiKey?: string; provider?: ResearchProvider; fetchImpl?: typeof fetch; signal?: AbortSignal },
): Promise<PerplexityCompletion> {
  const route = routeFromOptions(options);
  if (!route) throw new PerplexityRequestError(0, "", RESEARCH_NO_KEY);

  const fetchImpl = options?.fetchImpl ?? fetch;
  const res = await fetchImpl(route.url, {
    method: "POST",
    headers: researchHeaders(route.apiKey, route.provider),
    body: JSON.stringify(researchRequestBody(input, route)),
    signal: options?.signal ?? AbortSignal.timeout(RESEARCH_REQUEST_OPTIONS.timeout),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new PerplexityRequestError(
      res.status,
      snippetForLog(text),
      researchErrorFromHttp(res.status, route.provider),
      route.provider,
    );
  }
  try {
    return JSON.parse(text) as PerplexityCompletion;
  } catch {
    throw new PerplexityRequestError(res.status, snippetForLog(text), RESEARCH_UNREADABLE, route.provider);
  }
}
