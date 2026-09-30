import { describe, expect, it, vi } from "vitest";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

import { analyzeThumbnailsInputSchema } from "@/lib/agent/v2/analyze-thumbnails-tool";
import { findCompetitorThumbnailsInputSchema } from "@/lib/agent/v2/find-competitor-thumbnails-tool";
import { researchTopicInputSchema } from "@/lib/agent/v2/research-topic-tool";
import { bareYoutubeVideoId, normalizeResearchLanguage, resolveCompetitorQueries } from "@/lib/agent/v2/search-args";

describe("normalizeResearchLanguage", () => {
  it("accepts fr/en and common sloppy aliases, never us", () => {
    expect(normalizeResearchLanguage("fr")).toBe("fr");
    expect(normalizeResearchLanguage("fr-FR")).toBe("fr");
    expect(normalizeResearchLanguage("French")).toBe("fr");
    expect(normalizeResearchLanguage("en")).toBe("en");
    expect(normalizeResearchLanguage("en-US")).toBe("en");
    expect(normalizeResearchLanguage("us")).toBe("en");
    expect(normalizeResearchLanguage("english")).toBe("en");
    expect(normalizeResearchLanguage("de")).toBeUndefined();
  });
});

describe("researchTopicInputSchema", () => {
  it("coerces language and defaults missing language to fr", () => {
    expect(researchTopicInputSchema.parse({ query: "Cursor", language: "us" })).toEqual({
      query: "Cursor",
      language: "en",
    });
    expect(researchTopicInputSchema.parse({ query: "Cursor" })).toEqual({
      query: "Cursor",
      language: "fr",
    });
  });
});

describe("resolveCompetitorQueries", () => {
  it("mirrors a single query so a missing language bucket does not 400", () => {
    expect(resolveCompetitorQueries({ query: "Cursor 2.0" })).toEqual({
      query_fr: "Cursor 2.0",
      query_en: "Cursor 2.0",
    });
    expect(resolveCompetitorQueries({ query_fr: "Cursor avis" })).toEqual({
      query_fr: "Cursor avis",
      query_en: "Cursor avis",
    });
    expect(resolveCompetitorQueries({})).toBeNull();
  });
});

describe("findCompetitorThumbnailsInputSchema", () => {
  it("accepts query_fr+query_en or a single query", () => {
    expect(findCompetitorThumbnailsInputSchema.parse({ query_fr: "a", query_en: "b" })).toEqual({
      query_fr: "a",
      query_en: "b",
    });
    expect(findCompetitorThumbnailsInputSchema.parse({ query: "Cursor" })).toEqual({
      query_fr: "Cursor",
      query_en: "Cursor",
    });
    expect(findCompetitorThumbnailsInputSchema.safeParse({}).success).toBe(false);
  });
});

describe("bareYoutubeVideoId", () => {
  it("strips the youtube: prefix find_competitor_thumbnails returns", () => {
    expect(bareYoutubeVideoId("youtube:dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(bareYoutubeVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(analyzeThumbnailsInputSchema.parse({ video_ids: ["youtube:dQw4w9WgXcQ"] }).video_ids).toEqual(["dQw4w9WgXcQ"]);
  });
});
