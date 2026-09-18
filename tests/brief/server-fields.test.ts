import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { AGENT_TABLES_DDL } from "@/lib/agent/migrations";
import { createConversation, softDeleteConversation } from "@/lib/agent/conversation/store";
import { deleteProject } from "@/lib/local-storage";
import { briefUpdateInputSchema } from "@/lib/brief/merge";
import { getBrief, updateBrief } from "@/lib/brief/store";
import { appendBriefLogo, setBriefCompetition, setBriefLogoCandidates, setBriefResearch } from "@/lib/brief/server-fields";
import {
  getCompetitorSearch,
  saveCompetitorSearch,
  type CompetitorHit,
} from "@/lib/brief/competitor-search-store";
import { getThumbnailAnalysis, saveThumbnailAnalysis } from "@/lib/brief/thumbnail-analysis-store";
import { getCopiedSwipeFile, rememberCopy } from "@/lib/brief/youtube-thumbnail-copies";
import { getCachedMedian, setCachedMedian } from "@/lib/brief/channel-median-cache";
import { emptyBrief } from "@/lib/brief/schema";
import { NOW } from "./fixtures";

const input = (value: unknown) => briefUpdateInputSchema.parse(value);
const newConversation = (projectId = "proj-server-fields") => createConversation(projectId).id;

const hit = (videoId: string, lang: "fr" | "en" = "fr"): CompetitorHit => ({
  videoId,
  title: `Titre ${videoId}`,
  channel: "Chaîne",
  channelId: `UC${"c".repeat(22)}`,
  lang,
  views: 1000,
  score: 3.2,
  ageDays: 40,
  searchRank: 0,
  viral: false,
});

describe("F3b tables", () => {
  it("creates the tables idempotently", () => {
    expect(() => {
      getDb().exec(AGENT_TABLES_DDL);
      getDb().exec(AGENT_TABLES_DDL);
    }).not.toThrow();
    const names = (getDb().prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
      (row) => row.name,
    );
    expect(names).toEqual(expect.arrayContaining([
      "youtube_thumbnail_copies",
      "thumbnail_analyses",
      "competitor_search_results",
      "channel_median_cache",
    ]));
  });
});

describe("server brief fields", () => {
  it("writes research sources that update_brief cannot", () => {
    const conversationId = newConversation();
    updateBrief(conversationId, "proj-server-fields", input({ step: 2, video: { promise: "Savoir cliquer" } }));
    const written = setBriefResearch(conversationId, {
      summary: "Les miniatures comptent.",
      keyPoints: ["Un point"],
      entities: [{ name: "Claude", kind: "tool" }],
      sources: [{ title: "Aide YouTube", url: "https://support.google.com/youtube" }],
      fetchedAt: NOW,
    });
    expect(written.ok).toBe(true);
    expect(getBrief(conversationId)?.brief.research).toEqual({
      summary: "Les miniatures comptent.",
      keyPoints: ["Un point"],
      entities: [{ name: "Claude", kind: "tool" }],
      sources: [{ title: "Aide YouTube", url: "https://support.google.com/youtube" }],
      fetchedAt: NOW,
    });

    updateBrief(conversationId, "proj-server-fields", input({ research: { summary: "Autre résumé" } }));
    expect(getBrief(conversationId)?.brief.research?.sources).toEqual([
      { title: "Aide YouTube", url: "https://support.google.com/youtube" },
    ]);
    expect(getBrief(conversationId)?.brief.research?.summary).toBe("Autre résumé");
  });

  it("replaces logo candidates and appends a stored logo", () => {
    const conversationId = newConversation();
    updateBrief(conversationId, "proj-server-fields", input({ step: 2 }));
    setBriefLogoCandidates(conversationId, [
      { id: "lc_aaa", name: "Claude", source: "simple-icons", ref: "anthropic", previewUrl: "/api/briefs/x/logo-candidates/lc_aaa" },
    ]);
    expect(getBrief(conversationId)?.brief.logoCandidates).toHaveLength(1);
    const added = appendBriefLogo(conversationId, { name: "Claude", source: "stored:lg_abc" });
    expect(added.ok).toBe(true);
    expect(getBrief(conversationId)?.brief.logos).toEqual([{ name: "Claude", source: "stored:lg_abc" }]);
  });

  it("writes competition after analysis", () => {
    const conversationId = newConversation();
    updateBrief(conversationId, "proj-server-fields", input({ step: 3 }));
    setBriefCompetition(conversationId, {
      patterns: ["Visage + objet"],
      saturation: ["Flèche rouge"],
      dominantPalette: ["#FF0000"],
      analyzedAt: NOW,
    });
    expect(getBrief(conversationId)?.brief.competition).toMatchObject({ patterns: ["Visage + objet"] });
  });

  it("refuses server writes without a brief", () => {
    const conversationId = newConversation();
    expect(setBriefResearch(conversationId, { summary: "x", keyPoints: [], entities: [], sources: [], fetchedAt: NOW }).ok).toBe(false);
  });
});

