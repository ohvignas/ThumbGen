import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

import { createConversation } from "@/lib/agent/conversation/store";
import { executeResearchTopic } from "@/lib/agent/v2/research-topic-tool";
import { executeFindLogos } from "@/lib/agent/v2/find-logos-tool";
import { executeAddLogo } from "@/lib/agent/v2/add-logo-tool";
import { executeFindCompetitorThumbnails } from "@/lib/agent/v2/find-competitor-thumbnails-tool";
import { executeAnalyzeThumbnails } from "@/lib/agent/v2/analyze-thumbnails-tool";
import { briefUpdateInputSchema } from "@/lib/brief/merge";
import { getBrief, updateBrief } from "@/lib/brief/store";
import { getCompetitorSearch } from "@/lib/brief/competitor-search-store";
import * as generationsLog from "@/lib/generations-log";

const fetchMock = vi.fn();

function conversationWithBrief() {
  const conversation = createConversation("proj-fake-f3b");
  updateBrief(conversation.id, conversation.project_id, briefUpdateInputSchema.parse({ step: 2, video: { promise: "Savoir cliquer" } }));
  return conversation.id;
}

describe("fake F3b tools", () => {
  beforeEach(() => {
    vi.stubEnv("THUMBGEN_FAKE_AGENT", "journey");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns local fixtures without fetch or logGeneration", async () => {
    const spy = vi.spyOn(generationsLog, "logGeneration");
    const conversationId = conversationWithBrief();
    const client = { chat: { completions: { create: vi.fn(async () => ({ choices: [] })) } } };

    await executeResearchTopic({ conversationId, getClient: () => client }, { query: "miniatures", language: "fr" });
    await executeFindLogos({ conversationId }, { names: ["Claude"] });
    const logos = getBrief(conversationId)!.brief.logoCandidates;
    await executeAddLogo({ conversationId }, { candidate_id: logos[0]!.id });
    await executeFindCompetitorThumbnails({ conversationId }, { query_fr: "a", query_en: "b" });
    await executeAnalyzeThumbnails({ conversationId, getClient: () => client }, { video_ids: ["yt_fake_fr_1"] });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
    expect(client.chat.completions.create).not.toHaveBeenCalled();
    expect(getBrief(conversationId)!.brief.research?.summary).toBeTruthy();
    expect(getBrief(conversationId)!.brief.logoCandidates.length).toBeGreaterThan(0);
    expect(getBrief(conversationId)!.brief.logos[0]?.source).toMatch(/^stored:lg_/);
    expect(getCompetitorSearch(conversationId)?.length).toBe(12);
    expect(getBrief(conversationId)!.brief.competition?.patterns.length).toBeGreaterThan(0);
    spy.mockRestore();
  });
});
