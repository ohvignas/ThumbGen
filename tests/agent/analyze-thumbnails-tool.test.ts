import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

import { createConversation } from "@/lib/agent/conversation/store";
import { executeAnalyzeThumbnails, type AnalyzeClient } from "@/lib/agent/v2/analyze-thumbnails-tool";
import { saveCompetitorSearch, type CompetitorHit } from "@/lib/brief/competitor-search-store";
import { getThumbnailAnalysis, saveThumbnailAnalysis } from "@/lib/brief/thumbnail-analysis-store";
import { briefUpdateInputSchema } from "@/lib/brief/merge";
import { getBrief, updateBrief } from "@/lib/brief/store";
import type { ThumbAnalysis } from "@/lib/brief/schema";
import { getDb } from "@/lib/db";
import { CLASSIFY_MODEL } from "@/lib/youtube/classification-pricing";
import { youtubeThumbnailUrl } from "@/lib/youtube/types";
import { isFakeAgentEnabled } from "@/lib/agent/v2/fake-agent-model";
import * as generationsLog from "@/lib/generations-log";

vi.mock("@/lib/agent/v2/fake-agent-model", () => ({
  isFakeAgentEnabled: vi.fn(() => false),
}));

const fetchMock = vi.fn();

function conversationWithBrief() {
  const conversation = createConversation("proj-analyze");
  updateBrief(conversation.id, conversation.project_id, briefUpdateInputSchema.parse({ step: 3 }));
  return conversation.id;
}

function hit(videoId: string, lang: "fr" | "en" = "fr", score: number | null = 5): CompetitorHit {
  return {
    videoId,
    title: videoId,
    channel: "Chaîne",
    channelId: "UCf",
    lang,
    views: 1000,
    score,
    ageDays: 40,
    searchRank: 0,
    viral: false,
  };
}

function analysis(overrides: Partial<ThumbAnalysis> = {}): ThumbAnalysis {
  return {
    type: "face_text",
    faceCount: 1,
    textWords: 2,
    elementCount: 2,
    layout: "face-left_object-right",
    background: "solid",
    dominantColors: ["#0F172A"],
    hasLogo: false,
    hasArrowOrCircle: false,
    ...overrides,
  };
}

function client(create: AnalyzeClient["chat"]["completions"]["create"]): AnalyzeClient {
  return { chat: { completions: { create } } };
}

const completion = (content: string, extra: Record<string, unknown> = {}) => ({
  choices: [{ message: { content } }],
  usage: { prompt_tokens: 700, completion_tokens: 80, cost: 0.004 },
  ...extra,
});

const text = (result: Awaited<ReturnType<typeof executeAnalyzeThumbnails>>) =>
  result.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");

const logs = () =>
  getDb()
    .prepare("SELECT endpoint, status, cost_estimate, model, prompt FROM generations_log ORDER BY created_at")
    .all() as Array<{ endpoint: string; status: string; cost_estimate: number; model: string; prompt: string | null }>;

beforeEach(() => {
  vi.mocked(isFakeAgentEnabled).mockReturnValue(false);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  getDb().exec("DELETE FROM generations_log");
  getDb().exec("DELETE FROM thumbnail_analyses");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("analyze_thumbnails", () => {
  it("skips cached thumbs, ignores invalid output, and writes a deterministic competition summary", async () => {
    const conversationId = conversationWithBrief();
    saveCompetitorSearch(conversationId, [hit("cached00001"), hit("fresh000001"), hit("bad00000001"), hit("unknown001")]);
    saveThumbnailAnalysis("cached00001", analysis({ dominantColors: ["#111111"] }));

    const create = vi.fn(async (params: { messages: Array<{ content: unknown }> }) => {
      const image = JSON.stringify(params.messages);
      if (image.includes("fresh000001")) return completion(JSON.stringify(analysis({ dominantColors: ["#222222"], hasArrowOrCircle: true })));
      return completion("{not json");
    });

    const result = await executeAnalyzeThumbnails(
      { conversationId, getClient: () => client(create) },
      { video_ids: ["cached00001", "fresh000001", "bad00000001", "ghost000001"] },
    );
    expect(result.isError).toBeFalsy();
    expect(create).toHaveBeenCalledTimes(2);
    const imageUrl = (create.mock.calls[0][0] as { messages: Array<{ content: unknown }> }).messages
      .flatMap((message) => (Array.isArray(message.content) ? message.content : []))
      .find((part) => part && typeof part === "object" && "image_url" in part) as { image_url?: { url?: string } };
    expect(imageUrl.image_url?.url).toBe(youtubeThumbnailUrl("fresh000001", "mqdefault"));
    expect(getThumbnailAnalysis("fresh000001")?.analysis.dominantColors).toEqual(["#222222"]);
    expect(getThumbnailAnalysis("bad00000001")).toBeNull();
    expect(getThumbnailAnalysis("ghost000001")).toBeNull();
    const competition = getBrief(conversationId)!.brief.competition!;
    expect(competition.patterns).toEqual(["Fond uni", "Texte", "Visage"]);
    expect(competition.saturation).toEqual(["Fond uni", "Texte", "Visage"]);
    expect(competition.dominantPalette).toEqual(["#111111", "#222222"]);
    expect(text(result)).toMatch(/Ce qui marche :/);
    expect(text(result)).toMatch(/Ce que tout le monde fait/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logs().filter((row) => row.status === "success")).toEqual([
      expect.objectContaining({ endpoint: "classify-thumbnail", model: CLASSIFY_MODEL, cost_estimate: 0.004 }),
    ]);
    expect(getBrief(conversationId)!.brief.usage.analyses).toBe(1);
  });

  it("does not call the model or log when every id is cached, and refuses a third paid call", async () => {
    const conversationId = conversationWithBrief();
    saveCompetitorSearch(conversationId, [hit("cached00001"), hit("fresh000001"), hit("fresh000002"), hit("fresh000003")]);
    saveThumbnailAnalysis("cached00001", analysis());
    const create = vi.fn(async () => completion(JSON.stringify(analysis())));
    await executeAnalyzeThumbnails({ conversationId, getClient: () => client(create) }, { video_ids: ["cached00001"] });
    expect(create).not.toHaveBeenCalled();
    expect(logs()).toEqual([]);
    expect(getBrief(conversationId)!.brief.usage.analyses).toBe(0);

    await executeAnalyzeThumbnails({ conversationId, getClient: () => client(create) }, { video_ids: ["fresh000001"] });
    await executeAnalyzeThumbnails({ conversationId, getClient: () => client(create) }, { video_ids: ["fresh000002"] });
    const limited = await executeAnalyzeThumbnails({ conversationId, getClient: () => client(create) }, { video_ids: ["fresh000003"] });
    expect(limited.requestNotSent).toBe(true);
    expect(text(limited)).toMatch(/Limite de 2/);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("does not fetch or log in fake mode", async () => {
    vi.mocked(isFakeAgentEnabled).mockReturnValue(true);
    const spy = vi.spyOn(generationsLog, "logGeneration");
    const create = vi.fn(async () => completion("{}"));
    const conversationId = conversationWithBrief();
    await executeAnalyzeThumbnails({ conversationId, getClient: () => client(create) }, { video_ids: ["yt_fake_fr_1"] });
    expect(create).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
    expect(getBrief(conversationId)!.brief.competition?.patterns[0]).toBeTruthy();
    spy.mockRestore();
  });
});