describe("competitor search store", () => {
  it("keeps the last search per conversation and deletes it with the conversation and the project", () => {
    const conversation = createConversation("proj-comp-search");
    updateBrief(conversation.id, conversation.project_id, input({ step: 3 }));
    saveCompetitorSearch(conversation.id, [hit("abcdefghijk")]);
    expect(getCompetitorSearch(conversation.id)?.[0].videoId).toBe("abcdefghijk");

    softDeleteConversation(conversation.id);
    expect(getCompetitorSearch(conversation.id)).toBeNull();

    const a = createConversation("proj-delete-search");
    const kept = createConversation("proj-keep-search");
    saveCompetitorSearch(a.id, [hit("aaaaaaaaaaa")]);
    saveCompetitorSearch(kept.id, [hit("bbbbbbbbbbb")]);
    deleteProject("proj-delete-search");
    expect(getCompetitorSearch(a.id)).toBeNull();
    expect(getCompetitorSearch(kept.id)).toHaveLength(1);
  });
});

describe("thumbnail analysis cache", () => {
  it("round-trips an analysis by video id", () => {
    const analysis = {
      type: "face_text" as const,
      faceCount: 1 as const,
      textWords: 2,
      elementCount: 2,
      layout: "face-left_object-right" as const,
      background: "solid" as const,
      dominantColors: ["#0F172A"],
      hasLogo: true,
      hasArrowOrCircle: false,
    };
    expect(getThumbnailAnalysis("abcdefghijk")).toBeNull();
    saveThumbnailAnalysis("abcdefghijk", analysis);
    expect(getThumbnailAnalysis("abcdefghijk")?.analysis).toEqual(analysis);
  });
});

describe("youtube thumbnail copies", () => {
  it("returns the same swipe file for a video remembered twice", () => {
    expect(getCopiedSwipeFile("vid11111111")).toBeNull();
    rememberCopy("vid11111111", "sf-one");
    rememberCopy("vid11111111", "sf-two");
    expect(getCopiedSwipeFile("vid11111111")).toBe("sf-one");
  });
});

describe("channel median cache", () => {
  it("expires after 24 hours", () => {
    const channelId = `UC${"m".repeat(22)}`;
    const now = new Date("2026-09-17T12:00:00.000Z");
    setCachedMedian(channelId, 1200, 50, now);
    expect(getCachedMedian(channelId, now)).toEqual({ medianViews: 1200, sampleCount: 50 });
    expect(getCachedMedian(channelId, new Date("2026-09-18T11:59:00.000Z"))).not.toBeNull();
    expect(getCachedMedian(channelId, new Date("2026-09-18T12:00:00.000Z"))).toBeNull();
  });
});

describe("empty brief still has F3b slots", () => {
  it("starts with empty logoCandidates and zero research usage", () => {
    expect(emptyBrief().logoCandidates).toEqual([]);
    expect(emptyBrief().usage.research).toBe(0);
  });
});
