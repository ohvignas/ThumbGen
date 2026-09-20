import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));
import { createConversation } from "@/lib/agent/conversation/store";
import { briefUpdateInputSchema } from "@/lib/brief/merge";
import { getBrief, updateBrief } from "@/lib/brief/store";
import { executeResearchTopic, type ResearchClient } from "@/lib/agent/v2/research-topic-tool";
import { RESEARCH_MODEL } from "@/lib/research/pricing";
import {
  OPENROUTER_CHAT_URL,
  OPENROUTER_RESEARCH_MODEL,
  PERPLEXITY_SONAR_URL,
  RESEARCH_INVALID_KEY,
  RESEARCH_NO_KEY,
  RESEARCH_RATE_LIMIT,
  RESEARCH_RESPONSE_FORMAT,
} from "@/lib/research/perplexity-client";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import { readDebugLogs, resetDebugLogs } from "@/lib/debug-log";
import * as generationsLog from "@/lib/generations-log";
import { isFakeAgentEnabled } from "@/lib/agent/v2/fake-agent-model";

vi.mock("@/lib/agent/v2/fake-agent-model", () => ({
  isFakeAgentEnabled: vi.fn(() => false),
}));

const fetchMock = vi.fn();

function conversationWithBrief() {
  const conversation = createConversation("proj-research");
  updateBrief(conversation.id, conversation.project_id, briefUpdateInputSchema.parse({ step: 2, video: { promise: "Savoir cliquer" } }));
  return conversation.id;
}

function client(create: ResearchClient["chat"]["completions"]["create"]): ResearchClient {
  return { chat: { completions: { create } } };
}

const okCompletion = (content: string, extra: Record<string, unknown> = {}) => ({
  choices: [
    {
      message: {
        content,
        annotations: [
          { type: "url_citation", url_citation: { url: "https://support.google.com/youtube", title: "Aide YouTube" } },
        ],
      },
    },
  ],
  usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.012 },
  ...extra,
});

const text = (result: Awaited<ReturnType<typeof executeResearchTopic>>) =>
  result.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");

const logs = () =>
  getDb()
    .prepare("SELECT endpoint, status, cost_estimate, model FROM generations_log ORDER BY created_at")
    .all() as Array<{ endpoint: string; status: string; cost_estimate: number; model: string }>;

const savedPerplexity = process.env.PERPLEXITY_API_KEY;
const savedOpenRouter = process.env.OPENROUTER_API_KEY;

