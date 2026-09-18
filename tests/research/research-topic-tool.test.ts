import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));
import { createConversation } from "@/lib/agent/conversation/store";
import { briefUpdateInputSchema } from "@/lib/brief/merge";
import { getBrief, updateBrief } from "@/lib/brief/store";
import { executeResearchTopic, type ResearchClient } from "@/lib/agent/v2/research-topic-tool";
import { RESEARCH_MODEL } from "@/lib/research/pricing";
import { getDb } from "@/lib/db";
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

beforeEach(() => {
  vi.mocked(isFakeAgentEnabled).mockReturnValue(false);
  vi.stubGlobal("fetch", fetchMock);
  getDb().exec("DELETE FROM generations_log");
});

afterEach(() => {
  vi.unstubAllGlobals();
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
});