beforeEach(() => {
  vi.mocked(isFakeAgentEnabled).mockReturnValue(false);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  getDb().exec("DELETE FROM generations_log");
  getDb().prepare("DELETE FROM settings WHERE key = ?").run("perplexityApiKey");
  getDb().prepare("DELETE FROM settings WHERE key = ?").run("openrouterApiKey");
  delete process.env.PERPLEXITY_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  resetDebugLogs();
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (savedPerplexity === undefined) delete process.env.PERPLEXITY_API_KEY;
  else process.env.PERPLEXITY_API_KEY = savedPerplexity;
  if (savedOpenRouter === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = savedOpenRouter;
});

describe("research_topic", () => {
  it("writes research from tolerant JSON and citations, never from the model sources key", async () => {
    const conversationId = conversationWithBrief();
    const create = vi.fn(async () =>
      okCompletion(
        '```json\n{"summary":"Les miniatures comptent.","keyPoints":["Un"],"entities":[{"name":"Claude","kind":"tool"}],"sources":[{"title":"FAKE","url":"https://fake.example"}]}\n```',
      ),
    );
    const result = await executeResearchTopic({ conversationId, getClient: () => client(create) }, { query: "miniatures", language: "fr" });
    expect(result.isError).toBeFalsy();
    expect(text(result)).toContain("Les miniatures comptent.");
    expect(text(result)).toContain("Claude");
    expect(text(result)).not.toContain("fake.example");
    expect(text(result)).not.toMatch(/base64|data:/i);
    const research = getBrief(conversationId)!.brief.research!;
    expect(research.sources).toEqual([{ title: "Aide YouTube", url: "https://support.google.com/youtube" }]);
    expect(research.entities).toEqual([{ name: "Claude", kind: "tool" }]);
    expect(create.mock.calls[0]![0].model).toBe(RESEARCH_MODEL);
    expect(logs()[0]).toMatchObject({ endpoint: "research", status: "success", cost_estimate: 0.012, model: RESEARCH_MODEL });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getBrief(conversationId)!.brief.usage.research).toBe(1);
  });

  it("prefers usage.cost and logs an estimate otherwise", async () => {
    const conversationId = conversationWithBrief();
    await executeResearchTopic(
      {
        conversationId,
        getClient: () =>
          client(
            vi.fn(async () => ({
              ...okCompletion('{"summary":"Ok.","keyPoints":[],"entities":[]}'),
              usage: { prompt_tokens: 1_000_000, completion_tokens: 0 },
            })),
          ),
      },
      { query: "x", language: "en" },
    );
    expect(logs()[0].cost_estimate).toBe(3);
  });

  it("times out, keeps the reservation, and tells the agent to continue from names the user cited", async () => {
    const conversationId = conversationWithBrief();
    const result = await executeResearchTopic(
      {
        conversationId,
        getClient: () =>
          client(
            vi.fn(async () => {
              throw new Error("Request timed out.");
            }),
          ),
      },
      { query: "x", language: "fr" },
    );
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/échoué|noms/i);
    expect(getBrief(conversationId)!.brief.research).toBeUndefined();
    expect(getBrief(conversationId)!.brief.usage.research).toBe(1);
    expect(logs()[0]).toMatchObject({ endpoint: "research", status: "error" });
  });

  it("refuses a second call without refresh, then accepts refresh until the limit of 2", async () => {
    const conversationId = conversationWithBrief();
    const create = vi.fn(async () => okCompletion('{"summary":"Un.","keyPoints":[],"entities":[]}'));
    const deps = { conversationId, getClient: () => client(create) };
    expect((await executeResearchTopic(deps, { query: "a", language: "fr" })).isError).toBeFalsy();
    const refused = await executeResearchTopic(deps, { query: "a", language: "fr" });
    expect(refused.isError).toBe(true);
    expect(refused.requestNotSent).toBe(true);
    expect(text(refused)).toMatch(/refresh/i);
    expect(getBrief(conversationId)!.brief.usage.research).toBe(1);
    expect((await executeResearchTopic(deps, { query: "a", language: "fr", refresh: true })).isError).toBeFalsy();
    expect(getBrief(conversationId)!.brief.usage.research).toBe(2);
    const limited = await executeResearchTopic(deps, { query: "a", language: "fr", refresh: true });
    expect(limited.isError).toBe(true);
    expect(limited.requestNotSent).toBe(true);
    expect(text(limited)).toMatch(/Limite de 2/);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("does not call the network or logGeneration in fake mode", async () => {
    vi.mocked(isFakeAgentEnabled).mockReturnValue(true);
    const spy = vi.spyOn(generationsLog, "logGeneration");
    const conversationId = conversationWithBrief();
    const create = vi.fn();
    const result = await executeResearchTopic({ conversationId, getClient: () => client(create) }, { query: "x", language: "fr" });
    expect(result.isError).toBeFalsy();
    expect(create).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
    expect(getBrief(conversationId)!.brief.research?.summary).toBeTruthy();
    spy.mockRestore();
  });

  it("refuses without Perplexity or OpenRouter and logs the French error in the workflow buffer", async () => {
    const conversationId = conversationWithBrief();
    const result = await executeResearchTopic({ conversationId }, { query: "Grok Bot xAI", language: "fr" });
    expect(result.isError).toBe(true);
    expect(result.requestNotSent).toBe(true);
    expect(text(result)).toBe(RESEARCH_NO_KEY);
    expect(text(result)).toMatch(/Réglages → Connexions/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logs()).toEqual([]);
    const failed = readDebugLogs().filter((entry) => entry.message === "research_topic failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ scope: "agent", data: { isError: true, error: RESEARCH_NO_KEY } });
  });

  it("calls native /v1/sonar with json_schema, not OpenRouter chat/completions", async () => {
    setSetting("perplexityApiKey", "pplx-test-key");
    setSetting("openrouterApiKey", "or-should-not-be-used");
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"summary":"Grok est l’agent xAI.","keyPoints":[],"entities":[]}' } }],
          citations: ["https://x.ai/"],
          usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.012 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const conversationId = conversationWithBrief();
    const result = await executeResearchTopic({ conversationId }, { query: "Grok Bot xAI", language: "fr" });
    expect(result.isError).toBeFalsy();
    expect(text(result)).toContain("Grok est l’agent xAI.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(PERPLEXITY_SONAR_URL);
    expect(String(url)).not.toContain("openrouter");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer pplx-test-key" });
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.model).toBe("sonar-pro");
    expect(body.response_format).toEqual(RESEARCH_RESPONSE_FORMAT);
    expect(body.response_format.type).not.toBe("json_object");
    const started = readDebugLogs().find((entry) => entry.message === "research_topic start");
    const ended = readDebugLogs().find((entry) => entry.message === "tool end");
    expect(started?.data).toMatchObject({ provider: "perplexity" });
    expect(ended?.data).toMatchObject({ provider: "perplexity", isError: false });
  });

  it("falls back to OpenRouter chat/completions when only the OpenRouter key is set", async () => {
    setSetting("openrouterApiKey", "or-test-key");
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"summary":"Grok est l’agent xAI.","keyPoints":[],"entities":[]}' } }],
          citations: ["https://x.ai/"],
          usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.012 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const conversationId = conversationWithBrief();
    const result = await executeResearchTopic({ conversationId }, { query: "Grok Bot xAI", language: "fr" });
    expect(result.isError).toBeFalsy();
    expect(text(result)).toContain("Grok est l’agent xAI.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(OPENROUTER_CHAT_URL);
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer or-test-key" });
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.model).toBe(OPENROUTER_RESEARCH_MODEL);
    expect(body.response_format).toEqual(RESEARCH_RESPONSE_FORMAT);
    expect(body.response_format.type).not.toBe("json_object");
    expect(logs()[0]).toMatchObject({ endpoint: "research", status: "success", model: OPENROUTER_RESEARCH_MODEL });
    const started = readDebugLogs().find((entry) => entry.message === "research_topic start");
    const ended = readDebugLogs().find((entry) => entry.message === "tool end");
    expect(started?.data).toMatchObject({ provider: "openrouter" });
    expect(ended?.data).toMatchObject({ provider: "openrouter", isError: false });
  });

  it("returns the real 401 and writes status/body into workflow logs", async () => {
    setSetting("perplexityApiKey", "pplx-bad");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: "Invalid API key" } }), { status: 401 }));
    const conversationId = conversationWithBrief();
    const result = await executeResearchTopic({ conversationId }, { query: "Grok", language: "fr" });
    expect(result.isError).toBe(true);
    expect(text(result)).toBe(RESEARCH_INVALID_KEY);
    const failed = readDebugLogs().find((entry) => entry.message === "research_topic failed");
    expect(failed?.data).toMatchObject({ isError: true, status: 401, error: RESEARCH_INVALID_KEY, provider: "perplexity" });
    expect(String(failed?.data?.body)).toMatch(/Invalid API key/i);
  });

  it("returns the real 429 instead of the generic fallback", async () => {
    setSetting("perplexityApiKey", "pplx-ok");
    fetchMock.mockResolvedValue(new Response("rate limited", { status: 429 }));
    const conversationId = conversationWithBrief();
    const result = await executeResearchTopic({ conversationId }, { query: "Grok", language: "fr" });
    expect(result.isError).toBe(true);
    expect(text(result)).toBe(RESEARCH_RATE_LIMIT);
    const failed = readDebugLogs().find((entry) => entry.message === "research_topic failed");
    expect(failed?.data).toMatchObject({ status: 429, error: RESEARCH_RATE_LIMIT, provider: "perplexity" });
  });

  it("logs provider openrouter on an OpenRouter 401", async () => {
    setSetting("openrouterApiKey", "or-bad");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: "Invalid API key" } }), { status: 401 }));
    const conversationId = conversationWithBrief();
    const result = await executeResearchTopic({ conversationId }, { query: "Grok", language: "fr" });
    expect(result.isError).toBe(true);
    expect(text(result)).toBe("Clé API OpenRouter invalide. Vérifie-la dans Réglages.");
    const started = readDebugLogs().find((entry) => entry.message === "research_topic start");
    const failed = readDebugLogs().find((entry) => entry.message === "research_topic failed");
    expect(started?.data).toMatchObject({ provider: "openrouter" });
    expect(failed?.data).toMatchObject({ provider: "openrouter", status: 401 });
  });
});
